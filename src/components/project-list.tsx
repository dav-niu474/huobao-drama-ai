'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { motion } from 'framer-motion'
import { useTranslations } from 'next-intl'
import { useAppStore, type Drama } from '@/lib/store'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { usePermissions } from '@/hooks/use-permissions'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
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
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Plus, Film, Users, MapPin, Clock, Trash2, Settings, Upload, Library, Store, Layers, ArrowRight, ArrowLeft, Check, Smartphone, Monitor, Search, Image as ImageIcon, Video, Mic, Clapperboard, Coins, X } from 'lucide-react'
import { UserMenu } from '@/components/user-menu'
import { LanguageSwitcher } from '@/components/language-switcher'
import { ScriptUploadDialog } from '@/components/script-upload-dialog'
import { ModelSelector } from '@/components/model-selector'
import type { AiCategory } from '@/lib/api'

// ── helpers ──────────────────────────────────────────────────

const GENRE_KEYS = ['genreUrban', 'genreAncient', 'genreMystery', 'genreScifi', 'genreSweet', 'genreRevenge', 'genreInspirational', 'genreCampus'] as const
const GENRE_VALUES = ['都市', '古装', '悬疑', '科幻', '甜宠', '复仇', '励志', '校园']
const STYLE_ENTRIES: [string, string][] = [
  ['realistic', 'styleRealistic'],
  ['anime', 'styleAnime'],
  ['cinematic', 'styleCinematic'],
  ['comic', 'styleComic'],
  ['watercolor', 'styleWatercolor'],
  ['3d', 'style3d'],
]
const DURATION_OPTIONS = ['90s', '120s', '180s', '300s'] as const
const DURATION_KEYS = ['duration90s', 'duration120s', 'duration180s', 'duration300s'] as const
const PLATFORM_ENTRIES: [string, string][] = [
  ['douyin', 'platformDouyin'],
  ['kuaishou', 'platformKuaishou'],
  ['wechat', 'platformWechat'],
  ['longvideo', 'platformLongvideo'],
]

function relativeTime(dateStr: string, t: any): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diff = Math.max(0, now - then)
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return t('justNow')
  if (minutes < 60) return t('minutesAgo', { count: minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return t('hoursAgo', { count: hours })
  const days = Math.floor(hours / 24)
  if (days < 30) return t('daysAgo', { count: days })
  const months = Math.floor(days / 30)
  if (months < 12) return t('monthsAgo', { count: months })
  return t('yearsAgo', { count: Math.floor(months / 12) })
}

function getStyleLabel(value: string, t: any): string {
  const key = STYLE_ENTRIES.find(([v]) => v === value)?.[1]
  return key ? t(key) : value
}

// ── film strip sprocket decoration ───────────────────────────

function FilmStripSprockets() {
  return (
    <div className="flex items-center justify-between px-3 py-1.5 bg-muted/40 rounded-t-lg">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="w-2.5 h-3.5 rounded-[2px] bg-border/60"
        />
      ))}
    </div>
  )
}

// ── production progress computation (card) ───────────────

function computeCardProgress(drama: Drama): {
  overallPercent: number
  scriptPct: number
  footagePct: number
} {
  const p = drama.progress
  const epCount = drama._count?.episodes ?? 0
  if (!p || (epCount === 0 && p.storyboards === 0)) {
    return { overallPercent: 0, scriptPct: 0, footagePct: 0 }
  }
  // 剧本完成率
  const scriptPct = epCount > 0 ? p.scriptedEpisodes / epCount : 0
  // 素材完成率：镜头图 + 视频 + 合成 三段均分（与 ComposePanel 的 pipelinePercent 口径一致）
  const footagePct = p.storyboards > 0
    ? (p.shotsWithImage + p.shotsWithVideo + p.shotsComposed) / (p.storyboards * 3)
    : 0
  const overallPercent = Math.round(((scriptPct + footagePct) / 2) * 100)
  return {
    overallPercent: Math.min(100, overallPercent),
    scriptPct: Math.round(scriptPct * 100),
    footagePct: Math.round(footagePct * 100),
  }
}

