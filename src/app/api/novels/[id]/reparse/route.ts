// ============================================================
// POST /api/novels/[id]/reparse — Re-split chapters using improved parser
// Reconstructs full text from existing chapters, re-splits,
// and updates the novel record with better chapter titles/names.
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { splitChapters } from '@/lib/novel-parser'

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

    // Parse existing chapters
    let existingChapters: Array<{ index: number; title: string; content: string }>
    try {
      existingChapters = JSON.parse(novel.chapters)
    } catch {
      return NextResponse.json({ error: '章节数据格式错误' }, { status: 400 })
    }

    if (existingChapters.length === 0) {
      return NextResponse.json({ error: '没有章节可重新解析' }, { status: 400 })
    }

    // Reconstruct full text from existing chapters
    const fullText = existingChapters
      .map((ch) => `${ch.title}\n\n${ch.content}`)
      .join('\n\n')

    // Re-split using improved parser
    const newChapters = splitChapters(fullText)

    if (newChapters.length === 0) {
      return NextResponse.json({ error: '重新解析未产生任何章节' }, { status: 500 })
    }

    // Update novel with new chapter data
    await db.novel.update({
      where: { id },
      data: {
        chapters: JSON.stringify(newChapters),
      },
    })

    return NextResponse.json({
      novelId: id,
      previousChapterCount: existingChapters.length,
      newChapterCount: newChapters.length,
      chapters: newChapters,
      message: `重新解析完成：${existingChapters.length} → ${newChapters.length} 章`,
    })
  } catch (error) {
    console.error('[novels/reparse] POST failed:', error)
    return NextResponse.json(
      { error: `重新解析失败: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    )
  }
}
