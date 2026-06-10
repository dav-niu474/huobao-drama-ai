'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useAppStore, type Character, type Scene, type Prop } from '@/lib/store'
import { api, type ArtStyleInfo } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  Palette,
  Loader2,
  Check,
  ChevronRight,
  Sparkles,
  Play,
  Zap,
  Eye,
  Users,
  Mountain,
  Package,
  ArrowRight,
  Filter,
  Search,
  Lock,
  Unlock,
} from 'lucide-react'
import { Input } from '@/components/ui/input'

// ── Types ──────────────────────────────────────────────────

type M2Step = 'extraction' | 'art_direction' | 'character_design'

interface SSEProgress {
  step: string
  message: string
  progress: number
  detail?: {
    batch?: number
    totalBatches?: number
    [key: string]: unknown
  }
  result?: {
    characters: number
    scenes: number
    props: number
    clues: number
    tierSummary: { tierA: number; tierB: number; tierC: number }
  }
}

interface ExtractionStatus {
  dramaId: string
  status: string
  assetStatus: string
  currentPhase: string
  counts: {
    characters: number
    scenes: number
    props: number
    clues: number
  }
  tierSummary: {
    tierA: number
    tierB: number
    tierC: number
  }
}

// ── Sub-components ─────────────────────────────────────────

