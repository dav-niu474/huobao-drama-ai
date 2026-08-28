'use client'

/**
 * StoryboardSeko — "Seko"-inspired storyboard workbench (dark studio theme).
 *
 * Two view modes:
 *  - 默认视图 (card grid)
 *  - 故事版视图 (comic-strip rows)
 * Clicking any shot opens a detail dialog with the frame preview, reference
 * images (shot refs + matched characters/scenes) and every prompt field.
 *
 * Drop-in replacement for StoryboardPanel: consumes exactly StoryboardPanelProps.
 */

import { useEffect, useRef, useState } from 'react'
import {
  AudioLines,
  Check,
  Clapperboard,
  Copy,
  Film,
  Image as ImageIcon,
  Images,
  LayoutGrid,
  Loader2,
  Sparkles,
  Upload,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'
import { shotTypeLabel } from './helpers'
import type { StoryboardPanelProps } from './types'
import type { Character, Scene, Storyboard } from '@/lib/store'

type ViewMode = 'grid' | 'strip'

// ── Local option lists (value strings match helpers.tsx shotTypeLabel map) ──

const SHOT_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'close-up', label: '特写' },
  { value: 'medium-close-up', label: '近景' },
  { value: 'medium', label: '中景' },
  { value: 'full-shot', label: '全景' },
  { value: 'long-shot', label: '远景' },
]

// Reuses the cameraMovement vocabulary from the storyboard agent prompt library
const CAMERA_MOVEMENT_LABELS: Record<string, string> = {
  static: '静止',
  'pan-left': '左摇',
  'pan-right': '右摇',
  'tilt-up': '上摇',
  'tilt-down': '下摇',
  'zoom-in': '推近',
  'zoom-out': '拉远',
  'dolly-in': '推轨进',
  'dolly-out': '推轨出',
  tracking: '跟随',
  'crane-up': '升起',
  'crane-down': '下降',
  handheld: '手持',
  steady: '稳定',
}

function cameraLabel(value: string): string {
  return CAMERA_MOVEMENT_LABELS[value] ?? value
}

// ── Small local helpers ─────────────────────────────────────────

function parseReferenceImages(raw: string | null): string[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      return parsed.filter((u): u is string => typeof u === 'string')
    }
    return []
  } catch {
    return []
  }
}

function padShotNumber(n: number): string {
  return String(n).padStart(2, '0')
}

// Shared custom scrollbar styling for dark scroll containers
const SCROLLBAR_CLS =
  '[scrollbar-width:thin] [scrollbar-color:#262626_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-neutral-800 hover:[&::-webkit-scrollbar-thumb]:bg-neutral-700'

const DARK_SELECT_CLS = 'h-8 w-full text-xs border-neutral-800 bg-neutral-950/60 text-neutral-200'
const DARK_SELECT_CONTENT_CLS = 'bg-neutral-900 border-neutral-800 text-neutral-200'

// ── Status dots (图片 / 视频 / 配音) ────────────────────────────

function StatusDots({ sb, className }: { sb: Storyboard; className?: string }) {
  return (
    <div className={cn('flex items-center gap-1', className)}>
      <span className="rounded bg-neutral-950/80 p-1">
        <ImageIcon
          className={cn('size-3', sb.firstFrameUrl ? 'text-emerald-400' : 'text-neutral-700')}
        />
      </span>
      <span className="rounded bg-neutral-950/80 p-1">
        <Film
          className={cn('size-3', sb.videoUrl ? 'text-emerald-400' : 'text-neutral-700')}
        />
      </span>
      <span className="rounded bg-neutral-950/80 p-1">
        <AudioLines
          className={cn('size-3', sb.ttsAudioUrl ? 'text-emerald-400' : 'text-neutral-700')}
        />
      </span>
    </div>
  )
}

// ── Media area shared by grid cards / strip rows / dialog preview ──

