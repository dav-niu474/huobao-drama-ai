import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { aiClient, userIdContext, AI_SYSTEM_PROMPTS } from '@/lib/ai-config'
import { requireAuth } from '@/lib/auth-helpers'

// POST /api/ai/rewrite-script - AI Script Rewrite
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (auth.error) return auth.error
    return await userIdContext.run(auth.userId, async () => {
    const { episodeId } = await request.json()

    if (!episodeId) {
      return NextResponse.json(
        { error: 'episodeId is required' },
        { status: 400 }
      )
    }

    const episode = await db.episode.findUnique({
      where: { id: episodeId },
    })

    if (!episode) {
      return NextResponse.json({ error: 'Episode not found' }, { status: 404 })
    }

    if (!episode.rawContent) {
      return NextResponse.json(
        { error: 'Episode has no raw content' },
        { status: 400 }
      )
    }

    await db.episode.update({
      where: { id: episodeId },
      data: { scriptStatus: 'processing' },
    })

    try {
      const scriptContent = await aiClient.chat(
        episode.rawContent,
        AI_SYSTEM_PROMPTS.SCRIPT_REWRITE,
        { temperature: 0.7, max_tokens: 8192 }
      )

      const updated = await db.episode.update({
        where: { id: episodeId },
        data: {
          scriptContent,
          scriptStatus: 'completed',
        },
      })

      return NextResponse.json({ episode: updated, scriptContent })
    } catch (aiError) {
      await db.episode.update({
        where: { id: episodeId },
        data: { scriptStatus: 'failed' },
      })
      throw aiError
    }
    })
  } catch (error) {
    console.error('Failed to rewrite script:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to rewrite script' },
      { status: 500 }
    )
  }
}
