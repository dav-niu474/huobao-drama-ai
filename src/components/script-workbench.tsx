'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAppStore } from '@/lib/store'
import { api, type Novel } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Textarea } from '@/components/ui/textarea'
import {
  BookOpen,
  FileText,
  Loader2,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Sparkles,
  Brain,
  Play,
  RotateCcw,
  FileUp,
  RefreshCw,
  Zap,
  Eye,
} from 'lucide-react'

// ════════════════════════════════════════════════════════════
// Types
// ════════════════════════════════════════════════════════════

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

// ════════════════════════════════════════════════════════════
// Sub-components
// ════════════════════════════════════════════════════════════

function StatusDot({ status }: { status: string }) {
  const color =
    status === 'completed' ? 'bg-emerald-500' :
    status === 'processing' ? 'bg-amber-500' :
    status === 'failed' ? 'bg-red-500' : 'bg-zinc-500'
  const label =
    status === 'completed' ? '已完成' :
    status === 'processing' ? '生成中' :
    status === 'failed' ? '失败' : '待创作'
  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
      <span className={`size-1.5 rounded-full ${color}`} />
      {label}
    </span>
  )
}

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
  actionLabel?: string
  onAction?: () => void
  disabled?: boolean
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 opacity-40">{icon}</div>
      <p className="text-sm font-medium mb-1">{title}</p>
      <p className="text-xs text-muted-foreground max-w-xs">{description}</p>
      {actionLabel && onAction && (
        <Button size="sm" className="mt-4" onClick={onAction} disabled={disabled}>
          {actionLabel}
        </Button>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════
// Tab type
// ════════════════════════════════════════════════════════════

type TabKey = 'source' | 'skeleton' | 'strategy' | 'scripts'

const TABS: { key: TabKey; label: string; icon: typeof Eye }[] = [
  { key: 'source', label: '章节原文', icon: Eye },
  { key: 'skeleton', label: '故事骨架', icon: Brain },
  { key: 'strategy', label: '改编策略', icon: Sparkles },
  { key: 'scripts', label: '剧本输出', icon: FileText },
]

// ════════════════════════════════════════════════════════════
// Main Component — 彻底重写 v7
//
// ★★★ 核心修复 ★★★
//
//   1. 完全不使用 Radix Tabs / AnimatePresence / framer-motion
//      之前：Radix TabsContent 用 absolute inset-0 堆叠
//      所有 TabsContent 同时存在于 DOM，靠 hidden 属性切换
//      当 React 重渲染时，hidden 属性可能短暂失效
//      导致多个 TabsContent 同时可见 → 页面重叠
//
//   2. 现在只有一个 tab 内容在 DOM 中
//      用简单的 {activeTab === 'source' && ...} 条件渲染
//      切换 tab 时，旧内容完全卸载，新内容才挂载
//      不可能有任何重叠
//
//   3. 不用 absolute 定位，用正常的 flex 布局
//   4. 不用 h-screen，用 h-full 填满父容器
//   5. 三栏布局：Left | Center | Right 是兄弟节点
//   6. P0：不显示"片段N"，直接显示原文集数标题
// ════════════════════════════════════════════════════════════

export function ScriptWorkbench() {
  // ── Zustand store ──
  const selectedDramaId = useAppStore((s) => s.selectedDramaId)
  const navigateToProject = useAppStore((s) => s.navigateToProject)
  const currentDrama = useAppStore((s) => s.currentDrama)

  // ── Toast via ref (avoid re-render from toast changes) ──
  const { toast } = useToast()
  const toastRef = useRef(toast)
  useEffect(() => { toastRef.current = toast }, [toast])

  // ── Core Data ──
  const [novel, setNovel] = useState<Novel | null>(null)
  const [chapters, setChapters] = useState<ChapterInfo[]>([])
  const [parsedContent, setParsedContent] = useState<ParsedContent>({})
  const [episodes, setEpisodes] = useState<EpisodeStatus[]>([])
  const [dataReady, setDataReady] = useState(false)

  // ── Layout ──
  const [leftOpen, setLeftOpen] = useState(true)
  const [selectedChapterIdx, setSelectedChapterIdx] = useState<number | null>(null)
  const [activeTab, setActiveTab] = useState<TabKey>('source')

  // ── Generation ──
  const [generatingSkeleton, setGeneratingSkeleton] = useState(false)
  const [generatingStrategy, setGeneratingStrategy] = useState(false)
  const [generatingScripts, setGeneratingScripts] = useState(false)
  const [generationProgress, setGenerationProgress] = useState(0)
  const [episodeRangeStart, setEpisodeRangeStart] = useState(1)
  const [episodeRangeEnd, setEpisodeRangeEnd] = useState(10)

  // ── Upload / Parse ──
  const [uploading, setUploading] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [parseProgress, setParseProgress] = useState({ current: 0, total: 0, message: '' })
  const [reparsing, setReparsing] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Edit ──
  const [skeletonEdit, setSkeletonEdit] = useState('')
  const [strategyEdit, setStrategyEdit] = useState('')
  const [editingSkeleton, setEditingSkeleton] = useState(false)
  const [editingStrategy, setEditingStrategy] = useState(false)

  // ── Episode Expand ──
  const [expandedEpisode, setExpandedEpisode] = useState<string | null>(null)
  const [episodeScripts, setEpisodeScripts] = useState<Record<string, string>>({})

  // ── Refs ──
  const mountedRef = useRef(true)
  const selectedDramaIdRef = useRef(selectedDramaId)
  const novelIdRef = useRef<string | null>(null)

  useEffect(() => { selectedDramaIdRef.current = selectedDramaId }, [selectedDramaId])
  useEffect(() => { novelIdRef.current = novel?.id ?? null }, [novel?.id])

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const isGenerating = generatingSkeleton || generatingStrategy || generatingScripts

  // ── Computed ──
  const selectedChapter = selectedChapterIdx !== null ? chapters[selectedChapterIdx] : null
  const completedEpisodes = episodes.filter((ep) => ep.scriptStatus === 'completed').length
  const totalEpisodes = episodes.length || 0
  const progressPercent = totalEpisodes > 0 ? Math.round((completedEpisodes / totalEpisodes) * 100) : 0

  // ════════════════════════════════════════════════════════════
  // ★★★ P0：标题清洗 — 替换"片段N"等通用占位标题 ★★★
  //
  //   通用占位标题模式："片段1"、"片段2"、"第1部分"、"第2部分"、
  //   纯数字、"Episode 1"等。这些标题没有任何语义信息。
  //
  //   清洗策略：
  //   1. 如果标题是通用占位符 → 用章节内容首行（去掉标题行后第一行有意义的文字）
  //   2. 如果首行也没意义 → 用"第N章"格式
  //
  //   这个清洗同时应用于：
  //   - 左侧栏章节列表
  //   - 中栏章节原文标题
  //   - 右侧栏/剧本输出的 episode 标题
  // ════════════════════════════════════════════════════════════

  const GENERIC_TITLE_PATTERNS = /^片段\d+$|^第\d+部分$|^第\d+集$|^Episode\s*\d+$/i

  const cleanChapterTitle = useCallback((ch: ChapterInfo, idx: number): string => {
    if (ch.title && !GENERIC_TITLE_PATTERNS.test(ch.title)) {
      return ch.title
    }
    // 用内容首行替代
    const firstLine = ch.content.split('\n').find((l) => l.trim().length > 0)?.trim() || ''
    if (firstLine.length >= 2 && !GENERIC_TITLE_PATTERNS.test(firstLine)) {
      return firstLine.length > 40 ? firstLine.slice(0, 40) + '...' : firstLine
    }
    return `第${idx + 1}章`
  }, [])

  // 清洗后的章节列表（用于左侧栏显示）
  const displayChapters = chapters.map((ch, idx) => ({
    ...ch,
    displayTitle: cleanChapterTitle(ch, idx),
  }))

  const getEpisodeDisplayTitle = useCallback((ep: EpisodeStatus): string => {
    if (ep.title && !GENERIC_TITLE_PATTERNS.test(ep.title)) {
      return ep.title
    }
    try {
      const chapterIds: number[] = JSON.parse(ep.sourceChapterIds || '[]')
      if (chapterIds.length > 0) {
        const matchedTitles = chapterIds
          .map((idx) => {
            const ch = chapters.find((c) => c.index === idx)
            return ch ? cleanChapterTitle(ch, ch.index) : undefined
          })
          .filter(Boolean) as string[]
        if (matchedTitles.length > 0) {
          return matchedTitles.join(' / ')
        }
      }
    } catch { /* ignore */ }
    return ep.title || `第${ep.episodeNumber}集`
  }, [chapters, cleanChapterTitle])

  // ════════════════════════════════════════════════════════════
  // Data Loading
  // ════════════════════════════════════════════════════════════

  const loadNovelData = useCallback(async () => {
    const dramaId = selectedDramaIdRef.current
    if (!dramaId) return false
    try {
      const res = await fetch(`/api/novels?dramaId=${dramaId}`)
      if (!res.ok || !mountedRef.current) return false
      const data = await res.json()
      if (!data || !mountedRef.current) return false
      setNovel(data)
      // ★ 清洗章节标题：API 返回的 chapters 可能包含旧版 parser 产生的"片段N"标题
      const rawChapters: ChapterInfo[] = data.chapters || []
      setChapters(rawChapters)
      try {
        const pc = JSON.parse(data.parsedContent || '{}')
        setParsedContent(pc)
        if (pc.skeleton) setSkeletonEdit(pc.skeleton)
        if (pc.strategy) setStrategyEdit(pc.strategy)
      } catch { /* ignore */ }
      return true
    } catch {
      return false
    }
  }, [])

  const loadScriptStatus = useCallback(async () => {
    const dramaId = selectedDramaIdRef.current
    if (!dramaId) return false
    try {
      const status = await api.dramas.getScriptStatus(dramaId)
      if (!mountedRef.current) return false
      setEpisodes(status.episodes)
      if (status.episodes.length > 0) {
        setEpisodeRangeEnd(Math.max(...status.episodes.map((e) => e.episodeNumber)))
      }
      return true
    } catch {
      return false
    }
  }, [])

  // ── Initial data load: 每个 dramaId 只跑一次 ──
  const loadedDramaIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!selectedDramaId) return
    if (loadedDramaIdRef.current === selectedDramaId) return
    loadedDramaIdRef.current = selectedDramaId

    let cancelled = false
    setDataReady(false)

    ;(async () => {
      await loadNovelData()
      if (cancelled || !mountedRef.current) return
      await loadScriptStatus()
      if (!cancelled && mountedRef.current) {
        setDataReady(true)
      }
    })()

    return () => { cancelled = true }
  }, [selectedDramaId, loadNovelData, loadScriptStatus])

  // ── Parse progress polling ──
  useEffect(() => {
    if (!parsing) return
    const poll = async () => {
      const nid = novelIdRef.current
      if (!nid || !mountedRef.current) return
      try {
        const status = await api.novels.parseStatus(nid)
        if (!mountedRef.current) return
        setParseProgress({ current: status.current, total: status.total, message: status.message })
        if (status.status === 'parsed') {
          setParsing(false)
          await loadNovelData()
          toastRef.current({ title: '小说解析完成' })
        } else if (status.status === 'failed') {
          setParsing(false)
          toastRef.current({ title: '小说解析失败', variant: 'destructive' })
        }
      } catch { /* ignore */ }
    }
    const interval = setInterval(poll, 3000)
    return () => clearInterval(interval)
  }, [parsing, loadNovelData])

  // ════════════════════════════════════════════════════════════
  // Handlers
  // ════════════════════════════════════════════════════════════

  const handleFileUpload = async (file: File) => {
    const dramaId = selectedDramaIdRef.current
    if (!dramaId) return
    setUploading(true)
    try {
      const result = await api.novels.uploadForDrama(dramaId, file)
      if (!mountedRef.current) return
      setNovel(result.novel)
      setChapters(result.chapters || [])
      toastRef.current({ title: '小说上传成功' })
      setParsing(true)
      setParseProgress({ current: 0, total: 1, message: '开始解析...' })
      await api.novels.parse(result.novel.id)
    } catch (err: any) {
      if (mountedRef.current) {
        toastRef.current({ title: '上传失败', description: err.message || '请检查文件格式', variant: 'destructive' })
      }
    } finally {
      if (mountedRef.current) setUploading(false)
    }
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) await handleFileUpload(file)
  }

  const handleReparse = async () => {
    const nid = novelIdRef.current
    if (!nid) return
    setReparsing(true)
    try {
      const res = await fetch(`/api/novels/${nid}/reparse`, { method: 'POST' })
      if (!mountedRef.current) return
      if (res.ok) {
        const data = await res.json()
        setChapters(data.chapters || [])
        toastRef.current({ title: '重新解析完成', description: `已识别 ${data.chapters?.length || 0} 个章节` })
      } else {
        toastRef.current({ title: '重新解析失败', variant: 'destructive' })
      }
    } catch (err: any) {
      if (mountedRef.current) {
        toastRef.current({ title: '重新解析失败', description: err.message, variant: 'destructive' })
      }
    } finally {
      if (mountedRef.current) setReparsing(false)
    }
  }

  const handleGenerateSkeleton = async () => {
    const dramaId = selectedDramaIdRef.current
    if (!dramaId) return
    setGeneratingSkeleton(true)
    setGenerationProgress(30)
    try {
      const result = await api.dramas.generateSkeleton(dramaId)
      if (!mountedRef.current) return
      setParsedContent((prev) => ({ ...prev, skeleton: result.skeleton, skeletonGeneratedAt: new Date().toISOString() }))
      setSkeletonEdit(result.skeleton)
      setGenerationProgress(100)
      toastRef.current({ title: '故事骨架生成完成' })
      setActiveTab('skeleton')
    } catch (err: any) {
      if (mountedRef.current) {
        toastRef.current({ title: '骨架生成失败', description: err.message, variant: 'destructive' })
      }
    } finally {
      if (mountedRef.current) {
        setGeneratingSkeleton(false)
        setGenerationProgress(0)
      }
    }
  }

  const handleGenerateStrategy = async () => {
    const dramaId = selectedDramaIdRef.current
    if (!dramaId) return
    setGeneratingStrategy(true)
    setGenerationProgress(30)
    try {
      const content = editingStrategy ? strategyEdit : parsedContent.skeleton
      const result = await api.dramas.generateStrategy(dramaId, content || '')
      if (!mountedRef.current) return
      setParsedContent((prev) => ({ ...prev, strategy: result.strategy, strategyGeneratedAt: new Date().toISOString() }))
      setStrategyEdit(result.strategy)
      setGenerationProgress(100)
      toastRef.current({ title: '改编策略生成完成' })
      setActiveTab('strategy')
    } catch (err: any) {
      if (mountedRef.current) {
        toastRef.current({ title: '策略生成失败', description: err.message, variant: 'destructive' })
      }
    } finally {
      if (mountedRef.current) {
        setGeneratingStrategy(false)
        setGenerationProgress(0)
      }
    }
  }

  const handleGenerateScripts = async () => {
    const dramaId = selectedDramaIdRef.current
    if (!dramaId) return
    setGeneratingScripts(true)
    setGenerationProgress(10)
    try {
      const skeleton = editingSkeleton ? skeletonEdit : parsedContent.skeleton
      const strategy = editingStrategy ? strategyEdit : parsedContent.strategy
      const result = await api.dramas.generateScripts(dramaId, {
        skeletonContent: skeleton || '',
        strategyContent: strategy || '',
        episodeRange: [episodeRangeStart, episodeRangeEnd],
      })
      if (!mountedRef.current) return
      setGenerationProgress(100)
      await loadScriptStatus()
      toastRef.current({ title: `剧本生成完成，成功 ${result.totalGenerated} 集` })
      setActiveTab('scripts')
    } catch (err: any) {
      if (mountedRef.current) {
        toastRef.current({ title: '剧本生成失败', description: err.message, variant: 'destructive' })
      }
    } finally {
      if (mountedRef.current) {
        setGeneratingScripts(false)
        setGenerationProgress(0)
      }
    }
  }

  const handleViewEpisodeScript = async (episodeId: string) => {
    if (expandedEpisode === episodeId) { setExpandedEpisode(null); return }
    setExpandedEpisode(episodeId)
    if (!episodeScripts[episodeId]) {
      try {
        const ep = await api.episodes.get(episodeId)
        if (mountedRef.current) {
          setEpisodeScripts((prev) => ({ ...prev, [episodeId]: ep.scriptContent || ep.rawContent || '暂无剧本内容' }))
        }
      } catch {
        if (mountedRef.current) {
          setEpisodeScripts((prev) => ({ ...prev, [episodeId]: '加载失败' }))
        }
      }
    }
  }

  const handleChapterClick = (idx: number) => {
    setSelectedChapterIdx(idx)
    setActiveTab('source')
  }

  // ════════════════════════════════════════════════════════════
  // ★ RENDER ★
  // ════════════════════════════════════════════════════════════

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden">
      {/* ── Top Bar ── */}
      <div className="h-12 border-b border-border flex items-center px-4 gap-3 shrink-0">
        <button
          onClick={() => selectedDramaId && navigateToProject(selectedDramaId)}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors truncate max-w-32"
        >
          {currentDrama?.title || '项目'}
        </button>
        <ChevronRight className="size-3.5 text-muted-foreground/50 shrink-0" />
        <div className="flex items-center gap-1.5">
          <BookOpen className="size-4 text-amber-500" />
          <span className="text-sm font-medium">剧本创作工作台</span>
        </div>
        {isGenerating && (
          <Badge variant="outline" className="ml-auto text-[10px] px-2 py-0 text-amber-600 border-amber-300">
            <Loader2 className="size-3 mr-1 animate-spin" />
            生成中...
          </Badge>
        )}
        {!isGenerating && <div className="ml-auto" />}
        <Button variant="ghost" size="sm" className="size-8 p-0" onClick={() => setLeftOpen(!leftOpen)}>
          {leftOpen ? <ChevronLeft className="size-4" /> : <ChevronRight className="size-4" />}
        </Button>
      </div>

      {/* ── Main Layout: 三栏 flex row，Left | Center | Right 是兄弟节点 ── */}
      <div className="flex-1 min-h-0 flex overflow-hidden">

        {/* ═══ Left Column (w-72) ═══ */}
        {leftOpen && (
          <div className="w-72 border-r border-border flex flex-col overflow-hidden shrink-0">
            {/* Chapter list header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
              <span className="text-xs font-medium text-muted-foreground">
                章节导航 {!dataReady ? '' : `(${chapters.length})`}
              </span>
              <div className="flex items-center gap-1">
                {novel && (
                  <Button variant="ghost" size="sm" className="size-6 p-0" onClick={handleReparse} disabled={reparsing} title="重新解析章节">
                    <RotateCcw className={`size-3 ${reparsing ? 'animate-spin' : ''}`} />
                  </Button>
                )}
                <Button variant="ghost" size="sm" className="size-6 p-0" onClick={() => setLeftOpen(false)}>
                  <ChevronLeft className="size-3.5" />
                </Button>
              </div>
            </div>

            {/* Chapter list content — 简单 div + overflow-y-auto 替代 ScrollArea */}
            <div className="flex-1 overflow-y-auto">
              {!dataReady ? (
                <div className="p-4 flex items-center justify-center">
                  <Loader2 className="size-5 animate-spin text-amber-500" />
                </div>
              ) : displayChapters.length > 0 ? (
                <div className="p-2 space-y-0.5">
                  {displayChapters.map((ch, idx) => (
                    <button
                      key={`ch-${ch.index}-${idx}`}
                      className={`w-full text-left px-2 py-1.5 rounded-md text-xs flex items-center gap-2 transition-colors ${
                        selectedChapterIdx === idx
                          ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
                          : 'hover:bg-muted/50 text-foreground'
                      }`}
                      onClick={() => handleChapterClick(idx)}
                    >
                      <span className={`size-5 rounded flex items-center justify-center text-[10px] font-mono shrink-0 ${
                        selectedChapterIdx === idx ? 'bg-amber-500/20' : 'bg-muted/60'
                      }`}>
                        {idx + 1}
                      </span>
                      <span className="truncate flex-1">{ch.displayTitle}</span>
                    </button>
                  ))}
                </div>
              ) : novel ? (
                <div className="p-4 text-center">
                  {parsing ? (
                    <div className="space-y-2">
                      <Loader2 className="size-5 animate-spin mx-auto text-amber-500" />
                      <p className="text-xs text-muted-foreground">正在解析...</p>
                      {parseProgress.total > 0 && (
                        <>
                          <Progress value={(parseProgress.current / parseProgress.total) * 100} className="h-1" />
                          <p className="text-[10px] text-muted-foreground">{parseProgress.message}</p>
                        </>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">暂无章节数据</p>
                  )}
                </div>
              ) : (
                <div className="p-4"
                  onDrop={async (e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) await handleFileUpload(f) }}
                  onDragOver={(e) => e.preventDefault()}
                >
                  <div
                    className="border-2 border-dashed border-border/60 rounded-lg p-6 text-center hover:border-primary/40 transition-colors cursor-pointer"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <FileUp className="size-8 mx-auto text-muted-foreground/40 mb-2" />
                    <p className="text-xs font-medium">上传小说文件</p>
                    <p className="text-[10px] text-muted-foreground mt-1">支持 .txt 和 .docx 格式</p>
                    <p className="text-[10px] text-muted-foreground">拖拽文件或点击选择</p>
                    {uploading && <Loader2 className="size-4 mx-auto mt-2 animate-spin text-amber-500" />}
                  </div>
                  <input ref={fileInputRef} type="file" accept=".txt,.docx" className="hidden" onChange={handleFileSelect} />
                </div>
              )}
            </div>

            {/* Generation config panel */}
            <div className="border-t border-border p-3 space-y-3 shrink-0">
              <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Zap className="size-3 text-amber-500" />
                生成配置
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground w-8 shrink-0">集范围</span>
                <Input type="number" min={1} value={episodeRangeStart} onChange={(e) => setEpisodeRangeStart(parseInt(e.target.value) || 1)} className="h-7 text-xs w-16" />
                <span className="text-[10px] text-muted-foreground">至</span>
                <Input type="number" min={1} value={episodeRangeEnd} onChange={(e) => setEpisodeRangeEnd(parseInt(e.target.value) || 10)} className="h-7 text-xs w-16" />
              </div>
              <div className="space-y-1.5">
                <Button size="sm" className="w-full h-7 text-xs gap-1.5" onClick={handleGenerateSkeleton} disabled={!novel || generatingSkeleton || isGenerating}>
                  {generatingSkeleton ? <Loader2 className="size-3 animate-spin" /> : <Brain className="size-3" />}
                  生成故事骨架
                </Button>
                <Button size="sm" className="w-full h-7 text-xs gap-1.5" variant="outline" onClick={handleGenerateStrategy} disabled={!parsedContent.skeleton || generatingStrategy || isGenerating}>
                  {generatingStrategy ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
                  生成改编策略
                </Button>
                <Button size="sm" className="w-full h-7 text-xs gap-1.5" onClick={handleGenerateScripts} disabled={!parsedContent.strategy || generatingScripts || isGenerating}>
                  {generatingScripts ? <Loader2 className="size-3 animate-spin" /> : <Play className="size-3" />}
                  批量生成剧本
                </Button>
              </div>
              {isGenerating && generationProgress > 0 && <Progress value={generationProgress} className="h-1.5" />}
            </div>
          </div>
        )}

        {/* ═══ Center Column (flex-1) ═══ */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {/* Tab 栏 — 简单 button 列表，不用 Radix Tabs */}
          <div className="border-b border-border px-4 pt-2 shrink-0 flex items-center gap-4">
            {TABS.map((tab) => {
              const Icon = tab.icon
              const isActive = activeTab === tab.key
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`text-xs flex items-center gap-1.5 pb-2 border-b-2 transition-colors ${
                    isActive
                      ? 'border-amber-500 text-foreground font-medium'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Icon className="size-3.5" />
                  {tab.label}
                  {tab.key === 'skeleton' && parsedContent.skeleton && <Check className="size-3 text-emerald-500" />}
                  {tab.key === 'strategy' && parsedContent.strategy && <Check className="size-3 text-emerald-500" />}
                  {tab.key === 'scripts' && completedEpisodes > 0 && (
                    <Badge variant="secondary" className="text-[10px] px-1 py-0 ml-0.5 h-4">{completedEpisodes}</Badge>
                  )}
                </button>
              )
            })}
          </div>

          {/* ★★★ Tab 内容：条件渲染 — 同时只有一个 tab 在 DOM 中 ★★★ */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            {/* ── Tab: 章节原文 ── */}
            {activeTab === 'source' && (
              <div className="p-4 max-w-4xl mx-auto">
                {!dataReady ? (
                  <div className="flex flex-col items-center justify-center py-16">
                    <Loader2 className="size-8 animate-spin text-amber-500 mb-3" />
                    <p className="text-sm text-muted-foreground">正在加载数据...</p>
                  </div>
                ) : selectedChapter ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-amber-600 border-amber-300">
                          第 {selectedChapterIdx! + 1} 章
                        </Badge>
                        <h2 className="text-sm font-semibold">{displayChapters[selectedChapterIdx!]?.displayTitle || selectedChapter.title}</h2>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" disabled={selectedChapterIdx === 0}
                          onClick={() => setSelectedChapterIdx(selectedChapterIdx! - 1)}>
                          <ChevronLeft className="size-3" />上一章
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" disabled={selectedChapterIdx === displayChapters.length - 1}
                          onClick={() => setSelectedChapterIdx(selectedChapterIdx! + 1)}>
                          下一章<ChevronRight className="size-3" />
                        </Button>
                      </div>
                    </div>
                    <pre className="whitespace-pre-wrap text-sm leading-relaxed bg-muted/30 rounded-lg p-4 border border-border/50">
                      {selectedChapter.content}
                    </pre>
                  </div>
                ) : chapters.length > 0 ? (
                  <EmptyState
                    icon={<Eye className="size-10 text-amber-500" />}
                    title="章节原文"
                    description="在左侧选择一个章节，在此查看原文内容"
                  />
                ) : novel ? (
                  <EmptyState
                    icon={<Eye className="size-10 text-amber-500" />}
                    title="章节原文"
                    description="小说正在解析中，解析完成后即可查看章节内容"
                  />
                ) : (
                  <EmptyState
                    icon={<FileUp className="size-10 text-amber-500" />}
                    title="章节原文"
                    description="请先上传小说文件，系统将自动解析章节结构并显示原文"
                    actionLabel="上传小说"
                    onAction={() => fileInputRef.current?.click()}
                  />
                )}
              </div>
            )}

            {/* ── Tab: 故事骨架 ── */}
            {activeTab === 'skeleton' && (
              <div className="p-4 max-w-4xl mx-auto">
                {!dataReady ? (
                  <div className="flex flex-col items-center justify-center py-16">
                    <Loader2 className="size-8 animate-spin text-amber-500 mb-3" />
                    <p className="text-sm text-muted-foreground">正在加载数据...</p>
                  </div>
                ) : parsedContent.skeleton ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-emerald-600 border-emerald-300">已生成</Badge>
                        {parsedContent.skeletonGeneratedAt && (
                          <span className="text-[10px] text-muted-foreground">{new Date(parsedContent.skeletonGeneratedAt).toLocaleString()}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => setEditingSkeleton(!editingSkeleton)}>
                          {editingSkeleton ? <><Check className="size-3" />完成</> : <><FileText className="size-3" />编辑</>}
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={handleGenerateSkeleton} disabled={isGenerating}>
                          <RotateCcw className="size-3" />重新生成
                        </Button>
                      </div>
                    </div>
                    {editingSkeleton ? (
                      <Textarea value={skeletonEdit} onChange={(e) => setSkeletonEdit(e.target.value)} className="min-h-[500px] text-sm font-mono" placeholder="编辑故事骨架内容..." />
                    ) : (
                      <pre className="whitespace-pre-wrap text-sm leading-relaxed bg-muted/30 rounded-lg p-4 border border-border/50">
                        {parsedContent.skeleton}
                      </pre>
                    )}
                  </div>
                ) : (
                  <EmptyState
                    icon={<Brain className="size-10 text-amber-500" />}
                    title="故事骨架"
                    description="从小说中提取故事骨架：核心设定、关键删除决策、改编增强建议、分集决策"
                    actionLabel="生成故事骨架"
                    onAction={handleGenerateSkeleton}
                    disabled={!novel || isGenerating}
                  />
                )}
              </div>
            )}

            {/* ── Tab: 改编策略 ── */}
            {activeTab === 'strategy' && (
              <div className="p-4 max-w-4xl mx-auto">
                {!dataReady ? (
                  <div className="flex flex-col items-center justify-center py-16">
                    <Loader2 className="size-8 animate-spin text-amber-500 mb-3" />
                    <p className="text-sm text-muted-foreground">正在加载数据...</p>
                  </div>
                ) : parsedContent.strategy ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-emerald-600 border-emerald-300">已生成</Badge>
                        {parsedContent.strategyGeneratedAt && (
                          <span className="text-[10px] text-muted-foreground">{new Date(parsedContent.strategyGeneratedAt).toLocaleString()}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => setEditingStrategy(!editingStrategy)}>
                          {editingStrategy ? <><Check className="size-3" />完成</> : <><FileText className="size-3" />编辑</>}
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={handleGenerateStrategy} disabled={isGenerating}>
                          <RotateCcw className="size-3" />重新生成
                        </Button>
                      </div>
                    </div>
                    {editingStrategy ? (
                      <Textarea value={strategyEdit} onChange={(e) => setStrategyEdit(e.target.value)} className="min-h-[500px] text-sm font-mono" placeholder="编辑改编策略内容..." />
                    ) : (
                      <pre className="whitespace-pre-wrap text-sm leading-relaxed bg-muted/30 rounded-lg p-4 border border-border/50">
                        {parsedContent.strategy}
                      </pre>
                    )}
                  </div>
                ) : (
                  <EmptyState
                    icon={<Sparkles className="size-10 text-amber-500" />}
                    title="改编策略"
                    description="基于故事骨架制定改编策略：核心原则、删除决策、世界观策略、角色处理策略"
                    actionLabel="生成改编策略"
                    onAction={handleGenerateStrategy}
                    disabled={!parsedContent.skeleton || isGenerating}
                  />
                )}
              </div>
            )}

            {/* ── Tab: 剧本输出 ── */}
            {activeTab === 'scripts' && (
              <div className="p-4 max-w-4xl mx-auto">
                {!dataReady ? (
                  <div className="flex flex-col items-center justify-center py-16">
                    <Loader2 className="size-8 animate-spin text-amber-500 mb-3" />
                    <p className="text-sm text-muted-foreground">正在加载数据...</p>
                  </div>
                ) : episodes.length > 0 ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">共 {episodes.length} 集 · 已完成 {completedEpisodes} 集</span>
                      <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={loadScriptStatus}>
                        <RefreshCw className="size-3" />刷新状态
                      </Button>
                    </div>
                    {episodes.map((ep) => (
                      <Card key={ep.id} className="border-border/50 py-0 gap-0">
                        <CardHeader
                          className="py-3 px-4 cursor-pointer hover:bg-muted/30 transition-colors"
                          onClick={() => handleViewEpisodeScript(ep.id)}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="size-8 rounded-md bg-primary/10 flex items-center justify-center">
                                <span className="text-xs font-bold text-primary">E{String(ep.episodeNumber).padStart(2, '0')}</span>
                              </div>
                              <div>
                                <CardTitle className="text-sm font-medium">{getEpisodeDisplayTitle(ep)}</CardTitle>
                                <div className="flex items-center gap-2 mt-0.5"><StatusDot status={ep.scriptStatus} /></div>
                              </div>
                            </div>
                            <ChevronDown className={`size-4 text-muted-foreground transition-transform duration-200 ${expandedEpisode === ep.id ? 'rotate-180' : ''}`} />
                          </div>
                        </CardHeader>
                        {expandedEpisode === ep.id && (
                          <CardContent className="pt-0 px-4 pb-4">
                            <div className="rounded-lg bg-muted/30 border border-border/50 p-3">
                              {episodeScripts[ep.id] ? (
                                <pre className="whitespace-pre-wrap text-xs leading-relaxed max-h-80 overflow-y-auto">{episodeScripts[ep.id]}</pre>
                              ) : (
                                <div className="flex items-center justify-center py-4"><Loader2 className="size-4 animate-spin text-muted-foreground" /></div>
                              )}
                            </div>
                          </CardContent>
                        )}
                      </Card>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    icon={<FileText className="size-10 text-amber-500" />}
                    title="剧本输出"
                    description="基于故事骨架和改编策略，批量生成每集剧本"
                    actionLabel="批量生成剧本"
                    onAction={handleGenerateScripts}
                    disabled={!parsedContent.strategy || isGenerating}
                  />
                )}
              </div>
            )}
          </div>
        </div>

        {/* ═══ Right Column (w-80) — 和 Center 是兄弟节点 ═══ */}
        <div className="w-80 border-l border-border flex flex-col overflow-hidden shrink-0">
          <div className="px-4 py-3 border-b border-border shrink-0">
            <span className="text-xs font-medium text-muted-foreground">进度统计</span>
          </div>
          <div className="flex-1 overflow-y-auto">
            <div className="p-4 space-y-4">
              {/* 总体进度 */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-muted-foreground">剧本生成进度</span>
                  <span className="text-xs font-medium">{progressPercent}%</span>
                </div>
                <Progress value={progressPercent} className="h-2" />
                <p className="text-[10px] text-muted-foreground mt-1">
                  {completedEpisodes} / {totalEpisodes} 集已完成
                </p>
              </div>

              {/* 小说状态 */}
              <div className="space-y-2">
                <span className="text-xs font-medium text-muted-foreground">小说状态</span>
                {novel ? (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">文件</span>
                      <span className="truncate max-w-36">{novel.fileName}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">解析状态</span>
                      <Badge variant={novel.parseStatus === 'parsed' ? 'default' : 'secondary'} className="text-[10px] px-1.5 py-0">
                        {novel.parseStatus === 'parsed' ? '已解析' : novel.parseStatus === 'parsing' ? '解析中' : '待解析'}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">章节数</span>
                      <span>{chapters.length}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">尚未上传小说</p>
                )}
              </div>

              {/* 生成状态 */}
              <div className="space-y-2">
                <span className="text-xs font-medium text-muted-foreground">生成状态</span>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">故事骨架</span>
                    {parsedContent.skeleton ? (
                      <Badge variant="default" className="text-[10px] px-1.5 py-0 bg-emerald-600">已生成</Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">未生成</Badge>
                    )}
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">改编策略</span>
                    {parsedContent.strategy ? (
                      <Badge variant="default" className="text-[10px] px-1.5 py-0 bg-emerald-600">已生成</Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">未生成</Badge>
                    )}
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">剧本输出</span>
                    {completedEpisodes > 0 ? (
                      <Badge variant="default" className="text-[10px] px-1.5 py-0 bg-emerald-600">{completedEpisodes}集</Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">未生成</Badge>
                    )}
                  </div>
                </div>
              </div>

              {/* 集范围配置 */}
              <div className="space-y-2">
                <span className="text-xs font-medium text-muted-foreground">集范围配置</span>
                <div className="flex items-center gap-2">
                  <Input type="number" min={1} value={episodeRangeStart} onChange={(e) => setEpisodeRangeStart(parseInt(e.target.value) || 1)} className="h-7 text-xs w-16" />
                  <span className="text-[10px] text-muted-foreground">至</span>
                  <Input type="number" min={1} value={episodeRangeEnd} onChange={(e) => setEpisodeRangeEnd(parseInt(e.target.value) || 10)} className="h-7 text-xs w-16" />
                </div>
                <div className="space-y-1.5 pt-1">
                  <Button size="sm" className="w-full h-7 text-xs gap-1.5" onClick={handleGenerateSkeleton} disabled={!novel || isGenerating}>
                    {generatingSkeleton ? <Loader2 className="size-3 animate-spin" /> : <Brain className="size-3" />}
                    生成故事骨架
                  </Button>
                  <Button size="sm" className="w-full h-7 text-xs gap-1.5" variant="outline" onClick={handleGenerateStrategy} disabled={!parsedContent.skeleton || isGenerating}>
                    {generatingStrategy ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
                    生成改编策略
                  </Button>
                  <Button size="sm" className="w-full h-7 text-xs gap-1.5" onClick={handleGenerateScripts} disabled={!parsedContent.strategy || isGenerating}>
                    {generatingScripts ? <Loader2 className="size-3 animate-spin" /> : <Play className="size-3" />}
                    批量生成剧本
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
