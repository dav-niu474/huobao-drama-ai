'use client'

import { XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { BatchProgress } from './types'

/**
 * 批量进度条旁的控制区：失败计数徽章 + 取消按钮。
 * 由各面板在渲染 batchProgress 时调用，保持 UI 一致。
 */
export function BatchProgressControls({ progress }: { progress: BatchProgress | null }) {
  if (!progress) return null
  return (
    <>
      {typeof progress.failed === 'number' && progress.failed > 0 && (
        <span className="rounded-full border border-red-500/30 bg-red-50 px-2 py-0.5 text-[10px] text-red-500 dark:bg-red-950/30">
          失败 {progress.failed}
        </span>
      )}
      {progress.onCancel && (
        <Button
          size="sm"
          variant="ghost"
          className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-destructive"
          onClick={progress.onCancel}
        >
          <XCircle className="size-3" />
          取消
        </Button>
      )}
    </>
  )
}
