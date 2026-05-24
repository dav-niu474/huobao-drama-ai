'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useAppStore } from '@/lib/store'
import { api, type Novel } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Progress } from '@/components/ui/progress'
import { Textarea } from '@/components/ui/textarea'
import {
  BookOpen,
  FileText,
  Loader2,
  Check,
  ChevronRight,
  Sparkles,
  Brain,
  Play,
  RotateCcw,
  Zap,
  Eye,
  PenLine,
  BarChart3,
  Clock,
  ListChecks,
  Upload,
} from 'lucide-react'

// ── Types ──────────────────────────────────────────────────

interface ChapterInfo {
  index: number
  title: string
  content: string
}

interface ParsedContent {
  skeleton?: string
  strategy?: string
  skeletonGeneratedAt?: string
  strategyGeneratedAt?: string
  [key: string]: unknown
}

interface EpisodeStatus {
  id: string
  episodeNumber: number
  title: string
  scriptStatus: string
  sourceChapterIds: string
}

// ── Status helpers ────────────────────────────────────────

function statusColor(status: string): string {
  switch (status) {
    case 'completed': return 'bg-emerald-500'
    case 'processing': return 'bg-amber-500'
    case 'failed': return 'bg-red-500'
    default: return 'bg-zinc-500'
  }
}

// ── Preview content type ──────────────────────────────────

type PreviewItem =
  | { type: 'chapter'; index: number; title: string; content: string }
  | { type: 'script'; episodeId: string; episodeNumber: number; title: string; content: string }

// ── Main Component ────────────────────────────────────────

