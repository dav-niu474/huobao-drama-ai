// ============================================================
// POST /api/dramas/[id]/generate-skeleton
// Generate story skeleton from novel using story_skeleton agent
// Stores result in Novel.parsedContent (merges with existing data)
// ============================================================

export const maxDuration = 300

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { executeAgent } from '@/lib/agents/factory'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth()
    if (auth.error) return auth.error

    const { id: dramaId } = await params

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

    // Find the Novel linked to this Drama
    const novel = await db.novel.findUnique({
      where: { dramaId },
    })

    if (!novel) {
      return NextResponse.json(
        { error: '该戏剧项目没有关联小说，请先上传小说文件', code: 'NO_NOVEL' },
        { status: 400 }
      )
    }

    // Check if novel has been parsed (chapters extracted)
    if (novel.parseStatus === 'pending') {
      return NextResponse.json(
        { error: '小说尚未解析，请先执行小说解析', code: 'NOVEL_NOT_PARSED' },
        { status: 400 }
      )
    }

    if (novel.parseStatus === 'parsing') {
      return NextResponse.json(
        { error: '小说正在解析中，请等待解析完成', code: 'NOVEL_PARSING' },
        { status: 409 }
      )
    }

    // Build the full novel content from chapters
    const chapters = JSON.parse(novel.chapters) as Array<{
      index: number
      title: string
      content: string
    }>

    const novelText = chapters
      .map((ch) => `## ${ch.title}\n\n${ch.content}`)
      .join('\n\n---\n\n')

    // Truncate if too long (max ~80K chars for LLM context)
    const MAX_CHARS = 80000
    const truncatedText =
      novelText.length > MAX_CHARS
        ? novelText.slice(0, MAX_CHARS) + '\n\n...(内容过长已截断)'
        : novelText

    const prompt = `请分析以下小说全文，提取完整的故事骨架信息。

小说标题：${novel.title}
总章节数：${chapters.length}

${truncatedText}`

    // Execute story_skeleton agent directly (server-side)
    const result = await executeAgent(
      'story_skeleton',
      dramaId, // episodeId placeholder — story_skeleton doesn't use it
      dramaId,
      prompt,
      undefined, // no progress callback for sync route
      { userId: auth.userId }
    )

    // Store skeleton in Novel.parsedContent (merge with existing data)
    let parsedContent: Record<string, unknown> = {}
    try {
      parsedContent = JSON.parse(novel.parsedContent || '{}')
    } catch {
      parsedContent = {}
    }

    parsedContent.skeleton = result.text
    parsedContent.skeletonGeneratedAt = new Date().toISOString()

    await db.novel.update({
      where: { id: novel.id },
      data: {
        parsedContent: JSON.stringify(parsedContent),
      },
    })

    return NextResponse.json({
      skeleton: result.text,
      novelId: novel.id,
    })
  } catch (error) {
    console.error('[generate-skeleton] Failed:', error)
    return NextResponse.json(
      {
        error: `骨架生成失败: ${
          error instanceof Error ? error.message : String(error)
        }`,
      },
      { status: 500 }
    )
  }
}
