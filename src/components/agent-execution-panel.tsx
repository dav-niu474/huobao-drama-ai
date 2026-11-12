'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from '@/components/ui/collapsible'
import {
  Loader2,
  Check,
  X,
  ChevronDown,
  ChevronRight,
  Wrench,
  Brain,
  Sparkles,
  AlertCircle,
  Play,
  FileText,
  Clock,
  Zap,
  Eye,
  RotateCcw,
  ScrollText,
} from 'lucide-react'
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

// ── Types ──────────────────────────────────────────────────

export interface AgentLogEntry {
  id: string
  type: 'starting' | 'thinking' | 'tool_call' | 'tool_result' | 'tool_error' | 'text_output' | 'text_stream' | 'completed' | 'error'
  message: string
  timestamp: number
  stepNumber?: number
  toolCall?: {
    id: string
    name: string
    arguments: Record<string, unknown>
  }
  toolResult?: {
    name: string
    result?: unknown
    error?: string
  }
  textOutput?: string
  agentType?: string
  agentName?: string
  skillLoaded?: boolean
  duration?: number
  toolCalls?: unknown[]
  steps?: number
  /** Whether this is a streaming thinking entry that should be updated in place */
  isStreamingThinking?: boolean
}

export interface AgentExecutionPanelProps {
  /** Agent type identifier */
  agentType: string
  /** Agent display name */
  agentName: string
  /** Whether the agent is currently running */
  isRunning: boolean
  /** Log entries from SSE events */
  logs: AgentLogEntry[]
  /** Final result text */
  resultText?: string
  /** Total execution duration in ms */
  duration?: number
  /** Error message if any */
  error?: string | null
  /** Whether the panel is expanded by default */
  defaultExpanded?: boolean
}

// ── Entry visual mapping ──────────────────────────────────

const ENTRY_BADGES: Record<
  AgentLogEntry['type'],
  { label: string; className: string } | null
> = {
  starting: { label: '启动', className: 'text-blue-600 dark:text-blue-300 bg-blue-500/[0.08] border-blue-500/25 dark:border-blue-400/30' },
  thinking: { label: '思考', className: 'text-violet-600 dark:text-violet-300 bg-violet-500/[0.08] border-violet-500/25 dark:border-violet-400/30' },
  text_stream: { label: '思考', className: 'text-violet-600 dark:text-violet-300 bg-violet-500/[0.08] border-violet-500/25 dark:border-violet-400/30' },
  tool_call: { label: '工具', className: 'text-amber-600 dark:text-amber-300 bg-amber-500/[0.08] border-amber-500/25 dark:border-amber-400/30' },
  tool_result: { label: '结果', className: 'text-emerald-600 dark:text-emerald-300 bg-emerald-500/[0.08] border-emerald-500/25 dark:border-emerald-400/30' },
  tool_error: { label: '错误', className: 'text-red-600 dark:text-red-300 bg-red-500/[0.08] border-red-500/25 dark:border-red-400/30' },
  text_output: { label: '输出', className: 'text-sky-600 dark:text-sky-300 bg-sky-500/[0.08] border-sky-500/25 dark:border-sky-400/30' },
  completed: { label: '完成', className: 'text-emerald-700 dark:text-emerald-200 bg-emerald-500/15 border-emerald-500/40 dark:border-emerald-400/40 font-medium' },
  error: { label: '失败', className: 'text-red-700 dark:text-red-200 bg-red-500/15 border-red-500/40 dark:border-red-400/40 font-medium' },
}

const NODE_BG: Record<AgentLogEntry['type'], string> = {
  starting: 'bg-blue-500/10',
  thinking: 'bg-violet-500/10',
  text_stream: 'bg-violet-500/10',
  tool_call: 'bg-amber-500/10',
  tool_result: 'bg-emerald-500/10',
  tool_error: 'bg-red-500/10',
  text_output: 'bg-sky-500/10',
  completed: 'bg-emerald-500/15',
  error: 'bg-red-500/15',
}

