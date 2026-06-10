/**
 * skill-loader.ts — SKILL.md Parser & Loader
 *
 * Parses SKILL.md files with YAML frontmatter from the data/skills-v2/skills/ directory.
 * Provides loadSkill(), listSkills(), getSkillPath() functions.
 * Caches loaded skills in memory and supports hot-reload in development.
 */

import fs from 'fs';
import path from 'path';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SkillFrontmatter {
  skill_id: string;
  name: string;
  version: string;
  phase: 'M1' | 'M2' | 'M3';
  description: string;
  agent_type: 'orchestrator' | 'subagent' | 'utility';
  content_modes?: string[];
  inputs?: string[];
  outputs?: string[];
  dependencies?: string[];
  required_tools?: string[];
}

export interface SkillData {
  id: string;
  path: string;
  frontmatter: SkillFrontmatter;
  body: string;
  loadedAt: number;
  mtimeMs: number;
}

// ─── Configuration ──────────────────────────────────────────────────────────

const SKILLS_ROOT = path.resolve(process.cwd(), 'data/skills-v2/skills');
const CACHE_TTL_MS = 60_000; // 1 minute cache TTL for hot-reload

// ─── In-Memory Cache ───────────────────────────────────────────────────────

const skillCache = new Map<string, SkillData>();
let lastFullScan = 0;

// ─── YAML Frontmatter Parser ───────────────────────────────────────────────

/**
 * Parses YAML frontmatter from a SKILL.md file.
 * Simple parser that handles the common YAML patterns used in our skills.
 * For production, consider using a proper YAML library like 'yaml' or 'js-yaml'.
 */
