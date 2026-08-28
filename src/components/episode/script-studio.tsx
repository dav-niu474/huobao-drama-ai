'use client'

import { useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  BookOpenText,
  Check,
  ChevronDown,
  Copy,
  Eye,
  Loader2,
  PencilLine,
  Send,
  Sparkles,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import type { EpisodeDetail } from '@/lib/store'

// ============================================================
// Script parser — pure functions
// ============================================================

export interface ParsedScene {
  label: string
  name: string
  time: string
  raw: string
  startIndex: number
}

/** Matches scene header lines like "1-1 李明家客厅 日" or "第 3 场 办公室 夜" */
const SCENE_HEADER_RE = /^\s*(\d+\s*-\s*\d+|第\s*\d+\s*[场幕])\s*(.*)$/
/** Time-of-day keyword, longest alternatives first to avoid partial matches */
const TIME_RE = /(日出|日落|黄昏|清晨|傍晚|深夜|日|夜)/
/** OS monologue, e.g. "李明OS（低声）：…" or "李明（OS）：…" */
const OS_MONO_RE = /OS\s*[（(]|[（(]\s*OS/

function splitNameTime(rest: string): { name: string; time: string } {
  let s = rest.trim()
  // Strip leading 内景· / 外景· prefixes
  s = s.replace(/^\s*[内外]景\s*[·•:：]?\s*/, '')
  const tm = s.match(TIME_RE)
  const time = tm ? tm[0] : ''
  if (tm) s = s.replace(tm[0], ' ')
  s = s.replace(/[·•、]/g, ' ')
  s = s.replace(/\s+/g, ' ').trim()
  return { name: s, time }
}

/**
 * Parse a script string into scenes. Scenes are delimited by header lines
 * (e.g. "1-1 李明家客厅 日" / "第 3 场 …") or by "---" separator lines.
 */
export function parseScenes(content: string): ParsedScene[] {
  if (!content || !content.trim()) return []
  const lines = content.split(/\r?\n/)
  const scenes: ParsedScene[] = []
  let current: {
    label: string
    name: string
    time: string
    rawLines: string[]
    startIndex: number
  } | null = null

  const flush = () => {
    if (!current) return
    scenes.push({
      label: current.label,
      name: current.name,
      time: current.time,
      raw: current.rawLines.join('\n'),
      startIndex: current.startIndex,
    })
    current = null
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()
    if (/^---+$/.test(trimmed) || /^-{3,}$/.test(trimmed)) {
      flush()
      continue
    }
    const hm = line.match(SCENE_HEADER_RE)
    if (hm) {
      flush()
      const { name, time } = splitNameTime(hm[2] ?? '')
      current = { label: (hm[1] ?? '').replace(/\s+/g, ''), name, time, rawLines: [line], startIndex: i }
    } else if (current) {
      current.rawLines.push(line)
    }
    // Lines before the first header are preamble — ignored for the outline
  }
  flush()

  if (scenes.length === 0) {
    return [{ label: '正文', name: '全文', time: '', raw: content, startIndex: 0 }]
  }
  return scenes.map((s, i) => ({ ...s, name: s.name || `场景 ${i + 1}` }))
}

// ============================================================
// Read-mode line classification
// ============================================================

type ReadLine =
  | { kind: 'blank' }
  | { kind: 'scene-sep' }
  | { kind: 'minor-sep' }
  | { kind: 'header'; label: string; rest: string }
  | { kind: 'os'; text: string }
  | { kind: 'meta'; text: string }
  | { kind: 'action'; text: string }
  | { kind: 'paren'; text: string }
  | { kind: 'dialogue'; name: string; colon: string; speech: string }
  | { kind: 'plain'; text: string }

function classifyLines(content: string): ReadLine[] {
  const lines = content.split(/\r?\n/)
  const out: ReadLine[] = []
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) {
      out.push({ kind: 'blank' })
      continue
    }
    if (/^-{3,}$/.test(trimmed)) {
      out.push({ kind: 'scene-sep' })
      continue
    }
    if (trimmed === '--') {
      out.push({ kind: 'minor-sep' })
      continue
    }
    const hm = line.match(SCENE_HEADER_RE)
    if (hm) {
      out.push({ kind: 'header', label: (hm[1] ?? '').replace(/\s+/g, ''), rest: (hm[2] ?? '').trim() })
      continue
    }
    if (OS_MONO_RE.test(line)) {
      out.push({ kind: 'os', text: line })
      continue
    }
    if (/^(场景|人物)[：:]/.test(trimmed)) {
      out.push({ kind: 'meta', text: line })
      continue
    }
    if (trimmed.startsWith('△')) {
      out.push({ kind: 'action', text: line })
      continue
    }
    if (/^[（(].*[）)]$/.test(trimmed)) {
      out.push({ kind: 'paren', text: line })
      continue
    }
    const colonIdx = line.search(/[：:]/)
    if (colonIdx > 0 && colonIdx <= 15) {
      out.push({
        kind: 'dialogue',
        name: line.slice(0, colonIdx),
        colon: line.charAt(colonIdx),
        speech: line.slice(colonIdx + 1),
      })
      continue
    }
    out.push({ kind: 'plain', text: line })
  }
  return out
}

// ============================================================
// Constants & local types
// ============================================================

const DURATIONS: Array<{ value: string; label: string }> = [
  { value: '90s', label: '约90秒' },
  { value: '120s', label: '约2分钟' },
  { value: '180s', label: '约3分钟' },
  { value: '300s', label: '约5分钟' },
]

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

// ============================================================
// ScriptStudio — 剧本 tab of the episode workspace
// Self-contained dark studio theme (explicit Tailwind classes)
// ============================================================

export interface ScriptStudioProps {
  episode: EpisodeDetail | null
  scriptContent: string
  onScriptContentChange: (v: string) => void
  onSaveDraft: () => Promise<void>
  onGenerate: (opts: { duration: string; instruction: string }) => Promise<void>
  generating: boolean
  saving: boolean
  rawContent: string
  onGoSettings: () => void
}

export function ScriptStudio({
  episode,
  scriptContent,
  onScriptContentChange,
  onSaveDraft,
  onGenerate,
  generating,
  saving,
  rawContent,
  onGoSettings,
}: ScriptStudioProps) {
  const { toast } = useToast()

  // ── View state ───────────────────────────────────────────
  const [mode, setMode] = useState<'read' | 'edit'>('read')
  const [activeScene, setActiveScene] = useState(0)

  // ── Empty-state generate form ────────────────────────────
  const [duration, setDuration] = useState('120s')
  const [instruction, setInstruction] = useState('')

  // ── Footer chat ──────────────────────────────────────────
  const [question, setQuestion] = useState('')
  const [chatting, setChatting] = useState(false)
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([])
  const [answer, setAnswer] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // ── Regenerate ───────────────────────────────────────────
  const [lastDuration, setLastDuration] = useState('120s')

  const bodyRef = useRef<HTMLDivElement | null>(null)
  const sceneElRefs = useRef<Array<HTMLElement | null>>([])

  const hasScript = scriptContent.trim().length > 0
  const scenes = useMemo(() => parseScenes(scriptContent), [scriptContent])
  const readLines = useMemo(() => classifyLines(scriptContent), [scriptContent])
  const activeIdx = Math.min(activeScene, Math.max(scenes.length - 1, 0))

  // ── Scene navigation ─────────────────────────────────────
  const handleSceneClick = (idx: number) => {
    setActiveScene(idx)
    if (mode !== 'read') setMode('read')
    requestAnimationFrame(() => {
      const el = sceneElRefs.current[idx]
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  // Lightweight scroll spy: highlight the scene nearest the container top
  const handleBodyScroll = () => {
    if (mode !== 'read') return
    const container = bodyRef.current
    if (!container || scenes.length === 0) return
    const containerTop = container.getBoundingClientRect().top
    let current = 0
    for (let i = 0; i < sceneElRefs.current.length; i++) {
      const el = sceneElRefs.current[i]
      if (!el) continue
      if (el.getBoundingClientRect().top - containerTop <= 96) current = i
      else break
    }
    setActiveScene((prev) => (prev === current ? prev : current))
  }

  // ── Chat ─────────────────────────────────────────────────
  const handleAsk = async () => {
    const q = question.trim()
    if (!q || chatting || !episode) return
    setChatting(true)
    try {
      const res = await fetch(`/api/episodes/${episode.id}/script-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, history: chatHistory }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast({
          title: '提问失败',
          description: data?.error || `请求失败（${res.status}）`,
          variant: 'destructive',
        })
        return
      }
      const ans: string = typeof data?.answer === 'string' && data.answer ? data.answer : '（AI 未返回内容）'
      setChatHistory((prev) => [...prev, { role: 'user', content: q }, { role: 'assistant', content: ans }])
      setAnswer(ans)
      setQuestion('')
    } catch (err) {
      toast({
        title: '提问失败',
        description: err instanceof Error ? err.message : '网络异常，请稍后重试',
        variant: 'destructive',
      })
    } finally {
      setChatting(false)
    }
  }

  const handleCopyAnswer = async () => {
    if (!answer) return
    try {
      await navigator.clipboard.writeText(answer)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard unavailable — ignore
    }
  }

  // ── Read-mode renderer ───────────────────────────────────
  const renderReadLines = () => {
    sceneElRefs.current = []
    let sceneIdx = -1
    return readLines.map((l, idx) => {
      switch (l.kind) {
        case 'blank':
          return <div key={idx} aria-hidden className="h-3" />
        case 'scene-sep':
          return (
            <div key={idx} aria-hidden className="my-6 select-none text-center text-neutral-700">
              ※ ※ ※
            </div>
          )
        case 'minor-sep':
          return <div key={idx} aria-hidden className="my-3 border-t border-neutral-800/70" />
        case 'header': {
          sceneIdx += 1
          const sIdx = sceneIdx
          return (
            <div
              key={idx}
              id={`scene-${sIdx}`}
              ref={(el) => {
                sceneElRefs.current[sIdx] = el
              }}
              className="mt-6 scroll-mt-3 font-medium text-neutral-100 first:mt-0"
            >
              <span className="mr-2 text-lime-300">{l.label}</span>
              <span>{l.rest}</span>
            </div>
          )
        }
        case 'os':
          return <div key={idx} className="italic text-amber-200/70">{l.text}</div>
        case 'meta':
          return <div key={idx} className="text-[13px] text-neutral-500">{l.text}</div>
        case 'action':
          return <div key={idx} className="text-sky-200/80">{l.text}</div>
        case 'paren':
          return <div key={idx} className="text-[13px] italic text-neutral-500">{l.text}</div>
        case 'dialogue':
          return (
            <div key={idx}>
              <span className="text-neutral-400">
                {l.name}
                {l.colon}
              </span>
              <span className="text-neutral-200">{l.speech}</span>
            </div>
          )
        default:
          return <div key={idx} className="text-neutral-300">{l.text}</div>
      }
    })
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-neutral-950 text-neutral-200">
      {/* ── Main area ─────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1">
        {/* Left: scene outline (desktop only) */}
        <aside className="hidden w-64 shrink-0 flex-col border-r border-neutral-800/70 lg:flex">
          <div className="flex shrink-0 items-center justify-between px-4 pb-3 pt-5">
            <h2 className="text-sm font-semibold text-neutral-100">分场大纲</h2>
            <span className="rounded-full border border-neutral-800 bg-neutral-900/60 px-2 py-0.5 text-[11px] text-neutral-400">
              {scenes.length} 场
            </span>
          </div>
          <ScrollArea
            className="min-h-0 flex-1 [&_[data-slot=scroll-area-scrollbar]]:w-2 [&_[data-slot=scroll-area-thumb]]:bg-neutral-700/60"
          >
            <div className="space-y-1.5 px-3 pb-3 pt-1">
              {scenes.length === 0 ? (
                <div className="px-2 py-8 text-center text-xs leading-5 text-neutral-600">
                  生成剧本后，这里会展示分场大纲
                </div>
              ) : (
                scenes.map((s, i) => {
                  const active = i === activeIdx
                  return (
                    <button
                      key={`${s.label}-${i}`}
                      type="button"
                      onClick={() => handleSceneClick(i)}
                      aria-current={active || undefined}
                      className={cn(
                        'w-full cursor-pointer rounded-lg border px-3 py-2.5 text-left text-xs transition-colors',
                        active
                          ? 'border-lime-300/70 bg-lime-300/5 text-lime-200'
                          : 'border-neutral-800 bg-neutral-900/40 text-neutral-300 hover:border-neutral-600'
                      )}
                    >
                      <span className="block truncate">
                        <span className="font-medium">{s.label}</span>
                        <span className="mx-1.5">{s.name}</span>
                        <span className={active ? 'text-lime-300/60' : 'text-neutral-500'}>{s.time}</span>
                      </span>
                    </button>
                  )
                })
              )}
            </div>
          </ScrollArea>
          <div className="shrink-0 border-t border-neutral-800/70 px-4 py-3 text-xs text-neutral-500">
            {scenes.length} 个场次 · {scriptContent.length} 字
          </div>
        </aside>

        {/* Right: script panel */}
        <section className="flex min-w-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center justify-between px-6 pb-3 pt-5">
            <h2 className="text-sm font-semibold text-neutral-100">剧本正文</h2>
            {hasScript && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setMode((m) => (m === 'read' ? 'edit' : 'read'))}
                className="h-8 gap-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
              >
                {mode === 'read' ? <PencilLine className="size-3.5" /> : <Eye className="size-3.5" />}
                {mode === 'read' ? '编辑' : '预览'}
              </Button>
            )}
          </div>

          {generating ? (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 pb-4 text-center">
              <Loader2 className="size-7 animate-spin text-lime-300" />
              <div className="text-sm text-neutral-200">AI 正在生成本集剧本…</div>
              <div className="text-xs text-neutral-500">通常需要 30-90 秒</div>
            </div>
          ) : !hasScript ? (
            <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-4 [scrollbar-width:thin]">
              <div className="mx-auto flex w-full max-w-md flex-col items-center gap-5 py-10 text-center">
                <div className="flex size-12 items-center justify-center rounded-full bg-lime-300/10 text-lime-300">
                  <BookOpenText className="size-6" />
                </div>
                <div className="space-y-1.5">
                  <h3 className="text-lg font-semibold text-neutral-100">生成本集剧本</h3>
                  <p className="text-sm leading-6 text-neutral-400">
                    AI 将根据本集对应的小说章节（已按每集章节数拆分）自动创作剧本
                  </p>
                </div>
                <div className="w-full space-y-4 text-left">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-neutral-400">目标时长</label>
                    <Select value={duration} onValueChange={setDuration}>
                      <SelectTrigger className="w-full border-neutral-800 bg-neutral-900/70 text-neutral-200 hover:bg-neutral-900">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="border-neutral-800 bg-neutral-900 text-neutral-200">
                        {DURATIONS.map((d) => (
                          <SelectItem
                            key={d.value}
                            value={d.value}
                            className="focus:bg-neutral-800 focus:text-neutral-100"
                          >
                            {d.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-neutral-400">补充要求（可选）</label>
                    <Textarea
                      value={instruction}
                      onChange={(e) => setInstruction(e.target.value)}
                      placeholder="例如：加强父子冲突，结尾留悬念…"
                      rows={3}
                      className="min-h-[80px] resize-none border-neutral-800 bg-neutral-900/70 text-sm text-neutral-200 placeholder:text-neutral-600 focus-visible:border-lime-300/50 focus-visible:ring-lime-300/20"
                    />
                  </div>
                  <Button
                    onClick={() => void onGenerate({ duration, instruction: instruction.trim() })}
                    disabled={generating}
                    className="h-10 w-full gap-2 bg-lime-300 font-medium text-neutral-950 hover:bg-lime-200"
                  >
                    <Sparkles className="size-4" />
                    生成剧本
                  </Button>
                </div>
                {!rawContent.trim() && (
                  <div className="flex items-start gap-1.5 text-left text-xs leading-5 text-amber-200/80">
                    <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                    <span>尚未导入小说原文，请先返回项目页使用「从小说分集」导入</span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={onGoSettings}
                  className="text-xs text-neutral-500 underline-offset-4 transition-colors hover:text-lime-300 hover:underline"
                >
                  前往设置检查 AI 模型配置 →
                </button>
              </div>
            </div>
          ) : mode === 'edit' ? (
            <div className="min-h-0 flex-1 px-6 pb-4">
              <textarea
                value={scriptContent}
                onChange={(e) => onScriptContentChange(e.target.value)}
                spellCheck={false}
                aria-label="剧本正文编辑"
                className="block h-full min-h-[400px] w-full resize-none bg-transparent font-mono text-sm leading-7 text-neutral-200 focus:outline-none"
              />
            </div>
          ) : (
            <div
              ref={bodyRef}
              onScroll={handleBodyScroll}
              className="min-h-0 flex-1 overflow-y-auto px-6 pb-4 [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-neutral-700/60 [&::-webkit-scrollbar-track]:bg-transparent"
            >
              <div className="max-w-3xl whitespace-pre-wrap pb-8 text-sm leading-7">
                {renderReadLines()}
              </div>
            </div>
          )}
        </section>
      </div>

      {/* ── Footer bar ────────────────────────────────────── */}
      <footer className="shrink-0 border-t border-neutral-800/70 bg-neutral-950/90 px-4 py-3">
        <div className="flex flex-wrap items-center gap-3 gap-y-3">
          <p className="hidden shrink-0 text-xs text-neutral-500 sm:block">可手动在剧本正文中编辑修改</p>

          {/* Chat */}
          <div className="relative min-w-[200px] flex-1">
            {answer !== null && (
              <div className="absolute bottom-full left-0 z-10 mb-2 max-h-64 w-[420px] max-w-[calc(100vw-3rem)] overflow-y-auto whitespace-pre-wrap rounded-xl border border-neutral-800 bg-neutral-900 p-4 text-xs leading-5 text-neutral-300 shadow-xl [scrollbar-width:thin]">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[11px] font-medium uppercase tracking-wider text-lime-300/90">
                    AI 助手
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => void handleCopyAnswer()}
                      aria-label="复制回答"
                      className="flex size-6 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-neutral-200"
                    >
                      {copied ? <Check className="size-3.5 text-lime-300" /> : <Copy className="size-3.5" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => setAnswer(null)}
                      aria-label="关闭"
                      className="flex size-6 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-neutral-200"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                </div>
                {answer}
              </div>
            )}
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  void handleAsk()
                }
              }}
              placeholder="问问当前剧本、角色或分镜..."
              aria-label="向 AI 助手提问"
              className="w-full rounded-full border border-neutral-800 bg-neutral-900/70 px-4 py-2 pr-10 text-sm text-neutral-200 outline-none transition-colors placeholder:text-neutral-600 focus:border-lime-300/50"
            />
            <button
              type="button"
              onClick={() => void handleAsk()}
              disabled={!question.trim() || chatting || !episode}
              aria-label="发送"
              className="absolute right-1.5 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full bg-lime-300 text-neutral-950 transition-colors hover:bg-lime-200 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {chatting ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
            </button>
          </div>

          {/* Actions */}
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => void onSaveDraft()}
              disabled={saving}
              className="gap-1.5 border-neutral-700 bg-transparent text-neutral-200 hover:bg-neutral-800 hover:text-neutral-100"
            >
              {saving && <Loader2 className="size-3.5 animate-spin" />}
              保存草稿
            </Button>
            <div className="flex items-center">
              <Button
                onClick={() => void onGenerate({ duration: lastDuration, instruction: '' })}
                disabled={generating}
                className="gap-1.5 rounded-r-none bg-lime-300 pr-3 font-medium text-neutral-950 hover:bg-lime-200"
              >
                {generating ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    生成中
                  </>
                ) : hasScript ? (
                  '重新确认剧本'
                ) : (
                  '生成剧本'
                )}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    disabled={generating}
                    aria-label="选择目标时长"
                    className="rounded-l-none border-l border-neutral-950/30 bg-lime-300 px-1.5 text-neutral-950 hover:bg-lime-200"
                  >
                    <ChevronDown className="size-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="border-neutral-800 bg-neutral-900 text-neutral-200">
                  <DropdownMenuLabel className="text-xs font-normal text-neutral-500">目标时长</DropdownMenuLabel>
                  {DURATIONS.map((d) => (
                    <DropdownMenuItem
                      key={d.value}
                      className={cn(
                        'gap-2 text-xs focus:bg-neutral-800 focus:text-neutral-100',
                        d.value === lastDuration && 'text-lime-300'
                      )}
                      onClick={() => {
                        setLastDuration(d.value)
                        void onGenerate({ duration: d.value, instruction: '' })
                      }}
                    >
                      {d.value === lastDuration ? <Check className="size-3" /> : <span className="size-3" />}
                      {d.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
