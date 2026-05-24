// ============================================================
// Prompt Polisher
// Applies art style templates to asset prompts, enhancing
// them with style-specific visual language from art skills.
// ============================================================

import { db } from '@/lib/db'
import { getArtPrompt, validateArtStyle } from '@/lib/art-prompt-loader'
import { aiClient } from '@/lib/ai-config'

// ============================================================
// Types
// ============================================================

export interface PolishResult {
  polished: number
  skipped: number
}

export interface SinglePolishResult {
  character?: any
  scene?: any
  prop?: any
  oldPrompt: string
  newPrompt: string
}

// ============================================================
// Polish all asset prompts with the selected art style
// ============================================================

export async function polishAssetPrompts(
  dramaId: string,
  artStyle: string,
  options?: {
    overwriteExisting?: boolean
    userId?: string
  }
): Promise<PolishResult> {
  // Validate the art style exists
  if (!validateArtStyle(artStyle)) {
    throw new Error(`Art style "${artStyle}" not found`)
  }

  // Load the art style templates
  let characterTemplate: string
  let sceneTemplate: string
  let propTemplate: string

  try {
    characterTemplate = getArtPrompt(artStyle, 'art_character')
  } catch {
    characterTemplate = ''
  }
  try {
    sceneTemplate = getArtPrompt(artStyle, 'art_scene')
  } catch {
    sceneTemplate = ''
  }
  try {
    propTemplate = getArtPrompt(artStyle, 'art_prop')
  } catch {
    propTemplate = ''
  }

  let polished = 0
  let skipped = 0

  // Set userId on aiClient for per-user provider resolution
  if (options?.userId) {
    aiClient._userId = options.userId
  }

  try {
    // Polish characters
    if (characterTemplate) {
      const characters = await db.character.findMany({
        where: {
          dramaId,
          ...(options?.overwriteExisting ? {} : { imagePrompt: null }),
        },
      })

      for (const character of characters) {
        try {
          const result = await polishCharacterPromptInternal(
            character,
            characterTemplate,
            artStyle
          )
          if (result.newPrompt && result.newPrompt !== result.oldPrompt) {
            polished++
          } else {
            skipped++
          }
        } catch (err) {
          console.error(
            `[prompt-polisher] Failed to polish character ${character.name}:`,
            err instanceof Error ? err.message : String(err)
          )
          skipped++
        }
      }

      // Also handle characters that already have prompts but are being re-polished
      if (options?.overwriteExisting) {
        // Already handled above — overwriteExisting means we don't filter by imagePrompt: null
      }
    } else {
      // No template — skip all characters
      const charCount = await db.character.count({ where: { dramaId } })
      skipped += charCount
    }

    // Polish scenes
    if (sceneTemplate) {
      const scenes = await db.scene.findMany({
        where: {
          dramaId,
          ...(options?.overwriteExisting ? {} : { prompt: '' }),
        },
      })

      // Also get scenes with null/empty prompt
      if (!options?.overwriteExisting) {
        const scenesWithNullPrompt = await db.scene.findMany({
          where: {
            dramaId,
            prompt: null,
          },
        })
        // Merge (scenes with '' are already included, add null ones)
        const existingIds = new Set(scenes.map((s) => s.id))
        for (const s of scenesWithNullPrompt) {
          if (!existingIds.has(s.id)) {
            scenes.push(s)
          }
        }
      }

      for (const scene of scenes) {
        try {
          const result = await polishScenePromptInternal(
            scene,
            sceneTemplate,
            artStyle
          )
          if (result.newPrompt && result.newPrompt !== result.oldPrompt) {
            polished++
          } else {
            skipped++
          }
        } catch (err) {
          console.error(
            `[prompt-polisher] Failed to polish scene ${scene.location}:`,
            err instanceof Error ? err.message : String(err)
          )
          skipped++
        }
      }
    } else {
      const sceneCount = await db.scene.count({ where: { dramaId } })
      skipped += sceneCount
    }

    // Polish props
    if (propTemplate) {
      const props = await db.prop.findMany({
        where: {
          dramaId,
          ...(options?.overwriteExisting ? {} : { imagePrompt: null }),
        },
      })

      for (const prop of props) {
        try {
          const result = await polishPropPromptInternal(
            prop,
            propTemplate,
            artStyle
          )
          if (result.newPrompt && result.newPrompt !== result.oldPrompt) {
            polished++
          } else {
            skipped++
          }
        } catch (err) {
          console.error(
            `[prompt-polisher] Failed to polish prop ${prop.name}:`,
            err instanceof Error ? err.message : String(err)
          )
          skipped++
        }
      }
    } else {
      const propCount = await db.prop.count({ where: { dramaId } })
      skipped += propCount
    }
  } finally {
    // Clear userId on aiClient
    aiClient._userId = undefined
  }

  return { polished, skipped }
}

// ============================================================
// Polish a single character's imagePrompt
// ============================================================

export async function polishCharacterPrompt(
  characterId: string,
  artStyle: string
): Promise<SinglePolishResult> {
  const character = await db.character.findUnique({
    where: { id: characterId },
  })
  if (!character) {
    throw new Error(`Character ${characterId} not found`)
  }

  if (!validateArtStyle(artStyle)) {
    throw new Error(`Art style "${artStyle}" not found`)
  }

  const template = getArtPrompt(artStyle, 'art_character')
  return polishCharacterPromptInternal(character, template, artStyle)
}

// ============================================================
// Polish a single scene's prompt
// ============================================================

