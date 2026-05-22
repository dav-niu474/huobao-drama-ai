// ============================================================
// Agent Architecture — Factory & Execution Loop
// Core file implementing the agent execution pattern inspired
// by Mastra framework. Implements an agentic loop that:
// 1. Gets agent config from DB (or defaults)
// 2. Builds instructions (base prompt + skill)
// 3. Creates tool definitions and executors
// 4. Calls LLM with tools (OpenAI function calling format)
// 5. Executes tool calls and feeds results back
// 6. Repeats until no more tool calls or max steps
// ============================================================

import { AgentType, AgentExecutionResult } from './types'
import { DEFAULT_SYSTEM_PROMPTS } from './prompts'
import { getOpenAIToolsForAgent } from './tools/index'
import { getExecutorsForAgent, ToolExecutor } from './tools/executors'
import { loadAgentSkill } from './skills'
import { getActiveProviderForUser } from '@/lib/ai-config'

// ============================================================
// Extended message types for tool calling
// ============================================================

interface ToolCallMessage {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: ToolCallMessage[]
  tool_call_id?: string
}

// ============================================================
// Rich progress event type for SSE streaming
// ============================================================

export interface AgentProgressEvent {
  /** Event type: starting, thinking, tool_call, tool_result, tool_error, text_output, text_stream, completed, error */
  type: string
  /** Human-readable message */
  message: string
  /** Timestamp */
  timestamp: number
  /** Tool call details (for tool_call events) */
  toolCall?: {
    id: string
    name: string
    arguments: Record<string, unknown>
  }
  /** Tool result details (for tool_result/tool_error events) */
  toolResult?: {
    name: string
    result?: unknown
    error?: string
  }
  /** LLM text output (for text_output events) */
  textOutput?: string
  /** Step number */
  stepNumber?: number
  /** Agent type */
  agentType?: string
  /** Agent display name */
  agentName?: string
  /** Skill loaded status */
  skillLoaded?: boolean
}

export type AgentProgressCallback = (event: AgentProgressEvent) => void

// ============================================================
// Agent Config from DB
// ============================================================

interface AgentConfigRow {
  systemPrompt: string | null
  model: string | null
  temperature: number
  maxTokens: number
  isActive: boolean
}

async function getAgentConfig(
  agentType: AgentType
): Promise<AgentConfigRow | null> {
  try {
    const { db } = await import('@/lib/db')
    const agentConfigModel = (db as any).agentConfig
    if (!agentConfigModel) return null

    const config = await agentConfigModel.findUnique({
      where: { agentType },
    })
    return config as AgentConfigRow | null
  } catch {
    // AgentConfig table might not exist yet
    return null
  }
}

// ============================================================
// LLM Call with Tool Support — STREAMING
// Uses streaming API with INACTIVITY-BASED timeout.
// Timeout resets every time a chunk is received, so long
// responses that are actively streaming won't be killed.
// Only truly stalled connections (no data for 120s) are aborted.
// Thinking content (delta.content / reasoning_content) is
// streamed to the frontend in real-time for better UX.
// ============================================================

const LLM_INACTIVITY_TIMEOUT = 120_000 // 2 min without ANY data → abort
const THINKING_STREAM_INTERVAL = 400   // Throttle thinking events to every 400ms

