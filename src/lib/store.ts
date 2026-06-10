import { create } from 'zustand'

// ============================================================
// Type Definitions — aligned with Prisma schema
// ============================================================

export interface Drama {
  id: string
  title: string
  description: string
  genre: string
  style: string
  coverImage: string | null
  totalEpisodes: number
  status: string
  defaultLockedConfig: string | null
  styleTemplate: string
  novelSource: string | null
  novelParsed: boolean
  artStyle: string | null
  assetStatus: string
  createdAt: string
  updatedAt: string
  _count?: { episodes: number; characters: number; scenes: number }
  // V2 Phase 2 fields
  showPlanLocked?: boolean
  coverage?: string | null
  episodeFormat?: string | null
  aspectRatio?: string | null
  genreTone?: string | null
  paywallConfig?: string | null
  targetPlatform?: string | null
  budgetConstraints?: string | null
  novelAnalysis?: string | null
  scriptGenerationStatus?: string | null
  assetExtractionStatus?: string | null
  currentPhase?: string | null
}

export interface Prop {
  id: string
  dramaId: string
  name: string
  category: string
  description: string
  imagePrompt: string | null
  imageUrl: string | null
  assetId: string | null
  createdAt: string
  updatedAt: string
}

export interface Season {
  id: string
  dramaId: string
  seasonNumber: number
  title: string
  description: string | null
  status: string
  worldDocUrl: string | null
  sortOrder: number
  createdAt: string
  updatedAt: string
  _count?: { episodes: number }
}

export interface DramaDetail extends Drama {
  episodes: Episode[]
  characters: Character[]
  scenes: Scene[]
  props: Prop[]
  seasons?: Season[]
  // V2 Phase 2 fields
  showPlanLocked: boolean
  coverage: string | null
  episodeFormat: string | null
  aspectRatio: string | null
  genreTone: string | null
  paywallConfig: string | null
  targetPlatform: string | null
  budgetConstraints: string | null
  novelAnalysis: string | null
  scriptGenerationStatus: string | null
  assetExtractionStatus: string | null
  currentPhase: string | null
}

export interface LockedConfig {
  llm?: string
  image?: string
  video?: string
  tts?: string
}

export interface Episode {
  id: string
  dramaId: string
  episodeNumber: number
  title: string
  rawContent: string | null
  scriptContent: string | null
  scriptStatus: string
  extractStatus: string
  storyboardStatus: string
  status: string
  lockedConfig: string | null
  sourceChapterIds: string   // JSON array of chapter indices
  globalAssetsImported: boolean
  videoUrl: string | null
  duration: number
  createdAt: string
  updatedAt: string
  _count?: { storyboards: number }
}

export interface EpisodeDetail extends Episode {
  storyboards: Storyboard[]
}

export interface Character {
  id: string
  dramaId: string
  name: string
  role: string
  gender: string
  age: string
  appearance: string
  personality: string
  voiceStyle: string
  voiceId: string | null
  imagePrompt: string | null
  imageUrl: string | null
  assetId: string | null
  // Consistency fields
  styleLock: boolean
  lockedReferenceImage: string | null
  visualFingerprint: string  // JSON string
  episodeIds: string         // JSON array of episode IDs
  createdAt: string
  updatedAt: string
}

export interface Scene {
  id: string
  dramaId: string
  location: string
  timeOfDay: string
  description: string
  prompt: string
  imageUrl: string | null
  assetId: string | null
  // Consistency fields
  styleLock: boolean
  lockedReferenceImage: string | null
  episodeIds: string         // JSON array of episode IDs
  createdAt: string
  updatedAt: string
}

export type GenerationMode = 'image2video' | 'first_last' | 'grid' | 'reference_video'

