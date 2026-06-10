/**
 * Keyframe Service — Core keyframe orchestration logic
 *
 * Manages generation mode selection, keyframe planning, image sizing,
 * prompt injection, and readiness status for the storyboard keyframe system.
 */

import type { GenerationMode } from '@/lib/store'

// ── Types ─────────────────────────────────────────────────────

export interface KeyframePlan {
  storyboardId: string
  shotNumber: number
  generationMode: GenerationMode
  prompt: string
  size: string
  artStylePrefix: string
  needsFirstFrame: boolean
  needsLastFrame: boolean
  needsGridImage: boolean
  needsReferenceVideo: boolean
}

export interface KeyframeStatus {
  storyboardId: string
  shotNumber: number
  generationMode: GenerationMode | null
  isReady: boolean
  hasFirstFrame: boolean
  hasLastFrame: boolean
  hasGridImage: boolean
  hasReferenceVideo: boolean
  hasCandidates: boolean
  selectedCandidateIndex: number | null
  missingItems: string[]
}

export interface StoryboardLike {
  id: string
  shotNumber: number
  title?: string
  shotType?: string
  cameraAngle?: string
  cameraMovement?: string
  action?: string
  description?: string
  imagePrompt?: string | null
  videoPrompt?: string | null
  atmosphere?: string | null
  firstFrameUrl?: string | null
  lastFrameUrl?: string | null
  generationMode?: GenerationMode | null
  gridImageUrl?: string | null
  gridLayout?: string | null
  startFrameImageUrl?: string | null
  endFrameImageUrl?: string | null
  candidateUrls?: string | null
  selectedCandidateIndex?: number | null
  referenceImages?: string | null
  videoUrl?: string | null
}

export interface DramaLike {
  artStyle?: string | null
  styleTemplate?: string
  aspectRatio?: string | null
}

// ── Generation Mode Logic ─────────────────────────────────────

const MODE_PRIORITY: GenerationMode[] = ['image2video', 'first_last', 'grid', 'reference_video']

/**
 * Auto-select generation mode based on storyboard data.
 *
 * Rules:
 * - cameraMovement includes "dolly" / "zoom" / "pan" / "tilt" / "tracking" → first_last (precise camera control)
 * - Has reference images → reference_video
 * - Short duration (≤2s) with simple movement → grid (batch efficient)
 * - Default → image2video
 */
export function determineGenerationMode(storyboard: StoryboardLike): GenerationMode {
  // If already set, keep it
  if (storyboard.generationMode && storyboard.generationMode !== 'image2video') {
    return storyboard.generationMode
  }

  const movement = (storyboard.cameraMovement ?? '').toLowerCase()
  const hasComplexMovement = ['dolly', 'zoom', 'pan', 'tilt', 'tracking', '推', '拉', '摇', '移'].some(
    (kw) => movement.includes(kw)
  )
  if (hasComplexMovement) {
    return 'first_last'
  }

  // Has reference images → reference_video style transfer
  if (storyboard.referenceImages) {
    try {
      const refs = JSON.parse(storyboard.referenceImages)
      if (Array.isArray(refs) && refs.length > 0) {
        return 'reference_video'
      }
    } catch { /* ignore */ }
  }

  return 'image2video'
}

// ── Keyframe Plan Builder ─────────────────────────────────────

/**
 * Build a keyframe plan for a single storyboard, including prompt,
 * image dimensions, art style prefix, and what assets are needed.
 */
export function buildKeyframePlan(
  storyboard: StoryboardLike,
  drama: DramaLike
): KeyframePlan {
  const mode = storyboard.generationMode ?? determineGenerationMode(storyboard)
  const aspectRatio = drama.aspectRatio ?? '9:16'
  const size = computeImageSize(aspectRatio)
  const artStylePrefix = buildArtStylePrefix(drama)
  const prompt = buildPrompt(storyboard, artStylePrefix)

  return {
    storyboardId: storyboard.id,
    shotNumber: storyboard.shotNumber,
    generationMode: mode,
    prompt,
    size,
    artStylePrefix,
    needsFirstFrame: mode === 'image2video' || mode === 'first_last',
    needsLastFrame: mode === 'first_last',
    needsGridImage: mode === 'grid',
    needsReferenceVideo: mode === 'reference_video',
  }
}

// ── Image Size Computation ────────────────────────────────────

const ASPECT_RATIO_MAP: Record<string, string> = {
  '9:16': '768x1344',
  '16:9': '1344x768',
  '1:1': '1024x1024',
  '3:4': '896x1152',
  '4:3': '1152x896',
  '2:3': '832x1216',
  '3:2': '1216x832',
}

/**
 * Map aspect ratio string to pixel dimensions for image generation.
 * 9:16 → 768x1344, 16:9 → 1344x768, 1:1 → 1024x1024
 */
export function computeImageSize(aspectRatio: string): string {
  return ASPECT_RATIO_MAP[aspectRatio] ?? '768x1344'
}

// ── Prompt Building ───────────────────────────────────────────

function buildArtStylePrefix(drama: DramaLike): string {
  const parts: string[] = []
  if (drama.styleTemplate) {
    parts.push(drama.styleTemplate)
  }
  if (drama.artStyle) {
    parts.push(drama.artStyle)
  }
  return parts.filter(Boolean).join(', ')
}

