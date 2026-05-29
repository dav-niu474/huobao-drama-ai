// ============================================================
// Agent Architecture — Tool Executors
// Each tool executor receives parameters and context (episodeId,
// dramaId) and performs database operations. Tools are closures
// that capture episodeId and dramaId, so the LLM never needs
// to pass these IDs (preventing hallucination).
// ============================================================

import { db } from '@/lib/db'

// ============================================================
// Temporary Storage for Uploaded Script Text
// Used by script_parser agent to read uploaded text.
// Keyed by a temp ID passed from the API route.
// ============================================================

const uploadedTextStore = new Map<string, string>()

/**
 * Store uploaded text for the script_parser agent to read later.
 * Returns a temp ID that should be passed in the agent message.
 */
export function storeUploadedText(text: string): string {
  const tempId = `upload_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  uploadedTextStore.set(tempId, text)
  // Auto-cleanup after 30 minutes
  setTimeout(() => uploadedTextStore.delete(tempId), 30 * 60 * 1000)
  return tempId
}

/**
 * Retrieve and remove uploaded text by temp ID.
 */
function consumeUploadedText(tempId: string): string | null {
  const text = uploadedTextStore.get(tempId)
  if (text) {
    uploadedTextStore.delete(tempId)
  }
  return text || null
}

// ============================================================
// Parsed Script Result Store
// The save_parsed_script executor validates and returns the
// parsed data. The result is captured by the agent execution
// loop and returned to the API caller.
// ============================================================

export interface ParsedScriptResult {
  title: string
  genre: string
  style: string
  totalEpisodes: number
  episodes: Array<{
    title: string
    content: string
    scenes: Array<{
      sceneNumber: number
      location: string
      timeOfDay: string
      description: string
      content: string
    }>
  }>
  characters: Array<{
    name: string
    role: string  // 'protagonist' | 'supporting' | 'minor'
    gender: string
    description: string
  }>
  scenes: Array<{
    location: string
    timeOfDay: string
    description: string
  }>
  props: Array<{
    name: string
    description: string
  }>
  summary: string
}

// Track the tempId currently being processed
let currentUploadTempId: string | null = null

/**
 * Set the current upload temp ID for the script_parser agent.
 * Called before agent execution starts.
 */
export function setCurrentUploadTempId(tempId: string): void {
  currentUploadTempId = tempId
}

/**
 * Clear the current upload temp ID after agent execution.
 */
export function clearCurrentUploadTempId(): void {
  currentUploadTempId = null
}

export type ToolExecutor = (
  params: Record<string, unknown>,
  context: { episodeId: string; dramaId: string }
) => Promise<unknown>

// ============================================================
// Script Parser Tools
// ============================================================

const readUploadedText: ToolExecutor = async (_params, _context) => {
  if (!currentUploadTempId) {
    throw new Error('No uploaded text available. The upload temp ID was not set.')
  }
  const text = consumeUploadedText(currentUploadTempId)
  if (!text) {
    throw new Error('Uploaded text not found or has expired. Please re-upload the file.')
  }
  return {
    text,
    charCount: text.length,
    message: `成功读取上传文本，共${text.length}个字符`,
  }
}

const saveParsedScript: ToolExecutor = async (params, _context) => {
  const title = params.title as string
  const genre = params.genre as string
  const style = params.style as string
  const totalEpisodes = params.totalEpisodes as number
  const episodes = params.episodes as Array<{
    title: string
    content: string
    scenes?: Array<{
      sceneNumber: number
      location: string
      timeOfDay?: string
      description?: string
      content: string
    }>
  }>
  const characters = params.characters as Array<{
    name: string
    role?: string
    gender?: string
    description?: string
  }>
  const scenes = params.scenes as Array<{
    location: string
    timeOfDay?: string
    description?: string
  }>
  const props = params.props as Array<{
    name: string
    description?: string
  }>
  const summary = params.summary as string

  // Validate required fields
  if (!title) throw new Error('title is required')
  if (!genre) throw new Error('genre is required')
  if (!style) throw new Error('style is required')
  if (!totalEpisodes || totalEpisodes < 1) throw new Error('totalEpisodes must be >= 1')
  if (!episodes || !Array.isArray(episodes) || episodes.length === 0) {
    throw new Error('episodes must be a non-empty array')
  }
  if (!summary) throw new Error('summary is required')

  // Validate genre enum
  const validGenres = ['都市', '古装', '悬疑', '科幻', '甜宠', '复仇', '励志', '校园']
  if (!validGenres.includes(genre)) {
    throw new Error(`Invalid genre "${genre}". Must be one of: ${validGenres.join('/')}`)
  }

  // Validate style enum
  const validStyles = ['realistic', 'anime', 'cinematic', 'comic', 'watercolor', '3d']
  if (!validStyles.includes(style)) {
    throw new Error(`Invalid style "${style}". Must be one of: ${validStyles.join('/')}`)
  }

  // Validate each episode
  for (let i = 0; i < episodes.length; i++) {
    const ep = episodes[i]
    if (!ep.title) throw new Error(`Episode ${i + 1} is missing title`)
    if (!ep.content) throw new Error(`Episode ${i + 1} is missing content`)
    // Validate episode scenes if provided
    if (ep.scenes && Array.isArray(ep.scenes)) {
      for (let j = 0; j < ep.scenes.length; j++) {
        const sc = ep.scenes[j]
        if (!sc.location) throw new Error(`Episode ${i + 1} Scene ${j + 1} is missing location`)
        if (!sc.content) throw new Error(`Episode ${i + 1} Scene ${j + 1} is missing content`)
      }
    }
  }

  // Normalize characters: default to empty array, fill defaults
  const normalizedCharacters = Array.isArray(characters)
    ? characters.map((c) => ({
        name: c.name,
        role: c.role || 'supporting',
        gender: c.gender || 'unknown',
        description: c.description || '',
      }))
    : []

  // Normalize scenes: default to empty array, fill defaults
  const normalizedScenes = Array.isArray(scenes)
    ? scenes.map((s) => ({
        location: s.location,
        timeOfDay: s.timeOfDay || 'day',
        description: s.description || '',
      }))
    : []

  // Normalize props: default to empty array, fill defaults
  const normalizedProps = Array.isArray(props)
    ? props.map((p) => ({
        name: p.name,
        description: p.description || '',
      }))
    : []

  // Normalize episode scenes
  const normalizedEpisodes = episodes.map((ep) => ({
    title: ep.title,
    content: ep.content,
    scenes: Array.isArray(ep.scenes)
      ? ep.scenes.map((sc) => ({
          sceneNumber: typeof sc.sceneNumber === 'number' ? sc.sceneNumber : 0,
          location: sc.location,
          timeOfDay: sc.timeOfDay || 'day',
          description: sc.description || '',
          content: sc.content,
        }))
      : [],
  }))

  const result: ParsedScriptResult = {
    title,
    genre,
    style,
    totalEpisodes,
    episodes: normalizedEpisodes,
    characters: normalizedCharacters,
    scenes: normalizedScenes,
    props: normalizedProps,
    summary,
  }

  return {
    success: true,
    data: result,
    message: `剧本解析完成："${title}"，${genre}题材，共${totalEpisodes}集，检测到${normalizedCharacters.length}个角色、${normalizedScenes.length}个场景、${normalizedProps.length}个道具`,
  }
}

// ============================================================
// Script Rewriter Tools
// ============================================================

const readEpisodeScript: ToolExecutor = async (_params, context) => {
  const episode = await db.episode.findUnique({
    where: { id: context.episodeId },
    select: {
      id: true,
      episodeNumber: true,
      title: true,
      rawContent: true,
      scriptContent: true,
      scriptStatus: true,
    },
  })
  if (!episode) {
    throw new Error(`Episode ${context.episodeId} not found`)
  }
  return {
    episodeId: episode.id,
    episodeNumber: episode.episodeNumber,
    title: episode.title,
    rawContent: episode.rawContent || '',
    scriptContent: episode.scriptContent || '',
    scriptStatus: episode.scriptStatus,
  }
}

const saveScript: ToolExecutor = async (params, context) => {
  const scriptContent = params.scriptContent as string
  if (!scriptContent) {
    throw new Error('scriptContent is required')
  }
  await db.episode.update({
    where: { id: context.episodeId },
    data: {
      scriptContent,
      scriptStatus: 'completed',
    },
  })
  return { success: true, message: '剧本内容已保存' }
}

// ============================================================
// Extractor Tools
// ============================================================

const readScriptForExtraction: ToolExecutor = async (_params, context) => {
  const episode = await db.episode.findUnique({
    where: { id: context.episodeId },
    select: {
      scriptContent: true,
      rawContent: true,
    },
  })
  if (!episode) {
    throw new Error(`Episode ${context.episodeId} not found`)
  }
  return {
    scriptContent: episode.scriptContent || episode.rawContent || '',
  }
}

const readExistingCharacters: ToolExecutor = async (_params, context) => {
  const characters = await db.character.findMany({
    where: { dramaId: context.dramaId },
    orderBy: { createdAt: 'asc' },
  })
  return characters.map((c) => ({
    id: c.id,
    name: c.name,
    role: c.role,
    gender: c.gender,
    age: c.age,
    appearance: c.appearance,
    personality: c.personality,
    voiceStyle: c.voiceStyle,
    voiceId: c.voiceId,
  }))
}

const readExistingScenes: ToolExecutor = async (_params, context) => {
  const scenes = await db.scene.findMany({
    where: { dramaId: context.dramaId },
    orderBy: { createdAt: 'asc' },
  })
  return scenes.map((s) => ({
    id: s.id,
    location: s.location,
    timeOfDay: s.timeOfDay,
    description: s.description,
    prompt: s.prompt,
  }))
}

const saveCharacters: ToolExecutor = async (params, context) => {
  const characters = params.characters as Array<{
    name: string
    role?: string
    gender?: string
    age?: string
    appearance?: string
    personality?: string
    voiceStyle?: string
    imagePrompt?: string
  }>

  if (!Array.isArray(characters)) {
    throw new Error('characters must be an array')
  }

  // Get existing characters for dedup
  const existing = await db.character.findMany({
    where: { dramaId: context.dramaId },
  })

  const results: Array<{ name: string; action: string }> = []

  for (const char of characters) {
    // Check for existing character with same name
    const existingChar = existing.find(
      (e) => e.name.toLowerCase() === char.name.toLowerCase()
    )

    if (existingChar) {
      // Merge: update empty fields with new data
      const updateData: Record<string, string> = {}
      if (!existingChar.role && char.role) updateData.role = char.role
      if (!existingChar.gender && char.gender) updateData.gender = char.gender
      if (!existingChar.age && char.age) updateData.age = char.age
      if (!existingChar.appearance && char.appearance)
        updateData.appearance = char.appearance
      if (!existingChar.personality && char.personality)
        updateData.personality = char.personality
      if (!existingChar.voiceStyle && char.voiceStyle)
        updateData.voiceStyle = char.voiceStyle
      if (!existingChar.imagePrompt && char.imagePrompt)
        updateData.imagePrompt = char.imagePrompt

      if (Object.keys(updateData).length > 0) {
        await db.character.update({
          where: { id: existingChar.id },
          data: updateData,
        })
        results.push({ name: char.name, action: 'merged' })
      } else {
        results.push({ name: char.name, action: 'no_change' })
      }
    } else {
      // Create new character
      await db.character.create({
        data: {
          dramaId: context.dramaId,
          name: char.name,
          role: char.role || 'supporting',
          gender: char.gender || 'unknown',
          age: char.age || '',
          appearance: char.appearance || '',
          personality: char.personality || '',
          voiceStyle: char.voiceStyle || '',
          imagePrompt: char.imagePrompt || '',
        },
      })
      results.push({ name: char.name, action: 'created' })
    }
  }

  return { success: true, results }
}

const saveScenes: ToolExecutor = async (params, context) => {
  const scenes = params.scenes as Array<{
    location: string
    timeOfDay?: string
    description?: string
    prompt?: string
  }>

  if (!Array.isArray(scenes)) {
    throw new Error('scenes must be an array')
  }

  // Get existing scenes for dedup
  const existing = await db.scene.findMany({
    where: { dramaId: context.dramaId },
  })

  const results: Array<{ location: string; action: string }> = []

  for (const scene of scenes) {
    // Check for existing scene with same location and timeOfDay
    const existingScene = existing.find(
      (e) =>
        e.location.toLowerCase() === scene.location.toLowerCase() &&
        e.timeOfDay === (scene.timeOfDay || 'day')
    )

    if (existingScene) {
      // Merge: update with richer description if available
      const updateData: Record<string, string> = {}
      if (
        scene.description &&
        scene.description.length > existingScene.description.length
      ) {
        updateData.description = scene.description
      }
      if (scene.prompt && !existingScene.prompt) {
        updateData.prompt = scene.prompt
      }
      if (
        scene.prompt &&
        existingScene.prompt &&
        scene.prompt.length > existingScene.prompt.length
      ) {
        updateData.prompt = scene.prompt
      }

      if (Object.keys(updateData).length > 0) {
        await db.scene.update({
          where: { id: existingScene.id },
          data: updateData,
        })
        results.push({ location: scene.location, action: 'merged' })
      } else {
        results.push({ location: scene.location, action: 'no_change' })
      }
    } else {
      // Create new scene
      await db.scene.create({
        data: {
          dramaId: context.dramaId,
          location: scene.location,
          timeOfDay: scene.timeOfDay || 'day',
          description: scene.description || '',
          prompt: scene.prompt || '',
        },
      })
      results.push({ location: scene.location, action: 'created' })
    }
  }

  return { success: true, results }
}

// ============================================================
// Prop Tools
// ============================================================

const readExistingProps: ToolExecutor = async (_params, context) => {
  const props = await db.prop.findMany({
    where: { dramaId: context.dramaId },
    orderBy: { createdAt: 'asc' },
  })
  return props.map((p) => ({
    id: p.id,
    name: p.name,
    category: p.category,
    description: p.description,
    imagePrompt: p.imagePrompt,
  }))
}

const saveProps: ToolExecutor = async (params, context) => {
  const props = params.props as Array<{
    name: string
    category?: string
    description?: string
    imagePrompt?: string
  }>

  if (!Array.isArray(props)) {
    throw new Error('props must be an array')
  }

  // Get existing props for dedup
  const existing = await db.prop.findMany({
    where: { dramaId: context.dramaId },
  })

  const results: Array<{ name: string; action: string }> = []

  for (const prop of props) {
    // Check for existing prop with same name (case-insensitive)
    const existingProp = existing.find(
      (e) => e.name.toLowerCase() === prop.name.toLowerCase()
    )

    if (existingProp) {
      // Merge: update empty fields with new data
      const updateData: Record<string, string> = {}
      if (!existingProp.category && prop.category) updateData.category = prop.category
      if (!existingProp.description && prop.description) updateData.description = prop.description
      if (!existingProp.imagePrompt && prop.imagePrompt) updateData.imagePrompt = prop.imagePrompt
      // Also update if new description is richer
      if (prop.description && prop.description.length > existingProp.description.length) {
        updateData.description = prop.description
      }

      if (Object.keys(updateData).length > 0) {
        await db.prop.update({
          where: { id: existingProp.id },
          data: updateData,
        })
        results.push({ name: prop.name, action: 'merged' })
      } else {
        results.push({ name: prop.name, action: 'no_change' })
      }
    } else {
      // Create new prop
      await db.prop.create({
        data: {
          dramaId: context.dramaId,
          name: prop.name,
          category: prop.category || 'other',
          description: prop.description || '',
          imagePrompt: prop.imagePrompt || null,
        },
      })
      results.push({ name: prop.name, action: 'created' })
    }
  }

  return { success: true, results }
}

// ============================================================
// Storyboard Breaker Tools
// ============================================================

const readStoryboardContext: ToolExecutor = async (_params, context) => {
  const [episode, characters, scenes] = await Promise.all([
    db.episode.findUnique({
      where: { id: context.episodeId },
      select: {
        scriptContent: true,
        rawContent: true,
        episodeNumber: true,
        title: true,
      },
    }),
    db.character.findMany({
      where: { dramaId: context.dramaId },
      orderBy: { createdAt: 'asc' },
    }),
    db.scene.findMany({
      where: { dramaId: context.dramaId },
      orderBy: { createdAt: 'asc' },
    }),
  ])

  if (!episode) {
    throw new Error(`Episode ${context.episodeId} not found`)
  }

  return {
    script: episode.scriptContent || episode.rawContent || '',
    episodeNumber: episode.episodeNumber,
    title: episode.title,
    characters: characters.map((c) => ({
      name: c.name,
      gender: c.gender,
      appearance: c.appearance,
    })),
    scenes: scenes.map((s) => ({
      location: s.location,
      timeOfDay: s.timeOfDay,
      description: s.description,
    })),
  }
}

const saveStoryboards: ToolExecutor = async (params, context) => {
  // ── Append mode ──
  // append=false (default): Delete all existing storyboards for this episode, then create new ones
  // append=true: Just create new ones without deleting (for batched generation)
  const append = params.append === true

  // Defensive parsing: LLMs often pass arrays as JSON strings instead of
  // actual arrays. This is the #1 cause of "无法存入数据库" errors.
  let storyboards = params.storyboards as Array<{
    shotNumber: number
    title?: string
    shotType?: string
    cameraAngle?: string
    cameraMovement?: string
    action?: string
    description?: string
    dialogue?: string
    dialogueChar?: string
    duration?: number
    imagePrompt?: string
    videoPrompt?: string
    atmosphere?: string
  }>

  if (typeof storyboards === 'string') {
    try {
      storyboards = JSON.parse(storyboards)
    } catch {
      throw new Error('storyboards 参数格式错误：无法解析为JSON数组。请直接传入数组，而非JSON字符串。')
    }
  }

  // Also try to handle nested JSON strings (LLM sometimes double-encodes)
  if (typeof storyboards === 'string') {
    try {
      storyboards = JSON.parse(storyboards)
    } catch {
      // Give up
    }
  }

  if (!Array.isArray(storyboards)) {
    throw new Error(
      `storyboards 必须是数组，但收到的是 ${typeof storyboards} 类型。` +
      '请确保直接传入数组对象，例如：{"storyboards": [{"shotNumber": 1, ...}]}'
    )
  }

  if (storyboards.length === 0) {
    throw new Error('storyboards 数组不能为空，至少需要包含一个分镜镜头')
  }

  // Validate and fix each storyboard entry
  const validatedStoryboards = storyboards.map((sb, index) => {
    // shotNumber: must be integer — LLMs sometimes pass floats or strings
    const rawShotNumber = sb.shotNumber
    let shotNumber: number
    if (typeof rawShotNumber === 'number') {
      shotNumber = Math.round(rawShotNumber)
    } else if (typeof rawShotNumber === 'string') {
      shotNumber = Math.round(parseFloat(rawShotNumber))
    } else {
      throw new Error(`分镜 #${index + 1} 的 shotNumber 缺失或格式错误（收到: ${JSON.stringify(rawShotNumber)}）`)
    }
    if (isNaN(shotNumber) || shotNumber < 1) {
      throw new Error(`分镜 #${index + 1} 的 shotNumber 无效（收到: ${JSON.stringify(rawShotNumber)}），必须是正整数`)
    }

    // duration: coerce to float — LLMs sometimes pass strings
    let duration: number = 3.0
    if (sb.duration !== undefined && sb.duration !== null) {
      if (typeof sb.duration === 'number') {
        duration = sb.duration
      } else if (typeof sb.duration === 'string') {
        duration = parseFloat(sb.duration) || 3.0
      }
    }

    return {
      ...sb,
      shotNumber,
      duration,
    }
  })

  const created: Array<{ id: string; shotNumber: number }> = []
  const saveErrors: Array<{ shotNumber: number; error: string }> = []

  try {
    await db.$transaction(
      async (tx) => {
        // Only delete existing storyboards if NOT in append mode
        if (!append) {
          await tx.storyboard.deleteMany({
            where: { episodeId: context.episodeId },
          })
        }

        // Batch-create storyboards with createMany for efficiency
        const storyboardData = validatedStoryboards.map(sb => ({
          episodeId: context.episodeId,
          shotNumber: sb.shotNumber,
          title: sb.title || '',
          shotType: sb.shotType || 'medium',
          cameraAngle: sb.cameraAngle || 'eye-level',
          cameraMovement: sb.cameraMovement || 'static',
          action: sb.action || '',
          description: sb.description || '',
          dialogue: sb.dialogue || null,
          dialogueChar: sb.dialogueChar || null,
          duration: sb.duration,
          imagePrompt: sb.imagePrompt || null,
          videoPrompt: sb.videoPrompt || null,
          atmosphere: sb.atmosphere || null,
          status: 'pending' as const,
        }))

        try {
          await tx.storyboard.createMany({ data: storyboardData })
          // Fetch back the created records to get their IDs
          const savedRecords = await tx.storyboard.findMany({
            where: { episodeId: context.episodeId },
            orderBy: { shotNumber: 'asc' },
          })
          for (const record of savedRecords) {
            created.push({ id: record.id, shotNumber: record.shotNumber })
          }
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err)
          console.error('[save_storyboards] createMany failed:', errMsg)
          // Fallback: try saving ONE BY ONE so partial success is possible
          for (const sb of validatedStoryboards) {
            try {
              const record = await tx.storyboard.create({
                data: {
                  episodeId: context.episodeId,
                  shotNumber: sb.shotNumber,
                  title: sb.title || '',
                  shotType: sb.shotType || 'medium',
                  cameraAngle: sb.cameraAngle || 'eye-level',
                  cameraMovement: sb.cameraMovement || 'static',
                  action: sb.action || '',
                  description: sb.description || '',
                  dialogue: sb.dialogue || null,
                  dialogueChar: sb.dialogueChar || null,
                  duration: sb.duration,
                  imagePrompt: sb.imagePrompt || null,
                  videoPrompt: sb.videoPrompt || null,
                  atmosphere: sb.atmosphere || null,
                  status: 'pending',
                },
              })
              created.push({ id: record.id, shotNumber: record.shotNumber })
            } catch (innerErr) {
              const innerErrMsg = innerErr instanceof Error ? innerErr.message : String(innerErr)
              saveErrors.push({ shotNumber: sb.shotNumber, error: innerErrMsg })
              console.error(`[save_storyboards] Failed to save shot ${sb.shotNumber}:`, innerErrMsg)
            }
          }
        }

        // Only update episode status if at least some storyboards were saved
        if (created.length > 0) {
          await tx.episode.update({
            where: { id: context.episodeId },
            data: { storyboardStatus: 'completed' },
          })
        }
      },
      {
        maxWait: 10000,  // max time to wait for transaction to start (10s)
        timeout: 30000,  // max time for transaction to complete (30s)
      }
    )
  } catch (txError) {
    // Transaction failed entirely (e.g., all creates failed)
    const txErrMsg = txError instanceof Error ? txError.message : String(txError)
    console.error('[save_storyboards] Transaction failed:', txErrMsg)
  }

  // If some saves failed, report them
  if (saveErrors.length > 0 && created.length > 0) {
    return {
      success: true,
      count: created.length,
      totalAttempted: validatedStoryboards.length,
      failedCount: saveErrors.length,
      errors: saveErrors,
      append,
      message: `已保存 ${created.length}/${validatedStoryboards.length} 个分镜镜头（${saveErrors.length}个失败）${append ? ' [追加模式]' : ' [替换模式]'}`,
    }
  }

  if (created.length === 0) {
    throw new Error(`所有分镜保存失败: ${saveErrors.map(e => `镜头${e.shotNumber}: ${e.error}`).join('; ')}`)
  }

  return {
    success: true,
    count: created.length,
    append,
    message: `已保存 ${created.length} 个分镜镜头${append ? ' [追加模式]' : ' [替换模式]'}`,
  }
}

