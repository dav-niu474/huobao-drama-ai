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
  /** Event type: starting, thinking, tool_call, tool_result, tool_error, text_output, completed, error */
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
// LLM Call with Tool Support
// ============================================================

async function callLLMWithTools(
  messages: ChatMessage[],
  tools: ReturnType<typeof getOpenAIToolsForAgent>,
  options: {
    model?: string
    temperature?: number
    maxTokens?: number
    userId?: string
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

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => 'Unknown error')
    throw new Error(`LLM API error (${res.status}): ${text.slice(0, 300)}`)
  }

  const data = await res.json()
  const finishReason = data.choices?.[0]?.finish_reason ?? 'stop'
  return {
    message: data.choices?.[0]?.message ?? {
      role: 'assistant',
      content: '',
    },
    finishReason,
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
  // tool call contains full storyboard JSON (imagePrompt + videoPrompt per shot)
  // which can easily exceed 4096 tokens for 15-20 shots
  const defaultMaxTokens: Record<string, number> = {
    storyboard_breaker: 16384,
    extractor: 8192,
    script_rewriter: 8192,
  }
  const maxTokens = dbConfig?.maxTokens ?? defaultMaxTokens[agentType] ?? 4096

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
    })

    const assistantMessage = response.message
    const finishReason = response.finishReason

    // CRITICAL: Detect LLM output truncation (finish_reason === 'length')
    // This happens when max_tokens is too small for the tool call arguments
    if (finishReason === 'length') {
      onProgress?.({
        type: 'tool_error',
        message: `步骤 ${steps}: LLM输出被截断（达到max_tokens=${maxTokens}限制），请减少单次数据量或分批保存`,
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
              error: `⚠️ 你的输出被截断了！arguments不完整导致JSON解析失败。请将save_storyboards拆分为多次调用，每次保存3-5个分镜即可。`,
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
        content: '⚠️ 你的上一次输出被截断了（达到max_tokens限制）。请继续输出，或者减少输出量。',
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
      // No more tool calls — we're done
      finalText = assistantMessage.content || ''
      break
    }

    // 6. Execute each tool call
    for (const toolCall of assistantMessage.tool_calls) {
      const toolName = toolCall.function.name

      // Parse arguments — detect truncated JSON early
      let args: Record<string, unknown>
      try {
        args = JSON.parse(toolCall.function.arguments)
      } catch (parseErr) {
        // JSON parse failed — likely due to max_tokens truncation
        const parseErrorMsg = `JSON解析失败：${parseErr instanceof Error ? parseErr.message : String(parseErr)}. 参数可能被截断。请减少数据量或分批调用。前50字符: ${toolCall.function.arguments.slice(0, 50)}...`
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
          message: `工具 ${toolName} 参数解析失败: ${parseErrorMsg}`,
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
    case 'save_storyboards':
      return r.success ? `已保存 ${r.count} 个分镜镜头` : '保存失败'
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
