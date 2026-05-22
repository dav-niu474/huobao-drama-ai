'use client'

import { motion } from 'framer-motion'
import {
  Loader2,
  Video,
  Upload,
  Copy,
  Check,
  Sparkles,
  Film,
  Image as ImageIcon,
  Play,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Progress } from '@/components/ui/progress'
import { panelVariants, shotTypeLabel } from './helpers'
import type { VideoPanelProps } from './types'

export function VideoPanel({
  storyboards,
  aiLoading,
  generatingVideo,
  batchProgress,
  uploadingField,
  copiedField,
  handleGenerateVideo,
  handleGenerateAllVideos,
  handleUpload,
  handleCopy,
}: VideoPanelProps) {
  const shotsWithVideo = storyboards.filter((sb) => sb.videoUrl).length
  const pendingVideoShots = storyboards.filter((sb) => !sb.videoUrl && (sb.videoPrompt || sb.imagePrompt))
  const progressPercent = storyboards.length > 0
    ? Math.round((shotsWithVideo / storyboards.length) * 100)
    : 0

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
            <Video className="size-8 text-primary" />
          </div>
          <h2 className="text-lg font-semibold mb-2">视频生成</h2>
          <p className="text-sm text-muted-foreground">
            请先在剧本阶段生成分镜，然后在此生成或上传每个镜头的视频
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
          <span className="text-xs font-mono text-primary/80">10</span>
          <div>
            <h2 className="text-sm font-semibold">视频生成</h2>
            <p className="text-[10px] text-muted-foreground">
              生成或上传镜头视频 · {shotsWithVideo}/{storyboards.length} 已完成
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
          {pendingVideoShots.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleGenerateAllVideos}
              disabled={aiLoading || !!generatingVideo}
            >
              {generatingVideo ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
              批量生成全部视频
              <Badge variant="secondary" className="text-[9px] px-1 py-0 ml-1">{pendingVideoShots.length}</Badge>
            </Button>
          )}
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

          {/* Legend */}
          <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
            <div className="flex items-center gap-1">
              <div className="size-2 rounded-full bg-primary" />
              <span>图生视频 — 使用首帧图作为参考</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="size-2 rounded-full bg-amber-500" />
              <span>文生视频 — 仅使用文本提示词</span>
            </div>
          </div>

          {/* Storyboard list */}
          <div className="space-y-3">
            {storyboards.map((sb) => {
              const isGenerating = generatingVideo === sb.id
              const isUploading = uploadingField === `video-${sb.id}`
              const hasVideo = !!sb.videoUrl
              const hasFirstFrame = !!sb.firstFrameUrl
              const isImageToVideo = hasFirstFrame
              const modeLabel = isImageToVideo ? '图生视频' : '文生视频'
              const promptCopyId = `video-prompt-${sb.id}`

              return (
                <Card key={sb.id} className={`border-border/50 py-0 gap-0 ${hasVideo ? 'ring-1 ring-emerald-500/20' : ''}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      {/* Thumbnail / shot number */}
                      <div className="flex-shrink-0">
                        {sb.videoUrl ? (
                          <div className="relative w-28 h-16 rounded overflow-hidden border border-border/50">
                            <video
                              src={sb.videoUrl}
                              className="w-full h-full object-cover"
                              muted
                              onMouseEnter={(e) => (e.target as HTMLVideoElement).play().catch(() => {})}
                              onMouseLeave={(e) => { const v = e.target as HTMLVideoElement; v.pause(); v.currentTime = 0; }}
                              playsInline
                              loop
                              poster={sb.firstFrameUrl ?? undefined}
                            />
                            <div className="absolute top-1 left-1 bg-black/60 text-white text-[9px] font-mono px-1 rounded">
                              ✅
                            </div>
                          </div>
                        ) : sb.firstFrameUrl ? (
                          <div className="relative w-28 h-16 rounded overflow-hidden border border-border/50">
                            <img src={sb.firstFrameUrl} alt={`镜头${sb.shotNumber}`} className="w-full h-full object-cover" />
                            <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                              <Play className="size-3.5 text-white" />
                            </div>
                          </div>
                        ) : (
                          <div className="w-28 h-16 rounded bg-muted/50 flex items-center justify-center">
                            <span className="text-xs font-bold text-muted-foreground/50">
                              #{String(sb.shotNumber).padStart(2, '0')}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        {/* Title + mode indicator */}
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="text-xs font-bold text-primary">
                            #{String(sb.shotNumber).padStart(2, '0')}
                          </span>
                          <span className="text-xs font-medium truncate">{sb.title}</span>
                          <Badge
                            variant="outline"
                            className={`text-[10px] px-1.5 py-0 ${
                              isImageToVideo
                                ? 'text-primary border-primary/30'
                                : 'text-amber-600 border-amber-200'
                            }`}
                          >
                            {modeLabel}
                          </Badge>
                          {hasVideo && (
                            <Badge className="status-completed text-[9px] px-1.5 py-0">已完成</Badge>
                          )}
                          {isGenerating && (
                            <Loader2 className="size-3 text-primary animate-spin flex-shrink-0" />
                          )}
                        </div>

                        {/* Video prompt with copy */}
                        {sb.videoPrompt && (
                          <div className="flex items-start gap-1 mb-3 bg-muted/30 rounded px-2 py-1.5">
                            <p className="text-[11px] text-muted-foreground line-clamp-2 flex-1 font-mono">{sb.videoPrompt}</p>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="size-6 p-0 flex-shrink-0"
                              onClick={() => handleCopy(sb.videoPrompt!, promptCopyId)}
                              title="复制视频提示词"
                            >
                              {copiedField === promptCopyId ? (
                                <Check className="size-3 text-emerald-500" />
                              ) : (
                                <Copy className="size-3" />
                              )}
                            </Button>
                          </div>
                        )}

                        {/* Video player */}
                        {hasVideo && (
                          <div className="rounded overflow-hidden border border-emerald-500/20 max-w-sm mb-2">
                            <video
                              src={sb.videoUrl}
                              controls
                              className="w-full aspect-video"
                              poster={sb.firstFrameUrl ?? undefined}
                            />
                          </div>
                        )}

                        {/* Action buttons */}
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {!hasVideo && (
                            <Button
                              size="sm"
                              variant="outline"
                              className={`h-7 text-[10px] px-2 ${isImageToVideo ? 'text-primary hover:text-primary' : ''}`}
                              onClick={() => handleGenerateVideo(sb)}
                              disabled={isGenerating || aiLoading}
                              title={modeLabel}
                            >
                              {isGenerating ? <Loader2 className="size-3 animate-spin" /> : isImageToVideo ? <ImageIcon className="size-3" /> : <Film className="size-3" />}
                              {modeLabel}
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-[10px] px-2 text-muted-foreground hover:text-foreground"
                            disabled={isUploading}
                            onClick={() => {
                              const input = document.getElementById(`upload-video-${sb.id}`) as HTMLInputElement
                              input?.click()
                            }}
                          >
                            {isUploading ? <Loader2 className="size-3 animate-spin" /> : <Upload className="size-3" />}
                            上传视频
                          </Button>
                          <input
                            id={`upload-video-${sb.id}`}
                            type="file"
                            accept="video/mp4"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0]
                              if (file) handleUpload(file, { storyboardId: sb.id, fieldType: 'videoUrl' }, `video-${sb.id}`)
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
