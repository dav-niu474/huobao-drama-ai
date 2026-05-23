// POST /api/ai/lock-scene-style — Lock scene style consistency
// Sets styleLock=true, stores lockedReferenceImage
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-helpers'

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (auth.error) return auth.error

    const { sceneId } = await request.json()

    if (!sceneId) {
      return NextResponse.json({ error: 'sceneId is required' }, { status: 400 })
    }

    // Load scene with selected image
    const scene = await db.scene.findUnique({
      where: { id: sceneId },
      include: {
        images: {
          where: { isSelected: true },
          take: 1,
        },
      },
    })

    if (!scene) {
      return NextResponse.json({ error: '场景不存在' }, { status: 404 })
    }

    const selectedImage = scene.images[0]
    const referenceImageUrl = selectedImage?.imageUrl || scene.imageUrl

    if (!referenceImageUrl) {
      return NextResponse.json({ error: '场景没有参考图片，无法锁定风格' }, { status: 400 })
    }

    // Update scene with style lock
    const updated = await db.scene.update({
      where: { id: sceneId },
      data: {
        styleLock: true,
        lockedReferenceImage: referenceImageUrl,
      },
    })

    return NextResponse.json({
      success: true,
      scene: {
        id: updated.id,
        location: updated.location,
        styleLock: updated.styleLock,
        lockedReferenceImage: updated.lockedReferenceImage,
      },
    })
  } catch (error) {
    console.error('Failed to lock scene style:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// DELETE /api/ai/lock-scene-style — Unlock scene style
export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (auth.error) return auth.error

    const { sceneId } = await request.json()

    if (!sceneId) {
      return NextResponse.json({ error: 'sceneId is required' }, { status: 400 })
    }

    const updated = await db.scene.update({
      where: { id: sceneId },
      data: {
        styleLock: false,
        lockedReferenceImage: null,
      },
    })

    return NextResponse.json({
      success: true,
      scene: {
        id: updated.id,
        location: updated.location,
        styleLock: updated.styleLock,
      },
    })
  } catch (error) {
    console.error('Failed to unlock scene style:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
