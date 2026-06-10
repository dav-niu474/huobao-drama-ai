import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { aiClient } from '@/lib/ai-config'

// Helper: check drama access
async function checkDramaAccess(id: string, session: any) {
  const userId = (session.user as any).id
  const role = (session.user as any).role
  const drama = await db.drama.findUnique({ where: { id }, select: { userId: true } })
  if (!drama) return { error: null, notFound: true }
  if (role !== 'admin' && drama.userId && drama.userId !== userId) {
    return { error: '无权访问此项目', forbidden: true }
  }
  return { error: null, notFound: false, forbidden: false }
}

// GET /api/dramas/[id]/novel-analysis — Return current analysis status
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const { id } = await params
    const access = await checkDramaAccess(id, session)
    if (access.notFound) return NextResponse.json({ error: 'Drama not found' }, { status: 404 })
    if (access.forbidden) return NextResponse.json({ error: access.error }, { status: 403 })

    const drama = await db.drama.findUnique({
      where: { id },
      select: {
        novelAnalysis: true,
        genreTone: true,
        currentPhase: true,
        showPlanLocked: true,
        novelParsed: true,
      },
    })

    if (!drama) {
      return NextResponse.json({ error: 'Drama not found' }, { status: 404 })
    }

    // Get chapter count from novel
    const novel = await db.novel.findUnique({
      where: { dramaId: id },
      select: { chapters: true, parseStatus: true },
    })

    let chapterCount = 0
    if (novel?.chapters) {
      try {
        const chapters = JSON.parse(novel.chapters)
        chapterCount = Array.isArray(chapters) ? chapters.length : 0
      } catch {
        chapterCount = 0
      }
    }

    let parsedAnalysis = null
    if (drama.novelAnalysis) {
      try {
        parsedAnalysis = JSON.parse(drama.novelAnalysis)
      } catch {
        parsedAnalysis = { raw: drama.novelAnalysis }
      }
    }

    return NextResponse.json({
      status: drama.novelAnalysis ? 'completed' : (drama.novelParsed ? 'pending_analysis' : 'not_started'),
      chapterCount,
      analysis: parsedAnalysis,
      genreTone: drama.genreTone,
      currentPhase: drama.currentPhase,
      showPlanLocked: drama.showPlanLocked,
      novelParsed: drama.novelParsed,
      parseStatus: novel?.parseStatus ?? 'pending',
    })
  } catch (error) {
    console.error('Failed to get novel analysis:', error)
    return NextResponse.json({ error: 'Failed to get novel analysis' }, { status: 500 })
  }
}

// POST /api/dramas/[id]/novel-analysis — Trigger full novel analysis (SSE stream)
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const { id } = await params
    const access = await checkDramaAccess(id, session)
    if (access.notFound) return NextResponse.json({ error: 'Drama not found' }, { status: 404 })
    if (access.forbidden) return NextResponse.json({ error: access.error }, { status: 403 })

    // Get drama and novel content
    const drama = await db.drama.findUnique({
      where: { id },
      select: { title: true, genre: true, currentPhase: true, novelParsed: true },
    })
    if (!drama) {
      return NextResponse.json({ error: 'Drama not found' }, { status: 404 })
    }

    const novel = await db.novel.findUnique({
      where: { dramaId: id },
    })
    if (!novel) {
      return NextResponse.json({ error: 'No novel found. Please upload a novel first.' }, { status: 400 })
    }

    // Parse chapters
    let chapters: Array<{ index: number; title: string; content: string }> = []
    try {
      chapters = JSON.parse(novel.chapters)
    } catch {
      return NextResponse.json({ error: 'Failed to parse novel chapters' }, { status: 400 })
    }

    if (chapters.length === 0) {
      return NextResponse.json({ error: 'Novel has no chapters to analyze' }, { status: 400 })
    }

    // Build novel content summary for analysis (truncate if too long)
    const MAX_CONTENT_LENGTH = 12000
    let novelContent = chapters.map((ch) => `## 第${ch.index}章 ${ch.title}\n${ch.content}`).join('\n\n')
    if (novelContent.length > MAX_CONTENT_LENGTH) {
      // Take beginning, middle, and end portions
      const begin = novelContent.slice(0, 4000)
      const mid = novelContent.slice(Math.floor(novelContent.length / 2) - 2000, Math.floor(novelContent.length / 2) + 2000)
      const end = novelContent.slice(-4000)
      novelContent = `${begin}\n\n... (中间省略) ...\n\n${mid}\n\n... (中间省略) ...\n\n${end}`
    }

    // Create SSE stream for progress
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (step: string, message: string, progress: number, detail?: unknown) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ step, message, progress, detail })}\n\n`))
        }

        try {
          // Step 1: Hit element identification
          sendEvent('hit_elements', '正在识别爆款元素...', 10)

          const hitElementsPrompt = `你是一位专业的短剧爆款分析师。请分析以下小说内容，识别其中的爆款元素。

小说标题：${drama.title}
小说题材：${drama.genre}

小说内容（摘要）：
${novelContent}

