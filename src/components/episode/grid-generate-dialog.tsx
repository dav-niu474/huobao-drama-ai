'use client'

import { useState, useMemo } from 'react'
import {
  Grid as GridIcon,
  Loader2,
  Minus,
  Plus,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { GRID_MODES } from '@/lib/grid'
import type { GridConfig, GridGenerationState } from './types'
import type { Storyboard } from '@/lib/store'

interface GridGenerateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  storyboards: Storyboard[]
  gridState: GridGenerationState
  handleGridGenerate: (config: GridConfig) => Promise<void>
}

export function GridGenerateDialog({
  open,
  onOpenChange,
  storyboards,
  gridState,
  handleGridGenerate,
}: GridGenerateDialogProps) {
  const [mode, setMode] = useState<GridConfig['mode']>('first_frame')
  const [rows, setRows] = useState(2)
  const [cols, setCols] = useState(3)

  // Pending shots: no firstFrameUrl + has imagePrompt
  const pendingShots = useMemo(
    () => storyboards.filter((s) => !s.firstFrameUrl && s.imagePrompt),
    [storyboards]
  )

  const totalCells = rows * cols
  const shotsToUse = pendingShots.slice(0, totalCells)

  const isWorking = gridState.isGeneratingGrid || gridState.isSplittingGrid

  const adjustRows = (delta: number) => {
    setRows((prev) => Math.min(6, Math.max(1, prev + delta)))
  }
  const adjustCols = (delta: number) => {
    setCols((prev) => Math.min(6, Math.max(1, prev + delta)))
  }

  // Clamp total cells to 36
  const effectiveTotal = Math.min(totalCells, 36)

  const handleGenerate = async () => {
    const config: GridConfig = { mode, rows, cols }
    await handleGridGenerate(config)
    onOpenChange(false)
  }

  // Find the description for the currently selected mode
  const selectedModeInfo = GRID_MODES.find((m) => m.id === mode)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GridIcon className="size-5 text-primary" />
            宫格图批量生成
          </DialogTitle>
          <DialogDescription>
            一次性生成多个镜头的画面，自动拆分并分配到对应镜头
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Mode selector */}
          <div className="space-y-2">
            <label className="text-sm font-medium">模式</label>
            <Select
              value={mode}
              onValueChange={(v) => setMode(v as GridConfig['mode'])}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GRID_MODES.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedModeInfo && (
              <p className="text-xs text-muted-foreground">{selectedModeInfo.description}</p>
            )}
          </div>

          {/* Rows & Cols steppers */}
          <div className="flex items-start gap-6">
            <div className="space-y-2">
              <label className="text-sm font-medium">行数</label>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="size-8"
                  onClick={() => adjustRows(-1)}
                  disabled={rows <= 1}
                >
                  <Minus className="size-3.5" />
                </Button>
                <span className="w-8 text-center text-sm font-semibold tabular-nums">
                  {rows}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  className="size-8"
                  onClick={() => adjustRows(1)}
                  disabled={rows >= 6}
                >
                  <Plus className="size-3.5" />
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">列数</label>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="size-8"
                  onClick={() => adjustCols(-1)}
                  disabled={cols <= 1}
                >
                  <Minus className="size-3.5" />
                </Button>
                <span className="w-8 text-center text-sm font-semibold tabular-nums">
                  {cols}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  className="size-8"
                  onClick={() => adjustCols(1)}
                  disabled={cols >= 6}
                >
                  <Plus className="size-3.5" />
                </Button>
              </div>
            </div>
            <div className="pt-7">
              <Badge variant="secondary" className="text-xs">
                {effectiveTotal}格 ({rows}×{cols})
              </Badge>
            </div>
          </div>

          {/* Visual preview grid */}
          <div className="space-y-2">
            <label className="text-sm font-medium">预览布局</label>
            <div className="border border-border/50 rounded-lg p-2 bg-muted/20">
              <div
                className="grid gap-1"
                style={{
                  gridTemplateColumns: `repeat(${cols}, 1fr)`,
                }}
              >
                {Array.from({ length: effectiveTotal }).map((_, i) => {
                  const shot = shotsToUse[i]
                  const isOccupied = !!shot
                  return (
                    <div
                      key={i}
                      className={`aspect-video rounded text-[10px] flex flex-col items-center justify-center border border-dashed transition-colors ${
                        isOccupied
                          ? 'bg-primary/10 border-primary/30 text-primary'
                          : 'bg-muted/40 border-border/30 text-muted-foreground/40'
                      }`}
                    >
                      <span className="font-semibold">{i + 1}</span>
                      {isOccupied && (
                        <span className="truncate w-full text-center px-0.5 text-[8px] opacity-70">
                          镜头{shot.shotNumber}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Shot list */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">待生成镜头</label>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                {pendingShots.length} 个待生成 / {effectiveTotal} 格
              </Badge>
            </div>
            {pendingShots.length === 0 ? (
              <p className="text-xs text-muted-foreground bg-muted/30 rounded p-3">
                没有可生成宫格图的镜头（需要未生成图片且有提示词的镜头）
              </p>
            ) : (
              <div className="max-h-32 overflow-y-auto rounded border border-border/30">
                <div className="divide-y divide-border/30">
                  {pendingShots.map((s, i) => (
                    <div
                      key={s.id}
                      className={`flex items-center gap-2 px-2.5 py-1.5 text-xs ${
                        i >= effectiveTotal ? 'opacity-40' : ''
                      }`}
                    >
                      <span className="size-5 rounded bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary flex-shrink-0">
                        {s.shotNumber}
                      </span>
                      <span className="truncate flex-1 text-muted-foreground">
                        {s.title}
                      </span>
                      {i < effectiveTotal ? (
                        <Badge variant="secondary" className="text-[8px] px-1 py-0 flex-shrink-0">
                          格{i + 1}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[8px] px-1 py-0 flex-shrink-0">
                          溢出
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Working status */}
          {isWorking && (
            <div className="flex items-center gap-2 text-sm text-primary">
              <Loader2 className="size-4 animate-spin" />
              <span>
                {gridState.isGeneratingGrid
                  ? '正在生成宫格图...'
                  : '正在分割宫格图...'}
              </span>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isWorking}
          >
            取消
          </Button>
          <Button
            onClick={handleGenerate}
            disabled={isWorking || pendingShots.length === 0}
            className="amber-glow"
          >
            {isWorking ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <GridIcon className="size-4" />
            )}
            开始生成宫格图
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
