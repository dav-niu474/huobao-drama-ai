'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslations } from 'next-intl'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Upload,
  BookOpen,
  Settings2,
  Pencil,
  Palette,
  Brush,
  Film,
  Download,
  Check,
  Lock,
  Loader2,
  ChevronRight,
  ArrowRight,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import type { CreationPhase, PhaseModule } from '@/lib/orchestrator/orchestrator'

// ── Types ──────────────────────────────────────────────────────

interface PhaseInfo {
  phase: CreationPhase
  status: 'locked' | 'active' | 'completed'
  label: string
  description: string
  module: PhaseModule
  moduleLabel: string
  icon: string
}

interface OrchestratorState {
  dramaId: string
  currentPhase: CreationPhase
  phases: PhaseInfo[]
  nextPhase: CreationPhase | null
  canAdvance: boolean
}

// ── Icon mapping ───────────────────────────────────────────────

const ICON_MAP: Record<string, typeof Upload> = {
  Upload,
  BookOpen,
  Settings2,
  Pencil,
  Palette,
  Brush,
  Film,
  Download,
}

// ── Module colors and labels ───────────────────────────────────

const MODULE_CONFIG: Record<
  PhaseModule,
  { color: string; bg: string; border: string; labelKey: string }
> = {
  M1: {
    color: 'text-emerald-500',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/30',
    labelKey: 'M1',
  },
  M2: {
    color: 'text-violet-500',
    bg: 'bg-violet-500/10',
    border: 'border-violet-500/30',
    labelKey: 'M2',
  },
  M3: {
    color: 'text-amber-500',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
    labelKey: 'M3',
  },
}

// ── PhaseTracker Component ─────────────────────────────────────

interface PhaseTrackerProps {
  dramaId: string
}

