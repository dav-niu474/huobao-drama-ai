'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Sparkles, Mic, UserCircle, Volume2, Loader2,
  ChevronDown, ChevronUp, Search, Play, Pause,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
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

// ── Helpers ───────────────────────────────────────────────────
function languageLabel(lang?: string): string {
  if (!lang) return ''
  const lower = lang.toLowerCase()
  if (lower.startsWith('zh') || lower === 'chinese') return '中文'
  if (lower.startsWith('en') || lower === 'english') return 'EN'
  if (lower.startsWith('ja') || lower === 'japanese') return '日'
  if (lower.startsWith('ko') || lower === 'korean') return '韩'
  return lang.toUpperCase().slice(0, 2)
}

function genderIcon(gender?: string) {
  if (gender === 'male') return <span className="text-blue-400 font-bold">♂</span>
  if (gender === 'female') return <span className="text-pink-400 font-bold">♀</span>
  return null
}

// ── Subtle fade + slide variants for framer-motion ────────────
const listVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.03 },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 8, scale: 0.97 },
  visible: { opacity: 1, y: 0, scale: 1 },
}

// ══════════════════════════════════════════════════════════════
// Main Component
// ══════════════════════════════════════════════════════════════
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
  const [voiceSearch, setVoiceSearch] = useState('')
  const [activeProvider, setActiveProvider] = useState<string | null>(null)

  // Audio playback state for library preview
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // Load voice catalog
  useEffect(() => {
    if (characters.length > 0) {
      setVoicesLoading(true)
      api.ai
        .listVoices(undefined, 'zh')
        .then((result) => {
          setVoices(result.voices)
          setActiveProvider(result.activeProvider)
        })
        .catch((err) => {
          console.error('Failed to load voices:', err)
        })
        .finally(() => {
          setVoicesLoading(false)
        })
    }
  }, [characters.length])

  // Build a set of currently assigned voice IDs (for highlight)
  const assignedVoiceIds = new Set(
    characters.filter((c) => c.voiceId).map((c) => c.voiceId!)
  )

  // Filter voices by gender + search
  const filteredVoices = voices.filter((v) => {
    if (voiceFilter !== 'all' && v.gender !== voiceFilter) return false
    if (voiceSearch.trim()) {
      const q = voiceSearch.toLowerCase()
      return (
        v.name.toLowerCase().includes(q) ||
        (v.description || '').toLowerCase().includes(q) ||
        (v.provider || '').toLowerCase().includes(q)
      )
    }
    return true
  })

  // Get recommended voices for a character (also apply search)
  const getRecommendedVoices = useCallback(
    (charGender: string) => {
      return voices.filter((v) => {
        if (!genderMatch(v.gender, charGender)) return false
        // Don't apply global search in character-specific list
        return true
      })
    },
    [voices]
  )

  // Track sample audio URLs by voiceId (separate from character samples)
  const [voicePreviewUrls, setVoicePreviewUrls] = useState<Record<string, string>>({})
  const [previewLoading, setPreviewLoading] = useState<string | null>(null)

  // ── Preview handler for voice library ───────────────────────
  const handlePreviewVoice = useCallback(
    async (voiceId: string) => {
      // Stop currently playing
      if (playingVoiceId === voiceId) {
        audioRef.current?.pause()
        audioRef.current = null
        setPlayingVoiceId(null)
        return
      }

      // Stop any existing audio
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }

      // Check if we already have a preview URL for this voiceId
      if (voicePreviewUrls[voiceId]) {
        const audio = new Audio(voicePreviewUrls[voiceId])
        audio.onended = () => setPlayingVoiceId(null)
        audio.onerror = () => setPlayingVoiceId(null)
        audio.play().catch(() => setPlayingVoiceId(null))
        audioRef.current = audio
        setPlayingVoiceId(voiceId)
        return
      }

      // Also check voiceSamples map (character-based samples)
      const charWithSample = characters.find(
        (c) => c.voiceId === voiceId && voiceSamples[c.id]
      )
      if (charWithSample && voiceSamples[charWithSample.id]) {
        const audio = new Audio(voiceSamples[charWithSample.id])
        audio.onended = () => setPlayingVoiceId(null)
        audio.onerror = () => setPlayingVoiceId(null)
        audio.play().catch(() => setPlayingVoiceId(null))
        audioRef.current = audio
        setPlayingVoiceId(voiceId)
        return
      }

      // Generate a new preview sample via the voice-sample API
      setPreviewLoading(voiceId)
      try {
        const result = await api.ai.generateVoiceSample('', voiceId)
        // Cache the preview URL by voiceId
        setVoicePreviewUrls((prev) => ({ ...prev, [voiceId]: result.audioUrl }))
        // Play the generated audio
        const audio = new Audio(result.audioUrl)
        audio.onended = () => setPlayingVoiceId(null)
        audio.onerror = () => setPlayingVoiceId(null)
        audio.play().catch(() => setPlayingVoiceId(null))
        audioRef.current = audio
        setPlayingVoiceId(voiceId)
      } catch (err) {
        console.error('Voice preview failed:', err)
      } finally {
        setPreviewLoading(null)
      }
    },
    [playingVoiceId, characters, voiceSamples, voicePreviewUrls]
  )

  // ── Check if a voice sample audio is available in voiceSamples ──
  const isVoiceSampleAvailable = useCallback(
    (voiceId: string) => {
      return characters.some(
        (c) => c.voiceId === voiceId && voiceSamples[c.id]
      )
    },
    [characters, voiceSamples]
  )

  // ── Check if generating sample for a specific voice ─────────
  const isGeneratingForVoice = useCallback(
    (voiceId: string) => {
      if (!generatingSample) return false
      // generatingSample is characterId — check if any char with this voiceId is generating
      return characters.some(
        (c) => c.id === generatingSample && c.voiceId === voiceId
      )
    },
    [generatingSample, characters]
  )

  // ── Empty state - no characters yet ─────────────────────────
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
          <p className="text-xs text-muted-foreground">
            请先在「提取」步骤中完成角色提取
          </p>
        </motion.div>
      </div>
    )
  }

  // ── Loading state — show Agent Execution Panel ──────────────
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

  // ════════════════════════════════════════════════════════════
  // Main content
  // ════════════════════════════════════════════════════════════
  return (
    <div className="flex flex-col h-full">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border/50">
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono text-primary/80">04</span>
          <h2 className="text-sm font-semibold">音色分配</h2>
          {hasVoices && (
            <Badge className="status-completed text-[10px] px-1.5 py-0">
              已分配
            </Badge>
          )}
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

      <ScrollArea className="flex-1 min-h-0 overflow-hidden">
        <div className="p-6 space-y-5">
          {/* ══════════════════════════════════════════════════════
              Voice Library Section — REDESIGNED
              ══════════════════════════════════════════════════════ */}
          <div className="rounded-xl border border-border/60 bg-card/50 overflow-hidden">
            {/* Library header */}
            <div className="px-4 pt-4 pb-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="size-7 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Volume2 className="size-3.5 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold leading-tight">
                      音色库
                    </h3>
                    {activeProvider && (
                      <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                        TTS 引擎: {activeProvider}
                      </p>
                    )}
                  </div>
                  <Badge variant="secondary" className="text-[10px] ml-1">
                    {filteredVoices.length}
                    {voiceFilter !== 'all' || voiceSearch
                      ? ` / ${voices.length}`
                      : ''}
                  </Badge>
                </div>
              </div>

              {/* Search + filter row */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                  <Input
                    value={voiceSearch}
                    onChange={(e) => setVoiceSearch(e.target.value)}
                    placeholder="搜索音色名称或描述…"
                    className="h-7 pl-8 text-xs rounded-lg bg-background/80"
                  />
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {(['all', 'male', 'female'] as const).map((f) => (
                    <Button
                      key={f}
                      size="sm"
                      variant={voiceFilter === f ? 'default' : 'outline'}
                      className="text-[10px] h-7 px-2.5 rounded-lg"
                      onClick={() => setVoiceFilter(f)}
                    >
                      {f === 'all' ? '全部' : f === 'male' ? '♂ 男' : '♀ 女'}
                    </Button>
                  ))}
                </div>
              </div>
            </div>

            {/* Voice card grid */}
            <div className="px-4 pb-4">
              {voicesLoading ? (
                <div className="flex items-center justify-center py-10 gap-2">
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">
                    加载音色库…
                  </span>
                </div>
              ) : filteredVoices.length > 0 ? (
                <motion.div
                  className="grid grid-cols-2 xl:grid-cols-3 gap-2"
                  variants={listVariants}
                  initial="hidden"
                  animate="visible"
                >
                  {filteredVoices.map((voice) => {
                    const isAssigned = assignedVoiceIds.has(voice.id)
                    const isPlaying = playingVoiceId === voice.id
                    const isLoadingPreview = previewLoading === voice.id
                    const hasCachedPreview = !!voicePreviewUrls[voice.id] || isVoiceSampleAvailable(voice.id)

                    return (
                      <motion.div
                        key={`${voice.provider}-${voice.id}`}
                        variants={itemVariants}
                        layout
                      >
                        <div
                          className={`
                            group relative flex flex-col gap-1.5 p-3 rounded-lg border cursor-default
                            transition-all duration-200
                            ${
                              isAssigned
                                ? 'border-primary/40 bg-primary/5 ring-1 ring-primary/20'
                                : 'border-border/40 bg-background/60 hover:border-border/80 hover:bg-background/90 hover:shadow-sm'
                            }
                          `}
                        >
                          {/* Top row: name + badges */}
                          <div className="flex items-start justify-between gap-1.5">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="font-medium text-xs leading-tight truncate">
                                {voice.name}
                              </span>
                              {voice.gender && genderIcon(voice.gender)}
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              {voice.language && (
                                <Badge
                                  variant="outline"
                                  className="text-[9px] px-1 py-0 h-4 font-mono"
                                >
                                  {languageLabel(voice.language)}
                                </Badge>
                              )}
                              {isAssigned && (
                                <Badge className="text-[8px] px-1 py-0 h-4 bg-primary text-primary-foreground">
                                  已选
                                </Badge>
                              )}
                            </div>
                          </div>

                          {/* Description */}
                          {voice.description && (
                            <p className="text-[10px] text-muted-foreground leading-snug line-clamp-2">
                              {voice.description}
                            </p>
                          )}

                          {/* Bottom row: provider + preview */}
                          <div className="flex items-center justify-between mt-0.5">
                            <span className="text-[9px] text-muted-foreground/70 font-mono truncate">
                              {voice.provider}
                            </span>
                            <Button
                              size="sm"
                              variant="ghost"
                              className={`
                                size-6 p-0 rounded-md transition-all
                                ${
                                  isPlaying
                                    ? 'text-primary bg-primary/10'
                                    : hasCachedPreview
                                    ? 'text-muted-foreground hover:text-primary hover:bg-primary/10'
                                    : 'text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/60'
                                }
                              `}
                              onClick={() => handlePreviewVoice(voice.id)}
                              disabled={isLoadingPreview}
                              title={hasCachedPreview ? '播放试听' : '生成试听'}
                            >
                              {isLoadingPreview ? (
                                <Loader2 className="size-3 animate-spin" />
                              ) : isPlaying ? (
                                <Pause className="size-3" />
                              ) : (
                                <Play className="size-3" />
                              )}
                            </Button>
                          </div>

                          {/* Playing pulse indicator */}
                          {isPlaying && (
                            <div className="absolute top-2 right-2">
                              <span className="flex size-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                                <span className="relative inline-flex rounded-full size-2 bg-primary" />
                              </span>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )
                  })}
                </motion.div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Volume2 className="size-6 text-muted-foreground/40 mb-2" />
                  <p className="text-xs text-muted-foreground">
                    {voiceSearch
                      ? '未找到匹配的音色'
                      : '暂无可用音色，请先在设置中配置TTS服务'}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* ══════════════════════════════════════════════════════
              Character Voice Assignment Cards — REDESIGNED
              ══════════════════════════════════════════════════════ */}
          <div className="space-y-3">
            {characters.map((char) => {
              const isExpanded = expandedChar === char.id
              const recommended = getRecommendedVoices(char.gender)
              const assignedVoice = voices.find((v) => v.id === char.voiceId)
              const hasAssignedVoice = !!char.voiceId
              const hasSampleAudio = !!(char.voiceId && voiceSamples[char.id])

              return (
                <motion.div
                  key={char.id}
                  layout
                  transition={{ layout: { duration: 0.2 } }}
                >
                  <Card
                    className={`
                      border transition-colors duration-200
                      ${
                        hasAssignedVoice
                          ? 'border-green-500/30 dark:border-green-500/20'
                          : 'border-amber-500/30 dark:border-amber-500/20'
                      }
                    `}
                  >
                    <CardContent className="p-3.5">
                      <div className="flex items-start gap-3">
                        {/* Character avatar */}
                        <div
                          className={`
                            size-10 rounded-full flex items-center justify-center overflow-hidden shrink-0
                            ${
                              hasAssignedVoice
                                ? 'bg-green-500/10 ring-1 ring-green-500/20'
                                : 'bg-amber-500/10 ring-1 ring-amber-500/20'
                            }
                          `}
                        >
                          {char.imageUrl ? (
                            <img
                              src={char.imageUrl}
                              alt={char.name}
                              className="size-full object-cover"
                            />
                          ) : (
                            <UserCircle
                              className={`size-6 ${
                                hasAssignedVoice
                                  ? 'text-green-600/60'
                                  : 'text-amber-600/60'
                              }`}
                            />
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          {/* Name row */}
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="font-medium text-sm">
                              {char.name}
                            </span>
                            <Badge
                              variant="outline"
                              className="text-[10px] px-1 py-0"
                            >
                              {char.gender === 'male'
                                ? '♂ 男'
                                : char.gender === 'female'
                                ? '♀ 女'
                                : '未知'}
                            </Badge>
                            {char.role && (
                              <Badge
                                variant="outline"
                                className="text-[10px] px-1 py-0"
                              >
                                {char.role === 'protagonist'
                                  ? '主角'
                                  : char.role === 'antagonist'
                                  ? '反派'
                                  : char.role === 'supporting'
                                  ? '配角'
                                  : '龙套'}
                              </Badge>
                            )}
                          </div>

                          {/* Voice style description */}
                          {char.voiceStyle && (
                            <p className="text-[10px] text-muted-foreground mb-1.5 truncate">
                              声音特征: {char.voiceStyle}
                            </p>
                          )}

                          {/* Current voice assignment */}
                          <div className="flex items-center gap-2 mb-2">
                            {hasAssignedVoice ? (
                              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 text-xs text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/30 px-2 py-0.5 rounded-md">
                                  <Mic className="size-3 shrink-0" />
                                  <span className="font-medium truncate">
                                    {assignedVoice?.name || char.voiceId}
                                  </span>
                                </div>
                                {/* 试听 button */}
                                {hasSampleAudio && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="size-6 p-0 shrink-0 text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-950/30"
                                    onClick={() => {
                                      const audio = new Audio(
                                        voiceSamples[char.id]
                                      )
                                      audio.play()
                                    }}
                                    title="试听已选音色"
                                  >
                                    <Volume2 className="size-3" />
                                  </Button>
                                )}
                                {!hasSampleAudio && char.voiceId && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="size-6 p-0 shrink-0 text-muted-foreground hover:text-primary"
                                    disabled={generatingSample === char.id}
                                    onClick={() => {
                                      if (char.voiceId) {
                                        handleGenerateVoiceSample(
                                          char.id,
                                          char.voiceId
                                        )
                                      }
                                    }}
                                    title="生成试听"
                                  >
                                    {generatingSample === char.id ? (
                                      <Loader2 className="size-3 animate-spin" />
                                    ) : (
                                      <Volume2 className="size-3" />
                                    )}
                                  </Button>
                                )}
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                                <Mic className="size-3" />
                                <span>未分配</span>
                              </div>
                            )}
                          </div>

                          {/* Toggle manual assign */}
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-[10px] h-6 px-2 w-full rounded-md"
                            onClick={() =>
                              setExpandedChar(isExpanded ? null : char.id)
                            }
                          >
                            {isExpanded ? (
                              <>
                                <ChevronUp className="size-3" /> 收起音色选择
                              </>
                            ) : (
                              <>
                                <ChevronDown className="size-3" /> 手动选择音色
                              </>
                            )}
                          </Button>

                          {/* ── Expanded voice selection — card grid ── */}
                          <AnimatePresence>
                            {isExpanded && (
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                transition={{ duration: 0.2 }}
                                className="overflow-hidden"
                              >
                                <div className="mt-3 pt-3 border-t border-border/40">
                                  {recommended.length > 0 ? (
                                    <motion.div
                                      className="grid grid-cols-2 gap-1.5 max-h-[260px] overflow-y-auto pr-1"
                                      variants={listVariants}
                                      initial="hidden"
                                      animate="visible"
                                    >
                                      {recommended.map((voice) => {
                                        const isSelected =
                                          char.voiceId === voice.id
                                        return (
                                          <motion.div
                                            key={`${voice.provider}-${voice.id}`}
                                            variants={itemVariants}
                                          >
                                            <div
                                              className={`
                                                flex flex-col gap-1 p-2 rounded-md text-xs cursor-pointer
                                                transition-all duration-150 border
                                                ${
                                                  isSelected
                                                    ? 'bg-primary/10 border-primary/30 ring-1 ring-primary/20'
                                                    : 'bg-background/50 border-transparent hover:bg-muted/60 hover:border-border/40'
                                                }
                                              `}
                                              onClick={() => {
                                                if (!isSelected) {
                                                  handleAssignVoice(
                                                    char.id,
                                                    voice.id
                                                  )
                                                }
                                              }}
                                            >
                                              {/* Name + gender + language */}
                                              <div className="flex items-center gap-1 min-w-0">
                                                {isSelected ? (
                                                  <Mic className="size-3 text-primary shrink-0" />
                                                ) : (
                                                  <Mic className="size-3 text-muted-foreground shrink-0" />
                                                )}
                                                <span className="font-medium truncate">
                                                  {voice.name}
                                                </span>
                                                {voice.gender &&
                                                  genderIcon(voice.gender)}
                                                {voice.language && (
                                                  <Badge
                                                    variant="outline"
                                                    className="text-[8px] px-0.5 py-0 h-3.5 font-mono shrink-0"
                                                  >
                                                    {languageLabel(
                                                      voice.language
                                                    )}
                                                  </Badge>
                                                )}
                                              </div>

                                              {/* Description + preview */}
                                              <div className="flex items-center justify-between gap-1">
                                                {voice.description ? (
                                                  <span className="text-[9px] text-muted-foreground truncate">
                                                    {voice.description}
                                                  </span>
                                                ) : (
                                                  <span className="text-[9px] text-muted-foreground/50">
                                                    {voice.provider}
                                                  </span>
                                                )}
                                                <Button
                                                  size="sm"
                                                  variant="ghost"
                                                  className="size-4 p-0 shrink-0 text-muted-foreground hover:text-primary"
                                                  onClick={(e) => {
                                                    e.stopPropagation()
                                                    handleGenerateVoiceSample(
                                                      char.id,
                                                      voice.id
                                                    )
                                                  }}
                                                  disabled={
                                                    generatingSample ===
                                                    char.id
                                                  }
                                                  title="试听"
                                                >
                                                  {generatingSample ===
                                                  char.id ? (
                                                    <Loader2 className="size-2.5 animate-spin" />
                                                  ) : (
                                                    <Volume2 className="size-2.5" />
                                                  )}
                                                </Button>
                                              </div>
                                            </div>
                                          </motion.div>
                                        )
                                      })}
                                    </motion.div>
                                  ) : (
                                    <div className="flex flex-col items-center py-4 text-center">
                                      <Mic className="size-4 text-muted-foreground/30 mb-1" />
                                      <p className="text-[10px] text-muted-foreground">
                                        暂无匹配音色
                                      </p>
                                    </div>
                                  )}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
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
