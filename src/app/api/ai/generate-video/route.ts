import { NextRequest, NextResponse } from 'next/server'
import { aiClient } from '@/lib/ai-config'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-helpers'
import { getActiveProviderForUser } from '@/lib/ai-config'
import { recordGenerationCost, calcVideoCredits } from '@/lib/cost-tracker'

// POST /api/ai/generate-video - Generate video for a storyboard shot (multi-provider)
// Supports both text-to-video (no firstFrameUrl) and image-to-video (with firstFrameUrl)
// When firstFrameUrl is provided, uses it as the first frame for image-to-video generation
// When firstFrameUrl is absent, uses text-to-video (prompt-only)

/**
 * Enhance a raw video prompt with production-quality tags for short drama.
 * Adds cinematic motion, aspect ratio, consistency, and quality tags.
 */
function enhanceVideoPrompt(
  rawPrompt: string,
  cameraMovement?: string
): string {
  const movementTag = cameraMovement && cameraMovement !== 'static'
    ? `smooth camera ${cameraMovement},`
    : 'smooth subtle camera movement,'

  const enhancedParts = [
    rawPrompt,
    movementTag,
    'cinematic motion, fluid animation,',
    'consistent character appearance throughout,',
    'professional short drama quality,',
    '9:16 vertical format,',
    'no text, no watermark, no subtitles',
  ]

  return enhancedParts.filter(Boolean).join(' ')
}

export async function POST(request: NextRequest) {
  const startTime = Date.now()
  let providerName = ''
  let modelName = ''

  try {
    const auth = await requireAuth()
    if (auth.error) return auth.error
    aiClient._userId = auth.userId
    const { storyboardId, prompt, firstFrameUrl } = await request.json()

    if (!storyboardId) {
      return NextResponse.json(
        { error: 'storyboardId is required' },
        { status: 400 }
      )
    }

    // Get storyboard from DB
    const storyboard = await db.storyboard.findUnique({
      where: { id: storyboardId },
    })

    if (!storyboard) {
      return NextResponse.json(
        { error: 'Storyboard not found' },
        { status: 404 }
      )
    }

    // Resolve provider/model info for cost tracking
    try {
      const provider = await getActiveProviderForUser('video', auth.userId)
      if (provider) {
        providerName = provider.provider
        modelName = provider.model
      }
    } catch {
      // non-critical
    }

    // Use storyboard's videoPrompt if no prompt provided
    const rawVideoPrompt = prompt || storyboard.videoPrompt || storyboard.action || ''

    if (!rawVideoPrompt) {
      return NextResponse.json(
        { error: 'No prompt provided and storyboard has no video prompt or action' },
        { status: 400 }
      )
    }

    // Enhance the video prompt with quality tags
    const videoPrompt = enhanceVideoPrompt(rawVideoPrompt, storyboard.cameraMovement || undefined)

    // firstFrameUrl is optional - when present, it's image-to-video; when absent, text-to-video
    const frameUrl = firstFrameUrl || storyboard.firstFrameUrl || undefined

    // Resolve dramaId and episodeId for cost tracking
    let dramaId: string | undefined
    let episodeId: string | undefined
    try {
      const episode = await db.episode.findUnique({
        where: { id: storyboard.episodeId },
        select: { dramaId: true, id: true },
      })
      if (episode) {
        dramaId = episode.dramaId
        episodeId = episode.id
      }
    } catch {
      // non-critical
    }

    // Use multi-provider aiClient
    // The aiClient.generateVideo handles both text-to-video and image-to-video
    try {
      await aiClient.generateVideo(storyboardId, videoPrompt, frameUrl)
    } catch (error: unknown) {
      // Handle async task — return taskId for client-side polling
      if (error instanceof Error && error.name === 'AsyncTaskError' && error.message.startsWith('ASYNC_TASK:')) {
        const taskId = error.message.replace('ASYNC_TASK:', '')
        // Record cost for async task
        if (dramaId) {
          try {
            recordGenerationCost({
              dramaId,
              episodeId,
              category: 'video',
              provider: providerName,
              model: modelName,
              credits: calcVideoCredits(5),
              generationMs: Date.now() - startTime,
            })
          } catch { /* non-blocking */ }
        }
        return NextResponse.json({
          status: 'processing',
          taskId,
          category: 'video',
          storyboardId,
          message: '视频生成中，请稍后查询',
        })
      }
      throw error
    }

    // Fetch updated storyboard
    const updatedStoryboard = await db.storyboard.findUnique({
      where: { id: storyboardId },
    })

    // Record cost for successful generation
    if (dramaId) {
      try {
        recordGenerationCost({
          dramaId,
          episodeId,
          category: 'video',
          provider: providerName,
          model: modelName,
          credits: calcVideoCredits(5),
          generationMs: Date.now() - startTime,
        })
      } catch { /* non-blocking */ }
    }

    return NextResponse.json({
      storyboard: updatedStoryboard,
      mode: frameUrl ? 'image-to-video' : 'text-to-video',
    })
  } catch (error) {
    console.error('Failed to generate video:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