请识别以下6类爆款元素，以JSON格式返回：
{
  "counterattack": { "score": 1-10, "description": "逆袭元素描述", "keyScenes": ["场景1", "场景2"] },
  "faceSlap": { "score": 1-10, "description": "打脸元素描述", "keyScenes": ["场景1", "场景2"] },
  "reversal": { "score": 1-10, "description": "反转元素描述", "keyScenes": ["场景1", "场景2"] },
  "cpTension": { "score": 1-10, "description": "CP拉扯元素描述", "keyScenes": ["场景1", "场景2"] },
  "goldenFinger": { "score": 1-10, "description": "金手指元素描述", "keyScenes": ["场景1", "场景2"] },
  "goldenQuotes": ["金句1", "金句2", "金句3"]
}

只返回JSON，不要添加其他内容。`

          const hitElements = await aiClient.chatJson(hitElementsPrompt, undefined, {
            temperature: 0.5,
            max_tokens: 2048,
          })

          sendEvent('hit_elements', '爆款元素识别完成', 30, hitElements)

          // Step 2: 4-dimensional genre classification
          sendEvent('genre_classification', '正在进行四维题材分类...', 35)

          const genrePrompt = `你是一位专业的短剧题材分析师。请对以下小说进行四维题材分类。

小说标题：${drama.title}
小说内容（摘要）：
${novelContent}

请从四个维度进行分类，以JSON格式返回：
{
  "genre": { "primary": "主要题材", "secondary": ["副题材1", "副题材2"] },
  "tone": { "primary": "主要基调", "secondary": ["副基调1", "副基调2"] },
  "style": { "primary": "主要风格", "secondary": ["副风格1", "副风格2"] },
  "tags": ["标签1", "标签2", "标签3", "标签4", "标签5"]
}

可选题材：都市/古装/悬疑/科幻/甜宠/复仇/励志/校园/宫斗/玄幻/职场/家庭
可选基调：爽感/虐心/搞笑/温馨/暗黑/热血/治愈
可选风格：写实/动漫/电影感/漫画/水彩/3D
只返回JSON，不要添加其他内容。`

          const genreClassification = await aiClient.chatJson(genrePrompt, undefined, {
            temperature: 0.4,
            max_tokens: 1024,
          })

          sendEvent('genre_classification', '题材分类完成', 55, genreClassification)

          // Step 3: Episode count recommendation
          sendEvent('episode_recommendation', '正在推荐集数规划...', 60)

          const episodePrompt = `你是一位专业的短剧策划。请根据以下小说内容推荐集数规划。

小说标题：${drama.title}
章节数量：${chapters.length}

小说内容（摘要）：
${novelContent}

请以JSON格式返回集数推荐：
{
  "recommendedCount": 80,
  "minCount": 60,
  "maxCount": 100,
  "episodeDuration": "1-2分钟",
  "reasoning": "推荐理由",
  "arcBreakdown": [
    { "arc": "第一幕：铺垫", "episodes": "1-20", "chapters": "1-15" },
    { "arc": "第二幕：冲突升级", "episodes": "21-50", "chapters": "16-40" },
    { "arc": "第三幕：高潮反转", "episodes": "51-70", "chapters": "41-55" },
    { "arc": "第四幕：结局", "episodes": "71-80", "chapters": "56-60" }
  ]
}

只返回JSON，不要添加其他内容。`

          const episodeRecommendation = await aiClient.chatJson(episodePrompt, undefined, {
            temperature: 0.4,
            max_tokens: 2048,
          })

          sendEvent('episode_recommendation', '集数推荐完成', 75, episodeRecommendation)

          // Step 4: Paywall candidate points
          sendEvent('paywall_candidates', '正在识别付费墙候选点...', 80)

          const paywallPrompt = `你是一位专业的短剧商业化策略师。请根据以下小说内容识别最佳付费墙候选点。

小说标题：${drama.title}
章节数量：${chapters.length}

小说内容（摘要）：
${novelContent}

请以JSON格式返回付费墙候选点：
{
  "recommendedFreeEpisodes": 5,
  "hookEpisodes": [3, 5, 8, 15],
  "paywallCandidates": [
    { "episode": 6, "reason": "第一波高潮后的悬念", "confidence": 0.9 },
    { "episode": 10, "reason": "重大反转前", "confidence": 0.85 },
    { "episode": 15, "reason": "情感巅峰", "confidence": 0.8 }
  ],
  "strategy": "前5集免费引流，第3集设钩子制造悬念，第6集开始付费。关键钩子集数：3、5、8、15。"
}

只返回JSON，不要添加其他内容。`

          const paywallCandidates = await aiClient.chatJson(paywallPrompt, undefined, {
            temperature: 0.4,
            max_tokens: 2048,
          })

          sendEvent('paywall_candidates', '付费墙候选点识别完成', 90, paywallCandidates)

          // Step 5: Compile final analysis and update database
          const analysisResult = {
            hitElements,
            genreClassification,
            episodeRecommendation,
            paywallCandidates,
            analyzedAt: new Date().toISOString(),
            chapterCount: chapters.length,
          }

          // Update drama with analysis results
          await db.drama.update({
            where: { id },
            data: {
              novelAnalysis: JSON.stringify(analysisResult),
              genreTone: JSON.stringify(genreClassification),
              currentPhase: 'show_planning',
              totalEpisodes: (episodeRecommendation as any)?.recommendedCount ?? drama.totalEpisodes,
            },
          })

          sendEvent('completed', '全本分析完成', 100, analysisResult)

          controller.close()
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error'
          sendEvent('error', message, -1)
          controller.close()
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
  } catch (error) {
    console.error('Failed to trigger novel analysis:', error)
    return NextResponse.json({ error: 'Failed to trigger novel analysis' }, { status: 500 })
  }
}
