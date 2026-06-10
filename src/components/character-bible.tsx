'use client'

import { useEffect, useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { api } from '@/lib/api'
import type { Character, IdentityAnchors } from '@/lib/store'
import { useToast } from '@/hooks/use-toast'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  User,
  Pencil,
  Save,
  X,
  Image,
  Clock,
  AlertCircle,
  Loader2,
  CheckCircle2,
  ChevronRight,
} from 'lucide-react'

interface CharacterBibleProps {
  characterId: string
  dramaId: string
}

// Anchor layer definitions
const ANCHOR_LAYERS = [
  { key: 'face', labelKey: 'anchorFace', icon: '👤' },
  { key: 'hair', labelKey: 'anchorHair', icon: '💇' },
  { key: 'colorScheme', labelKey: 'anchorColor', icon: '🎨' },
  { key: 'clothing', labelKey: 'anchorClothing', icon: '👔' },
  { key: 'signatureItems', labelKey: 'anchorSignature', icon: '🔑' },
  { key: 'sceneEmbed', labelKey: 'anchorScene', icon: '🎬' },
] as const

const EMPTY_ANCHORS: IdentityAnchors = {
  face: '',
  hair: '',
  colorScheme: '',
  clothing: '',
  signatureItems: '',
  sceneEmbed: '',
}