const updateStoryboard: ToolExecutor = async (params, context) => {
  const shotNumber = params.shotNumber as number
  const updates = params.updates as Record<string, unknown>

  if (!shotNumber || !updates) {
    throw new Error('shotNumber and updates are required')
  }

  const storyboard = await db.storyboard.findFirst({
    where: {
      episodeId: context.episodeId,
      shotNumber,
    },
  })

  if (!storyboard) {
    throw new Error(`Storyboard shot ${shotNumber} not found`)
  }

  // Only allow updating specific fields
  const allowedFields = [
    'title',
    'shotType',
    'cameraAngle',
    'cameraMovement',
    'action',
    'description',
    'dialogue',
    'dialogueChar',
    'duration',
    'imagePrompt',
    'videoPrompt',
    'atmosphere',
  ]
  const filteredUpdates: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(updates)) {
    if (allowedFields.includes(key)) {
      filteredUpdates[key] = value
    }
  }

  await db.storyboard.update({
    where: { id: storyboard.id },
    data: filteredUpdates,
  })

  return {
    success: true,
    message: `镜头 ${shotNumber} 已更新`,
    updatedFields: Object.keys(filteredUpdates),
  }
}

// ============================================================
// Voice Assigner Tools
// ============================================================

// Available TTS voices catalog (OpenAI-compatible)
const TTS_VOICE_CATALOG = [
  // Female voices
  { id: 'alloy', name: 'Alloy', gender: 'female', description: '中性偏女声，清晰专业' },
  { id: 'echo', name: 'Echo', gender: 'male', description: '温暖男声，沉稳有力' },
  { id: 'fable', name: 'Fable', gender: 'male', description: '年轻男声，活泼生动' },
  { id: 'onyx', name: 'Onyx', gender: 'male', description: '深沉男声，权威厚重' },
  { id: 'nova', name: 'Nova', gender: 'female', description: '年轻女声，明亮甜美' },
  { id: 'shimmer', name: 'Shimmer', gender: 'female', description: '柔和女声，温柔亲切' },
  // Additional voices for variety
  { id: 'tongtong', name: '童童', gender: 'female', description: '中文女声，标准普通话' },
  { id: 'xiaoyi', name: '小艺', gender: 'female', description: '中文年轻女声，清新自然' },
  { id: 'yunyang', name: '云扬', gender: 'male', description: '中文男声，磁性稳重' },
  { id: 'xiaochen', name: '小辰', gender: 'male', description: '中文年轻男声，阳光活力' },
  { id: 'xiaomo', name: '小墨', gender: 'male', description: '中文中年男声，低沉浑厚' },
  { id: 'xiaoxuan', name: '小萱', gender: 'female', description: '中文中年女声，知性优雅' },
]

