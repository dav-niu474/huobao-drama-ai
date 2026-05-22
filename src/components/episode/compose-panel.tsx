'use client'

import { motion } from 'framer-motion'
import {
  Loader2,
  Film,
  Clapperboard,
  Check,
  ChevronRight,
  Image as ImageIcon,
  Video,
  Mic,
  Layers,
  Music,
  Eye,
  Download,
  Play,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Progress } from '@/components/ui/progress'
import { panelVariants } from './helpers'
import type { ComposePanelProps } from './types'

export function ComposePanel({
  storyboards,
  aiLoading,
  composing,
  composingAll,
  batchProgress,
  previewMode,
  currentPreviewShot,
  exporting,
  previewVideoRef,
  previewAudioRef,
  perms,
  handleComposeShot,
  handleComposeAll,
  handleStartPreview,
  handlePreviewEnded,
  handleExport,
  setPreviewMode,
  setCurrentPreviewShot,
}: ComposePanelProps) {
  const totalShots = storyboards.length
  const shotsWithImage = storyboards.filter((s) => s.firstFrameUrl).length
  const shotsWithVideo = storyboards.filter((s) => s.videoUrl).length
  const shotsWithTts = storyboards.filter((s) => s.ttsAudioUrl).length
  const shotsComposed = storyboards.filter((s) => s.composedUrl).length
  const shotsWithDialogue = storyboards.filter((s) => s.dialogue).length

  // Get video shots for preview
  const videoShots = storyboards.filter((s) => s.videoUrl || s.composedUrl)
  const currentPreviewStoryboard = previewMode && videoShots[currentPreviewShot]

  // Pipeline completion percentage
  const pipelinePercent = totalShots > 0
    ? Math.round(((shotsWithImage + shotsWithVideo + shotsWithTts + shotsComposed) / (totalShots * 4)) * 100)
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
          <div className="mx-auto size-16 rounded-full bg-muted flex items-center justify-center mb-5">
            <Clapperboard className="size-8 text-muted-foreground/50" />
          </div>
          <h2 className="text-lg font-semibold mb-2">视频合成</h2>
          <p className="text-sm text-muted-foreground">
            请先在之前的步骤中完成视频生成，然后在此进行合成与导出
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
          <span className="text-xs font-mono text-primary/80">11</span>
          <div>
            <h2 className="text-sm font-semibold">视频合成</h2>
            <p className="text-[10px] text-muted-foreground">
              合成视频+配音+字幕 · 预览 · 导出成片
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
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-6 space-y-6">
          {/* Pipeline status bar */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <Card className="border-border/50 py-0 gap-0">
              <CardContent className="p-3 text-center">
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  <ImageIcon className="size-3.5 text-primary/70" />
                  <span className="text-[10px] text-muted-foreground">图片</span>
                </div>
                <div className="text-lg font-bold">
                  {shotsWithImage}
                  <span className="text-xs font-normal text-muted-foreground">/{totalShots}</span>
                </div>
                <Progress value={totalShots > 0 ? (shotsWithImage / totalShots) * 100 : 0} className="h-1 mt-1.5" />
              </CardContent>
            </Card>
            <Card className="border-border/50 py-0 gap-0">
              <CardContent className="p-3 text-center">
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  <Video className="size-3.5 text-primary/70" />
                  <span className="text-[10px] text-muted-foreground">视频</span>
                </div>
                <div className="text-lg font-bold">
                  {shotsWithVideo}
                  <span className="text-xs font-normal text-muted-foreground">/{totalShots}</span>
                </div>
                <Progress value={totalShots > 0 ? (shotsWithVideo / totalShots) * 100 : 0} className="h-1 mt-1.5" />
              </CardContent>
            </Card>
            <Card className="border-border/50 py-0 gap-0">
              <CardContent className="p-3 text-center">
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  <Mic className="size-3.5 text-primary/70" />
                  <span className="text-[10px] text-muted-foreground">配音</span>
                </div>
                <div className="text-lg font-bold">
                  {shotsWithTts}
                  <span className="text-xs font-normal text-muted-foreground">/{shotsWithDialogue}</span>
                </div>
                <Progress value={shotsWithDialogue > 0 ? (shotsWithTts / shotsWithDialogue) * 100 : 0} className="h-1 mt-1.5" />
              </CardContent>
            </Card>
            <Card className="border-border/50 py-0 gap-0">
              <CardContent className="p-3 text-center">
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  <Layers className="size-3.5 text-primary/70" />
                  <span className="text-[10px] text-muted-foreground">合成</span>
                </div>
                <div className="text-lg font-bold">
                  {shotsComposed}
                  <span className="text-xs font-normal text-muted-foreground">/{shotsWithVideo}</span>
                </div>
                <Progress value={shotsWithVideo > 0 ? (shotsComposed / shotsWithVideo) * 100 : 0} className="h-1 mt-1.5" />
              </CardContent>
            </Card>
            <Card className="border-border/50 py-0 gap-0 sm:col-span-1 col-span-2">
              <CardContent className="p-3 text-center">
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  <Clapperboard className="size-3.5 text-primary/70" />
                  <span className="text-[10px] text-muted-foreground">总进度</span>
                </div>
                <div className="text-lg font-bold">
                  {pipelinePercent}
                  <span className="text-xs font-normal text-muted-foreground">%</span>
                </div>
                <Progress value={pipelinePercent} className="h-1 mt-1.5" />
              </CardContent>
            </Card>
          </div>

          {/* Toolbar actions */}
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              size="sm"
              variant="outline"
              onClick={handleComposeAll}
              disabled={composingAll || !!composing || aiLoading || shotsWithVideo === 0}
              className="amber-glow"
            >
              {composingAll || composing ? <Loader2 className="size-3.5 animate-spin" /> : <Layers className="size-3.5" />}
              一键合成
              {shotsWithVideo > 0 && shotsComposed < shotsWithVideo && (
                <Badge variant="secondary" className="text-[9px] px-1 py-0 ml-1">
                  {shotsWithVideo - shotsComposed}
                </Badge>
              )}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleStartPreview}
              disabled={videoShots.length === 0}
            >
              <Eye className="size-3.5" />
              预览完整视频
            </Button>
            <Button
              size="sm"
              onClick={handleExport}
              disabled={exporting || videoShots.length === 0}
              className={perms.canExport ? 'amber-glow' : ''}
              variant={perms.canExport ? 'default' : 'outline'}
            >
              {exporting ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
              {perms.canExport ? '导出成片' : '导出（需专业版）'}
            </Button>
          </div>

          {/* Timeline view */}
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground mb-3 flex items-center gap-1.5">
              <Film className="size-3.5" />
              镜头时间线
              <Badge variant="secondary" className="text-[9px] px-1 py-0">{totalShots} 镜</Badge>
            </h3>
            <div className="space-y-3">
              {storyboards.map((sb) => {
                const hasImage = !!sb.firstFrameUrl
                const hasVideo = !!sb.videoUrl
                const hasTts = !!sb.ttsAudioUrl
                const isComposed = !!sb.composedUrl
                const isProcessing = composing === sb.id

                return (
                  <Card key={sb.id} className={`border-border/50 py-0 gap-0 ${isComposed ? 'ring-1 ring-emerald-500/30' : ''}`}>
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        {/* Shot number + video thumbnail */}
                        <div className="flex-shrink-0">
                          {sb.videoUrl ? (
                            <div className="relative w-28 h-16 rounded overflow-hidden border border-border/50">
                              <video
                                src={sb.composedUrl || sb.videoUrl}
                                className="w-full h-full object-cover"
                                muted
                                onMouseEnter={(e) => (e.target as HTMLVideoElement).play().catch(() => {})}
                                onMouseLeave={(e) => { const v = e.target as HTMLVideoElement; v.pause(); v.currentTime = 0; }}
                                playsInline
                                loop
                                poster={sb.firstFrameUrl ?? undefined}
                              />
                              <div className="absolute top-1 left-1 bg-black/60 text-white text-[9px] font-mono px-1 rounded">
                                {isComposed ? '✅' : '🎬'}
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
                                {String(sb.shotNumber).padStart(2, '0')}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Shot info + pipeline */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className="text-xs font-bold text-primary">#{String(sb.shotNumber).padStart(2, '0')}</span>
                            <span className="text-xs font-medium truncate">{sb.title}</span>
                            {isProcessing && (
                              <Loader2 className="size-3 text-primary animate-spin flex-shrink-0" />
                            )}
                            {isComposed && (
                              <Badge className="status-completed text-[9px] px-1.5 py-0 gap-0.5">
                                <Check className="size-2.5" /> 已合成
                              </Badge>
                            )}
                          </div>
                          {/* Pipeline progress with icons */}
                          <div className="flex items-center gap-1.5 text-[10px] mb-2">
                            <span className={`inline-flex items-center gap-0.5 ${hasImage ? 'text-emerald-500 font-medium' : 'text-muted-foreground/40'}`}>
                              <ImageIcon className="size-2.5" /> 图片
                            </span>
                            <ChevronRight className="size-2 text-muted-foreground/30" />
                            <span className={`inline-flex items-center gap-0.5 ${hasVideo ? 'text-emerald-500 font-medium' : 'text-muted-foreground/40'}`}>
                              <Video className="size-2.5" /> 视频
                            </span>
                            <ChevronRight className="size-2 text-muted-foreground/30" />
                            <span className={`inline-flex items-center gap-0.5 ${hasTts ? 'text-emerald-500 font-medium' : sb.dialogue ? 'text-amber-500' : 'text-muted-foreground/40'}`}>
                              <Mic className="size-2.5" /> 配音
                            </span>
                            <ChevronRight className="size-2 text-muted-foreground/30" />
                            <span className={`inline-flex items-center gap-0.5 ${isComposed ? 'text-emerald-500 font-medium' : 'text-muted-foreground/40'}`}>
                              <Layers className="size-2.5" /> 合成
                            </span>
                          </div>
                          {/* Subtitle preview */}
                          {sb.dialogue && (
                            <div className="text-[10px] text-muted-foreground italic bg-muted/30 rounded px-2 py-1 mb-2">
                              {sb.dialogueChar && <span className="font-medium not-italic text-foreground/80">{sb.dialogueChar}：</span>}
                              {sb.dialogue}
                            </div>
                          )}
                        </div>

                        {/* Per-shot compose action */}
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {hasVideo && !isComposed && (
                            <Button
                              size="sm"
                              variant="secondary"
                              className="h-7 text-[10px] px-2 amber-glow"
                              onClick={() => handleComposeShot(sb)}
                              disabled={composing === sb.id}
                              title="合成（字幕+配音叠加）"
                            >
                              {composing === sb.id ? <Loader2 className="size-3 animate-spin" /> : <Layers className="size-3" />}
                              合成
                            </Button>
                          )}
                        </div>
                      </div>

                      {/* Audio player + composed video preview */}
                      <div className="mt-2 pl-[124px] space-y-2">
                        {sb.ttsAudioUrl && (
                          <div className="flex items-center gap-2">
                            <Music className="size-3 text-primary/60 flex-shrink-0" />
                            <audio
                              src={sb.ttsAudioUrl}
                              controls
                              className="h-5 flex-1 [&::-webkit-media-controls-panel]:bg-muted/50"
                              style={{ minWidth: 0 }}
                            />
                          </div>
                        )}
                        {sb.composedUrl && (
                          <div className="rounded overflow-hidden border border-emerald-500/20 max-w-md">
                            <video
                              src={sb.composedUrl}
                              controls
                              className="w-full aspect-video"
                            />
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </div>

          {/* Sequence Preview */}
          {previewMode && currentPreviewStoryboard && (
            <div className="border border-border/50 rounded-lg overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2 bg-muted/30 border-b border-border/50">
                <div className="flex items-center gap-2">
                  <Eye className="size-3.5 text-primary" />
                  <span className="text-xs font-semibold">完整预览</span>
                  <Badge variant="secondary" className="text-[9px] px-1.5 py-0">
                    {currentPreviewShot + 1}/{videoShots.length}
                  </Badge>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 text-xs"
                  onClick={() => { setPreviewMode(false); setCurrentPreviewShot(0) }}
                >
                  关闭预览
                </Button>
              </div>
              <div className="relative bg-black">
                <video
                  ref={previewVideoRef}
                  src={currentPreviewStoryboard.composedUrl || currentPreviewStoryboard.videoUrl!}
                  onEnded={handlePreviewEnded}
                  controls
                  autoPlay
                  className="w-full aspect-video"
                  poster={currentPreviewStoryboard.firstFrameUrl ?? undefined}
                />
                {/* Shot number + subtitle overlay */}
                <div className="absolute top-3 left-3 bg-black/60 text-white text-xs font-mono px-2 py-0.5 rounded">
                  #{String(currentPreviewStoryboard.shotNumber).padStart(2, '0')} {currentPreviewStoryboard.title}
                </div>
                {/* Subtitle overlay */}
                {currentPreviewStoryboard.dialogue && !currentPreviewStoryboard.composedUrl && (
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/70 text-white text-sm px-4 py-1.5 rounded max-w-[80%] text-center">
                    {currentPreviewStoryboard.dialogueChar && (
                      <span className="font-medium">{currentPreviewStoryboard.dialogueChar}：</span>
                    )}
                    {currentPreviewStoryboard.dialogue}
                  </div>
                )}
                {/* Hidden audio for TTS sync */}
                {currentPreviewStoryboard.ttsAudioUrl && (
                  <audio
                    ref={previewAudioRef}
                    src={currentPreviewStoryboard.ttsAudioUrl}
                    autoPlay
                    className="hidden"
                  />
                )}
              </div>
              {/* Shot navigation */}
              <div className="flex items-center justify-center gap-2 p-2 bg-muted/20">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  disabled={currentPreviewShot === 0}
                  onClick={() => setCurrentPreviewShot(Math.max(0, currentPreviewShot - 1))}
                >
                  上一镜
                </Button>
                <span className="text-xs text-muted-foreground">
                  {currentPreviewShot + 1} / {videoShots.length}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  disabled={currentPreviewShot >= videoShots.length - 1}
                  onClick={() => setCurrentPreviewShot(Math.min(videoShots.length - 1, currentPreviewShot + 1))}
                >
                  下一镜
                </Button>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
    </motion.div>
  )
}
