import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  determineGenerationMode,
  buildKeyframePlan,
  computeImageSize,
  getKeyframeStatus,
  type StoryboardLike,
  type DramaLike,
} from '@/lib/creative/keyframe-service'

// POST /api/storyboards/[id]/keyframe — Generate keyframe based on generation mode
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { mode, candidateCount } = body as { mode?: string; candidateCount?: number }

    // Fetch storyboard with episode and drama info
    const storyboard = await db.storyboard.findUnique({
      where: { id },
      include: {
        episode: {
          include: { drama: true },
        },
      },
    })

    if (!storyboard) {
      return NextResponse.json({ error: 'Storyboard not found' }, { status: 404 })
    }

    const drama = storyboard.episode.drama
    const generationMode = (mode || storyboard.generationMode || determineGenerationMode(storyboard as StoryboardLike)) as string

    // Update generation mode on the storyboard
    await db.storyboard.update({
      where: { id },
      data: { generationMode },
    })

    const numCandidates = Math.max(1, Math.min(candidateCount ?? 1, 4))
    const aspectRatio = drama.aspectRatio ?? '9:16'
    const size = computeImageSize(aspectRatio)

    // Build art style prefix
    const artStyleParts: string[] = []
    if (drama.styleTemplate) artStyleParts.push(drama.styleTemplate)
    if (drama.artStyle) artStyleParts.push(drama.artStyle)

    // Build prompt from storyboard
    const promptParts: string[] = [...artStyleParts]
    if (storyboard.imagePrompt) {
      promptParts.push(storyboard.imagePrompt)
    } else {
      if (storyboard.shotType) promptParts.push(storyboard.shotType)
      if (storyboard.cameraAngle) promptParts.push(storyboard.cameraAngle)
      if (storyboard.description) promptParts.push(storyboard.description)
      if (storyboard.action) promptParts.push(storyboard.action)
      if (storyboard.atmosphere) promptParts.push(`atmosphere: ${storyboard.atmosphere}`)
    }
    const prompt = promptParts.filter(Boolean).join(', ')

    if (!prompt) {
      return NextResponse.json({ error: 'No prompt available for keyframe generation' }, { status: 400 })
    }

    const results: Record<string, unknown> = {
      storyboardId: id,
      generationMode,
      prompt,
      size,
    }

    switch (generationMode) {
      case 'image2video': {
        // Generate first frame image(s)
        // For candidate generation, we call the image generation API multiple times
        const imageCalls = []
        for (let i = 0; i < numCandidates; i++) {
          imageCalls.push({
            prompt: i === 0 ? prompt : `${prompt}, variation ${i + 1}`,
            size,
            frameType: 'first_frame',
          })
        }
        results.mode = 'image2video'
        results.imageCalls = imageCalls
        results.message = numCandidates > 1
          ? `Will generate ${numCandidates} candidate first-frame images`
          : 'Will generate first-frame image for video generation'
        break
      }

      case 'first_last': {
        // Generate both first and last frame images
        const lastFramePrompt = `${prompt}, ending frame, final moment of the shot`
        results.mode = 'first_last'
        results.firstFrameCall = { prompt, size, frameType: 'first_frame' }
        results.lastFrameCall = { prompt: lastFramePrompt, size, frameType: 'last_frame' }
        results.message = 'Will generate first-frame and last-frame images for interpolation video'
        break
      }

      case 'grid': {
        // Generate grid image (2x2 or 3x1 layout)
        const gridLayout = body.gridLayout ?? { rows: 2, cols: 2 }
        results.mode = 'grid'
        results.gridLayout = gridLayout
        results.prompt = `A ${gridLayout.rows}x${gridLayout.cols} grid layout image. ${prompt}`
        results.size = gridLayout.rows >= 2 && gridLayout.cols >= 2 ? '1344x1344' : size
        results.message = `Will generate ${gridLayout.rows}x${gridLayout.cols} grid image`
        break
      }

      case 'reference_video': {
        // Validate reference video exists
        if (!storyboard.videoUrl && !storyboard.referenceImages) {
          return NextResponse.json(
            { error: 'Reference video or reference images required for reference_video mode' },
            { status: 400 }
          )
        }
        results.mode = 'reference_video'
        results.referenceVideoUrl = storyboard.videoUrl
        results.referenceImages = storyboard.referenceImages
        results.prompt = prompt
        results.message = 'Will use reference video for style transfer'
        break
      }

      default:
        return NextResponse.json({ error: `Unknown generation mode: ${generationMode}` }, { status: 400 })
    }

    return NextResponse.json(results)
  } catch (error) {
    console.error('Failed to generate keyframe:', error)
    return NextResponse.json({ error: 'Failed to generate keyframe' }, { status: 500 })
  }
}

// GET /api/storyboards/[id]/keyframe — Query keyframe status and results
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const storyboard = await db.storyboard.findUnique({
      where: { id },
    })

    if (!storyboard) {
      return NextResponse.json({ error: 'Storyboard not found' }, { status: 404 })
    }

    const status = getKeyframeStatus(storyboard as StoryboardLike)

    // Parse candidate URLs
    let candidateUrls: string[] = []
    if (storyboard.candidateUrls) {
      try {
        candidateUrls = JSON.parse(storyboard.candidateUrls)
      } catch { /* ignore */ }
    }

    // Parse grid layout
    let gridLayout: Record<string, unknown> | null = null
    if (storyboard.gridLayout) {
      try {
        gridLayout = JSON.parse(storyboard.gridLayout)
      } catch { /* ignore */ }
    }

    return NextResponse.json({
      storyboardId: id,
      status,
      generationMode: storyboard.generationMode,
      firstFrameUrl: storyboard.firstFrameUrl,
      lastFrameUrl: storyboard.lastFrameUrl,
      startFrameImageUrl: storyboard.startFrameImageUrl,
      endFrameImageUrl: storyboard.endFrameImageUrl,
      gridImageUrl: storyboard.gridImageUrl,
      gridLayout,
      candidateUrls,
      selectedCandidateIndex: storyboard.selectedCandidateIndex,
      imagePrompt: storyboard.imagePrompt,
      videoPrompt: storyboard.videoPrompt,
    })
  } catch (error) {
    console.error('Failed to get keyframe status:', error)
    return NextResponse.json({ error: 'Failed to get keyframe status' }, { status: 500 })
  }
}
