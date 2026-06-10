'use client'

// ============================================================
// Queue Dashboard — Real-time queue monitoring component
// ============================================================

import React, { useEffect, useState, useCallback, useRef } from 'react'
// i18n not used in this component
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  Image,
  Video,
  Activity,
  AlertTriangle,
  RefreshCw,
  XCircle,
  CheckCircle2,
  Clock,
  Loader2,
  RotateCcw,
  Zap,
} from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────

interface QueueTask {
  id: string
  type: 'image' | 'video' | 'tts'
  category: string
  referenceId: string
  dramaId: string
  episodeId?: string
  priority: number
  status: 'queued' | 'leased' | 'running' | 'completed' | 'failed'
  maxRetries: number
  retryCount: number
  error?: string
  createdAt: string
  updatedAt: string
}

interface ChannelStatus {
  name: string
  concurrency: number
  rpm: number
  activeCount: number
  queueDepth: number
  currentRpm: number
  totalCompleted: number
  totalFailed: number
  activeTasks: QueueTask[]
}

interface QueueStatus {
  image: ChannelStatus
  video: ChannelStatus
  dlqCount: number
  dlqItems: QueueTask[]
  totalQueued: number
  totalActive: number
  totalCompleted: number
  totalFailed: number
}

interface QueueEvent {
  type: string
  task: {
    id: string
    type: string
    category: string
    status: string
    priority: number
    retryCount: number
    error?: string
  }
  timestamp: string
}

// ── Channel Card ───────────────────────────────────────────────