async function callLLMWithTools(
  messages: ChatMessage[],
  tools: ReturnType<typeof getOpenAIToolsForAgent>,
  options: {
    model?: string
    temperature?: number
    maxTokens?: number
    userId?: string
    onProgress?: AgentProgressCallback
    stepNumber?: number
  }
): Promise<{
  message: {
    role: string
    content: string | null
    tool_calls?: ToolCallMessage[]
  }
  finishReason: string
}> {
  const provider = await getActiveProviderForUser('llm', options.userId)
  if (!provider) {
    throw new Error('未配置 LLM 供应商。请在设置中配置 API Key。')
  }

  const body: Record<string, unknown> = {
    model: options.model || provider.model,
    messages: messages.map((m) => ({
      role: m.role,
      content: m.content,
      ...(m.tool_calls ? { tool_calls: m.tool_calls } : {}),
      ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}),
    })),
    temperature: options.temperature ?? 0.7,
    max_tokens: options.maxTokens ?? 4096,
    stream: true, // ← CRITICAL: Use streaming to prevent timeouts
  }

  // Add tools if provided
  if (tools.length > 0) {
    body.tools = tools
    body.tool_choice = 'auto'
  }

  const url = provider.baseUrl.endsWith('/chat/completions')
    ? provider.baseUrl
    : `${provider.baseUrl.replace(/\/$/, '')}/chat/completions`

  // Build headers — OpenRouter requires additional headers for app identification
  const headers: Record<string, string> = {
    Authorization: `Bearer ${provider.apiKey}`,
    'Content-Type': 'application/json',
  }
  if (provider.provider === 'openrouter') {
    headers['HTTP-Referer'] = 'https://huobao-drama-ai.vercel.app'
    headers['X-Title'] = 'AI Drama Creator'
  }

  // Create AbortController with inactivity-based timeout
  // Timeout resets every time we receive ANY data from the stream
  const controller = new AbortController()
  let inactivityTimer = setTimeout(() => {
    console.warn(`[callLLMWithTools] Inactivity timeout (${LLM_INACTIVITY_TIMEOUT / 1000}s) — aborting`)
    controller.abort()
  }, LLM_INACTIVITY_TIMEOUT)

  const resetInactivityTimer = () => {
    clearTimeout(inactivityTimer)
    inactivityTimer = setTimeout(() => {
      console.warn(`[callLLMWithTools] Inactivity timeout (${LLM_INACTIVITY_TIMEOUT / 1000}s) — aborting`)
      controller.abort()
    }, LLM_INACTIVITY_TIMEOUT)
  }

  // Throttled thinking stream — only emit events every THINKING_STREAM_INTERVAL
  let lastThinkingEmitTime = 0
  let pendingThinkingContent = ''
  let thinkingEmitTimer: ReturnType<typeof setTimeout> | null = null

  const emitThinkingStream = (content: string) => {
    pendingThinkingContent = content
    const now = Date.now()
    if (now - lastThinkingEmitTime >= THINKING_STREAM_INTERVAL) {
      // Enough time has passed — emit immediately
      lastThinkingEmitTime = now
      options.onProgress?.({
        type: 'thinking',
        message: pendingThinkingContent,
        timestamp: now,
        stepNumber: options.stepNumber,
      })
      pendingThinkingContent = ''
      if (thinkingEmitTimer) {
        clearTimeout(thinkingEmitTimer)
        thinkingEmitTimer = null
      }
    } else if (!thinkingEmitTimer) {
      // Schedule a delayed emit to ensure the last chunk is sent
      thinkingEmitTimer = setTimeout(() => {
        if (pendingThinkingContent) {
          lastThinkingEmitTime = Date.now()
          options.onProgress?.({
            type: 'thinking',
            message: pendingThinkingContent,
            timestamp: Date.now(),
            stepNumber: options.stepNumber,
          })
          pendingThinkingContent = ''
        }
        thinkingEmitTimer = null
      }, THINKING_STREAM_INTERVAL)
    }
  }

  // Flush any remaining thinking content
  const flushThinkingStream = () => {
    if (thinkingEmitTimer) {
      clearTimeout(thinkingEmitTimer)
      thinkingEmitTimer = null
    }
    if (pendingThinkingContent) {
      options.onProgress?.({
        type: 'thinking',
        message: pendingThinkingContent,
        timestamp: Date.now(),
        stepNumber: options.stepNumber,
      })
      pendingThinkingContent = ''
    }
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    if (!res.ok) {
      const text = await res.text().catch(() => 'Unknown error')
      throw new Error(`LLM API error (${res.status}): ${text.slice(0, 500)}`)
    }

    if (!res.body) {
      throw new Error('LLM API returned no body')
    }

    // ── Stream reading + tool call assembly ──
    const reader = res.body.getReader()
    const decoder = new TextDecoder()

    let content = ''
    let reasoningContent = ''
    let finishReason = ''
    const toolCallsMap = new Map<number, { id: string; name: string; arguments: string }>()

    let buffer = ''
    let chunksReceived = 0

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      // Reset inactivity timer on every chunk received
      resetInactivityTimer()
      chunksReceived++

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data: ')) continue

        const data = trimmed.slice(6)
        if (data === '[DONE]') continue

        try {
          const chunk = JSON.parse(data)
          const choice = chunk.choices?.[0]
          if (!choice) continue

          const delta = choice.delta

          // Accumulate and stream reasoning_content (DeepSeek R1, etc.)
          if (delta?.reasoning_content) {
            reasoningContent += delta.reasoning_content
            emitThinkingStream(reasoningContent)
          }

          // Accumulate and stream text content as thinking
          if (delta?.content) {
            content += delta.content
            // Stream content as thinking events so user sees the LLM's
            // thought process in real-time (especially for storyboard_breaker)
            emitThinkingStream(content)
          }

          // Accumulate tool calls (OpenAI standard format: delta.tool_calls)
          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0
              if (!toolCallsMap.has(idx)) {
                toolCallsMap.set(idx, {
                  id: tc.id || '',
                  name: tc.function?.name || '',
                  arguments: '',
                })
              }
              const existing = toolCallsMap.get(idx)!
              if (tc.id) existing.id = tc.id
              if (tc.function?.name) existing.name = tc.function.name
              if (tc.function?.arguments) existing.arguments += tc.function.arguments
            }
          }

          // Handle old OpenAI format: delta.function_call (singular)
          // Some providers (e.g., older SenseNova) use this instead of tool_calls
          if (delta?.function_call) {
            const fc = delta.function_call
            const idx = 0 // old format only supports one function call
            if (!toolCallsMap.has(idx)) {
              toolCallsMap.set(idx, {
                id: '',
                name: fc.name || '',
                arguments: fc.arguments || '',
              })
            } else {
              const existing = toolCallsMap.get(idx)!
              if (fc.name) existing.name = fc.name
              if (fc.arguments) existing.arguments += fc.arguments
            }
          }

          // Handle non-standard format: some providers put tool call in choice itself
          // (not in delta, but in the choice-level tool_calls or function_call)
          if (!delta?.tool_calls && !delta?.function_call && choice.tool_calls) {
            for (let i = 0; i < choice.tool_calls.length; i++) {
              const tc = choice.tool_calls[i]
              const idx = tc.index ?? i  // Use loop index as fallback to avoid collision
              if (!toolCallsMap.has(idx)) {
                toolCallsMap.set(idx, {
                  id: tc.id || '',
                  name: tc.function?.name || '',
                  arguments: tc.function?.arguments || '',
                })
              } else {
                const existing = toolCallsMap.get(idx)!
                if (tc.id) existing.id = tc.id
                if (tc.function?.name) existing.name = tc.function.name
                if (tc.function?.arguments) existing.arguments += tc.function.arguments
              }
            }
          }

          // Capture finish reason
          if (choice.finish_reason) {
            finishReason = choice.finish_reason
          }
        } catch {
          // Ignore JSON parse errors on individual chunks
        }
      }
    }

    // Flush any remaining thinking content
    flushThinkingStream()

    // Clear timers
    clearTimeout(inactivityTimer)
    if (thinkingEmitTimer) clearTimeout(thinkingEmitTimer)

    console.log(`[callLLMWithTools] Stream completed: ${chunksReceived} chunks, content=${content.length}chars, reasoning=${reasoningContent.length}chars, toolCalls=${toolCallsMap.size}, finish=${finishReason}, max_tokens=${options.maxTokens}`)

    // Log each tool call's argument length for debugging truncation issues
    for (const [idx, tc] of toolCallsMap) {
      console.log(`[callLLMWithTools] Tool[${idx}]: name=${tc.name}, argsLen=${tc.arguments.length}, id=${tc.id}`)
    }

    // ── Non-streaming fallback when tool call parsing fails ──
    // If streaming didn't properly capture tool call names (some providers
    // don't stream tool calls correctly), retry with a non-streaming request
    const hasEmptyToolNames = [...toolCallsMap.values()].some(tc => !tc.name && tc.arguments)
    const hasToolCallsWithNoNameOrArgs = [...toolCallsMap.values()].some(tc => !tc.name && !tc.arguments)
    // Also check: if content looks like it might contain a tool call attempt
    // (e.g., the LLM output the tool call as text instead of proper format)
    const toolNames = tools.map(t => t.function?.name).filter(Boolean)
    const contentLooksLikeToolCall = content && !toolCallsMap.size &&
      toolNames.some(name => content.includes(name!))

    if ((hasEmptyToolNames || hasToolCallsWithNoNameOrArgs || contentLooksLikeToolCall) && tools.length > 0) {
      console.warn(`[callLLMWithTools] Streaming tool call parsing failed (emptyNames=${hasEmptyToolNames}, noNameNoArgs=${hasToolCallsWithNoNameOrArgs}, contentLikeToolCall=${contentLooksLikeToolCall}), retrying with non-streaming request`)
      try {
        const nonStreamRes = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify({ ...body, stream: false }),
          signal: AbortSignal.timeout(180_000), // 3 min timeout for non-streaming
        })
        if (nonStreamRes.ok) {
          const nonStreamData = await nonStreamRes.json()
          const nsChoice = nonStreamData.choices?.[0]
          if (nsChoice) {
            // Override content and finish reason from non-streaming response
            if (nsChoice.message?.content) content = nsChoice.message.content
            if (nsChoice.finish_reason) finishReason = nsChoice.finish_reason
            // Clear and rebuild tool calls from non-streaming response
            if (nsChoice.message?.tool_calls?.length) {
              toolCallsMap.clear()
              for (const tc of nsChoice.message.tool_calls) {
                toolCallsMap.set(toolCallsMap.size, {
                  id: tc.id || '',
                  name: tc.function?.name || '',
                  arguments: tc.function?.arguments || '',
                })
              }
              console.log(`[callLLMWithTools] Non-streaming fallback succeeded: ${toolCallsMap.size} tool calls recovered`)
            } else if (nsChoice.message?.function_call) {
              // Old format: single function_call
              toolCallsMap.clear()
              toolCallsMap.set(0, {
                id: '',
                name: nsChoice.message.function_call.name || '',
                arguments: nsChoice.message.function_call.arguments || '',
              })
              console.log(`[callLLMWithTools] Non-streaming fallback (function_call format): name=${nsChoice.message.function_call.name}`)
            } else if (nsChoice.message?.content) {
              // LLM output text instead of calling tools — this is fine,
              // the agentic loop will handle it (nudge logic)
              console.log(`[callLLMWithTools] Non-streaming response is text-only (no tool calls) — content=${nsChoice.message.content.slice(0, 100)}...`)
            }
          }
        } else {
          console.warn(`[callLLMWithTools] Non-streaming fallback failed: ${nonStreamRes.status}`)
        }
      } catch (nsErr) {
        console.warn(`[callLLMWithTools] Non-streaming fallback error: ${nsErr instanceof Error ? nsErr.message : String(nsErr)}`)
      }
    }

    // Assemble final message
    const toolCalls: ToolCallMessage[] = []
    for (const [idx, tc] of toolCallsMap) {
      // Some LLM providers don't send tool_call id in the first chunk,
      // or send it as empty string. Generate a fallback id if missing.
      const toolCallId = tc.id || `tool_call_${idx}_${Date.now()}`
      const toolCallName = tc.name || 'unknown'
      console.log(`[callLLMWithTools] Tool[${idx}]: name=${tc.name}, id=${tc.id}, argsLen=${tc.arguments.length}, fallbackId=${toolCallId}`)
      toolCalls.push({
        id: toolCallId,
        type: 'function',
        function: {
          name: toolCallName,
          arguments: tc.arguments || '{}',
        },
      })
    }

    return {
      message: {
        role: 'assistant',
        content: content || null,
        ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
      },
      finishReason: finishReason || 'stop',
    }
  } catch (error) {
    clearTimeout(inactivityTimer)
    if (thinkingEmitTimer) clearTimeout(thinkingEmitTimer)

    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(`LLM API调用超时（${LLM_INACTIVITY_TIMEOUT / 1000}秒内无数据返回），模型可能已停止响应。请尝试使用更快的模型或减少单次数据量。`)
    }
    throw error
  }
}

