'use client'

import { useTranslations } from 'next-intl'
import type { Asset } from '@/lib/store'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  UserCircle,
  MapPin,
  Package,
  Globe,
  Lock,
  Trash2,
  Pencil,
  History,
  Eye,
} from 'lucide-react'
import { useState } from 'react'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'

interface AssetDetailDrawerProps {
  asset: Asset | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onEdit?: (asset: Asset) => void
  onDelete?: (asset: Asset) => void
}

// Dynamic spec fields per category
const CHARACTER_SPEC_FIELDS = [
  { key: 'role', labelKey: 'role' },
  { key: 'gender', labelKey: 'gender' },
  { key: 'age', labelKey: 'age' },
  { key: 'appearance', labelKey: 'appearance' },
  { key: 'personality', labelKey: 'personality' },
  { key: 'voiceStyle', labelKey: 'voiceStyle' },
  { key: 'weightTier', labelKey: 'weightTier' },
]

const SCENE_SPEC_FIELDS = [
  { key: 'location', labelKey: 'location' },
  { key: 'timeOfDay', labelKey: 'timeOfDay' },
  { key: 'atmosphere', labelKey: 'atmosphere' },
  { key: 'season', labelKey: 'season' },
  { key: 'importance', labelKey: 'importance' },
]

const PROP_SPEC_FIELDS = [
  { key: 'category', labelKey: 'category' },
  { key: 'importance', labelKey: 'importance' },
  { key: 'state_tracking', labelKey: 'stateTracking' },
]

// Identity anchors for characters
const IDENTITY_ANCHOR_LABELS: Record<string, string> = {
  face_shape: '脸型',
  hair_signature: '发型',
  color_palette: '配色',
  silhouette: '服饰',
  signature_prop: '标志物',
  scene_context: '场景嵌入',
}