export interface Storyboard {
  id: string
  episodeId: string
  shotNumber: number
  title: string
  shotType: string
  cameraAngle: string
  cameraMovement: string
  action: string
  description: string
  dialogue: string | null
  dialogueChar: string | null
  duration: number
  imagePrompt: string | null
  videoPrompt: string | null
  atmosphere: string | null
  bgmPrompt: string | null
  soundEffect: string | null
  firstFrameUrl: string | null
  lastFrameUrl: string | null
  referenceImages: string | null
  videoUrl: string | null
  ttsAudioUrl: string | null
  composedUrl: string | null
  status: string
  // Keyframe system fields
  generationMode: GenerationMode | null
  gridImageUrl: string | null
  gridLayout: string | null // JSON: { rows: number, cols: number, mode: string }
  startFrameImageUrl: string | null
  endFrameImageUrl: string | null
  candidateUrls: string | null // JSON array of candidate image URLs
  selectedCandidateIndex: number | null
  createdAt: string
  updatedAt: string
}

// ============================================================
// View type for client-side navigation
// ============================================================

// ============================================================
// Asset Library types
// ============================================================

export interface Asset {
  id: string
  name: string
  category: string // "character" | "scene" | "prop"
  subcategory: string | null
  tags: string // JSON array
  thumbnail: string | null
  userId: string | null
  isPublic: boolean
  usageCount: number
  description: string
  imagePrompt: string | null
  imageUrls: string // JSON array
  data: string // JSON
  createdAt: string
  updatedAt: string
  user?: { id: string; name: string } | null
  // Version info
  versionCount?: number
  currentVersion?: number
}

// ============================================================
// Art Style types
// ============================================================

export interface ArtStyle {
  id: string
  key: string
  name: string
  category: string // "2D" | "3D" | "realpeople"
  description: string | null
  prefixMd: string | null
  styleMeta: string | null // JSON: {tone, palette, influences}
  previewUrl: string | null
  isActive: boolean
  isBuiltin: boolean
  createdAt: string
  updatedAt: string
}

// ============================================================
// Asset Version types
// ============================================================

export interface AssetVersion {
  id: string
  assetId: string
  version: number
  snapshot: string // JSON snapshot of asset data at this version
  changeDescription: string | null
  createdBy: string | null
  createdAt: string
}

// ============================================================
// World Map types
// ============================================================

export interface WorldRegion {
  id: string
  dramaId: string
  name: string
  description: string
  atmosphere: string
  musicStyle: string
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface WorldLocation {
  id: string
  regionId: string
  name: string
  description: string
  timeOfDayOptions: string // JSON array: ["dawn","morning","noon","afternoon","dusk","night"]
  imageUrl: string | null
  sortOrder: number
  createdAt: string
  updatedAt: string
}

// ============================================================
// Character Bible types
// ============================================================

export interface IdentityAnchors {
  face: string        // 脸型
  hair: string        // 发型
  colorScheme: string // 配色
  clothing: string    // 服饰
  signatureItems: string // 标志物
  sceneEmbed: string  // 场景嵌入
}

export interface CharacterBible {
  characterId: string
  name: string
  role: string
  identityAnchors: IdentityAnchors
  fullBodyUrl: string | null
  threeViewsUrl: string | null
  headshotUrl: string | null
  wardrobeUrls: string[] // Array of wardrobe image URLs
  consistencyTimeline: Array<{
    episodeId: string
    episodeNumber: number
    description: string
    imageUrl: string | null
  }>
}

export type AppView = 'projects' | 'project-detail' | 'script-workbench' | 'asset-workbench' | 'episode-workspace' | 'settings' | 'asset-library' | 'marketplace' | 'series'

// ============================================================
// Module type for three-module navigation
// ============================================================

export type AppModule = 'project' | 'asset' | 'creative'

export const VIEW_MODULE_MAP: Record<AppView, AppModule> = {
  'projects': 'project',
  'project-detail': 'project',
  'script-workbench': 'project',
  'asset-workbench': 'project',
  'episode-workspace': 'project',
  'asset-library': 'asset',
  'marketplace': 'asset',
  'settings': 'project', // settings is shared
  'series': 'project',
}

export const MODULE_DEFAULT_VIEW: Record<AppModule, AppView> = {
  'project': 'projects',
  'asset': 'asset-library',
  'creative': 'projects', // placeholder until creative space is built
}

/** Helper to get the module a view belongs to */
export function getModuleForView(view: AppView): AppModule {
  return VIEW_MODULE_MAP[view]
}

// ============================================================
// Store interface
// ============================================================

interface WorkspaceModels {
  llm: string
  image: string
  video: string
  tts: string
}

interface AppStore {
  // Navigation
  view: AppView
  selectedDramaId: string | null
  selectedEpisodeId: string | null
  activeModule: AppModule