function StepIndicator({
  label,
  icon: Icon,
  active,
  completed,
  disabled,
}: {
  label: string
  icon: typeof Eye
  active: boolean
  completed: boolean
  disabled: boolean
}) {
  return (
    <div
      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all border ${
        active
          ? 'bg-amber-500/15 text-amber-600 border-amber-500/30 shadow-sm'
          : completed
          ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30'
          : disabled
          ? 'bg-muted/30 text-muted-foreground border-border/30 cursor-not-allowed'
          : 'bg-muted/50 text-muted-foreground border-border/50'
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
    </div>
  )
}

function WeightTierBadge({ tier }: { tier: string }) {
  const config: Record<string, { emoji: string; label: string; color: string }> = {
    A: { emoji: '🅰️', label: 'Tier-A (核心)', color: 'text-amber-600 border-amber-300' },
    B: { emoji: '🅱️', label: 'Tier-B (重要)', color: 'text-blue-600 border-blue-300' },
    C: { emoji: '🅲', label: 'Tier-C (辅助)', color: 'text-muted-foreground border-border' },
  }
  const c = config[tier] || config.C
  return (
    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${c.color}`}>
      {c.emoji} {c.label}
    </Badge>
  )
}

// ── Main Component ─────────────────────────────────────────

export function AssetWorkbenchV2() {
  const navigateToProject = useAppStore((s) => s.navigateToProject)
  const navigateBackToCreative = useAppStore((s) => s.navigateBackToCreative)
  const navigateToScriptWorkbench = useAppStore((s) => s.navigateToScriptWorkbench)
  const selectedDramaId = useAppStore((s) => s.selectedDramaId)
  const currentDrama = useAppStore((s) => s.currentDrama)
  const setCurrentDrama = useAppStore((s) => s.setCurrentDrama)
  const { toast } = useToast()

  // ── State ──
  const [m2Step, setM2Step] = useState<M2Step>('extraction')
  const [extracting, setExtracting] = useState(false)
  const [extractionProgress, setExtractionProgress] = useState(0)
  const [statusMessage, setStatusMessage] = useState('')
  const [extractionStatus, setExtractionStatus] = useState<ExtractionStatus | null>(null)
  const [drama, setDrama] = useState<any>(null)

  // Art style state
  const [artStyles, setArtStyles] = useState<ArtStyleInfo[]>([])
  const [selectedStyle, setSelectedStyle] = useState<string | null>(null)
  const [applyingStyle, setApplyingStyle] = useState(false)

  // Filter
  const [typeFilter, setTypeFilter] = useState<'all' | 'character' | 'scene' | 'prop'>('all')
  const [searchQuery, setSearchQuery] = useState('')

  // ── Refs ──
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  // ── Data Loading ──
  const loadDrama = useCallback(async () => {
    if (!selectedDramaId) return
    try {
      const d = await api.dramas.get(selectedDramaId)
      setDrama(d)
      setCurrentDrama(d)
      setSelectedStyle(d.artStyle)
    } catch {
      // Ignore
    }
  }, [selectedDramaId, setCurrentDrama])

  const loadExtractionStatus = useCallback(async () => {
    if (!selectedDramaId) return
    try {
      const res = await fetch(`/api/dramas/${selectedDramaId}/extract-assets-v2`)
      if (res.ok) {
        const data = await res.json()
        setExtractionStatus(data)
        // Update m2Step based on status
        if (data.status === 'completed') {
          setM2Step('art_direction')
        } else if (data.status === 'extracting') {
          setM2Step('extraction')
          setExtracting(true)
        }
      }
    } catch {
      // Ignore
    }
  }, [selectedDramaId])

  const loadArtStyles = useCallback(async () => {
    if (!selectedDramaId) return
    try {
      const result = await api.artStyle.list(selectedDramaId)
      setArtStyles(result.styles)
    } catch {
      // Ignore
    }
  }, [selectedDramaId])

  useEffect(() => {
    loadDrama()
    loadExtractionStatus()
    loadArtStyles()
  }, [loadDrama, loadExtractionStatus, loadArtStyles])

  // Update m2Step based on drama state
  useEffect(() => {
    if (currentDrama?.assetExtractionStatus === 'completed') {
      if (currentDrama?.artStyle) {
        setM2Step('character_design')
      } else {
        setM2Step('art_direction')
      }
    }
  }, [currentDrama?.assetExtractionStatus, currentDrama?.artStyle])

  // ── Computed: Assets ──
  const allAssets = useMemo(() => {
    if (!drama) return { characters: [], scenes: [], props: [] }
    return {
      characters: drama.characters || [],
      scenes: drama.scenes || [],
      props: drama.props || [],
    }
  }, [drama])

  const filteredCharacters = useMemo(() => {
    let chars = allAssets.characters as Character[]
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      chars = chars.filter(c => c.name.toLowerCase().includes(q) || c.appearance?.toLowerCase().includes(q))
    }
    return chars
  }, [allAssets.characters, searchQuery])

  const filteredScenes = useMemo(() => {
    let scenes = allAssets.scenes as Scene[]
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      scenes = scenes.filter(s => s.location.toLowerCase().includes(q) || s.description?.toLowerCase().includes(q))
    }
    return scenes
  }, [allAssets.scenes, searchQuery])

  const filteredProps = useMemo(() => {
    let props = allAssets.props as Prop[]
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      props = props.filter(p => p.name.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q))
    }
    return props
  }, [allAssets.props, searchQuery])

  // ── SSE Extraction ──
  const handleExtract = async () => {
    if (!selectedDramaId) return
    setExtracting(true)
    setExtractionProgress(0)
    setStatusMessage('开始提取...')

    try {
      const res = await fetch(`/api/dramas/${selectedDramaId}/extract-assets-v2`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `提取失败 (${res.status})`)
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
              setExtractionProgress(data.progress || 0)
              setStatusMessage(data.message || '')

              if (data.step === 'error') {
                throw new Error(data.message)
              }
              if (data.step === 'completed') {
                if (mountedRef.current) {
                  toast({ title: '资产提取完成', description: data.message })
                }
              }
            } catch (e) {
              if (e instanceof Error && !e.message.includes('JSON')) throw e
            }
          }
        }
      }

      // Reload status and drama
      await loadExtractionStatus()
      await loadDrama()
    } catch (err: any) {
      if (mountedRef.current) {
        toast({ title: '资产提取失败', description: err.message, variant: 'destructive' })
      }
    } finally {
      if (mountedRef.current) {
        setExtracting(false)
        setExtractionProgress(0)
        setStatusMessage('')
      }
    }
  }

  // ── Art Style ──
  const handleApplyStyle = async () => {
    if (!selectedDramaId || !selectedStyle) return
    setApplyingStyle(true)
    try {
      await api.artStyle.set(selectedDramaId, selectedStyle)
      toast({ title: '风格已应用', description: `当前风格: ${selectedStyle}` })
      await loadDrama()
    } catch (err: any) {
      toast({ title: '设置风格失败', description: err.message, variant: 'destructive' })
    } finally {
      setApplyingStyle(false)
    }
  }

  // ════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════

  const totalAssets = allAssets.characters.length + allAssets.scenes.length + allAssets.props.length

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden">
      {/* ── Top Bar ── */}
      <div className="h-12 border-b border-border flex items-center px-4 gap-3 shrink-0">
        <button
          onClick={navigateBackToCreative}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
        >
          <Palette className="size-3.5" />
          <span className="truncate max-w-24">{currentDrama?.title || '项目'}</span>
        </button>
        <ChevronRight className="size-3.5 text-muted-foreground/50 shrink-0" />
        <button
          onClick={() => navigateToScriptWorkbench(selectedDramaId!)}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          剧本生成
        </button>
        <ChevronRight className="size-3.5 text-muted-foreground/50 shrink-0" />
        <div className="flex items-center gap-1.5">
          <Palette className="size-4 text-amber-500" />
          <span className="text-sm font-medium">资产提取 V2</span>
        </div>
        {extracting && (
          <Badge variant="outline" className="ml-auto text-[10px] px-2 py-0 text-amber-600 border-amber-300">
            <Loader2 className="size-3 mr-1 animate-spin" />
            {statusMessage || '提取中...'}
          </Badge>
        )}
        {!extracting && <div className="ml-auto" />}
        {extractionStatus?.status === 'completed' && (
          <Badge variant="outline" className="text-[10px] px-2 py-0 text-emerald-600 border-emerald-300">
            <Check className="size-3 mr-0.5" />已完成
          </Badge>
        )}
      </div>

      {/* ── Main Content ── */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="p-4 max-w-5xl mx-auto space-y-6">
          {/* ── M2 Asset Gate ── */}
          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Zap className="size-4 text-amber-500" />
                M2 资产准备
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row gap-3">
                <StepIndicator
                  label="资产提取"
                  icon={Package}
                  active={m2Step === 'extraction'}
                  completed={currentDrama?.assetExtractionStatus === 'completed'}
                  disabled={false}
                />
                <div className="hidden sm:flex items-center text-muted-foreground/30">
                  <ChevronRight className="size-4" />
                </div>
                <StepIndicator
                  label="画风定调"
                  icon={Palette}
                  active={m2Step === 'art_direction'}
                  completed={!!currentDrama?.artStyle}
                  disabled={currentDrama?.assetExtractionStatus !== 'completed'}
                />
                <div className="hidden sm:flex items-center text-muted-foreground/30">
                  <ChevronRight className="size-4" />
                </div>
                <StepIndicator
                  label="角色定妆"
                  icon={Users}
                  active={m2Step === 'character_design'}
                  completed={false}
                  disabled={!currentDrama?.artStyle}
                />
              </div>
            </CardContent>
          </Card>

          {/* ── Extract Button ── */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <Button
              size="lg"
              className="gap-2 min-w-[200px]"
              onClick={handleExtract}
              disabled={extracting || currentDrama?.scriptGenerationStatus !== 'completed' || currentDrama?.assetExtractionStatus === 'completed'}
            >
              {extracting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {statusMessage || '提取中...'}
                </>
              ) : currentDrama?.assetExtractionStatus === 'completed' ? (
                <>
                  <Check className="size-4" />
                  资产已提取
                </>
              ) : (
                <>
                  <Play className="size-4" />
                  一键提取全部资产
                </>
              )}
            </Button>
            {extractionStatus && (
              <div className="text-xs text-muted-foreground">
                角色 {extractionStatus.counts.characters} · 场景 {extractionStatus.counts.scenes} · 道具 {extractionStatus.counts.props} · 线索 {extractionStatus.counts.clues}
              </div>
            )}
          </div>

          {/* ── Progress Bar ── */}
          {extracting && extractionProgress > 0 && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span>{statusMessage}</span>
                <span>{extractionProgress}%</span>
              </div>
              <Progress value={extractionProgress} className="h-2" />
            </div>
          )}

          {/* ── Weight Tier Summary ── */}
          {extractionStatus && extractionStatus.status === 'completed' && (
            <Card className="border-border/50">
              <CardContent className="py-4">
                <div className="flex items-center gap-4 flex-wrap">
                  <span className="text-xs font-medium text-muted-foreground">权重分布:</span>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-amber-600 border-amber-300">
                      🅰️ 核心: {extractionStatus.tierSummary.tierA}
                    </Badge>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-blue-600 border-blue-300">
                      🅱️ 重要: {extractionStatus.tierSummary.tierB}
                    </Badge>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground border-border">
                      🅲 辅助: {extractionStatus.tierSummary.tierC}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── Art Style Quick Select ── */}
          {currentDrama?.assetExtractionStatus === 'completed' && (
            <Card className="border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Palette className="size-4 text-amber-500" />
                  画风定调
                  {currentDrama?.artStyle && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-emerald-600 border-emerald-300 ml-2">
                      <Check className="size-3 mr-0.5" />已选
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-48 overflow-y-auto">
                  {artStyles.map((style) => (
                    <button
                      key={style.key}
                      className={`relative p-3 rounded-lg border text-left transition-all hover:bg-muted/50 ${
                        selectedStyle === style.key
                          ? 'border-amber-500 bg-amber-500/10 ring-1 ring-amber-500/30'
                          : 'border-border/50'
                      }`}
                      onClick={() => setSelectedStyle(style.key)}
                    >
                      <div className="size-full min-h-[36px] rounded-md bg-gradient-to-br from-muted/80 to-muted/40 flex items-center justify-center mb-2">
                        <Palette className="size-4 text-muted-foreground/60" />
                      </div>
                      <div className="text-[10px] font-medium leading-tight truncate">{style.name}</div>
                      {selectedStyle === style.key && (
                        <div className="absolute top-1.5 right-1.5 size-4 rounded-full bg-amber-500 flex items-center justify-center">
                          <Check className="size-2.5 text-white" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
                <div className="mt-3">
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs gap-1.5"
                    onClick={handleApplyStyle}
                    disabled={!selectedStyle || applyingStyle || currentDrama?.artStyle === selectedStyle}
                  >
                    {applyingStyle ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
                    应用风格
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── Extraction Results ── */}
          {totalAssets > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">提取结果</h3>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3 text-muted-foreground" />
                    <Input
                      placeholder="搜索..."
                      className="h-7 text-xs pl-7 w-40"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                  <div className="flex gap-1">
                    {(['all', 'character', 'scene', 'prop'] as const).map((type) => {
                      const count = type === 'all'
                        ? totalAssets
                        : type === 'character'
                        ? filteredCharacters.length
                        : type === 'scene'
                        ? filteredScenes.length
                        : filteredProps.length
                      return (
                        <button
                          key={type}
                          className={`px-2 py-1 rounded-md text-[10px] font-medium transition-colors border ${
                            typeFilter === type
                              ? 'bg-amber-500/15 text-amber-600 border-amber-500/30'
                              : 'bg-muted/50 text-muted-foreground border-transparent hover:bg-muted'
                          }`}
                          onClick={() => setTypeFilter(type)}
                        >
                          {type === 'all' ? '全部' : type === 'character' ? '角色' : type === 'scene' ? '场景' : '道具'} ({count})
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>

              {/* Characters */}
              {(typeFilter === 'all' || typeFilter === 'character') && filteredCharacters.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    <Users className="size-3" /> 角色 ({filteredCharacters.length})
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {filteredCharacters.map((char: Character) => (
                      <Card key={char.id} className="border-border/50 py-0 gap-0">
                        <CardContent className="py-3 px-4">
                          <div className="flex items-start gap-2">
                            <div className="size-10 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0 text-blue-500 font-bold text-xs">
                              {char.name.slice(0, 1)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-medium">{char.name}</span>
                                <WeightTierBadge tier={char.weightTier || 'C'} />
                              </div>
                              <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">
                                {char.appearance || char.personality || '暂无描述'}
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {/* Scenes */}
              {(typeFilter === 'all' || typeFilter === 'scene') && filteredScenes.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    <Mountain className="size-3" /> 场景 ({filteredScenes.length})
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {filteredScenes.map((scene: Scene) => {
                      let epCount = 0
                      try {
                        epCount = JSON.parse(scene.episodeIds || '[]').length
                      } catch {}
                      return (
                        <Card key={scene.id} className="border-border/50 py-0 gap-0">
                          <CardContent className="py-3 px-4">
                            <div className="flex items-start gap-2">
                              <div className="size-10 rounded-md bg-emerald-500/10 flex items-center justify-center shrink-0">
                                <Mountain className="size-4 text-emerald-500" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs font-medium">{scene.location}</span>
                                  {epCount > 0 && (
                                    <Badge variant="outline" className="text-[10px] px-1 py-0 text-muted-foreground">
                                      {epCount}集出现
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">
                                  {scene.description || '暂无描述'}
                                </p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Props */}
              {(typeFilter === 'all' || typeFilter === 'prop') && filteredProps.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    <Package className="size-3" /> 道具 ({filteredProps.length})
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {filteredProps.map((prop: Prop) => (
                      <Card key={prop.id} className="border-border/50 py-0 gap-0">
                        <CardContent className="py-3 px-4">
                          <div className="flex items-start gap-2">
                            <div className="size-10 rounded-md bg-orange-500/10 flex items-center justify-center shrink-0">
                              <Package className="size-4 text-orange-500" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-medium">{prop.name}</span>
                                <Badge variant="outline" className="text-[10px] px-1 py-0 text-muted-foreground">
                                  {prop.category || '其他'}
                                </Badge>
                              </div>
                              <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">
                                {prop.description || '暂无描述'}
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Empty state ── */}
          {totalAssets === 0 && !extracting && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Package className="size-12 text-amber-500/30 mb-4" />
              <h3 className="text-sm font-medium mb-1">资产提取工作台 V2</h3>
              <p className="text-xs text-muted-foreground max-w-xs">
                {currentDrama?.scriptGenerationStatus === 'completed'
                  ? '剧本已就绪，点击"一键提取全部资产"开始提取'
                  : '请先完成剧本生成，然后提取角色、场景和道具资产'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
