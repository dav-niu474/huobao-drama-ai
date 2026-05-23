// POST /api/ai/lock-character-style — Lock character appearance consistency
// Sets styleLock=true, stores lockedReferenceImage, extracts visualFingerprint via AI
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-helpers'
import { extractVisualFingerprint } from '@/lib/reference-collector'

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (auth.error) return auth.error

    const { characterId, appearanceIndex } = await request.json()

    if (!characterId) {
      return NextResponse.json({ error: 'characterId is required' }, { status: 400 })
    }

    // Load character with appearances
    const character = await db.character.findUnique({
      where: { id: characterId },
      include: {
        appearances: {
          where: { appearanceIndex: appearanceIndex ?? 0 },
          take: 1,
        },
      },
    })

    if (!character) {
      return NextResponse.json({ error: '角色不存在' }, { status: 404 })
    }

    const primaryAppearance = character.appearances[0]
    const referenceImageUrl = primaryAppearance?.imageUrl || character.imageUrl

    if (!referenceImageUrl) {
      return NextResponse.json({ error: '角色没有参考图片，无法锁定风格' }, { status: 400 })
    }

    // Extract visual fingerprint using AI
    let visualFingerprint = '{}'
    try {
      const fp = await extractVisualFingerprint(referenceImageUrl, character.name)
      if (fp && Object.keys(fp).length > 0) {
        visualFingerprint = JSON.stringify(fp)
      }
    } catch (err) {
      console.warn('Visual fingerprint extraction failed, using description:', err)
      // Fallback: use the appearance description as fingerprint
      const fallback = {
        overall: primaryAppearance?.description || character.appearance,
      }
      visualFingerprint = JSON.stringify(fallback)
    }

    // Update character with style lock
    const updated = await db.character.update({
      where: { id: characterId },
      data: {
        styleLock: true,
        lockedReferenceImage: referenceImageUrl,
        visualFingerprint,
      },
    })

    return NextResponse.json({
      success: true,
      character: {
        id: updated.id,
        name: updated.name,
        styleLock: updated.styleLock,
        lockedReferenceImage: updated.lockedReferenceImage,
        visualFingerprint: JSON.parse(updated.visualFingerprint),
      },
    })
  } catch (error) {
    console.error('Failed to lock character style:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// DELETE /api/ai/lock-character-style — Unlock character style
export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (auth.error) return auth.error

    const { characterId } = await request.json()

    if (!characterId) {
      return NextResponse.json({ error: 'characterId is required' }, { status: 400 })
    }

    const updated = await db.character.update({
      where: { id: characterId },
      data: {
        styleLock: false,
        lockedReferenceImage: null,
        // Keep visualFingerprint for future use, just unlock
      },
    })

    return NextResponse.json({
      success: true,
      character: {
        id: updated.id,
        name: updated.name,
        styleLock: updated.styleLock,
      },
    })
  } catch (error) {
    console.error('Failed to unlock character style:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
