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
  scenes?: Array<{
    sceneNumber: number
    location: string
    timeOfDay?: string
    description?: string
    content: string
  }>
}

interface CharacterInput {
  name: string
  role?: string
  gender?: string
  description?: string
}

interface SceneInput {
  location: string
  timeOfDay?: string
  description?: string
}

interface CreateFromScriptBody {
  title: string
  genre: string
  style: string
  episodes: EpisodeInput[]
  characters?: CharacterInput[]
  scenes?: SceneInput[]
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
    const { title, genre, style, episodes, characters, scenes, autoStartPipeline } = body

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

    // Create Drama + Episodes + Characters + Scenes in a transaction
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
        // If episodes have scenes data, store scene breakdown as JSON in rawContent
        // We keep rawContent as the full episode text, and append scenes JSON metadata
        let rawContent = ep.rawContent
        if (ep.scenes && Array.isArray(ep.scenes) && ep.scenes.length > 0) {
          // Append scene breakdown metadata as a JSON comment at the end
          rawContent += '\n\n---SCENE_BREAK---\n' + JSON.stringify(ep.scenes)
        }

        const episode = await tx.episode.create({
          data: {
            dramaId: drama.id,
            episodeNumber: i + 1,
            title: ep.title,
            rawContent,
            scriptStatus: 'pending',
            // Inherit defaultLockedConfig from the newly created drama
            lockedConfig: drama.defaultLockedConfig || 'null',
          },
        })
        createdEpisodes.push(episode)
      }

      // 3. Create Characters (if provided)
      const createdCharacters: any[] = []
      if (characters && Array.isArray(characters) && characters.length > 0) {
        for (const char of characters) {
          if (!char.name) continue
          const character = await tx.character.create({
            data: {
              dramaId: drama.id,
              name: char.name,
              role: char.role || 'supporting',
              gender: char.gender || 'unknown',
              appearance: char.description || '',
            },
          })
          createdCharacters.push(character)
        }
      }

      // 4. Create Scenes (if provided)
      const createdScenes: any[] = []
      if (scenes && Array.isArray(scenes) && scenes.length > 0) {
        for (const scene of scenes) {
          if (!scene.location) continue
          const sceneRecord = await tx.scene.create({
            data: {
              dramaId: drama.id,
              location: scene.location,
              timeOfDay: scene.timeOfDay || 'day',
              description: scene.description || '',
            },
          })
          createdScenes.push(sceneRecord)
        }
      }

      return { drama, episodes: createdEpisodes, characters: createdCharacters, scenes: createdScenes }
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
        characters: result.characters,
        scenes: result.scenes,
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
