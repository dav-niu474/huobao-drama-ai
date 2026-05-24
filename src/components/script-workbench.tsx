'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAppStore, type Episode } from '@/lib/store'
import { api, type Novel } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Progress } from '@/components/ui/progress'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import {
  ArrowLeft,
  BookOpen,
  Upload,
  FileText,
  Loader2,
  Check,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Sparkles,
  Brain,
  Play,
  RotateCcw,
  ListChecks,
  BarChart3,
  Clock,
  AlertCircle,
  FileUp,
  RefreshCw,
  Layers,
  Zap,
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

// ── Main Component ────────────────────────────────────────

export function ScriptWorkbench() {
  const navigateToProject = useAppStore((s) => s.navigateToProject)
  const selectedDramaId = useAppStore((s) => s.selectedDramaId)
  const currentDrama = useAppStore((s) => s.currentDrama)
  const { toast } = useToast()

  // ── State ──
  const [novel, setNovel] = useState<Novel | null>(null)
  const [chapters, setChapters] = useState<ChapterInfo[]>([])
  const [parsedContent, setParsedContent] = useState<ParsedContent>({})
  const [episodes, setEpisodes] = useState<EpisodeStatus[]>([])
  const [leftCollapsed, setLeftCollapsed] = useState(false)
  const [activeTab, setActiveTab] = useState('skeleton')
  const [selectedChapterIdx, setSelectedChapterIdx] = useState<number | null>(null)

  // Generation states
  const [generatingSkeleton, setGeneratingSkeleton] = useState(false)
  const [generatingStrategy, setGeneratingStrategy] = useState(false)
  const [generatingScripts, setGeneratingScripts] = useState(false)
  const [generationProgress, setGenerationProgress] = useState(0)

  // Episode range for generation
  const [episodeRangeStart, setEpisodeRangeStart] = useState(1)
  const [episodeRangeEnd, setEpisodeRangeEnd] = useState(10)

  // Upload state
  const [uploading, setUploading] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [parseProgress, setParseProgress] = useState({ current: 0, total: 0, message: '' })
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Editable content states
  const [skeletonEdit, setSkeletonEdit] = useState('')
  const [strategyEdit, setStrategyEdit] = useState('')
  const [editingSkeleton, setEditingSkeleton] = useState(false)
  const [editingStrategy, setEditingStrategy] = useState(false)

  // Expanded episode for script output
  const [expandedEpisode, setExpandedEpisode] = useState<string | null>(null)
  const [episodeScripts, setEpisodeScripts] = useState<Record<string, string>>({})

  // ── Data Fetching helpers (called from event handlers, not effects) ──
  const loadNovelData = async () => {
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
    } catch {
      // Novel might not exist yet
    }
  }

  const loadScriptStatus = async () => {
    if (!selectedDramaId) return
    try {
      const status = await api.dramas.getScriptStatus(selectedDramaId)
      setEpisodes(status.episodes)
      if (status.episodes.length > 0) {
        setEpisodeRangeEnd(Math.max(...status.episodes.map((e) => e.episodeNumber)))
      }
    } catch {
      // Episodes might not exist yet
    }
  }

  // Fetch initial data on mount / when drama changes
  useEffect(() => {
    if (!selectedDramaId) return
    let cancelled = false

    async function load() {
      try {
        const novelRes = await fetch(`/api/novels?dramaId=${selectedDramaId}`)
        if (novelRes.ok && !cancelled) {
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
      } catch {
        // Novel might not exist yet
      }

      try {
        const status = await api.dramas.getScriptStatus(selectedDramaId)
        if (!cancelled) {
          setEpisodes(status.episodes)
          if (status.episodes.length > 0) {
            setEpisodeRangeEnd(Math.max(...status.episodes.map((e) => e.episodeNumber)))
          }
        }
      } catch {
        // Episodes might not exist yet
      }
    }

    load()
    return () => { cancelled = true }
  }, [selectedDramaId])

  // ── Parse Progress Polling ──
  useEffect(() => {
    if (!parsing || !novel) return
    const interval = setInterval(async () => {
      try {
        const status = await api.novels.parseStatus(novel.id)
        setParseProgress({
          current: status.current,
          total: status.total,
          message: status.message,
        })
        if (status.status === 'parsed') {
          setParsing(false)
          await loadNovelData()
          toast({ title: '小说解析完成' })
        } else if (status.status === 'failed') {
          setParsing(false)
          toast({ title: '小说解析失败', variant: 'destructive' })
        }
      } catch {
        // Ignore polling errors
      }
    }, 2000)
    return () => clearInterval(interval)
  }, [parsing, novel, loadNovelData, toast])

  // ── Handlers ──

  const handleFileUpload = async (file: File) => {
    if (!selectedDramaId) return
    setUploading(true)
    try {
      const result = await api.novels.uploadForDrama(selectedDramaId, file)
      setNovel(result.novel)
      setChapters(result.chapters || [])
      toast({ title: '小说上传成功' })

      // Auto-trigger parsing
      setParsing(true)
      setParseProgress({ current: 0, total: 1, message: '开始解析...' })
      await api.novels.parse(result.novel.id)
    } catch (err: any) {
      toast({
        title: '上传失败',
        description: err.message || '请检查文件格式（支持.txt和.docx）',
        variant: 'destructive',
      })
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
      setParsedContent((prev) => ({
        ...prev,
        skeleton: result.skeleton,
        skeletonGeneratedAt: new Date().toISOString(),
      }))
      setSkeletonEdit(result.skeleton)
      setGenerationProgress(100)
      toast({ title: '故事骨架生成完成' })
      setActiveTab('skeleton')
    } catch (err: any) {
      toast({
        title: '骨架生成失败',
        description: err.message,
        variant: 'destructive',
      })
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
      setParsedContent((prev) => ({
        ...prev,
        strategy: result.strategy,
        strategyGeneratedAt: new Date().toISOString(),
      }))
      setStrategyEdit(result.strategy)
      setGenerationProgress(100)
      toast({ title: '改编策略生成完成' })
      setActiveTab('strategy')
    } catch (err: any) {
      toast({
        title: '策略生成失败',
        description: err.message,
        variant: 'destructive',
      })
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
      await loadScriptStatus()
      toast({
        title: `剧本生成完成，成功 ${result.totalGenerated} 集`,
      })
      setActiveTab('scripts')
    } catch (err: any) {
      toast({
        title: '剧本生成失败',
        description: err.message,
        variant: 'destructive',
      })
    } finally {
      setGeneratingScripts(false)
      setGenerationProgress(0)
    }
  }

  const handleViewEpisodeScript = async (episodeId: string) => {
    if (expandedEpisode === episodeId) {
      setExpandedEpisode(null)
      return
    }
    setExpandedEpisode(episodeId)
    if (!episodeScripts[episodeId]) {
      try {
        const ep = await api.episodes.get(episodeId)
        setEpisodeScripts((prev) => ({
          ...prev,
          [episodeId]: ep.scriptContent || ep.rawContent || '暂无剧本内容',
        }))
      } catch {
        setEpisodeScripts((prev) => ({
          ...prev,
          [episodeId]: '加载失败',
        }))
      }
    }
  }

  const isGenerating =
    generatingSkeleton || generatingStrategy || generatingScripts

  // ── Computed values ──
  const completedEpisodes = episodes.filter(
    (ep) => ep.scriptStatus === 'completed'
  ).length
  const totalEpisodes = episodes.length || 0
  const progressPercent =
    totalEpisodes > 0
      ? Math.round((completedEpisodes / totalEpisodes) * 100)
      : 0

  // ── Render ──

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* 顶部导航 + 面包屑 */}
      <div className="h-12 border-b border-border flex items-center px-4 gap-3 shrink-0"
        style={{
          backgroundImage: 'linear-gradient(to right, transparent, transparent 4px, rgba(245,158,11,0.03) 4px, rgba(245,158,11,0.03) 8px)',
          backgroundSize: '8px 100%',
          backgroundPosition: 'bottom',
          backgroundRepeat: 'repeat-x',
        }}
      >
        {/* Breadcrumb: 项目名 > 剧本生成工作台 */}
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
        {isGenerating && (
          <Badge
            variant="outline"
            className="ml-auto text-[10px] px-2 py-0 text-amber-600 border-amber-300"
          >
            <Loader2 className="size-3 mr-1 animate-spin" />
            生成中...
          </Badge>
        )}
        {!isGenerating && (
          <div className="ml-auto" />
        )}
        {/* Mobile drawer toggle */}
        <Button
          variant="ghost"
          size="sm"
          className="size-8 p-0 lg:hidden"
          onClick={() => setLeftCollapsed(!leftCollapsed)}
        >
          {leftCollapsed ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
        </Button>
      </div>

      {/* 主体三栏布局 */}
      <div className="flex flex-1 overflow-hidden">
        {/* ── 左栏：章节导航 + 生成配置 (slide-out drawer on < lg) ── */}
        <div
          className={`shrink-0 border-r border-border flex flex-col transition-all duration-200 ${
            leftCollapsed ? 'w-10' : 'w-72'
          } hidden lg:flex`}
        >
          {leftCollapsed ? (
            <div className="flex flex-col items-center py-2">
              <Button
                variant="ghost"
                size="sm"
                className="size-8 p-0"
                onClick={() => setLeftCollapsed(false)}
              >
                <ChevronRight className="size-4" />
              </Button>
              <div className="mt-2 [writing-mode:vertical-rl] text-xs text-muted-foreground">
                章节导航
              </div>
            </div>
          ) : (
            <>
              {/* 章节列表头 */}
              <div className="flex items-center justify-between px-3 py-2 border-b border-border">
                <span className="text-xs font-medium text-muted-foreground">
                  章节导航 ({chapters.length})
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="size-6 p-0"
                  onClick={() => setLeftCollapsed(true)}
                >
                  <ChevronLeft className="size-3.5" />
                </Button>
              </div>

              {/* 章节列表 */}
              <ScrollArea className="flex-1">
                {chapters.length > 0 ? (
                  <div className="p-2 space-y-1">
                    {chapters.map((ch, idx) => (
                      <button
                        key={ch.index}
                        className={`w-full text-left px-2 py-1.5 rounded-md text-xs flex items-center gap-2 transition-colors ${
                          selectedChapterIdx === idx
                            ? 'bg-primary/10 text-primary'
                            : 'hover:bg-muted/50 text-foreground'
                        }`}
                        onClick={() => setSelectedChapterIdx(idx)}
                      >
                        <span className="size-4 rounded flex items-center justify-center text-[10px] font-mono bg-muted/60 shrink-0">
                          {idx + 1}
                        </span>
                        <span className="truncate flex-1">{ch.title}</span>
                        {novel?.parseStatus === 'parsed' && (
                          <Check className="size-3 text-emerald-500 shrink-0" />
                        )}
                      </button>
                    ))}
                  </div>
                ) : novel ? (
                  <div className="p-4 text-center">
                    {parsing ? (
                      <div className="space-y-2">
                        <Loader2 className="size-5 animate-spin mx-auto text-amber-500" />
                        <p className="text-xs text-muted-foreground">
                          正在解析...
                        </p>
                        {parseProgress.total > 0 && (
                          <>
                            <Progress
                              value={
                                (parseProgress.current / parseProgress.total) *
                                100
                              }
                              className="h-1"
                            />
                            <p className="text-[10px] text-muted-foreground">
                              {parseProgress.message}
                            </p>
                          </>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        暂无章节数据
                      </p>
                    )}
                  </div>
                ) : (
                  /* 上传区域 */
                  <div
                    className="p-4"
                    onDrop={handleDrop}
                    onDragOver={(e) => e.preventDefault()}
                  >
                    <div className="border-2 border-dashed border-border/60 rounded-lg p-6 text-center hover:border-primary/40 transition-colors cursor-pointer"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <FileUp className="size-8 mx-auto text-muted-foreground/40 mb-2" />
                      <p className="text-xs font-medium">
                        上传小说文件
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        支持 .txt 和 .docx 格式
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        拖拽文件或点击选择
                      </p>
                      {uploading && (
                        <Loader2 className="size-4 mx-auto mt-2 animate-spin text-amber-500" />
                      )}
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".txt,.docx"
                      className="hidden"
                      onChange={handleFileSelect}
                    />
                  </div>
                )}
              </ScrollArea>

              {/* 生成配置面板 */}
              <div className="border-t border-border p-3 space-y-3">
                <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <Zap className="size-3 text-amber-500" />
                  生成配置
                </div>

                {/* 集数范围 */}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground w-8 shrink-0">
                    集范围
                  </span>
                  <Input
                    type="number"
                    min={1}
                    value={episodeRangeStart}
                    onChange={(e) =>
                      setEpisodeRangeStart(parseInt(e.target.value) || 1)
                    }
                    className="h-7 text-xs w-16"
                  />
                  <span className="text-[10px] text-muted-foreground">至</span>
                  <Input
                    type="number"
                    min={1}
                    value={episodeRangeEnd}
                    onChange={(e) =>
                      setEpisodeRangeEnd(parseInt(e.target.value) || 10)
                    }
                    className="h-7 text-xs w-16"
                  />
                </div>

                {/* 生成按钮组 */}
                <div className="space-y-1.5">
                  <Button
                    size="sm"
                    className="w-full h-7 text-xs gap-1.5"
                    onClick={handleGenerateSkeleton}
                    disabled={!novel || generatingSkeleton || isGenerating}
                  >
                    {generatingSkeleton ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <Brain className="size-3" />
                    )}
                    生成故事骨架
                  </Button>

                  <Button
                    size="sm"
                    className="w-full h-7 text-xs gap-1.5"
                    variant="outline"
                    onClick={handleGenerateStrategy}
                    disabled={
                      !parsedContent.skeleton ||
                      generatingStrategy ||
                      isGenerating
                    }
                  >
                    {generatingStrategy ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <Sparkles className="size-3" />
                    )}
                    生成改编策略
                  </Button>

                  <Button
                    size="sm"
                    className="w-full h-7 text-xs gap-1.5 amber-glow"
                    onClick={handleGenerateScripts}
                    disabled={
                      !parsedContent.strategy ||
                      generatingScripts ||
                      isGenerating
                    }
                  >
                    {generatingScripts ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <Play className="size-3" />
                    )}
                    批量生成剧本
                  </Button>
                </div>

                {/* 进度条 */}
                {isGenerating && generationProgress > 0 && (
                  <Progress value={generationProgress} className="h-1.5" />
                )}
              </div>
            </>
          )}
        </div>

        {/* ── Mobile drawer for left panel (< lg) ── */}
        {!leftCollapsed && (
          <div className="lg:hidden fixed inset-0 z-50 flex">
            <div className="flex-1 bg-black/50" onClick={() => setLeftCollapsed(true)} />
            <div className="w-72 bg-background border-l border-border flex flex-col overflow-y-auto">
              {/* Chapter navigation + generation config - same content as left panel */}
              <div className="flex items-center justify-between px-3 py-2 border-b border-border">
                <span className="text-xs font-medium text-muted-foreground">
                  章节导航 ({chapters.length})
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="size-6 p-0"
                  onClick={() => setLeftCollapsed(true)}
                >
                  <X className="size-3.5" />
                </Button>
              </div>
              <ScrollArea className="flex-1">
                {chapters.length > 0 ? (
                  <div className="p-2 space-y-1">
                    {chapters.map((ch, idx) => (
                      <button
                        key={ch.index}
                        className={`w-full text-left px-2 py-1.5 rounded-md text-xs flex items-center gap-2 transition-colors ${
                          selectedChapterIdx === idx
                            ? 'bg-primary/10 text-primary'
                            : 'hover:bg-muted/50 text-foreground'
                        }`}
                        onClick={() => { setSelectedChapterIdx(idx); setLeftCollapsed(true) }}
                      >
                        <span className="size-4 rounded flex items-center justify-center text-[10px] font-mono bg-muted/60 shrink-0">
                          {idx + 1}
                        </span>
                        <span className="truncate flex-1">{ch.title}</span>
                        {novel?.parseStatus === 'parsed' && (
                          <Check className="size-3 text-emerald-500 shrink-0" />
                        )}
                      </button>
                    ))}
                  </div>
                ) : novel ? (
                  <div className="p-4 text-center">
                    {parsing ? (
                      <div className="space-y-2">
                        <Loader2 className="size-5 animate-spin mx-auto text-amber-500" />
                        <p className="text-xs text-muted-foreground">正在解析...</p>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">暂无章节数据</p>
                    )}
                  </div>
                ) : (
                  <div className="p-4" onDrop={handleDrop} onDragOver={(e) => e.preventDefault()}>
                    <div className="border-2 border-dashed border-border/60 rounded-lg p-6 text-center hover:border-primary/40 transition-colors cursor-pointer"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <FileUp className="size-8 mx-auto text-muted-foreground/40 mb-2" />
                      <p className="text-xs font-medium">上传小说文件</p>
                      <p className="text-[10px] text-muted-foreground mt-1">支持 .txt 和 .docx 格式</p>
                    </div>
                  </div>
                )}
              </ScrollArea>
              <div className="border-t border-border p-3 space-y-3">
                <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <Zap className="size-3 text-amber-500" />
                  生成配置
                </div>
                <div className="space-y-1.5">
                  <Button
                    size="sm"
                    className="w-full h-7 text-xs gap-1.5"
                    onClick={handleGenerateSkeleton}
                    disabled={!novel || generatingSkeleton || isGenerating}
                  >
                    {generatingSkeleton ? <Loader2 className="size-3 animate-spin" /> : <Brain className="size-3" />}
                    生成故事骨架
                  </Button>
                  <Button
                    size="sm"
                    className="w-full h-7 text-xs gap-1.5"
                    variant="outline"
                    onClick={handleGenerateStrategy}
                    disabled={!parsedContent.skeleton || generatingStrategy || isGenerating}
                  >
                    {generatingStrategy ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
                    生成改编策略
                  </Button>
                  <Button
                    size="sm"
                    className="w-full h-7 text-xs gap-1.5 amber-glow"
                    onClick={handleGenerateScripts}
                    disabled={!parsedContent.strategy || generatingScripts || isGenerating}
                  >
                    {generatingScripts ? <Loader2 className="size-3 animate-spin" /> : <Play className="size-3" />}
                    批量生成剧本
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── 中栏：三个Tab ── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="flex flex-col flex-1 overflow-hidden"
          >
            <div className="border-b border-border px-4 pt-2">
              <TabsList className="bg-transparent h-9 p-0 gap-4">
                <TabsTrigger
                  value="skeleton"
                  className="text-xs data-[state=active]:border-b-2 data-[state=active]:border-amber-500 rounded-none data-[state=active]:shadow-none data-[state=active]:bg-transparent px-1"
                >
                  <Brain className="size-3.5 mr-1.5" />
                  故事骨架
                  {parsedContent.skeleton && (
                    <Check className="size-3 ml-1 text-emerald-500" />
                  )}
                </TabsTrigger>
                <TabsTrigger
                  value="strategy"
                  className="text-xs data-[state=active]:border-b-2 data-[state=active]:border-amber-500 rounded-none data-[state=active]:shadow-none data-[state=active]:bg-transparent px-1"
                >
                  <Sparkles className="size-3.5 mr-1.5" />
                  改编策略
                  {parsedContent.strategy && (
                    <Check className="size-3 ml-1 text-emerald-500" />
                  )}
                </TabsTrigger>
                <TabsTrigger
                  value="scripts"
                  className="text-xs data-[state=active]:border-b-2 data-[state=active]:border-amber-500 rounded-none data-[state=active]:shadow-none data-[state=active]:bg-transparent px-1"
                >
                  <FileText className="size-3.5 mr-1.5" />
                  剧本输出
                  {completedEpisodes > 0 && (
                    <Badge
                      variant="secondary"
                      className="text-[10px] px-1 py-0 ml-1 h-4"
                    >
                      {completedEpisodes}
                    </Badge>
                  )}
                </TabsTrigger>
              </TabsList>
            </div>

            {/* Tab: 故事骨架 */}
            <TabsContent
              value="skeleton"
              className="flex-1 overflow-hidden m-0"
            >
              <ScrollArea className="h-full">
                <div className="p-4 max-w-4xl mx-auto">
                  {parsedContent.skeleton ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className="text-[10px] px-1.5 py-0 text-emerald-600 border-emerald-300"
                          >
                            已生成
                          </Badge>
                          {parsedContent.skeletonGeneratedAt && (
                            <span className="text-[10px] text-muted-foreground">
                              {new Date(
                                parsedContent.skeletonGeneratedAt
                              ).toLocaleString()}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs gap-1"
                            onClick={() => setEditingSkeleton(!editingSkeleton)}
                          >
                            {editingSkeleton ? (
                              <>
                                <Check className="size-3" />
                                保存
                              </>
                            ) : (
                              <>
                                <FileText className="size-3" />
                                编辑
                              </>
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs gap-1"
                            onClick={handleGenerateSkeleton}
                            disabled={isGenerating}
                          >
                            <RotateCcw className="size-3" />
                            重新生成
                          </Button>
                        </div>
                      </div>
                      {editingSkeleton ? (
                        <Textarea
                          value={skeletonEdit}
                          onChange={(e) => setSkeletonEdit(e.target.value)}
                          className="min-h-[500px] text-sm font-mono"
                          placeholder="编辑故事骨架内容..."
                        />
                      ) : (
                        <div className="prose prose-sm dark:prose-invert max-w-none">
                          <pre className="whitespace-pre-wrap text-sm leading-relaxed bg-muted/30 rounded-lg p-4 border border-border/50">
                            {parsedContent.skeleton}
                          </pre>
                        </div>
                      )}
                    </div>
                  ) : (
                    <EmptyState
                      icon={<Brain className="size-10 text-amber-500/40" />}
                      title="故事骨架"
                      description="从小说中提取故事骨架：核心设定、关键删除决策、改编增强建议、分集决策"
                      actionLabel="生成故事骨架"
                      onAction={handleGenerateSkeleton}
                      disabled={!novel || isGenerating}
                    />
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            {/* Tab: 改编策略 */}
            <TabsContent
              value="strategy"
              className="flex-1 overflow-hidden m-0"
            >
              <ScrollArea className="h-full">
                <div className="p-4 max-w-4xl mx-auto">
                  {parsedContent.strategy ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className="text-[10px] px-1.5 py-0 text-emerald-600 border-emerald-300"
                          >
                            已生成
                          </Badge>
                          {parsedContent.strategyGeneratedAt && (
                            <span className="text-[10px] text-muted-foreground">
                              {new Date(
                                parsedContent.strategyGeneratedAt
                              ).toLocaleString()}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs gap-1"
                            onClick={() =>
                              setEditingStrategy(!editingStrategy)
                            }
                          >
                            {editingStrategy ? (
                              <>
                                <Check className="size-3" />
                                保存
                              </>
                            ) : (
                              <>
                                <FileText className="size-3" />
                                编辑
                              </>
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs gap-1"
                            onClick={handleGenerateStrategy}
                            disabled={isGenerating}
                          >
                            <RotateCcw className="size-3" />
                            重新生成
                          </Button>
                        </div>
                      </div>
                      {editingStrategy ? (
                        <Textarea
                          value={strategyEdit}
                          onChange={(e) => setStrategyEdit(e.target.value)}
                          className="min-h-[500px] text-sm font-mono"
                          placeholder="编辑改编策略内容..."
                        />
                      ) : (
                        <div className="prose prose-sm dark:prose-invert max-w-none">
                          <pre className="whitespace-pre-wrap text-sm leading-relaxed bg-muted/30 rounded-lg p-4 border border-border/50">
                            {parsedContent.strategy}
                          </pre>
                        </div>
                      )}
                    </div>
                  ) : (
                    <EmptyState
                      icon={<Sparkles className="size-10 text-amber-500/40" />}
                      title="改编策略"
                      description="基于故事骨架制定改编策略：核心原则、删除决策、世界观策略、角色处理策略"
                      actionLabel="生成改编策略"
                      onAction={handleGenerateStrategy}
                      disabled={!parsedContent.skeleton || isGenerating}
                    />
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            {/* Tab: 剧本输出 */}
            <TabsContent
              value="scripts"
              className="flex-1 overflow-hidden m-0"
            >
              <ScrollArea className="h-full">
                <div className="p-4 max-w-4xl mx-auto">
                  {episodes.length > 0 ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">
                          共 {episodes.length} 集 · 已完成{' '}
                          {completedEpisodes} 集
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1"
                          onClick={loadScriptStatus}
                        >
                          <RefreshCw className="size-3" />
                          刷新状态
                        </Button>
                      </div>

                      {episodes.map((ep) => (
                        <Card
                          key={ep.id}
                          className="border-border/50 py-0 gap-0"
                        >
                          <CardHeader
                            className="py-3 px-4 cursor-pointer hover:bg-muted/30 transition-colors"
                            onClick={() => handleViewEpisodeScript(ep.id)}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className="size-8 rounded-md bg-primary/10 flex items-center justify-center">
                                  <span className="text-xs font-bold text-primary">
                                    E{String(ep.episodeNumber).padStart(2, '0')}
                                  </span>
                                </div>
                                <div>
                                  <CardTitle className="text-sm font-medium">
                                    {ep.title || `第${ep.episodeNumber}集`}
                                  </CardTitle>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    <StatusBadge status={ep.scriptStatus} />
                                  </div>
                                </div>
                              </div>
                              <ChevronDown
                                className={`size-4 text-muted-foreground transition-transform ${
                                  expandedEpisode === ep.id ? 'rotate-180' : ''
                                }`}
                              />
                            </div>
                          </CardHeader>
                          <AnimatePresence>
                            {expandedEpisode === ep.id && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.2 }}
                              >
                                <CardContent className="pt-0 px-4 pb-4">
                                  <div className="rounded-lg bg-muted/30 border border-border/50 p-3">
                                    {episodeScripts[ep.id] ? (
                                      <pre className="whitespace-pre-wrap text-xs leading-relaxed max-h-80 overflow-y-auto">
                                        {episodeScripts[ep.id]}
                                      </pre>
                                    ) : (
                                      <div className="flex items-center justify-center py-4">
                                        <Loader2 className="size-4 animate-spin text-muted-foreground" />
                                      </div>
                                    )}
                                  </div>
                                  <div className="mt-2 flex justify-end">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 text-xs gap-1"
                                      disabled={isGenerating}
                                    >
                                      <RotateCcw className="size-3" />
                                      重新生成
                                    </Button>
                                  </div>
                                </CardContent>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </Card>
                      ))}
                    </div>
                  ) : (
                    <EmptyState
                      icon={
                        <FileText className="size-10 text-amber-500/40" />
                      }
                      title="剧本输出"
                      description="基于故事骨架和改编策略，批量生成每集剧本"
                      actionLabel="批量生成剧本"
                      onAction={handleGenerateScripts}
                      disabled={!parsedContent.strategy || isGenerating}
                    />
                  )}
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </div>

        {/* ── 右栏：生成概览 (hidden on mobile) ── */}
        <div className="hidden lg:flex shrink-0 w-80 border-l border-border flex-col overflow-hidden">
          {/* 进度环 */}
          <div className="p-4 border-b border-border">
            <div className="flex items-center justify-center">
              <div className="relative">
                <svg className="size-24 -rotate-90">
                  <circle
                    cx="48"
                    cy="48"
                    r="40"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="6"
                    className="text-muted/30"
                  />
                  <circle
                    cx="48"
                    cy="48"
                    r="40"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="6"
                    strokeDasharray={`${2 * Math.PI * 40}`}
                    strokeDashoffset={`${
                      2 * Math.PI * 40 * (1 - progressPercent / 100)
                    }`}
                    strokeLinecap="round"
                    className="text-amber-500 transition-all duration-500"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <span className="text-xl font-bold">
                      {progressPercent}%
                    </span>
                    <p className="text-[10px] text-muted-foreground">完成度</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 剧集状态列表 */}
          <div className="border-b border-border">
            <div className="px-4 py-2 flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                剧集状态
              </span>
              <span className="text-[10px] text-muted-foreground">
                {completedEpisodes}/{totalEpisodes}
              </span>
            </div>
            <ScrollArea className="max-h-48">
              <div className="px-4 pb-2 space-y-1">
                {episodes.length > 0 ? (
                  episodes.map((ep) => (
                    <div
                      key={ep.id}
                      className="flex items-center gap-2 text-xs"
                    >
                      <StatusDot status={ep.scriptStatus} />
                      <span className="text-muted-foreground font-mono w-6">
                        E{String(ep.episodeNumber).padStart(2, '0')}
                      </span>
                      <span className="flex-1 truncate">
                        {ep.title || `第${ep.episodeNumber}集`}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-[10px] text-muted-foreground py-2">
                    暂无剧集，生成后将在此显示
                  </p>
                )}
              </div>
            </ScrollArea>
          </div>

          {/* 统计信息 */}
          <div className="p-4 border-b border-border">
            <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
              <BarChart3 className="size-3" />
              统计信息
            </div>
            <div className="grid grid-cols-2 gap-2">
              <StatCard
                label="总章节"
                value={String(chapters.length)}
                icon={<ListChecks className="size-3" />}
              />
              <StatCard
                label="总集数"
                value={String(totalEpisodes || '—')}
                icon={<Layers className="size-3" />}
              />
              <StatCard
                label="已完成"
                value={String(completedEpisodes)}
                icon={<Check className="size-3" />}
              />
              <StatCard
                label="预计时长"
                value={`${totalEpisodes * 2}min`}
                icon={<Clock className="size-3" />}
              />
            </div>
          </div>

          {/* 生成步骤指引 */}
          <div className="flex-1 p-4 overflow-y-auto">
            <div className="text-xs font-medium text-muted-foreground mb-3 flex items-center gap-1.5">
              <Zap className="size-3 text-amber-500" />
              工作流程
            </div>
            <div className="space-y-3">
              <StepItem
                number={1}
                title="上传小说"
                done={!!novel}
                active={!novel}
              />
              <StepItem
                number={2}
                title="解析小说"
                done={novel?.parseStatus === 'parsed'}
                active={!!novel && novel?.parseStatus !== 'parsed'}
              />
              <StepItem
                number={3}
                title="提取故事骨架"
                done={!!parsedContent.skeleton}
                active={
                  !parsedContent.skeleton && novel?.parseStatus === 'parsed'
                }
              />
              <StepItem
                number={4}
                title="制定改编策略"
                done={!!parsedContent.strategy}
                active={
                  !!parsedContent.skeleton && !parsedContent.strategy
                }
              />
              <StepItem
                number={5}
                title="生成剧本"
                done={completedEpisodes > 0}
                active={
                  !!parsedContent.strategy && completedEpisodes === 0
                }
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ──────────────────────────────────────

function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  disabled,
}: {
  icon: React.ReactNode
  title: string
  description: string
  actionLabel: string
  onAction: () => void
  disabled?: boolean
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      {icon}
      <h3 className="text-lg font-semibold mt-4">{title}</h3>
      <p className="text-sm text-muted-foreground mt-2 max-w-md text-center">
        {description}
      </p>
      <Button
        className="mt-4 gap-1.5"
        onClick={onAction}
        disabled={disabled}
      >
        <Play className="size-4" />
        {actionLabel}
      </Button>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'completed':
      return (
        <Badge
          variant="outline"
          className="text-[10px] px-1.5 py-0 text-emerald-600 border-emerald-300"
        >
          已完成
        </Badge>
      )
    case 'processing':
      return (
        <Badge
          variant="outline"
          className="text-[10px] px-1.5 py-0 text-amber-600 border-amber-300"
        >
          生成中
        </Badge>
      )
    case 'failed':
      return (
        <Badge
          variant="outline"
          className="text-[10px] px-1.5 py-0 text-red-600 border-red-300"
        >
          失败
        </Badge>
      )
    default:
      return (
        <Badge
          variant="outline"
          className="text-[10px] px-1.5 py-0 text-muted-foreground"
        >
          待创作
        </Badge>
      )
  }
}

function StatusDot({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    completed: 'bg-emerald-500',
    processing: 'bg-amber-500 animate-pulse',
    failed: 'bg-red-500',
    pending: 'bg-muted-foreground/40',
  }
  return <span className={`size-2 rounded-full shrink-0 ${colorMap[status] || colorMap.pending}`} />
}

function StatCard({
  label,
  value,
  icon,
}: {
  label: string
  value: string
  icon: React.ReactNode
}) {
  return (
    <div className="rounded-md bg-muted/30 border border-border/50 p-2">
      <div className="flex items-center gap-1 text-muted-foreground mb-1">
        {icon}
        <span className="text-[10px]">{label}</span>
      </div>
      <span className="text-sm font-semibold">{value}</span>
    </div>
  )
}

function StepItem({
  number,
  title,
  done,
  active,
}: {
  number: number
  title: string
  done: boolean
  active: boolean
}) {
  return (
    <div className="flex items-center gap-3">
      <div
        className={`size-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 transition-colors ${
          done
            ? 'bg-emerald-500 text-white'
            : active
            ? 'bg-amber-500 text-white'
            : 'bg-muted/60 text-muted-foreground'
        }`}
      >
        {done ? <Check className="size-3.5" /> : number}
      </div>
      <span
        className={`text-xs ${
          done
            ? 'text-emerald-600 line-through'
            : active
            ? 'text-amber-600 font-medium'
            : 'text-muted-foreground'
        }`}
      >
        {title}
      </span>
    </div>
  )
}
