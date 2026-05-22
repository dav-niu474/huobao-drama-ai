'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Sparkles, Mic, UserCircle, Volume2, Loader2, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { AgentExecutionPanel } from '@/components/agent-execution-panel'
import { api } from '@/lib/api'
import type { VoicePanelProps } from './types'

// ── Voice entry from API ──────────────────────────────────────
interface VoiceEntry {
  id: string
  name: string
  provider: string
  language?: string
  description?: string
  gender?: string
}

// ── Gender filter for voice matching ──────────────────────────
function genderMatch(voiceGender: string | undefined, charGender: string): boolean {
  if (!voiceGender || voiceGender === 'neutral') return true
  if (charGender === 'male' && voiceGender === 'male') return true
  if (charGender === 'female' && voiceGender === 'female') return true
  if (charGender === 'unknown') return true
  return false
}

export function VoicePanel({
  characters,
  aiLoading,
  agentExec,
  activeStep,
  handleVoiceAssign,
  handleAssignVoice,
  handleGenerateVoiceSample,
  voiceSamples,
  generatingSample,
}: VoicePanelProps) {
  const hasVoices = characters.some((c) => c.voiceId)

  // Voice catalog state
  const [voices, setVoices] = useState<VoiceEntry[]>([])
  const [voicesLoading, setVoicesLoading] = useState(false)
  const [expandedChar, setExpandedChar] = useState<string | null>(null)
  const [voiceFilter, setVoiceFilter] = useState<'all' | 'male' | 'female'>('all')

  // Load voice catalog
  useEffect(() => {
    if (characters.length > 0) {
      setVoicesLoading(true)
      api.ai.listVoices(undefined, 'zh')
        .then((result) => {
          setVoices(result.voices)
        })
        .catch((err) => {
          console.error('Failed to load voices:', err)
        })
        .finally(() => {
          setVoicesLoading(false)
        })
    }
  }, [characters.length])

  // Filter voices by gender
  const filteredVoices = voiceFilter === 'all'
    ? voices
    : voices.filter((v) => v.gender === voiceFilter)

  // Get recommended voices for a character
  const getRecommendedVoices = useCallback((charGender: string) => {
    return voices.filter((v) => genderMatch(v.gender, charGender))
  }, [voices])

  // Empty state - no characters yet
  if (characters.length === 0 && !aiLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center max-w-md"
        >
          <div className="mx-auto size-16 rounded-full bg-primary/10 flex items-center justify-center mb-5">
            <Mic className="size-8 text-primary" />
          </div>
          <h2 className="text-lg font-semibold mb-2">音色分配</h2>
          <p className="text-sm text-muted-foreground mb-6">
            请先完成角色提取，AI将为每个角色分配合适的TTS音色
          </p>
          <p className="text-xs text-muted-foreground">请先在「提取」步骤中完成角色提取</p>
        </motion.div>
      </div>
    )
  }

  // Loading state — show Agent Execution Panel
  if (aiLoading && activeStep === 'voice') {
    return (
      <div className="flex-1 p-6 overflow-y-auto">
        <AgentExecutionPanel
          agentType="voice_assigner"
          agentName="音色分配师"
          isRunning={agentExec.isRunning('voice_assigner')}
          logs={agentExec.logs['voice_assigner'] || []}
          resultText={agentExec.resultTexts['voice_assigner']}
          duration={agentExec.durations['voice_assigner']}
          error={agentExec.errors['voice_assigner']}
        />
      </div>
    )
  }

  // Content exists
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-3 border-b border-border/50">
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono text-primary/80">04</span>
          <h2 className="text-sm font-semibold">音色分配</h2>
          {hasVoices && <Badge className="status-completed text-[10px] px-1.5 py-0">已分配</Badge>}
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={handleVoiceAssign}
            disabled={aiLoading || characters.length === 0}
            className="amber-glow"
          >
            <Sparkles className="size-3.5" />
            AI分配音色
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-6 space-y-4">
          {/* ── Voice library section ── */}
          <div className="rounded-lg border border-border/50 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Volume2 className="size-4 text-primary" />
                音色库
                <Badge variant="secondary" className="text-[10px]">
                  {filteredVoices.length}
                </Badge>
              </h3>
              <div className="flex items-center gap-1.5">
                <Button
                  size="sm"
                  variant={voiceFilter === 'all' ? 'default' : 'outline'}
                  className="text-[10px] h-6 px-2"
                  onClick={() => setVoiceFilter('all')}
                >
                  全部
                </Button>
                <Button
                  size="sm"
                  variant={voiceFilter === 'male' ? 'default' : 'outline'}
                  className="text-[10px] h-6 px-2"
                  onClick={() => setVoiceFilter('male')}
                >
                  男声
                </Button>
                <Button
                  size="sm"
                  variant={voiceFilter === 'female' ? 'default' : 'outline'}
                  className="text-[10px] h-6 px-2"
                  onClick={() => setVoiceFilter('female')}
                >
                  女声
                </Button>
              </div>
            </div>

            {voicesLoading ? (
              <div className="flex items-center justify-center py-4 gap-2">
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
                <span className="text-xs text-muted-foreground">加载音色库...</span>
              </div>
            ) : filteredVoices.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {filteredVoices.map((voice) => (
                  <span
                    key={`${voice.provider}-${voice.id}`}
                    className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-full bg-muted/60 border border-border/40 cursor-default"
                    title={`${voice.description || ''} (${voice.provider})`}
                  >
                    <span className="font-medium">{voice.name}</span>
                    {voice.gender && (
                      <span className="text-muted-foreground">
                        {voice.gender === 'male' ? '♂' : voice.gender === 'female' ? '♀' : ''}
                      </span>
                    )}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground py-2 text-center">
                暂无可用音色，请先在设置中配置TTS服务
              </p>
            )}
          </div>

          {/* ── Character voice assignment cards ── */}
          <div className="space-y-3">
            {characters.map((char) => {
              const isExpanded = expandedChar === char.id
              const recommended = getRecommendedVoices(char.gender)
              const assignedVoice = voices.find((v) => v.id === char.voiceId)

              return (
                <Card key={char.id} className="border-border/50">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      {/* Character avatar */}
                      <div className="size-12 rounded-full bg-muted flex items-center justify-center overflow-hidden shrink-0">
                        {char.imageUrl ? (
                          <img src={char.imageUrl} alt={char.name} className="size-full object-cover" />
                        ) : (
                          <UserCircle className="size-8 text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-sm">{char.name}</span>
                          <Badge variant="outline" className="text-[10px] px-1 py-0">
                            {char.gender === 'male' ? '男' : char.gender === 'female' ? '女' : '未知'}
                          </Badge>
                          {char.role && (
                            <Badge variant="outline" className="text-[10px] px-1 py-0">
                              {char.role === 'protagonist' ? '主角' : char.role === 'antagonist' ? '反派' : char.role === 'supporting' ? '配角' : '龙套'}
                            </Badge>
                          )}
                        </div>
                        {char.voiceStyle && (
                          <p className="text-xs text-muted-foreground mb-2 truncate">
                            声音特征: {char.voiceStyle}
                          </p>
                        )}

                        {/* Current voice assignment */}
                        <div className="flex items-center gap-2 mb-2">
                          {char.voiceId ? (
                            <div className="flex items-center gap-2 flex-1">
                              <div className="flex items-center gap-1.5 text-xs text-green-600 bg-green-50 dark:bg-green-950/30 px-2 py-1 rounded-md">
                                <Mic className="size-3" />
                                <span className="font-medium">
                                  {assignedVoice?.name || char.voiceId}
                                </span>
                              </div>
                              {/* Voice sample playback */}
                              {voiceSamples[char.id] && (
                                <audio
                                  src={voiceSamples[char.id]}
                                  controls
                                  className="h-6 w-24"
                                  style={{ maxWidth: '120px' }}
                                />
                              )}
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <Mic className="size-3" />
                              <span>未分配</span>
                            </div>
                          )}
                        </div>

                        {/* Toggle manual assign */}
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-[10px] h-6 px-2 w-full"
                          onClick={() => setExpandedChar(isExpanded ? null : char.id)}
                        >
                          {isExpanded ? (
                            <><ChevronUp className="size-3" /> 收起音色选择</>
                          ) : (
                            <><ChevronDown className="size-3" /> 手动选择音色</>
                          )}
                        </Button>

                        {/* Voice selection dropdown */}
                        {isExpanded && (
                          <div className="mt-2 space-y-1.5 max-h-[200px] overflow-y-auto">
                            {recommended.length > 0 ? (
                              recommended.map((voice) => {
                                const isSelected = char.voiceId === voice.id
                                return (
                                  <div
                                    key={`${voice.provider}-${voice.id}`}
                                    className={`flex items-center justify-between p-2 rounded-md text-xs cursor-pointer transition-colors ${
                                      isSelected
                                        ? 'bg-primary/10 border border-primary/30'
                                        : 'bg-muted/30 border border-transparent hover:bg-muted/60'
                                    }`}
                                    onClick={() => {
                                      if (!isSelected) {
                                        handleAssignVoice(char.id, voice.id)
                                      }
                                    }}
                                  >
                                    <div className="flex items-center gap-2 flex-1 min-w-0">
                                      <Mic className={`size-3 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} />
                                      <span className="font-medium truncate">{voice.name}</span>
                                      <span className="text-muted-foreground shrink-0">({voice.provider})</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                      {voice.description && (
                                        <span className="text-muted-foreground truncate max-w-[100px]">
                                          {voice.description}
                                        </span>
                                      )}
                                      {isSelected && (
                                        <Badge className="text-[8px] px-1 py-0 bg-primary text-primary-foreground">
                                          已选
                                        </Badge>
                                      )}
                                      {!isSelected && (
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          className="size-5 p-0"
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            handleGenerateVoiceSample(char.id, voice.id)
                                          }}
                                          disabled={generatingSample === char.id}
                                          title="试听"
                                        >
                                          {generatingSample === char.id ? (
                                            <Loader2 className="size-3 animate-spin" />
                                          ) : (
                                            <Volume2 className="size-3" />
                                          )}
                                        </Button>
                                      )}
                                    </div>
                                  </div>
                                )
                              })
                            ) : (
                              <p className="text-xs text-muted-foreground py-2 text-center">
                                暂无匹配音色
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>

          {characters.length === 0 && (
            <div className="text-center py-8 text-muted-foreground text-sm">
              暂无角色数据，请先完成角色提取
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
