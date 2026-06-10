'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Slider } from '@/components/ui/slider'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { ChevronDown, Lock, Lightbulb, CheckCircle, Anchor, Shield } from 'lucide-react'
import { api } from '@/lib/api'

interface PaywallConfigProps {
  dramaId: string
  showPlanLocked: boolean
  totalEpisodes?: number
}

interface PaywallData {
  freeEpisodes: number
  hookEpisodes: number[]
  payStart: number
  aiSuggestedHooks?: number[]
}

export function PaywallConfig({ dramaId, showPlanLocked, totalEpisodes = 80 }: PaywallConfigProps) {
  const t = useTranslations('paywallConfig')
  const [open, setOpen] = useState(true)
  const [data, setData] = useState<PaywallData>({
    freeEpisodes: 5,
    hookEpisodes: [3, 5],
    payStart: 6,
  })
  const [loading, setLoading] = useState(true)
  const [aiSuggested, setAiSuggested] = useState<number[]>([])

  const fetchData = useCallback(async () => {
    try {
      const plan = await api.showPlan.get(dramaId)
      if (plan.paywallConfig) {
        setData({
          freeEpisodes: plan.paywallConfig.freeEpisodes ?? 5,
          hookEpisodes: plan.paywallConfig.hookEpisodes ?? [],
          payStart: plan.paywallConfig.payStart ?? 6,
        })
        if (plan.novelAnalysis?.paywallCandidates?.hookEpisodes) {
          setAiSuggested(plan.novelAnalysis.paywallCandidates.hookEpisodes)
        }
      }
    } catch {
      // No plan yet — use defaults
    } finally {
      setLoading(false)
    }
  }, [dramaId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const toggleHook = (ep: number) => {
    if (showPlanLocked) return
    setData((prev) => ({
      ...prev,
      hookEpisodes: prev.hookEpisodes.includes(ep)
        ? prev.hookEpisodes.filter((e) => e !== ep)
        : [...prev.hookEpisodes, ep].sort((a, b) => a - b),
    }))
  }

  const handleFreeEpisodesChange = (value: number[]) => {
    if (showPlanLocked) return
    const newFree = value[0]
    setData((prev) => ({
      ...prev,
      freeEpisodes: newFree,
      payStart: newFree + 1,
      // Remove hook episodes that are now in the pay zone but were free
      hookEpisodes: prev.hookEpisodes,
    }))
  }

  const displayCount = Math.min(totalEpisodes, 30) // Show max 30 episodes in the visual map

  const getEpisodeType = (ep: number): 'free' | 'hook' | 'pay' => {
    if (ep <= data.freeEpisodes) {
      return data.hookEpisodes.includes(ep) ? 'hook' : 'free'
    }
    return data.hookEpisodes.includes(ep) ? 'hook' : 'pay'
  }

  const typeStyles: Record<string, string> = {
    free: 'bg-emerald-500/20 text-emerald-600 border-emerald-500/30',
    hook: 'bg-amber-500/20 text-amber-600 border-amber-500/30',
    pay: 'bg-red-500/20 text-red-600 border-red-500/30',
  }

  const typeIcons: Record<string, typeof CheckCircle> = {
    free: CheckCircle,
    hook: Anchor,
    pay: Shield,
  }

  if (loading) {
    return (
      <Card className="py-0 gap-0">
        <CardHeader className="p-4 pb-2">
          <div className="h-5 w-40 shimmer rounded" />
        </CardHeader>
        <CardContent className="p-4 pt-2">
          <div className="h-32 shimmer rounded" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className="py-0 gap-0">
        <CollapsibleTrigger asChild>
          <CardHeader className="p-4 pb-2 cursor-pointer hover:bg-muted/20 transition-colors rounded-t-lg">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Lock className="size-4" />
                {t('title')}
                {showPlanLocked && (
                  <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-3.5 border-amber-500/30 text-amber-500">
                    {t('locked')}
                  </Badge>
                )}
              </CardTitle>
              <ChevronDown className={`size-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="p-4 pt-2 space-y-4">
            {/* Stats summary */}
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-lg bg-emerald-500/10 p-2">
                <div className="text-lg font-bold text-emerald-600">{data.freeEpisodes}</div>
                <div className="text-[10px] text-muted-foreground">{t('freeEpisodes')}</div>
              </div>
              <div className="rounded-lg bg-amber-500/10 p-2">
                <div className="text-lg font-bold text-amber-600">{data.hookEpisodes.length}</div>
                <div className="text-[10px] text-muted-foreground">{t('hookEpisodes')}</div>
              </div>
              <div className="rounded-lg bg-red-500/10 p-2">
                <div className="text-lg font-bold text-red-600">{totalEpisodes - data.freeEpisodes}</div>
                <div className="text-[10px] text-muted-foreground">{t('payEpisodes')}</div>
              </div>
            </div>

            {/* Free episode slider */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground">{t('freeEpCount')}</span>
                <span className="text-xs font-medium">{data.freeEpisodes}</span>
              </div>
              <Slider
                value={[data.freeEpisodes]}
                onValueChange={handleFreeEpisodesChange}
                min={1}
                max={Math.min(20, totalEpisodes)}
                step={1}
                disabled={showPlanLocked}
              />
            </div>

            {/* Episode map */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium">{t('episodeMap')}</span>
                <div className="flex items-center gap-3 text-[10px]">
                  <span className="flex items-center gap-1">
                    <span className="size-2.5 rounded-full bg-emerald-500/30" />
                    {t('freeLabel')}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="size-2.5 rounded-full bg-amber-500" />
                    {t('hookLabel')}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="size-2.5 rounded-full bg-red-500/30" />
                    {t('payLabel')}
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap gap-1">
                {Array.from({ length: displayCount }, (_, i) => i + 1).map((ep) => {
                  const type = getEpisodeType(ep)
                  const Icon = typeIcons[type]
                  return (
                    <button
                      key={ep}
                      onClick={() => toggleHook(ep)}
                      disabled={showPlanLocked}
                      className={`
                        size-8 rounded-lg text-[11px] font-medium transition-all flex items-center justify-center border
                        ${typeStyles[type]}
                        ${!showPlanLocked ? 'cursor-pointer hover:scale-110' : 'cursor-default'}
                        ${type === 'hook' ? 'ring-1 ring-amber-500/40' : ''}
                      `}
                      title={`Ep ${ep}: ${type === 'free' ? t('freeLabel') : type === 'hook' ? t('hookLabel') : t('payLabel')}`}
                    >
                      {type === 'hook' ? <Anchor className="size-3" /> : ep}
                    </button>
                  )
                })}
                {totalEpisodes > displayCount && (
                  <div className="size-8 rounded-lg bg-muted/30 flex items-center justify-center text-[10px] text-muted-foreground">
                    +{totalEpisodes - displayCount}
                  </div>
                )}
              </div>
            </div>

            {/* AI-suggested hook points */}
            {aiSuggested.length > 0 && (
              <div className="rounded-lg bg-primary/5 border border-primary/20 p-3">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Lightbulb className="size-3.5 text-primary" />
                  <span className="text-xs font-medium">{t('aiSuggested')}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {aiSuggested.map((ep) => (
                    <Badge
                      key={ep}
                      variant="outline"
                      className="text-[10px] px-1.5 py-0 h-4 cursor-pointer hover:bg-primary/10"
                      onClick={() => toggleHook(ep)}
                    >
                      Ep {ep}
                    </Badge>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground mt-1.5">
                  {t('clickToToggle')}
                </p>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  )
}
