'use client'

import { useMemo } from 'react'
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
import { ExecutionProgress, EXTRACT_STEPS, deriveExtractStep } from './execution-progress'
import { statusBadge } from './helpers'
import type { ExtractPanelProps, PipelineStepKey } from './types'

// ── Step-aware configuration ────────────────────────────────────

interface StepConfig {
  stepNumber: string
  title: string
  subtitle: string
  showCharacters: boolean
  showScenes: boolean
  fullWidth: boolean
  largeImages: boolean
}

function getStepConfig(step: PipelineStepKey): StepConfig {
  switch (step) {
    case 'character_images':
      return {
        stepNumber: '06',
        title: '角色图片',
        subtitle: '为每个角色生成设定图和头像',
        showCharacters: true,
        showScenes: false,
        fullWidth: true,
        largeImages: true,
      }
    case 'scene_images':
      return {
        stepNumber: '07',
        title: '场景图片',
        subtitle: '为每个场景生成参考图',
        showCharacters: false,
        showScenes: true,
        fullWidth: true,
        largeImages: true,
      }
    case 'character_extract':
    default:
      return {
        stepNumber: '03',
        title: '提取角色与场景',
        subtitle: 'AI将从剧本中提取角色信息和场景描述，用于后续分镜制作',
        showCharacters: true,
        showScenes: true,
        fullWidth: false,
        largeImages: false,
      }
  }
}

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
  activePipelineStep,
  handleExtract,
  handleGenerateAllExtractImages,
  handleGenerateCharSheet,
  handleGenerateCharImage,
  handleGenerateSceneImage,
  handleUpload,
}: ExtractPanelProps) {
  const config = getStepConfig(activePipelineStep)

  // ── Derive execution state from agent logs (always called) ──
  const extractLogs = (agentExec.logs['extractor'] || []) as Array<{
    type: string
    message?: string
    toolCall?: { name: string; arguments?: Record<string, unknown> }
  }>
  const currentExecStep = useMemo(() => deriveExtractStep(extractLogs), [extractLogs])
  const latestExtractLog = extractLogs.length > 0 ? extractLogs[extractLogs.length - 1] : null
  const extractStepMessage = latestExtractLog?.message || undefined

  // Parse discovered characters from agent logs
  const discoveredCharCount = useMemo(() => {
    let count = 0
    for (const log of extractLogs) {
      if (log.type === 'tool_call' && log.toolCall?.name === 'save_characters') {
        if (log.toolCall.arguments?.characters && Array.isArray(log.toolCall.arguments.characters)) {
          count = log.toolCall.arguments.characters.length
        }
      }
    }
    return count || characters.length
  }, [extractLogs, characters.length])

  const discoveredSceneCount = useMemo(() => {
    let count = 0
    for (const log of extractLogs) {
      if (log.type === 'tool_call' && log.toolCall?.name === 'save_scenes') {
        if (log.toolCall.arguments?.scenes && Array.isArray(log.toolCall.arguments.scenes)) {
          count = log.toolCall.arguments.scenes.length
        }
      }
    }
    return count || scenes.length
  }, [extractLogs, scenes.length])

  const hasDiscovered = discoveredCharCount > 0 || discoveredSceneCount > 0

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
            {config.showCharacters && config.showScenes ? (
              <Users className="size-8 text-primary" />
            ) : config.showCharacters ? (
              <UserCircle className="size-8 text-primary" />
            ) : (
              <MapPin className="size-8 text-primary" />
            )}
          </div>
          <h2 className="text-lg font-semibold mb-2">{config.title}</h2>
          <p className="text-sm text-muted-foreground mb-6">{config.subtitle}</p>
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

  // Loading state — show step-by-step execution progress + progressive reveal
  if (isExtracting || aiLoading) {
    return (
      <div className="flex-1 p-6 overflow-y-auto">
        {/* Step-by-step execution progress */}
        <div className="mb-4">
          <ExecutionProgress
            steps={EXTRACT_STEPS}
            currentStep={currentExecStep}
            message={extractStepMessage}
          />
        </div>

        {/* Progressive content reveal — show discovered characters/scenes as they arrive */}
        {hasDiscovered && (
          <div className="mb-4 p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/10">
            <div className="flex items-center gap-2 mb-2">
              <span className="size-1.5 rounded-full bg-emerald-500 exec-pulse-dot" />
              <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                已发现内容
              </span>
            </div>
            <div className="flex items-center gap-3">
              {discoveredCharCount > 0 && (
                <div className="exec-fade-in flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-emerald-500/10">
                  <UserCircle className="size-3.5 text-emerald-500" />
                  <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                    {discoveredCharCount} 角色
                  </span>
                </div>
              )}
              {discoveredSceneCount > 0 && (
                <div className="exec-fade-in flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-emerald-500/10" style={{ animationDelay: '0.1s' }}>
                  <MapPin className="size-3.5 text-emerald-500" />
                  <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                    {discoveredSceneCount} 场景
                  </span>
                </div>
              )}
              {(discoveredCharCount > 0 || discoveredSceneCount > 0) && (
                <span className="text-[10px] text-muted-foreground">
                  数据持续更新中...
                </span>
              )}
            </div>

            {/* Show discovered character name pills */}
            {characters.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {characters.map((char, idx) => (
                  <Badge
                    key={char.id}
                    variant="secondary"
                    className="exec-fade-in text-[10px] px-2 py-0.5 exec-glow"
                    style={{ animationDelay: `${idx * 0.06}s` }}
                  >
                    {char.name}
                  </Badge>
                ))}
              </div>
            )}

            {/* Show discovered scene name pills */}
            {scenes.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {scenes.map((scene, idx) => (
                  <Badge
                    key={scene.id}
                    variant="outline"
                    className="exec-fade-in text-[10px] px-2 py-0.5"
                    style={{ animationDelay: `${(characters.length + idx) * 0.06}s` }}
                  >
                    <MapPin className="size-2.5 mr-0.5" />
                    {scene.location}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Agent execution log */}
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

  // Image size classes based on step
  const imgSize = config.largeImages ? 'w-24 h-24' : 'w-16 h-16'
  const iconSize = config.largeImages ? 'size-10' : 'size-8'

  // Content exists
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-3 border-b border-border/50">
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono text-primary/80">{config.stepNumber}</span>
          <div>
            <h2 className="text-sm font-semibold">{config.title}</h2>
            {!config.fullWidth && (
              <p className="text-[10px] text-muted-foreground">{config.subtitle}</p>
            )}
          </div>
          {episode?.extractStatus && statusBadge(episode.extractStatus)}
        </div>
        <div className="flex items-center gap-2">
          {activePipelineStep === 'character_extract' && (
            <>
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
            </>
          )}
          {activePipelineStep === 'character_images' && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleGenerateAllExtractImages}
              disabled={aiLoading || isExtracting || !characters.some(c => !c.imageUrl)}
            >
              {batchProgress ? <Loader2 className="size-3.5 animate-spin" /> : <ImageIcon className="size-3.5" />}
              生成全部角色图片
            </Button>
          )}
          {activePipelineStep === 'scene_images' && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleGenerateAllExtractImages}
              disabled={aiLoading || isExtracting || !scenes.some(s => !s.imageUrl)}
            >
              {batchProgress ? <Loader2 className="size-3.5 animate-spin" /> : <ImageIcon className="size-3.5" />}
              生成全部场景图片
            </Button>
          )}
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className={`p-6 grid gap-6 ${
          config.fullWidth ? 'grid-cols-1 lg:grid-cols-2 xl:grid-cols-3' : 'grid-cols-1 lg:grid-cols-2'
        }`}>
          {/* Characters */}
          {config.showCharacters && (
            <div className={config.fullWidth ? 'lg:col-span-2 xl:col-span-3' : ''}>
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <UserCircle className="size-4 text-primary" />
                角色列表
                <Badge variant="secondary" className="text-[10px]">{characters.length}</Badge>
              </h3>
              <div className={`grid gap-3 ${
                config.fullWidth ? 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3' : 'grid-cols-1'
              }`}>
                {characters.map((char, idx) => (
                  <Card key={char.id} className="border-border/50 py-0 gap-0 exec-stagger-in" style={{ animationDelay: `${idx * 0.05}s` }}>
                    <CardContent className="p-4">
                      <div className={`flex items-start gap-3 ${config.largeImages ? 'flex-col sm:flex-row' : ''}`}>
                        {/* Avatar */}
                        <div className="flex-shrink-0">
                          {char.imageUrl ? (
                            <img
                              src={char.imageUrl}
                              alt={char.name}
                              className={`${imgSize} rounded-lg object-cover border border-border/50`}
                            />
                          ) : (
                            <div className={`${imgSize} rounded-lg bg-muted flex items-center justify-center`}>
                              <UserCircle className={`${iconSize} text-muted-foreground/50`} />
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
                              variant={config.largeImages ? 'default' : 'outline'}
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
          )}

          {/* Scenes */}
          {config.showScenes && (
            <div className={config.fullWidth ? 'lg:col-span-2 xl:col-span-3' : ''}>
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <MapPin className="size-4 text-primary" />
                场景列表
                <Badge variant="secondary" className="text-[10px]">{scenes.length}</Badge>
              </h3>
              <div className={`grid gap-3 ${
                config.fullWidth ? 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3' : 'grid-cols-1'
              }`}>
                {scenes.map((scene, idx) => (
                  <Card key={scene.id} className="border-border/50 py-0 gap-0 exec-stagger-in" style={{ animationDelay: `${idx * 0.05}s` }}>
                    <CardContent className="p-4">
                      <div className={`flex items-start gap-3 ${config.largeImages ? 'flex-col' : ''}`}>
                        {scene.imageUrl ? (
                          <img
                            src={scene.imageUrl}
                            alt={scene.location}
                            className={`${imgSize} rounded-lg object-cover border border-border/50 flex-shrink-0 ${config.largeImages ? 'w-full h-auto aspect-video' : ''}`}
                          />
                        ) : (
                          <div className={`${imgSize} rounded-lg bg-muted flex items-center justify-center flex-shrink-0 ${config.largeImages ? 'w-full h-auto aspect-video' : ''}`}>
                            <MapPin className={`${iconSize} text-muted-foreground/50`} />
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
                              variant={config.largeImages ? 'default' : 'outline'}
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
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
