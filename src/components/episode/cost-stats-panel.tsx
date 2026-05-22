'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Image, Video, Mic, Bot, Coins, Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

// ── Types ──────────────────────────────────────────────────────

interface CostStatsData {
  totalCredits: number
  byCategory: Record<string, number>
  byProvider: Record<string, number>
  byModel: Record<string, { credits: number; count: number }>
  byEpisode: Array<{ episodeId: string; episodeTitle: string; credits: number }>
  dailyTrend: Array<{ date: string; credits: number }>
  recentGenerations: Array<{
    id: string
    category: string
    provider: string
    model: string
    credits: number
    tokensUsed: number
    count: number
    createdAt: string
  }>
}

// ── Helpers ────────────────────────────────────────────────────

const CATEGORY_CONFIG: Record<string, { icon: typeof Image; label: string; color: string; bgColor: string }> = {
  image: { icon: Image, label: '图片', color: 'text-emerald-600 dark:text-emerald-400', bgColor: 'bg-emerald-500' },
  video: { icon: Video, label: '视频', color: 'text-rose-600 dark:text-rose-400', bgColor: 'bg-rose-500' },
  tts: { icon: Mic, label: 'TTS', color: 'text-sky-600 dark:text-sky-400', bgColor: 'bg-sky-500' },
  llm: { icon: Bot, label: 'LLM', color: 'text-violet-600 dark:text-violet-400', bgColor: 'bg-violet-500' },
}

function relativeTime(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diff = Math.max(0, now - then)
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes}分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}小时前`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}天前`
  return `${Math.floor(days / 30)}个月前`
}

function formatCredits(n: number): string {
  if (n === 0) return '0'
  if (n < 0.01) return '<0.01'
  return n.toFixed(1)
}

// ── Category Bar ───────────────────────────────────────────────

function CategoryBar({ category, credits, totalCredits }: { category: string; credits: number; totalCredits: number }) {
  const config = CATEGORY_CONFIG[category]
  if (!config) return null

  const Icon = config.icon
  const pct = totalCredits > 0 ? (credits / totalCredits) * 100 : 0
  const barWidth = totalCredits > 0 ? Math.max(pct, 2) : 0

  return (
    <div className="flex items-center gap-3 py-1.5">
      <div className="flex items-center gap-1.5 w-16 shrink-0">
        <Icon className={`size-4 ${config.color}`} />
        <span className="text-sm text-foreground">{config.label}</span>
      </div>
      <div className="flex-1 h-5 bg-muted rounded-full overflow-hidden relative">
        <div
          className={`h-full ${config.bgColor} rounded-full transition-all duration-500`}
          style={{ width: `${barWidth}%` }}
        />
      </div>
      <div className="w-20 text-right shrink-0">
        <span className="text-sm font-medium">{formatCredits(credits)}</span>
        <span className="text-xs text-muted-foreground ml-1">
          ({totalCredits > 0 ? Math.round(pct) : 0}%)
        </span>
      </div>
    </div>
  )
}

// ── Episode Bar ────────────────────────────────────────────────

function EpisodeBar({ title, credits, maxCredits }: { title: string; credits: number; maxCredits: number }) {
  const barWidth = maxCredits > 0 ? Math.max((credits / maxCredits) * 100, 2) : 0

  return (
    <div className="flex items-center gap-3 py-1">
      <span className="text-sm w-20 truncate shrink-0">{title}</span>
      <div className="flex-1 h-4 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-primary/70 rounded-full transition-all duration-500"
          style={{ width: `${barWidth}%` }}
        />
      </div>
      <span className="text-sm text-muted-foreground w-14 text-right shrink-0">{formatCredits(credits)}</span>
    </div>
  )
}

// ── Recent Generation Item ─────────────────────────────────────

