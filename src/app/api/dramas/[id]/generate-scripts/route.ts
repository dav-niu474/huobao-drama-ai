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
import { userIdContext } from '@/lib/ai-config'

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
      if (num > 0 && num <= 500) {
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

    // Wrap entire handler body in userIdContext so downstream LLM calls
    // (getActiveProviderForUser) resolve the current user's provider
    // correctly — fixes Script Workshop using stale provider after admin
    // switches the platform AiProvider.
    return await userIdContext.run(auth.userId, async () => {
      const { id: dramaId } = await params

    // Parse request body
    const body = await request.json().catch(() => ({}))
    const {
      startEpisode = 1,
      endEpisode = 10,
      skeleton: skeletonBody,
      strategy: strategyBody,
      targetDuration = '120s', // '90s' | '120s' | '180s' | '300s'
      genreStyle = '',         // '都市' | '古装' | '悬疑' | etc.
      targetPlatform = '',    // 'douyin' | 'kuaishou' | 'wechat' | 'long'
    } = body as {
      startEpisode?: number
      endEpisode?: number
      skeleton?: string
      strategy?: string
      targetDuration?: string
      genreStyle?: string
      targetPlatform?: string
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

    const skeletonContent = skeletonBody || (parsedContent.skeleton as string)
    const strategyContent = strategyBody || (parsedContent.strategy as string)

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

    // Generate episode list directly from user-specified range
    // (previously used parseEpisodeDecisions() to extract episode numbers from skeleton text,
    //  but that was unreliable — skeleton might mention "第5集" in examples, causing wrong episode numbers)
    const episodeNumbers: number[] = []
    for (let i = startEpisode; i <= endEpisode; i++) {
      episodeNumbers.push(i)
    }
    const targetEpisodes: EpisodeDecision[] = episodeNumbers.map((n) => ({
      episodeNumber: n,
    }))

    // Get or create episodes
    const generatedEpisodes: Array<{
      id: string
      episodeNumber: number
      title: string
      scriptStatus: string
    }> = []
    let firstFailureMessage: string | null = null

    // Before the for loop, fetch all existing completed episodes for this drama.
    // These serve as "previous episode" context for剧情衔接 when generating
    // subsequent episodes in this run (or for reruns of a subset).
    const existingEpisodes = await db.episode.findMany({
      where: { dramaId, scriptStatus: 'completed' },
      orderBy: { episodeNumber: 'asc' },
      select: { id: true, episodeNumber: true, title: true, scriptContent: true },
    })

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

        // Use EPXX format — will be updated after AI generates proper title from script
        const episodeTitle = `EP${String(decision.episodeNumber).padStart(2, '0')}`

        episode = await db.episode.create({
          data: {
            dramaId,
            episodeNumber: decision.episodeNumber,
            title: episodeTitle,
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

      // Duration / platform / style configuration
      const durationMap: Record<string, string> = {
        '90s': '约 90 秒（150-250 字）',
        '120s': '约 2 分钟（300-400 字）',
        '180s': '约 3 分钟（450-600 字）',
        '300s': '约 5 分钟（750-1000 字）',
      }
      const durationDesc = durationMap[targetDuration] || durationMap['120s']

      const platformMap: Record<string, string> = {
        'douyin': '抖音（90秒强钩子，节奏极快，每15秒一个反转）',
        'kuaishou': '快手（接地气，情感共鸣强）',
        'wechat': '微信视频号（偏剧情向，节奏适中）',
        'long': '长视频平台（节奏舒缓，铺垫充分）',
      }
      const platformDesc = targetPlatform ? platformMap[targetPlatform] : ''

      const styleHint = genreStyle ? `\n7. 题材风格：${genreStyle}，对白和场景需符合该题材调性` : ''
      const platformHint = platformDesc ? `\n8. 目标平台：${platformDesc}` : ''

      // Find the previous episode (N-1) for剧情衔接 — prefer the
      // pre-loop snapshot of already-completed episodes; fall back to a
      // fresh DB lookup in case episode N-1 was completed earlier in this
      // very run (the snapshot won't contain rows created/updated here).
      let previousEpisode = existingEpisodes.find(
        (ep) => ep.episodeNumber === decision.episodeNumber - 1
      )
      if (!previousEpisode && decision.episodeNumber > 1) {
        const freshPrev = await db.episode.findUnique({
          where: {
            dramaId_episodeNumber: {
              dramaId,
              episodeNumber: decision.episodeNumber - 1,
            },
          },
          select: { id: true, episodeNumber: true, title: true, scriptContent: true },
        })
        if (freshPrev && freshPrev.scriptContent) {
          previousEpisode = freshPrev
        }
      }

      const previousScriptContext = previousEpisode?.scriptContent
        ? `\n## 上一集剧本（用于剧情衔接，不要重复内容）\n<scriptItem name="${previousEpisode.title}">${previousEpisode.scriptContent}</scriptItem>`
        : '\n（这是第一集，无需衔接上一集）'

      const prompt = `请为第${decision.episodeNumber}集生成完整的短剧剧本。

## 项目配置
- 集数：${targetEpisodes.length}集
- 单集时长：${durationDesc}
- 平台规格：${platformDesc || '未指定'}
- 风格定位：${genreStyle || '未指定'}

## 故事骨架
${skeletonContent}

## 改编策略
${strategyContent}

## 本集相关章节原文
${truncatedChapterContent || '（无特定章节，请基于骨架和策略创作）'}
${previousScriptContext}

请严格按照 SKILL.md 中的执行流程生成剧本：
1. 先阐述 200-300 字创作思路（场景组织、重点情绪与冲突、节奏把控）
2. 将完整剧本包裹在 <scriptItem name="EP${String(decision.episodeNumber).padStart(2, '0')}：${decision.coreEvent || '核心事件'}"> XML 标签中输出，开闭标签必须成对出现，中间不得插入非剧本内容
3. 剧本内部必须包含：文件头（3 行 # 注释：标题/目标时长/平台风格）→ 剧情梗概（200-300 字）→ 场景段落（△标记场景描述、人物名：台词、OS画外音），场景之间用 --- 分隔
4. 完成后返回一句简短确认（如"第${decision.episodeNumber}集剧本已写入"），不复述剧本内容

输出格式与硬约束以 SKILL.md 为准（三大密度自检 / 黄金单集公式 / 节奏 3-15-45 / 钩子级反转 / 自查清单）。
${styleHint}${platformHint}`

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

        // Parse the <scriptItem> XML wrapper from the LLM output
        // The LLM wraps the script in <scriptItem name="...">...</scriptItem>
        // We need to extract just the inner content and the name (for episode title)
        let scriptContent = result.text
        let episodeTitle = episode.title

        // Extract <scriptItem name="...">content</scriptItem>
        const scriptItemMatch = scriptContent.match(
          /<scriptItem\s+name="([^"]+)">([\s\S]*?)<\/scriptItem>/
        )
        if (scriptItemMatch) {
          episodeTitle = scriptItemMatch[1].trim()
          scriptContent = scriptItemMatch[2].trim()
        } else {
          // If no XML wrapper, try to extract title from first line starting with #
          const titleMatch = scriptContent.match(/^#\s+(.+)$/m)
          if (titleMatch) {
            episodeTitle = titleMatch[1].trim()
          }
          // Remove any stray <scriptItem> tags
          scriptContent = scriptContent
            .replace(/<scriptItem\s+name="[^"]*">/g, '')
            .replace(/<\/scriptItem>/g, '')
            .trim()
        }

        // Update episode with cleaned script content and proper title
        await db.episode.update({
          where: { id: episode.id },
          data: {
            // Only set rawContent if it's empty (preserve existing novel source text)
            ...(episode.rawContent ? {} : { rawContent: truncatedChapterContent || '' }),
            scriptContent: scriptContent,
            title: episodeTitle,
            scriptStatus: 'completed',
          },
        })

        generatedEpisodes.push({
          id: episode.id,
          episodeNumber: decision.episodeNumber,
          title: episodeTitle,
          scriptStatus: 'completed',
        })
      } catch (error: any) {
        const errMsg = error?.message || (error instanceof Error ? error.message : String(error))
        console.error(
          `[generate-scripts] Episode ${decision.episodeNumber} failed:`,
          errMsg
        )

        // Remember the first failure message so we can surface it to the user
        // in the all-failed response (below) for easier debugging.
        if (firstFailureMessage === null) {
          firstFailureMessage = typeof errMsg === 'string' ? errMsg : String(errMsg)
        }

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

    // If every episode failed, surface a 500 so the client can show an error.
    // Include the first failure's friendly error message when available so the
    // user knows *why* (e.g. API Key wrong, model EOL, rate-limited, etc.).
    const allFailed =
      generatedEpisodes.length > 0 &&
      generatedEpisodes.every((e) => e.scriptStatus === 'failed')
    if (allFailed) {
      const isFriendly =
        typeof firstFailureMessage === 'string' &&
        (firstFailureMessage.includes('HTTP') ||
          firstFailureMessage.includes('供应商') ||
          firstFailureMessage.includes('模型') ||
          firstFailureMessage.includes('API Key'))
      const error =
        firstFailureMessage && isFriendly
          ? firstFailureMessage
          : `所有集生成都失败，请检查 AI 配置后重试${
              firstFailureMessage ? `（${firstFailureMessage}）` : ''
            }`
      return NextResponse.json(
        {
          error,
          episodes: generatedEpisodes,
          totalGenerated: 0,
        },
        { status: 500 }
      )
    }

      return NextResponse.json({
        episodes: generatedEpisodes,
        totalGenerated: generatedEpisodes.filter(
          (ep) => ep.scriptStatus === 'completed'
        ).length,
      })
    })
  } catch (error: any) {
    const errMsg = error?.message || (error instanceof Error ? error.message : String(error))
    console.error('[generate-scripts] Failed:', errMsg)

    // If the error message already looks user-friendly (HTTP / 供应商 / 模型 / API Key),
    // surface it as-is; otherwise wrap it with a friendlier prefix.
    const isFriendly =
      typeof errMsg === 'string' &&
      (errMsg.includes('HTTP') ||
        errMsg.includes('供应商') ||
        errMsg.includes('模型') ||
        errMsg.includes('API Key'))

    return NextResponse.json(
      { error: isFriendly ? errMsg : `剧本生成失败: ${errMsg}` },
      { status: 500 }
    )
  }
}
