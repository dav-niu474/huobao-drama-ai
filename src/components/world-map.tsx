'use client'

import { useEffect, useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { api } from '@/lib/api'
import type { WorldRegion, WorldLocation } from '@/lib/store'
import { useToast } from '@/hooks/use-toast'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
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
  Map,
  Plus,
  Pencil,
  Trash2,
  MapPin,
  Music,
  Loader2,
  ChevronRight,
  X,
  Sun,
  Moon,
  CloudSun,
  Sunrise,
  Sunset,
} from 'lucide-react'

interface WorldMapProps {
  dramaId: string
}

const TIME_OF_DAY_ICONS: Record<string, typeof Sun> = {
  dawn: Sunrise,
  morning: Sun,
  noon: Sun,
  afternoon: CloudSun,
  dusk: Sunset,
  night: Moon,
  late_night: Moon,
}

export function WorldMap({ dramaId }: WorldMapProps) {
  const t = useTranslations('worldMap')
  const tc = useTranslations('common')
  const { toast } = useToast()

  const [regions, setRegions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedRegion, setSelectedRegion] = useState<any | null>(null)

  // Region dialog
  const [regionDialogOpen, setRegionDialogOpen] = useState(false)
  const [editingRegion, setEditingRegion] = useState<any | null>(null)
  const [regionForm, setRegionForm] = useState({ name: '', description: '', atmosphere: '', musicStyle: '' })
  const [saving, setSaving] = useState(false)

  // Location dialog
  const [locationDialogOpen, setLocationDialogOpen] = useState(false)
  const [locationForm, setLocationForm] = useState({ name: '', description: '', timeOfDayOptions: ['dawn', 'morning', 'afternoon', 'dusk', 'night'] as string[] })

  const fetchRegions = useCallback(async () => {
    setLoading(true)
    try {
      const result = await api.worldMap.listRegions(dramaId)
      setRegions(result)
    } catch (err: any) {
      toast({ title: t('loadFailed'), description: err.message, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [dramaId, toast, t])

  useEffect(() => {
    fetchRegions()
  }, [fetchRegions])

  // Region CRUD
  const handleCreateRegion = () => {
    setEditingRegion(null)
    setRegionForm({ name: '', description: '', atmosphere: '', musicStyle: '' })
    setRegionDialogOpen(true)
  }

  const handleEditRegion = (region: any) => {
    setEditingRegion(region)
    setRegionForm({
      name: region.name,
      description: region.description || '',
      atmosphere: region.atmosphere || '',
      musicStyle: region.musicStyle || '',
    })
    setRegionDialogOpen(true)
  }

  const handleSaveRegion = async () => {
    if (!regionForm.name.trim()) return
    setSaving(true)
    try {
      if (editingRegion) {
        await api.worldMap.updateRegion(editingRegion.id, regionForm)
      } else {
        await api.worldMap.createRegion(dramaId, regionForm)
      }
      toast({ title: tc('success') })
      setRegionDialogOpen(false)
      fetchRegions()
    } catch (err: any) {
      toast({ title: tc('error'), description: err.message, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteRegion = async (regionId: string) => {
    try {
      await api.worldMap.deleteRegion(regionId)
      toast({ title: tc('success') })
      setSelectedRegion(null)
      fetchRegions()
    } catch (err: any) {
      toast({ title: tc('error'), description: err.message, variant: 'destructive' })
    }
  }

  // Location CRUD
  const handleCreateLocation = () => {
    setLocationForm({ name: '', description: '', timeOfDayOptions: ['dawn', 'morning', 'afternoon', 'dusk', 'night'] })
    setLocationDialogOpen(true)
  }

  const handleSaveLocation = async () => {
    if (!locationForm.name.trim() || !selectedRegion) return
    setSaving(true)
    try {
      await api.worldMap.createLocation(selectedRegion.id, locationForm)
      toast({ title: tc('success') })
      setLocationDialogOpen(false)
      fetchRegions()
    } catch (err: any) {
      toast({ title: tc('error'), description: err.message, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteLocation = async (locationId: string) => {
    try {
      await api.worldMap.deleteLocation(locationId)
      toast({ title: tc('success') })
      fetchRegions()
    } catch (err: any) {
      toast({ title: tc('error'), description: err.message, variant: 'destructive' })
    }
  }

  // Get locations for selected region
  const locations = selectedRegion?.locations || []

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="size-5 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Map className="size-5 text-primary" />
          <h2 className="text-lg font-semibold">{t('title')}</h2>
          <Badge variant="secondary" className="text-xs">{regions.length} {t('regions')}</Badge>
        </div>
        <Button size="sm" onClick={handleCreateRegion} className="h-8 amber-glow">
          <Plus className="size-3.5 mr-1" />{t('addRegion')}
        </Button>
      </div>

      {regions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Map className="size-10 mb-3 opacity-30" />
          <p className="text-sm">{t('noRegions')}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={handleCreateRegion}>
            <Plus className="size-3.5 mr-1" />{t('addFirstRegion')}
          </Button>
        </div>
      ) : (
        <div className="flex gap-4">
          {/* Region list */}
          <div className="w-64 shrink-0 space-y-2">
            {regions.map((region) => (
              <Card
                key={region.id}
                className={`cursor-pointer transition-all py-0 gap-0 ${
                  selectedRegion?.id === region.id ? 'border-primary ring-2 ring-primary/30' : 'border-border/60 hover:border-primary/40'
                }`}
                onClick={() => setSelectedRegion(region)}
              >
                <CardContent className="p-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium truncate">{region.name}</h3>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" className="size-5 p-0" onClick={(e) => { e.stopPropagation(); handleEditRegion(region) }}>
                        <Pencil className="size-2.5" />
                      </Button>
                      <Button variant="ghost" size="sm" className="size-5 p-0 text-muted-foreground hover:text-destructive" onClick={(e) => { e.stopPropagation(); handleDeleteRegion(region.id) }}>
                        <Trash2 className="size-2.5" />
                      </Button>
                    </div>
                  </div>
                  {region.atmosphere && (
                    <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{region.atmosphere}</p>
                  )}
                  {region.musicStyle && (
                    <div className="flex items-center gap-1 mt-1">
                      <Music className="size-2.5 text-muted-foreground/50" />
                      <span className="text-[9px] text-muted-foreground truncate">{region.musicStyle}</span>
                    </div>
                  )}
                  {region.locations && region.locations.length > 0 && (
                    <Badge variant="outline" className="text-[9px] mt-1">
                      <MapPin className="size-2.5 mr-0.5" />{region.locations.length}
                    </Badge>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Location panel */}
          <div className="flex-1 min-w-0">
            {selectedRegion ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold">{selectedRegion.name}</h3>
                    {selectedRegion.description && (
                      <p className="text-xs text-muted-foreground mt-0.5">{selectedRegion.description}</p>
                    )}
                  </div>
                  <Button size="sm" onClick={handleCreateLocation} className="h-7">
                    <Plus className="size-3 mr-1" />{t('addLocation')}
                  </Button>
                </div>

                {locations.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <MapPin className="size-8 mb-2 opacity-30 mx-auto" />
                    <p className="text-xs">{t('noLocations')}</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {locations.map((location: any) => {
                      const timeOptions = (() => {
                        try { return JSON.parse(location.timeOfDayOptions || '[]') } catch { return [] }
                      })()

                      return (
                        <Card key={location.id} className="py-0 gap-0">
                          <CardContent className="p-3">
                            <div className="flex items-start justify-between">
                              <div>
                                <h4 className="text-sm font-medium">{location.name}</h4>
                                {location.description && (
                                  <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{location.description}</p>
                                )}
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="size-5 p-0 text-muted-foreground hover:text-destructive shrink-0"
                                onClick={() => handleDeleteLocation(location.id)}
                              >
                                <Trash2 className="size-2.5" />
                              </Button>
                            </div>

                            {/* Time of day options */}
                            {timeOptions.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {timeOptions.map((tod: string) => {
                                  const Icon = TIME_OF_DAY_ICONS[tod] || Sun
                                  return (
                                    <Badge key={tod} variant="outline" className="text-[9px] px-1.5 py-0 gap-0.5">
                                      <Icon className="size-2.5" />
                                      {t(tod as any) || tod}
                                    </Badge>
                                  )
                                })}
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      )
                    })}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <Map className="size-10 mb-3 opacity-30 mx-auto" />
                <p className="text-sm">{t('selectRegion')}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Region Dialog */}
      <Dialog open={regionDialogOpen} onOpenChange={setRegionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingRegion ? t('editRegion') : t('addRegion')}</DialogTitle>
            <DialogDescription>{editingRegion ? t('editRegionDesc') : t('addRegionDesc')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>{t('regionName')} *</Label>
              <Input placeholder={t('regionNamePlaceholder')} value={regionForm.name} onChange={(e) => setRegionForm({ ...regionForm, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>{t('regionDescription')}</Label>
              <Textarea placeholder={t('regionDescriptionPlaceholder')} value={regionForm.description} onChange={(e) => setRegionForm({ ...regionForm, description: e.target.value })} rows={2} />
            </div>
            <div className="space-y-2">
              <Label>{t('atmosphere')}</Label>
              <Input placeholder={t('atmospherePlaceholder')} value={regionForm.atmosphere} onChange={(e) => setRegionForm({ ...regionForm, atmosphere: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>{t('musicStyle')}</Label>
              <Input placeholder={t('musicStylePlaceholder')} value={regionForm.musicStyle} onChange={(e) => setRegionForm({ ...regionForm, musicStyle: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRegionDialogOpen(false)}>{tc('cancel')}</Button>
            <Button onClick={handleSaveRegion} disabled={!regionForm.name.trim() || saving}>
              {saving && <Loader2 className="size-4 animate-spin mr-2" />}
              {tc('save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Location Dialog */}
      <Dialog open={locationDialogOpen} onOpenChange={setLocationDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('addLocation')}</DialogTitle>
            <DialogDescription>{t('addLocationDesc')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>{t('locationName')} *</Label>
              <Input placeholder={t('locationNamePlaceholder')} value={locationForm.name} onChange={(e) => setLocationForm({ ...locationForm, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>{t('locationDescription')}</Label>
              <Textarea placeholder={t('locationDescriptionPlaceholder')} value={locationForm.description} onChange={(e) => setLocationForm({ ...locationForm, description: e.target.value })} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLocationDialogOpen(false)}>{tc('cancel')}</Button>
            <Button onClick={handleSaveLocation} disabled={!locationForm.name.trim() || saving}>
              {saving && <Loader2 className="size-4 animate-spin mr-2" />}
              {tc('save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
