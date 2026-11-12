// ============================================================
// POST /api/episodes/[id]/regenerate
// Regenerate script for a single episode using script_generator agent
// Uses the Drama's stored skeleton & strategy + episode source chapters
// ============================================================

export const maxDuration = 300

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { executeAgent } from '@/lib/agents/factory'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
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

    const novel = await db.novel.findUnique({
      where: { dramaId: episode.dramaId },
    })

    if (!novel) {
      return NextResponse.json(
        { error: '该戏剧项目没有关联小说', code: 'NO_NOVEL' },
        { status: 400 }
      )
    }

    // Get skeleton and strategy content
    let parsedContent: Record<string, unknown> = {}
    try {
      parsedContent = JSON.parse(novel.parsedContent || '{}')
    } catch {
      parsedContent = {}
    }

    const skeletonContent = parsedContent.skeleton as string | undefined
    const strategyContent = parsedContent.strategy as string | undefined

    if (!skeletonContent) {
      return NextResponse.json(
        { error: '没有故事骨架内容，请先生成故事骨架', code: 'NO_SKELETON' },
        { status: 400 }
      )
    }

    if (!strategyContent) {
      return NextResponse.json(
        { error: '没有改编策略内容，请先生成改编策略', code: 'NO_STRATEGY' },
        { status: 400 }
      )
    }

    // Parse chapters from novel for reference content
    const chapters = JSON.parse(novel.chapters) as Array<{
      index: number
      title: string
      content: string
    }>

    const sourceChapterIds: number[] = JSON.parse(
      episode.sourceChapterIds || '[]'
    )
    const relevantChapters = chapters.filter((ch) =>
      sourceChapterIds.includes(ch.index)
    )
    const chapterContent = relevantChapters
      .map((ch) => `## ${ch.title}\n\n${ch.content}`)
      .join('\n\n---\n\n')

    // Truncate chapter content if too long
    const MAX_CHAPTER_CHARS = 40000
    const truncatedChapterContent =
      chapterContent.length > MAX_CHAPTER_CHARS
        ? chapterContent.slice(0, MAX_CHAPTER_CHARS) + '\n\n...(内容过长已截断)'
        : chapterContent

    const prompt = `请基于以下信息，为第${episode.episodeNumber}集生成完整的短剧剧本。

## 故事骨架
${skeletonContent}

## 改编策略
${strategyContent}

## 本集相关章节内容
${truncatedChapterContent || '（无特定章节，请基于骨架和策略创作）'}

请生成第${episode.episodeNumber}集的完整剧本，确保：
1. 严格遵循改编策略
2. 时长约2分钟（300-400字）
3. 结尾设置悬念钩子
4. 对白口语化、简练有力`

    // Mark as processing
    await db.episode.update({
      where: { id: episode.id },
      data: { scriptStatus: 'processing' },
    })

    try {
      const result = await executeAgent(
        'script_generator',
        episode.id,
        episode.dramaId,
        prompt,
        undefined,
        { userId: auth.userId }
      )

      await db.episode.update({
        where: { id: episode.id },
        data: {
          rawContent: result.text,
          scriptContent: result.text,
          scriptStatus: 'completed',
        },
      })

      return NextResponse.json({
        success: true,
        episodeId: episode.id,
        scriptStatus: 'completed',
      })
    } catch (error) {
      console.error(
        `[episodes/regenerate] Episode ${episode.episodeNumber} failed:`,
        error
      )

      await db.episode.update({
        where: { id: episode.id },
        data: { scriptStatus: 'failed' },
      })

      return NextResponse.json(
        {
          error: `剧本重新生成失败: ${
            error instanceof Error ? error.message : String(error)
          }`,
        },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error('[episodes/regenerate] Failed:', error)
    return NextResponse.json(
      {
        error: `重新生成失败: ${
          error instanceof Error ? error.message : String(error)
        }`,
      },
      { status: 500 }
    )
  }
}
