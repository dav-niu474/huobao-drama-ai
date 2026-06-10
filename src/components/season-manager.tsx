'use client'

import { useEffect, useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Plus, Trash2, GripVertical, Film, Loader2, Pencil, Check, X } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { api } from '@/lib/api'
import type { Season } from '@/lib/store'

interface SeasonManagerProps {
  dramaId: string
}

export function SeasonManager({ dramaId }: SeasonManagerProps) {
  const t = useTranslations('seasonManager')
  const tc = useTranslations('common')
  const { toast } = useToast()

  const [seasons, setSeasons] = useState<Season[]>([])
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [adding, setAdding] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Season | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Inline editing state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [saving, setSaving] = useState(false)

  // Drag state
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  const fetchSeasons = useCallback(async () => {
    try {
      const data = await api.seasons.list(dramaId)
      setSeasons(data)
    } catch (err) {
      toast({ title: tc('error'), description: String(err), variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [dramaId, toast, tc])

  useEffect(() => {
    fetchSeasons()
  }, [fetchSeasons])

  const handleAdd = async () => {
    setAdding(true)
    try {
      await api.seasons.create(dramaId, {
        title: newTitle.trim() || undefined,
        description: newDesc.trim() || undefined,
      })
      toast({ title: t('seasonCreated') })
      setAddOpen(false)
      setNewTitle('')
      setNewDesc('')
      fetchSeasons()
    } catch (err) {
      toast({ title: tc('error'), description: String(err), variant: 'destructive' })
    } finally {
      setAdding(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await api.seasons.delete(deleteTarget.id)
      toast({ title: t('seasonDeleted') })
      setDeleteTarget(null)
      fetchSeasons()
    } catch (err) {
      toast({ title: tc('error'), description: String(err), variant: 'destructive' })
    } finally {
      setDeleting(false)
    }
  }

  const handleStartEdit = (season: Season) => {
    setEditingId(season.id)
    setEditTitle(season.title)
    setEditDesc(season.description || '')
  }

  const handleSaveEdit = async () => {
    if (!editingId) return
    setSaving(true)
    try {
      await api.seasons.update(editingId, {
        title: editTitle.trim(),
        description: editDesc.trim() || null,
      })
      toast({ title: t('seasonUpdated') })
      setEditingId(null)
      fetchSeasons()
    } catch (err) {
      toast({ title: tc('error'), description: String(err), variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const handleCancelEdit = () => {
    setEditingId(null)
    setEditTitle('')
    setEditDesc('')
  }

  // Drag-to-reorder handlers
  const handleDragStart = (index: number) => {
    setDragIndex(index)
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    setDragOverIndex(index)
  }

  const handleDragEnd = async () => {
    if (dragIndex !== null && dragOverIndex !== null && dragIndex !== dragOverIndex) {
      const newSeasons = [...seasons]
      const [moved] = newSeasons.splice(dragIndex, 1)
      newSeasons.splice(dragOverIndex, 0, moved)

      // Optimistic update
      setSeasons(newSeasons)

      // Update sort orders
      try {
        await Promise.all(
          newSeasons.map((season, idx) =>
            api.seasons.update(season.id, { sortOrder: idx })
          )
        )
      } catch (err) {
        toast({ title: tc('error'), description: String(err), variant: 'destructive' })
        fetchSeasons() // Revert on error
      }
    }
    setDragIndex(null)
    setDragOverIndex(null)
  }

  const statusColors: Record<string, string> = {
    planning: 'bg-amber-500/10 text-amber-600 border-amber-500/30',
    production: 'bg-blue-500/10 text-blue-600 border-blue-500/30',
    completed: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30',
  }

  if (loading) {
    return (
      <Card className="py-0 gap-0">
        <CardHeader className="p-4 pb-2">
          <div className="h-5 w-32 shimmer rounded" />
        </CardHeader>
        <CardContent className="p-4 pt-2 space-y-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-12 shimmer rounded" />
          ))}
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="py-0 gap-0">
      <CardHeader className="p-4 pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Film className="size-4" />
            {t('title')}
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
              {seasons.length}
            </Badge>
          </CardTitle>
          <Button size="sm" className="h-7 text-xs gap-1" onClick={() => setAddOpen(true)}>
            <Plus className="size-3.5" />
            {t('addSeason')}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-2">
        {seasons.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <Film className="size-8 mx-auto mb-2 opacity-30" />
            <p className="text-xs">{t('noSeasons')}</p>
            <p className="text-[10px] mt-1">{t('addFirstSeason')}</p>
          </div>
        ) : (
          <div className="space-y-1.5 max-h-96 overflow-y-auto">
            {seasons.map((season, idx) => (
              <div
                key={season.id}
                draggable
                onDragStart={() => handleDragStart(idx)}
                onDragOver={(e) => handleDragOver(e, idx)}
                onDragEnd={handleDragEnd}
                className={`
                  group flex items-center gap-2 p-2.5 rounded-lg border transition-all cursor-move
                  ${dragOverIndex === idx ? 'border-primary/50 bg-primary/5' : 'border-border/50 hover:border-primary/30'}
                  ${dragIndex === idx ? 'opacity-50' : ''}
                `}
              >
                <GripVertical className="size-3.5 text-muted-foreground/40 flex-shrink-0" />

                {editingId === season.id ? (
                  <div className="flex-1 flex items-center gap-2">
                    <Input
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="h-7 text-xs"
                      autoFocus
                    />
                    <Button size="sm" variant="ghost" className="size-7 p-0" onClick={handleSaveEdit} disabled={saving}>
                      {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5 text-emerald-500" />}
                    </Button>
                    <Button size="sm" variant="ghost" className="size-7 p-0" onClick={handleCancelEdit}>
                      <X className="size-3.5 text-muted-foreground" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium truncate">{season.title}</span>
                        <Badge variant="outline" className={`text-[9px] px-1.5 py-0 h-3.5 ${statusColors[season.status] || 'text-muted-foreground'}`}>
                          {t(`status${season.status.charAt(0).toUpperCase() + season.status.slice(1)}` as any) || season.status}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground">
                          {season._count?.episodes ?? 0} {tc('episodes')}
                        </span>
                      </div>
                      {season.description && (
                        <p className="text-[10px] text-muted-foreground truncate mt-0.5">{season.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button size="sm" variant="ghost" className="size-7 p-0" onClick={() => handleStartEdit(season)}>
                        <Pencil className="size-3" />
                      </Button>
                      <Button size="sm" variant="ghost" className="size-7 p-0 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(season)}>
                        <Trash2 className="size-3" />
                      </Button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* Add Season Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('addSeason')}</DialogTitle>
            <DialogDescription>{t('addSeasonDesc')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder={t('seasonTitlePlaceholder')}
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
            />
            <Textarea
              placeholder={t('seasonDescPlaceholder')}
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setAddOpen(false)}>
              {tc('cancel')}
            </Button>
            <Button size="sm" onClick={handleAdd} disabled={adding}>
              {adding && <Loader2 className="size-3.5 animate-spin mr-1" />}
              {tc('create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('deleteSeason')}</DialogTitle>
            <DialogDescription>
              {t('deleteSeasonWarning', { title: deleteTarget?.title || '' })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setDeleteTarget(null)}>
              {tc('cancel')}
            </Button>
            <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleting}>
              {deleting && <Loader2 className="size-3.5 animate-spin mr-1" />}
              {tc('delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
