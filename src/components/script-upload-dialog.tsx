'use client'

import { useState, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2, Upload, FileText, Check, ChevronRight, Sparkles } from 'lucide-react'

// ── Constants ──────────────────────────────────────────────

const GENRE_OPTIONS = [
  { value: '都市', label: '都市' },
  { value: '古装', label: '古装' },
  { value: '悬疑', label: '悬疑' },
  { value: '科幻', label: '科幻' },
  { value: '甜宠', label: '甜宠' },
  { value: '复仇', label: '复仇' },
  { value: '励志', label: '励志' },
  { value: '校园', label: '校园' },
]

const STYLE_OPTIONS = [
  { value: 'realistic', label: '写实' },
  { value: 'anime', label: '动漫' },
  { value: 'cinematic', label: '电影感' },
  { value: 'comic', label: '漫画' },
  { value: 'watercolor', label: '水彩' },
  { value: '3d', label: '3D' },
]

const ACCEPTED_TYPES = ['.txt', '.md', '.docx', '.pdf']
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

// ── Types ──────────────────────────────────────────────────

interface ParsedEpisode {
  title: string
  rawContent: string
}

interface ParsedCharacter {
  name: string
  role: string
  gender: string
  description: string
}

interface ParsedScene {
  location: string
  timeOfDay: string
  description: string
}

interface ParsedProp {
  name: string
  description: string
}

interface ParsedResult {
  title: string
  genre: string
  style: string
  totalEpisodes: number
  episodes: ParsedEpisode[]
  characters: ParsedCharacter[]
  scenes: ParsedScene[]
  props: ParsedProp[]
  summary: string
}

interface ScriptUploadDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

// ── Step Indicator ─────────────────────────────────────────

