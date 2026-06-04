'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { useTranslations } from 'next-intl'
import { useAppStore, type DramaDetail, type Episode, type LockedConfig } from '@/lib/store'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ArrowLeft, Plus, Film, Users, MapPin, ChevronRight, Clock, Pencil, Lock, LockOpen, Settings2, Loader2, Coins, Library, Download, Package, Play, Pause, RefreshCw, ChevronDown, ChevronUp, Clapperboard, BookOpen, Palette, ArrowRight, X, Activity, Upload, History, Send, MoreHorizontal } from 'lucide-react'
import { UserMenu } from '@/components/user-menu'
import { ModelSelector } from '@/components/model-selector'
import { Separator } from '@/components/ui/separator'
import { CostStatsPanel } from '@/components/episode/cost-stats-panel'
import { CollaborationPanel } from '@/components/collaboration-panel'
import { ProjectDashboard } from '@/components/project-dashboard'
import { GenerationHistory } from '@/components/generation-history'
import { PublishDialog } from '@/components/publish-dialog'
import { PublishRecordsPanel } from '@/components/publish/publish-records-panel'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'

// ── helpers ──────────────────────────────────────────────────

const STYLE_ENTRIES: [string, string][] = [
  ['realistic', 'styleRealistic'],
  ['anime', 'styleAnime'],
  ['cinematic', 'styleCinematic'],
  ['comic', 'styleComic'],
  ['watercolor', 'styleWatercolor'],
  ['3d', 'style3d'],
]

function buildStyleLabels(tp: (key: string) => string): Record<string, string> {
  const labels: Record<string, string> = {}
  for (const [key, labelKey] of STYLE_ENTRIES) {
    labels[key] = tp(labelKey)
  }
  return labels
}

function scriptStatusLabel(status: string, tp: (key: string) => string): { label: string; color: string } {
  switch (status) {
    case 'completed':
      return { label: tp('scriptStatusCompleted'), color: 'bg-emerald-500' }
    case 'processing':
      return { label: tp('scriptStatusProcessing'), color: 'bg-amber-500' }
    case 'failed':
      return { label: tp('scriptStatusFailed'), color: 'bg-red-500' }
    default:
      return { label: tp('scriptStatusPending'), color: 'bg-zinc-500' }
  }
}