export function CharacterBible({ characterId, dramaId }: CharacterBibleProps) {
  const t = useTranslations('characterBible')
  const tc = useTranslations('common')
  const { toast } = useToast()

  const [character, setCharacter] = useState<Character | null>(null)
  const [loading, setLoading] = useState(true)
  const [anchors, setAnchors] = useState<IdentityAnchors>(EMPTY_ANCHORS)
  const [editing, setEditing] = useState<string | null>(null) // which anchor is being edited
  const [editValue, setEditValue] = useState('')
  const [saving, setSaving] = useState(false)

  // Consistency validation
  const [validationIssues, setValidationIssues] = useState<string[]>([])

  const fetchCharacter = useCallback(async () => {
    setLoading(true)
    try {
      const result = await api.characters.list(dramaId)
      const char = result.find((c) => c.id === characterId)
      if (char) {
        setCharacter(char)
        // Parse existing anchors
        try {
          const parsed = JSON.parse((char as any).identityAnchors || '{}')
          setAnchors({ ...EMPTY_ANCHORS, ...parsed })
        } catch {
          setAnchors(EMPTY_ANCHORS)
        }
      }
    } catch (err: any) {
      toast({ title: t('loadFailed'), description: err.message, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [characterId, dramaId, toast, t])

  useEffect(() => {
    fetchCharacter()
  }, [fetchCharacter])

  // Validate consistency
  const validateConsistency = useCallback(() => {
    const issues: string[] = []
    // Check if required anchors are filled
    if (!anchors.face) issues.push(t('missingFace'))
    if (!anchors.hair) issues.push(t('missingHair'))
    if (!anchors.colorScheme) issues.push(t('missingColor'))

    // Check color format
    if (anchors.colorScheme && !anchors.colorScheme.includes('#') && !anchors.colorScheme.includes('色')) {
      issues.push(t('invalidColorFormat'))
    }

    setValidationIssues(issues)
    return issues.length === 0
  }, [anchors, t])

  useEffect(() => {
    validateConsistency()
  }, [validateConsistency])

  // Start editing an anchor
  const handleStartEdit = (key: string) => {
    setEditing(key)
    setEditValue(anchors[key as keyof IdentityAnchors] || '')
  }

  // Save anchor value
  const handleSaveAnchor = async (key: string) => {
    setSaving(true)
    try {
      const updatedAnchors = { ...anchors, [key]: editValue }
      setAnchors(updatedAnchors)

      // Save to backend via character update
      await fetch(`/api/dramas/${dramaId}/characters`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ characterId, identityAnchors: JSON.stringify(updatedAnchors) }),
      })

      setEditing(null)
      toast({ title: tc('success') })
    } catch (err: any) {
      toast({ title: tc('error'), description: err.message, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  // Cancel editing
  const handleCancelEdit = () => {
    setEditing(null)
    setEditValue('')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="size-5 animate-spin text-primary" />
      </div>
    )
  }

  if (!character) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p className="text-sm">{t('notFound')}</p>
      </div>
    )
  }

  const wardrobeUrls: string[] = (() => {
    try { return JSON.parse((character as any).wardrobeUrls || '[]') } catch { return [] }
  })()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="size-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <User className="size-5 text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">{character.name}</h2>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-[10px]">{character.role}</Badge>
            <Badge variant="outline" className="text-[10px]">{character.gender}</Badge>
            {(character as any).weightTier && (
              <Badge className={`text-[10px] ${(character as any).weightTier === 'A' ? 'bg-amber-100 text-amber-800' : (character as any).weightTier === 'B' ? 'bg-blue-100 text-blue-800' : 'bg-zinc-100 text-zinc-800'}`}>
                Tier {(character as any).weightTier}
              </Badge>
            )}
          </div>
        </div>
      </div>

      <Separator />

      {/* Validation status */}
      {validationIssues.length > 0 ? (
        <div className="rounded-md bg-amber-50 border border-amber-200 p-3">
          <div className="flex items-center gap-2 mb-1">
            <AlertCircle className="size-4 text-amber-600" />
            <span className="text-sm font-medium text-amber-800">{t('consistencyWarning')}</span>
          </div>
          <ul className="text-xs text-amber-700 space-y-0.5 ml-6">
            {validationIssues.map((issue, i) => (
              <li key={i}>• {issue}</li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="rounded-md bg-emerald-50 border border-emerald-200 p-3 flex items-center gap-2">
          <CheckCircle2 className="size-4 text-emerald-600" />
          <span className="text-sm text-emerald-800">{t('consistencyPassed')}</span>
        </div>
      )}

      {/* Identity Anchors */}
      <div>
        <h3 className="text-sm font-medium mb-3">{t('identityAnchors')}</h3>
        <div className="space-y-2">
          {ANCHOR_LAYERS.map((layer) => {
            const value = anchors[layer.key as keyof IdentityAnchors]
            const isEditing = editing === layer.key

            return (
              <Card key={layer.key} className="py-0 gap-0">
                <CardContent className="p-3">
                  <div className="flex items-start gap-3">
                    <span className="text-lg shrink-0">{layer.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <Label className="text-xs font-medium">{t(layer.labelKey as any)}</Label>
                        {!isEditing && (
                          <Button variant="ghost" size="sm" className="h-5 text-[10px] gap-1" onClick={() => handleStartEdit(layer.key)}>
                            <Pencil className="size-2.5" />
                            {tc('edit')}
                          </Button>
                        )}
                      </div>
                      {isEditing ? (
                        <div className="space-y-2">
                          <Textarea
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            rows={2}
                            className="text-xs"
                            placeholder={t(`${layer.labelKey}Placeholder` as any)}
                          />
                          <div className="flex gap-1">
                            <Button size="sm" className="h-6 text-[10px]" onClick={() => handleSaveAnchor(layer.key)} disabled={saving}>
                              {saving ? <Loader2 className="size-3 animate-spin mr-1" /> : <Save className="size-3 mr-1" />}
                              {tc('save')}
                            </Button>
                            <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={handleCancelEdit}>
                              <X className="size-3 mr-1" />{tc('cancel')}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <p className={`text-xs ${value ? 'text-foreground' : 'text-muted-foreground italic'}`}>
                          {value || t('notSet')}
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>

      <Separator />

      {/* Visual Gallery */}
      <div>
        <h3 className="text-sm font-medium mb-3">{t('visualGallery')}</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {/* Reference image */}
          <Card className="py-0 gap-0 overflow-hidden">
            <div className="h-28 bg-muted/40 flex items-center justify-center">
              {character.imageUrl ? (
                <img src={character.imageUrl} alt={character.name} className="w-full h-full object-cover" />
              ) : (
                <Image className="size-6 text-muted-foreground/30" />
              )}
            </div>
            <CardContent className="p-2">
              <p className="text-[10px] text-center text-muted-foreground">{t('referenceImage')}</p>
            </CardContent>
          </Card>

          {/* Three views */}
          <Card className="py-0 gap-0 overflow-hidden">
            <div className="h-28 bg-muted/40 flex items-center justify-center">
              {(character as any).threeViewsUrl ? (
                <img src={(character as any).threeViewsUrl} alt="three views" className="w-full h-full object-cover" />
              ) : (
                <Image className="size-6 text-muted-foreground/30" />
              )}
            </div>
            <CardContent className="p-2">
              <p className="text-[10px] text-center text-muted-foreground">{t('threeViews')}</p>
            </CardContent>
          </Card>

          {/* Headshot */}
          <Card className="py-0 gap-0 overflow-hidden">
            <div className="h-28 bg-muted/40 flex items-center justify-center">
              <User className="size-6 text-muted-foreground/30" />
            </div>
            <CardContent className="p-2">
              <p className="text-[10px] text-center text-muted-foreground">{t('headshot')}</p>
            </CardContent>
          </Card>

          {/* Wardrobe preview */}
          <Card className="py-0 gap-0 overflow-hidden">
            <div className="h-28 bg-muted/40 flex items-center justify-center">
              {wardrobeUrls.length > 0 ? (
                <img src={wardrobeUrls[0]} alt="wardrobe" className="w-full h-full object-cover" />
              ) : (
                <Image className="size-6 text-muted-foreground/30" />
              )}
            </div>
            <CardContent className="p-2">
              <p className="text-[10px] text-center text-muted-foreground">{t('wardrobe')} ({wardrobeUrls.length})</p>
            </CardContent>
          </Card>
        </div>
      </div>

      <Separator />

      {/* Cross-episode consistency timeline */}
      <div>
        <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
          <Clock className="size-4" />
          {t('consistencyTimeline')}
        </h3>
        <div className="space-y-2">
          {(() => {
            let episodeIds: string[] = []
            try { episodeIds = JSON.parse(character.episodeIds || '[]') } catch {}
            if (episodeIds.length === 0) {
              return <p className="text-xs text-muted-foreground italic">{t('noEpisodeData')}</p>
            }
            return episodeIds.map((epId, idx) => (
              <div key={epId} className="flex items-center gap-3 p-2 rounded-md bg-muted/30">
                <div className="size-6 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary shrink-0">
                  {idx + 1}
                </div>
                <div className="flex-1">
                  <p className="text-xs font-medium">{t('episode', { number: idx + 1 })}</p>
                  <p className="text-[10px] text-muted-foreground">{t('consistentAppearance')}</p>
                </div>
                <ChevronRight className="size-3 text-muted-foreground/40" />
              </div>
            ))
          })()}
        </div>
      </div>
    </div>
  )
}
