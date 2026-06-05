'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { motion } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Search,
  Star,
  Download,
  Users,
  Eye,
  ShoppingCart,
  ArrowLeft,
  Loader2,
  Crown,
  Gift,
  MessageSquare,
  Plus,
  Store,
  X,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { useAppStore } from '@/lib/store'
import { UserMenu } from '@/components/user-menu'

// Safe JSON parse — returns fallback on error
function safeJsonParse<T>(str: string | null | undefined, fallback: T): T {
  if (!str) return fallback
  try { return JSON.parse(str) as T } catch { return fallback }
}

// ── Types ──

interface Template {
  id: string
  name: string
  description: string
  personality: string
  appearance: string
  referenceImages: string
  tags: string
  category: string
  licenseType: string
  price: number
  downloadCount: number
  rating: number
  featured: boolean
  published: boolean
  createdAt: string
  creator: { id: string; name: string; avatar: string | null }
  _count: { purchases: number; reviews: number }
}

interface TemplateDetail extends Template {
  reviews: Array<{
    id: string
    rating: number
    comment: string
    createdAt: string
    user: { id: string; name: string; avatar: string | null }
  }>
}

// ── Main Component ──

export function MarketplacePage() {
  const tm = useTranslations('marketplace')
  const tc = useTranslations('common')
  const tn = useTranslations('nav')
  const navigateToProjects = useAppStore((s) => s.navigateToProjects)

  const CATEGORY_KEYS = ['', '古风', '现代', '科幻', '奇幻', '职场', '校园']
  const CATEGORY_LABEL_KEYS = ['all', 'categoryAncient', 'categoryModern', 'categoryScifi', 'categoryFantasy', 'categoryWorkplace', 'categoryCampus'] as const

  const CATEGORIES = CATEGORY_KEYS.map((key, i) => ({
    key,
    label: tm(CATEGORY_LABEL_KEYS[i]),
  }))

  const SORT_OPTIONS = [
    { key: 'featured', labelKey: 'sortFeatured' as const },
    { key: 'newest', labelKey: 'sortNewest' as const },
    { key: 'rating', labelKey: 'sortRating' as const },
    { key: 'downloads', labelKey: 'sortDownloads' as const },
    { key: 'free', labelKey: 'sortFree' as const },
  ]

  const [templates, setTemplates] = useState<Template[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [sort, setSort] = useState('featured')
  const [page, setPage] = useState(1)
  const [detailTemplate, setDetailTemplate] = useState<TemplateDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [purchasing, setPurchasing] = useState<string | null>(null)
  const [publishOpen, setPublishOpen] = useState(false)
  const [reviewRating, setReviewRating] = useState(5)
  const [reviewComment, setReviewComment] = useState('')
  const { toast } = useToast()

  const fetchTemplates = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '20',
        sort,
        ...(category && { category }),
        ...(search && { search }),
      })
      const res = await fetch(`/api/marketplace/templates?${params}`)
      const data = await res.json()
      setTemplates(data.templates || [])
      setTotal(data.total || 0)
    } catch (err) {
      toast({ title: tm('loadFailed'), description: String(err), variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [page, sort, category, search, toast, tm])

  useEffect(() => {
    fetchTemplates()
  }, [fetchTemplates])

  const handleViewDetail = async (id: string) => {
    setDetailLoading(true)
    setDetailTemplate(null)
    try {
      const res = await fetch(`/api/marketplace/templates/${id}`)
      const data = await res.json()
      setDetailTemplate(data.template)
    } catch (err) {
      toast({ title: tm('loadFailed'), variant: 'destructive' })
    } finally {
      setDetailLoading(false)
    }
  }

  const handlePurchase = async (id: string) => {
    setPurchasing(id)
    try {
      const res = await fetch(`/api/marketplace/templates/${id}/purchase`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        if (data.error === 'Already purchased') {
          toast({ title: tm('alreadyPurchased') })
        } else {
          throw new Error(data.error)
        }
      } else {
        toast({ title: tm('purchaseSuccess') })
      }
      fetchTemplates()
    } catch (err) {
      toast({ title: tm('purchaseFailed'), description: String(err), variant: 'destructive' })
    } finally {
      setPurchasing(null)
    }
  }

  const handleReview = async () => {
    if (!detailTemplate) return
    try {
      const res = await fetch(`/api/marketplace/templates/${detailTemplate.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating: reviewRating, comment: reviewComment }),
      })
      if (!res.ok) throw new Error(tm('reviewFailed'))
      toast({ title: tm('reviewSubmitted') })
      setReviewComment('')
      setReviewRating(5)
      handleViewDetail(detailTemplate.id)
    } catch (err) {
      toast({ title: tm('reviewFailed'), variant: 'destructive' })
    }
  }

  return (
    <div className="flex-1 flex flex-col">
      {/* Header — same pattern as asset-library */}
      <header className="sticky top-0 z-10 border-b border-border/50 bg-background/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={navigateToProjects}>
              <ArrowLeft className="size-4" />
            </Button>
            <Store className="size-6 text-primary" />
            <h1 className="text-xl sm:text-2xl font-bold">{tm('title')}</h1>
            {total > 0 && (
              <Badge variant="secondary" className="text-xs">
                {tm('templateCount', { count: total })}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" className="amber-glow" onClick={() => setPublishOpen(true)}>
              <Plus className="size-4" />
              <span className="hidden sm:inline">{tm('publishTemplate')}</span>
            </Button>
            <UserMenu />
          </div>
        </div>
      </header>

      {/* Filters — same pattern as asset-library */}
      <div className="border-b border-border/30 bg-background/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center gap-3">
          {/* Category tabs */}
          <Tabs value={category} onValueChange={(v) => { setCategory(v); setPage(1) }}>
            <TabsList className="h-8">
              {CATEGORIES.map(cat => (
                <TabsTrigger key={cat.key} value={cat.key} className="text-xs px-3">
                  {cat.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          {/* Search */}
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <Input
              placeholder={tm('searchPlaceholder')}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-8 text-xs pl-8"
              onKeyDown={e => e.key === 'Enter' && fetchTemplates()}
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

          {/* Sort */}
          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger className="w-28 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map(opt => (
                <SelectItem key={opt.key} value={opt.key}>{tm(opt.labelKey)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-6">
        {loading && templates.length === 0 ? (
          /* Loading skeleton */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Card key={i} className="overflow-hidden py-0 gap-0">
                <div className="h-40 shimmer" />
                <CardContent className="p-3 space-y-2">
                  <div className="h-4 w-3/4 shimmer rounded" />
                  <div className="h-3 w-1/2 shimmer rounded" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : templates.length === 0 ? (
          /* Empty state */
          <div className="flex items-center justify-center py-24">
            <Card className="w-full max-w-sm border-dashed border-2 border-border/50 hover:border-primary/40 transition-colors cursor-pointer py-0 gap-0"
              onClick={() => setPublishOpen(true)}
            >
              <CardContent className="p-8 flex flex-col items-center gap-4 text-muted-foreground">
                <div className="size-14 rounded-full bg-muted flex items-center justify-center">
                  <Users className="size-7 text-primary" />
                </div>
                <p className="text-sm font-medium">{tm('noTemplates')}</p>
                <p className="text-xs opacity-70">{tm('publishTemplate')}</p>
              </CardContent>
            </Card>
          </div>
        ) : (
          /* Template grid */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {templates.map(t => {
              const images = safeJsonParse<string[]>(t.referenceImages, [])
              const thumbnail = images[0] || null
              return (
                <motion.div key={t.id} whileHover={{ y: -4 }} layout>
                  <Card
                    className="cursor-pointer group border-border/60 hover:border-primary/40 hover:shadow-[0_0_16px_oklch(0.72_0.15_75/0.2)] transition-all duration-300 py-0 gap-0 overflow-hidden"
                    onClick={() => handleViewDetail(t.id)}
                  >
                    {/* Thumbnail */}
                    <div className="relative h-40 bg-muted/40 overflow-hidden">
                      {thumbnail ? (
                        <img src={thumbnail} alt={t.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Users className="size-10 text-muted-foreground/30" />
                        </div>
                      )}
                      {/* License badge */}
                      <div className="absolute top-2 right-2">
                        {t.licenseType === 'free' ? (
                          <Badge className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/20 backdrop-blur-sm">
                            <Gift className="size-2.5 mr-0.5" />{tm('free')}
                          </Badge>
                        ) : t.licenseType === 'exclusive' ? (
                          <Badge className="text-[10px] bg-amber-500/10 text-amber-600 border-amber-500/20 backdrop-blur-sm">
                            <Crown className="size-2.5 mr-0.5" />¥{t.price}
                          </Badge>
                        ) : (
                          <Badge className="text-[10px] backdrop-blur-sm">
                            ¥{t.price}
                          </Badge>
                        )}
                      </div>
                    </div>

                    <CardContent className="p-3">
                      {/* Name */}
                      <h4 className="text-sm font-semibold truncate">{t.name}</h4>

                      {/* Description */}
                      {t.description && (
                        <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{t.description}</p>
                      )}

                      {/* Stats */}
                      <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground">
                        <span className="flex items-center gap-0.5">
                          <Star className="size-3 text-amber-500" />{t.rating.toFixed(1)}
                        </span>
                        <span className="flex items-center gap-0.5">
                          <Download className="size-3" />{t.downloadCount}
                        </span>
                        <span className="flex items-center gap-0.5">
                          <Eye className="size-3" />{t._count.purchases}
                        </span>
                      </div>

                      {/* Creator */}
                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/30">
                        <div className="flex items-center gap-1.5">
                          <div className="size-5 rounded-full bg-muted flex items-center justify-center">
                            <Users className="size-3 text-muted-foreground" />
                          </div>
                          <span className="text-[11px] text-muted-foreground">{t.creator.name}</span>
                        </div>
                        {t.featured && (
                          <Badge variant="secondary" className="text-[9px] px-1.5 py-0">
                            <Crown className="size-2.5 mr-0.5 text-amber-500" />{tm('featured')}
                          </Badge>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              )
            })}
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
              {tc('previous')}
            </Button>
            <span className="text-xs text-muted-foreground">
              {page} / {Math.ceil(total / 20)}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= Math.ceil(total / 20)}
              onClick={() => setPage(page + 1)}
            >
              {tc('next')}
            </Button>
          </div>
        )}
      </main>

      {/* Detail Modal */}
      <Dialog open={!!detailTemplate} onOpenChange={() => setDetailTemplate(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">{detailTemplate?.name}</DialogTitle>
          </DialogHeader>
          {detailLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="size-6 animate-spin text-primary" />
            </div>
          ) : detailTemplate ? (
            <div className="space-y-4">
              {/* Preview images */}
              <div className="grid grid-cols-3 gap-2">
                {safeJsonParse<string[]>(detailTemplate.referenceImages, []).map((url: string, i: number) => (
                  <div key={i} className="aspect-square rounded-md bg-muted/30 overflow-hidden">
                    <img src={url} alt="" className="w-full h-full object-cover" />
                  </div>
                ))}
                {safeJsonParse<string[]>(detailTemplate.referenceImages, []).length === 0 && (
                  <div className="col-span-3 h-32 rounded-md bg-muted/30 flex items-center justify-center">
                    <Users className="size-10 text-muted-foreground/30" />
                  </div>
                )}
              </div>

              {/* Info grid */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground text-xs">{tm('description')}</span>
                  <p className="mt-0.5 text-xs">{detailTemplate.description || '—'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">{tm('personality')}</span>
                  <p className="mt-0.5 text-xs">{detailTemplate.personality || '—'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">{tm('appearance')}</span>
                  <p className="mt-0.5 text-xs">{detailTemplate.appearance || '—'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">{tm('categoryLabel')}</span>
                  <p className="mt-0.5 text-xs">{detailTemplate.category}</p>
                </div>
              </div>

              {/* Stats */}
              <div className="flex items-center gap-4 text-xs">
                <span className="flex items-center gap-1"><Star className="size-3.5 text-amber-500" />{detailTemplate.rating.toFixed(1)}</span>
                <span className="flex items-center gap-1"><Download className="size-3.5" />{detailTemplate.downloadCount} {tm('downloads')}</span>
                <span className="flex items-center gap-1"><Users className="size-3.5" />{detailTemplate.creator.name}</span>
              </div>

              {/* Tags */}
              <div className="flex flex-wrap gap-1">
                {safeJsonParse<string[]>(detailTemplate.tags, []).map((tag: string, i: number) => (
                  <Badge key={i} variant="secondary" className="text-[10px]">{tag}</Badge>
                ))}
              </div>

              <Separator />

              {/* Purchase button */}
              <Button
                className="w-full gap-2"
                onClick={() => handlePurchase(detailTemplate.id)}
                disabled={purchasing === detailTemplate.id}
              >
                {purchasing === detailTemplate.id ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : detailTemplate.licenseType === 'free' ? (
                  <Gift className="size-4" />
                ) : (
                  <ShoppingCart className="size-4" />
                )}
                {detailTemplate.licenseType === 'free' ? tm('getFree') : tm('purchase', { price: detailTemplate.price })}
              </Button>

              <Separator />

              {/* Reviews */}
              <div>
                <h4 className="text-sm font-medium mb-2 flex items-center gap-1.5">
                  <MessageSquare className="size-4" />{tm('reviews', { count: detailTemplate.reviews.length })}
                </h4>
                {detailTemplate.reviews.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-2">{tm('noReviews')}</p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {detailTemplate.reviews.map(review => (
                      <div key={review.id} className="p-2.5 rounded-md border border-border/50 text-xs">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium">{review.user.name}</span>
                          <div className="flex">
                            {Array.from({ length: 5 }).map((_, i) => (
                              <Star key={i} className={`size-2.5 ${i < review.rating ? 'text-amber-500 fill-amber-500' : 'text-muted-foreground/30'}`} />
                            ))}
                          </div>
                        </div>
                        {review.comment && <p className="text-muted-foreground">{review.comment}</p>}
                      </div>
                    ))}
                  </div>
                )}

                {/* Add review */}
                <div className="mt-3 p-3 rounded-md border border-border/50 space-y-2">
                  <div className="flex items-center gap-2">
                    <Label className="text-xs">{tm('rating')}</Label>
                    <div className="flex gap-0.5">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <button key={i} onClick={() => setReviewRating(i + 1)}>
                          <Star className={`size-4 ${i < reviewRating ? 'text-amber-500 fill-amber-500' : 'text-muted-foreground/30'}`} />
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      placeholder={tm('writeReview')}
                      value={reviewComment}
                      onChange={e => setReviewComment(e.target.value)}
                      className="text-xs"
                    />
                    <Button size="sm" onClick={handleReview} className="text-xs shrink-0">{tm('submit')}</Button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Publish Template Dialog */}
      <PublishTemplateDialog open={publishOpen} onOpenChange={setPublishOpen} onPublished={fetchTemplates} />
    </div>
  )
}

// ── Publish Template Dialog ──

function PublishTemplateDialog({
  open,
  onOpenChange,
  onPublished,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onPublished: () => void
}) {
  const tm = useTranslations('marketplace')
  const tc = useTranslations('common')

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [personality, setPersonality] = useState('')
  const [appearance, setAppearance] = useState('')
  const [category, setCategory] = useState('现代')
  const [licenseType, setLicenseType] = useState('free')
  const [price, setPrice] = useState(0)
  const [tags, setTags] = useState('')
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()

  const handlePublish = async () => {
    if (!name.trim()) {
      toast({ title: tm('enterTemplateName'), variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/marketplace/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description,
          personality,
          appearance,
          category,
          licenseType,
          price: licenseType === 'free' ? 0 : price,
          tags: tags.split(',').map(t => t.trim()).filter(Boolean),
        }),
      })
      if (!res.ok) throw new Error(tm('publishFailed'))
      toast({ title: tm('publishSuccess') })
      onOpenChange(false)
      onPublished()
      setName('')
      setDescription('')
      setPersonality('')
      setAppearance('')
      setCategory('现代')
      setLicenseType('free')
      setPrice(0)
      setTags('')
    } catch (err) {
      toast({ title: tm('publishFailed'), description: String(err), variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{tm('publishCharacterTemplate')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">{tm('templateName')} *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} className="text-xs" placeholder={tm('templateNamePlaceholder')} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{tm('templateDescription')}</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} className="text-xs" rows={2} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{tm('templatePersonality')}</Label>
            <Textarea value={personality} onChange={e => setPersonality(e.target.value)} className="text-xs" rows={2} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{tm('templateAppearance')}</Label>
            <Textarea value={appearance} onChange={e => setAppearance(e.target.value)} className="text-xs" rows={2} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">{tm('templateCategory')}</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="古风">{tm('categoryAncient')}</SelectItem>
                  <SelectItem value="现代">{tm('categoryModern')}</SelectItem>
                  <SelectItem value="科幻">{tm('categoryScifi')}</SelectItem>
                  <SelectItem value="奇幻">{tm('categoryFantasy')}</SelectItem>
                  <SelectItem value="职场">{tm('categoryWorkplace')}</SelectItem>
                  <SelectItem value="校园">{tm('categoryCampus')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{tm('licenseType')}</Label>
              <Select value={licenseType} onValueChange={setLicenseType}>
                <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="free">{tm('free')}</SelectItem>
                  <SelectItem value="paid">{tm('paid')}</SelectItem>
                  <SelectItem value="exclusive">{tm('exclusive')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {licenseType !== 'free' && (
            <div className="space-y-1.5">
              <Label className="text-xs">{tm('priceYuan')}</Label>
              <Input type="number" value={price} onChange={e => setPrice(Number(e.target.value))} className="text-xs" />
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-xs">{tm('tagsLabel')}</Label>
            <Input value={tags} onChange={e => setTags(e.target.value)} className="text-xs" placeholder={tm('tagsPlaceholder')} />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>{tc('cancel')}</Button>
          <Button size="sm" onClick={handlePublish} disabled={saving}>
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
            {tc('create')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
