// ============================================================
// AI Service Configuration — Multi-Provider Architecture
// Supports NVIDIA, OpenAI, Stability AI, SiliconFlow,
// Volcengine, Fish Audio, z-ai-sdk, and custom providers.
// Provider credentials are loaded from DB (AiProvider table)
// with env var fallbacks.
// ============================================================

import { db } from '@/lib/db'

// ============================================================
// Provider definitions — preset providers per category
// ============================================================

export type AiCategory = 'llm' | 'image' | 'video' | 'tts'

export interface ModelOption {
  id: string       // Model identifier used in API calls
  name: string     // Display name
  tags?: string[]  // Tags like '推荐', '免费', '快速', '最新'
}

export interface ProviderPreset {
  provider: string
  name: string
  defaultBaseUrl: string
  defaultModel: string
  description: string
  envKey: string // env var name for API key fallback
  availableModels?: ModelOption[] // Selectable models for this provider
}

export const PROVIDER_PRESETS: Record<AiCategory, ProviderPreset[]> = {
  llm: [
    {
      provider: 'nvidia',
      name: 'NVIDIA NIM',
      defaultBaseUrl: 'https://integrate.api.nvidia.com/v1',
      defaultModel: 'z-ai/glm-5.1',
      description: 'NVIDIA NIM API — GLM5.1, DeepSeek V4, MiniMax, Llama, Qwen 等 70+ 模型',
      envKey: 'NVIDIA_API_KEY',
      availableModels: [
        { id: 'z-ai/glm-5.1', name: 'GLM-5.1', tags: ['推荐', '最新'] },
        { id: 'z-ai/glm5', name: 'GLM-5' },
        { id: 'z-ai/glm4.7', name: 'GLM-4.7' },
        { id: 'deepseek-ai/deepseek-v4-pro', name: 'DeepSeek V4 Pro', tags: ['推荐', '最新'] },
        { id: 'deepseek-ai/deepseek-v4-flash', name: 'DeepSeek V4 Flash', tags: ['快速'] },
        { id: 'deepseek-ai/deepseek-v3.2', name: 'DeepSeek V3.2' },
        { id: 'deepseek-ai/deepseek-v3.1-terminus', name: 'DeepSeek V3.1 Terminus' },
        { id: 'minimaxai/minimax-m2.7', name: 'MiniMax M2.7', tags: ['最新'] },
        { id: 'minimaxai/minimax-m2.5', name: 'MiniMax M2.5' },
        { id: 'qwen/qwen3.5-397b-a17b', name: 'Qwen 3.5 397B', tags: ['推荐', '最新'] },
        { id: 'qwen/qwen3.5-122b-a10b', name: 'Qwen 3.5 122B' },
        { id: 'qwen/qwen3-next-80b-a3b-instruct', name: 'Qwen 3 Next 80B' },
        { id: 'qwen/qwen3-next-80b-a3b-thinking', name: 'Qwen 3 Next Thinking 80B', tags: ['推理'] },
        { id: 'moonshotai/kimi-k2.5', name: 'Kimi K2.5', tags: ['最新'] },
        { id: 'moonshotai/kimi-k2-instruct', name: 'Kimi K2' },
        { id: 'moonshotai/kimi-k2-thinking', name: 'Kimi K2 Thinking', tags: ['推理'] },
        { id: 'meta/llama-4-maverick-17b-128e-instruct', name: 'Llama 4 Maverick', tags: ['最新'] },
        { id: 'meta/llama-3.3-70b-instruct', name: 'Llama 3.3 70B' },
        { id: 'meta/llama-3.1-405b-instruct', name: 'Llama 3.1 405B' },
        { id: 'meta/llama-3.1-70b-instruct', name: 'Llama 3.1 70B' },
        { id: 'meta/llama-3.1-8b-instruct', name: 'Llama 3.1 8B', tags: ['快速'] },
        { id: 'nvidia/llama-3.1-nemotron-ultra-253b-v1', name: 'Nemotron Ultra 253B', tags: ['推荐'] },
        { id: 'nvidia/llama-3.1-nemotron-70b-instruct', name: 'Nemotron 70B' },
        { id: 'nvidia/llama-3.3-nemotron-super-49b-v1.5', name: 'Nemotron Super 49B v1.5' },
        { id: 'mistralai/mistral-large-3-675b-instruct-2512', name: 'Mistral Large 3 675B', tags: ['最新'] },
        { id: 'mistralai/mistral-medium-3-instruct', name: 'Mistral Medium 3' },
        { id: 'mistralai/mistral-small-4-119b-2603', name: 'Mistral Small 4' },
        { id: 'mistralai/mixtral-8x22b-instruct-v0.1', name: 'Mixtral 8x22B' },
        { id: 'openai/gpt-oss-120b', name: 'GPT-OSS 120B' },
        { id: '01-ai/yi-large', name: 'Yi Large' },
        { id: 'bytedance/seed-oss-36b-instruct', name: 'Seed OSS 36B' },
      ],
    },
    {
      provider: 'openai',
      name: 'OpenAI',
      defaultBaseUrl: 'https://api.openai.com/v1',
      defaultModel: 'gpt-4o',
      description: 'OpenAI GPT-4o / GPT-4o-mini',
      envKey: 'OPENAI_API_KEY',
      availableModels: [
        { id: 'gpt-4o', name: 'GPT-4o', tags: ['推荐'] },
        { id: 'gpt-4o-mini', name: 'GPT-4o Mini', tags: ['快速', '经济'] },
        { id: 'gpt-4.1', name: 'GPT-4.1', tags: ['最新'] },
        { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini', tags: ['快速'] },
        { id: 'gpt-4.1-nano', name: 'GPT-4.1 Nano', tags: ['经济'] },
        { id: 'o3', name: 'o3', tags: ['推理'] },
        { id: 'o4-mini', name: 'o4-mini', tags: ['推理', '经济'] },
      ],
    },
    {
      provider: 'siliconflow',
      name: 'SiliconFlow',
      defaultBaseUrl: 'https://api.siliconflow.cn/v1',
      defaultModel: 'deepseek-ai/DeepSeek-V3',
      description: 'SiliconFlow — DeepSeek, Qwen, Llama',
      envKey: 'SILICONFLOW_API_KEY',
      availableModels: [
        { id: 'deepseek-ai/DeepSeek-V3', name: 'DeepSeek V3', tags: ['推荐'] },
        { id: 'deepseek-ai/DeepSeek-R1', name: 'DeepSeek R1', tags: ['推理'] },
        { id: 'Qwen/Qwen2.5-72B-Instruct', name: 'Qwen 2.5 72B' },
        { id: 'Qwen/Qwen2.5-32B-Instruct', name: 'Qwen 2.5 32B' },
        { id: 'meta-llama/Meta-Llama-3.1-70B-Instruct', name: 'Llama 3.1 70B' },
        { id: 'meta-llama/Meta-Llama-3.1-8B-Instruct', name: 'Llama 3.1 8B', tags: ['快速'] },
      ],
    },
    {
      provider: 'deepseek',
      name: 'DeepSeek',
      defaultBaseUrl: 'https://api.deepseek.com/v1',
      defaultModel: 'deepseek-chat',
      description: 'DeepSeek official API',
      envKey: 'DEEPSEEK_API_KEY',
      availableModels: [
        { id: 'deepseek-chat', name: 'DeepSeek Chat', tags: ['推荐'] },
        { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner', tags: ['推理'] },
      ],
    },
    {
      provider: 'custom',
      name: '自定义 OpenAI 兼容',
      defaultBaseUrl: '',
      defaultModel: '',
      description: '任何 OpenAI 兼容接口（中转站、私有部署等）',
      envKey: 'CUSTOM_LLM_API_KEY',
    },
  ],
  image: [
    {
      provider: 'openai',
      name: 'OpenAI',
      defaultBaseUrl: 'https://api.openai.com/v1',
      defaultModel: 'gpt-image-1',
      description: 'OpenAI 图片生成 — 只需提供 API Key 即可使用',
      envKey: 'OPENAI_API_KEY',
      availableModels: [
        { id: 'gpt-image-1', name: 'GPT Image 1', tags: ['推荐', '最新'] },
        { id: 'dall-e-3', name: 'DALL·E 3' },
      ],
    },
    {
      provider: 'chatfire',
      name: 'Chatfire 统一网关',
      defaultBaseUrl: 'https://api.chatfire.site',
      defaultModel: 'gemini-3-pro-image-preview',
      description: 'Chatfire 统一网关 — 一个Key代理 Gemini/Seedream/OpenAI/MiniMax，国内可用',
      envKey: 'CHATFIRE_API_KEY',
      availableModels: [
        { id: 'gemini-3-pro-image-preview', name: 'Gemini 3 Pro Image', tags: ['推荐', '最新'] },
        { id: 'gemini-3.1-flash-image-preview', name: 'Gemini 3.1 Flash Image', tags: ['最新', '快速'] },
        { id: 'imagen-4.0-generate-001', name: 'Imagen 4.0', tags: ['最新'] },
        { id: 'imagen-4.0-fast-generate-001', name: 'Imagen 4.0 Fast', tags: ['快速'] },
        { id: 'gemini-2.5-flash-preview-image-generation', name: 'Gemini 2.5 Flash Image' },
        { id: 'doubao-seedream-5-0-260128', name: 'Seedream 5.0 (Chatfire代理)', tags: ['最新'] },
        { id: 'doubao-seedream-4-5-251128', name: 'Seedream 4.5 (Chatfire代理)' },
        { id: 'gpt-image-1', name: 'GPT Image 1' },
        { id: 'dall-e-3', name: 'DALL·E 3' },
        { id: 'MiniMax-Image-01', name: 'MiniMax Image 01' },
      ],
    },
    {
      provider: 'gemini',
      name: 'Google Gemini / Imagen',
      defaultBaseUrl: 'https://generativelanguage.googleapis.com',
      defaultModel: 'gemini-3-pro-image-preview',
      description: 'Google Gemini + Imagen 图片生成 — 只需提供 API Key 即可使用',
      envKey: 'GEMINI_API_KEY',
      availableModels: [
        { id: 'gemini-3-pro-image-preview', name: 'Gemini 3 Pro Image', tags: ['推荐', '最新'] },
        { id: 'gemini-3.1-flash-image-preview', name: 'Gemini 3.1 Flash Image', tags: ['最新', '快速'] },
        { id: 'imagen-4.0-ultra-generate-001', name: 'Imagen 4.0 Ultra', tags: ['高清'] },
        { id: 'imagen-4.0-generate-001', name: 'Imagen 4.0' },
        { id: 'imagen-4.0-fast-generate-001', name: 'Imagen 4.0 Fast', tags: ['快速'] },
        { id: 'gemini-2.5-flash-preview-image-generation', name: 'Gemini 2.5 Flash Image' },
        { id: 'gemini-2.0-flash-exp-image-generation', name: 'Gemini 2.0 Flash Image' },
      ],
    },
    {
      provider: 'minimax',
      name: 'MiniMax',
      defaultBaseUrl: 'https://api.minimax.chat',
      defaultModel: 'MiniMax-Image-01',
      description: 'MiniMax 图片生成 — 只需提供 API Key 即可使用，支持参考图',
      envKey: 'MINIMAX_API_KEY',
      availableModels: [
        { id: 'MiniMax-Image-01', name: 'MiniMax Image 01', tags: ['推荐'] },
      ],
    },
    {
      provider: 'volcengine',
      name: '火山引擎 Seedream',
      defaultBaseUrl: 'https://visual.volcengineapi.com',
      defaultModel: 'doubao-seedream-5-0-260128',
      description: '火山引擎 Seedream 图片生成 — 只需提供 API Key 即可使用',
      envKey: 'VOLCENGINE_API_KEY',
      availableModels: [
        { id: 'doubao-seedream-5-0-260128', name: 'Seedream 5.0', tags: ['推荐', '最新'] },
        { id: 'doubao-seedream-4-5-251128', name: 'Seedream 4.5' },
        { id: 'doubao-seedream-4-0-250828', name: 'Seedream 4.0' },
      ],
    },
    {
      provider: 'ali',
      name: '阿里百炼 万相',
      defaultBaseUrl: 'https://dashscope.aliyuncs.com',
      defaultModel: 'wan2.7-image-pro',
      description: '阿里百炼万相图片生成 — 只需提供 API Key 即可使用',
      envKey: 'ALI_API_KEY',
      availableModels: [
        { id: 'wan2.7-image-pro', name: '万相 2.7 Pro', tags: ['推荐', '最新'] },
        { id: 'wan2.7-image', name: '万相 2.7' },
        { id: 'wan2.6-t2i', name: '万相 2.6' },
        { id: 'wan2.5-t2i-preview', name: '万相 2.5 Preview' },
        { id: 'wan2.2-t2i-plus', name: '万相 2.2 Plus' },
        { id: 'wan2.2-t2i-flash', name: '万相 2.2 Flash', tags: ['快速'] },
        { id: 'wanx2.1-t2i-turbo', name: '万相 2.1 Turbo', tags: ['快速'] },
        { id: 'wanx2.1-t2i-plus', name: '万相 2.1 Plus' },
        { id: 'flux-dev', name: 'FLUX Dev' },
        { id: 'flux-schnell', name: 'FLUX Schnell', tags: ['快速'] },
      ],
    },
    {
      provider: 'custom',
      name: '自定义图片接口',
      defaultBaseUrl: '',
      defaultModel: '',
      description: '自定义 OpenAI 兼容图片生成接口',
      envKey: 'CUSTOM_IMAGE_API_KEY',
    },
  ],
  video: [
    {
      provider: 'minimax',
      name: 'MiniMax 海螺 AI',
      defaultBaseUrl: 'https://api.minimax.chat',
      defaultModel: 'minimax-hailuo-2.3',
      description: 'MiniMax 海螺 AI 视频生成 — 只需提供 API Key 即可使用',
      envKey: 'MINIMAX_API_KEY',
      availableModels: [
        { id: 'minimax-hailuo-2.3', name: '海螺 2.3', tags: ['推荐', '最新'] },
        { id: 'minimax-hailuo-2.3-fast', name: '海螺 2.3 Fast', tags: ['最新', '快速'] },
        { id: 'minimax-hailuo-02', name: '海螺 02' },
        { id: 't2v-01', name: 'T2V-01 文生视频' },
        { id: 't2v-01-director', name: 'T2V-01 Director 导演模式', tags: ['专业'] },
      ],
    },
    {
      provider: 'volcengine',
      name: '火山引擎 Seedance',
      defaultBaseUrl: 'https://visual.volcengineapi.com',
      defaultModel: 'doubao-seedance-2-0-260128',
      description: '火山引擎 Seedance 视频生成 — 只需提供 API Key 即可使用',
      envKey: 'VOLCENGINE_API_KEY',
      availableModels: [
        { id: 'doubao-seedance-2-0-260128', name: 'Seedance 2.0', tags: ['推荐', '最新'] },
        { id: 'doubao-seedance-2-0-fast-260128', name: 'Seedance 2.0 Fast', tags: ['最新', '快速'] },
        { id: 'doubao-seedance-1-5-pro-251215', name: 'Seedance 1.5 Pro' },
        { id: 'doubao-seedance-1-0-pro-250528', name: 'Seedance 1.0 Pro' },
        { id: 'doubao-seedance-1-0-lite-i2v-250428', name: 'Seedance 1.0 Lite I2V', tags: ['快速'] },
      ],
    },
    {
      provider: 'vidu',
      name: 'Vidu',
      defaultBaseUrl: 'https://api.vidu.cn',
      defaultModel: 'viduq3-pro',
      description: 'Vidu 视频生成 — 只需提供 API Key 即可使用',
      envKey: 'VIDU_API_KEY',
      availableModels: [
        { id: 'viduq3-pro', name: 'Vidu Q3 Pro', tags: ['推荐', '最新'] },
        { id: 'vidu2.0', name: 'Vidu 2.0' },
        { id: 'viduq2-pro-fast', name: 'Vidu Q2 Pro Fast', tags: ['快速'] },
        { id: 'viduq2-pro', name: 'Vidu Q2 Pro' },
        { id: 'viduq2-turbo', name: 'Vidu Q2 Turbo', tags: ['快速'] },
        { id: 'viduq1', name: 'Vidu Q1' },
      ],
    },
    {
      provider: 'ali',
      name: '阿里百炼 万相视频',
      defaultBaseUrl: 'https://dashscope.aliyuncs.com',
      defaultModel: 'wan2.7-i2v',
      description: '阿里百炼万相视频生成 — 只需提供 API Key 即可使用',
      envKey: 'ALI_API_KEY',
      availableModels: [
        { id: 'wan2.7-i2v', name: '万相 2.7 I2V', tags: ['推荐', '最新'] },
        { id: 'wan2.7-t2v', name: '万相 2.7 T2V', tags: ['最新'] },
        { id: 'wan2.7-r2v', name: '万相 2.7 R2V 参考视频', tags: ['最新'] },
        { id: 'wan2.6-i2v', name: '万相 2.6 I2V' },
        { id: 'wan2.6-i2v-flash', name: '万相 2.6 I2V Flash', tags: ['快速'] },
        { id: 'wan2.5-i2v-preview', name: '万相 2.5 I2V Preview' },
        { id: 'wan2.2-i2v-plus', name: '万相 2.2 I2V Plus', tags: ['高清'] },
        { id: 'wan2.2-i2v-flash', name: '万相 2.2 I2V Flash', tags: ['快速'] },
        { id: 'wanx2.1-kf2v-plus', name: '万相 2.1 KF2V Plus' },
      ],
    },
    {
      provider: 'custom',
      name: '自定义视频接口',
      defaultBaseUrl: '',
      defaultModel: '',
      description: '自定义视频生成接口',
      envKey: 'CUSTOM_VIDEO_API_KEY',
    },
  ],
  tts: [
    {
      provider: 'minimax',
      name: 'MiniMax',
      defaultBaseUrl: 'https://api.minimax.chat',
      defaultModel: 'speech-2.8-hd',
      description: 'MiniMax 语音合成 — 只需提供 API Key 即可使用，高质量中文语音',
      envKey: 'MINIMAX_API_KEY',
      availableModels: [
        { id: 'speech-2.8-hd', name: 'Speech 2.8 HD', tags: ['推荐', '高清'] },
        { id: 'speech-2.6', name: 'Speech 2.6', tags: ['快速'] },
      ],
    },
    {
      provider: 'openai',
      name: 'OpenAI',
      defaultBaseUrl: 'https://api.openai.com/v1',
      defaultModel: 'tts-1',
      description: 'OpenAI 语音合成 — 只需提供 API Key 即可使用（海外可用）',
      envKey: 'OPENAI_API_KEY',
      availableModels: [
        { id: 'tts-1', name: 'TTS-1', tags: ['推荐'] },
        { id: 'tts-1-hd', name: 'TTS-1 HD', tags: ['高清'] },
        { id: 'gpt-4o-mini-tts', name: 'GPT-4o Mini TTS', tags: ['最新'] },
      ],
    },
    {
      provider: 'chatfire',
      name: 'Chatfire TTS',
      defaultBaseUrl: 'https://api.chatfire.site',
      defaultModel: 'speech-2.8-hd',
      description: 'Chatfire TTS 网关 — 只需提供 API Key 即可使用（MiniMax 兼容，国内可用）',
      envKey: 'CHATFIRE_API_KEY',
      availableModels: [
        { id: 'speech-2.8-hd', name: 'Speech 2.8 HD', tags: ['推荐', '高清'] },
        { id: 'speech-2.6', name: 'Speech 2.6', tags: ['快速'] },
      ],
    },
    {
      provider: 'ali',
      name: '阿里百炼 Qwen TTS',
      defaultBaseUrl: 'https://dashscope.aliyuncs.com',
      defaultModel: 'qwen3-tts-vd-2026-01-26',
      description: '阿里百炼 Qwen TTS — 只需提供 API Key 即可使用',
      envKey: 'ALI_API_KEY',
      availableModels: [
        { id: 'qwen3-tts-vd-2026-01-26', name: 'Qwen3 TTS', tags: ['推荐', '最新'] },
      ],
    },
    {
      provider: 'fish-audio',
      name: 'Fish Audio',
      defaultBaseUrl: 'https://api.fish.audio',
      defaultModel: 'fish-speech-1.5',
      description: 'Fish Audio 语音合成 — 只需提供 API Key 即可使用，支持声音克隆',
      envKey: 'FISH_AUDIO_API_KEY',
      availableModels: [
        { id: 'fish-speech-1.5', name: 'Fish Speech 1.5', tags: ['推荐', '最新'] },
      ],
    },
    {
      provider: 'custom',
      name: '自定义 TTS 接口',
      defaultBaseUrl: '',
      defaultModel: '',
      description: '自定义 TTS 接口',
      envKey: 'CUSTOM_TTS_API_KEY',
    },
  ],
}

// ============================================================
// DB-backed provider config
// ============================================================

export interface ProviderConfig {
  category: AiCategory
  provider: string
  name: string
  apiKey: string
  baseUrl: string
  model: string
  isActive: boolean
}

/**
 * Load the active provider config for a given category from DB.
 * Falls back to env vars if no DB config is active.
 */
export async function getActiveProvider(category: AiCategory): Promise<ProviderConfig | null> {
  // Try DB first
  const dbProvider = await db.aiProvider.findFirst({
    where: { category, isActive: true },
    orderBy: { sort: 'asc' },
  })

  // Check if the provider is explicitly set as active in DB
  // Some providers (like z-ai-sdk) don't need an API key
  const noKeyProviders: string[] = []

  if (dbProvider) {
    // Use DB record if it's active — even if apiKey is empty
    // (apiKey may come from env vars, or the provider may not need one)
    // Find preset for this provider to get defaults and env var fallbacks
    const preset = PROVIDER_PRESETS[category]?.find((p) => p.provider === dbProvider.provider)
    const needsNoKey = noKeyProviders.includes(dbProvider.provider)
    const hasApiKey = Boolean(dbProvider.apiKey)
    const envApiKey = preset?.envKey ? (process.env[preset.envKey] || '') : ''
    // Only use this DB record if it has an apiKey, can fall back to env, or doesn't need one
    if (hasApiKey || envApiKey || needsNoKey) {
      return {
        category,
        provider: dbProvider.provider,
        name: dbProvider.name || preset?.name || dbProvider.provider,
        apiKey: dbProvider.apiKey || envApiKey,
        baseUrl: dbProvider.baseUrl || preset?.defaultBaseUrl || '',
        model: dbProvider.model || preset?.defaultModel || '',
        isActive: true,
      }
    }
  }

  // Fallback: check env vars (only for providers that have env keys)
  const presets = PROVIDER_PRESETS[category]
  for (const preset of presets) {
    if (preset.envKey && process.env[preset.envKey]) {
      return {
        category,
        provider: preset.provider,
        name: preset.name,
        apiKey: process.env[preset.envKey]!,
        baseUrl: preset.defaultBaseUrl,
        model: preset.defaultModel,
        isActive: true,
      }
    }
  }

  return null
}

/**
 * Get the active provider for a specific user.
 * Priority: User's own key → Admin's global default key → Env var fallback.
 * This is the correct function to use in all AI generation endpoints.
 */
export async function getActiveProviderForUser(
  category: AiCategory,
  userId: string
): Promise<ProviderConfig | null> {
  // 1. Check if the user has their own active provider for this category
  const userProvider = await db.userProvider.findFirst({
    where: { userId, category, isActive: true },
  })

  if (userProvider && userProvider.apiKey) {
    const preset = PROVIDER_PRESETS[category]?.find((p) => p.provider === userProvider.provider)
    return {
      category,
      provider: userProvider.provider,
      name: preset?.name || userProvider.provider,
      apiKey: userProvider.apiKey,
      baseUrl: userProvider.baseUrl || preset?.defaultBaseUrl || '',
      model: userProvider.model || preset?.defaultModel || '',
      isActive: true,
    }
  }

  // 2. Fall back to the global/admin active provider
  return getActiveProvider(category)
}

/**
 * Get all provider configs for a user (for settings UI).
 * Non-admin users only see their own keys + whether a default is available (no actual key values).
 */
export async function getAllProvidersForUser(
  category: AiCategory,
  userId: string,
  isAdmin: boolean
): Promise<ProviderConfig[]> {
  if (isAdmin) {
    // Admin sees everything (existing behavior)
    return getAllProviders(category)
  }

  // Non-admin: return only user's own providers + preset info (no admin key values)
  const userProviders = await db.userProvider.findMany({
    where: { userId, category },
    orderBy: { createdAt: 'asc' },
  })

  const presets = PROVIDER_PRESETS[category]
  const globalActive = await db.aiProvider.findFirst({
    where: { category, isActive: true },
  })

  const result: ProviderConfig[] = []

  for (const preset of presets) {
    const userRecord = userProviders.find((p) => p.provider === preset.provider)
    // If user has their own key, show it
    if (userRecord) {
      result.push({
        category,
        provider: preset.provider,
        name: preset.name,
        apiKey: userRecord.apiKey,
        baseUrl: userRecord.baseUrl || preset.defaultBaseUrl,
        model: userRecord.model || preset.defaultModel,
        isActive: userRecord.isActive,
      })
    } else {
      // No user key — show the preset with empty apiKey
      // If there's a global active provider for this preset, show it as "has default" but hide the key
      result.push({
        category,
        provider: preset.provider,
        name: preset.name,
        apiKey: '',
        baseUrl: preset.defaultBaseUrl,
        model: preset.defaultModel,
        isActive: globalActive?.provider === preset.provider,
      })
    }
  }

  // Add any custom user providers not in presets
  for (const up of userProviders) {
    if (!presets.some((p) => p.provider === up.provider)) {
      result.push({
        category,
        provider: up.provider,
        name: up.provider,
        apiKey: up.apiKey,
        baseUrl: up.baseUrl,
        model: up.model,
        isActive: up.isActive,
      })
    }
  }

  return result
}

/**
 * Check if a global (admin) default provider is active for a category.
 * Used to inform non-admin users that they can use the platform default.
 */
export async function hasGlobalDefaultProvider(category: AiCategory): Promise<boolean> {
  const provider = await getActiveProvider(category)
  return provider !== null
}

/**
 * Get all provider configs for a category (for settings UI).
 */
export async function getAllProviders(category: AiCategory): Promise<ProviderConfig[]> {
  const dbProviders = await db.aiProvider.findMany({
    where: { category },
    orderBy: { sort: 'asc' },
  })

  // Merge with presets
  const presets = PROVIDER_PRESETS[category]
  const result: ProviderConfig[] = []

  for (const preset of presets) {
    const existing = dbProviders.find((p) => p.provider === preset.provider)
    // Use || instead of ?? because Prisma stores '' (empty string) not null
    // ?? treats '' as a real value and won't fall back to preset defaults
    result.push({
      category,
      provider: preset.provider,
      name: existing?.name || preset.name,
      apiKey: existing?.apiKey || (preset.envKey ? (process.env[preset.envKey] || '') : ''),
      baseUrl: existing?.baseUrl || preset.defaultBaseUrl,
      model: existing?.model || preset.defaultModel,
      isActive: existing?.isActive ?? false,
    })
  }

  // Add any custom DB providers not in presets
  for (const dbP of dbProviders) {
    if (!presets.some((p) => p.provider === dbP.provider)) {
      result.push({
        category,
        provider: dbP.provider,
        name: dbP.name,
        apiKey: dbP.apiKey,
        baseUrl: dbP.baseUrl,
        model: dbP.model,
        isActive: dbP.isActive,
      })
    }
  }

  return result
}

/**
 * Save provider config to DB (upsert).
 */
export async function saveProviderConfig(config: ProviderConfig): Promise<void> {
  await db.aiProvider.upsert({
    where: {
      category_provider: {
        category: config.category,
        provider: config.provider,
      },
    },
    create: {
      category: config.category,
      provider: config.provider,
      name: config.name,
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      model: config.model,
      isActive: config.isActive,
    },
    update: {
      name: config.name,
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      model: config.model,
      isActive: config.isActive,
    },
  })
}

/**
 * Get existing provider config from DB (for merge during save).
 * Returns null if not found in DB.
 */
export async function getExistingProviderConfig(
  category: AiCategory,
  provider: string
): Promise<ProviderConfig | null> {
  const dbProvider = await db.aiProvider.findUnique({
    where: {
      category_provider: { category, provider },
    },
  })
  if (!dbProvider) return null
  return {
    category,
    provider: dbProvider.provider,
    name: dbProvider.name,
    apiKey: dbProvider.apiKey,
    baseUrl: dbProvider.baseUrl,
    model: dbProvider.model,
    isActive: dbProvider.isActive,
  }
}

/**
 * Set only one active provider per category (deactivate others).
 */
export async function setActiveProvider(category: AiCategory, provider: string): Promise<void> {
  await db.aiProvider.updateMany({
    where: { category },
    data: { isActive: false },
  })
  await db.aiProvider.upsert({
    where: {
      category_provider: {
        category,
        provider,
      },
    },
    create: {
      category,
      provider,
      name: PROVIDER_PRESETS[category]?.find((p) => p.provider === provider)?.name || provider,
      apiKey: '',
      baseUrl: PROVIDER_PRESETS[category]?.find((p) => p.provider === provider)?.defaultBaseUrl || '',
      model: PROVIDER_PRESETS[category]?.find((p) => p.provider === provider)?.defaultModel || '',
      isActive: true,
    },
    update: {
      isActive: true,
    },
  })
}

// ============================================================
// AI Client — unified interface with multi-provider support
// ============================================================

export const aiClient = {
  // ---- Chat / LLM ----

  async chatCompletion(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    options?: {
      temperature?: number
      max_tokens?: number
      model?: string
    }
  ) {
    const provider = await getActiveProvider('llm')
    if (!provider) {
      throw new Error('未配置 LLM 供应商。请在设置中配置 API Key。')
    }

    const body = {
      model: options?.model || provider.model,
      messages,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.max_tokens ?? 4096,
    }

    const url = provider.baseUrl.endsWith('/chat/completions')
      ? provider.baseUrl
      : `${provider.baseUrl.replace(/\/$/, '')}/chat/completions`

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${provider.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => 'Unknown error')
      throw new Error(`LLM API error (${res.status}): ${text.slice(0, 300)}`)
    }

    return res.json()
  },

  async chat(
    prompt: string,
    systemPrompt?: string,
    options?: { temperature?: number; max_tokens?: number; model?: string }
  ): Promise<string> {
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = []
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt })
    }
    messages.push({ role: 'user', content: prompt })

    const response = await this.chatCompletion(messages, options)
    return response.choices?.[0]?.message?.content ?? ''
  },

  async chatJson<T = unknown>(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    options?: { temperature?: number; max_tokens?: number; model?: string }
  ): Promise<T> {
    const hasJsonInstruction = messages.some(
      (m) =>
        m.role === 'system' &&
        (m.content.toLowerCase().includes('json') ||
          m.content.toLowerCase().includes('json格式'))
    )

    const finalMessages = hasJsonInstruction
      ? messages
      : [
          ...messages,
          {
            role: 'system' as const,
            content:
              'IMPORTANT: You must respond with valid JSON only. ' +
              'Do not include any prose, explanations, or markdown formatting. ' +
              'Return the raw JSON object or array.',
          },
        ]

    const response = await this.chatCompletion(finalMessages, {
      ...options,
      temperature: options?.temperature ?? 0.3,
    })

    const content = response.choices?.[0]?.message?.content ?? ''
    return parseJsonFromLlmResponse<T>(content)
  },

  // ---- Image Generation ----

  async generateImage(
    prompt: string,
    negativePrompt?: string,
    options?: { width?: number; height?: number; size?: string; referenceImages?: string[] }
  ): Promise<string> {
    const provider = await getActiveProvider('image')
    if (!provider) {
      throw new Error('未配置图片生成供应商。请在设置中配置 API Key。')
    }

    // All providers use the adapter pattern
    const { getImageAdapter } = await import('@/lib/adapters/image')
    const adapter = getImageAdapter(provider.provider)
    const config = { baseUrl: provider.baseUrl, apiKey: provider.apiKey, model: provider.model }
    const size = options?.size ?? '1024x1024'

    const req = adapter.buildGenerateRequest(config, { prompt, size, negativePrompt, referenceImages: options?.referenceImages })
    const res = await fetch(req.url, { method: req.method, headers: req.headers, body: JSON.stringify(req.body) })

    if (!res.ok) {
      const text = await res.text().catch(() => 'Unknown error')
      throw new Error(`图片生成API错误 (${res.status}): ${text.slice(0, 300)}`)
    }

    const result = await res.json()
    const parsed = adapter.parseGenerateResponse(result)

    // Sync response with URL
    if (!parsed.isAsync && parsed.imageUrl) {
      const imgRes = await fetch(parsed.imageUrl)
      const buffer = Buffer.from(await imgRes.arrayBuffer())
      return buffer.toString('base64')
    }

    // Sync response with base64
    if (!parsed.isAsync && parsed.imageBase64) {
      return parsed.imageBase64
    }

    // Async response — return taskId for client-side polling
    // For Vercel compatibility, return immediately with taskId
    // Client will poll /api/ai/poll-status for results
    if (parsed.isAsync && parsed.taskId) {
      const err = new Error(`ASYNC_TASK:${parsed.taskId}`)
      err.name = 'AsyncTaskError'
      throw err
    }

    throw new Error('图片生成返回数据为空')
  },

  async _pollImageTask(
    adapter: import('@/lib/adapters/image').ImageProviderAdapter,
    config: { baseUrl: string; apiKey: string; model: string },
    taskId: string,
    maxPolls = 24,
    interval = 5000
  ): Promise<string> {
    const pollReq = adapter.buildPollRequest(config, taskId)
    if (!pollReq) {
      throw new Error('该供应商不支持轮询查询，请使用Webhook模式')
    }

    for (let i = 0; i < maxPolls; i++) {
      await new Promise((r) => setTimeout(r, interval))
      const pollRes = await fetch(pollReq.url, { method: pollReq.method, headers: pollReq.headers })
      const pollData = await pollRes.json()
      const pollParsed = adapter.parsePollResponse(pollData)

      if (pollParsed.status === 'completed') {
        if (pollParsed.imageUrl) {
          const imgRes = await fetch(pollParsed.imageUrl)
          const buffer = Buffer.from(await imgRes.arrayBuffer())
          return buffer.toString('base64')
        }
        if (pollParsed.imageBase64) return pollParsed.imageBase64
        throw new Error('图片生成完成但未返回图片数据')
      }
      if (pollParsed.status === 'failed') {
        throw new Error(pollParsed.error || '图片生成失败')
      }
    }
    throw new Error('图片生成超时')
  },

  async generateCharacterPortrait(
    description: string,
    style?: string,
    characterName?: string,
    personality?: string,
    referenceImages?: string[]
  ): Promise<string> {
    // Production-quality character portrait prompt with 6+ dimensions
    // Based on grid_prompt_generator SKILL methodology
    const styleTag = style || 'cinematic'
    const personalityExpression = personality
      ? `expressing ${personality} personality,`
      : ''

    const portraitPrompt = [
      `Professional cinematic character portrait, ${styleTag} aesthetic,`,
      characterName ? `${characterName} —` : '',
      description,
      personalityExpression,
      'dramatic Rembrandt lighting with rim light accent,',
      'rule of thirds composition, centered framing,',
      'shot on ARRI ALEXA 65, f/1.4 aperture, shallow depth of field,',
      'ultra-high detail skin texture, 8K resolution, film grain texture,',
      'character concept art, consistent art style',
    ]
      .filter(Boolean)
      .join(' ')

    const negativePrompt =
      'blurry, low quality, distorted face, extra limbs, deformed, watermark, text, signature, cartoon, anime'

    return this.generateImage(portraitPrompt, negativePrompt, {
      width: 1024,
      height: 1024,
      referenceImages,
    })
  },

  async generateStoryboardFrame(
    description: string,
    atmosphere?: string,
    shotType?: string,
    cameraAngle?: string,
    style?: string,
    referenceImages?: string[]
  ): Promise<string> {
    // Production-quality storyboard frame prompt with 6+ dimensions
    const styleTag = style || 'cinematic'
    const atmosphereTag = atmosphere || 'dramatic'
    const shotTag = shotType || 'medium shot'
    const angleTag = cameraAngle || 'eye-level'

    const framePrompt = [
      `Cinematic film still, ${styleTag} visual style,`,
      description,
      `${atmosphereTag} atmosphere,`,
      `${shotTag}, ${angleTag} angle,`,
      'professional cinematography, shallow depth of field,',
      'shot on RED V-RAPTOR, anamorphic lens,',
      'professional color grading, warm tones,',
      '8K, photorealistic, film grain',
    ]
      .filter(Boolean)
      .join(' ')

    const negativePrompt =
      'blurry, low quality, amateur, cartoon, anime, watermark, text overlay, signature'

    return this.generateImage(framePrompt, negativePrompt, {
      width: 1344,
      height: 768,
      referenceImages,
    })
  },

  async generateSceneImage(
    location: string,
    timeOfDay?: string,
    style?: string,
    weather?: string,
    referenceImages?: string[]
  ): Promise<string> {
    // Production-quality scene/establishing shot prompt with 6+ dimensions
    const styleTag = style || 'cinematic'
    const timeTag = timeOfDay || 'day'
    const weatherTag = weather || ''

    // Map time of day to lighting
    const lightingMap: Record<string, string> = {
      morning: 'soft warm golden light, sunrise glow',
      day: 'bright natural daylight, clear sky',
      afternoon: 'warm afternoon sunlight, long shadows',
      dusk: 'golden hour warm amber tones, sunset glow',
      night: 'cool blue moonlight, dark atmosphere',
      evening: 'warm indoor lighting, soft ambient glow',
    }
    const lighting = lightingMap[timeTag.toLowerCase()] || 'natural lighting'

    const scenePrompt = [
      `Establishing shot, ${styleTag} cinematography,`,
      `${location},`,
      `${lighting},`,
      weatherTag ? `${weatherTag},` : '',
      'no characters, no people, no figures,',
      'wide angle lens, deep depth of field,',
      'professional film production quality,',
      'rich atmospheric details, environmental storytelling,',
      '8K, photorealistic, consistent art style',
    ]
      .filter(Boolean)
      .join(' ')

    const negativePrompt =
      'blurry, low quality, amateur, people, figures, characters, watermark, text overlay, signature'

    return this.generateImage(scenePrompt, negativePrompt, {
      width: 1344,
      height: 768,
      referenceImages,
    })
  },

  // ---- Video Generation ----

  async generateVideo(
    storyboardId: string,
    prompt: string,
    firstFrameUrl?: string
  ): Promise<void> {
    const provider = await getActiveProvider('video')
    if (!provider) {
      throw new Error('未配置视频生成供应商。请在设置中配置 API Key。')
    }

    // Update status
    await db.storyboard.update({
      where: { id: storyboardId },
      data: { status: 'processing' },
    })

    try {
      let videoUrl = ''

      // All providers use the adapter pattern
      const { getVideoAdapter } = await import('@/lib/adapters/video')
      const adapter = getVideoAdapter(provider.provider)
      const config = { baseUrl: provider.baseUrl, apiKey: provider.apiKey, model: provider.model }

      const req = adapter.buildGenerateRequest(config, { prompt, firstFrameUrl, duration: 5 })
      const res = await fetch(req.url, { method: req.method, headers: req.headers, body: JSON.stringify(req.body) })

      if (!res.ok) {
        const text = await res.text().catch(() => 'Unknown error')
        throw new Error(`视频生成API错误 (${res.status}): ${text.slice(0, 300)}`)
      }

      const result = await res.json()
      const parsed = adapter.parseGenerateResponse(result)

      if (parsed.videoUrl) {
        videoUrl = parsed.videoUrl
      } else if (parsed.isAsync && parsed.taskId) {
        // For Vercel compatibility, return taskId for client-side polling
        // Save taskId to storyboard so client can poll
        await db.storyboard.update({
          where: { id: storyboardId },
          data: { status: 'processing' },
        })
        const err = new Error(`ASYNC_TASK:${parsed.taskId}`)
        err.name = 'AsyncTaskError'
        throw err
      }

      await db.storyboard.update({
        where: { id: storyboardId },
        data: { videoUrl, status: 'completed' },
      })
    } catch (error) {
      await db.storyboard.update({
        where: { id: storyboardId },
        data: { status: 'failed' },
      })
      throw error
    }
  },

  async _pollVideoTask(
    adapter: import('@/lib/adapters/video').VideoProviderAdapter,
    config: { baseUrl: string; apiKey: string; model: string },
    taskId: string,
    maxPolls = 36,
    interval = 10000
  ): Promise<string> {
    const pollReq = adapter.buildPollRequest(config, taskId)
    if (!pollReq) {
      throw new Error('该供应商不支持轮询查询，请使用Webhook模式')
    }

    for (let i = 0; i < maxPolls; i++) {
      await new Promise((r) => setTimeout(r, interval))
      const pollRes = await fetch(pollReq.url, { method: pollReq.method, headers: pollReq.headers })
      const pollData = await pollRes.json()
      const pollParsed = adapter.parsePollResponse(pollData)

      if (pollParsed.status === 'completed') {
        if (pollParsed.videoUrl) return pollParsed.videoUrl
        throw new Error('视频生成完成但未返回视频URL')
      }
      if (pollParsed.status === 'failed') {
        throw new Error(pollParsed.error || '视频生成失败')
      }
    }
    throw new Error('视频生成超时')
  },

  // ---- TTS Generation ----

  async generateTts(
    storyboardId: string,
    text: string,
    voiceId?: string,
    voiceStyle?: string
  ): Promise<void> {
    const provider = await getActiveProvider('tts')
    if (!provider) {
      throw new Error('未配置语音合成供应商。请在设置中配置 API Key。')
    }

    await db.storyboard.update({
      where: { id: storyboardId },
      data: { status: 'processing' },
    })

    try {
      let audioDataUrl = ''

      // All providers use the adapter pattern
      const { getTTSAdapter } = await import('@/lib/adapters/tts')
      const adapter = getTTSAdapter(provider.provider)
      const config = { baseUrl: provider.baseUrl, apiKey: provider.apiKey, model: provider.model }

      const req = adapter.buildGenerateRequest(config, { text, voiceId, speed: 1.0 })
      const res = await fetch(req.url, { method: req.method, headers: req.headers, body: JSON.stringify(req.body) })

      if (!res.ok) {
        const text = await res.text().catch(() => 'Unknown error')
        throw new Error(`TTS API错误 (${res.status}): ${text.slice(0, 300)}`)
      }

      // Try JSON first, then binary
      const contentType = res.headers.get('content-type') || ''
      if (contentType.includes('application/json')) {
        const jsonResult = await res.json()
        const parsed = adapter.parseResponse(jsonResult)
        if (parsed.audioHex) {
          // MiniMax/Chatfire returns hex-encoded audio
          const buffer = Buffer.from(parsed.audioHex, 'hex')
          const base64 = buffer.toString('base64')
          audioDataUrl = `data:audio/${parsed.format || 'mp3'};base64,${base64}`
        } else if (parsed.audioBase64) {
          audioDataUrl = `data:audio/${parsed.format || 'wav'};base64,${parsed.audioBase64}`
        }
      } else {
        // Binary audio response (OpenAI, etc.)
        const buffer = Buffer.from(await res.arrayBuffer())
        const base64 = buffer.toString('base64')
        audioDataUrl = `data:audio/wav;base64,${base64}`
      }

      await db.storyboard.update({
        where: { id: storyboardId },
        data: { ttsAudioUrl: audioDataUrl, status: 'completed' },
      })
    } catch (error) {
      await db.storyboard.update({
        where: { id: storyboardId },
        data: { status: 'failed' },
      })
      throw error
    }
  },

  // ---- Connection Test ----

  async testConnection(category: AiCategory): Promise<{
    success: boolean
    provider?: string
    model?: string
    error?: string
    responsePreview?: string
  }> {
    try {
      const provider = await getActiveProvider(category)
      if (!provider) {
        return {
          success: false,
          error: `未配置 ${category.toUpperCase()} 供应商，请在设置中配置 API Key`,
        }
      }

      if (category === 'llm') {
        const response = await this.chat('Say "OK" and nothing else.', undefined, {
          max_tokens: 10,
          temperature: 0,
        })
        return {
          success: true,
          provider: provider.name,
          model: provider.model,
          responsePreview: response.slice(0, 100),
        }
      }

      if (category === 'image') {
        // Test image generation with a minimal request
        const base64 = await this.generateImage('a single red dot on white background')
        const preview = base64 ? `图片生成成功，数据大小: ${(base64.length / 1024).toFixed(1)}KB` : '图片生成返回空'
        return {
          success: true,
          provider: provider.name,
          model: provider.model,
          responsePreview: preview,
        }
      }

      if (category === 'tts') {
        // Use adapter pattern for TTS test
        const { getTTSAdapter } = await import('@/lib/adapters/tts')
        const adapter = getTTSAdapter(provider.provider)
        const config = { baseUrl: provider.baseUrl, apiKey: provider.apiKey, model: provider.model }
        const req = adapter.buildGenerateRequest(config, { text: '你好', voiceId: undefined, speed: 1.0 })
        const res = await fetch(req.url, { method: req.method, headers: req.headers, body: JSON.stringify(req.body) })
        if (!res.ok) {
          const text = await res.text().catch(() => '')
          throw new Error(`TTS API error (${res.status}): ${text.slice(0, 200)}`)
        }
        const contentType = res.headers.get('content-type') || ''
        let preview = ''
        if (contentType.includes('application/json')) {
          const jsonResult = await res.json()
          const parsed = adapter.parseResponse(jsonResult)
          preview = parsed.audioBase64
            ? `语音合成成功，格式: ${parsed.format}`
            : '语音合成返回数据为空'
        } else {
          const buffer = Buffer.from(await res.arrayBuffer())
          preview = `语音合成成功，数据大小: ${(buffer.length / 1024).toFixed(1)}KB`
        }
        return {
          success: true,
          provider: provider.name,
          model: provider.model,
          responsePreview: preview,
        }
      }

      if (category === 'video') {
        // Video generation is async and takes too long for a connection test
        // Just verify the provider config is set
        return {
          success: true,
          provider: provider.name,
          model: provider.model,
          responsePreview: `${provider.name} 视频生成已配置（实际生成需较长时间，跳过测试）`,
        }
      }

      return {
        success: true,
        provider: provider.name,
        model: provider.model,
        responsePreview: `${provider.name} 已配置`,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  },
}

// ============================================================
// JSON Response Parsing (same as before)
// ============================================================

export function parseJsonFromLlmResponse<T = unknown>(text: string): T {
  try {
    return JSON.parse(text) as T
  } catch {
    // continue
  }

  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/)
  if (fenceMatch?.[1]) {
    try {
      return JSON.parse(fenceMatch[1]) as T
    } catch {
      // continue
    }
  }

  const objectStart = text.indexOf('{')
  const arrayStart = text.indexOf('[')

  let jsonStart = -1
  if (objectStart !== -1 && arrayStart !== -1) {
    jsonStart = Math.min(objectStart, arrayStart)
  } else if (objectStart !== -1) {
    jsonStart = objectStart
  } else if (arrayStart !== -1) {
    jsonStart = arrayStart
  }

  if (jsonStart !== -1) {
    const opener = text[jsonStart]
    const closer = opener === '{' ? '}' : ']'
    let depth = 0
    let inString = false
    let escape = false

    for (let i = jsonStart; i < text.length; i++) {
      const ch = text[i]

      if (escape) {
        escape = false
        continue
      }

      if (ch === '\\' && inString) {
        escape = true
        continue
      }

      if (ch === '"') {
        inString = !inString
        continue
      }

      if (inString) continue

      if (ch === opener) depth++
      if (ch === closer) depth--

      if (depth === 0) {
        try {
          return JSON.parse(text.slice(jsonStart, i + 1)) as T
        } catch {
          break
        }
      }
    }
  }

  throw new Error(
    `Failed to parse JSON from LLM response. First 500 characters:\n${text.slice(0, 500)}`
  )
}

