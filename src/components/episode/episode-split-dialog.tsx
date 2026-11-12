'use client'

// ============================================================
// EpisodeSplitDialog — 「从小说分集」弹窗
// 粘贴/上传小说 → AI 识别章节 → 按「每集章节数」拆分为多集剧集
// Backend: POST /api/dramas/[id]/split-episodes
// ============================================================

import { useEffect, useMemo, useState } from 'react'
import {
  BookOpen,
  FileText,
  Loader2,
  Sparkles,
  Upload,
  X,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { api } from '@/lib/api'
import { splitChapters } from '@/lib/chapter-splitter'

export interface EpisodeSplitDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  dramaId: string
  dramaTitle?: string
  onDone: (result: {
    episodeCount: number
    episodes: Array<{ id: string; episodeNumber: number; title: string }>
  }) => void
}

interface SplitResponse {
  success: boolean
  chapterCount: number
  chaptersPerEpisode: number
  episodeCount: number
  episodes: Array<{
    id: string
    episodeNumber: number
    title: string
    chapterCount: number
  }>
  error?: string
}

const CPE_OPTIONS = [
  { value: '0', label: '自动' },
  { value: '1', label: '1' },
  { value: '2', label: '2' },
  { value: '3', label: '3' },
  { value: '5', label: '5' },
  { value: '8', label: '8' },
]

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function EpisodeSplitDialog({
  open,
  onOpenChange,
  dramaId,
  dramaTitle,
  onDone,
}: EpisodeSplitDialogProps) {
  const { toast } = useToast()

  const [novelText, setNovelText] = useState('')
  const [docxFile, setDocxFile] = useState<File | null>(null)
  const [fileName, setFileName] = useState('')
  const [fileSize, setFileSize] = useState(0)
  const [cpe, setCpe] = useState('0') // 0 = 自动
  const [submitting, setSubmitting] = useState(false)

  // 重置状态（关闭弹窗时）
  useEffect(() => {
    if (!open) {
      setNovelText('')
      setDocxFile(null)
      setFileName('')
      setFileSize(0)
      setCpe('0')
      setSubmitting(false)
    }
  }, [open])

  // 客户端章节识别（实时预览）
  const chapters = useMemo(
    () => (novelText.trim() ? splitChapters(novelText) : []),
    [novelText]
  )
  const chapterCount = chapters.length

  const isAuto = cpe === '0'
  // 自动模式：默认按每集 3 章；超过 72 章按每集 24 章估算
  const effectiveCpe = isAuto ? (chapterCount > 72 ? 24 : 3) : Number(cpe)
  const estimatedEpisodes =
    chapterCount > 0 ? Math.ceil(chapterCount / effectiveCpe) : 0
  const cpeLabel = isAuto ? '自动' : cpe

  const canSubmit = (!!novelText.trim() || !!docxFile) && !submitting

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // 允许重复选择同一文件
    if (!file) return

    const lower = file.name.toLowerCase()
    setFileName(file.name)
    setFileSize(file.size)

    if (lower.endsWith('.docx')) {
      // docx：跳过客户端预览，保留 File 由服务端解析
      setDocxFile(file)
      setNovelText('')
      return
    }

    if (lower.endsWith('.txt')) {
      setDocxFile(null)
      try {
        const text = await file.text()
        setNovelText(text)
      } catch {
        toast({
          title: '读取文件失败',
          description: '无法读取所选 .txt 文件，请重试或直接粘贴文本',
          variant: 'destructive',
        })
        setFileName('')
        setFileSize(0)
      }
      return
    }

    toast({
      title: '不支持的文件类型',
      description: '仅支持 .txt 与 .docx 文件',
      variant: 'destructive',
    })
    setFileName('')
    setFileSize(0)
  }

  const clearFile = () => {
    setDocxFile(null)
    setNovelText('')
    setFileName('')
    setFileSize(0)
  }

  const handleSubmit = async () => {
    if (!canSubmit) return
    setSubmitting(true)

    try {
      let result: SplitResponse

      if (docxFile) {
        // .docx：FormData 直传，服务端解析
        const formData = new FormData()
        formData.append('file', docxFile)
        formData.append('chaptersPerEpisode', cpe)
        const res = await fetch(`/api/dramas/${dramaId}/split-episodes`, {
          method: 'POST',
          body: formData,
        })
        const json = (await res.json().catch(() => null)) as SplitResponse | null
        if (!res.ok) {
          toast({
            title: '分集失败',
            description: json?.error || `请求失败（${res.status}）`,
            variant: 'destructive',
          })
          return
        }
        if (!json) {
          toast({
            title: '分集失败',
            description: '服务端返回数据异常',
            variant: 'destructive',
          })
          return
        }
        result = json
      } else {
        // 粘贴文本 / .txt：走 JSON 接口
        result = await api.dramas.splitEpisodes(dramaId, {
          text: novelText,
          fileName: 'pasted-novel.txt',
          chaptersPerEpisode: Number(cpe),
          replace: true,
        })
      }

      toast({
        title: '分集完成',
        description: `共 ${result.chapterCount} 章 → ${result.episodeCount} 集`,
      })
      onDone({
        episodeCount: result.episodeCount,
        episodes: result.episodes,
      })
      onOpenChange(false)
    } catch (err) {
      toast({
        title: '分集失败',
        description: err instanceof Error ? err.message : '未知错误，请重试',
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="size-5 text-primary" />
            从小说分集
          </DialogTitle>
          <DialogDescription>
            粘贴或上传小说，AI 识别章节后按「每集章节数」自动拆分为多集剧集
            {dramaTitle ? `（${dramaTitle}）` : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Step A — 输入小说 */}
          <Tabs defaultValue="paste">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="paste">粘贴文本</TabsTrigger>
              <TabsTrigger value="upload">上传文件</TabsTrigger>
            </TabsList>

            <TabsContent value="paste" className="mt-3">
              <Textarea
                rows={8}
                placeholder="粘贴小说全文，支持「第X章」等常见章节标题格式..."
                value={novelText}
                onChange={(e) => {
                  setNovelText(e.target.value)
                  if (e.target.value.trim()) setDocxFile(null)
                }}
                disabled={submitting}
                aria-label="小说文本"
                className="resize-none font-mono text-sm"
              />
            </TabsContent>

            <TabsContent value="upload" className="mt-3">
              <label
                htmlFor="novel-file-input"
                className="flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed p-6 text-center transition-colors hover:border-primary/50"
              >
                <Upload className="size-6 text-muted-foreground" />
                <span className="text-sm font-medium">
                  点击选择 .txt / .docx 文件
                </span>
                <span className="text-xs text-muted-foreground">
                  上传后直接分集
                </span>
                <input
                  id="novel-file-input"
                  type="file"
                  accept=".txt,.docx"
                  className="hidden"
                  onChange={handleFileChange}
                  disabled={submitting}
                />
              </label>

              {fileName && (
                <div className="mt-2 flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
                  <FileText className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {fileName}
                  </span>
                  <Badge variant="secondary" className="shrink-0 text-xs">
                    {formatBytes(fileSize)}
                  </Badge>
                  {!submitting && (
                    <button
                      type="button"
                      onClick={clearFile}
                      aria-label="移除已选文件"
                      className="rounded-sm p-0.5 text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <X className="size-3.5" />
                    </button>
                  )}
                </div>
              )}
            </TabsContent>
          </Tabs>

          {/* 章节识别预览 */}
          {novelText.trim() && chapterCount > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
              <BookOpen className="size-4 shrink-0 text-primary" />
              <span className="text-sm font-medium">
                识别到 {chapterCount} 个章节
              </span>
              <div className="flex min-w-0 flex-wrap items-center gap-1">
                {chapters.slice(0, 3).map((ch) => (
                  <Badge
                    key={ch.index}
                    variant="secondary"
                    className="max-w-[130px] text-xs font-normal"
                  >
                    <span className="truncate">{ch.title}</span>
                  </Badge>
                ))}
                {chapterCount > 3 && (
                  <Badge variant="outline" className="text-xs font-normal">
                    +{chapterCount - 3}
                  </Badge>
                )}
              </div>
            </div>
          )}

          {/* Step B — 分集设置 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="cpe-select">每集章节数</Label>
              <Select
                value={cpe}
                onValueChange={(v) => setCpe(v)}
                disabled={submitting}
              >
                <SelectTrigger id="cpe-select" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>预计集数</Label>
              <div className="flex h-9 items-center gap-1.5 rounded-md border bg-muted/30 px-3">
                <span className="text-2xl font-bold leading-none">
                  {docxFile ? '—' : estimatedEpisodes}
                </span>
                <span className="text-sm text-muted-foreground">集</span>
              </div>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            {docxFile
              ? 'docx 将在上传后由服务端解析'
              : `共 ${chapterCount} 章 · 每集 ${cpeLabel} 章`}
          </p>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            取消
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {submitting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Sparkles className="size-4" />
            )}
            {submitting ? '分集中…' : '开始分集'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
