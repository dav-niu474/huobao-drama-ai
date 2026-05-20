'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  Loader2,
  Sparkles,
  Film,
  Check,
  Clock,
  Camera,
  Image as ImageIcon,
  Video,
  RefreshCw,
  Mic,
  Upload,
  Wand2,
  ChevronDown,
  Copy,
  Edit3,
  Save,
  X,
  Volume2,
  Layers,
  ImagePlus,
  Grid3X3,
  SplitSquareHorizontal,
  Plus,
  Trash2,
  Bookmark,
  RotateCcw,
  AlertCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Progress } from '@/components/ui/progress'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from '@/components/ui/collapsible'
import { AgentExecutionPanel, type AgentLogEntry } from '@/components/agent-execution-panel'
import { statusBadge, shotTypeLabel, cameraAngleLabel, cameraMovementLabel } from './helpers'
import type { StoryboardPanelProps, GridConfig, GridMode, PipelineStepKey } from './types'
import type { Storyboard } from '@/lib/store'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'

// ── Inline Editable Field ──────────────────────────────────────

function InlineField({
  label,
  value,
  onSave,
  copiedField,
  fieldId,
  onCopy,
  multiline = false,
  placeholder = '',
}: {
  label: string
  value: string | null | undefined
  onSave: (val: string) => void
  copiedField: string | null
  fieldId: string
  onCopy: (text: string, id: string) => void
  multiline?: boolean
  placeholder?: string
}) {
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState(value ?? '')

  const handleSave = () => {
    onSave(editValue)
    setEditing(false)
  }

  const handleCancel = () => {
    setEditValue(value ?? '')
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="space-y-1.5">
        <label className="text-[10px] font-medium text-muted-foreground">{label}</label>
        {multiline ? (
          <Textarea
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            className="text-xs min-h-[60px] resize-y"
            placeholder={placeholder}
            autoFocus
          />
        ) : (
          <Input
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            className="text-xs h-7"
            placeholder={placeholder}
            autoFocus
          />
        )}
        <div className="flex items-center gap-1">
          <Button size="sm" variant="secondary" className="h-6 text-[10px] px-2 gap-1" onClick={handleSave}>
            <Save className="size-2.5" /> 保存
          </Button>
          <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2 gap-1" onClick={handleCancel}>
            <X className="size-2.5" /> 取消
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="group">
      <div className="flex items-center gap-1.5 mb-0.5">
        <label className="text-[10px] font-medium text-muted-foreground">{label}</label>
        <button
          onClick={() => setEditing(true)}
          className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-muted/50"
          title="编辑"
        >
          <Edit3 className="size-2.5 text-muted-foreground" />
        </button>
        {value && (
          <button
            onClick={() => onCopy(value, fieldId)}
            className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-muted/50"
            title="复制"
          >
            {copiedField === fieldId ? (
              <Check className="size-2.5 text-emerald-500" />
            ) : (
              <Copy className="size-2.5 text-muted-foreground" />
            )}
          </button>
        )}
      </div>
      <p className={`text-xs ${value ? 'text-foreground' : 'text-muted-foreground italic'}`}>
        {value || placeholder || '未设置'}
      </p>
    </div>
  )
}

// ── Section wrapper ──────────────────────────────────────────────

