// ============================================================
// V2 Script Generation API — One-shot full script generation
// POST: SSE streaming generation with paywall engineering
// GET:  Return generation status, progress, episode counts
// ============================================================

export const maxDuration = 300

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { executeAgent } from '@/lib/agents/factory'

// ── Types ──────────────────────────────────────────────────

interface PaywallConfig {
  freeEpisodes: number
  hookEpisodes: number[]
  payStart: number
}

interface EpisodeFormat {
  count: number
  duration: string
  format: string
}

interface OutlineEpisode {
  episodeNumber: number
  title: string
  sourceChapterIds: number[]
  coreEvent: string
  hook?: string
  type: 'free' | 'hook' | 'pay'
}

// ── Helpers ────────────────────────────────────────────────

function parseJsonSafe<T>(text: string | null | undefined, fallback: T): T {
  if (!text) return fallback
  try {
    return JSON.parse(text) as T
  } catch {
    return fallback
  }
}

function classifyEpisodeType(
  epNumber: number,
  paywallConfig: PaywallConfig | null
): 'free' | 'hook' | 'pay' {
  if (!paywallConfig) return 'free'
  if (paywallConfig.hookEpisodes?.includes(epNumber)) return 'hook'
  if (epNumber >= paywallConfig.payStart) return 'pay'
  return 'free'
}

function buildPaywallInstruction(
  epNumber: number,
  type: 'free' | 'hook' | 'pay',
  paywallConfig: PaywallConfig | null
): string {
  if (!paywallConfig) return ''
  if (type === 'hook') {
    return `\n\n【重要：这是钩子集（Hook Episode）】
本集是用户从免费转付费的关键转折点，必须：
1. 结尾设置强烈悬念/反转（Cliffhanger），让用户无法停止
2. 在高潮处突然断裂，制造"不看下一集会死"的紧迫感
3. 暗示更大的阴谋/秘密即将揭晓
4. 最后一幕必须是情感冲击最大的瞬间`
  }
  if (type === 'pay') {
    return `\n\n【重要：这是付费集（Pay Episode）】
本集是付费内容，需要：
1. 在反转处建立新的悬念（Reversal），持续保持用户付费动力
2. 每集至少一个意想不到的转折
3. 推进核心矛盾的升级
4. 每集结尾都要有"钩子"让用户继续追看`
  }
  return `\n\n【这是免费集（Free Episode）】
本集是免费内容，需要：
1. 快速建立角色关系和世界观
2. 制造足够的好奇心让用户想继续
3. 节奏明快，不要拖沓`
}

