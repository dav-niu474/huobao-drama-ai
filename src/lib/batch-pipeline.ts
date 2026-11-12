// ============================================================
// Batch Pipeline Engine — PR-G
// Manages batch execution of the 12-step pipeline across
// multiple episodes within a drama.
// ============================================================

import { db } from '@/lib/db'
import { executeAgent } from '@/lib/agents/factory'
import { generateEpisodeScript } from '@/lib/script-generation'
import { userIdContext } from '@/lib/ai-config'

// ── Helper: Resolve base URL for internal API calls ───────────

function getBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
}

// ── Types ──────────────────────────────────────────────────────

export interface BatchState {
  dramaId: string
  status: 'running' | 'completed' | 'paused' | 'failed'
  totalEpisodes: number
  completedEpisodes: number
  currentEpisodeIndex: number
  currentStep: string
  episodes: EpisodeBatchState[]
  startedAt: Date
  error?: string
}

export interface EpisodeBatchState {
  episodeId: string
  episodeNumber: number
  title: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
  completedSteps: number
  totalSteps: number
  currentStep: string | null
  /** 软失败步骤的错误明细（步骤继续执行但错误被记录，供前端展示） */
  stepErrors?: string[]
  error?: string
}

export interface BatchStatusResponse {
  batchId: string
  status: 'running' | 'completed' | 'paused' | 'failed'
  totalEpisodes: number
  completedEpisodes: number
  currentEpisode: number
  currentStep: string
  progressPercent: number
  episodes: EpisodeBatchState[]
}

// ── Pipeline step definitions (aligned with pipeline-status API) ──

const PIPELINE_STEPS_ORDER = [
  'script:raw',
  'script:rewrite',
  'script:extract',
  'script:voice',
  'script:storyboard',
  'prod:chars',
  'prod:scenes',
  'prod:dubbing',
  'prod:shots',
  'prod:videos',
  'prod:compose',
  'export:merge',
] as const

type PipelineStep = (typeof PIPELINE_STEPS_ORDER)[number]

// ── Step labels for Chinese display ──

const STEP_LABELS: Record<PipelineStep, string> = {
  'script:raw': '原始内容',
  'script:rewrite': 'AI改写',
  'script:extract': '角色场景提取',
  'script:voice': '音色分配',
  'script:storyboard': '分镜生成',
  'prod:chars': '角色形象',
  'prod:scenes': '场景图片',
  'prod:dubbing': '配音生成',
  'prod:shots': '镜头图片',
  'prod:videos': '视频生成',
  'prod:compose': '视频合成',
  'export:merge': '拼接导出',
}

// ── Batch Pipeline Manager (Singleton) ─────────────────────────

class BatchPipelineManager {
  private batches: Map<string, BatchState> = new Map()
  private abortControllers: Map<string, AbortController> = new Map()
  private pauseResolvers: Map<string, () => void> = new Map()
  /**
   * 发起批次的用户会话 Cookie（用于内部 API 调用鉴权）。
   * 仅保存在服务端内存，不参与任何状态响应序列化。
   */
  private authCookies: Map<string, string> = new Map()

