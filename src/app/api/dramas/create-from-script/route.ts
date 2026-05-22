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

    console.log(`[create-from-script] Creating drama "${title}" with ${episodes.length} episodes, ${characters?.length || 0} characters, ${scenes?.length || 0} scenes`)

    // Create Drama + Episodes + Characters + Scenes in a transaction
    // Use 30s timeout (default is 5s which is too short for multiple writes)
    const result = await db.$transaction(
      async (tx) => {
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

        // 2. Create Episodes — use createMany for batch efficiency, then fetch back
        const episodeData = episodes.map((ep, i) => {
          let rawContent = ep.rawContent
          if (ep.scenes && Array.isArray(ep.scenes) && ep.scenes.length > 0) {
            rawContent += '\n\n---SCENE_BREAK---\n' + JSON.stringify(ep.scenes)
          }
          return {
            dramaId: drama.id,
            episodeNumber: i + 1,
            title: ep.title,
            rawContent,
            scriptStatus: 'pending',
            lockedConfig: drama.defaultLockedConfig || 'null',
          }
        })

        await tx.episode.createMany({ data: episodeData })
        const createdEpisodes = await tx.episode.findMany({
          where: { dramaId: drama.id },
          orderBy: { episodeNumber: 'asc' },
        })

        // 3. Create Characters (if provided) — use createMany for batch
        let createdCharacters: any[] = []
        if (characters && Array.isArray(characters) && characters.length > 0) {
          const validChars = characters.filter(c => c.name)
          if (validChars.length > 0) {
            const charData = validChars.map(char => ({
              dramaId: drama.id,
              name: char.name,
              role: char.role || 'supporting',
              gender: char.gender || 'unknown',
              appearance: char.description || '',
            }))
            await tx.character.createMany({ data: charData })
            createdCharacters = await tx.character.findMany({
              where: { dramaId: drama.id },
            })
          }
        }

        // 4. Create Scenes (if provided) — use createMany for batch
        let createdScenes: any[] = []
        if (scenes && Array.isArray(scenes) && scenes.length > 0) {
          const validScenes = scenes.filter(s => s.location)
          if (validScenes.length > 0) {
            const sceneData = validScenes.map(scene => ({
              dramaId: drama.id,
              location: scene.location,
              timeOfDay: scene.timeOfDay || 'day',
              description: scene.description || '',
            }))
            await tx.scene.createMany({ data: sceneData })
            createdScenes = await tx.scene.findMany({
              where: { dramaId: drama.id },
            })
          }
        }

        return { drama, episodes: createdEpisodes, characters: createdCharacters, scenes: createdScenes }
      },
      {
        maxWait: 10000,   // max time to wait for transaction to start (10s)
        timeout: 30000,   // max time for transaction to complete (30s)
      }
    )

    console.log(`[create-from-script] Successfully created drama "${title}" (id: ${result.drama.id})`)

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
