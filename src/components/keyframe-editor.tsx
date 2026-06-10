'use client'

import { useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  X,
  Loader2,
  Sparkles,
  Upload,
  Check,
  Image as ImageIcon,
  Film,
  Grid as GridIcon,
  Video,
  Edit3,
  CheckCircle2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import type { Storyboard, GenerationMode } from '@/lib/store'
import {
  determineGenerationMode,
  getGenerationModeLabel,
  getGenerationModeColor,
  getKeyframeStatus,
} from '@/lib/creative/keyframe-service'

interface KeyframeEditorProps {
  storyboard: Storyboard | null
  open: boolean
  onOpenChange: (open: boolean) => void
  aiLoading: boolean
  generatingKeyframe: string | null
  onGenerateKeyframe: (storyboardId: string, mode: GenerationMode) => Promise<void>
  onUpdateStoryboard: (id: string, data: Partial<Storyboard>) => Promise<void>
  onUpload: (file: File, options: { storyboardId: string; fieldType: string }, fieldKey: string) => Promise<void>
}

export function KeyframeEditor({
  storyboard,
  open,
  onOpenChange,
  aiLoading,
  generatingKeyframe,
  onGenerateKeyframe,
  onUpdateStoryboard,
  onUpload,
}: KeyframeEditorProps) {
  const [editingPrompt, setEditingPrompt] = useState(false)
  const [promptValue, setPromptValue] = useState('')

  if (!storyboard) return null

  const currentMode = storyboard.generationMode ?? determineGenerationMode(storyboard)
  const modeLabel = getGenerationModeLabel(currentMode)
  const modeColor = getGenerationModeColor(currentMode)
  const isGenerating = generatingKeyframe === storyboard.id
  const status = getKeyframeStatus(storyboard)

  // Parse candidates
  let candidateUrls: string[] = []
  if (storyboard.candidateUrls) {
    try {
      candidateUrls = JSON.parse(storyboard.candidateUrls)
    } catch { /* ignore */ }
  }

  // Parse grid layout
  let gridLayout: { rows: number; cols: number; mode?: string } | null = null
  if (storyboard.gridLayout) {
    try {
      gridLayout = JSON.parse(storyboard.gridLayout)
    } catch { /* ignore */ }
  }

  const handleModeChange = (newMode: GenerationMode) => {
    onUpdateStoryboard(storyboard.id, { generationMode: newMode })
  }

  const handlePromptSave = () => {
    onUpdateStoryboard(storyboard.id, { imagePrompt: promptValue })
    setEditingPrompt(false)
  }

  const handleSelectCandidate = (index: number) => {
    onUpdateStoryboard(storyboard.id, {
      selectedCandidateIndex: index,
      firstFrameUrl: candidateUrls[index],
      startFrameImageUrl: candidateUrls[index],
    })
  }

  const handleGenerateWithMode = () => {
    onGenerateKeyframe(storyboard.id, currentMode)
  }

  const handleUploadFrame = (fieldType: string, fieldKey: string) => {
    const input = document.getElementById(`kf-upload-${fieldKey}`) as HTMLInputElement
    input?.click()
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[480px] sm:max-w-[480px] p-0 flex flex-col">
        <SheetHeader className="px-6 py-4 border-b">
          <SheetTitle className="flex items-center gap-2">
            <Film className="size-5 text-primary" />
            关键帧编辑器
            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 gap-1 ${modeColor}`}>
              {modeLabel}
            </Badge>
          </SheetTitle>
          <SheetDescription>
            镜头 #{String(storyboard.shotNumber).padStart(2, '0')} — {storyboard.title}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1">
          <div className="p-6 space-y-6">
            {/* Generation mode selector */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">生成模式</label>
              <div className="flex items-center gap-2">
                <Select
                  value={currentMode}
                  onValueChange={(val) => handleModeChange(val as GenerationMode)}
                >
                  <SelectTrigger className="h-8 text-xs">
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
                {storyboard.generationMode === null && (
                  <span className="text-[10px] text-muted-foreground italic">
                    系统自动选择
                  </span>
                )}
              </div>
            </div>

            {/* Frame cards based on mode */}
            <div className="space-y-4">
              {/* First Frame Card */}
              {(currentMode === 'image2video' || currentMode === 'first_last') && (
                <Card className="border-border/50 py-0 gap-0">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <ImageIcon className="size-4 text-blue-500" />
                        <span className="text-xs font-medium">首帧图</span>
                        {storyboard.firstFrameUrl && (
                          <CheckCircle2 className="size-3.5 text-emerald-500" />
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-[10px] px-2"
                          onClick={handleGenerateWithMode}
                          disabled={isGenerating || aiLoading}
                        >
                          {isGenerating ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
                          生成
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-[10px] px-2"
                          onClick={() => handleUploadFrame('firstFrameUrl', 'first')}
                          disabled={aiLoading}
                        >
                          <Upload className="size-3" />
                          上传
                        </Button>
                        <input
                          id="kf-upload-first"
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0]
                            if (file) onUpload(file, { storyboardId: storyboard.id, fieldType: 'firstFrameUrl' }, 'kf-first')
                            e.target.value = ''
                          }}
                        />
                      </div>
                    </div>
                    {storyboard.firstFrameUrl ? (
                      <div className="rounded-lg overflow-hidden border border-border/50">
                        <img
                          src={storyboard.firstFrameUrl}
                          alt="首帧"
                          className="w-full h-40 object-cover"
                        />
                      </div>
                    ) : (
                      <div className="h-40 rounded-lg bg-muted/50 border border-dashed border-border/50 flex items-center justify-center">
                        <div className="text-center">
                          <ImageIcon className="size-6 text-muted-foreground/30 mx-auto mb-1" />
                          <p className="text-[10px] text-muted-foreground/50">未生成首帧</p>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Last Frame Card */}
              {currentMode === 'first_last' && (
                <Card className="border-border/50 py-0 gap-0">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Film className="size-4 text-purple-500" />
                        <span className="text-xs font-medium">尾帧图</span>
                        {storyboard.lastFrameUrl && (
                          <CheckCircle2 className="size-3.5 text-emerald-500" />
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-[10px] px-2"
                          onClick={handleGenerateWithMode}
                          disabled={isGenerating || aiLoading}
                        >
                          {isGenerating ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
                          生成
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-[10px] px-2"
                          onClick={() => handleUploadFrame('lastFrameUrl', 'last')}
                          disabled={aiLoading}
                        >
                          <Upload className="size-3" />
                          上传
                        </Button>
                        <input
                          id="kf-upload-last"
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0]
                            if (file) onUpload(file, { storyboardId: storyboard.id, fieldType: 'lastFrameUrl' }, 'kf-last')
                            e.target.value = ''
                          }}
                        />
                      </div>
                    </div>
                    {storyboard.lastFrameUrl ? (
                      <div className="rounded-lg overflow-hidden border border-border/50">
                        <img
                          src={storyboard.lastFrameUrl}
                          alt="尾帧"
                          className="w-full h-40 object-cover"
                        />
                      </div>
                    ) : (
                      <div className="h-40 rounded-lg bg-muted/50 border border-dashed border-border/50 flex items-center justify-center">
                        <div className="text-center">
                          <Film className="size-6 text-muted-foreground/30 mx-auto mb-1" />
                          <p className="text-[10px] text-muted-foreground/50">未生成尾帧</p>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Grid Image Card */}
              {currentMode === 'grid' && (
                <Card className="border-border/50 py-0 gap-0">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <GridIcon className="size-4 text-amber-500" />
                        <span className="text-xs font-medium">宫格图</span>
                        {gridLayout && (
                          <Badge variant="outline" className="text-[10px] px-1 py-0">
                            {gridLayout.rows}x{gridLayout.cols}
                          </Badge>
                        )}
                        {storyboard.gridImageUrl && (
                          <CheckCircle2 className="size-3.5 text-emerald-500" />
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-[10px] px-2"
                          onClick={handleGenerateWithMode}
                          disabled={isGenerating || aiLoading}
                        >
                          {isGenerating ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
                          生成
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-[10px] px-2"
                          onClick={() => handleUploadFrame('gridImageUrl', 'grid')}
                          disabled={aiLoading}
                        >
                          <Upload className="size-3" />
                          上传
                        </Button>
                        <input
                          id="kf-upload-grid"
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0]
                            if (file) onUpload(file, { storyboardId: storyboard.id, fieldType: 'gridImageUrl' }, 'kf-grid')
                            e.target.value = ''
                          }}
                        />
                      </div>
                    </div>
                    {storyboard.gridImageUrl ? (
                      <div className="rounded-lg overflow-hidden border border-border/50">
                        <img
                          src={storyboard.gridImageUrl}
                          alt="宫格图"
                          className="w-full h-48 object-cover"
                        />
                      </div>
                    ) : (
                      <div className="h-48 rounded-lg bg-muted/50 border border-dashed border-border/50 flex items-center justify-center">
                        <div className="text-center">
                          <GridIcon className="size-8 text-muted-foreground/30 mx-auto mb-1" />
                          <p className="text-[10px] text-muted-foreground/50">未生成宫格图</p>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Reference Video Card */}
              {currentMode === 'reference_video' && (
                <Card className="border-border/50 py-0 gap-0">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Video className="size-4 text-emerald-500" />
                        <span className="text-xs font-medium">参考视频</span>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-[10px] px-2"
                        onClick={() => handleUploadFrame('videoUrl', 'ref-video')}
                        disabled={aiLoading}
                      >
                        <Upload className="size-3" />
                        上传参考视频
                      </Button>
                      <input
                        id="kf-upload-ref-video"
                        type="file"
                        accept="video/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (file) onUpload(file, { storyboardId: storyboard.id, fieldType: 'videoUrl' }, 'kf-ref-video')
                          e.target.value = ''
                        }}
                      />
                    </div>
                    {storyboard.videoUrl ? (
                      <div className="rounded-lg overflow-hidden border border-border/50">
                        <video
                          src={storyboard.videoUrl}
                          controls
                          className="w-full h-40 object-cover"
                        />
                      </div>
                    ) : (
                      <div className="h-40 rounded-lg bg-muted/50 border border-dashed border-border/50 flex items-center justify-center">
                        <div className="text-center">
                          <Video className="size-8 text-muted-foreground/30 mx-auto mb-1" />
                          <p className="text-[10px] text-muted-foreground/50">请上传参考视频</p>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Inline prompt editing */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground">图片提示词</label>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 text-[10px] px-2"
                  onClick={() => {
                    setPromptValue(storyboard.imagePrompt ?? '')
                    setEditingPrompt(!editingPrompt)
                  }}
                >
                  <Edit3 className="size-3" />
                  {editingPrompt ? '取消' : '编辑'}
                </Button>
              </div>
              {editingPrompt ? (
                <div className="space-y-2">
                  <Textarea
                    value={promptValue}
                    onChange={(e) => setPromptValue(e.target.value)}
                    className="min-h-[80px] text-xs"
                    placeholder="输入图片提示词..."
                  />
                  <Button
                    size="sm"
                    onClick={handlePromptSave}
                    className="h-7 text-[11px]"
                  >
                    保存提示词
                  </Button>
                </div>
              ) : (
                <p className="text-[11px] text-muted-foreground bg-muted/30 rounded p-2 line-clamp-4 font-mono">
                  {storyboard.imagePrompt || '暂无提示词'}
                </p>
              )}
            </div>

            {/* Candidate gallery */}
            {candidateUrls.length > 0 && (
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">
                  候选图片 ({candidateUrls.length})
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {candidateUrls.map((url, index) => (
                    <button
                      key={index}
                      onClick={() => handleSelectCandidate(index)}
                      className={`relative rounded-lg overflow-hidden border-2 transition-colors ${
                        storyboard.selectedCandidateIndex === index
                          ? 'border-primary ring-2 ring-primary/20'
                          : 'border-border/50 hover:border-primary/50'
                      }`}
                    >
                      <img
                        src={url}
                        alt={`候选 ${index + 1}`}
                        className="w-full h-24 object-cover"
                      />
                      {storyboard.selectedCandidateIndex === index && (
                        <div className="absolute top-1 right-1">
                          <CheckCircle2 className="size-4 text-primary" />
                        </div>
                      )}
                      <div className="absolute bottom-1 left-1">
                        <Badge
                          variant="secondary"
                          className="text-[9px] px-1 py-0"
                        >
                          #{index + 1}
                        </Badge>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Reference image upload */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">参考图</label>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-[10px] px-2"
                onClick={() => {
                  const input = document.getElementById('kf-upload-ref-img') as HTMLInputElement
                  input?.click()
                }}
                disabled={aiLoading}
              >
                <Upload className="size-3" />
                上传参考图
              </Button>
              <input
                id="kf-upload-ref-img"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) onUpload(file, { storyboardId: storyboard.id, fieldType: 'referenceImages' }, 'kf-ref-img')
                  e.target.value = ''
                }}
              />
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}
