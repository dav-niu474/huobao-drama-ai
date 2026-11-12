// ============================================================
// Storyboard Prompt Templates — model-specific prompt generation
// Inspired by Toonflow's 4-mode prompt system
// ============================================================

export type PromptMode = 'multi-reference' | 'first-last-frame' | 'single-image' | 'text-only'

export interface StoryboardPromptInput {
  shotDescription: string     // 画面描述
  sceneAnchor: string         // 场景锚定
  shotType: string             // 景别
  cameraMovement: string      // 运镜
  characterAction: string     // 角色动作
  emotion: string             // 情绪
  lighting: string            // 光影氛围
  dialogue: string            // 台词
  soundEffect: string         // 音效
  associatedAssets: Array<{ id: string; name: string; type: 'character' | 'scene' | 'prop' }>
  duration: number
}

export interface GeneratedPrompt {
  imagePrompt: string   // 图片生成提示词
  videoPrompt: string   // 视频生成提示词
}

// ============================================================
// Mode A: Multi-reference (Seedance 2.0 / Seedream 4.0 — Chinese prompt)
// ============================================================
export function buildMultiReferencePrompt(input: StoryboardPromptInput): GeneratedPrompt {
  const refs = input.associatedAssets.map((a, i) => `@图${i + 1} 为${a.name}${assetTypeLabel(a.type)}`).join(' ')

  const imagePrompt = [
    refs,
    `【画面】${input.sceneAnchor}，${input.shotType}，${input.shotDescription}`,
    `【光影】${input.lighting}`,
    `【风格】电影级质感，高细节，禁止画外字幕、水印、UI 文字`,
    `保持 @图N 面部特征、发型、服饰与参考图完全一致。`,
  ].filter(Boolean).join('\n')

  const videoPrompt = [
    refs,
    `【画面】${input.sceneAnchor}，${input.shotType}，${input.shotDescription}`,
    `【动作】${input.characterAction}`,
    `【运镜】${input.cameraMovement}`,
    `【情绪】${input.emotion}`,
    `【光影】${input.lighting}`,
    input.dialogue ? `【台词】${input.dialogue}` : '',
    input.soundEffect ? `【音效】${input.soundEffect}` : '',
    `<duration-ms>${input.duration * 1000}毫秒</duration-ms>`,
  ].filter(Boolean).join('\n')

  return { imagePrompt, videoPrompt }
}

// ============================================================
// Mode B: First-last frame (Seedance 1.5 / universal — English 5-dimension)
// ============================================================
export function buildFirstLastFramePrompt(input: StoryboardPromptInput): GeneratedPrompt {
  const refs = input.associatedAssets.map((a, i) => `@image${i + 1} [${a.name}]`).join(' ')

  const imagePrompt = [
    `${input.sceneAnchor}, ${input.shotType},`,
    input.shotDescription,
    input.lighting,
    'cinematic quality, high detail, no text, no watermark',
  ].filter(Boolean).join(', ')

  const videoPrompt = [
    `Visual: ${input.sceneAnchor}, ${input.shotType}, ${input.shotDescription}, ${input.lighting}`,
    `Motion: ${input.characterAction}`,
    `Camera: ${input.cameraMovement}`,
    `Audio: ${input.dialogue ? `dialogue "${input.dialogue}"` : 'no dialogue'}${input.soundEffect ? `, ${input.soundEffect}` : ''}`,
    `Narrative: ${input.emotion}`,
    `References: ${refs}`,
  ].join('\n')

  return { imagePrompt, videoPrompt }
}

// ============================================================
// Mode C: Single-image first-frame (Wan 2.6 — narrative English)
// ============================================================
export function buildSingleImagePrompt(input: StoryboardPromptInput): GeneratedPrompt {
  const imagePrompt = [
    `${input.sceneAnchor}, ${input.shotType},`,
    input.shotDescription,
    input.lighting,
    'cinematic quality, ultra detailed',
  ].filter(Boolean).join(', ')

  // Three-part narrative style
  const videoPrompt = [
    `Style: cinematic ${input.shotType} shot with ${input.lighting.toLowerCase()};`,
    `Subject: ${input.characterAction}, set in ${input.sceneAnchor.toLowerCase()};`,
    `Camera: ${input.cameraMovement.toLowerCase()}, ending on a stable frame.`,
  ].join(' ')

  return { imagePrompt, videoPrompt }
}

// ============================================================
// Mode D: Text-only (no references)
// ============================================================
export function buildTextOnlyPrompt(input: StoryboardPromptInput): GeneratedPrompt {
  const imagePrompt = [
    input.sceneAnchor,
    input.shotType,
    input.shotDescription,
    input.lighting,
    'cinematic quality, high detail, no text',
  ].filter(Boolean).join(', ')

  const videoPrompt = [
    `${input.sceneAnchor}, ${input.shotType} shot.`,
    input.shotDescription,
    `Action: ${input.characterAction}`,
    `Camera: ${input.cameraMovement}`,
    input.lighting,
  ].join(' ')

  return { imagePrompt, videoPrompt }
}

// ============================================================
// Public API: select template based on video model + mode
// ============================================================
export function generateStoryboardPrompt(
  input: StoryboardPromptInput,
  options: { videoModel?: string; mode?: PromptMode }
): GeneratedPrompt {
  const model = (options.videoModel || '').toLowerCase()

  // Auto-detect mode based on model
  let mode = options.mode
  if (!mode) {
    if (/seedance.*2[.\-]0/i.test(model) || /seedream.*4/i.test(model)) {
      mode = 'multi-reference'
    } else if (/wan.*2[.\-]6/i.test(model)) {
      mode = 'single-image'
    } else if (/first.?last|start.?end/i.test(model)) {
      mode = 'first-last-frame'
    } else {
      mode = 'text-only'
    }
  }

  switch (mode) {
    case 'multi-reference': return buildMultiReferencePrompt(input)
    case 'first-last-frame': return buildFirstLastFramePrompt(input)
    case 'single-image': return buildSingleImagePrompt(input)
    case 'text-only': return buildTextOnlyPrompt(input)
  }
}

// ============================================================
// Helpers
// ============================================================
function assetTypeLabel(type: 'character' | 'scene' | 'prop'): string {
  switch (type) {
    case 'character': return '（角色）'
    case 'scene': return '（场景）'
    case 'prop': return '（道具）'
  }
}
