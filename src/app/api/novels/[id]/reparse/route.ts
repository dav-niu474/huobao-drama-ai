import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { splitChapters, parseNovelFile } from '@/lib/novel-parser'

// POST /api/novels/[id]/reparse — Reparse an existing novel with improved parser
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    const novel = await db.novel.findUnique({ where: { id } })
    if (!novel) {
      return NextResponse.json({ error: 'Novel not found' }, { status: 404 })
    }

    // Get the original text from the novel's rawContent or reconstruct from chapters
    let rawText = ''

    // Try to use the original raw content if available
    if ((novel as any).rawContent && typeof (novel as any).rawContent === 'string' && (novel as any).rawContent.length > 0) {
      rawText = (novel as any).rawContent
    } else if (novel.chapters && Array.isArray(novel.chapters)) {
      // Reconstruct from existing chapters
      rawText = (novel.chapters as Array<{ title: string; content: string }>)
        .map((ch) => `${ch.title}\n\n${ch.content}`)
        .join('\n\n')
    } else if (typeof novel.chapters === 'string') {
      // chapters stored as JSON string
      try {
        const parsed = JSON.parse(novel.chapters)
        if (Array.isArray(parsed)) {
          rawText = parsed
            .map((ch: { title: string; content: string }) => `${ch.title}\n\n${ch.content}`)
            .join('\n\n')
        }
      } catch {
        // Can't parse chapters
      }
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
