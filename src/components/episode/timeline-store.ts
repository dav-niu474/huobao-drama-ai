'use client'

import { create } from 'zustand'
import type { Storyboard } from '@/lib/store'

// ── Transition types ──────────────────────────────────────────

export type TransitionType = 'cut' | 'dissolve' | 'fadeIn' | 'fadeOut' | 'wipeLeft' | 'wipeRight'

export interface Transition {
  id: string
  type: TransitionType
  duration: number // seconds (0.5 - 3.0)
  fromShotId: string
  toShotId: string
}

// ── Subtitle entry ────────────────────────────────────────────

export interface SubtitleEntry {
  id: string
  storyboardId: string
  text: string
  startOffset: number // offset from clip start in seconds
  endOffset: number   // offset from clip start in seconds
}

// ── Audio clip data ───────────────────────────────────────────

export interface AudioClipData {
  storyboardId: string
  volume: number       // 0 - 1
  offsetMs: number     // offset relative to video clip start in ms
  waveform: number[]   // amplitude bars for visualization
}

// ── Playback state ────────────────────────────────────────────

export type PlaybackState = 'stopped' | 'playing' | 'paused'

// ── Timeline store ────────────────────────────────────────────

export interface TimelineState {
  // Playback
  playbackState: PlaybackState
  currentTime: number   // in seconds
  duration: number      // total duration in seconds

  // View
  zoom: number          // pixels per second (base: 60)
  snapToGrid: boolean
  scrollLeft: number

  // Selection
  selectedClipId: string | null

  // Transitions
  transitions: Transition[]

  // Audio
  audioClips: AudioClipData[]

  // Subtitles
  subtitles: SubtitleEntry[]

  // Actions
  setPlaybackState: (state: PlaybackState) => void
  setCurrentTime: (time: number) => void
  setDuration: (duration: number) => void
  setZoom: (zoom: number) => void
  setSnapToGrid: (snap: boolean) => void
  setScrollLeft: (scrollLeft: number) => void
  setSelectedClipId: (id: string | null) => void

  // Transition actions
  addTransition: (transition: Omit<Transition, 'id'>) => void
  updateTransition: (id: string, data: Partial<Transition>) => void
  removeTransition: (id: string) => void
  getTransitionBetween: (fromId: string, toId: string) => Transition | undefined

  // Audio actions
  setAudioClipVolume: (storyboardId: string, volume: number) => void
  setAudioClipOffset: (storyboardId: string, offsetMs: number) => void
  initAudioFromStoryboards: (storyboards: Storyboard[]) => void

  // Subtitle actions
  updateSubtitle: (id: string, text: string) => void
  initSubtitlesFromStoryboards: (storyboards: Storyboard[]) => void

  // Playback controls
  play: () => void
  pause: () => void
  stop: () => void

  // Computed helpers
  getClipStart: (storyboards: Storyboard[], index: number) => number
  getClipEnd: (storyboards: Storyboard[], index: number) => number

  // Reset
  reset: () => void
}

const generateId = () => Math.random().toString(36).substring(2, 10)

const generateWaveform = (bars: number = 40): number[] => {
  return Array.from({ length: bars }, () => Math.random() * 0.7 + 0.3)
}