function DetailSection({
  title,
  icon,
  children,
  defaultOpen = true,
}: {
  title: string
  icon: React.ReactNode
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  return (
    <Collapsible defaultOpen={defaultOpen}>
      <CollapsibleTrigger className="flex items-center gap-2 w-full py-2 hover:text-foreground transition-colors">
        <ChevronDown className="size-3 text-muted-foreground" />
        {icon}
        <span className="text-xs font-semibold">{title}</span>
        <Separator className="flex-1" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="space-y-3 pl-1">
          {children}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

// ── Grid size options ─────────────────────────────────────────

const GRID_SIZE_OPTIONS = [
  { value: '2x2', label: '2×2 (4格)', rows: 2, cols: 2 },
  { value: '2x3', label: '2×3 (6格)', rows: 2, cols: 3 },
  { value: '3x3', label: '3×3 (9格)', rows: 3, cols: 3 },
  { value: '3x4', label: '3×4 (12格)', rows: 3, cols: 4 },
  { value: '4x4', label: '4×4 (16格)', rows: 4, cols: 4 },
] as const

const GRID_MODE_OPTIONS: { value: GridMode; label: string; description: string }[] = [
  { value: 'first_frame', label: '首帧宫格', description: '每个宫格展示一个镜头的首帧画面' },
  { value: 'first_last', label: '首末帧宫格', description: '奇数格为首帧，偶数格为末帧' },
  { value: 'multi_ref', label: '多参考帧', description: '所有宫格来自同一场景，保持一致' },
]

// ── Main StoryboardPanel ──────────────────────────────────────

// ── Step-aware configuration ────────────────────────────────────

interface StoryboardStepConfig {
  stepNumber: string
  title: string
  subtitle: string
  focusOnGeneration: boolean
  focusOnImages: boolean
}

function getStoryboardStepConfig(step: PipelineStepKey): StoryboardStepConfig {
  switch (step) {
    case 'shot_frames':
      return {
        stepNumber: '09',
        title: '镜头帧图',
        subtitle: '为每个镜头生成首帧图片，支持批量操作和宫格图',
        focusOnGeneration: false,
        focusOnImages: true,
      }
    case 'storyboard':
    default:
      return {
        stepNumber: '05',
        title: '分镜列表',
        subtitle: '',
        focusOnGeneration: true,
        focusOnImages: false,
      }
  }
}

export function StoryboardPanel({
  storyboards,
  aiLoading,
  isStoryboarding,
  episode,
  agentExec,
  generatingShotImg,
  generatingVideo,
  generatingTts,
  batchProgress,
  uploadingField,
  copiedField,
  gridState,
  activePipelineStep,
  handleGenerateStoryboard,
  handleEnhanceShotPrompt,
  handleGenerateAllImages,
  handleGenerateAllVideos,
  handleGenerateShotImage,
  handleGenerateVideo,
  handleGenerateTts,
  handleUpload,
  handleCopy,
  handleUpdateStoryboard,
  handleGridGenerate,
}: StoryboardPanelProps) {
  const stepConfig = getStoryboardStepConfig(activePipelineStep)
  const [selectedShotId, setSelectedShotId] = useState<string | null>(
    storyboards.length > 0 ? storyboards[0].id : null
  )
  const selectedShot = storyboards.find((s) => s.id === selectedShotId)

  // Grid dialog state
  const [gridDialogOpen, setGridDialogOpen] = useState(false)
  const [gridMode, setGridMode] = useState<GridMode>('first_frame')
  const [gridSize, setGridSize] = useState('2x2')

  // Check for storyboard agent error state
  const storyboardError = agentExec.errors['storyboard_breaker']
  const isAgentRunning = agentExec.isRunning('storyboard_breaker')

  // Empty state
  if (storyboards.length === 0 && !isStoryboarding && !isAgentRunning && !aiLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center max-w-md"
        >
          <div className="mx-auto size-16 rounded-full bg-primary/10 flex items-center justify-center mb-5">
            {stepConfig.focusOnImages ? (
              <Camera className="size-8 text-primary" />
            ) : (
              <Film className="size-8 text-primary" />
            )}
          </div>
          <h2 className="text-lg font-semibold mb-2">
            {stepConfig.focusOnImages ? '镜头帧图' : '生成分镜'}
          </h2>
          <p className="text-sm text-muted-foreground mb-6">
            {stepConfig.focusOnImages
              ? '请先生成分镜列表，然后为每个镜头生成帧图片'
              : 'AI将把剧本拆解为单独的镜头，包含景别、运镜、动作描述和对白'}
          </p>
          <Button
            onClick={handleGenerateStoryboard}
            disabled={aiLoading}
            className="amber-glow"
          >
            <Sparkles className="size-4" />
            开始生成分镜
          </Button>
        </motion.div>
      </div>
    )
  }

  // Loading/running state — show agent execution panel
  if (isStoryboarding || isAgentRunning) {
    return (
      <div className="flex-1 p-6 overflow-y-auto">
        <AgentExecutionPanel
          agentType="storyboard_breaker"
          agentName="分镜拆解专家"
          isRunning={isAgentRunning}
          logs={(agentExec.logs['storyboard_breaker'] || []) as AgentLogEntry[]}
          resultText={agentExec.resultTexts['storyboard_breaker']}
          duration={agentExec.durations['storyboard_breaker']}
          error={storyboardError}
        />
      </div>
    )
  }

  // Error recovery state — show error with retry button when agent has failed
  // and no storyboards exist yet (avoids getting stuck after a failed generation)
  if (storyboards.length === 0 && storyboardError && !isAgentRunning) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center max-w-md"
        >
          <div className="mx-auto size-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-5">
            <AlertCircle className="size-8 text-red-500" />
          </div>
          <h2 className="text-lg font-semibold mb-2">分镜生成失败</h2>
          <p className="text-sm text-muted-foreground mb-2">
            分镜拆解过程中遇到了问题，请查看错误信息后重试。
          </p>
          {storyboardError && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-left">
              <p className="text-xs text-red-600 dark:text-red-400 break-words">
                {storyboardError.length > 300 ? storyboardError.slice(0, 300) + '...' : storyboardError}
              </p>
            </div>
          )}
          <div className="flex items-center justify-center gap-3">
            <Button
              onClick={handleGenerateStoryboard}
              disabled={aiLoading}
              className="amber-glow"
            >
              <RotateCcw className="size-4" />
              重新生成分镜
            </Button>
          </div>
          {/* Also show the agent execution log for debugging */}
          {agentExec.logs['storyboard_breaker'] && agentExec.logs['storyboard_breaker'].length > 0 && (
            <div className="mt-6 text-left">
              <AgentExecutionPanel
                agentType="storyboard_breaker"
                agentName="分镜拆解专家"
                isRunning={false}
                logs={agentExec.logs['storyboard_breaker'] as AgentLogEntry[]}
                resultText={agentExec.resultTexts['storyboard_breaker']}
                duration={agentExec.durations['storyboard_breaker']}
                error={storyboardError}
                defaultExpanded={false}
              />
            </div>
          )}
        </motion.div>
      </div>
    )
  }

  // Derived data for toolbar
  const pendingImageShots = storyboards.filter((s) => !s.firstFrameUrl && s.imagePrompt)
  const pendingVideoShots = storyboards.filter((s) => !s.videoUrl && (s.videoPrompt || s.imagePrompt))
  const t2vShots = pendingVideoShots.filter((s) => !s.firstFrameUrl)
  const i2vShots = pendingVideoShots.filter((s) => s.firstFrameUrl)

  // Grid helpers
  const selectedSizeOption = GRID_SIZE_OPTIONS.find((o) => o.value === gridSize) ?? GRID_SIZE_OPTIONS[0]!
  const gridTotalCells = selectedSizeOption.rows * selectedSizeOption.cols
  const gridShotsToUse = pendingImageShots.slice(0, gridTotalCells)

  const handleStartGridGeneration = () => {
    const config: GridConfig = {
      mode: gridMode,
      rows: selectedSizeOption.rows,
      cols: selectedSizeOption.cols,
    }
    setGridDialogOpen(false)
    handleGridGenerate(config)
  }

  const isGridBusy = gridState.isGeneratingGrid || gridState.isSplittingGrid

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border/50 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono text-primary/80">{stepConfig.stepNumber}</span>
          <div>
            <h2 className="text-sm font-semibold">{stepConfig.title}</h2>
            {stepConfig.subtitle && (
              <p className="text-[10px] text-muted-foreground">{stepConfig.subtitle}</p>
            )}
          </div>
          <Badge variant="secondary" className="text-[10px]">{storyboards.length} 镜</Badge>
          {episode?.storyboardStatus && statusBadge(episode.storyboardStatus)}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {batchProgress && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" />
              <span>{batchProgress.message}</span>
              <Progress value={(batchProgress.current / batchProgress.total) * 100} className="h-1.5 w-20" />
            </div>
          )}
          {/* shot_frames step: image-focused buttons */}
          {stepConfig.focusOnImages && pendingImageShots.length > 0 && (
            <>
              <Button
                size="sm"
                variant="default"
                onClick={handleGenerateAllImages}
                disabled={!!generatingShotImg || !!generatingVideo || isGridBusy}
                className="amber-glow"
              >
                {generatingShotImg ? <Loader2 className="size-3.5 animate-spin" /> : <ImageIcon className="size-3.5" />}
                生成全部图片
              </Button>
              <Button
                size="sm"
                variant="default"
                onClick={() => setGridDialogOpen(true)}
                disabled={!!generatingShotImg || !!generatingVideo || isGridBusy}
                className="amber-glow"
              >
                {isGridBusy ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : gridState.isSplittingGrid ? (
                  <SplitSquareHorizontal className="size-3.5" />
                ) : (
                  <Grid3X3 className="size-3.5" />
                )}
                宫格图生成
                <Badge variant="secondary" className="text-[9px] px-1 py-0 ml-1">
                  {pendingImageShots.length}
                </Badge>
              </Button>
            </>
          )}
          {/* storyboard step: show all action buttons including video */}
          {stepConfig.focusOnGeneration && (
            <>
              {pendingVideoShots.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleGenerateAllVideos}
                  disabled={!!generatingVideo || !!generatingShotImg || isGridBusy}
                  className="amber-glow"
                >
                  {generatingVideo ? <Loader2 className="size-3.5 animate-spin" /> : <Video className="size-3.5" />}
                  生成全部视频
                  <Badge variant="secondary" className="text-[9px] px-1 py-0 ml-1">
                    {pendingVideoShots.length}
                    {t2vShots.length > 0 && ` (文${t2vShots.length}+图${i2vShots.length})`}
                  </Badge>
                </Button>
              )}
              {pendingImageShots.length > 0 && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleGenerateAllImages}
                    disabled={!!generatingShotImg || !!generatingVideo || isGridBusy}
                    className="amber-glow"
                  >
                    {generatingShotImg ? <Loader2 className="size-3.5 animate-spin" /> : <ImageIcon className="size-3.5" />}
                    生成全部图片
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setGridDialogOpen(true)}
                    disabled={!!generatingShotImg || !!generatingVideo || isGridBusy}
                    className="amber-glow"
                  >
                    {isGridBusy ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : gridState.isSplittingGrid ? (
                      <SplitSquareHorizontal className="size-3.5" />
                    ) : (
                      <Grid3X3 className="size-3.5" />
                    )}
                    宫格图生成
                    <Badge variant="secondary" className="text-[9px] px-1 py-0 ml-1">
                      {pendingImageShots.length}
                    </Badge>
                  </Button>
                </>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={handleGenerateStoryboard}
                disabled={aiLoading || isStoryboarding}
              >
                <RefreshCw className="size-3.5" />
                重新生成
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Split layout: storyboard list + detail panel */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Shot list */}
        <div className="w-full md:w-2/5 lg:w-1/3 border-r border-border/50 flex flex-col">
          <ScrollArea className="flex-1">
            <div className="p-3 space-y-1.5">
              {storyboards.map((sb) => (
                <button
                  key={sb.id}
                  onClick={() => setSelectedShotId(sb.id)}
                  className={`w-full text-left rounded-lg border transition-all duration-150 p-2.5 ${
                    selectedShotId === sb.id
                      ? 'border-primary/50 bg-primary/5'
                      : 'border-border/30 hover:border-border/60 hover:bg-muted/30'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {/* Shot number */}
                    <div className={`flex-shrink-0 size-7 rounded flex items-center justify-center text-xs font-bold ${
                      selectedShotId === sb.id
                        ? 'bg-primary text-primary-foreground'
                        : sb.firstFrameUrl
                          ? 'bg-emerald-500/20 text-emerald-500'
                          : 'bg-muted text-muted-foreground'
                    }`}>
                      {sb.firstFrameUrl && selectedShotId !== sb.id ? (
                        <Check className="size-3.5" />
                      ) : (
                        String(sb.shotNumber).padStart(2, '0')
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-semibold truncate">{sb.title}</span>
                        <Badge variant="secondary" className="text-[9px] px-1 py-0">
                          {shotTypeLabel(sb.shotType)}
                        </Badge>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">{sb.action}</p>
                      {/* Mini status */}
                      <div className="flex items-center gap-1 mt-1">
                        {sb.firstFrameUrl && <Check className="size-2.5 text-emerald-500" />}
                        {sb.videoUrl && <Video className="size-2.5 text-emerald-500" />}
                        {sb.ttsAudioUrl && <Mic className="size-2.5 text-emerald-500" />}
                        {sb.dialogue && (
                          <span className="text-[9px] text-muted-foreground truncate ml-1">
                            💬 {sb.dialogue.slice(0, 20)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* Right: Detail panel */}
        <div className="hidden md:flex md:w-3/5 lg:w-2/3 flex-col">
          {selectedShot ? (
            <ScrollArea className="flex-1">
              <div className="p-5 space-y-4">
                {/* Shot header */}
                <div className="flex items-center gap-3 mb-4">
                  <div className="size-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <span className="text-sm font-bold text-primary">
                      {String(selectedShot.shotNumber).padStart(2, '0')}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-semibold">{selectedShot.title}</h3>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        {shotTypeLabel(selectedShot.shotType)}
                      </Badge>
                      {selectedShot.cameraAngle && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          {cameraAngleLabel(selectedShot.cameraAngle)}
                        </Badge>
                      )}
                      {selectedShot.cameraMovement && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          {cameraMovementLabel(selectedShot.cameraMovement)}
                        </Badge>
                      )}
                      <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Clock className="size-2.5" />
                        {selectedShot.duration}s
                      </span>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleEnhanceShotPrompt(selectedShot)}
                    disabled={aiLoading}
                    className="gap-1 text-xs"
                  >
                    <Wand2 className="size-3" />
                    AI增强
                  </Button>
                </div>

                {/* Media preview */}
                {(selectedShot.videoUrl || selectedShot.firstFrameUrl) && (
                  <div className="relative rounded-lg overflow-hidden border border-border/50 max-w-lg">
                    {selectedShot.videoUrl ? (
                      <video
                        src={selectedShot.videoUrl}
                        controls
                        className="w-full aspect-video object-cover"
                        poster={selectedShot.firstFrameUrl ?? undefined}
                      />
                    ) : (
                      <img
                        src={selectedShot.firstFrameUrl!}
                        alt={`镜头 ${selectedShot.shotNumber}`}
                        className="w-full aspect-video object-cover"
                      />
                    )}
                    {(generatingShotImg === selectedShot.id || generatingVideo === selectedShot.id) && (
                      <div className="absolute inset-0 bg-background/60 flex items-center justify-center">
                        <Loader2 className="size-6 text-primary animate-spin" />
                      </div>
                    )}
                  </div>
                )}

                {/* Section 1: Shot Structure — show only in storyboard mode */}
                {stepConfig.focusOnGeneration && (
                  <DetailSection title="镜头结构" icon={<Film className="size-3 text-primary" />}>
                    <div className="grid grid-cols-2 gap-3">
                      <InlineField
                        label="标题"
                        value={selectedShot.title}
                        onSave={(v) => handleUpdateStoryboard(selectedShot.id, { title: v })}
                        copiedField={copiedField}
                        fieldId={`sb-title-${selectedShot.id}`}
                        onCopy={handleCopy}
                        placeholder="镜头标题"
                      />
                      <InlineField
                        label="景别"
                        value={shotTypeLabel(selectedShot.shotType)}
                        onSave={(v) => handleUpdateStoryboard(selectedShot.id, { shotType: v })}
                        copiedField={copiedField}
                        fieldId={`sb-shottype-${selectedShot.id}`}
                        onCopy={handleCopy}
                        placeholder="medium"
                      />
                      <InlineField
                        label="角度"
                        value={cameraAngleLabel(selectedShot.cameraAngle)}
                        onSave={(v) => handleUpdateStoryboard(selectedShot.id, { cameraAngle: v })}
                        copiedField={copiedField}
                        fieldId={`sb-angle-${selectedShot.id}`}
                        onCopy={handleCopy}
                        placeholder="eye-level"
                      />
                      <InlineField
                        label="运镜"
                        value={cameraMovementLabel(selectedShot.cameraMovement)}
                        onSave={(v) => handleUpdateStoryboard(selectedShot.id, { cameraMovement: v })}
                        copiedField={copiedField}
                        fieldId={`sb-movement-${selectedShot.id}`}
                        onCopy={handleCopy}
                        placeholder="static"
                      />
                      <InlineField
                        label="时长 (秒)"
                        value={String(selectedShot.duration)}
                        onSave={(v) => handleUpdateStoryboard(selectedShot.id, { duration: parseFloat(v) || 3 })}
                        copiedField={copiedField}
                        fieldId={`sb-duration-${selectedShot.id}`}
                        onCopy={handleCopy}
                        placeholder="3"
                      />
                    </div>
                  </DetailSection>
                )}

                {/* Section 2: Visual Semantics — show only in storyboard mode */}
                {stepConfig.focusOnGeneration && (
                  <DetailSection title="视觉语义" icon={<Camera className="size-3 text-primary" />}>
                    <div className="space-y-3">
                      <InlineField
                        label="动作描述"
                        value={selectedShot.action}
                        onSave={(v) => handleUpdateStoryboard(selectedShot.id, { action: v })}
                        copiedField={copiedField}
                        fieldId={`sb-action-${selectedShot.id}`}
                        onCopy={handleCopy}
                        multiline
                        placeholder="描述画面中的动作..."
                      />
                      <InlineField
                        label="描述"
                        value={selectedShot.description}
                        onSave={(v) => handleUpdateStoryboard(selectedShot.id, { description: v })}
                        copiedField={copiedField}
                        fieldId={`sb-desc-${selectedShot.id}`}
                        onCopy={handleCopy}
                        multiline
                        placeholder="详细的视觉描述..."
                      />
                      <InlineField
                        label="氛围"
                        value={selectedShot.atmosphere}
                        onSave={(v) => handleUpdateStoryboard(selectedShot.id, { atmosphere: v })}
                        copiedField={copiedField}
                        fieldId={`sb-atmo-${selectedShot.id}`}
                        onCopy={handleCopy}
                        placeholder="紧张、温馨、悬疑..."
                      />
                      {selectedShot.dialogue && (
                        <InlineField
                          label={`对白${selectedShot.dialogueChar ? ` (${selectedShot.dialogueChar})` : ''}`}
                          value={selectedShot.dialogue}
                          onSave={(v) => handleUpdateStoryboard(selectedShot.id, { dialogue: v })}
                          copiedField={copiedField}
                          fieldId={`sb-dialogue-${selectedShot.id}`}
                          onCopy={handleCopy}
                          multiline
                          placeholder="对白内容..."
                        />
                      )}
                    </div>
                  </DetailSection>
                )}

                {/* Section 3: Generation Prompts — collapsed in shot_frames mode */}
                <DetailSection
                  title="生成提示词"
                  icon={<Sparkles className="size-3 text-primary" />}
                  defaultOpen={stepConfig.focusOnGeneration}
                >
                  <div className="space-y-3">
                    <InlineField
                      label="图片提示词 (Image Prompt)"
                      value={selectedShot.imagePrompt}
                      onSave={(v) => handleUpdateStoryboard(selectedShot.id, { imagePrompt: v })}
                      copiedField={copiedField}
                      fieldId={`sb-imgprompt-${selectedShot.id}`}
                      onCopy={handleCopy}
                      multiline
                      placeholder="用于首帧图片生成的英文提示词..."
                    />
                    <InlineField
                      label="视频提示词 (Video Prompt)"
                      value={selectedShot.videoPrompt}
                      onSave={(v) => handleUpdateStoryboard(selectedShot.id, { videoPrompt: v })}
                      copiedField={copiedField}
                      fieldId={`sb-vidprompt-${selectedShot.id}`}
                      onCopy={handleCopy}
                      multiline
                      placeholder="描述镜头运动和角色动作变化..."
                    />
                    <InlineField
                      label="背景音乐提示 (BGM Prompt)"
                      value={selectedShot.bgmPrompt}
                      onSave={(v) => handleUpdateStoryboard(selectedShot.id, { bgmPrompt: v })}
                      copiedField={copiedField}
                      fieldId={`sb-bgm-${selectedShot.id}`}
                      onCopy={handleCopy}
                      placeholder="描述场景的背景音乐风格..."
                    />
                    <InlineField
                      label="音效描述 (Sound Effect)"
                      value={selectedShot.soundEffect}
                      onSave={(v) => handleUpdateStoryboard(selectedShot.id, { soundEffect: v })}
                      copiedField={copiedField}
                      fieldId={`sb-sfx-${selectedShot.id}`}
                      onCopy={handleCopy}
                      placeholder="描述场景中的音效..."
                    />
                  </div>
                </DetailSection>

                {/* Section 4: Frame Images — always open, larger in shot_frames mode */}
                <DetailSection title="帧图片" icon={<Layers className="size-3 text-primary" />} defaultOpen={true}>
                  <div className={`grid gap-4 ${stepConfig.focusOnImages ? 'grid-cols-1' : 'grid-cols-2'}`}>
                    {/* First Frame */}
                    <div className="space-y-2">
                      <label className="text-[10px] font-medium text-muted-foreground">首帧 (First Frame)</label>
                      {selectedShot.firstFrameUrl ? (
                        <div className="relative rounded-lg overflow-hidden border border-border/50">
                          <img
                            src={selectedShot.firstFrameUrl}
                            alt="首帧"
                            className={`w-full object-cover ${stepConfig.focusOnImages ? 'max-h-80' : 'aspect-video'}`}
                          />
                        </div>
                      ) : (
                        <div className={`rounded-lg bg-muted/50 border border-dashed border-border/50 flex items-center justify-center ${stepConfig.focusOnImages ? 'aspect-video' : 'aspect-video'}`}>
                          <div className="text-center">
                            <Camera className="size-5 text-muted-foreground/30 mx-auto mb-1" />
                            <p className="text-[10px] text-muted-foreground/50">暂无首帧</p>
                          </div>
                        </div>
                      )}
                      <div className="flex items-center gap-1">
                        {selectedShot.imagePrompt && (
                          <Button
                            size="sm"
                            variant={stepConfig.focusOnImages ? 'default' : 'secondary'}
                            onClick={() => handleGenerateShotImage(selectedShot)}
                            disabled={generatingShotImg === selectedShot.id}
                            className={`gap-1 ${stepConfig.focusOnImages ? 'amber-glow' : 'h-6 text-[10px] px-2'}`}
                          >
                            {generatingShotImg === selectedShot.id ? (
                              <Loader2 className="size-2.5 animate-spin" />
                            ) : (
                              <ImagePlus className="size-2.5" />
                            )}
                            {selectedShot.firstFrameUrl ? '重新生成' : '生成'}
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant={stepConfig.focusOnImages ? 'outline' : 'ghost'}
                          className={`gap-1 ${stepConfig.focusOnImages ? '' : 'h-6 text-[10px] px-2 text-muted-foreground'}`}
                          disabled={uploadingField === `sb-img-${selectedShot.id}`}
                          onClick={() => {
                            const input = document.getElementById(`upload-sb-img-${selectedShot.id}`) as HTMLInputElement
                            input?.click()
                          }}
                        >
                          {uploadingField === `sb-img-${selectedShot.id}` ? (
                            <Loader2 className="size-2.5 animate-spin" />
                          ) : (
                            <Upload className="size-2.5" />
                          )}
                          上传
                        </Button>
                      </div>
                    </div>

                    {/* Last Frame */}
                    <div className="space-y-2">
                      <label className="text-[10px] font-medium text-muted-foreground">末帧 (Last Frame)</label>
                      {selectedShot.lastFrameUrl ? (
                        <div className="relative rounded-lg overflow-hidden border border-border/50">
                          <img
                            src={selectedShot.lastFrameUrl}
                            alt="末帧"
                            className="w-full aspect-video object-cover"
                          />
                        </div>
                      ) : (
                        <div className="aspect-video rounded-lg bg-muted/50 border border-dashed border-border/50 flex items-center justify-center">
                          <div className="text-center">
                            <ImageIcon className="size-5 text-muted-foreground/30 mx-auto mb-1" />
                            <p className="text-[10px] text-muted-foreground/50">暂无末帧</p>
                          </div>
                        </div>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 text-[10px] px-2 gap-1 text-muted-foreground"
                        disabled={uploadingField === `sb-lastframe-${selectedShot.id}`}
                        onClick={() => {
                          const input = document.getElementById(`upload-sb-lastframe-${selectedShot.id}`) as HTMLInputElement
                          input?.click()
                        }}
                      >
                        {uploadingField === `sb-lastframe-${selectedShot.id}` ? (
                          <Loader2 className="size-2.5 animate-spin" />
                        ) : (
                          <Upload className="size-2.5" />
                        )}
                        上传
                      </Button>
                    </div>
                  </div>

                  {/* Reference Images */}
                  <div className="mt-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-medium text-muted-foreground flex items-center gap-1">
                        <Bookmark className="size-3" />
                        参考图 (Reference Images)
                      </label>
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-5 text-[9px] px-1.5 gap-0.5 text-muted-foreground"
                          onClick={() => {
                            const input = document.getElementById(`upload-sb-ref-${selectedShot.id}`) as HTMLInputElement
                            input?.click()
                          }}
                        >
                          <Plus className="size-2.5" /> 添加
                        </Button>
                        {(() => {
                          try {
                            const refs = selectedShot.referenceImages ? JSON.parse(selectedShot.referenceImages) : []
                            return Array.isArray(refs) && refs.length > 0 ? (
                              <span className="text-[9px] text-muted-foreground">{refs.length}张</span>
                            ) : null
                          } catch { return null }
                        })()}
                      </div>
                    </div>
                    {(() => {
                      try {
                        const refs = selectedShot.referenceImages ? JSON.parse(selectedShot.referenceImages) : []
                        if (!Array.isArray(refs) || refs.length === 0) {
                          return (
                            <div className="rounded-lg bg-muted/30 border border-dashed border-border/40 px-3 py-2">
                              <p className="text-[10px] text-muted-foreground/60 text-center">
                                参考图可用于保持角色/场景风格一致性
                              </p>
                            </div>
                          )
                        }
                        return (
                          <div className="grid grid-cols-3 gap-2">
                            {refs.map((url: string, idx: number) => (
                              <div key={idx} className="relative group rounded-md overflow-hidden border border-border/50">
                                <img
                                  src={url}
                                  alt={`参考图 ${idx + 1}`}
                                  className="w-full aspect-video object-cover"
                                />
                                <button
                                  className="absolute top-0.5 right-0.5 size-4 rounded-full bg-destructive/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                  onClick={() => {
                                    const newRefs = refs.filter((_: string, i: number) => i !== idx)
                                    handleUpdateStoryboard(selectedShot.id, { referenceImages: JSON.stringify(newRefs) })
                                  }}
                                  title="移除"
                                >
                                  <Trash2 className="size-2" />
                                </button>
                                <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[8px] text-center py-0.5">
                                  参考 {idx + 1}
                                </div>
                              </div>
                            ))}
                          </div>
                        )
                      } catch {
                        return null
                      }
                    })()}
                    <input
                      id={`upload-sb-ref-${selectedShot.id}`}
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        const files = e.target.files
                        if (!files || files.length === 0) return
                        const existingRefs = (() => {
                          try {
                            const parsed = selectedShot.referenceImages ? JSON.parse(selectedShot.referenceImages) : []
                            return Array.isArray(parsed) ? parsed : []
                          } catch { return [] }
                        })() as string[]
                        const readPromises = Array.from(files).map(
                          (file) =>
                            new Promise<string>((resolve) => {
                              const reader = new FileReader()
                              reader.onload = () => resolve(reader.result as string)
                              reader.readAsDataURL(file)
                            })
                        )
                        Promise.all(readPromises).then((dataUrls) => {
                          const newRefs = [...existingRefs, ...dataUrls]
                          handleUpdateStoryboard(selectedShot.id, { referenceImages: JSON.stringify(newRefs) })
                        })
                        e.target.value = ''
                      }}
                    />
                  </div>

                  {/* TTS Audio */}
                  {selectedShot.ttsAudioUrl && (
                    <div className="mt-3 flex items-center gap-2">
                      <Volume2 className="size-3 text-primary/70 flex-shrink-0" />
                      <audio
                        src={selectedShot.ttsAudioUrl}
                        controls
                        className="h-6 flex-1 [&::-webkit-media-controls-panel]:bg-muted/50"
                        style={{ minWidth: 0 }}
                      />
                    </div>
                  )}

                  {/* Action buttons — show only relevant ones per step */}
                  <div className="mt-3 flex items-center gap-1.5 flex-wrap">
                    {stepConfig.focusOnGeneration && !selectedShot.videoUrl && (selectedShot.videoPrompt || selectedShot.imagePrompt) && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleGenerateVideo(selectedShot)}
                        disabled={generatingVideo === selectedShot.id}
                        className="h-7 text-[11px] px-2.5 amber-glow"
                      >
                        {generatingVideo === selectedShot.id ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <Video className="size-3" />
                        )}
                        {selectedShot.firstFrameUrl ? '图生视频' : '文生视频'}
                      </Button>
                    )}
                    {stepConfig.focusOnGeneration && selectedShot.dialogue && !selectedShot.ttsAudioUrl && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleGenerateTts(selectedShot)}
                        disabled={generatingTts === selectedShot.id}
                        className="h-7 text-[11px] px-2.5"
                      >
                        {generatingTts === selectedShot.id ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <Mic className="size-3" />
                        )}
                        生成配音
                      </Button>
                    )}
                  </div>
                </DetailSection>

                {/* Hidden file inputs */}
                <input
                  id={`upload-sb-img-${selectedShot.id}`}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) handleUpload(file, { storyboardId: selectedShot.id, fieldType: 'firstFrameUrl' }, `sb-img-${selectedShot.id}`)
                    e.target.value = ''
                  }}
                />
                <input
                  id={`upload-sb-lastframe-${selectedShot.id}`}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) handleUpload(file, { storyboardId: selectedShot.id, fieldType: 'lastFrameUrl' }, `sb-lastframe-${selectedShot.id}`)
                    e.target.value = ''
                  }}
                />
                <input
                  id={`upload-sb-vid-${selectedShot.id}`}
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) handleUpload(file, { storyboardId: selectedShot.id, fieldType: 'videoUrl' }, `sb-vid-${selectedShot.id}`)
                    e.target.value = ''
                  }}
                />
              </div>
            </ScrollArea>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <Film className="size-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">选择一个镜头查看详情</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Grid Configuration Dialog */}
      <Dialog open={gridDialogOpen} onOpenChange={setGridDialogOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Grid3X3 className="size-5 text-primary" />
              宫格图批量生成
            </DialogTitle>
            <DialogDescription>
              一次性生成多张镜头首帧，通过宫格图方式大幅提升效率
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Grid Mode Selector */}
            <div className="space-y-2">
              <Label className="text-xs font-medium">生成模式</Label>
              <Select value={gridMode} onValueChange={(v) => setGridMode(v as GridMode)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GRID_MODE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      <div className="flex flex-col">
                        <span className="text-sm">{opt.label}</span>
                        <span className="text-[10px] text-muted-foreground">{opt.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground">
                {GRID_MODE_OPTIONS.find((o) => o.value === gridMode)?.description}
              </p>
            </div>

            {/* Grid Size Selector */}
            <div className="space-y-2">
              <Label className="text-xs font-medium">宫格尺寸</Label>
              <Select value={gridSize} onValueChange={setGridSize}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GRID_SIZE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Summary */}
            <div className="rounded-lg bg-muted/50 border border-border/50 p-3 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">宫格容量</span>
                <span className="font-medium">{gridTotalCells} 张</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">待生成镜头</span>
                <span className="font-medium">{pendingImageShots.length} 个</span>
              </div>
              <Separator />
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">本次生成</span>
                <span className="font-semibold text-primary">
                  {Math.min(gridShotsToUse.length, gridTotalCells)} 张图片一次性
                </span>
              </div>
              <div className="flex items-center gap-1.5 mt-1">
                <Grid3X3 className="size-3 text-emerald-500" />
                <span className="text-[10px] text-emerald-600 font-medium">
                  效率提升3-5倍 · 一次API调用生成全部
                </span>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setGridDialogOpen(false)}
              className="text-xs"
            >
              取消
            </Button>
            <Button
              size="sm"
              onClick={handleStartGridGeneration}
              disabled={gridShotsToUse.length === 0 || isGridBusy}
              className="amber-glow text-xs"
            >
              {isGridBusy ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Grid3X3 className="size-3.5" />
              )}
              开始生成
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
