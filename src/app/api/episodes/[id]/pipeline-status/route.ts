import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isFFmpegAvailable } from '@/lib/ffmpeg'

// Pipeline steps in order (3 stages, 12 steps):
// Script: script:raw → script:rewrite → script:extract → script:voice → script:storyboard
// Production: prod:chars → prod:scenes → prod:dubbing → prod:shots → prod:videos → prod:compose
// Export: export:merge

interface StepStatus {
  status: 'pending' | 'partial' | 'done'
  label: string
  completed: number
  total: number
  extra?: Record<string, unknown>
}

// GET /api/episodes/[id]/pipeline-status - Get detailed production pipeline status
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const episode = await db.episode.findUnique({
      where: { id },
      include: {
        storyboards: { orderBy: { shotNumber: 'asc' } },
      },
    })

    if (!episode) {
      return NextResponse.json({ error: 'Episode not found' }, { status: 404 })
    }

    const storyboards = episode.storyboards
    const total = storyboards.length

    // ── Script Stage ──

    // Step 1: Raw Content
    const scriptRaw: StepStatus = {
      label: '原始内容',
      completed: episode.rawContent?.trim() ? 1 : 0,
      total: 1,
      status: episode.rawContent?.trim() ? 'done' : 'pending',
    }

    // Step 2: Script Rewrite
    const scriptRewrite: StepStatus = {
      label: 'AI改写',
      completed: episode.scriptContent?.trim() ? 1 : 0,
      total: 1,
      status: episode.scriptContent?.trim()
        ? 'done'
        : episode.scriptStatus === 'processing'
          ? 'partial'
          : 'pending',
      extra: { scriptStatus: episode.scriptStatus },
    }

    // Step 3: Character & Scene Extract
    const characters = await db.character.findMany({
      where: { dramaId: episode.dramaId },
    })
    const scenes = await db.scene.findMany({
      where: { dramaId: episode.dramaId },
      include: { images: true },
    })

    const scriptExtract: StepStatus = {
      label: '角色场景提取',
      completed: characters.length > 0 || scenes.length > 0 ? 1 : 0,
      total: 1,
      status: characters.length > 0 || scenes.length > 0
        ? 'done'
        : episode.extractStatus === 'processing'
          ? 'partial'
          : 'pending',
      extra: {
        characterCount: characters.length,
        sceneCount: scenes.length,
        extractStatus: episode.extractStatus,
      },
    }

    // Step 4: Voice Assign
    const charactersWithVoice = characters.filter((c) => c.voiceId)
    const scriptVoice: StepStatus = {
      label: '音色分配',
      completed: charactersWithVoice.length,
      total: characters.length,
      status: characters.length > 0 && charactersWithVoice.length >= characters.length
        ? 'done'
        : charactersWithVoice.length > 0
          ? 'partial'
          : 'pending',
    }

    // Step 5: Storyboard Generation
    const scriptStoryboard: StepStatus = {
      label: '分镜生成',
      completed: total > 0 ? 1 : 0,
      total: 1,
      status: total > 0
        ? 'done'
        : episode.storyboardStatus === 'processing'
          ? 'partial'
          : 'pending',
      extra: { count: total, storyboardStatus: episode.storyboardStatus },
    }

    // ── Production Stage ──

    // Step 6: Character Images (角色形象)
    const charactersWithImage = characters.filter((c) => c.imageUrl)
    const prodChars: StepStatus = {
      label: '角色形象',
      completed: charactersWithImage.length,
      total: characters.length,
      status: characters.length > 0 && charactersWithImage.length >= characters.length
        ? 'done'
        : charactersWithImage.length > 0
          ? 'partial'
          : 'pending',
    }

    // Step 7: Scene Images (场景图片)
    const scenesWithImage = scenes.filter((s) => s.imageUrl || s.images.some((i) => i.imageUrl))
    const prodScenes: StepStatus = {
      label: '场景图片',
      completed: scenesWithImage.length,
      total: scenes.length,
      status: scenes.length > 0 && scenesWithImage.length >= scenes.length
        ? 'done'
        : scenesWithImage.length > 0
          ? 'partial'
          : 'pending',
    }

    // Step 8: Dubbing / TTS (配音生成)
    const dialogueCount = storyboards.filter((s) => s.dialogue).length
    const ttsCompleted = storyboards.filter((s) => s.ttsAudioUrl).length
    const prodDubbing: StepStatus = {
      label: '配音生成',
      completed: ttsCompleted,
      total: dialogueCount || total, // If no dialogue yet, show against total storyboards
      status: dialogueCount > 0 && ttsCompleted >= dialogueCount
        ? 'done'
        : ttsCompleted > 0
          ? 'partial'
          : 'pending',
    }

    // Step 9: Shot Frames (镜头图片 — first + last frame)
    const framesCompleted = storyboards.filter((s) => s.firstFrameUrl || s.lastFrameUrl).length
    const prodShots: StepStatus = {
      label: '镜头图片',
      completed: framesCompleted,
      total,
      status: total > 0 && framesCompleted === total
        ? 'done'
        : framesCompleted > 0
          ? 'partial'
          : 'pending',
    }

    // Step 10: Video Generation (视频生成)
    const videosCompleted = storyboards.filter((s) => s.videoUrl).length
    const prodVideos: StepStatus = {
      label: '视频生成',
      completed: videosCompleted,
      total,
      status: total > 0 && videosCompleted === total
        ? 'done'
        : videosCompleted > 0
          ? 'partial'
          : 'pending',
    }

    // Step 11: Video Compositing (视频合成)
    const composedCompleted = storyboards.filter((s) => s.composedUrl).length
    const prodCompose: StepStatus = {
      label: '视频合成',
      completed: composedCompleted,
      total,
      status: total > 0 && composedCompleted === total
        ? 'done'
        : composedCompleted > 0
          ? 'partial'
          : 'pending',
    }

    // ── Export Stage ──

    // Step 12: Merge & Export (拼接导出)
    const latestMerge = await db.videoMerge.findFirst({
      where: { episodeId: id },
      orderBy: { createdAt: 'desc' },
    })

    const exportMerge: StepStatus = {
      label: '拼接导出',
      completed: episode.videoUrl ? 1 : 0,
      total: 1,
      status: episode.videoUrl
        ? 'done'
        : latestMerge?.status === 'processing'
          ? 'partial'
          : 'pending',
      extra: {
        mergedUrl: episode.videoUrl,
        mergeStatus: latestMerge?.status || null,
        mergeDuration: latestMerge?.duration || 0,
      },
    }

    // ── Overall Pipeline Progress ──
    const steps: StepStatus[] = [
      scriptRaw, scriptRewrite, scriptExtract, scriptVoice, scriptStoryboard,
      prodChars, prodScenes, prodDubbing, prodShots, prodVideos, prodCompose,
      exportMerge,
    ]

    // Calculate overall progress (weighted)
    const totalWeight = steps.reduce((sum, s) => sum + s.total, 0)
    const completedWeight = steps.reduce((sum, s) => sum + s.completed, 0)
    const overallProgress = totalWeight > 0 ? Math.round((completedWeight / totalWeight) * 100) : 0

    // Find the current active step
    let currentStep = ''
    for (const step of steps) {
      if (step.status === 'partial') {
        currentStep = step.label
        break
      }
      if (step.status === 'pending') {
        currentStep = step.label
        break
      }
    }
    if (!currentStep && steps.every((s) => s.status === 'done')) {
      currentStep = 'completed'
    }

    // FFmpeg availability
    const ffmpegAvailable = await isFFmpegAvailable()

    // Build pipeline object with new stage-prefixed keys
    const pipeline: Record<string, StepStatus> = {
      'script:raw': scriptRaw,
      'script:rewrite': scriptRewrite,
      'script:extract': scriptExtract,
      'script:voice': scriptVoice,
      'script:storyboard': scriptStoryboard,
      'prod:chars': prodChars,
      'prod:scenes': prodScenes,
      'prod:dubbing': prodDubbing,
      'prod:shots': prodShots,
      'prod:videos': prodVideos,
      'prod:compose': prodCompose,
      'export:merge': exportMerge,
    }

    return NextResponse.json({
      // Detailed pipeline with stage-prefixed keys
      pipeline,
      // Legacy keys for backward compatibility
      steps: {
        rawContent: scriptRaw,
        scriptRewrite,
        characterExtract: scriptExtract,
        voiceAssign: scriptVoice,
        storyboard: scriptStoryboard,
        characterImages: prodChars,
        sceneImages: prodScenes,
        dubbing: prodDubbing,
        shotFrames: prodShots,
        video: prodVideos,
        composeMerge: prodCompose,
      },
      // Summary
      summary: {
        totalSteps: steps.length,
        completedSteps: steps.filter((s) => s.status === 'done').length,
        partialSteps: steps.filter((s) => s.status === 'partial').length,
        pendingSteps: steps.filter((s) => s.status === 'pending').length,
        overallProgress,
        currentStep,
      },
      // Environment
      ffmpegAvailable,
      // Total steps count
      totalSteps: steps.length,
      completedSteps: steps.filter((s) => s.status === 'done').length,
      progressPercent: overallProgress,
    })
  } catch (error) {
    console.error('Failed to get pipeline status:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