export const useTimelineStore = create<TimelineState>((set, get) => ({
  // Default state
  playbackState: 'stopped',
  currentTime: 0,
  duration: 0,
  zoom: 60,
  snapToGrid: true,
  scrollLeft: 0,
  selectedClipId: null,
  transitions: [],
  audioClips: [],
  subtitles: [],

  // Setters
  setPlaybackState: (playbackState) => set({ playbackState }),
  setCurrentTime: (currentTime) => set({ currentTime }),
  setDuration: (duration) => set({ duration }),
  setZoom: (zoom) => set({ zoom: Math.max(20, Math.min(300, zoom)) }),
  setSnapToGrid: (snapToGrid) => set({ snapToGrid }),
  setScrollLeft: (scrollLeft) => set({ scrollLeft }),
  setSelectedClipId: (selectedClipId) => set({ selectedClipId }),

  // Transition actions
  addTransition: (transition) => {
    const newTransition = { ...transition, id: generateId() }
    set((state) => ({
      transitions: [...state.transitions.filter(
        (t) => !(t.fromShotId === transition.fromShotId && t.toShotId === transition.toShotId)
      ), newTransition],
    }))
  },

  updateTransition: (id, data) => {
    set((state) => ({
      transitions: state.transitions.map((t) => t.id === id ? { ...t, ...data } : t),
    }))
  },

  removeTransition: (id) => {
    set((state) => ({
      transitions: state.transitions.filter((t) => t.id !== id),
    }))
  },

  getTransitionBetween: (fromId, toId) => {
    return get().transitions.find((t) => t.fromShotId === fromId && t.toShotId === toId)
  },

  // Audio actions
  setAudioClipVolume: (storyboardId, volume) => {
    set((state) => ({
      audioClips: state.audioClips.map((ac) =>
        ac.storyboardId === storyboardId ? { ...ac, volume: Math.max(0, Math.min(1, volume)) } : ac
      ),
    }))
  },

  setAudioClipOffset: (storyboardId, offsetMs) => {
    set((state) => ({
      audioClips: state.audioClips.map((ac) =>
        ac.storyboardId === storyboardId ? { ...ac, offsetMs } : ac
      ),
    }))
  },

  initAudioFromStoryboards: (storyboards) => {
    const existingIds = new Set(get().audioClips.map((ac) => ac.storyboardId))
    const newClips = storyboards
      .filter((s) => !existingIds.has(s.id))
      .map((s) => ({
        storyboardId: s.id,
        volume: 1,
        offsetMs: 0,
        waveform: generateWaveform(),
      }))
    set((state) => ({
      audioClips: [
        ...state.audioClips.filter((ac) => storyboards.some((s) => s.id === ac.storyboardId)),
        ...newClips,
      ],
    }))
  },

  // Subtitle actions
  updateSubtitle: (id, text) => {
    set((state) => ({
      subtitles: state.subtitles.map((s) => s.id === id ? { ...s, text } : s),
    }))
  },

  initSubtitlesFromStoryboards: (storyboards) => {
    const existingIds = new Set(get().subtitles.map((s) => s.storyboardId))
    const newSubtitles = storyboards
      .filter((s) => s.dialogue && !existingIds.has(s.id))
      .map((s) => ({
        id: generateId(),
        storyboardId: s.id,
        text: s.dialogue || '',
        startOffset: 0,
        endOffset: s.duration,
      }))
    set((state) => ({
      subtitles: [
        ...state.subtitles.filter((sub) => storyboards.some((s) => s.id === sub.storyboardId)),
        ...newSubtitles,
      ],
    }))
  },

  // Playback controls
  play: () => set({ playbackState: 'playing' }),
  pause: () => set({ playbackState: 'paused' }),
  stop: () => set({ playbackState: 'stopped', currentTime: 0 }),

  // Computed helpers
  getClipStart: (storyboards, index) => {
    let start = 0
    const transitions = get().transitions
    for (let i = 0; i < index; i++) {
      start += storyboards[i]?.duration ?? 3
      // Subtract transition overlap
      if (i < storyboards.length - 1) {
        const t = transitions.find((tr) => tr.fromShotId === storyboards[i]?.id && tr.toShotId === storyboards[i + 1]?.id)
        if (t && t.type !== 'cut') {
          start -= t.duration * 0.5 // overlap reduces total
        }
      }
    }
    return start
  },

  getClipEnd: (storyboards, index) => {
    return get().getClipStart(storyboards, index) + (storyboards[index]?.duration ?? 3)
  },

  // Reset
  reset: () => set({
    playbackState: 'stopped',
    currentTime: 0,
    duration: 0,
    zoom: 60,
    snapToGrid: true,
    scrollLeft: 0,
    selectedClipId: null,
    transitions: [],
    audioClips: [],
    subtitles: [],
  }),
}))
