import { NextRequest, NextResponse } from 'next/server'
import { aiClient } from '@/lib/ai-config'
import { requireAuth } from '@/lib/auth-helpers'
import {
  collectStoryboardReferences,
  buildEnhancedPrompt,
  collectCharacterReferences,
  collectSceneReferences,
} from '@/lib/reference-collector'

// POST /api/ai/generate-image - AI Generate Image (multi-provider)
// Supports reference image injection for character/scene consistency
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (auth.error) return auth.error
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

      // Build enhanced prompt with text descriptions from references
      // (helps even for providers that support reference images natively)
      if (storyboardId || atmosphere) {
        enhancedPrompt = buildEnhancedPrompt(prompt, refs)
      }
    } else if (characterId) {
      // Character portrait generation — use primary appearance as reference
      referenceImages = await collectCharacterReferences(characterId)
    } else if (sceneId) {
      // Scene image generation — use existing scene images as reference
      referenceImages = await collectSceneReferences(sceneId)
    }

    // Filter out invalid/empty URLs
    referenceImages = referenceImages.filter(
      (url) => url && url.trim() && (url.startsWith('data:') || url.startsWith('http'))
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
          size: size || '1024x1024',
          referenceImages: referenceImages.length > 0 ? referenceImages : undefined,
        })
      }
    } catch (error: unknown) {
      // Handle async task — return taskId for client-side polling
      if (error instanceof Error && error.name === 'AsyncTaskError' && error.message.startsWith('ASYNC_TASK:')) {
        const taskId = error.message.replace('ASYNC_TASK:', '')
        return NextResponse.json({
          status: 'processing',
          taskId,
          category: 'image',
          message: '图片生成中，请稍后查询',
        })
      }
      throw error
    }

    // Convert base64 to data URL
    const imageUrl = `data:image/png;base64,${base64Image}`

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
