// ============================================================
// GET /api/novels/[id]/parse-status — Poll parse progress
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helpers'
import { db } from '@/lib/db'

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
      select: {
        parseStatus: true,
        parsedContent: true,
        dramaId: true,
        drama: { select: { userId: true } },
      },
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

    // Get progress from in-memory map
    // Import the progress map from the parse route
    let progress = null
    try {
      const { parseProgressMap } = await import('../parse/route')
      progress = parseProgressMap.get(id) || null
    } catch {
      // Fallback: no progress map available
    }

    return NextResponse.json({
      status: novel.parseStatus,
      current: progress?.current ?? 0,
      total: progress?.total ?? 0,
      message: progress?.message ?? '',
      parsedContent:
        novel.parseStatus === 'parsed' ? novel.parsedContent : undefined,
    })
  } catch (error) {
    console.error('[novels/parse-status] GET failed:', error)
    return NextResponse.json(
      { error: 'Failed to get parse status' },
      { status: 500 }
    )
  }
}