const getCharacters: ToolExecutor = async (_params, context) => {
  const characters = await db.character.findMany({
    where: { dramaId: context.dramaId },
    orderBy: { createdAt: 'asc' },
  })
  return characters.map((c) => ({
    id: c.id,
    name: c.name,
    role: c.role,
    gender: c.gender,
    personality: c.personality,
    voiceStyle: c.voiceStyle,
    voiceId: c.voiceId,
    hasVoice: !!c.voiceId,
  }))
}

const listAvailableVoices: ToolExecutor = async (params) => {
  const gender = (params.gender as string) || 'all'
  const filtered =
    gender === 'all'
      ? TTS_VOICE_CATALOG
      : TTS_VOICE_CATALOG.filter((v) => v.gender === gender)
  return filtered
}

const assignVoice: ToolExecutor = async (params, context) => {
  const characterName = params.characterName as string
  const voiceId = params.voiceId as string

  if (!characterName || !voiceId) {
    throw new Error('characterName and voiceId are required')
  }

  const character = await db.character.findFirst({
    where: {
      dramaId: context.dramaId,
      name: { equals: characterName, mode: 'insensitive' },
    },
  })

  if (!character) {
    throw new Error(`Character "${characterName}" not found in this drama`)
  }

  // Validate voiceId
  const voiceExists = TTS_VOICE_CATALOG.some((v) => v.id === voiceId)
  if (!voiceExists) {
    throw new Error(
      `Voice "${voiceId}" not found. Available: ${TTS_VOICE_CATALOG.map((v) => v.id).join(', ')}`
    )
  }

  await db.character.update({
    where: { id: character.id },
    data: { voiceId },
  })

  const voiceInfo = TTS_VOICE_CATALOG.find((v) => v.id === voiceId)!
  return {
    success: true,
    character: character.name,
    voiceId,
    voiceName: voiceInfo.name,
    message: `已为角色"${character.name}"分配音色"${voiceInfo.name}"`,
  }
}

