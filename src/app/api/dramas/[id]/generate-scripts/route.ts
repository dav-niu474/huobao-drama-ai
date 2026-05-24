// ============================================================
// POST /api/dramas/[id]/generate-scripts
// Batch generate scripts for episodes using script_generator agent
// Creates episodes based on skeleton's episode decisions, then
// generates script for each episode sequentially
// ============================================================

export const maxDuration = 300

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { executeAgent } from '@/lib/agents/factory'

interface EpisodeDecision {
  episodeNumber: number
  coverChapters?: string
  coreEvent?: string
  targetDuration?: string
  emotionIntensity?: string
  hook?: string
}

function parseEpisodeDecisions(skeleton: string): EpisodeDecision[] {
  // Try to parse episode decisions from the skeleton text
  // Look for patterns like "集序号: 1" or "第1集" or "EP1" etc.
  const decisions: EpisodeDecision[] = []

  // Match patterns like: 集序号：1, 第1集, EP1, Episode 1
  const epPatterns = [
    /(?:集序号|集数|剧集)[：:]\s*(\d+)/g,
    /第(\d+)集/g,
    /EP\.?\s*(\d+)/gi,
    /Episode\s*(\d+)/gi,
  ]

  const foundNumbers = new Set<number>()

  for (const pattern of epPatterns) {
    let match
    while ((match = pattern.exec(skeleton)) !== null) {
      const num = parseInt(match[1], 10)
      if (num > 0 && num <= 100) {
        foundNumbers.add(num)
      }
    }
  }

  if (foundNumbers.size > 0) {
    for (const num of Array.from(foundNumbers).sort((a, b) => a - b)) {
      decisions.push({ episodeNumber: num })
    }
  }

  return decisions
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth()
    if (auth.error) return auth.error

    const { id: dramaId } = await params

    // Parse request body
    let body: {
      skeletonContent?: string
      strategyContent?: string
      episodeRange?: [number, number]
    }
    try {
      body = await request.json()
    } catch {
      body = {}
    }

    // Validate drama exists
    const drama = await db.drama.findUnique({
      where: { id: dramaId },
      select: { userId: true, title: true },
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

    const skeletonContent = body.skeletonContent || (parsedContent.skeleton as string)
    const strategyContent = body.strategyContent || (parsedContent.strategy as string)

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

    // Parse episode decisions from skeleton
    const episodeDecisions = parseEpisodeDecisions(skeletonContent)

    // If no episode decisions found, create a default single episode
    if (episodeDecisions.length === 0) {
      episodeDecisions.push({ episodeNumber: 1 })
    }

    // Apply episode range filter if provided
    let targetEpisodes = episodeDecisions
    if (body.episodeRange) {
      const [start, end] = body.episodeRange
      targetEpisodes = episodeDecisions.filter(
        (ep) => ep.episodeNumber >= start && ep.episodeNumber <= end
      )
    }

    // Get or create episodes
    const generatedEpisodes: Array<{
      id: string
      episodeNumber: number
      title: string
      scriptStatus: string
    }> = []

    for (const decision of targetEpisodes) {
      // Find or create episode
      let episode = await db.episode.findUnique({
        where: {
          dramaId_episodeNumber: {
            dramaId,
            episodeNumber: decision.episodeNumber,
          },
        },
      })

      if (!episode) {
        // Determine which chapters feed this episode
      const chaptersPerEpisode = Math.ceil(chapters.length / targetEpisodes.length)
      const startChapterIdx = (decision.episodeNumber - 1) * chaptersPerEpisode
      const endChapterIdx = Math.min(
        startChapterIdx + chaptersPerEpisode,
        chapters.length
      )
      const sourceChapterIds = chapters
        .slice(startChapterIdx, endChapterIdx)
        .map((ch) => ch.index)

        episode = await db.episode.create({
          data: {
            dramaId,
            episodeNumber: decision.episodeNumber,
            title: decision.coreEvent || `第${decision.episodeNumber}集`,
            sourceChapterIds: JSON.stringify(sourceChapterIds),
            scriptStatus: 'processing',
          },
        })
      } else {
        // Update status to processing
        await db.episode.update({
          where: { id: episode.id },
          data: { scriptStatus: 'processing' },
        })
      }

      // Get relevant chapter content for this episode
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

      const prompt = `请基于以下信息，为第${decision.episodeNumber}集生成完整的短剧剧本。

## 故事骨架
${skeletonContent}

## 改编策略
${strategyContent}

## 本集相关章节内容
${truncatedChapterContent || '（无特定章节，请基于骨架和策略创作）'}

请生成第${decision.episodeNumber}集的完整剧本，确保：
1. 严格遵循改编策略
2. 时长约2分钟（300-400字）
3. 结尾设置悬念钩子
4. 对白口语化、简练有力`

      try {
        // Execute script_generator agent
        const result = await executeAgent(
          'script_generator',
          episode.id,
          dramaId,
          prompt,
          undefined,
          { userId: auth.userId }
        )

        // Update episode with generated script
        await db.episode.update({
          where: { id: episode.id },
          data: {
            rawContent: result.text,
            scriptContent: result.text,
            scriptStatus: 'completed',
          },
        })

        generatedEpisodes.push({
          id: episode.id,
          episodeNumber: decision.episodeNumber,
          title: episode.title,
          scriptStatus: 'completed',
        })
      } catch (error) {
        console.error(
          `[generate-scripts] Episode ${decision.episodeNumber} failed:`,
          error
        )

        // Mark episode as failed
        await db.episode.update({
          where: { id: episode.id },
          data: { scriptStatus: 'failed' },
        })

        generatedEpisodes.push({
          id: episode.id,
          episodeNumber: decision.episodeNumber,
          title: episode.title,
          scriptStatus: 'failed',
        })
      }
    }

    // Update drama totalEpisodes
    const totalEpisodes = await db.episode.count({ where: { dramaId } })
    await db.drama.update({
      where: { id: dramaId },
      data: { totalEpisodes },
    })

    return NextResponse.json({
      episodes: generatedEpisodes,
      totalGenerated: generatedEpisodes.filter(
        (ep) => ep.scriptStatus === 'completed'
      ).length,
    })
  } catch (error) {
    console.error('[generate-scripts] Failed:', error)
    return NextResponse.json(
      {
        error: `剧本生成失败: ${
          error instanceof Error ? error.message : String(error)
        }`,
      },
      { status: 500 }
    )
  }
}
