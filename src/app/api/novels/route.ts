// ============================================================
// POST /api/novels — Upload novel file, create Novel record
// GET /api/novels?dramaId=xxx — Get novel by drama ID
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { parseNovelFile, splitChapters } from '@/lib/novel-parser'

// GET /api/novels?dramaId=xxx — Get novel by drama ID
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (auth.error) return auth.error

    const dramaId = request.nextUrl.searchParams.get('dramaId')

    if (!dramaId) {
      return NextResponse.json({ error: '缺少 dramaId 参数' }, { status: 400 })
    }

    const novel = await db.novel.findUnique({
      where: { dramaId },
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

    // Parse chapters from JSON for convenience
    const chapters = JSON.parse(novel.chapters)

    return NextResponse.json({
      ...novel,
      chapters,
    })
  } catch (error) {
    console.error('[novels] GET failed:', error)
    return NextResponse.json({ error: 'Failed to get novel' }, { status: 500 })
  }
}

// POST /api/novels — Upload novel file, create Novel record

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (auth.error) return auth.error

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const dramaId = formData.get('dramaId') as string | null

    if (!file) {
      return NextResponse.json({ error: '缺少文件' }, { status: 400 })
    }
    if (!dramaId) {
      return NextResponse.json({ error: '缺少 dramaId' }, { status: 400 })
    }

    // Validate file type
    const fileName = file.name.toLowerCase()
    if (!fileName.endsWith('.txt') && !fileName.endsWith('.docx')) {
      return NextResponse.json(
        { error: '仅支持 .txt 和 .docx 文件' },
        { status: 400 }
      )
    }

    // Validate drama exists and user has access
    const drama = await db.drama.findUnique({
      where: { id: dramaId },
      select: { userId: true },
    })
    if (!drama) {
      return NextResponse.json({ error: 'Drama 不存在' }, { status: 404 })
    }
    if (drama.userId && drama.userId !== auth.userId && auth.role !== 'admin') {
      return NextResponse.json({ error: '无权访问此项目' }, { status: 403 })
    }

    // Check if novel already exists for this drama
    const existingNovel = await db.novel.findUnique({
      where: { dramaId },
    })
    if (existingNovel) {
      return NextResponse.json(
        { error: '该项目已有关联小说，请先删除再上传' },
        { status: 409 }
      )
    }

    // Read file content
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Parse file content
    let text: string
    try {
      text = await parseNovelFile(buffer, file.name)
    } catch (parseError) {
      return NextResponse.json(
        {
          error: `文件解析失败: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
        },
        { status: 400 }
      )
    }

    // Split into chapters
    const chapters = splitChapters(text)

    // Create Novel record
    // ★ parseStatus 直接设为 'parsed'，因为 splitChapters 已经在上传时完成了章节拆分
    //   之前的流程：上传→pending→需要手动触发parse→parsed
    //   现在：上传时 splitChapters 直接拆好章节，无需额外 parse 步骤
    const novel = await db.novel.create({
      data: {
        dramaId,
        title: file.name.replace(/\.(txt|docx)$/i, ''),
        chapters: JSON.stringify(chapters),
        parsedContent: '{}',
        parseStatus: chapters.length > 0 ? 'parsed' : 'pending',
        fileSize: buffer.length,
        fileName: file.name,
      },
    })

    // Update Drama fields
    await db.drama.update({
      where: { id: dramaId },
      data: {
        novelSource: file.name,
        novelParsed: chapters.length > 0,
      },
    })

    return NextResponse.json({
      novel,
      chapters,
    })
  } catch (error) {
    console.error('[novels] Upload failed:', error)
    return NextResponse.json(
      { error: `上传失败: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    )
  }
}
