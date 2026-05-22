// ============================================================
// Agent API Route — /api/agent/[type]
// POST:  Execute an agent with a message
// GET:   Get agent config
// PATCH: Update agent config
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helpers'
import {
  AgentType,
  ALL_AGENT_TYPES,
  AGENT_NAMES,
  AGENT_DESCRIPTIONS,
} from '@/lib/agents/types'
import { DEFAULT_SYSTEM_PROMPTS } from '@/lib/agents/prompts'
import { executeAgent } from '@/lib/agents/factory'
import { loadAgentSkill } from '@/lib/agents/skills'
import { getActiveProviderForUser } from '@/lib/ai-config'
import { recordGenerationCost, calcLlmCredits } from '@/lib/cost-tracker'

// ============================================================
// Validate agent type
// ============================================================

function isValidAgentType(type: string): type is AgentType {
  return ALL_AGENT_TYPES.includes(type as AgentType)
}

// ============================================================
// GET /api/agent/[type] — Get agent config
// ============================================================

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ type: string }> }
) {
  const { type } = await params

  if (!isValidAgentType(type)) {
    return NextResponse.json(
      {
        error: `Invalid agent type: "${type}". Valid types: ${ALL_AGENT_TYPES.join(', ')}`,
      },
      { status: 400 }
    )
  }

  const agentType = type as AgentType

  // Try to get DB config
  let dbConfig: {
    systemPrompt: string | null
    model: string | null
    temperature: number
    maxTokens: number
    isActive: boolean
  } | null = null

  try {
    const { db } = await import('@/lib/db')
    const agentConfigModel = (db as any).agentConfig
    if (agentConfigModel) {
      const configRow = await agentConfigModel.findUnique({
        where: { agentType },
      })
      dbConfig = configRow
    }
  } catch {
    // AgentConfig table may not exist yet
  }

  const skillContent = loadAgentSkill(agentType)

  // Agent-type-specific default maxTokens
  const defaultMaxTokensByType: Record<string, number> = {
    storyboard_breaker: 32768,
    extractor: 8192,
    script_rewriter: 8192,
  }
  const typeDefaultMaxTokens = defaultMaxTokensByType[agentType] ?? 4096

  return NextResponse.json({
    agentType,
    name: AGENT_NAMES[agentType],
    description: AGENT_DESCRIPTIONS[agentType],
    config: {
      systemPrompt: dbConfig?.systemPrompt || DEFAULT_SYSTEM_PROMPTS[agentType],
      model: dbConfig?.model || null,
      temperature: dbConfig?.temperature ?? 0.7,
      maxTokens: (dbConfig?.maxTokens && dbConfig.maxTokens >= typeDefaultMaxTokens)
        ? dbConfig.maxTokens
        : typeDefaultMaxTokens,
      isActive: dbConfig?.isActive ?? true,
    },
    hasSkill: !!skillContent,
    skillPreview: skillContent
      ? skillContent.slice(0, 200) + '...'
      : null,
  })
}

