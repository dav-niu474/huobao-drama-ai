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
import { userIdContext } from '@/lib/ai-config'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth()
    if (auth.error) return auth.error

    // Wrap entire handler body in userIdContext so downstream LLM calls
    // (getActiveProviderForUser) resolve the current user's provider
    // correctly — fixes Script Workshop using stale provider after admin
    // switches the platform AiProvider.
    return await userIdContext.run(auth.userId, async () => {
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

    // Load existing parsedContent so we can reuse the events table if present.
    // The events table is a much smaller, denser summary than the full novel
    // text and produces better skeleton output from the LLM.
    let parsedContent: Record<string, unknown> = {}
    try {
      parsedContent = JSON.parse(novel.parsedContent || '{}')
    } catch {
      parsedContent = {}
    }

    interface EventRow {
      chapter: string
      characters: string
      event: string
      mainline: string
      density: string
      estimatedDuration: string
      emotion: string
    }
    const events = Array.isArray(parsedContent.events)
      ? (parsedContent.events as EventRow[])
      : []

    // Build the input prompt sent to story_skeleton.
    let skeletonInput: string
    let inputMode: 'events' | 'fulltext'

    if (events.length > 0) {
      // Build a markdown-style table from the events — much smaller than the
      // full novel text and gives the LLM structured per-chapter information.
      const header =
        '| 章节 | 人物 | 事件 | 主线/支线 | 密度 | 预计时长 | 情绪 |'
      const separator =
        '| --- | --- | --- | --- | --- | --- | --- |'
      const rows = events.map(
        (e) =>
          `| ${e.chapter ?? ''} | ${e.characters ?? ''} | ${e.event ?? ''} | ${e.mainline ?? ''} | ${e.density ?? ''} | ${e.estimatedDuration ?? ''} | ${e.emotion ?? ''} |`
      )
      skeletonInput = [header, separator, ...rows].join('\n')
      inputMode = 'events'
    } else {
      // Fallback: build full novel text from chapters (truncated to fit LLM context).
      // Note: full novel text is much larger than the events table and may exceed
      // the model's context window for long novels. The text is truncated to
      // MAX_CHARS below to avoid HTTP 413 / context overflow errors, but this
      // means later chapters are skipped — skeleton quality may be reduced.
      // Recommended: run extract-events first to get a denser per-chapter summary.
      console.warn(
        '[generate-skeleton] No events table found in parsedContent — ' +
          'falling back to full novel text (truncated to MAX_CHARS chars). ' +
          'For better skeleton quality and to avoid context overflow on long novels, ' +
          'run the extract-events API first to generate a per-chapter events table.'
      )
      const chapters = JSON.parse(novel.chapters) as Array<{
        index: number
        title: string
        content: string
      }>
      const novelText = chapters
        .map((ch) => `## ${ch.title}\n\n${ch.content}`)
        .join('\n\n---\n\n')

      // Truncate to MAX_CHARS to avoid LLM context overflow.
      // 80000 chars ≈ 20k tokens — safe for most modern LLMs (>=8k context).
      const MAX_CHARS = 80000
      skeletonInput =
        novelText.length > MAX_CHARS
          ? novelText.slice(0, MAX_CHARS) + '\n\n...(内容过长已截断)'
          : novelText
      inputMode = 'fulltext'
    }

    const prompt =
      inputMode === 'events'
        ? `请基于以下小说章节事件表，提取完整的故事骨架信息。

小说标题：${novel.title}

## 章节事件表
${skeletonInput}`
        : `请分析以下小说全文，提取完整的故事骨架信息。

小说标题：${novel.title}

${skeletonInput}`

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
    })
  } catch (error: any) {
    const errMsg = error?.message || (error instanceof Error ? error.message : String(error))
    console.error('[generate-skeleton] Failed:', errMsg)

    // If the error message already looks user-friendly (HTTP / 供应商 / 模型 / API Key),
    // surface it as-is; otherwise wrap it with a friendlier prefix.
    const isFriendly =
      typeof errMsg === 'string' &&
      (errMsg.includes('HTTP') ||
        errMsg.includes('供应商') ||
        errMsg.includes('模型') ||
        errMsg.includes('API Key'))

    return NextResponse.json(
      { error: isFriendly ? errMsg : `骨架生成失败: ${errMsg}` },
      { status: 500 }
    )
  }
}
