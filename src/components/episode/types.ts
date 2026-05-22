import type { EpisodeDetail, Character, Scene, Storyboard } from '@/lib/store'
import type { UserPermissions } from '@/hooks/use-permissions'

// ── Stage types (3-stage pipeline) ─────────────────────────────

export type StageKey = 'script' | 'production' | 'export'

// ── Pipeline step types (12 sub-steps with stage prefix) ──────

export type PipelineStepKey =
  // Script stage (5 steps)
  | 'script:raw'
  | 'script:rewrite'
  | 'script:extract'
  | 'script:voice'
  | 'script:storyboard'
  // Production stage (6 steps)
  | 'prod:chars'
  | 'prod:scenes'
  | 'prod:dubbing'
  | 'prod:shots'
  | 'prod:videos'
  | 'prod:compose'
  // Export stage (1 step)
  | 'export:merge'

// ── Production tab key ────────────────────────────────────────

export type ProdTabKey = 'chars' | 'scenes' | 'dubbing' | 'shots' | 'videos' | 'compose'

// ── Pipeline step status ──────────────────────────────────────

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
  stage: StageKey
}

// ── Stage definition (for sidebar navigation) ────────────────

export interface StageDef {
  key: StageKey
  label: string
  icon: React.ReactNode
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
  activeStep: 'raw' | 'rewrite'
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
  copiedField: string | null
  handleExtract: () => Promise<void>
  handleCopy: (text: string, fieldId: string) => Promise<void>
  onUpdateCharacter?: (id: string, field: string, value: string) => void
  onUpdateScene?: (id: string, field: string, value: string) => void
}

export interface VoicePanelProps {
  characters: Character[]
  aiLoading: boolean
  agentExec: AgentExecState
  activeStep: 'voice'
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
  gridState: GridGenerationState
  activePipelineStep: PipelineStepKey
  handleGenerateStoryboard: () => Promise<void>
  handleEnhanceShotPrompt: (storyboard: Storyboard) => Promise<void>
  handleGenerateAllImages: () => Promise<void>
  handleGenerateAllVideos: () => Promise<void>
  handleGenerateShotImage: (storyboard: Storyboard) => Promise<void>
  handleGenerateVideo: (storyboard: Storyboard) => Promise<void>
  handleGenerateTts: (storyboard: Storyboard) => Promise<void>
  handleUpload: (file: File, options: UploadOptions, fieldKey: string) => Promise<void>
  handleCopy: (text: string, fieldId: string) => Promise<void>
  handleUpdateStoryboard: (id: string, data: Partial<Storyboard>) => Promise<void>
  handleGridGenerate: (config: GridConfig) => Promise<void>
}

export interface CharImagesPanelProps {
  characters: Character[]
  aiLoading: boolean
  generatingCharImg: string | null
  batchProgress: BatchProgress | null
  uploadingField: string | null
  copiedField: string | null
  handleGenerateCharSheet: (charId: string) => Promise<void>
  handleGenerateCharImage: (charId: string) => Promise<void>
  handleUpload: (file: File, options: UploadOptions, fieldKey: string) => Promise<void>
  handleCopy: (text: string, fieldId: string) => Promise<void>
}

export interface SceneImagesPanelProps {
  scenes: Scene[]
  aiLoading: boolean
  generatingSceneImg: string | null
  batchProgress: BatchProgress | null
  uploadingField: string | null
  copiedField: string | null
  handleGenerateSceneImage: (sceneId: string) => Promise<void>
  handleUpload: (file: File, options: UploadOptions, fieldKey: string) => Promise<void>
  handleCopy: (text: string, fieldId: string) => Promise<void>
}

export interface DubbingPanelProps {
  storyboards: Storyboard[]
  characters: Character[]
  aiLoading: boolean
  generatingTts: string | null
  generatingAllTts: boolean
  batchProgress: BatchProgress | null
  uploadingField: string | null
  handleGenerateTts: (storyboard: Storyboard) => Promise<void>
  handleGenerateAllTts: () => Promise<void>
  handleUpload: (file: File, options: UploadOptions, fieldKey: string) => Promise<void>
}

