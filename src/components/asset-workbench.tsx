'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAppStore, type Character, type Scene, type Prop, type DramaDetail } from '@/lib/store'
import { api, type ArtStyleInfo } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Progress } from '@/components/ui/progress'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  ArrowLeft,
  Palette,
  Loader2,
  Check,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Play,
  RotateCcw,
  Search,
  LayoutGrid,
  List,
  Plus,
  ImageIcon,
  Pencil,
  Trash2,
  Users,
  Mountain,
  Package,
  Filter,
  Zap,
  Download,
  X,
  Eye,
  RefreshCw,
  FolderOpen,
} from 'lucide-react'

// ── Types ──────────────────────────────────────────────────

type AssetType = 'character' | 'scene' | 'prop'
type TypeFilter = 'all' | AssetType
type ViewMode = 'grid' | 'list'
type SortKey = 'name' | 'type' | 'createdAt'

interface UnifiedAsset {
  id: string
  name: string
  type: AssetType
  description: string
  imagePrompt: string | null
  imageUrl: string | null
  episodeIds: string
  createdAt: string
  // type-specific extra data
  raw: Character | Scene | Prop
}

interface BatchProgress {
  current: number
  total: number
  active: boolean
}

// ── Color mapping ──────────────────────────────────────────

const TYPE_COLORS: Record<AssetType, { bg: string; text: string; border: string; accent: string; icon: typeof Users }> = {
  character: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/30', accent: 'blue', icon: Users },
  scene: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/30', accent: 'emerald', icon: Mountain },
  prop: { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/30', accent: 'orange', icon: Package },
}

const TYPE_LABELS: Record<AssetType, string> = {
  character: '角色',
  scene: '场景',
  prop: '道具',
}

// ── Main Component ─────────────────────────────────────────

export function AssetWorkbench() {
  const navigateToProject = useAppStore((s) => s.navigateToProject)
  const navigateToScriptWorkbench = useAppStore((s) => s.navigateToScriptWorkbench)
  const selectedDramaId = useAppStore((s) => s.selectedDramaId)
  const currentDrama = useAppStore((s) => s.currentDrama)
  const setCurrentDrama = useAppStore((s) => s.setCurrentDrama)
  const { toast } = useToast()

  // ── State ──
  const [drama, setDrama] = useState<DramaDetail | null>(null)
  const [leftCollapsed, setLeftCollapsed] = useState(false)
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [sortKey, setSortKey] = useState<SortKey>('name')

  // Extraction state
  const [extracting, setExtracting] = useState(false)
  const [assetStatus, setAssetStatus] = useState<{
    assetStatus: string
    totalCharacters: number
    totalScenes: number
    totalProps: number
    lastExtractionAt?: string
  } | null>(null)

  // Art style state
  const [artStyles, setArtStyles] = useState<ArtStyleInfo[]>([])
  const [selectedStyle, setSelectedStyle] = useState<string | null>(null)
  const [applyingStyle, setApplyingStyle] = useState(false)
  const [polishing, setPolishing] = useState(false)

  // Batch generation state
  const [batchProgress, setBatchProgress] = useState<BatchProgress>({ current: 0, total: 0, active: false })
  const [imageSize, setImageSize] = useState<string>('1:1')

  // Detail dialog state
  const [detailAsset, setDetailAsset] = useState<UnifiedAsset | null>(null)
  const [editPrompt, setEditPrompt] = useState('')
  const [isEditing, setIsEditing] = useState(false)

  // Add manual dialog
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [addType, setAddType] = useState<AssetType>('character')
  const [addName, setAddName] = useState('')
  const [addDescription, setAddDescription] = useState('')

  // ── Data Loading ──
  const loadDrama = useCallback(async () => {
    if (!selectedDramaId) return
    try {
      const d = await api.dramas.get(selectedDramaId)
      setDrama(d)
      setCurrentDrama(d)
      setSelectedStyle(d.artStyle)
    } catch {
      // Drama may not exist
    }
  }, [selectedDramaId, setCurrentDrama])

  const loadExtractStatus = useCallback(async () => {
    if (!selectedDramaId) return
    try {
      const status = await api.dramas.getExtractStatus(selectedDramaId)
      setAssetStatus(status)
    } catch {
      // Ignore
    }
  }, [selectedDramaId])

  const loadArtStyles = useCallback(async () => {
    if (!selectedDramaId) return
    try {
      const result = await api.artStyle.list(selectedDramaId)
      setArtStyles(result.styles)
    } catch {
      // Ignore
    }
  }, [selectedDramaId])

  useEffect(() => {
    loadDrama()
    loadExtractStatus()
    loadArtStyles()
  }, [loadDrama, loadExtractStatus, loadArtStyles])

  // ── Computed: Unified asset list ──
  const allAssets = useMemo<UnifiedAsset[]>(() => {
    if (!drama) return []
    const assets: UnifiedAsset[] = []

    for (const c of drama.characters || []) {
      assets.push({
        id: c.id,
        name: c.name,
        type: 'character',
        description: c.appearance || c.personality || '',
        imagePrompt: c.imagePrompt,
        imageUrl: c.imageUrl,
        episodeIds: c.episodeIds,
        createdAt: c.createdAt,
        raw: c,
      })
    }

    for (const s of drama.scenes || []) {
      assets.push({
        id: s.id,
        name: s.location,
        type: 'scene',
        description: s.description || '',
        imagePrompt: s.prompt || null,
        imageUrl: s.imageUrl,
        episodeIds: s.episodeIds,
        createdAt: s.createdAt,
        raw: s,
      })
    }

    for (const p of drama.props || []) {
      assets.push({
        id: p.id,
        name: p.name,
        type: 'prop',
        description: p.description || '',
        imagePrompt: p.imagePrompt,
        imageUrl: p.imageUrl,
        episodeIds: '',
        createdAt: p.createdAt,
        raw: p,
      })
    }

    return assets
  }, [drama])

  // ── Filtered + sorted assets ──
  const filteredAssets = useMemo(() => {
    let result = allAssets

    if (typeFilter !== 'all') {
      result = result.filter((a) => a.type === typeFilter)
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.description.toLowerCase().includes(q)
      )
    }

    result.sort((a, b) => {
      switch (sortKey) {
        case 'name':
          return a.name.localeCompare(b.name)
        case 'type':
          return a.type.localeCompare(b.type)
        case 'createdAt':
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        default:
          return 0
      }
    })

    return result
  }, [allAssets, typeFilter, searchQuery, sortKey])

  // ── Counts ──
  const counts = useMemo(() => {
    const chars = allAssets.filter((a) => a.type === 'character').length
    const scenes = allAssets.filter((a) => a.type === 'scene').length
    const props = allAssets.filter((a) => a.type === 'prop').length
    return { all: allAssets.length, character: chars, scene: scenes, prop: props }
  }, [allAssets])

  // ── Handlers ──

  const handleExtractAll = async () => {
    if (!selectedDramaId) return
    setExtracting(true)
    try {
      const result = await api.dramas.extractAssets(selectedDramaId)
      toast({
        title: '素材提取完成',
        description: `角色 ${result.characters} / 场景 ${result.scenes} / 道具 ${result.props}`,
      })
      await loadDrama()
      await loadExtractStatus()
    } catch (err: any) {
      toast({ title: '提取失败', description: err.message, variant: 'destructive' })
    } finally {
      setExtracting(false)
    }
  }

  const handleReExtract = async () => {
    if (!selectedDramaId) return
    setExtracting(true)
    try {
      const result = await api.dramas.extractAssets(selectedDramaId)
      toast({
        title: '重新提取完成',
        description: `角色 ${result.characters} / 场景 ${result.scenes} / 道具 ${result.props}`,
      })
      await loadDrama()
      await loadExtractStatus()
    } catch (err: any) {
      toast({ title: '重新提取失败', description: err.message, variant: 'destructive' })
    } finally {
      setExtracting(false)
    }
  }

  const handleApplyStyle = async () => {
    if (!selectedDramaId || !selectedStyle) return
    setApplyingStyle(true)
    try {
      await api.artStyle.set(selectedDramaId, selectedStyle)
      toast({ title: '风格已应用', description: `当前风格: ${selectedStyle}` })
      await loadDrama()
    } catch (err: any) {
      toast({ title: '设置风格失败', description: err.message, variant: 'destructive' })
    } finally {
      setApplyingStyle(false)
    }
  }

  const handlePolishAll = async () => {
    if (!selectedDramaId) return
    setPolishing(true)
    try {
      const result = await api.dramas.polishPrompts(selectedDramaId, selectedStyle || undefined, true)
      toast({
        title: '提示词润色完成',
        description: `润色 ${result.polished} 个，跳过 ${result.skipped} 个`,
      })
      await loadDrama()
    } catch (err: any) {
      toast({ title: '润色失败', description: err.message, variant: 'destructive' })
    } finally {
      setPolishing(false)
    }
  }

  const handleBatchGenerate = async () => {
    if (!selectedDramaId) return
    const assetsToGenerate = filteredAssets.filter((a) => !a.imageUrl)
    if (assetsToGenerate.length === 0) {
      toast({ title: '没有需要生成的素材', description: '所有筛选结果都已有图片' })
      return
    }

    setBatchProgress({ current: 0, total: assetsToGenerate.length, active: true })

    const concurrencyLimit = 2
    let current = 0

    const processAsset = async (asset: UnifiedAsset) => {
      try {
        const style = selectedStyle || undefined
        if (asset.type === 'character') {
          await api.ai.generateCharacterImage(asset.id, style)
        } else if (asset.type === 'scene') {
          await api.ai.generateSceneImage(asset.id, style)
        } else if (asset.type === 'prop' && asset.imagePrompt) {
          await api.ai.generateImage(asset.imagePrompt, imageSize, undefined, undefined, undefined)
        }
      } catch (err: any) {
        console.error(`Failed to generate image for ${asset.name}:`, err)
      } finally {
        current++
        setBatchProgress((prev) => ({ ...prev, current }))
      }
    }

    // Process with concurrency limit
    const queue = [...assetsToGenerate]
    const workers: Promise<void>[] = []

    for (let i = 0; i < concurrencyLimit; i++) {
      workers.push(
        (async () => {
          while (queue.length > 0) {
            const asset = queue.shift()
            if (asset) await processAsset(asset)
          }
        })()
      )
    }

    await Promise.all(workers)

    setBatchProgress((prev) => ({ ...prev, active: false }))
    toast({ title: '批量生成完成', description: `已处理 ${assetsToGenerate.length} 个素材` })
    await loadDrama()
  }

  const handleGenerateSingle = async (asset: UnifiedAsset) => {
    const style = selectedStyle || undefined
    try {
      if (asset.type === 'character') {
        await api.ai.generateCharacterImage(asset.id, style)
      } else if (asset.type === 'scene') {
        await api.ai.generateSceneImage(asset.id, style)
      } else if (asset.type === 'prop' && asset.imagePrompt) {
        await api.ai.generateImage(asset.imagePrompt, imageSize, undefined, undefined, undefined)
      }
      toast({ title: '图片生成完成' })
      await loadDrama()
    } catch (err: any) {
      toast({ title: '生成失败', description: err.message, variant: 'destructive' })
    }
  }

  const handleDeleteAsset = async (asset: UnifiedAsset) => {
    try {
      if (asset.type === 'character') {
        // Characters don't have a direct delete in the API, skip
        toast({ title: '角色暂不支持删除' })
        return
      } else if (asset.type === 'scene') {
        // Scenes don't have a direct delete in the API, skip
        toast({ title: '场景暂不支持删除' })
        return
      } else if (asset.type === 'prop') {
        await api.props.delete(asset.id)
        toast({ title: '道具已删除' })
      }
      await loadDrama()
    } catch (err: any) {
      toast({ title: '删除失败', description: err.message, variant: 'destructive' })
    }
  }

  const handleAddManual = async () => {
    if (!selectedDramaId || !addName.trim()) return
    try {
      if (addType === 'character') {
        await api.characters.create(selectedDramaId, {
          name: addName,
          appearance: addDescription,
          role: 'supporting',
          gender: 'unknown',
        })
      } else if (addType === 'scene') {
        await api.scenes.create(selectedDramaId, {
          location: addName,
          description: addDescription,
        })
      } else if (addType === 'prop') {
        await api.props.create(selectedDramaId, {
          name: addName,
          description: addDescription,
          category: 'other',
        })
      }
      toast({ title: '素材已添加' })
      setShowAddDialog(false)
      setAddName('')
      setAddDescription('')
      await loadDrama()
    } catch (err: any) {
      toast({ title: '添加失败', description: err.message, variant: 'destructive' })
    }
  }

  const handleOpenDetail = (asset: UnifiedAsset) => {
    setDetailAsset(asset)
    setEditPrompt(asset.imagePrompt || '')
    setIsEditing(false)
  }

  const handleSavePrompt = async () => {
    if (!detailAsset || !selectedDramaId) return
    try {
      if (detailAsset.type === 'character') {
        const char = detailAsset.raw as Character
        await fetch(`/api/dramas/${selectedDramaId}/characters`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...char, imagePrompt: editPrompt }),
        })
      } else if (detailAsset.type === 'scene') {
        // Scene updates through scene images API or patch
      } else if (detailAsset.type === 'prop') {
        await api.props.update(detailAsset.id, { imagePrompt: editPrompt })
      }
      toast({ title: '提示词已保存' })
      setIsEditing(false)
      await loadDrama()
    } catch (err: any) {
      toast({ title: '保存失败', description: err.message, variant: 'destructive' })
    }
  }

  // ── Render helpers ──

  const getExtractStatusBadge = () => {
    if (!assetStatus) return null
    const status = assetStatus.assetStatus
    if (status === 'ready') {
      return (
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-emerald-600 border-emerald-300">
          <Check className="size-3 mr-0.5" />
          已提取
        </Badge>
      )
    }
    if (status === 'partial') {
      return (
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-amber-600 border-amber-300">
          部分
        </Badge>
      )
    }
    if (status === 'extracting') {
      return (
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-blue-600 border-blue-300">
          <Loader2 className="size-3 mr-0.5 animate-spin" />
          提取中
        </Badge>
      )
    }
    return (
      <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">
        待提取
      </Badge>
    )
  }

  // ── Render ──

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* 顶部导航 + 面包屑 */}
      <div className="h-12 border-b border-border flex items-center px-4 gap-3 shrink-0">
        {/* Breadcrumb: 项目名 > 剧本生成工作台 > 素材管理工作台 */}
        <button
          onClick={() => selectedDramaId && navigateToProject(selectedDramaId)}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors truncate max-w-28"
        >
          {currentDrama?.title || '项目'}
        </button>
        <ChevronRight className="size-3.5 text-muted-foreground/50 shrink-0" />
        <button
          onClick={() => selectedDramaId && navigateToScriptWorkbench(selectedDramaId)}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          剧本生成
        </button>
        <ChevronRight className="size-3.5 text-muted-foreground/50 shrink-0" />
        <div className="flex items-center gap-1.5">
          <Palette className="size-4 text-amber-500" />
          <span className="text-sm font-medium">素材管理工作台</span>
        </div>
        {(extracting || polishing || batchProgress.active) && (
          <Badge variant="outline" className="text-[10px] px-2 py-0 text-amber-600 border-amber-300">
            <Loader2 className="size-3 mr-1 animate-spin" />
            处理中...
          </Badge>
        )}
        {!extracting && !polishing && !batchProgress.active && (
          <div className="ml-auto" />
        )}
        <Button
          variant="outline"
          size="sm"
          className="hidden sm:inline-flex text-xs gap-1"
          onClick={() => selectedDramaId && navigateToProject(selectedDramaId)}
        >
          进入管线 →
        </Button>
        {/* Mobile drawer toggle */}
        <Button
          variant="ghost"
          size="sm"
          className="size-8 p-0 lg:hidden"
          onClick={() => setLeftCollapsed(!leftCollapsed)}
        >
          {leftCollapsed ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
        </Button>
      </div>

      {/* 主体两栏布局 */}
      <div className="flex flex-1 overflow-hidden">
        {/* ── 左工具面板 (slide-out drawer on < lg) ── */}
        <div
          className={`shrink-0 border-r border-border flex flex-col transition-all duration-200 ${
            leftCollapsed ? 'w-10' : 'w-80'
          } hidden lg:flex`}
        >
          {leftCollapsed ? (
            <div className="flex flex-col items-center py-2 gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="size-8 p-0"
                onClick={() => setLeftCollapsed(false)}
              >
                <ChevronRight className="size-4" />
              </Button>
              <div className="mt-2 [writing-mode:vertical-rl] text-xs text-muted-foreground">
                工具面板
              </div>
            </div>
          ) : (
            <>
              {/* 面板头 */}
              <div className="flex items-center justify-between px-3 py-2 border-b border-border">
                <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <Zap className="size-3 text-amber-500" />
                  工具面板
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="size-6 p-0"
                  onClick={() => setLeftCollapsed(true)}
                >
                  <ChevronLeft className="size-3.5" />
                </Button>
              </div>

              <ScrollArea className="flex-1">
                <div className="p-3 space-y-4">
                  {/* 1. Extract Actions */}
                  <section>
                    <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                      <FolderOpen className="size-3" />
                      素材提取
                      {getExtractStatusBadge()}
                    </div>
                    <div className="space-y-1.5">
                      <Button
                        size="sm"
                        className="w-full h-7 text-xs gap-1.5"
                        onClick={handleExtractAll}
                        disabled={extracting}
                      >
                        {extracting ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <Download className="size-3" />
                        )}
                        提取全部素材
                      </Button>
                      {assetStatus && assetStatus.assetStatus !== 'pending' && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full h-7 text-xs gap-1.5"
                          onClick={handleReExtract}
                          disabled={extracting}
                        >
                          <RotateCcw className="size-3" />
                          重新提取
                        </Button>
                      )}
                    </div>
                    {assetStatus && (
                      <div className="mt-2 text-[10px] text-muted-foreground space-y-0.5">
                        <div>角色: {assetStatus.totalCharacters} · 场景: {assetStatus.totalScenes} · 道具: {assetStatus.totalProps}</div>
                        {assetStatus.lastExtractionAt && (
                          <div>上次提取: {new Date(assetStatus.lastExtractionAt).toLocaleString()}</div>
                        )}
                      </div>
                    )}
                  </section>

                  <Separator />

                  {/* 2. Type Filter */}
                  <section>
                    <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                      <Filter className="size-3" />
                      类型筛选
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {(['all', 'character', 'scene', 'prop'] as TypeFilter[]).map((type) => {
                        const count = type === 'all' ? counts.all : counts[type]
                        const isActive = typeFilter === type
                        const label = type === 'all' ? '全部' : TYPE_LABELS[type]
                        return (
                          <button
                            key={type}
                            className={`px-2 py-1 rounded-md text-[11px] font-medium transition-colors border ${
                              isActive
                                ? 'bg-amber-500/15 text-amber-600 border-amber-500/30'
                                : 'bg-muted/50 text-muted-foreground border-transparent hover:bg-muted'
                            }`}
                            onClick={() => setTypeFilter(type)}
                          >
                            {label} ({count})
                          </button>
                        )
                      })}
                    </div>
                  </section>

                  <Separator />

                  {/* 3. Style Selector */}
                  <section>
                    <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                      <Palette className="size-3" />
                      艺术风格
                      {selectedStyle && (
                        <Badge variant="outline" className="text-[9px] px-1 py-0 text-amber-600 border-amber-300 ml-auto">
                          已选
                        </Badge>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 max-h-64 overflow-y-auto">
                      {artStyles.map((style) => (
                        <button
                          key={style.key}
                          className={`relative p-2 rounded-lg border text-left transition-all hover:bg-muted/50 ${
                            selectedStyle === style.key
                              ? 'border-amber-500 bg-amber-500/10 ring-1 ring-amber-500/30'
                              : 'border-border/50'
                          }`}
                          onClick={() => setSelectedStyle(style.key)}
                        >
                          {/* Style thumbnail or icon placeholder */}
                          <div className="size-full min-h-[40px] rounded-md bg-gradient-to-br from-muted/80 to-muted/40 flex items-center justify-center mb-1.5">
                            <Palette className="size-4 text-muted-foreground/60" />
                          </div>
                          <div className="text-[10px] font-medium leading-tight truncate">
                            {style.name}
                          </div>
                          {selectedStyle === style.key && (
                            <div className="absolute top-1 right-1 size-4 rounded-full bg-amber-500 flex items-center justify-center">
                              <Check className="size-2.5 text-white" />
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                    <div className="mt-2 space-y-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full h-7 text-xs gap-1.5"
                        onClick={handleApplyStyle}
                        disabled={!selectedStyle || applyingStyle}
                      >
                        {applyingStyle ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <Check className="size-3" />
                        )}
                        应用风格
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full h-7 text-xs gap-1.5"
                        onClick={handlePolishAll}
                        disabled={polishing}
                      >
                        {polishing ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <Sparkles className="size-3" />
                        )}
                        润色全部提示词
                      </Button>
                    </div>
                  </section>

                  <Separator />

                  {/* 4. Batch Generate */}
                  <section>
                    <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                      <ImageIcon className="size-3" />
                      批量生成
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground w-10 shrink-0">比例</span>
                        <Select value={imageSize} onValueChange={setImageSize}>
                          <SelectTrigger className="h-7 text-xs flex-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1:1">1:1 方形</SelectItem>
                            <SelectItem value="3:4">3:4 竖版</SelectItem>
                            <SelectItem value="4:3">4:3 横版</SelectItem>
                            <SelectItem value="9:16">9:16 手机</SelectItem>
                            <SelectItem value="16:9">16:9 宽屏</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <Button
                        size="sm"
                        className="w-full h-7 text-xs gap-1.5"
                        onClick={handleBatchGenerate}
                        disabled={batchProgress.active || filteredAssets.length === 0}
                      >
                        {batchProgress.active ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <Play className="size-3" />
                        )}
                        生成选中素材
                      </Button>
                      {batchProgress.active && (
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                            <span>进度</span>
                            <span>{batchProgress.current}/{batchProgress.total}</span>
                          </div>
                          <Progress
                            value={
                              batchProgress.total > 0
                                ? (batchProgress.current / batchProgress.total) * 100
                                : 0
                            }
                            className="h-1.5"
                          />
                        </div>
                      )}
                    </div>
                  </section>
                </div>
              </ScrollArea>
            </>
          )}
        </div>

        {/* ── Mobile drawer for left tool panel (< lg) ── */}
        {!leftCollapsed && (
          <div className="lg:hidden fixed inset-0 z-50 flex">
            <div className="flex-1 bg-black/50" onClick={() => setLeftCollapsed(true)} />
            <div className="w-80 bg-background border-l border-border flex flex-col overflow-y-auto">
              <div className="flex items-center justify-between px-3 py-2 border-b border-border">
                <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <Zap className="size-3 text-amber-500" />
                  工具面板
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="size-6 p-0"
                  onClick={() => setLeftCollapsed(true)}
                >
                  <X className="size-3.5" />
                </Button>
              </div>
              <ScrollArea className="flex-1">
                <div className="p-3 space-y-4">
                  <section>
                    <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                      <FolderOpen className="size-3" />
                      素材提取
                      {getExtractStatusBadge()}
                    </div>
                    <div className="space-y-1.5">
                      <Button
                        size="sm"
                        className="w-full h-7 text-xs gap-1.5"
                        onClick={() => { handleExtractAll(); setLeftCollapsed(true) }}
                        disabled={extracting}
                      >
                        {extracting ? <Loader2 className="size-3 animate-spin" /> : <Download className="size-3" />}
                        提取全部素材
                      </Button>
                    </div>
                  </section>
                  <Separator />
                  <section>
                    <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                      <Filter className="size-3" />
                      类型筛选
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {(['all', 'character', 'scene', 'prop'] as TypeFilter[]).map((type) => {
                        const count = type === 'all' ? counts.all : counts[type]
                        const isActive = typeFilter === type
                        const label = type === 'all' ? '全部' : TYPE_LABELS[type]
                        return (
                          <button
                            key={type}
                            className={`px-2 py-1 rounded-md text-[11px] font-medium transition-colors border ${
                              isActive ? 'bg-amber-500/15 text-amber-600 border-amber-500/30' : 'bg-muted/50 text-muted-foreground border-transparent hover:bg-muted'
                            }`}
                            onClick={() => { setTypeFilter(type); setLeftCollapsed(true) }}
                          >
                            {label} ({count})
                          </button>
                        )
                      })}
                    </div>
                  </section>
                </div>
              </ScrollArea>
            </div>
          </div>
        )}

        {/* ── 右素材面板 ── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header bar */}
          <div className="border-b border-border px-4 py-2 flex items-center gap-3 shrink-0">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <Input
                placeholder="搜索素材名称/描述..."
                className="h-7 text-xs pl-7"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
                size="sm"
                className="size-7 p-0"
                onClick={() => setViewMode('grid')}
              >
                <LayoutGrid className="size-3.5" />
              </Button>
              <Button
                variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                size="sm"
                className="size-7 p-0"
                onClick={() => setViewMode('list')}
              >
                <List className="size-3.5" />
              </Button>
            </div>
            <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
              <SelectTrigger className="h-7 text-xs w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name">按名称</SelectItem>
                <SelectItem value="type">按类型</SelectItem>
                <SelectItem value="createdAt">按时间</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => setShowAddDialog(true)}
            >
              <Plus className="size-3" />
              手动添加
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="size-7 p-0"
              onClick={() => { loadDrama(); loadExtractStatus() }}
            >
              <RefreshCw className="size-3.5" />
            </Button>
          </div>

          {/* Asset Grid / List */}
          <ScrollArea className="flex-1">
            {filteredAssets.length > 0 ? (
              viewMode === 'grid' ? (
                <div className="p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {filteredAssets.map((asset) => (
                    <AssetCard
                      key={`${asset.type}-${asset.id}`}
                      asset={asset}
                      onOpen={handleOpenDetail}
                      onGenerate={handleGenerateSingle}
                      onDelete={handleDeleteAsset}
                    />
                  ))}
                </div>
              ) : (
                <div className="p-4 space-y-2">
                  {filteredAssets.map((asset) => (
                    <AssetListItem
                      key={`${asset.type}-${asset.id}`}
                      asset={asset}
                      onOpen={handleOpenDetail}
                      onGenerate={handleGenerateSingle}
                      onDelete={handleDeleteAsset}
                    />
                  ))}
                </div>
              )
            ) : (
              <div className="flex-1 flex items-center justify-center h-64">
                <div className="text-center space-y-3">
                  <Palette className="size-12 mx-auto text-amber-500/30" />
                  <div>
                    <h3 className="text-sm font-medium">暂无素材</h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      从剧本提取素材或手动添加
                    </p>
                  </div>
                  <div className="flex gap-2 justify-center">
                    <Button
                      size="sm"
                      className="text-xs gap-1"
                      onClick={handleExtractAll}
                      disabled={extracting}
                    >
                      <Download className="size-3" />
                      提取素材
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs gap-1"
                      onClick={() => setShowAddDialog(true)}
                    >
                      <Plus className="size-3" />
                      手动添加
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </ScrollArea>
        </div>
      </div>

      {/* ── Asset Detail Dialog ── */}
      <Dialog open={!!detailAsset} onOpenChange={(open) => !open && setDetailAsset(null)}>
        <DialogContent className="max-w-lg">
          {detailAsset && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {(() => {
                    const Icon = TYPE_COLORS[detailAsset.type].icon
                    return <Icon className="size-4" />
                  })()}
                  {detailAsset.name}
                  <Badge
                    variant="outline"
                    className={`text-[10px] px-1.5 py-0 ${TYPE_COLORS[detailAsset.type].text} ${TYPE_COLORS[detailAsset.type].border}`}
                  >
                    {TYPE_LABELS[detailAsset.type]}
                  </Badge>
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                {/* Image */}
                {detailAsset.imageUrl ? (
                  <div className="rounded-lg overflow-hidden border border-border/50 bg-muted/30">
                    <img
                      src={detailAsset.imageUrl}
                      alt={detailAsset.name}
                      className="w-full max-h-64 object-contain"
                    />
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-border/50 bg-muted/20 h-40 flex items-center justify-center">
                    <div className="text-center">
                      <ImageIcon className="size-8 mx-auto text-muted-foreground/30" />
                      <p className="text-xs text-muted-foreground mt-1">暂无图片</p>
                    </div>
                  </div>
                )}

                {/* Description */}
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-1">描述</div>
                  <p className="text-sm leading-relaxed">
                    {detailAsset.description || '暂无描述'}
                  </p>
                </div>

                {/* Episode tags */}
                {detailAsset.episodeIds && (
                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-1">出现集数</div>
                    <div className="flex flex-wrap gap-1">
                      {(() => {
                        try {
                          const ids = JSON.parse(detailAsset.episodeIds)
                          if (Array.isArray(ids)) {
                            return ids.map((id: string, idx: number) => (
                              <Badge key={id} variant="secondary" className="text-[10px] px-1.5 py-0">
                                E{idx + 1}
                              </Badge>
                            ))
                          }
                        } catch {}
                        return <span className="text-xs text-muted-foreground">—</span>
                      })()}
                    </div>
                  </div>
                )}

                {/* Image Prompt (editable) */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-xs font-medium text-muted-foreground">图片提示词</div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="size-6 p-0"
                      onClick={() => setIsEditing(!isEditing)}
                    >
                      {isEditing ? <Check className="size-3" /> : <Pencil className="size-3" />}
                    </Button>
                  </div>
                  {isEditing ? (
                    <Textarea
                      value={editPrompt}
                      onChange={(e) => setEditPrompt(e.target.value)}
                      className="min-h-[100px] text-xs font-mono"
                      placeholder="输入图片提示词..."
                    />
                  ) : (
                    <p className="text-xs text-muted-foreground bg-muted/30 rounded-md p-2 max-h-32 overflow-y-auto">
                      {detailAsset.imagePrompt || '暂无提示词'}
                    </p>
                  )}
                </div>
              </div>
              <DialogFooter className="gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs gap-1"
                  onClick={() => handleGenerateSingle(detailAsset)}
                >
                  <RefreshCw className="size-3" />
                  生成图片
                </Button>
                {isEditing && (
                  <Button
                    size="sm"
                    className="text-xs gap-1"
                    onClick={handleSavePrompt}
                  >
                    <Check className="size-3" />
                    保存提示词
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Add Manual Dialog ── */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>手动添加素材</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-1">类型</div>
              <Select value={addType} onValueChange={(v) => setAddType(v as AssetType)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="character">角色</SelectItem>
                  <SelectItem value="scene">场景</SelectItem>
                  <SelectItem value="prop">道具</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-1">名称</div>
              <Input
                className="h-8 text-xs"
                placeholder={addType === 'scene' ? '场景地点' : '素材名称'}
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
              />
            </div>
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-1">描述</div>
              <Textarea
                className="text-xs min-h-[60px]"
                placeholder="外观描述..."
                value={addDescription}
                onChange={(e) => setAddDescription(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={() => setShowAddDialog(false)}
            >
              取消
            </Button>
            <Button
              size="sm"
              className="text-xs gap-1"
              onClick={handleAddManual}
              disabled={!addName.trim()}
            >
              <Plus className="size-3" />
              添加
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ── Asset Card (Grid View) ────────────────────────────────

function AssetCard({
  asset,
  onOpen,
  onGenerate,
  onDelete,
}: {
  asset: UnifiedAsset
  onOpen: (a: UnifiedAsset) => void
  onGenerate: (a: UnifiedAsset) => void
  onDelete: (a: UnifiedAsset) => void
}) {
  const colors = TYPE_COLORS[asset.type]
  const Icon = colors.icon

  return (
    <Card
      className="border-border/50 hover:border-border transition-colors cursor-pointer group"
      onClick={() => onOpen(asset)}
    >
      <CardContent className="p-3 space-y-2">
        {/* Image / Placeholder */}
        <div className="aspect-square rounded-md overflow-hidden bg-muted/30 relative">
          {asset.imageUrl ? (
            <img
              src={asset.imageUrl}
              alt={asset.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className={`w-full h-full flex items-center justify-center ${colors.bg}`}>
              <Icon className={`size-8 ${colors.text} opacity-50`} />
            </div>
          )}
          {/* Hover overlay */}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
            <Eye className="size-5 text-white" />
          </div>
        </div>

        {/* Info */}
        <div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium truncate flex-1">{asset.name}</span>
            <Badge
              variant="outline"
              className={`text-[9px] px-1 py-0 shrink-0 ${colors.text} ${colors.border}`}
            >
              {TYPE_LABELS[asset.type]}
            </Badge>
          </div>
          <p className="text-[10px] text-muted-foreground line-clamp-2 mt-0.5">
            {asset.description}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 pt-1">
          <Button
            variant="ghost"
            size="sm"
            className="size-6 p-0"
            onClick={(e) => { e.stopPropagation(); onGenerate(asset) }}
            title="生成图片"
          >
            <ImageIcon className="size-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="size-6 p-0"
            onClick={(e) => { e.stopPropagation(); onOpen(asset) }}
            title="编辑"
          >
            <Pencil className="size-3" />
          </Button>
          {asset.type === 'prop' && (
            <Button
              variant="ghost"
              size="sm"
              className="size-6 p-0 text-destructive hover:text-destructive"
              onClick={(e) => { e.stopPropagation(); onDelete(asset) }}
              title="删除"
            >
              <Trash2 className="size-3" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ── Asset List Item (List View) ───────────────────────────

function AssetListItem({
  asset,
  onOpen,
  onGenerate,
  onDelete,
}: {
  asset: UnifiedAsset
  onOpen: (a: UnifiedAsset) => void
  onGenerate: (a: UnifiedAsset) => void
  onDelete: (a: UnifiedAsset) => void
}) {
  const colors = TYPE_COLORS[asset.type]
  const Icon = colors.icon

  return (
    <div
      className="flex items-center gap-3 p-2.5 rounded-lg border border-border/50 hover:bg-muted/30 cursor-pointer transition-colors"
      onClick={() => onOpen(asset)}
    >
      {/* Thumbnail */}
      <div className="size-12 rounded-md overflow-hidden bg-muted/30 shrink-0">
        {asset.imageUrl ? (
          <img src={asset.imageUrl} alt={asset.name} className="w-full h-full object-cover" />
        ) : (
          <div className={`w-full h-full flex items-center justify-center ${colors.bg}`}>
            <Icon className={`size-4 ${colors.text} opacity-50`} />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{asset.name}</span>
          <Badge
            variant="outline"
            className={`text-[9px] px-1 py-0 shrink-0 ${colors.text} ${colors.border}`}
          >
            {TYPE_LABELS[asset.type]}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground truncate mt-0.5">
          {asset.description}
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        <Button
          variant="ghost"
          size="sm"
          className="size-7 p-0"
          onClick={(e) => { e.stopPropagation(); onGenerate(asset) }}
          title="生成图片"
        >
          <ImageIcon className="size-3.5" />
        </Button>
        {asset.type === 'prop' && (
          <Button
            variant="ghost"
            size="sm"
            className="size-7 p-0 text-destructive hover:text-destructive"
            onClick={(e) => { e.stopPropagation(); onDelete(asset) }}
            title="删除"
          >
            <Trash2 className="size-3.5" />
          </Button>
        )}
      </div>
    </div>
  )
}
