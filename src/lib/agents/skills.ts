// ============================================================
// Agent Architecture — Skill Loading System
// Reads SKILL.md files from data/skills/ directory.
// Each agent type has its own SKILL.md that provides
// domain-specific guidelines and practical tips.
// ============================================================

import { AgentType } from './types'
import * as fs from 'fs'
import * as path from 'path'

// Map agent type to skill file name
const SKILL_FILE_MAP: Record<AgentType, string> = {
  script_parser: 'script_parser_SKILL.md',
  script_rewriter: 'script_rewriter_SKILL.md',
  extractor: 'extractor_SKILL.md',
  storyboard_breaker: 'storyboard_breaker_SKILL.md',
  voice_assigner: 'voice_assigner_SKILL.md',
  grid_prompt_generator: 'grid_prompt_generator_SKILL.md',
}

/**
 * Load a skill file for an agent type.
 * Reads from data/skills/ directory at runtime.
 * Returns null if the skill file doesn't exist.
 */
export function loadAgentSkill(agentType: AgentType): string | null {
  const skillFileName = SKILL_FILE_MAP[agentType]
  if (!skillFileName) return null

  // Resolve path relative to project root
  const projectRoot = process.cwd()
  const skillPath = path.join(projectRoot, 'data', 'skills', skillFileName)

  try {
    if (fs.existsSync(skillPath)) {
      return fs.readFileSync(skillPath, 'utf-8')
    }
  } catch {
    // Skill file not found or not readable — that's OK
  }

  return null
}

/**
 * Get the file path for an agent's skill file
 */
export function getSkillFilePath(agentType: AgentType): string {
  const skillFileName = SKILL_FILE_MAP[agentType]
  const projectRoot = process.cwd()
  return path.join(projectRoot, 'data', 'skills', skillFileName)
}

/**
 * List all available skill files
 */
export function listAvailableSkills(): Array<{
  agentType: AgentType
  fileName: string
  exists: boolean
}> {
  const projectRoot = process.cwd()
  return Object.entries(SKILL_FILE_MAP).map(([agentType, fileName]) => {
    const skillPath = path.join(projectRoot, 'data', 'skills', fileName)
    return {
      agentType: agentType as AgentType,
      fileName,
      exists: fs.existsSync(skillPath),
    }
  })
}
