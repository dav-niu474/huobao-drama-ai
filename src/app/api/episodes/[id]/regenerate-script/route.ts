import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helpers'
import { userIdContext, aiClient } from '@/lib/ai-config'
import { db } from '@/lib/db'

export const maxDuration = 120

// POST /api/episodes/[id]/regenerate-script
// Regenerates the script for a single episode using the script_generator agent.
// Reads the novel's stored skeleton/strategy from parsedContent for context,
// calls the LLM, and writes the result back to the episode row.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const { id } = await params
  const episode = await db.episode.findUnique({
    where: { id },
    include: { drama: { select: { userId: true, id: true } } },
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

  return userIdContext.run(auth.userId, async () => {
    // Mark as processing so the UI can reflect the in-flight state.
    await db.episode.update({
      where: { id },
      data: { scriptStatus: 'processing' },
    })

    try {
      // Pull skeleton/strategy context from the linked novel.
      const novel = await db.novel.findUnique({
        where: { dramaId: episode.dramaId },
      })
      let parsed: Record<string, unknown> = {}
      try {
        parsed = JSON.parse(novel?.parsedContent || '{}')
      } catch {
        parsed = {}
      }

      const skeleton = (parsed.skeleton as string) || ''
      const strategy = (parsed.strategy as string) || ''

      const systemPrompt =
        '你是一个专业的短剧编剧。根据提供的故事骨架和改编策略，为指定集数生成完整剧本。剧本格式：包含场景描述、人物动作、对白，每集时长约2分钟（300-500字）。'

      const userPrompt = `## 故事骨架
${skeleton.slice(0, 4000)}

## 改编策略
${strategy.slice(0, 2000)}

## 任务
请生成第${episode.episodeNumber}集的完整剧本。

集标题: ${episode.title || `第${episode.episodeNumber}集`}

要求：
1. 剧本格式标准，包含场景描述（△标记）、人物动作、对白
2. 时长约2分钟（300-500字）
3. 结尾设置悬念钩子
4. 保持与前后集的连贯性

请直接输出剧本内容，不要其他说明。`

      const scriptContent = await aiClient.chat(userPrompt, systemPrompt, {
        temperature: 0.7,
      })

      await db.episode.update({
        where: { id },
        data: { scriptContent, scriptStatus: 'completed' },
      })

      return NextResponse.json({ success: true, scriptContent })
    } catch (error: any) {
      await db.episode.update({
        where: { id },
        data: { scriptStatus: 'failed' },
      })
      return NextResponse.json(
        { error: error?.message || '生成失败' },
        { status: 500 }
      )
    }
  })
}