// ============================================================
// Agent name mapping (imported from types)
// ============================================================

import { AGENT_NAMES } from './types'

// ============================================================
// Main Agent Execution Function
// ============================================================

const MAX_STEPS = 20

export async function executeAgent(
  agentType: AgentType,
  episodeId: string,
  dramaId: string,
  message: string,
  onProgress?: AgentProgressCallback,
  options?: { modelOverride?: string; userId?: string }
): Promise<AgentExecutionResult> {
  // 1. Get agent config from DB (or use defaults)
  const dbConfig = await getAgentConfig(agentType)

  const systemPrompt =
    dbConfig?.systemPrompt || DEFAULT_SYSTEM_PROMPTS[agentType]
  const model = options?.modelOverride || dbConfig?.model || undefined
  const temperature = dbConfig?.temperature ?? 0.7
  // storyboard_breaker needs much larger max_tokens because save_storyboards
  // tool call contains full storyboard JSON (imagePrompt + videoPrompt per shot).
  // ⚠️ IMPORTANT: The AgentConfig table has maxTokens @default(4096), and the
  // PATCH API creates rows with 4096 when not specified. We must NOT let a DB
  // value of 4096 override the type-specific default (e.g., 32768 for storyboard_breaker).
  // Strategy: only use DB value if it EXCEEDS the type-specific default; otherwise
  // the DB value is likely a stale/generic default and should be ignored.
  const defaultMaxTokens: Record<string, number> = {
    script_parser: 8192,
    storyboard_breaker: 32768,
    extractor: 8192,
    script_rewriter: 8192,
  }
  const typeDefault = defaultMaxTokens[agentType] ?? 4096
  // Use DB value only if it's explicitly set to a value larger than the type default
  // (i.e., the admin intentionally increased it). Otherwise, use the type default.
  const maxTokens = (dbConfig?.maxTokens && dbConfig.maxTokens > typeDefault)
    ? dbConfig.maxTokens
    : typeDefault

  console.log(`[executeAgent] agentType=${agentType}, dbMaxTokens=${dbConfig?.maxTokens}, typeDefault=${typeDefault}, finalMaxTokens=${maxTokens}`)

  // 2. Build instructions (base prompt + skill)
  const skillContent = loadAgentSkill(agentType)
  const fullSystemPrompt = skillContent
    ? `${systemPrompt}\n\n---\n## 专业技能指南\n${skillContent}`
    : systemPrompt

  // Send starting event
  onProgress?.({
    type: 'starting',
    message: `${AGENT_NAMES[agentType]} 开始工作...`,
    timestamp: Date.now(),
    agentType,
    agentName: AGENT_NAMES[agentType],
    skillLoaded: !!skillContent,
  })

  // 3. Create tool definitions and executors for this agent type
  const openAITools = getOpenAIToolsForAgent(agentType)
  const executors = getExecutorsForAgent(agentType)

  // 4. Initialize messages
  const messages: ChatMessage[] = [
    { role: 'system', content: fullSystemPrompt },
    { role: 'user', content: message },
  ]

  const toolCallResults: Array<{
    name: string
    arguments: Record<string, unknown>
    result: unknown
  }> = []

  let steps = 0
  let finalText = ''
  let consecutiveUnknownToolCalls = 0 // Dead-loop detection: count consecutive "unknown" tool calls

  // 5. Agentic execution loop
  while (steps < MAX_STEPS) {
    steps++

    onProgress?.({
      type: 'thinking',
      message: `步骤 ${steps}: Agent 正在思考...`,
      timestamp: Date.now(),
      stepNumber: steps,
    })

    const response = await callLLMWithTools(messages, openAITools, {
      model,
      temperature,
      maxTokens,
      userId: options?.userId,
      onProgress,
      stepNumber: steps,
    })

    const assistantMessage = response.message
    const finishReason = response.finishReason

    // CRITICAL: Detect LLM output truncation (finish_reason === 'length')
    // This happens when max_tokens is too small for the tool call arguments
    if (finishReason === 'length') {
      onProgress?.({
        type: 'tool_error',
        message: `步骤 ${steps}: LLM输出被截断（达到max_tokens=${maxTokens}限制），正在分批重试...`,
        timestamp: Date.now(),
        stepNumber: steps,
      })

      // If there were partial tool calls, report truncation to the LLM
      if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
        // Add the truncated assistant message
        messages.push({
          role: 'assistant',
          content: assistantMessage.content || null,
          tool_calls: assistantMessage.tool_calls,
        })
        // Report truncation error for each tool call
        for (const tc of assistantMessage.tool_calls) {
          messages.push({
            role: 'tool',
            content: JSON.stringify({
              error: `⚠️ 你的输出被截断了！arguments不完整导致JSON解析失败。请将save_storyboards拆分为多次调用，每次保存3-5个分镜，并设置append=true（第一次除外）。`,
            }),
            tool_call_id: tc.id,
          })
        }
        continue // Let the LLM retry with smaller batches
      }

      // No tool calls, just text was truncated
      messages.push({
        role: 'assistant',
        content: assistantMessage.content || '',
      })
      messages.push({
        role: 'user',
        content: '⚠️ 你的上一次输出被截断了（达到max_tokens限制）。请继续输出，或者减少输出量，分批保存。',
      })
      continue
    }

    // Add assistant message to conversation
    const assistantChatMsg: ChatMessage = {
      role: 'assistant',
      content: assistantMessage.content || null,
    }
    if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      assistantChatMsg.tool_calls = assistantMessage.tool_calls
    }
    messages.push(assistantChatMsg)

    // If the LLM produced text output (alongside or without tool calls), emit it
    if (assistantMessage.content) {
      onProgress?.({
        type: 'text_output',
        message: `步骤 ${steps}: Agent 输出文本`,
        timestamp: Date.now(),
        textOutput: assistantMessage.content,
        stepNumber: steps,
      })
    }

    // Check if there are tool calls to execute
    if (
      !assistantMessage.tool_calls ||
      assistantMessage.tool_calls.length === 0
    ) {
      // No tool calls — check if the LLM should have called a tool but didn't
      // (e.g., the model doesn't support function calling, or it's generating
      // text output instead of tool calls)
      const hasToolDefinitions = openAITools.length > 0
      const isStoryboardBreaker = agentType === 'storyboard_breaker'
      const isScriptParser = agentType === 'script_parser'
      const shouldUseTools = hasToolDefinitions && (isStoryboardBreaker || isScriptParser) && steps < MAX_STEPS - 2
      const contentStr = assistantMessage.content || ''

      // If this is storyboard_breaker and it hasn't called any tools yet,
      // it might be outputting the storyboard as text instead of calling save_storyboards.
      // Nudge it to use the tool.
      if (shouldUseTools && toolCallResults.length === 0) {
        onProgress?.({
          type: 'thinking',
          message: `步骤 ${steps}: LLM未调用工具，正在引导使用工具...`,
          timestamp: Date.now(),
          stepNumber: steps,
        })
        // NOTE: Do NOT push assistant message again — it was already pushed above (line 654)
        const nudgeMessage = isScriptParser
          ? '⚠️ 你需要使用提供的工具来完成任务。请先调用 read_uploaded_text 工具读取上传的剧本文本，然后调用 save_parsed_script 工具保存解析结果。'
          : '⚠️ 你需要使用提供的工具来完成任务。请调用 save_storyboards 工具将分镜数据保存到数据库，而不是在文本中输出。如果你还没有读取上下文，请先调用 read_storyboard_context 工具。重要：请分批保存，每次3-5个镜头，使用append参数控制是否追加。'
        messages.push({
          role: 'user',
          content: nudgeMessage,
        })
        continue
      }

      // No more tool calls — we're done
      finalText = contentStr
      break
    }

    // 6. Execute each tool call
    for (const toolCall of assistantMessage.tool_calls) {
      const toolName = toolCall.function.name

      // Dead-loop detection: if tool name is "unknown", count consecutive occurrences
      if (toolName === 'unknown') {
        consecutiveUnknownToolCalls++
        if (consecutiveUnknownToolCalls >= 3) {
          // Too many consecutive unknown tool calls — break the loop
          console.error(`[executeAgent] Dead loop detected: ${consecutiveUnknownToolCalls} consecutive "unknown" tool calls. Breaking loop.`)
          onProgress?.({
            type: 'error',
            message: `检测到LLM工具调用异常（连续${consecutiveUnknownToolCalls}次工具名称为空），可能是模型不支持function calling。请尝试更换模型。`,
            timestamp: Date.now(),
            stepNumber: steps,
          })
          finalText = `⚠️ LLM工具调用异常：模型连续返回了${consecutiveUnknownToolCalls}次无效的工具调用（工具名称为空）。这通常意味着当前模型不完全支持function calling功能。建议：1) 更换为支持function calling的模型（如DeepSeek V4 Flash、GPT-4o等）；2) 检查API供应商配置是否正确。`
          // Break out of both the tool call loop and the step loop
          steps = MAX_STEPS + 1 // Force exit from while loop
          break
        }
      } else {
        consecutiveUnknownToolCalls = 0 // Reset counter on successful tool call
      }

      // Parse arguments — detect truncated JSON early
      let args: Record<string, unknown>
      try {
        args = JSON.parse(toolCall.function.arguments)
      } catch (parseErr) {
        // JSON parse failed — likely due to max_tokens truncation.
        // Give the LLM clear instructions to split into smaller batches.
        const isSaveStoryboards = toolName === 'save_storyboards'
        const parseErrorMsg = isSaveStoryboards
          ? `JSON解析失败：你的save_storyboards参数被截断了（输出超过max_tokens限制）。请将分镜拆分为多次调用，每次只保存3-5个分镜。第一次调用：save_storyboards(storyboards=[镜头1-5], append=false)，后续调用：save_storyboards(storyboards=[镜头6-10], append=true)，以此类推。解析错误: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`
          : `JSON解析失败：${parseErr instanceof Error ? parseErr.message : String(parseErr)}. 参数可能被截断。请减少数据量或分批调用。前50字符: ${toolCall.function.arguments.slice(0, 50)}...`
        messages.push({
          role: 'tool',
          content: JSON.stringify({ error: parseErrorMsg }),
          tool_call_id: toolCall.id,
        })
        toolCallResults.push({
          name: toolName,
          arguments: {},
          result: { error: parseErrorMsg },
        })
        onProgress?.({
          type: 'tool_error',
          message: `工具 ${toolName} 参数解析失败（可能被截断），已请求LLM分批重试`,
          timestamp: Date.now(),
          stepNumber: steps,
          toolResult: { name: toolName, error: parseErrorMsg },
        })
        continue // Skip executing the tool with invalid args
      }

      // Emit tool_call event
      onProgress?.({
        type: 'tool_call',
        message: `调用工具: ${toolName}`,
        timestamp: Date.now(),
        stepNumber: steps,
        toolCall: {
          id: toolCall.id,
          name: toolName,
          arguments: args,
        },
      })

      const executor: ToolExecutor | undefined = executors[toolName]

      if (!executor) {
        // Tool not found — report error back to LLM
        const errorMsg = `Tool "${toolName}" not found. Available tools: ${Object.keys(executors).join(', ')}`
        messages.push({
          role: 'tool',
          content: JSON.stringify({ error: errorMsg }),
          tool_call_id: toolCall.id,
        })
        toolCallResults.push({
          name: toolName,
          arguments: args,
          result: { error: errorMsg },
        })

        onProgress?.({
          type: 'tool_error',
          message: `工具 ${toolName} 未找到`,
          timestamp: Date.now(),
          stepNumber: steps,
          toolResult: {
            name: toolName,
            error: errorMsg,
          },
        })
        continue
      }

      try {
        // Execute the tool with captured context
        const result = await executor(args, { episodeId, dramaId })

        messages.push({
          role: 'tool',
          content: JSON.stringify(result),
          tool_call_id: toolCall.id,
        })

        toolCallResults.push({
          name: toolName,
          arguments: args,
          result,
        })

        // Summarize result for display
        const resultSummary = summarizeToolResult(toolName, result)

        onProgress?.({
          type: 'tool_result',
          message: `工具 ${toolName} 执行成功: ${resultSummary}`,
          timestamp: Date.now(),
          stepNumber: steps,
          toolResult: {
            name: toolName,
            result,
          },
        })

        // After successful save_storyboards with append=false, instruct the LLM
        // to continue with append=true for subsequent batches
        if (toolName === 'save_storyboards' && !args.append) {
          const savedCount = (result as any)?.count || 0
          const totalExpected = 15 // rough estimate, LLM knows the actual count
          if (savedCount < totalExpected) {
            messages.push({
              role: 'user',
              content: `✅ 已保存第一批 ${savedCount} 个分镜。请继续生成剩余分镜，调用 save_storyboards 时设置 append=true 来追加保存，不要覆盖已有数据。每次保存3-5个镜头即可。`,
            })
          }
        }
      } catch (error) {
        const errorMsg =
          error instanceof Error ? error.message : String(error)

        messages.push({
          role: 'tool',
          content: JSON.stringify({ error: errorMsg }),
          tool_call_id: toolCall.id,
        })

        toolCallResults.push({
          name: toolName,
          arguments: args,
          result: { error: errorMsg },
        })

        onProgress?.({
          type: 'tool_error',
          message: `工具 ${toolName} 执行失败: ${errorMsg}`,
          timestamp: Date.now(),
          stepNumber: steps,
          toolResult: {
            name: toolName,
            error: errorMsg,
          },
        })
      }
    }

    // Continue the loop — LLM will see tool results and decide next action
  }

  // If we hit max steps without a final text, use the last assistant message
  if (!finalText && steps >= MAX_STEPS) {
    finalText = '达到最大执行步骤数，Agent执行已终止。'
  }

  // Check if storyboard_breaker completed without actually saving
  if (agentType === 'storyboard_breaker') {
    const saveResult = toolCallResults.find(
      (r) => r.name === 'save_storyboards' && !(r.result as Record<string, unknown>)?.error
    )
    if (!saveResult) {
      finalText = '⚠️ 分镜拆解完成但未成功保存到数据库。' + finalText
    }
  }

  // Check if script_parser completed without saving parsed result
  if (agentType === 'script_parser') {
    const saveResult = toolCallResults.find(
      (r) => r.name === 'save_parsed_script' && !(r.result as Record<string, unknown>)?.error
    )
    if (!saveResult) {
      finalText = '⚠️ 剧本解析完成但未成功输出解析结果。' + finalText
    }
  }

  // NOTE: Do NOT emit 'completed' here — the stream route does that
  // with full result data. Duplicate events confuse the frontend.

  return {
    text: finalText,
    toolCalls: toolCallResults,
    steps,
  }
}

