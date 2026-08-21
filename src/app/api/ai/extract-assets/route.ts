// ============================================================
// POST /api/ai/extract-assets — Asset Extraction Agent
// Inspired by Toonflow's design: extracts structured assets
// (characters / scenes / props) from an episode's scriptContent,
// with English prompts for downstream image generation.
//
// Body: { episodeId: string }
// Response: {
//   success: boolean,
//   extracted: number,            // total assets returned by AI
//   created: { characters, scenes, props },
//   deduplicated: number         // assets skipped because they already existed
// }
// ============================================================

// Allow up to 5 minutes for AI extraction
export const maxDuration = 300

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helpers'
import { userIdContext, aiClient } from '@/lib/ai-config'
import { db } from '@/lib/db'

interface ExtractedAsset {
  name: string
  desc: string
  prompt: string
  type: 'role' | 'scene' | 'tool'
}

interface AssetExtractionResult {
  newAssets?: ExtractedAsset[]
}

// POST /api/ai/extract-assets
// Extracts characters/scenes/props from the episode's script content using AI
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
    // Fetch existing assets to deduplicate
    const [existingChars, existingScenes, existingProps] = await Promise.all([
      db.character.findMany({ where: { dramaId: episode.dramaId } }),
      db.scene.findMany({ where: { dramaId: episode.dramaId } }),
      db.prop.findMany({ where: { dramaId: episode.dramaId } }),
    ])

    const existingHint = [
      '已有角色: ' + existingChars.map((c) => c.name).join(', '),
      '已有场景: ' + existingScenes.map((s) => s.location).join(', '),
      '已有道具: ' + existingProps.map((p) => p.name).join(', '),
    ].join('\n')

    // Invoke the asset_extractor agent via aiClient.chat
    const systemPrompt = `你是一个专业的剧本资产提取助手。从剧本内容中识别角色、场景、道具，为每项资产生成英文图片提示词。

输出格式：JSON 对象，包含 newAssets 数组。每个资产对象：
{
  "name": "资产名称",
  "desc": "30-80字视觉化描述",
  "prompt": "英文图片生成提示词",
  "type": "role" | "scene" | "tool"
}

只返回 JSON，不要其他文字。格式：
{"newAssets": [{"name":"...","desc":"...","prompt":"...","type":"role"}, ...]}`

    // episode.scriptContent is guaranteed non-null here (early-return above),
    // but TypeScript can't follow the narrowing across the userIdContext.run
    // closure, so we capture it locally for safety.
    const scriptContent = episode.scriptContent ?? ''

    const userPrompt = `${existingHint}\n\n请从以下剧本中提取资产:\n\n${scriptContent.slice(0, 8000)}`

    const response = await aiClient.chat(
      userPrompt,
      systemPrompt,
      { temperature: 0.3 }
    )

    // Parse JSON from response — find the JSON object in the text
    const jsonMatch = response.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return NextResponse.json({ error: 'AI 返回格式错误' }, { status: 500 })
    }

    let parsed: AssetExtractionResult
    try {
      parsed = JSON.parse(jsonMatch[0])
    } catch {
      return NextResponse.json({ error: 'AI 返回 JSON 解析失败' }, { status: 500 })
    }

    const newAssets: ExtractedAsset[] = parsed.newAssets || []

    // Save to database (dedup by name/location)
    const created = { characters: 0, scenes: 0, props: 0 }

    for (const asset of newAssets) {
      if (asset.type === 'role') {
        const exists = existingChars.find((c) => c.name === asset.name)
        if (!exists) {
          await db.character.create({
            data: {
              dramaId: episode.dramaId,
              name: asset.name,
              appearance: asset.desc,
              imagePrompt: asset.prompt,
            },
          })
          created.characters++
        }
      } else if (asset.type === 'scene') {
        const exists = existingScenes.find((s) => s.location === asset.name)
        if (!exists) {
          await db.scene.create({
            data: {
              dramaId: episode.dramaId,
              location: asset.name,
              description: asset.desc,
              prompt: asset.prompt,
            },
          })
          created.scenes++
        }
      } else if (asset.type === 'tool') {
        const exists = existingProps.find((p) => p.name === asset.name)
        if (!exists) {
          await db.prop.create({
            data: {
              dramaId: episode.dramaId,
              name: asset.name,
              description: asset.desc,
              imagePrompt: asset.prompt,
            },
          })
          created.props++
        }
      }
    }

    const createdTotal = created.characters + created.scenes + created.props

    return NextResponse.json({
      success: true,
      extracted: newAssets.length,
      created,
      deduplicated: newAssets.length - createdTotal,
    })
  })
}