// ── project card ─────────────────────────────────────────────

function ProjectCard({
  drama,
  onClick,
  onDelete,
  tc,
  tp,
}: {
  drama: Drama
  onClick: () => void
  onDelete: () => void
  tc: any  // common namespace
  tp: any  // project namespace
}) {
  const [hovered, setHovered] = useState(false)

  const charCount = drama._count?.characters ?? 0
  const sceneCount = drama._count?.scenes ?? 0
  const epCount = drama._count?.episodes ?? 0
  const p = drama.progress
  const { overallPercent, scriptPct, footagePct } = computeCardProgress(drama)
  const hasProgressData = !!p && (epCount > 0 || p.storyboards > 0)

  return (
    <motion.div
      whileHover={{ y: -4 }}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
    >
      <Card
        className="cursor-pointer group relative overflow-hidden border-border/60 hover:border-primary/60 hover:shadow-[0_0_16px_oklch(0.72_0.15_75/0.2)] transition-all duration-300 py-0 gap-0"
        onClick={onClick}
      >
        <FilmStripSprockets />
        <CardContent className="p-4 pt-3 flex flex-col gap-3">
          {/* Title */}
          <h3 className="text-base font-semibold leading-snug line-clamp-2 pr-6">
            {drama.title}
          </h3>

          {/* Tags + cost */}
          <div className="flex flex-wrap gap-1.5 items-center">
            <Badge variant="secondary" className="text-[11px] px-2 py-0">
              {drama.genre}
            </Badge>
            <Badge variant="outline" className="text-[11px] px-2 py-0">
              {getStyleLabel(drama.style, tp)}
            </Badge>
            {p && p.costCredits > 0 && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-0.5 text-amber-600 border-amber-500/30 bg-amber-500/5 ml-auto">
                <Coins className="size-2.5" />
                {p.costCredits}
              </Badge>
            )}
          </div>

          {/* Meta */}
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Users className="size-3" />{charCount}
            </span>
            <span className="flex items-center gap-1">
              <MapPin className="size-3" />{sceneCount}
            </span>
            <span className="flex items-center gap-1">
              <Film className="size-3" />{epCount}{tc('episodes')}
            </span>
          </div>

          {/* Production progress (real aggregates) */}
          {hasProgressData && (
            <div className="space-y-1.5">
              <Progress value={overallPercent} className="h-1.5" />
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground min-w-0">
                  <span className={`flex items-center gap-0.5 ${scriptPct === 100 ? 'text-emerald-600 font-medium' : ''}`}>
                    <Film className="size-2.5" />
                    {tp('scriptDone', { done: p?.scriptedEpisodes ?? 0, total: epCount })}
                  </span>
                  {p && p.storyboards > 0 && (
                    <>
                      <span className={p.shotsWithVideo === p.storyboards ? 'text-emerald-600 font-medium' : ''}>
                        <ImageIcon className="size-2.5 inline" /> {p.shotsWithImage}
                        <Video className="size-2.5 inline ml-1" /> {p.shotsWithVideo}
                        <Clapperboard className="size-2.5 inline ml-1" /> {p.shotsComposed}
                      </span>
                    </>
                  )}
                </div>
                <span className="text-[10px] text-muted-foreground shrink-0">
                  {tp('percentComplete', { percent: overallPercent })}
                </span>
              </div>
              {p && p.episodesWithVideo > 0 && (
                <p className="text-[10px] text-emerald-600/80">
                  {tp('episodesWithVideo', { count: p.episodesWithVideo })}
                </p>
              )}
            </div>
          )}

          {/* Time */}
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Clock className="size-3" />
            <span>{relativeTime(drama.updatedAt, tc)}</span>
          </div>
        </CardContent>

        {/* Delete button */}
        <Button
          variant="ghost"
          size="icon"
          className={`absolute top-2 right-2 size-7 text-muted-foreground hover:text-destructive transition-opacity ${
            hovered ? 'opacity-100' : 'opacity-0'
          }`}
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </Card>
    </motion.div>
  )
}

