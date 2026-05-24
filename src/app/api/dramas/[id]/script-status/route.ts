// ============================================================
// GET /api/dramas/[id]/script-status
// Get script generation status for all episodes of a drama
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helpers'
import { db } from '@/lib/db'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth()
    if (auth.error) return auth.error

    const { id: dramaId } = await params

    // Validate drama exists
    const drama = await db.drama.findUnique({
      where: { id: dramaId },
      select: { userId: true },
    })
    if (!drama) {
      return NextResponse.json({ error: 'Drama 不存在' }, { status: 404 })
    }
    if (drama.userId && drama.userId !== auth.userId && auth.role !== 'admin') {
      return NextResponse.json({ error: '无权访问此项目' }, { status: 403 })
    }

    // Get all episodes
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

    return NextResponse.json({
      dramaId,
      totalEpisodes: episodes.length,
      episodes: episodes.map((ep) => ({
        id: ep.id,
        episodeNumber: ep.episodeNumber,
        title: ep.title,
        scriptStatus: ep.scriptStatus,
        sourceChapterIds: ep.sourceChapterIds,
      })),
    })
  } catch (error) {
    console.error('[script-status] Failed:', error)
    return NextResponse.json(
      { error: '获取剧本状态失败' },
      { status: 500 }
    )
  }
}
