import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { aiClient } from '@/lib/ai-config'
import { requireAuth } from '@/lib/auth-helpers'
import { saveMediaFile } from '@/lib/file-storage'

// POST /api/ai/generate-character-sheet - Generate character sheet (三视图)
// This is the KEY mechanism for consistency — a reference image showing the character
// from front, side, and back views.
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

    // Build character description for the prompt
    const appearanceDesc = character.appearance || `${character.name}, ${character.gender}`
    const characterDescription = [
      appearanceDesc,
      character.personality ? `性格: ${character.personality}` : '',
      character.age ? `年龄: ${character.age}` : '',
    ]
      .filter(Boolean)
      .join('。')

    // Build the character sheet prompt (三视图)
    const sheetPrompt = [
      characterDescription ? `${characterDescription}。` : '',
      '角色设定图，画面分为左右两个区域：【左侧区域】占约1/3宽度，是角色的正面特写，面部细节清晰可见；',
      '【右侧区域】占约2/3宽度，是角色三视图横向排列（从左到右依次为：正面全身、侧面全身、背面全身），三视图高度一致。',
      '纯白色背景，无其他元素。',
      style ? `${style} aesthetic,` : 'cinematic aesthetic,',
      'professional character design sheet, consistent proportions, high detail, 8K',
    ].filter(Boolean).join(' ')

    const sheetNegativePrompt =
      'blurry, low quality, distorted face, extra limbs, deformed, watermark, text, signature, cartoon, anime, inconsistent proportions, background elements'

    // Generate character sheet
    const sheetBase64 = await aiClient.generateImage(sheetPrompt, sheetNegativePrompt, {
      width: 1344,
      height: 768,
      referenceImages,
    })

    const sheetSaveResult = await saveMediaFile(sheetBase64, {
      mimeType: 'image/png',
      category: 'characters',
      dramaId: character.dramaId,
      filename: `sheet_${characterId}_${Date.now()}`,
    })
    const sheetImageUrl = sheetSaveResult.url

    // Also generate a regular portrait using the same reference
    const portraitPrompt = [
      `Professional cinematic character portrait, ${style || 'cinematic'} aesthetic,`,
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

    const portraitNegativePrompt =
      'blurry, low quality, distorted face, extra limbs, deformed, watermark, text, signature, cartoon, anime'

    // Use the character sheet as a reference image for the portrait generation
    const portraitBase64 = await aiClient.generateImage(portraitPrompt, portraitNegativePrompt, {
      width: 1024,
      height: 1024,
      referenceImages: referenceImages ? [...referenceImages, sheetImageUrl] : [sheetImageUrl],
    })

    const portraitSaveResult = await saveMediaFile(portraitBase64, {
      mimeType: 'image/png',
      category: 'characters',
      dramaId: character.dramaId,
      filename: `portrait_${characterId}_${Date.now()}`,
    })
    const portraitImageUrl = portraitSaveResult.url

    // Save character sheet as CharacterAppearance
    const existingCount = await db.characterAppearance.count({
      where: { characterId },
    })
    const appearanceIndex = existingCount

    const sheetAppearance = await db.characterAppearance.create({
      data: {
        characterId,
        appearanceIndex,
        label: '角色设定图',
        description: characterDescription,
        imagePrompt: sheetPrompt,
        imageUrl: sheetImageUrl,
        imageUrls: JSON.stringify([sheetImageUrl]),
        selectedIndex: 0,
      },
    })

    // Save portrait as another CharacterAppearance
    const portraitAppearance = await db.characterAppearance.create({
      data: {
        characterId,
        appearanceIndex: appearanceIndex + 1,
        label: '角色肖像',
        description: characterDescription,
        imagePrompt: portraitPrompt,
        imageUrl: portraitImageUrl,
        imageUrls: JSON.stringify([portraitImageUrl]),
        selectedIndex: 0,
      },
    })

    // Update character's main imageUrl with the portrait
    await db.character.update({
      where: { id: characterId },
      data: {
        imageUrl: portraitImageUrl,
        imagePrompt: portraitPrompt,
      },
    })

    return NextResponse.json({
      sheet: {
        ...sheetAppearance,
        imageUrls: JSON.parse(sheetAppearance.imageUrls),
      },
      portrait: {
        ...portraitAppearance,
        imageUrls: JSON.parse(portraitAppearance.imageUrls),
      },
      sheetImageUrl,
      portraitImageUrl,
    })
  } catch (error) {
    console.error('Failed to generate character sheet:', error)
    const message = error instanceof Error ? error.message : 'Failed to generate character sheet'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
