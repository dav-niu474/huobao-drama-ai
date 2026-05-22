// ============================================================
// Create Drama from Parsed Script API
// POST /api/dramas/create-from-script
// Accepts parsed script data, creates Drama + Episodes in a
// single transaction. Used after script_parser agent completes.
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions, canCreateProject } from '@/lib/auth'
import { db } from '@/lib/db'

interface EpisodeInput {
  title: string
  rawContent: string
}

interface CreateFromScriptBody {
  title: string
  genre: string
  style: string
  episodes: EpisodeInput[]
  autoStartPipeline?: boolean
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const userId = (session.user as any).id
    const role = (session.user as any).role

    // Check project limit
    const currentCount = await db.drama.count({
      where: { userId },
    })

    if (!canCreateProject(role, currentCount)) {
      return NextResponse.json(
        { error: `免费用户最多创建3个项目，当前已有${currentCount}个。升级专业版可无限制创建。` },
        { status: 403 }
      )
    }

    const body: CreateFromScriptBody = await request.json()
    const { title, genre, style, episodes, autoStartPipeline } = body

    // Validate required fields
    if (!title) {
      return NextResponse.json({ error: '标题不能为空' }, { status: 400 })
    }
    if (!genre) {
      return NextResponse.json({ error: '题材不能为空' }, { status: 400 })
    }
    if (!style) {
      return NextResponse.json({ error: '风格不能为空' }, { status: 400 })
    }
    if (!episodes || !Array.isArray(episodes) || episodes.length === 0) {
      return NextResponse.json({ error: '剧集数据不能为空' }, { status: 400 })
    }

    // Validate each episode
    for (let i = 0; i < episodes.length; i++) {
      if (!episodes[i].title) {
        return NextResponse.json(
          { error: `第${i + 1}集标题不能为空` },
          { status: 400 }
        )
      }
      if (!episodes[i].rawContent) {
        return NextResponse.json(
          { error: `第${i + 1}集内容不能为空` },
          { status: 400 }
        )
      }
    }

    // Create Drama + Episodes in a transaction
    const result = await db.$transaction(async (tx) => {
      // 1. Create Drama
      const drama = await tx.drama.create({
        data: {
          title,
          genre,
          style,
          userId,
          totalEpisodes: episodes.length,
        },
      })

      // 2. Create Episodes
      const createdEpisodes: any[] = []
      for (let i = 0; i < episodes.length; i++) {
        const ep = episodes[i]
        const episode = await tx.episode.create({
          data: {
            dramaId: drama.id,
            episodeNumber: i + 1,
            title: ep.title,
            rawContent: ep.rawContent,
            scriptStatus: 'pending',
          },
        })
        createdEpisodes.push(episode)
      }

      return { drama, episodes: createdEpisodes }
    })

    // If autoStartPipeline is requested, we return a flag for the frontend
    // to handle starting the pipeline (too complex for this endpoint)
    const pipelineStarted = false
    if (autoStartPipeline) {
      // Frontend should use the returned drama/episode IDs to start
      // the pipeline via the agent stream API
    }

    return NextResponse.json(
      {
        drama: result.drama,
        episodes: result.episodes,
        pipelineStarted,
      },
      { status: 201 }
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[create-from-script] Failed:', message)
    return NextResponse.json(
      { error: '创建项目失败', detail: message },
      { status: 500 }
    )
  }
}