export interface ShotFramesPanelProps {
  storyboards: Storyboard[]
  characters: Character[]
  scenes: Scene[]
  aiLoading: boolean
  generatingShotImg: string | null
  batchProgress: BatchProgress | null
  uploadingField: string | null
  copiedField: string | null
  handleGenerateShotImage: (storyboard: Storyboard) => Promise<void>
  handleGenerateAllImages: () => Promise<void>
  handleUpload: (file: File, options: UploadOptions, fieldKey: string) => Promise<void>
  handleCopy: (text: string, fieldId: string) => Promise<void>
}

export interface VideoPanelProps {
  storyboards: Storyboard[]
  aiLoading: boolean
  generatingVideo: string | null
  batchProgress: BatchProgress | null
  uploadingField: string | null
  copiedField: string | null
  handleGenerateVideo: (storyboard: Storyboard) => Promise<void>
  handleGenerateAllVideos: () => Promise<void>
  handleUpload: (file: File, options: UploadOptions, fieldKey: string) => Promise<void>
  handleCopy: (text: string, fieldId: string) => Promise<void>
}

export interface ComposePanelProps {
  storyboards: Storyboard[]
  aiLoading: boolean
  composing: string | null
  composingAll: boolean
  batchProgress: BatchProgress | null
  previewMode: boolean
  currentPreviewShot: number
  exporting: boolean
  previewVideoRef: React.RefObject<HTMLVideoElement | null>
  previewAudioRef: React.RefObject<HTMLAudioElement | null>
  perms: UserPermissions
  handleComposeShot: (storyboard: Storyboard) => Promise<void>
  handleComposeAll: () => Promise<void>
  handleStartPreview: () => void
  handlePreviewEnded: () => void
  handleExport: () => Promise<void>
  setPreviewMode: (v: boolean) => void
  setCurrentPreviewShot: (v: number | ((prev: number) => number)) => void
}

export interface ProductionPanelProps {
  storyboards: Storyboard[]
  characters: Character[]
  scenes: Scene[]
  aiLoading: boolean
  agentExec: AgentExecState
  generatingCharImg: string | null
  generatingSceneImg: string | null
  generatingShotImg: string | null
  generatingVideo: string | null
  generatingTts: string | null
  generatingAllTts: boolean
  composing: string | null
  composingAll: boolean
  batchProgress: BatchProgress | null
  uploadingField: string | null
  copiedField: string | null
  previewMode: boolean
  currentPreviewShot: number
  exporting: boolean
  previewVideoRef: React.RefObject<HTMLVideoElement | null>
  previewAudioRef: React.RefObject<HTMLAudioElement | null>
  perms: UserPermissions
  // Handlers
  handleGenerateCharSheet: (charId: string) => Promise<void>
  handleGenerateCharImage: (charId: string) => Promise<void>
  handleGenerateSceneImage: (sceneId: string) => Promise<void>
  handleGenerateShotImage: (storyboard: Storyboard) => Promise<void>
  handleGenerateAllImages: () => Promise<void>
  handleGenerateVideo: (storyboard: Storyboard) => Promise<void>
  handleGenerateAllVideos: () => Promise<void>
  handleGenerateTts: (storyboard: Storyboard) => Promise<void>
  handleGenerateAllTts: () => Promise<void>
  handleComposeShot: (storyboard: Storyboard) => Promise<void>
  handleComposeAll: () => Promise<void>
  handleStartPreview: () => void
  handlePreviewEnded: () => void
  handleExport: () => Promise<void>
  handleUpload: (file: File, options: UploadOptions, fieldKey: string) => Promise<void>
  handleCopy: (text: string, fieldId: string) => Promise<void>
  setPreviewMode: (v: boolean) => void
  setCurrentPreviewShot: (v: number | ((prev: number) => number)) => void
}
