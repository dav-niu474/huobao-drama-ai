// ============================================================
// Agent Architecture — Type Definitions
// Inspired by Mastra framework patterns for AI agent orchestration
// in a drama production pipeline.
// ============================================================

export type AgentType =
  | 'script_parser'
  | 'script_rewriter'
  | 'extractor'
  | 'storyboard_breaker'
  | 'voice_assigner'
  | 'grid_prompt_generator' // deprecated: merged into storyboard_breaker

export interface ToolParameter {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object'
  description: string
  required?: boolean
  enum?: string[]
  /** For array type: describes the type of each element */
  items?: ToolParameter
  /** For object type: describes the properties of the object */
  properties?: Record<string, ToolParameter>
  /** For object type: which properties are required */
  requiredFields?: string[]
}

export interface ToolDefinition {
  name: string
  description: string
  parameters: Record<string, ToolParameter>
}

export interface ToolCall {
  id: string
  name: string
  arguments: Record<string, unknown>
}

export interface ToolResult {
  toolCallId: string
  result: unknown
}

export interface AgentConfig {
  agentType: AgentType
  systemPrompt: string
  model?: string
  temperature?: number
  maxTokens?: number
  isActive: boolean
}

export interface AgentExecutionResult {
  text: string
  toolCalls: Array<{
    name: string
    arguments: Record<string, unknown>
    result: unknown
  }>
  steps: number
}

export const AGENT_NAMES: Record<AgentType, string> = {
  script_parser: '剧本解析器',
  script_rewriter: '剧本改写专家',
  extractor: '角色场景提取器',
  storyboard_breaker: '分镜拆解+提示词专家',
  voice_assigner: '音色分配师',
  grid_prompt_generator: '提示词增强(已合并)',
}

export const AGENT_DESCRIPTIONS: Record<AgentType, string> = {
  script_parser:
    '从上传的剧本文本中智能识别剧本结构，拆分集数，推断题材和风格',
  script_rewriter:
    '将小说/故事原文改写为标准剧本格式，包含场景描述、对白和动作指示',
  extractor:
    '从剧本中智能提取角色信息和场景描述，支持去重和合并',
  storyboard_breaker:
    '将剧本拆解为分镜序列，同时生成专业级imagePrompt和videoPrompt，一步到位',
  voice_assigner:
    '为角色自动分配合适的TTS音色',
  grid_prompt_generator:
    '已合并到分镜拆解专家，单条提示词增强可直接使用分镜Agent',
}

export const ALL_AGENT_TYPES: AgentType[] = [
  'script_parser',
  'script_rewriter',
  'extractor',
  'storyboard_breaker',
  'voice_assigner',
  // grid_prompt_generator merged into storyboard_breaker
]
