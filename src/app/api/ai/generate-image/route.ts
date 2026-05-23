import { NextRequest, NextResponse } from 'next/server'
import { aiClient } from '@/lib/ai-config'
import { requireAuth } from '@/lib/auth-helpers'
import { getActiveProviderForUser } from '@/lib/ai-config'
import {
  collectStoryboardReferences,
  buildEnhancedPrompt,
  buildConsistencyPrompt,
  collectCharacterReferences,
  collectSceneReferences,
} from '@/lib/reference-collector'
import { recordGenerationCost, calcImageCredits } from '@/lib/cost-tracker'
import { saveMediaFile } from '@/lib/file-storage'

// POST /api/ai/generate-image - AI Generate Image (multi-provider)
// Supports reference image injection for character/scene consistency
export async function POST(request: NextRequest) {
  const startTime = Date.now()
  let dramaId: string | undefined
  let providerName = ''
  let modelName = ''
  let imageSize = '1024x1024'

  try {
    const auth = await requireAuth()
    if (auth.error) return auth.error
    aiClient._userId = auth.userId
    const {
      prompt,
      size,
      storyboardId,
      atmosphere,
      // Reference image injection parameters
      episodeId,
      dialogueChar,
      sceneLocation,
      // Direct reference for character/scene generation
      characterId,
      sceneId,
      shotType,
      cameraAngle,
      style,
    } = await request.json()

    if (!prompt) {
      return NextResponse.json(
        { error: 'prompt is required' },
        { status: 400 }
      )
    }

    imageSize = size || '1024x1024'

    // Resolve provider/model info for cost tracking
    try {
      const provider = await getActiveProviderForUser('image', auth.userId)
      if (provider) {
        providerName = provider.provider
        modelName = provider.model
      }
    } catch {
      // non-critical
    }

    // Resolve dramaId from storyboard/character/scene
    let dramaStyleTemplate = ''
    try {
      if (storyboardId) {
        const { db } = await import('@/lib/db')
        const sb = await db.storyboard.findUnique({ where: { id: storyboardId }, select: { episode: { select: { dramaId: true } } } })
        if (sb) dramaId = sb.episode.dramaId
      } else if (characterId) {
        const { db } = await import('@/lib/db')
        const ch = await db.character.findUnique({ where: { id: characterId }, select: { dramaId: true } })
        if (ch) dramaId = ch.dramaId
      } else if (sceneId) {
        const { db } = await import('@/lib/db')
        const sc = await db.scene.findUnique({ where: { id: sceneId }, select: { dramaId: true } })
        if (sc) dramaId = sc.dramaId
      }
      // Fetch drama-level style template for consistency
      if (dramaId) {
        const { db } = await import('@/lib/db')
        const drama = await db.drama.findUnique({ where: { id: dramaId }, select: { styleTemplate: true } })
        dramaStyleTemplate = drama?.styleTemplate || ''
      }
    } catch {
      // non-critical
    }

    // Collect reference images based on context
    let referenceImages: string[] = []
    let enhancedPrompt = prompt

    if (episodeId) {
      // Storyboard frame generation with episode context
      const refs = await collectStoryboardReferences(
        episodeId,
        dialogueChar,
        sceneLocation
      )
      referenceImages = refs.allImageUrls

      // Use buildConsistencyPrompt when style locks are active (stronger consistency),
      // otherwise fall back to buildEnhancedPrompt (lighter touch)
      const hasStyleLocks = refs.characterImages.some(c => c.styleLock) || refs.sceneImages.some(s => s.styleLock)
      if (hasStyleLocks) {
        enhancedPrompt = buildConsistencyPrompt(prompt, refs, dramaStyleTemplate)
      } else if (storyboardId || atmosphere) {
        enhancedPrompt = buildEnhancedPrompt(prompt, refs)
      }
    } else if (characterId) {
      // Character portrait generation — use primary appearance as reference
      referenceImages = await collectCharacterReferences(characterId)
    } else if (sceneId) {
      // Scene image generation — use existing scene images as reference
      referenceImages = await collectSceneReferences(sceneId)
    }

    // Filter out invalid/empty URLs (accept data:, http, and file storage paths)
    referenceImages = referenceImages.filter(
      (url) => url && url.trim() && (url.startsWith('data:') || url.startsWith('http') || url.startsWith('/api/files/'))
    )

    // Generate image using multi-provider aiClient
    let base64Image: string

    try {
      if (storyboardId || atmosphere || episodeId) {
        base64Image = await aiClient.generateStoryboardFrame(
          enhancedPrompt,
          atmosphere,
          shotType,
          cameraAngle,
          style,
          referenceImages.length > 0 ? referenceImages : undefined
        )
      } else if (characterId) {
        base64Image = await aiClient.generateCharacterPortrait(
          enhancedPrompt,
          style,
          undefined, // characterName
          undefined, // personality
          referenceImages.length > 0 ? referenceImages : undefined
        )
      } else if (sceneId) {
        base64Image = await aiClient.generateSceneImage(
          enhancedPrompt,
          undefined, // timeOfDay
          style,
          undefined, // weather
          referenceImages.length > 0 ? referenceImages : undefined
        )
      } else {
        const negativePrompt =
          'blurry, low quality, distorted, watermark, text overlay'
        base64Image = await aiClient.generateImage(prompt, negativePrompt, {
          size: imageSize,
          referenceImages: referenceImages.length > 0 ? referenceImages : undefined,
        })
      }
    } catch (error: unknown) {
      // Handle async task — return taskId for client-side polling
      if (error instanceof Error && error.name === 'AsyncTaskError' && error.message.startsWith('ASYNC_TASK:')) {
        const taskId = error.message.replace('ASYNC_TASK:', '')
        // Record cost for async task (partial — actual cost when poll completes)
        if (dramaId) {
          try {
            recordGenerationCost({
              dramaId,
              episodeId: episodeId || undefined,
              category: 'image',
              provider: providerName,
              model: modelName,
              credits: calcImageCredits(imageSize),
              generationMs: Date.now() - startTime,
            })
          } catch { /* non-blocking */ }
        }
        return NextResponse.json({
          status: 'processing',
          taskId,
          category: 'image',
          message: '图片生成中，请稍后查询',
        })
      }
      throw error
    }

    // Save image to file storage instead of base64 data URL
    const saveResult = await saveMediaFile(base64Image, {
      mimeType: 'image/png',
      category: characterId ? 'characters' : sceneId ? 'scenes' : 'storyboards',
      dramaId,
      filename: `img_${Date.now()}`,
    })
    const imageUrl = saveResult.url

    // Record cost for successful sync generation
    if (dramaId) {
      try {
        recordGenerationCost({
          dramaId,
          episodeId: episodeId || undefined,
          category: 'image',
          provider: providerName,
          model: modelName,
          credits: calcImageCredits(imageSize),
          generationMs: Date.now() - startTime,
        })
      } catch { /* non-blocking */ }
    }

    return NextResponse.json({
      imageUrl,
      prompt: enhancedPrompt,
      referenceCount: referenceImages.length,
    })
  } catch (error) {
    console.error('Failed to generate image:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
