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
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
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
} from 'lucide-react'
import { UserMenu } from '@/components/user-menu'

// ── Category config ──────────────────────────────────────────

const CATEGORY_CONFIG = [
  { value: 'character', icon: UserCircle, labelKey: 'character' as const },
  { value: 'scene', icon: MapPin, labelKey: 'scene' as const },
  { value: 'prop', icon: Package, labelKey: 'prop' as const },
] as const

function categoryIcon(cat: string) {
  return CATEGORY_CONFIG.find((c) => c.value === cat)?.icon ?? Package
}

// ── Asset Card ───────────────────────────────────────────────

function AssetCard({
  asset,
  onSelect,
  onDelete,
  onApply,
  dramas,
}: {
  asset: Asset
  onSelect: () => void
  onDelete: () => void
  onApply: (dramaId: string) => void
  dramas: { id: string; title: string }[]
}) {
  const ta = useTranslations('assetLibrary')
  const tc = useTranslations('common')

  const [applying, setApplying] = useState(false)
  const [showApplyMenu, setShowApplyMenu] = useState(false)
  const Icon = categoryIcon(asset.category)
  const tags = JSON.parse(asset.tags || '[]') as string[]
  const imageUrls = JSON.parse(asset.imageUrls || '[]') as string[]

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

  return (
    <motion.div whileHover={{ y: -2 }} layout>
      <Card className="group border-border/60 hover:border-primary/40 hover:shadow-[0_0_12px_oklch(0.72_0.15_75/0.15)] transition-all duration-200 py-0 gap-0 overflow-hidden">
        {/* Thumbnail */}
        <div className="relative h-32 bg-muted/40 overflow-hidden">
          {asset.thumbnail ? (
            <img
              src={asset.thumbnail}
              alt={asset.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Icon className="size-10 text-muted-foreground/40" />
            </div>
          )}
          {/* Category badge */}
          <Badge
            variant="secondary"
            className="absolute top-2 left-2 text-[10px] px-1.5 py-0 bg-background/80 backdrop-blur-sm"
          >
            {categoryLabel}
          </Badge>
          {/* Visibility badge */}
          <div className="absolute top-2 right-2">
            {asset.isPublic ? (
              <Globe className="size-3.5 text-muted-foreground/60" />
            ) : (
              <Lock className="size-3.5 text-muted-foreground/60" />
            )}
          </div>
        </div>

        <CardContent className="p-3">
          {/* Name */}
          <h3
            className="text-sm font-semibold truncate cursor-pointer hover:text-primary transition-colors"
            onClick={onSelect}
          >
            {asset.name}
          </h3>

          {/* Tags */}
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {tags.slice(0, 3).map((tag) => (
                <Badge key={tag} variant="outline" className="text-[9px] px-1 py-0">
                  {tag}
                </Badge>
              ))}
              {tags.length > 3 && (
                <Badge variant="outline" className="text-[9px] px-1 py-0">
                  +{tags.length - 3}
                </Badge>
              )}
            </div>
          )}

          {/* Description */}
          {asset.description && (
            <p className="text-[11px] text-muted-foreground mt-1.5 line-clamp-2">
              {asset.description}
            </p>
          )}

          {/* Footer: usage count + actions */}
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/30">
            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Eye className="size-3" />
              {ta('usageCount', { count: asset.usageCount })}
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="size-6 p-0"
                onClick={() => setShowApplyMenu(!showApplyMenu)}
                disabled={applying}
                title={ta('applyToProject')}
              >
                {applying ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Download className="size-3" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="size-6 p-0 text-muted-foreground hover:text-destructive"
                onClick={onDelete}
                title={tc('delete')}
              >
                <Trash2 className="size-3" />
              </Button>
            </div>
          </div>

          {/* Apply to project dropdown */}
          {showApplyMenu && dramas.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="mt-2 border-t border-border/30 pt-2"
            >
              <p className="text-[10px] text-muted-foreground mb-1">{ta('applyToProjectColon')}</p>
              <div className="max-h-32 overflow-y-auto space-y-1">
                {dramas.map((drama) => (
                  <button
                    key={drama.id}
                    className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-primary/10 transition-colors truncate"
                    onClick={() => handleApply(drama.id)}
                  >
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

// ── Asset Detail Dialog ──────────────────────────────────────

function AssetDetailDialog({
  asset,
  open,
  onOpenChange,
  onDelete,
  onApply,
  dramas,
}: {
  asset: Asset | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onDelete: () => void
  onApply: (dramaId: string) => void
  dramas: { id: string; title: string }[]
}) {
  const ta = useTranslations('assetLibrary')
  const tc = useTranslations('common')

  if (!asset) return null

  const Icon = categoryIcon(asset.category)
  const tags = JSON.parse(asset.tags || '[]') as string[]
  const imageUrls = JSON.parse(asset.imageUrls || '[]') as string[]
  const data = JSON.parse(asset.data || '{}') as Record<string, any>

  const categoryLabel = CATEGORY_CONFIG.find((c) => c.value === asset.category)
    ? ta(CATEGORY_CONFIG.find((c) => c.value === asset.category)!.labelKey)
    : asset.category

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className="size-5 text-primary" />
            {asset.name}
            <Badge variant="secondary" className="text-[10px]">
              {categoryLabel}
            </Badge>
          </DialogTitle>
          <DialogDescription>
            {ta('detailDescription')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Thumbnail */}
          {asset.thumbnail && (
            <div className="rounded-lg overflow-hidden border border-border/50">
              <img src={asset.thumbnail} alt={asset.name} className="w-full max-h-64 object-contain bg-muted/30" />
            </div>
          )}

          {/* Meta */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-muted-foreground">{ta('creator')}</span>
              <span>{asset.user?.name || ta('unknown')}</span>
            </div>
            <div>
              <span className="text-muted-foreground">{ta('usageCountLabel')}</span>
              <span>{asset.usageCount}</span>
            </div>
            <div>
              <span className="text-muted-foreground">{ta('visibility')}</span>
              <span className="flex items-center gap-1">
                {asset.isPublic ? <Globe className="size-3" /> : <Lock className="size-3" />}
                {asset.isPublic ? ta('public') : ta('private')}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">{ta('subcategory')}</span>
              <span>{asset.subcategory || '—'}</span>
            </div>
          </div>

          {/* Tags */}
          {tags.length > 0 && (
            <div>
              <span className="text-xs text-muted-foreground block mb-1">{ta('tags')}</span>
              <div className="flex flex-wrap gap-1.5">
                {tags.map((tag) => (
                  <Badge key={tag} variant="outline" className="text-[11px]">
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Description */}
          {asset.description && (
            <div>
              <span className="text-xs text-muted-foreground block mb-1">{ta('descriptionLabel')}</span>
              <p className="text-sm leading-relaxed">{asset.description}</p>
            </div>
          )}

          {/* Image Prompt */}
          {asset.imagePrompt && (
            <div className="rounded-md bg-primary/5 border border-primary/10 px-3 py-2">
              <span className="text-[10px] font-medium text-primary/70 uppercase tracking-wide block mb-0.5">
                {ta('imagePrompt')}
              </span>
              <p className="text-xs text-foreground leading-relaxed">{asset.imagePrompt}</p>
            </div>
          )}

          {/* Category-specific data */}
          {Object.keys(data).length > 0 && (
            <div>
              <span className="text-xs text-muted-foreground block mb-1">{ta('detailedAttributes')}</span>
              <div className="rounded-md bg-muted/40 px-3 py-2 space-y-1">
                {Object.entries(data).map(([key, value]) => {
                  if (key === 'appearances' || key === 'images') return null // Skip complex nested
                  if (typeof value === 'object') return null
                  return (
                    <div key={key} className="flex gap-2 text-xs">
                      <span className="text-muted-foreground min-w-[60px]">{key}:</span>
                      <span className="text-foreground">{String(value)}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* All images */}
          {imageUrls.length > 0 && (
            <div>
              <span className="text-xs text-muted-foreground block mb-1">{ta('images', { count: imageUrls.length })}</span>
              <div className="grid grid-cols-3 gap-2">
                {imageUrls.map((url, i) => (
                  <div key={i} className="rounded-md overflow-hidden border border-border/50">
                    <img src={url} alt={`${asset.name} - ${i + 1}`} className="w-full h-20 object-cover" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {tc('close')}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={onDelete}
            >
              <Trash2 className="size-3.5" />
              {tc('delete')}
            </Button>
            {dramas.length > 0 && (
              <Select onValueChange={(dramaId) => onApply(dramaId)}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder={ta('applyToProjectPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {dramas.map((drama) => (
                    <SelectItem key={drama.id} value={drama.id}>
                      {drama.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Create Asset Dialog ──────────────────────────────────────

function CreateAssetDialog({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}) {
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
      await api.assets.create({
        name: name.trim(),
        category,
        description,
        imagePrompt: imagePrompt || undefined,
        isPublic,
      })
      toast({ title: ta('createSuccess') })
      setName('')
      setCategory('character')
      setDescription('')
      setImagePrompt('')
      setIsPublic(true)
      onOpenChange(false)
      onSuccess()
    } catch (err: any) {
      toast({ title: ta('createFailed'), description: err.message, variant: 'destructive' })
    } finally {
      setCreating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{ta('createNewAsset')}</DialogTitle>
          <DialogDescription>{ta('createAssetDescription')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>{ta('nameRequired')} *</Label>
            <Input
              placeholder={ta('enterAssetName')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
          </div>
          <div className="space-y-2">
            <Label>{ta('categoryRequired')} *</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="character">{ta('character')}</SelectItem>
                <SelectItem value="scene">{ta('scene')}</SelectItem>
                <SelectItem value="prop">{ta('prop')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{ta('descriptionLabel')}</Label>
            <Textarea
              placeholder={ta('descriptionPlaceholder')}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label>{ta('imagePromptLabel')}</Label>
            <Textarea
              placeholder={ta('imagePromptPlaceholder')}
              value={imagePrompt}
              onChange={(e) => setImagePrompt(e.target.value)}
              rows={2}
            />
          </div>
          <div className="flex items-center gap-3">
            <Label>{ta('visibilityLabel')}</Label>
            <Select value={isPublic ? 'public' : 'private'} onValueChange={(v) => setIsPublic(v === 'public')}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="public">{ta('public')}</SelectItem>
                <SelectItem value="private">{ta('private')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{tc('cancel')}</Button>
          <Button onClick={handleCreate} disabled={!name.trim() || creating}>
            {creating && <Loader2 className="size-4 animate-spin mr-2" />}
            {tc('create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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

  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Asset | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [applying, setApplying] = useState<string | null>(null)

  // Drama list for apply dropdown
  const dramaList = dramas.map((d) => ({ id: d.id, title: d.title }))

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

  useEffect(() => {
    fetchAssets()
  }, [fetchAssets])

  // Reset page on filter change
  useEffect(() => {
    setPage(1)
  }, [category, search])

  // Handle apply asset to drama
  const handleApply = async (assetId: string, dramaId: string) => {
    setApplying(assetId)
    try {
      const result = await api.assets.apply(assetId, dramaId)
      toast({
        title: ta('applySuccess'),
        description: ta('applySuccessDesc', { name: result.assetName }),
      })
    } catch (err: any) {
      toast({ title: ta('applyFailed'), description: err.message, variant: 'destructive' })
    } finally {
      setApplying(null)
    }
  }

  // Handle delete
  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await api.assets.delete(deleteTarget.id)
      toast({ title: ta('assetDeleted') })
      setDeleteTarget(null)
      fetchAssets()
    } catch (err: any) {
      toast({ title: ta('deleteFailed'), description: err.message, variant: 'destructive' })
    } finally {
      setDeleting(false)
    }
  }

  // Select asset for detail view
  const handleSelectAsset = (asset: Asset) => {
    setSelectedAsset(asset)
    setDetailOpen(true)
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
            {total > 0 && (
              <Badge variant="secondary" className="text-xs">
                {ta('assetCount', { count: total })}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={() => setCreateOpen(true)}
              className="amber-glow"
            >
              <Plus className="size-4" />
              <span className="hidden sm:inline">{ta('newAsset')}</span>
            </Button>
            <UserMenu />
          </div>
        </div>
      </header>

      {/* Filters */}
      <div className="border-b border-border/30 bg-background/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center gap-3">
          {/* Category tabs */}
          <Tabs value={category} onValueChange={setCategory}>
            <TabsList className="h-8">
              <TabsTrigger value="all" className="text-xs px-3">{ta('all')}</TabsTrigger>
              <TabsTrigger value="character" className="text-xs px-3">
                <UserCircle className="size-3.5 mr-1" />
                {ta('character')}
              </TabsTrigger>
              <TabsTrigger value="scene" className="text-xs px-3">
                <MapPin className="size-3.5 mr-1" />
                {ta('scene')}
              </TabsTrigger>
              <TabsTrigger value="prop" className="text-xs px-3">
                <Package className="size-3.5 mr-1" />
                {ta('prop')}
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Search */}
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <Input
              placeholder={ta('searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 text-xs pl-8"
            />
            {search && (
              <Button
                variant="ghost"
                size="sm"
                className="absolute right-0.5 top-1/2 -translate-y-1/2 size-6 p-0"
                onClick={() => setSearch('')}
              >
                <X className="size-3" />
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-6">
        {loading && assets.length === 0 ? (
          /* Loading skeleton */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Card key={i} className="overflow-hidden py-0 gap-0">
                <div className="h-32 shimmer" />
                <CardContent className="p-3 space-y-2">
                  <div className="h-4 w-3/4 shimmer rounded" />
                  <div className="h-3 w-1/2 shimmer rounded" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : assets.length === 0 ? (
          /* Empty state */
          <div className="flex items-center justify-center py-24">
            <Card className="w-full max-w-sm border-dashed border-2 border-border/50 hover:border-primary/40 transition-colors cursor-pointer py-0 gap-0"
              onClick={() => setCreateOpen(true)}
            >
              <CardContent className="p-8 flex flex-col items-center gap-4 text-muted-foreground">
                <div className="size-14 rounded-full bg-muted flex items-center justify-center">
                  <Plus className="size-7 text-primary" />
                </div>
                <p className="text-sm font-medium">{ta('emptyTitle')}</p>
                <p className="text-xs opacity-70">{ta('emptyDescription')}</p>
              </CardContent>
            </Card>
          </div>
        ) : (
          /* Asset grid */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {assets.map((asset) => (
              <AssetCard
                key={asset.id}
                asset={asset}
                onSelect={() => handleSelectAsset(asset)}
                onDelete={() => setDeleteTarget(asset)}
                onApply={(dramaId) => handleApply(asset.id, dramaId)}
                dramas={dramaList}
              />
            ))}
          </div>
        )}

        {/* Pagination */}
        {total > 20 && (
          <div className="flex items-center justify-center gap-2 mt-6">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              {ta('previousPage')}
            </Button>
            <span className="text-xs text-muted-foreground">
              {ta('pageInfo', { page, totalPages: Math.ceil(total / 20) })}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= Math.ceil(total / 20)}
              onClick={() => setPage(page + 1)}
            >
              {ta('nextPage')}
            </Button>
          </div>
        )}
      </main>

      {/* Asset Detail Dialog */}
      <AssetDetailDialog
        asset={selectedAsset}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onDelete={() => {
          if (selectedAsset) {
            setDeleteTarget(selectedAsset)
            setDetailOpen(false)
          }
        }}
        onApply={(dramaId) => {
          if (selectedAsset) {
            handleApply(selectedAsset.id, dramaId)
          }
        }}
        dramas={dramaList}
      />

      {/* Create Asset Dialog */}
      <CreateAssetDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSuccess={fetchAssets}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{ta('deleteConfirm')}</AlertDialogTitle>
            <AlertDialogDescription>
              {ta('deleteWarning', { name: deleteTarget?.name || '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {deleting ? ta('deleting') : ta('confirmDelete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