// ============================================================
// Grid Prompt Generator Tools
// ============================================================

const readCharacters: ToolExecutor = async (_params, context) => {
  const characters = await db.character.findMany({
    where: { dramaId: context.dramaId },
    orderBy: { createdAt: 'asc' },
  })
  return characters.map((c) => ({
    id: c.id,
    name: c.name,
    gender: c.gender,
    age: c.age,
    appearance: c.appearance,
    personality: c.personality,
    voiceStyle: c.voiceStyle,
  }))
}

const readScenes: ToolExecutor = async (_params, context) => {
  const scenes = await db.scene.findMany({
    where: { dramaId: context.dramaId },
    orderBy: { createdAt: 'asc' },
  })
  return scenes.map((s) => ({
    id: s.id,
    location: s.location,
    timeOfDay: s.timeOfDay,
    description: s.description,
    prompt: s.prompt,
  }))
}

const readShots: ToolExecutor = async (_params, context) => {
  const storyboards = await db.storyboard.findMany({
    where: { episodeId: context.episodeId },
    orderBy: { shotNumber: 'asc' },
  })
  return storyboards.map((sb) => ({
    id: sb.id,
    shotNumber: sb.shotNumber,
    title: sb.title,
    shotType: sb.shotType,
    cameraAngle: sb.cameraAngle,
    cameraMovement: sb.cameraMovement,
    action: sb.action,
    dialogue: sb.dialogue,
    dialogueChar: sb.dialogueChar,
    duration: sb.duration,
    imagePrompt: sb.imagePrompt,
    videoPrompt: sb.videoPrompt,
    atmosphere: sb.atmosphere,
  }))
}

