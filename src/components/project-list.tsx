'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
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
import { Plus, Film, Users, MapPin, Clock, Trash2, Settings, Upload, Library } from 'lucide-react'
import { UserMenu } from '@/components/user-menu'
import { ScriptUploadDialog } from '@/components/script-upload-dialog'

// ── helpers ──────────────────────────────────────────────────

const GENRE_OPTIONS = [
  { value: '都市', label: '都市' },
  { value: '古装', label: '古装' },
  { value: '悬疑', label: '悬疑' },
  { value: '科幻', label: '科幻' },
  { value: '甜宠', label: '甜宠' },
  { value: '复仇', label: '复仇' },
  { value: '励志', label: '励志' },
  { value: '校园', label: '校园' },
]

const STYLE_OPTIONS = [
  { value: 'realistic', label: '写实' },
  { value: 'anime', label: '动漫' },
  { value: 'cinematic', label: '电影感' },
  { value: 'comic', label: '漫画' },
  { value: 'watercolor', label: '水彩' },
  { value: '3d', label: '3D' },
]

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
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}个月前`
  return `${Math.floor(months / 12)}年前`
}

function getStyleLabel(value: string): string {
  return STYLE_OPTIONS.find((o) => o.value === value)?.label ?? value
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
}: {
  drama: Drama
  onClick: () => void
  onDelete: () => void
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
              {getStyleLabel(drama.style)}
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
              <Film className="size-3" />{epCount}集
            </span>
          </div>

          {/* Progress */}
          {totalEps > 0 && (
            <div className="space-y-1">
              <Progress value={progressPercent} className="h-1.5" />
              <p className="text-[10px] text-muted-foreground text-right">
                {progressPercent}% 完成
              </p>
            </div>
          )}

          {/* Time */}
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Clock className="size-3" />
            <span>{relativeTime(drama.updatedAt)}</span>
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
  const { dramas, setDramas, navigateToProject, navigateToSettings, navigateToAssetLibrary, setLoading, loading } = useAppStore()
  const { toast } = useToast()
  const perms = usePermissions()

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
      toast({ title: '加载项目失败', description: String(err), variant: 'destructive' })
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
        title: '项目数量已达上限',
        description: `免费用户最多创建${perms.maxProjects}个项目，升级专业版可无限制创建。`,
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
      toast({ title: '项目创建成功' })
      setCreateOpen(false)
      setNewTitle('')
      setNewGenre('都市')
      setNewStyle('realistic')
      fetchDramas()
    } catch (err) {
      toast({ title: '创建失败', description: String(err), variant: 'destructive' })
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
      toast({ title: '项目已删除' })
      setDeleteTarget(null)
      fetchDramas()
    } catch (err) {
      toast({ title: '删除失败', description: String(err), variant: 'destructive' })
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
            <h1 className="text-xl sm:text-2xl font-bold">AI短剧创作平台</h1>
            {dramas.length > 0 && (
              <Badge variant="secondary" className="text-xs">
                {dramas.length} 个项目
              </Badge>
            )}
            {perms.role !== 'pro' && perms.role !== 'admin' && (
              <Badge variant="outline" className="text-[10px] text-amber-500 border-amber-500/30 bg-amber-500/10">
                {perms.maxProjects > 0 ? `${dramas.length}/${perms.maxProjects} 项目` : ''}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={navigateToAssetLibrary} title="资产库">
              <Library className="size-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={navigateToSettings} title="设置">
              <Settings className="size-4" />
            </Button>
            <Button
              variant="outline"
              onClick={() => setUploadOpen(true)}
              disabled={!perms.canCreateProject(dramas.length)}
              className="border-primary/40 text-primary hover:bg-primary/10"
            >
              <Upload className="size-4" />
              <span className="hidden sm:inline">上传剧本</span>
            </Button>
            <Button
              onClick={() => setCreateOpen(true)}
              className="amber-glow"
              disabled={!perms.canCreateProject(dramas.length)}
            >
              <Plus className="size-4" />
              <span className="hidden sm:inline">新建项目</span>
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
                <p className="text-sm font-medium">新建第一个短剧项目</p>
                <p className="text-xs opacity-70">点击开始创作</p>
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
              />
            ))}

            {/* Add new card (subtle) */}
            <Card
              className="border-dashed border-2 border-border/30 hover:border-primary/40 transition-colors cursor-pointer py-0 gap-0"
              onClick={() => setCreateOpen(true)}
            >
              <CardContent className="p-6 flex flex-col items-center justify-center gap-2 text-muted-foreground min-h-[200px]">
                <Plus className="size-6 text-primary/60" />
                <p className="text-xs">新建项目</p>
              </CardContent>
            </Card>
          </div>
        )}
      </main>

      {/* ── Create Dialog ──────────────────────────────────── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建短剧项目</DialogTitle>
            <DialogDescription>填写基本信息，开始你的短剧创作之旅</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">
                项目名称 <span className="text-destructive">*</span>
              </label>
              <Input
                placeholder="输入短剧名称"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">题材</label>
              <Select value={newGenre} onValueChange={setNewGenre}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GENRE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">视觉风格</label>
              <Select value={newStyle} onValueChange={setNewStyle}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STYLE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              取消
            </Button>
            <Button onClick={handleCreate} disabled={!newTitle.trim() || creating}>
              {creating ? '创建中...' : '创建'}
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
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除项目「{deleteTarget?.title}」吗？此操作不可撤销，所有关联的集数、角色、场景和分镜都将被删除。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {deleting ? '删除中...' : '确认删除'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
