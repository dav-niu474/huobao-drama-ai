// ============================================================
// Global Asset Library — Get / Update / Delete
// GET    /api/assets/[id]
// PATCH  /api/assets/[id]
// DELETE /api/assets/[id]
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

// ── GET: Get a single asset ──────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const { id } = await params
    const asset = await db.asset.findUnique({
      where: { id },
      include: {
        user: {
          select: { id: true, name: true },
        },
        characters: { select: { id: true, name: true, dramaId: true } },
        scenes: { select: { id: true, location: true, dramaId: true } },
        props: { select: { id: true, name: true, dramaId: true } },
      },
    })

    if (!asset) {
      return NextResponse.json({ error: '资产不存在' }, { status: 404 })
    }

    const userId = (session.user as any).id
    if (!asset.isPublic && asset.userId !== userId) {
      return NextResponse.json({ error: '无权访问此资产' }, { status: 403 })
    }

    return NextResponse.json({ asset })
  } catch (error: any) {
    console.error('[assets/[id]] GET error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// ── PATCH: Update an asset ───────────────────────────────────

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const userId = (session.user as any).id
    const { id } = await params

    const existing = await db.asset.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: '资产不存在' }, { status: 404 })
    }

    if (existing.userId !== userId) {
      return NextResponse.json({ error: '只能编辑自己的资产' }, { status: 403 })
    }

    const body = await req.json()
    const updateData: any = {}

    if (body.name !== undefined) updateData.name = body.name
    if (body.subcategory !== undefined) updateData.subcategory = body.subcategory
    if (body.tags !== undefined) updateData.tags = JSON.stringify(body.tags)
    if (body.thumbnail !== undefined) updateData.thumbnail = body.thumbnail
    if (body.isPublic !== undefined) updateData.isPublic = body.isPublic
    if (body.description !== undefined) updateData.description = body.description
    if (body.imagePrompt !== undefined) updateData.imagePrompt = body.imagePrompt
    if (body.imageUrls !== undefined) updateData.imageUrls = JSON.stringify(body.imageUrls)
    if (body.data !== undefined) updateData.data = typeof body.data === 'string' ? body.data : JSON.stringify(body.data)

    const asset = await db.asset.update({
      where: { id },
      data: updateData,
      include: {
        user: { select: { id: true, name: true } },
      },
    })

    return NextResponse.json({ asset })
  } catch (error: any) {
    console.error('[assets/[id]] PATCH error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// ── DELETE: Delete an asset ──────────────────────────────────

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const userId = (session.user as any).id
    const { id } = await params

    const existing = await db.asset.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: '资产不存在' }, { status: 404 })
    }

    if (existing.userId !== userId) {
      return NextResponse.json({ error: '只能删除自己的资产' }, { status: 403 })
    }

    // Unlink all references before deleting
    await db.character.updateMany({ where: { assetId: id }, data: { assetId: null } })
    await db.scene.updateMany({ where: { assetId: id }, data: { assetId: null } })
    await db.prop.updateMany({ where: { assetId: id }, data: { assetId: null } })

    await db.asset.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[assets/[id]] DELETE error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
