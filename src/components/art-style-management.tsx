'use client'

import { useEffect, useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { api } from '@/lib/api'
import type { ArtStyle } from '@/lib/store'
import { useToast } from '@/hooks/use-toast'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { ScrollArea } from '@/components/ui/scroll-area'
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
  Palette,
  Plus,
  RefreshCw,
  Loader2,
  Pencil,
  Trash2,
  Eye,
  X,
} from 'lucide-react'

export function ArtStyleManagement() {
  const t = useTranslations('artStyleManagement')
  const tc = useTranslations('common')
  const tas = useTranslations('artStyle')
  const { toast } = useToast()

  const [artStyles, setArtStyles] = useState<ArtStyle[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [previewStyle, setPreviewStyle] = useState<ArtStyle | null>(null)

  // Create/Edit dialog
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingStyle, setEditingStyle] = useState<ArtStyle | null>(null)
  const [saving, setSaving] = useState(false)
  const [formKey, setFormKey] = useState('')
  const [formName, setFormName] = useState('')
  const [formCategory, setFormCategory] = useState('2D')
  const [formDescription, setFormDescription] = useState('')
  const [formPrefixMd, setFormPrefixMd] = useState('')
  const [formPreviewUrl, setFormPreviewUrl] = useState('')
  const [formIsActive, setFormIsActive] = useState(true)

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<ArtStyle | null>(null)
  const [deleting, setDeleting] = useState(false)

  const fetchArtStyles = useCallback(async () => {
    setLoading(true)
    try {
      const styles = await api.artStyles.list()
      setArtStyles(styles)
    } catch (err: any) {
      toast({ title: tas('loadFailed'), description: err.message, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [toast, tas])

  useEffect(() => {
    fetchArtStyles()
  }, [fetchArtStyles])

  // Sync from filesystem
  const handleSync = async () => {
    setSyncing(true)
    try {
      const result = await api.artStyles.sync()
      toast({
        title: t('syncComplete'),
        description: t('syncResult', { synced: result.synced, created: result.created, updated: result.updated }),
      })
      fetchArtStyles()
    } catch (err: any) {
      toast({ title: t('syncFailed'), description: err.message, variant: 'destructive' })
    } finally {
      setSyncing(false)
    }
  }

  // Open create dialog
  const handleCreate = () => {
    setEditingStyle(null)
    setFormKey('')
    setFormName('')
    setFormCategory('2D')
    setFormDescription('')
    setFormPrefixMd('')
    setFormPreviewUrl('')
    setFormIsActive(true)
    setDialogOpen(true)
  }

  // Open edit dialog
  const handleEdit = (style: ArtStyle) => {
    setEditingStyle(style)
    setFormKey(style.key)
    setFormName(style.name)
    setFormCategory(style.category)
    setFormDescription(style.description || '')
    setFormPrefixMd(style.prefixMd || '')
    setFormPreviewUrl(style.previewUrl || '')
    setFormIsActive(style.isActive)
    setDialogOpen(true)
  }

  // Save (create or update)
  const handleSave = async () => {
    if (!formKey.trim() || !formName.trim()) {
      toast({ title: tc('error'), description: 'Key and Name are required', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      if (editingStyle) {
        await api.artStyles.update(editingStyle.id, {
          name: formName.trim(),
          category: formCategory,
          description: formDescription,
          prefixMd: formPrefixMd,
          previewUrl: formPreviewUrl,
          isActive: formIsActive,
        })
        toast({ title: tc('success') })
      } else {
        await api.artStyles.create({
          key: formKey.trim(),
          name: formName.trim(),
          category: formCategory,
          description: formDescription,
          prefixMd: formPrefixMd,
          previewUrl: formPreviewUrl,
          isActive: formIsActive,
        })
        toast({ title: tc('success') })
      }
      setDialogOpen(false)
      fetchArtStyles()
    } catch (err: any) {
      toast({ title: tc('error'), description: err.message, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  // Toggle active
  const handleToggleActive = async (style: ArtStyle) => {
    try {
      await api.artStyles.update(style.id, { isActive: !style.isActive })
      fetchArtStyles()
    } catch (err: any) {
      toast({ title: tc('error'), description: err.message, variant: 'destructive' })
    }
  }

  // Delete
  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await api.artStyles.delete(deleteTarget.id)
      toast({ title: tc('success') })
      setDeleteTarget(null)
      fetchArtStyles()
    } catch (err: any) {
      toast({ title: tc('error'), description: err.message, variant: 'destructive' })
    } finally {
      setDeleting(false)
    }
  }

  const categoryLabels: Record<string, string> = {
    '2D': tas('category2D'),
    '3D': tas('category3D'),
    'realpeople': tas('categoryRealpeople'),
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Palette className="size-5 text-primary" />
          <h2 className="text-lg font-semibold">{t('title')}</h2>
          <Badge variant="secondary" className="text-xs">
            {artStyles.length}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSync}
            disabled={syncing}
            className="h-8"
          >
            {syncing ? <Loader2 className="size-3.5 animate-spin mr-1" /> : <RefreshCw className="size-3.5 mr-1" />}
            {t('syncFromFilesystem')}
          </Button>
          <Button size="sm" onClick={handleCreate} className="h-8 amber-glow">
            <Plus className="size-3.5 mr-1" />
            {t('createStyle')}
          </Button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="size-5 animate-spin text-primary" />
        </div>
      ) : artStyles.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Palette className="size-10 mb-3 opacity-30" />
          <p className="text-sm">{tas('noStyles')}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={handleSync}>
            <RefreshCw className="size-3.5 mr-1" />
            {t('syncFromFilesystem')}
          </Button>
        </div>
      ) : (
        <div className="flex gap-4">
          {/* Style grid */}
          <div className="flex-1">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {artStyles.map((style) => (
                <Card
                  key={style.id}
                  className={`group py-0 gap-0 overflow-hidden transition-all duration-200 cursor-pointer ${
                    previewStyle?.id === style.id ? 'border-primary ring-2 ring-primary/30' : 'border-border/60 hover:border-primary/40'
                  } ${!style.isActive ? 'opacity-60' : ''}`}
                  onClick={() => setPreviewStyle(style)}
                >
                  <div className="relative h-28 bg-muted/40 overflow-hidden">
                    {style.previewUrl ? (
                      <img src={style.previewUrl} alt={style.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Palette className="size-8 text-muted-foreground/30" />
                      </div>
                    )}
                    <Badge variant="secondary" className="absolute top-1.5 left-1.5 text-[9px] px-1 py-0">
                      {categoryLabels[style.category] || style.category}
                    </Badge>
                    {style.isBuiltin && (
                      <Badge className="absolute top-1.5 right-1.5 text-[9px] px-1 py-0 bg-amber-500/20 text-amber-700 border-amber-500/30">
                        {t('builtin')}
                      </Badge>
                    )}
                  </div>
                  <CardContent className="p-2.5">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium truncate">{style.name}</p>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="size-5 p-0"
                          onClick={(e) => { e.stopPropagation(); handleEdit(style) }}
                        >
                          <Pencil className="size-2.5" />
                        </Button>
                        {!style.isBuiltin && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="size-5 p-0 text-muted-foreground hover:text-destructive"
                            onClick={(e) => { e.stopPropagation(); setDeleteTarget(style) }}
                          >
                            <Trash2 className="size-2.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[10px] text-muted-foreground truncate">{style.key}</span>
                      <Switch
                        checked={style.isActive}
                        onCheckedChange={() => handleToggleActive(style)}
                        className="scale-75"
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Preview panel */}
          {previewStyle && (
            <div className="hidden lg:block w-80 border border-border/50 rounded-lg p-4 space-y-3 h-fit sticky top-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">{previewStyle.name}</h3>
                <Button variant="ghost" size="sm" className="size-6 p-0" onClick={() => setPreviewStyle(null)}>
                  <X className="size-3" />
                </Button>
              </div>

              <Badge variant="outline" className="text-[10px]">
                {categoryLabels[previewStyle.category] || previewStyle.category}
              </Badge>

              {previewStyle.description && (
                <p className="text-xs text-muted-foreground">{previewStyle.description}</p>
              )}

              {previewStyle.previewUrl && (
                <div className="rounded-lg overflow-hidden border border-border/50">
                  <img src={previewStyle.previewUrl} alt={previewStyle.name} className="w-full" />
                </div>
              )}

              {previewStyle.prefixMd && (
                <div>
                  <h4 className="text-xs font-medium mb-1">{tas('stylePrefix')}</h4>
                  <ScrollArea className="max-h-48">
                    <div className="rounded-md bg-muted/40 p-2 text-[10px] whitespace-pre-wrap">
                      {previewStyle.prefixMd.slice(0, 1000)}
                      {previewStyle.prefixMd.length > 1000 ? '...' : ''}
                    </div>
                  </ScrollArea>
                </div>
              )}

              {previewStyle.styleMeta && (
                <div>
                  <h4 className="text-xs font-medium mb-1">{tas('styleMeta')}</h4>
                  <ScrollArea className="max-h-32">
                    <pre className="rounded-md bg-muted/40 p-2 text-[10px]">
                      {JSON.stringify(JSON.parse(previewStyle.styleMeta), null, 2)}
                    </pre>
                  </ScrollArea>
                </div>
              )}

              <div className="flex items-center gap-2 pt-2">
                <Button variant="outline" size="sm" className="h-7 text-xs flex-1" onClick={() => handleEdit(previewStyle)}>
                  <Pencil className="size-3 mr-1" />
                  {tc('edit')}
                </Button>
                <Button
                  variant={previewStyle.isActive ? 'outline' : 'default'}
                  size="sm"
                  className="h-7 text-xs flex-1"
                  onClick={() => handleToggleActive(previewStyle)}
                >
                  {previewStyle.isActive ? t('disable') : t('enable')}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingStyle ? t('editStyle') : t('createStyle')}
            </DialogTitle>
            <DialogDescription>
              {editingStyle ? t('editStyleDesc') : t('createStyleDesc')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('styleKey')} *</Label>
                <Input
                  placeholder="e.g. 2D_mature_urban_romance"
                  value={formKey}
                  onChange={(e) => setFormKey(e.target.value)}
                  disabled={!!editingStyle}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('styleName')} *</Label>
                <Input
                  placeholder={t('styleNamePlaceholder')}
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('styleCategory')}</Label>
                <Select value={formCategory} onValueChange={setFormCategory}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2D">{tas('category2D')}</SelectItem>
                    <SelectItem value="3D">{tas('category3D')}</SelectItem>
                    <SelectItem value="realpeople">{tas('categoryRealpeople')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-3 pt-6">
                <Label>{tas('activeLabel')}</Label>
                <Switch checked={formIsActive} onCheckedChange={setFormIsActive} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t('styleDescription')}</Label>
              <Textarea
                placeholder={t('styleDescriptionPlaceholder')}
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label>{tas('stylePrefix')}</Label>
              <Textarea
                placeholder={t('stylePrefixPlaceholder')}
                value={formPrefixMd}
                onChange={(e) => setFormPrefixMd(e.target.value)}
                rows={4}
              />
            </div>

            <div className="space-y-2">
              <Label>{t('previewUrl')}</Label>
              <Input
                placeholder="/api/files/art-styles/..."
                value={formPreviewUrl}
                onChange={(e) => setFormPreviewUrl(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{tc('cancel')}</Button>
            <Button onClick={handleSave} disabled={!formKey.trim() || !formName.trim() || saving}>
              {saving && <Loader2 className="size-4 animate-spin mr-2" />}
              {tc('save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tc('delete')}</DialogTitle>
            <DialogDescription>
              {t('deleteWarning', { name: deleteTarget?.name || '' })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>{tc('cancel')}</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting && <Loader2 className="size-4 animate-spin mr-2" />}
              {tc('confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
