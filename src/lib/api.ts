import type {
  Drama,
  DramaDetail,
  Episode,
  EpisodeDetail,
  Character,
  Scene,
  Storyboard,
} from './store'

// ============================================================
// Helper — typed fetch wrapper
// ============================================================

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options)
  if (!res.ok) {
    const text = await res.text().catch(() => 'Unknown error')
    throw new Error(`API ${res.status}: ${text}`)
  }
  return res.json() as Promise<T>
}

// ============================================================
// Provider config types
// ============================================================

export type AiCategory = 'llm' | 'image' | 'video' | 'tts'

export interface ProviderConfig {
  category: AiCategory
  provider: string
  name: string
  apiKey: string
  baseUrl: string
  model: string
  isActive: boolean
}

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
  envKey: string
  availableModels?: ModelOption[] // Selectable models for this provider
}

export interface SettingsResponse {
  providers: Record<AiCategory, ProviderConfig[]>
  presets: Record<AiCategory, ProviderPreset[]>
}

// ============================================================
// API client
// ============================================================

// ---- Database initialization ----
let _dbInitialized = false
let _dbInitPromise: Promise<void> | null = null

async function ensureDbReady(): Promise<void> {
  if (_dbInitialized) return
  if (_dbInitPromise) return _dbInitPromise

  _dbInitPromise = (async () => {
    // Try up to 2 times to initialize the database
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const res = await fetch('/api/migrate', { method: 'POST' })
        if (res.ok) {
          const data = await res.json()
          console.log(`[api] Database ready (attempt ${attempt}):`, data.message)
          _dbInitialized = true
          return
        }
        if (attempt < 2) {
          console.warn(`[api] Migration attempt ${attempt} failed, retrying...`)
          await new Promise((r) => setTimeout(r, 1000 * attempt))
        }
      } catch (err) {
        console.warn(`[api] Database init attempt ${attempt} error:`, err)
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, 1000 * attempt))
        }
      }
    }
    // Even if migration fails, don't block the app
    _dbInitialized = true
  })()

  return _dbInitPromise
}