// ── main component ───────────────────────────────────────────

export function ProjectListView() {
const { dramas, setDramas, navigateToProject, navigateToSettings, navigateToAssetLibrary, navigateToMarketplace, navigateToSeries, navigateToEpisode, setLoading, loading } = useAppStore()
  const { toast } = useToast()
  const perms = usePermissions()
  const tc = useTranslations('common')
  const tp = useTranslations('project')
  const tn = useTranslations('nav')

  // create dialog — 3-step wizard state
  const [createOpen, setCreateOpen] = useState(false)
  const [createStep, setCreateStep] = useState(0) // 0=basics, 1=models, 2=style
  const [newProjectName, setNewProjectName] = useState('')
  const [contentMode, setContentMode] = useState<'drama' | 'narration' | 'ad'>('drama')
  const [aspectRatio, setAspectRatio] = useState<'9:16' | '16:9'>('9:16')
  const [totalEpisodes, setTotalEpisodes] = useState(5)
  const [episodeDuration, setEpisodeDuration] = useState('120s')
  const [newGenre, setNewGenre] = useState('都市')
  const [newStyle, setNewStyle] = useState('realistic')
  const [targetPlatform, setTargetPlatform] = useState('douyin')
  // model selections
  const [modelLlm, setModelLlm] = useState('')
  const [modelImage, setModelImage] = useState('')
  const [modelVideo, setModelVideo] = useState('')
  const [modelTts, setModelTts] = useState('')
  const [creating, setCreating] = useState(false)

  // upload dialog
  const [uploadOpen, setUploadOpen] = useState(false)

  // delete dialog
  const [deleteTarget, setDeleteTarget] = useState<Drama | null>(null)
  const [deleting, setDeleting] = useState(false)

  // search / filter / sort
  const [searchQuery, setSearchQuery] = useState('')
  const [genreFilter, setGenreFilter] = useState('all')
  const [sortBy, setSortBy] = useState<'updatedAt' | 'createdAt' | 'progress' | 'cost'>('updatedAt')

  const genreOptions = useMemo(() => {
    const set = new Set<string>()
    for (const d of dramas) {
      if (d.genre) set.add(d.genre)
    }
    return Array.from(set)
  }, [dramas])

  const visibleDramas = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    let list = dramas
    if (q) {
      list = list.filter(
        (d) =>
          d.title.toLowerCase().includes(q) ||
          (d.description || '').toLowerCase().includes(q)
      )
    }
    if (genreFilter !== 'all') {
      list = list.filter((d) => d.genre === genreFilter)
    }
    const progressOf = (d: Drama) => computeCardProgress(d).overallPercent
    const costOf = (d: Drama) => d.progress?.costCredits ?? 0
    return [...list].sort((a, b) => {
      switch (sortBy) {
        case 'createdAt':
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        case 'progress':
          return progressOf(b) - progressOf(a)
        case 'cost':
          return costOf(b) - costOf(a)
        case 'updatedAt':
        default:
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      }
    })
  }, [dramas, searchQuery, genreFilter, sortBy])

  // fetch dramas
  const fetchDramas = useCallback(async () => {
    setLoading(true)
    try {
      // Ensure database is initialized before fetching
      await api.init()
      const list = await api.dramas.list()
      setDramas(list)
    } catch (err) {
      toast({ title: tp('loadFailed'), description: String(err), variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [setDramas, setLoading, toast])

  useEffect(() => {
    fetchDramas()
  }, [fetchDramas])

  // reset wizard fields to defaults
  const resetWizard = useCallback(() => {
    setCreateStep(0)
    setNewProjectName('')
    setContentMode('drama')
    setAspectRatio('9:16')
    setTotalEpisodes(5)
    setEpisodeDuration('120s')
    setNewGenre('都市')
    setNewStyle('realistic')
    setTargetPlatform('douyin')
    setModelLlm('')
    setModelImage('')
    setModelVideo('')
    setModelTts('')
  }, [])

  // create project
  const handleCreate = async () => {
    if (!newProjectName.trim()) return
    // Check project limit
    if (!perms.canCreateProject(dramas.length)) {
      toast({
        title: tp('projectLimitReached'),
        description: tp('projectLimitDescription', { max: perms.maxProjects }),
        variant: 'destructive',
      })
      return
    }
    setCreating(true)
    try {
      const result = await api.dramas.create({
        title: newProjectName.trim(),
        genre: newGenre,
        style: newStyle,
        totalEpisodes,
      })
      const dramaId = result.id

      // Persist project config — models + metadata are stored in defaultLockedConfig as JSON.
      // Existing consumers only read llm/image/video/tts, so extra keys are forward-compatible.
      const lockedConfig: Record<string, string> = {}
      if (modelLlm) lockedConfig.llm = modelLlm
      if (modelImage) lockedConfig.image = modelImage
      if (modelVideo) lockedConfig.video = modelVideo
      if (modelTts) lockedConfig.tts = modelTts
      const projectMeta: Record<string, unknown> = {
        ...lockedConfig,
        contentMode,
        aspectRatio,
        episodeDuration,
        targetPlatform,
      }
      try {
        await api.dramas.update(dramaId, {
          totalEpisodes,
          defaultLockedConfig: JSON.stringify(projectMeta),
        })
      } catch {
        // Non-fatal — the drama is already created; the user can configure later.
      }

      // Auto-create the first episode so the user lands directly in the pipeline.
      let episodeId: string | undefined
      try {
        const ep = await api.episodes.create(dramaId, { title: tp('firstEpisodeTitle') })
        episodeId = ep.id
      } catch {
        // If episode creation fails, fall back to existing project-detail view.
      }

      toast({ title: tp('createSuccess') })
      setCreateOpen(false)
      resetWizard()

      // Always navigate directly to episode workspace (pipeline production)
      // — skip project detail page entirely
      if (episodeId) {
        navigateToEpisode(dramaId, episodeId)
      } else {
        // If episode creation failed, go to project detail as fallback
        navigateToProject(dramaId)
      }
    } catch (err) {
      toast({ title: tp('createFailed'), description: String(err), variant: 'destructive' })
    } finally {
      setCreating(false)
    }
  }

  // delete project
  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await api.dramas.delete(deleteTarget.id)
      toast({ title: tp('projectDeleted') })
      setDeleteTarget(null)
      fetchDramas()
    } catch (err) {
      toast({ title: tp('deleteFailed'), description: String(err), variant: 'destructive' })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-border/50 bg-background/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Film className="size-6 text-primary" />
            <h1 className="text-xl sm:text-2xl font-bold">{tn('appName')}</h1>
            {dramas.length > 0 && (
              <Badge variant="outline" className="text-xs text-muted-foreground border-border/60">
                {tp('projectCount', { count: dramas.length })}
              </Badge>
            )}
            {perms.role !== 'pro' && perms.role !== 'admin' && perms.maxProjects > 0 && (
              <Badge variant="outline" className="text-[10px] text-amber-500 border-amber-500/30 bg-amber-500/10">
                {tp('projectLimit', { current: dramas.length, max: perms.maxProjects })}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={navigateToAssetLibrary} title={tn('assetLibrary')}>
              <Library className="size-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={navigateToMarketplace} title={tn('marketplace')}>
              <Store className="size-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={navigateToSeries} title={tn('series')}>
              <Layers className="size-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={navigateToSettings} title={tn('settings')}>
              <Settings className="size-4" />
            </Button>
            <LanguageSwitcher />
            <Button
              variant="outline"
              onClick={() => setUploadOpen(true)}
              disabled={!perms.canCreateProject(dramas.length)}
              className="border-primary/40 text-primary hover:bg-primary/10"
            >
              <Upload className="size-4" />
              <span className="hidden sm:inline">{tn('uploadScript')}</span>
            </Button>
            <Button
              onClick={() => { resetWizard(); setCreateOpen(true) }}
              className="amber-glow"
              disabled={!perms.canCreateProject(dramas.length)}
            >
              <Plus className="size-4" />
              <span className="hidden sm:inline">{tn('newProject')}</span>
            </Button>
            <UserMenu />
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-6">
        {loading && dramas.length === 0 ? (
          /* Loading skeleton */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} className="overflow-hidden py-0 gap-0">
                <div className="h-4 shimmer" />
                <CardContent className="p-4 pt-3 space-y-3">
                  <div className="h-5 w-3/4 shimmer rounded" />
                  <div className="flex gap-2">
                    <div className="h-5 w-12 shimmer rounded-full" />
                    <div className="h-5 w-12 shimmer rounded-full" />
                  </div>
                  <div className="h-4 w-1/2 shimmer rounded" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : dramas.length === 0 ? (
          /* Empty state */
          <div className="flex items-center justify-center py-24">
            <Card
              className="w-full max-w-sm border-dashed border-2 border-border/50 hover:border-primary/40 transition-colors cursor-pointer py-0 gap-0"
              onClick={() => { resetWizard(); setCreateOpen(true) }}
            >
              <CardContent className="p-8 flex flex-col items-center gap-4 text-muted-foreground">
                <div className="size-14 rounded-full bg-muted flex items-center justify-center">
                  <Plus className="size-7 text-primary" />
                </div>
                <p className="text-sm font-medium">{tp('firstProject')}</p>
                <p className="text-xs opacity-70">{tp('clickToStart')}</p>
              </CardContent>
            </Card>
          </div>
        ) : (
          <>
            {/* ── Search / filter / sort toolbar ── */}
            <div className="flex items-center gap-2 flex-wrap mb-5">
              <div className="relative flex-1 min-w-48 max-w-xs">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={tp('searchPlaceholder')}
                  className="h-8 pl-8 pr-7 text-xs bg-background"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label="Clear search"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>
              <Select value={genreFilter} onValueChange={setGenreFilter}>
                <SelectTrigger className="h-8 w-32 text-xs">
                  <SelectValue placeholder={tp('allGenres')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">{tp('allGenres')}</SelectItem>
                  {genreOptions.map((g) => (
                    <SelectItem key={g} value={g} className="text-xs">{g}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
                <SelectTrigger className="h-8 w-36 text-xs">
                  <SelectValue placeholder={tp('sortBy')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="updatedAt" className="text-xs">{tp('sortUpdatedAt')}</SelectItem>
                  <SelectItem value="createdAt" className="text-xs">{tp('sortCreatedAt')}</SelectItem>
                  <SelectItem value="progress" className="text-xs">{tp('sortProgress')}</SelectItem>
                  <SelectItem value="cost" className="text-xs">{tp('sortCost')}</SelectItem>
                </SelectContent>
              </Select>
              {(searchQuery || genreFilter !== 'all') && (
                <span className="text-[11px] text-muted-foreground">
                  {visibleDramas.length} / {dramas.length}
                </span>
              )}
            </div>

            {visibleDramas.length === 0 ? (
              /* No results after filtering */
              <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
                <Search className="size-8 opacity-30" />
                <p className="text-sm">{tp('noResults')}</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setSearchQuery(''); setGenreFilter('all') }}
                >
                  {tp('allGenres')}
                </Button>
              </div>
            ) : (
              /* Project grid */
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                {visibleDramas.map((drama) => (
                  <ProjectCard
                    key={drama.id}
                    drama={drama}
                    onClick={async () => {
                      // Navigate to the most recent episode without side effects.
                      // If the project has no episodes yet, go to the project
                      // overview (novel import / episode creation live there)
                      // instead of silently creating "第1集" on a stray click.
                      try {
                        const eps = await api.episodes.list(drama.id)
                        if (eps && eps.length > 0) {
                          navigateToEpisode(drama.id, eps[0].id)
                        } else {
                          navigateToProject(drama.id)
                        }
                      } catch {
                        // Fallback: go to project detail if episode listing fails
                        navigateToProject(drama.id)
                      }
                    }}
                    onDelete={() => setDeleteTarget(drama)}
                    tc={tc}
                    tp={tp}
                  />
                ))}

                {/* Add new card (subtle) */}
                <Card
                  className="border-dashed border-2 border-border/30 hover:border-primary/40 transition-colors cursor-pointer py-0 gap-0"
                  onClick={() => { resetWizard(); setCreateOpen(true) }}
                >
                  <CardContent className="p-6 flex flex-col items-center justify-center gap-3 text-muted-foreground min-h-[200px]">
                    <div className="size-12 rounded-full bg-muted/60 flex items-center justify-center">
                      <Plus className="size-6 text-primary/60" />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-medium">{tp('newProjectShort')}</p>
                      <p className="text-[11px] opacity-60 mt-0.5">{tc('create')}</p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </>
        )}
      </main>

      {/* ── Create Dialog — 3-step wizard ─────────────────── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{tp('newDramaProject')}</DialogTitle>
            <DialogDescription>{tp('newDramaDescription')}</DialogDescription>
          </DialogHeader>

          {/* Step indicator */}
          <div className="flex items-center gap-3 mb-2">
            {(['stepBasics', 'stepModels', 'stepStyle'] as const).map((key, idx) => (
              <div key={key} className="flex items-center gap-2">
                <div className={`size-6 rounded-full flex items-center justify-center text-xs font-medium transition-colors ${
                  idx === createStep
                    ? 'bg-primary text-primary-foreground'
                    : idx < createStep
                    ? 'bg-emerald-500 text-white'
                    : 'bg-muted text-muted-foreground'
                }`}>
                  {idx < createStep ? <Check className="size-3.5" /> : idx + 1}
                </div>
                <div className="flex flex-col leading-tight">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {tp('stepIndicator', { number: String(idx + 1).padStart(2, '0') })}
                  </span>
                  <span className={`text-xs ${idx === createStep ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                    {tp(key)}
                  </span>
                </div>
                {idx < 2 && <div className="w-8 h-px bg-border mx-1" />}
              </div>
            ))}
          </div>

          {/* Step content */}
          <div className="min-h-[280px] py-2">
            {createStep === 0 && (
              <div className="space-y-4">
                {/* Project Title */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    {tp('projectTitle')} <span className="text-destructive">*</span>
                  </label>
                  <Input
                    placeholder={tp('projectTitlePlaceholder')}
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newProjectName.trim()) setCreateStep(1)
                    }}
                    autoFocus
                  />
                </div>

                {/* Content Mode */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">{tp('contentMode')}</label>
                  <div className="grid grid-cols-3 gap-1.5 p-1 rounded-lg bg-muted/60">
                    {([
                      ['drama', 'modeDrama'],
                      ['narration', 'modeNarration'],
                      ['ad', 'modeAd'],
                    ] as const).map(([value, key]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setContentMode(value)}
                        className={`text-xs py-2 rounded-md transition-colors ${
                          contentMode === value
                            ? 'bg-background text-foreground shadow-sm font-medium'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {tp(key)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Aspect Ratio */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">{tp('aspectRatio')}</label>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      ['9:16', 'portrait', Smartphone],
                      ['16:9', 'landscape', Monitor],
                    ] as const).map(([value, key, Icon]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setAspectRatio(value)}
                        className={`flex items-center justify-center gap-2 py-2.5 rounded-md border text-sm transition-colors ${
                          aspectRatio === value
                            ? 'border-primary bg-primary/10 text-primary font-medium'
                            : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted/40'
                        }`}
                      >
                        <Icon className="size-4" />
                        {tp(key)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Total Episodes + Episode Duration */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">{tp('totalEpisodes')}</label>
                    <Input
                      type="number"
                      min={1}
                      max={999}
                      value={totalEpisodes}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10)
                        setTotalEpisodes(Number.isFinite(v) && v > 0 ? v : 1)
                      }}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">{tp('episodeDuration')}</label>
                    <Select value={episodeDuration} onValueChange={setEpisodeDuration}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DURATION_OPTIONS.map((value, i) => (
                          <SelectItem key={value} value={value}>
                            {tp(DURATION_KEYS[i])}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            )}

            {createStep === 1 && (
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-medium">{tp('models')}</h4>
                  <p className="text-xs text-muted-foreground mt-0.5">{tp('modelsDescription')}</p>
                </div>
                {([
                  ['llm', modelLlm, setModelLlm],
                  ['image', modelImage, setModelImage],
                  ['video', modelVideo, setModelVideo],
                  ['tts', modelTts, setModelTts],
                ] as const).map(([category, value, setter]) => (
                  <div key={category} className="flex items-center justify-between gap-3 py-2 border-b border-border/40 last:border-0">
                    <div className="flex flex-col">
                      <span className="text-sm font-medium capitalize">{category}</span>
                    </div>
                    <ModelSelector
                      category={category as AiCategory}
                      value={value}
                      onChange={setter}
                    />
                  </div>
                ))}
              </div>
            )}

            {createStep === 2 && (
              <div className="space-y-4">
                {/* Genre */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">{tp('genre')}</label>
                  <Select value={newGenre} onValueChange={setNewGenre}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {GENRE_KEYS.map((key, i) => (
                        <SelectItem key={GENRE_VALUES[i]} value={GENRE_VALUES[i]}>
                          {tp(key)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Visual Style */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">{tp('visualStyle')}</label>
                  <Select value={newStyle} onValueChange={setNewStyle}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STYLE_ENTRIES.map(([value, key]) => (
                        <SelectItem key={value} value={value}>
                          {tp(key)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Target Platform */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">{tp('targetPlatform')}</label>
                  <Select value={targetPlatform} onValueChange={setTargetPlatform}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PLATFORM_ENTRIES.map(([value, key]) => (
                        <SelectItem key={value} value={value}>
                          {tp(key)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              {tc('cancel')}
            </Button>
            {createStep > 0 && (
              <Button
                variant="outline"
                onClick={() => setCreateStep((s) => Math.max(0, s - 1))}
                disabled={creating}
              >
                <ArrowLeft className="size-4" />
                {tc('back')}
              </Button>
            )}
            {createStep < 2 ? (
              <Button
                onClick={() => setCreateStep((s) => Math.min(2, s + 1))}
                disabled={createStep === 0 ? !newProjectName.trim() : false}
              >
                {tc('next')}
                <ArrowRight className="size-4" />
              </Button>
            ) : (
              <Button onClick={handleCreate} disabled={!newProjectName.trim() || creating}>
                {creating ? tc('creating') : tp('createProject')}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Script Upload Dialog ───────────────────────────── */}
      <ScriptUploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onSuccess={fetchDramas}
      />

      {/* ── Delete Confirmation Dialog ──────────────────────── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tp('deleteConfirm')}</AlertDialogTitle>
            <AlertDialogDescription>
              {tp('deleteWarning', { title: deleteTarget?.title ?? '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {deleting ? tc('deleting') : tp('deleteConfirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