const generateCharacterPrompt: ToolExecutor = async (params, context) => {
  const characterName = params.characterName as string
  const prompt = params.prompt as string

  if (!characterName || !prompt) {
    throw new Error('characterName and prompt are required')
  }

  // Find the character and save the prompt to imagePrompt field
  const character = await db.character.findFirst({
    where: {
      dramaId: context.dramaId,
      name: { equals: characterName, mode: 'insensitive' },
    },
  })

  if (!character) {
    throw new Error(`Character "${characterName}" not found`)
  }

  // Save the generated prompt to the Character's imagePrompt field
  await db.character.update({
    where: { id: character.id },
    data: { imagePrompt: prompt },
  })

  return {
    success: true,
    characterName,
    prompt,
    message: `角色"${characterName}"的肖像提示词已生成并保存`,
  }
}

const generateScenePrompt: ToolExecutor = async (params, context) => {
  const sceneLocation = params.sceneLocation as string
  const prompt = params.prompt as string

  if (!sceneLocation || !prompt) {
    throw new Error('sceneLocation and prompt are required')
  }

  // Find the scene and update its prompt field
  const scene = await db.scene.findFirst({
    where: {
      dramaId: context.dramaId,
      location: { equals: sceneLocation, mode: 'insensitive' },
    },
  })

  if (!scene) {
    throw new Error(`Scene "${sceneLocation}" not found`)
  }

  await db.scene.update({
    where: { id: scene.id },
    data: { prompt },
  })

  return {
    success: true,
    sceneLocation,
    prompt,
    message: `场景"${sceneLocation}"的背景提示词已生成并保存`,
  }
}