  // Navigation actions
  navigateToProjects: () => void
  navigateToProject: (dramaId: string) => void
  navigateToEpisode: (dramaId: string, episodeId: string) => void
  navigateToSettings: () => void
  navigateToAssetLibrary: () => void
  navigateToScriptWorkbench: (dramaId: string) => void
  navigateToAssetWorkbench: (dramaId: string) => void
  navigateToMarketplace: () => void
  navigateToSeries: () => void
  setActiveModule: (module: AppModule) => void

  // Drama data cache
  dramas: Drama[]
  setDramas: (dramas: Drama[]) => void
  currentDrama: DramaDetail | null
  setCurrentDrama: (drama: DramaDetail | null) => void
  currentEpisode: EpisodeDetail | null
  setCurrentEpisode: (episode: EpisodeDetail | null) => void

  // Workspace model selection (persisted to localStorage)
  workspaceModels: WorkspaceModels
  setWorkspaceModel: (category: keyof WorkspaceModels, model: string) => void
  initWorkspaceModels: (models: Partial<WorkspaceModels>) => void
  hydrateWorkspaceModels: () => void

  // Episode-level locked config
  episodeLockedConfig: LockedConfig | null
  setEpisodeLockedConfig: (config: LockedConfig | null) => void
  isConfigLocked: () => boolean

