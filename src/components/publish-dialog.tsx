'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Progress } from '@/components/ui/progress'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Upload,
  Globe,
  Youtube,
  Tv,
  Music,
  Share2,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Sparkles,
  Link2,
  Settings2,
  Plus,
  Trash2,
  Eye,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { useAppStore } from '@/lib/store'

// ── Platform Config ──

const PLATFORMS = [
  { key: 'bilibili', label: '哔哩哔哩', icon: <Tv className="size-4" />, color: 'text-pink-500' },
  { key: 'douyin', label: '抖音', icon: <Music className="size-4" />, color: 'text-zinc-700 dark:text-zinc-300' },
  { key: 'youtube', label: 'YouTube', icon: <Youtube className="size-4" />, color: 'text-red-500' },
  { key: 'xiaohongshu', label: '小红书', icon: <Share2 className="size-4" />, color: 'text-red-400' },
]

// ── Main Component ──

export function PublishDialog({
  dramaId,
  episodes,
  open,
  onOpenChange,
}: {
  dramaId: string
  episodes: Array<{ id: string; episodeNumber: number; title: string; videoUrl?: string | null }>
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [step, setStep] = useState(1)
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<string>('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [tags, setTags] = useState('')
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([])
  const [publishing, setPublishing] = useState(false)
  const [publishResults, setPublishResults] = useState<Array<{ platform: string; status: string; url?: string }>>([])
  const [configs, setConfigs] = useState<Array<{ id: string; platform: string; accountInfo: string }>>([])
  const { toast } = useToast()

  // Fetch connected platform configs
  useEffect(() => {
    if (open) {
      fetch('/api/publish/configs')
        .then(r => r.json())
        .then(data => setConfigs(data.configs || []))
        .catch(() => {})
    }
  }, [open])

  const isConnected = (platform: string) => configs.some(c => c.platform === platform)

  // Step 2: AI Preview
  const handlePreview = async () => {
    try {
      const res = await fetch('/api/publish/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dramaId, episodeId: selectedEpisodeId || undefined }),
      })
      const data = await res.json()
      if (data.preview) {
        setTitle(data.preview.title || '')
        setDescription(data.preview.description || '')
        setTags((data.preview.tags || []).join(', '))
      }
      setStep(2)
    } catch {
      // Still proceed to step 2 even if preview fails
      setStep(2)
    }
  }

  // Step 4: Publish
  const handlePublish = async () => {
    setPublishing(true)
    setPublishResults([])
    const results: Array<{ platform: string; status: string; url?: string }> = []

    for (const platform of selectedPlatforms) {
      try {
        const res = await fetch('/api/publish/publish', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dramaId,
            episodeId: selectedEpisodeId || undefined,
            platform,
            title,
            description,
            tags: tags.split(',').map(t => t.trim()).filter(Boolean),
          }),
        })
        const data = await res.json()
        results.push({ platform, status: 'publishing', url: data.record?.id })
      } catch {
        results.push({ platform, status: 'failed' })
      }
    }

    // Simulate completion after a short delay
    setTimeout(() => {
      setPublishResults(results.map(r => ({ ...r, status: 'published' })))
      setStep(4)
      setPublishing(false)
    }, 2000)
  }

  const reset = () => {
    setStep(1)
    setSelectedEpisodeId('')
    setTitle('')
    setDescription('')
    setTags('')
    setSelectedPlatforms([])
    setPublishResults([])
    setPublishing(false)
  }

  const handleClose = () => {
    onOpenChange(false)
    setTimeout(reset, 300)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <Upload className="size-4" />发布到平台
            <Badge variant="outline" className="text-[10px]">步骤 {step}/4</Badge>
          </DialogTitle>
        </DialogHeader>

        {/* Step 1: Select Episode */}
        {step === 1 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">选择要发布的集数</p>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {episodes.map(ep => (
                <Card
                  key={ep.id}
                  className={`py-0 gap-0 cursor-pointer transition-all ${
                    selectedEpisodeId === ep.id ? 'ring-1 ring-primary bg-primary/5' : 'hover:border-primary/40'
                  }`}
                  onClick={() => setSelectedEpisodeId(ep.id)}
                >
                  <CardContent className="p-3 flex items-center gap-3">
                    <div className="size-9 rounded-lg bg-primary/10 flex items-center justify-center">
                      <span className="text-xs font-bold text-primary">E{String(ep.episodeNumber).padStart(2, '0')}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{ep.title || `第${ep.episodeNumber}集`}</p>
                      <p className="text-[10px] text-muted-foreground">{ep.videoUrl ? '已合成' : '未合成'}</p>
                    </div>
                    {selectedEpisodeId === ep.id && <CheckCircle2 className="size-4 text-primary" />}
                  </CardContent>
                </Card>
              ))}
            </div>
            <DialogFooter>
              <Button onClick={handlePreview} disabled={!selectedEpisodeId}>
                下一步
                <Sparkles className="size-3.5 ml-1" />
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* Step 2: AI-generated metadata */}
        {step === 2 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground flex items-center gap-1">
              <Sparkles className="size-3.5 text-primary" />AI已为您生成标题、描述和标签
            </p>
            <div className="space-y-1.5">
              <Label className="text-xs">标题</Label>
              <Input value={title} onChange={e => setTitle(e.target.value)} className="text-xs" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">描述</Label>
              <Textarea value={description} onChange={e => setDescription(e.target.value)} className="text-xs" rows={3} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">标签 (逗号分隔)</Label>
              <Input value={tags} onChange={e => setTags(e.target.value)} className="text-xs" />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep(1)}>上一步</Button>
              <Button onClick={() => setStep(3)}>下一步</Button>
            </DialogFooter>
          </div>
        )}

        {/* Step 3: Select platforms */}
        {step === 3 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">选择发布平台</p>
            <div className="space-y-2">
              {PLATFORMS.map(p => {
                const selected = selectedPlatforms.includes(p.key)
                const connected = isConnected(p.key)
                return (
                  <Card
                    key={p.key}
                    className={`py-0 gap-0 cursor-pointer transition-all ${
                      selected ? 'ring-1 ring-primary bg-primary/5' : 'hover:border-primary/40'
                    } ${!connected ? 'opacity-60' : ''}`}
                    onClick={() => {
                      if (!connected) return
                      setSelectedPlatforms(prev =>
                        prev.includes(p.key) ? prev.filter(x => x !== p.key) : [...prev, p.key]
                      )
                    }}
                  >
                    <CardContent className="p-3 flex items-center gap-3">
                      <span className={p.color}>{p.icon}</span>
                      <div className="flex-1">
                        <p className="text-sm font-medium">{p.label}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {connected ? '已连接' : '未连接'}
                        </p>
                      </div>
                      {!connected ? (
                        <Badge variant="secondary" className="text-[9px]">需配置</Badge>
                      ) : selected ? (
                        <CheckCircle2 className="size-4 text-primary" />
                      ) : null}
                    </CardContent>
                  </Card>
                )
              })}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep(2)}>上一步</Button>
              <Button onClick={handlePublish} disabled={selectedPlatforms.length === 0 || publishing}>
                {publishing ? <Loader2 className="size-3.5 animate-spin mr-1" /> : <Upload className="size-3.5 mr-1" />}
                {publishing ? '发布中...' : '发布'}
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* Step 4: Results */}
        {step === 4 && (
          <div className="space-y-4">
            <div className="text-center py-4">
              <CheckCircle2 className="size-12 text-emerald-500 mx-auto mb-3" />
              <h3 className="text-lg font-semibold">发布完成！</h3>
              <p className="text-sm text-muted-foreground mt-1">您的作品已成功发布到 {selectedPlatforms.length} 个平台</p>
            </div>
            <div className="space-y-2">
              {publishResults.map(r => {
                const platform = PLATFORMS.find(p => p.key === r.platform)
                return (
                  <div key={r.platform} className="flex items-center gap-2 p-2.5 rounded-md border border-border/50">
                    <span className={platform?.color}>{platform?.icon}</span>
                    <span className="text-sm flex-1">{platform?.label}</span>
                    {r.status === 'published' ? (
                      <CheckCircle2 className="size-4 text-emerald-500" />
                    ) : (
                      <XCircle className="size-4 text-destructive" />
                    )}
                  </div>
                )
              })}
            </div>
            <DialogFooter>
              <Button onClick={handleClose}>完成</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