function StepIndicator({ current }: { current: number }) {
  const steps = ['上传文件', 'AI解析', '确认创建']
  return (
    <div className="flex items-center gap-2 pb-2">
      {steps.map((label, i) => (
        <div key={i} className="flex items-center gap-2">
          <div
            className={`w-2.5 h-2.5 rounded-full transition-colors ${
              i < current ? 'bg-green-500' : i === current ? 'bg-primary' : 'bg-border'
            }`}
          />
          <span
            className={`text-xs ${
              i < current ? 'text-green-600' : i === current ? 'text-foreground' : 'text-muted-foreground'
            }`}
          >
            {i < current && '✓ '}{label}
          </span>
          {i < steps.length - 1 && (
            <ChevronRight className="size-3 text-muted-foreground/50" />
          )}
        </div>
      ))}
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────

export function ScriptUploadDialog({
  open,
  onOpenChange,
  onSuccess,
}: ScriptUploadDialogProps) {
  const { toast } = useToast()

  // Step: 0=upload, 1=parsing, 2=confirm
  const [step, setStep] = useState(0)
  const [uploadingText, setUploadingText] = useState('')
  const [fileName, setFileName] = useState('')
  const [charCount, setCharCount] = useState(0)
  const [parsing, setParsing] = useState(false)
  const [creating, setCreating] = useState(false)

  // Parsed result (editable)
  const [title, setTitle] = useState('')
  const [genre, setGenre] = useState('都市')
  const [style, setStyle] = useState('realistic')
  const [episodes, setEpisodes] = useState<ParsedEpisode[]>([])
  const [summary, setSummary] = useState('')
  const [autoPipeline, setAutoPipeline] = useState(true)
  const [characters, setCharacters] = useState<ParsedCharacter[]>([])
  const [scenes, setScenes] = useState<ParsedScene[]>([])
  const [props, setProps] = useState<ParsedProp[]>([])

  // Drag state
  const [dragging, setDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Reset state ──
  const reset = useCallback(() => {
    setStep(0)
    setUploadingText('')
    setFileName('')
    setCharCount(0)
    setParsing(false)
    setCreating(false)
    setTitle('')
    setGenre('都市')
    setStyle('realistic')
    setEpisodes([])
    setSummary('')
    setAutoPipeline(true)
    setDragging(false)
    setCharacters([])
    setScenes([])
    setProps([])
  }, [])

  const handleClose = (open: boolean) => {
    if (!open) reset()
    onOpenChange(open)
  }

  // ── Process file ──
  const processFile = useCallback(async (file: File) => {
    // Validate type
    const ext = '.' + file.name.split('.').pop()?.toLowerCase()
    if (!ACCEPTED_TYPES.includes(ext)) {
      toast({ title: '不支持的文件格式', description: `请上传 ${ACCEPTED_TYPES.join('/')} 格式的文件`, variant: 'destructive' })
      return
    }
    // Validate size
    if (file.size > MAX_FILE_SIZE) {
      toast({ title: '文件过大', description: '文件大小不能超过 10MB', variant: 'destructive' })
      return
    }

    try {
      const result = await api.upload.script(file)
      setUploadingText(result.text)
      setFileName(result.fileName)
      setCharCount(result.charCount)

      // Auto-parse with simple heuristics
      const parsed = simpleParse(result.text, result.fileName)
      setTitle(parsed.title)
      setGenre(parsed.genre)
      setStyle(parsed.style)
      setEpisodes(parsed.episodes)
      setSummary(parsed.summary)

      setStep(1) // Move to AI parsing step
    } catch (err) {
      toast({ title: '上传失败', description: String(err), variant: 'destructive' })
    }
  }, [toast])

  // ── Simple client-side parse (no AI needed for basic splitting) ──
  function simpleParse(text: string, fName: string): ParsedResult {
    // Try to detect episode boundaries
    const episodePatterns = [
      /第[一二三四五六七八九十百\d]+[集章幕部]/g,
      /Episode\s+\d+/gi,
      /EP\.?\s*\d+/gi,
    ]

    let splits: { index: number; title: string }[] = []

    for (const pattern of episodePatterns) {
      let match
      while ((match = pattern.exec(text)) !== null) {
        // Extract a bit more context for the title (up to 30 chars after the marker)
        const afterText = text.slice(match.index, match.index + 30).split('\n')[0].trim()
        splits.push({ index: match.index, title: afterText })
      }
      if (splits.length > 0) break
    }

    // Sort by position
    splits.sort((a, b) => a.index - b.index)

    let episodes: ParsedEpisode[]
    if (splits.length >= 2) {
      // Multi-episode detected
      episodes = splits.map((s, i) => {
        const start = s.index
        const end = i < splits.length - 1 ? splits[i + 1].index : text.length
        return {
          title: s.title.length > 20 ? s.title.slice(0, 20) + '...' : s.title,
          rawContent: text.slice(start, end).trim(),
        }
      })
    } else {
      // Single episode
      episodes = [{
        title: '第1集',
        rawContent: text.trim(),
      }]
    }

    // Infer genre from keywords
    const genreKeywords: Record<string, string[]> = {
      '甜宠': ['总裁', '霸总', '甜', '宠', '恋爱', '爱情', '告白', '吻'],
      '都市': ['公司', '职场', '城市', '公寓', '地铁', '咖啡'],
      '古装': ['朝', '皇宫', '太后', '将军', '武功', '江湖', '帝', '宫'],
      '悬疑': ['案件', '凶手', '侦探', '线索', '尸体', '谋杀', '真相'],
      '科幻': ['未来', '机器人', 'AI', '太空', '星际', '时间旅行', '宇宙'],
      '复仇': ['复仇', '报仇', '陷害', '背叛', '反击'],
      '励志': ['梦想', '奋斗', '逆袭', '坚持', '成长'],
      '校园': ['学校', '同学', '老师', '考试', '校园', '教室', '社团'],
    }

    let detectedGenre = '都市'
    let maxHits = 0
    for (const [g, keywords] of Object.entries(genreKeywords)) {
      const hits = keywords.filter(kw => text.includes(kw)).length
      if (hits > maxHits) {
        maxHits = hits
        detectedGenre = g
      }
    }

    // Infer title from filename
    const inferredTitle = fName.replace(/\.(txt|md|docx|pdf)$/i, '').replace(/[_-]/g, ' ')

    return {
      title: inferredTitle || '新短剧项目',
      genre: detectedGenre,
      style: 'realistic',
      totalEpisodes: episodes.length,
      episodes,
      characters: [],
      scenes: [],
      props: [],
      summary: `${episodes.length}集剧本，共${text.length.toLocaleString()}字`,
    }
  }

  // ── AI Parse (using script_parser agent) ──
  const handleAiParse = useCallback(async () => {
    if (!uploadingText.trim()) return
    setParsing(true)
    try {
      // Use the agent API to parse
      const result = await api.ai.agentExecute(
        'script_parser',
        '__upload__',  // dummy episodeId
        '__upload__',  // dummy dramaId
        `请分析以下剧本文本，识别剧本结构，拆分集数，推断题材和风格：\n\n${uploadingText.slice(0, 30000)}${uploadingText.length > 30000 ? '\n\n[文本已截断，共' + uploadingText.length + '字]' : ''}`
      )

      // Extract parsed data from toolCalls
      const toolCalls = result.toolCalls as Array<{ name: string; arguments: Record<string, unknown>; result: unknown }> | undefined
      const saveCall = toolCalls?.find(
        (tc) => tc.name === 'save_parsed_script'
      )
      if (saveCall && saveCall.result && !((saveCall.result as Record<string, unknown>)?.error)) {
        const data = saveCall.result as Record<string, any>
        if (data.title) setTitle(data.title)
        if (data.genre) setGenre(data.genre)
        if (data.style) setStyle(data.style)
        if (data.episodes?.length) {
          setEpisodes(data.episodes.map((ep: any, i: number) => ({
            title: ep.title || `第${i + 1}集`,
            rawContent: ep.content || ep.rawContent || '',
          })))
        }
        if (data.summary) setSummary(data.summary)
        if (data.characters?.length) setCharacters(data.characters)
        if (data.scenes?.length) setScenes(data.scenes)
        if (data.props?.length) setProps(data.props)
      }

      setStep(2) // Move to confirm step
    } catch (err) {
      // Fallback: even if AI parse fails, we still have simpleParse results
      toast({ title: 'AI解析未成功，已使用基础解析', description: '你可以手动调整信息后创建', variant: 'default' })
      setStep(2)
    } finally {
      setParsing(false)
    }
  }, [uploadingText, toast])

  // ── Create project ──
  const handleCreate = useCallback(async () => {
    if (!title.trim()) return
    setCreating(true)
    try {
      await api.createFromScript({
        title: title.trim(),
        genre,
        style,
        episodes: episodes.filter(ep => ep.rawContent.trim()),
        characters: characters.length > 0 ? characters : undefined,
        scenes: scenes.length > 0 ? scenes : undefined,
        autoStartPipeline: autoPipeline,
      })
      toast({ title: '项目创建成功', description: `已创建「${title}」项目，包含${episodes.length}集内容` })
      handleClose(false)
      onSuccess()
    } catch (err) {
      toast({ title: '创建失败', description: String(err), variant: 'destructive' })
    } finally {
      setCreating(false)
    }
  }, [title, genre, style, episodes, characters, scenes, autoPipeline, toast, handleClose, onSuccess])

  // ── Drop handlers ──
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(true)
  }
  const handleDragLeave = () => setDragging(false)
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }

  // ── Episode title edit ──
  const updateEpisodeTitle = (index: number, newTitle: string) => {
    setEpisodes(prev => prev.map((ep, i) => i === index ? { ...ep, title: newTitle } : ep))
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>上传剧本创建项目</DialogTitle>
          <DialogDescription>
            {step === 0 && '上传剧本文件，AI自动解析并创建项目'}
            {step === 1 && 'AI正在解析剧本结构...'}
            {step === 2 && '确认信息后创建项目'}
          </DialogDescription>
        </DialogHeader>

        <StepIndicator current={step} />

        <AnimatePresence mode="wait">
          {/* ── Step 0: Upload ── */}
          {step === 0 && (
            <motion.div
              key="upload"
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              className="space-y-4"
            >
              {/* Drop zone */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center gap-3 transition-colors cursor-pointer ${
                  dragging
                    ? 'border-primary bg-primary/5'
                    : 'border-border/60 hover:border-primary/40'
                }`}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className={`size-8 ${dragging ? 'text-primary' : 'text-muted-foreground'}`} />
                <p className="text-sm text-muted-foreground">拖拽文件到此处上传</p>
                <p className="text-xs text-muted-foreground/70">或点击选择文件</p>
                <p className="text-xs text-muted-foreground/50 mt-1">
                  支持 .txt .md .docx .pdf
                </p>
                <p className="text-[10px] text-muted-foreground/40">最大 10MB</p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={(e) => {
                    e.stopPropagation()
                    fileInputRef.current?.click()
                  }}
                >
                  选择文件
                </Button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.md,.docx,.pdf"
                className="hidden"
                onChange={handleFileSelect}
              />

              <p className="text-xs text-muted-foreground">
                💡 AI将自动识别剧本结构，拆分集数，推断题材和风格
              </p>
            </motion.div>
          )}

          {/* ── Step 1: Parsing ── */}
          {step === 1 && (
            <motion.div
              key="parsing"
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              className="space-y-4"
            >
              {/* File info */}
              <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
                <FileText className="size-4 text-muted-foreground" />
                <span className="text-sm flex-1 truncate">{fileName}</span>
                <span className="text-xs text-muted-foreground">{charCount.toLocaleString()}字</span>
                <span className="text-xs text-green-500">✓ 已上传</span>
              </div>

              {parsing ? (
                <div className="flex flex-col items-center gap-3 py-6">
                  <Loader2 className="size-6 text-primary animate-spin" />
                  <p className="text-sm text-muted-foreground">AI正在分析剧本结构...</p>
                  <p className="text-xs text-muted-foreground/60">识别集数、推断题材和风格</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3 py-6">
                  <Check className="size-6 text-green-500" />
                  <p className="text-sm">基础解析已完成</p>
                  <p className="text-xs text-muted-foreground">
                    识别到 {episodes.length} 集内容
                  </p>
                </div>
              )}

              <div className="flex gap-3 justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setStep(0)}
                  disabled={parsing}
                >
                  重新上传
                </Button>
                <Button
                  size="sm"
                  onClick={handleAiParse}
                  disabled={parsing}
                >
                  {parsing ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" />
                      AI解析中...
                    </>
                  ) : (
                    <>
                      <Sparkles className="size-3.5" />
                      AI增强解析
                    </>
                  )}
                </Button>
                <Button
                  size="sm"
                  onClick={() => setStep(2)}
                  disabled={parsing}
                >
                  使用当前结果
                </Button>
              </div>
            </motion.div>
          )}

          {/* ── Step 2: Confirm ── */}
          {step === 2 && (
            <motion.div
              key="confirm"
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              className="space-y-4 max-h-[60vh] overflow-y-auto"
            >
              {/* File info bar */}
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/50">
                <FileText className="size-4 text-muted-foreground" />
                <span className="text-sm flex-1 truncate">{fileName}</span>
                <span className="text-xs text-muted-foreground">{charCount.toLocaleString()}字</span>
                <span className="text-xs text-green-500">✓ 已解析</span>
              </div>

              {/* Title */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">项目名称</label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="输入项目名称"
                />
              </div>

              {/* Genre + Style */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">题材</label>
                  <Select value={genre} onValueChange={setGenre}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {GENRE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">视觉风格</label>
                  <Select value={style} onValueChange={setStyle}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STYLE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Episodes */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">
                  识别到 {episodes.length} 集内容
                  <span className="text-muted-foreground font-normal ml-1">(可编辑标题)</span>
                </label>
                <div className="space-y-2">
                  {episodes.map((ep, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/30 border border-border/50"
                    >
                      <span className="text-xs text-muted-foreground bg-muted rounded px-1.5 py-0.5 shrink-0">
                        第{i + 1}集
                      </span>
                      <Input
                        value={ep.title}
                        onChange={(e) => updateEpisodeTitle(i, e.target.value)}
                        className="h-7 text-xs border-0 bg-transparent focus-visible:ring-0 p-0"
                      />
                      <span className="text-xs text-muted-foreground shrink-0">
                        {ep.rawContent.length.toLocaleString()}字
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Extracted Characters */}
              {characters.length > 0 && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">
                    检测到 {characters.length} 个角色
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {characters.map((char, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-muted/60 border border-border/40"
                      >
                        <span className="font-medium">{char.name}</span>
                        <span className="text-muted-foreground">
                          {char.role === 'protagonist' ? '主角' : char.role === 'minor' ? '龙套' : '配角'}
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Extracted Scenes */}
              {scenes.length > 0 && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">
                    检测到 {scenes.length} 个场景
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {scenes.map((scene, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-muted/60 border border-border/40"
                      >
                        <span className="font-medium">{scene.location}</span>
                        <span className="text-muted-foreground">
                          {scene.timeOfDay === 'day' ? '日' :
                           scene.timeOfDay === 'night' ? '夜' :
                           scene.timeOfDay === 'dawn' ? '黎明' :
                           scene.timeOfDay === 'dusk' ? '黄昏' :
                           scene.timeOfDay === 'morning' ? '上午' :
                           scene.timeOfDay === 'afternoon' ? '下午' :
                           scene.timeOfDay === 'evening' ? '傍晚' : scene.timeOfDay}
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Extracted Props */}
              {props.length > 0 && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">
                    检测到 {props.length} 个道具
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {props.map((prop, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-muted/60 border border-border/40"
                      >
                        <span className="font-medium">{prop.name}</span>
                        {prop.description && (
                          <span className="text-muted-foreground">{prop.description.slice(0, 20)}{prop.description.length > 20 ? '...' : ''}</span>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Auto pipeline checkbox */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoPipeline}
                  onChange={(e) => setAutoPipeline(e.target.checked)}
                  className="rounded border-border"
                />
                <span className="text-sm text-muted-foreground">自动启动AI改写管线</span>
              </label>

              {/* Actions */}
              <div className="flex gap-3 justify-end pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setStep(1)}
                  disabled={creating}
                >
                  重新解析
                </Button>
                <Button
                  size="sm"
                  onClick={handleCreate}
                  disabled={!title.trim() || creating}
                  className="amber-glow"
                >
                  {creating ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" />
                      创建中...
                    </>
                  ) : (
                    '确认创建项目'
                  )}
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  )
}