  /**
   * Start batch pipeline execution for a drama
   */
  async startBatch(
    dramaId: string,
    episodeIds?: string[],
    steps?: string[],
    options?: { authCookie?: string }
  ): Promise<BatchState> {
    // If there's already a running batch for this drama, return it
    const existing = this.batches.get(dramaId)
    if (existing && existing.status === 'running') {
      return existing
    }

    // Get episodes
    const whereClause: Record<string, unknown> = { dramaId }
    if (episodeIds && episodeIds.length > 0) {
      whereClause.id = { in: episodeIds }
    }

    const episodes = await db.episode.findMany({
      where: whereClause,
      orderBy: { episodeNumber: 'asc' },
      select: {
        id: true,
        episodeNumber: true,
        title: true,
        rawContent: true,
        scriptContent: true,
        scriptStatus: true,
        extractStatus: true,
        storyboardStatus: true,
        globalAssetsImported: true,
        sourceChapterIds: true,
      },
    })

    if (episodes.length === 0) {
      throw new Error('No episodes found for this drama')
    }

    // Filter steps to execute
    const stepsToExecute = steps && steps.length > 0
      ? PIPELINE_STEPS_ORDER.filter((s) => steps!.includes(s))
      : [...PIPELINE_STEPS_ORDER]

    const totalSteps = stepsToExecute.length

    // Create batch state
    const batchState: BatchState = {
      dramaId,
      status: 'running',
      totalEpisodes: episodes.length,
      completedEpisodes: 0,
      currentEpisodeIndex: 0,
      currentStep: STEP_LABELS[stepsToExecute[0]] || '准备中',
      episodes: episodes.map((ep) => ({
        episodeId: ep.id,
        episodeNumber: ep.episodeNumber,
        title: ep.title,
        status: 'pending',
        completedSteps: 0,
        totalSteps,
        currentStep: null,
      })),
      startedAt: new Date(),
    }

    this.batches.set(dramaId, batchState)

    // 保存发起者的会话 Cookie（内部 API 调用转发鉴权用）
    if (options?.authCookie) {
      this.authCookies.set(dramaId, options.authCookie)
    }

    // Create abort controller
    const controller = new AbortController()
    this.abortControllers.set(dramaId, controller)

    // ── 解析剧集归属用户，并在其 ALS 上下文中执行整个批次 ──
    // 后台执行会丢失请求级 AsyncLocalStorage 上下文，导致 aiClient
    // 无法解析用户级供应商配置；这里显式恢复。
    const drama = await db.drama.findUnique({
      where: { id: dramaId },
      select: { userId: true },
    })
    const dramaUserId = drama?.userId ?? undefined

    const runExecution = () =>
      this.executeBatch(dramaId, episodes, stepsToExecute, controller.signal)
        .catch((err) => {
          console.error(`[BatchPipeline] Batch execution failed:`, err)
          const state = this.batches.get(dramaId)
          if (state) {
            state.status = 'failed'
            state.error = err instanceof Error ? err.message : String(err)
          }
        })
        .finally(() => {
          // 批次结束后清理会话 Cookie，避免长期驻留内存
          this.authCookies.delete(dramaId)
        })

    // Start execution in the background (non-blocking)
    if (dramaUserId) {
      userIdContext.run(dramaUserId, runExecution)
    } else {
      runExecution()
    }

    return batchState
  }

  /**
   * Pause a running batch
   */
  async pauseBatch(dramaId: string): Promise<void> {
    const state = this.batches.get(dramaId)
    if (!state) throw new Error('No batch found for this drama')
    if (state.status !== 'running') throw new Error('Batch is not running')

    state.status = 'paused'
    // The execution loop will check this and pause
  }

  /**
   * Resume a paused batch
   */
  async resumeBatch(dramaId: string): Promise<void> {
    const state = this.batches.get(dramaId)
    if (!state) throw new Error('No batch found for this drama')
    if (state.status !== 'paused') throw new Error('Batch is not paused')

    state.status = 'running'

    // Resolve the pause promise if one exists
    const resolver = this.pauseResolvers.get(dramaId)
    if (resolver) {
      resolver()
      this.pauseResolvers.delete(dramaId)
    }
  }

  /**
   * Get current batch status
   */
  getStatus(dramaId: string): BatchState | null {
    return this.batches.get(dramaId) ?? null
  }

  /**
   * Get batch status as API response format
   */
  getStatusResponse(dramaId: string): BatchStatusResponse | null {
    const state = this.batches.get(dramaId)
    if (!state) return null

    const completedEpisodes = state.episodes.filter(
      (e) => e.status === 'completed'
    ).length

    const totalStepsAll = state.episodes.reduce((s, e) => s + e.totalSteps, 0)
    const completedStepsAll = state.episodes.reduce((s, e) => s + e.completedSteps, 0)
    const progressPercent =
      totalStepsAll > 0 ? Math.round((completedStepsAll / totalStepsAll) * 100) : 0

    return {
      batchId: state.dramaId,
      status: state.status,
      totalEpisodes: state.totalEpisodes,
      completedEpisodes,
      currentEpisode: state.currentEpisodeIndex + 1,
      currentStep: state.currentStep,
      progressPercent,
      episodes: state.episodes,
    }
  }

