'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAppStore } from '@/lib/store'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Textarea } from '@/components/ui/textarea'
import {
  BookOpen,
  FileText,
  Loader2,
  Check,
  ChevronRight,
  Sparkles,
  Play,
  Zap,
  Eye,
  Lock,
  Unlock,
  AlertCircle,
} from 'lucide-react'

// ── Types ──────────────────────────────────────────────────

type M1Step = 'analysis' | 'planning' | 'generation'

interface EpisodeOutline {
  episodeNumber: number
  title: string
  sourceChapterIds: number[]
  coreEvent: string
  hook?: string
  type: 'free' | 'hook' | 'pay'
}

interface SSEProgress {
  step: string
  message: string
  progress: number
  detail?: {
    episodeNumber?: number
    title?: string
    type?: string
    current?: number
    total?: number
    episodeCount?: number
  }
}

interface GenerationStatus {
  dramaId: string
  status: string
  currentPhase: string
  totalEpisodes: number
  episodesGenerated: number
  episodesFailed: number
  progress: number
  episodes: Array<{
    id: string
    episodeNumber: number
    title: string
    scriptStatus: string
    sourceChapterIds: string
  }>
}

// ── Sub-components ─────────────────────────────────────────

function StepIndicator({
  step,
  label,
  icon: Icon,
  active,
  completed,
  disabled,
  onClick,
}: {
  step: M1Step
  label: string
  icon: typeof Eye
  active: boolean
  completed: boolean
  disabled: boolean
  onClick?: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all border ${
        active
          ? 'bg-amber-500/15 text-amber-600 border-amber-500/30 shadow-sm'
          : completed
          ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30'
          : disabled
          ? 'bg-muted/30 text-muted-foreground border-border/30 cursor-not-allowed'
          : 'bg-muted/50 text-muted-foreground border-border/50 hover:bg-muted'
      }`}
    >
      <div className={`size-6 rounded-full flex items-center justify-center shrink-0 ${
        active ? 'bg-amber-500 text-white' :
        completed ? 'bg-emerald-500 text-white' :
        'bg-muted/80'
      }`}>
        {completed ? <Check className="size-3" /> : <Icon className="size-3" />}
      </div>
      <span>{label}</span>
    </button>
  )
}

function EpisodeCard({
  episode,
  isExpanded,
  scriptContent,
  onToggle,
  isLoading,
}: {
  episode: GenerationStatus['episodes'][0]
  isExpanded: boolean
  scriptContent: string | null
  onToggle: () => void
  isLoading: boolean
}) {
  // Determine type from paywall config
  const getType = (): 'free' | 'hook' | 'pay' => {
    // Simple heuristic: parse from sourceChapterIds or title
    if (episode.title?.includes('🔒') || episode.scriptStatus === 'completed') return 'pay'
    return 'free'
  }
  const epType = getType()

  return (
    <Card className="border-border/50 py-0 gap-0">
      <CardHeader
        className="py-3 px-4 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="size-8 rounded-md bg-primary/10 flex items-center justify-center">
              <span className="text-xs font-bold text-primary">
                E{String(episode.episodeNumber).padStart(2, '0')}
              </span>
            </div>
            <div>
              <CardTitle className="text-sm font-medium">{episode.title || `第${episode.episodeNumber}集`}</CardTitle>
              <div className="flex items-center gap-2 mt-0.5">
                {episode.scriptStatus === 'completed' && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-emerald-600 border-emerald-300">
                    <Check className="size-3 mr-0.5" />已完成
                  </Badge>
                )}
                {episode.scriptStatus === 'processing' && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-amber-600 border-amber-300">
                    <Loader2 className="size-3 mr-0.5 animate-spin" />生成中
                  </Badge>
                )}
                {episode.scriptStatus === 'failed' && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-red-600 border-red-300">
                    <AlertCircle className="size-3 mr-0.5" />失败
                  </Badge>
                )}
                {episode.scriptStatus === 'pending' && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">
                    待创作
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <ChevronRight className={`size-4 text-muted-foreground transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`} />
        </div>
      </CardHeader>
      {isExpanded && (
        <CardContent className="pt-0 px-4 pb-4">
          <div className="rounded-lg bg-muted/30 border border-border/50 p-3">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="size-5 animate-spin text-amber-500" />
                <span className="text-xs text-muted-foreground ml-2">加载剧本内容...</span>
              </div>
            ) : scriptContent ? (
              <pre className="whitespace-pre-wrap text-xs leading-relaxed max-h-80 overflow-y-auto">{scriptContent}</pre>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-4">暂无剧本内容</p>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  )
}

// ── Main Component ─────────────────────────────────────────

export function ScriptWorkbenchV2() {
  const selectedDramaId = useAppStore((s) => s.selectedDramaId)
  const navigateToProject = useAppStore((s) => s.navigateToProject)
  const navigateBackToCreative = useAppStore((s) => s.navigateBackToCreative)
  const currentDrama = useAppStore((s) => s.currentDrama)
  const { toast } = useToast()

  // ── State ──
  const [m1Step, setM1Step] = useState<M1Step>('analysis')
  const [generating, setGenerating] = useState(false)
  const [generationProgress, setGenerationProgress] = useState(0)
  const [statusMessage, setStatusMessage] = useState('')
  const [generationStatus, setGenerationStatus] = useState<GenerationStatus | null>(null)
  const [expandedEpisode, setExpandedEpisode] = useState<string | null>(null)
  const [episodeScripts, setEpisodeScripts] = useState<Record<string, string>>({})
  const [loadingScripts, setLoadingScripts] = useState<Record<string, boolean>>({})

  // ── Computed ──
  const showPlanLocked = currentDrama?.showPlanLocked ?? false
  const novelAnalysis = currentDrama?.novelAnalysis
  const scriptGenerationStatus = currentDrama?.scriptGenerationStatus

  // ── Refs ──
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  // ── Load generation status ──
  const loadStatus = useCallback(async () => {
    if (!selectedDramaId) return
    try {
      const res = await fetch(`/api/dramas/${selectedDramaId}/generate-scripts-v2`)
      if (res.ok) {
        const data = await res.json()
        setGenerationStatus(data)
        // Update m1Step based on status
        if (data.status === 'completed') {
          setM1Step('generation')
        } else if (data.status === 'generating') {
          setM1Step('generation')
          setGenerating(true)
        }
      }
    } catch {
      // Ignore
    }
  }, [selectedDramaId])

  useEffect(() => {
    loadStatus()
  }, [loadStatus])

  // Update m1Step based on drama state
  useEffect(() => {
    if (scriptGenerationStatus === 'completed') {
      setM1Step('generation')
    } else if (showPlanLocked) {
      if (novelAnalysis) {
        setM1Step('planning')
      } else {
        setM1Step('analysis')
      }
    }
  }, [showPlanLocked, novelAnalysis, scriptGenerationStatus])

  // ── SSE Generation ──
  const handleGenerate = async () => {
    if (!selectedDramaId) return
    setGenerating(true)
    setGenerationProgress(0)
    setStatusMessage('开始生成...')

    try {
      const res = await fetch(`/api/dramas/${selectedDramaId}/generate-scripts-v2`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `生成失败 (${res.status})`)
      }

      const reader = res.body?.getReader()
      if (!reader) throw new Error('No readable stream')

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data: SSEProgress = JSON.parse(line.slice(6))
              setGenerationProgress(data.progress || 0)
              setStatusMessage(data.message || '')

              if (data.step === 'error') {
                throw new Error(data.message)
              }
              if (data.step === 'completed') {
                if (mountedRef.current) {
                  toast({ title: '剧本生成完成', description: data.message })
                }
              }
            } catch (e) {
              if (e instanceof Error && !e.message.includes('JSON')) throw e
            }
          }
        }
      }

      // Reload status
      await loadStatus()
      // Reload drama to get updated state
      if (selectedDramaId) {
        const updated = await api.dramas.get(selectedDramaId)
        useAppStore.getState().setCurrentDrama(updated)
      }
    } catch (err: any) {
      if (mountedRef.current) {
        toast({ title: '剧本生成失败', description: err.message, variant: 'destructive' })
      }
    } finally {
      if (mountedRef.current) {
        setGenerating(false)
        setGenerationProgress(0)
        setStatusMessage('')
      }
    }
  }

  // ── View episode script ──
  const handleViewEpisode = async (episodeId: string) => {
    if (expandedEpisode === episodeId) {
      setExpandedEpisode(null)
      return
    }
    setExpandedEpisode(episodeId)
    if (!episodeScripts[episodeId]) {
      setLoadingScripts((prev) => ({ ...prev, [episodeId]: true }))
      try {
        const ep = await api.episodes.get(episodeId)
        if (mountedRef.current) {
          setEpisodeScripts((prev) => ({
            ...prev,
            [episodeId]: ep.scriptContent || ep.rawContent || '暂无剧本内容',
          }))
        }
      } catch {
        if (mountedRef.current) {
          setEpisodeScripts((prev) => ({ ...prev, [episodeId]: '加载失败' }))
        }
      } finally {
        if (mountedRef.current) {
          setLoadingScripts((prev) => ({ ...prev, [episodeId]: false }))
        }
      }
    }
  }

  // ── Counts ──
  const completedCount = generationStatus?.episodesGenerated || 0
  const totalCount = generationStatus?.totalEpisodes || generationStatus?.episodes?.length || 0
  const failedCount = generationStatus?.episodesFailed || 0

  // ════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden">
      {/* ── Top Bar ── */}
      <div className="h-12 border-b border-border flex items-center px-4 gap-3 shrink-0">
        <button
          onClick={navigateBackToCreative}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
        >
          <Sparkles className="size-3.5" />
          <span className="truncate max-w-24">{currentDrama?.title || '项目'}</span>
        </button>
        <ChevronRight className="size-3.5 text-muted-foreground/50 shrink-0" />
        <div className="flex items-center gap-1.5">
          <BookOpen className="size-4 text-amber-500" />
          <span className="text-sm font-medium">剧本生成 V2</span>
        </div>
        {generating && (
          <Badge variant="outline" className="ml-auto text-[10px] px-2 py-0 text-amber-600 border-amber-300">
            <Loader2 className="size-3 mr-1 animate-spin" />
            {statusMessage || '生成中...'}
          </Badge>
        )}
        {!generating && <div className="ml-auto" />}
        {scriptGenerationStatus === 'completed' && (
          <Badge variant="outline" className="text-[10px] px-2 py-0 text-emerald-600 border-emerald-300">
            <Check className="size-3 mr-0.5" />已完成
          </Badge>
        )}
      </div>

      {/* ── Main Content ── */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="p-4 max-w-5xl mx-auto space-y-6">
          {/* ── M1 Content Gate ── */}
          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Zap className="size-4 text-amber-500" />
                M1 内容规划
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row gap-3">
                <StepIndicator
                  step="analysis"
                  label="全本理解"
                  icon={Eye}
                  active={m1Step === 'analysis'}
                  completed={!!novelAnalysis}
                  disabled={false}
                />
                <div className="hidden sm:flex items-center text-muted-foreground/30">
                  <ChevronRight className="size-4" />
                </div>
                <StepIndicator
                  step="planning"
                  label="7参数协商"
                  icon={showPlanLocked ? Lock : Unlock}
                  active={m1Step === 'planning'}
                  completed={showPlanLocked}
                  disabled={!novelAnalysis}
                />
                <div className="hidden sm:flex items-center text-muted-foreground/30">
                  <ChevronRight className="size-4" />
                </div>
                <StepIndicator
                  step="generation"
                  label="剧本生成"
                  icon={FileText}
                  active={m1Step === 'generation'}
                  completed={scriptGenerationStatus === 'completed'}
                  disabled={!showPlanLocked}
                />
              </div>

              {/* Status messages for each step */}
              <div className="mt-3 space-y-1">
                {!novelAnalysis && (
                  <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Eye className="size-3" /> 请先完成小说上传和全本理解分析
                  </p>
                )}
                {novelAnalysis && !showPlanLocked && (
                  <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Lock className="size-3" /> 全本理解已完成，请完成 7参数协商并锁定
                  </p>
                )}
                {showPlanLocked && scriptGenerationStatus !== 'completed' && (
                  <p className="text-[10px] text-emerald-600 flex items-center gap-1">
                    <Check className="size-3" /> 7参数已锁定，可以开始一键生成剧本
                  </p>
                )}
                {scriptGenerationStatus === 'completed' && (
                  <p className="text-[10px] text-emerald-600 flex items-center gap-1">
                    <Check className="size-3" /> 剧本生成已完成，可以进入资产提取阶段
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* ── Generate Button ── */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <Button
              size="lg"
              className="gap-2 min-w-[200px]"
              onClick={handleGenerate}
              disabled={!showPlanLocked || generating || scriptGenerationStatus === 'completed'}
            >
              {generating ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {statusMessage || '生成中...'}
                </>
              ) : scriptGenerationStatus === 'completed' ? (
                <>
                  <Check className="size-4" />
                  剧本已生成
                </>
              ) : (
                <>
                  <Play className="size-4" />
                  一键生成全部剧本
                </>
              )}
            </Button>
            {generationStatus && (
              <div className="text-xs text-muted-foreground">
                共 {totalCount} 集 · 已完成 {completedCount} 集
                {failedCount > 0 && ` · 失败 ${failedCount} 集`}
              </div>
            )}
          </div>

          {/* ── Progress Bar ── */}
          {generating && generationProgress > 0 && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span>{statusMessage}</span>
                <span>{generationProgress}%</span>
              </div>
              <Progress value={generationProgress} className="h-2" />
            </div>
          )}

          {/* ── Episode Outline Grid ── */}
          {generationStatus && generationStatus.episodes.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium flex items-center gap-1.5">
                  <FileText className="size-4 text-amber-500" />
                  剧本输出
                </h3>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    🪝 钩子集
                  </Badge>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    🔒 付费集
                  </Badge>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    ✓ 免费集
                  </Badge>
                </div>
              </div>

              {/* Episode grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {generationStatus.episodes.map((ep) => {
                  const typeMarker = ep.scriptStatus === 'completed' ? '✓' : ''
                  return (
                    <Card
                      key={ep.id}
                      className="border-border/50 cursor-pointer hover:border-amber-500/30 transition-colors py-0 gap-0"
                      onClick={() => handleViewEpisode(ep.id)}
                    >
                      <CardHeader className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <div className="size-7 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                            <span className="text-[10px] font-bold text-primary">
                              E{String(ep.episodeNumber).padStart(2, '0')}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium truncate">{ep.title || `第${ep.episodeNumber}集`}</p>
                            <div className="flex items-center gap-1 mt-0.5">
                              {ep.scriptStatus === 'completed' && (
                                <span className="text-[10px] text-emerald-600">✓ 完成</span>
                              )}
                              {ep.scriptStatus === 'failed' && (
                                <span className="text-[10px] text-red-500">✗ 失败</span>
                              )}
                              {ep.scriptStatus === 'pending' && (
                                <span className="text-[10px] text-muted-foreground">待创作</span>
                              )}
                              {ep.scriptStatus === 'processing' && (
                                <span className="text-[10px] text-amber-600">生成中</span>
                              )}
                            </div>
                          </div>
                          <ChevronRight className="size-3.5 text-muted-foreground shrink-0" />
                        </div>
                      </CardHeader>
                    </Card>
                  )
                })}
              </div>

              {/* Expanded episode detail */}
              {expandedEpisode && generationStatus.episodes.find(ep => ep.id === expandedEpisode) && (
                <EpisodeCard
                  episode={generationStatus.episodes.find(ep => ep.id === expandedEpisode)!}
                  isExpanded={true}
                  scriptContent={episodeScripts[expandedEpisode] || null}
                  onToggle={() => setExpandedEpisode(null)}
                  isLoading={!!loadingScripts[expandedEpisode]}
                />
              )}
            </div>
          )}

          {/* ── Empty state ── */}
          {(!generationStatus || generationStatus.episodes.length === 0) && !generating && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Sparkles className="size-12 text-amber-500/30 mb-4" />
              <h3 className="text-sm font-medium mb-1">剧本生成工作台 V2</h3>
              <p className="text-xs text-muted-foreground max-w-xs">
                {showPlanLocked
                  ? '7参数已锁定，点击"一键生成全部剧本"开始生成'
                  : '请先完成全本理解和7参数协商，然后一键生成全部剧本'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