// ============================================================
// Preset system prompts for common drama-production tasks
// ============================================================

export const AI_SYSTEM_PROMPTS = {
  SCRIPT_REWRITE: `你是一位专业的短剧编剧。你的任务是将原始故事内容改写为格式化的短剧剧本。

改写规则：
1. 保留核心情节和角色关系
2. 增强画面感，将叙述性文字转化为可视化场景描写
3. 用对话驱动情节，减少旁白
4. 每场戏控制在30-60秒
5. 不写镜头语言（景别、角度等），这些属于分镜步骤

格式化剧本格式：
## S编号 | 内景/外景 · 地点 | 时间段

动作描写自然段

角色名：（状态/表情）台词内容

请直接输出改写后的剧本，不要添加其他说明。`,

  EXTRACT: `你是一位专业的短剧分析师。你的任务是从剧本中提取角色和场景信息。

请从剧本中提取所有角色和场景，以JSON格式返回：
{
  "characters": [
    { "name": "角色名", "role": "protagonist/antagonist/supporting/extras", "gender": "male/female/unknown", "appearance": "外貌描写（300-500字详细描述，包含性别、年龄、体型、面部特征、发型、着装）", "personality": "性格特点描述" }
  ],
  "scenes": [
    { "location": "地点名", "timeOfDay": "day/night/dawn/dusk", "description": "场景描述", "prompt": "用于AI图片生成的英文提示词（纯背景，不含人物）" }
  ]
}

只返回JSON，不要添加其他内容。`,

  STORYBOARD: `你是一位专业的短剧分镜师。你的任务是将剧本拆解为分镜镜头。

每个镜头包含以下字段：
- shotNumber: 镜头序号
- title: 镜头标题（3-5字）
- shotType: 景别（close-up/medium/wide/extreme-close-up/medium-close-up/full-shot/long-shot/over-the-shoulder/point-of-view）
- cameraAngle: 角度（eye-level/high-angle/low-angle/dutch-angle/birds-eye/worms-eye）
- cameraMovement: 运镜（static/pan-left/pan-right/tilt-up/tilt-down/zoom-in/zoom-out/dolly-in/dolly-out/tracking/crane-up/handheld）
- action: 画面动作描述（中文）
- dialogue: 对话内容
- dialogueChar: 说话角色名
- duration: 镜头时长（秒，3-15秒）
- imagePrompt: 静态画面英文提示词（用于首帧图片生成，详细描述场景、角色、光照、构图）
- videoPrompt: 视频英文提示词（描述镜头运动和角色动作变化）
- atmosphere: 氛围描述（中文，如紧张、温馨、悬疑等）

请以JSON数组格式返回分镜列表。只返回JSON，不要添加其他内容。`,

  CREATIVE: `你是一位专注于短剧创作的AI助手，擅长写作、分析和创意决策。你的回答应该富有想象力但专业，提供详细、可操作的建议。`,
} as const
