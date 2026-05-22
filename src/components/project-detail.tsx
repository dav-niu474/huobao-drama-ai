'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
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
import { ArrowLeft, Plus, Film, Users, MapPin, ChevronRight, Clock, Pencil, Lock, LockOpen, Settings2, Loader2, Coins } from 'lucide-react'
import { UserMenu } from '@/components/user-menu'
import { ModelSelector } from '@/components/model-selector'
import { Separator } from '@/components/ui/separator'
import { CostStatsPanel } from '@/components/episode/cost-stats-panel'

// ── helpers ──────────────────────────────────────────────────

const STYLE_LABELS: Record<string, string> = {
  realistic: '写实',
  anime: '动漫',
  cinematic: '电影感',
  comic: '漫画',
  watercolor: '水彩',
  '3d': '3D',
}

function scriptStatusLabel(status: string): { label: string; color: string } {
  switch (status) {
    case 'completed':
      return { label: '已完成', color: 'bg-emerald-500' }
    case 'processing':
      return { label: '生成中', color: 'bg-amber-500' }
    case 'failed':
      return { label: '失败', color: 'bg-red-500' }
    default:
      return { label: '待创作', color: 'bg-zinc-500' }
  }
}

function relativeTime(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diff = Math.max(0, now - then)
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes}分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}小时前`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}天前`
  return `${Math.floor(days / 30)}个月前`
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
}: {
  episode: Episode
  onClick: () => void
}) {
  const status = scriptStatusLabel(episode.scriptStatus)
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
                {episode.title || `第${episode.episodeNumber}集`}
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
                  {storyboardCount}镜
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

  // Fetch drama detail
  const fetchDrama = useCallback(async () => {
    if (!selectedDramaId) return
    setLoading(true)
    try {
      const detail = await api.dramas.get(selectedDramaId)
      setCurrentDrama(detail)
    } catch (err) {
      toast({ title: '加载项目详情失败', description: String(err), variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [selectedDramaId, setCurrentDrama, setLoading, toast])

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
      toast({ title: '集数已添加' })
      setAddEpOpen(false)
      setNewEpTitle('')
      fetchDrama()
    } catch (err) {
      toast({ title: '添加失败', description: String(err), variant: 'destructive' })
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
      toast({ title: '项目名称已更新' })
    } catch (err) {
      toast({ title: '更新失败', description: String(err), variant: 'destructive' })
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
      if (!res.ok) throw new Error(data.error || '操作失败')
      toast({ title: data.message || '已锁定全部集数' })
      fetchDrama()
    } catch (err) {
      toast({ title: '批量锁定失败', description: String(err), variant: 'destructive' })
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
      if (!res.ok) throw new Error(data.error || '操作失败')
      toast({ title: data.message || '已解锁全部集数' })
      fetchDrama()
    } catch (err) {
      toast({ title: '批量解锁失败', description: String(err), variant: 'destructive' })
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
      toast({ title: '项目默认AI配置已保存' })
      setLockSettingsOpen(false)
      fetchDrama()
    } catch (err) {
      toast({ title: '保存失败', description: String(err), variant: 'destructive' })
    } finally {
      setSavingLockConfig(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-border/50 bg-background/80 backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={navigateToProjects}
              className="text-muted-foreground hover:text-foreground -ml-2"
            >
              <ArrowLeft className="size-4" />
              <span className="hidden sm:inline">返回项目列表</span>
            </Button>
            <UserMenu />
          </div>

          {drama && (
            <div className="flex items-start justify-between gap-4">
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
                      <span className="text-xs text-muted-foreground animate-pulse">保存中...</span>
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
                    <Film className="size-3" />{drama.episodes?.length ?? drama._count?.episodes ?? 0}集
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCostStatsOpen(true)}
                  className="text-xs gap-1"
                >
                  <Coins className="size-3.5" />
                  <span className="hidden sm:inline">成本统计</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleOpenLockSettings}
                  className="text-xs gap-1"
                >
                  <Settings2 className="size-3.5" />
                  <span className="hidden sm:inline">AI锁定</span>
                </Button>
                <Button onClick={() => setAddEpOpen(true)} size="sm" className="amber-glow">
                  <Plus className="size-4" />
                  <span className="hidden sm:inline">添加集</span>
                </Button>
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

      {/* Episodes list */}
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
                <span>{drama.episodes.length} 集</span>
                {drama.episodes.some((ep) => isLocked(ep.lockedConfig)) && (
                  <Badge variant="secondary" className="text-[10px] gap-1 h-5">
                    <Lock className="size-2.5" />
                    {drama.episodes.filter((ep) => isLocked(ep.lockedConfig)).length} 已锁定
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
                  锁定全部
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs h-7 gap-1 text-muted-foreground hover:text-foreground"
                  onClick={handleBulkUnlock}
                  disabled={bulkLoading}
                >
                  <LockOpen className="size-3" />
                  解锁全部
                </Button>
              </div>
            </div>
            {drama.episodes
              .sort((a, b) => a.episodeNumber - b.episodeNumber)
              .map((ep) => (
                <EpisodeCard
                  key={ep.id}
                  episode={ep}
                  onClick={() => navigateToEpisode(drama.id, ep.id)}
                />
              ))}
          </div>
        ) : drama ? (
          /* Empty state */
          <div className="flex items-center justify-center py-24">
            <Card
              className="w-full max-w-sm border-dashed border-2 border-border/50 hover:border-primary/40 transition-colors cursor-pointer py-0 gap-0"
              onClick={() => setAddEpOpen(true)}
            >
              <CardContent className="p-8 flex flex-col items-center gap-4 text-muted-foreground">
                <div className="size-14 rounded-full bg-muted flex items-center justify-center">
                  <Plus className="size-7 text-primary" />
                </div>
                <p className="text-sm font-medium">添加第一集</p>
                <p className="text-xs opacity-70">点击开始创作集数</p>
              </CardContent>
            </Card>
          </div>
        ) : null}
      </main>

      {/* ── Add Episode Dialog ─────────────────────────────── */}
      <Dialog open={addEpOpen} onOpenChange={setAddEpOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>添加集</DialogTitle>
            <DialogDescription>为「{drama?.title}」添加新集数，留空将自动命名</DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-2">
            <label className="text-sm font-medium">集标题（可选）</label>
            <Input
              placeholder="留空则自动命名为「第N集」"
              value={newEpTitle}
              onChange={(e) => setNewEpTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddEpisode()}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddEpOpen(false)}>
              取消
            </Button>
            <Button onClick={handleAddEpisode} disabled={adding}>
              {adding ? '添加中...' : '创建'}
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
              项目级AI配置锁定
            </DialogTitle>
            <DialogDescription>
              设置项目的默认AI模型锁定。新建集数将自动继承此配置，「锁定全部」也会使用此配置。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <p className="text-xs text-muted-foreground">
              选择要锁定的模型后，锁定状态下的集数在执行AI操作时将强制使用锁定的模型，而非全局默认模型。留空表示不锁定该类别。
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
                <span className="text-sm font-medium w-16 shrink-0">图片</span>
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
                <span className="text-sm font-medium w-16 shrink-0">视频</span>
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
              取消
            </Button>
            <Button onClick={handleSaveDefaultLockConfig} disabled={savingLockConfig}>
              {savingLockConfig ? '保存中...' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
