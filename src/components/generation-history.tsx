'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Checkbox } from '@/components/ui/checkbox'
import {
  ImageIcon,
  Film,
  Volume2,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  Trash2,
  Eye,
  Zap,
  Search,
  Filter,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { useAppStore } from '@/lib/store'

// ── Types ──

interface GenerationItem {
  id: string
  prompt: string
  model: string
  provider: string
  status: string
  imageUrl?: string | null
  videoUrl?: string | null
  audioUrl?: string | null
  costCredits: number
  generationMs?: number | null
  errorMsg?: string | null
  createdAt: string
  size?: string
  frameType?: string | null
  voiceName?: string | null
  text?: string
}

// ── Status Badge ──

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'completed':
      return (
        <Badge className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/20 gap-1">
          <CheckCircle2 className="size-2.5" />完成
        </Badge>
      )
    case 'processing':
      return (
        <Badge className="text-[10px] bg-amber-500/10 text-amber-600 border-amber-500/20 gap-1">
          <Loader2 className="size-2.5 animate-spin" />生成中
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
          <Clock className="size-2.5" />等待
        </Badge>
      )
  }
}

// ── Main Component ──

export function GenerationHistory({ dramaId }: { dramaId: string }) {
  const [activeTab, setActiveTab] = useState('image')
  const [items, setItems] = useState<GenerationItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [statusFilter, setStatusFilter] = useState('')
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
  const [detailItem, setDetailItem] = useState<GenerationItem | null>(null)
  const [retrying, setRetrying] = useState<string | null>(null)
  const { toast } = useToast()

  const fetchGenerations = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        type: activeTab,
        page: String(page),
        limit: '20',
        ...(statusFilter && { status: statusFilter }),
      })
      const res = await fetch(`/api/dramas/${dramaId}/generations?${params}`)
      const data = await res.json()
      setItems(data.items || [])
      setTotal(data.total || 0)
    } catch (err) {
      toast({ title: '加载失败', description: String(err), variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [dramaId, activeTab, page, statusFilter, toast])

  useEffect(() => {
    fetchGenerations()
  }, [fetchGenerations])

  useEffect(() => {
    setPage(1)
    setSelectedItems(new Set())
  }, [activeTab, statusFilter])

  const handleRetry = async (id: string) => {
    setRetrying(id)
    try {
      const res = await fetch(`/api/generations/${id}/retry?type=${activeTab}`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast({ title: '已重新提交生成' })
      fetchGenerations()
    } catch (err) {
      toast({ title: '重试失败', description: String(err), variant: 'destructive' })
    } finally {
      setRetrying(null)
    }
  }

  const handleBulkDelete = async () => {
    if (selectedItems.size === 0) return
    try {
      await Promise.all(
        Array.from(selectedItems).map(id =>
          fetch(`/api/generations/${id}?type=${activeTab}`, { method: 'DELETE' })
        )
      )
      toast({ title: `已删除 ${selectedItems.size} 条记录` })
      setSelectedItems(new Set())
      fetchGenerations()
    } catch (err) {
      toast({ title: '删除失败', description: String(err), variant: 'destructive' })
    }
  }

  const toggleSelect = (id: string) => {
    const next = new Set(selectedItems)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedItems(next)
  }

  const failedCount = items.filter(i => i.status === 'failed').length

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-32 h-8 text-xs">
              <Filter className="size-3.5 mr-1" />
              <SelectValue placeholder="全部状态" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              <SelectItem value="completed">已完成</SelectItem>
              <SelectItem value="processing">生成中</SelectItem>
              <SelectItem value="failed">失败</SelectItem>
              <SelectItem value="pending">等待</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">共 {total} 条</span>
        </div>
        <div className="flex items-center gap-2">
          {failedCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="text-xs h-7 gap-1"
              onClick={() => {
                items.filter(i => i.status === 'failed').forEach(i => handleRetry(i.id))
              }}
              disabled={!!retrying}
            >
              <RefreshCw className="size-3" />重试失败 ({failedCount})
            </Button>
          )}
          {selectedItems.size > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="text-xs h-7 gap-1 text-destructive hover:text-destructive"
              onClick={handleBulkDelete}
            >
              <Trash2 className="size-3" />删除 ({selectedItems.size})
            </Button>
          )}
        </div>
      </div>

      {/* Tabbed View */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full">
          <TabsTrigger value="image" className="flex-1 gap-1.5 text-xs">
            <ImageIcon className="size-3.5" />图片
          </TabsTrigger>
          <TabsTrigger value="video" className="flex-1 gap-1.5 text-xs">
            <Film className="size-3.5" />视频
          </TabsTrigger>
          <TabsTrigger value="tts" className="flex-1 gap-1.5 text-xs">
            <Volume2 className="size-3.5" />语音
          </TabsTrigger>
        </TabsList>

        {['image', 'video', 'tts'].map(tab => (
          <TabsContent key={tab} value={tab} className="mt-3">
            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Card key={i} className="py-0 gap-0">
                    <CardContent className="p-3">
                      <div className="h-32 shimmer rounded-md mb-2" />
                      <div className="h-3 w-24 shimmer rounded mb-1" />
                      <div className="h-3 w-16 shimmer rounded" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : items.length === 0 ? (
              <div className="py-16 text-center text-muted-foreground">
                <div className="size-12 mx-auto mb-3 rounded-full bg-muted flex items-center justify-center">
                  {tab === 'image' ? <ImageIcon className="size-6" /> :
                   tab === 'video' ? <Film className="size-6" /> :
                   <Volume2 className="size-6" />}
                </div>
                <p className="text-sm">暂无{tab === 'image' ? '图片' : tab === 'video' ? '视频' : '语音'}生成记录</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {items.map(item => (
                  <Card
                    key={item.id}
                    className={`py-0 gap-0 cursor-pointer hover:border-primary/40 transition-all ${
                      selectedItems.has(item.id) ? 'ring-1 ring-primary/40 bg-primary/5' : ''
                    }`}
                  >
                    <CardContent className="p-3">
                      {/* Thumbnail row */}
                      <div className="flex items-start gap-2 mb-2">
                        <Checkbox
                          checked={selectedItems.has(item.id)}
                          onCheckedChange={() => toggleSelect(item.id)}
                          onClick={e => e.stopPropagation()}
                          className="mt-1"
                        />
                        <div
                          className="flex-1 min-w-0 cursor-pointer"
                          onClick={() => setDetailItem(item)}
                        >
                          {/* Thumbnail */}
                          <div className="h-28 rounded-md bg-muted/30 flex items-center justify-center overflow-hidden mb-2">
                            {tab === 'image' && item.imageUrl ? (
                              <img src={item.imageUrl} alt="" className="w-full h-full object-cover" />
                            ) : tab === 'video' && item.videoUrl ? (
                              <video src={item.videoUrl} className="w-full h-full object-cover" />
                            ) : tab === 'tts' && item.audioUrl ? (
                              <Volume2 className="size-8 text-muted-foreground/40" />
                            ) : (
                              <div className="text-muted-foreground/30">
                                {tab === 'image' ? <ImageIcon className="size-8" /> :
                                 tab === 'video' ? <Film className="size-8" /> :
                                 <Volume2 className="size-8" />}
                              </div>
                            )}
                          </div>

                          {/* Info */}
                          <p className="text-xs truncate text-foreground/80">
                            {item.prompt || item.text || '无提示词'}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <StatusBadge status={item.status} />
                            <span className="text-[10px] text-muted-foreground">{item.model}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                            <Zap className="size-2.5" />{item.costCredits.toFixed(2)}
                            {item.generationMs && (
                              <><Clock className="size-2.5 ml-1" />{(item.generationMs / 1000).toFixed(1)}s</>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Failed retry */}
                      {item.status === 'failed' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full text-[10px] h-6 gap-1 text-amber-600"
                          onClick={() => handleRetry(item.id)}
                          disabled={retrying === item.id}
                        >
                          {retrying === item.id ? (
                            <Loader2 className="size-3 animate-spin" />
                          ) : (
                            <RefreshCw className="size-3" />
                          )}
                          重试
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>

      {/* Pagination */}
      {total > 20 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            className="text-xs h-7"
            disabled={page <= 1}
            onClick={() => setPage(p => p - 1)}
          >
            上一页
          </Button>
          <span className="text-xs text-muted-foreground">{page} / {Math.ceil(total / 20)}</span>
          <Button
            variant="outline"
            size="sm"
            className="text-xs h-7"
            disabled={page >= Math.ceil(total / 20)}
            onClick={() => setPage(p => p + 1)}
          >
            下一页
          </Button>
        </div>
      )}

      {/* Detail Modal */}
      <Dialog open={!!detailItem} onOpenChange={() => setDetailItem(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-base">生成详情</DialogTitle>
          </DialogHeader>
          {detailItem && (
            <div className="space-y-4">
              {/* Full size preview */}
              <div className="rounded-lg bg-muted/20 overflow-hidden flex items-center justify-center max-h-80">
                {activeTab === 'image' && detailItem.imageUrl && (
                  <img src={detailItem.imageUrl} alt="" className="max-w-full max-h-80 object-contain" />
                )}
                {activeTab === 'video' && detailItem.videoUrl && (
                  <video src={detailItem.videoUrl} controls className="max-w-full max-h-80" />
                )}
                {activeTab === 'tts' && detailItem.audioUrl && (
                  <audio src={detailItem.audioUrl} controls className="w-full" />
                )}
              </div>

              {/* Metadata */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground text-xs">提示词</span>
                  <p className="mt-0.5 text-xs">{detailItem.prompt || detailItem.text || '—'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">模型</span>
                  <p className="mt-0.5 text-xs">{detailItem.provider} / {detailItem.model}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">状态</span>
                  <div className="mt-0.5"><StatusBadge status={detailItem.status} /></div>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">耗时</span>
                  <p className="mt-0.5 text-xs">{detailItem.generationMs ? `${(detailItem.generationMs / 1000).toFixed(1)}s` : '—'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">成本</span>
                  <p className="mt-0.5 text-xs">{detailItem.costCredits.toFixed(3)} 积分</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">时间</span>
                  <p className="mt-0.5 text-xs">{new Date(detailItem.createdAt).toLocaleString()}</p>
                </div>
              </div>

              {detailItem.errorMsg && (
                <div className="p-2.5 rounded-md border border-destructive/30 bg-destructive/5 text-xs text-destructive">
                  <XCircle className="size-3.5 inline mr-1" />
                  {detailItem.errorMsg}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