const generateGridPrompt: ToolExecutor = async (params, context) => {
  const shotNumber = params.shotNumber as number
  const imagePrompt = params.imagePrompt as string
  const videoPrompt = params.videoPrompt as string

  if (!shotNumber || !imagePrompt) {
    throw new Error('shotNumber and imagePrompt are required')
  }

  const storyboard = await db.storyboard.findFirst({
    where: {
      episodeId: context.episodeId,
      shotNumber,
    },
  })

  if (!storyboard) {
    throw new Error(`Storyboard shot ${shotNumber} not found`)
  }

  const updateData: Record<string, string> = { imagePrompt }
  if (videoPrompt) {
    updateData.videoPrompt = videoPrompt
  }

  await db.storyboard.update({
    where: { id: storyboard.id },
    data: updateData,
  })

  return {
    success: true,
    shotNumber,
    imagePrompt,
    videoPrompt: videoPrompt || null,
    message: `镜头 ${shotNumber} 的宫格提示词已生成并保存`,
  }
}

// ============================================================
// Executor Registry — Maps tool name to executor function
// ============================================================

export const TOOL_EXECUTORS: Record<string, ToolExecutor> = {
  // Script Parser
  read_uploaded_text: readUploadedText,
  save_parsed_script: saveParsedScript,

  // Script Rewriter
  read_episode_script: readEpisodeScript,
  save_script: saveScript,

  // Extractor
  read_script_for_extraction: readScriptForExtraction,
  read_existing_characters: readExistingCharacters,
  read_existing_scenes: readExistingScenes,
  save_characters: saveCharacters,
  save_scenes: saveScenes,
  read_existing_props: readExistingProps,
  save_props: saveProps,

  // Storyboard Breaker
  read_storyboard_context: readStoryboardContext,
  save_storyboards: saveStoryboards,
  update_storyboard: updateStoryboard,

  // Voice Assigner
  get_characters: getCharacters,
  list_available_voices: listAvailableVoices,
  assign_voice: assignVoice,

  // Grid Prompt Generator
  read_characters: readCharacters,
  read_scenes: readScenes,
  read_shots: readShots,
  generate_character_prompt: generateCharacterPrompt,
  generate_scene_prompt: generateScenePrompt,
  generate_grid_prompt: generateGridPrompt,
}

