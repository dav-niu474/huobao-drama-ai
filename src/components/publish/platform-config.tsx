'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Globe,
  Youtube,
  Tv,
  Music,
  Share2,
  Plus,
  Trash2,
  CheckCircle2,
  Loader2,
  Link2,
  Settings2,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

const PLATFORMS = [
  { key: 'bilibili', label: '哔哩哔哩', icon: <Tv className="size-4" />, color: 'text-pink-500' },
  { key: 'douyin', label: '抖音', icon: <Music className="size-4" />, color: 'text-zinc-700 dark:text-zinc-300' },
  { key: 'youtube', label: 'YouTube', icon: <Youtube className="size-4" />, color: 'text-red-500' },
  { key: 'xiaohongshu', label: '小红书', icon: <Share2 className="size-4" />, color: 'text-red-400' },
]

interface PublishConfig {
  id: string
  platform: string
  accountInfo: string
  createdAt: string
}

export function PlatformConfig() {
  const [configs, setConfigs] = useState<PublishConfig[]>([])
  const [loading, setLoading] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [newPlatform, setNewPlatform] = useState('')
  const [newAccountName, setNewAccountName] = useState('')
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()

  const fetchConfigs = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/publish/configs')
      const data = await res.json()
      setConfigs(data.configs || [])
    } catch {
      toast({ title: '加载失败', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    fetchConfigs()
  }, [fetchConfigs])

  const handleConnect = async () => {
    if (!newPlatform) return
    setSaving(true)
    try {
      const res = await fetch('/api/publish/configs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: newPlatform,
          accessToken: `mock_token_${Date.now()}`,
          refreshToken: `mock_refresh_${Date.now()}`,
          accountInfo: { name: newAccountName || newPlatform, avatar: null },
        }),
      })
      if (!res.ok) throw new Error('连接失败')
      toast({ title: '平台已连接' })
      setAddOpen(false)
      setNewPlatform('')
      setNewAccountName('')
      fetchConfigs()
    } catch (err) {
      toast({ title: '连接失败', description: String(err), variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const handleDisconnect = async (id: string) => {
    try {
      await fetch(`/api/publish/configs/${id}`, { method: 'DELETE' })
      toast({ title: '已断开连接' })
      fetchConfigs()
    } catch {
      toast({ title: '删除失败', variant: 'destructive' })
    }
  }

  const getPlatformInfo = (key: string) => PLATFORMS.find(p => p.key === key)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium flex items-center gap-2">
          <Settings2 className="size-4" />平台账号
        </h3>
        <Button size="sm" className="text-xs gap-1" onClick={() => setAddOpen(true)}>
          <Plus className="size-3.5" />连接平台
        </Button>
      </div>

      {configs.length === 0 ? (
        <div className="py-8 text-center text-muted-foreground">
          <Globe className="size-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">尚未连接任何平台</p>
          <p className="text-xs mt-1">连接平台后即可一键发布</p>
        </div>
      ) : (
        <div className="space-y-2">
          {configs.map(config => {
            const platformInfo = getPlatformInfo(config.platform)
            let accountInfo: any = {}
            try { accountInfo = JSON.parse(config.accountInfo) } catch {}
            return (
              <Card key={config.id} className="py-0 gap-0">
                <CardContent className="p-3 flex items-center gap-3">
                  <span className={platformInfo?.color}>{platformInfo?.icon || <Globe className="size-4" />}</span>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{platformInfo?.label || config.platform}</p>
                    <p className="text-xs text-muted-foreground">{accountInfo.name || '已连接'}</p>
                  </div>
                  <CheckCircle2 className="size-4 text-emerald-500" />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="size-7 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => handleDisconnect(config.id)}
                  >
                    <Trash2 className="size-3" />
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>连接平台账号</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">选择平台</Label>
              <Select value={newPlatform} onValueChange={setNewPlatform}>
                <SelectTrigger className="text-xs"><SelectValue placeholder="选择平台" /></SelectTrigger>
                <SelectContent>
                  {PLATFORMS.map(p => (
                    <SelectItem key={p.key} value={p.key}>
                      <span className="flex items-center gap-2">{p.icon} {p.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">账号名称</Label>
              <Input value={newAccountName} onChange={e => setNewAccountName(e.target.value)} className="text-xs" placeholder="输入账号名称" />
            </div>
            <p className="text-[10px] text-muted-foreground">
              <Link2 className="size-3 inline mr-1" />
              在实际使用中，此处将通过 OAuth 授权流程连接您的账号
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setAddOpen(false)}>取消</Button>
            <Button size="sm" onClick={handleConnect} disabled={!newPlatform || saving}>
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Link2 className="size-3.5" />}
              连接
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