export const api = {
  // Initialize database (call on app startup)
  init: ensureDbReady,

  // ---- Dramas ----
  dramas: {
    list: () =>
      request<{ dramas: Drama[] }>('/api/dramas').then((r) => r.dramas),

    get: (id: string) =>
      request<DramaDetail>(`/api/dramas/${id}`),

    create: (data: Partial<Drama>) =>
      request<Drama>('/api/dramas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),

    update: (id: string, data: Partial<Drama>) =>
      request<Drama>(`/api/dramas/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),

    delete: (id: string) =>
      fetch(`/api/dramas/${id}`, { method: 'DELETE' }).then((r) => {
        if (!r.ok) throw new Error(`Delete drama failed: ${r.status}`)
      }),
  },

  // ---- Episodes ----
  episodes: {
    list: (dramaId: string) =>
      request<{ episodes: Episode[] }>(`/api/dramas/${dramaId}/episodes`).then(
        (r) => r.episodes
      ),

    get: (id: string) =>
      request<EpisodeDetail>(`/api/episodes/${id}`),

    create: (dramaId: string, data: Partial<Episode>) =>
      request<Episode>(`/api/dramas/${dramaId}/episodes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),

    update: (id: string, data: Partial<Episode>) =>
      request<Episode>(`/api/episodes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),

    delete: (id: string) =>
      fetch(`/api/episodes/${id}`, { method: 'DELETE' }).then((r) => {
        if (!r.ok) throw new Error(`Delete episode failed: ${r.status}`)
      }),

    // Pipeline status - detailed progress for each production step (11-step format)
    // Backend returns { steps: { rawContent: {...} }, summary: {...} }
    // Frontend expects { pipeline: { raw_content: {...} }, completedSteps, progressPercent }
    pipelineStatus: async (episodeId: string) => {
      const raw = await request<Record<string, unknown>>(`/api/episodes/${episodeId}/pipeline-status`)

      // Map backend status to frontend status
      const mapStatus = (s: string): 'pending' | 'active' | 'completed' => {
        if (s === 'done') return 'completed'
        if (s === 'partial') return 'active'
        return 'pending'
      }

      // Backend returns pipeline with stage-prefixed keys (e.g. 'script:raw', 'prod:chars')
      const rawPipeline = (raw.pipeline ?? {}) as Record<string, { status: string; completed: number; total: number; label?: string }>
      const summary = (raw.summary ?? {}) as Record<string, unknown>

      const pipeline: Record<string, { status: 'pending' | 'active' | 'completed'; completed: number; total: number; label?: string }> = {}

      for (const [key, stepData] of Object.entries(rawPipeline)) {
        pipeline[key] = {
          status: mapStatus(stepData.status),
          completed: stepData.completed,
          total: stepData.total,
          label: stepData.label,
        }
      }

      return {
        pipeline,
        steps: Object.keys(pipeline),
        completedSteps: (summary.completedSteps as number) ?? (raw.completedSteps as number) ?? 0,
        totalSteps: (summary.totalSteps as number) ?? (raw.totalSteps as number) ?? 12,
        progressPercent: (summary.overallProgress as number) ?? (raw.progressPercent as number) ?? 0,
      }
    },

    // Get compose data for client-side compositing
    compose: (episodeId: string, storyboardId: string) =>
      request<{
        storyboardId: string
        shotNumber: number
        title: string
        videoUrl: string
        audioUrl: string | null
        dialogue: string | null
        dialogueChar: string | null
        duration: number
        composeInstructions: {
          hasVideo: boolean
          hasAudio: boolean
          hasSubtitle: boolean
          steps: string[]
        }
      }>(`/api/episodes/${episodeId}/compose?storyboardId=${storyboardId}`),

    // Save composed result URL
    saveComposed: (episodeId: string, storyboardId: string, composedUrl: string) =>
      request<{ storyboard: Storyboard }>(`/api/episodes/${episodeId}/compose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storyboardId, composedUrl }),
      }),
  },

  // ---- Characters ----
  characters: {
    list: (dramaId: string) =>
      request<{ characters: Character[] }>(
        `/api/dramas/${dramaId}/characters`
      ).then((r) => r.characters),

    create: (dramaId: string, data: Partial<Character>) =>
      request<Character>(`/api/dramas/${dramaId}/characters`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
  },

  // ---- Character Appearances ----
  appearances: {
    list: (characterId: string) =>
      request<{ appearances: any[] }>(`/api/characters/${characterId}/appearances`).then(r => r.appearances),

    create: (characterId: string, data: { label?: string; description?: string; imagePrompt?: string; generateImage?: boolean }) =>
      request<any>(`/api/characters/${characterId}/appearances`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),

    get: (characterId: string, appearanceId: string) =>
      request<any>(`/api/characters/${characterId}/appearances/${appearanceId}`),

    update: (characterId: string, appearanceId: string, data: { label?: string; selectedIndex?: number; imageUrl?: string }) =>
      request<any>(`/api/characters/${characterId}/appearances/${appearanceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),

    delete: (characterId: string, appearanceId: string) =>
      fetch(`/api/characters/${characterId}/appearances/${appearanceId}`, { method: 'DELETE' }).then(r => {
        if (!r.ok) throw new Error(`Delete appearance failed: ${r.status}`)
      }),
  },

  // ---- Scenes ----
  scenes: {
    list: (dramaId: string) =>
      request<{ scenes: Scene[] }>(`/api/dramas/${dramaId}/scenes`).then(
        (r) => r.scenes
      ),

    create: (dramaId: string, data: Partial<Scene>) =>
      request<Scene>(`/api/dramas/${dramaId}/scenes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
  },

  // ---- Scene Images ----
  sceneImages: {
    list: (sceneId: string) =>
      request<{ images: any[] }>(`/api/scenes/${sceneId}/images`).then(r => r.images),

    create: (sceneId: string, data: { timeOfDay?: string; angle?: string; description?: string; generateImage?: boolean }) =>
      request<any>(`/api/scenes/${sceneId}/images`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),

    update: (sceneId: string, imageId: string, data: { isSelected?: boolean; description?: string }) =>
      request<any>(`/api/scenes/${sceneId}/images/${imageId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),

    delete: (sceneId: string, imageId: string) =>
      fetch(`/api/scenes/${sceneId}/images/${imageId}`, { method: 'DELETE' }).then(r => {
        if (!r.ok) throw new Error(`Delete scene image failed: ${r.status}`)
      }),
  },

  // ---- Storyboards ----
  storyboards: {
    list: (episodeId: string) =>
      request<{ storyboards: Storyboard[] }>(
        `/api/episodes/${episodeId}/storyboards`
      ).then((r) => r.storyboards),

    create: (episodeId: string, data: Partial<Storyboard>) =>
      request<Storyboard>(`/api/episodes/${episodeId}/storyboards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),

    update: (id: string, data: Partial<Storyboard>) =>
      request<Storyboard>(`/api/storyboards/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
  },

  // ---- AI endpoints ----
  ai: {
    rewriteScript: (episodeId: string) =>
      request<{ episode: Episode }>('/api/ai/rewrite-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ episodeId }),
      }),

    extract: (episodeId: string, dramaId: string) =>
      request<{ characters: Character[]; scenes: Scene[] }>(
        '/api/ai/extract',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ episodeId, dramaId }),
        }
      ),

    generateStoryboard: (episodeId: string) =>
      request<{ storyboards: Storyboard[] }>(
        '/api/ai/generate-storyboard',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ episodeId }),
        }
      ),

    generateCharacterSheet: (characterId: string, style?: string, referenceImages?: string[]) =>
      request<{ sheet: any; portrait: any }>('/api/ai/generate-character-sheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ characterId, style, referenceImages }),
      }),

    generateImage: (prompt: string, size?: string, episodeId?: string, dialogueChar?: string, sceneLocation?: string) =>
      request<{ imageUrl: string; prompt: string }>('/api/ai/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, size, episodeId, dialogueChar, sceneLocation }),
      }),

    generateCharacterImage: (characterId: string, style?: string) =>
      request<{ character: Character; imageUrl: string }>(
        '/api/ai/generate-character-image',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ characterId, style }),
        }
      ),

    generateVideo: (
      storyboardId: string,
      prompt?: string,
      firstFrameUrl?: string
    ) =>
      request<{ storyboard: Storyboard }>('/api/ai/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storyboardId, prompt, firstFrameUrl }),
      }),

    generateSceneImage: (sceneId: string, style?: string) =>
      request<{ scene: Scene; imageUrl: string }>('/api/ai/generate-scene-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sceneId, style }),
      }),

    // SSE stream for extract with progress
    extractStream: (
      episodeId: string,
      dramaId: string,
      onProgress: (data: { step: string; message: string; progress: number; detail?: unknown }) => void,
    ): Promise<{ characters: Character[]; scenes: Scene[] }> => {
      return new Promise((resolve, reject) => {
        fetch('/api/ai/extract-stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ episodeId, dramaId }),
        }).then(async (res) => {
          if (!res.ok) {
            const text = await res.text().catch(() => 'Unknown error')
            reject(new Error(`API ${res.status}: ${text}`))
            return
          }

          const reader = res.body?.getReader()
          if (!reader) {
            reject(new Error('No readable stream'))
            return
          }

          const decoder = new TextDecoder()
          let buffer = ''
          let lastResult: { characters: Character[]; scenes: Scene[] } | null = null

          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() || ''

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.slice(6))
                  if (data.step === 'error') {
                    reject(new Error(data.message))
                    return
                  }
                  if (data.step === 'completed') {
                    lastResult = data.result
                  }
                  onProgress(data)
                } catch {
                  // ignore parse errors
                }
              }
            }
          }

          if (lastResult) {
            resolve(lastResult)
          } else {
            reject(new Error('Stream ended without result'))
          }
        }).catch(reject)
      })
    },

    // SSE stream for storyboard generation with progress
    generateStoryboardStream: (
      episodeId: string,
      onProgress: (data: { step: string; message: string; progress: number; detail?: unknown }) => void,
    ): Promise<{ storyboards: Storyboard[] }> => {
      return new Promise((resolve, reject) => {
        fetch('/api/ai/generate-storyboard-stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ episodeId }),
        }).then(async (res) => {
          if (!res.ok) {
            const text = await res.text().catch(() => 'Unknown error')
            reject(new Error(`API ${res.status}: ${text}`))
            return
          }

          const reader = res.body?.getReader()
          if (!reader) {
            reject(new Error('No readable stream'))
            return
          }

          const decoder = new TextDecoder()
          let buffer = ''
          let lastResult: { storyboards: Storyboard[] } | null = null

          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() || ''

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.slice(6))
                  if (data.step === 'error') {
                    reject(new Error(data.message))
                    return
                  }
                  if (data.step === 'completed') {
                    lastResult = data.result
                  }
                  onProgress(data)
                } catch {
                  // ignore parse errors
                }
              }
            }
          }

          if (lastResult) {
            resolve(lastResult)
          } else {
            reject(new Error('Stream ended without result'))
          }
        }).catch(reject)
      })
    },

    generateTts: (storyboardId: string, text?: string, voiceId?: string) =>
      request<{ storyboard: Storyboard }>('/api/ai/generate-tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storyboardId, text, voiceId }),
      }),

    // List available voices from TTS providers
    listVoices: (provider?: string, language?: string) => {
      const params = new URLSearchParams()
      if (provider) params.set('provider', provider)
      if (language) params.set('language', language)
      const qs = params.toString()
      return request<{
        voices: Array<{ id: string; name: string; provider: string; language?: string; description?: string; gender?: string }>
        activeProvider: string | null
        activeModel: string | null
      }>(`/api/ai/voices${qs ? `?${qs}` : ''}`)
    },

    // Generate a voice sample for a character
    generateVoiceSample: (characterId: string, voiceId: string, text?: string) =>
      request<{
        audioUrl: string
        voiceId: string
        text: string
        characterName: string | null
      }>('/api/ai/voice-sample', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ characterId, voiceId, text }),
      }),

    pollStatus: (category: 'image' | 'video', taskId: string) =>
      request<{
        status: 'pending' | 'processing' | 'completed' | 'failed' | 'unsupported'
        imageBase64?: string
        videoUrl?: string
        error?: string
      }>('/api/ai/poll-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, taskId }),
      }),

    testConnection: (category?: AiCategory, model?: string, providerOpts?: {
      provider?: string
      apiKey?: string
      baseUrl?: string
    }) =>
      request<{
        success: boolean
        provider?: string
        model?: string
        error?: string
        responsePreview?: string
        latency?: number
      }>('/api/ai/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: category || 'llm',
          model,
          ...(providerOpts || {}),
        }),
      }),

    // Get active models for each AI category
    getActiveModels: () =>
      request<Record<string, { provider: string; model: string; name: string } | null>>(
        '/api/ai/active-models'
      ),

    // ---- Agent API ----

    // Agent execution with SSE streaming
    agentStream: (
      agentType: string,
      episodeId: string,
      dramaId: string,
      message: string,
      onProgress: (data: { step: string; message: string; [key: string]: unknown }) => void,
    ): Promise<{ text: string; toolCalls: unknown[]; steps: number }> => {
      return new Promise((resolve, reject) => {
        fetch(`/api/agent/${agentType}/stream`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ episodeId, dramaId, message }),
        }).then(async (res) => {
          if (!res.ok) {
            const text = await res.text().catch(() => 'Unknown error')
            reject(new Error(`API ${res.status}: ${text}`))
            return
          }

          const reader = res.body?.getReader()
          if (!reader) {
            reject(new Error('No readable stream'))
            return
          }

          const decoder = new TextDecoder()
          let buffer = ''
          let lastResult: { text: string; toolCalls: unknown[]; steps: number } | null = null

          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() || ''

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.slice(6))
                  if (data.step === 'error') {
                    reject(new Error(data.message))
                    return
                  }
                  if (data.step === 'completed') {
                    lastResult = {
                      text: data.text || '',
                      toolCalls: data.toolCalls || [],
                      steps: data.steps || 0,
                    }
                  }
                  onProgress(data)
                } catch {
                  // ignore parse errors
                }
              }
            }
          }

          if (lastResult) {
            resolve(lastResult)
          } else {
            reject(new Error('Stream ended without result'))
          }
        }).catch(reject)
      })
    },

    // Agent execution (non-streaming, simple request)
    agentExecute: (agentType: string, episodeId: string, dramaId: string, message: string) =>
      request<{ agentType: string; name: string; text: string; toolCalls: unknown[]; steps: number }>(
        `/api/agent/${agentType}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ episodeId, dramaId, message }),
        }
      ),

    // Get agent config
    agentGetConfig: (agentType: string) =>
      request<{
        agentType: string
        name: string
        description: string
        config: { systemPrompt: string; model: string | null; temperature: number; maxTokens: number; isActive: boolean }
        hasSkill: boolean
        skillPreview: string | null
      }>(`/api/agent/${agentType}`),
  },

  // ---- Agents ----
  agents: {
    list: () =>
      request<{
        agents: Array<{
          agentType: string
          name: string
          description: string
          config: {
            systemPrompt: string
            model: string | null
            temperature: number
            maxTokens: number
            isActive: boolean
          }
          defaultSystemPrompt: string
          tools: Array<{ name: string; description: string; parameters: Record<string, unknown> }>
          skillContent: string | null
        }>
      }>('/api/agents').then((r) => r.agents),

    update: (
      agentType: string,
      config: {
        systemPrompt?: string
        model?: string
        temperature?: number
        maxTokens?: number
        isActive?: boolean
      }
    ) =>
      request<{
        agentType: string
        name: string
        description: string
        config: {
          systemPrompt: string
          model: string | null
          temperature: number
          maxTokens: number
          isActive: boolean
        }
      }>(`/api/agent/${agentType}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      }),
  },

  // ---- Settings ----
  settings: {
    get: () => request<SettingsResponse>('/api/settings'),

    save: (data: {
      category: AiCategory
      provider: string
      name?: string
      apiKey?: string
      baseUrl?: string
      model?: string
      isActive?: boolean
    }) =>
      request<{ providers: Record<AiCategory, ProviderConfig[]> }>('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
  },

  // ---- User Provider (per-user API key overrides) ----
  userProvider: {
    get: () =>
      request<{ providers: Record<string, ProviderConfig[]> }>('/api/settings/user-provider'),

    save: (data: {
      category: string
      provider: string
      name?: string
      apiKey: string
      baseUrl?: string
      model?: string
      isActive?: boolean
    }) =>
      request<{ providers: Record<string, ProviderConfig[]> }>('/api/settings/user-provider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),

    delete: (data: { category: string; provider: string }) =>
      request<{ providers: Record<string, ProviderConfig[]> }>('/api/settings/user-provider', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
  },

  // ---- Grid Image Generation ----
  grid: {
    generate: (params: {
      episodeId?: string
      dramaId?: string
      prompt: string
      rows: number
      cols: number
      cellPrompts?: string[]
      shotIds?: string[]
      gridMode?: string
    }) =>
      request<{
        imageUrl?: string
        imageGenerationId?: string
        status?: string
        taskId?: string
        size: string
        rows: number
        cols: number
        message?: string
      }>('/api/ai/grid/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      }),

    split: (params: {
      imageUrl: string
      rows: number
      cols: number
      assignments: Array<{
        cellIndex: number
        storyboardId: string
        frameType: 'first_frame' | 'last_frame'
      }>
    }) =>
      request<{
        cells: Array<{
          index: number
          imageUrl: string
          assignedTo: string
        }>
        totalCells: number
        assignedCount: number
        rows: number
        cols: number
      }>('/api/ai/grid/split', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      }),

    status: (taskId: string, imageGenerationId?: string) => {
      const params = new URLSearchParams()
      params.set('taskId', taskId)
      if (imageGenerationId) params.set('imageGenerationId', imageGenerationId)
      return request<{
        status: 'pending' | 'processing' | 'completed' | 'failed'
        imageUrl?: string
        imageGenerationId?: string
        size?: string
        taskId?: string
        error?: string
        message?: string
      }>(`/api/ai/grid/status?${params.toString()}`)
    },
  },

  // ---- Upload ----
  upload: {
    file: async (
      file: File,
      options: {
        storyboardId?: string
        characterId?: string
        sceneId?: string
        fieldType?: string
      }
    ) => {
      const formData = new FormData()
      formData.append('file', file)
      if (options.storyboardId) formData.append('storyboardId', options.storyboardId)
      if (options.characterId) formData.append('characterId', options.characterId)
      if (options.sceneId) formData.append('sceneId', options.sceneId)
      if (options.fieldType) formData.append('fieldType', options.fieldType)

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const text = await res.text().catch(() => 'Unknown error')
        throw new Error(`Upload failed: ${text}`)
      }

      return res.json() as Promise<{ url: string; storyboard?: Storyboard; character?: Character; scene?: Scene }>
    },
  },
}
