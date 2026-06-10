// ============================================================
// V2 Asset Extraction API — One-shot full asset extraction
// POST: SSE streaming extraction with weight tiers & clues
// GET:  Return extraction status, counts per type, weight summary
// ============================================================

export const maxDuration = 300

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { executeAgent } from '@/lib/agents/factory'

// ── Types ──────────────────────────────────────────────────

interface ExtractedCharacter {
  name: string
  role: string
  gender: string
  appearance: string
  personality: string
  voiceStyle?: string
}

interface ExtractedScene {
  location: string
  timeOfDay: string
  description: string
  prompt: string
}

interface ExtractedProp {
  name: string
  category: string
  description: string
  imagePrompt?: string
}

interface ExtractionResult {
  characters: ExtractedCharacter[]
  scenes: ExtractedScene[]
  props: ExtractedProp[]
}

interface EpisodeExtraction {
  episodeId: string
  episodeNumber: number
  characters: ExtractedCharacter[]
  scenes: ExtractedScene[]
  props: ExtractedProp[]
}

// ── Helpers ────────────────────────────────────────────────

function parseJsonSafe<T>(text: string | null | undefined, fallback: T): T {
  if (!text) return fallback
  try {
    return JSON.parse(text) as T
  } catch {
    return fallback
  }
}

function getWeightTier(appearanceCount: number): 'A' | 'B' | 'C' {
  if (appearanceCount >= 7) return 'A'
  if (appearanceCount >= 4) return 'B'
  return 'C'
}

