'use client'

import { useAppStore } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Palette } from 'lucide-react'

/**
 * AssetWorkbench — 素材管理工作台（v0.8 占位组件）
 * 
 * 左右两栏布局：
 * - 左工具面板：素材提取操作 + 类型筛选 + 风格定调 + 批量生成配置
 * - 右素材网格：搜索 + 素材卡片网格
 * 
 * 将在 PR-E 中完整实现
 */
export function AssetWorkbench() {
  const navigateToProject = useAppStore((s) => s.navigateToProject)
  const navigateToScriptWorkbench = useAppStore((s) => s.navigateToScriptWorkbench)
  const selectedDramaId = useAppStore((s) => s.selectedDramaId)
  const currentDrama = useAppStore((s) => s.currentDrama)

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* 顶部导航 */}
      <div className="h-12 border-b border-border flex items-center px-4 gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => selectedDramaId && navigateToScriptWorkbench(selectedDramaId)}
        >
          <ArrowLeft className="size-4 mr-1" />
          剧本工作台
        </Button>
        <div className="h-4 w-px bg-border" />
        <div className="flex items-center gap-2">
          <Palette className="size-4 text-purple-500" />
          <span className="text-sm font-medium">素材管理工作台</span>
          {currentDrama && (
            <span className="text-sm text-muted-foreground">— {currentDrama.title}</span>
          )}
        </div>
        <div className="ml-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={() => selectedDramaId && navigateToProject(selectedDramaId)}
          >
            进入管线 →
          </Button>
        </div>
      </div>

      {/* 占位内容 */}
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="text-6xl">🎨</div>
          <h2 className="text-xl font-semibold">素材管理工作台</h2>
          <p className="text-sm text-muted-foreground max-w-md">
            从剧本提取核心素材（角色/场景/道具），选择风格定调，批量生成素材图片。
            <br />该功能将在后续PR中完整实现。
          </p>
          <div className="flex gap-2 justify-center">
            <Button
              variant="outline"
              onClick={() => selectedDramaId && navigateToScriptWorkbench(selectedDramaId)}
            >
              ← 剧本工作台
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
