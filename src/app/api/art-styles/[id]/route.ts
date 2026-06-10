// ============================================================
// Art Styles — Get / Update / Delete
// GET    /api/art-styles/[id]
// PATCH  /api/art-styles/[id]
// DELETE /api/art-styles/[id]
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

// ── GET: Get single art style ────────────────────────────────

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
    const artStyle = await db.artStyle.findUnique({ where: { id } })

    if (!artStyle) {
      return NextResponse.json({ error: '画风不存在' }, { status: 404 })
    }

    return NextResponse.json({ artStyle })
  } catch (error: any) {
    console.error('[art-styles/[id]] GET error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// ── PATCH: Update art style ──────────────────────────────────

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const { id } = await params
    const existing = await db.artStyle.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: '画风不存在' }, { status: 404 })
    }

    const body = await req.json()
    const updateData: any = {}

    if (body.name !== undefined) updateData.name = body.name
    if (body.category !== undefined) updateData.category = body.category
    if (body.description !== undefined) updateData.description = body.description
    if (body.prefixMd !== undefined) updateData.prefixMd = body.prefixMd
    if (body.styleMeta !== undefined) updateData.styleMeta = typeof body.styleMeta === 'string' ? body.styleMeta : JSON.stringify(body.styleMeta)
    if (body.previewUrl !== undefined) updateData.previewUrl = body.previewUrl
    if (body.isActive !== undefined) updateData.isActive = body.isActive

    const artStyle = await db.artStyle.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json({ artStyle })
  } catch (error: any) {
    console.error('[art-styles/[id]] PATCH error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// ── DELETE: Delete art style ─────────────────────────────────

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const { id } = await params
    const existing = await db.artStyle.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: '画风不存在' }, { status: 404 })
    }

    // Don't allow deleting builtin styles
    if (existing.isBuiltin) {
      return NextResponse.json({ error: '内置画风不可删除，只能禁用' }, { status: 403 })
    }

    await db.artStyle.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[art-styles/[id]] DELETE error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