function relativeTime(dateStr: string, tc: (key: string, opts?: Record<string, number>) => string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diff = Math.max(0, now - then)
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return tc('justNow')
  if (minutes < 60) return tc('minutesAgo', { count: minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return tc('hoursAgo', { count: hours })
  const days = Math.floor(hours / 24)
  if (days < 30) return tc('daysAgo', { count: days })
  return tc('monthsAgo', { count: Math.floor(days / 30) })
}

function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return ''
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

// ── episode card ─────────────────────────────────────────────

function isLocked(lockedConfig: string | null | undefined): boolean {
  return !!lockedConfig && lockedConfig !== 'null'
}

function EpisodeCard({
  episode,
  onClick,
  tc,
  tp,
}: {
  episode: Episode
  onClick: () => void
  tc: (key: string, opts?: Record<string, number>) => string
  tp: (key: string, opts?: Record<string, number>) => string
}) {
  const status = scriptStatusLabel(episode.scriptStatus, tp)
  const storyboardCount = episode._count?.storyboards ?? 0
  const durationStr = formatDuration(episode.duration)
  const locked = isLocked(episode.lockedConfig)

  return (
    <motion.div whileHover={{ x: 4 }}>
      <Card
        className="cursor-pointer group border-border/50 hover:border-primary/50 hover:shadow-[0_0_12px_oklch(0.72_0.15_75/0.15)] transition-all duration-200 py-0 gap-0"
        onClick={onClick}
      >
        <CardContent className="p-4 flex items-center gap-4">
          {/* Episode number badge */}
          <div className="flex-shrink-0 w-11 h-11 rounded-lg bg-primary/10 flex items-center justify-center">
            <span className="text-sm font-bold text-primary">
              E{String(episode.episodeNumber).padStart(2, '0')}
            </span>
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-medium truncate">
                {episode.title || tp('episode', { number: episode.episodeNumber })}
              </h4>
              {/* Lock icon */}
              {locked && (
                <Lock className="size-3 text-amber-500 flex-shrink-0" />
              )}
              {/* Status dot */}
              <div className="flex items-center gap-1.5">
                <span className={`size-2 rounded-full ${status.color}`} />
                <span className="text-[11px] text-muted-foreground">{status.label}</span>
              </div>
            </div>
            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
              {storyboardCount > 0 && (
                <span className="flex items-center gap-1">
                  <Film className="size-3" />
                  {storyboardCount}{tc('shots')}
                </span>
              )}
              {durationStr && (
                <span className="flex items-center gap-1">
                  <Clock className="size-3" />
                  {durationStr}
                </span>
              )}
            </div>
          </div>

          {/* Arrow */}
          <ChevronRight className="size-4 text-muted-foreground/40 group-hover:text-primary transition-colors flex-shrink-0" />
        </CardContent>
      </Card>
    </motion.div>
  )
}

// ── Three-Stage Progress ────────────────────────────────────

type StageStatus = 'completed' | 'in-progress' | 'pending'

interface StageInfo {
  key: 'script' | 'assets' | 'production'
  icon: typeof BookOpen
  label: string
  status: StageStatus
  stats: string
  onClick: () => void
}

function ThreeStageProgress({ drama, tc, tp }: { drama: DramaDetail; tc: (key: string, opts?: Record<string, number>) => string; tp: (key: string, opts?: Record<string, number>) => string }) {
  const navigateToScriptWorkbench = useAppStore((s) => s.navigateToScriptWorkbench)
  const navigateToAssetWorkbench = useAppStore((s) => s.navigateToAssetWorkbench)
  const navigateToEpisode = useAppStore((s) => s.navigateToEpisode)

  // Determine script stage status
  const episodesWithScript = drama.episodes?.filter((ep) => ep.scriptContent).length ?? 0
  const totalEpisodes = drama.episodes?.length ?? 0
  const scriptStage: StageStatus =
    totalEpisodes > 0 && episodesWithScript === totalEpisodes
      ? 'completed'
      : episodesWithScript > 0 || drama.novelParsed
      ? 'in-progress'
      : 'pending'

  // Determine asset stage status
  const charCount = drama.characters?.length ?? 0
  const sceneCount = drama.scenes?.length ?? 0
  const propCount = drama.props?.length ?? 0
  const hasAssets = charCount > 0 || sceneCount > 0 || propCount > 0
  const assetStage: StageStatus =
    drama.assetStatus === 'ready'
      ? 'completed'
      : drama.assetStatus === 'partial' || drama.assetStatus === 'extracting' || hasAssets
      ? 'in-progress'
      : 'pending'

  // Determine production stage status
  const completedEpisodes = drama.episodes?.filter(
    (ep) => ep.status === 'completed' || (ep.videoUrl && ep.duration > 0)
  ).length ?? 0
  const productionStage: StageStatus =
    totalEpisodes > 0 && completedEpisodes === totalEpisodes
      ? 'completed'
      : completedEpisodes > 0
      ? 'in-progress'
      : 'pending'

  // Navigate to first uncompleted episode
  const handleNavigateToProduction = () => {
    const uncompleted = drama.episodes?.find(
      (ep) => ep.status !== 'completed'
    )
    if (uncompleted) {
      navigateToEpisode(drama.id, uncompleted.id)
    } else if (drama.episodes && drama.episodes.length > 0) {
      navigateToEpisode(drama.id, drama.episodes[0].id)
    }
  }

  const stages: StageInfo[] = [
    {
      key: 'script',
      icon: BookOpen,
      label: tp('scriptGeneration'),
      status: scriptStage,
      stats: totalEpisodes > 0
        ? tp('episodesGenerated', { completed: episodesWithScript, total: totalEpisodes })
        : tp('notStarted'),
      onClick: () => navigateToScriptWorkbench(drama.id),
    },
    {
      key: 'assets',
      icon: Palette,
      label: tp('assetManagement'),
      status: assetStage,
      stats: hasAssets
        ? tp('charSceneProp', { chars: charCount, scenes: sceneCount, props: propCount })
        : tp('notExtracted'),
      onClick: () => navigateToAssetWorkbench(drama.id),
    },
    {
      key: 'production',
      icon: Film,
      label: tp('pipelineProduction'),
      status: productionStage,
      stats: totalEpisodes > 0
        ? tp('episodesCompleted', { completed: completedEpisodes, total: totalEpisodes })
        : tp('notStarted'),
      onClick: handleNavigateToProduction,
    },
  ]

  const statusColors: Record<StageStatus, { bg: string; text: string; border: string; dot: string; glow: string }> = {
    completed: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/30', dot: 'bg-emerald-500', glow: '' },
    'in-progress': { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/30', dot: 'bg-amber-500', glow: 'shadow-[0_0_20px_rgba(245,158,11,0.15)]' },
    pending: { bg: 'bg-muted/30', text: 'text-muted-foreground', border: 'border-border/50', dot: 'bg-zinc-500', glow: '' },
  }

  const statusLabels: Record<StageStatus, string> = {
    completed: tc('completed'),
    'in-progress': tc('inProgress'),
    pending: tc('pending'),
  }

  return (
    <div className="flex items-center gap-3 sm:gap-0">
      {stages.map((stage, idx) => {
        const colors = statusColors[stage.status]
        const Icon = stage.icon
        return (
          <div key={stage.key} className="flex items-center gap-3 sm:gap-0 flex-1">
            {/* Stage Card */}
            <button
              onClick={stage.onClick}
              className={`
                group relative flex-1 rounded-xl border p-3 sm:p-4 text-left transition-all duration-200
                hover:border-primary/40 hover:shadow-md cursor-pointer
                ${colors.bg} ${colors.border} ${colors.glow}
              `}
            >
              {/* Active stage amber gradient overlay */}
              {stage.status === 'in-progress' && (
                <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-amber-500/5 to-amber-500/10 pointer-events-none" />
              )}
              <div className="relative flex items-start gap-2 sm:gap-3">
                <div className={`shrink-0 size-8 sm:size-9 rounded-lg flex items-center justify-center ${
                  stage.status === 'in-progress' ? 'bg-amber-500/20' :
                  stage.status === 'completed' ? 'bg-emerald-500/20' : 'bg-muted/60'
                }`}>
                  <Icon className={`size-4 sm:size-4.5 ${
                    stage.status === 'in-progress' ? 'text-amber-500' :
                    stage.status === 'completed' ? 'text-emerald-500' : 'text-muted-foreground'
                  }`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-xs sm:text-sm font-medium truncate">{stage.label}</span>
                    <Badge
                      variant="outline"
                      className={`text-[9px] sm:text-[10px] px-1.5 py-0 h-4 shrink-0 ${colors.text} ${colors.border}`}
                    >
                      <span className={`size-1.5 rounded-full ${colors.dot} mr-1`} />
                      {statusLabels[stage.status]}
                    </Badge>
                  </div>
                  <p className="text-[10px] sm:text-xs text-muted-foreground truncate">{stage.stats}</p>
                </div>
                <ChevronRight className="size-3.5 text-muted-foreground/40 group-hover:text-primary transition-colors shrink-0 mt-1" />
              </div>

              {/* Film strip decoration for active stage */}
              {stage.status === 'in-progress' && (
                <div className="absolute bottom-0 left-2 right-2 h-1 rounded-b-xl bg-gradient-to-r from-amber-500/20 via-amber-500/40 to-amber-500/20"
                  style={{
                    backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent 6px, rgba(245,158,11,0.15) 6px, rgba(245,158,11,0.15) 8px)',
                  }}
                />
              )}
            </button>

            {/* Arrow connector */}
            {idx < stages.length - 1 && (
              <div className="hidden sm:flex items-center px-1.5">
                <ArrowRight className="size-4 text-muted-foreground/40" />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── main component ───────────────────────────────────────────

export function ProjectDetailView() {
  const {
    selectedDramaId,
    currentDrama,
    setCurrentDrama,
    navigateToProjects,
    navigateToEpisode,
    setLoading,
    loading,
  } = useAppStore()
  const { toast } = useToast()
  const tc = useTranslations('common')
  const tp = useTranslations('projectDetail')
  const tn = useTranslations('nav')
  const tpr = useTranslations('project')

  // Build style labels once
  const STYLE_LABELS = buildStyleLabels(tpr)

  // Add episode dialog
  const [addEpOpen, setAddEpOpen] = useState(false)
  const [newEpTitle, setNewEpTitle] = useState('')
  const [adding, setAdding] = useState(false)

  // Inline title editing
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [savingTitle, setSavingTitle] = useState(false)

  // Bulk lock/unlock state
  const [bulkLoading, setBulkLoading] = useState(false)

  // Default lock config dialog
  const [lockSettingsOpen, setLockSettingsOpen] = useState(false)
  const [defaultLockConfig, setDefaultLockConfig] = useState<LockedConfig>({})
  const [savingLockConfig, setSavingLockConfig] = useState(false)

  // Cost stats dialog
  const [costStatsOpen, setCostStatsOpen] = useState(false)

  // Batch pipeline state
  const [batchStatus, setBatchStatus] = useState<{
    batchId: string
    status: 'running' | 'completed' | 'paused' | 'failed'
    totalEpisodes: number
    completedEpisodes: number
    currentEpisode: number
    currentStep: string
    progressPercent: number
    episodes: Array<{
      episodeId: string
      episodeNumber: number
      title: string
      status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
      completedSteps: number
      totalSteps: number
      currentStep: string | null
      error?: string
    }>
  } | null>(null)
  const [batchLoading, setBatchLoading] = useState(false)
  const [batchExpanded, setBatchExpanded] = useState(false)
  const [batchPolling, setBatchPolling] = useState(false)

  // Collaboration sidebar
  const [collabOpen, setCollabOpen] = useState(false)

  // Dashboard view
  const [showDashboard, setShowDashboard] = useState(false)

  // Generation History & Publish tabs
  const [detailTab, setDetailTab] = useState<'episodes' | 'history' | 'publish-records'>('episodes')
  const [publishOpen, setPublishOpen] = useState(false)

  // Import from library dialog
  const [importOpen, setImportOpen] = useState(false)
  const [importAssets, setImportAssets] = useState<any[]>([])
  const [importLoading, setImportLoading] = useState(false)
  const [importCategory, setImportCategory] = useState<string>('all')
  const [importSearch, setImportSearch] = useState('')
  const [applyingAssetId, setApplyingAssetId] = useState<string | null>(null)

  // Fetch drama detail
  const fetchDrama = useCallback(async () => {
    if (!selectedDramaId) return
    setLoading(true)
    try {
      const detail = await api.dramas.get(selectedDramaId)
      setCurrentDrama(detail)
    } catch (err) {
      toast({ title: tp('loadDetailFailed'), description: String(err), variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [selectedDramaId, setCurrentDrama, setLoading, toast, tp])

  useEffect(() => {
    fetchDrama()
  }, [fetchDrama])

  // Add episode
  const handleAddEpisode = async () => {
    if (!selectedDramaId) return
    setAdding(true)
    try {
      await api.episodes.create(selectedDramaId, {
        title: newEpTitle.trim() || undefined,
      })
      toast({ title: tp('episodeAdded') })
      setAddEpOpen(false)
      setNewEpTitle('')
      fetchDrama()
    } catch (err) {
      toast({ title: tp('addFailed'), description: String(err), variant: 'destructive' })
    } finally {
      setAdding(false)
    }
  }

  const drama = currentDrama as DramaDetail | null

  // Title editing handlers
  const handleStartEditTitle = () => {
    if (!drama) return
    setEditTitle(drama.title)
    setIsEditingTitle(true)
  }

  const handleSaveTitle = async () => {
    if (!drama || !editTitle.trim()) return
    if (editTitle.trim() === drama.title) {
      setIsEditingTitle(false)
      return
    }
    setSavingTitle(true)
    try {
      await api.dramas.update(drama.id, { title: editTitle.trim() })
      await fetchDrama()
      toast({ title: tp('titleUpdated') })
    } catch (err) {
      toast({ title: tp('updateFailed'), description: String(err), variant: 'destructive' })
      setEditTitle(drama.title)
    } finally {
      setSavingTitle(false)
      setIsEditingTitle(false)
    }
  }

  const handleCancelEditTitle = () => {
    setIsEditingTitle(false)
    setEditTitle('')
  }

  // ── Bulk lock/unlock handlers ──
  const handleBulkLock = async () => {
    if (!selectedDramaId) return
    setBulkLoading(true)
    try {
      const res = await fetch(`/api/dramas/${selectedDramaId}/bulk-lock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'lock' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || tp('operationFailed'))
      toast({ title: data.message || tp('allEpisodesLocked') })
      fetchDrama()
    } catch (err) {
      toast({ title: tp('bulkLockFailed'), description: String(err), variant: 'destructive' })
    } finally {
      setBulkLoading(false)
    }
  }

  const handleBulkUnlock = async () => {
    if (!selectedDramaId) return
    setBulkLoading(true)
    try {
      const res = await fetch(`/api/dramas/${selectedDramaId}/bulk-lock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'unlock' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || tp('operationFailed'))
      toast({ title: data.message || tp('allEpisodesUnlocked') })
      fetchDrama()
    } catch (err) {
      toast({ title: tp('bulkUnlockFailed'), description: String(err), variant: 'destructive' })
    } finally {
      setBulkLoading(false)
    }
  }

  // ── Default lock config handlers ──
  const handleOpenLockSettings = () => {
    if (!drama) return
    const raw = drama.defaultLockedConfig
    if (raw && raw !== 'null') {
      try {
        setDefaultLockConfig(JSON.parse(raw))
      } catch {
        setDefaultLockConfig({})
      }
    } else {
      setDefaultLockConfig({})
    }
    setLockSettingsOpen(true)
  }

  // ── Batch Pipeline handlers ───────────────────────────────
  const fetchBatchStatus = useCallback(async () => {
    if (!selectedDramaId) return
    try {
      const status = await api.dramas.getBatchStatus(selectedDramaId)
      setBatchStatus(status)
    } catch {
      // No batch found — that's fine
      setBatchStatus(null)
    }
  }, [selectedDramaId])

  useEffect(() => {
    fetchBatchStatus()
  }, [fetchBatchStatus])

  // Poll batch status when running
  useEffect(() => {
    if (!batchPolling || batchStatus?.status !== 'running') {
      setBatchPolling(false)
      return
    }
    const interval = setInterval(() => {
      fetchBatchStatus()
    }, 3000)
    return () => clearInterval(interval)
  }, [batchPolling, batchStatus?.status, fetchBatchStatus])

  // Auto-stop polling when batch completes
  useEffect(() => {
    if (batchStatus?.status && batchStatus.status !== 'running') {
      setBatchPolling(false)
    }
  }, [batchStatus?.status])

  const handleStartBatch = async () => {
    if (!selectedDramaId) return
    setBatchLoading(true)
    try {
      await api.dramas.startBatchPipeline(selectedDramaId)
      toast({ title: tp('batchStarted') })
      setBatchPolling(true)
      fetchBatchStatus()
    } catch (err) {
      toast({ title: tp('startFailed'), description: String(err), variant: 'destructive' })
    } finally {
      setBatchLoading(false)
    }
  }

  const handlePauseBatch = async () => {
    if (!selectedDramaId) return
    setBatchLoading(true)
    try {
      await api.dramas.pauseBatchPipeline(selectedDramaId)
      toast({ title: tp('batchPaused') })
      fetchBatchStatus()
    } catch (err) {
      toast({ title: tp('pauseFailed'), description: String(err), variant: 'destructive' })
    } finally {
      setBatchLoading(false)
    }
  }

  const handleResumeBatch = async () => {
    if (!selectedDramaId) return
    setBatchLoading(true)
    try {
      await api.dramas.resumeBatchPipeline(selectedDramaId)
      toast({ title: tp('batchResumed') })
      setBatchPolling(true)
      fetchBatchStatus()
    } catch (err) {
      toast({ title: tp('resumeFailed'), description: String(err), variant: 'destructive' })
    } finally {
      setBatchLoading(false)
    }
  }

  const handleSaveDefaultLockConfig = async () => {
    if (!drama) return
    setSavingLockConfig(true)
    try {
      const clean: LockedConfig = {}
      for (const [k, v] of Object.entries(defaultLockConfig)) {
        if (v) (clean as Record<string, string>)[k] = v
      }
      await api.dramas.update(drama.id, {
        defaultLockedConfig: Object.keys(clean).length > 0 ? JSON.stringify(clean) : 'null',
      } as any)
      toast({ title: tp('defaultAiConfigSaved') })
      setLockSettingsOpen(false)
      fetchDrama()
    } catch (err) {
      toast({ title: tp('saveFailed'), description: String(err), variant: 'destructive' })
    } finally {
      setSavingLockConfig(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-border/50 bg-background/80 backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={navigateToProjects}
              className="text-muted-foreground hover:text-foreground -ml-2"
            >
              <ArrowLeft className="size-4" />
              <span className="hidden sm:inline">{tn('backToProjects')}</span>
            </Button>
            <UserMenu />
          </div>

          {drama && (
            <div className="space-y-3 mt-4 pt-3 border-t border-border/30">
              {/* Title area - full width */}
              <div className="min-w-0">
                {isEditingTitle ? (
                  <div className="flex items-center gap-2">
                    <Input
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveTitle()
                        if (e.key === 'Escape') handleCancelEditTitle()
                      }}
                      onBlur={handleSaveTitle}
                      disabled={savingTitle}
                      autoFocus
                      className="text-xl sm:text-2xl font-bold h-auto py-0 px-1 border-primary/50"
                    />
                    {savingTitle && (
                      <span className="text-xs text-muted-foreground animate-pulse">{tc('saving')}</span>
                    )}
                  </div>
                ) : (
                  <div
                    className="group/title inline-flex items-center gap-1.5 cursor-pointer"
                    onDoubleClick={handleStartEditTitle}
                  >
                    <h1 className="text-xl sm:text-2xl font-bold truncate">{drama.title}</h1>
                    <Pencil className="size-4 text-muted-foreground opacity-0 group-hover/title:opacity-100 transition-opacity flex-shrink-0" />
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <Badge variant="secondary" className="text-xs">
                    {drama.genre}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    {STYLE_LABELS[drama.style] ?? drama.style}
                  </Badge>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Users className="size-3" />{drama.characters?.length ?? drama._count?.characters ?? 0}
                  </span>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="size-3" />{drama.scenes?.length ?? drama._count?.scenes ?? 0}
                  </span>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Film className="size-3" />{drama.episodes?.length ?? drama._count?.episodes ?? 0}{tc('episodes')}
                  </span>
                </div>
              </div>

              {/* Buttons row - wraps on small screens */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {/* Primary actions */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const { navigateToScriptWorkbench } = useAppStore.getState()
                    navigateToScriptWorkbench(drama.id)
                  }}
                  className="h-7 text-xs gap-1"
                >
                  <Film className="size-3.5" />
                  <span className="hidden sm:inline">{tp('scriptWorkshop')}</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleStartBatch}
                  disabled={batchLoading || batchStatus?.status === 'running'}
                  className="h-7 text-xs gap-1"
                >
                  {batchStatus?.status === 'running' ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Clapperboard className="size-3.5" />
                  )}
                  <span className="hidden sm:inline">{tp('batchProduction')}</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCollabOpen(!collabOpen)}
                  className={`h-7 text-xs gap-1 ${collabOpen ? 'border-primary bg-primary/5' : ''}`}
                >
                  <Users className="size-3.5" />
                  <span className="hidden sm:inline">{tp('team')}</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowDashboard(!showDashboard)}
                  className={`h-7 text-xs gap-1 ${showDashboard ? 'border-primary bg-primary/5' : ''}`}
                >
                  <Activity className="size-3.5" />
                  <span className="hidden sm:inline">{tp('dashboard')}</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDetailTab(detailTab === 'history' ? 'episodes' : 'history')}
                  className={`h-7 text-xs gap-1 ${detailTab === 'history' ? 'border-primary bg-primary/5' : ''}`}
                >
                  <History className="size-3.5" />
                  <span className="hidden sm:inline">{tp('generationHistory')}</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDetailTab(detailTab === 'publish-records' ? 'episodes' : 'publish-records')}
                  className={`h-7 text-xs gap-1 ${detailTab === 'publish-records' ? 'border-primary bg-primary/5' : ''}`}
                >
                  <Send className="size-3.5" />
                  <span className="hidden sm:inline">{tp('publishRecords')}</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPublishOpen(true)}
                  className="h-7 text-xs gap-1"
                >
                  <Upload className="size-3.5" />
                  <span className="hidden sm:inline">{tp('publish')}</span>
                </Button>
                <Button onClick={() => setAddEpOpen(true)} size="sm" className="h-7 amber-glow">
                  <Plus className="size-4" />
                  <span className="hidden sm:inline">{tp('addEpisode')}</span>
                </Button>

                {/* Secondary actions in dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                      <MoreHorizontal className="size-3.5" />
                      <span className="hidden sm:inline">{tp('moreActions')}</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setCostStatsOpen(true)}>
                      <Coins className="size-4" />
                      {tp('costStats')}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleOpenLockSettings}>
                      <Settings2 className="size-4" />
                      {tp('aiLock')}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setImportOpen(true)}>
                      <Library className="size-4" />
                      {tp('importFromLibrary')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          )}

          {loading && !drama && (
            <div className="space-y-3">
              <div className="h-7 w-48 shimmer rounded" />
              <div className="flex gap-2">
                <div className="h-5 w-14 shimmer rounded-full" />
                <div className="h-5 w-14 shimmer rounded-full" />
                <div className="h-5 w-24 shimmer rounded" />
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Three-Stage Progress */}
      {drama && (
        <div className="border-b border-border/50 bg-muted/20">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4">
            <ThreeStageProgress drama={drama} tc={tc} tp={tp} />
          </div>
        </div>
      )}

      {/* Episodes list / Generation History / Publish Records + Collaboration sidebar */}
      <div className="flex-1 flex overflow-hidden">
        {showDashboard && drama ? (
          <ProjectDashboard dramaId={drama.id} onBack={() => setShowDashboard(false)} />
        ) : detailTab === 'history' && drama ? (
          <main className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 py-6">
            <GenerationHistory dramaId={drama.id} />
          </main>
        ) : detailTab === 'publish-records' && drama ? (
          <main className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 py-6">
            <PublishRecordsPanel dramaId={drama.id} />
          </main>
        ) : (
        <main className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 py-6">
        {loading && !drama ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i} className="py-0 gap-0">
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="size-11 shimmer rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-32 shimmer rounded" />
                    <div className="h-3 w-20 shimmer rounded" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : drama && drama.episodes && drama.episodes.length > 0 ? (
          <div className="space-y-3">
            {/* Bulk action bar */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>{drama.episodes.length} {tc('episodes')}</span>
                {drama.episodes.some((ep) => isLocked(ep.lockedConfig)) && (
                  <Badge variant="secondary" className="text-[10px] gap-1 h-5">
                    <Lock className="size-2.5" />
                    {drama.episodes.filter((ep) => isLocked(ep.lockedConfig)).length} {tp('locked')}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs h-7 gap-1 text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/20"
                  onClick={handleBulkLock}
                  disabled={bulkLoading}
                >
                  {bulkLoading ? <Loader2 className="size-3 animate-spin" /> : <Lock className="size-3" />}
                  {tp('lockAll')}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs h-7 gap-1 text-muted-foreground hover:text-foreground"
                  onClick={handleBulkUnlock}
                  disabled={bulkLoading}
                >
                  <LockOpen className="size-3" />
                  {tp('unlockAll')}
                </Button>
              </div>
            </div>

            {/* ── Batch Pipeline Card ── */}
            {batchStatus && (
              <Card className="border-primary/20 bg-primary/5 py-0 gap-0">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Clapperboard className="size-4 text-primary" />
                        <h3 className="text-sm font-medium">{tp('batchPipeline')}</h3>
                        <Badge
                          variant={batchStatus.status === 'running' ? 'default' : batchStatus.status === 'completed' ? 'secondary' : batchStatus.status === 'paused' ? 'outline' : 'destructive'}
                          className="text-[10px] px-1.5 py-0"
                        >
                          {batchStatus.status === 'running' ? tp('batchRunning') : batchStatus.status === 'completed' ? tp('batchCompleted') : batchStatus.status === 'paused' ? tp('batchPaused') : tc('failed')}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {tp('episodeComplete', { completed: batchStatus.completedEpisodes, total: batchStatus.totalEpisodes })} ({batchStatus.progressPercent}%)
                        {batchStatus.status === 'running' && ` — ${tp('currentEpisode', { episode: batchStatus.currentEpisode })} ${batchStatus.currentStep}`}
                      </p>
                      {/* Progress bar */}
                      <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all duration-500"
                          style={{ width: `${batchStatus.progressPercent}%` }}
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {batchStatus.status === 'running' && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1"
                          onClick={handlePauseBatch}
                          disabled={batchLoading}
                        >
                          <Pause className="size-3" />
                          {tp('pause')}
                        </Button>
                      )}
                      {batchStatus.status === 'paused' && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1"
                          onClick={handleResumeBatch}
                          disabled={batchLoading}
                        >
                          <Play className="size-3" />
                          {tp('resume')}
                        </Button>
                      )}
                      {batchStatus.status === 'completed' && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1"
                          onClick={handleStartBatch}
                          disabled={batchLoading}
                        >
                          <RefreshCw className="size-3" />
                          {tp('reExecute')}
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs gap-0.5"
                        onClick={() => setBatchExpanded(!batchExpanded)}
                      >
                        {batchExpanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
                        {tp('details')}
                      </Button>
                    </div>
                  </div>

                  {/* Episode grid (expandable) */}
                  {batchExpanded && batchStatus.episodes.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-border/50">
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-96 overflow-y-auto">
                        {batchStatus.episodes.map((ep) => (
                          <div
                            key={ep.episodeId}
                            className={`p-2 rounded-lg border text-xs ${
                              ep.status === 'completed'
                                ? 'border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/20'
                                : ep.status === 'running'
                                ? 'border-primary/30 bg-primary/5'
                                : ep.status === 'failed'
                                ? 'border-red-500/30 bg-red-50/50 dark:bg-red-950/20'
                                : 'border-border/50 bg-muted/30'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-1 mb-1">
                              <span className="font-medium truncate">
                                E{String(ep.episodeNumber).padStart(2, '0')}
                              </span>
                              <Badge
                                variant={
                                  ep.status === 'completed' ? 'secondary' :
                                  ep.status === 'running' ? 'default' :
                                  ep.status === 'failed' ? 'destructive' : 'outline'
                                }
                                className="text-[9px] px-1 py-0 h-4"
                              >
                                {ep.status === 'completed' ? tc('completedShort') :
                                 ep.status === 'running' ? tp('batchRunningShort') :
                                 ep.status === 'failed' ? tc('failedShort') :
                                 ep.status === 'skipped' ? tc('skippedShort') : tc('waitingShort')}
                              </Badge>
                            </div>
                            <p className="text-muted-foreground truncate mb-1">
                              {ep.title}
                            </p>
                            <div className="flex items-center gap-1">
                              <span className="text-muted-foreground">
                                {ep.completedSteps}/{ep.totalSteps}{tc('steps')}
                              </span>
                              <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all ${
                                    ep.status === 'completed' ? 'bg-emerald-500' :
                                    ep.status === 'running' ? 'bg-primary' :
                                    ep.status === 'failed' ? 'bg-red-500' : 'bg-muted-foreground/30'
                                  }`}
                                  style={{ width: `${ep.totalSteps > 0 ? (ep.completedSteps / ep.totalSteps) * 100 : 0}%` }}
                                />
                              </div>
                            </div>
                            {ep.currentStep && (
                              <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                                → {ep.currentStep}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {drama.episodes
              .sort((a, b) => a.episodeNumber - b.episodeNumber)
              .map((ep) => (
                <EpisodeCard
                  key={ep.id}
                  episode={ep}
                  onClick={() => navigateToEpisode(drama.id, ep.id)}
                  tc={tc}
                  tp={tp}
                />
              ))}
          </div>
        ) : drama ? (
          /* Empty state */
          <div className="flex items-center justify-center py-32">
            <Card
              className="w-full max-w-sm border-dashed border-2 border-border/50 hover:border-primary/40 transition-colors cursor-pointer py-0 gap-0"
              onClick={() => setAddEpOpen(true)}
            >
              <CardContent className="p-10 flex flex-col items-center gap-5 text-muted-foreground">
                <div className="size-14 rounded-full bg-muted flex items-center justify-center">
                  <Plus className="size-7 text-primary" />
                </div>
                <p className="text-sm font-medium">{tp('addFirstEpisode')}</p>
                <p className="text-xs opacity-70">{tp('clickToStartEpisode')}</p>
              </CardContent>
            </Card>
          </div>
        ) : null}
        </main>
        )}

        {/* ── Collaboration Sidebar ── */}
        {collabOpen && (
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 320, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="border-l border-border/50 bg-background shrink-0 overflow-hidden"
          >
            <div className="w-80 h-full flex flex-col">
              <div className="flex items-center justify-between px-3 py-2 border-b border-border/50">
                <h3 className="text-sm font-medium">{tp('teamCollab')}</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  className="size-6 p-0"
                  onClick={() => setCollabOpen(false)}
                >
                  <X className="size-3.5" />
                </Button>
              </div>
              <div className="flex-1 overflow-hidden p-2">
                <CollaborationPanel
                  dramaId={drama?.id ?? ''}
                  episodes={drama?.episodes?.map((ep) => ({
                    id: ep.id,
                    title: ep.title,
                    episodeNumber: ep.episodeNumber,
                  })) ?? []}
                />
              </div>
            </div>
          </motion.aside>
        )}
      </div>

      {/* ── Add Episode Dialog ─────────────────────────────── */}
      <Dialog open={addEpOpen} onOpenChange={setAddEpOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tp('addEpisodeTitle')}</DialogTitle>
            <DialogDescription>{tp('addEpisodeDesc', { title: drama?.title ?? '' })}</DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-2">
            <label className="text-sm font-medium">{tp('episodeTitleOptional')}</label>
            <Input
              placeholder={tp('episodeTitlePlaceholder')}
              value={newEpTitle}
              onChange={(e) => setNewEpTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddEpisode()}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddEpOpen(false)}>
              {tc('cancel')}
            </Button>
            <Button onClick={handleAddEpisode} disabled={adding}>
              {adding ? tc('addingShort') : tc('create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Cost Stats Dialog ────────────────────────────── */}
      {drama && (
        <CostStatsPanel
          dramaId={drama.id}
          open={costStatsOpen}
          onOpenChange={setCostStatsOpen}
        />
      )}

      {/* ── Default Lock Config Dialog ─────────────────────── */}
      <Dialog open={lockSettingsOpen} onOpenChange={setLockSettingsOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="size-4 text-amber-500" />
              {tp('projectAiConfigLock')}
            </DialogTitle>
            <DialogDescription>
              {tp('projectAiConfigLockDesc')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <p className="text-xs text-muted-foreground">
              {tp('lockConfigTip')}
            </p>
            <Separator />

            <div className="space-y-3">
              {/* LLM */}
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium w-16 shrink-0">LLM</span>
                <ModelSelector
                  category="llm"
                  value={defaultLockConfig.llm || ''}
                  onChange={(m) => setDefaultLockConfig((prev) => ({ ...prev, llm: m || undefined }))}
                />
                {defaultLockConfig.llm && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="size-6 p-0"
                    onClick={() => setDefaultLockConfig((prev) => { const next = { ...prev }; delete next.llm; return next })}
                  >
                    ×
                  </Button>
                )}
              </div>

              {/* Image */}
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium w-16 shrink-0">{tc('edit')}</span>
                <ModelSelector
                  category="image"
                  value={defaultLockConfig.image || ''}
                  onChange={(m) => setDefaultLockConfig((prev) => ({ ...prev, image: m || undefined }))}
                />
                {defaultLockConfig.image && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="size-6 p-0"
                    onClick={() => setDefaultLockConfig((prev) => { const next = { ...prev }; delete next.image; return next })}
                  >
                    ×
                  </Button>
                )}
              </div>

              {/* Video */}
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium w-16 shrink-0">Video</span>
                <ModelSelector
                  category="video"
                  value={defaultLockConfig.video || ''}
                  onChange={(m) => setDefaultLockConfig((prev) => ({ ...prev, video: m || undefined }))}
                />
                {defaultLockConfig.video && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="size-6 p-0"
                    onClick={() => setDefaultLockConfig((prev) => { const next = { ...prev }; delete next.video; return next })}
                  >
                    ×
                  </Button>
                )}
              </div>

              {/* TTS */}
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium w-16 shrink-0">TTS</span>
                <ModelSelector
                  category="tts"
                  value={defaultLockConfig.tts || ''}
                  onChange={(m) => setDefaultLockConfig((prev) => ({ ...prev, tts: m || undefined }))}
                />
                {defaultLockConfig.tts && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="size-6 p-0"
                    onClick={() => setDefaultLockConfig((prev) => { const next = { ...prev }; delete next.tts; return next })}
                  >
                    ×
                  </Button>
                )}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setLockSettingsOpen(false)}>
              {tc('cancel')}
            </Button>
            <Button onClick={handleSaveDefaultLockConfig} disabled={savingLockConfig}>
              {savingLockConfig ? tc('saving') : tc('save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Import from Library Dialog ────────────────────── */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Library className="size-5 text-primary" />
              {tp('importFromLibrary')}
            </DialogTitle>
            <DialogDescription>
              {tp('importFromLibrary')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {/* Filters */}
            <div className="flex items-center gap-2">
              <Select value={importCategory} onValueChange={setImportCategory}>
                <SelectTrigger className="w-28 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{tc('all')}</SelectItem>
                  <SelectItem value="character">{tp('character')}</SelectItem>
                  <SelectItem value="scene">{tp('scene')}</SelectItem>
                  <SelectItem value="prop">{tp('prop')}</SelectItem>
                </SelectContent>
              </Select>
              <Input
                placeholder={tp('searchAssets')}
                value={importSearch}
                onChange={(e) => setImportSearch(e.target.value)}
                className="h-8 text-xs"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setImportLoading(true)
                    api.assets.list({
                      category: importCategory !== 'all' ? importCategory : undefined,
                      search: importSearch || undefined,
                      limit: 50,
                    }).then((res) => {
                      setImportAssets(res.assets)
                    }).finally(() => setImportLoading(false))
                  }
                }}
              />
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                onClick={() => {
                  setImportLoading(true)
                  api.assets.list({
                    category: importCategory !== 'all' ? importCategory : undefined,
                    search: importSearch || undefined,
                    limit: 50,
                  }).then((res) => {
                    setImportAssets(res.assets)
                  }).finally(() => setImportLoading(false))
                }}
              >
                {tc('search')}
              </Button>
            </div>

            {/* Asset list */}
            <div className="max-h-[50vh] overflow-y-auto space-y-2">
              {importLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="size-5 animate-spin text-muted-foreground" />
                </div>
              ) : importAssets.length === 0 ? (
                <p className="text-center py-8 text-sm text-muted-foreground">
                  {tp('noAssetsTip')}
                </p>
              ) : (
                importAssets.map((asset) => (
                  <div
                    key={asset.id}
                    className="flex items-center gap-3 p-3 rounded-lg border border-border/50 hover:border-primary/40 transition-colors"
                  >
                    {/* Thumbnail */}
                    <div className="size-12 rounded-md overflow-hidden bg-muted/40 flex-shrink-0">
                      {asset.thumbnail ? (
                        <img src={asset.thumbnail} alt={asset.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          {asset.category === 'character' ? (
                            <Users className="size-5 text-muted-foreground/40" />
                          ) : asset.category === 'scene' ? (
                            <MapPin className="size-5 text-muted-foreground/40" />
                          ) : (
                            <Package className="size-5 text-muted-foreground/40" />
                          )}
                        </div>
                      )}
                    </div>
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{asset.name}</span>
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                          {asset.category === 'character' ? tp('character') : asset.category === 'scene' ? tp('scene') : tp('prop')}
                        </Badge>
                      </div>
                      {asset.description && (
                        <p className="text-xs text-muted-foreground truncate">{asset.description}</p>
                      )}
                    </div>
                    {/* Apply button */}
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs gap-1 flex-shrink-0"
                      disabled={applyingAssetId === asset.id}
                      onClick={async () => {
                        setApplyingAssetId(asset.id)
                        try {
                          const result = await api.assets.apply(asset.id, drama!.id)
                          toast({
                            title: tp('importSuccess'),
                            description: tp('importSuccessDesc', { name: result.assetName }),
                          })
                          fetchDrama()
                        } catch (err: any) {
                          toast({ title: tp('importFailed'), description: err.message, variant: 'destructive' })
                        } finally {
                          setApplyingAssetId(null)
                        }
                      }}
                    >
                      {applyingAssetId === asset.id ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <Download className="size-3" />
                      )}
                      {tp('importAction')}
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)}>
              {tc('close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
