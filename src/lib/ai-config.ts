// ============================================================
// AI Service Configuration — Multi-Provider Architecture
// Supports NVIDIA, OpenAI, Stability AI, SiliconFlow,
// Volcengine, Fish Audio, z-ai-sdk, and custom providers.
// Provider credentials are loaded from DB (AiProvider table)
// with env var fallbacks.
// ============================================================

import { db } from '@/lib/db'

// Re-export types and presets from the client-safe module
export type { AiCategory, ModelOption, ProviderPreset } from '@/lib/provider-presets'
export { PROVIDER_PRESETS } from '@/lib/provider-presets'

// Import for internal use
import { PROVIDER_PRESETS, type AiCategory, type ProviderPreset } from '@/lib/provider-presets'

// ============================================================
// Reference Image Pre-fetching (for providers needing base64 inline data)
// ============================================================

/**
 * Fetch reference image URLs and convert them to base64 data.
 * Handles data: URLs, HTTP URLs, and internal /api/files/ paths.
 * Used by adapters like Gemini that need base64 inlineData in the request.
 */
async function fetchReferenceImagesAsBase64(
  urls: string[]
): Promise<Array<{ base64: string; mimeType: string }>> {
  const results: Array<{ base64: string; mimeType: string }> = []

  for (const url of urls.slice(0, 3)) { // Limit to 3 reference images max
    try {
      if (url.startsWith('data:')) {
        // Data URL: extract base64 and mime type directly
        const match = url.match(/^data:(image\/[^;]+);base64,(.+)$/)
        if (match) {
          results.push({ base64: match[2], mimeType: match[1] })
        }
      } else {
        // HTTP URL or /api/files/ path — fetch and convert
        const fetchUrl = url.startsWith('/api/files/')
          ? `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}${url}`
          : url
        const res = await fetch(fetchUrl, { signal: AbortSignal.timeout(10000) })
        if (!res.ok) continue
        const contentType = res.headers.get('content-type') || 'image/png'
        const buffer = Buffer.from(await res.arrayBuffer())
        results.push({
          base64: buffer.toString('base64'),
          mimeType: contentType.split(';')[0],
        })
      }
    } catch (err) {
      console.warn('Failed to fetch reference image:', url, err)
    }
  }

  return results
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
  const noKeyProviders: string[] = ['z-ai-sdk']

  if (dbProvider) {
    // Use DB record if it's active — even if apiKey is empty
    // (apiKey may come from env vars, or the provider may not need one)
    // Find preset for this provider to get defaults and env var fallbacks
    const preset = PROVIDER_PRESETS[category]?.find((p) => p.provider === dbProvider.provider)
    const needsNoKey = noKeyProviders.includes(dbProvider.provider)
    const hasApiKey = Boolean(dbProvider.apiKey)
    const envApiKey = preset?.envKey ? (process.env[preset.envKey] || process.env[preset.envKey.toLowerCase()] || '') : ''
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
  // Supports both uppercase and lowercase env var names
  const presets = PROVIDER_PRESETS[category]
  for (const preset of presets) {
    if (!preset.envKey) continue
    const apiKey = process.env[preset.envKey]
      || process.env[preset.envKey.toLowerCase()]
      || process.env[preset.envKey.toUpperCase()]
      || (preset.provider === 'openrouter' ? process.env['OpenRouter_API_KEY'] : '')
      || (preset.provider === 'sensenova' ? process.env['SENSENOVA_KEY'] : '')
      || (preset.provider === 'mimo' ? process.env['MIMO_API_KEY'] : '')
      || ''
    if (apiKey) {
      return {
        category,
        provider: preset.provider,
        name: preset.name,
        apiKey,
        baseUrl: preset.defaultBaseUrl,
        model: preset.defaultModel,
        isActive: true,
      }
    }
  }

  return null
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
 * Load the active provider config for a given category, with per-user override.
 * Resolution order:
 *   1. UserProvider (isActive=true) with non-empty apiKey → use user's own key
 *   2. If UserProvider exists but apiKey is empty → skip, fall through
 *   3. getActiveProvider() → AiProvider DB + env var fallback (platform default)
 *
 * This ensures:
 *   - Users with their own key always use it (priority)
 *   - Users without their own key automatically use the platform default
 *   - Platform API keys are NEVER leaked through the UserProvider path
 */
export async function getActiveProviderForUser(category: AiCategory, userId?: string): Promise<ProviderConfig | null> {
  // 1. If userId provided, check for user-level active provider first
  if (userId) {
    const userProvider = await db.userProvider.findFirst({
      where: { userId, category, isActive: true },
    })
    // Only use UserProvider if it has a non-empty apiKey
    // If apiKey is empty, skip it and fall through to global getActiveProvider()
    // This ensures platform keys are never leaked through the user path
    if (userProvider && userProvider.apiKey) {
      const preset = PROVIDER_PRESETS[category]?.find((p) => p.provider === userProvider.provider)
      return {
        category,
        provider: userProvider.provider,
        name: preset?.name ?? userProvider.provider,
        apiKey: userProvider.apiKey,
        baseUrl: userProvider.baseUrl || preset?.defaultBaseUrl || '',
        model: userProvider.model || preset?.defaultModel || '',
        isActive: true,
      }
    }
  }
  // 2. Fallback to global getActiveProvider (AiProvider DB + env vars)
  return getActiveProvider(category)
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
    // Support both uppercase and lowercase env var names
    const envApiKey = (() => {
      if (!preset.envKey) return ''
      const val = process.env[preset.envKey] || process.env[preset.envKey.toLowerCase()] || process.env[preset.envKey.toUpperCase()]
      if (val) return val
      // Fallback: try OpenRouter_API_KEY for openrouter provider
      if (preset.provider === 'openrouter' && process.env['OpenRouter_API_KEY']) {
        return process.env['OpenRouter_API_KEY']
      }
      // Fallback: try SENSENOVA_KEY for sensenova provider (legacy env var name)
      if (preset.provider === 'sensenova' && process.env['SENSENOVA_KEY']) {
        return process.env['SENSENOVA_KEY']
      }
      // Fallback: try MIMO_API_KEY for mimo provider (case-insensitive)
      if (preset.provider === 'mimo' && process.env['MIMO_API_KEY']) {
        return process.env['MIMO_API_KEY']
      }
      return ''
    })()
    result.push({
      category,
      provider: preset.provider,
      name: existing?.name || preset.name,
      apiKey: existing?.apiKey || envApiKey,
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

/**
 * Auto-initialize default providers from environment variables.
 * Called on first deployment or when no providers are configured.
 * Only activates providers that have API keys available (from DB or env vars).
 */
export async function autoInitProviders(): Promise<string[]> {
  const initialized: string[] = []

  // Check if any LLM provider is already active in DB
  const activeLlm = await db.aiProvider.findFirst({
    where: { category: 'llm', isActive: true },
  })

  // If no LLM is active, auto-configure from env var
  if (!activeLlm) {
    // Try SenseNova first (商汤日日新 — DeepSeek V4 Flash 限时免费)
    const sensenovaKey = process.env.SENSENOVA_KEY || process.env.sensenova_key || ''
    const sensenovaPreset = PROVIDER_PRESETS.llm.find((p) => p.provider === 'sensenova')

    if (sensenovaPreset && sensenovaKey) {
      await saveProviderConfig({
        category: 'llm',
        provider: 'sensenova',
        name: sensenovaPreset.name,
        apiKey: sensenovaKey,
        baseUrl: sensenovaPreset.defaultBaseUrl,
        model: sensenovaPreset.defaultModel,
        isActive: true,
      })
      initialized.push(`llm:sensenova (${sensenovaPreset.name})`)
    } else {
      // Fallback: try OpenRouter
      const openrouterKey = process.env.OPENROUTER_API_KEY || process.env.OpenRouter_API_KEY || ''
      const preset = PROVIDER_PRESETS.llm.find((p) => p.provider === 'openrouter')

      if (preset && openrouterKey) {
        await saveProviderConfig({
          category: 'llm',
          provider: 'openrouter',
          name: preset.name,
          apiKey: openrouterKey,
          baseUrl: preset.defaultBaseUrl,
          model: preset.defaultModel,
          isActive: true,
        })
        initialized.push(`llm:openrouter (${preset.name})`)
      }
    }
  }

  // Auto-init other categories if no active provider exists and env keys are set
  const otherCategories: AiCategory[] = ['image', 'video', 'tts']
  for (const cat of otherCategories) {
    const activeCat = await db.aiProvider.findFirst({
      where: { category: cat, isActive: true },
    })
    if (activeCat) continue

    // Check each preset for this category
    for (const preset of PROVIDER_PRESETS[cat]) {
      if (preset.envKey && process.env[preset.envKey]) {
        await saveProviderConfig({
          category: cat,
          provider: preset.provider,
          name: preset.name,
          apiKey: process.env[preset.envKey]!,
          baseUrl: preset.defaultBaseUrl,
          model: preset.defaultModel,
          isActive: true,
        })
        initialized.push(`${cat}:${preset.provider} (${preset.name})`)
        break // Only activate the first one with an env key
      }
    }
  }

  return initialized
}

// ============================================================
// AI Client — unified interface with multi-provider support
// ============================================================

export const aiClient = {
  // Optional userId override — set before calling methods to use user-level keys
  _userId: undefined as string | undefined,

  // ---- Chat / LLM ----

  async chatCompletion(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    options?: {
      temperature?: number
      max_tokens?: number
      model?: string
    }
  ) {
    const provider = await getActiveProviderForUser('llm', this._userId)
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
    const provider = await getActiveProviderForUser('image', this._userId)
    if (!provider) {
      throw new Error('未配置图片生成供应商。请在设置中配置 API Key。')
    }

    // All providers use the adapter pattern
    const { getImageAdapter } = await import('@/lib/adapters/image')
    const adapter = getImageAdapter(provider.provider)
    const config = { baseUrl: provider.baseUrl, apiKey: provider.apiKey, model: provider.model }
    const size = options?.size ?? '1024x1024'

    // Pre-fetch reference images as base64 for providers that need inline data (e.g., Gemini)
    let referenceImagesData: Array<{ base64: string; mimeType: string }> | undefined
    if (options?.referenceImages?.length && provider.provider === 'gemini') {
      referenceImagesData = await fetchReferenceImagesAsBase64(options.referenceImages)
    }

    const req = adapter.buildGenerateRequest(config, {
      prompt,
      size,
      negativePrompt,
      referenceImages: options?.referenceImages,
      referenceImagesData,
    })
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
    const provider = await getActiveProviderForUser('video', this._userId)
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
  ): Promise<string> {
    const provider = await getActiveProviderForUser('tts', this._userId)
    if (!provider) {
      throw new Error('未配置语音合成供应商。请在设置中配置 API Key。')
    }

    try {
      let audioDataUrl = ''

      // All providers use the adapter pattern
      const { getTTSAdapter } = await import('@/lib/adapters/tts')
      const adapter = getTTSAdapter(provider.provider)
      const config = { baseUrl: provider.baseUrl, apiKey: provider.apiKey, model: provider.model }

      const req = adapter.buildGenerateRequest(config, { text, voiceId, speed: 1.0, voiceStyle })
      console.log(`[generateTts] provider=${provider.provider}, model=${config.model}, voiceId=${voiceId}, text=${text.slice(0, 30)}...`)
      const res = await fetch(req.url, { method: req.method, headers: req.headers, body: JSON.stringify(req.body), signal: AbortSignal.timeout(60_000) })

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

      return audioDataUrl
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
      const provider = await getActiveProviderForUser(category, this._userId)
      if (!provider) {
        return {
          success: false,
          error: `未配置 ${category.toUpperCase()} 供应商，请在设置中配置 API Key`,
        }
      }

      if (category === 'llm') {
        // Detect TTS model being tested under LLM category (e.g., mimo-v2.5-tts)
        // TTS models require assistant message + audio parameter
        const isTtsModel = /tts|speech/i.test(provider.model)
        if (isTtsModel) {
          // Use TTS adapter for TTS models even when tested under LLM
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
              ? `语音合成测试成功，格式: ${parsed.format}`
              : '语音合成返回数据为空'
          } else {
            const buffer = Buffer.from(await res.arrayBuffer())
            preview = `语音合成测试成功，数据大小: ${(buffer.length / 1024).toFixed(1)}KB`
          }
          return {
            success: true,
            provider: provider.name,
            model: provider.model,
            responsePreview: preview,
          }
        }

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
