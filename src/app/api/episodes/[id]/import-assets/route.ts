import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// ============================================================
// Import Global Assets API
// GET  /api/episodes/[id]/import-assets — Preview what will be imported
// POST /api/episodes/[id]/import-assets — Actually import global assets
// ============================================================

// GET — Preview what will be imported
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: episodeId } = await params

    const episode = await db.episode.findUnique({
      where: { id: episodeId },
      select: { id: true, dramaId: true, globalAssetsImported: true, sourceChapterIds: true },
    })

    if (!episode) {
      return NextResponse.json({ error: 'Episode not found' }, { status: 404 })
    }

    // Get all global characters, scenes, props for this drama
    const [characters, scenes, props] = await Promise.all([
      db.character.findMany({ where: { dramaId: episode.dramaId } }),
      db.scene.findMany({ where: { dramaId: episode.dramaId } }),
      db.prop.findMany({ where: { dramaId: episode.dramaId } }),
    ])

    // Determine which are already imported (have this episode's ID in episodeIds)
    const isImported = (episodeIdsStr: string): boolean => {
      try {
        const ids: string[] = JSON.parse(episodeIdsStr || '[]')
        return ids.includes(episodeId)
      } catch {
        return false
      }
    }

    const availableCharacters = characters.filter((c) => !isImported(c.episodeIds))
    const alreadyImportedCharacters = characters.filter((c) => isImported(c.episodeIds))

    const availableScenes = scenes.filter((s) => !isImported(s.episodeIds))
    const alreadyImportedScenes = scenes.filter((s) => isImported(s.episodeIds))

    const availableProps = props.filter((p) => {
      // Props don't have episodeIds in the schema, so treat them all as available
      return true
    })

    return NextResponse.json({
      available: {
        characters: availableCharacters.length,
        scenes: availableScenes.length,
        props: availableProps.length,
      },
      alreadyImported: {
        characters: alreadyImportedCharacters.length,
        scenes: alreadyImportedScenes.length,
        props: 0, // Props don't have episodeIds tracking
      },
      globalAssetsImported: episode.globalAssetsImported,
      items: {
        characters: characters.map((c) => ({
          id: c.id,
          name: c.name,
          role: c.role,
          gender: c.gender,
          alreadyImported: isImported(c.episodeIds),
        })),
        scenes: scenes.map((s) => ({
          id: s.id,
          location: s.location,
          timeOfDay: s.timeOfDay,
          alreadyImported: isImported(s.episodeIds),
        })),
        props: props.map((p) => ({
          id: p.id,
          name: p.name,
          category: p.category,
        })),
      },
    })
  } catch (error) {
    console.error('[import-assets] GET failed:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// POST — Actually import global assets into the episode
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: episodeId } = await params
    let overwrite = false

    try {
      const body = await request.json()
      overwrite = body.overwrite ?? false
    } catch {
      // No body or invalid JSON — use defaults
    }

    const episode = await db.episode.findUnique({
      where: { id: episodeId },
      select: {
        id: true,
        dramaId: true,
        globalAssetsImported: true,
        sourceChapterIds: true,
        rawContent: true,
        scriptContent: true,
      },
    })

    if (!episode) {
      return NextResponse.json({ error: 'Episode not found' }, { status: 404 })
    }

    // Get all global characters and scenes for this drama
    const [characters, scenes] = await Promise.all([
      db.character.findMany({ where: { dramaId: episode.dramaId } }),
      db.scene.findMany({ where: { dramaId: episode.dramaId } }),
    ])

    let importedCharacters = 0
    let importedScenes = 0

    // Import characters — add episodeId to episodeIds array
    for (const char of characters) {
      let episodeIds: string[] = []
      try {
        episodeIds = JSON.parse(char.episodeIds || '[]')
      } catch {
        episodeIds = []
      }

      if (!episodeIds.includes(episodeId)) {
        episodeIds.push(episodeId)
        await db.character.update({
          where: { id: char.id },
          data: { episodeIds: JSON.stringify(episodeIds) },
        })
        importedCharacters++
      } else if (overwrite) {
        // Even if already imported, ensure it's there (idempotent)
        // No action needed since it's already there
        importedCharacters++ // count as imported for overwrite mode
      }
    }

    // Import scenes — add episodeId to episodeIds array
    for (const scene of scenes) {
      let episodeIds: string[] = []
      try {
        episodeIds = JSON.parse(scene.episodeIds || '[]')
      } catch {
        episodeIds = []
      }

      if (!episodeIds.includes(episodeId)) {
        episodeIds.push(episodeId)
        await db.scene.update({
          where: { id: scene.id },
          data: { episodeIds: JSON.stringify(episodeIds) },
        })
        importedScenes++
      } else if (overwrite) {
        importedScenes++
      }
    }

    // Props are drama-level and don't need per-episode tracking
    const importedProps = 0 // No episodeIds field on props

    // Mark episode as having global assets imported
    await db.episode.update({
      where: { id: episodeId },
      data: { globalAssetsImported: true },
    })

    // If the episode has no rawContent yet but has sourceChapterIds, fill rawContent from novel
    if (!episode.rawContent?.trim() && episode.sourceChapterIds) {
      try {
        let chapterIds: number[] = []
        try {
          chapterIds = JSON.parse(episode.sourceChapterIds)
        } catch {
          chapterIds = []
        }

        if (chapterIds.length > 0) {
          const novel = await db.novel.findUnique({
            where: { dramaId: episode.dramaId },
          })

          if (novel) {
            let chapters: Array<{ index: number; title: string; content: string }> = []
            try {
              chapters = JSON.parse(novel.chapters)
            } catch {
              chapters = []
            }

            const selectedChapters = chapters.filter((ch) =>
              chapterIds.includes(ch.index)
            )

            if (selectedChapters.length > 0) {
              const rawContent = selectedChapters
                .map((ch) => `## ${ch.title}\n\n${ch.content}`)
                .join('\n\n---\n\n')

              await db.episode.update({
                where: { id: episodeId },
                data: { rawContent },
              })
            }
          }
        }
      } catch (fillErr) {
        // Non-critical: if filling rawContent fails, just log and continue
        console.warn('[import-assets] Failed to fill rawContent from novel:', fillErr)
      }
    }

    return NextResponse.json({
      imported: {
        characters: importedCharacters,
        scenes: importedScenes,
        props: importedProps,
      },
      globalAssetsImported: true,
    })
  } catch (error) {
    console.error('[import-assets] POST failed:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
