// ============================================================
// Agents API Route — /api/agents
// GET: List all agent configs with full details
// ============================================================

import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helpers'
import {
  AgentType,
  ALL_AGENT_TYPES,
  AGENT_NAMES,
  AGENT_DESCRIPTIONS,
} from '@/lib/agents/types'
import { DEFAULT_SYSTEM_PROMPTS } from '@/lib/agents/prompts'
import { AGENT_TOOLS } from '@/lib/agents/tools'
import { loadAgentSkill } from '@/lib/agents/skills'

// ============================================================
// GET /api/agents — List all agent configs
// ============================================================

export async function GET() {
  try {
    // Auth check — only logged in users can list agent configs
    const auth = await requireAuth()
    if (auth.error) return auth.error
    // Load all DB configs at once
    const dbConfigs: Record<
      string,
      {
        systemPrompt: string | null
        model: string | null
        temperature: number
        maxTokens: number
        isActive: boolean
      } | null
    > = {}

    try {
      const { db } = await import('@/lib/db')
      const agentConfigModel = (db as any).agentConfig
      if (agentConfigModel) {
        const allConfigs = await agentConfigModel.findMany()
        for (const config of allConfigs) {
          dbConfigs[config.agentType] = config
        }
      }
    } catch {
      // AgentConfig table may not exist yet
    }

    const agents = ALL_AGENT_TYPES.map((agentType) => {
      const dbConfig = dbConfigs[agentType] as {
        systemPrompt: string | null
        model: string | null
        temperature: number
        maxTokens: number
        isActive: boolean
      } | null

      const skillContent = loadAgentSkill(agentType)
      const tools = AGENT_TOOLS[agentType] || []

      return {
        agentType,
        name: AGENT_NAMES[agentType],
        description: AGENT_DESCRIPTIONS[agentType],
        config: {
          systemPrompt:
            dbConfig?.systemPrompt || DEFAULT_SYSTEM_PROMPTS[agentType],
          model: dbConfig?.model || null,
          temperature: dbConfig?.temperature ?? 0.7,
          maxTokens: dbConfig?.maxTokens ?? 4096,
          isActive: dbConfig?.isActive ?? true,
        },
        defaultSystemPrompt: DEFAULT_SYSTEM_PROMPTS[agentType],
        tools: tools.map((t) => ({
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        })),
        skillContent,
      }
    })

    return NextResponse.json({ agents })
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    console.error('[Agents API] Failed to list agents:', errorMsg)

    return NextResponse.json(
      { error: `Failed to list agents: ${errorMsg}` },
      { status: 500 }
    )
  }
}