export function PhaseTracker({ dramaId }: PhaseTrackerProps) {
  const t = useTranslations('orchestrator')
  const { toast } = useToast()
  const [state, setState] = useState<OrchestratorState | null>(null)
  const [loading, setLoading] = useState(true)
  const [advancing, setAdvancing] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  // Fetch orchestrator state
  const fetchState = useCallback(async () => {
    if (!dramaId) return
    try {
      const res = await fetch(`/api/orchestrator?dramaId=${dramaId}`)
      if (!res.ok) throw new Error('Failed to fetch')
      const data = await res.json()
      setState(data)
    } catch (err) {
      console.error('Failed to fetch orchestrator state:', err)
    } finally {
      setLoading(false)
    }
  }, [dramaId])

  useEffect(() => {
    fetchState()
  }, [fetchState])

  // Advance to next phase
  const handleAdvance = async () => {
    if (!dramaId) return
    setAdvancing(true)
    try {
      const res = await fetch('/api/orchestrator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dramaId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || t('advanceError'))

      setState(data)
      toast({ title: t('advanceSuccess') })
    } catch (err) {
      toast({
        title: t('advanceError'),
        description: String(err),
        variant: 'destructive',
      })
    } finally {
      setAdvancing(false)
      setConfirmOpen(false)
    }
  }

  // Loading state
  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-6 w-32 shimmer rounded" />
        <div className="flex gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex-1 h-20 shimmer rounded-lg" />
          ))}
        </div>
      </div>
    )
  }

  if (!state) return null

  const { phases, currentPhase, nextPhase, canAdvance } = state

  // Group phases by module
  const moduleGroups: Record<PhaseModule, PhaseInfo[]> = {
    M1: phases.filter((p) => p.module === 'M1'),
    M2: phases.filter((p) => p.module === 'M2'),
    M3: phases.filter((p) => p.module === 'M3'),
  }

  const completedCount = phases.filter((p) => p.status === 'completed').length
  const overallPercent = Math.round((completedCount / 8) * 100)

  return (
    <TooltipProvider delayDuration={300}>
      <div className="space-y-4">
        {/* Header with overall progress */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium text-foreground">
              {t('title')}
            </h3>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
              {completedCount}/8
            </Badge>
          </div>
          {canAdvance && (
            <Button
              variant="outline"
              size="sm"
              className="h-6 text-[11px] gap-1"
              onClick={() => setConfirmOpen(true)}
              disabled={advancing}
            >
              {advancing ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <ChevronRight className="size-3" />
              )}
              {t('advance')}
            </Button>
          )}
        </div>

        {/* Overall progress bar */}
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-emerald-500 via-violet-500 to-amber-500 rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${overallPercent}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          />
        </div>

        {/* Three module sections */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {(['M1', 'M2', 'M3'] as PhaseModule[]).map((mod) => {
            const config = MODULE_CONFIG[mod]
            const groupPhases = moduleGroups[mod]
            const isActive = groupPhases.some((p) => p.status === 'active')
            const isCompleted = groupPhases.every(
              (p) => p.status === 'completed'
            )

            return (
              <div
                key={mod}
                className={`
                  rounded-xl border p-3 transition-all duration-200
                  ${isActive ? `${config.bg} ${config.border} shadow-sm` : isCompleted ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-muted/20 border-border/30'}
                `}
              >
                {/* Module header */}
                <div className="flex items-center gap-1.5 mb-2">
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${config.color} ${config.bg}`}
                  >
                    {mod}
                  </span>
                  <span className="text-[11px] font-medium text-foreground/80">
                    {t(config.labelKey as any)}
                  </span>
                  {isCompleted && (
                    <Check className="size-3 text-emerald-500 ml-auto" />
                  )}
                </div>

                {/* Phase items */}
                <div className="space-y-1.5">
                  {groupPhases.map((phase, idx) => {
                    const Icon = ICON_MAP[phase.icon] || Upload
                    const phaseKey = phase.phase as string

                    return (
                      <div key={phase.phase}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div
                              className={`
                                flex items-center gap-2 px-2 py-1.5 rounded-lg text-[11px] transition-all
                                ${phase.status === 'active' ? `${config.bg} font-medium` : phase.status === 'completed' ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground/60'}
                              `}
                            >
                              {/* Status icon */}
                              <div
                                className={`
                                  size-5 rounded flex items-center justify-center flex-shrink-0
                                  ${phase.status === 'active' ? config.bg : phase.status === 'completed' ? 'bg-emerald-500/20' : 'bg-muted/40'}
                                `}
                              >
                                {phase.status === 'completed' ? (
                                  <Check
                                    className={`size-3 ${phase.status === 'completed' ? 'text-emerald-500' : ''}`}
                                  />
                                ) : phase.status === 'active' ? (
                                  <Icon
                                    className={`size-3 ${config.color}`}
                                  />
                                ) : (
                                  <Lock className="size-2.5 text-muted-foreground/40" />
                                )}
                              </div>

                              {/* Phase name */}
                              <span className="truncate">
                                {t(phaseKey as any)}
                              </span>

                              {/* Active indicator */}
                              {phase.status === 'active' && (
                                <motion.div
                                  className="ml-auto"
                                  animate={{ opacity: [1, 0.4, 1] }}
                                  transition={{
                                    duration: 2,
                                    repeat: Infinity,
                                    ease: 'easeInOut',
                                  }}
                                >
                                  <span
                                    className={`size-1.5 rounded-full ${config.color.replace('text-', 'bg-')}`}
                                  />
                                </motion.div>
                              )}

                              {/* Status badge */}
                              {phase.status === 'completed' && (
                                <Badge
                                  variant="outline"
                                  className="text-[8px] px-1 py-0 h-3.5 border-emerald-500/30 text-emerald-500 ml-auto"
                                >
                                  {t('status_completed')}
                                </Badge>
                              )}
                              {phase.status === 'active' && (
                                <Badge
                                  variant="outline"
                                  className={`text-[8px] px-1 py-0 h-3.5 ${config.border} ${config.color} ml-auto`}
                                >
                                  {t('status_active')}
                                </Badge>
                              )}
                              {phase.status === 'locked' && (
                                <Badge
                                  variant="outline"
                                  className="text-[8px] px-1 py-0 h-3.5 border-border/30 text-muted-foreground/40 ml-auto"
                                >
                                  {t('status_locked')}
                                </Badge>
                              )}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="bottom" className="text-xs">
                            {t(phaseKey as any)}
                          </TooltipContent>
                        </Tooltip>

                        {/* Connector line between phases in same module */}
                        {idx < groupPhases.length - 1 && (
                          <div className="ml-[1.1rem] h-1.5 flex items-center">
                            <div
                              className={`w-px h-full ${
                                phase.status === 'completed'
                                  ? 'bg-emerald-500/40'
                                  : 'bg-border/30'
                              }`}
                            />
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        {/* Advance confirmation dialog */}
        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>{t('advance')}</DialogTitle>
              <DialogDescription>{t('advanceConfirm')}</DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmOpen(false)}
              >
                {t('cancel') || '取消'}
              </Button>
              <Button
                size="sm"
                onClick={handleAdvance}
                disabled={advancing}
              >
                {advancing && <Loader2 className="size-3.5 animate-spin mr-1" />}
                {t('advance')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  )
}
