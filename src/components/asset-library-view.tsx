'use client'

import { useEffect, useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { motion } from 'framer-motion'
import { useAppStore, type Asset } from '@/lib/store'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
  Library,
  UserCircle,
  MapPin,
  Package,
  Search,
  Plus,
  Trash2,
  Film,
  ArrowLeft,
  Download,
  Loader2,
  Globe,
  Lock,
  Eye,
  X,
  LayoutGrid,
  List,
  CheckSquare,
  Square,
  Palette,
} from 'lucide-react'
import { UserMenu } from '@/components/user-menu'
import { AssetDetailDrawer } from '@/components/asset-detail-drawer'

// ── Category config ──────────────────────────────────────────

const CATEGORY_CONFIG = [
  { value: 'character', icon: UserCircle, labelKey: 'character' as const },
  { value: 'scene', icon: MapPin, labelKey: 'scene' as const },
  { value: 'prop', icon: Package, labelKey: 'prop' as const },
] as const

function categoryIcon(cat: string) {
  return CATEGORY_CONFIG.find((c) => c.value === cat)?.icon ?? Package
}

// Weight tier badge colors
const TIER_COLORS: Record<string, string> = {
  A: 'bg-amber-100 text-amber-800 border-amber-200',
  B: 'bg-blue-100 text-blue-800 border-blue-200',
  C: 'bg-zinc-100 text-zinc-800 border-zinc-200',
}

// ── Asset Card ───────────────────────────────────────────────