function ShotMedia({
  sb,
  overlay,
  showBadge = true,
}: {
  sb: Storyboard
  overlay: string | null
  showBadge?: boolean
}) {
  return (
    <>
      {sb.videoUrl ? (
        <video
          src={sb.videoUrl}
          muted
          loop
          playsInline
          poster={sb.firstFrameUrl || undefined}
          className="size-full object-cover"
          onMouseEnter={(e) => {
            void e.currentTarget.play().catch(() => {})
          }}
          onMouseLeave={(e) => {
            e.currentTarget.pause()
            e.currentTarget.currentTime = 0
          }}
        />
      ) : sb.firstFrameUrl ? (
        <img
          src={sb.firstFrameUrl}
          alt={`镜头 ${sb.shotNumber}`}
          loading="lazy"
          className="size-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
          <Clapperboard className="size-6 text-neutral-600" />
          <span className="text-[10px] text-neutral-600">暂无画面</span>
        </div>
      )}

      {showBadge && (
        <span className="absolute left-1.5 top-1.5 z-[5] rounded bg-neutral-950/80 px-1.5 py-0.5 text-[10px] font-bold text-lime-300 backdrop-blur">
          #{padShotNumber(sb.shotNumber)}
        </span>
      )}

      {overlay && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-1 bg-neutral-950/60 text-[10px] text-neutral-300">
          <Loader2 className="size-4 animate-spin text-lime-300" />
          <span>{overlay}</span>
        </div>
      )}
    </>
  )
}

// ── Prompt block with copy button ───────────────────────────────

function PromptBlock({
  label,
  text,
  fieldId,
  copiedField,
  onCopy,
  accent,
  prefix,
}: {
  label: string
  text: string
  fieldId: string
  copiedField: string | null
  onCopy: (text: string, fieldId: string) => void
  accent?: boolean
  prefix?: string
}) {
  if (!text) return null
  const copied = copiedField === fieldId
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-wide text-neutral-500">{label}</span>
        <button
          type="button"
          onClick={() => {
            void onCopy(text, fieldId)
          }}
          title="复制"
          className="rounded p-1 text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-neutral-200"
        >
          {copied ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
        </button>
      </div>
      <div
        className={cn(
          'max-h-32 overflow-y-auto rounded border p-2.5 text-[11px] leading-5 whitespace-pre-wrap',
          accent
            ? 'border-lime-300/20 bg-lime-300/5 font-sans text-neutral-200'
            : 'border-neutral-800 bg-neutral-950/60 font-mono text-neutral-300',
          SCROLLBAR_CLS
        )}
      >
        {prefix && <span className="font-semibold text-lime-300">{prefix}：</span>}
        {text}
      </div>
    </div>
  )
}

// ── Detail dialog ───────────────────────────────────────────────

interface DetailDialogProps {
  sb: Storyboard | null
  characters: Character[]
  scenes: Scene[]
  copiedField: string | null
  uploadingField: string | null
  generatingShotImg: string | null
  generatingVideo: string | null
  generatingTts: string | null
  onClose: () => void
  onGenerateImage: (sb: Storyboard) => Promise<void>
  onGenerateVideo: (sb: Storyboard) => Promise<void>
  onGenerateTts: (sb: Storyboard) => Promise<void>
  onUpload: StoryboardPanelProps['handleUpload']
  onCopy: StoryboardPanelProps['handleCopy']
  onUpdate: StoryboardPanelProps['handleUpdateStoryboard']
}

