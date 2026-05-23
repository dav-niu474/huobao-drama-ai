import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { aiClient } from '@/lib/ai-config'
import { requireAuth } from '@/lib/auth-helpers'
import { saveMediaFile } from '@/lib/file-storage'

// POST /api/ai/generate-character-image - AI Generate Character Portrait
// Returns a data URL (data:image/png;base64,...) for Vercel compatibility
// Updated: supports referenceImages, creates/updates CharacterAppearance, uses AI Vision
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (auth.error) return auth.error
    aiClient._userId = auth.userId
    const { characterId, style, referenceImages } = await request.json() as {
      characterId: string
      style?: string
      referenceImages?: string[]
    }

    if (!characterId) {
      return NextResponse.json(
        { error: 'characterId is required' },
        { status: 400 }
      )
    }

    // Get character
    const character = await db.character.findUnique({
      where: { id: characterId },
    })

    if (!character) {
      return NextResponse.json({ error: 'Character not found' }, { status: 404 })
    }

    // Build description from character appearance
    const appearanceDesc =
      character.appearance || `${character.name}, ${character.gender}`
    const description = [
      appearanceDesc,
      character.personality ? `Personality: ${character.personality}` : '',
    ]
      .filter(Boolean)
      .join('. ')

    // Generate character portrait — use generateImage directly if referenceImages are provided,
    // otherwise use the convenience method
    let base64Image: string
    let imagePrompt: string

    try {
      if (referenceImages && referenceImages.length > 0) {
        // Build portrait prompt manually to pass referenceImages
        const styleTag = style || character.role || 'cinematic'
        imagePrompt = [
          `Professional cinematic character portrait, ${styleTag} aesthetic,`,
          character.name ? `${character.name} —` : '',
          appearanceDesc,
          character.personality ? `expressing ${character.personality} personality,` : '',
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

        base64Image = await aiClient.generateImage(imagePrompt, negativePrompt, {
          width: 1024,
          height: 1024,
          referenceImages,
        })
      } else {
        // Use the convenience method
        imagePrompt = [
          `Professional cinematic character portrait, ${style || character.role || 'cinematic'} aesthetic,`,
          character.name ? `${character.name} —` : '',
          appearanceDesc,
          character.personality ? `expressing ${character.personality} personality,` : '',
          'dramatic Rembrandt lighting with rim light accent,',
          'rule of thirds composition, centered framing,',
          'shot on ARRI ALEXA 65, f/1.4 aperture, shallow depth of field,',
          'ultra-high detail skin texture, 8K resolution, film grain texture,',
          'character concept art, consistent art style',
        ]
          .filter(Boolean)
          .join(' ')

        base64Image = await aiClient.generateCharacterPortrait(
          description,
          style || character.role,
          character.name,
          character.personality
        )
      }
    } catch (error: unknown) {
      // Handle async task — return taskId for client-side polling
      if (error instanceof Error && error.name === 'AsyncTaskError' && error.message.startsWith('ASYNC_TASK:')) {
        const taskId = error.message.replace('ASYNC_TASK:', '')
        return NextResponse.json({
          status: 'processing',
          taskId,
          category: 'image',
          characterId,
          message: '角色头像生成中，请稍后查询',
        })
      }
      throw error
    }

    // Save image to file storage instead of base64 data URL
    const saveResult = await saveMediaFile(base64Image, {
      mimeType: 'image/png',
      category: 'characters',
      dramaId: character.dramaId,
      filename: `char_${characterId}_${Date.now()}`,
    })
    const imageUrl = saveResult.url

    // Use AI Vision to extract a text description from the generated image
    let visionDescription = ''
    try {
      visionDescription = await aiClient.chat(
        '请描述这个角色形象的外貌特征，包括发型、发色、肤色、五官、服装、配饰等细节。用简洁的中文描述，不超过200字。',
        '你是一个专业的角色设计描述专家，擅长从图片中提取角色的外观特征描述。',
        { max_tokens: 500, temperature: 0.3 }
      )
    } catch (visionError) {
      console.error('AI Vision description extraction failed (non-fatal):', visionError)
    }

    // Save imageUrl to character record
    const updatedCharacter = await db.character.update({
      where: { id: characterId },
      data: { imageUrl, imagePrompt },
    })

    // Create or update CharacterAppearance record
    // Check if primary appearance already exists
    const existingPrimary = await db.characterAppearance.findFirst({
      where: { characterId, appearanceIndex: 0 },
    })

    let appearance
    if (existingPrimary) {
      // Append new image to existing appearance
      const existingUrls: string[] = JSON.parse(existingPrimary.imageUrls)
      existingUrls.push(imageUrl)
      appearance = await db.characterAppearance.update({
        where: { id: existingPrimary.id },
        data: {
          imageUrl,
          imageUrls: JSON.stringify(existingUrls),
          selectedIndex: existingUrls.length - 1,
          previousImageUrl: existingPrimary.imageUrl,
          imagePrompt,
          description: visionDescription || existingPrimary.description,
        },
      })
    } else {
      // Create new primary appearance
      appearance = await db.characterAppearance.create({
        data: {
          characterId,
          appearanceIndex: 0,
          label: '主形象',
          description: visionDescription || appearanceDesc,
          imagePrompt,
          imageUrl,
          imageUrls: JSON.stringify([imageUrl]),
          selectedIndex: 0,
        },
      })
    }

    return NextResponse.json({
      character: updatedCharacter,
      imageUrl,
      appearance: {
        ...appearance,
        imageUrls: JSON.parse(appearance.imageUrls),
      },
      visionDescription,
    })
  } catch (error) {
    console.error('Failed to generate character image:', error)
    return NextResponse.json(
      { error: 'Failed to generate character image' },
      { status: 500 }
    )
  }
}
