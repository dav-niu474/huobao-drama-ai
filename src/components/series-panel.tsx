'use client'

import { useEffect, useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { motion } from 'framer-motion'
import { useAppStore } from '@/lib/store'
import { useToast } from '@/hooks/use-toast'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
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
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Layers, Plus, Film, ArrowLeft, Trash2, Edit3, Globe2,
  CheckCircle2, AlertTriangle, Loader2, BookOpen, GripVertical,
  X, Search,
} from 'lucide-react'
import { UserMenu } from '@/components/user-menu'
import { LanguageSwitcher } from '@/components/language-switcher'

// ── Types ──────────────────────────────────────────────────────

interface SeriesDrama {
  id: string
  title: string
  coverImage: string | null
  genre: string
  status: string
  totalEpisodes: number
  _count?: { episodes: number; characters: number; scenes: number }
}

interface SeriesMember {
  id: string
  seriesId: string
  dramaId: string
  order: number
  role: string
  drama: SeriesDrama
}

interface SeriesData {
  id: string
  title: string
  description: string
  coverImage: string | null
  worldBuildingDoc: string
  userId: string
  createdAt: string
  updatedAt: string
  members: SeriesMember[]
}

interface ConsistencyResult {
  seriesId: string
  seriesTitle: string
  dramaCount: number
  worldBuildingDoc: string
  issues: Array<{ type: string; description: string; dramas: string[] }>
  passed: boolean
}

const ROLE_OPTIONS = [
  { value: 'main', labelKey: 'roleMain' },
  { value: 'spinoff', labelKey: 'roleSpinoff' },
  { value: 'prequel', labelKey: 'rolePrequel' },
  { value: 'sequel', labelKey: 'roleSequel' },
]

// ── Main Component ──────────────────────────────────────────────