function ShotDetailDialog({
  sb,
  characters,
  scenes,
  copiedField,
  uploadingField,
  generatingShotImg,
  generatingVideo,
  generatingTts,
  onClose,
  onGenerateImage,
  onGenerateVideo,
  onGenerateTts,
  onUpload,
  onCopy,
  onUpdate,
}: DetailDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const shotTypeOptions = (() => {
    const base = [...SHOT_TYPE_OPTIONS]
    if (sb?.shotType && !base.some((o) => o.value === sb.shotType)) {
      base.unshift({ value: sb.shotType, label: shotTypeLabel(sb.shotType) })
    }
    return base
  })()

  const cameraOptions = (() => {
    const base = Object.entries(CAMERA_MOVEMENT_LABELS).map(([value, label]) => ({ value, label }))
    if (sb?.cameraMovement && !base.some((o) => o.value === sb.cameraMovement)) {
      base.unshift({ value: sb.cameraMovement, label: cameraLabel(sb.cameraMovement) })
    }
    return base
  })()

  const refImages = parseReferenceImages(sb?.referenceImages ?? null)
  const charHaystack = [sb?.description, sb?.action, sb?.dialogueChar]
    .filter(Boolean)
    .join(' ')
  const sceneHaystack = [sb?.description, sb?.action].filter(Boolean).join(' ')
  const matchedChars = charHaystack
    ? characters.filter((c) => c.imageUrl && c.name && charHaystack.includes(c.name))
    : []
  const matchedScenes = sceneHaystack
    ? scenes.filter((s) => s.imageUrl && s.location && sceneHaystack.includes(s.location))
    : []
  const hasRefs = refImages.length > 0 || matchedChars.length > 0 || matchedScenes.length > 0

  const actionBtnCls = 'border-neutral-700 bg-transparent text-neutral-300 hover:bg-neutral-800 hover:text-neutral-100'

  return (
    <Dialog
      open={!!sb}
      onOpenChange={(o) => {
        if (!o) onClose()
      }}
    >
      {sb && (
        <DialogContent
          key={sb.id}
          showCloseButton={false}
          className="max-w-[calc(100%-2rem)] gap-0 overflow-hidden border-neutral-800 bg-neutral-900 p-0 text-neutral-200 sm:max-w-3xl"
        >
          {/* a11y title (visually hidden) */}
          <DialogTitle className="sr-only">镜头详情</DialogTitle>

          {/* Custom header */}
          <div className="flex items-center justify-between gap-3 border-b border-neutral-800 px-5 py-3">
            <div className="flex min-w-0 items-center gap-2">
              <span className="text-sm font-semibold text-neutral-100">
                镜头 {padShotNumber(sb.shotNumber)}
              </span>
              {sb.title && (
                <span className="truncate text-xs text-neutral-500">{sb.title}</span>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <div className="hidden items-center gap-1 sm:flex">
                {sb.firstFrameUrl && (
                  <span className="flex items-center gap-1 rounded-full border border-neutral-800 bg-neutral-950 px-2 py-0.5 text-[10px] text-emerald-400">
                    <ImageIcon className="size-2.5" />
                    图片
                  </span>
                )}
                {sb.videoUrl && (
                  <span className="flex items-center gap-1 rounded-full border border-neutral-800 bg-neutral-950 px-2 py-0.5 text-[10px] text-emerald-400">
                    <Film className="size-2.5" />
                    视频
                  </span>
                )}
                {sb.ttsAudioUrl && (
                  <span className="flex items-center gap-1 rounded-full border border-neutral-800 bg-neutral-950 px-2 py-0.5 text-[10px] text-emerald-400">
                    <AudioLines className="size-2.5" />
                    配音
                  </span>
                )}
              </div>
              <DialogClose className="rounded-md p-1 text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-neutral-200">
                <X className="size-4" />
                <span className="sr-only">关闭</span>
              </DialogClose>
            </div>
          </div>

          {/* Body: left preview+prompts / right refs+editable fields */}
          <div className="grid max-h-[75vh] overflow-y-auto md:max-h-none md:grid-cols-[1fr_260px] md:overflow-hidden">
            {/* LEFT */}
            <div className="min-w-0 space-y-4 border-neutral-800 p-5 md:max-h-[75vh] md:overflow-y-auto md:border-r">
              {/* Preview */}
              <div className="relative aspect-video overflow-hidden rounded-lg bg-neutral-800">
                {sb.videoUrl ? (
                  <video
                    src={sb.videoUrl}
                    controls
                    poster={sb.firstFrameUrl || undefined}
                    preload="metadata"
                    className="size-full object-cover"
                  />
                ) : sb.firstFrameUrl ? (
                  <img
                    src={sb.firstFrameUrl}
                    alt={`镜头 ${sb.shotNumber}`}
                    className="size-full object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
                    <Clapperboard className="size-8 text-neutral-600" />
                    <span className="text-[10px] text-neutral-600">暂无画面</span>
                  </div>
                )}
              </div>

              {/* Action row */}
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className={actionBtnCls}
                  disabled={generatingShotImg === sb.id}
                  onClick={() => void onGenerateImage(sb)}
                >
                  {generatingShotImg === sb.id ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <ImageIcon className="size-3.5" />
                  )}
                  生成图片
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className={actionBtnCls}
                  disabled={generatingVideo === sb.id}
                  onClick={() => void onGenerateVideo(sb)}
                >
                  {generatingVideo === sb.id ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Film className="size-3.5" />
                  )}
                  生成视频
                </Button>
                {sb.dialogue && (
                  <Button
                    size="sm"
                    variant="outline"
                    className={actionBtnCls}
                    disabled={generatingTts === sb.id}
                    onClick={() => void onGenerateTts(sb)}
                  >
                    {generatingTts === sb.id ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <AudioLines className="size-3.5" />
                    )}
                    生成配音
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className={actionBtnCls}
                  disabled={uploadingField === `firstFrame-${sb.id}`}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {uploadingField === `firstFrame-${sb.id}` ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Upload className="size-3.5" />
                  )}
                  上传图片
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) {
                      void onUpload(
                        file,
                        { storyboardId: sb.id, fieldType: 'firstFrameUrl' },
                        `firstFrame-${sb.id}`
                      )
                    }
                    e.target.value = ''
                  }}
                />
              </div>

              {/* Prompts */}
              <PromptBlock
                label="图片提示词"
                text={sb.imagePrompt || ''}
                fieldId={`sb-img-${sb.id}`}
                copiedField={copiedField}
                onCopy={onCopy}
              />
              <PromptBlock
                label="视频提示词"
                text={sb.videoPrompt || ''}
                fieldId={`sb-vid-${sb.id}`}
                copiedField={copiedField}
                onCopy={onCopy}
              />
              <PromptBlock
                label="氛围"
                text={sb.atmosphere || ''}
                fieldId={`sb-atmo-${sb.id}`}
                copiedField={copiedField}
                onCopy={onCopy}
              />
              <PromptBlock
                label="背景音乐"
                text={sb.bgmPrompt || ''}
                fieldId={`sb-bgm-${sb.id}`}
                copiedField={copiedField}
                onCopy={onCopy}
              />
              <PromptBlock
                label="音效"
                text={sb.soundEffect || ''}
                fieldId={`sb-sfx-${sb.id}`}
                copiedField={copiedField}
                onCopy={onCopy}
              />
              <PromptBlock
                label={sb.dialogueChar ? `台词 · ${sb.dialogueChar}` : '台词'}
                text={sb.dialogue || ''}
                fieldId={`sb-dialogue-${sb.id}`}
                copiedField={copiedField}
                onCopy={onCopy}
                accent
                prefix={sb.dialogueChar || undefined}
              />
            </div>

            {/* RIGHT */}
            <div className="space-y-4 overflow-y-auto border-t border-neutral-800 p-5 md:max-h-[75vh] md:border-t-0">
              {/* Reference images */}
              <div>
                <h4 className="mb-2 text-xs font-semibold text-neutral-200">参考图</h4>
                {hasRefs ? (
                  <div className="grid grid-cols-2 gap-2">
                    {refImages.map((url, i) => (
                      <img
                        key={`ref-${i}`}
                        src={url}
                        alt={`参考图 ${i + 1}`}
                        loading="lazy"
                        className="aspect-square w-full rounded border border-neutral-800 object-cover transition-transform hover:scale-105"
                      />
                    ))}
                    {matchedChars.map((c) => (
                      <div key={c.id} className="flex min-w-0 flex-col items-center gap-1">
                        <img
                          src={c.imageUrl!}
                          alt={c.name}
                          loading="lazy"
                          className="aspect-square w-full rounded border border-neutral-800 object-cover transition-transform hover:scale-105"
                        />
                        <span className="w-full truncate text-center text-[9px] text-neutral-500">
                          {c.name}
                        </span>
                      </div>
                    ))}
                    {matchedScenes.map((s) => (
                      <div key={s.id} className="flex min-w-0 flex-col items-center gap-1">
                        <img
                          src={s.imageUrl!}
                          alt={s.location}
                          loading="lazy"
                          className="aspect-square w-full rounded border border-neutral-800 object-cover transition-transform hover:scale-105"
                        />
                        <span className="w-full truncate text-center text-[9px] text-neutral-500">
                          {s.location}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[10px] text-neutral-600">
                    暂无参考图 — 生成角色/场景形象后自动关联
                  </p>
                )}
              </div>

              {/* Basic info (editable) */}
              <div className="space-y-2.5">
                <h4 className="text-xs font-semibold text-neutral-200">基本信息</h4>

                <div className="space-y-1">
                  <label className="text-[10px] text-neutral-500" htmlFor={`sb-title-${sb.id}`}>
                    标题
                  </label>
                  <Input
                    id={`sb-title-${sb.id}`}
                    defaultValue={sb.title}
                    className="h-8 border-neutral-800 bg-neutral-950/60 text-xs text-neutral-200 placeholder:text-neutral-600"
                    onBlur={(e) => {
                      const v = e.target.value.trim()
                      if (v !== sb.title) void onUpdate(sb.id, { title: v })
                    }}
                  />
                </div>

                <div className="space-y-1">
                  <span className="text-[10px] text-neutral-500">景别</span>
                  <Select
                    value={sb.shotType || undefined}
                    onValueChange={(v) => void onUpdate(sb.id, { shotType: v })}
                  >
                    <SelectTrigger className={DARK_SELECT_CLS}>
                      <SelectValue placeholder="选择景别" />
                    </SelectTrigger>
                    <SelectContent className={DARK_SELECT_CONTENT_CLS}>
                      {shotTypeOptions.map((o) => (
                        <SelectItem key={o.value} value={o.value} className="text-xs">
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <span className="text-[10px] text-neutral-500">运镜</span>
                  <Select
                    value={sb.cameraMovement || undefined}
                    onValueChange={(v) => void onUpdate(sb.id, { cameraMovement: v })}
                  >
                    <SelectTrigger className={DARK_SELECT_CLS}>
                      <SelectValue placeholder="选择运镜" />
                    </SelectTrigger>
                    <SelectContent className={DARK_SELECT_CONTENT_CLS}>
                      {cameraOptions.map((o) => (
                        <SelectItem key={o.value} value={o.value} className="text-xs">
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] text-neutral-500" htmlFor={`sb-duration-${sb.id}`}>
                    时长（秒）
                  </label>
                  <Input
                    id={`sb-duration-${sb.id}`}
                    type="number"
                    step={0.5}
                    min={0.5}
                    defaultValue={String(sb.duration)}
                    className="h-8 border-neutral-800 bg-neutral-950/60 text-xs text-neutral-200"
                    onBlur={(e) => {
                      const n = Number(e.target.value)
                      if (!Number.isNaN(n) && n > 0 && n !== sb.duration) {
                        void onUpdate(sb.id, { duration: n })
                      } else {
                        e.target.value = String(sb.duration)
                      }
                    }}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] text-neutral-500" htmlFor={`sb-action-${sb.id}`}>
                    画面动作
                  </label>
                  <Textarea
                    id={`sb-action-${sb.id}`}
                    rows={2}
                    defaultValue={sb.action}
                    className="border-neutral-800 bg-neutral-950/60 text-xs text-neutral-200 placeholder:text-neutral-600"
                    onBlur={(e) => {
                      const v = e.target.value.trim()
                      if (v !== sb.action) void onUpdate(sb.id, { action: v })
                    }}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] text-neutral-500" htmlFor={`sb-dchar-${sb.id}`}>
                    台词角色
                  </label>
                  <Input
                    id={`sb-dchar-${sb.id}`}
                    defaultValue={sb.dialogueChar ?? ''}
                    placeholder="旁白"
                    className="h-8 border-neutral-800 bg-neutral-950/60 text-xs text-neutral-200 placeholder:text-neutral-600"
                    onBlur={(e) => {
                      const v = e.target.value.trim()
                      if (v !== (sb.dialogueChar ?? '')) {
                        void onUpdate(sb.id, { dialogueChar: v || null })
                      }
                    }}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] text-neutral-500" htmlFor={`sb-dialogue-${sb.id}`}>
                    台词
                  </label>
                  <Textarea
                    id={`sb-dialogue-${sb.id}`}
                    rows={2}
                    defaultValue={sb.dialogue ?? ''}
                    className="border-neutral-800 bg-neutral-950/60 text-xs text-neutral-200 placeholder:text-neutral-600"
                    onBlur={(e) => {
                      const v = e.target.value.trim()
                      if (v !== (sb.dialogue ?? '')) {
                        void onUpdate(sb.id, { dialogue: v || null })
                      }
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      )}
    </Dialog>
  )
}

// ── Main panel ──────────────────────────────────────────────────

export function StoryboardSeko({
  storyboards,
  aiLoading,
  isStoryboarding,
  episode,
  generatingShotImg,
  generatingVideo,
  generatingTts,
  batchProgress,
  uploadingField,
  copiedField,
  handleGenerateStoryboard,
  handleGenerateAllImages,
  handleGenerateAllVideos,
  handleGenerateShotImage,
  handleGenerateVideo,
  handleGenerateTts,
  handleUpload,
  handleCopy,
  handleUpdateStoryboard,
}: StoryboardPanelProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [characters, setCharacters] = useState<Character[]>([])
  const [scenes, setScenes] = useState<Scene[]>([])

  const dramaId = episode?.dramaId ?? null

  // Best-effort fetch of drama assets for the reference-image association
  useEffect(() => {
    if (!dramaId) return
    let cancelled = false
    Promise.all([api.characters.list(dramaId), api.scenes.list(dramaId)])
      .then(([c, s]) => {
        if (!cancelled) {
          setCharacters(c)
          setScenes(s)
        }
      })
      .catch(() => {
        /* reference association is best-effort — ignore fetch errors */
      })
    return () => {
      cancelled = true
    }
  }, [dramaId])

  const selectedSb = storyboards.find((s) => s.id === selectedId) ?? null

  const imgDone = storyboards.filter((s) => s.firstFrameUrl).length
  const vidDone = storyboards.filter((s) => s.videoUrl).length
  const ttsDone = storyboards.filter((s) => s.ttsAudioUrl).length

  const gridBtnCls = (active: boolean) =>
    cn(
      'flex h-7 items-center gap-1 rounded-md px-2.5 text-xs transition-colors',
      active ? 'bg-neutral-800 text-lime-300' : 'text-neutral-500 hover:text-neutral-300'
    )

  return (
    <div className="flex h-full min-h-0 flex-col bg-neutral-950 text-neutral-200">
      {/* ── Toolbar ─────────────────────────────────────────── */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-neutral-800/70 px-4 py-2.5">
        {/* Left: title + count + progress chips */}
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold text-neutral-100">分镜</h2>
          <span className="rounded-full border border-neutral-800 bg-neutral-900 px-2 py-0.5 text-[10px] text-lime-300">
            {storyboards.length} 镜头
          </span>
          <span className="rounded-full border border-neutral-800 bg-neutral-900 px-2 py-0.5 text-[10px] text-neutral-500">
            图片 {imgDone}/{storyboards.length}
          </span>
          <span className="rounded-full border border-neutral-800 bg-neutral-900 px-2 py-0.5 text-[10px] text-neutral-500">
            视频 {vidDone}/{storyboards.length}
          </span>
          <span className="rounded-full border border-neutral-800 bg-neutral-900 px-2 py-0.5 text-[10px] text-neutral-500">
            配音 {ttsDone}/{storyboards.length}
          </span>
        </div>

        {/* Right: view switcher + primary actions */}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-neutral-800 bg-neutral-900 p-0.5">
            <button type="button" onClick={() => setViewMode('grid')} className={gridBtnCls(viewMode === 'grid')}>
              <LayoutGrid className="size-3.5" />
              默认视图
            </button>
            <button
              type="button"
              onClick={() => setViewMode('strip')}
              className={gridBtnCls(viewMode === 'strip')}
            >
              <Clapperboard className="size-3.5" />
              故事版视图
            </button>
          </div>

          <Button
            size="sm"
            onClick={() => void handleGenerateStoryboard()}
            disabled={isStoryboarding}
            className="bg-lime-300 font-medium text-neutral-950 hover:bg-lime-200"
          >
            {isStoryboarding ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Sparkles className="size-4" />
            )}
            {isStoryboarding ? '生成中' : storyboards.length > 0 ? '重新生成分镜' : '生成分镜'}
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={() => void handleGenerateAllImages()}
            disabled={storyboards.length === 0}
            className="border-neutral-700 bg-transparent text-neutral-300 hover:bg-neutral-800 hover:text-neutral-100"
          >
            {aiLoading && batchProgress ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Images className="size-3.5" />
            )}
            生成全部图片
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={() => void handleGenerateAllVideos()}
            disabled={storyboards.length === 0}
            className="hidden border-neutral-700 bg-transparent text-neutral-300 hover:bg-neutral-800 hover:text-neutral-100 md:inline-flex"
          >
            <Film className="size-3.5" />
            生成全部视频
          </Button>
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────── */}
      <div
        className={cn(
          'min-h-0 flex-1 overflow-y-auto p-4',
          SCROLLBAR_CLS
        )}
      >
        {storyboards.length === 0 ? (
          isStoryboarding ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-6">
              <Loader2 className="size-6 animate-spin text-lime-300" />
              <p className="text-xs text-neutral-400">AI 正在拆解分镜…</p>
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
              <div className="flex size-16 items-center justify-center rounded-full border border-lime-300/20 bg-lime-300/10">
                <Film className="size-7 text-lime-300" />
              </div>
              <h3 className="text-sm font-semibold text-neutral-100">还没有分镜</h3>
              <p className="max-w-xs text-xs leading-5 text-neutral-500">
                AI 将根据本集剧本自动拆解镜头：景别、运镜、画面与台词提示词一步到位
              </p>
              <Button
                onClick={() => void handleGenerateStoryboard()}
                disabled={isStoryboarding}
                className="mt-1 bg-lime-300 font-medium text-neutral-950 hover:bg-lime-200"
              >
                <Sparkles className="size-4" />
                生成分镜
              </Button>
            </div>
          )
        ) : viewMode === 'grid' ? (
          /* ── 默认视图（card grid） ── */
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {storyboards.map((sb) => {
              const overlay =
                generatingShotImg === sb.id
                  ? '生成图片中'
                  : generatingVideo === sb.id
                    ? '生成视频中'
                    : generatingTts === sb.id
                      ? '生成配音中'
                      : null
              return (
                <div
                  key={sb.id}
                  onClick={() => setSelectedId(sb.id)}
                  className="group cursor-pointer overflow-hidden rounded-xl border border-neutral-800/80 bg-neutral-900/50 transition hover:border-neutral-600"
                >
                  <div className="relative aspect-video bg-neutral-800">
                    <ShotMedia sb={sb} overlay={overlay} />
                  </div>
                  <div className="p-3">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-lime-300">
                        #{padShotNumber(sb.shotNumber)}
                      </span>
                      <h4 className="min-w-0 flex-1 truncate text-xs font-medium text-neutral-200">
                        {sb.title || `镜头 ${sb.shotNumber}`}
                      </h4>
                    </div>
                    <p className="mt-1 truncate text-[10px] text-neutral-500">
                      {[
                        shotTypeLabel(sb.shotType),
                        sb.cameraMovement ? cameraLabel(sb.cameraMovement) : '',
                        `${sb.duration}s`,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                    {sb.dialogue && (
                      <p className="mt-1 truncate text-[10px] text-neutral-400">
                        {sb.dialogueChar && (
                          <span className="font-bold text-neutral-300">{sb.dialogueChar}：</span>
                        )}
                        {sb.dialogue}
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          /* ── 故事版视图（comic strip） ── */
          <div className="mx-auto max-w-5xl space-y-3">
            {storyboards.map((sb) => {
              const overlay =
                generatingShotImg === sb.id
                  ? '生成图片中'
                  : generatingVideo === sb.id
                    ? '生成视频中'
                    : generatingTts === sb.id
                      ? '生成配音中'
                      : null
              const summary = sb.description || sb.action || sb.imagePrompt || '暂无画面描述'
              return (
                <div
                  key={sb.id}
                  onClick={() => setSelectedId(sb.id)}
                  className="flex cursor-pointer gap-4 rounded-xl border border-neutral-800/80 bg-neutral-900/40 p-3 transition hover:border-neutral-600"
                >
                  {/* Left media */}
                  <div className="relative aspect-video w-40 shrink-0 overflow-hidden rounded-lg bg-neutral-800 sm:w-48">
                    <ShotMedia sb={sb} overlay={overlay} />
                  </div>
                  {/* Right content */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="truncate text-xs font-semibold text-neutral-200">
                        #{padShotNumber(sb.shotNumber)} {sb.title || `镜头 ${sb.shotNumber}`}
                      </h4>
                      <span className="shrink-0 whitespace-nowrap text-[10px] text-neutral-500">
                        {[
                          shotTypeLabel(sb.shotType),
                          sb.cameraMovement ? cameraLabel(sb.cameraMovement) : '',
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-neutral-400">{summary}</p>
                    {sb.dialogue && (
                      <p className="mt-1.5 line-clamp-2 border-l-2 border-lime-300/50 pl-2 text-xs text-neutral-300">
                        「{sb.dialogueChar || '旁白'}：{sb.dialogue}」
                      </p>
                    )}
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <StatusDots sb={sb} />
                      <span className="text-[10px] text-neutral-500">{sb.duration}s</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Detail dialog ───────────────────────────────────── */}
      <ShotDetailDialog
        sb={selectedSb}
        characters={characters}
        scenes={scenes}
        copiedField={copiedField}
        uploadingField={uploadingField}
        generatingShotImg={generatingShotImg}
        generatingVideo={generatingVideo}
        generatingTts={generatingTts}
        onClose={() => setSelectedId(null)}
        onGenerateImage={handleGenerateShotImage}
        onGenerateVideo={handleGenerateVideo}
        onGenerateTts={handleGenerateTts}
        onUpload={handleUpload}
        onCopy={handleCopy}
        onUpdate={handleUpdateStoryboard}
      />
    </div>
  )
}