function parseFrontmatter(content: string): { frontmatter: Record<string, unknown>; body: string } {
  const trimmed = content.trimStart();

  if (!trimmed.startsWith('---')) {
    return { frontmatter: {}, body: content };
  }

  const firstDash = trimmed.indexOf('---');
  const secondDash = trimmed.indexOf('---', firstDash + 3);

  if (secondDash === -1) {
    return { frontmatter: {}, body: content };
  }

  const yamlStr = trimmed.slice(firstDash + 3, secondDash).trim();
  const body = trimmed.slice(secondDash + 3).trim();

  const frontmatter: Record<string, unknown> = {};

  // Simple YAML parser for our specific patterns
  let currentKey = '';
  let inList = false;
  let listItems: string[] = [];

  for (const line of yamlStr.split('\n')) {
    const trimmedLine = line.trim();

    // Skip empty lines
    if (!trimmedLine) continue;

    // List item (e.g., "  - item")
    if (trimmedLine.startsWith('- ') && inList) {
      const item = trimmedLine.slice(2).trim().replace(/["']/g, '');
      listItems.push(item);
      continue;
    }

    // If we were in a list, save it
    if (inList && currentKey) {
      frontmatter[currentKey] = listItems;
      inList = false;
      listItems = [];
    }

    // Key-value pair
    const colonIndex = trimmedLine.indexOf(':');
    if (colonIndex === -1) continue;

    const key = trimmedLine.slice(0, colonIndex).trim();
    const value = trimmedLine.slice(colonIndex + 1).trim();

    // Check if value is empty (might be a list in next lines)
    if (!value) {
      currentKey = key;
      inList = true;
      listItems = [];
      continue;
    }

    // Parse value types
    if (value.startsWith('[') && value.endsWith(']')) {
      // Inline array: [item1, item2]
      frontmatter[key] = value
        .slice(1, -1)
        .split(',')
        .map((s) => s.trim().replace(/["']/g, ''));
    } else if (value === 'true' || value === 'false') {
      frontmatter[key] = value === 'true';
    } else if (/^\d+$/.test(value)) {
      frontmatter[key] = parseInt(value, 10);
    } else if (/^\d+\.\d+$/.test(value)) {
      frontmatter[key] = parseFloat(value);
    } else {
      // String value — strip quotes
      frontmatter[key] = value.replace(/^["']|["']$/g, '');
    }
  }

  // Save any remaining list
  if (inList && currentKey) {
    frontmatter[currentKey] = listItems;
  }

  return { frontmatter, body };
}

/**
 * Normalizes parsed frontmatter into a strongly-typed SkillFrontmatter.
 */
function normalizeFrontmatter(raw: Record<string, unknown>, fallbackId: string): SkillFrontmatter {
  return {
    skill_id: String(raw.skill_id || fallbackId),
    name: String(raw.name || fallbackId),
    version: String(raw.version || '2.0'),
    phase: (['M1', 'M2', 'M3'].includes(String(raw.phase)) ? raw.phase : 'M1') as SkillFrontmatter['phase'],
    description: String(raw.description || ''),
    agent_type: (['orchestrator', 'subagent', 'utility'].includes(String(raw.agent_type))
      ? raw.agent_type
      : 'subagent') as SkillFrontmatter['agent_type'],
    content_modes: Array.isArray(raw.content_modes) ? raw.content_modes.map(String) : undefined,
    inputs: Array.isArray(raw.inputs) ? raw.inputs.map(String) : undefined,
    outputs: Array.isArray(raw.outputs) ? raw.outputs.map(String) : undefined,
    dependencies: Array.isArray(raw.dependencies) ? raw.dependencies.map(String) : undefined,
    required_tools: Array.isArray(raw.required_tools) ? raw.required_tools.map(String) : undefined,
  };
}

// ─── Core Functions ─────────────────────────────────────────────────────────

/**
 * Discovers all skill directories under SKILLS_ROOT.
 */
function discoverSkillDirs(): string[] {
  if (!fs.existsSync(SKILLS_ROOT)) {
    return [];
  }

  return fs
    .readdirSync(SKILLS_ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^\d{2}/.test(d.name))
    .map((d) => d.name)
    .sort();
}

/**
 * Loads a single SKILL.md file. Uses cache if available and not expired.
 */
export function loadSkill(skillId: string, forceReload = false): SkillData | null {
  const now = Date.now();
  const cached = skillCache.get(skillId);

  // Check cache
  if (!forceReload && cached) {
    // Check if file has been modified
    const skillPath = getSkillPath(skillId);
    if (skillPath && fs.existsSync(skillPath)) {
      const stat = fs.statSync(skillPath);
      if (stat.mtimeMs <= cached.mtimeMs && now - cached.loadedAt < CACHE_TTL_MS) {
        return cached;
      }
    }
  }

  // Find the skill directory
  const skillDir = discoverSkillDirs().find((dir) => {
    // Match by exact skill_id or by directory name
    return dir === skillId || dir.replace(/-/g, '-') === skillId;
  });

  if (!skillDir) {
    // Try direct path match
    const directPath = path.join(SKILLS_ROOT, skillId, 'SKILL.md');
    if (fs.existsSync(directPath)) {
      return loadSkillFromPath(directPath, skillId);
    }
    return null;
  }

  const skillFilePath = path.join(SKILLS_ROOT, skillDir, 'SKILL.md');
  return loadSkillFromPath(skillFilePath, skillDir);
}

/**
 * Loads a skill from a specific file path.
 */
function loadSkillFromPath(skillFilePath: string, fallbackId: string): SkillData | null {
  if (!fs.existsSync(skillFilePath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(skillFilePath, 'utf-8');
    const stat = fs.statSync(skillFilePath);
    const { frontmatter: rawFrontmatter, body } = parseFrontmatter(content);
    const frontmatter = normalizeFrontmatter(rawFrontmatter, fallbackId);

    const skillData: SkillData = {
      id: frontmatter.skill_id,
      path: skillFilePath,
      frontmatter,
      body,
      loadedAt: Date.now(),
      mtimeMs: stat.mtimeMs,
    };

    // Update cache
    skillCache.set(frontmatter.skill_id, skillData);
    return skillData;
  } catch (err) {
    console.error(`[skill-loader] Failed to load skill from ${skillFilePath}:`, err);
    return null;
  }
}

/**
 * Lists all available skills with their metadata.
 * Performs a full scan if cache is stale.
 */
export function listSkills(forceReload = false): SkillData[] {
  const now = Date.now();
  const dirs = discoverSkillDirs();

  // Full scan if cache is stale or forced
  if (forceReload || now - lastFullScan > CACHE_TTL_MS) {
    for (const dir of dirs) {
      loadSkill(dir, forceReload);
    }
    lastFullScan = now;
  }

  // Return skills sorted by skill_id
  return Array.from(skillCache.values())
    .filter((s) => dirs.includes(s.id) || dirs.some((d) => s.path.includes(d)))
    .sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Gets the file system path for a skill directory.
 */
export function getSkillPath(skillId: string): string | null {
  const dir = discoverSkillDirs().find((d) => d === skillId);
  if (!dir) return null;
  return path.join(SKILLS_ROOT, dir, 'SKILL.md');
}

/**
 * Clears the entire skill cache (for hot-reload).
 */
export function clearSkillCache(): void {
  skillCache.clear();
  lastFullScan = 0;
}

/**
 * Gets skills filtered by phase.
 */
export function getSkillsByPhase(phase: 'M1' | 'M2' | 'M3'): SkillData[] {
  return listSkills().filter((s) => s.frontmatter.phase === phase);
}

/**
 * Gets the skill dependency chain for a given skill.
 * Returns an ordered list of skill IDs that must complete before this skill.
 */
export function getDependencyChain(skillId: string): string[] {
  const skill = loadSkill(skillId);
  if (!skill || !skill.frontmatter.dependencies?.length) {
    return [];
  }

  const chain: string[] = [];
  const visited = new Set<string>();

  function walk(id: string) {
    if (visited.has(id)) return;
    visited.add(id);

    const s = loadSkill(id);
    if (s?.frontmatter.dependencies) {
      for (const dep of s.frontmatter.dependencies) {
        walk(dep);
        if (!chain.includes(dep)) {
          chain.push(dep);
        }
      }
    }
  }

  walk(skillId);
  return chain;
}