/**
 * Get executor functions for a given agent type
 */
export function getExecutorsForAgent(
  agentType: string
): Record<string, ToolExecutor> {
  const toolNames = Object.keys(
    AGENT_TOOL_NAMES[agentType as keyof typeof AGENT_TOOL_NAMES] || {}
  )
  const executors: Record<string, ToolExecutor> = {}
  for (const name of toolNames) {
    if (TOOL_EXECUTORS[name]) {
      executors[name] = TOOL_EXECUTORS[name]
    }
  }
  return executors
}

// Map agent type to its tool names
const AGENT_TOOL_NAMES: Record<string, Record<string, string>> = {
  script_parser: {
    read_uploaded_text: 'read_uploaded_text',
    save_parsed_script: 'save_parsed_script',
  },
  script_rewriter: {
    read_episode_script: 'read_episode_script',
    save_script: 'save_script',
  },
  extractor: {
    read_script_for_extraction: 'read_script_for_extraction',
    read_existing_characters: 'read_existing_characters',
    read_existing_scenes: 'read_existing_scenes',
    save_characters: 'save_characters',
    save_scenes: 'save_scenes',
    read_existing_props: 'read_existing_props',
    save_props: 'save_props',
  },
  storyboard_breaker: {
    read_storyboard_context: 'read_storyboard_context',
    save_storyboards: 'save_storyboards',
    update_storyboard: 'update_storyboard',
  },
  voice_assigner: {
    get_characters: 'get_characters',
    list_available_voices: 'list_available_voices',
    assign_voice: 'assign_voice',
  },
  grid_prompt_generator: {
    read_characters: 'read_characters',
    read_scenes: 'read_scenes',
    read_shots: 'read_shots',
    generate_character_prompt: 'generate_character_prompt',
    generate_scene_prompt: 'generate_scene_prompt',
    generate_grid_prompt: 'generate_grid_prompt',
  },
  // 小说→剧本 流水线的三个 agent 不需要工具，只生成文本
  story_skeleton: {},
  adaptation_strategy: {},
  script_generator: {},
}
