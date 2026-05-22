// ============================================================
// Agent SSE Streaming Route — /api/agent/[type]/stream
// POST: Execute an agent with real-time SSE progress feedback
// Sends rich structured events for frontend rendering
// ============================================================

// Allow up to 5 minutes for agent execution (storyboard generation can take 60-120s)
export const maxDuration = 300

import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth-helpers'
import { AgentType, ALL_AGENT_TYPES, AGENT_NAMES } from '@/lib/agents/types'
import { executeAgent, AgentProgressEvent } from '@/lib/agents/factory'
import { getActiveProviderForUser } from '@/lib/ai-config'
import { recordGenerationCost, calcLlmCredits } from '@/lib/cost-tracker'

// ============================================================
// Validate agent type
// ============================================================

function isValidAgentType(type: string): type is AgentType {
  return ALL_AGENT_TYPES.includes(type as AgentType)
}

// ============================================================
// POST /api/agent/[type]/stream — Execute agent with SSE streaming
// ============================================================

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ type: string }> }
) {
  // Auth check for agent execution
  const auth = await requireAuth()
  if (auth.error) return new Response(
    JSON.stringify({ error: '未登录' }),
    { status: 401, headers: { 'Content-Type': 'application/json' } }
  )

  const { type } = await params

  if (!isValidAgentType(type)) {
    return new Response(
      JSON.stringify({
        error: `Invalid agent type: "${type}". Valid types: ${ALL_AGENT_TYPES.join(', ')}`,
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const agentType = type as AgentType

  // Parse request body
  let body: { episodeId?: string; dramaId?: string; message?: string; model?: string }
  try {
    body = await request.json()
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid JSON body' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const { episodeId, dramaId, message, model } = body

  if (!episodeId || !dramaId || !message) {
    return new Response(
      JSON.stringify({ error: 'Missing required fields: episodeId, dramaId, message' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
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

  // Create SSE stream
  const encoder = new TextEncoder()
  const startTime = Date.now()

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (event: AgentProgressEvent) => {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
          )
        } catch {
          // Stream may have been closed
        }
      }

      try {
        const result = await executeAgent(
          agentType,
          episodeId,
          dramaId,
          message,
          (event) => {
            sendEvent(event)
          },
          { modelOverride: effectiveModel, userId: auth.userId }
        )

        // Send final completed event with full results
        sendEvent({
          type: 'completed',
          message: `${AGENT_NAMES[agentType]} 执行完成，共 ${result.steps} 步`,
          timestamp: Date.now(),
          stepNumber: result.steps,
          agentType,
          agentName: AGENT_NAMES[agentType],
          textOutput: result.text,
          // Include structured completion data
          toolCalls: result.toolCalls,
          steps: result.steps,
          duration: Date.now() - startTime,
        } as AgentProgressEvent & { toolCalls: unknown[]; steps: number; duration: number })

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
            generationMs: Date.now() - startTime,
          })
        } catch { /* non-blocking */ }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        console.error(`[Agent ${agentType} Stream] Execution failed:`, errorMsg)
        sendEvent({
          type: 'error',
          message: errorMsg,
          timestamp: Date.now(),
        })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
