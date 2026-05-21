import type { EpisodeDetail, Character, Scene, Storyboard } from '@/lib/store'
import type { UserPermissions } from '@/hooks/use-permissions'

// ── Step types ────────────────────────────────────────────────

export type StepKey = 'raw' | 'rewrite' | 'extract' | 'voice' | 'storyboard' | 'production'

// ── Pipeline step types (11-step production pipeline) ──────────

export type PipelineStepKey =
  | 'raw_content'
  | 'script_rewrite'
  | 'character_extract'
  | 'voice_assign'
  | 'storyboard'
  | 'character_images'
  | 'scene_images'
  | 'dubbing'
  | 'shot_frames'
  | 'video'
  | 'compose_merge'

export interface PipelineStepStatus {
  status: 'pending' | 'partial' | 'done'
  label: string
  completed: number
  total: number
  extra?: Record<string, unknown>
}

export interface PipelineStatus {
  steps: Record<PipelineStepKey, PipelineStepStatus>
  summary: {
    totalSteps: number
    completedSteps: number
    partialSteps: number
    pendingSteps: number
    overallProgress: number
    currentStep: string
  }
  ffmpegAvailable: boolean
  // Legacy compatibility fields
  pipeline?: Record<PipelineStepKey, PipelineStepStatus>
  completedSteps?: number
  totalSteps?: number
  progressPercent?: number
}

export interface PipelineStepDef {
  key: PipelineStepKey
  stepNumber: number
  label: string
  description: string
  stepKey: StepKey  // Maps to legacy step
}

// ── Voice management ──────────────────────────────────────────

export interface VoiceInfo {
  id: string
  name: string
  gender: string
  description: string
}

// ── Merge status ──────────────────────────────────────────────

export interface MergeStatus {
  canMerge: boolean
  canMergePartial: boolean
  totalShots: number
  composedShots: number
  ffmpegAvailable: boolean
  latestMerge: {
    status: string
    mergedUrl: string | null
    duration: number
  } | null
}

// ── Grid generation ───────────────────────────────────────────

export interface GridConfig {
  mode: 'first_frame' | 'first_last' | 'multi_ref'
  rows: number
  cols: number
}

export interface GridGenerationState {
  isGeneratingGrid: boolean
  isSplittingGrid: boolean
  gridConfig: GridConfig
}

export interface StepDef {
  key: StepKey
  label: string
  icon: React.ReactNode
  subSteps?: { key: StepKey; label: string }[]
}

// ── Batch progress ────────────────────────────────────────────

export interface BatchProgress {
  current: number
  total: number
  message: string
}

// ── Generation progress ───────────────────────────────────────

export interface GenerationProgress {
  step: string
  message: string
  progress: number
}

// ── Upload options ────────────────────────────────────────────

export interface UploadOptions {
  storyboardId?: string
  characterId?: string
  sceneId?: string
  fieldType: string
}

// ── Agent execution (subset exposed to sub-panels) ────────────

export interface AgentExecState {
  isRunning: (agentType: string) => boolean
  logs: Record<string, unknown[]>
  resultTexts: Record<string, string>
  durations: Record<string, number>
  errors: Record<string, string | null>
}

// ── Panel props ───────────────────────────────────────────────

export interface ScriptPanelProps {
  rawContent: string
  setRawContent: (v: string) => void
  scriptContent: string
  setScriptContent: (v: string) => void
  saving: boolean
  aiLoading: boolean
  isRewriting: boolean
  episode: EpisodeDetail | null
  agentExec: AgentExecState
  activeStep: StepKey
  handleSaveRaw: () => Promise<void>
  handleSaveScript: () => Promise<void>
  handleRewrite: () => Promise<void>
  handleSkipRewrite: () => Promise<void>
}

export interface ExtractPanelProps {
  characters: Character[]
  scenes: Scene[]
  aiLoading: boolean
  isExtracting: boolean
  episode: EpisodeDetail | null
  agentExec: AgentExecState
  generatingCharImg: string | null
  generatingSceneImg: string | null
  batchProgress: BatchProgress | null
  uploadingField: string | null
  handleExtract: () => Promise<void>
  handleGenerateAllExtractImages: () => Promise<void>
  handleGenerateCharSheet: (charId: string) => Promise<void>
  handleGenerateCharImage: (charId: string) => Promise<void>
  handleGenerateSceneImage: (sceneId: string) => Promise<void>
  handleUpload: (file: File, options: UploadOptions, fieldKey: string) => Promise<void>
}

export interface VoicePanelProps {
  characters: Character[]
  aiLoading: boolean
  agentExec: AgentExecState
  activeStep: StepKey
  handleVoiceAssign: () => Promise<void>
}

export interface StoryboardPanelProps {
  storyboards: Storyboard[]
  aiLoading: boolean
  isStoryboarding: boolean
  episode: EpisodeDetail | null
  agentExec: AgentExecState
  generatingShotImg: string | null
  generatingVideo: string | null
  generatingTts: string | null
  batchProgress: BatchProgress | null
  uploadingField: string | null
  copiedField: string | null
  handleGenerateStoryboard: () => Promise<void>
  handleEnhanceShotPrompt: (storyboard: Storyboard) => Promise<void>
  handleGenerateAllImages: () => Promise<void>
  handleGenerateAllVideos: () => Promise<void>
  handleGenerateShotImage: (storyboard: Storyboard) => Promise<void>
  handleGenerateVideo: (storyboard: Storyboard) => Promise<void>
  handleGenerateTts: (storyboard: Storyboard) => Promise<void>
  handleUpload: (file: File, options: UploadOptions, fieldKey: string) => Promise<void>
  handleCopy: (text: string, fieldId: string) => Promise<void>
}

export interface ProductionPanelProps {
  storyboards: Storyboard[]
  characters: Character[]
  aiLoading: boolean
  agentExec: AgentExecState
  generatingShotImg: string | null
  generatingVideo: string | null
  generatingTts: string | null
  generatingAllTts: boolean
  composing: string | null
  composingAll: boolean
  batchProgress: BatchProgress | null
  previewMode: boolean
  currentPreviewShot: number
  exporting: boolean
  previewVideoRef: React.RefObject<HTMLVideoElement | null>
  previewAudioRef: React.RefObject<HTMLAudioElement | null>
  perms: UserPermissions
  handleGenerateShotImage: (storyboard: Storyboard) => Promise<void>
  handleGenerateVideo: (storyboard: Storyboard) => Promise<void>
  handleGenerateTts: (storyboard: Storyboard) => Promise<void>
  handleGenerateAllVideos: () => Promise<void>
  handleGenerateAllTts: () => Promise<void>
  handleComposeShot: (storyboard: Storyboard) => Promise<void>
  handleComposeAll: () => Promise<void>
  handleStartPreview: () => void
  handlePreviewEnded: () => void
  handleExport: () => Promise<void>
  setActiveStep: (step: StepKey) => void
  setPreviewMode: (v: boolean) => void
  setCurrentPreviewShot: (v: number | ((prev: number) => number)) => void
}