// ── POST: One-shot V2 asset extraction with SSE ────────────

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const { id: dramaId } = await params

  // Validate drama
  const drama = await db.drama.findUnique({
    where: { id: dramaId },
    select: {
      userId: true,
      title: true,
      scriptGenerationStatus: true,
      assetExtractionStatus: true,
    },
  })

  if (!drama) {
    return NextResponse.json({ error: 'Drama 不存在' }, { status: 404 })
  }
  if (drama.userId && drama.userId !== auth.userId && auth.role !== 'admin') {
    return NextResponse.json({ error: '无权访问此项目' }, { status: 403 })
  }

  // V2 Gate: Script generation must be completed
  if (drama.scriptGenerationStatus !== 'completed') {
    return NextResponse.json(
      { error: '剧本生成尚未完成，请先完成剧本生成', code: 'SCRIPT_NOT_COMPLETED' },
      { status: 400 }
    )
  }

  // Prevent concurrent extraction
  if (drama.assetExtractionStatus === 'extracting') {
    return NextResponse.json(
      { error: '资产提取正在进行中，请稍后', code: 'EXTRACTION_IN_PROGRESS' },
      { status: 409 }
    )
  }

  // Mark as extracting
  await db.drama.update({
    where: { id: dramaId },
    data: { assetExtractionStatus: 'extracting' },
  })

  // SSE streaming
  const encoder = new TextEncoder()
  let closed = false

  const sendEvent = (data: unknown) => {
    if (closed) return ''
    return `data: ${JSON.stringify(data)}\n\n`
  }

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Step 1: Init
        controller.enqueue(encoder.encode(sendEvent({
          step: 'init',
          message: '开始 V2 资产提取流程...',
          progress: 5,
        })))

        // Step 2: Get all episodes with scripts
        const episodes = await db.episode.findMany({
          where: {
            dramaId,
            scriptStatus: 'completed',
            scriptContent: { not: null },
          },
          select: {
            id: true,
            episodeNumber: true,
            title: true,
            scriptContent: true,
          },
          orderBy: { episodeNumber: 'asc' },
        })

        const episodesWithScripts = episodes.filter(
          (ep) => ep.scriptContent && ep.scriptContent.trim().length > 0
        )

        if (episodesWithScripts.length === 0) {
          controller.enqueue(encoder.encode(sendEvent({
            step: 'error',
            message: '没有找到含有剧本内容的集数',
            progress: 0,
          })))
          await db.drama.update({
            where: { id: dramaId },
            data: { assetExtractionStatus: 'pending' },
          })
          controller.close()
          closed = true
          return
        }

        // Step 3: Batch scan — extract assets from each episode
        const allExtractions: EpisodeExtraction[] = []

        const batchSize = 5
        const totalBatches = Math.ceil(episodesWithScripts.length / batchSize)

        for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
          const batch = episodesWithScripts.slice(
            batchIdx * batchSize,
            (batchIdx + 1) * batchSize
          )

          controller.enqueue(encoder.encode(sendEvent({
            step: 'extracting_batch',
            message: `正在提取第 ${batchIdx + 1}/${totalBatches} 批 (${batch.map(e => `第${e.episodeNumber}集`).join(', ')})`,
            progress: 10 + Math.round(((batchIdx + 1) / totalBatches) * 50),
            detail: { batch: batchIdx + 1, totalBatches },
          })))

          for (const episode of batch) {
            try {
              const prompt = `请从以下剧本内容中提取角色、场景和道具信息。

剧集：第${episode.episodeNumber}集 - ${episode.title || '无标题'}

剧本内容：
${episode.scriptContent!.slice(0, 30000)}${episode.scriptContent!.length > 30000 ? '\n\n...(内容过长已截断)' : ''}

请先调用 read_existing_characters 和 read_existing_scenes 查看已有数据，然后提取当前集的角色、场景和道具，使用 save_characters、save_scenes 和 save_props 工具保存。注意去重，避免重复创建已有角色或场景。`

              await executeAgent('extractor', episode.id, dramaId, prompt, undefined, {
                userId: auth.userId,
              })
            } catch (err) {
              console.error(`[extract-assets-v2] Episode ${episode.episodeNumber} extraction failed:`, err)
              // Continue with other episodes
            }
          }
        }

        // Step 4: Assign weight tiers based on appearance count
        controller.enqueue(encoder.encode(sendEvent({
          step: 'tiers_assigned',
          message: '正在计算资产权重等级...',
          progress: 70,
        })))

        // Get all characters for this drama with their episode appearances
        const characters = await db.character.findMany({ where: { dramaId } })
        const allEpisodes = await db.episode.findMany({
          where: { dramaId },
          select: { id: true, episodeNumber: true, scriptContent: true },
        })

        // Count appearances for each character
        for (const char of characters) {
          const charName = char.name.toLowerCase()
          let appearanceCount = 0
          for (const ep of allEpisodes) {
            if (ep.scriptContent && ep.scriptContent.toLowerCase().includes(charName)) {
              appearanceCount++
            }
          }

          const tier = getWeightTier(appearanceCount)

          // Set identityAnchors initial values for tier-A characters
          const identityAnchors = tier === 'A' ? JSON.stringify({
            coreIdentity: char.personality || '',
            visualSignature: char.appearance || '',
            relationshipRole: char.role,
            voiceSignature: char.voiceStyle || '',
            recurringMotif: '',
            emotionalArc: '',
          }) : char.identityAnchors

          await db.character.update({
            where: { id: char.id },
            data: {
              weightTier: tier,
              episodeIds: JSON.stringify(
                allEpisodes
                  .filter(ep => ep.scriptContent?.toLowerCase().includes(charName))
                  .map(ep => ep.id)
              ),
              identityAnchors,
            },
          })
        }

        // Update scenes with episode appearances
        const scenes = await db.scene.findMany({ where: { dramaId } })
        for (const scene of scenes) {
          const locationKey = scene.location.toLowerCase()
          const matchedEpIds = allEpisodes
            .filter(ep => ep.scriptContent?.toLowerCase().includes(locationKey))
            .map(ep => ep.id)
          await db.scene.update({
            where: { id: scene.id },
            data: { episodeIds: JSON.stringify(matchedEpIds) },
          })
        }

        // Step 5: Create Clue records for cross-episode props/scene elements
        controller.enqueue(encoder.encode(sendEvent({
          step: 'creating_clues',
          message: '正在创建跨集线索记录...',
          progress: 85,
        })))

        const props = await db.prop.findMany({ where: { dramaId } })

        // Find props that appear in multiple episodes
        for (const prop of props) {
          const propName = prop.name.toLowerCase()
          const appearedInEps = allEpisodes.filter(ep =>
            ep.scriptContent?.toLowerCase().includes(propName)
          )

          if (appearedInEps.length >= 2) {
            // Check if clue already exists
            const existingClue = await db.clue.findFirst({
              where: { dramaId, name: prop.name, type: 'prop' },
            })
            if (!existingClue) {
              const firstEp = appearedInEps[0]
              await db.clue.create({
                data: {
                  dramaId,
                  type: 'prop',
                  name: prop.name,
                  description: prop.description,
                  firstSeenEp: firstEp.id,
                  episodes: JSON.stringify(appearedInEps.map(ep => ep.id)),
                  notes: `道具「${prop.name}」在 ${appearedInEps.length} 集中出现`,
                },
              })
            }
          }
        }

        // Find recurring scene elements
        for (const scene of scenes) {
          const locationKey = scene.location.toLowerCase()
          const appearedInEps = allEpisodes.filter(ep =>
            ep.scriptContent?.toLowerCase().includes(locationKey)
          )
          if (appearedInEps.length >= 2) {
            const existingClue = await db.clue.findFirst({
              where: { dramaId, name: scene.location, type: 'scene_element' },
            })
            if (!existingClue) {
              const firstEp = appearedInEps[0]
              await db.clue.create({
                data: {
                  dramaId,
                  type: 'scene_element',
                  name: scene.location,
                  description: scene.description,
                  firstSeenEp: firstEp.id,
                  episodes: JSON.stringify(appearedInEps.map(ep => ep.id)),
                  notes: `场景「${scene.location}」在 ${appearedInEps.length} 集中出现`,
                },
              })
            }
          }
        }

        // Step 6: Complete
        const finalCounts = await Promise.all([
          db.character.count({ where: { dramaId } }),
          db.scene.count({ where: { dramaId } }),
          db.prop.count({ where: { dramaId } }),
          db.clue.count({ where: { dramaId } }),
        ])

        const tierSummary = {
          tierA: await db.character.count({ where: { dramaId, weightTier: 'A' } }),
          tierB: await db.character.count({ where: { dramaId, weightTier: 'B' } }),
          tierC: await db.character.count({ where: { dramaId, weightTier: 'C' } }),
        }

        await db.drama.update({
          where: { id: dramaId },
          data: {
            assetExtractionStatus: 'completed',
            assetStatus: 'ready',
            currentPhase: 'art_direction',
          },
        })

        controller.enqueue(encoder.encode(sendEvent({
          step: 'completed',
          message: `资产提取完成！${finalCounts[0]} 角色, ${finalCounts[1]} 场景, ${finalCounts[2]} 道具, ${finalCounts[3]} 线索`,
          progress: 100,
          result: {
            characters: finalCounts[0],
            scenes: finalCounts[1],
            props: finalCounts[2],
            clues: finalCounts[3],
            tierSummary,
          },
        })))

        controller.close()
        closed = true
      } catch (error) {
        console.error('[extract-assets-v2] Failed:', error)

        await db.drama.update({
          where: { id: dramaId },
          data: { assetExtractionStatus: 'pending', assetStatus: 'partial' },
        }).catch(() => {})

        controller.enqueue(encoder.encode(sendEvent({
          step: 'error',
          message: error instanceof Error ? error.message : String(error),
          progress: 0,
        })))
        controller.close()
        closed = true
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}

