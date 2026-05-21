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
} from 'lucide-react'

// ── Types ──────────────────────────────────────────────────

export interface AgentLogEntry {
  id: string
  type: 'starting' | 'thinking' | 'tool_call' | 'tool_result' | 'tool_error' | 'text_output' | 'completed' | 'error'
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

// ── Icon mapping ──────────────────────────────────────────

function getEntryIcon(type: AgentLogEntry['type']) {
  switch (type) {
    case 'starting':
      return <Play className="size-3.5 text-blue-500" />
    case 'thinking':
      return <Brain className="size-3.5 text-violet-500 animate-pulse" />
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
      return <Zap className="size-3.5" />
  }
}

function getEntryBadge(type: AgentLogEntry['type']) {
  switch (type) {
    case 'starting':
      return <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-blue-600 border-blue-300">启动</Badge>
    case 'thinking':
      return <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-violet-600 border-violet-300">思考</Badge>
    case 'tool_call':
      return <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-amber-600 border-amber-300">工具调用</Badge>
    case 'tool_result':
      return <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-emerald-600 border-emerald-300">结果</Badge>
    case 'tool_error':
      return <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-red-600 border-red-300">错误</Badge>
    case 'text_output':
      return <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-sky-600 border-sky-300">输出</Badge>
    case 'completed':
      return <Badge className="text-[10px] px-1.5 py-0 status-completed">完成</Badge>
    case 'error':
      return <Badge className="text-[10px] px-1.5 py-0 status-failed">失败</Badge>
    default:
      return null
  }
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

  return (
    <div className="relative flex gap-3">
      {/* Timeline connector */}
      <div className="flex flex-col items-center">
        <div className={`rounded-full p-1.5 ${isLast ? 'bg-primary/10' : 'bg-muted/50'}`}>
          {getEntryIcon(entry.type)}
        </div>
        {!isLast && (
          <div className="w-px flex-1 bg-border/50 min-h-[16px]" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 pb-3 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {getEntryBadge(entry.type)}
          <span className="text-sm font-medium">{entry.message}</span>
          {entry.stepNumber && (
            <span className="text-[10px] text-muted-foreground font-mono">
              Step {entry.stepNumber}
            </span>
          )}
          <span className="text-[10px] text-muted-foreground font-mono ml-auto">
            {formatTimestamp(entry.timestamp, startTimestamp)}
          </span>
        </div>

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
                  <button className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1 mt-1 transition-colors">
                    {expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
                    {expanded ? '收起参数' : '查看参数'}
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <pre className="mt-1 text-[11px] bg-muted/50 rounded p-2 overflow-x-auto max-h-40 overflow-y-auto font-mono leading-relaxed">
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
                  <button className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1 mt-1 transition-colors">
                    {expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
                    {expanded ? '收起结果' : '查看结果'}
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <pre className="mt-1 text-[11px] bg-muted/50 rounded p-2 overflow-x-auto max-h-40 overflow-y-auto font-mono leading-relaxed">
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
                  <pre className="text-xs bg-muted/50 rounded p-2 overflow-x-auto max-h-60 overflow-y-auto whitespace-pre-wrap leading-relaxed">
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
    if (scrollRef.current && expanded) {
      const el = scrollRef.current
      // Use requestAnimationFrame to ensure DOM has updated
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight
      })
    }
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

  return (
    <Card className="border-primary/20 shadow-sm">
      <Collapsible open={expanded} onOpenChange={setExpanded}>
        <CollapsibleTrigger asChild>
          <CardHeader className="py-3 px-4 cursor-pointer hover:bg-muted/30 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`rounded-full p-1.5 ${isRunning ? 'bg-primary/10' : error ? 'bg-red-100 dark:bg-red-900/30' : 'bg-emerald-100 dark:bg-emerald-900/30'}`}>
                  {isRunning ? (
                    <Loader2 className="size-4 text-primary animate-spin" />
                  ) : error ? (
                    <AlertCircle className="size-4 text-red-500" />
                  ) : logs.length > 0 && logs[logs.length - 1]?.type === 'completed' ? (
                    <Sparkles className="size-4 text-emerald-500" />
                  ) : (
                    <Brain className="size-4 text-muted-foreground" />
                  )}
                </div>
                <div>
                  <CardTitle className="text-sm font-semibold">{agentName}</CardTitle>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-muted-foreground font-mono">{agentType}</span>
                    {skillLoaded !== undefined && (
                      <Badge variant="outline" className={`text-[9px] px-1 py-0 ${skillLoaded ? 'text-emerald-600 border-emerald-300' : 'text-amber-600 border-amber-300'}`}>
                        {skillLoaded ? '✓ SKILL已加载' : '⚠ SKILL未找到'}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {/* Stats */}
                {logs.length > 0 && (
                  <div className="hidden sm:flex items-center gap-3 text-[10px] text-muted-foreground">
                    {totalSteps > 0 && (
                      <span className="flex items-center gap-1">
                        <RotateCcw className="size-3" />
                        {totalSteps}步
                      </span>
                    )}
                    {toolCallCount > 0 && (
                      <span className="flex items-center gap-1">
                        <Wrench className="size-3" />
                        {toolCallCount}次工具
                      </span>
                    )}
                    {toolErrorCount > 0 && (
                      <span className="flex items-center gap-1 text-red-500">
                        <X className="size-3" />
                        {toolErrorCount}个错误
                      </span>
                    )}
                    {duration && (
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

            {/* Error display */}
            {error && (
              <div className="mt-3 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                <div className="flex items-start gap-2">
                  <AlertCircle className="size-4 text-red-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-red-700 dark:text-red-400">执行失败</p>
                    <p className="text-xs text-red-600 dark:text-red-300 mt-1">{error}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Result summary */}
            {resultText && !error && (
              <div className="mt-3 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
                <div className="flex items-start gap-2">
                  <Sparkles className="size-4 text-emerald-500 mt-0.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">执行结果</p>
                    <p className="text-xs text-emerald-600 dark:text-emerald-300 mt-1 whitespace-pre-wrap break-words max-h-32 overflow-y-auto">
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
        return
      }

      const reader = res.body?.getReader()
      if (!reader) {
        setErrors(prev => ({ ...prev, [agentType]: 'No readable stream' }))
        setRunningAgents(prev => {
          const next = new Set(prev)
          next.delete(agentType)
          return next
        })
        return
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
