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
  X,
  Trash2,
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
// Pipeline step type — 5-stage Stepper
// ════════════════════════════════════════════════════════════

type TabKey = 'source' | 'events' | 'skeleton' | 'strategy' | 'scripts'

const PIPELINE_STEPS: { key: TabKey; label: string; icon: typeof Eye }[] = [
  { key: 'source', label: '章节原文', icon: FileText },
  { key: 'events', label: '章节事件', icon: Zap },
  { key: 'skeleton', label: '故事骨架', icon: Brain },
  { key: 'strategy', label: '改编策略', icon: Sparkles },
  { key: 'scripts', label: '剧本输出', icon: Play },
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

  // ── Event Extraction ──
  const [extractingEvents, setExtractingEvents] = useState(false)
  const [eventsData, setEventsData] = useState<Array<{ chapter: string; characters: string; event: string; mainline: string; density: string; estimatedDuration: string; emotion: string }> | null>(null)

  // ── Upload / Parse ──
  const [uploading, setUploading] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [parseProgress, setParseProgress] = useState({ current: 0, total: 0, message: '' })
  const [reparsing, setReparsing] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Paste-text mode ──
  const [inputMode, setInputMode] = useState<'upload' | 'paste'>('upload')
  const [pastedText, setPastedText] = useState('')
  const [pastedTitle, setPastedTitle] = useState('')
  const [submittingPaste, setSubmittingPaste] = useState(false)

  // ── Edit ──
  const [skeletonEdit, setSkeletonEdit] = useState('')
  const [strategyEdit, setStrategyEdit] = useState('')
  const [editingSkeleton, setEditingSkeleton] = useState(false)
  const [editingStrategy, setEditingStrategy] = useState(false)

  // ── Episode Expand ──
  const [expandedEpisode, setExpandedEpisode] = useState<string | null>(null)
  const [episodeScripts, setEpisodeScripts] = useState<Record<string, string>>({})

  // ── Stepper redesign state ──
  const [chapterSearch, setChapterSearch] = useState('')
  const [deletingNovel, setDeletingNovel] = useState(false)
  const [regeneratingEp, setRegeneratingEp] = useState<string | null>(null)
  const [savingSkeleton, setSavingSkeleton] = useState(false)
  const [savingStrategy, setSavingStrategy] = useState(false)

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

  // 搜索过滤后的章节列表
  const filteredChapters = chapterSearch
    ? displayChapters.filter((c) => c.displayTitle.includes(chapterSearch))
    : displayChapters

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
        if (Array.isArray(pc.events)) setEventsData(pc.events)
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

  // Submit pasted text — alternative input mode for users who want to paste novel content directly
  const handlePasteSubmit = async () => {
    const dramaId = selectedDramaIdRef.current
    if (!dramaId) return
    if (pastedText.trim().length < 10) {
      toastRef.current({ title: '文本内容过短', description: '请至少粘贴 10 个字符', variant: 'destructive' })
      return
    }
    setSubmittingPaste(true)
    try {
      const result = await api.novels.uploadText(dramaId, pastedText, pastedTitle || undefined)
      if (!mountedRef.current) return
      setNovel(result.novel)
      setChapters(result.chapters || [])
      toastRef.current({
        title: '文本提交成功',
        description: `已识别 ${result.chapters?.length || 0} 个章节`,
      })
      // Auto-trigger parse if chapters are not yet split
      setParsing(true)
      setParseProgress({ current: 0, total: 1, message: '开始解析...' })
      await api.novels.parse(result.novel.id)
    } catch (err: any) {
      if (mountedRef.current) {
        toastRef.current({
          title: '文本提交失败',
          description: err.message || '请稍后重试',
          variant: 'destructive',
        })
      }
    } finally {
      if (mountedRef.current) setSubmittingPaste(false)
    }
  }

  const handleReparse = async () => {
    const nid = novelIdRef.current
    if (!nid) return
    setReparsing(true)
    try {
      const data = await api.novels.reparse(nid)
      if (!mountedRef.current) return
      setChapters(data.chapters || [])
      toastRef.current({ title: '重新解析完成', description: `已识别 ${data.chapters?.length || 0} 个章节` })
    } catch (err: any) {
      if (mountedRef.current) {
        toastRef.current({ title: '重新解析失败', description: err.message, variant: 'destructive' })
      }
    } finally {
      if (mountedRef.current) setReparsing(false)
    }
  }

  const handleExtractEvents = async () => {
    const dramaId = selectedDramaIdRef.current
    if (!dramaId) return
    setExtractingEvents(true)
    try {
      const result = await api.ai.extractEvents(dramaId, {
        start: episodeRangeStart,
        end: episodeRangeEnd,
      })
      if (!mountedRef.current) return
      setEventsData(result.events)
      toastRef.current({
        title: '事件提取完成',
        description: `共提取 ${result.events.length} 个章节事件`,
      })
    } catch (err: any) {
      if (mountedRef.current) {
        toastRef.current({
          title: '事件提取失败',
          description: err.message || '请稍后重试',
          variant: 'destructive',
        })
      }
    } finally {
      if (mountedRef.current) setExtractingEvents(false)
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
      // FE-1 fix: generate-strategy takes the SKELETON as input, not the strategy.
      // Use the currently-edited skeleton if editing, otherwise the stored skeleton.
      const skeletonContent = editingSkeleton ? skeletonEdit : (parsedContent.skeleton || '')
      const result = await api.dramas.generateStrategy(dramaId, skeletonContent)
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
  // Stepper-specific handlers (save / regenerate / delete)
  // ════════════════════════════════════════════════════════════

  const handleSaveSkeleton = async () => {
    if (!novel) return
    setSavingSkeleton(true)
    try {
      await api.novels.updateParsedContent(novel.id, 'skeleton', skeletonEdit)
      if (!mountedRef.current) return
      setParsedContent((prev) => ({
        ...prev,
        skeleton: skeletonEdit,
        skeletonGeneratedAt: new Date().toISOString(),
      }))
      setEditingSkeleton(false)
      toastRef.current({ title: '骨架已保存' })
    } catch (err: any) {
      if (mountedRef.current) {
        toastRef.current({ title: '保存失败', description: err.message, variant: 'destructive' })
      }
    } finally {
      if (mountedRef.current) setSavingSkeleton(false)
    }
  }

  const handleSaveStrategy = async () => {
    if (!novel) return
    setSavingStrategy(true)
    try {
      await api.novels.updateParsedContent(novel.id, 'strategy', strategyEdit)
      if (!mountedRef.current) return
      setParsedContent((prev) => ({
        ...prev,
        strategy: strategyEdit,
        strategyGeneratedAt: new Date().toISOString(),
      }))
      setEditingStrategy(false)
      toastRef.current({ title: '策略已保存' })
    } catch (err: any) {
      if (mountedRef.current) {
        toastRef.current({ title: '保存失败', description: err.message, variant: 'destructive' })
      }
    } finally {
      if (mountedRef.current) setSavingStrategy(false)
    }
  }

  const handleRegenerateEpisode = async (epId: string) => {
    setRegeneratingEp(epId)
    try {
      await api.episodes.regenerateScript(epId)
      if (!mountedRef.current) return
      // Clear cached script content for this episode so it re-fetches
      setEpisodeScripts((prev) => {
        const next = { ...prev }
        delete next[epId]
        return next
      })
      toastRef.current({ title: '剧本已重新生成' })
      await loadScriptStatus()
    } catch (err: any) {
      if (mountedRef.current) {
        toastRef.current({
          title: '重新生成失败',
          description: err.message,
          variant: 'destructive',
        })
      }
    } finally {
      if (mountedRef.current) setRegeneratingEp(null)
    }
  }

  const handleDeleteNovel = async () => {
    if (!novel) return
    if (!confirm('确定删除小说？所有章节、事件、骨架、策略数据将丢失，已生成的剧本不受影响。')) return
    setDeletingNovel(true)
    try {
      await api.novels.delete(novel.id)
      if (!mountedRef.current) return
      setNovel(null)
      setChapters([])
      setParsedContent({})
      setEventsData(null)
      setEpisodes([])
      setSkeletonEdit('')
      setStrategyEdit('')
      setActiveTab('source')
      toastRef.current({ title: '小说已删除，可重新上传' })
    } catch (err: any) {
      if (mountedRef.current) {
        toastRef.current({ title: '删除失败', description: err.message, variant: 'destructive' })
      }
    } finally {
      if (mountedRef.current) setDeletingNovel(false)
    }
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

            {/* Chapter search (only shown when there are many chapters) */}
            {novel && chapters.length > 10 && (
              <div className="px-3 py-1.5 border-b border-border/40 shrink-0">
                <Input
                  placeholder="搜索章节..."
                  value={chapterSearch}
                  onChange={(e) => setChapterSearch(e.target.value)}
                  className="h-7 text-xs"
                />
              </div>
            )}

            {/* Chapter list content — 简单 div + overflow-y-auto 替代 ScrollArea */}
            <div className="flex-1 overflow-y-auto">
              {!dataReady ? (
                <div className="p-4 flex items-center justify-center">
                  <Loader2 className="size-5 animate-spin text-amber-500" />
                </div>
              ) : filteredChapters.length > 0 ? (
                <div className="p-2 space-y-0.5">
                  {filteredChapters.map((ch, idx) => {
                    // Use original index in displayChapters for selection consistency
                    const originalIdx = displayChapters.findIndex(
                      (dc) => dc.index === ch.index
                    )
                    const isSelected = selectedChapterIdx === originalIdx
                    return (
                    <button
                      key={`ch-${ch.index}-${idx}`}
                      className={`w-full text-left px-2 py-1.5 rounded-md text-xs flex items-center gap-2 transition-colors ${
                        isSelected
                          ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
                          : 'hover:bg-muted/50 text-foreground'
                      }`}
                      onClick={() => handleChapterClick(originalIdx)}
                    >
                      <span className={`size-5 rounded flex items-center justify-center text-[10px] font-mono shrink-0 ${
                        isSelected ? 'bg-amber-500/20' : 'bg-muted/60'
                      }`}>
                        {originalIdx + 1}
                      </span>
                      <span className="truncate flex-1">{ch.displayTitle}</span>
                    </button>
                    )
                  })}
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
                  ) : chapterSearch ? (
                    <p className="text-xs text-muted-foreground">未找到匹配的章节</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">暂无章节数据</p>
                  )}
                </div>
              ) : (
                <div className="p-4 space-y-3"
                  onDrop={async (e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) await handleFileUpload(f) }}
                  onDragOver={(e) => e.preventDefault()}
                >
                  {/* Mode switcher: Upload vs Paste */}
                  <div className="flex items-center gap-1 p-1 bg-muted/40 rounded-md">
                    <button
                      type="button"
                      onClick={() => setInputMode('upload')}
                      className={`flex-1 px-3 py-1.5 text-xs font-medium rounded transition-colors flex items-center justify-center gap-1.5 ${
                        inputMode === 'upload'
                          ? 'bg-background text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <FileUp className="size-3.5" />
                      文件上传
                    </button>
                    <button
                      type="button"
                      onClick={() => setInputMode('paste')}
                      className={`flex-1 px-3 py-1.5 text-xs font-medium rounded transition-colors flex items-center justify-center gap-1.5 ${
                        inputMode === 'paste'
                          ? 'bg-background text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <FileText className="size-3.5" />
                      文本粘贴
                    </button>
                  </div>

                  {inputMode === 'upload' ? (
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
                  ) : (
                    <div className="space-y-2">
                      <Input
                        placeholder="小说标题（可选，留空则使用'粘贴文本'）"
                        value={pastedTitle}
                        onChange={(e) => setPastedTitle(e.target.value)}
                        className="h-8 text-xs"
                      />
                      <Textarea
                        placeholder="在此粘贴小说文本内容...&#10;&#10;支持任意长度文本，系统将自动识别章节结构。&#10;建议粘贴完整小说或部分章节，每章节会自动识别。"
                        value={pastedText}
                        onChange={(e) => setPastedText(e.target.value)}
                        className="min-h-[200px] text-xs font-mono resize-y"
                      />
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                        <span>{pastedText.length.toLocaleString()} 字符</span>
                        {pastedText.length > 0 && pastedText.length < 10 && (
                          <span className="text-amber-500">至少需要 10 个字符</span>
                        )}
                      </div>
                      <Button
                        size="sm"
                        className="w-full h-8 text-xs gap-1.5"
                        onClick={handlePasteSubmit}
                        disabled={pastedText.trim().length < 10 || submittingPaste}
                      >
                        {submittingPaste ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Sparkles className="size-3.5" />
                        )}
                        提交并解析
                      </Button>
                    </div>
                  )}
                  <input ref={fileInputRef} type="file" accept=".txt,.docx" className="hidden" onChange={handleFileSelect} />
                </div>
              )}
            </div>

            {/* Delete novel button (replaces generation config — buttons moved into each step) */}
            {novel && (
              <div className="border-t border-border p-3 shrink-0 space-y-1.5">
                {isGenerating && generationProgress > 0 && (
                  <Progress value={generationProgress} className="h-1.5" />
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="w-full h-7 text-xs gap-1.5 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20"
                  onClick={handleDeleteNovel}
                  disabled={deletingNovel}
                >
                  {deletingNovel ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />}
                  删除小说重新上传
                </Button>
              </div>
            )}
          </div>
        )}

        {/* ═══ Center Column (flex-1) ═══ */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {/* ── Stepper: 5-stage pipeline navigator ── */}
          <div className="flex items-center justify-center gap-1 px-4 py-2 border-b border-border/50 bg-muted/20 shrink-0 overflow-x-auto">
            {PIPELINE_STEPS.map((step, idx) => {
              const isActive = activeTab === step.key
              const isCompleted =
                (step.key === 'source' && chapters.length > 0) ||
                (step.key === 'events' && !!eventsData?.length) ||
                (step.key === 'skeleton' && !!parsedContent.skeleton) ||
                (step.key === 'strategy' && !!parsedContent.strategy) ||
                (step.key === 'scripts' && episodes.length > 0)
              const Icon = step.icon
              const isDisabled = !novel && step.key !== 'source'
              return (
                <div key={step.key} className="flex items-center shrink-0">
                  <button
                    onClick={() => setActiveTab(step.key)}
                    disabled={isDisabled}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                      isActive
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : isCompleted
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20'
                        : 'text-muted-foreground hover:bg-muted/50'
                    } ${isDisabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    <span className={`size-5 rounded-full flex items-center justify-center text-[10px] ${
                      isActive ? 'bg-primary-foreground/20' : isCompleted ? 'bg-emerald-500/20' : 'bg-muted'
                    }`}>
                      {isCompleted && !isActive ? <Check className="size-3" /> : <Icon className="size-3" />}
                    </span>
                    {step.label}
                    {step.key === 'scripts' && completedEpisodes > 0 && (
                      <Badge variant="secondary" className="text-[10px] px-1 py-0 ml-0.5 h-4">{completedEpisodes}</Badge>
                    )}
                  </button>
                  {idx < PIPELINE_STEPS.length - 1 && (
                    <div className={`w-6 h-px ${isCompleted ? 'bg-emerald-500/40' : 'bg-border'}`} />
                  )}
                </div>
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

            {/* ── Tab: 章节事件 ── */}
            {activeTab === 'events' && (
              <div className="p-4 max-w-4xl mx-auto">
                {!dataReady ? (
                  <div className="flex flex-col items-center justify-center py-16">
                    <Loader2 className="size-8 animate-spin text-amber-500 mb-3" />
                    <p className="text-sm text-muted-foreground">正在加载数据...</p>
                  </div>
                ) : eventsData && eventsData.length > 0 ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        共 {eventsData.length} 条章节事件
                      </span>
                      <div className="flex items-center gap-1.5">
                        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => setEventsData(null)}>
                          <X className="size-3" />清除
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={handleExtractEvents} disabled={!novel || extractingEvents || isGenerating}>
                          {extractingEvents ? <Loader2 className="size-3 animate-spin" /> : <Zap className="size-3 text-amber-500" />}
                          重新提取
                        </Button>
                      </div>
                    </div>
                    <div className="rounded-lg border border-border/50 overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead className="bg-muted/40 text-muted-foreground">
                            <tr>
                              <th className="text-left font-medium px-3 py-2">章节</th>
                              <th className="text-left font-medium px-3 py-2">角色</th>
                              <th className="text-left font-medium px-3 py-2">事件</th>
                              <th className="text-left font-medium px-3 py-2">主线</th>
                              <th className="text-left font-medium px-3 py-2">密度</th>
                              <th className="text-left font-medium px-3 py-2">预计时长</th>
                              <th className="text-left font-medium px-3 py-2">情绪</th>
                            </tr>
                          </thead>
                          <tbody>
                            {eventsData.map((ev, idx) => (
                              <tr key={idx} className="border-t border-border/40 hover:bg-muted/20">
                                <td className="px-3 py-2 font-medium text-foreground">{ev.chapter}</td>
                                <td className="px-3 py-2 text-blue-500">{ev.characters}</td>
                                <td className="px-3 py-2 text-muted-foreground">{ev.event}</td>
                                <td className="px-3 py-2">
                                  <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5">{ev.mainline}</Badge>
                                </td>
                                <td className="px-3 py-2 text-muted-foreground">{ev.density}</td>
                                <td className="px-3 py-2 text-muted-foreground">{ev.estimatedDuration}</td>
                                <td className="px-3 py-2 text-muted-foreground">{ev.emotion}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                ) : (
                  <EmptyState
                    icon={<Zap className="size-10 text-amber-500" />}
                    title="章节事件"
                    description="提取每章的角色、事件、情绪密度等结构化事件信息，作为生成骨架与剧本的参考"
                    actionLabel={extractingEvents ? '提取中...' : '提取章节事件'}
                    onAction={handleExtractEvents}
                    disabled={!novel || extractingEvents || isGenerating}
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
                        {editingSkeleton ? (
                          <Button variant="default" size="sm" className="h-7 text-xs gap-1" onClick={handleSaveSkeleton} disabled={savingSkeleton || isGenerating}>
                            {savingSkeleton ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
                            保存到数据库
                          </Button>
                        ) : (
                          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => setEditingSkeleton(true)}>
                            <FileText className="size-3" />编辑
                          </Button>
                        )}
                        {editingSkeleton && (
                          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => {
                            setSkeletonEdit(parsedContent.skeleton || '')
                            setEditingSkeleton(false)
                          }}>
                            <X className="size-3" />取消
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={handleGenerateSkeleton} disabled={isGenerating}>
                          {generatingSkeleton ? <Loader2 className="size-3 animate-spin" /> : <RotateCcw className="size-3" />}
                          重新生成
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
                    actionLabel={generatingSkeleton ? '生成中...' : '生成故事骨架'}
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
                        {editingStrategy ? (
                          <Button variant="default" size="sm" className="h-7 text-xs gap-1" onClick={handleSaveStrategy} disabled={savingStrategy || isGenerating}>
                            {savingStrategy ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
                            保存到数据库
                          </Button>
                        ) : (
                          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => setEditingStrategy(true)}>
                            <FileText className="size-3" />编辑
                          </Button>
                        )}
                        {editingStrategy && (
                          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => {
                            setStrategyEdit(parsedContent.strategy || '')
                            setEditingStrategy(false)
                          }}>
                            <X className="size-3" />取消
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={handleGenerateStrategy} disabled={isGenerating}>
                          {generatingStrategy ? <Loader2 className="size-3 animate-spin" /> : <RotateCcw className="size-3" />}
                          重新生成
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
                    actionLabel={generatingStrategy ? '生成中...' : '生成改编策略'}
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
                    {/* Action bar: batch generate + range input + refresh */}
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <span className="text-xs text-muted-foreground">
                        共 {episodes.length} 集 · 已完成 {completedEpisodes} 集
                      </span>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-muted-foreground">集范围</span>
                          <Input type="number" min={1} value={episodeRangeStart} onChange={(e) => setEpisodeRangeStart(parseInt(e.target.value) || 1)} className="h-7 text-xs w-16" />
                          <span className="text-[10px] text-muted-foreground">至</span>
                          <Input type="number" min={1} value={episodeRangeEnd} onChange={(e) => setEpisodeRangeEnd(parseInt(e.target.value) || 10)} className="h-7 text-xs w-16" />
                        </div>
                        <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={loadScriptStatus}>
                          <RefreshCw className="size-3" />刷新状态
                        </Button>
                        <Button size="sm" className="h-7 text-xs gap-1" onClick={handleGenerateScripts} disabled={!parsedContent.strategy || generatingScripts || isGenerating}>
                          {generatingScripts ? <Loader2 className="size-3 animate-spin" /> : <Play className="size-3" />}
                          批量生成剧本
                        </Button>
                      </div>
                    </div>
                    {isGenerating && generationProgress > 0 && (
                      <Progress value={generationProgress} className="h-1.5" />
                    )}
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
                            <div className="flex items-center gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs gap-1"
                                disabled={regeneratingEp === ep.id || isGenerating}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleRegenerateEpisode(ep.id)
                                }}
                                title="重新生成此集剧本"
                              >
                                {regeneratingEp === ep.id ? (
                                  <Loader2 className="size-3 animate-spin" />
                                ) : (
                                  <RotateCcw className="size-3" />
                                )}
                                重新生成此集
                              </Button>
                              <ChevronDown className={`size-4 text-muted-foreground transition-transform duration-200 ${expandedEpisode === ep.id ? 'rotate-180' : ''}`} />
                            </div>
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
                    actionLabel={generatingScripts ? '生成中...' : '批量生成剧本'}
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
          {/* Events Display */}
          {eventsData && eventsData.length > 0 && (
            <div className="border-b border-border p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <Zap className="size-3 text-amber-500" />
                  章节事件 ({eventsData.length})
                </span>
                <Button variant="ghost" size="sm" className="size-6 p-0" onClick={() => setEventsData(null)}>
                  <X className="size-3.5" />
                </Button>
              </div>
              <div className="max-h-60 overflow-y-auto space-y-1">
                {eventsData.map((ev, idx) => (
                  <div key={idx} className="text-[10px] p-2 bg-muted/40 rounded border border-border/40">
                    <div className="font-medium text-foreground mb-0.5">{ev.chapter}</div>
                    <div className="text-muted-foreground">
                      <span className="text-blue-500">{ev.characters}</span>
                      <span className="mx-1">·</span>
                      <span>{ev.event}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-[9px] text-muted-foreground/70">
                      <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5">{ev.mainline}</Badge>
                      <span>{ev.density}密度</span>
                      <span>{ev.estimatedDuration}</span>
                      <span>{ev.emotion}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
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
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
