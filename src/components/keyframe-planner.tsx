'use client'

import { useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  X,
  Loader2,
  Check,
  HelpCircle,
  Sparkles,
  ChevronDown,
  ChevronRight,
  Image as ImageIcon,
  Grid as GridIcon,
  Film,
  Video,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Progress } from '@/components/ui/progress'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Storyboard, GenerationMode } from '@/lib/store'
import type { KeyframeStatus } from '@/lib/creative/keyframe-service'
import {
  determineGenerationMode,
  getKeyframeStatuses,
  getGenerationModeLabel,
  getGenerationModeColor,
} from '@/lib/creative/keyframe-service'

interface KeyframePlannerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  storyboards: Storyboard[]
  aiLoading: boolean
  generatingKeyframe: string | null
  onGenerateKeyframe: (storyboardId: string, mode: GenerationMode) => Promise<void>
  onUpdateStoryboard: (id: string, data: Partial<Storyboard>) => Promise<void>
}

export function KeyframePlanner({
  open,
  onOpenChange,
  storyboards,
  aiLoading,
  generatingKeyframe,
  onGenerateKeyframe,
  onUpdateStoryboard,
}: KeyframePlannerProps) {
  const [expandedShot, setExpandedShot] = useState<string | null>(null)
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null)
  const [batchGenerating, setBatchGenerating] = useState(false)

  // Compute statuses for all storyboards
  const keyframeStatuses = getKeyframeStatuses(storyboards)
  const statusMap = new Map(keyframeStatuses.map((s) => [s.storyboardId, s]))

  const readyCount = keyframeStatuses.filter((s) => s.isReady).length
  const needsGenerationCount = keyframeStatuses.filter((s) => !s.isReady).length

  // Handle mode change for a storyboard
  const handleModeChange = useCallback(
    async (storyboardId: string, newMode: GenerationMode) => {
      await onUpdateStoryboard(storyboardId, { generationMode: newMode })
    },
    [onUpdateStoryboard]
  )

  // Batch generate keyframes
  const handleBatchGenerate = async () => {
    const needingGeneration = keyframeStatuses.filter((s) => !s.isReady)
    if (needingGeneration.length === 0) return

    setBatchGenerating(true)
    setBatchProgress({ current: 0, total: needingGeneration.length })

    let successCount = 0
    for (let i = 0; i < needingGeneration.length; i++) {
      const status = needingGeneration[i]
      setBatchProgress({ current: i + 1, total: needingGeneration.length })
      try {
        await onGenerateKeyframe(
          status.storyboardId,
          (status.generationMode as GenerationMode) ?? 'image2video'
        )
        successCount++
      } catch {
        // Continue with next
      }
    }

    setBatchGenerating(false)
    setBatchProgress(null)
  }

  // Get mode icon
  const getModeIcon = (mode: GenerationMode | null) => {
    const m = mode ?? 'image2video'
    switch (m) {
      case 'image2video':
        return <ImageIcon className="size-3" />
      case 'first_last':
        return <Film className="size-3" />
      case 'grid':
        return <GridIcon className="size-3" />
      case 'reference_video':
        return <Video className="size-3" />
      default:
        return <ImageIcon className="size-3" />
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-5 text-primary" />
            关键帧规划器
          </DialogTitle>
          <DialogDescription>
            管理所有镜头的生成模式和关键帧状态。批量生成或单独调整每个镜头。
          </DialogDescription>
        </DialogHeader>

        {/* Summary bar */}
        <div className="px-6 py-3 border-b bg-muted/30 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted-foreground">
              就绪 <span className="font-semibold text-emerald-600">{readyCount}</span> / {storyboards.length}
            </span>
            {needsGenerationCount > 0 && (
              <Badge variant="outline" className="text-[10px]">
                {needsGenerationCount} 需生成
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            {batchProgress && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="size-3 animate-spin" />
                <span>{batchProgress.current}/{batchProgress.total}</span>
                <Progress
                  value={(batchProgress.current / batchProgress.total) * 100}
                  className="h-1.5 w-20"
                />
              </div>
            )}
            <Button
              size="sm"
              onClick={handleBatchGenerate}
              disabled={aiLoading || batchGenerating || needsGenerationCount === 0}
              className="amber-glow"
            >
              {batchGenerating ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Sparkles className="size-3.5" />
              )}
              批量生成关键帧
              {needsGenerationCount > 0 && (
                <Badge variant="secondary" className="text-[9px] px-1 py-0 ml-1">
                  {needsGenerationCount}
                </Badge>
              )}
            </Button>
          </div>
        </div>

        {/* Storyboard list */}
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-2">
            {storyboards.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                暂无分镜，请先生成分镜
              </div>
            ) : (
              storyboards.map((sb) => {
                const status = statusMap.get(sb.id)
                const isExpanded = expandedShot === sb.id
                const isGenerating = generatingKeyframe === sb.id
                const currentMode = sb.generationMode ?? determineGenerationMode(sb)
                const modeLabel = getGenerationModeLabel(currentMode)
                const modeColor = getGenerationModeColor(currentMode)

                return (
                  <Card
                    key={sb.id}
                    className={`border-border/50 py-0 gap-0 ${status?.isReady ? 'ring-1 ring-emerald-500/20' : ''}`}
                  >
                    <CardContent className="p-3">
                      {/* Header row */}
                      <button
                        className="w-full flex items-center gap-2 text-left"
                        onClick={() => setExpandedShot(isExpanded ? null : sb.id)}
                      >
                        {isExpanded ? (
                          <ChevronDown className="size-3.5 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="size-3.5 text-muted-foreground" />
                        )}

                        {/* Shot number */}
                        <span className="text-xs font-bold text-primary w-8 flex-shrink-0">
                          #{String(sb.shotNumber).padStart(2, '0')}
                        </span>

                        {/* Title */}
                        <span className="text-xs font-medium truncate flex-1">
                          {sb.title}
                        </span>

                        {/* Generation mode badge */}
                        <Badge
                          variant="outline"
                          className={`text-[10px] px-1.5 py-0 gap-1 ${modeColor}`}
                        >
                          {getModeIcon(currentMode)}
                          {modeLabel}
                        </Badge>

                        {/* Status */}
                        {status?.isReady ? (
                          <Badge className="status-completed text-[9px] px-1.5 py-0 gap-0.5">
                            <Check className="size-2.5" /> 就绪
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[9px] px-1.5 py-0 gap-0.5 text-amber-600 border-amber-200">
                            <HelpCircle className="size-2.5" /> 待生成
                          </Badge>
                        )}

                        {/* Generating indicator */}
                        {isGenerating && (
                          <Loader2 className="size-3.5 animate-spin text-primary" />
                        )}
                      </button>

                      {/* Expanded content */}
                      {isExpanded && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="mt-3 pl-8 space-y-3"
                        >
                          {/* Generation mode selector */}
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] text-muted-foreground w-20">
                              生成模式
                            </span>
                            <Select
                              value={currentMode}
                              onValueChange={(val) =>
                                handleModeChange(sb.id, val as GenerationMode)
                              }
                            >
                              <SelectTrigger className="h-7 text-[11px] w-44">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="image2video">
                                  <span className="flex items-center gap-1.5">
                                    <ImageIcon className="size-3" /> 图生视频 (I2V)
                                  </span>
                                </SelectItem>
                                <SelectItem value="first_last">
                                  <span className="flex items-center gap-1.5">
                                    <Film className="size-3" /> 首尾帧插值
                                  </span>
                                </SelectItem>
                                <SelectItem value="grid">
                                  <span className="flex items-center gap-1.5">
                                    <GridIcon className="size-3" /> 宫格图拆分
                                  </span>
                                </SelectItem>
                                <SelectItem value="reference_video">
                                  <span className="flex items-center gap-1.5">
                                    <Video className="size-3" /> 参考视频风格迁移
                                  </span>
                                </SelectItem>
                              </SelectContent>
                            </Select>
                            {sb.generationMode === null && (
                              <span className="text-[10px] text-muted-foreground italic">
                                系统自动选择
                              </span>
                            )}
                          </div>

                          {/* Missing items info */}
                          {status && !status.isReady && status.missingItems.length > 0 && (
                            <div className="text-[11px] text-amber-600 bg-amber-50 rounded px-2 py-1.5">
                              缺少: {status.missingItems.map((item) => {
                                const labels: Record<string, string> = {
                                  firstFrame: '首帧图',
                                  lastFrame: '尾帧图',
                                  gridImage: '宫格图',
                                  referenceVideo: '参考视频',
                                  prompt: '提示词',
                                }
                                return labels[item] ?? item
                              }).join('、')}
                            </div>
                          )}

                          {/* Generate button */}
                          {!status?.isReady && (
                            <Button
                              size="sm"
                              onClick={() =>
                                onGenerateKeyframe(sb.id, currentMode)
                              }
                              disabled={isGenerating || aiLoading}
                              className="h-7 text-[11px] amber-glow"
                            >
                              {isGenerating ? (
                                <Loader2 className="size-3 animate-spin" />
                              ) : (
                                <Sparkles className="size-3" />
                              )}
                              生成关键帧
                            </Button>
                          )}

                          {/* Existing assets preview */}
                          {(sb.firstFrameUrl || sb.lastFrameUrl || sb.gridImageUrl) && (
                            <div className="flex gap-2 flex-wrap">
                              {sb.firstFrameUrl && (
                                <div className="size-16 rounded overflow-hidden border border-border/50">
                                  <img
                                    src={sb.firstFrameUrl}
                                    alt="首帧"
                                    className="w-full h-full object-cover"
                                  />
                                </div>
                              )}
                              {sb.lastFrameUrl && (
                                <div className="size-16 rounded overflow-hidden border border-border/50">
                                  <img
                                    src={sb.lastFrameUrl}
                                    alt="尾帧"
                                    className="w-full h-full object-cover"
                                  />
                                </div>
                              )}
                              {sb.gridImageUrl && (
                                <div className="size-16 rounded overflow-hidden border border-border/50">
                                  <img
                                    src={sb.gridImageUrl}
                                    alt="宫格图"
                                    className="w-full h-full object-cover"
                                  />
                                </div>
                              )}
                            </div>
                          )}
                        </motion.div>
                      )}
                    </CardContent>
                  </Card>
                )
              })
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
