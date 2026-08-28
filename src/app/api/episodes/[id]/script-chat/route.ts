import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helpers'
import { userIdContext, aiClient } from '@/lib/ai-config'
import { db } from '@/lib/db'

export const maxDuration = 120

// ============================================================
// POST /api/episodes/[id]/script-chat
//
// 剧本工作台底部 AI 助手：围绕"当前剧本、角色、分镜"回答问题。
// Body: { question: string, history?: Array<{role:'user'|'assistant', content:string}> }
// 返回: { answer: string }
// ============================================================

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const question: string = (body?.question ?? '').toString().trim().slice(0, 2000)
  const history: Array<{ role: 'user' | 'assistant'; content: string }> = Array.isArray(
    body?.history
  )
    ? body.history.slice(-6).map((h: any) => ({
        role: h?.role === 'assistant' ? 'assistant' : 'user',
        content: String(h?.content ?? '').slice(0, 2000),
      }))
    : []

  if (!question) {
    return NextResponse.json({ error: '问题不能为空' }, { status: 400 })
  }

  const episode = await db.episode.findUnique({
    where: { id },
    include: {
      drama: {
        select: {
          userId: true,
          title: true,
          genre: true,
        },
      },
    },
  })

  if (!episode) {
    return NextResponse.json({ error: '剧集不存在' }, { status: 404 })
  }
  if (
    episode.drama.userId &&
    episode.drama.userId !== auth.userId &&
    auth.role !== 'admin'
  ) {
    return NextResponse.json({ error: '无权访问' }, { status: 403 })
  }

  return userIdContext.run(auth.userId, async () => {
    try {
      // ── 组装上下文：剧本 + 角色 + 分镜摘要 ──
      const [characters, storyboards] = await Promise.all([
        db.character.findMany({
          where: { dramaId: episode.dramaId },
          select: {
            name: true,
            role: true,
            gender: true,
            age: true,
            personality: true,
            appearance: true,
          },
          take: 20,
        }),
        db.storyboard.findMany({
          where: { episodeId: id },
          orderBy: { shotNumber: 'asc' },
          select: {
            shotNumber: true,
            title: true,
            shotType: true,
            description: true,
            dialogue: true,
            dialogueChar: true,
          },
          take: 60,
        }),
      ])

      const charLines = characters
        .map(
          (c) =>
            `- ${c.name}（${c.role === 'protagonist' ? '主角' : c.role === 'antagonist' ? '反派' : '配角'}，${c.gender === 'male' ? '男' : c.gender === 'female' ? '女' : '其他'}${c.age ? `，${c.age}` : ''}）：${c.personality || c.appearance || '暂无描述'}`
        )
        .join('\n')

      const sbLines = storyboards
        .map(
          (s) =>
            `- 镜头${s.shotNumber} ${s.title || ''}［${s.shotType}］${s.dialogue ? ` 台词「${s.dialogueChar || ''}：${s.dialogue}」` : ''}`
        )
        .join('\n')

      const script = (episode.scriptContent || episode.rawContent || '').slice(0, 8000)

      const systemPrompt = `你是短剧创作平台的 AI 编剧助手，正在和编剧围绕当前剧集进行对话。请用简洁专业的中文回答（不超过 300 字），聚焦问题本身，可给出具体修改建议。不要输出 XML 或代码块。`

      const userPrompt = `## 当前项目
《${episode.drama.title}》· 第${episode.episodeNumber}集 ${episode.title || ''}（${episode.drama.genre || '都市'}题材）

## 剧本内容（截取）
${script || '（暂无剧本）'}

## 角色设定
${charLines || '（尚未提取角色）'}

## 分镜摘要
${sbLines || '（尚未生成分镜）'}

${history.length ? `## 最近对话\n${history.map((h) => `${h.role === 'user' ? '编剧' : '助手'}：${h.content}`).join('\n')}\n` : ''}
## 编剧的问题
${question}`

      const answer = await aiClient.chat(userPrompt, systemPrompt, {
        temperature: 0.6,
        max_tokens: 2048,
      })

      return NextResponse.json({ answer: answer.trim() })
    } catch (error: any) {
      const errMsg =
        error?.message || (error instanceof Error ? error.message : String(error))
      console.error('[script-chat] Failed:', errMsg)
      const isFriendly =
        typeof errMsg === 'string' &&
        (errMsg.includes('HTTP') ||
          errMsg.includes('供应商') ||
          errMsg.includes('模型') ||
          errMsg.includes('API Key'))
      return NextResponse.json(
        { error: isFriendly ? errMsg : `AI 助手暂时不可用: ${errMsg}` },
        { status: 500 }
      )
    }
  })
}
