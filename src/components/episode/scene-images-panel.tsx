'use client'

import { motion } from 'framer-motion'
import {
  Loader2,
  MapPin,
  Clock,
  Image as ImageIcon,
  Upload,
  Copy,
  Check,
  Sparkles,
  Info,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Progress } from '@/components/ui/progress'
import { panelVariants } from './helpers'
import type { SceneImagesPanelProps } from './types'

export function SceneImagesPanel({
  scenes,
  aiLoading,
  generatingSceneImg,
  batchProgress,
  uploadingField,
  copiedField,
  handleGenerateSceneImage,
  handleUpload,
  handleCopy,
}: SceneImagesPanelProps) {
  const scenesMissingImage = scenes.filter((s) => !s.imageUrl)
  const scenesCompleted = scenes.filter((s) => s.imageUrl).length
  const progressPercent = scenes.length > 0 ? Math.round((scenesCompleted / scenes.length) * 100) : 0

  // Empty state
  if (scenes.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center max-w-md"
        >
          <div className="mx-auto size-16 rounded-full bg-primary/10 flex items-center justify-center mb-5">
            <MapPin className="size-8 text-primary" />
          </div>
          <h2 className="text-lg font-semibold mb-2">场景图片</h2>
          <p className="text-sm text-muted-foreground">
            请先在剧本阶段提取场景，然后在此生成或上传场景背景图片
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
          <span className="text-xs font-mono text-primary/80">07</span>
          <div>
            <h2 className="text-sm font-semibold">场景图片</h2>
            <p className="text-[10px] text-muted-foreground">
              生成或上传场景背景图 · {scenesCompleted}/{scenes.length} 已完成
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
          {scenesMissingImage.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                scenesMissingImage.forEach((s) => {
                  handleGenerateSceneImage(s.id)
                })
              }}
              disabled={aiLoading || !!generatingSceneImg}
            >
              {generatingSceneImg ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
              批量生成全部场景图
              <Badge variant="secondary" className="text-[9px] px-1 py-0 ml-1">{scenesMissingImage.length}</Badge>
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

          {/* Copy hint */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/30 rounded-md px-3 py-2">
            <Info className="size-3.5 flex-shrink-0" />
            <span>复制场景提示词，去 Midjourney/DALL-E 等工具生成后上传</span>
          </div>

          {/* Scene grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {scenes.map((scene) => {
              const isGenerating = generatingSceneImg === scene.id
              const isUploading = uploadingField === `scene-image-${scene.id}`
              const copyId = `scene-prompt-${scene.id}`

              return (
                <Card key={scene.id} className="border-border/50 py-0 gap-0">
                  <CardContent className="p-4">
                    {/* Image preview */}
                    <div className="mb-3">
                      {scene.imageUrl ? (
                        <img
                          src={scene.imageUrl}
                          alt={scene.location}
                          className="w-full h-32 rounded-lg object-cover border border-border/50"
                        />
                      ) : (
                        <div className="w-full h-32 rounded-lg bg-muted flex items-center justify-center">
                          <MapPin className="size-8 text-muted-foreground/50" />
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-sm">{scene.location}</span>
                      {scene.timeOfDay && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          <Clock className="size-2.5 mr-1" />
                          {scene.timeOfDay}
                        </Badge>
                      )}
                      {scene.imageUrl && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-emerald-600 border-emerald-200">
                          <ImageIcon className="size-2.5 mr-0.5" />参考图
                        </Badge>
                      )}
                    </div>

                    {/* Description */}
                    {scene.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{scene.description}</p>
                    )}

                    {/* Prompt with copy */}
                    {scene.prompt && (
                      <div className="flex items-start gap-1 mb-3 bg-muted/30 rounded px-2 py-1.5">
                        <p className="text-[11px] text-muted-foreground line-clamp-3 flex-1 font-mono">{scene.prompt}</p>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="size-6 p-0 flex-shrink-0"
                          onClick={() => handleCopy(scene.prompt, copyId)}
                          title="复制场景提示词"
                        >
                          {copiedField === copyId ? (
                            <Check className="size-3 text-emerald-500" />
                          ) : (
                            <Copy className="size-3" />
                          )}
                        </Button>
                      </div>
                    )}

                    {/* Action buttons */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[10px] px-2"
                        onClick={() => handleGenerateSceneImage(scene.id)}
                        disabled={isGenerating || aiLoading}
                      >
                        {isGenerating ? <Loader2 className="size-3 animate-spin" /> : <ImageIcon className="size-3" />}
                        AI生成场景图
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-[10px] px-2 text-muted-foreground hover:text-foreground"
                        disabled={isUploading}
                        onClick={() => {
                          const input = document.getElementById(`upload-scene-img-${scene.id}`) as HTMLInputElement
                          input?.click()
                        }}
                      >
                        {isUploading ? <Loader2 className="size-3 animate-spin" /> : <Upload className="size-3" />}
                        上传图片
                      </Button>
                      <input
                        id={`upload-scene-img-${scene.id}`}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (file) handleUpload(file, { sceneId: scene.id, fieldType: 'imageUrl' }, `scene-image-${scene.id}`)
                          e.target.value = ''
                        }}
                      />
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