// ── POST: One-shot V2 script generation with SSE ───────────

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const { id: dramaId } = await params

  // Validate drama
  const drama = await db.drama.findUnique({
    where: { id: dramaId },
    select: {
      userId: true,
      title: true,
      showPlanLocked: true,
      novelAnalysis: true,
      genreTone: true,
      paywallConfig: true,
      coverage: true,
      episodeFormat: true,
      scriptGenerationStatus: true,
    },
  })

  if (!drama) {
    return NextResponse.json({ error: 'Drama 不存在' }, { status: 404 })
  }
  if (drama.userId && drama.userId !== auth.userId && auth.role !== 'admin') {
    return NextResponse.json({ error: '无权访问此项目' }, { status: 403 })
  }

  // V2 Gate: Show plan must be locked
  if (!drama.showPlanLocked) {
    return NextResponse.json(
      { error: '7参数协商尚未锁定，请先完成 Show Planning', code: 'SHOW_PLAN_NOT_LOCKED' },
      { status: 400 }
    )
  }

  // Prevent concurrent generation
  if (drama.scriptGenerationStatus === 'generating') {
    return NextResponse.json(
      { error: '剧本生成正在进行中，请稍后', code: 'GENERATION_IN_PROGRESS' },
      { status: 409 }
    )
  }

  // Mark as generating
  await db.drama.update({
    where: { id: dramaId },
    data: { scriptGenerationStatus: 'generating' },
  })

  // Parse config
  const paywallConfig = parseJsonSafe<PaywallConfig | null>(drama.paywallConfig, null)
  const episodeFormat = parseJsonSafe<EpisodeFormat | null>(drama.episodeFormat, null)
  const genreTone = parseJsonSafe<{ genre: string; tone: string; tags: string[] } | null>(drama.genreTone, null)

  // Get novel
  const novel = await db.novel.findUnique({ where: { dramaId } })
  if (!novel) {
    await db.drama.update({
      where: { id: dramaId },
      data: { scriptGenerationStatus: 'pending' },
    })
    return NextResponse.json(
      { error: '该戏剧项目没有关联小说', code: 'NO_NOVEL' },
      { status: 400 }
    )
  }

  const chapters = parseJsonSafe<Array<{ index: number; title: string; content: string }>>(
    novel.chapters,
    []
  )

  // SSE streaming
  const encoder = new TextEncoder()
  let closed = false

  const sendEvent = (data: unknown) => {
    if (closed) return ''
    return `data: ${JSON.stringify(data)}\n\n`
  }

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Step 1: Init
        controller.enqueue(encoder.encode(sendEvent({
          step: 'init',
          message: '开始 V2 剧本生成流程...',
          progress: 5,
        })))

        // Step 2: Generate all-episode outline
        controller.enqueue(encoder.encode(sendEvent({
          step: 'generating_outline',
          message: '正在生成全本大纲...',
          progress: 10,
        })))

        const totalEpisodes = episodeFormat?.count || Math.max(1, Math.ceil(chapters.length / 2))

        const outlinePrompt = `你是一位专业的短剧策划师。请根据以下小说分析和设定信息，生成完整的大纲。

## 小说分析
${drama.novelAnalysis || '（无分析数据）'}

## 题材基调
${genreTone ? `题材: ${genreTone.genre}, 基调: ${genreTone.tone}, 标签: ${genreTone.tags?.join(', ')}` : '（未设定）'}

## 付费墙配置
${paywallConfig ? `免费集数: ${paywallConfig.freeEpisodes}, 钩子集: ${paywallConfig.hookEpisodes?.join(',')}, 付费开始: 第${paywallConfig.payStart}集` : '（未配置）'}

## 章节范围
${drama.coverage || '全部章节'}

## 集数格式
共 ${totalEpisodes} 集, 每集时长 ${episodeFormat?.duration || '2分钟'}, 格式 ${episodeFormat?.format || '竖屏短剧'}

请生成 JSON 格式的大纲：
{
  "episodes": [
    {
      "episodeNumber": 1,
      "title": "集标题",
      "sourceChapterIds": [1, 2],
      "coreEvent": "核心事件描述",
      "hook": "结尾钩子描述"
    }
  ]
}

注意：
1. 章节范围从 0 开始（sourceChapterIds 是章节索引数组）
2. 每集覆盖 1-3 个章节
3. 确保 ${totalEpisodes} 集全部覆盖指定章节范围
4. 钩子集和付费集的标题要更有冲击力

只返回 JSON，不要其他内容。`

        const { aiClient } = await import('@/lib/ai-config')
        aiClient._userId = auth.userId

        const outlineResult = await aiClient.chatJson<{ episodes: OutlineEpisode[] }>(
          [
            { role: 'system', content: '你是专业的短剧策划师，擅长将小说改编为付费短剧大纲。你只返回JSON格式数据。' },
            { role: 'user', content: outlinePrompt },
          ],
          { temperature: 0.7, max_tokens: 8192 }
        )

        const outlineEpisodes = outlineResult.episodes || []

        controller.enqueue(encoder.encode(sendEvent({
          step: 'outline_generated',
          message: `大纲生成完成，共 ${outlineEpisodes.length} 集`,
          progress: 25,
          detail: { episodeCount: outlineEpisodes.length },
        })))

        // Step 3: Generate each episode's script
        const generatedEpisodes: Array<{
          id: string
          episodeNumber: number
          title: string
          scriptStatus: string
        }> = []

        const episodeProgressBase = 25
        const episodeProgressRange = 70
        const epCount = Math.max(outlineEpisodes.length, 1)

        for (let i = 0; i < outlineEpisodes.length; i++) {
          const outline = outlineEpisodes[i]
          const epType = classifyEpisodeType(outline.episodeNumber, paywallConfig)
          const epProgress = episodeProgressBase + Math.round(((i + 1) / epCount) * episodeProgressRange)

          controller.enqueue(encoder.encode(sendEvent({
            step: 'episode_generating',
            message: `正在生成第 ${outline.episodeNumber} 集: ${outline.title}...`,
            progress: epProgress,
            detail: {
              episodeNumber: outline.episodeNumber,
              title: outline.title,
              type: epType,
              current: i + 1,
              total: outlineEpisodes.length,
            },
          })))

          // Get relevant chapter content
          const sourceChapterIds = outline.sourceChapterIds || []
          const relevantChapters = chapters.filter((ch) =>
            sourceChapterIds.includes(ch.index)
          )
          const chapterContent = relevantChapters
            .map((ch) => `## ${ch.title}\n\n${ch.content}`)
            .join('\n\n---\n\n')
          const truncatedContent = chapterContent.length > 40000
            ? chapterContent.slice(0, 40000) + '\n\n...(内容过长已截断)'
            : chapterContent

          // Paywall engineering instructions
          const paywallInstruction = buildPaywallInstruction(outline.episodeNumber, epType, paywallConfig)

          // Build prompt
          const scriptPrompt = `请基于以下信息，为第${outline.episodeNumber}集生成完整的短剧剧本。

## 全本大纲
${JSON.stringify(outlineEpisodes, null, 2)}

## 本集规划
- 集序号: ${outline.episodeNumber}
- 标题: ${outline.title}
- 核心事件: ${outline.coreEvent}
- 预设钩子: ${outline.hook || '无'}
- 集类型: ${epType === 'hook' ? '钩子集（Hook）' : epType === 'pay' ? '付费集（Pay）' : '免费集（Free）'}

## 小说分析
${drama.novelAnalysis || '（无）'}

## 本集相关章节内容
${truncatedContent || '（无特定章节，请基于大纲创作）'}
${paywallInstruction}

请生成第${outline.episodeNumber}集的完整剧本，确保：
1. 严格遵循全本大纲和本集规划
2. 时长约2分钟（300-500字对白+场景描写）
3. 对白口语化、简练有力
4. 场景描写具有画面感`

          // Find or create episode
          let episode = await db.episode.findUnique({
            where: {
              dramaId_episodeNumber: {
                dramaId,
                episodeNumber: outline.episodeNumber,
              },
            },
          })

          if (!episode) {
            episode = await db.episode.create({
              data: {
                dramaId,
                episodeNumber: outline.episodeNumber,
                title: outline.title,
                sourceChapterIds: JSON.stringify(outline.sourceChapterIds),
                scriptStatus: 'processing',
              },
            })
          } else {
            await db.episode.update({
              where: { id: episode.id },
              data: {
                title: outline.title,
                sourceChapterIds: JSON.stringify(outline.sourceChapterIds),
                scriptStatus: 'processing',
              },
            })
          }

          try {
            // Use the script_generator agent for generation
            const result = await executeAgent(
              'script_generator',
              episode.id,
              dramaId,
              scriptPrompt,
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

            generatedEpisodes.push({
              id: episode.id,
              episodeNumber: outline.episodeNumber,
              title: outline.title,
              scriptStatus: 'completed',
            })
          } catch (error) {
            console.error(`[generate-scripts-v2] Episode ${outline.episodeNumber} failed:`, error)
            await db.episode.update({
              where: { id: episode.id },
              data: { scriptStatus: 'failed' },
            })
            generatedEpisodes.push({
              id: episode.id,
              episodeNumber: outline.episodeNumber,
              title: outline.title,
              scriptStatus: 'failed',
            })
          }
        }

        // Update drama
        const totalEpCount = await db.episode.count({ where: { dramaId } })
        await db.drama.update({
          where: { id: dramaId },
          data: {
            totalEpisodes: totalEpCount,
            scriptGenerationStatus: 'completed',
            currentPhase: 'asset_extraction',
          },
        })

        // Complete
        controller.enqueue(encoder.encode(sendEvent({
          step: 'completed',
          message: `剧本生成完成！成功 ${generatedEpisodes.filter(e => e.scriptStatus === 'completed').length}/${generatedEpisodes.length} 集`,
          progress: 100,
          result: {
            episodes: generatedEpisodes,
            totalGenerated: generatedEpisodes.filter(e => e.scriptStatus === 'completed').length,
          },
        })))

        controller.close()
        closed = true
      } catch (error) {
        console.error('[generate-scripts-v2] Failed:', error)

        // Mark drama as failed
        await db.drama.update({
          where: { id: dramaId },
          data: { scriptGenerationStatus: 'pending' },
        }).catch(() => {})

        controller.enqueue(encoder.encode(sendEvent({
          step: 'error',
          message: error instanceof Error ? error.message : String(error),
          progress: 0,
        })))
        controller.close()
        closed = true
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}

