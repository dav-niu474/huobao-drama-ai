'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { api } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Film,
  Users,
  Image,
  Video,
  Mic,
  DollarSign,
  Activity,
  Clapperboard,
  ArrowLeft,
  Loader2,
  CheckCircle2,
  Circle,
  ImageIcon,
  Package,
} from 'lucide-react'

// ── Types ──

interface DashboardData {
  drama: {
    id: string
    title: string
    genre: string
    style: string
    artStyle: string | null
    totalEpisodes: number
    status: string
    createdAt: string
  }
  episodes: Array<{
    id: string
    episodeNumber: number
    title: string
    status: string
    pipelineProgress: number
    currentStep: string | null
    completedSteps: number
    totalSteps: number
    hasVideo: boolean
  }>
  assets: {
    totalCharacters: number
    charactersWithImages: number
    totalScenes: number
    scenesWithImages: number
    totalProps: number
    propsWithImages: number
    totalStoryboards: number
    storyboardsWithFrames: number
    storyboardsWithVideos: number
    storyboardsWithTts: number
    storyboardsComposed: number
  }
  costs: {
    totalCredits: number
    byCategory: { image: number; video: number; tts: number; llm: number }
  }
  team: {
    totalMembers: number
    ownerName: string
    roles: { owner: number; editor: number; viewer: number }
  }
  recentActivity: Array<{
    type: 'comment' | 'image' | 'video' | 'tts'
    description: string
    userName: string
    createdAt: string
  }>
}

