// ============================================================
// POST /api/novels/[id]/parse — Trigger AI chapter event extraction
// Uses story_skeleton agent type
// Groups chapters (5 per group) and calls AI sequentially
// Stores parsed content in Novel.parsedContent as JSON
// ============================================================

// Allow up to 5 minutes for AI parsing
export const maxDuration = 300

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { splitChapters, extractChapterEvents } from '@/lib/novel-parser'
import { EventEmitter } from 'events'

// In-memory progress tracking (per novel ID)
const parseProgressMap = new Map<
  string,
  { status: string; current: number; total: number; message: string }
>()

export async function POST(
  request: NextRequest,
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
      return NextResponse.json({ error: '无权操作' }, { status: 403 })
    }

    // Check if already parsing
    if (novel.parseStatus === 'parsing') {
      return NextResponse.json(
        { error: '小说正在解析中，请稍后再试' },
        { status: 409 }
      )
    }

    // Update status to parsing
    await db.novel.update({
      where: { id },
      data: { parseStatus: 'parsing' },
    })

    // Initialize progress
    parseProgressMap.set(id, {
      status: 'parsing',
      current: 0,
      total: 0,
      message: '开始解析...',
    })

    // Parse chapters from novel
    const chapters = JSON.parse(novel.chapters)

    // Set up event emitter for progress
    const emitter = new EventEmitter()
    emitter.on('progress', (progress) => {
      parseProgressMap.set(id, {
        status: 'parsing',
        current: progress.current,
        total: progress.total,
        message: progress.message,
      })
    })

    // Run extraction in background (don't await — return immediately)
    extractChapterEvents(chapters, 'story_skeleton', novel.dramaId, emitter)
      .then(async (parsedContent) => {
        // Store parsed content
        await db.novel.update({
          where: { id },
          data: {
            parsedContent: JSON.stringify(parsedContent),
            parseStatus: 'parsed',
          },
        })

        // Update Drama.novelParsed
        await db.drama.update({
          where: { id: novel.dramaId },
          data: { novelParsed: true },
        })

        parseProgressMap.set(id, {
          status: 'parsed',
          current: 1,
          total: 1,
          message: '解析完成',
        })
      })
      .catch(async (error) => {
        console.error('[novels/parse] Extraction failed:', error)
        await db.novel.update({
          where: { id },
          data: { parseStatus: 'failed' },
        })

        parseProgressMap.set(id, {
          status: 'failed',
          current: 0,
          total: 0,
          message: error instanceof Error ? error.message : '解析失败',
        })
      })

    return NextResponse.json({
      novelId: id,
      status: 'parsing',
      message: 'AI解析已启动，请通过 /api/novels/[id]/parse-status 查询进度',
    })
  } catch (error) {
    console.error('[novels/parse] POST failed:', error)
    return NextResponse.json(
      { error: 'Failed to start parsing' },
      { status: 500 }
    )
  }
}

// Export the progress map for the parse-status route
export { parseProgressMap }