// ============================================================
// Summarize tool results for display
// ============================================================

function summarizeToolResult(toolName: string, result: unknown): string {
  if (!result || typeof result !== 'object') return String(result)

  const r = result as Record<string, unknown>

  switch (toolName) {
    case 'read_uploaded_text':
      return `读取到上传文本 (${String(r.charCount || 0)}字符)`
    case 'save_parsed_script':
      return r.success ? `剧本解析完成：${String((r.data as Record<string, unknown>)?.title || '')}，${String((r.data as Record<string, unknown>)?.totalEpisodes || 0)}集` : '解析失败'
    case 'read_episode_script':
      return `读取到剧本内容 (${String(r.rawContent || '').length}字原始内容, ${String(r.scriptContent || '').length}字已改写)`
    case 'save_script':
      return r.success ? '剧本已保存' : '保存失败'
    case 'read_script_for_extraction':
      return `读取到剧本内容 (${String(r.scriptContent || '').length}字)`
    case 'read_existing_characters':
      return `已有 ${Array.isArray(r) ? r.length : 0} 个角色`
    case 'read_existing_scenes':
      return `已有 ${Array.isArray(r) ? r.length : 0} 个场景`
    case 'save_characters': {
      const results = r.results as Array<{ name: string; action: string }> | undefined
      if (results) {
        const created = results.filter(x => x.action === 'created').length
        const merged = results.filter(x => x.action === 'merged').length
        return `处理 ${results.length} 个角色 (新建${created}, 合并${merged})`
      }
      return '角色保存完成'
    }
    case 'save_scenes': {
      const results = r.results as Array<{ location: string; action: string }> | undefined
      if (results) {
        const created = results.filter(x => x.action === 'created').length
        const merged = results.filter(x => x.action === 'merged').length
        return `处理 ${results.length} 个场景 (新建${created}, 合并${merged})`
      }
      return '场景保存完成'
    }
    case 'read_storyboard_context':
      return `读取到剧本、${String((r as any).characters?.length || 0)}个角色、${String((r as any).scenes?.length || 0)}个场景`
    case 'save_storyboards': {
      const count = r.count || 0
      const append = r.append ? '(追加模式)' : '(替换模式)'
      return r.success ? `已保存 ${count} 个分镜镜头${append}` : '保存失败'
    }
    case 'update_storyboard':
      return r.success ? `镜头已更新` : '更新失败'
    case 'get_characters':
      return `获取到 ${Array.isArray(r) ? r.length : 0} 个角色`
    case 'list_available_voices':
      return `可用音色 ${Array.isArray(r) ? r.length : 0} 个`
    case 'assign_voice':
      return r.success ? `已为"${r.character}"分配音色"${r.voiceName}"` : '分配失败'
    case 'read_characters':
      return `读取到 ${Array.isArray(r) ? r.length : 0} 个角色`
    case 'read_scenes':
      return `读取到 ${Array.isArray(r) ? r.length : 0} 个场景`
    case 'read_shots':
      return `读取到 ${Array.isArray(r) ? r.length : 0} 个分镜`
    case 'generate_character_prompt':
      return r.success ? `角色"${r.characterName}"提示词已生成` : '生成失败'
    case 'generate_scene_prompt':
      return r.success ? `场景"${r.sceneLocation}"提示词已生成` : '生成失败'
    case 'generate_grid_prompt':
      return r.success ? `镜头 ${r.shotNumber} 宫格提示词已生成` : '生成失败'
    default:
      return r.success ? '执行成功' : String(r.message || r.error || '完成')
  }
}
