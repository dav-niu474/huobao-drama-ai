'use client'

import { motion } from 'framer-motion'
import { Sparkles, Mic, UserCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { AgentExecutionPanel } from '@/components/agent-execution-panel'
import type { VoicePanelProps } from './types'

export function VoicePanel({
  characters,
  aiLoading,
  agentExec,
  activeStep,
  handleVoiceAssign,
}: VoicePanelProps) {
  const hasVoices = characters.some((c) => c.voiceId)

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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {characters.map((char) => (
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
                      {char.personality && (
                        <p className="text-xs text-muted-foreground mb-2 truncate">{char.personality}</p>
                      )}
                      <div className="flex items-center gap-2">
                        {char.voiceId ? (
                          <div className="flex items-center gap-1.5 text-xs text-green-600">
                            <Mic className="size-3" />
                            <span>已分配: {char.voiceId}</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Mic className="size-3" />
                            <span>未分配</span>
                          </div>
                        )}
                        {char.voiceStyle && (
                          <span className="text-xs text-muted-foreground">· {char.voiceStyle}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
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