function RecentItem({ gen }: { gen: CostStatsData['recentGenerations'][number] }) {
  const config = CATEGORY_CONFIG[gen.category]
  const Icon = config?.icon || Bot
  const iconColor = config?.color || 'text-muted-foreground'

  return (
    <div className="flex items-center gap-3 py-2">
      <Icon className={`size-4 ${iconColor} shrink-0`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm truncate">{gen.model || gen.provider}</span>
          <Badge variant="secondary" className="text-[10px] h-4 shrink-0">
            {config?.label || gen.category}
          </Badge>
        </div>
      </div>
      <span className="text-sm font-medium shrink-0">{formatCredits(gen.credits)}积分</span>
      <span className="text-xs text-muted-foreground w-16 text-right shrink-0">{relativeTime(gen.createdAt)}</span>
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────

interface CostStatsPanelProps {
  dramaId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CostStatsPanel({ dramaId, open, onOpenChange }: CostStatsPanelProps) {
  const [stats, setStats] = useState<CostStatsData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchStats = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.dramas.getCostStats(dramaId)
      setStats(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!open || !dramaId) return
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const data = await api.dramas.getCostStats(dramaId)
        if (!cancelled) setStats(data)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : '加载失败')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [open, dramaId])

  const maxEpisodeCredits = stats
    ? Math.max(...stats.byEpisode.map((e) => e.credits), 0)
    : 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Coins className="size-5 text-amber-500" />
            生成成本统计
          </DialogTitle>
          <DialogDescription>
            查看 AI 生成的积分消耗统计（1积分 ≈ 1张标准图片）
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="space-y-4 py-4">
            <div className="flex items-center justify-center py-8">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        ) : error ? (
          <div className="py-8 text-center">
            <p className="text-sm text-destructive mb-3">{error}</p>
            <Button variant="outline" size="sm" onClick={fetchStats}>
              <RefreshCw className="size-3.5 mr-1" />
              重试
            </Button>
          </div>
        ) : stats ? (
          <ScrollArea className="max-h-[70vh]">
            <div className="space-y-5 px-1 pb-2">
              {/* Total credits */}
              <div className="text-center py-2">
                <p className="text-xs text-muted-foreground mb-1">总消耗</p>
                <p className="text-3xl font-bold">
                  {formatCredits(stats.totalCredits)}
                  <span className="text-sm font-normal text-muted-foreground ml-1">积分</span>
                </p>
              </div>

              <Separator />

              {/* By category */}
              <div>
                <h4 className="text-sm font-medium mb-2">按类别</h4>
                <div className="space-y-1">
                  {Object.entries(stats.byCategory)
                    .filter(([, v]) => v > 0)
                    .sort(([, a], [, b]) => b - a)
                    .map(([cat, credits]) => (
                      <CategoryBar
                        key={cat}
                        category={cat}
                        credits={credits}
                        totalCredits={stats.totalCredits}
                      />
                    ))}
                  {Object.values(stats.byCategory).every((v) => v === 0) && (
                    <p className="text-sm text-muted-foreground text-center py-3">
                      暂无消耗记录
                    </p>
                  )}
                </div>
              </div>

              <Separator />

              {/* By episode */}
              <div>
                <h4 className="text-sm font-medium mb-2">按集</h4>
                <div className="space-y-1">
                  {stats.byEpisode
                    .filter((ep) => ep.credits > 0)
                    .slice(0, 8)
                    .map((ep) => (
                      <EpisodeBar
                        key={ep.episodeId || '_drama'}
                        title={ep.episodeTitle}
                        credits={ep.credits}
                        maxCredits={maxEpisodeCredits}
                      />
                    ))}
                  {stats.byEpisode.every((ep) => ep.credits === 0) && (
                    <p className="text-sm text-muted-foreground text-center py-3">
                      暂无消耗记录
                    </p>
                  )}
                </div>
              </div>

              <Separator />

              {/* Recent generations */}
              <div>
                <h4 className="text-sm font-medium mb-2">最近生成</h4>
                <div className="space-y-0">
                  {stats.recentGenerations.length > 0 ? (
                    stats.recentGenerations.slice(0, 10).map((gen) => (
                      <RecentItem key={gen.id} gen={gen} />
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-3">
                      暂无生成记录
                    </p>
                  )}
                </div>
              </div>
            </div>
          </ScrollArea>
        ) : (
          <div className="py-8 text-center">
            <p className="text-sm text-muted-foreground">无数据</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
