'use client'

import { useEffect, useState, useCallback } from 'react'
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
import { Plus, Film, Users, MapPin, Clock, Trash2, Settings, Upload, Library, Store, Layers } from 'lucide-react'
import { UserMenu } from '@/components/user-menu'
import { LanguageSwitcher } from '@/components/language-switcher'
import { ScriptUploadDialog } from '@/components/script-upload-dialog'

// ── helpers ──────────────────────────────────────────────────

const GENRE_VALUES = ['都市', '古装', '悬疑', '科幻', '甜宠', '复仇', '励志', '校园']
const STYLE_ENTRIES: [string, string][] = [
  ['realistic', 'styleRealistic'],
  ['anime', 'styleAnime'],
  ['cinematic', 'styleCinematic'],
  ['comic', 'styleComic'],
  ['watercolor', 'styleWatercolor'],
  ['3d', 'style3d'],
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

// ── project card ─────────────────────────────────────────────

function ProjectCard({
  drama,
  onClick,
  onDelete,
  t,
}: {
  drama: Drama
  onClick: () => void
  onDelete: () => void
  t: any
}) {
  const [hovered, setHovered] = useState(false)

  const charCount = drama._count?.characters ?? 0
  const sceneCount = drama._count?.scenes ?? 0
  const epCount = drama._count?.episodes ?? 0
  const totalEps = drama.totalEpisodes || 0
  const progressPercent = totalEps > 0 ? Math.round((epCount / totalEps) * 100) : 0

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

          {/* Tags */}
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="secondary" className="text-[11px] px-2 py-0">
              {drama.genre}
            </Badge>
            <Badge variant="outline" className="text-[11px] px-2 py-0">
              {getStyleLabel(drama.style, t)}
            </Badge>
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
              <Film className="size-3" />{epCount}{t('common.episodes')}
            </span>
          </div>

          {/* Progress */}
          {totalEps > 0 && (
            <div className="space-y-1">
              <Progress value={progressPercent} className="h-1.5" />
              <p className="text-[10px] text-muted-foreground text-right">
                {t('project.percentComplete', { percent: progressPercent })}
              </p>
            </div>
          )}

          {/* Time */}
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Clock className="size-3" />
            <span>{relativeTime(drama.updatedAt, t)}</span>
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
const { dramas, setDramas, navigateToProject, navigateToSettings, navigateToAssetLibrary, navigateToMarketplace, navigateToSeries, setLoading, loading } = useAppStore()
  const { toast } = useToast()
  const perms = usePermissions()
  const tc = useTranslations('common')
  const tp = useTranslations('project')
  const tn = useTranslations('nav')

  // create dialog
  const [createOpen, setCreateOpen] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newGenre, setNewGenre] = useState('都市')
  const [newStyle, setNewStyle] = useState('realistic')
  const [creating, setCreating] = useState(false)

  // upload dialog
  const [uploadOpen, setUploadOpen] = useState(false)

  // delete dialog
  const [deleteTarget, setDeleteTarget] = useState<Drama | null>(null)
  const [deleting, setDeleting] = useState(false)

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

  // create project
  const handleCreate = async () => {
    if (!newTitle.trim()) return
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
      await api.dramas.create({
        title: newTitle.trim(),
        genre: newGenre,
        style: newStyle,
      })
      toast({ title: tp('createSuccess') })
      setCreateOpen(false)
      setNewTitle('')
      setNewGenre('都市')
      setNewStyle('realistic')
      fetchDramas()
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
              <Badge variant="secondary" className="text-xs">
                {tp('projectCount', { count: dramas.length })}
              </Badge>
            )}
            {perms.role !== 'pro' && perms.role !== 'admin' && (
              <Badge variant="outline" className="text-[10px] text-amber-500 border-amber-500/30 bg-amber-500/10">
                {perms.maxProjects > 0 ? tp('projectLimit', { current: dramas.length, max: perms.maxProjects }) : ''}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={navigateToAssetLibrary} title="资产库">
              <Library className="size-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={navigateToMarketplace} title="角色市场">
              <Store className="size-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={navigateToSeries} title="系列管理">
              <Layers className="size-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={navigateToSettings} title="设置">
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
              onClick={() => setCreateOpen(true)}
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
              onClick={() => setCreateOpen(true)}
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
          /* Project grid */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {dramas.map((drama) => (
              <ProjectCard
                key={drama.id}
                drama={drama}
                onClick={() => navigateToProject(drama.id)}
                onDelete={() => setDeleteTarget(drama)}
                t={tp}
              />
            ))}

            {/* Add new card (subtle) */}
            <Card
              className="border-dashed border-2 border-border/30 hover:border-primary/40 transition-colors cursor-pointer py-0 gap-0"
              onClick={() => setCreateOpen(true)}
            >
              <CardContent className="p-6 flex flex-col items-center justify-center gap-2 text-muted-foreground min-h-[200px]">
                <Plus className="size-6 text-primary/60" />
                <p className="text-xs">{tp('newProjectShort')}</p>
              </CardContent>
            </Card>
          </div>
        )}
      </main>

      {/* ── Create Dialog ──────────────────────────────────── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tp('newDramaProject')}</DialogTitle>
            <DialogDescription>{tp('newDramaDescription')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">
                {tp('projectName')} <span className="text-destructive">*</span>
              </label>
              <Input
                placeholder={tp('enterDramaName')}
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">{tp('genre')}</label>
              <Select value={newGenre} onValueChange={setNewGenre}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GENRE_VALUES.map((g) => (
                    <SelectItem key={g} value={g}>
                      {g}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

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
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              {tc('cancel')}
            </Button>
            <Button onClick={handleCreate} disabled={!newTitle.trim() || creating}>
              {creating ? tc('creating') : tc('create')}
            </Button>
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
