// ============================================================
// POST /api/ai/generate-storyboard-table — Storyboard Table Agent
// Inspired by Toonflow's storyboard-table agent: generates a
// structured storyboard table (each segment ≤ 15s) from an
// episode's scriptContent, referencing existing characters /
// scenes / props by ID.
//
// Body: { episodeId: string }
// Response: {
//   success: boolean,
//   storyboardTable: string,      // XML-wrapped markdown table
//   assetCount: { characters: number; scenes: number; props: number }
// }
//
// NOTE: The Episode model has no dedicated field for storyboardTable.
// We return the generated table to the client for local storage /
// display, rather than persisting it server-side. This keeps the
// schema migration-free while still exposing the capability.
// ============================================================

// Allow up to 5 minutes for AI generation
export const maxDuration = 300

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helpers'
import { userIdContext, aiClient } from '@/lib/ai-config'
import { db } from '@/lib/db'

// POST /api/ai/generate-storyboard-table
// Generates a structured storyboard table from episode script content
export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const body = await request.json().catch(() => ({}))
  const { episodeId } = body

  if (!episodeId) {
    return NextResponse.json({ error: '缺少 episodeId' }, { status: 400 })
  }

  const episode = await db.episode.findUnique({
    where: { id: episodeId },
    include: { drama: { select: { userId: true } } },
  })

  if (!episode) {
    return NextResponse.json({ error: 'Episode not found' }, { status: 404 })
  }

  if (episode.drama.userId && episode.drama.userId !== auth.userId && auth.role !== 'admin') {
    return NextResponse.json({ error: '无权访问此项目' }, { status: 403 })
  }

  if (!episode.scriptContent) {
    return NextResponse.json(
      { error: '该集还没有剧本内容，请先生成剧本' },
      { status: 400 }
    )
  }

  return await userIdContext.run(auth.userId, async () => {
    // Fetch assets
    const [characters, scenes, props] = await Promise.all([
      db.character.findMany({ where: { dramaId: episode.dramaId } }),
      db.scene.findMany({ where: { dramaId: episode.dramaId } }),
      db.prop.findMany({ where: { dramaId: episode.dramaId } }),
    ])

    const assetHint = [
      '## 可用资产',
      `角色: ${characters.map((c) => `${c.id}:${c.name}`).join(', ') || '无'}`,
      `场景: ${scenes.map((s) => `${s.id}:${s.location}`).join(', ') || '无'}`,
      `道具: ${props.map((p) => `${p.id}:${p.name}`).join(', ') || '无'}`,
    ].join('\n')

    // episode.scriptContent is guaranteed non-null here (early-return above),
    // but TypeScript can't follow the narrowing across the userIdContext.run
    // closure, so we capture it locally for safety.
    const scriptContent = episode.scriptContent ?? ''

    const systemPrompt = `你是分镜表生成专家。基于剧本内容构建结构化分镜表，每个片段≤15秒。

输出格式（XML 包裹）：
<storyboardTable>
## 场N：场景名 ｜ 参演角色：角色A、角色B
### 片段一（约10s）
**引用资产名称**：[角色A, 场景B]
**引用资产ID**：[101, 201]
| 序号 | 画面描述 | 时长 | 景别 | 运镜 | 台词 | 音效 |
| 1 | 画面描述... | 5 | 近景 | 缓推 | 台词 | 音效 |
</storyboardTable>

铁律：
1. 每个片段 ≤ 15秒
2. 长台词 >20字必须拆镜
3. 台词零删改
4. 在场人物不能消失
5. 人物外观交给图片资产
6. 禁光影/色调/配乐`

    const userPrompt = `${assetHint}\n\n请为以下剧本生成分镜表:\n\n${scriptContent.slice(0, 8000)}`

    const response = await aiClient.chat(userPrompt, systemPrompt, { temperature: 0.4 })

    // Extract XML content
    const xmlMatch = response.match(/<storyboardTable>([\s\S]*?)<\/storyboardTable>/)
    const storyboardTable = xmlMatch ? xmlMatch[1].trim() : response

    return NextResponse.json({
      success: true,
      storyboardTable,
      assetCount: {
        characters: characters.length,
        scenes: scenes.length,
        props: props.length,
      },
    })
  })
}