function relativeTime(dateStr: string, tc: (key: string, params?: Record<string, number>) => string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diff = Math.max(0, now - then)
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return tc('justNow')
  if (minutes < 60) return tc('minutesAgo', { count: minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return tc('hoursAgo', { count: hours })
  const days = Math.floor(hours / 24)
  if (days < 30) return tc('daysAgo', { count: days })
  return tc('monthsAgo', { count: Math.floor(days / 30) })
}

function getProgressColor(value: number): string {
  if (value > 70) return 'bg-emerald-500'
  if (value > 30) return 'bg-amber-500'
  return 'bg-red-500'
}

function getProgressIndicatorClass(value: number): string {
  if (value > 70) return '[&>div]:bg-emerald-500'
  if (value > 30) return '[&>div]:bg-amber-500'
  return '[&>div]:bg-red-500'
}

function getStatusBadge(status: string, tc: (key: string) => string) {
  switch (status) {
    case 'completed':
      return <Badge variant="secondary" className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/20">{tc('completed')}</Badge>
    case 'in-progress':
    case 'processing':
      return <Badge variant="secondary" className="text-[10px] bg-amber-500/10 text-amber-600 border-amber-500/20">{tc('inProgress')}</Badge>
    case 'failed':
      return <Badge variant="destructive" className="text-[10px]">{tc('failed')}</Badge>
    default:
      return <Badge variant="outline" className="text-[10px]">{tc('pending')}</Badge>
  }
}

// ── Asset stat card ──

function AssetStatCard({
  icon: Icon,
  label,
  completed,
  total,
  color,
  readyLabel,
}: {
  icon: typeof Image
  label: string
  completed: number
  total: number
  color: string
  readyLabel: string
}) {
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0
  return (
    <Card className="py-0 gap-0">
      <CardContent className="p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className={`size-9 rounded-lg flex items-center justify-center ${color}`}>
            <Icon className="size-4 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground truncate">{label}</p>
            <p className="text-lg font-bold">
              {completed}<span className="text-sm font-normal text-muted-foreground">/{total}</span>
            </p>
          </div>
        </div>
        <Progress value={percent} className={`h-1.5 ${getProgressIndicatorClass(percent)}`} />
        <p className="text-[10px] text-muted-foreground mt-1 text-right">{percent}% {readyLabel}</p>
      </CardContent>
    </Card>
  )
}

// ── Main component ──

export function ProjectDashboard({
  dramaId,
  onBack,
}: {
  dramaId: string
  onBack: () => void
}) {
  const tc = useTranslations('common')
  const tp = useTranslations('projectDetail')
  const tproj = useTranslations('project')

  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Style labels using translations
  const STYLE_LABELS: Record<string, string> = {
    realistic: tproj('styleRealistic'),
    anime: tproj('styleAnime'),
    cinematic: tproj('styleCinematic'),
    comic: tproj('styleComic'),
    watercolor: tproj('styleWatercolor'),
    '3d': tproj('style3d'),
  }

  useEffect(() => {
    let cancelled = false
    async function fetchDashboard() {
      setLoading(true)
      setError(null)
      try {
        const result = await api.dramas.getDashboard(dramaId)
        if (!cancelled) setData(result as DashboardData)
      } catch (err) {
        if (!cancelled) setError(String(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchDashboard()
    return () => { cancelled = true }
  }, [dramaId])

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="size-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">{tp('loadingDashboard')}</p>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <p className="text-sm text-destructive">{tp('loadDetailFailed')}: {error}</p>
          <Button variant="outline" size="sm" onClick={onBack}>
            <ArrowLeft className="size-4" /> {tc('back')}
          </Button>
        </div>
      </div>
    )
  }

  const { drama, episodes, assets, costs, team, recentActivity } = data

  // Overall progress: average of all episode progress
  const overallProgress =
    episodes.length > 0
      ? Math.round(episodes.reduce((sum, ep) => sum + ep.pipelineProgress, 0) / episodes.length)
      : 0

  const completedEpisodes = episodes.filter((ep) => ep.status === 'completed' || ep.pipelineProgress === 100).length

  // Asset readiness
  const totalAssets = assets.totalCharacters + assets.totalScenes + assets.totalProps
  const readyAssets = assets.charactersWithImages + assets.scenesWithImages + assets.propsWithImages
  const assetPercent = totalAssets > 0 ? Math.round((readyAssets / totalAssets) * 100) : 0

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Header with back button */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2">
              <ArrowLeft className="size-4" />
              <span className="hidden sm:inline">{tc('back')}</span>
            </Button>
            <div>
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Activity className="size-5 text-primary" />
                {tp('dashboard')}
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">{drama.title}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">{drama.genre}</Badge>
            <Badge variant="outline" className="text-xs">{STYLE_LABELS[drama.style] ?? drama.style}</Badge>
            {drama.artStyle && (
              <Badge variant="outline" className="text-xs">{drama.artStyle}</Badge>
            )}
          </div>
        </div>

        {/* ── Overview Stats ── */}
        <Card className="py-0 gap-0">
          <CardContent className="p-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              {/* Overall progress */}
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">{tp('overallProgress')}</p>
                <div className="flex items-end gap-2">
                  <span className="text-3xl font-bold">{overallProgress}%</span>
                  <Progress value={overallProgress} className={`flex-1 h-2 ${getProgressIndicatorClass(overallProgress)}`} />
                </div>
                <p className="text-xs text-muted-foreground">
                  {tp('episodesCompleted', { completed: completedEpisodes, total: episodes.length })}
                </p>
              </div>

              {/* Asset readiness */}
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">{tp('assetsReady')}</p>
                <div className="flex items-end gap-2">
                  <span className="text-3xl font-bold">{assetPercent}%</span>
                  <Progress value={assetPercent} className={`flex-1 h-2 ${getProgressIndicatorClass(assetPercent)}`} />
                </div>
                <p className="text-xs text-muted-foreground">
                  {readyAssets}/{totalAssets} {tp('assetsGenerated')}
                </p>
              </div>

              {/* Team */}
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">{tp('team')}</p>
                <div className="flex items-center gap-2">
                  <Users className="size-5 text-primary" />
                  <span className="text-3xl font-bold">{team.totalMembers}</span>
                  <span className="text-sm text-muted-foreground">{tp('members')}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{tp('owner')} {team.ownerName}</span>
                  <span>·</span>
                  <span>{tp('editor')} {team.roles.editor}</span>
                  <span>·</span>
                  <span>{tp('viewer')} {team.roles.viewer}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Episode Progress Section ── */}
        <div>
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Clapperboard className="size-4 text-primary" />
            {tp('episodePipelineProgress')}
          </h3>
          <Card className="py-0 gap-0">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">{tp('episodeNumber')}</TableHead>
                    <TableHead>{tp('title')}</TableHead>
                    <TableHead className="w-48">{tp('progress')}</TableHead>
                    <TableHead className="w-28">{tp('currentStep')}</TableHead>
                    <TableHead className="w-20">{tp('status')}</TableHead>
                    <TableHead className="w-16 text-center">{tp('video')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {episodes.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        {tp('noEpisodes')}
                      </TableCell>
                    </TableRow>
                  ) : (
                    episodes.map((ep) => (
                      <TableRow key={ep.id}>
                        <TableCell>
                          <span className="font-mono text-xs font-bold text-primary">
                            E{String(ep.episodeNumber).padStart(2, '0')}
                          </span>
                        </TableCell>
                        <TableCell className="font-medium text-sm truncate max-w-[200px]">
                          {ep.title || tp('episode', { number: ep.episodeNumber })}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Progress
                              value={ep.pipelineProgress}
                              className={`flex-1 h-2 ${getProgressIndicatorClass(ep.pipelineProgress)}`}
                            />
                            <span className="text-xs text-muted-foreground w-9 text-right">
                              {ep.pipelineProgress}%
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-muted-foreground truncate block max-w-[100px]">
                            {ep.currentStep || '—'}
                          </span>
                        </TableCell>
                        <TableCell>{getStatusBadge(ep.status, tc)}</TableCell>
                        <TableCell className="text-center">
                          {ep.hasVideo ? (
                            <CheckCircle2 className="size-4 text-emerald-500 inline" />
                          ) : (
                            <Circle className="size-4 text-muted-foreground/30 inline" />
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        {/* ── Asset Statistics Section ── */}
        <div>
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <ImageIcon className="size-4 text-primary" />
            {tp('assetStatistics')}
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <AssetStatCard
              icon={Users}
              label={tp('characterImages')}
              completed={assets.charactersWithImages}
              total={assets.totalCharacters}
              color="bg-sky-500"
              readyLabel={tp('ready')}
            />
            <AssetStatCard
              icon={Image}
              label={tp('sceneImages')}
              completed={assets.scenesWithImages}
              total={assets.totalScenes}
              color="bg-emerald-500"
              readyLabel={tp('ready')}
            />
            <AssetStatCard
              icon={Package}
              label={tp('propImages')}
              completed={assets.propsWithImages}
              total={assets.totalProps}
              color="bg-orange-500"
              readyLabel={tp('ready')}
            />
            <AssetStatCard
              icon={Film}
              label={tp('storyboardFrames')}
              completed={assets.storyboardsWithFrames}
              total={assets.totalStoryboards}
              color="bg-violet-500"
              readyLabel={tp('ready')}
            />
            <AssetStatCard
              icon={Video}
              label={tp('videoGeneration')}
              completed={assets.storyboardsWithVideos}
              total={assets.totalStoryboards}
              color="bg-rose-500"
              readyLabel={tp('ready')}
            />
            <AssetStatCard
              icon={Mic}
              label={tp('ttsGeneration')}
              completed={assets.storyboardsWithTts}
              total={assets.totalStoryboards}
              color="bg-teal-500"
              readyLabel={tp('ready')}
            />
          </div>
        </div>

        {/* ── Cost Summary & Recent Activity ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Cost Summary */}
          <div>
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <DollarSign className="size-4 text-primary" />
              {tp('costConsumption')}
            </h3>
            <Card className="py-0 gap-0">
              <CardContent className="p-4 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="size-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <DollarSign className="size-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{tp('totalCreditsUsed')}</p>
                    <p className="text-2xl font-bold">{costs.totalCredits.toFixed(1)}</p>
                  </div>
                </div>
                <div className="space-y-2">
                  {[
                    { label: tp('image'), value: costs.byCategory.image, color: 'bg-sky-500' },
                    { label: tp('video'), value: costs.byCategory.video, color: 'bg-rose-500' },
                    { label: tp('dubbing'), value: costs.byCategory.tts, color: 'bg-teal-500' },
                    { label: 'LLM', value: costs.byCategory.llm, color: 'bg-amber-500' },
                  ].map((cat) => (
                    <div key={cat.label} className="flex items-center gap-2">
                      <span className={`size-2 rounded-full ${cat.color} shrink-0`} />
                      <span className="text-xs text-muted-foreground w-10">{cat.label}</span>
                      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full ${cat.color} rounded-full`}
                          style={{
                            width: `${costs.totalCredits > 0 ? (cat.value / costs.totalCredits) * 100 : 0}%`,
                          }}
                        />
                      </div>
                      <span className="text-xs font-medium w-14 text-right">{cat.value.toFixed(1)}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Recent Activity */}
          <div>
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Activity className="size-4 text-primary" />
              {tp('recentActivity')}
            </h3>
            <Card className="py-0 gap-0">
              <CardContent className="p-0">
                {recentActivity.length === 0 ? (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    {tp('noActivity')}
                  </div>
                ) : (
                  <div className="divide-y divide-border/50 max-h-64 overflow-y-auto">
                    {recentActivity.map((activity, idx) => {
                      const typeIcon = {
                        comment: <Activity className="size-3.5 text-sky-500" />,
                        image: <ImageIcon className="size-3.5 text-emerald-500" />,
                        video: <Video className="size-3.5 text-rose-500" />,
                        tts: <Mic className="size-3.5 text-teal-500" />,
                      }
                      const typeLabel = {
                        comment: tp('comment'),
                        image: tp('image'),
                        video: tp('video'),
                        tts: tp('dubbing'),
                      }
                      return (
                        <div key={idx} className="flex items-start gap-3 px-4 py-3">
                          <div className="mt-0.5 shrink-0">
                            {typeIcon[activity.type]}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs truncate">{activity.description}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">
                                {typeLabel[activity.type]}
                              </Badge>
                              <span className="text-[10px] text-muted-foreground">
                                {activity.userName}
                              </span>
                              <span className="text-[10px] text-muted-foreground">
                                {relativeTime(activity.createdAt, tc)}
                              </span>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
