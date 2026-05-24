'use client'

import { useAppStore } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { ArrowLeft, BookOpen } from 'lucide-react'

/**
 * ScriptWorkbench — 剧本生成工作台（v0.8 占位组件）
 * 
 * 三栏布局：
 * - 左栏：小说章节导航 + 生成配置
 * - 中栏：故事骨架/改编策略/剧本输出 三个Tab页
 * - 右栏：生成概览（进度/状态/AI日志/统计）
 * 
 * 将在 PR-C 中完整实现
 */
export function ScriptWorkbench() {
  const navigateToProject = useAppStore((s) => s.navigateToProject)
  const selectedDramaId = useAppStore((s) => s.selectedDramaId)
  const currentDrama = useAppStore((s) => s.currentDrama)

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* 顶部导航 */}
      <div className="h-12 border-b border-border flex items-center px-4 gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => selectedDramaId && navigateToProject(selectedDramaId)}
        >
          <ArrowLeft className="size-4 mr-1" />
          返回项目
        </Button>
        <div className="h-4 w-px bg-border" />
        <div className="flex items-center gap-2">
          <BookOpen className="size-4 text-amber-500" />
          <span className="text-sm font-medium">剧本生成工作台</span>
          {currentDrama && (
            <span className="text-sm text-muted-foreground">— {currentDrama.title}</span>
          )}
        </div>
      </div>

      {/* 占位内容 */}
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="text-6xl">📖</div>
          <h2 className="text-xl font-semibold">剧本生成工作台</h2>
          <p className="text-sm text-muted-foreground max-w-md">
            上传小说后，在此工作台进行故事骨架提取、改编策略制定、批量剧本生成。
            <br />该功能将在后续PR中完整实现。
          </p>
          <div className="flex gap-2 justify-center">
            <Button
              variant="outline"
              onClick={() => selectedDramaId && navigateToProject(selectedDramaId)}
            >
              返回项目详情
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
