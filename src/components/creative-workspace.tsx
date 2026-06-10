'use client'

import { useAppStore } from '@/lib/store'
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
} from 'lucide-react'
import { useTranslations } from 'next-intl'

interface ToolCardProps {
  icon: React.ElementType
  title: string
  description: string
  onClick: () => void
  disabled?: boolean
  badge?: string
}

function ToolCard({ icon: Icon, title, description, onClick, disabled, badge }: ToolCardProps) {
  return (
    <Card
      className={`group border-border/50 hover:border-primary/30 transition-all cursor-pointer py-0 gap-0 ${
        disabled ? 'opacity-50 cursor-not-allowed' : ''
      }`}
      onClick={disabled ? undefined : onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="size-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Icon className="size-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{title}</span>
              {badge && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-amber-600 border-amber-300">
                  {badge}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{description}</p>
          </div>
          <ArrowRight className="size-4 text-muted-foreground/30 group-hover:text-primary/50 transition-colors shrink-0 mt-1" />
        </div>
      </CardContent>
    </Card>
  )
}

export function CreativeWorkspace() {
  const t = useTranslations('nav')
  const selectedDramaId = useAppStore((s) => s.selectedDramaId)
  const currentDrama = useAppStore((s) => s.currentDrama)
  const navigateToProjects = useAppStore((s) => s.navigateToProjects)

  // Creative tool navigation - these will be wired up via store actions
  const navigateToScriptV2 = useAppStore((s) => s.navigateToScriptV2)
  const navigateToAssetV2 = useAppStore((s) => s.navigateToAssetV2)
  const navigateToCharacterBible = useAppStore((s) => s.navigateToCharacterBible)
  const navigateToWorldMap = useAppStore((s) => s.navigateToWorldMap)
  const navigateToQueueDashboard = useAppStore((s) => s.navigateToQueueDashboard)
  const navigateToArtStyle = useAppStore((s) => s.navigateToArtStyle)

  const hasProject = !!selectedDramaId

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
            <Sparkles className="size-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">{t('creativeModule')}</h1>
            <p className="text-xs text-muted-foreground">
              {hasProject
                ? `${currentDrama?.title || '项目'} — V2 创作工作流`
                : '选择项目后开始 V2 创作流程'}
            </p>
          </div>
        </div>

        {/* No project selected state */}
        {!hasProject && (
          <Card className="border-dashed border-2 border-border/50">
            <CardContent className="py-8 flex flex-col items-center justify-center text-center">
              <FolderOpen className="size-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground mb-3">请先选择一个项目</p>
              <Button variant="outline" size="sm" onClick={navigateToProjects}>
                <FolderOpen className="size-3.5 mr-1.5" />
                前往项目列表
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Phase Tracker */}
        {hasProject && (
          <Card className="border-border/50">
            <CardContent className="py-4">
              <PhaseTracker dramaId={selectedDramaId} />
            </CardContent>
          </Card>
        )}

        {/* Creative Tools Grid */}
        <div>
          <h2 className="text-sm font-medium text-muted-foreground mb-3">创作工具</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <ToolCard
              icon={BookOpen}
              title="剧本生成 V2"
              description="M1 内容规划：全本理解 → 7参数协商 → 一键生成全部剧本"
              onClick={navigateToScriptV2}
              disabled={!hasProject}
              badge="M1"
            />
            <ToolCard
              icon={Palette}
              title="资产提取 V2"
              description="M2 资产准备：一键提取角色/场景/道具 → 画风定调 → 角色定妆"
              onClick={navigateToAssetV2}
              disabled={!hasProject}
              badge="M2"
            />
            <ToolCard
              icon={Users}
              title="角色圣经"
              description="6层身份锚点保障跨镜一致性，管理角色视觉资产和跨集一致性时间线"
              onClick={navigateToCharacterBible}
              disabled={!hasProject}
            />
            <ToolCard
              icon={Map}
              title="世界观地图"
              description="IP 世界观与场景管理，区域/地点/氛围/音乐风格"
              onClick={navigateToWorldMap}
              disabled={!hasProject}
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
      </div>
    </div>
  )
}
