import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helpers'
import { userIdContext } from '@/lib/ai-config'
import { db } from '@/lib/db'
import {
  generateEpisodeScript,
  friendlyScriptError,
  SCRIPT_DURATIONS,
} from '@/lib/script-generation'

export const maxDuration = 300

// ============================================================
// POST /api/episodes/[id]/generate-script
//
// 从本集的小说章节（sourceChapterIds / rawContent）生成剧本。
// 核心逻辑在 src/lib/script-generation.ts（与批量管线共用）。
// 可选 body: { duration?: '90s'|'120s'|'180s'|'300s', instruction?: string }
// ============================================================

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const duration: string = SCRIPT_DURATIONS.includes(body?.duration)
    ? body.duration
    : '120s'
  const instruction: string = (body?.instruction ?? '').toString().slice(0, 2000)

  const episode = await db.episode.findUnique({
    where: { id },
    include: {
      drama: {
        select: {
          userId: true,
          id: true,
          title: true,
          genre: true,
          style: true,
          styleTemplate: true,
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
      const result = await generateEpisodeScript(id, {
        duration,
        instruction,
        userId: auth.userId,
      })
      return NextResponse.json({ success: true, scriptContent: result.scriptContent, duration })
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      console.error('[generate-script] Failed:', msg)
      const status = msg.includes('小说原文') ? 400 : 500
      return NextResponse.json({ error: friendlyScriptError(error) }, { status })
    }
  })
}