export function AssetDetailDrawer({ asset, open, onOpenChange, onEdit, onDelete }: AssetDetailDrawerProps) {
  const ta = useTranslations('assetLibrary')
  const tc = useTranslations('common')
  const tad = useTranslations('assetDetail')
  const { toast } = useToast()

  const [versions, setVersions] = useState<any[]>([])
  const [loadingVersions, setLoadingVersions] = useState(false)
  const [showVersions, setShowVersions] = useState(false)

  // Fetch versions when asset changes
  const fetchVersions = async (assetId: string) => {
    setLoadingVersions(true)
    try {
      const result = await api.assets.versions.list(assetId)
      setVersions(result.versions)
    } catch {
      setVersions([])
    } finally {
      setLoadingVersions(false)
    }
  }

  if (!asset) return null

  const data = JSON.parse(asset.data || '{}')
  const tags = JSON.parse(asset.tags || '[]') as string[]
  const imageUrls = JSON.parse(asset.imageUrls || '[]') as string[]

  // Determine spec fields based on category
  const specFields = asset.category === 'character'
    ? CHARACTER_SPEC_FIELDS
    : asset.category === 'scene'
    ? SCENE_SPEC_FIELDS
    : PROP_SPEC_FIELDS

  // Identity anchors (character only)
  const identityAnchors = data.identity_anchors || data.identityAnchors || null

  const CategoryIcon = asset.category === 'character' ? UserCircle : asset.category === 'scene' ? MapPin : Package

  const handleShowVersions = () => {
    if (!showVersions) {
      fetchVersions(asset.id)
    }
    setShowVersions(!showVersions)
  }

  const handleRollback = async (versionId: string) => {
    try {
      await api.assets.versions.rollback(asset.id, versionId)
      toast({ title: tad('rollbackSuccess') })
      onOpenChange(false)
    } catch (err: any) {
      toast({ title: tad('rollbackFailed'), description: err.message, variant: 'destructive' })
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <CategoryIcon className="size-5 text-primary" />
            {asset.name}
            <Badge variant="secondary" className="text-[10px]">
              {ta(asset.category as any)}
            </Badge>
          </SheetTitle>
          <SheetDescription>
            {tad('description')}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-4">
          {/* Thumbnail */}
          {asset.thumbnail && (
            <div className="rounded-lg overflow-hidden border border-border/50">
              <img src={asset.thumbnail} alt={asset.name} className="w-full max-h-48 object-contain bg-muted/30" />
            </div>
          )}

          {/* Meta info */}
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
            {asset.subcategory && (
              <div>
                <span className="text-muted-foreground">{ta('subcategory')}</span>
                <span>{asset.subcategory}</span>
              </div>
            )}
          </div>

          <Separator />

          {/* Dynamic spec fields */}
          <div>
            <h3 className="text-sm font-medium mb-2">{tad('specFields')}</h3>
            <div className="rounded-md bg-muted/40 px-3 py-2 space-y-1.5">
              {specFields.map((field) => {
                const value = data[field.key]
                if (value === undefined || value === null) return null
                return (
                  <div key={field.key} className="flex gap-2 text-xs">
                    <span className="text-muted-foreground min-w-[60px]">{tad(field.labelKey as any) || field.key}:</span>
                    <span className="text-foreground">{String(value)}</span>
                  </div>
                )
              })}
              {specFields.every((f) => data[f.key] === undefined) && (
                <p className="text-xs text-muted-foreground italic">{tad('noSpecData')}</p>
              )}
            </div>
          </div>

          {/* Identity Anchors (character only) */}
          {asset.category === 'character' && identityAnchors && (
            <div>
              <h3 className="text-sm font-medium mb-2">{tad('identityAnchors')}</h3>
              <div className="rounded-md bg-primary/5 border border-primary/10 px-3 py-2 space-y-1.5">
                {Object.entries(identityAnchors).map(([key, value]) => {
                  if (!value) return null
                  return (
                    <div key={key} className="flex gap-2 text-xs">
                      <span className="text-muted-foreground min-w-[60px]">
                        {IDENTITY_ANCHOR_LABELS[key] || key}:
                      </span>
                      <span className="text-foreground">{String(value)}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Weight Tier Badge (character only) */}
          {asset.category === 'character' && data.weightTier && (
            <div>
              <Badge
                className={
                  data.weightTier === 'A'
                    ? 'bg-amber-100 text-amber-800 border-amber-200'
                    : data.weightTier === 'B'
                    ? 'bg-blue-100 text-blue-800 border-blue-200'
                    : 'bg-zinc-100 text-zinc-800 border-zinc-200'
                }
              >
                {tad('weightTier')}: {data.weightTier}
              </Badge>
            </div>
          )}

          {/* Tags */}
          {tags.length > 0 && (
            <div>
              <h3 className="text-sm font-medium mb-1">{ta('tags')}</h3>
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
              <h3 className="text-sm font-medium mb-1">{ta('descriptionLabel')}</h3>
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

          {/* Images gallery */}
          {imageUrls.length > 0 && (
            <div>
              <h3 className="text-sm font-medium mb-1">{ta('images', { count: imageUrls.length })}</h3>
              <div className="grid grid-cols-3 gap-2">
                {imageUrls.map((url, i) => (
                  <div key={i} className="rounded-md overflow-hidden border border-border/50">
                    <img src={url} alt={`${asset.name} - ${i + 1}`} className="w-full h-20 object-cover" />
                  </div>
                ))}
              </div>
            </div>
          )}

          <Separator />

          {/* Version timeline */}
          <div>
            <button
              className="flex items-center gap-2 text-sm font-medium w-full text-left hover:text-primary transition-colors"
              onClick={handleShowVersions}
            >
              <History className="size-4" />
              {tad('versionHistory')}
              <Badge variant="secondary" className="text-[10px] ml-auto">
                {versions.length}
              </Badge>
            </button>

            {showVersions && (
              <div className="mt-2 space-y-2">
                {loadingVersions ? (
                  <p className="text-xs text-muted-foreground">{tc('loading')}</p>
                ) : versions.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">{tad('noVersions')}</p>
                ) : (
                  versions.map((v: any) => (
                    <div key={v.id} className="rounded-md border border-border/50 p-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{tad('version', { number: v.version })}</span>
                        <span className="text-muted-foreground text-[10px]">
                          {new Date(v.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      {v.changeDescription && (
                        <p className="text-muted-foreground mt-0.5">{v.changeDescription}</p>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-5 text-[10px] mt-1"
                        onClick={() => handleRollback(v.id)}
                      >
                        {tad('rollback')}
                      </Button>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer actions */}
        <SheetFooter className="flex-row gap-2 border-t border-border/50 pt-3">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            {tc('close')}
          </Button>
          {onEdit && (
            <Button variant="outline" size="sm" onClick={() => onEdit(asset)}>
              <Pencil className="size-3.5 mr-1" />
              {tc('edit')}
            </Button>
          )}
          {onDelete && (
            <Button variant="destructive" size="sm" onClick={() => onDelete(asset)}>
              <Trash2 className="size-3.5 mr-1" />
              {tc('delete')}
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
