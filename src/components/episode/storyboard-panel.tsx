'use client'

import { motion } from 'framer-motion'
import {
  Loader2,
  Sparkles,
  Film,
  Check,
  ChevronRight,
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
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Progress } from '@/components/ui/progress'
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from '@/components/ui/collapsible'
import { AgentExecutionPanel } from '@/components/agent-execution-panel'
import { statusBadge, shotTypeLabel } from './helpers'
import type { StoryboardPanelProps } from './types'

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
  handleGenerateStoryboard,
  handleEnhanceShotPrompt,
  handleGenerateAllImages,
  handleGenerateAllVideos,
  handleGenerateShotImage,
  handleGenerateVideo,
  handleGenerateTts,
  handleUpload,
  handleCopy,
}: StoryboardPanelProps) {
  // Empty state
  if (storyboards.length === 0 && !isStoryboarding && !aiLoading) {
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
          <h2 className="text-lg font-semibold mb-2">生成分镜</h2>
          <p className="text-sm text-muted-foreground mb-6">
            AI将把剧本拆解为单独的镜头，包含景别、运镜、动作描述和对白
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

  // Loading state — show Agent Execution Panel
  if (isStoryboarding || aiLoading) {
    return (
      <div className="flex-1 p-6 overflow-y-auto">
        <AgentExecutionPanel
          agentType="storyboard_breaker"
          agentName="分镜拆解专家"
          isRunning={agentExec.isRunning('storyboard_breaker')}
          logs={agentExec.logs['storyboard_breaker'] || []}
          resultText={agentExec.resultTexts['storyboard_breaker']}
          duration={agentExec.durations['storyboard_breaker']}
          error={agentExec.errors['storyboard_breaker']}
        />
      </div>
    )
  }

  // Derived data for toolbar
  const pendingImageShots = storyboards.filter((s) => !s.firstFrameUrl && s.imagePrompt)
  const pendingVideoShots = storyboards.filter((s) => !s.videoUrl && (s.videoPrompt || s.imagePrompt))
  const t2vShots = pendingVideoShots.filter((s) => !s.firstFrameUrl)
  const i2vShots = pendingVideoShots.filter((s) => s.firstFrameUrl)

  // Storyboard cards with media preview + action buttons
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-3 border-b border-border/50 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono text-primary/80">05</span>
          <h2 className="text-sm font-semibold">分镜列表</h2>
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
          {pendingVideoShots.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleGenerateAllVideos}
              disabled={!!generatingVideo || !!generatingShotImg}
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
            <Button
              size="sm"
              variant="outline"
              onClick={handleGenerateAllImages}
              disabled={!!generatingShotImg || !!generatingVideo}
              className="amber-glow"
            >
              {generatingShotImg ? <Loader2 className="size-3.5 animate-spin" /> : <ImageIcon className="size-3.5" />}
              生成全部图片
            </Button>
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
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-6 space-y-4">
          {storyboards.map((sb) => (
            <Card key={sb.id} className="border-border/50 py-0 gap-0">
              <CardContent className="p-4">
                {/* Shot header */}
                <div className="flex items-start gap-3 mb-3">
                  <div className="flex-shrink-0 size-9 rounded bg-primary/10 flex items-center justify-center">
                    <span className="text-xs font-bold text-primary">
                      {String(sb.shotNumber).padStart(2, '0')}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-sm font-semibold">{sb.title}</h4>
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        {shotTypeLabel(sb.shotType)}
                      </Badge>
                      {sb.cameraAngle && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          {sb.cameraAngle}
                        </Badge>
                      )}
                      {sb.cameraMovement && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          {sb.cameraMovement}
                        </Badge>
                      )}
                      {sb.duration > 0 && (
                        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <Clock className="size-2.5" />
                          {sb.duration}s
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{sb.action}</p>
                  </div>
                </div>

                {/* Media preview area */}
                <div className="ml-12 mb-3">
                  {(sb.videoUrl || sb.firstFrameUrl) ? (
                    <div className="relative rounded-lg overflow-hidden border border-border/50 max-w-sm">
                      {sb.videoUrl ? (
                        <video
                          src={sb.videoUrl}
                          controls
                          className="w-full aspect-video object-cover"
                          poster={sb.firstFrameUrl ?? undefined}
                        />
                      ) : (
                        <img
                          src={sb.firstFrameUrl!}
                          alt={`镜头 ${sb.shotNumber}`}
                          className="w-full aspect-video object-cover"
                        />
                      )}
                      {(generatingShotImg === sb.id || generatingVideo === sb.id) && (
                        <div className="absolute inset-0 bg-background/60 flex items-center justify-center">
                          <div className="text-center">
                            <Loader2 className="size-6 text-primary animate-spin mx-auto mb-1" />
                            <p className="text-[10px] text-muted-foreground">
                              {generatingVideo === sb.id ? '生成视频中...' : '生成图片中...'}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="max-w-sm aspect-video rounded-lg bg-muted/50 border border-dashed border-border/50 flex items-center justify-center">
                      <div className="text-center">
                        <Camera className="size-6 text-muted-foreground/30 mx-auto mb-1" />
                        <p className="text-[10px] text-muted-foreground/50">暂无素材</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Status indicators */}
                <div className="ml-12 mb-3 flex items-center gap-2 flex-wrap">
                  {sb.firstFrameUrl ? (
                    <Badge className="status-completed text-[9px] px-1.5 py-0 gap-0.5">
                      <Check className="size-2.5" /> 图片
                    </Badge>
                  ) : null}
                  {sb.videoUrl ? (
                    <Badge className="status-completed text-[9px] px-1.5 py-0 gap-0.5">
                      <Check className="size-2.5" /> 视频
                    </Badge>
                  ) : null}
                  {sb.ttsAudioUrl ? (
                    <Badge className="status-completed text-[9px] px-1.5 py-0 gap-0.5">
                      <Check className="size-2.5" /> 配音
                    </Badge>
                  ) : null}
                  {!sb.firstFrameUrl && !sb.videoUrl && !sb.ttsAudioUrl && (
                    <Badge variant="outline" className="text-[9px] px-1.5 py-0">待生成</Badge>
                  )}
                </div>

                {/* Quick action buttons row */}
                <div className="ml-12 mb-3 flex items-center gap-1.5 flex-wrap">
                  {!sb.firstFrameUrl && sb.imagePrompt && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handleGenerateShotImage(sb)}
                      disabled={generatingShotImg === sb.id}
                      className="h-7 text-[11px] px-2.5"
                    >
                      {generatingShotImg === sb.id ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <ImageIcon className="size-3" />
                      )}
                      生成图片
                    </Button>
                  )}
                  {/* Generate Video — works with OR without firstFrameUrl */}
                  {!sb.videoUrl && (sb.videoPrompt || sb.imagePrompt) && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handleGenerateVideo(sb)}
                      disabled={generatingVideo === sb.id}
                      className="h-7 text-[11px] px-2.5 amber-glow"
                    >
                      {generatingVideo === sb.id ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <Video className="size-3" />
                      )}
                      {sb.firstFrameUrl ? '图生视频' : '文生视频'}
                    </Button>
                  )}
                  {sb.videoUrl && (sb.videoPrompt || sb.imagePrompt) && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleGenerateVideo(sb)}
                      disabled={generatingVideo === sb.id}
                      className="h-7 text-[11px] px-2.5 text-primary hover:text-primary"
                    >
                      {generatingVideo === sb.id ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <RefreshCw className="size-3" />
                      )}
                      重新生成视频
                    </Button>
                  )}
                  {sb.dialogue && !sb.ttsAudioUrl && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handleGenerateTts(sb)}
                      disabled={generatingTts === sb.id}
                      className="h-7 text-[11px] px-2.5"
                    >
                      {generatingTts === sb.id ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <Mic className="size-3" />
                      )}
                      生成配音
                    </Button>
                  )}
                  {/* Upload buttons */}
                  {!sb.firstFrameUrl && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-[11px] px-2.5 text-muted-foreground hover:text-foreground"
                      disabled={uploadingField === `sb-img-${sb.id}`}
                      onClick={() => {
                        const input = document.getElementById(`upload-sb-img-${sb.id}`) as HTMLInputElement
                        input?.click()
                      }}
                    >
                      {uploadingField === `sb-img-${sb.id}` ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <Upload className="size-3" />
                      )}
                      上传图片
                    </Button>
                  )}
                  {sb.firstFrameUrl && !sb.videoUrl && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-[11px] px-2.5 text-muted-foreground hover:text-foreground"
                      disabled={uploadingField === `sb-vid-${sb.id}`}
                      onClick={() => {
                        const input = document.getElementById(`upload-sb-vid-${sb.id}`) as HTMLInputElement
                        input?.click()
                      }}
                    >
                      {uploadingField === `sb-vid-${sb.id}` ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <Upload className="size-3" />
                      )}
                      上传视频
                    </Button>
                  )}
                  {/* Hidden file inputs */}
                  <input
                    id={`upload-sb-img-${sb.id}`}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) handleUpload(file, { storyboardId: sb.id, fieldType: 'firstFrameUrl' }, `sb-img-${sb.id}`)
                      e.target.value = ''
                    }}
                  />
                  <input
                    id={`upload-sb-vid-${sb.id}`}
                    type="file"
                    accept="video/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) handleUpload(file, { storyboardId: sb.id, fieldType: 'videoUrl' }, `sb-vid-${sb.id}`)
                      e.target.value = ''
                    }}
                  />
                </div>

                {/* TTS Audio player */}
                {sb.ttsAudioUrl && (
                  <div className="ml-12 mb-3 flex items-center gap-2">
                    <Mic className="size-3 text-primary/70 flex-shrink-0" />
                    <audio
                      src={sb.ttsAudioUrl}
                      controls
                      className="h-6 flex-1 [&::-webkit-media-controls-panel]:bg-muted/50"
                      style={{ minWidth: 0 }}
                    />
                  </div>
                )}

                {/* Dialogue */}
                {sb.dialogue && (
                  <div className="ml-12 mb-2 pl-3 border-l-2 border-primary/30">
                    <div className="flex items-start gap-1.5">
                      <p className="text-xs text-muted-foreground italic flex-1">
                        {sb.dialogueChar && <span className="font-medium not-italic text-foreground/80">{sb.dialogueChar}：</span>}
                        {sb.dialogue}
                      </p>
                      <button
                        onClick={() => handleCopy(sb.dialogue!, `sb-dialogue-${sb.id}`)}
                        className="flex-shrink-0 p-0.5 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
                        title="复制对白"
                      >
                        {copiedField === `sb-dialogue-${sb.id}` ? (
                          <Check className="size-3 text-emerald-500" />
                        ) : (
                          <Copy className="size-3" />
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {/* Collapsible prompts + enhance button */}
                <div className="ml-12 space-y-1">
                  {(sb.imagePrompt || sb.videoPrompt) && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleEnhanceShotPrompt(sb)}
                      disabled={aiLoading}
                      className="h-6 text-[10px] px-2 text-primary/70 hover:text-primary gap-1 mb-1"
                    >
                      <Wand2 className="size-3" />
                      AI增强提示词
                    </Button>
                  )}
                  {!sb.imagePrompt && !sb.videoPrompt && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleEnhanceShotPrompt(sb)}
                      disabled={aiLoading}
                      className="h-6 text-[10px] px-2 text-primary/70 hover:text-primary gap-1 mb-1"
                    >
                      <Wand2 className="size-3" />
                      生成提示词
                    </Button>
                  )}
                  {sb.imagePrompt && (
                    <Collapsible>
                      <CollapsibleTrigger className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors">
                        <ChevronDown className="size-3" />
                        <ImageIcon className="size-3" />
                        图片提示词
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="flex items-start gap-1.5 mt-1">
                          <p className="text-xs text-muted-foreground bg-muted/30 rounded p-2 flex-1">
                            {sb.imagePrompt}
                          </p>
                          <button
                            onClick={() => handleCopy(sb.imagePrompt!, `sb-img-${sb.id}`)}
                            className="flex-shrink-0 p-1 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
                            title="复制"
                          >
                            {copiedField === `sb-img-${sb.id}` ? (
                              <Check className="size-3 text-emerald-500" />
                            ) : (
                              <Copy className="size-3" />
                            )}
                          </button>
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  )}
                  {sb.videoPrompt && (
                    <Collapsible>
                      <CollapsibleTrigger className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors">
                        <ChevronDown className="size-3" />
                        <Video className="size-3" />
                        视频提示词
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="flex items-start gap-1.5 mt-1">
                          <p className="text-xs text-muted-foreground bg-muted/30 rounded p-2 flex-1">
                            {sb.videoPrompt}
                          </p>
                          <button
                            onClick={() => handleCopy(sb.videoPrompt!, `sb-vid-${sb.id}`)}
                            className="flex-shrink-0 p-1 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
                            title="复制"
                          >
                            {copiedField === `sb-vid-${sb.id}` ? (
                              <Check className="size-3 text-emerald-500" />
                            ) : (
                              <Copy className="size-3" />
                            )}
                          </button>
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}
