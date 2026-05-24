// ============================================================
// Asset Extraction Library
// Batch asset extraction from scripts with deduplication.
// Leverages the existing extractor agent to process episodes
// in chunks, producing characters, scenes, and props.
// ============================================================

import { db } from '@/lib/db'
import { executeAgent } from '@/lib/agents/factory'

// ============================================================
// Types
// ============================================================

export interface ExtractionProgress {
  current: number
  total: number
  message: string
}

export interface ExtractionResult {
  characters: number
  scenes: number
  props: number
}

// ============================================================
// Chunked extraction helper — processes episodes in groups
// ============================================================

export function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size))
  }
  return chunks
}

// ============================================================
// Deduplication helper
// Compares existing assets with new ones by name/location.
// The extractor agent already has built-in dedup via
// read_existing_characters/scenes tools, but this provides
// an additional layer for post-extraction dedup.
// ============================================================

export function deduplicateAssets(
  existing: { characters: any[]; scenes: any[]; props: any[] },
  newAssets: { characters: any[]; scenes: any[]; props: any[] }
): { characters: any[]; scenes: any[]; props: any[] } {
  const existingCharNames = new Set(
    existing.characters.map((c) => (c.name || '').trim().toLowerCase())
  )
  const existingSceneKeys = new Set(
    existing.scenes.map((s) => {
      const loc = (s.location || '').trim().toLowerCase()
      const tod = (s.timeOfDay || '').trim().toLowerCase()
      return `${loc}::${tod}`
    })
  )
  const existingPropNames = new Set(
    existing.props.map((p) => (p.name || '').trim().toLowerCase())
  )

  return {
    characters: newAssets.characters.filter(
      (c) => !existingCharNames.has((c.name || '').trim().toLowerCase())
    ),
    scenes: newAssets.scenes.filter((s) => {
      const loc = (s.location || '').trim().toLowerCase()
      const tod = (s.timeOfDay || '').trim().toLowerCase()
      return !existingSceneKeys.has(`${loc}::${tod}`)
    }),
    props: newAssets.props.filter(
      (p) => !existingPropNames.has((p.name || '').trim().toLowerCase())
    ),
  }
}

// ============================================================
// Main extraction function
// Reads episodes for the drama, groups into chunks of 5,
// calls the extractor agent for each chunk, then counts results.
// ============================================================

export async function extractAssetsFromScripts(
  dramaId: string,
  episodeIds?: string[],
  onProgress?: (data: ExtractionProgress) => void,
  userId?: string
): Promise<ExtractionResult> {
  // 1. Get the drama
  const drama = await db.drama.findUnique({
    where: { id: dramaId },
    select: { id: true, assetStatus: true },
  })
  if (!drama) {
    throw new Error(`Drama ${dramaId} not found`)
  }

  // 2. Get episodes with script content
  const whereClause: any = { dramaId }
  if (episodeIds && episodeIds.length > 0) {
    whereClause.id = { in: episodeIds }
  }

  const episodes = await db.episode.findMany({
    where: whereClause,
    select: {
      id: true,
      episodeNumber: true,
      title: true,
      scriptContent: true,
    },
    orderBy: { episodeNumber: 'asc' },
  })

  // Filter to only episodes with script content
  const episodesWithScripts = episodes.filter(
    (ep) => ep.scriptContent && ep.scriptContent.trim().length > 0
  )

  if (episodesWithScripts.length === 0) {
    onProgress?.({
      current: 0,
      total: 0,
      message: '没有找到含有剧本内容的集数',
    })
    return { characters: 0, scenes: 0, props: 0 }
  }

  // 3. Count assets before extraction
  const [charsBefore, scenesBefore, propsBefore] = await Promise.all([
    db.character.count({ where: { dramaId } }),
    db.scene.count({ where: { dramaId } }),
    db.prop.count({ where: { dramaId } }),
  ])

  // 4. Update drama asset status to extracting
  await db.drama.update({
    where: { id: dramaId },
    data: { assetStatus: 'extracting' },
  })

  try {
    // 5. Chunk episodes into groups of 5
    const chunks = chunkArray(episodesWithScripts, 5)
    const totalChunks = chunks.length

    for (let chunkIdx = 0; chunkIdx < chunks.length; chunkIdx++) {
      const chunk = chunks[chunkIdx]

      onProgress?.({
        current: chunkIdx + 1,
        total: totalChunks,
        message: `正在提取第 ${chunkIdx + 1}/${totalChunks} 批集数 (${chunk.map((e) => `第${e.episodeNumber}集`).join(', ')})`,
      })

      // For each episode in the chunk, run the extractor agent
      for (const episode of chunk) {
        try {
          // Build the extraction prompt with the script content
          const prompt = `请从以下剧本内容中提取角色、场景和道具信息。

剧集：第${episode.episodeNumber}集 - ${episode.title || '无标题'}

剧本内容：
${episode.scriptContent!.slice(0, 30000)}${episode.scriptContent!.length > 30000 ? '\n\n...(内容过长已截断)' : ''}

请先调用 read_existing_characters 和 read_existing_scenes 查看已有数据，然后提取当前集的角色、场景和道具，使用 save_characters、save_scenes 和 save_props 工具保存。注意去重，避免重复创建已有角色或场景。`

          await executeAgent('extractor', episode.id, dramaId, prompt, undefined, {
            userId,
          })
        } catch (err) {
          console.error(
            `[asset-extraction] Failed to extract from episode ${episode.episodeNumber}:`,
            err instanceof Error ? err.message : String(err)
          )
          // Continue with other episodes even if one fails
        }
      }
    }

    // 6. Count assets after extraction
    const [charsAfter, scenesAfter, propsAfter] = await Promise.all([
      db.character.count({ where: { dramaId } }),
      db.scene.count({ where: { dramaId } }),
      db.prop.count({ where: { dramaId } }),
    ])

    const newChars = Math.max(0, charsAfter - charsBefore)
    const newScenes = Math.max(0, scenesAfter - scenesBefore)
    const newProps = Math.max(0, propsAfter - propsBefore)

    // 7. Update drama asset status
    const hadErrors = newChars === 0 && newScenes === 0 && newProps === 0 && episodesWithScripts.length > 0
    await db.drama.update({
      where: { id: dramaId },
      data: {
        assetStatus: hadErrors ? 'partial' : 'ready',
      },
    })

    onProgress?.({
      current: totalChunks,
      total: totalChunks,
      message: `提取完成：新增 ${newChars} 个角色、${newScenes} 个场景、${newProps} 个道具`,
    })

    return {
      characters: newChars,
      scenes: newScenes,
      props: newProps,
    }
  } catch (error) {
    // On error, mark as partial
    await db.drama.update({
      where: { id: dramaId },
      data: { assetStatus: 'partial' },
    })
    throw error
  }
}