function ChannelCard({
  channel,
  icon: Icon,
  label,
}: {
  channel: ChannelStatus
  icon: React.ElementType
  label: string
}) {
  const rpmUsage = channel.rpm > 0 ? Math.round((channel.currentRpm / channel.rpm) * 100) : 0
  const concurrencyUsage = channel.concurrency > 0 ? Math.round((channel.activeCount / channel.concurrency) * 100) : 0
  const total = channel.totalCompleted + channel.totalFailed
  const successRate = total > 0 ? Math.round((channel.totalCompleted / total) * 100) : 100

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="h-4 w-4" />
          {label}
          <Badge variant="outline" className="ml-auto text-xs">
            {channel.activeCount}/{channel.concurrency} 并发
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* RPM Usage */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>RPM 用量</span>
            <span>{channel.currentRpm}/{channel.rpm}</span>
          </div>
          <Progress value={rpmUsage} className="h-1.5" />
        </div>

        {/* Concurrency */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>并发槽位</span>
            <span>{channel.activeCount}/{channel.concurrency}</span>
          </div>
          <Progress value={concurrencyUsage} className="h-1.5" />
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 pt-1">
          <div className="text-center">
            <div className="text-lg font-semibold">{channel.queueDepth}</div>
            <div className="text-[10px] text-muted-foreground">队列深度</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-semibold text-green-600">{channel.totalCompleted}</div>
            <div className="text-[10px] text-muted-foreground">已完成</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-semibold text-red-500">{channel.totalFailed}</div>
            <div className="text-[10px] text-muted-foreground">失败</div>
          </div>
        </div>

        {/* Success Rate */}
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">成功率</span>
          <span className={successRate >= 80 ? 'text-green-600' : successRate >= 50 ? 'text-yellow-600' : 'text-red-500'}>
            {successRate}%
          </span>
        </div>

        {/* Active Tasks */}
        {channel.activeTasks.length > 0 && (
          <div className="pt-1">
            <Separator className="mb-2" />
            <div className="text-xs font-medium text-muted-foreground mb-1.5">活动任务</div>
            <ScrollArea className="max-h-32">
              <div className="space-y-1">
                {channel.activeTasks.map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center gap-2 rounded-md bg-muted/50 px-2 py-1 text-xs"
                  >
                    {task.status === 'running' ? (
                      <Loader2 className="h-3 w-3 animate-spin text-blue-500" />
                    ) : (
                      <Clock className="h-3 w-3 text-yellow-500" />
                    )}
                    <span className="truncate flex-1">{task.category}</span>
                    {task.priority === 1 && (
                      <Zap className="h-3 w-3 text-orange-500" />
                    )}
                    <Badge variant="outline" className="text-[10px] px-1 py-0">
                      {task.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ── DLQ Section ────────────────────────────────────────────────

function DLQSection({
  items,
  onRetry,
  retrying,
}: {
  items: QueueTask[]
  onRetry: (taskId: string) => void
  retrying: Set<string>
}) {
  if (items.length === 0) return null

  return (
    <Card className="border-red-200 dark:border-red-900/30">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base text-red-600">
          <AlertTriangle className="h-4 w-4" />
          死信队列 (DLQ)
          <Badge variant="destructive" className="ml-auto">{items.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="max-h-48">
          <div className="space-y-2">
            {items.map((task) => (
              <div
                key={task.id}
                className="flex items-center gap-2 rounded-md border border-red-100 dark:border-red-900/20 bg-red-50 dark:bg-red-950/20 px-3 py-2"
              >
                <XCircle className="h-4 w-4 text-red-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-medium truncate">{task.category}</span>
                    <Badge variant="outline" className="text-[10px] px-1 py-0 shrink-0">
                      {task.type}
                    </Badge>
                    <span className="text-muted-foreground shrink-0">
                      重试 {task.retryCount}/{task.maxRetries}
                    </span>
                  </div>
                  {task.error && (
                    <p className="text-[10px] text-red-500 truncate mt-0.5">{task.error}</p>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs shrink-0"
                  onClick={() => onRetry(task.id)}
                  disabled={retrying.has(task.id)}
                >
                  {retrying.has(task.id) ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <RotateCcw className="h-3 w-3" />
                  )}
                  重试
                </Button>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  )
}

// ── Main Dashboard ─────────────────────────────────────────────

export function QueueDashboard() {
  const [status, setStatus] = useState<QueueStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [retrying, setRetrying] = useState<Set<string>>(new Set())
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date())
  const eventSourceRef = useRef<EventSource | null>(null)

  // Fetch queue status
  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/queue')
      if (res.ok) {
        const data = await res.json()
        setStatus(data)
        setLastUpdate(new Date())
      }
    } catch (err) {
      console.error('[QueueDashboard] Failed to fetch status:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  // Retry DLQ item
  const handleRetry = useCallback(async (taskId: string) => {
    setRetrying((prev) => new Set(prev).add(taskId))
    try {
      const res = await fetch('/api/queue/dlq', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId }),
      })
      if (res.ok) {
        await fetchStatus()
      }
    } catch (err) {
      console.error('[QueueDashboard] Retry failed:', err)
    } finally {
      setRetrying((prev) => {
        const next = new Set(prev)
        next.delete(taskId)
        return next
      })
    }
  }, [fetchStatus])

  // SSE connection for real-time updates
  useEffect(() => {
    fetchStatus()

    // Set up SSE connection
    try {
      const es = new EventSource('/api/queue/events')
      eventSourceRef.current = es

      es.onmessage = (event) => {
        if (event.data) {
          try {
            const data = JSON.parse(event.data)
            if (data.type === 'connected') return
            // Refresh status on any event
            fetchStatus()
          } catch {
            // Ignore parse errors
          }
        }
      }

      es.onerror = () => {
        // Reconnect will happen automatically
      }
    } catch {
      // SSE not available, fall back to polling
    }

    // Also poll every 5 seconds as fallback
    const poll = setInterval(fetchStatus, 5000)

    return () => {
      clearInterval(poll)
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
      }
    }
  }, [fetchStatus])

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">加载队列状态...</span>
      </div>
    )
  }

  if (!status) {
    return (
      <div className="flex items-center justify-center p-8">
        <XCircle className="h-6 w-6 text-red-500" />
        <span className="ml-2 text-sm text-red-500">无法加载队列状态</span>
        <Button size="sm" variant="outline" className="ml-3" onClick={fetchStatus}>
          <RefreshCw className="h-3 w-3 mr-1" />
          重试
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5" />
          <h2 className="text-lg font-semibold">生成队列</h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">
            更新于 {lastUpdate.toLocaleTimeString()}
          </span>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={fetchStatus}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Overall Stats */}
      <div className="grid grid-cols-4 gap-3">
        <div className="rounded-lg border p-3 text-center">
          <div className="text-xl font-bold">{status.totalQueued}</div>
          <div className="text-[10px] text-muted-foreground">排队中</div>
        </div>
        <div className="rounded-lg border p-3 text-center">
          <div className="text-xl font-bold text-blue-500">{status.totalActive}</div>
          <div className="text-[10px] text-muted-foreground">执行中</div>
        </div>
        <div className="rounded-lg border p-3 text-center">
          <div className="text-xl font-bold text-green-600">{status.totalCompleted}</div>
          <div className="text-[10px] text-muted-foreground">已完成</div>
        </div>
        <div className="rounded-lg border p-3 text-center">
          <div className="text-xl font-bold text-red-500">{status.totalFailed}</div>
          <div className="text-[10px] text-muted-foreground">失败</div>
        </div>
      </div>

      {/* Channel Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ChannelCard
          channel={status.image}
          icon={Image}
          label="图片通道"
        />
        <ChannelCard
          channel={status.video}
          icon={Video}
          label="视频通道"
        />
      </div>

      {/* DLQ Section */}
      <DLQSection
        items={status.dlqItems || []}
        onRetry={handleRetry}
        retrying={retrying}
      />

      {/* Empty state */}
      {status.totalQueued === 0 && status.totalActive === 0 && status.dlqCount === 0 && (
        <div className="text-center py-8">
          <CheckCircle2 className="h-8 w-8 text-green-500 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">队列空闲，暂无任务</p>
        </div>
      )}
    </div>
  )
}

export default QueueDashboard