export function SeriesPanel() {
  const { navigateToProjects } = useAppStore()
  const { toast } = useToast()
  const t = useTranslations('series')
  const tc = useTranslations('common')
  const tn = useTranslations('nav')

  const [seriesList, setSeriesList] = useState<SeriesData[]>([])
  const [selectedSeries, setSelectedSeries] = useState<SeriesData | null>(null)
  const [loading, setLoading] = useState(true)

  // Create/Edit dialog
  const [editOpen, setEditOpen] = useState(false)
  const [editMode, setEditMode] = useState<'create' | 'edit'>('create')
  const [editTitle, setEditTitle] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editWorldDoc, setEditWorldDoc] = useState('')
  const [saving, setSaving] = useState(false)

  // Delete dialog
  const [deleteTarget, setDeleteTarget] = useState<SeriesData | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Add drama dialog
  const [addDramaOpen, setAddDramaOpen] = useState(false)
  const [availableDramas, setAvailableDramas] = useState<any[]>([])
  const [selectedDramaId, setSelectedDramaId] = useState('')
  const [addDramaRole, setAddDramaRole] = useState('main')
  const [addingDrama, setAddingDrama] = useState(false)
  const [searchDrama, setSearchDrama] = useState('')

  // Consistency check
  const [consistencyResult, setConsistencyResult] = useState<ConsistencyResult | null>(null)
  const [checkingConsistency, setCheckingConsistency] = useState(false)

  // World building edit
  const [editingWorldDoc, setEditingWorldDoc] = useState(false)
  const [worldDocValue, setWorldDocValue] = useState('')
  const [savingWorldDoc, setSavingWorldDoc] = useState(false)

  // Fetch series list
  const fetchSeries = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/series')
      if (!res.ok) throw new Error('Failed to fetch series')
      const data = await res.json()
      setSeriesList(data)
    } catch (err) {
      toast({ title: tc('error'), description: String(err), variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [toast, tc])

  useEffect(() => {
    fetchSeries()
  }, [fetchSeries])

  // Fetch single series detail
  const fetchSeriesDetail = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/series/${id}`)
      if (!res.ok) throw new Error('Failed to fetch series detail')
      const data = await res.json()
      setSelectedSeries(data)
    } catch (err) {
      toast({ title: tc('error'), description: String(err), variant: 'destructive' })
    }
  }, [toast, tc])

  // Create series
  const handleCreate = () => {
    setEditMode('create')
    setEditTitle('')
    setEditDescription('')
    setEditWorldDoc('')
    setEditOpen(true)
  }

  const handleSave = async () => {
    if (!editTitle.trim()) return
    setSaving(true)
    try {
      if (editMode === 'create') {
        const res = await fetch('/api/series', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: editTitle.trim(), description: editDescription, worldBuildingDoc: editWorldDoc }),
        })
        if (!res.ok) throw new Error('Create failed')
        toast({ title: tc('success') })
      } else if (selectedSeries) {
        const res = await fetch(`/api/series/${selectedSeries.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: editTitle.trim(), description: editDescription }),
        })
        if (!res.ok) throw new Error('Update failed')
        toast({ title: tc('success') })
      }
      setEditOpen(false)
      fetchSeries()
      if (selectedSeries) fetchSeriesDetail(selectedSeries.id)
    } catch (err) {
      toast({ title: tc('error'), description: String(err), variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  // Edit series
  const handleEdit = (series: SeriesData) => {
    setEditMode('edit')
    setEditTitle(series.title)
    setEditDescription(series.description)
    setEditWorldDoc(series.worldBuildingDoc)
    setEditOpen(true)
  }

  // Delete series
  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/series/${deleteTarget.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
      toast({ title: tc('success') })
      setDeleteTarget(null)
      if (selectedSeries?.id === deleteTarget.id) setSelectedSeries(null)
      fetchSeries()
    } catch (err) {
      toast({ title: tc('error'), description: String(err), variant: 'destructive' })
    } finally {
      setDeleting(false)
    }
  }

  // Add drama to series
  const handleOpenAddDrama = async () => {
    if (!selectedSeries) return
    setAddDramaOpen(true)
    setSelectedDramaId('')
    setAddDramaRole('main')
    setSearchDrama('')
    try {
      const res = await fetch('/api/dramas')
      if (!res.ok) throw new Error('Failed to fetch dramas')
      const data = await res.json()
      // Filter out dramas already in this series
      const memberIds = new Set(selectedSeries.members.map((m) => m.dramaId))
      setAvailableDramas((data.dramas || data).filter((d: any) => !memberIds.has(d.id)))
    } catch (err) {
      toast({ title: tc('error'), description: String(err), variant: 'destructive' })
    }
  }

  const handleAddDrama = async () => {
    if (!selectedSeries || !selectedDramaId) return
    setAddingDrama(true)
    try {
      const res = await fetch(`/api/series/${selectedSeries.id}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dramaId: selectedDramaId, role: addDramaRole }),
      })
      if (!res.ok) throw new Error('Add drama failed')
      toast({ title: tc('success') })
      setAddDramaOpen(false)
      fetchSeriesDetail(selectedSeries.id)
      fetchSeries()
    } catch (err) {
      toast({ title: tc('error'), description: String(err), variant: 'destructive' })
    } finally {
      setAddingDrama(false)
    }
  }

  // Remove drama from series
  const handleRemoveDrama = async (dramaId: string) => {
    if (!selectedSeries) return
    try {
      const res = await fetch(`/api/series/${selectedSeries.id}/members/${dramaId}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('Remove failed')
      toast({ title: tc('success') })
      fetchSeriesDetail(selectedSeries.id)
      fetchSeries()
    } catch (err) {
      toast({ title: tc('error'), description: String(err), variant: 'destructive' })
    }
  }

  // Consistency check
  const handleConsistencyCheck = async () => {
    if (!selectedSeries) return
    setCheckingConsistency(true)
    setConsistencyResult(null)
    try {
      const res = await fetch(`/api/series/${selectedSeries.id}/consistency`)
      if (!res.ok) throw new Error('Check failed')
      const data = await res.json()
      setConsistencyResult(data)
    } catch (err) {
      toast({ title: tc('error'), description: String(err), variant: 'destructive' })
    } finally {
      setCheckingConsistency(false)
    }
  }

  // World building doc save
  const handleSaveWorldDoc = async () => {
    if (!selectedSeries) return
    setSavingWorldDoc(true)
    try {
      const res = await fetch(`/api/series/${selectedSeries.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ worldBuildingDoc: worldDocValue }),
      })
      if (!res.ok) throw new Error('Save failed')
      toast({ title: tc('success') })
      setEditingWorldDoc(false)
      fetchSeriesDetail(selectedSeries.id)
    } catch (err) {
      toast({ title: tc('error'), description: String(err), variant: 'destructive' })
    } finally {
      setSavingWorldDoc(false)
    }
  }

  // ── Series List View ──
  if (!selectedSeries) {
    return (
      <div className="flex-1 flex flex-col">
        <header className="sticky top-0 z-10 border-b border-border/50 bg-background/80 backdrop-blur-md">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" onClick={navigateToProjects} className="text-muted-foreground hover:text-foreground -ml-2">
                <ArrowLeft className="size-4" />
                <span className="hidden sm:inline">{tn('backToProjects')}</span>
              </Button>
              <Separator orientation="vertical" className="h-5" />
              <Layers className="size-5 text-primary" />
              <h1 className="text-xl font-bold">{t('title')}</h1>
              {seriesList.length > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {seriesList.length}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              <LanguageSwitcher />
              <Button onClick={handleCreate} className="amber-glow">
                <Plus className="size-4" />
                <span className="hidden sm:inline">{t('createSeries')}</span>
              </Button>
              <UserMenu />
            </div>
          </div>
        </header>

        <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-6">
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Card key={i} className="overflow-hidden py-0 gap-0">
                  <div className="h-32 shimmer" />
                  <CardContent className="p-4 space-y-2">
                    <div className="h-5 w-3/4 shimmer rounded" />
                    <div className="h-4 w-1/2 shimmer rounded" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : seriesList.length === 0 ? (
            <div className="flex items-center justify-center py-24">
              <Card
                className="w-full max-w-sm border-dashed border-2 border-border/50 hover:border-primary/40 transition-colors cursor-pointer py-0 gap-0"
                onClick={handleCreate}
              >
                <CardContent className="p-8 flex flex-col items-center gap-4 text-muted-foreground">
                  <div className="size-14 rounded-full bg-muted flex items-center justify-center">
                    <Layers className="size-7 text-primary" />
                  </div>
                  <p className="text-sm font-medium">{t('createFirstSeries')}</p>
                  <p className="text-xs opacity-70">{t('noSeries')}</p>
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {seriesList.map((series) => (
                <motion.div key={series.id} whileHover={{ y: -4 }}>
                  <Card
                    className="cursor-pointer group border-border/60 hover:border-primary/60 hover:shadow-lg transition-all duration-300 py-0 gap-0 overflow-hidden"
                    onClick={() => fetchSeriesDetail(series.id)}
                  >
                    {/* Cover */}
                    <div className="h-32 bg-gradient-to-br from-primary/10 via-primary/5 to-background flex items-center justify-center">
                      {series.coverImage ? (
                        <img src={series.coverImage} alt={series.title} className="w-full h-full object-cover" />
                      ) : (
                        <Layers className="size-10 text-primary/30" />
                      )}
                    </div>
                    <CardContent className="p-4">
                      <h3 className="text-base font-semibold line-clamp-1">{series.title}</h3>
                      {series.description && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{series.description}</p>
                      )}
                      <div className="flex items-center gap-2 mt-2">
                        <Badge variant="secondary" className="text-[10px]">
                          <Film className="size-3 mr-1" />
                          {t('dramaCount', { count: series.members.length })}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          )}
        </main>

        {/* Create Dialog */}
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editMode === 'create' ? t('createSeries') : t('editSeries')}</DialogTitle>
              <DialogDescription>
                {editMode === 'create' ? '' : ''}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  {t('seriesName')} <span className="text-destructive">*</span>
                </label>
                <Input
                  placeholder={t('enterSeriesName')}
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{t('seriesDescription')}</label>
                <Textarea
                  placeholder={t('seriesDescription')}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  rows={3}
                />
              </div>
              {editMode === 'create' && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">{t('worldBuildingDoc')}</label>
                  <Textarea
                    placeholder={t('worldBuildingPlaceholder')}
                    value={editWorldDoc}
                    onChange={(e) => setEditWorldDoc(e.target.value)}
                    rows={5}
                  />
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditOpen(false)}>{tc('cancel')}</Button>
              <Button onClick={handleSave} disabled={!editTitle.trim() || saving}>
                {saving ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
                {saving ? tc('saving') : tc('save')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    )
  }

  // ── Series Detail View ──
  return (
    <div className="flex-1 flex flex-col">
      <header className="sticky top-0 z-10 border-b border-border/50 bg-background/80 backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => { setSelectedSeries(null); setConsistencyResult(null); }} className="text-muted-foreground hover:text-foreground -ml-2">
                <ArrowLeft className="size-4" />
              </Button>
              <Layers className="size-5 text-primary" />
              <h1 className="text-xl font-bold">{selectedSeries.title}</h1>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => handleEdit(selectedSeries)} className="gap-1">
                <Edit3 className="size-3.5" />
                <span className="hidden sm:inline">{t('editSeries')}</span>
              </Button>
              <Button variant="outline" size="sm" onClick={handleConsistencyCheck} disabled={checkingConsistency} className="gap-1">
                {checkingConsistency ? <Loader2 className="size-3.5 animate-spin" /> : <Globe2 className="size-3.5" />}
                <span className="hidden sm:inline">{t('checkConsistency')}</span>
              </Button>
              <Button variant="outline" size="sm" onClick={() => setDeleteTarget(selectedSeries)} className="gap-1 text-destructive hover:text-destructive">
                <Trash2 className="size-3.5" />
                <span className="hidden sm:inline">{t('deleteSeries')}</span>
              </Button>
            </div>
          </div>
          {selectedSeries.description && (
            <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{selectedSeries.description}</p>
          )}
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 py-6 space-y-6">
        {/* World Building Document */}
        <Card className="border-border/60">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <BookOpen className="size-4 text-primary" />
                {t('worldBuildingDoc')}
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setWorldDocValue(selectedSeries.worldBuildingDoc || '')
                  setEditingWorldDoc(true)
                }}
              >
                <Edit3 className="size-3.5" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {editingWorldDoc ? (
              <div className="space-y-3">
                <Textarea
                  value={worldDocValue}
                  onChange={(e) => setWorldDocValue(e.target.value)}
                  placeholder={t('worldBuildingPlaceholder')}
                  rows={8}
                  className="text-sm"
                />
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => setEditingWorldDoc(false)}>{tc('cancel')}</Button>
                  <Button size="sm" onClick={handleSaveWorldDoc} disabled={savingWorldDoc}>
                    {savingWorldDoc ? <Loader2 className="size-3.5 animate-spin mr-1" /> : null}
                    {tc('save')}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground whitespace-pre-wrap min-h-[60px]">
                {selectedSeries.worldBuildingDoc || t('worldBuildingPlaceholder')}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Consistency Check Result */}
        {consistencyResult && (
          <Card className={`border-2 ${consistencyResult.passed ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-amber-500/30 bg-amber-500/5'}`}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                {consistencyResult.passed ? (
                  <CheckCircle2 className="size-5 text-emerald-500" />
                ) : (
                  <AlertTriangle className="size-5 text-amber-500" />
                )}
                <span className="font-medium text-sm">
                  {consistencyResult.passed ? t('consistencyPassed') : t('consistencyIssues', { count: consistencyResult.issues.length })}
                </span>
              </div>
              {consistencyResult.issues.length > 0 && (
                <div className="space-y-2 mt-2">
                  {consistencyResult.issues.map((issue, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-xs">
                      <AlertTriangle className="size-3.5 text-amber-500 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-foreground">{issue.description}</p>
                        <p className="text-muted-foreground">{t('affectedDramas', { dramas: issue.dramas.join(', ') })}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Member Dramas */}
        <Card className="border-border/60">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Film className="size-4 text-primary" />
                {t('memberDramas')}
                <Badge variant="secondary" className="text-[10px]">{selectedSeries.members.length}</Badge>
              </CardTitle>
              <Button size="sm" onClick={handleOpenAddDrama} className="amber-glow gap-1">
                <Plus className="size-3.5" />
                {t('addDrama')}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {selectedSeries.members.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                {t('noMemberDramas')}
              </div>
            ) : (
              <div className="space-y-2">
                {selectedSeries.members.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center gap-3 p-3 rounded-lg border border-border/50 bg-card/50 hover:bg-card/80 transition-colors"
                  >
                    <GripVertical className="size-4 text-muted-foreground/40 cursor-grab" />
                    {/* Drama info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm truncate">{member.drama.title}</span>
                        <Badge variant="outline" className="text-[9px] px-1.5 py-0">
                          {ROLE_OPTIONS.find(r => r.value === member.role)?.value || member.role}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                        <span>#{member.order + 1}</span>
                        {member.drama.genre && <span>{member.drama.genre}</span>}
                      </div>
                    </div>
                    {/* Remove button */}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:text-destructive shrink-0"
                      onClick={() => handleRemoveDrama(member.dramaId)}
                    >
                      <X className="size-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('editSeries')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('seriesName')} <span className="text-destructive">*</span></label>
              <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('seriesDescription')}</label>
              <Textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>{tc('cancel')}</Button>
            <Button onClick={handleSave} disabled={!editTitle.trim() || saving}>
              {saving ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
              {tc('save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('deleteConfirm')}</AlertDialogTitle>
            <AlertDialogDescription>{t('deleteWarning')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc('cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-white hover:bg-destructive/90">
              {deleting ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
              {deleting ? tc('deleting') : tc('delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add Drama Dialog */}
      <Dialog open={addDramaOpen} onOpenChange={setAddDramaOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('addDramaToSeries')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder={t('selectDrama')}
                value={searchDrama}
                onChange={(e) => setSearchDrama(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Drama list */}
            <div className="max-h-64 overflow-y-auto space-y-1">
              {availableDramas
                .filter((d: any) => !searchDrama || d.title.toLowerCase().includes(searchDrama.toLowerCase()))
                .map((drama: any) => (
                  <div
                    key={drama.id}
                    className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-all ${
                      selectedDramaId === drama.id ? 'border-primary/50 bg-primary/5' : 'border-border/40 hover:border-border/80'
                    }`}
                    onClick={() => setSelectedDramaId(drama.id)}
                  >
                    <Film className="size-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium truncate block">{drama.title}</span>
                      {drama.genre && <span className="text-xs text-muted-foreground">{drama.genre}</span>}
                    </div>
                    {selectedDramaId === drama.id && <CheckCircle2 className="size-4 text-primary shrink-0" />}
                  </div>
                ))}
              {availableDramas.filter((d: any) => !searchDrama || d.title.toLowerCase().includes(searchDrama.toLowerCase())).length === 0 && (
                <p className="text-center py-4 text-sm text-muted-foreground">{t('noSeriesAvailable')}</p>
              )}
            </div>

            {/* Role selection */}
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('role')}</label>
              <Select value={addDramaRole} onValueChange={setAddDramaRole}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {t(opt.labelKey)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDramaOpen(false)}>{tc('cancel')}</Button>
            <Button onClick={handleAddDrama} disabled={!selectedDramaId || addingDrama}>
              {addingDrama ? <Loader2 className="size-4 animate-spin mr-2" /> : <Plus className="size-4 mr-2" />}
              {t('addDrama')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