// ── GET: Return extraction status ──────────────────────────

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const { id: dramaId } = await params

  const drama = await db.drama.findUnique({
    where: { id: dramaId },
    select: {
      userId: true,
      assetExtractionStatus: true,
      assetStatus: true,
      currentPhase: true,
    },
  })

  if (!drama) {
    return NextResponse.json({ error: 'Drama 不存在' }, { status: 404 })
  }
  if (drama.userId && drama.userId !== auth.userId && auth.role !== 'admin') {
    return NextResponse.json({ error: '无权访问此项目' }, { status: 403 })
  }

  const [charCount, sceneCount, propCount, clueCount] = await Promise.all([
    db.character.count({ where: { dramaId } }),
    db.scene.count({ where: { dramaId } }),
    db.prop.count({ where: { dramaId } }),
    db.clue.count({ where: { dramaId } }),
  ])

  const tierSummary = {
    tierA: await db.character.count({ where: { dramaId, weightTier: 'A' } }),
    tierB: await db.character.count({ where: { dramaId, weightTier: 'B' } }),
    tierC: await db.character.count({ where: { dramaId, weightTier: 'C' } }),
  }

  return NextResponse.json({
    dramaId,
    status: drama.assetExtractionStatus || 'pending',
    assetStatus: drama.assetStatus,
    currentPhase: drama.currentPhase,
    counts: {
      characters: charCount,
      scenes: sceneCount,
      props: propCount,
      clues: clueCount,
    },
    tierSummary,
  })
}
