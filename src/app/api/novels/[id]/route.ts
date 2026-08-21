// ============================================================
// Novel API Routes — GET / DELETE /api/novels/[id]
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helpers'
import { db } from '@/lib/db'

// GET /api/novels/[id] — Get novel with chapter list
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth()
    if (auth.error) return auth.error

    const { id } = await params

    const novel = await db.novel.findUnique({
      where: { id },
      include: { drama: { select: { userId: true } } },
    })

    if (!novel) {
      return NextResponse.json({ error: 'Novel not found' }, { status: 404 })
    }

    // Check access
    if (
      novel.drama.userId &&
      novel.drama.userId !== auth.userId &&
      auth.role !== 'admin'
    ) {
      return NextResponse.json({ error: '无权访问' }, { status: 403 })
    }

    // Parse chapters from JSON
    const chapters = JSON.parse(novel.chapters)

    return NextResponse.json({
      ...novel,
      chapters,
      parseStatus: novel.parseStatus,
    })
  } catch (error) {
    console.error('[novels] GET failed:', error)
    return NextResponse.json({ error: 'Failed to get novel' }, { status: 500 })
  }
}

// PATCH /api/novels/[id] — Update specific fields (currently: parsedContent key)
// Body: { key: 'skeleton' | 'strategy' | 'events' | ..., value: string }
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth()
    if (auth.error) return auth.error

    const { id } = await params
    const body = await request.json().catch(() => ({}))

    const novel = await db.novel.findUnique({
      where: { id },
      include: { drama: { select: { userId: true } } },
    })

    if (!novel) {
      return NextResponse.json({ error: 'Novel not found' }, { status: 404 })
    }

    // Check access
    if (
      novel.drama.userId &&
      novel.drama.userId !== auth.userId &&
      auth.role !== 'admin'
    ) {
      return NextResponse.json({ error: '无权修改' }, { status: 403 })
    }

    // Merge into parsedContent JSON
    let parsedContent: Record<string, unknown> = {}
    try {
      parsedContent = JSON.parse(novel.parsedContent || '{}')
    } catch {
      parsedContent = {}
    }

    if (
      typeof body.key === 'string' &&
      body.key.length > 0 &&
      body.key.length <= 64 &&
      typeof body.value === 'string'
    ) {
      parsedContent[body.key] = body.value
      if (body.key === 'skeleton') {
        parsedContent.skeletonGeneratedAt = new Date().toISOString()
      } else if (body.key === 'strategy') {
        parsedContent.strategyGeneratedAt = new Date().toISOString()
      }
    }

    await db.novel.update({
      where: { id },
      data: { parsedContent: JSON.stringify(parsedContent) },
    })

    return NextResponse.json({ success: true, parsedContent })
  } catch (error) {
    console.error('[novels] PATCH failed:', error)
    return NextResponse.json(
      { error: 'Failed to update novel' },
      { status: 500 }
    )
  }
}

// DELETE /api/novels/[id] — Delete novel and reset Drama fields
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth()
    if (auth.error) return auth.error

    const { id } = await params

    const novel = await db.novel.findUnique({
      where: { id },
      include: { drama: { select: { userId: true } } },
    })

    if (!novel) {
      return NextResponse.json({ error: 'Novel not found' }, { status: 404 })
    }

    // Check access
    if (
      novel.drama.userId &&
      novel.drama.userId !== auth.userId &&
      auth.role !== 'admin'
    ) {
      return NextResponse.json({ error: '无权删除' }, { status: 403 })
    }

    // Reset Drama fields
    await db.drama.update({
      where: { id: novel.dramaId },
      data: {
        novelSource: null,
        novelParsed: false,
      },
    })

    // Delete Novel record
    await db.novel.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[novels] DELETE failed:', error)
    return NextResponse.json(
      { error: 'Failed to delete novel' },
      { status: 500 }
    )
  }
}
