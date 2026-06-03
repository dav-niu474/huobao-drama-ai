'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import type { Storyboard } from '@/lib/store'
import { useTimelineStore, type TransitionType } from './timeline-store'
import { shotTypeLabel } from './helpers'
import { useToast } from '@/hooks/use-toast'

// UI components
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import {
  Play,
  Pause,
  Square,
  ZoomIn,
  ZoomOut,
  Magnet,
  Trash2,
  Download,
  Volume2,
  VolumeX,
  Film,
  Music,
  Subtitles,
  ArrowRightLeft,
  SkipBack,
  SkipForward,
} from 'lucide-react'

// ── Constants ─────────────────────────────────────────────────

const TRACK_HEIGHTS = {
  video: 72,
  audio: 48,
  subtitle: 36,
  ruler: 28,
} as const

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-zinc-600/60 border-zinc-500/40',
  image_generated: 'bg-sky-700/60 border-sky-500/40',
  video_generated: 'bg-emerald-700/60 border-emerald-500/40',
  composed: 'bg-purple-700/60 border-purple-500/40',
}

const STATUS_BORDER_COLORS: Record<string, string> = {
  pending: 'border-l-zinc-400',
  image_generated: 'border-l-sky-400',
  video_generated: 'border-l-emerald-400',
  composed: 'border-l-purple-400',
}

const TRANSITION_LABELS: Record<TransitionType, string> = {
  cut: '直切',
  dissolve: '叠化',
  fadeIn: '淡入',
  fadeOut: '淡出',
  wipeLeft: '左擦',
  wipeRight: '右擦',
}

const TRANSITION_ICONS: Record<TransitionType, string> = {
  cut: '✂',
  dissolve: '◇',
  fadeIn: '◐',
  fadeOut: '◑',
  wipeLeft: '◀',
  wipeRight: '▶',
}

// ── Helper: get storyboard status ────────────────────────────

function getStoryboardStatus(sb: Storyboard): string {
  if (sb.composedUrl) return 'composed'
  if (sb.videoUrl) return 'video_generated'
  if (sb.firstFrameUrl) return 'image_generated'
  return 'pending'
}