function getEntryIcon(type: AgentLogEntry['type']) {
  switch (type) {
    case 'starting':
      return <Play className="size-3.5 text-blue-500" />
    case 'thinking':
      return <Brain className="size-3.5 text-violet-500" />
    case 'text_stream':
      return <Brain className="size-3.5 text-violet-500" />
    case 'tool_call':
      return <Wrench className="size-3.5 text-amber-500" />
    case 'tool_result':
      return <Check className="size-3.5 text-emerald-500" />
    case 'tool_error':
      return <X className="size-3.5 text-red-500" />
    case 'text_output':
      return <FileText className="size-3.5 text-sky-500" />
    case 'completed':
      return <Sparkles className="size-3.5 text-emerald-500" />
    case 'error':
      return <AlertCircle className="size-3.5 text-red-500" />
    default:
      return <Zap className="size-3.5 text-muted-foreground" />
  }
}

function getEntryBadge(type: AgentLogEntry['type']) {
  const def = ENTRY_BADGES[type]
  if (!def) return null
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full border px-2 py-px text-[10px] leading-4',
        def.className
      )}
    >
      {def.label}
    </span>
  )
}

// ── Tool argument formatter ───────────────────────────────

function formatToolArgs(args: Record<string, unknown>): string {
  try {
    // For array arguments, show count instead of full content
    const summarized: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(args)) {
      if (Array.isArray(value)) {
        summarized[key] = `[${value.length}项]`
      } else if (typeof value === 'string' && value.length > 100) {
        summarized[key] = value.slice(0, 100) + '...'
      } else {
        summarized[key] = value
      }
    }
    return JSON.stringify(summarized, null, 2)
  } catch {
    return String(args)
  }
}

function formatToolResult(result: unknown): string {
  if (!result || typeof result !== 'object') return String(result)
  try {
    const str = JSON.stringify(result, null, 2)
    // Truncate very long results
    if (str.length > 500) {
      return str.slice(0, 500) + '\n... (结果已截断)'
    }
    return str
  } catch {
    return String(result)
  }
}

// ── Time formatter ────────────────────────────────────────