function buildPrompt(storyboard: StoryboardLike, artStylePrefix: string): string {
  const parts: string[] = []

  if (artStylePrefix) {
    parts.push(artStylePrefix)
  }

  if (storyboard.imagePrompt) {
    parts.push(storyboard.imagePrompt)
  } else {
    // Fallback: build from storyboard metadata
    if (storyboard.shotType) parts.push(storyboard.shotType)
    if (storyboard.cameraAngle) parts.push(storyboard.cameraAngle)
    if (storyboard.description) parts.push(storyboard.description)
    if (storyboard.action) parts.push(storyboard.action)
    if (storyboard.atmosphere) parts.push(`atmosphere: ${storyboard.atmosphere}`)
  }

  return parts.join(', ')
}

// ── Prompt Injection ──────────────────────────────────────────

const MODE_INSTRUCTIONS: Record<GenerationMode, string> = {
  image2video: '[MODE:image2video] Generate a single first-frame image for video generation.',
  first_last: '[MODE:first_last] Generate TWO images: a first-frame (opening) and a last-frame (closing) for interpolation video with precise camera control.',
  grid: '[MODE:grid] Generate a grid composition image that can be split into individual frames for parallel video generation.',
  reference_video: '[MODE:reference_video] This shot will use a reference video for style transfer. Validate reference video exists.',
}

/**
 * Inject mode instructions into prompt (LLM-invisible marker prefix).
 * These markers are stripped before sending to the actual AI model
 * and are used for internal orchestration only.
 */
export function injectGenerationModeIntoPrompt(prompt: string, mode: GenerationMode): string {
  const instruction = MODE_INSTRUCTIONS[mode] ?? MODE_INSTRUCTIONS['image2video']
  return `${instruction}\n\n${prompt}`
}

// ── Keyframe Status ───────────────────────────────────────────

/**
 * Check keyframe readiness status for a storyboard.
 * Returns what's ready, what's missing, and overall readiness.
 */
export function getKeyframeStatus(storyboard: StoryboardLike): KeyframeStatus {
  const mode = storyboard.generationMode ?? determineGenerationMode(storyboard)
  const missingItems: string[] = []

  const hasFirstFrame = !!(storyboard.firstFrameUrl || storyboard.startFrameImageUrl)
  const hasLastFrame = !!(storyboard.lastFrameUrl || storyboard.endFrameImageUrl)
  const hasGridImage = !!storyboard.gridImageUrl
  const hasReferenceVideo = !!storyboard.videoUrl

  // Parse candidates
  let candidateCount = 0
  if (storyboard.candidateUrls) {
    try {
      const parsed = JSON.parse(storyboard.candidateUrls)
      if (Array.isArray(parsed)) candidateCount = parsed.length
    } catch { /* ignore */ }
  }
  const hasCandidates = candidateCount > 0

  // Check mode-specific requirements
  switch (mode) {
    case 'image2video':
      if (!hasFirstFrame) missingItems.push('firstFrame')
      break
    case 'first_last':
      if (!hasFirstFrame) missingItems.push('firstFrame')
      if (!hasLastFrame) missingItems.push('lastFrame')
      break
    case 'grid':
      if (!hasGridImage) missingItems.push('gridImage')
      break
    case 'reference_video':
      if (!hasReferenceVideo) missingItems.push('referenceVideo')
      break
  }

  // Also need an imagePrompt for generation
  if (!storyboard.imagePrompt && !storyboard.description && !storyboard.action) {
    missingItems.push('prompt')
  }

  const isReady = missingItems.length === 0

  return {
    storyboardId: storyboard.id,
    shotNumber: storyboard.shotNumber,
    generationMode: mode,
    isReady,
    hasFirstFrame,
    hasLastFrame,
    hasGridImage,
    hasReferenceVideo,
    hasCandidates,
    selectedCandidateIndex: storyboard.selectedCandidateIndex ?? null,
    missingItems,
  }
}

// ── Batch helpers ─────────────────────────────────────────────

/**
 * Get keyframe statuses for all storyboards in an episode.
 */
export function getKeyframeStatuses(storyboards: StoryboardLike[]): KeyframeStatus[] {
  return storyboards.map(getKeyframeStatus)
}

/**
 * Get storyboards that need keyframe generation.
 */
export function getStoryboardsNeedingKeyframes(storyboards: StoryboardLike[]): StoryboardLike[] {
  return storyboards.filter((sb) => !getKeyframeStatus(sb).isReady)
}

/**
 * Get the generation mode label for display.
 */
export function getGenerationModeLabel(mode: GenerationMode | null): string {
  const labels: Record<GenerationMode, string> = {
    image2video: 'I2V',
    first_last: '首尾帧',
    grid: '宫格',
    reference_video: '参考视频',
  }
  return mode ? (labels[mode] ?? mode) : 'I2V'
}

/**
 * Get the generation mode color class for badges.
 */
export function getGenerationModeColor(mode: GenerationMode | null): string {
  const colors: Record<GenerationMode, string> = {
    image2video: 'text-blue-600 border-blue-200 bg-blue-50',
    first_last: 'text-purple-600 border-purple-200 bg-purple-50',
    grid: 'text-amber-600 border-amber-200 bg-amber-50',
    reference_video: 'text-emerald-600 border-emerald-200 bg-emerald-50',
  }
  return mode ? (colors[mode] ?? colors['image2video']) : colors['image2video']
}
