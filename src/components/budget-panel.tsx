'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Wallet,
  AlertTriangle,
  Bell,
  Plus,
  Trash2,
  Settings2,
  TrendingUp,
  ImageIcon,
  Film,
  Volume2,
  Sparkles,
  Loader2,
  Check,
  X,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

// ── Types ──

interface Budget {
  id: string
  period: string
  limit: number
  currentUsage: number
  alertThreshold: number
  enabled: boolean
  createdAt: string
  alerts: BudgetAlert[]
}

interface BudgetAlert {
  id: string
  type: string
  message: string
  read: boolean
  createdAt: string
}

interface UsageData {
  totalCredits: number
  byCategory: Record<string, number>
  byCount: Record<string, number>
  dailyTrend: Array<{ date: string; credits: number }>
  period: string
}

// ── Main Component ──

export function BudgetPanel() {
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [usage, setUsage] = useState<UsageData | null>(null)
  const [alerts, setAlerts] = useState<BudgetAlert[]>([])
  const [loading, setLoading] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [newBudget, setNewBudget] = useState({ period: 'monthly', limit: 1000, alertThreshold: 80 })
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [budgetsRes, usageRes, alertsRes] = await Promise.all([
        fetch('/api/budgets'),
        fetch('/api/budgets/usage'),
        fetch('/api/budgets/alerts'),
      ])
      const budgetsData = await budgetsRes.json()
      const usageData = await usageRes.json()
      const alertsData = await alertsRes.json()

      setBudgets(budgetsData.budgets || [])
      setUsage(usageData)
      setAlerts(alertsData.alerts || [])
    } catch (err) {
      toast({ title: '加载失败', description: String(err), variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleCreate = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/budgets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newBudget),
      })
      if (!res.ok) throw new Error('创建失败')
      toast({ title: '预算已创建' })
      setCreateOpen(false)
      fetchData()
    } catch (err) {
      toast({ title: '创建失败', description: String(err), variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await fetch(`/api/budgets/${id}`, { method: 'DELETE' })
      toast({ title: '预算已删除' })
      fetchData()
    } catch (err) {
      toast({ title: '删除失败', variant: 'destructive' })
    }
  }

  const handleMarkAlertRead = async (id: string) => {
    try {
      await fetch(`/api/budgets/alerts/${id}/read`, { method: 'PATCH' })
      setAlerts(prev => prev.map(a => a.id === id ? { ...a, read: true } : a))
    } catch {}
  }

  const unreadAlerts = alerts.filter(a => !a.read)

  // Category icons
  const categoryIcons: Record<string, React.ReactNode> = {
    image: <ImageIcon className="size-4" />,
    video: <Film className="size-4" />,
    tts: <Volume2 className="size-4" />,
    llm: <Sparkles className="size-4" />,
  }
  const categoryLabels: Record<string, string> = {
    image: '图片',
    video: '视频',
    tts: '语音',
    llm: '语言模型',
  }

  return (
    <div className="space-y-6">
      {/* Budget Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Active budget cards */}
        {budgets.map(budget => {
          const percent = budget.limit > 0 ? Math.min((budget.currentUsage / budget.limit) * 100, 100) : 0
          const isExceeded = budget.currentUsage >= budget.limit
          const isWarning = percent >= budget.alertThreshold

          return (
            <Card key={budget.id} className={`py-0 gap-0 ${isExceeded ? 'border-destructive/40' : isWarning ? 'border-amber-500/40' : ''}`}>
              <CardHeader className="p-4 pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Wallet className="size-4" />
                    {budget.period === 'daily' ? '每日' : budget.period === 'weekly' ? '每周' : '每月'}预算
                  </CardTitle>
                  <div className="flex items-center gap-1">
                    <Badge variant={isExceeded ? 'destructive' : isWarning ? 'secondary' : 'outline'} className="text-[10px]">
                      {isExceeded ? '已超出' : isWarning ? '警告' : '正常'}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="size-6 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => handleDelete(budget.id)}
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="space-y-3">
                  {/* Usage bar */}
                  <div>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span>{budget.currentUsage.toFixed(1)} / {budget.limit} 积分</span>
                      <span className={percent >= 100 ? 'text-destructive' : percent >= 80 ? 'text-amber-500' : 'text-muted-foreground'}>
                        {percent.toFixed(0)}%
                      </span>
                    </div>
                    <Progress value={percent} className={`h-2 ${isExceeded ? '[&>div]:bg-destructive' : isWarning ? '[&>div]:bg-amber-500' : ''}`} />
                  </div>

                  {/* Remaining */}
                  <div className="text-xs text-muted-foreground">
                    剩余: {Math.max(0, budget.limit - budget.currentUsage).toFixed(1)} 积分
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}

        {/* Create budget card */}
        <Card
          className="py-0 gap-0 border-dashed border-2 border-border/50 hover:border-primary/40 transition-colors cursor-pointer"
          onClick={() => setCreateOpen(true)}
        >
          <CardContent className="p-4 flex flex-col items-center justify-center min-h-[140px] text-muted-foreground">
            <Plus className="size-8 mb-2 text-primary" />
            <span className="text-sm">创建预算</span>
          </CardContent>
        </Card>
      </div>

      {/* Usage Breakdown */}
      {usage && (
        <Card className="py-0 gap-0">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="size-4" />
              本月使用量
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
              {Object.entries(usage.byCategory).map(([cat, credits]) => (
                <div key={cat} className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/30">
                  <span className="text-primary">{categoryIcons[cat]}</span>
                  <div>
                    <p className="text-xs text-muted-foreground">{categoryLabels[cat] || cat}</p>
                    <p className="text-sm font-medium">{credits.toFixed(1)} <span className="text-xs text-muted-foreground font-normal">积分</span></p>
                    <p className="text-[10px] text-muted-foreground">{usage.byCount[cat] || 0} 次</p>
                  </div>
                </div>
              ))}
            </div>

            {/* 7-day trend */}
            {usage.dailyTrend && usage.dailyTrend.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-2">7日趋势</p>
                <div className="flex items-end gap-1.5 h-20">
                  {usage.dailyTrend.map((day, i) => {
                    const maxCredits = Math.max(...usage.dailyTrend.map(d => d.credits), 1)
                    const height = (day.credits / maxCredits) * 100
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                        <div
                          className="w-full bg-primary/30 rounded-t hover:bg-primary/50 transition-colors"
                          style={{ height: `${Math.max(height, 2)}%` }}
                          title={`${day.date}: ${day.credits.toFixed(1)}`}
                        />
                        <span className="text-[8px] text-muted-foreground">{day.date.slice(5)}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Alerts */}
      {alerts.length > 0 && (
        <Card className="py-0 gap-0">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Bell className="size-4" />
              预算提醒
              {unreadAlerts.length > 0 && (
                <Badge variant="destructive" className="text-[9px] h-4 px-1.5">
                  {unreadAlerts.length}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <ScrollArea className="max-h-48">
              <div className="space-y-2">
                {alerts.map(alert => (
                  <div
                    key={alert.id}
                    className={`flex items-start gap-2 p-2.5 rounded-md border text-xs ${
                      alert.type === 'exceeded'
                        ? 'border-destructive/30 bg-destructive/5'
                        : 'border-amber-500/30 bg-amber-500/5'
                    } ${!alert.read ? '' : 'opacity-60'}`}
                  >
                    {alert.type === 'exceeded' ? (
                      <X className="size-3.5 text-destructive flex-shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle className="size-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p>{alert.message}</p>
                      <p className="text-muted-foreground mt-0.5">{new Date(alert.createdAt).toLocaleString()}</p>
                    </div>
                    {!alert.read && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="size-6 p-0 flex-shrink-0"
                        onClick={() => handleMarkAlertRead(alert.id)}
                      >
                        <Check className="size-3" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {/* Create Budget Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>创建预算</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">周期</Label>
              <Select value={newBudget.period} onValueChange={v => setNewBudget(p => ({ ...p, period: v }))}>
                <SelectTrigger className="text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">每日</SelectItem>
                  <SelectItem value="weekly">每周</SelectItem>
                  <SelectItem value="monthly">每月</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">额度 (积分)</Label>
              <Input
                type="number"
                value={newBudget.limit}
                onChange={e => setNewBudget(p => ({ ...p, limit: Number(e.target.value) }))}
                className="text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">警告阈值 (%)</Label>
              <Input
                type="number"
                value={newBudget.alertThreshold}
                onChange={e => setNewBudget(p => ({ ...p, alertThreshold: Number(e.target.value) }))}
                className="text-xs"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setCreateOpen(false)}>取消</Button>
            <Button size="sm" onClick={handleCreate} disabled={saving}>
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
              创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
