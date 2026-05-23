import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { aiClient } from '@/lib/ai-config'
import { collectCharacterReferences } from '@/lib/reference-collector'
import { saveMediaFile } from '@/lib/file-storage'

// GET /api/characters/[id]/appearances - List all appearances for a character
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: characterId } = await params

    const character = await db.character.findUnique({
      where: { id: characterId },
    })

    if (!character) {
      return NextResponse.json({ error: 'Character not found' }, { status: 404 })
    }

    const appearances = await db.characterAppearance.findMany({
      where: { characterId },
      orderBy: { appearanceIndex: 'asc' },
    })

    // Parse imageUrls JSON for each appearance
    const result = appearances.map((a) => ({
      ...a,
      imageUrls: JSON.parse(a.imageUrls),
    }))

    return NextResponse.json({ appearances: result })
  } catch (error) {
    console.error('Failed to list appearances:', error)
    return NextResponse.json({ error: 'Failed to list appearances' }, { status: 500 })
  }
}

// POST /api/characters/[id]/appearances - Create a new appearance
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: characterId } = await params

    const character = await db.character.findUnique({
      where: { id: characterId },
    })

    if (!character) {
      return NextResponse.json({ error: 'Character not found' }, { status: 404 })
    }

    const body = await request.json()
    const { label, description, imagePrompt, generateImage, style, referenceImages } = body as {
      label?: string
      description?: string
      imagePrompt?: string
      generateImage?: boolean
      style?: string
      referenceImages?: string[]
    }

    // Determine next appearance index
    const existingCount = await db.characterAppearance.count({
      where: { characterId },
    })
    const appearanceIndex = existingCount

    let imageUrl: string | null = null
    let imageUrls: string[] = []
    let finalDescription = description || ''
    let finalImagePrompt = imagePrompt || ''

    if (generateImage) {
      // Build portrait prompt
      const appearanceDesc = character.appearance || `${character.name}, ${character.gender}`
      const prompt = finalImagePrompt || [
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

      const negativePrompt =
        'blurry, low quality, distorted face, extra limbs, deformed, watermark, text, signature, cartoon, anime'

      // Collect reference images from primary appearance for consistency
      let autoRefs = await collectCharacterReferences(characterId)

      // Merge with explicitly provided referenceImages
      if (referenceImages?.length) {
        const merged = [...referenceImages, ...autoRefs]
        autoRefs = Array.from(new Set(merged)).filter(Boolean)
      }

      // Filter out invalid URLs
      autoRefs = autoRefs.filter(
        (url) => url && url.trim() && (url.startsWith('data:') || url.startsWith('http') || url.startsWith('/api/files/'))
      )

      // Generate image with reference images for character consistency
      const base64Image = await aiClient.generateImage(prompt, negativePrompt, {
        width: 1024,
        height: 1024,
        referenceImages: autoRefs.length > 0 ? autoRefs : undefined,
      })

      // Save to file storage instead of base64 data URL
      const saveResult = await saveMediaFile(base64Image, {
        mimeType: 'image/png',
        category: 'characters',
        dramaId: character.dramaId,
        filename: `appearance_${characterId}_${Date.now()}`,
      })
      imageUrl = saveResult.url
      imageUrls = [imageUrl]
      finalImagePrompt = prompt

      // Use AI Vision to extract a text description from the generated image
      try {
        const visionResult = await aiClient.chat(
          '请描述这个角色形象的外貌特征，包括发型、发色、肤色、五官、服装、配饰等细节。用简洁的中文描述，不超过200字。',
          '你是一个专业的角色设计描述专家，擅长从图片中提取角色的外观特征描述。',
          { max_tokens: 500, temperature: 0.3 }
        )
        if (visionResult && !finalDescription) {
          finalDescription = visionResult
        }
      } catch (visionError) {
        console.error('AI Vision description extraction failed (non-fatal):', visionError)
      }
    }

    const appearance = await db.characterAppearance.create({
      data: {
        characterId,
        appearanceIndex,
        label: label || (appearanceIndex === 0 ? '主形象' : `形态 ${appearanceIndex}`),
        description: finalDescription,
        imagePrompt: finalImagePrompt,
        imageUrl,
        imageUrls: JSON.stringify(imageUrls),
        selectedIndex: 0,
      },
    })

    // Also update character's main imageUrl if this is the first appearance
    if (appearanceIndex === 0 && imageUrl) {
      await db.character.update({
        where: { id: characterId },
        data: { imageUrl, imagePrompt: finalImagePrompt },
      })
    }

    return NextResponse.json(
      { ...appearance, imageUrls: JSON.parse(appearance.imageUrls) },
      { status: 201 }
    )
  } catch (error) {
    console.error('Failed to create appearance:', error)
    return NextResponse.json({ error: 'Failed to create appearance' }, { status: 500 })
  }
}
