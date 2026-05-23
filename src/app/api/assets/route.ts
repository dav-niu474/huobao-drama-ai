// ============================================================
// Global Asset Library — List & Create
// GET  /api/assets?category=character&search=&tag=&page=1&limit=20
// POST /api/assets  { name, category, subcategory?, tags?, ... }
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

// ── GET: List assets with filters ────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const userId = (session.user as any).id
    const { searchParams } = new URL(req.url)
    const category = searchParams.get('category') || undefined
    const search = searchParams.get('search') || undefined
    const tag = searchParams.get('tag') || undefined
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20')))
    const skip = (page - 1) * limit

    // Build where clause — show user's own assets + public assets from others
    const where: any = {
      OR: [
        { userId },
        { isPublic: true },
      ],
    }

    if (category) {
      where.category = category
    }

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { description: { contains: search } },
        { imagePrompt: { contains: search } },
      ]
    }

    if (tag) {
      // Tags stored as JSON array in string — use contains for simple matching
      where.tags = { contains: tag }
    }

    const [assets, total] = await Promise.all([
      db.asset.findMany({
        where,
        orderBy: [
          { usageCount: 'desc' },
          { updatedAt: 'desc' },
        ],
        skip,
        take: limit,
        include: {
          user: {
            select: { id: true, name: true },
          },
        },
      }),
      db.asset.count({ where }),
    ])

    return NextResponse.json({
      assets,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    })
  } catch (error: any) {
    console.error('[assets] GET error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// ── POST: Create a new asset ─────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const userId = (session.user as any).id
    const body = await req.json()

    const {
      name,
      category,
      subcategory,
      tags,
      thumbnail,
      isPublic,
      description,
      imagePrompt,
      imageUrls,
      data,
      // Source entity fields — for "save to library" from existing character/scene/prop
      sourceType,
      sourceId,
    } = body

    if (!name || !category) {
      return NextResponse.json({ error: '名称和类别为必填项' }, { status: 400 })
    }

    if (!['character', 'scene', 'prop'].includes(category)) {
      return NextResponse.json({ error: '无效的资产类别，必须为 character/scene/prop' }, { status: 400 })
    }

    // If saving from an existing entity, extract data from it
    let assetData = data || '{}'
    let assetThumbnail = thumbnail || null
    let assetImagePrompt = imagePrompt || null
    let assetImageUrls = imageUrls || '[]'

    if (sourceType && sourceId) {
      const extracted = await extractFromSource(sourceType, sourceId)
      if (extracted) {
        assetData = extracted.data
        assetThumbnail = extracted.thumbnail
        assetImagePrompt = extracted.imagePrompt
        assetImageUrls = extracted.imageUrls
      }
    }

    const asset = await db.asset.create({
      data: {
        name,
        category,
        subcategory: subcategory || null,
        tags: tags ? JSON.stringify(tags) : '[]',
        thumbnail: assetThumbnail,
        userId,
        isPublic: isPublic !== undefined ? isPublic : true,
        description: description || '',
        imagePrompt: assetImagePrompt,
        imageUrls: assetImageUrls,
        data: assetData,
      },
      include: {
        user: {
          select: { id: true, name: true },
        },
      },
    })

    // If saving from an existing entity, link it back
    if (sourceType && sourceId) {
      await linkSourceToAsset(sourceType, sourceId, asset.id)
    }

    return NextResponse.json({ asset }, { status: 201 })
  } catch (error: any) {
    console.error('[assets] POST error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// ── Helper: Extract data from existing entity ────────────────

async function extractFromSource(
  sourceType: string,
  sourceId: string
): Promise<{ data: string; thumbnail: string | null; imagePrompt: string | null; imageUrls: string } | null> {
  if (sourceType === 'character') {
    const char = await db.character.findUnique({
      where: { id: sourceId },
      include: { appearances: true },
    })
    if (!char) return null

    const charData = {
      role: char.role,
      gender: char.gender,
      age: char.age,
      appearance: char.appearance,
      personality: char.personality,
      voiceStyle: char.voiceStyle,
      voiceId: char.voiceId,
      appearances: char.appearances.map((a) => ({
        label: a.label,
        description: a.description,
        imagePrompt: a.imagePrompt,
        imageUrl: a.imageUrl,
        appearanceIndex: a.appearanceIndex,
      })),
    }

    // Collect all image URLs from appearances
    const allImageUrls: string[] = []
    for (const app of char.appearances) {
      if (app.imageUrl) allImageUrls.push(app.imageUrl)
      try {
        const urls = JSON.parse(app.imageUrls || '[]')
        if (Array.isArray(urls)) allImageUrls.push(...urls.filter((u: string) => u))
      } catch {}
    }

    return {
      data: JSON.stringify(charData),
      thumbnail: char.imageUrl || null,
      imagePrompt: char.imagePrompt || null,
      imageUrls: JSON.stringify(allImageUrls),
    }
  }

  if (sourceType === 'scene') {
    const scene = await db.scene.findUnique({
      where: { id: sourceId },
      include: { images: true },
    })
    if (!scene) return null

    const sceneData = {
      location: scene.location,
      timeOfDay: scene.timeOfDay,
      description: scene.description,
      prompt: scene.prompt,
      images: scene.images.map((img) => ({
        description: img.description,
        imageUrl: img.imageUrl,
        timeOfDay: img.timeOfDay,
        angle: img.angle,
      })),
    }

    const allImageUrls: string[] = []
    for (const img of scene.images) {
      if (img.imageUrl) allImageUrls.push(img.imageUrl)
    }

    return {
      data: JSON.stringify(sceneData),
      thumbnail: scene.imageUrl || null,
      imagePrompt: scene.prompt || null,
      imageUrls: JSON.stringify(allImageUrls),
    }
  }

  if (sourceType === 'prop') {
    const prop = await db.prop.findUnique({
      where: { id: sourceId },
    })
    if (!prop) return null

    const propData = {
      category: prop.category,
      description: prop.description,
      imagePrompt: prop.imagePrompt,
    }

    const allImageUrls: string[] = []
    if (prop.imageUrl) allImageUrls.push(prop.imageUrl)

    return {
      data: JSON.stringify(propData),
      thumbnail: prop.imageUrl || null,
      imagePrompt: prop.imagePrompt || null,
      imageUrls: JSON.stringify(allImageUrls),
    }
  }

  return null
}

// ── Helper: Link source entity to the created asset ──────────

async function linkSourceToAsset(
  sourceType: string,
  sourceId: string,
  assetId: string
): Promise<void> {
  if (sourceType === 'character') {
    await db.character.update({
      where: { id: sourceId },
      data: { assetId },
    })
  } else if (sourceType === 'scene') {
    await db.scene.update({
      where: { id: sourceId },
      data: { assetId },
    })
  } else if (sourceType === 'prop') {
    await db.prop.update({
      where: { id: sourceId },
      data: { assetId },
    })
  }
}
