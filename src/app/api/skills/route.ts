/**
 * Skills API Route — GET /api/skills
 *
 * - GET (no params): List all available skills with metadata
 * - GET ?skill_id=XX: Get specific skill detail including full body
 * - GET ?phase=M1: Filter skills by phase
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  loadSkill,
  listSkills,
  getSkillsByPhase,
  getDependencyChain,
} from '@/lib/skills/skill-loader';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const skillId = searchParams.get('skill_id');
    const phase = searchParams.get('phase') as 'M1' | 'M2' | 'M3' | null;
    const includeBody = searchParams.get('include_body') === 'true';
    const forceReload = searchParams.get('force_reload') === 'true';

    // ─── Single Skill Detail ────────────────────────────────────────

    if (skillId) {
      const skill = loadSkill(skillId, forceReload);

      if (!skill) {
        return NextResponse.json(
          { error: `Skill not found: ${skillId}`, available_skills: listSkills().map((s) => s.id) },
          { status: 404 }
        );
      }

      const deps = getDependencyChain(skillId);

      return NextResponse.json({
        skill_id: skill.id,
        frontmatter: skill.frontmatter,
        body: includeBody ? skill.body : undefined,
        dependency_chain: deps,
        file_path: skill.path,
        loaded_at: new Date(skill.loadedAt).toISOString(),
      });
    }

    // ─── List All Skills ───────────────────────────────────────────

    const skills = phase ? getSkillsByPhase(phase) : listSkills(forceReload);

    return NextResponse.json({
      total: skills.length,
      phase_filter: phase || null,
      skills: skills.map((s) => ({
        skill_id: s.id,
        name: s.frontmatter.name,
        version: s.frontmatter.version,
        phase: s.frontmatter.phase,
        description: s.frontmatter.description,
        agent_type: s.frontmatter.agent_type,
        dependencies: s.frontmatter.dependencies || [],
        content_modes: s.frontmatter.content_modes || [],
      })),
      phases: {
        M1: { label: '内容理解', skills: skills.filter((s) => s.frontmatter.phase === 'M1').map((s) => s.id) },
        M2: { label: '资产准备', skills: skills.filter((s) => s.frontmatter.phase === 'M2').map((s) => s.id) },
        M3: { label: '单集制作循环', skills: skills.filter((s) => s.frontmatter.phase === 'M3').map((s) => s.id) },
      },
    });
  } catch (error) {
    console.error('[Skills API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
