'use client'

import { motion } from 'framer-motion'
import {
  Loader2,
  Sparkles,
  RefreshCw,
  Download,
  BookOpen,
  Upload,
  FileText,
  Trash2,
  Pencil,
  Eye,
  Wand2,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { AgentExecutionPanel, type AgentLogEntry } from '@/components/agent-execution-panel'
import { statusBadge } from './helpers'
import type { ScriptPanelProps } from './types'
import { api } from '@/lib/api'
import { splitChapters } from '@/lib/chapter-splitter'
import { useToast } from '@/hooks/use-toast'

// ============================================================
// Types for the novel chapter table
// ============================================================

interface NovelChapter {
  index: number
  title: string
  content: string
  event?: string
  characters?: string
  mainline?: string
  density?: string
  estimatedDuration?: string
  emotion?: string
}

// ============================================================
// RawNovelPanel — paste / upload novel text + chapter table + AI event extraction
// ============================================================

interface RawNovelPanelProps {
  episodeId?: string
  rawContent: string
  onRawContentChange: (v: string) => void
  onSaveRaw: () => Promise<void>
  saving: boolean
  // Legacy toolbar affordances from the parent workspace
  hasSourceChapterIds: boolean
  hasGlobalAssets: boolean
  globalAssetsImported: boolean
  importingAssets: boolean
  onImportGlobalAssets?: () => Promise<void>
  onImportFromScriptWorkbench?: () => Promise<void>
}

function RawNovelPanel({
  episodeId,
  rawContent,
  onRawContentChange,
  onSaveRaw,
  saving,
  hasSourceChapterIds,
  hasGlobalAssets,
  globalAssetsImported,
  importingAssets,
  onImportGlobalAssets,
  onImportFromScriptWorkbench,
}: RawNovelPanelProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [chapters, setChapters] = useState<NovelChapter[]>([])
  const [importMode, setImportMode] = useState<'paste' | 'upload'>('paste')
  const [pastedText, setPastedText] = useState('')
  const [fileName, setFileName] = useState('')
  const [importing, setImporting] = useState(false)
  const [extracting, setExtracting] = useState(false)

  // Preview dialog state
  const [previewChapter, setPreviewChapter] = useState<NovelChapter | null>(null)
  const [previewEvent, setPreviewEvent] = useState<NovelChapter | null>(null)

  // Edit dialog state
  const [editChapter, setEditChapter] = useState<NovelChapter | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editContent, setEditContent] = useState('')
  const [editVolume, setEditVolume] = useState('')

  // Volume per chapter (stored locally; the parser doesn't extract volumes, so default to '')
  const [volumes, setVolumes] = useState<Record<number, string>>({})

  // Drag-and-drop highlight
  const [dragActive, setDragActive] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // ── Load persisted chapters on mount ──
  const loadChapters = useCallback(async () => {
    if (!episodeId) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const res = await api.episodes.getNovelChapters(episodeId)
      if (res.chapters && res.chapters.length > 0) {
        setChapters(res.chapters)
      } else if (rawContent.trim()) {
        // No persisted chapters — sync rawContent into the textarea so the
        // user can re-import if they wish.
        setPastedText(rawContent)
      }
    } catch (err) {
      // Silent: chapter load is best-effort
      console.warn('[RawNovelPanel] loadChapters failed:', err)
    } finally {
      setLoading(false)
    }
  }, [episodeId, rawContent])

  useEffect(() => {
    void loadChapters()
  }, [loadChapters])

  // ── Import handlers ──

  const handlePasteImport = async () => {
    if (!episodeId) {
      toast({ title: '请先选择集', variant: 'destructive' })
      return
    }
    if (pastedText.trim().length < 10) {
      toast({ title: '文本过短', description: '至少 10 个字符', variant: 'destructive' })
      return
    }
    setImporting(true)
    try {
      // ★ Split chapters client-side using splitChapters — this matches the
      //   backend's logic but applies it locally so the table updates
      //   immediately with correctly-split chapters. Crucially,
      //   splitChapters only treats explicit chapter markers (第X章, 第X回,
      //   第X节, 一/二/三、, 1./1、, Chapter X, 【标题】) as chapter
      //   boundaries; everything else collapses into a single chapter so
      //   scene descriptions / dialogue lines won't be misread as chapters.
      const localChapters: NovelChapter[] = splitChapters(pastedText)
      // Persist the raw text + chapters on the backend.
      const res = await api.episodes.importNovel(
        episodeId,
        pastedText,
        fileName || 'pasted-text.txt'
      )
      // Use locally-split chapters for the table.
      setChapters(localChapters)
      onRawContentChange(pastedText)
      toast({
        title: '导入成功',
        description: `已识别 ${localChapters.length} 章（共 ${res.textLength} 字）`,
      })
      // Auto-trigger AI event extraction after a small delay so the UI
      // has a chance to render the chapter table first.
      if (localChapters.length > 0) {
        setTimeout(() => void handleExtractEvents(), 500)
      }
    } catch (err: any) {
      toast({
        title: '导入失败',
        description: err?.message || String(err),
        variant: 'destructive',
      })
    } finally {
      setImporting(false)
    }
  }

  const handleFileImport = async (file: File) => {
    if (!episodeId) {
      toast({ title: '请先选择集', variant: 'destructive' })
      return
    }
    if (!/\.(txt|docx)$/i.test(file.name)) {
      toast({
        title: '文件格式不支持',
        description: '仅支持 .txt 和 .docx 文件',
        variant: 'destructive',
      })
      return
    }
    setImporting(true)
    try {
      let localChapters: NovelChapter[] = []
      let rawText = ''

      if (file.name.toLowerCase().endsWith('.txt')) {
        // .txt files: read text on the client and split locally so the
        // table populates immediately with correct chapter boundaries.
        rawText = await file.text()
        // Strip BOM if present
        rawText = rawText.replace(/^\uFEFF/, '')
        localChapters = splitChapters(rawText)
        // Persist the raw text + chapters on the backend.
        await api.episodes.importNovel(episodeId, rawText, file.name)
      } else {
        // .docx files: requires mammoth (server-side) to extract text, so
        // we delegate to the backend which uses the same splitChapters.
        const res = await api.episodes.importNovelFile(episodeId, file)
        localChapters = res.chapters
        rawText = res.chapters.map((c) => c.content).join('\n\n')
      }

      setChapters(localChapters)
      onRawContentChange(rawText)
      toast({
        title: '导入成功',
        description: `${file.name} → ${localChapters.length} 章（共 ${rawText.length} 字）`,
      })
      // Auto-trigger AI event extraction after a small delay.
      if (localChapters.length > 0) {
        setTimeout(() => void handleExtractEvents(), 500)
      }
    } catch (err: any) {
      toast({
        title: '导入失败',
        description: err?.message || String(err),
        variant: 'destructive',
      })
    } finally {
      setImporting(false)
    }
  }

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) void handleFileImport(file)
    e.target.value = '' // reset so the same file can be re-selected
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragActive(false)
    const file = e.dataTransfer.files?.[0]
    if (file) void handleFileImport(file)
  }

  // ── Event extraction ──

  const handleExtractEvents = async () => {
    if (!episodeId) return
    setExtracting(true)
    try {
      const res = await api.episodes.extractEvents(episodeId)
      if (res.chapters?.length) {
        setChapters(res.chapters)
      }
      toast({
        title: '事件提取完成',
        description: `已为 ${res.chapterCount} 章生成事件摘要`,
      })
    } catch (err: any) {
      toast({
        title: '事件提取失败',
        description: err?.message || String(err),
        variant: 'destructive',
      })
    } finally {
      setExtracting(false)
    }
  }

  // ── Edit / Delete ──

  const openEdit = (ch: NovelChapter) => {
    setEditChapter(ch)
    setEditTitle(ch.title)
    setEditContent(ch.content)
    setEditVolume(volumes[ch.index] || '')
  }

  const saveEdit = async () => {
    if (!editChapter) return
    const updated: NovelChapter = {
      ...editChapter,
      title: editTitle.trim() || editChapter.title,
      content: editContent,
    }
    const next = chapters.map((c) => (c.index === editChapter.index ? updated : c))
    setChapters(next)
    if (editVolume) {
      setVolumes({ ...volumes, [editChapter.index]: editVolume })
    }
    setEditChapter(null)
    // Persist
    if (episodeId) {
      try {
        await api.episodes.saveNovelChapters(episodeId, next)
        toast({ title: '已保存' })
      } catch (err: any) {
        toast({
          title: '保存失败',
          description: err?.message || String(err),
          variant: 'destructive',
        })
      }
    }
  }

  const deleteChapter = async (ch: NovelChapter) => {
    if (!confirm(`确认删除「${ch.title}」？`)) return
    // Renumber remaining chapters so they stay contiguous
    const next = chapters
      .filter((c) => c.index !== ch.index)
      .map((c, i) => ({ ...c, index: i }))
    setChapters(next)
    if (episodeId) {
      try {
        await api.episodes.saveNovelChapters(episodeId, next)
        toast({ title: '已删除' })
      } catch (err: any) {
        toast({
          title: '删除失败',
          description: err?.message || String(err),
          variant: 'destructive',
        })
      }
    }
  }

  // ── Clear all (start over) ──

  const handleReset = async () => {
    if (!confirm('确认清空所有章节并重新导入？')) return
    setChapters([])
    setPastedText('')
    setFileName('')
    if (episodeId) {
      try {
        await api.episodes.saveNovelChapters(episodeId, [])
      } catch {
        /* ignore — best effort */
      }
    }
  }

  // ── Render ──

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    )
  }

  const hasChapters = chapters.length > 0

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border/50 gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono text-primary/80">01</span>
          <h2 className="text-sm font-semibold">原始内容</h2>
          {hasSourceChapterIds && hasChapters && (
            <Badge
              variant="secondary"
              className="text-[10px] gap-1 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
            >
              <BookOpen className="size-3" />
              来自剧本工作台
            </Badge>
          )}
          {hasChapters && (
            <Badge variant="outline" className="text-[10px]">
              共 {chapters.length} 章
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Import-from-script-workbench shortcut */}
          {hasSourceChapterIds && !hasChapters && onImportFromScriptWorkbench && (
            <Button
              size="sm"
              variant="outline"
              onClick={onImportFromScriptWorkbench}
              disabled={importingAssets}
              className="text-emerald-600 border-emerald-300 hover:bg-emerald-50 dark:text-emerald-400 dark:border-emerald-700 dark:hover:bg-emerald-950/30"
            >
              {importingAssets ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
              从剧本工作台导入
            </Button>
          )}
          {hasGlobalAssets && !globalAssetsImported && onImportGlobalAssets && (
            <Button
              size="sm"
              variant="outline"
              onClick={onImportGlobalAssets}
              disabled={importingAssets}
              className="text-primary border-primary/30 hover:bg-primary/5"
            >
              {importingAssets ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
              导入全局素材
            </Button>
          )}
          {globalAssetsImported && (
            <Badge variant="secondary" className="text-[10px] bg-primary/10 text-primary">
              全局素材已导入
            </Badge>
          )}
          {hasChapters && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={handleReset}
                disabled={importing || extracting}
              >
                <RefreshCw className="size-3.5" />
                重新导入
              </Button>
              <Button
                size="sm"
                onClick={handleExtractEvents}
                disabled={extracting}
                className="amber-glow"
              >
                {extracting ? <Loader2 className="size-3.5 animate-spin" /> : <Wand2 className="size-3.5" />}
                AI 提取事件
              </Button>
            </>
          )}
          <span className="text-xs text-muted-foreground">{rawContent.length} 字</span>
          <Button size="sm" onClick={onSaveRaw} disabled={saving || !rawContent.trim()}>
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : null}
            保存
          </Button>
        </div>
      </div>

      {/* Body — either input UI or chapter table */}
      <div className="flex-1 overflow-auto p-6">
        {!hasChapters ? (
          <Tabs value={importMode} onValueChange={(v) => setImportMode(v as 'paste' | 'upload')}>
            <TabsList>
              <TabsTrigger value="paste">
                <FileText className="size-3.5" />
                粘贴文本
              </TabsTrigger>
              <TabsTrigger value="upload">
                <Upload className="size-3.5" />
                上传文件
              </TabsTrigger>
            </TabsList>

            {/* Paste tab */}
            <TabsContent value="paste" className="mt-4">
              <div className="space-y-3">
                <Input
                  placeholder="文件名（可选，例如：第一章.txt）"
                  value={fileName}
                  onChange={(e) => setFileName(e.target.value)}
                  className="bg-muted/30"
                />
                <Textarea
                  className="min-h-[50vh] resize-none bg-muted/30 border-border/50 focus-visible:ring-primary/30 text-sm leading-relaxed"
                  placeholder="粘贴小说原文、故事大纲或分镜描述... 系统会自动按「第X章」等模式识别章节。"
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                />
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {pastedText.length} 字
                  </span>
                  <Button onClick={handlePasteImport} disabled={importing || pastedText.trim().length < 10}>
                    {importing ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
                    导入并拆分章节
                  </Button>
                </div>
              </div>
            </TabsContent>

            {/* Upload tab */}
            <TabsContent value="upload" className="mt-4">
              <div
                className={
                  'flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-12 text-center transition-colors ' +
                  (dragActive
                    ? 'border-primary bg-primary/5'
                    : 'border-border/60 bg-muted/20 hover:bg-muted/40')
                }
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragActive(true)
                }}
                onDragLeave={(e) => {
                  e.preventDefault()
                  setDragActive(false)
                }}
                onDrop={handleDrop}
              >
                <Upload className="size-10 text-muted-foreground mb-3" />
                <p className="text-sm font-medium">拖拽文件到此或点击选择</p>
                <p className="text-xs text-muted-foreground mt-1">
                  支持 .txt 和 .docx 文件（UTF-8）
                </p>
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={importing}
                >
                  {importing ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}
                  选择文件
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,.docx"
                  className="hidden"
                  onChange={handleFileInputChange}
                />
              </div>
            </TabsContent>
          </Tabs>
        ) : (
          <div className="space-y-3">
            <div className="rounded-md border border-border/50 bg-muted/20 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="w-12 text-center">序号</TableHead>
                    <TableHead className="w-24">卷</TableHead>
                    <TableHead className="min-w-[160px]">章节名称</TableHead>
                    <TableHead className="w-28 text-center">章节内容</TableHead>
                    <TableHead className="w-28 text-center">事件</TableHead>
                    <TableHead className="w-32 text-center">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {chapters.map((ch) => {
                    const hasEvent = !!(ch.event && ch.event.trim().length > 0)
                    const isExtractFailed =
                      hasEvent && ch.event!.startsWith('提取失败')
                    return (
                      <TableRow key={ch.index}>
                        <TableCell className="text-center text-xs font-mono text-muted-foreground">
                          {ch.index + 1}
                        </TableCell>
                        <TableCell className="text-xs">
                          {volumes[ch.index] || '—'}
                        </TableCell>
                        <TableCell className="font-medium text-sm">
                          {ch.title}
                          {ch.characters && (
                            <span className="ml-2 text-xs text-muted-foreground">
                              · {ch.characters}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setPreviewChapter(ch)}
                            className="h-7 px-2"
                          >
                            <Eye className="size-3.5" />
                            预览
                          </Button>
                        </TableCell>
                        <TableCell className="text-center">
                          {hasEvent ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setPreviewEvent(ch)}
                              className={
                                'h-7 px-2 ' +
                                (isExtractFailed
                                  ? 'text-destructive hover:text-destructive'
                                  : 'text-emerald-600 hover:text-emerald-700 dark:text-emerald-400')
                              }
                            >
                              <Eye className="size-3.5" />
                              预览
                            </Button>
                          ) : (
                            <Badge variant="outline" className="text-[10px] text-muted-foreground">
                              未提取
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => openEdit(ch)}
                              className="h-7 px-2"
                              title="编辑"
                            >
                              <Pencil className="size-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => deleteChapter(ch)}
                              className="h-7 px-2 text-destructive hover:text-destructive"
                              title="删除"
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
            <p className="text-xs text-muted-foreground">
              提示：点击「AI 提取事件」按钮可为每章生成结构化事件摘要。
            </p>
          </div>
        )}
      </div>

      {/* Chapter content preview dialog */}
      <Dialog
        open={!!previewChapter}
        onOpenChange={(o) => !o && setPreviewChapter(null)}
      >
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="size-4 text-primary" />
              {previewChapter?.title || '章节内容'}
            </DialogTitle>
            <DialogDescription>
              第 {previewChapter ? previewChapter.index + 1 : 0} 章 · 共{' '}
              {previewChapter?.content.length || 0} 字
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto">
            <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans text-foreground/90">
              {previewChapter?.content}
            </pre>
          </div>
        </DialogContent>
      </Dialog>

      {/* Event preview dialog */}
      <Dialog
        open={!!previewEvent}
        onOpenChange={(o) => !o && setPreviewEvent(null)}
      >
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wand2 className="size-4 text-emerald-600" />
              {previewEvent?.title || '事件摘要'} · 事件预览
            </DialogTitle>
            <DialogDescription>
              第 {previewEvent ? previewEvent.index + 1 : 0} 章
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto space-y-3">
            {previewEvent?.event && (
              <div className="rounded-md border border-border/50 bg-muted/30 p-3">
                <p className="text-xs font-medium text-muted-foreground mb-1">核心事件</p>
                <p className="text-sm leading-relaxed">{previewEvent.event}</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2 text-xs">
              {previewEvent?.characters && (
                <Field label="涉及角色" value={previewEvent.characters} />
              )}
              {previewEvent?.mainline && (
                <Field label="主线关系" value={previewEvent.mainline} />
              )}
              {previewEvent?.density && (
                <Field label="信息密度" value={previewEvent.density} />
              )}
              {previewEvent?.estimatedDuration && (
                <Field label="预估时长" value={previewEvent.estimatedDuration} />
              )}
              {previewEvent?.emotion && (
                <Field label="情绪强度" value={previewEvent.emotion} />
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog
        open={!!editChapter}
        onOpenChange={(o) => !o && setEditChapter(null)}
      >
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="size-4 text-primary" />
              编辑章节
            </DialogTitle>
            <DialogDescription>
              修改章节名称与正文，保存后会自动同步到云端。
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <label className="text-xs font-medium text-muted-foreground">章节名称</label>
                <Input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="mt-1 bg-muted/30"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">卷（可选）</label>
                <Input
                  placeholder="例如：第一卷"
                  value={editVolume}
                  onChange={(e) => setEditVolume(e.target.value)}
                  className="mt-1 bg-muted/30"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">章节内容</label>
              <Textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="mt-1 min-h-[40vh] resize-none bg-muted/30 text-sm leading-relaxed"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditChapter(null)}>
              <X className="size-4" />
              取消
            </Button>
            <Button onClick={saveEdit}>
              <Pencil className="size-4" />
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// Small field card used inside the event preview dialog
function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/50 bg-muted/30 p-2">
      <p className="text-[10px] font-medium text-muted-foreground mb-0.5">{label}</p>
      <p className="text-xs">{value}</p>
    </div>
  )
}

// ============================================================
// ScriptPanel — top-level panel that dispatches between raw and rewrite
// ============================================================

export function ScriptPanel({
  rawContent,
  setRawContent,
  scriptContent,
  setScriptContent,
  saving,
  aiLoading,
  isRewriting,
  episode,
  episodeId,
  agentExec,
  activeStep,
  handleSaveRaw,
  handleSaveScript,
  handleRewrite,
  handleSkipRewrite,
  // PR-F: Global asset import props
  hasGlobalAssets,
  globalAssetsImported,
  importingAssets,
  onImportGlobalAssets,
  onImportFromScriptWorkbench,
}: ScriptPanelProps) {
  // ── Determine source info ──
  const hasSourceChapterIds = (() => {
    try {
      const ids = JSON.parse(episode?.sourceChapterIds || '[]')
      return Array.isArray(ids) && ids.length > 0
    } catch {
      return false
    }
  })()

  // ── Raw content panel ──────────────────────────────────────

  if (activeStep === 'raw') {
    return (
      <RawNovelPanel
        episodeId={episodeId}
        rawContent={rawContent}
        onRawContentChange={setRawContent}
        onSaveRaw={handleSaveRaw}
        saving={saving}
        hasSourceChapterIds={hasSourceChapterIds}
        hasGlobalAssets={!!hasGlobalAssets}
        globalAssetsImported={!!globalAssetsImported}
        importingAssets={!!importingAssets}
        onImportGlobalAssets={onImportGlobalAssets}
        onImportFromScriptWorkbench={onImportFromScriptWorkbench}
      />
    )
  }

  // ── AI Rewrite panel ───────────────────────────────────────

  // No script content and not loading → empty state
  if (!scriptContent.trim() && !isRewriting && !aiLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center max-w-md"
        >
          <div className="mx-auto size-16 rounded-full bg-primary/10 flex items-center justify-center mb-5">
            <Sparkles className="size-8 text-primary" />
          </div>
          <h2 className="text-lg font-semibold mb-2">AI 剧本创作</h2>
          <p className="text-sm text-muted-foreground mb-6">
            AI 将根据小说原文和章节事件素材，自动创作完整的短剧剧本
          </p>
          <div className="flex gap-3 justify-center">
            <Button
              onClick={handleRewrite}
              disabled={!rawContent.trim() || aiLoading}
              className="amber-glow"
            >
              <Sparkles className="size-4" />
              开始创作
            </Button>
            <Button variant="outline" onClick={handleSkipRewrite} disabled={!rawContent.trim()}>
              跳过（使用原文）
            </Button>
          </div>
          {!rawContent.trim() && (
            <p className="text-xs text-muted-foreground mt-4">请先在「原始内容」中导入小说原文</p>
          )}
        </motion.div>
      </div>
    )
  }

  // Loading state — show Agent Execution Panel
  if (isRewriting || (aiLoading && activeStep === 'rewrite')) {
    return (
      <div className="flex-1 p-6 overflow-y-auto">
        <AgentExecutionPanel
          agentType="script_rewriter"
          agentName="剧本改写专家"
          isRunning={agentExec.isRunning('script_rewriter')}
          logs={(agentExec.logs['script_rewriter'] as AgentLogEntry[]) || []}
          resultText={agentExec.resultTexts['script_rewriter']}
          duration={agentExec.durations['script_rewriter']}
          error={agentExec.errors['script_rewriter']}
        />
      </div>
    )
  }

  // Content exists → editable textarea
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-3 border-b border-border/50">
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono text-primary/80">02</span>
          <h2 className="text-sm font-semibold">AI改写</h2>
          {episode?.scriptStatus && statusBadge(episode.scriptStatus)}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">{scriptContent.length} 字</span>
          <Button
            size="sm"
            variant="outline"
            onClick={handleRewrite}
            disabled={aiLoading || isRewriting}
          >
            <RefreshCw className="size-3.5" />
            重新改写
          </Button>
          <Button size="sm" onClick={handleSaveScript} disabled={saving}>
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : null}
            保存
          </Button>
        </div>
      </div>
      <div className="flex-1 p-6">
        <Textarea
          className="h-full min-h-[60vh] resize-none bg-muted/30 border-border/50 focus-visible:ring-primary/30 text-sm leading-relaxed font-mono"
          value={scriptContent}
          onChange={(e) => setScriptContent(e.target.value)}
        />
      </div>
    </div>
  )
}
