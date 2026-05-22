'use client'

import { motion } from 'framer-motion'
import {
  Loader2,
  Image as ImageIcon,
  Upload,
  Copy,
  Check,
  Sparkles,
  Info,
  Film,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Progress } from '@/components/ui/progress'
import { panelVariants, shotTypeLabel } from './helpers'
import type { ShotFramesPanelProps } from './types'

export function ShotFramesPanel({
  storyboards,
  characters,
  scenes,
  aiLoading,
  generatingShotImg,
  batchProgress,
  uploadingField,
  copiedField,
  handleGenerateShotImage,
  handleGenerateAllImages,
  handleUpload,
  handleCopy,
}: ShotFramesPanelProps) {
  const shotsWithFirstFrame = storyboards.filter((sb) => sb.firstFrameUrl).length
  const shotsWithLastFrame = storyboards.filter((sb) => sb.lastFrameUrl).length
  const pendingShots = storyboards.filter((sb) => !sb.firstFrameUrl)
  const progressPercent = storyboards.length > 0
    ? Math.round(((shotsWithFirstFrame + shotsWithLastFrame) / (storyboards.length * 2)) * 100)
    : 0

  // Count available references
  const charImagesAvailable = characters.filter((c) => c.imageUrl).length
  const sceneImagesAvailable = scenes.filter((s) => s.imageUrl).length

  // Empty state
  if (storyboards.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center max-w-md"
        >
          <div className="mx-auto size-16 rounded-full bg-primary/10 flex items-center justify-center mb-5">
            <Film className="size-8 text-primary" />
          </div>
          <h2 className="text-lg font-semibold mb-2">镜头图片</h2>
          <p className="text-sm text-muted-foreground">
            请先在剧本阶段生成分镜，然后在此生成或上传镜头的首帧和尾帧图片
          </p>
        </motion.div>
      </div>
    )
  }

  return (
    <motion.div
      variants={panelVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="flex flex-col h-full"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border/50 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono text-primary/80">09</span>
          <div>
            <h2 className="text-sm font-semibold">镜头图片</h2>
            <p className="text-[10px] text-muted-foreground">
              生成或上传首帧/尾帧 · 首帧 {shotsWithFirstFrame}/{storyboards.length} · 尾帧 {shotsWithLastFrame}/{storyboards.length}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {batchProgress && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" />
              <span>{batchProgress.message}</span>
              <Progress value={(batchProgress.current / batchProgress.total) * 100} className="h-1.5 w-20" />
            </div>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={handleGenerateAllImages}
            disabled={aiLoading || !!generatingShotImg || pendingShots.length === 0}
          >
            {generatingShotImg ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
            批量生成全部帧图
            {pendingShots.length > 0 && (
              <Badge variant="secondary" className="text-[9px] px-1 py-0 ml-1">{pendingShots.length}</Badge>
            )}
          </Button>
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-6 space-y-4">
          {/* Progress bar */}
          <div className="flex items-center gap-3">
            <Progress value={progressPercent} className="h-2 flex-1" />
            <span className="text-xs text-muted-foreground whitespace-nowrap">{progressPercent}%</span>
          </div>

          {/* Reference info */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/30 rounded-md px-3 py-2">
            <Info className="size-3.5 flex-shrink-0" />
            <span>
              首帧图将使用角色形象（{charImagesAvailable} 个可用）和场景图片（{sceneImagesAvailable} 个可用）作为参考图
            </span>
          </div>

          {/* Storyboard list */}
          <div className="space-y-3">
            {storyboards.map((sb) => {
              const isGenerating = generatingShotImg === sb.id
              const isFirstFrameUploading = uploadingField === `frame-first-${sb.id}`
              const isLastFrameUploading = uploadingField === `frame-last-${sb.id}`
              const hasFirstFrame = !!sb.firstFrameUrl
              const hasLastFrame = !!sb.lastFrameUrl
              const promptCopyId = `shot-prompt-${sb.id}`

              return (
                <Card key={sb.id} className={`border-border/50 py-0 gap-0 ${hasFirstFrame ? 'ring-1 ring-emerald-500/20' : ''}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      {/* Shot number */}
                      <div className="flex-shrink-0 w-10 text-center">
                        <span className="text-sm font-bold text-primary">
                          #{String(sb.shotNumber).padStart(2, '0')}
                        </span>
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        {/* Title + shot type */}
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="text-xs font-medium truncate">{sb.title}</span>
                          {sb.shotType && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                              {shotTypeLabel(sb.shotType)}
                            </Badge>
                          )}
                          {hasFirstFrame && hasLastFrame && (
                            <Badge className="status-completed text-[9px] px-1.5 py-0">首尾帧完成</Badge>
                          )}
                          {hasFirstFrame && !hasLastFrame && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-emerald-600 border-emerald-200">
                              首帧完成
                            </Badge>
                          )}
                        </div>

                        {/* Image prompt with copy */}
                        {sb.imagePrompt && (
                          <div className="flex items-start gap-1 mb-3 bg-muted/30 rounded px-2 py-1.5">
                            <p className="text-[11px] text-muted-foreground line-clamp-3 flex-1 font-mono">{sb.imagePrompt}</p>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="size-6 p-0 flex-shrink-0"
                              onClick={() => handleCopy(sb.imagePrompt!, promptCopyId)}
                              title="复制图片提示词"
                            >
                              {copiedField === promptCopyId ? (
                                <Check className="size-3 text-emerald-500" />
                              ) : (
                                <Copy className="size-3" />
                              )}
                            </Button>
                          </div>
                        )}

                        {/* Frame slots */}
                        <div className="grid grid-cols-2 gap-3 mb-3">
                          {/* First frame */}
                          <div>
                            <div className="text-[10px] font-medium text-muted-foreground mb-1 flex items-center gap-1">
                              <ImageIcon className="size-2.5" /> 首帧
                            </div>
                            {hasFirstFrame ? (
                              <img
                                src={sb.firstFrameUrl!}
                                alt={`镜头${sb.shotNumber} 首帧`}
                                className="w-full h-24 rounded object-cover border border-border/50"
                              />
                            ) : (
                              <div className="w-full h-24 rounded bg-muted/50 flex items-center justify-center border border-dashed border-border/50">
                                <ImageIcon className="size-5 text-muted-foreground/30" />
                              </div>
                            )}
                          </div>

                          {/* Last frame */}
                          <div>
                            <div className="text-[10px] font-medium text-muted-foreground mb-1 flex items-center gap-1">
                              <ImageIcon className="size-2.5" /> 尾帧
                            </div>
                            {hasLastFrame ? (
                              <img
                                src={sb.lastFrameUrl!}
                                alt={`镜头${sb.shotNumber} 尾帧`}
                                className="w-full h-24 rounded object-cover border border-border/50"
                              />
                            ) : (
                              <div className="w-full h-24 rounded bg-muted/50 flex items-center justify-center border border-dashed border-border/50">
                                <ImageIcon className="size-5 text-muted-foreground/30" />
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-[10px] px-2"
                            onClick={() => handleGenerateShotImage(sb)}
                            disabled={isGenerating || aiLoading}
                          >
                            {isGenerating ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
                            AI生成首帧
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-[10px] px-2 text-muted-foreground hover:text-foreground"
                            disabled={isFirstFrameUploading}
                            onClick={() => {
                              const input = document.getElementById(`upload-first-${sb.id}`) as HTMLInputElement
                              input?.click()
                            }}
                          >
                            {isFirstFrameUploading ? <Loader2 className="size-3 animate-spin" /> : <Upload className="size-3" />}
                            上传首帧
                          </Button>
                          <input
                            id={`upload-first-${sb.id}`}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0]
                              if (file) handleUpload(file, { storyboardId: sb.id, fieldType: 'firstFrameUrl' }, `frame-first-${sb.id}`)
                              e.target.value = ''
                            }}
                          />

                          <div className="w-px h-4 bg-border/50 mx-0.5" />

                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-[10px] px-2"
                            onClick={() => handleGenerateShotImage(sb)}
                            disabled={isGenerating || aiLoading}
                          >
                            {isGenerating ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
                            AI生成尾帧
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-[10px] px-2 text-muted-foreground hover:text-foreground"
                            disabled={isLastFrameUploading}
                            onClick={() => {
                              const input = document.getElementById(`upload-last-${sb.id}`) as HTMLInputElement
                              input?.click()
                            }}
                          >
                            {isLastFrameUploading ? <Loader2 className="size-3 animate-spin" /> : <Upload className="size-3" />}
                            上传尾帧
                          </Button>
                          <input
                            id={`upload-last-${sb.id}`}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0]
                              if (file) handleUpload(file, { storyboardId: sb.id, fieldType: 'lastFrameUrl' }, `frame-last-${sb.id}`)
                              e.target.value = ''
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      </ScrollArea>
    </motion.div>
  )
}