function AssetCard({
  asset,
  onSelect,
  onDelete,
  onApply,
  dramas,
  viewMode,
  selected,
  onToggleSelect,
}: {
  asset: Asset
  onSelect: () => void
  onDelete: () => void
  onApply: (dramaId: string) => void
  dramas: { id: string; title: string }[]
  viewMode: 'grid' | 'list'
  selected: boolean
  onToggleSelect: () => void
}) {
  const ta = useTranslations('assetLibrary')
  const tc = useTranslations('common')

  const [applying, setApplying] = useState(false)
  const [showApplyMenu, setShowApplyMenu] = useState(false)
  const Icon = categoryIcon(asset.category)
  const tags = JSON.parse(asset.tags || '[]') as string[]
  const imageUrls = JSON.parse(asset.imageUrls || '[]') as string[]
  const data = JSON.parse(asset.data || '{}') as Record<string, any>

  const categoryLabel = CATEGORY_CONFIG.find((c) => c.value === asset.category)
    ? ta(CATEGORY_CONFIG.find((c) => c.value === asset.category)!.labelKey)
    : asset.category

  const handleApply = async (dramaId: string) => {
    setApplying(true)
    try {
      await onApply(dramaId)
    } finally {
      setApplying(false)
      setShowApplyMenu(false)
    }
  }

  // Version indicator
  const versions = data.__versions || []
  const versionBadge = versions.length > 0 ? (
    <Badge variant="outline" className="text-[9px] px-1 py-0 bg-background/80">
      v{versions.length}
    </Badge>
  ) : null

  // Weight tier badge
  const weightTier = data.weightTier
  const weightBadge = weightTier && asset.category === 'character' ? (
    <Badge className={`text-[9px] px-1 py-0 ${TIER_COLORS[weightTier] || ''}`}>
      {weightTier}
    </Badge>
  ) : null

  if (viewMode === 'list') {
    return (
      <Card className="group border-border/60 hover:border-primary/40 transition-all py-0 gap-0">
        <CardContent className="p-3 flex items-center gap-3">
          <button onClick={onToggleSelect} className="shrink-0">
            {selected ? <CheckSquare className="size-4 text-primary" /> : <Square className="size-4 text-muted-foreground/40" />}
          </button>
          {asset.thumbnail ? (
            <img src={asset.thumbnail} alt={asset.name} className="size-10 rounded object-cover" />
          ) : (
            <div className="size-10 rounded bg-muted/40 flex items-center justify-center shrink-0">
              <Icon className="size-5 text-muted-foreground/40" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium truncate cursor-pointer hover:text-primary" onClick={onSelect}>{asset.name}</span>
              {weightBadge}
              {versionBadge}
            </div>
            <p className="text-[11px] text-muted-foreground truncate">{asset.description || categoryLabel}</p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button variant="ghost" size="sm" className="size-7 p-0" onClick={() => setShowApplyMenu(!showApplyMenu)} disabled={applying}>
              {applying ? <Loader2 className="size-3 animate-spin" /> : <Download className="size-3" />}
            </Button>
            <Button variant="ghost" size="sm" className="size-7 p-0 text-muted-foreground hover:text-destructive" onClick={onDelete}>
              <Trash2 className="size-3" />
            </Button>
          </div>
          {showApplyMenu && dramas.length > 0 && (
            <div className="absolute right-0 top-full mt-1 bg-background border rounded shadow-lg z-10 max-h-32 overflow-y-auto">
              {dramas.map((drama) => (
                <button key={drama.id} className="w-full text-left text-xs px-3 py-1.5 hover:bg-primary/10" onClick={() => handleApply(drama.id)}>
                  {drama.title}
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <motion.div whileHover={{ y: -2 }} layout>
      <Card className={`group border-border/60 hover:border-primary/40 hover:shadow-[0_0_12px_oklch(0.72_0.15_75/0.15)] transition-all duration-200 py-0 gap-0 overflow-hidden ${selected ? 'ring-2 ring-primary/30' : ''}`}>
        <div className="relative h-32 bg-muted/40 overflow-hidden">
          {asset.thumbnail ? (
            <img src={asset.thumbnail} alt={asset.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Icon className="size-10 text-muted-foreground/40" />
            </div>
          )}
          {/* Selection checkbox */}
          <button
            onClick={(e) => { e.stopPropagation(); onToggleSelect() }}
            className="absolute bottom-1.5 left-1.5 z-10"
          >
            {selected ? <CheckSquare className="size-4 text-primary bg-background/80 rounded-sm" /> : <Square className="size-4 text-background/60 hover:text-background" />}
          </button>
          {/* Category badge */}
          <Badge variant="secondary" className="absolute top-2 left-2 text-[10px] px-1.5 py-0 bg-background/80 backdrop-blur-sm">
            {categoryLabel}
          </Badge>
          {/* Weight tier + version badges */}
          <div className="absolute top-2 right-2 flex gap-1">
            {weightBadge}
            {versionBadge}
          </div>
          {/* Visibility */}
          <div className="absolute bottom-1.5 right-1.5">
            {asset.isPublic ? <Globe className="size-3.5 text-muted-foreground/60" /> : <Lock className="size-3.5 text-muted-foreground/60" />}
          </div>
        </div>

        <CardContent className="p-3">
          <h3 className="text-sm font-semibold truncate cursor-pointer hover:text-primary transition-colors" onClick={onSelect}>
            {asset.name}
          </h3>

          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {tags.slice(0, 3).map((tag) => (
                <Badge key={tag} variant="outline" className="text-[9px] px-1 py-0">{tag}</Badge>
              ))}
              {tags.length > 3 && <Badge variant="outline" className="text-[9px] px-1 py-0">+{tags.length - 3}</Badge>}
            </div>
          )}

          {asset.description && (
            <p className="text-[11px] text-muted-foreground mt-1.5 line-clamp-2">{asset.description}</p>
          )}

          <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/30">
            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Eye className="size-3" />{ta('usageCount', { count: asset.usageCount })}
            </span>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" className="size-6 p-0" onClick={() => setShowApplyMenu(!showApplyMenu)} disabled={applying}>
                {applying ? <Loader2 className="size-3 animate-spin" /> : <Download className="size-3" />}
              </Button>
              <Button variant="ghost" size="sm" className="size-6 p-0 text-muted-foreground hover:text-destructive" onClick={onDelete}>
                <Trash2 className="size-3" />
              </Button>
            </div>
          </div>

          {showApplyMenu && dramas.length > 0 && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mt-2 border-t border-border/30 pt-2">
              <p className="text-[10px] text-muted-foreground mb-1">{ta('applyToProjectColon')}</p>
              <div className="max-h-32 overflow-y-auto space-y-1">
                {dramas.map((drama) => (
                  <button key={drama.id} className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-primary/10 transition-colors truncate" onClick={() => handleApply(drama.id)}>
                    {drama.title}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}

// ── Create Asset Dialog ──────────────────────────────────────

function CreateAssetDialog({ open, onOpenChange, onSuccess }: { open: boolean; onOpenChange: (open: boolean) => void; onSuccess: () => void }) {
  const ta = useTranslations('assetLibrary')
  const tc = useTranslations('common')
  const { toast } = useToast()
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [category, setCategory] = useState('character')
  const [description, setDescription] = useState('')
  const [imagePrompt, setImagePrompt] = useState('')
  const [isPublic, setIsPublic] = useState(true)

  const handleCreate = async () => {
    if (!name.trim()) return
    setCreating(true)
    try {
      await api.assets.create({ name: name.trim(), category, description, imagePrompt: imagePrompt || undefined, isPublic })
      toast({ title: ta('createSuccess') })
      setName(''); setCategory('character'); setDescription(''); setImagePrompt(''); setIsPublic(true)
      onOpenChange(false); onSuccess()
    } catch (err: any) {
      toast({ title: ta('createFailed'), description: err.message, variant: 'destructive' })
    } finally {
      setCreating(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{ta('createNewAsset')}</AlertDialogTitle>
          <AlertDialogDescription>{ta('createAssetDescription')}</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-4 py-2">
          <Input placeholder={ta('enterAssetName')} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleCreate()} />
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="character">{ta('character')}</SelectItem>
              <SelectItem value="scene">{ta('scene')}</SelectItem>
              <SelectItem value="prop">{ta('prop')}</SelectItem>
            </SelectContent>
          </Select>
          <Input placeholder={ta('descriptionPlaceholder')} value={description} onChange={(e) => setDescription(e.target.value)} />
          <Input placeholder={ta('imagePromptPlaceholder')} value={imagePrompt} onChange={(e) => setImagePrompt(e.target.value)} />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>{tc('cancel')}</AlertDialogCancel>
          <AlertDialogAction onClick={handleCreate} disabled={!name.trim() || creating}>
            {creating && <Loader2 className="size-4 animate-spin mr-2" />} {tc('create')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

// ── Main AssetLibraryView ────────────────────────────────────

export function AssetLibraryView() {
  const ta = useTranslations('assetLibrary')
  const tc = useTranslations('common')
  const { navigateToProjects, dramas } = useAppStore()
  const { toast } = useToast()

  const [assets, setAssets] = useState<Asset[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [category, setCategory] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')

  // Art style sub-filter
  const [artStyleFilter, setArtStyleFilter] = useState<string>('all')
  const [artStyleOptions, setArtStyleOptions] = useState<{ key: string; name: string }[]>([])

  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Asset | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [applying, setApplying] = useState<string | null>(null)

  // Batch selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [batchDeleting, setBatchDeleting] = useState(false)

  const dramaList = dramas.map((d) => ({ id: d.id, title: d.title }))

  // Fetch art styles for sub-filter
  useEffect(() => {
    api.artStyles.list().then((styles) => {
      setArtStyleOptions(styles.filter((s) => s.isActive).map((s) => ({ key: s.key, name: s.name })))
    }).catch(() => {})
  }, [])

  // Fetch assets
  const fetchAssets = useCallback(async () => {
    setLoading(true)
    try {
      const result = await api.assets.list({
        category: category !== 'all' ? category : undefined,
        search: search || undefined,
        page,
        limit: 20,
      })
      setAssets(result.assets)
      setTotal(result.total)
    } catch (err: any) {
      toast({ title: ta('loadFailed'), description: err.message, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [category, search, page, toast, ta])

  useEffect(() => { fetchAssets() }, [fetchAssets])
  useEffect(() => { setPage(1) }, [category, search])

  // Batch delete
  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return
    setBatchDeleting(true)
    try {
      await api.assets.batch('delete', Array.from(selectedIds))
      toast({ title: ta('assetDeleted') })
      setSelectedIds(new Set())
      fetchAssets()
    } catch (err: any) {
      toast({ title: ta('deleteFailed'), description: err.message, variant: 'destructive' })
    } finally {
      setBatchDeleting(false)
    }
  }

  // Batch export
  const handleBatchExport = async () => {
    if (selectedIds.size === 0) return
    try {
      const result = await api.assets.batch('export', Array.from(selectedIds))
      // Download as JSON
      const blob = new Blob([JSON.stringify(result.assets, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = 'assets-export.json'; a.click()
      URL.revokeObjectURL(url)
      toast({ title: ta('exportSuccess', { count: result.affected }) })
    } catch (err: any) {
      toast({ title: ta('exportFailed'), description: err.message, variant: 'destructive' })
    }
  }

  const handleApply = async (assetId: string, dramaId: string) => {
    setApplying(assetId)
    try {
      const result = await api.assets.apply(assetId, dramaId)
      toast({ title: ta('applySuccess'), description: ta('applySuccessDesc', { name: result.assetName }) })
    } catch (err: any) {
      toast({ title: ta('applyFailed'), description: err.message, variant: 'destructive' })
    } finally {
      setApplying(null)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await api.assets.delete(deleteTarget.id)
      toast({ title: ta('assetDeleted') })
      setDeleteTarget(null); fetchAssets()
    } catch (err: any) {
      toast({ title: ta('deleteFailed'), description: err.message, variant: 'destructive' })
    } finally {
      setDeleting(false)
    }
  }

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const selectAll = () => {
    if (selectedIds.size === assets.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(assets.map((a) => a.id)))
    }
  }

  return (
    <div className="flex-1 flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-border/50 bg-background/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={navigateToProjects}>
              <ArrowLeft className="size-4" />
            </Button>
            <Library className="size-6 text-primary" />
            <h1 className="text-xl sm:text-2xl font-bold">{ta('title')}</h1>
            {total > 0 && <Badge variant="secondary" className="text-xs">{ta('assetCount', { count: total })}</Badge>}
          </div>
          <div className="flex items-center gap-2">
            {/* View toggle */}
            <div className="flex border border-border/50 rounded-md overflow-hidden">
              <Button variant={viewMode === 'grid' ? 'secondary' : 'ghost'} size="sm" className="h-7 px-2 rounded-none" onClick={() => setViewMode('grid')}>
                <LayoutGrid className="size-3.5" />
              </Button>
              <Button variant={viewMode === 'list' ? 'secondary' : 'ghost'} size="sm" className="h-7 px-2 rounded-none" onClick={() => setViewMode('list')}>
                <List className="size-3.5" />
              </Button>
            </div>
            <Button onClick={() => setCreateOpen(true)} className="amber-glow">
              <Plus className="size-4" /><span className="hidden sm:inline">{ta('newAsset')}</span>
            </Button>
            <UserMenu />
          </div>
        </div>
      </header>

      {/* Filters */}
      <div className="border-b border-border/30 bg-background/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center gap-3">
          <Tabs value={category} onValueChange={setCategory}>
            <TabsList className="h-8">
              <TabsTrigger value="all" className="text-xs px-3">{ta('all')}</TabsTrigger>
              <TabsTrigger value="character" className="text-xs px-3"><UserCircle className="size-3.5 mr-1" />{ta('character')}</TabsTrigger>
              <TabsTrigger value="scene" className="text-xs px-3"><MapPin className="size-3.5 mr-1" />{ta('scene')}</TabsTrigger>
              <TabsTrigger value="prop" className="text-xs px-3"><Package className="size-3.5 mr-1" />{ta('prop')}</TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Art style sub-filter */}
          {artStyleOptions.length > 0 && (
            <Select value={artStyleFilter} onValueChange={setArtStyleFilter}>
              <SelectTrigger className="w-40 h-8 text-xs">
                <Palette className="size-3 mr-1" />
                <SelectValue placeholder={ta('artStyleFilter')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{ta('allStyles')}</SelectItem>
                {artStyleOptions.map((s) => (
                  <SelectItem key={s.key} value={s.key}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <Input placeholder={ta('searchPlaceholder')} value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 text-xs pl-8" />
            {search && (
              <Button variant="ghost" size="sm" className="absolute right-0.5 top-1/2 -translate-y-1/2 size-6 p-0" onClick={() => setSearch('')}>
                <X className="size-3" />
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Batch actions bar */}
      {selectedIds.size > 0 && (
        <div className="bg-primary/5 border-b border-primary/20 px-4 sm:px-6 py-2 flex items-center gap-3">
          <span className="text-xs font-medium">{ta('selectedCount', { count: selectedIds.size })}</span>
          <Button variant="outline" size="sm" className="h-6 text-[11px]" onClick={selectAll}>
            {selectedIds.size === assets.length ? ta('deselectAll') : ta('selectAll')}
          </Button>
          <Button variant="outline" size="sm" className="h-6 text-[11px]" onClick={handleBatchExport}>
            {ta('exportSelected')}
          </Button>
          <Button variant="destructive" size="sm" className="h-6 text-[11px]" onClick={handleBatchDelete} disabled={batchDeleting}>
            {batchDeleting ? <Loader2 className="size-3 animate-spin mr-1" /> : <Trash2 className="size-3 mr-1" />}
            {ta('deleteSelected')}
          </Button>
          <Button variant="ghost" size="sm" className="h-6 text-[11px] ml-auto" onClick={() => setSelectedIds(new Set())}>
            {ta('clearSelection')}
          </Button>
        </div>
      )}

      {/* Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-6">
        {loading && assets.length === 0 ? (
          <div className={viewMode === 'grid' ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4' : 'space-y-2'}>
            {Array.from({ length: 8 }).map((_, i) => (
              <Card key={i} className="overflow-hidden py-0 gap-0">
                <div className={viewMode === 'grid' ? 'h-32 shimmer' : 'h-12 shimmer'} />
              </Card>
            ))}
          </div>
        ) : assets.length === 0 ? (
          <div className="flex items-center justify-center py-24">
            <Card className="w-full max-w-sm border-dashed border-2 border-border/50 hover:border-primary/40 transition-colors cursor-pointer py-0 gap-0" onClick={() => setCreateOpen(true)}>
              <CardContent className="p-8 flex flex-col items-center gap-4 text-muted-foreground">
                <div className="size-14 rounded-full bg-muted flex items-center justify-center"><Plus className="size-7 text-primary" /></div>
                <p className="text-sm font-medium">{ta('emptyTitle')}</p>
                <p className="text-xs opacity-70">{ta('emptyDescription')}</p>
              </CardContent>
            </Card>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {assets.map((asset) => (
              <AssetCard
                key={asset.id}
                asset={asset}
                onSelect={() => { setSelectedAsset(asset); setDrawerOpen(true) }}
                onDelete={() => setDeleteTarget(asset)}
                onApply={(dramaId) => handleApply(asset.id, dramaId)}
                dramas={dramaList}
                viewMode="grid"
                selected={selectedIds.has(asset.id)}
                onToggleSelect={() => toggleSelect(asset.id)}
              />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {assets.map((asset) => (
              <AssetCard
                key={asset.id}
                asset={asset}
                onSelect={() => { setSelectedAsset(asset); setDrawerOpen(true) }}
                onDelete={() => setDeleteTarget(asset)}
                onApply={(dramaId) => handleApply(asset.id, dramaId)}
                dramas={dramaList}
                viewMode="list"
                selected={selectedIds.has(asset.id)}
                onToggleSelect={() => toggleSelect(asset.id)}
              />
            ))}
          </div>
        )}

        {total > 20 && (
          <div className="flex items-center justify-center gap-2 mt-6">
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>{ta('previousPage')}</Button>
            <span className="text-xs text-muted-foreground">{ta('pageInfo', { page, totalPages: Math.ceil(total / 20) })}</span>
            <Button variant="outline" size="sm" disabled={page >= Math.ceil(total / 20)} onClick={() => setPage(page + 1)}>{ta('nextPage')}</Button>
          </div>
        )}
      </main>

      {/* Asset Detail Drawer */}
      <AssetDetailDrawer
        asset={selectedAsset}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        onDelete={(asset) => { setDrawerOpen(false); setDeleteTarget(asset) }}
      />

      {/* Create Asset Dialog */}
      <CreateAssetDialog open={createOpen} onOpenChange={setCreateOpen} onSuccess={fetchAssets} />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{ta('deleteConfirm')}</AlertDialogTitle>
            <AlertDialogDescription>{ta('deleteWarning', { name: deleteTarget?.name || '' })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc('cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-white hover:bg-destructive/90">
              {deleting ? ta('deleting') : ta('confirmDelete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
