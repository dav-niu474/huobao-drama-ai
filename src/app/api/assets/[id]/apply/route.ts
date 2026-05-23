// ============================================================
// Global Asset Library — Apply asset to a drama project
// POST /api/assets/[id]/apply  { dramaId }
// Creates a Character/Scene/Prop in the target drama from the asset
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const userId = (session.user as any).id
    const { id: assetId } = await params
    const body = await req.json()
    const { dramaId } = body

    if (!dramaId) {
      return NextResponse.json({ error: 'dramaId 为必填项' }, { status: 400 })
    }

    // Verify drama exists and belongs to user
    const drama = await db.drama.findUnique({
      where: { id: dramaId },
    })
    if (!drama) {
      return NextResponse.json({ error: '项目不存在' }, { status: 404 })
    }
    if (drama.userId && drama.userId !== userId) {
      return NextResponse.json({ error: '无权操作此项目' }, { status: 403 })
    }

    // Get the asset
    const asset = await db.asset.findUnique({ where: { id: assetId } })
    if (!asset) {
      return NextResponse.json({ error: '资产不存在' }, { status: 404 })
    }
    if (!asset.isPublic && asset.userId !== userId) {
      return NextResponse.json({ error: '无权使用此资产' }, { status: 403 })
    }

    // Parse asset data
    const assetData = JSON.parse(asset.data || '{}')
    let result: any = null

    // Increment usage count
    await db.asset.update({
      where: { id: assetId },
      data: { usageCount: { increment: 1 } },
    })

    if (asset.category === 'character') {
      // Check for duplicate name in the drama
      const existing = await db.character.findFirst({
        where: { dramaId, name: asset.name },
      })
      if (existing) {
        return NextResponse.json(
          { error: `角色「${asset.name}」已存在于该项目中`, existingId: existing.id },
          { status: 409 }
        )
      }

      const character = await db.character.create({
        data: {
          dramaId,
          name: asset.name,
          role: assetData.role || 'supporting',
          gender: assetData.gender || 'unknown',
          age: assetData.age || '',
          appearance: assetData.appearance || '',
          personality: assetData.personality || '',
          voiceStyle: assetData.voiceStyle || '',
          voiceId: assetData.voiceId || null,
          imagePrompt: asset.imagePrompt,
          imageUrl: asset.thumbnail,
          assetId,
        },
      })

      // Also create appearances if they exist
      if (Array.isArray(assetData.appearances) && assetData.appearances.length > 0) {
        for (const appData of assetData.appearances) {
          await db.characterAppearance.create({
            data: {
              characterId: character.id,
              appearanceIndex: appData.appearanceIndex ?? 0,
              label: appData.label || '',
              description: appData.description || '',
              imagePrompt: appData.imagePrompt || '',
              imageUrl: appData.imageUrl || null,
              imageUrls: appData.imageUrl ? JSON.stringify([appData.imageUrl]) : '[]',
            },
          })
        }
      }

      result = { character }
    } else if (asset.category === 'scene') {
      // Check for duplicate location in the drama
      const existing = await db.scene.findFirst({
        where: { dramaId, location: asset.name },
      })
      if (existing) {
        return NextResponse.json(
          { error: `场景「${asset.name}」已存在于该项目中`, existingId: existing.id },
          { status: 409 }
        )
      }

      const scene = await db.scene.create({
        data: {
          dramaId,
          location: assetData.location || asset.name,
          timeOfDay: assetData.timeOfDay || 'day',
          description: assetData.description || '',
          prompt: assetData.prompt || asset.imagePrompt || '',
          imageUrl: asset.thumbnail,
          assetId,
        },
      })

      // Also create scene images if they exist
      if (Array.isArray(assetData.images) && assetData.images.length > 0) {
        for (const imgData of assetData.images) {
          await db.sceneImage.create({
            data: {
              sceneId: scene.id,
              description: imgData.description || '',
              imageUrl: imgData.imageUrl || null,
              timeOfDay: imgData.timeOfDay || '',
              angle: imgData.angle || '',
              isSelected: false,
            },
          })
        }
      }

      result = { scene }
    } else if (asset.category === 'prop') {
      // Check for duplicate name in the drama
      const existing = await db.prop.findFirst({
        where: { dramaId, name: asset.name },
      })
      if (existing) {
        return NextResponse.json(
          { error: `道具「${asset.name}」已存在于该项目中`, existingId: existing.id },
          { status: 409 }
        )
      }

      const prop = await db.prop.create({
        data: {
          dramaId,
          name: asset.name,
          category: assetData.category || asset.subcategory || 'other',
          description: assetData.description || '',
          imagePrompt: asset.imagePrompt || assetData.imagePrompt,
          imageUrl: asset.thumbnail,
          assetId,
        },
      })

      result = { prop }
    } else {
      return NextResponse.json({ error: '无效的资产类别' }, { status: 400 })
    }

    return NextResponse.json({ result, assetName: asset.name, assetCategory: asset.category })
  } catch (error: any) {
    console.error('[assets/[id]/apply] POST error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
