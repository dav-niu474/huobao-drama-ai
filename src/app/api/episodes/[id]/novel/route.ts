import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { splitChapters } from '@/lib/novel-parser'
import { parseNovelFile } from '@/lib/novel-parser'

// ============================================================
// /api/episodes/[id]/novel
//
// POST: Accept pasted text OR uploaded file (.txt / .docx),
//       split it into chapters via splitChapters(), persist
//       both the raw text (episode.rawContent) and chapter
//       metadata (episode.sourceChapterIds JSON), then return
//       the resulting chapter list.
//
// GET:  Return the persisted chapter list (and rawContent)
//       so the panel can hydrate its table on mount.
// ============================================================

export interface NovelChapter {
  index: number
  title: string
  content: string
}

// POST /api/episodes/[id]/novel
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const { id: episodeId } = await params

  const episode = await db.episode.findUnique({
    where: { id: episodeId },
    include: { drama: { select: { userId: true } } },
  })

  if (!episode) {
    return NextResponse.json({ error: 'Episode not found' }, { status: 404 })
  }
  if (
    episode.drama.userId &&
    episode.drama.userId !== auth.userId &&
    auth.role !== 'admin'
  ) {
    return NextResponse.json({ error: '无权访问' }, { status: 403 })
  }

  const contentType = request.headers.get('content-type') || ''
  let text: string
  let fileName: string

  try {
    if (contentType.includes('application/json')) {
      // ── Pasted text path ──
      const body = await request.json().catch(() => ({}))
      text = (body?.text ?? '').toString()
      fileName = (body?.fileName ?? 'pasted-text.txt').toString()
      if (text.trim().length < 10) {
        return NextResponse.json(
          { error: '文本内容过短（至少 10 字符）' },
          { status: 400 }
        )
      }
    } else {
      // ── File upload path (.txt or .docx) ──
      const formData = await request.formData()
      const file = formData.get('file') as File | null
      if (!file) {
        return NextResponse.json({ error: '缺少文件' }, { status: 400 })
      }
      const buffer = Buffer.from(await file.arrayBuffer())
      // parseNovelFile handles .txt (utf-8) and .docx (mammoth)
      text = await parseNovelFile(buffer, file.name)
      // Strip BOM if present
      text = text.replace(/^\uFEFF/, '')
      fileName = file.name
    }
  } catch (err: any) {
    const msg = err?.message || String(err)
    return NextResponse.json({ error: `解析文件失败: ${msg}` }, { status: 400 })
  }

  // Split into chapters using the existing novel-parser logic
  const chapters = splitChapters(text)

  if (chapters.length === 0) {
    return NextResponse.json(
      { error: '未能从文本中识别出章节，请检查内容' },
      { status: 400 }
    )
  }

  // Persist both the raw text (so the existing handleSaveRaw / pipeline still works)
  // and the structured chapter list inside sourceChapterIds.
  await db.episode.update({
    where: { id: episodeId },
    data: {
      rawContent: text,
      sourceChapterIds: JSON.stringify(
        chapters.map((c) => ({
          index: c.index,
          title: c.title,
          content: c.content,
        }))
      ),
    },
  })

  return NextResponse.json({
    success: true,
    chapters,
    chapterCount: chapters.length,
    textLength: text.length,
    fileName,
  })
}

// GET /api/episodes/[id]/novel — return persisted chapters
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const { id: episodeId } = await params

  const episode = await db.episode.findUnique({
    where: { id: episodeId },
    include: { drama: { select: { userId: true } } },
  })

  if (!episode) {
    return NextResponse.json({ error: 'Episode not found' }, { status: 404 })
  }
  if (
    episode.drama.userId &&
    episode.drama.userId !== auth.userId &&
    auth.role !== 'admin'
  ) {
    return NextResponse.json({ error: '无权访问' }, { status: 403 })
  }

  // Parse stored chapters; fall back to splitting rawContent live
  let chapters: NovelChapter[] = []
  let hasEventFields = false
  try {
    const parsed = JSON.parse(episode.sourceChapterIds || '[]')
    if (Array.isArray(parsed) && parsed.length > 0 && parsed[0]?.title) {
      chapters = parsed
      hasEventFields = parsed.some(
        (c: any) => typeof c.event === 'string' && c.event.length > 0
      )
    } else if (episode.rawContent) {
      chapters = splitChapters(episode.rawContent)
    }
  } catch {
    if (episode.rawContent) {
      chapters = splitChapters(episode.rawContent)
    }
  }

  return NextResponse.json({
    chapters,
    rawContent: episode.rawContent || '',
    hasEvents: hasEventFields,
  })
}