export function ScriptWorkbench() {
  const navigateToProject = useAppStore((s) => s.navigateToProject)
  const selectedDramaId = useAppStore((s) => s.selectedDramaId)
  const currentDrama = useAppStore((s) => s.currentDrama)
  const { toast } = useToast()

  // ── Data state ──
  const [novel, setNovel] = useState<Novel | null>(null)
  const [chapters, setChapters] = useState<ChapterInfo[]>([])
  const [parsedContent, setParsedContent] = useState<ParsedContent>({})
  const [episodes, setEpisodes] = useState<EpisodeStatus[]>([])

  // ── Preview state ──
  const [previewItem, setPreviewItem] = useState<PreviewItem | null>(null)
  const [episodeScripts, setEpisodeScripts] = useState<Record<string, string>>({})
  const [loadingScript, setLoadingScript] = useState(false)

  // ── Skeleton / Strategy editing ──
  const [showSkeleton, setShowSkeleton] = useState(false)
  const [showStrategy, setShowStrategy] = useState(false)
  const [skeletonEdit, setSkeletonEdit] = useState('')
  const [strategyEdit, setStrategyEdit] = useState('')
  const [editingSkeleton, setEditingSkeleton] = useState(false)
  const [editingStrategy, setEditingStrategy] = useState(false)

  // ── Generation states ──
  const [generatingSkeleton, setGeneratingSkeleton] = useState(false)
  const [generatingStrategy, setGeneratingStrategy] = useState(false)
  const [generatingScripts, setGeneratingScripts] = useState(false)
  const [generationProgress, setGenerationProgress] = useState(0)

  // ── Episode range for generation ──
  const [episodeRangeStart, setEpisodeRangeStart] = useState(1)
  const [episodeRangeEnd, setEpisodeRangeEnd] = useState(10)

  // ── Upload state ──
  const [uploading, setUploading] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [parseProgress, setParseProgress] = useState({ current: 0, total: 0, message: '' })
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Computed ──
  const isGenerating = generatingSkeleton || generatingStrategy || generatingScripts
  const completedEpisodes = episodes.filter((ep) => ep.scriptStatus === 'completed').length
  const totalEpisodes = episodes.length || 0
  const progressPercent = totalEpisodes > 0 ? Math.round((completedEpisodes / totalEpisodes) * 100) : 0

  // ── Workflow step logic ──
  const workflowSteps = [
    { label: '上传小说', done: !!novel && novel.parseStatus === 'parsed', active: !novel || novel.parseStatus === 'pending' },
    { label: '解析小说', done: !!novel && novel.parseStatus === 'parsed', active: novel?.parseStatus === 'parsing' },
    { label: '提取故事骨架', done: !!parsedContent.skeleton, active: !!novel?.parseStatus?.includes('pars') && !parsedContent.skeleton },
    { label: '制定改编策略', done: !!parsedContent.strategy, active: !!parsedContent.skeleton && !parsedContent.strategy },
    { label: '生成剧本', done: completedEpisodes > 0, active: !!parsedContent.strategy && completedEpisodes === 0 },
  ]

  // ── Data loading ──
  const loadData = useCallback(async () => {
    if (!selectedDramaId) return
    try {
      const novelRes = await fetch(`/api/novels?dramaId=${selectedDramaId}`)
      if (novelRes.ok) {
        const novelData = await novelRes.json()
        if (novelData) {
          setNovel(novelData)
          setChapters(novelData.chapters || [])
          try {
            const pc = JSON.parse(novelData.parsedContent || '{}')
            setParsedContent(pc)
            if (pc.skeleton) setSkeletonEdit(pc.skeleton)
            if (pc.strategy) setStrategyEdit(pc.strategy)
          } catch { /* ignore */ }
        }
      }
    } catch { /* novel might not exist */ }

    try {
      const status = await api.dramas.getScriptStatus(selectedDramaId)
      setEpisodes(status.episodes)
      if (status.episodes.length > 0) {
        setEpisodeRangeEnd(Math.max(...status.episodes.map((e) => e.episodeNumber)))
      }
    } catch { /* episodes might not exist */ }
  }, [selectedDramaId])

  useEffect(() => {
    loadData()
  }, [loadData])

  // ── Parse Progress Polling ──
  useEffect(() => {
    if (!parsing || !novel) return
    const interval = setInterval(async () => {
      try {
        const status = await api.novels.parseStatus(novel.id)
        setParseProgress({ current: status.current, total: status.total, message: status.message })
        if (status.status === 'parsed') {
          setParsing(false)
          await loadData()
          toast({ title: '小说解析完成' })
        } else if (status.status === 'failed') {
          setParsing(false)
          toast({ title: '小说解析失败', variant: 'destructive' })
        }
      } catch { /* ignore */ }
    }, 2000)
    return () => clearInterval(interval)
  }, [parsing, novel, loadData, toast])

  // ── Handlers ──

  const handleSelectChapter = (ch: ChapterInfo, idx: number) => {
    setPreviewItem({ type: 'chapter', index: idx, title: ch.title, content: ch.content })
  }

  const handleSelectEpisode = async (ep: EpisodeStatus) => {
    if (episodeScripts[ep.id]) {
      setPreviewItem({ type: 'script', episodeId: ep.id, episodeNumber: ep.episodeNumber, title: ep.title || `第${ep.episodeNumber}集`, content: episodeScripts[ep.id] })
      return
    }
    setLoadingScript(true)
    try {
      const epData = await api.episodes.get(ep.id)
      const content = epData.scriptContent || epData.rawContent || '暂无剧本内容'
      setEpisodeScripts((prev) => ({ ...prev, [ep.id]: content }))
      setPreviewItem({ type: 'script', episodeId: ep.id, episodeNumber: ep.episodeNumber, title: ep.title || `第${ep.episodeNumber}集`, content })
    } catch {
      toast({ title: '加载剧本失败', variant: 'destructive' })
    } finally {
      setLoadingScript(false)
    }
  }

  const handleFileUpload = async (file: File) => {
    if (!selectedDramaId) return
    setUploading(true)
    try {
      const result = await api.novels.uploadForDrama(selectedDramaId, file)
      setNovel(result.novel)
      setChapters(result.chapters || [])
      toast({ title: '小说上传成功' })
      setParsing(true)
      setParseProgress({ current: 0, total: 1, message: '开始解析...' })
      await api.novels.parse(result.novel.id)
    } catch (err: any) {
      toast({ title: '上传失败', description: err.message || '请检查文件格式', variant: 'destructive' })
    } finally {
      setUploading(false)
    }
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) await handleFileUpload(file)
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) await handleFileUpload(file)
  }

  const handleGenerateSkeleton = async () => {
    if (!selectedDramaId) return
    setGeneratingSkeleton(true)
    setGenerationProgress(30)
    try {
      const result = await api.dramas.generateSkeleton(selectedDramaId)
      setParsedContent((prev) => ({ ...prev, skeleton: result.skeleton, skeletonGeneratedAt: new Date().toISOString() }))
      setSkeletonEdit(result.skeleton)
      setGenerationProgress(100)
      toast({ title: '故事骨架生成完成' })
    } catch (err: any) {
      toast({ title: '骨架生成失败', description: err.message, variant: 'destructive' })
    } finally {
      setGeneratingSkeleton(false)
      setGenerationProgress(0)
    }
  }

  const handleGenerateStrategy = async () => {
    if (!selectedDramaId) return
    setGeneratingStrategy(true)
    setGenerationProgress(30)
    try {
      const content = editingStrategy ? strategyEdit : parsedContent.skeleton
      const result = await api.dramas.generateStrategy(selectedDramaId, content || '')
      setParsedContent((prev) => ({ ...prev, strategy: result.strategy, strategyGeneratedAt: new Date().toISOString() }))
      setStrategyEdit(result.strategy)
      setGenerationProgress(100)
      toast({ title: '改编策略生成完成' })
    } catch (err: any) {
      toast({ title: '策略生成失败', description: err.message, variant: 'destructive' })
    } finally {
      setGeneratingStrategy(false)
      setGenerationProgress(0)
    }
  }

  const handleGenerateScripts = async () => {
    if (!selectedDramaId) return
    setGeneratingScripts(true)
    setGenerationProgress(10)
    try {
      const skeleton = editingSkeleton ? skeletonEdit : parsedContent.skeleton
      const strategy = editingStrategy ? strategyEdit : parsedContent.strategy
      const result = await api.dramas.generateScripts(selectedDramaId, {
        skeletonContent: skeleton || '',
        strategyContent: strategy || '',
        episodeRange: [episodeRangeStart, episodeRangeEnd],
      })
      setGenerationProgress(100)
      await loadData()
      toast({ title: `剧本生成完成，成功 ${result.totalGenerated} 集` })
    } catch (err: any) {
      toast({ title: '剧本生成失败', description: err.message, variant: 'destructive' })
    } finally {
      setGeneratingScripts(false)
      setGenerationProgress(0)
    }
  }

  // ── Render ──

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* ── Header ── */}
      <div
        className="h-12 border-b border-border flex items-center px-4 gap-3 shrink-0"
        style={{
          backgroundImage: 'linear-gradient(to right, transparent, transparent 4px, rgba(245,158,11,0.03) 4px, rgba(245,158,11,0.03) 8px)',
          backgroundSize: '8px 100%',
          backgroundPosition: 'bottom',
          backgroundRepeat: 'repeat-x',
        }}
      >
        <button
          onClick={() => selectedDramaId && navigateToProject(selectedDramaId)}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors truncate max-w-32"
        >
          {currentDrama?.title || '项目'}
        </button>
        <ChevronRight className="size-3.5 text-muted-foreground/50 shrink-0" />
        <div className="flex items-center gap-1.5">
          <BookOpen className="size-4 text-amber-500" />
          <span className="text-sm font-medium">剧本生成工作台</span>
        </div>

        {/* Skeleton / Strategy quick toggles */}
        <div className="flex items-center gap-1 ml-4">
          <Button variant={showSkeleton ? 'secondary' : 'ghost'} size="sm" className="h-7 text-[10px] gap-1 px-2" onClick={() => { setShowSkeleton(!showSkeleton); setShowStrategy(false) }}>
            <Brain className="size-3" />骨架{parsedContent.skeleton && <Check className="size-2.5 text-emerald-500" />}
          </Button>
          <Button variant={showStrategy ? 'secondary' : 'ghost'} size="sm" className="h-7 text-[10px] gap-1 px-2" onClick={() => { setShowStrategy(!showStrategy); setShowSkeleton(false) }}>
            <Sparkles className="size-3" />策略{parsedContent.strategy && <Check className="size-2.5 text-emerald-500" />}
          </Button>
        </div>

        {isGenerating && (
          <Badge variant="outline" className="ml-auto text-[10px] px-2 py-0 text-amber-600 border-amber-300">
            <Loader2 className="size-3 mr-1 animate-spin" />生成中...
          </Badge>
        )}
        {!isGenerating && <div className="ml-auto" />}
      </div>

      {/* ── Skeleton / Strategy drawer ── */}
      <AnimatePresence>
        {(showSkeleton || showStrategy) && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="border-b border-border bg-muted/20 overflow-hidden"
          >
            {showSkeleton && (
              <div className="p-4 max-w-4xl mx-auto">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Brain className="size-4 text-amber-500" />
                    <span className="text-sm font-medium">故事骨架</span>
                    {parsedContent.skeleton && <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-emerald-600 border-emerald-300">已生成</Badge>}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => setEditingSkeleton(!editingSkeleton)}>
                      {editingSkeleton ? <><Check className="size-3" />完成</> : <><PenLine className="size-3" />编辑</>}
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={handleGenerateSkeleton} disabled={isGenerating}>
                      <RotateCcw className="size-3" />重新生成
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setShowSkeleton(false)}>✕</Button>
                  </div>
                </div>
                {parsedContent.skeleton ? (
                  editingSkeleton ? (
                    <Textarea value={skeletonEdit} onChange={(e) => setSkeletonEdit(e.target.value)} className="min-h-[200px] text-sm font-mono" placeholder="编辑故事骨架..." />
                  ) : (
                    <pre className="whitespace-pre-wrap text-sm leading-relaxed bg-muted/30 rounded-lg p-4 border border-border/50 max-h-[300px] overflow-y-auto">{parsedContent.skeleton}</pre>
                  )
                ) : (
                  <div className="flex items-center gap-3 py-6 justify-center">
                    <Button size="sm" className="gap-1.5" onClick={handleGenerateSkeleton} disabled={!novel || isGenerating}>
                      {generatingSkeleton ? <Loader2 className="size-3.5 animate-spin" /> : <Brain className="size-3.5" />}生成故事骨架
                    </Button>
                    <span className="text-xs text-muted-foreground">基于小说内容提取核心设定与分集决策</span>
                  </div>
                )}
              </div>
            )}
            {showStrategy && (
              <div className="p-4 max-w-4xl mx-auto">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="size-4 text-amber-500" />
                    <span className="text-sm font-medium">改编策略</span>
                    {parsedContent.strategy && <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-emerald-600 border-emerald-300">已生成</Badge>}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => setEditingStrategy(!editingStrategy)}>
                      {editingStrategy ? <><Check className="size-3" />完成</> : <><PenLine className="size-3" />编辑</>}
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={handleGenerateStrategy} disabled={!parsedContent.skeleton || isGenerating}>
                      <RotateCcw className="size-3" />重新生成
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setShowStrategy(false)}>✕</Button>
                  </div>
                </div>
                {parsedContent.strategy ? (
                  editingStrategy ? (
                    <Textarea value={strategyEdit} onChange={(e) => setStrategyEdit(e.target.value)} className="min-h-[200px] text-sm font-mono" placeholder="编辑改编策略..." />
                  ) : (
                    <pre className="whitespace-pre-wrap text-sm leading-relaxed bg-muted/30 rounded-lg p-4 border border-border/50 max-h-[300px] overflow-y-auto">{parsedContent.strategy}</pre>
                  )
                ) : (
                  <div className="flex items-center gap-3 py-6 justify-center">
                    <Button size="sm" className="gap-1.5" onClick={handleGenerateStrategy} disabled={!parsedContent.skeleton || isGenerating}>
                      {generatingStrategy ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}生成改编策略
                    </Button>
                    <span className="text-xs text-muted-foreground">需要先生成故事骨架</span>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Main: Three columns ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* ── Left: Novel chapters (原文) ── */}
        <div className="shrink-0 w-64 border-r border-border flex flex-col">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border">
            <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <BookOpen className="size-3 text-amber-500" />
              小说原文 ({chapters.length})
            </span>
          </div>
          <ScrollArea className="flex-1">
            {chapters.length > 0 ? (
              <div className="p-2 space-y-0.5">
                {chapters.map((ch, idx) => (
                  <button
                    key={ch.index}
                    className={`w-full text-left px-2.5 py-2 rounded-md text-xs flex items-center gap-2 transition-colors ${
                      previewItem?.type === 'chapter' && previewItem.index === idx
                        ? 'bg-primary/10 text-primary border border-primary/20'
                        : 'hover:bg-muted/50 text-foreground border border-transparent'
                    }`}
                    onClick={() => handleSelectChapter(ch, idx)}
                  >
                    <span className="size-5 rounded flex items-center justify-center text-[10px] font-mono bg-muted/60 shrink-0">{idx + 1}</span>
                    <span className="truncate flex-1">{ch.title}</span>
                    <Eye className="size-3 text-muted-foreground/40 shrink-0" />
                  </button>
                ))}
              </div>
            ) : novel ? (
              <div className="p-4 text-center space-y-2">
                {parsing ? (
                  <>
                    <Loader2 className="size-5 animate-spin mx-auto text-amber-500" />
                    <p className="text-xs text-muted-foreground">正在解析...</p>
                    {parseProgress.total > 0 && (
                      <>
                        <Progress value={(parseProgress.current / parseProgress.total) * 100} className="h-1" />
                        <p className="text-[10px] text-muted-foreground">{parseProgress.message}</p>
                      </>
                    )}
                  </>
                ) : (
                  <>
                    <p className="text-xs text-muted-foreground">暂无章节</p>
                    <p className="text-[10px] text-muted-foreground">小说可能尚未解析完成</p>
                  </>
                )}
              </div>
            ) : (
              /* Upload area when no novel */
              <div className="p-4" onDrop={handleDrop} onDragOver={(e) => e.preventDefault()}>
                <div
                  className="border-2 border-dashed border-border/60 rounded-lg p-6 text-center hover:border-primary/40 transition-colors cursor-pointer"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="size-8 mx-auto text-muted-foreground/40 mb-2" />
                  <p className="text-xs font-medium">上传小说文件</p>
                  <p className="text-[10px] text-muted-foreground mt-1">支持 .txt 和 .docx 格式</p>
                  <p className="text-[10px] text-muted-foreground">拖拽文件或点击选择</p>
                  {uploading && <Loader2 className="size-4 mx-auto mt-2 animate-spin text-amber-500" />}
                </div>
                <input ref={fileInputRef} type="file" accept=".txt,.docx" className="hidden" onChange={handleFileSelect} />
              </div>
            )}
          </ScrollArea>
        </div>

        {/* ── Center: Preview ── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {previewItem ? (
            <>
              <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-muted/10">
                {previewItem.type === 'chapter' ? (
                  <>
                    <BookOpen className="size-3.5 text-amber-500" />
                    <span className="text-xs font-medium">原文预览</span>
                    <span className="text-xs text-muted-foreground">·</span>
                    <span className="text-xs text-muted-foreground truncate">{previewItem.title}</span>
                  </>
                ) : (
                  <>
                    <PenLine className="size-3.5 text-emerald-500" />
                    <span className="text-xs font-medium">剧本预览</span>
                    <span className="text-xs text-muted-foreground">·</span>
                    <span className="text-xs text-muted-foreground truncate">E{String(previewItem.episodeNumber).padStart(2, '0')} {previewItem.title}</span>
                  </>
                )}
              </div>
              <ScrollArea className="flex-1">
                <div className="p-4 max-w-4xl mx-auto">
                  {loadingScript ? (
                    <div className="flex items-center justify-center py-12"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
                  ) : (
                    <pre className="whitespace-pre-wrap text-sm leading-relaxed bg-muted/30 rounded-lg p-5 border border-border/50">{previewItem.content}</pre>
                  )}
                </div>
              </ScrollArea>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center space-y-3">
                <div className="flex items-center justify-center gap-3">
                  <div className="flex flex-col items-center gap-1">
                    <div className="size-10 rounded-lg bg-amber-500/10 flex items-center justify-center"><BookOpen className="size-5 text-amber-500/60" /></div>
                    <span className="text-[10px] text-muted-foreground">点击左侧章节</span>
                  </div>
                  <span className="text-muted-foreground/30">→</span>
                  <div className="flex flex-col items-center gap-1">
                    <div className="size-10 rounded-lg bg-emerald-500/10 flex items-center justify-center"><Eye className="size-5 text-emerald-500/60" /></div>
                    <span className="text-[10px] text-muted-foreground">预览原文/剧本</span>
                  </div>
                  <span className="text-muted-foreground/30">←</span>
                  <div className="flex flex-col items-center gap-1">
                    <div className="size-10 rounded-lg bg-primary/10 flex items-center justify-center"><PenLine className="size-5 text-primary/60" /></div>
                    <span className="text-[10px] text-muted-foreground">点击右侧剧本</span>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">选择左侧小说章节或右侧剧本查看内容</p>
              </div>
            </div>
          )}
        </div>

        {/* ── Right: Overview + Episodes + Generation ── */}
        <div className="shrink-0 w-80 border-l border-border flex flex-col">
          {/* ── Progress ring ── */}
          <div className="p-4 border-b border-border">
            <div className="flex items-center justify-center">
              <div className="relative">
                <svg className="size-20 -rotate-90">
                  <circle cx="40" cy="40" r="32" fill="none" stroke="currentColor" strokeWidth="5" className="text-muted/30" />
                  <circle
                    cx="40" cy="40" r="32" fill="none" stroke="currentColor" strokeWidth="5"
                    strokeDasharray={`${2 * Math.PI * 32}`}
                    strokeDashoffset={`${2 * Math.PI * 32 * (1 - progressPercent / 100)}`}
                    strokeLinecap="round"
                    className="text-amber-500 transition-all duration-500"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <span className="text-lg font-bold">{progressPercent}%</span>
                    <p className="text-[10px] text-muted-foreground">完成度</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── Episode status list ── */}
          <div className="border-b border-border">
            <div className="px-4 py-2 flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <PenLine className="size-3 text-emerald-500" />
                剧集状态
              </span>
              <span className="text-[10px] text-muted-foreground">{completedEpisodes}/{totalEpisodes}</span>
            </div>
            <ScrollArea className="max-h-40">
              <div className="px-4 pb-2 space-y-0.5">
                {episodes.length > 0 ? episodes.map((ep) => (
                  <button
                    key={ep.id}
                    className={`w-full text-left flex items-center gap-2 text-xs py-1 px-1 rounded transition-colors ${
                      previewItem?.type === 'script' && previewItem.episodeId === ep.id
                        ? 'bg-primary/10 text-primary'
                        : 'hover:bg-muted/50 text-foreground'
                    }`}
                    onClick={() => handleSelectEpisode(ep)}
                  >
                    <span className={`size-1.5 rounded-full shrink-0 ${statusColor(ep.scriptStatus)}`} />
                    <span className="text-muted-foreground font-mono w-7">E{String(ep.episodeNumber).padStart(2, '0')}</span>
                    <span className="flex-1 truncate">{ep.title || `第${ep.episodeNumber}集`}</span>
                  </button>
                )) : (
                  <p className="text-[10px] text-muted-foreground py-1">暂无剧集，生成后将在此显示</p>
                )}
              </div>
            </ScrollArea>
          </div>

          {/* ── Statistics ── */}
          <div className="p-3 border-b border-border space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <BarChart3 className="size-3" />统计信息
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
              <span className="text-muted-foreground">总章节</span>
              <span className="text-right font-mono">{chapters.length}</span>
              <span className="text-muted-foreground">总集数</span>
              <span className="text-right font-mono">{totalEpisodes > 0 ? totalEpisodes : '—'}</span>
              <span className="text-muted-foreground">已完成</span>
              <span className="text-right font-mono">{completedEpisodes}</span>
              <span className="text-muted-foreground">预计时长</span>
              <span className="text-right font-mono">{completedEpisodes > 0 ? `${completedEpisodes * 2}min` : '0min'}</span>
            </div>
          </div>

          {/* ── Workflow steps ── */}
          <div className="p-3 border-b border-border space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <ListChecks className="size-3" />工作流程
            </div>
            <div className="space-y-1">
              {workflowSteps.map((step, idx) => (
                <div key={idx} className="flex items-center gap-2 text-[10px]">
                  <div className={`size-4 rounded flex items-center justify-center shrink-0 ${
                    step.done ? 'bg-emerald-500/20 text-emerald-500' :
                    step.active ? 'bg-amber-500/20 text-amber-500' :
                    'bg-muted/40 text-muted-foreground/50'
                  }`}>
                    {step.done ? <Check className="size-2.5" /> : <span className="font-mono">{idx + 1}</span>}
                  </div>
                  <span className={step.done ? 'text-emerald-400' : step.active ? 'text-amber-400' : 'text-muted-foreground/60'}>{step.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Generation controls ── */}
          <div className="p-3 space-y-2.5">
            <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <Zap className="size-3 text-amber-500" />生成操作
            </div>

            {!parsedContent.skeleton && (
              <Button size="sm" className="w-full h-7 text-xs gap-1.5" onClick={handleGenerateSkeleton} disabled={!novel || isGenerating}>
                {generatingSkeleton ? <Loader2 className="size-3 animate-spin" /> : <Brain className="size-3" />}生成故事骨架
              </Button>
            )}

            {parsedContent.skeleton && !parsedContent.strategy && (
              <Button size="sm" variant="outline" className="w-full h-7 text-xs gap-1.5" onClick={handleGenerateStrategy} disabled={isGenerating}>
                {generatingStrategy ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />}生成改编策略
              </Button>
            )}

            {parsedContent.strategy && (
              <>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground w-8 shrink-0">集范围</span>
                  <Input type="number" min={1} value={episodeRangeStart} onChange={(e) => setEpisodeRangeStart(parseInt(e.target.value) || 1)} className="h-7 text-xs w-16" />
                  <span className="text-[10px] text-muted-foreground">至</span>
                  <Input type="number" min={1} value={episodeRangeEnd} onChange={(e) => setEpisodeRangeEnd(parseInt(e.target.value) || 10)} className="h-7 text-xs w-16" />
                </div>
                <Button size="sm" className="w-full h-8 text-xs gap-1.5 amber-glow" onClick={handleGenerateScripts} disabled={isGenerating}>
                  {generatingScripts ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}批量生成剧本
                </Button>
              </>
            )}

            {isGenerating && generationProgress > 0 && <Progress value={generationProgress} className="h-1.5" />}
          </div>

          {/* ── Drag-to-upload (bottom) ── */}
          <div className="mt-auto p-3 border-t border-border" onDrop={handleDrop} onDragOver={(e) => e.preventDefault()}>
            <button
              className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-dashed border-border/60 hover:border-primary/40 hover:bg-muted/20 transition-colors text-xs text-muted-foreground"
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? <Loader2 className="size-3.5 animate-spin text-amber-500" /> : <Upload className="size-3.5" />}
              {uploading ? '上传中...' : '拖拽至此上传'}
            </button>
            <input ref={fileInputRef} type="file" accept=".txt,.docx" className="hidden" onChange={handleFileSelect} />
          </div>
        </div>
      </div>
    </div>
  )
}