  // Loading states
  loading: boolean
  setLoading: (loading: boolean) => void
  aiLoading: boolean
  setAiLoading: (loading: boolean) => void
}

// ============================================================
// Zustand store
// ============================================================

// Load persisted workspace models from localStorage
function loadWorkspaceModels(): WorkspaceModels {
  if (typeof window === 'undefined') return { llm: '', image: '', video: '', tts: '' }
  try {
    const saved = localStorage.getItem('workspaceModels')
    if (saved) return JSON.parse(saved) as WorkspaceModels
  } catch {}
  return { llm: '', image: '', video: '', tts: '' }
}

export const useAppStore = create<AppStore>((set, get) => ({
  // Navigation state
  view: 'projects',
  selectedDramaId: null,
  selectedEpisodeId: null,
  activeModule: 'project' as AppModule,

  // Navigation actions
  navigateToProjects: () =>
    set({
      view: 'projects',
      selectedDramaId: null,
      selectedEpisodeId: null,
      currentDrama: null,
      currentEpisode: null,
      episodeLockedConfig: null,
      activeModule: 'project' as AppModule,
    }),

  navigateToProject: (dramaId: string) =>
    set({
      view: 'project-detail',
      selectedDramaId: dramaId,
      selectedEpisodeId: null,
      currentEpisode: null,
      episodeLockedConfig: null,
      activeModule: 'project' as AppModule,
    }),

  navigateToEpisode: (dramaId: string, episodeId: string) =>
    set({
      view: 'episode-workspace',
      selectedDramaId: dramaId,
      selectedEpisodeId: episodeId,
      activeModule: 'project' as AppModule,
    }),

  navigateToSettings: () =>
    set({
      view: 'settings',
      selectedDramaId: null,
      selectedEpisodeId: null,
      episodeLockedConfig: null,
      activeModule: 'project' as AppModule,
    }),

  navigateToAssetLibrary: () =>
    set({
      view: 'asset-library',
      selectedEpisodeId: null,
      episodeLockedConfig: null,
      activeModule: 'asset' as AppModule,
    }),

  navigateToScriptWorkbench: (dramaId: string) =>
    set({
      view: 'script-workbench',
      selectedDramaId: dramaId,
      selectedEpisodeId: null,
      episodeLockedConfig: null,
      activeModule: 'project' as AppModule,
    }),

  navigateToAssetWorkbench: (dramaId: string) =>
    set({
      view: 'asset-workbench',
      selectedDramaId: dramaId,
      selectedEpisodeId: null,
      episodeLockedConfig: null,
      activeModule: 'project' as AppModule,
    }),

  navigateToMarketplace: () =>
    set({
      view: 'marketplace',
      selectedDramaId: null,
      selectedEpisodeId: null,
      episodeLockedConfig: null,
      activeModule: 'asset' as AppModule,
    }),

  navigateToSeries: () =>
    set({
      view: 'series',
      selectedDramaId: null,
      selectedEpisodeId: null,
      episodeLockedConfig: null,
      activeModule: 'project' as AppModule,
    }),

  // Module navigation action
  setActiveModule: (module: AppModule) => {
    const state = get()
    const currentModule = getModuleForView(state.view)
    if (currentModule !== module) {
      // Switch to the module's default view
      const defaultView = MODULE_DEFAULT_VIEW[module]
      const navActions: Record<AppView, () => void> = {
        'projects': state.navigateToProjects,
        'project-detail': state.navigateToProjects,
        'script-workbench': state.navigateToProjects,
        'asset-workbench': state.navigateToProjects,
        'episode-workspace': state.navigateToProjects,
        'settings': state.navigateToSettings,
        'asset-library': state.navigateToAssetLibrary,
        'marketplace': state.navigateToMarketplace,
        'series': state.navigateToSeries,
      }
      navActions[defaultView]()
    }
  },

  // Drama data cache
  dramas: [],
  setDramas: (dramas: Drama[]) => set({ dramas }),
  currentDrama: null,
  setCurrentDrama: (drama: DramaDetail | null) => set({ currentDrama: drama }),
  currentEpisode: null,
  setCurrentEpisode: (episode: EpisodeDetail | null) =>
    set({ currentEpisode: episode }),

  // Workspace model selection (persisted to localStorage)
  // Use server-safe default to avoid hydration mismatch; hydrated via hydrateWorkspaceModels()
  workspaceModels: { llm: '', image: '', video: '', tts: '' },
  setWorkspaceModel: (category, model) =>
    set((state) => {
      const updated = { ...state.workspaceModels, [category]: model }
      try { localStorage.setItem('workspaceModels', JSON.stringify(updated)) } catch {}
      return { workspaceModels: updated }
    }),
  initWorkspaceModels: (models) =>
    set((state) => {
      // Only fill in empty fields — don't overwrite user selections
      const updated = { ...state.workspaceModels }
      for (const [k, v] of Object.entries(models)) {
        const key = k as keyof WorkspaceModels
        if (!updated[key] && v) updated[key] = v
      }
      try { localStorage.setItem('workspaceModels', JSON.stringify(updated)) } catch {}
      return { workspaceModels: updated }
    }),
  hydrateWorkspaceModels: () => {
    const hydrated = loadWorkspaceModels()
    set({ workspaceModels: hydrated })
  },

  // Episode-level locked config
  episodeLockedConfig: null,
  setEpisodeLockedConfig: (config: LockedConfig | null) => set({ episodeLockedConfig: config }),
  isConfigLocked: () => {
    const state = useAppStore.getState()
    return state.episodeLockedConfig !== null
  },

  // Loading states
  loading: false,
  setLoading: (loading: boolean) => set({ loading }),
  aiLoading: false,
  setAiLoading: (aiLoading: boolean) => set({ aiLoading }),
}))
