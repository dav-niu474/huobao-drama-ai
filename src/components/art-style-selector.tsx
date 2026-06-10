'use client'

import { useEffect, useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { api } from '@/lib/api'
import type { ArtStyle } from '@/lib/store'
import { useToast } from '@/hooks/use-toast'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Loader2, Palette, Check, X } from 'lucide-react'

interface ArtStyleSelectorProps {
  /** Currently selected art style key */
  selectedKey: string | null
  /** Called when user confirms selection */
  onSelect: (key: string | null) => void
  /** Called when user cancels */
  onCancel: () => void
}

export function ArtStyleSelector({ selectedKey, onSelect, onCancel }: ArtStyleSelectorProps) {
  const t = useTranslations('artStyle')
  const tc = useTranslations('common')
  const { toast } = useToast()

  const [artStyles, setArtStyles] = useState<ArtStyle[]>([])
  const [loading, setLoading] = useState(true)
  const [previewStyle, setPreviewStyle] = useState<ArtStyle | null>(null)
  const [tempSelected, setTempSelected] = useState<string | null>(selectedKey)

  const fetchArtStyles = useCallback(async () => {
    setLoading(true)
    try {
      const styles = await api.artStyles.list()
      setArtStyles(styles)
    } catch (err: any) {
      toast({ title: t('loadFailed'), description: err.message, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [toast, t])

  useEffect(() => {
    fetchArtStyles()
  }, [fetchArtStyles])

  const handleConfirm = () => {
    onSelect(tempSelected)
  }

  const handleClear = () => {
    setTempSelected(null)
    setPreviewStyle(null)
  }

  const categoryGroups = artStyles.reduce<Record<string, ArtStyle[]>>((acc, style) => {
    const cat = style.category || '2D'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(style)
    return acc
  }, {})

  const categoryLabels: Record<string, string> = {
    '2D': t('category2D'),
    '3D': t('category3D'),
    'realpeople': t('categoryRealpeople'),
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin text-primary" />
        <span className="ml-2 text-sm text-muted-foreground">{tc('loading')}</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
        <div className="flex items-center gap-2">
          <Palette className="size-5 text-primary" />
          <h2 className="text-lg font-semibold">{t('selectTitle')}</h2>
        </div>
        <div className="flex items-center gap-2">
          {tempSelected && (
            <Button variant="ghost" size="sm" onClick={handleClear} className="text-xs h-7">
              <X className="size-3 mr-1" />
              {t('clearSelection')}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onCancel} className="h-7">
            {tc('cancel')}
          </Button>
          <Button size="sm" onClick={handleConfirm} className="h-7 amber-glow">
            <Check className="size-3 mr-1" />
            {tc('confirm')}
          </Button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Style grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {Object.entries(categoryGroups).map(([category, styles]) => (
            <div key={category} className="mb-6">
              <h3 className="text-sm font-medium text-muted-foreground mb-3">
                {categoryLabels[category] || category}
                <Badge variant="secondary" className="ml-2 text-[10px]">
                  {styles.length}
                </Badge>
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {styles.map((style) => (
                  <Card
                    key={style.id}
                    className={`cursor-pointer transition-all duration-200 py-0 gap-0 overflow-hidden ${
                      tempSelected === style.key
                        ? 'border-primary ring-2 ring-primary/30'
                        : 'border-border/60 hover:border-primary/40'
                    } ${!style.isActive ? 'opacity-50' : ''}`}
                    onClick={() => {
                      if (style.isActive) {
                        setTempSelected(style.key)
                        setPreviewStyle(style)
                      }
                    }}
                  >
                    {/* Preview image */}
                    <div className="relative h-24 bg-muted/40 overflow-hidden">
                      {style.previewUrl ? (
                        <img
                          src={style.previewUrl}
                          alt={style.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Palette className="size-8 text-muted-foreground/30" />
                        </div>
                      )}
                      {tempSelected === style.key && (
                        <div className="absolute top-1.5 right-1.5 size-5 rounded-full bg-primary flex items-center justify-center">
                          <Check className="size-3 text-primary-foreground" />
                        </div>
                      )}
                      {!style.isActive && (
                        <Badge variant="secondary" className="absolute bottom-1.5 left-1.5 text-[9px] px-1 py-0">
                          {t('disabled')}
                        </Badge>
                      )}
                    </div>
                    <CardContent className="p-2">
                      <p className="text-xs font-medium truncate">{style.name}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{style.category}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}

          {artStyles.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Palette className="size-10 mb-3 opacity-30" />
              <p className="text-sm">{t('noStyles')}</p>
            </div>
          )}
        </div>

        {/* Preview panel */}
        {previewStyle && (
          <div className="hidden md:block w-72 border-l border-border/50 p-4 overflow-y-auto">
            <h3 className="font-semibold mb-2">{previewStyle.name}</h3>
            <Badge variant="outline" className="text-[10px] mb-3">
              {categoryLabels[previewStyle.category] || previewStyle.category}
            </Badge>

            {previewStyle.description && (
              <p className="text-xs text-muted-foreground mb-3">{previewStyle.description}</p>
            )}

            {previewStyle.previewUrl && (
              <div className="rounded-lg overflow-hidden border border-border/50 mb-3">
                <img src={previewStyle.previewUrl} alt={previewStyle.name} className="w-full" />
              </div>
            )}

            {previewStyle.prefixMd && (
              <div className="mb-3">
                <h4 className="text-xs font-medium mb-1">{t('stylePrefix')}</h4>
                <div className="rounded-md bg-muted/40 p-2 text-[10px] max-h-40 overflow-y-auto whitespace-pre-wrap">
                  {previewStyle.prefixMd.slice(0, 500)}...
                </div>
              </div>
            )}

            {previewStyle.styleMeta && (
              <div>
                <h4 className="text-xs font-medium mb-1">{t('styleMeta')}</h4>
                <pre className="rounded-md bg-muted/40 p-2 text-[10px] max-h-32 overflow-y-auto">
                  {JSON.stringify(JSON.parse(previewStyle.styleMeta), null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
