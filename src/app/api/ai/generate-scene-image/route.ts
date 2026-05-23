import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { aiClient } from '@/lib/ai-config'
import { requireAuth } from '@/lib/auth-helpers'
import { saveMediaFile } from '@/lib/file-storage'

// POST /api/ai/generate-scene-image - AI Generate Scene Image
// Generates an image from a scene's prompt and saves it to the scene record
// Updated: supports referenceImages, creates SceneImage record
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (auth.error) return auth.error
    aiClient._userId = auth.userId
    const { sceneId, style, referenceImages } = await request.json() as {
      sceneId: string
      style?: string
      referenceImages?: string[]
    }

    if (!sceneId) {
      return NextResponse.json(
        { error: 'sceneId is required' },
        { status: 400 }
      )
    }

    // Get scene
    const scene = await db.scene.findUnique({
      where: { id: sceneId },
    })

    if (!scene) {
      return NextResponse.json({ error: 'Scene not found' }, { status: 404 })
    }

    // Build prompt from scene info
    const scenePrompt = scene.prompt || [
      'Cinematic establishing shot,',
      style ? `${style} style,` : '',
      scene.location,
      scene.timeOfDay ? `${scene.timeOfDay} lighting,` : '',
      scene.description,
      'professional cinematography, high quality, film still',
    ].filter(Boolean).join(' ')

    if (!scenePrompt.trim()) {
      return NextResponse.json(
        { error: 'Scene has no prompt or description to generate image from' },
        { status: 400 }
      )
    }

    const negativePrompt = 'blurry, low quality, amateur, cartoon, anime, watermark, text overlay, people, characters'

    // Generate scene image with optional reference images
    let base64Image: string
    try {
      base64Image = await aiClient.generateImage(scenePrompt, negativePrompt, {
        width: 1344,
        height: 768,
        referenceImages,
      })
    } catch (error: unknown) {
      // Handle async task — return taskId for client-side polling
      if (error instanceof Error && error.name === 'AsyncTaskError' && error.message.startsWith('ASYNC_TASK:')) {
        const taskId = error.message.replace('ASYNC_TASK:', '')
        return NextResponse.json({
          status: 'processing',
          taskId,
          category: 'image',
          sceneId,
          message: '场景图生成中，请稍后查询',
        })
      }
      throw error
    }

    // Save image to file storage instead of base64 data URL
    const saveResult = await saveMediaFile(base64Image, {
      mimeType: 'image/png',
      category: 'scenes',
      dramaId: scene.dramaId,
      filename: `scene_${sceneId}_${Date.now()}`,
    })
    const imageUrl = saveResult.url

    // Save imageUrl to scene record
    const updatedScene = await db.scene.update({
      where: { id: sceneId },
      data: { imageUrl },
    })

    // Create a SceneImage record
    const sceneImage = await db.sceneImage.create({
      data: {
        sceneId,
        description: scenePrompt,
        imageUrl,
        timeOfDay: scene.timeOfDay || '',
        angle: 'wide',
        isSelected: false,
      },
    })

    // If no other image is selected for this scene, auto-select this one
    const selectedCount = await db.sceneImage.count({
      where: { sceneId, isSelected: true },
    })
    if (selectedCount === 0) {
      await db.sceneImage.update({
        where: { id: sceneImage.id },
        data: { isSelected: true },
      })
    }

    return NextResponse.json({
      scene: updatedScene,
      imageUrl,
      sceneImage,
    })
  } catch (error) {
    console.error('Failed to generate scene image:', error)
    const message = error instanceof Error ? error.message : 'Failed to generate scene image'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