export async function polishScenePrompt(
  sceneId: string,
  artStyle: string
): Promise<SinglePolishResult> {
  const scene = await db.scene.findUnique({
    where: { id: sceneId },
  })
  if (!scene) {
    throw new Error(`Scene ${sceneId} not found`)
  }

  if (!validateArtStyle(artStyle)) {
    throw new Error(`Art style "${artStyle}" not found`)
  }

  const template = getArtPrompt(artStyle, 'art_scene')
  return polishScenePromptInternal(scene, template, artStyle)
}

// ============================================================
// Internal polish functions
// ============================================================

async function polishCharacterPromptInternal(
  character: any,
  template: string,
  artStyle: string
): Promise<SinglePolishResult> {
  const oldPrompt = character.imagePrompt || ''

  // Build the polishing prompt
  const systemPrompt = `你是一位专业的AI绘图提示词专家。你的任务是根据角色描述和指定的艺术风格模板，生成高质量的英文绘图提示词（imagePrompt）。

重要规则：
1. 必须严格遵循提供的艺术风格模板中的约束和格式
2. 提示词必须是英文
3. 只输出提示词正文，不要附加任何解释、说明、注释
4. 提示词应该详细描述角色的视觉外观，包括面容、体型、发型、服装等
5. 严格按照模板的"提示词模板"格式生成`

  const userPrompt = `## 艺术风格模板（必须严格遵循）

${template.slice(0, 8000)}

---

## 角色信息

- 姓名：${character.name}
- 角色定位：${character.role || '未知'}
- 性别：${character.gender || '未知'}
- 年龄：${character.age || '未知'}
- 外貌描写：${character.appearance || '未知'}
- 性格特点：${character.personality || '未知'}
${oldPrompt ? `- 现有提示词：${oldPrompt}` : ''}

---

请根据以上角色信息和艺术风格模板，生成该角色的英文imagePrompt。只输出提示词正文。`

  const newPrompt = await aiClient.chat(userPrompt, systemPrompt, {
    temperature: 0.7,
    max_tokens: 2048,
  })

  // Save the polished prompt
  if (newPrompt && newPrompt.trim()) {
    await db.character.update({
      where: { id: character.id },
      data: { imagePrompt: newPrompt.trim() },
    })
  }

  return {
    character: { id: character.id, name: character.name },
    oldPrompt,
    newPrompt: newPrompt.trim(),
  }
}

async function polishScenePromptInternal(
  scene: any,
  template: string,
  artStyle: string
): Promise<SinglePolishResult> {
  const oldPrompt = scene.prompt || ''

  const systemPrompt = `你是一位专业的AI绘图提示词专家。你的任务是根据场景描述和指定的艺术风格模板，生成高质量的英文场景绘图提示词。

重要规则：
1. 必须严格遵循提供的艺术风格模板中的约束和格式
2. 提示词必须是英文
3. 只输出提示词正文，不要附加任何解释、说明、注释
4. 场景提示词必须不含人物，这是纯背景图
5. 使用关键词格式，逗号分隔
6. 严格按照模板的结构和要求生成`

  const userPrompt = `## 艺术风格模板（必须严格遵循）

${template.slice(0, 8000)}

---

## 场景信息

- 地点：${scene.location}
- 时间：${scene.timeOfDay || '未知'}
- 描述：${scene.description || '未知'}
${oldPrompt ? `- 现有提示词：${oldPrompt}` : ''}

---

请根据以上场景信息和艺术风格模板，生成该场景的英文prompt。只输出提示词正文，不含人物。`

  const newPrompt = await aiClient.chat(userPrompt, systemPrompt, {
    temperature: 0.7,
    max_tokens: 2048,
  })

  // Save the polished prompt
  if (newPrompt && newPrompt.trim()) {
    await db.scene.update({
      where: { id: scene.id },
      data: { prompt: newPrompt.trim() },
    })
  }

  return {
    scene: { id: scene.id, location: scene.location },
    oldPrompt,
    newPrompt: newPrompt.trim(),
  }
}

async function polishPropPromptInternal(
  prop: any,
  template: string,
  artStyle: string
): Promise<SinglePolishResult> {
  const oldPrompt = prop.imagePrompt || ''

  const systemPrompt = `你是一位专业的AI绘图提示词专家。你的任务是根据道具描述和指定的艺术风格模板，生成高质量的英文道具绘图提示词。

重要规则：
1. 必须遵循提供的艺术风格模板的整体风格约束
2. 提示词必须是英文
3. 只输出提示词正文，不要附加任何解释、说明、注释
4. 道具提示词应详细描述道具的外观、材质、细节
5. 使用关键词格式，逗号分隔`

  const userPrompt = `## 艺术风格模板（整体风格约束）

${template.slice(0, 5000)}

---

## 道具信息

- 名称：${prop.name}
- 类型：${prop.category || '其他'}
- 描述：${prop.description || '未知'}
${oldPrompt ? `- 现有提示词：${oldPrompt}` : ''}

---

请根据以上道具信息和艺术风格约束，生成该道具的英文imagePrompt。只输出提示词正文。`

  const newPrompt = await aiClient.chat(userPrompt, systemPrompt, {
    temperature: 0.7,
    max_tokens: 1024,
  })

  // Save the polished prompt
  if (newPrompt && newPrompt.trim()) {
    await db.prop.update({
      where: { id: prop.id },
      data: { imagePrompt: newPrompt.trim() },
    })
  }

  return {
    prop: { id: prop.id, name: prop.name },
    oldPrompt,
    newPrompt: newPrompt.trim(),
  }
}
