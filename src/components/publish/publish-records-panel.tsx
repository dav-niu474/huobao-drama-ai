'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Send,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  ExternalLink,
  Tv,
  Music,
  Youtube,
  Share2,
  Globe,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

// ── Types ──

interface PublishRecord {
  id: string
  dramaId: string
  episodeId: string | null
  platform: string
  platformVideoId: string | null
  title: string
  description: string
  tags: string
  status: string
  publishedAt: string | null
  createdAt: string
  updatedAt: string
}

// ── Platform Config ──

const PLATFORMS: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  bilibili: { label: '哔哩哔哩', icon: <Tv className="size-4" />, color: 'text-pink-500' },
  douyin: { label: '抖音', icon: <Music className="size-4" />, color: 'text-zinc-700 dark:text-zinc-300' },
  youtube: { label: 'YouTube', icon: <Youtube className="size-4" />, color: 'text-red-500' },
  xiaohongshu: { label: '小红书', icon: <Share2 className="size-4" />, color: 'text-red-400' },
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'published':
      return (
        <Badge className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/20 gap-1">
          <CheckCircle2 className="size-2.5" />已发布
        </Badge>
      )
    case 'uploading':
      return (
        <Badge className="text-[10px] bg-amber-500/10 text-amber-600 border-amber-500/20 gap-1">
          <Loader2 className="size-2.5 animate-spin" />上传中
        </Badge>
      )
    case 'failed':
      return (
        <Badge className="text-[10px] bg-destructive/10 text-destructive border-destructive/20 gap-1">
          <XCircle className="size-2.5" />失败
        </Badge>
      )
    default:
      return (
        <Badge variant="secondary" className="text-[10px] gap-1">
          <Clock className="size-2.5" />待发布
        </Badge>
      )
  }
}

// ── Main Component ──

export function PublishRecordsPanel({ dramaId }: { dramaId: string }) {
  const [records, setRecords] = useState<PublishRecord[]>([])
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()

  const fetchRecords = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/publish/records?dramaId=${dramaId}`)
      const data = await res.json()
      setRecords(data.records || [])
    } catch (err) {
      toast({ title: '加载失败', description: String(err), variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [dramaId, toast])

  useEffect(() => {
    fetchRecords()
  }, [fetchRecords])

  const platformStats = records.reduce((acc, r) => {
    acc[r.platform] = (acc[r.platform] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Send className="size-4 text-primary" />
          <h3 className="text-sm font-medium">分发记录</h3>
          <Badge variant="secondary" className="text-[10px]">{records.length} 条</Badge>
        </div>
        <Button variant="outline" size="sm" className="text-xs h-7 gap-1" onClick={fetchRecords} disabled={loading}>
          <Loader2 className={`size-3 ${loading ? 'animate-spin' : ''}`} />
          刷新
        </Button>
      </div>

      {/* Platform summary */}
      {Object.keys(platformStats).length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          {Object.entries(platformStats).map(([platform, count]) => {
            const info = PLATFORMS[platform]
            return (
              <div key={platform} className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-muted/30 text-xs">
                <span className={info?.color}>{info?.icon || <Globe className="size-3.5" />}</span>
                <span>{info?.label || platform}</span>
                <Badge variant="secondary" className="text-[9px] h-4 px-1">{count}</Badge>
              </div>
            )
          })}
        </div>
      )}

      {/* Records list */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="py-0 gap-0">
              <CardContent className="p-3">
                <div className="h-4 w-32 shimmer rounded mb-2" />
                <div className="h-3 w-48 shimmer rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : records.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground">
          <Send className="size-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">暂无分发记录</p>
          <p className="text-xs mt-1">点击项目详情的"发布"按钮开始分发</p>
        </div>
      ) : (
        <ScrollArea className="max-h-[600px]">
          <div className="space-y-2">
            {records.map(record => {
              const platformInfo = PLATFORMS[record.platform]
              let tags: string[] = []
              try { tags = JSON.parse(record.tags) } catch {}
              return (
                <Card key={record.id} className="py-0 gap-0 hover:border-primary/40 transition-all">
                  <CardContent className="p-3">
                    <div className="flex items-start gap-3">
                      {/* Platform icon */}
                      <div className="size-9 rounded-lg bg-muted/30 flex items-center justify-center shrink-0">
                        <span className={platformInfo?.color}>
                          {platformInfo?.icon || <Globe className="size-4" />}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className="text-sm font-medium truncate">{record.title || '未命名'}</p>
                          <StatusBadge status={record.status} />
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                          <span>{platformInfo?.label || record.platform}</span>
                          {record.publishedAt && (
                            <span className="flex items-center gap-0.5">
                              <CheckCircle2 className="size-2.5" />
                              {new Date(record.publishedAt).toLocaleDateString()}
                            </span>
                          )}
                          <span className="flex items-center gap-0.5">
                            <Clock className="size-2.5" />
                            {new Date(record.createdAt).toLocaleString()}
                          </span>
                        </div>
                        {record.description && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{record.description}</p>
                        )}
                        {tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {tags.slice(0, 5).map((tag, i) => (
                              <Badge key={i} variant="secondary" className="text-[9px] h-4 px-1.5">{tag}</Badge>
                            ))}
                            {tags.length > 5 && (
                              <span className="text-[9px] text-muted-foreground">+{tags.length - 5}</span>
                            )}
                          </div>
                        )}
                      </div>
                      {record.platformVideoId && (
                        <Badge variant="outline" className="text-[9px] shrink-0 gap-0.5">
                          <ExternalLink className="size-2.5" />
                          {record.platformVideoId.slice(0, 12)}…
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </ScrollArea>
      )}
    </div>
  )
}