// ── GET: Return generation status ──────────────────────────

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const { id: dramaId } = await params

  const drama = await db.drama.findUnique({
    where: { id: dramaId },
    select: {
      userId: true,
      scriptGenerationStatus: true,
      totalEpisodes: true,
      currentPhase: true,
    },
  })

  if (!drama) {
    return NextResponse.json({ error: 'Drama 不存在' }, { status: 404 })
  }
  if (drama.userId && drama.userId !== auth.userId && auth.role !== 'admin') {
    return NextResponse.json({ error: '无权访问此项目' }, { status: 403 })
  }

  const episodes = await db.episode.findMany({
    where: { dramaId },
    select: {
      id: true,
      episodeNumber: true,
      title: true,
      scriptStatus: true,
      sourceChapterIds: true,
    },
    orderBy: { episodeNumber: 'asc' },
  })

  const completedCount = episodes.filter(e => e.scriptStatus === 'completed').length
  const failedCount = episodes.filter(e => e.scriptStatus === 'failed').length

  return NextResponse.json({
    dramaId,
    status: drama.scriptGenerationStatus || 'pending',
    currentPhase: drama.currentPhase,
    totalEpisodes: drama.totalEpisodes,
    episodesGenerated: completedCount,
    episodesFailed: failedCount,
    progress: episodes.length > 0 ? Math.round((completedCount / episodes.length) * 100) : 0,
    episodes,
  })
}