// ── Helper: format time ───────────────────────────────────────

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  const ms = Math.floor((seconds % 1) * 100)
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`
}

// ── Props ─────────────────────────────────────────────────────

export interface TimelineEditorProps {
  storyboards: Storyboard[]
  episodeId: string
  dramaId: string
  onSelectStoryboard?: (storyboard: Storyboard) => void
  onUpdateStoryboard?: (id: string, data: Partial<Storyboard>) => Promise<void>
  onReorderStoryboards?: (orderedIds: string[]) => Promise<void>
}

// ── Main Component ────────────────────────────────────────────

export function TimelineEditor({
  storyboards,
  episodeId,
  dramaId,
  onSelectStoryboard,
  onUpdateStoryboard,
  onReorderStoryboards,
}: TimelineEditorProps) {
  const { toast } = useToast()
  const tracksRef = useRef<HTMLDivElement>(null)
  const playIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [editingSubtitleId, setEditingSubtitleId] = useState<string | null>(null)
  const [editingSubtitleText, setEditingSubtitleText] = useState('')

  const store = useTimelineStore()

  // Destructure store values for easier access
  const { playbackState, currentTime, duration, zoom, snapToGrid, selectedClipId } = store

  // Initialize audio and subtitles from storyboards
  useEffect(() => {
    store.initAudioFromStoryboards(storyboards)
    store.initSubtitlesFromStoryboards(storyboards)
  }, [storyboards.length])

  // Calculate total duration
  const totalDuration = useMemo(() => {
    let dur = 0
    for (const sb of storyboards) {
      dur += sb.duration ?? 3
    }
    return dur + 2
  }, [storyboards])

  useEffect(() => {
    store.setDuration(totalDuration)
  }, [totalDuration])

  // Playback timer
  useEffect(() => {
    if (playbackState === 'playing') {
      playIntervalRef.current = setInterval(() => {
        store.setCurrentTime(Math.min(store.currentTime + 0.05, store.duration))
        if (store.currentTime >= store.duration) {
          store.stop()
        }
      }, 50)
    } else {
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current)
        playIntervalRef.current = null
      }
    }
    return () => {
      if (playIntervalRef.current) clearInterval(playIntervalRef.current)
    }
  }, [playbackState, store.currentTime, store.duration])

  // Scroll to keep playhead visible during playback
  useEffect(() => {
    if (playbackState === 'playing' && tracksRef.current) {
      const playheadX = currentTime * zoom
      const scrollLeft = tracksRef.current.scrollLeft
      const viewWidth = tracksRef.current.clientWidth
      if (playheadX > scrollLeft + viewWidth - 100 || playheadX < scrollLeft) {
        tracksRef.current.scrollLeft = playheadX - 100
      }
    }
  }, [currentTime, playbackState, zoom])

  // Compute clip positions
  const clipPositions = useMemo(() => {
    const positions: { start: number; width: number; end: number }[] = []
    let currentX = 0
    for (let i = 0; i < storyboards.length; i++) {
      const dur = storyboards[i]?.duration ?? 3
      const width = dur * zoom
      positions.push({ start: currentX, width, end: currentX + width })
      currentX += width
    }
    return positions
  }, [storyboards, zoom])

  // Handle playhead click on ruler
  const handleRulerClick = (e: React.MouseEvent) => {
    if (!tracksRef.current) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left + (tracksRef.current?.scrollLeft ?? 0)
    const time = Math.max(0, Math.min(x / zoom, duration))
    store.setCurrentTime(time)
  }

  // Handle scroll wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      const delta = e.deltaY > 0 ? -5 : 5
      store.setZoom(zoom + delta)
    }
  }

  // ── Drag & Drop reordering ─────────────────────────────────

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDragIndex(index)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', index.toString())
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverIndex(index)
  }

  const handleDragLeave = () => {
    setDragOverIndex(null)
  }

  const handleDrop = async (e: React.DragEvent, toIndex: number) => {
    e.preventDefault()
    const fromIndex = dragIndex
    setDragIndex(null)
    setDragOverIndex(null)

    if (fromIndex === null || fromIndex === toIndex) return

    const newStoryboards = [...storyboards]
    const [moved] = newStoryboards.splice(fromIndex, 1)
    newStoryboards.splice(toIndex, 0, moved)

    const orderedIds = newStoryboards.map((sb) => sb.id)

    if (onReorderStoryboards) {
      try {
        await onReorderStoryboards(orderedIds)
        toast({ title: '镜头顺序已更新' })
      } catch (err) {
        toast({ title: '排序失败', description: String(err), variant: 'destructive' })
      }
    }
  }

  const handleDragEnd = () => {
    setDragIndex(null)
    setDragOverIndex(null)
  }

  // ── Clip resize ─────────────────────────────────────────────

  const handleResizeStart = (e: React.MouseEvent, index: number, side: 'left' | 'right') => {
    e.stopPropagation()
    e.preventDefault()

    const startX = e.clientX
    const startDuration = storyboards[index]?.duration ?? 3

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaPx = moveEvent.clientX - startX
      const deltaSeconds = deltaPx / zoom

      let newDuration = startDuration
      if (side === 'right') {
        newDuration = Math.max(0.5, startDuration + deltaSeconds)
      } else {
        newDuration = Math.max(0.5, startDuration - deltaSeconds)
      }

      if (snapToGrid) {
        newDuration = Math.round(newDuration * 2) / 2
      }

      if (onUpdateStoryboard && storyboards[index]) {
        onUpdateStoryboard(storyboards[index].id, { duration: newDuration })
      }
    }

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  // ── Subtitle editing ────────────────────────────────────────

  const handleSubtitleDoubleClick = (subtitleId: string, text: string) => {
    setEditingSubtitleId(subtitleId)
    setEditingSubtitleText(text)
  }

  const handleSubtitleSave = (subtitleId: string, storyboardId: string) => {
    store.updateSubtitle(subtitleId, editingSubtitleText)
    if (onUpdateStoryboard) {
      onUpdateStoryboard(storyboardId, { dialogue: editingSubtitleText })
    }
    setEditingSubtitleId(null)
  }

  // ── Export timeline config ──────────────────────────────────

  const handleExportConfig = () => {
    const config = {
      storyboards: storyboards.map((sb, i) => ({
        id: sb.id,
        shotNumber: i + 1,
        duration: sb.duration,
        shotType: sb.shotType,
        transition: store.transitions.find((t) => t.fromShotId === sb.id) || null,
      })),
      transitions: store.transitions,
      audioClips: store.audioClips,
      subtitles: store.subtitles,
    }
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `timeline-config-${episodeId}.json`
    a.click()
    URL.revokeObjectURL(url)
    toast({ title: '时间线配置已导出' })
  }

  // ── Total width ─────────────────────────────────────────────

  const totalWidth = Math.max(totalDuration * zoom, 800)

  // ── Get subtitle for a storyboard ───────────────────────────

  const getSubtitleForStoryboard = (storyboardId: string) => {
    return store.subtitles.find((s) => s.storyboardId === storyboardId)
  }

  // ── Get audio clip for a storyboard ─────────────────────────

  const getAudioForStoryboard = (storyboardId: string) => {
    return store.audioClips.find((ac) => ac.storyboardId === storyboardId)
  }

  // ── No storyboards message ──────────────────────────────────

  if (!storyboards || storyboards.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground p-8">
        <div className="text-center space-y-3">
          <Film className="size-12 mx-auto opacity-30" />
          <p className="text-sm">暂无分镜数据</p>
          <p className="text-xs text-muted-foreground/60">请先生成分镜后再使用时间线编辑器</p>
        </div>
      </div>
    )
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex flex-col h-full bg-zinc-950 text-zinc-100 select-none overflow-hidden">
        {/* ── Toolbar ────────────────────────────────────────── */}
        <TimelineToolbar
          playbackState={playbackState}
          currentTime={currentTime}
          duration={duration}
          zoom={zoom}
          snapToGrid={snapToGrid}
          totalClips={storyboards.length}
          onPlay={store.play}
          onPause={store.pause}
          onStop={store.stop}
          onSetTime={store.setCurrentTime}
          onSetZoom={store.setZoom}
          onSetSnapToGrid={store.setSnapToGrid}
          onExport={handleExportConfig}
        />

        {/* ── Timeline body ──────────────────────────────────── */}
        <div className="flex-1 flex flex-col overflow-hidden" onWheel={handleWheel}>
          {/* Track labels + tracks */}
          <div className="flex-1 flex overflow-hidden">
            {/* Track labels */}
            <div className="flex-shrink-0 w-[72px] border-r border-zinc-800 bg-zinc-950 flex flex-col">
              <div style={{ height: TRACK_HEIGHTS.ruler }} className="flex items-center justify-center border-b border-zinc-800">
                <span className="text-[9px] text-zinc-500 font-mono">时间轴</span>
              </div>
              <div style={{ height: TRACK_HEIGHTS.video }} className="flex items-center justify-center border-b border-zinc-800">
                <Film className="size-3.5 text-zinc-400" />
              </div>
              <div style={{ height: TRACK_HEIGHTS.audio }} className="flex items-center justify-center border-b border-zinc-800">
                <Music className="size-3.5 text-zinc-400" />
              </div>
              <div style={{ height: TRACK_HEIGHTS.subtitle }} className="flex items-center justify-center">
                <Subtitles className="size-3.5 text-zinc-400" />
              </div>
            </div>

            {/* Scrollable tracks area */}
            <div ref={tracksRef} className="flex-1 overflow-x-auto overflow-y-hidden">
              <div style={{ width: totalWidth, minHeight: '100%' }} className="relative">
                {/* Ruler */}
                <div
                  className="border-b border-zinc-800 bg-zinc-950/80 relative cursor-pointer"
                  style={{ height: TRACK_HEIGHTS.ruler }}
                  onClick={handleRulerClick}
                >
                  {Array.from({ length: Math.ceil(totalDuration) + 1 }).map((_, i) => {
                    const x = i * zoom
                    const isMajor = i % 5 === 0
                    return (
                      <div key={i} className="absolute top-0" style={{ left: x }}>
                        <div className={`h-full ${isMajor ? 'border-l border-zinc-600' : 'border-l border-zinc-800'}`} />
                        {isMajor && (
                          <span className="absolute top-1 left-1 text-[9px] text-zinc-500 font-mono whitespace-nowrap">
                            {formatTime(i)}
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* Video track */}
                <div
                  className="relative border-b border-zinc-800"
                  style={{ height: TRACK_HEIGHTS.video }}
                >
                  {storyboards.map((sb, i) => {
                    const pos = clipPositions[i]
                    if (!pos) return null
                    const status = getStoryboardStatus(sb)
                    const isSelected = selectedClipId === sb.id
                    const isDragging = dragIndex === i
                    const isDragOver = dragOverIndex === i

                    return (
                      <ContextMenu key={sb.id}>
                        <ContextMenuTrigger asChild>
                          <motion.div
                            layout
                            draggable
                            onDragStart={(e) => handleDragStart(e as unknown as React.DragEvent, i)}
                            onDragOver={(e) => handleDragOver(e as unknown as React.DragEvent, i)}
                            onDragLeave={handleDragLeave}
                            onDrop={(e) => handleDrop(e as unknown as React.DragEvent, i)}
                            onDragEnd={handleDragEnd}
                            onClick={() => {
                              store.setSelectedClipId(sb.id)
                              onSelectStoryboard?.(sb)
                            }}
                            className={`absolute top-1 bottom-1 rounded-md border cursor-pointer transition-all duration-150 overflow-hidden
                              ${STATUS_COLORS[status]}
                              ${isSelected ? 'ring-2 ring-white/60 ring-offset-1 ring-offset-zinc-950 z-10' : ''}
                              ${isDragging ? 'opacity-50 scale-95' : ''}
                              ${isDragOver ? 'ring-2 ring-yellow-400' : ''}
                              border-l-[3px] ${STATUS_BORDER_COLORS[status]}
                              hover:brightness-110
                            `}
                            style={{
                              left: pos.start,
                              width: pos.width,
                            }}
                          >
                            {/* Clip content */}
                            <div className="flex items-center h-full gap-1 px-1.5 overflow-hidden">
                              {/* Thumbnail */}
                              {sb.firstFrameUrl ? (
                                <div className="flex-shrink-0 w-10 h-10 rounded overflow-hidden bg-zinc-800">
                                  <img
                                    src={sb.firstFrameUrl}
                                    alt={`Shot ${sb.shotNumber}`}
                                    className="w-full h-full object-cover"
                                  />
                                </div>
                              ) : (
                                <div className="flex-shrink-0 w-10 h-10 rounded bg-zinc-800 flex items-center justify-center">
                                  <span className="text-[10px] text-zinc-500 font-bold">{sb.shotNumber}</span>
                                </div>
                              )}

                              {/* Info */}
                              <div className="flex-1 min-w-0 flex flex-col justify-center">
                                <div className="flex items-center gap-1">
                                  <span className="text-[10px] font-bold text-zinc-100">#{sb.shotNumber}</span>
                                  <span className="text-[9px] text-zinc-400 truncate">{shotTypeLabel(sb.shotType)}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <span className="text-[9px] text-zinc-500">{sb.duration.toFixed(1)}s</span>
                                  {sb.dialogueChar && (
                                    <span className="text-[9px] text-zinc-400 truncate">· {sb.dialogueChar}</span>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Right resize handle */}
                            <div
                              className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/20 z-20"
                              onMouseDown={(e) => handleResizeStart(e, i, 'right')}
                            />

                            {/* Left resize handle */}
                            <div
                              className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/20 z-20"
                              onMouseDown={(e) => handleResizeStart(e, i, 'left')}
                            />
                          </motion.div>
                        </ContextMenuTrigger>

                        <ContextMenuContent className="w-48">
                          <ContextMenuItem onClick={() => onSelectStoryboard?.(sb)}>
                            <Film className="size-3.5 mr-2" />
                            查看详情
                          </ContextMenuItem>
                          <ContextMenuSeparator />
                          <ContextMenuSub>
                            <ContextMenuSubTrigger>
                              <ArrowRightLeft className="size-3.5 mr-2" />
                              添加转场
                            </ContextMenuSubTrigger>
                            <ContextMenuSubContent>
                              {(Object.entries(TRANSITION_LABELS) as [TransitionType, string][]).map(([type, label]) => (
                                <ContextMenuItem
                                  key={type}
                                  onClick={() => {
                                    if (i < storyboards.length - 1) {
                                      store.addTransition({
                                        type,
                                        duration: type === 'cut' ? 0 : 1,
                                        fromShotId: sb.id,
                                        toShotId: storyboards[i + 1].id,
                                      })
                                      toast({ title: `已添加${label}转场` })
                                    }
                                  }}
                                >
                                  <span className="mr-2">{TRANSITION_ICONS[type]}</span>
                                  {label}
                                </ContextMenuItem>
                              ))}
                            </ContextMenuSubContent>
                          </ContextMenuSub>
                          {store.getTransitionBetween(sb.id, storyboards[i + 1]?.id) && (
                            <ContextMenuItem
                              onClick={() => {
                                const t = store.getTransitionBetween(sb.id, storyboards[i + 1]?.id)
                                if (t) store.removeTransition(t.id)
                                toast({ title: '转场已移除' })
                              }}
                            >
                              <Trash2 className="size-3.5 mr-2" />
                              移除转场
                            </ContextMenuItem>
                          )}
                          <ContextMenuSeparator />
                          <ContextMenuItem
                            className="text-red-400"
                            onClick={async () => {
                              if (onUpdateStoryboard) {
                                await onUpdateStoryboard(sb.id, { duration: Math.max(0.5, sb.duration - 0.5) })
                              }
                            }}
                          >
                            缩短 0.5s
                          </ContextMenuItem>
                          <ContextMenuItem
                            onClick={async () => {
                              if (onUpdateStoryboard) {
                                await onUpdateStoryboard(sb.id, { duration: sb.duration + 0.5 })
                              }
                            }}
                          >
                            延长 0.5s
                          </ContextMenuItem>
                        </ContextMenuContent>
                      </ContextMenu>
                    )
                  })}

                  {/* Transition indicators */}
                  {storyboards.map((sb, i) => {
                    if (i >= storyboards.length - 1) return null
                    const transition = store.transitions.find(
                      (t) => t.fromShotId === sb.id && t.toShotId === storyboards[i + 1].id
                    )
                    if (!transition || transition.type === 'cut') return null

                    const pos = clipPositions[i]
                    if (!pos) return null
                    const transitionX = pos.end - (transition.duration * zoom * 0.5)
                    const transitionWidth = transition.duration * zoom

                    return (
                      <Tooltip key={`transition-${transition.id}`}>
                        <TooltipTrigger asChild>
                          <div
                            className="absolute top-0 bottom-0 bg-yellow-500/20 border-l border-r border-yellow-500/40 flex items-center justify-center cursor-pointer hover:bg-yellow-500/30"
                            style={{ left: transitionX, width: transitionWidth }}
                            onDoubleClick={() => {
                              store.removeTransition(transition.id)
                              toast({ title: '转场已移除' })
                            }}
                          >
                            <span className="text-[9px] text-yellow-400 font-medium">
                              {TRANSITION_ICONS[transition.type]} {transition.duration.toFixed(1)}s
                            </span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="top" sideOffset={4}>
                          <p className="text-xs">{TRANSITION_LABELS[transition.type]} · {transition.duration.toFixed(1)}s</p>
                          <p className="text-[10px] text-zinc-400">双击移除转场</p>
                        </TooltipContent>
                      </Tooltip>
                    )
                  })}

                  {/* Drag indicator */}
                  {dragOverIndex !== null && dragIndex !== null && dragOverIndex !== dragIndex && (
                    <div
                      className="absolute top-0 bottom-0 w-0.5 bg-yellow-400 z-20"
                      style={{
                        left: dragOverIndex > dragIndex
                          ? clipPositions[dragOverIndex]?.end ?? 0
                          : clipPositions[dragOverIndex]?.start ?? 0,
                      }}
                    />
                  )}
                </div>

                {/* Audio track */}
                <div
                  className="relative border-b border-zinc-800"
                  style={{ height: TRACK_HEIGHTS.audio }}
                >
                  {storyboards.map((sb, i) => {
                    const pos = clipPositions[i]
                    if (!pos) return null
                    const audioClip = getAudioForStoryboard(sb.id)
                    if (!audioClip) return null

                    const hasAudio = !!sb.ttsAudioUrl
                    const barCount = Math.max(5, Math.floor(pos.width / 4))

                    return (
                      <div
                        key={`audio-${sb.id}`}
                        className={`absolute top-1 bottom-1 rounded border transition-colors cursor-move
                          ${hasAudio
                            ? 'bg-teal-900/40 border-teal-700/40 hover:bg-teal-900/60'
                            : 'bg-zinc-900/30 border-zinc-800/40'
                          }`}
                        style={{
                          left: pos.start + (audioClip.offsetMs / 1000) * zoom,
                          width: pos.width,
                        }}
                      >
                        {/* Waveform bars */}
                        <div className="flex items-end h-full px-1 gap-[1px]">
                          {audioClip.waveform.slice(0, barCount).map((amp, bi) => (
                            <div
                              key={bi}
                              className={`flex-1 rounded-t-sm transition-colors ${hasAudio ? 'bg-teal-500/60' : 'bg-zinc-700/30'}`}
                              style={{ height: `${amp * 100}%` }}
                            />
                          ))}
                        </div>

                        {/* Volume indicator */}
                        <div className="absolute bottom-0.5 right-1 flex items-center gap-0.5">
                          {audioClip.volume > 0 ? (
                            <Volume2 className="size-2.5 text-teal-400/60" />
                          ) : (
                            <VolumeX className="size-2.5 text-zinc-600" />
                          )}
                          <span className="text-[8px] text-zinc-500">{Math.round(audioClip.volume * 100)}%</span>
                        </div>

                        {/* Volume slider on hover */}
                        <div className="absolute inset-0 opacity-0 hover:opacity-100 transition-opacity bg-zinc-950/80 flex items-center justify-center gap-2 z-10">
                          <Volume2 className="size-3 text-zinc-400" />
                          <Slider
                            value={[audioClip.volume * 100]}
                            onValueChange={([v]) => store.setAudioClipVolume(sb.id, v / 100)}
                            min={0}
                            max={100}
                            step={5}
                            className="w-20"
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Subtitle track */}
                <div
                  className="relative"
                  style={{ height: TRACK_HEIGHTS.subtitle }}
                >
                  {storyboards.map((sb, i) => {
                    const pos = clipPositions[i]
                    if (!pos) return null
                    const subtitle = getSubtitleForStoryboard(sb.id)
                    const isEditing = editingSubtitleId === subtitle?.id

                    return (
                      <div
                        key={`subtitle-${sb.id}`}
                        className="absolute top-0.5 bottom-0.5 rounded border border-zinc-800/60 bg-amber-900/20 overflow-hidden"
                        style={{ left: pos.start, width: pos.width }}
                      >
                        {isEditing ? (
                          <Input
                            value={editingSubtitleText}
                            onChange={(e) => setEditingSubtitleText(e.target.value)}
                            onBlur={() => subtitle && handleSubtitleSave(subtitle.id, sb.id)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && subtitle) {
                                handleSubtitleSave(subtitle.id, sb.id)
                              }
                              if (e.key === 'Escape') setEditingSubtitleId(null)
                            }}
                            className="h-full text-[10px] bg-amber-900/40 border-amber-600/40 text-amber-100 px-1"
                            autoFocus
                          />
                        ) : (
                          <div
                            className="h-full flex items-center px-1.5 cursor-text hover:bg-amber-900/30"
                            onDoubleClick={() => {
                              if (subtitle) {
                                handleSubtitleDoubleClick(subtitle.id, subtitle.text)
                              }
                            }}
                          >
                            <span className="text-[10px] text-amber-300/70 truncate">
                              {subtitle?.text || sb.dialogue || '—'}
                            </span>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* Playhead */}
                <div
                  className="absolute top-0 bottom-0 z-30 pointer-events-none"
                  style={{ left: currentTime * zoom }}
                >
                  {/* Playhead handle */}
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3 h-3 bg-red-500 rounded-full" />
                  {/* Playhead line */}
                  <div className="w-0.5 h-full bg-red-500/60" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Bottom status bar ───────────────────────────────── */}
        <div className="flex-shrink-0 border-t border-zinc-800 bg-zinc-950 px-3 py-1.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-zinc-500 font-mono">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
            <Separator orientation="vertical" className="h-3 bg-zinc-800" />
            <span className="text-[10px] text-zinc-500">
              {storyboards.length} 个镜头
            </span>
            <Separator orientation="vertical" className="h-3 bg-zinc-800" />
            <span className="text-[10px] text-zinc-500">
              {store.transitions.length} 个转场
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-zinc-600">
              缩放 {Math.round(zoom)}px/s
            </span>
            <Slider
              value={[zoom]}
              onValueChange={([v]) => store.setZoom(v)}
              min={20}
              max={300}
              step={5}
              className="w-24"
            />
          </div>
        </div>
      </div>
    </TooltipProvider>
  )
}

// ── Timeline Toolbar ──────────────────────────────────────────

interface TimelineToolbarProps {
  playbackState: 'stopped' | 'playing' | 'paused'
  currentTime: number
  duration: number
  zoom: number
  snapToGrid: boolean
  totalClips: number
  onPlay: () => void
  onPause: () => void
  onStop: () => void
  onSetTime: (time: number) => void
  onSetZoom: (zoom: number) => void
  onSetSnapToGrid: (snap: boolean) => void
  onExport: () => void
}

function TimelineToolbar({
  playbackState,
  currentTime,
  duration,
  zoom,
  snapToGrid,
  totalClips,
  onPlay,
  onPause,
  onStop,
  onSetTime,
  onSetZoom,
  onSetSnapToGrid,
  onExport,
}: TimelineToolbarProps) {
  return (
    <div className="flex-shrink-0 border-b border-zinc-800 bg-zinc-950 px-3 py-1.5 flex items-center gap-2">
      {/* Playback controls */}
      <div className="flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 text-zinc-300 hover:text-white hover:bg-zinc-800"
              onClick={onStop}
            >
              <Square className="size-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>停止</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={`size-8 ${playbackState === 'playing' ? 'text-emerald-400 bg-emerald-500/10' : 'text-zinc-300 hover:text-white hover:bg-zinc-800'}`}
              onClick={playbackState === 'playing' ? onPause : onPlay}
            >
              {playbackState === 'playing' ? <Pause className="size-4" /> : <Play className="size-4" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{playbackState === 'playing' ? '暂停' : '播放'}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 text-zinc-300 hover:text-white hover:bg-zinc-800"
              onClick={() => onSetTime(0)}
            >
              <SkipBack className="size-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>回到开头</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 text-zinc-300 hover:text-white hover:bg-zinc-800"
              onClick={() => onSetTime(duration)}
            >
              <SkipForward className="size-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>跳到末尾</TooltipContent>
        </Tooltip>
      </div>

      <Separator orientation="vertical" className="h-5 bg-zinc-800" />

      {/* Current time */}
      <div className="font-mono text-xs text-zinc-300 min-w-[80px] text-center bg-zinc-900 rounded px-2 py-0.5">
        {formatTime(currentTime)}
      </div>

      <Separator orientation="vertical" className="h-5 bg-zinc-800" />

      {/* Zoom controls */}
      <div className="flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 text-zinc-300 hover:text-white hover:bg-zinc-800"
              onClick={() => onSetZoom(zoom - 10)}
            >
              <ZoomOut className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>缩小</TooltipContent>
        </Tooltip>

        <Slider
          value={[zoom]}
          onValueChange={([v]) => onSetZoom(v)}
          min={20}
          max={300}
          step={5}
          className="w-20"
        />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 text-zinc-300 hover:text-white hover:bg-zinc-800"
              onClick={() => onSetZoom(zoom + 10)}
            >
              <ZoomIn className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>放大</TooltipContent>
        </Tooltip>
      </div>

      <Separator orientation="vertical" className="h-5 bg-zinc-800" />

      {/* Snap to grid */}
      <div className="flex items-center gap-1.5">
        <Magnet className={`size-3.5 ${snapToGrid ? 'text-emerald-400' : 'text-zinc-500'}`} />
        <Switch
          checked={snapToGrid}
          onCheckedChange={onSetSnapToGrid}
          className="scale-75"
        />
        <Label className="text-[10px] text-zinc-500 cursor-pointer">吸附</Label>
      </div>

      <Separator orientation="vertical" className="h-5 bg-zinc-800" />

      {/* Clip count */}
      <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-zinc-700 text-zinc-400">
        {totalClips} 镜头
      </Badge>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Export */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="size-7 text-zinc-400 hover:text-white hover:bg-zinc-800 gap-1"
            onClick={onExport}
          >
            <Download className="size-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>导出时间线配置</TooltipContent>
      </Tooltip>
    </div>
  )
}