function formatTime(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`
}

function formatTimestamp(ts: number, startTs: number): string {
  const diff = ts - startTs
  if (diff < 1000) return `+${diff}ms`
  return `+${(diff / 1000).toFixed(1)}s`
}

/** When the step chip is rendered, strip the duplicated "步骤 N: " prefix from the message */
function stripStepPrefix(message: string, stepNumber?: number): string {
  if (!stepNumber) return message
  return message
    .replace(new RegExp(`^步骤\\s*${stepNumber}\\s*[:：]\\s*`), '')
    .replace(new RegExp(`^Step\\s*${stepNumber}\\s*[:：]\\s*`, 'i'), '')
}

// ── Tool name display mapping ─────────────────────────────

const TOOL_DISPLAY_NAMES: Record<string, string> = {
  read_episode_script: '📖 读取剧本',
  save_script: '💾 保存剧本',
  read_script_for_extraction: '📖 读取剧本(提取)',
  read_existing_characters: '👥 查看已有角色',
  read_existing_scenes: '🎬 查看已有场景',
  save_characters: '💾 保存角色',
  save_scenes: '💾 保存场景',
  read_storyboard_context: '📋 读取分镜上下文',
  save_storyboards: '💾 保存分镜',
  update_storyboard: '✏️ 更新分镜',
  get_characters: '👥 获取角色列表',
  list_available_voices: '🔊 浏览音色库',
  assign_voice: '🎤 分配音色',
  read_characters: '👥 读取角色',
  read_scenes: '🎬 读取场景',
  read_shots: '🎞️ 读取镜头',
  generate_character_prompt: '✨ 生成角色提示词',
  generate_scene_prompt: '✨ 生成场景提示词',
  generate_grid_prompt: '✨ 生成宫格提示词',
}

// ── Sub-component: Single Log Entry ──────────────────────

function LogEntryItem({
  entry,
  startTimestamp,
  isLast,
}: {
  entry: AgentLogEntry
  startTimestamp: number
  isLast: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const hasDetails = entry.toolCall || entry.toolResult || (entry.textOutput && entry.textOutput.length > 80)

  // For streaming thinking, show content preview with animation
  const isStreamingThinking = entry.isStreamingThinking
  const isErrorEntry = entry.type === 'error'
  const displayMessage = stripStepPrefix(entry.message, entry.stepNumber)
  const thinkingPreview = isStreamingThinking && entry.message.length > 200
    ? entry.message.slice(0, 200) + '...'
    : entry.message

  return (
    <div className="relative flex gap-3">
      {/* Timeline connector */}
      <div className="flex flex-col items-center">
        <div
          className={cn(
            'rounded-full p-1.5 shrink-0',
            NODE_BG[entry.type] ?? 'bg-muted/50',
            isStreamingThinking && isLast && 'animate-pulse'
          )}
        >
          {getEntryIcon(entry.type)}
        </div>
        {!isLast && (
          <div className="w-px flex-1 bg-border min-h-[16px]" />
        )}
      </div>

      {/* Content */}
      <div
        className={cn(
          'flex-1 min-w-0',
          isErrorEntry
            ? 'mb-3 rounded-lg border border-red-500/20 bg-red-500/[0.06] px-3 py-2 dark:border-red-400/20 dark:bg-red-400/[0.06]'
            : 'pb-3'
        )}
      >
        <div className="flex items-start gap-2 flex-wrap">
          {getEntryBadge(entry.type)}
          <span
            className={cn(
              'min-w-0 flex-1 text-[13px] font-medium leading-5 break-words',
              isErrorEntry && 'text-red-600 dark:text-red-300',
              entry.type === 'completed' && 'text-emerald-600 dark:text-emerald-300'
            )}
          >
            {isStreamingThinking ? '思考中...' : displayMessage}
          </span>
          {entry.stepNumber && !displayMessage.startsWith('步骤') && !displayMessage.startsWith('Step') && (
            <span className="shrink-0 rounded bg-muted/70 px-1.5 py-px font-mono text-[10px] text-muted-foreground">
              步骤 {entry.stepNumber}
            </span>
          )}
          <span className="shrink-0 pt-0.5 font-mono text-[10px] text-muted-foreground/70 tabular-nums ml-auto">
            {formatTimestamp(entry.timestamp, startTimestamp)}
          </span>
        </div>

        {/* Streaming thinking content preview */}
        {isStreamingThinking && entry.message.length > 30 && (
          <div className="mt-1.5 ml-0">
            <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap max-h-32 overflow-y-auto">
              {thinkingPreview}
            </p>
          </div>
        )}

        {/* Tool call details */}
        {entry.toolCall && (
          <div className="mt-1.5">
            <div className="flex items-center gap-1.5">
              <Wrench className="size-3 text-amber-500" />
              <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                {TOOL_DISPLAY_NAMES[entry.toolCall.name] || entry.toolCall.name}
              </span>
            </div>
            {hasDetails && (
              <Collapsible open={expanded} onOpenChange={setExpanded}>
                <CollapsibleTrigger asChild>
                  <button className="rounded px-1 py-0.5 -mx-1 text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted/60 flex items-center gap-1 mt-1 transition-colors">
                    {expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
                    {expanded ? '收起参数' : '查看参数'}
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <pre className="mt-1 rounded-md border border-border/40 bg-muted/40 p-2 text-[11px] overflow-x-auto max-h-40 overflow-y-auto font-mono leading-relaxed">
                    {formatToolArgs(entry.toolCall.arguments)}
                  </pre>
                </CollapsibleContent>
              </Collapsible>
            )}
          </div>
        )}

        {/* Tool result details */}
        {entry.toolResult && (
          <div className="mt-1.5">
            <div className="flex items-center gap-1.5">
              {entry.toolResult.error ? (
                <X className="size-3 text-red-500" />
              ) : (
                <Check className="size-3 text-emerald-500" />
              )}
              <span className={`text-xs font-semibold ${entry.toolResult.error ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                {entry.toolResult.error ? '执行失败' : '执行成功'}
              </span>
            </div>
            {hasDetails && (
              <Collapsible open={expanded} onOpenChange={setExpanded}>
                <CollapsibleTrigger asChild>
                  <button className="rounded px-1 py-0.5 -mx-1 text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted/60 flex items-center gap-1 mt-1 transition-colors">
                    {expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
                    {expanded ? '收起结果' : '查看结果'}
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <pre className="mt-1 rounded-md border border-border/40 bg-muted/40 p-2 text-[11px] overflow-x-auto max-h-40 overflow-y-auto font-mono leading-relaxed">
                    {entry.toolResult.error || formatToolResult(entry.toolResult.result)}
                  </pre>
                </CollapsibleContent>
              </Collapsible>
            )}
          </div>
        )}

        {/* Text output preview */}
        {entry.textOutput && entry.textOutput.length > 0 && (
          <div className="mt-1.5">
            {entry.textOutput.length > 200 ? (
              <Collapsible open={expanded} onOpenChange={setExpanded}>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {entry.textOutput.slice(0, 200)}...
                </p>
                <CollapsibleTrigger asChild>
                  <button className="text-[10px] text-primary hover:text-primary/80 flex items-center gap-1 mt-1 transition-colors">
                    {expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
                    {expanded ? '收起' : '展开全文'}
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <pre className="rounded-md border border-border/40 bg-muted/40 p-2 text-xs overflow-x-auto max-h-60 overflow-y-auto whitespace-pre-wrap leading-relaxed">
                    {entry.textOutput}
                  </pre>
                </CollapsibleContent>
              </Collapsible>
            ) : (
              <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">
                {entry.textOutput}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────

export function AgentExecutionPanel({
  agentType,
  agentName,
  isRunning,
  logs,
  resultText,
  duration,
  error,
  defaultExpanded = true,
}: AgentExecutionPanelProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (!scrollRef.current || !expanded) return
    // Use requestAnimationFrame to ensure DOM has updated
    requestAnimationFrame(() => {
      const root = scrollRef.current
      if (!root) return
      // Radix ScrollArea scrolls on its inner viewport, not the root node
      const viewport = root.querySelector<HTMLElement>('[data-radix-scroll-area-viewport]')
      const target = viewport ?? root
      target.scrollTop = target.scrollHeight
    })
  }, [logs, expanded])

  const startTimestamp = logs.length > 0 ? logs[0].timestamp : Date.now()

  // Calculate stats
  const toolCallCount = logs.filter(l => l.type === 'tool_call').length
  const toolResultCount = logs.filter(l => l.type === 'tool_result').length
  const toolErrorCount = logs.filter(l => l.type === 'tool_error').length
  const totalSteps = logs.reduce((max, l) => Math.max(max, l.stepNumber || 0), 0)

  // Get skill status from starting event
  const startEvent = logs.find(l => l.type === 'starting')
  const skillLoaded = startEvent?.skillLoaded

  // Avoid double-rendering the same failure: the timeline's trailing "失败"
  // row already carries the message when the SSE error event produced both.
  const lastLog = logs.length > 0 ? logs[logs.length - 1] : null
  const errorShownInTimeline = !!(error && lastLog && lastLog.type === 'error' && lastLog.message === error)
  const finishedWithSuccess = !!lastLog && lastLog.type === 'completed'

  return (
    <Card className={cn('shadow-sm transition-colors', isRunning ? 'border-primary/20' : error ? 'border-red-500/30' : 'border-border/60')}>
      <Collapsible open={expanded} onOpenChange={setExpanded}>
        <CollapsibleTrigger asChild>
          <CardHeader className="py-3 px-4 cursor-pointer hover:bg-muted/30 transition-colors">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className={cn('rounded-full p-1.5 shrink-0', isRunning ? 'bg-primary/10' : error ? 'bg-red-500/10' : finishedWithSuccess ? 'bg-emerald-500/15' : 'bg-muted')}>
                  {isRunning ? (
                    <Loader2 className="size-4 text-primary animate-spin" />
                  ) : error ? (
                    <AlertCircle className="size-4 text-red-500" />
                  ) : finishedWithSuccess ? (
                    <Sparkles className="size-4 text-emerald-500" />
                  ) : (
                    <Brain className="size-4 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0">
                  <CardTitle className="text-sm font-semibold truncate">{agentName}</CardTitle>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    <span className="rounded border border-border/40 bg-muted/60 px-1.5 py-px text-[10px] text-muted-foreground font-mono">
                      {agentType}
                    </span>
                    {skillLoaded !== undefined && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className={cn(
                            'inline-flex cursor-default items-center gap-1 rounded-full border px-1.5 py-px text-[9px] font-medium leading-3.5',
                            skillLoaded
                              ? 'text-emerald-600 bg-emerald-500/[0.08] border-emerald-500/25 dark:text-emerald-300 dark:border-emerald-400/30'
                              : 'text-amber-600 bg-amber-500/[0.08] border-amber-500/25 dark:text-amber-300 dark:border-amber-400/30'
                          )}>
                            <ScrollText className="size-2.5" />
                            {skillLoaded ? 'SKILL 已加载' : 'SKILL 缺失'}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-56">
                          {skillLoaded
                            ? '已加载该 Agent 的专业技能指南（SKILL.md），输出质量更稳定'
                            : '未找到该 Agent 的 SKILL.md 技能文件，正在使用基础提示词执行，效果可能下降'}
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2.5 shrink-0">
                {/* Stats — only render non-zero metrics */}
                {logs.length > 0 && (
                  <div className="hidden md:flex items-center gap-3 text-[11px] font-medium text-muted-foreground tabular-nums">
                    {totalSteps > 0 && (
                      <span className="flex items-center gap-1">
                        <RotateCcw className="size-3" />
                        {totalSteps} 步
                      </span>
                    )}
                    {toolCallCount > 0 && (
                      <span className="flex items-center gap-1">
                        <Wrench className="size-3" />
                        {toolCallCount} 次工具
                      </span>
                    )}
                    {toolErrorCount > 0 && (
                      <span className="flex items-center gap-1 text-red-500">
                        <X className="size-3" />
                        {toolErrorCount} 个错误
                      </span>
                    )}
                    {!!duration && duration > 0 && (
                      <span className="flex items-center gap-1">
                        <Clock className="size-3" />
                        {formatTime(duration)}
                      </span>
                    )}
                  </div>
                )}

                {isRunning && (
                  <Badge variant="outline" className="text-[10px] px-2 py-0 text-primary border-primary/30 amber-pulse">
                    执行中
                  </Badge>
                )}

                {expanded ? (
                  <ChevronDown className="size-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="size-4 text-muted-foreground" />
                )}
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="pt-0 px-4 pb-4">
            {/* Execution timeline */}
            <ScrollArea className="max-h-96" ref={scrollRef}>
              <div className="space-y-0">
                <AnimatePresence initial={false}>
                  {logs.map((entry, index) => (
                    <motion.div
                      key={entry.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.15, ease: 'easeOut' }}
                    >
                      <LogEntryItem
                        entry={entry}
                        startTimestamp={startTimestamp}
                        isLast={index === logs.length - 1}
                      />
                    </motion.div>
                  ))}
                </AnimatePresence>

                {/* Empty state */}
                {logs.length === 0 && !isRunning && (
                  <div className="flex items-center justify-center py-8 text-muted-foreground">
                    <div className="text-center">
                      <Eye className="size-8 mx-auto mb-2 opacity-40" />
                      <p className="text-xs">等待Agent执行...</p>
                    </div>
                  </div>
                )}

                {/* Loading indicator while running but no logs yet */}
                {isRunning && logs.length === 0 && (
                  <div className="flex items-center gap-2 py-4 text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" />
                    <span className="text-xs">正在连接Agent...</span>
                  </div>
                )}
              </div>
            </ScrollArea>

            {/* Error display — skipped when the timeline already shows the identical failure row */}
            {error && !errorShownInTimeline && (
              <div className="mt-3 rounded-lg border border-red-500/25 bg-red-500/[0.07] p-3 dark:border-red-400/25 dark:bg-red-400/[0.06]">
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="size-4 text-red-500 mt-0.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-red-600 dark:text-red-300">执行失败</p>
                    <p className="mt-1 whitespace-pre-wrap break-words text-xs text-red-500/90 dark:text-red-300/80 max-h-32 overflow-y-auto">
                      {error}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Result summary */}
            {resultText && !error && (
              <div className="mt-3 rounded-lg border border-emerald-500/25 bg-emerald-500/[0.07] p-3 dark:border-emerald-400/25 dark:bg-emerald-400/[0.06]">
                <div className="flex items-start gap-2.5">
                  <Sparkles className="size-4 text-emerald-500 mt-0.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-300">执行结果</p>
                    <p className="mt-1 whitespace-pre-wrap break-words text-xs text-emerald-700/90 dark:text-emerald-200/80 max-h-32 overflow-y-auto">
                      {resultText.length > 500 ? resultText.slice(0, 500) + '...' : resultText}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  )
}

// ── Hook: useAgentExecution ───────────────────────────────
// Manages the SSE stream connection and accumulates log entries

export function useAgentExecution() {
  const [logs, setLogs] = useState<Record<string, AgentLogEntry[]>>({})
  const [runningAgents, setRunningAgents] = useState<Set<string>>(new Set())
  const [resultTexts, setResultTexts] = useState<Record<string, string>>({})
  const [durations, setDurations] = useState<Record<string, number>>({})
  const [errors, setErrors] = useState<Record<string, string | null>>({})
  const idCounter = useRef(0)

  const startAgent = async (
    agentType: string,
    episodeId: string,
    dramaId: string,
    message: string,
    options?: { model?: string }
  ): Promise<{ hadErrors: boolean; toolErrors: string[] }> => {
    // Track tool errors during execution
    const toolErrors: string[] = []
    let hadTopLevelError = false

    // Reset state for this agent
    setLogs(prev => ({ ...prev, [agentType]: [] }))
    setRunningAgents(prev => new Set(prev).add(agentType))
    setResultTexts(prev => ({ ...prev, [agentType]: '' }))
    setDurations(prev => ({ ...prev, [agentType]: 0 }))
    setErrors(prev => ({ ...prev, [agentType]: null }))

    try {
      const res = await fetch(`/api/agent/${agentType}/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ episodeId, dramaId, message, model: options?.model }),
      })

      if (!res.ok) {
        const text = await res.text().catch(() => 'Unknown error')
        setErrors(prev => ({ ...prev, [agentType]: `API ${res.status}: ${text}` }))
        setRunningAgents(prev => {
          const next = new Set(prev)
          next.delete(agentType)
          return next
        })
        return { hadErrors: true, toolErrors: [] }
      }

      const reader = res.body?.getReader()
      if (!reader) {
        setErrors(prev => ({ ...prev, [agentType]: 'No readable stream' }))
        setRunningAgents(prev => {
          const next = new Set(prev)
          next.delete(agentType)
          return next
        })
        return { hadErrors: true, toolErrors: [] }
      }

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
              const event = JSON.parse(line.slice(6))
              const entryId = `log-${++idCounter.current}`

              const entry: AgentLogEntry = {
                id: entryId,
                type: event.type || event.step || 'unknown',
                message: event.message || '',
                timestamp: event.timestamp || Date.now(),
                stepNumber: event.stepNumber,
                toolCall: event.toolCall,
                toolResult: event.toolResult,
                textOutput: event.textOutput,
                agentType: event.agentType,
                agentName: event.agentName,
                skillLoaded: event.skillLoaded,
              }

              // ── Heartbeat / Streaming thinking handling ──
              // When we receive a "thinking" event that says "仍在生成中",
              // it's a heartbeat to keep the connection alive. We UPDATE
              // the last thinking entry's message instead of adding a new one.
              // For streaming thinking (actual content), we also update the
              // last thinking entry for the same step to show real-time progress.
              if (event.type === 'thinking') {
                const isHeartbeat = event.message?.includes('仍在生成中')
                const isInitialThink = event.message?.includes('正在思考')
                
                setLogs(prev => {
                  const currentLogs = prev[agentType] || []
                  // Find the last "thinking" or "text_stream" entry for this step
                  const lastThinkingIdx = [...currentLogs]
                    .reverse()
                    .findIndex(l => 
                      (l.type === 'thinking' || l.type === 'text_stream') && 
                      l.stepNumber === event.stepNumber
                    )

                  if (lastThinkingIdx !== -1) {
                    const realIdx = currentLogs.length - 1 - lastThinkingIdx
                    const existing = currentLogs[realIdx]
                    // Update the existing thinking entry:
                    // - For heartbeat: just update the message
                    // - For streaming content: update message and mark as streaming
                    const updated = [...currentLogs]
                    updated[realIdx] = { 
                      ...existing, 
                      message: event.message,
                      // If it's actual content (not heartbeat/initial), mark as streaming
                      isStreamingThinking: !isHeartbeat && !isInitialThink,
                      type: isHeartbeat ? existing.type : 'thinking',
                    }
                    return { ...prev, [agentType]: updated }
                  }
                  // No previous thinking found, add as new entry
                  return { ...prev, [agentType]: [...currentLogs, entry] }
                })
                // Don't process further — it's a thinking update
                continue
              }

              // Handle backward compatibility with old format (step field)
              if (!event.type && event.step) {
                entry.type = event.step
              }

              setLogs(prev => ({
                ...prev,
                [agentType]: [...(prev[agentType] || []), entry],
              }))

              // Handle completion
              if (entry.type === 'completed') {
                const resultText = event.textOutput || event.text || ''
                setResultTexts(prev => ({ ...prev, [agentType]: resultText }))
                if (event.duration) {
                  setDurations(prev => ({ ...prev, [agentType]: event.duration }))
                }
              }

              // Handle error
              if (entry.type === 'error') {
                setErrors(prev => ({ ...prev, [agentType]: event.message }))
                hadTopLevelError = true
              }

              // Track tool errors for caller to check
              if (entry.type === 'tool_error') {
                const errMsg = event.toolResult?.error || event.message || 'Unknown tool error'
                toolErrors.push(errMsg)
              }
            } catch {
              // ignore parse errors
            }
          }
        }
      }
    } catch (err) {
      hadTopLevelError = true
      setErrors(prev => ({
        ...prev,
        [agentType]: err instanceof Error ? err.message : String(err),
      }))
    } finally {
      setRunningAgents(prev => {
        const next = new Set(prev)
        next.delete(agentType)
        return next
      })
    }

    return { hadErrors: hadTopLevelError || toolErrors.length > 0, toolErrors }
  }

  const clearAgent = (agentType: string) => {
    setLogs(prev => {
      const next = { ...prev }
      delete next[agentType]
      return next
    })
    setResultTexts(prev => {
      const next = { ...prev }
      delete next[agentType]
      return next
    })
    setDurations(prev => {
      const next = { ...prev }
      delete next[agentType]
      return next
    })
    setErrors(prev => {
      const next = { ...prev }
      delete next[agentType]
      return next
    })
  }

  const isRunning = (agentType: string) => runningAgents.has(agentType)

  return {
    logs,
    runningAgents,
    resultTexts,
    durations,
    errors,
    startAgent,
    clearAgent,
    isRunning,
  }
}
