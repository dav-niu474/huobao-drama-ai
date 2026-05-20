'use client'

import { motion } from 'framer-motion'
import {
  Loader2,
  Sparkles,
  Users,
  RefreshCw,
  MapPin,
  UserCircle,
  Clock,
  Image as ImageIcon,
  Upload,
  Layers,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { AgentExecutionPanel } from '@/components/agent-execution-panel'
import { statusBadge } from './helpers'
import type { ExtractPanelProps } from './types'

export function ExtractPanel({
  characters,
  scenes,
  aiLoading,
  isExtracting,
  episode,
  agentExec,
  generatingCharImg,
  generatingSceneImg,
  batchProgress,
  uploadingField,
  handleExtract,
  handleGenerateAllExtractImages,
  handleGenerateCharSheet,
  handleGenerateCharImage,
  handleGenerateSceneImage,
  handleUpload,
}: ExtractPanelProps) {
  // Empty state
  if (characters.length === 0 && scenes.length === 0 && !isExtracting && !aiLoading) {
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
          <h2 className="text-lg font-semibold mb-2">提取角色与场景</h2>
          <p className="text-sm text-muted-foreground mb-6">
            AI将从剧本中提取角色信息和场景描述，用于后续分镜制作
          </p>
          <Button
            onClick={handleExtract}
            disabled={aiLoading}
            className="amber-glow"
          >
            <Sparkles className="size-4" />
            开始提取
          </Button>
        </motion.div>
      </div>
    )
  }

  // Loading state — show Agent Execution Panel
  if (isExtracting || aiLoading) {
    return (
      <div className="flex-1 p-6 overflow-y-auto">
        <AgentExecutionPanel
          agentType="extractor"
          agentName="角色场景提取器"
          isRunning={agentExec.isRunning('extractor')}
          logs={agentExec.logs['extractor'] || []}
          resultText={agentExec.resultTexts['extractor']}
          duration={agentExec.durations['extractor']}
          error={agentExec.errors['extractor']}
        />
      </div>
    )
  }

  // Content exists
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-3 border-b border-border/50">
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono text-primary/80">03</span>
          <h2 className="text-sm font-semibold">提取角色与场景</h2>
          {episode?.extractStatus && statusBadge(episode.extractStatus)}
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleGenerateAllExtractImages}
            disabled={aiLoading || isExtracting || (!characters.some(c => !c.imageUrl) && !scenes.some(s => !s.imageUrl))}
          >
            {batchProgress ? <Loader2 className="size-3.5 animate-spin" /> : <ImageIcon className="size-3.5" />}
            一键生成图片
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleExtract}
            disabled={aiLoading || isExtracting}
          >
            <RefreshCw className="size-3.5" />
            重新提取
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Characters */}
          <div>
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <UserCircle className="size-4 text-primary" />
              角色列表
              <Badge variant="secondary" className="text-[10px]">{characters.length}</Badge>
            </h3>
            <div className="space-y-3">
              {characters.map((char) => (
                <Card key={char.id} className="border-border/50 py-0 gap-0">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      {/* Avatar */}
                      <div className="flex-shrink-0">
                        {char.imageUrl ? (
                          <img
                            src={char.imageUrl}
                            alt={char.name}
                            className="w-16 h-16 rounded-lg object-cover border border-border/50"
                          />
                        ) : (
                          <div className="w-16 h-16 rounded-lg bg-muted flex items-center justify-center">
                            <UserCircle className="size-8 text-muted-foreground/50" />
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
                        {char.appearance && (
                          <p className="text-xs text-muted-foreground line-clamp-2">{char.appearance}</p>
                        )}
                        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={() => handleGenerateCharSheet(char.id)}
                            disabled={generatingCharImg === char.id}
                          >
                            {generatingCharImg === char.id ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <Layers className="size-3.5" />
                            )}
                            生成设定图
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={() => handleGenerateCharImage(char.id)}
                            disabled={generatingCharImg === char.id}
                          >
                            {generatingCharImg === char.id ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <ImageIcon className="size-3.5" />
                            )}
                            {char.imageUrl ? '重新生成头像' : '生成头像'}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs text-muted-foreground hover:text-foreground"
                            disabled={uploadingField === `char-image-${char.id}`}
                            onClick={() => {
                              const input = document.getElementById(`upload-char-${char.id}`) as HTMLInputElement
                              input?.click()
                            }}
                          >
                            {uploadingField === `char-image-${char.id}` ? (
                              <Loader2 className="size-3 animate-spin" />
                            ) : (
                              <Upload className="size-3" />
                            )}
                            上传
                          </Button>
                          <input
                            id={`upload-char-${char.id}`}
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
              ))}
              {characters.length === 0 && (
                <p className="text-xs text-muted-foreground py-4 text-center">暂无角色</p>
              )}
            </div>
          </div>

          {/* Scenes */}
          <div>
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <MapPin className="size-4 text-primary" />
              场景列表
              <Badge variant="secondary" className="text-[10px]">{scenes.length}</Badge>
            </h3>
            <div className="space-y-3">
              {scenes.map((scene) => (
                <Card key={scene.id} className="border-border/50 py-0 gap-0">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      {scene.imageUrl ? (
                        <img
                          src={scene.imageUrl}
                          alt={scene.location}
                          className="w-16 h-16 rounded-lg object-cover border border-border/50 flex-shrink-0"
                        />
                      ) : (
                        <div className="w-16 h-16 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                          <MapPin className="size-6 text-muted-foreground/50" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
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
                        {scene.description && (
                          <p className="text-xs text-muted-foreground line-clamp-2">{scene.description}</p>
                        )}
                        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={() => handleGenerateSceneImage(scene.id)}
                            disabled={generatingSceneImg === scene.id}
                          >
                            {generatingSceneImg === scene.id ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <ImageIcon className="size-3.5" />
                            )}
                            {scene.imageUrl ? '重新生成场景图' : '生成场景图'}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs text-muted-foreground hover:text-foreground"
                            disabled={uploadingField === `scene-image-${scene.id}`}
                            onClick={() => {
                              const input = document.getElementById(`upload-scene-${scene.id}`) as HTMLInputElement
                              input?.click()
                            }}
                          >
                            {uploadingField === `scene-image-${scene.id}` ? (
                              <Loader2 className="size-3 animate-spin" />
                            ) : (
                              <Upload className="size-3" />
                            )}
                            上传
                          </Button>
                          <input
                            id={`upload-scene-${scene.id}`}
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
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {scenes.length === 0 && (
                <p className="text-xs text-muted-foreground py-4 text-center">暂无场景</p>
              )}
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  )
}
