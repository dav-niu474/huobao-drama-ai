'use client'

import { motion } from 'framer-motion'
import {
  Loader2,
  Users,
  UserCircle,
  Layers,
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
import type { CharImagesPanelProps } from './types'

export function CharImagesPanel({
  characters,
  aiLoading,
  generatingCharImg,
  batchProgress,
  uploadingField,
  copiedField,
  handleGenerateCharSheet,
  handleGenerateCharImage,
  handleUpload,
  handleCopy,
}: CharImagesPanelProps) {
  const charsMissingImage = characters.filter((c) => !c.imageUrl)
  const charsCompleted = characters.filter((c) => c.imageUrl).length
  const progressPercent = characters.length > 0 ? Math.round((charsCompleted / characters.length) * 100) : 0

  // Empty state
  if (characters.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center max-w-md"
        >
          <div className="mx-auto size-16 rounded-full bg-primary/10 flex items-center justify-center mb-5">
            <Users className="size-8 text-primary" />
          </div>
          <h2 className="text-lg font-semibold mb-2">角色形象</h2>
          <p className="text-sm text-muted-foreground">
            请先在剧本阶段提取角色，然后在此生成或上传角色形象图片
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
          <span className="text-xs font-mono text-primary/80">06</span>
          <div>
            <h2 className="text-sm font-semibold">角色形象</h2>
            <p className="text-[10px] text-muted-foreground">
              生成或上传角色设定图和头像 · {charsCompleted}/{characters.length} 已完成
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
          {charsMissingImage.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                charsMissingImage.forEach((c) => {
                  handleGenerateCharImage(c.id)
                })
              }}
              disabled={aiLoading || !!generatingCharImg}
            >
              {generatingCharImg ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
              批量生成全部头像
              <Badge variant="secondary" className="text-[9px] px-1 py-0 ml-1">{charsMissingImage.length}</Badge>
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
            <span>复制外貌描述，去 Midjourney/DALL-E 等工具生成后上传</span>
          </div>

          {/* Character grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {characters.map((char) => {
              const isGenerating = generatingCharImg === char.id
              const isUploading = uploadingField === `char-image-${char.id}`
              const copyId = `char-appearance-${char.id}`

              return (
                <Card key={char.id} className="border-border/50 py-0 gap-0">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      {/* Image preview */}
                      <div className="flex-shrink-0">
                        {char.imageUrl ? (
                          <img
                            src={char.imageUrl}
                            alt={char.name}
                            className="w-20 h-20 rounded-lg object-cover border border-border/50"
                          />
                        ) : (
                          <div className="w-20 h-20 rounded-lg bg-muted flex items-center justify-center">
                            <UserCircle className="size-10 text-muted-foreground/50" />
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-sm">{char.name}</span>
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                            {char.role === 'protagonist' ? '主角' : char.role === 'antagonist' ? '反派' : char.role === 'supporting' ? '配角' : char.role}
                          </Badge>
                          {char.imageUrl && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-emerald-600 border-emerald-200">
                              <Layers className="size-2.5 mr-0.5" />设定图
                            </Badge>
                          )}
                        </div>

                        {/* Appearance description with copy */}
                        {char.appearance && (
                          <div className="flex items-start gap-1 mb-2">
                            <p className="text-xs text-muted-foreground line-clamp-2 flex-1">{char.appearance}</p>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="size-6 p-0 flex-shrink-0"
                              onClick={() => handleCopy(char.appearance, copyId)}
                              title="复制外貌描述"
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
                            onClick={() => handleGenerateCharImage(char.id)}
                            disabled={isGenerating || aiLoading}
                          >
                            {isGenerating ? <Loader2 className="size-3 animate-spin" /> : <ImageIcon className="size-3" />}
                            AI生成头像
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-[10px] px-2"
                            onClick={() => handleGenerateCharSheet(char.id)}
                            disabled={isGenerating || aiLoading}
                          >
                            {isGenerating ? <Loader2 className="size-3 animate-spin" /> : <Layers className="size-3" />}
                            AI生成设定图
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-[10px] px-2 text-muted-foreground hover:text-foreground"
                            disabled={isUploading}
                            onClick={() => {
                              const input = document.getElementById(`upload-char-img-${char.id}`) as HTMLInputElement
                              input?.click()
                            }}
                          >
                            {isUploading ? <Loader2 className="size-3 animate-spin" /> : <Upload className="size-3" />}
                            上传图片
                          </Button>
                          <input
                            id={`upload-char-img-${char.id}`}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0]
                              if (file) handleUpload(file, { characterId: char.id, fieldType: 'imageUrl' }, `char-image-${char.id}`)
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
