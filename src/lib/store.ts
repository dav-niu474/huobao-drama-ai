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
  createdAt: string
  updatedAt: string
  _count?: { episodes: number; characters: number; scenes: number }
}

export interface DramaDetail extends Drama {
  episodes: Episode[]
  characters: Character[]
  scenes: Scene[]
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
  createdAt: string
  updatedAt: string
}

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
  createdAt: string
  updatedAt: string
}

// ============================================================
// View type for client-side navigation
// ============================================================

export type AppView = 'projects' | 'project-detail' | 'episode-workspace' | 'settings'

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

  // Navigation actions
  navigateToProjects: () => void
  navigateToProject: (dramaId: string) => void
  navigateToEpisode: (dramaId: string, episodeId: string) => void
  navigateToSettings: () => void

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

export const useAppStore = create<AppStore>((set) => ({
  // Navigation state
  view: 'projects',
  selectedDramaId: null,
  selectedEpisodeId: null,

  // Navigation actions
  navigateToProjects: () =>
    set({
      view: 'projects',
      selectedDramaId: null,
      selectedEpisodeId: null,
      currentDrama: null,
      currentEpisode: null,
      episodeLockedConfig: null,
    }),

  navigateToProject: (dramaId: string) =>
    set({
      view: 'project-detail',
      selectedDramaId: dramaId,
      selectedEpisodeId: null,
      currentEpisode: null,
      episodeLockedConfig: null,
    }),

  navigateToEpisode: (dramaId: string, episodeId: string) =>
    set({
      view: 'episode-workspace',
      selectedDramaId: dramaId,
      selectedEpisodeId: episodeId,
    }),

  navigateToSettings: () =>
    set({
      view: 'settings',
      selectedDramaId: null,
      selectedEpisodeId: null,
      episodeLockedConfig: null,
    }),

  // Drama data cache
  dramas: [],
  setDramas: (dramas: Drama[]) => set({ dramas }),
  currentDrama: null,
  setCurrentDrama: (drama: DramaDetail | null) => set({ currentDrama: drama }),
  currentEpisode: null,
  setCurrentEpisode: (episode: EpisodeDetail | null) =>
    set({ currentEpisode: episode }),

  // Workspace model selection (persisted to localStorage)
  workspaceModels: loadWorkspaceModels(),
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