// ============================================================
// PATCH /api/agent/[type] — Update agent config
// ============================================================

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ type: string }> }
) {
  // Auth check — only logged in users can update agent config
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const { type } = await params

  if (!isValidAgentType(type)) {
    return NextResponse.json(
      {
        error: `Invalid agent type: "${type}". Valid types: ${ALL_AGENT_TYPES.join(', ')}`,
      },
      { status: 400 }
    )
  }

  const agentType = type as AgentType

  // Parse request body
  let body: {
    systemPrompt?: string
    model?: string
    temperature?: number
    maxTokens?: number
    isActive?: boolean
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 }
    )
  }

  // Build update data — only include fields that were provided
  const updateData: Record<string, unknown> = {}
  if (body.systemPrompt !== undefined) updateData.systemPrompt = body.systemPrompt
  if (body.model !== undefined) updateData.model = body.model
  if (body.temperature !== undefined) updateData.temperature = body.temperature
  if (body.maxTokens !== undefined) updateData.maxTokens = body.maxTokens
  if (body.isActive !== undefined) updateData.isActive = body.isActive

  try {
    const { db } = await import('@/lib/db')
    const agentConfigModel = (db as any).agentConfig
    if (!agentConfigModel) {
      return NextResponse.json(
        { error: 'AgentConfig table not available' },
        { status: 500 }
      )
    }

    // Upsert: create if not exists, update if exists
    const defaultPrompt = DEFAULT_SYSTEM_PROMPTS[agentType]
    // Agent-type-specific default maxTokens — storyboard_breaker needs much more
    // because save_storyboards tool call contains full storyboard JSON
    const defaultMaxTokensByType: Record<string, number> = {
      storyboard_breaker: 32768,
      extractor: 8192,
      script_rewriter: 8192,
    }
    const typeDefaultMaxTokens = defaultMaxTokensByType[agentType] ?? 4096
    const updated = await agentConfigModel.upsert({
      where: { agentType },
      update: updateData,
      create: {
        agentType,
        systemPrompt: body.systemPrompt ?? defaultPrompt,
        model: body.model ?? null,
        temperature: body.temperature ?? 0.7,
        maxTokens: body.maxTokens ?? typeDefaultMaxTokens,
        isActive: body.isActive ?? true,
      },
    })

    return NextResponse.json({
      agentType,
      name: AGENT_NAMES[agentType],
      description: AGENT_DESCRIPTIONS[agentType],
      config: {
        systemPrompt: updated.systemPrompt || defaultPrompt,
        model: updated.model || null,
        temperature: updated.temperature ?? 0.7,
        maxTokens: updated.maxTokens ?? 4096,
        isActive: updated.isActive ?? true,
      },
    })
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    console.error(`[Agent ${agentType}] Config update failed:`, errorMsg)

    return NextResponse.json(
      { error: `Failed to update agent config: ${errorMsg}` },
      { status: 500 }
    )
  }
}

// ============================================================
// POST /api/agent/[type] — Execute agent
// ============================================================

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ type: string }> }
) {
  // Auth check for agent execution
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const { type } = await params

  if (!isValidAgentType(type)) {
    return NextResponse.json(
      {
        error: `Invalid agent type: "${type}". Valid types: ${ALL_AGENT_TYPES.join(', ')}`,
      },
      { status: 400 }
    )
  }

  const agentType = type as AgentType

  // Parse request body
  let body: { episodeId?: string; dramaId?: string; message?: string; model?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 }
    )
  }

  const { episodeId, dramaId, message, model } = body

  if (!episodeId || !dramaId || !message) {
    return NextResponse.json(
      {
        error:
          'Missing required fields: episodeId, dramaId, message',
      },
      { status: 400 }
    )
  }

  // ── Locked config enforcement ──
  // If the episode has a lockedConfig with an llm override,
  // use it as the model regardless of what the client sent.
  let effectiveModel = model
  try {
    const { db } = await import('@/lib/db')
    const episode = await db.episode.findUnique({
      where: { id: episodeId },
      select: { lockedConfig: true },
    })
    if (episode?.lockedConfig && episode.lockedConfig !== 'null') {
      const locked = JSON.parse(episode.lockedConfig)
      if (locked?.llm) {
        effectiveModel = locked.llm
      }
    }
  } catch {
    // If we can't read lockedConfig, fall through with client model
  }

  // Execute the agent
  const agentStartTime = Date.now()
  try {
    const result = await executeAgent(agentType, episodeId, dramaId, message, undefined, { modelOverride: effectiveModel, userId: auth.userId })

    // Record LLM cost (non-blocking)
    try {
      const llmProvider = await getActiveProviderForUser('llm', auth.userId)
      const providerName = llmProvider?.provider || ''
      const modelName = effectiveModel || llmProvider?.model || ''
      // Estimate token usage from steps (rough: ~2K tokens per step)
      const estimatedTokens = result.steps * 2000
      recordGenerationCost({
        dramaId,
        episodeId,
        category: 'llm',
        provider: providerName,
        model: modelName,
        credits: calcLlmCredits(estimatedTokens),
        tokensUsed: estimatedTokens,
        generationMs: Date.now() - agentStartTime,
      })
    } catch { /* non-blocking */ }

    return NextResponse.json({
      agentType,
      name: AGENT_NAMES[agentType],
      ...result,
    })
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    console.error(`[Agent ${agentType}] Execution failed:`, errorMsg)

    return NextResponse.json(
      {
        error: `Agent execution failed: ${errorMsg}`,
        agentType,
      },
      { status: 500 }
    )
  }
}
