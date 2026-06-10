'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAppStore, type Drama } from '@/lib/store'
import { api } from '@/lib/api'
import { PhaseTracker } from '@/components/phase-tracker'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  BookOpen,
  Palette,
  Users,
  Map,
  Activity,
  Paintbrush,
  Sparkles,
  FolderOpen,
  ArrowRight,
  ChevronDown,
  Loader2,
  Check,
} from 'lucide-react'
import { useTranslations } from 'next-intl'

interface ToolCardProps {
  icon: React.ElementType
  title: string
  description: string
  onClick: () => void
  disabled?: boolean
  badge?: string
  completed?: boolean
}

function ToolCard({ icon: Icon, title, description, onClick, disabled, badge, completed }: ToolCardProps) {
  return (
    <Card
      className={`group border-border/50 hover:border-primary/30 transition-all cursor-pointer py-0 gap-0 ${
        disabled ? 'opacity-50 cursor-not-allowed' : ''
      } ${completed ? 'border-emerald-500/30 bg-emerald-500/5' : ''}`}
      onClick={disabled ? undefined : onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className={`size-10 rounded-lg flex items-center justify-center shrink-0 ${
            completed ? 'bg-emerald-500/10' : 'bg-primary/10'
          }`}>
            {completed ? (
              <Check className="size-5 text-emerald-500" />
            ) : (
              <Icon className={`size-5 ${completed ? 'text-emerald-500' : 'text-primary'}`} />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{title}</span>
              {badge && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-amber-600 border-amber-300">
                  {badge}
                </Badge>
              )}
              {completed && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-emerald-600 border-emerald-300">
                  已完成
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{description}</p>
          </div>
          {!disabled && (
            <ArrowRight className="size-4 text-muted-foreground/30 group-hover:text-primary/50 transition-colors shrink-0 mt-1" />
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export function CreativeWorkspace() {
  const t = useTranslations('nav')
  const selectedDramaId = useAppStore((s) => s.selectedDramaId)
  const currentDrama = useAppStore((s) => s.currentDrama)
  const setCurrentDrama = useAppStore((s) => s.setCurrentDrama)
  const navigateToCreativeWorkspace = useAppStore((s) => s.navigateToCreativeWorkspace)
  const navigateToProjects = useAppStore((s) => s.navigateToProjects)

  // Creative tool navigation
  const navigateToScriptV2 = useAppStore((s) => s.navigateToScriptV2)
  const navigateToAssetV2 = useAppStore((s) => s.navigateToAssetV2)
  const navigateToCharacterBible = useAppStore((s) => s.navigateToCharacterBible)
  const navigateToWorldMap = useAppStore((s) => s.navigateToWorldMap)
  const navigateToQueueDashboard = useAppStore((s) => s.navigateToQueueDashboard)
  const navigateToArtStyle = useAppStore((s) => s.navigateToArtStyle)

  // Project list for inline selector
  const [dramas, setDramas] = useState<Drama[]>([])
  const [loadingDramas, setLoadingDramas] = useState(false)
  const [showProjectSelector, setShowProjectSelector] = useState(false)

  const hasProject = !!selectedDramaId

  const loadDramas = useCallback(async () => {
    setLoadingDramas(true)
    try {
      const list = await api.dramas.list()
      setDramas(list)
    } catch {
      // ignore
    } finally {
      setLoadingDramas(false)
    }
  }, [])

  useEffect(() => {
    // Load project list if no project is selected
    if (!selectedDramaId) {
      loadDramas()
    }
  }, [selectedDramaId, loadDramas])

  // Load drama details when a project is selected
  useEffect(() => {
    if (selectedDramaId && !currentDrama) {
      api.dramas.get(selectedDramaId).then(setCurrentDrama).catch(() => {})
    }
  }, [selectedDramaId, currentDrama, setCurrentDrama])

  const handleSelectProject = (dramaId: string) => {
    setShowProjectSelector(false)
    navigateToCreativeWorkspace(dramaId)
  }

  // Determine completed state for each tool based on currentDrama
  const scriptCompleted = currentDrama?.scriptGenerationStatus === 'completed'
  const assetCompleted = currentDrama?.assetExtractionStatus === 'completed'
  const hasArtStyle = !!currentDrama?.artStyle

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        {/* Header with project selector */}
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
            <Sparkles className="size-5 text-white" />
          </div>
          <div className="flex-1">
            <h1 className="text-lg font-semibold">{t('creativeModule')}</h1>
            <p className="text-xs text-muted-foreground">
              {hasProject
                ? `${currentDrama?.title || '项目'} — V2 创作工作流`
                : '选择项目后开始 V2 创作流程'}
            </p>
          </div>
          {/* Inline project selector / switcher */}
          {hasProject ? (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs"
              onClick={() => {
                loadDramas()
                setShowProjectSelector(!showProjectSelector)
              }}
            >
              <FolderOpen className="size-3.5" />
              {currentDrama?.title || '当前项目'}
              <ChevronDown className="size-3" />
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs"
              onClick={() => {
                loadDramas()
                setShowProjectSelector(!showProjectSelector)
              }}
            >
              <FolderOpen className="size-3.5" />
              选择项目
              <ChevronDown className="size-3" />
            </Button>
          )}
        </div>

        {/* Project selector dropdown */}
        {showProjectSelector && (
          <Card className="border-border/50">
            <CardContent className="py-2">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-muted-foreground">选择一个项目</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[10px] gap-1"
                  onClick={navigateToProjects}
                >
                  <FolderOpen className="size-3" />
                  管理项目
                </Button>
              </div>
              {loadingDramas ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="size-5 animate-spin text-muted-foreground" />
                </div>
              ) : dramas.length === 0 ? (
                <div className="text-center py-6">
                  <p className="text-xs text-muted-foreground mb-2">暂无项目</p>
                  <Button variant="outline" size="sm" onClick={navigateToProjects}>
                    创建新项目
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-60 overflow-y-auto">
                  {dramas.map((drama) => (
                    <button
                      key={drama.id}
                      className={`flex items-center gap-3 p-3 rounded-lg border text-left transition-all hover:bg-muted/50 ${
                        selectedDramaId === drama.id
                          ? 'border-primary bg-primary/5'
                          : 'border-border/50'
                      }`}
                      onClick={() => handleSelectProject(drama.id)}
                    >
                      <div className="size-9 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                        <span className="text-xs font-bold text-primary">
                          {drama.title.slice(0, 1)}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{drama.title}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {drama.genre || '未分类'} · {drama.totalEpisodes} 集
                        </p>
                      </div>
                      {selectedDramaId === drama.id && (
                        <Check className="size-4 text-primary shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* No project selected — friendly prompt (not a dead-end) */}
        {!hasProject && !showProjectSelector && (
          <Card className="border-dashed border-2 border-border/50">
            <CardContent className="py-8 flex flex-col items-center justify-center text-center">
              <FolderOpen className="size-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground mb-1">请先选择一个项目</p>
              <p className="text-xs text-muted-foreground/70 mb-3">
                创作空间需要关联一个短剧项目，才能使用创作工具
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    loadDramas()
                    setShowProjectSelector(true)
                  }}
                >
                  <FolderOpen className="size-3.5 mr-1.5" />
                  选择项目
                </Button>
                <Button variant="ghost" size="sm" onClick={navigateToProjects}>
                  前往项目列表
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Phase Tracker */}
        {hasProject && (
          <Card className="border-border/50">
            <CardContent className="py-4">
              <PhaseTracker dramaId={selectedDramaId!} />
            </CardContent>
          </Card>
        )}

        {/* Creative Tools Grid — always show when project selected */}
        {hasProject && (
          <div>
            <h2 className="text-sm font-medium text-muted-foreground mb-3">创作工具</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <ToolCard
                icon={BookOpen}
                title="剧本生成 V2"
                description="M1 内容规划：全本理解 → 7参数协商 → 一键生成全部剧本"
                onClick={navigateToScriptV2}
                badge="M1"
                completed={scriptCompleted}
              />
              <ToolCard
                icon={Palette}
                title="资产提取 V2"
                description="M2 资产准备：一键提取角色/场景/道具 → 画风定调 → 角色定妆"
                onClick={navigateToAssetV2}
                disabled={!scriptCompleted}
                badge="M2"
                completed={assetCompleted}
              />
              <ToolCard
                icon={Users}
                title="角色圣经"
                description="6层身份锚点保障跨镜一致性，管理角色视觉资产和跨集一致性时间线"
                onClick={navigateToCharacterBible}
                disabled={!assetCompleted}
                completed={false}
              />
              <ToolCard
                icon={Map}
                title="世界观地图"
                description="IP 世界观与场景管理，区域/地点/氛围/音乐风格"
                onClick={navigateToWorldMap}
              />
              <ToolCard
                icon={Activity}
                title="生成队列"
                description="实时监控图片/视频生成队列状态、并发、RPM用量"
                onClick={navigateToQueueDashboard}
              />
              <ToolCard
                icon={Paintbrush}
                title="画风包管理"
                description="管理平台可用的视觉风格，2D/3D/真人写实画风包"
                onClick={navigateToArtStyle}
              />
            </div>
          </div>
        )}

        {/* Quick-start guide when project is new */}
        {hasProject && !scriptCompleted && !currentDrama?.novelSource && (
          <Card className="border-dashed border-amber-500/30 bg-amber-500/5">
            <CardContent className="py-4">
              <div className="flex items-start gap-3">
                <div className="size-8 rounded-full bg-amber-500/10 flex items-center justify-center shrink-0 mt-0.5">
                  <Sparkles className="size-4 text-amber-500" />
                </div>
                <div>
                  <p className="text-sm font-medium">开始创作</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    1. 在项目管理中上传小说原文 → 2. 回到创作空间使用「剧本生成 V2」→ 3. 一键生成剧本后进入资产提取
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2 text-xs gap-1"
                    onClick={navigateToProjects}
                  >
                    <FolderOpen className="size-3" />
                    前往上传小说
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