  // ── Internal: Authenticated internal API call ─────────────
  // 之前直接 fetch 内部路由但不携带会话 Cookie，所有 requireAuth 的
  // 生成路由都返回 401，制作步骤被静默跳过（当步骤已“完成”）。
  // 现在转发发起批次的用户会话 Cookie，并在非 2xx 时抛出错误。
  private async internalApi(
    dramaId: string,
    path: string,
    body?: unknown
  ): Promise<Record<string, unknown>> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    const cookie = this.authCookies.get(dramaId)
    if (cookie) headers['Cookie'] = cookie

    const res = await fetch(`${getBaseUrl()}${path}`, {
      method: 'POST',
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    if (!res.ok) {
      const text = await res.text().catch(() => 'Unknown error')
      throw new Error(`内部API调用失败 (HTTP ${res.status}) ${path}: ${text.slice(0, 200)}`)
    }
    return res.json().catch(() => ({}))
  }

  // ── Internal: Execute the batch ──────────────────────────────

  private async executeBatch(
    dramaId: string,
    episodes: Array<{
      id: string
      episodeNumber: number
      title: string
      rawContent: string | null
      scriptContent: string | null
      scriptStatus: string
      extractStatus: string
      storyboardStatus: string
      globalAssetsImported: boolean
      sourceChapterIds: string | null
    }>,
    stepsToExecute: PipelineStep[],
    signal: AbortSignal
  ): Promise<void> {
    const state = this.batches.get(dramaId)!
    console.log(`[BatchPipeline] Starting batch for drama ${dramaId}: ${episodes.length} episodes, ${stepsToExecute.length} steps`)

    for (let i = 0; i < episodes.length; i++) {
      // Check abort
      if (signal.aborted) {
        state.status = 'failed'
        state.error = 'Batch was aborted'
        return
      }

      // Check pause
      await this.checkPause(dramaId)
      if (state.status === 'failed') return

      const episode = episodes[i]
      state.currentEpisodeIndex = i
      state.episodes[i].status = 'running'

      console.log(`[BatchPipeline] Processing episode ${episode.episodeNumber}: ${episode.title}`)

      try {
        await this.executeEpisode(episode, dramaId, stepsToExecute, signal, state, i)
        state.episodes[i].status = 'completed'
        state.completedEpisodes = i + 1
      } catch (err) {
        console.error(`[BatchPipeline] Episode ${episode.episodeNumber} failed:`, err)
        state.episodes[i].status = 'failed'
        state.episodes[i].error = err instanceof Error ? err.message : String(err)
        // Continue with next episode
        state.completedEpisodes = i + 1
      }
    }

    // All episodes processed
    state.status = state.episodes.every((e) => e.status === 'completed')
      ? 'completed'
      : state.episodes.some((e) => e.status === 'completed')
        ? 'completed' // Mark as completed even if some failed
        : 'failed'

    state.currentStep = 'completed'
    console.log(`[BatchPipeline] Batch completed for drama ${dramaId}: ${state.completedEpisodes}/${state.totalEpisodes} episodes`)
  }

  // ── Internal: Execute pipeline for a single episode ──────────

  private async executeEpisode(
    episode: {
      id: string
      episodeNumber: number
      title: string
      rawContent: string | null
      scriptContent: string | null
      scriptStatus: string
      extractStatus: string
      storyboardStatus: string
      globalAssetsImported: boolean
      sourceChapterIds: string | null
    },
    dramaId: string,
    stepsToExecute: PipelineStep[],
    signal: AbortSignal,
    batchState: BatchState,
    episodeIndex: number
  ): Promise<void> {
    for (let stepIdx = 0; stepIdx < stepsToExecute.length; stepIdx++) {
      // Check abort
      if (signal.aborted) throw new Error('Batch was aborted')

      // Check pause
      await this.checkPause(dramaId)
      if (batchState.status === 'failed') throw new Error('Batch failed')

      const step = stepsToExecute[stepIdx]
      const stepLabel = STEP_LABELS[step]
      batchState.currentStep = stepLabel
      batchState.episodes[episodeIndex].currentStep = stepLabel

      console.log(`[BatchPipeline] Episode ${episode.episodeNumber}, Step: ${stepLabel}`)

      try {
        await this.executeStep(episode, dramaId, step, signal)
        batchState.episodes[episodeIndex].completedSteps = stepIdx + 1
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        console.error(`[BatchPipeline] Step ${stepLabel} failed for episode ${episode.episodeNumber}:`, err)
        // Mark step as failed but continue to next step
        // This is a soft failure — the episode continues
        batchState.episodes[episodeIndex].completedSteps = stepIdx + 1
        // 记录步骤错误明细，供前端展示与排查（不再静默丢弃）
        const errors = batchState.episodes[episodeIndex].stepErrors || []
        errors.push(`${stepLabel}: ${errMsg.slice(0, 300)}`)
        batchState.episodes[episodeIndex].stepErrors = errors
      }
    }

    batchState.episodes[episodeIndex].currentStep = null
  }

  // ── Internal: Execute a single pipeline step ─────────────────

  private async executeStep(
    episode: {
      id: string
      episodeNumber: number
      title: string
      rawContent: string | null
      scriptContent: string | null
      scriptStatus: string
      extractStatus: string
      storyboardStatus: string
      globalAssetsImported: boolean
      sourceChapterIds: string | null
    },
    dramaId: string,
    step: PipelineStep,
    _signal: AbortSignal
  ): Promise<void> {
    switch (step) {
      case 'script:raw':
        await this.executeRawContent(episode, dramaId)
        break
      case 'script:rewrite':
        await this.executeScriptRewrite(episode, dramaId)
        break
      case 'script:extract':
        await this.executeExtract(episode, dramaId)
        break
      case 'script:voice':
        await this.executeVoiceAssign(episode, dramaId)
        break
      case 'script:storyboard':
        await this.executeStoryboard(episode, dramaId)
        break
      case 'prod:chars':
        await this.executeCharacterImages(episode, dramaId)
        break
      case 'prod:scenes':
        await this.executeSceneImages(episode, dramaId)
        break
      case 'prod:dubbing':
        await this.executeDubbing(episode, dramaId)
        break
      case 'prod:shots':
        await this.executeShotFrames(episode, dramaId)
        break
      case 'prod:videos':
        await this.executeVideos(episode, dramaId)
        break
      case 'prod:compose':
        await this.executeCompose(episode, dramaId)
        break
      case 'export:merge':
        await this.executeMerge(episode, dramaId)
        break
      default:
        console.warn(`[BatchPipeline] Unknown step: ${step}`)
    }
  }

  // ── Step implementations ─────────────────────────────────────

  private async executeRawContent(
    episode: { id: string; rawContent: string | null; globalAssetsImported: boolean; sourceChapterIds: string | null },
    dramaId: string
  ): Promise<void> {
    // Check if rawContent is already filled
    if (episode.rawContent?.trim()) return

    // Step 1: Import global assets if not already done
    if (!episode.globalAssetsImported) {
      try {
        // Import global assets — this also fills rawContent from novel if possible
        const ep = await db.episode.findUnique({ where: { id: episode.id } })
        if (ep && !ep.globalAssetsImported) {
          await db.episode.update({
            where: { id: episode.id },
            data: { globalAssetsImported: true },
          })
        }
      } catch (err) {
        console.warn(`[BatchPipeline] Import global assets failed:`, err)
      }
    }

    // Step 2: If still no rawContent, try to fill from novel chapters
    const ep = await db.episode.findUnique({ where: { id: episode.id } })
    if (ep?.rawContent?.trim()) return

    if (ep?.sourceChapterIds) {
      try {
        let chapterIds: number[] = []
        try {
          chapterIds = JSON.parse(ep.sourceChapterIds)
        } catch { chapterIds = [] }

        if (chapterIds.length > 0) {
          const novel = await db.novel.findUnique({ where: { dramaId } })
          if (novel) {
            let chapters: Array<{ index: number; title: string; content: string }> = []
            try {
              chapters = JSON.parse(novel.chapters)
            } catch { chapters = [] }

            const selected = chapters.filter((ch) => chapterIds.includes(ch.index))
            if (selected.length > 0) {
              const rawContent = selected
                .map((ch) => `## ${ch.title}\n\n${ch.content}`)
                .join('\n\n---\n\n')

              await db.episode.update({
                where: { id: episode.id },
                data: { rawContent },
              })
            }
          }
        }
      } catch (err) {
        console.warn(`[BatchPipeline] Fill rawContent from novel failed:`, err)
      }
    }

    // If still no rawContent, mark as skipped (we can't proceed without it)
    const finalEp = await db.episode.findUnique({ where: { id: episode.id } })
    if (!finalEp?.rawContent?.trim()) {
      console.warn(`[BatchPipeline] Episode ${episode.id} has no rawContent — skipping script steps`)
    }
  }

  private async executeScriptRewrite(
    episode: { id: string; rawContent: string | null },
    dramaId: string
  ): Promise<void> {
    // Check if already done
    const ep = await db.episode.findUnique({ where: { id: episode.id } })
    if (ep?.scriptContent?.trim()) return

    // Need rawContent first
    if (!ep?.rawContent?.trim()) {
      console.warn(`[BatchPipeline] Skipping script rewrite — no rawContent`)
      return
    }

    // ── 优先使用统一的 Toonflow 剧本生成（与单集工作台同一实现，保证格式一致）──
    try {
      const drama = await db.drama.findUnique({
        where: { id: dramaId },
        select: { userId: true },
      })
      await generateEpisodeScript(episode.id, {
        duration: '120s',
        userId: drama?.userId ?? undefined,
      })
      return
    } catch (err) {
      console.warn(
        `[BatchPipeline] Toonflow script generation failed, falling back to script_rewriter agent:`,
        err instanceof Error ? err.message : err
      )
    }

    // ── Fallback: 旧 script_rewriter agent 改写 ──
    try {
      await executeAgent(
        'script_rewriter',
        episode.id,
        dramaId,
        '请将原始内容改写为标准剧本格式，使用read_episode_script工具读取内容，改写后用save_script工具保存。',
        undefined,
        { modelOverride: undefined }
      )
      // 兜底成功后同步剧本状态（Toonflow 失败时可能遗留 failed）
      const updated = await db.episode.findUnique({
        where: { id: episode.id },
        select: { scriptContent: true },
      })
      if (updated?.scriptContent?.trim()) {
        await db.episode.update({
          where: { id: episode.id },
          data: { scriptStatus: 'completed' },
        })
      }
    } catch (err) {
      console.error(`[BatchPipeline] Script rewrite failed:`, err)
      throw err
    }
  }

  private async executeExtract(
    episode: { id: string },
    dramaId: string
  ): Promise<void> {
    // Check if already done
    const characters = await db.character.findMany({ where: { dramaId } })
    const scenes = await db.scene.findMany({ where: { dramaId } })
    if (characters.length > 0 || scenes.length > 0) return

    // Use extractor agent
    try {
      await executeAgent(
        'extractor',
        episode.id,
        dramaId,
        '请从剧本中提取所有角色、场景和道具信息。先使用read_script_for_extraction读取剧本，再使用read_existing_characters、read_existing_scenes和read_existing_props查看已有数据，最后用save_characters、save_scenes和save_props保存提取结果（注意去重）。道具只提取对剧情有推动作用的关键道具。',
        undefined,
        { modelOverride: undefined }
      )
    } catch (err) {
      console.error(`[BatchPipeline] Extract failed:`, err)
      throw err
    }
  }

  private async executeVoiceAssign(
    episode: { id: string },
    dramaId: string
  ): Promise<void> {
    // Check if already done
    const characters = await db.character.findMany({ where: { dramaId } })
    if (characters.length === 0) return
    const unassigned = characters.filter((c) => !c.voiceId)
    if (unassigned.length === 0) return

    // Use voice_assigner agent
    try {
      await executeAgent(
        'voice_assigner',
        episode.id,
        dramaId,
        '请为所有角色分配合适的TTS音色。先使用get_characters获取角色列表，使用list_available_voices获取可用音色，然后根据角色性别、年龄、性格特征为每个角色分配最合适的音色。',
        undefined,
        { modelOverride: undefined }
      )
    } catch (err) {
      console.error(`[BatchPipeline] Voice assign failed:`, err)
      throw err
    }
  }

  private async executeStoryboard(
    episode: { id: string },
    dramaId: string
  ): Promise<void> {
    // Check if already done
    const storyboards = await db.storyboard.findMany({ where: { episodeId: episode.id } })
    if (storyboards.length > 0) return

    // Use storyboard_breaker agent
    try {
      await executeAgent(
        'storyboard_breaker',
        episode.id,
        dramaId,
        '请将剧本拆解为分镜序列。先使用read_storyboard_context读取剧本、角色和场景信息，然后为每个镜头生成完整的分镜数据。⚠️重要：每个分镜的imagePrompt必须是6维度专业英文提示词（风格+构图+角色+场景+光线+画质），videoPrompt必须使用3秒分段XML格式。一步到位，无需二次增强。最后用save_storyboards保存所有分镜。',
        undefined,
        { modelOverride: undefined }
      )
    } catch (err) {
      console.error(`[BatchPipeline] Storyboard generation failed:`, err)
      throw err
    }
  }

  private async executeCharacterImages(
    episode: { id: string },
    dramaId: string
  ): Promise<void> {
    // Get characters without images
    const characters = await db.character.findMany({
      where: { dramaId, imageUrl: null },
    })
    if (characters.length === 0) return

    // Generate character images one by one
    for (const char of characters) {
      try {
        await this.internalApi(dramaId, '/api/ai/generate-character-image', {
          characterId: char.id,
        })
      } catch (err) {
        console.warn(`[BatchPipeline] Character image failed for ${char.name}:`, err)
        throw err
      }
    }
  }

  private async executeSceneImages(
    episode: { id: string },
    dramaId: string
  ): Promise<void> {
    // Get scenes without images
    const scenes = await db.scene.findMany({
      where: { dramaId, imageUrl: null },
    })
    if (scenes.length === 0) return

    for (const scene of scenes) {
      try {
        await this.internalApi(dramaId, '/api/ai/generate-scene-image', {
          sceneId: scene.id,
        })
      } catch (err) {
        console.warn(`[BatchPipeline] Scene image failed for ${scene.location}:`, err)
        throw err
      }
    }
  }

  private async executeDubbing(
    episode: { id: string },
    dramaId: string
  ): Promise<void> {
    // Get storyboards with dialogue but no TTS audio
    const storyboards = await db.storyboard.findMany({
      where: { episodeId: episode.id, dialogue: { not: null } },
    })
    const withoutTts = storyboards.filter((s) => !s.ttsAudioUrl)
    if (withoutTts.length === 0) return

    // Generate TTS for each storyboard with dialogue
    for (const sb of withoutTts) {
      try {
        await this.internalApi(dramaId, '/api/ai/generate-tts', {
          storyboardId: sb.id,
          text: sb.dialogue || undefined,
        })
      } catch (err) {
        console.warn(`[BatchPipeline] TTS failed for shot ${sb.shotNumber}:`, err)
        throw err
      }
    }
  }

  private async executeShotFrames(
    episode: { id: string },
    dramaId: string
  ): Promise<void> {
    // Get storyboards without first frame images
    const storyboards = await db.storyboard.findMany({
      where: { episodeId: episode.id, imagePrompt: { not: null } },
    })
    const withoutFrames = storyboards.filter((s) => !s.firstFrameUrl)
    if (withoutFrames.length === 0) return

    // Generate images for each storyboard
    for (const sb of withoutFrames) {
      try {
        const data = await this.internalApi(dramaId, '/api/ai/generate-image', {
          prompt: sb.imagePrompt,
          size: '1024x576',
          episodeId: episode.id,
          dialogueChar: sb.dialogueChar || undefined,
        })

        if (data.imageUrl) {
          await db.storyboard.update({
            where: { id: sb.id },
            data: { firstFrameUrl: data.imageUrl as string },
          })
        }
      } catch (err) {
        console.warn(`[BatchPipeline] Shot frame failed for shot ${sb.shotNumber}:`, err)
        throw err
      }
    }
  }

  private async executeVideos(
    episode: { id: string },
    dramaId: string
  ): Promise<void> {
    // Get storyboards without videos
    const storyboards = await db.storyboard.findMany({
      where: { episodeId: episode.id },
    })
    const withoutVideos = storyboards.filter((s) => !s.videoUrl)
    if (withoutVideos.length === 0) return

    // Generate videos for each storyboard
    for (const sb of withoutVideos) {
      try {
        const data = await this.internalApi(dramaId, '/api/ai/generate-video', {
          storyboardId: sb.id,
          prompt: sb.videoPrompt || undefined,
          firstFrameUrl: sb.firstFrameUrl || undefined,
        })

        // Async providers return { status: 'processing', taskId } — poll until
        // completion, then persist the resulting videoUrl. Without this the
        // batch pipeline marked async video tasks as done while nothing was
        // ever written to the storyboard.
        if (data.status === 'processing' && typeof data.taskId === 'string' && data.taskId) {
          const videoUrl = await this.pollAsyncVideo(dramaId, data.taskId)
          if (videoUrl) {
            await db.storyboard.update({
              where: { id: sb.id },
              data: { videoUrl },
            })
          }
        }
      } catch (err) {
        console.warn(`[BatchPipeline] Video failed for shot ${sb.shotNumber}:`, err)
        throw err
      }
    }
  }

  /**
   * Poll an async video generation task until completion.
   * Returns the persisted video URL (file-storage path), or null on timeout.
   */
  private async pollAsyncVideo(
    dramaId: string,
    taskId: string,
    intervalMs = 10000,
    maxPolls = 60
  ): Promise<string | null> {
    for (let i = 0; i < maxPolls; i++) {
      await new Promise((r) => setTimeout(r, intervalMs))
      try {
        const res = await this.internalApi(dramaId, '/api/ai/poll-status', {
          category: 'video',
          taskId,
          dramaId,
        })
        if (res.status === 'completed') {
          return typeof res.videoUrl === 'string' ? res.videoUrl : null
        }
        if (res.status === 'failed' || res.status === 'unsupported') {
          throw new Error(String(res.error || '视频生成失败'))
        }
      } catch (err) {
        if (i === maxPolls - 1) throw err
      }
    }
    return null
  }

  private async executeCompose(
    episode: { id: string },
    dramaId: string
  ): Promise<void> {
    // Get storyboards with video but without composed output
    const storyboards = await db.storyboard.findMany({
      where: { episodeId: episode.id, videoUrl: { not: null } },
    })
    const withoutCompose = storyboards.filter((s) => !s.composedUrl)
    if (withoutCompose.length === 0) return

    // Compose each storyboard (video + audio + subtitles)
    for (const sb of withoutCompose) {
      try {
        await this.internalApi(dramaId, `/api/episodes/${episode.id}/compose`, {
          storyboardId: sb.id,
        })
      } catch (err) {
        console.warn(`[BatchPipeline] Compose failed for shot ${sb.shotNumber}:`, err)
        throw err
      }
    }
  }

  private async executeMerge(
    episode: { id: string },
    dramaId: string
  ): Promise<void> {
    // Check if already merged
    const ep = await db.episode.findUnique({ where: { id: episode.id } })
    if (ep?.videoUrl) return

    // Try to merge
    try {
      await this.internalApi(dramaId, `/api/episodes/${episode.id}/merge`)
    } catch (err) {
      console.warn(`[BatchPipeline] Merge failed for episode ${episode.id}:`, err)
      throw err
    }
  }

  // ── Internal: Check if batch is paused and wait ──────────────

  private async checkPause(dramaId: string, signal?: AbortSignal): Promise<void> {
    const state = this.batches.get(dramaId)
    if (!state || state.status !== 'paused') return

    // Wait until resumed
    return new Promise<void>((resolve) => {
      this.pauseResolvers.set(dramaId, resolve)
      // Also set a timeout to re-check periodically
      const interval = setInterval(() => {
        const currentState = this.batches.get(dramaId)
        if (!currentState || currentState.status !== 'paused') {
          clearInterval(interval)
          resolve()
        }
      }, 2000)

      // Allow callers to abort the wait (e.g., when the batch is cancelled)
      if (signal) {
        signal.addEventListener('abort', () => {
          clearInterval(interval)
          this.pauseResolvers.delete(dramaId)
          resolve()
        }, { once: true })
      }
    })
  }
}

// ── Export singleton ───────────────────────────────────────────

export const batchPipelineManager = new BatchPipelineManager()
