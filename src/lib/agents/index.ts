// ============================================================
// Agent Architecture — Barrel Export
// Re-exports all public API from the agents module.
// ============================================================

export {
  AgentType,
  ALL_AGENT_TYPES,
  AGENT_NAMES,
  AGENT_DESCRIPTIONS,
  type ToolParameter,
  type ToolDefinition,
  type ToolCall,
  type ToolResult,
  type AgentConfig,
  type AgentExecutionResult,
} from './types'

export { DEFAULT_SYSTEM_PROMPTS } from './prompts'

export { executeAgent } from './factory'

export {
  AGENT_TOOLS,
  getOpenAIToolsForAgent,
  toolDefinitionToOpenAI,
} from './tools/index'

export {
  TOOL_EXECUTORS,
  getExecutorsForAgent,
  type ToolExecutor,
} from './tools/executors'

export {
  loadAgentSkill,
  getSkillFilePath,
  listAvailableSkills,
} from './skills'
