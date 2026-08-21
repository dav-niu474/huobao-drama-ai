import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-helpers'
import { splitChapters } from '@/lib/novel-parser'

// POST /api/novels/[id]/reparse — Reparse an existing novel with improved parser
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const { id } = await params

  try {
    const novel = await db.novel.findUnique({
      where: { id },
      include: { drama: { select: { userId: true } } },
    })
    if (!novel) {
      return NextResponse.json({ error: 'Novel not found' }, { status: 404 })
    }

    // Ownership check
    if (
      novel.drama.userId &&
      novel.drama.userId !== auth.userId &&
      auth.role !== 'admin'
    ) {
      return NextResponse.json({ error: '无权访问' }, { status: 403 })
    }

    // Reconstruct the raw novel text from the existing chapters JSON.
    // (The Novel schema has no rawContent field — chapters is the canonical source.)
    let rawText = ''
    let chaptersArr: Array<{ title: string; content: string }> = []

    if (Array.isArray(novel.chapters)) {
      chaptersArr = novel.chapters as Array<{ title: string; content: string }>
    } else if (typeof novel.chapters === 'string') {
      try {
        const parsed = JSON.parse(novel.chapters)
        if (Array.isArray(parsed)) {
          chaptersArr = parsed as Array<{ title: string; content: string }>
        }
      } catch {
        // Can't parse chapters JSON — leave chaptersArr empty
      }
    }

    if (chaptersArr.length > 0) {
      rawText = chaptersArr
        .map((ch) => `${ch.title}\n\n${ch.content}`)
        .join('\n\n')
    }

    if (!rawText || rawText.trim().length === 0) {
      return NextResponse.json(
        { error: 'No novel text available for reparse' },
        { status: 400 }
      )
    }

    // Re-split with improved parser
    const newChapters = splitChapters(rawText)

    if (newChapters.length === 0) {
      return NextResponse.json(
        { error: 'Reparse produced no chapters' },
        { status: 400 }
      )
    }

    // Update the novel in DB
    const updated = await db.novel.update({
      where: { id },
      data: {
        chapters: JSON.stringify(newChapters),
        parseStatus: 'parsed',
      },
    })

    // Also update drama novelParsed flag
    await db.drama.update({
      where: { id: novel.dramaId },
      data: { novelParsed: true },
    })

    return NextResponse.json({
      novel: updated,
      chapters: newChapters,
      chapterCount: newChapters.length,
      message: `重新解析完成，共 ${newChapters.length} 章`,
    })
  } catch (error) {
    console.error('[reparse] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Reparse failed' },
      { status: 500 }
    )
  }
}
