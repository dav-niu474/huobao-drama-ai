'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAppStore, type EpisodeDetail, type Character, type Scene, type Storyboard, type LockedConfig } from '@/lib/store'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { usePermissions } from '@/hooks/use-permissions'
import { useAgentExecution } from '@/components/agent-execution-panel'
import { ModelSelector } from '@/components/model-selector'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import {
  ArrowLeft,
  Loader2,
  FileText,
  Users,
  Film,
  Clapperboard,
  Check,
  ChevronRight,
  ChevronLeft,
  PanelLeftClose,
  PanelLeftOpen,
  Mic,
  Lock,
  LockOpen,
} from 'lucide-react'
import { UserMenu } from '@/components/user-menu'
import { ResultDialog, EMPTY_RESULT_DIALOG, type ResultDialogState } from '@/components/episode/result-dialog'

// Sub-components
import { ScriptPanel } from '@/components/episode/script-panel'
import { ExtractPanel } from '@/components/episode/extract-panel'
import { VoicePanel } from '@/components/episode/voice-panel'
import { StoryboardPanel } from '@/components/episode/storyboard-panel'
import { ProductionPanel } from '@/components/episode/production-panel'

// Shared types & helpers
import type { StepKey, StepDef, UploadOptions, BatchProgress, PipelineStepKey, PipelineStatus, VoiceInfo, MergeStatus, GridConfig, GridGenerationState } from '@/components/episode/types'
import { STEPS, PIPELINE_STEPS, PIPELINE_TO_STEP_MAP, statusBadge, panelVariants } from '@/components/episode/helpers'

// ── Main component ───────────────────────────────────────────

export function EpisodeWorkspace() {
  const {
    selectedDramaId,
    selectedEpisodeId,
    currentEpisode,
    setCurrentEpisode,
    currentDrama,
    navigateToProject,
    aiLoading,
    setAiLoading,
  } = useAppStore()
  const { toast } = useToast()
  const perms = usePermissions()

  const [activeStep, setActiveStep] = useState<StepKey>('raw')
  const [activePipelineStep, setActivePipelineStep] = useState<PipelineStepKey>('raw_content')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [rawContent, setRawContent] = useState('')
  const [scriptContent, setScriptContent] = useState('')
  const [characters, setCharacters] = useState<Character[]>([])
  const [scenes, setScenes] = useState<Scene[]>([])
  const [storyboards, setStoryboards] = useState<Storyboard[]>([])
  const [saving, setSaving] = useState(false)
  const [generatingCharImg, setGeneratingCharImg] = useState<string | null>(null)
  const [generatingSceneImg, setGeneratingSceneImg] = useState<string | null>(null)
  const [generatingShotImg, setGeneratingShotImg] = useState<string | null>(null)
  const [generatingVideo, setGeneratingVideo] = useState<string | null>(null)
  const [generatingTts, setGeneratingTts] = useState<string | null>(null)
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [uploadingField, setUploadingField] = useState<string | null>(null)
  const [resultDialog, setResultDialog] = useState<ResultDialogState>(EMPTY_RESULT_DIALOG)

  // Helper to show result dialog for major AI flow completions
  const showResultDialog = (status: ResultDialogState['status'], title: string, description: string, details?: string[]) => {
    setResultDialog({ open: true, status, title, description, details })
  }

  // Pipeline status state
  const [pipelineStatus, setPipelineStatus] = useState<PipelineStatus | null>(null)

  // Voice management state
  const [voices, setVoices] = useState<VoiceInfo[]>([])
  const [activeTtsProvider, setActiveTtsProvider] = useState<string | null>(null)
  const [voiceSamples, setVoiceSamples] = useState<Record<string, string>>({})
  const [generatingSample, setGeneratingSample] = useState<string | null>(null)

  // Agent execution hook — manages SSE streaming with rich log rendering
  const agentExec = useAgentExecution()
  const [batchProgress, setBatchProgress] = useState<BatchProgress | null>(null)
  const [generatingAllTts, setGeneratingAllTts] = useState(false)
  const [composing, setComposing] = useState<string | null>(null)
  const [composingAll, setComposingAll] = useState(false)
  const [ffmpegAvailable, setFfmpegAvailable] = useState(false)
  const [merging, setMerging] = useState(false)
  const [mergeStatus, setMergeStatus] = useState<MergeStatus | null>(null)
  const [previewMode, setPreviewMode] = useState(false)
  const [currentPreviewShot, setCurrentPreviewShot] = useState(0)
  const [exporting, setExporting] = useState(false)
  const previewVideoRef = useRef<HTMLVideoElement>(null)
  const previewAudioRef = useRef<HTMLAudioElement>(null)

  // Grid generation state
  const [gridState, setGridState] = useState<GridGenerationState>({
    isGeneratingGrid: false,
    isSplittingGrid: false,
    gridConfig: { mode: 'first_frame', rows: 2, cols: 2 },
  })

  // Workspace model selection - persisted in global store + localStorage
  const { workspaceModels, setWorkspaceModel, initWorkspaceModels, episodeLockedConfig, setEpisodeLockedConfig } = useAppStore()

  // Initialize workspace models from active provider config (only fills empty fields)
  useEffect(() => {
    api.ai.getActiveModels().then((models) => {
      initWorkspaceModels({
        llm: models.llm?.model || '',
        image: models.image?.model || '',
        video: models.video?.model || '',
        tts: models.tts?.model || '',
      })
    }).catch(() => {})
  }, [initWorkspaceModels])

  // ── Parse & sync locked config from episode data ───────────
  const isConfigLocked = episodeLockedConfig !== null

  // When episode loads, parse lockedConfig and apply to workspace if locked
  useEffect(() => {
    if (!currentEpisode) return
    const raw = currentEpisode.lockedConfig
    if (raw && raw !== 'null') {
      try {
        const parsed: LockedConfig = JSON.parse(raw)
        if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
          setEpisodeLockedConfig(parsed)
          // Override workspace models with locked values
          for (const [k, v] of Object.entries(parsed)) {
            const key = k as keyof typeof workspaceModels
            if (v && key in workspaceModels) {
              setWorkspaceModel(key, v)
            }
          }
          return
        }
      } catch { /* ignore parse errors */ }
    }
    // No valid lock — clear
    setEpisodeLockedConfig(null)
  }, [currentEpisode?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Lock / Unlock handlers ──────────────────────────────────
  const handleLockConfig = async () => {
    if (!selectedEpisodeId) return
    const config: LockedConfig = {
      llm: workspaceModels.llm || undefined,
      image: workspaceModels.image || undefined,
      video: workspaceModels.video || undefined,
      tts: workspaceModels.tts || undefined,
    }
    // Remove undefined keys
    const clean: LockedConfig = {}
    for (const [k, v] of Object.entries(config)) {
      if (v) (clean as Record<string, string>)[k] = v
    }
    try {
      await api.episodes.update(selectedEpisodeId, { lockedConfig: JSON.stringify(clean) } as any)
      setEpisodeLockedConfig(clean)
      toast({ title: 'AI配置已锁定', description: '本集所有AI操作将使用锁定的模型' })
    } catch (err) {
      toast({ title: '锁定失败', description: String(err), variant: 'destructive' })
    }
  }

  const handleUnlockConfig = async () => {
    if (!selectedEpisodeId) return
    try {
      await api.episodes.update(selectedEpisodeId, { lockedConfig: 'null' } as any)
      setEpisodeLockedConfig(null)
      toast({ title: 'AI配置已解锁', description: '将使用全局默认模型' })
    } catch (err) {
      toast({ title: '解锁失败', description: String(err), variant: 'destructive' })
    }
  }

  // ── Fetch episode data ─────────────────────────────────────

  const fetchEpisode = useCallback(async () => {
    if (!selectedEpisodeId) return
    try {
      const detail = await api.episodes.get(selectedEpisodeId)
      setCurrentEpisode(detail)
      // Sync local state from episode
      setRawContent(detail.rawContent ?? '')
      setScriptContent(detail.scriptContent ?? '')
      // Fetch characters & scenes from drama
      if (selectedDramaId) {
        const dramaDetail = await api.dramas.get(selectedDramaId)
        setCharacters(dramaDetail.characters ?? [])
        setScenes(dramaDetail.scenes ?? [])
      }
      setStoryboards(detail.storyboards ?? [])
    } catch (err) {
      toast({ title: '加载集数据失败', description: String(err), variant: 'destructive' })
    }
  }, [selectedEpisodeId, selectedDramaId, setCurrentEpisode, toast])

  useEffect(() => {
    fetchEpisode()
  }, [fetchEpisode])

  // ── Fetch pipeline status ────────────────────────────────────

  const fetchPipelineStatus = useCallback(async () => {
    if (!selectedEpisodeId) return
    try {
      const raw = await api.episodes.pipelineStatus(selectedEpisodeId)
      // api.ts already maps camelCase→snake_case keys and status: done→completed, partial→active
      // raw.pipeline has snake_case keys with { status: 'pending'|'active'|'completed', completed, total }
      const normalized: PipelineStatus = {
        steps: raw.pipeline as Record<PipelineStepKey, PipelineStepStatus> ?? {} as Record<PipelineStepKey, PipelineStepStatus>,
        summary: {
          totalSteps: raw.totalSteps ?? 11,
          completedSteps: raw.completedSteps ?? 0,
          partialSteps: 0,
          pendingSteps: (raw.totalSteps ?? 11) - (raw.completedSteps ?? 0),
          overallProgress: raw.progressPercent ?? 0,
          currentStep: '',
        },
        ffmpegAvailable: false,
        // Alias for code that references pipelineStatus.pipeline
        pipeline: raw.pipeline as Record<PipelineStepKey, PipelineStepStatus> ?? {} as Record<PipelineStepKey, PipelineStepStatus>,
        completedSteps: raw.completedSteps ?? 0,
        totalSteps: raw.totalSteps ?? 11,
        progressPercent: raw.progressPercent ?? 0,
      }
      setPipelineStatus(normalized)
    } catch {
      // Silently fail — pipeline status is not critical
    }
  }, [selectedEpisodeId])

  useEffect(() => {
    fetchPipelineStatus()
  }, [fetchPipelineStatus])

  // Re-fetch pipeline status when data changes
  useEffect(() => {
    fetchPipelineStatus()
  }, [rawContent, scriptContent, characters, scenes, storyboards, fetchPipelineStatus])

  // ── Fetch merge status & FFmpeg availability ────────────────

  const fetchMergeStatus = useCallback(async () => {
    if (!selectedEpisodeId) return
    try {
      const res = await fetch(`/api/episodes/${selectedEpisodeId}/merge`)
      if (res.ok) {
        const data = await res.json()
        setFfmpegAvailable(data.ffmpegAvailable ?? false)
        setMergeStatus({
          canMerge: data.canMerge ?? false,
          canMergePartial: data.canMergePartial ?? false,
          totalShots: data.shots?.total ?? 0,
          composedShots: data.shots?.composed ?? 0,
          ffmpegAvailable: data.ffmpegAvailable ?? false,
          latestMerge: data.merge
            ? {
                status: data.merge.status,
                mergedUrl: data.merge.mergedUrl,
                duration: data.merge.duration,
              }
            : null,
        })
      }
    } catch {
      // Silently fail
    }
  }, [selectedEpisodeId])

  useEffect(() => {
    fetchMergeStatus()
  }, [fetchMergeStatus])

  // Re-fetch merge status when storyboards change
  useEffect(() => {
    fetchMergeStatus()
  }, [storyboards, fetchMergeStatus])

  // ── Fetch available voices ───────────────────────────────────

  useEffect(() => {
    api.ai.listVoices().then((result) => {
      setVoices(result.voices)
      setActiveTtsProvider(result.activeProvider)
    }).catch(() => {})
  }, [])

  // ── Step completion logic ──────────────────────────────────

  const isStepCompleted = useCallback(
    (step: StepKey): boolean => {
      switch (step) {
        case 'raw':
          return !!rawContent.trim()
        case 'rewrite':
          return !!scriptContent.trim()
        case 'extract':
          return characters.length > 0 || scenes.length > 0
        case 'voice':
          return characters.length > 0 && characters.some((c) => c.voiceId)
        case 'storyboard':
          return storyboards.length > 0
        case 'production':
          return storyboards.some((s) => s.composedUrl || s.videoUrl)
        default:
          return false
      }
    },
    [rawContent, scriptContent, characters, scenes, storyboards]
  )

  const completedCount = STEPS.reduce((acc, s) => {
    if (s.subSteps) {
      return acc + s.subSteps.filter((ss) => isStepCompleted(ss.key)).length
    }
    return acc + (isStepCompleted(s.key) ? 1 : 0)
  }, 0)
  const totalSteps = STEPS.reduce((acc, s) => acc + (s.subSteps?.length ?? 1), 0)
  const progressPercent = Math.round((completedCount / totalSteps) * 100)

  // ── Pipeline step status helper ────────────────────────────

  const getPipelineStepStatus = useCallback(
    (key: PipelineStepKey): 'pending' | 'active' | 'completed' => {
      if (pipelineStatus?.pipeline?.[key]) {
        return pipelineStatus.pipeline[key].status
      }
      return 'pending'
    },
    [pipelineStatus]
  )

  const pipelineCompletedCount = pipelineStatus?.completedSteps ?? 0
  const pipelineTotalCount = pipelineStatus?.totalSteps ?? 11

  // ── Navigate to pipeline step ──────────────────────────────

  const handlePipelineStepClick = useCallback(
    (key: PipelineStepKey) => {
      setActivePipelineStep(key)
      const legacyStep = PIPELINE_TO_STEP_MAP[key] as StepKey
      setActiveStep(legacyStep)
    },
    []
  )

  // ── Pipeline step navigation (Prev/Next) ───────────────────

  const currentPipelineIndex = PIPELINE_STEPS.findIndex((s) => s.key === activePipelineStep)

  const handlePrevStep = useCallback(() => {
    if (currentPipelineIndex > 0) {
      const prevStep = PIPELINE_STEPS[currentPipelineIndex - 1]
      handlePipelineStepClick(prevStep.key)
    }
  }, [currentPipelineIndex, handlePipelineStepClick])

  const handleNextStep = useCallback(() => {
    if (currentPipelineIndex < PIPELINE_STEPS.length - 1) {
      const nextStep = PIPELINE_STEPS[currentPipelineIndex + 1]
      handlePipelineStepClick(nextStep.key)
    }
  }, [currentPipelineIndex, handlePipelineStepClick])

  // ── Save raw content ───────────────────────────────────────

  const handleSaveRaw = async () => {
    if (!selectedEpisodeId) return
    setSaving(true)
    try {
      await api.episodes.update(selectedEpisodeId, { rawContent })
      toast({ title: '内容已保存' })
      fetchEpisode()
    } catch (err) {
      toast({ title: '保存失败', description: String(err), variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  // ── Save script content ────────────────────────────────────

  const handleSaveScript = async () => {
    if (!selectedEpisodeId) return
    setSaving(true)
    try {
      await api.episodes.update(selectedEpisodeId, { scriptContent })
      toast({ title: '剧本已保存' })
      fetchEpisode()
    } catch (err) {
      toast({ title: '保存失败', description: String(err), variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  // ── AI: Rewrite script (via Agent) ──────────────────────────

  const handleRewrite = async () => {
    if (!selectedEpisodeId || !selectedDramaId) return
    setAiLoading(true)
    try {
      await agentExec.startAgent(
        'script_rewriter',
        selectedEpisodeId,
        selectedDramaId,
        '请将原始内容改写为标准剧本格式，使用read_episode_script工具读取内容，改写后用save_script工具保存。',
        { model: workspaceModels.llm || undefined }
      )
      // Check if agent reported an error
      const rewriteError = agentExec.errors['script_rewriter']
      if (rewriteError) {
        toast({ title: '剧本改写失败', description: rewriteError, variant: 'destructive' })
        return
      }
      await fetchEpisode()
      setActiveStep('rewrite')
      showResultDialog('success', '剧本改写完成', 'AI已将原始内容改写为标准剧本格式，结果已自动保存。')
    } catch (err) {
      toast({ title: '改写失败', description: String(err), variant: 'destructive' })
    } finally {
      setAiLoading(false)
    }
  }

  // ── AI: Skip rewrite (copy raw → script) ───────────────────

  const handleSkipRewrite = async () => {
    if (!selectedEpisodeId) return
    setAiLoading(true)
    try {
      await api.episodes.update(selectedEpisodeId, { scriptContent: rawContent })
      toast({ title: '已使用原始内容作为剧本' })
      await fetchEpisode()
      setActiveStep('rewrite')
    } catch (err) {
      toast({ title: '操作失败', description: String(err), variant: 'destructive' })
    } finally {
      setAiLoading(false)
    }
  }

  // ── AI: Extract (via Agent) ─────────────────────────────────

  const handleExtract = async () => {
    if (!selectedEpisodeId || !selectedDramaId) return
    setAiLoading(true)
    try {
      await agentExec.startAgent(
        'extractor',
        selectedEpisodeId,
        selectedDramaId,
        '请从剧本中提取所有角色和场景信息。先使用read_script_for_extraction读取剧本，再使用read_existing_characters和read_existing_scenes查看已有数据，最后用save_characters和save_scenes保存提取结果（注意去重）.',
        { model: workspaceModels.llm || undefined }
      )
      // Check if agent reported an error
      const extractError = agentExec.errors['extractor']
      if (extractError) {
        toast({ title: '提取失败', description: extractError, variant: 'destructive' })
        return
      }
      await fetchEpisode()
      showResultDialog('success', '角色与场景提取完成', 'AI已从剧本中提取角色和场景信息，结果已自动保存。')
    } catch (err) {
      toast({ title: '提取失败', description: String(err), variant: 'destructive' })
    } finally {
      setAiLoading(false)
    }
  }

  // ── AI: Voice assign (via Agent) ─────────────────────────────

  const handleVoiceAssign = async () => {
    if (!selectedEpisodeId || !selectedDramaId) return
    setAiLoading(true)
    try {
      await agentExec.startAgent(
        'voice_assigner',
        selectedEpisodeId,
        selectedDramaId,
        '请为所有角色分配合适的TTS音色。先使用get_characters获取角色列表，使用list_available_voices获取可用音色，然后根据角色性别、年龄、性格特征为每个角色分配最合适的音色。',
        { model: workspaceModels.llm || undefined }
      )
      // Check if agent reported an error
      const voiceError = agentExec.errors['voice_assigner']
      if (voiceError) {
        toast({ title: '音色分配失败', description: voiceError, variant: 'destructive' })
        return
      }
      await fetchEpisode()
      showResultDialog('success', '音色分配完成', 'AI已为所有角色分配合适的TTS音色，结果已自动保存。')
    } catch (err) {
      toast({ title: '音色分配失败', description: String(err), variant: 'destructive' })
    } finally {
      setAiLoading(false)
    }
  }

  // ── Manual voice assignment ──────────────────────────────────

  const handleAssignVoice = async (characterId: string, voiceId: string) => {
    try {
      await fetch(`/api/dramas/${selectedDramaId}/characters`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ characterId, voiceId }),
      })
      toast({ title: '音色已分配' })
      await fetchEpisode()
    } catch (err) {
      toast({ title: '音色分配失败', description: String(err), variant: 'destructive' })
    }
  }

  // ── Generate voice sample ────────────────────────────────────

  const handleGenerateVoiceSample = async (characterId: string, voiceId: string) => {
    setGeneratingSample(characterId)
    try {
      const result = await api.ai.generateVoiceSample(characterId, voiceId)
      setVoiceSamples((prev) => ({ ...prev, [characterId]: result.audioUrl }))
      toast({ title: '语音样例已生成' })
    } catch (err) {
      toast({ title: '语音样例生成失败', description: String(err), variant: 'destructive' })
    } finally {
      setGeneratingSample(null)
    }
  }

  // ── Batch generate samples ───────────────────────────────────

  const handleBatchGenerateSamples = async () => {
    const charactersWithVoice = characters.filter((c) => c.voiceId)
    if (charactersWithVoice.length === 0) {
      toast({ title: '没有已分配音色的角色' })
      return
    }
    setBatchProgress({ current: 0, total: charactersWithVoice.length, message: '生成语音样例中...' })
    let successCount = 0
    for (let i = 0; i < charactersWithVoice.length; i++) {
      const char = charactersWithVoice[i]
      setGeneratingSample(char.id)
      setBatchProgress({ current: i + 1, total: charactersWithVoice.length, message: `生成样例 ${i + 1}/${charactersWithVoice.length}...` })
      try {
        const result = await api.ai.generateVoiceSample(char.id, char.voiceId!)
        setVoiceSamples((prev) => ({ ...prev, [char.id]: result.audioUrl }))
        successCount++
      } catch {
        // Continue with next
      }
    }
    setGeneratingSample(null)
    setBatchProgress(null)
    toast({ title: `${successCount}/${charactersWithVoice.length}个语音样例生成完毕` })
  }

  // ── AI: Generate storyboard (via Agent) ──────────────────────

  const handleGenerateStoryboard = async () => {
    if (!selectedEpisodeId || !selectedDramaId) return
    setAiLoading(true)
    try {
      const result = await agentExec.startAgent(
        'storyboard_breaker',
        selectedEpisodeId,
        selectedDramaId,
        '请将剧本拆解为分镜序列。先使用read_storyboard_context读取剧本、角色和场景信息，然后为每个镜头生成完整的分镜数据。⚠️重要：每个分镜的imagePrompt必须是6维度专业英文提示词（风格+构图+角色+场景+光线+画质），videoPrompt必须使用3秒分段XML格式。一步到位，无需二次增强。最后用save_storyboards保存所有分镜。',
        { model: workspaceModels.llm || undefined }
      )
      // Check both top-level errors and tool errors
      const agentError = agentExec.errors['storyboard_breaker']
      if (agentError) {
        toast({ title: '分镜生成失败', description: agentError, variant: 'destructive' })
        return
      }
      if (result.hadErrors && result.toolErrors.length > 0) {
        // Show tool errors but still check if data was partially saved
        const errorSummary = result.toolErrors.slice(0, 3).join('; ')
        toast({ title: '分镜生成部分失败', description: errorSummary, variant: 'destructive' })
      }
      await fetchEpisode()
      // Verify storyboards were actually saved
      const detail = await api.episodes.get(selectedEpisodeId)
      const savedCount = detail.storyboards?.length ?? 0
      if (savedCount > 0) {
        if (result.hadErrors) {
          showResultDialog('warning', '分镜生成部分完成', `成功保存 ${savedCount} 个分镜镜头，但有部分错误。`, [
            `共 ${savedCount} 个镜头已保存`,
            '部分镜头可能需要手动调整',
            '可在下方列表中查看和编辑',
          ])
        } else {
          showResultDialog('success', '分镜生成完成', `成功生成 ${savedCount} 个分镜镜头，结果已保存。`, [
            `共 ${savedCount} 个镜头`,
            '每个镜头包含图片提示词和视频提示词',
            '可在下方列表中查看和编辑',
          ])
        }
      } else {
        // No storyboards saved — provide actionable diagnostics
        const diagInfo = result.toolErrors.length > 0
          ? `错误详情：${result.toolErrors.slice(0, 2).join('；')}`
          : 'AI可能未能成功调用保存工具，请重新生成或检查网络。'
        showResultDialog('error', '分镜生成失败', diagInfo)
      }
    } catch (err) {
      toast({ title: '分镜生成失败', description: String(err), variant: 'destructive' })
    } finally {
      setAiLoading(false)
    }
  }

  // ── AI: Enhance single shot prompt (via storyboard_breaker Agent) ──

  const handleEnhanceShotPrompt = async (storyboard: Storyboard) => {
    if (!selectedEpisodeId || !selectedDramaId) return
    setAiLoading(true)
    try {
      await agentExec.startAgent(
        'storyboard_breaker',
        selectedEpisodeId,
        selectedDramaId,
        `请为镜头${storyboard.shotNumber}重新生成更专业的imagePrompt和videoPrompt。先使用read_storyboard_context读取上下文，然后使用update_storyboard更新镜头${storyboard.shotNumber}的提示词。imagePrompt必须包含6个维度（风格+构图+角色+场景+光线+画质），videoPrompt必须使用XML格式。`,
        { model: workspaceModels.llm || undefined }
      )
      // Check if agent reported an error
      const enhanceError = agentExec.errors['storyboard_breaker']
      if (enhanceError) {
        toast({ title: '提示词增强失败', description: enhanceError, variant: 'destructive' })
        return
      }
      await fetchEpisode()
      showResultDialog('success', `镜头 ${storyboard.shotNumber} 提示词已增强`, 'AI已重新生成更专业的图片和视频提示词，结果已自动更新。')
    } catch (err) {
      toast({ title: '提示词增强失败', description: String(err), variant: 'destructive' })
    } finally {
      setAiLoading(false)
    }
  }

  // ── Update storyboard field (inline editing) ──────────────────

  const handleUpdateStoryboard = async (id: string, data: Partial<Storyboard>) => {
    try {
      await api.storyboards.update(id, data)
      await fetchEpisode()
    } catch (err) {
      toast({ title: '更新失败', description: String(err), variant: 'destructive' })
    }
  }

  // ── Client-side async polling helper ──────────────────────

  const pollAsyncTask = async (
    category: 'image' | 'video',
    taskId: string,
    interval = 5000,
    maxPolls = 60
  ): Promise<{ imageBase64?: string; videoUrl?: string } | null> => {
    for (let i = 0; i < maxPolls; i++) {
      await new Promise((r) => setTimeout(r, interval))
      try {
        const pollResult = await api.ai.pollStatus(category, taskId)
        if (pollResult.status === 'completed') {
          return { imageBase64: pollResult.imageBase64, videoUrl: pollResult.videoUrl }
        }
        if (pollResult.status === 'failed') {
          throw new Error(pollResult.error || '生成失败')
        }
      } catch (err) {
        if (i === maxPolls - 1) throw err
      }
    }
    throw new Error('生成超时，请稍后重试')
  }

  // ── Client-side grid status polling helper ─────────────────

  const pollGridStatus = async (
    taskId: string,
    imageGenerationId: string | undefined,
    interval = 5000,
    maxPolls = 60
  ): Promise<{ imageUrl: string }> => {
    for (let i = 0; i < maxPolls; i++) {
      await new Promise((r) => setTimeout(r, interval))
      try {
        const result = await api.grid.status(taskId, imageGenerationId)
        if (result.status === 'completed' && result.imageUrl) {
          return { imageUrl: result.imageUrl }
        }
        if (result.status === 'failed') {
          throw new Error(result.error || '宫格图生成失败')
        }
      } catch (err) {
        if (i === maxPolls - 1) throw err
      }
    }
    throw new Error('宫格图生成超时，请稍后重试')
  }

  // ── AI: Generate scene image ───────────────────────────────

  const handleGenerateSceneImage = async (sceneId: string) => {
    setGeneratingSceneImg(sceneId)
    try {
      const result = await api.ai.generateSceneImage(sceneId) as Record<string, unknown>
      if (result.status === 'processing' && result.taskId) {
        toast({ title: '场景图生成中...' })
        await pollAsyncTask('image', result.taskId as string)
      }
      toast({ title: '场景图已生成' })
      await fetchEpisode()
    } catch (err) {
      toast({ title: '场景图生成失败', description: String(err), variant: 'destructive' })
    } finally {
      setGeneratingSceneImg(null)
    }
  }

  // ── AI: Generate character image ───────────────────────────

  const handleGenerateCharImage = async (charId: string) => {
    setGeneratingCharImg(charId)
    try {
      const result = await api.ai.generateCharacterImage(charId) as Record<string, unknown>
      if (result.status === 'processing' && result.taskId) {
        toast({ title: '角色头像生成中...' })
        await pollAsyncTask('image', result.taskId as string)
      }
      toast({ title: '角色头像已生成' })
      await fetchEpisode()
    } catch (err) {
      toast({ title: '头像生成失败', description: String(err), variant: 'destructive' })
    } finally {
      setGeneratingCharImg(null)
    }
  }

  // ── AI: Generate character sheet (三视图) ──────────────────

  const handleGenerateCharSheet = async (characterId: string) => {
    setGeneratingCharImg(characterId)
    try {
      await api.ai.generateCharacterSheet(characterId)
      toast({ title: '角色设定图已生成' })
      await fetchEpisode()
    } catch (err) {
      toast({ title: '角色设定图生成失败', description: String(err), variant: 'destructive' })
    } finally {
      setGeneratingCharImg(null)
    }
  }

  // ── AI: Generate shot image ────────────────────────────────

  const handleGenerateShotImage = async (storyboard: Storyboard) => {
    if (!storyboard.imagePrompt) {
      toast({ title: '该镜头没有图片提示词', variant: 'destructive' })
      return
    }
    setGeneratingShotImg(storyboard.id)
    try {
      const result = await api.ai.generateImage(
        storyboard.imagePrompt,
        '1024x576',
        selectedEpisodeId || undefined,
        storyboard.dialogueChar || undefined,
      ) as Record<string, unknown>
      if (result.status === 'processing' && result.taskId) {
        toast({ title: `镜头 ${storyboard.shotNumber} 图片生成中...` })
        const pollResult = await pollAsyncTask('image', result.taskId as string)
        if (pollResult?.imageBase64) {
          await api.storyboards.update(storyboard.id, { firstFrameUrl: `data:image/png;base64,${pollResult.imageBase64}` })
        }
      } else {
        await api.storyboards.update(storyboard.id, { firstFrameUrl: result.imageUrl as string })
      }
      toast({ title: `镜头 ${storyboard.shotNumber} 图片已生成` })
      await fetchEpisode()
    } catch (err) {
      toast({ title: '图片生成失败', description: String(err), variant: 'destructive' })
    } finally {
      setGeneratingShotImg(null)
    }
  }

  // ── AI: Generate all shot images ───────────────────────────

  const handleGenerateAllImages = async () => {
    const pending = storyboards.filter((s) => !s.firstFrameUrl && s.imagePrompt)
    if (pending.length === 0) {
      toast({ title: '没有可生成的镜头图片' })
      return
    }
    setBatchProgress({ current: 0, total: pending.length, message: '生成图片中...' })
    let successCount = 0
    for (let i = 0; i < pending.length; i++) {
      const sb = pending[i]
      setGeneratingShotImg(sb.id)
      setBatchProgress({ current: i + 1, total: pending.length, message: `生成图片 ${i + 1}/${pending.length}...` })
      try {
        const result = await api.ai.generateImage(
          sb.imagePrompt!,
          '1024x576',
          selectedEpisodeId || undefined,
          sb.dialogueChar || undefined,
        ) as Record<string, unknown>
        if (result.status === 'processing' && result.taskId) {
          setBatchProgress({ current: i + 1, total: pending.length, message: `图片 ${i + 1}/${pending.length} 异步生成中，等待结果...` })
          const pollResult = await pollAsyncTask('image', result.taskId as string)
          if (pollResult?.imageBase64) {
            await api.storyboards.update(sb.id, { firstFrameUrl: `data:image/png;base64,${pollResult.imageBase64}` })
          }
          successCount++
        } else {
          await api.storyboards.update(sb.id, { firstFrameUrl: result.imageUrl as string })
          successCount++
        }
      } catch {
        // Continue
      }
    }
    setGeneratingShotImg(null)
    setBatchProgress(null)
    toast({ title: `${successCount}/${pending.length}个镜头图片生成完毕` })
    await fetchEpisode()
  }

  // ── AI: Grid image generation ──────────────────────────────

  const handleGridGenerate = async (config: GridConfig) => {
    if (!selectedEpisodeId) return
    const { mode, rows, cols } = config
    const totalCells = rows * cols

    // Select shots without firstFrameUrl that have an imagePrompt
    const pendingShots = storyboards.filter((s) => !s.firstFrameUrl && s.imagePrompt)
    if (pendingShots.length === 0) {
      toast({ title: '没有可生成宫格图的镜头（需要未生成图片且有提示词的镜头）' })
      return
    }

    // Take up to totalCells shots
    const shotsToUse = pendingShots.slice(0, totalCells)
    if (shotsToUse.length === 0) {
      toast({ title: '没有可用的镜头' })
      return
    }

    setGridState((prev) => ({ ...prev, isGeneratingGrid: true, gridConfig: config }))
    setBatchProgress({ current: 0, total: shotsToUse.length, message: '生成宫格图中...' })

    try {
      // Build cell prompts from shot imagePrompts
      const cellPrompts = shotsToUse.map((s) => s.imagePrompt!)
      const shotIds = shotsToUse.map((s) => s.id)

      // Build combined grid prompt
      const promptParts = cellPrompts.map((p, i) => `Cell [${Math.floor(i / cols) + 1},${(i % cols) + 1}] (position ${i + 1}): ${p}`)
      const modeLabels: Record<string, string> = {
        first_frame: 'Each cell depicts the FIRST FRAME (opening shot) of a storyboard sequence.',
        first_last: 'Odd-numbered cells depict FIRST FRAMES, even-numbered cells depict LAST FRAMES.',
        multi_ref: 'All cells are reference frames from the same scene. Maintain visual consistency.',
      }
      const combinedPrompt = [
        `A ${rows}x${cols} grid layout image consisting of ${totalCells} evenly spaced cells.`,
        'Each cell contains an independent cinematic film still, separated by thin white grid lines.',
        modeLabels[mode] || modeLabels['first_frame']!,
        '',
        'Cell contents:',
        ...promptParts,
        '',
        'IMPORTANT: Generate as a single image with visible grid structure. Consistent cinematic style, 8K quality.',
      ].join('\n')

      // Generate the grid image
      const genResult = await api.grid.generate({
        episodeId: selectedEpisodeId,
        dramaId: selectedDramaId || undefined,
        prompt: combinedPrompt,
        rows,
        cols,
        cellPrompts,
        shotIds,
        gridMode: mode,
      })

      let gridImageUrl = genResult.imageUrl

      // Handle async generation
      if (genResult.status === 'processing' && genResult.taskId) {
        setBatchProgress({ current: 0, total: shotsToUse.length, message: '宫格图异步生成中，等待结果...' })
        const pollResult = await pollGridStatus(genResult.taskId, genResult.imageGenerationId)
        gridImageUrl = pollResult.imageUrl
      }

      if (!gridImageUrl) {
        throw new Error('宫格图生成完成但未返回图片')
      }

      // Split the grid image and assign to storyboards
      setGridState((prev) => ({ ...prev, isGeneratingGrid: false, isSplittingGrid: true }))
      setBatchProgress({ current: 0, total: shotsToUse.length, message: '分割宫格图中...' })

      const assignments = shotsToUse.map((s, i) => ({
        cellIndex: i,
        storyboardId: s.id,
        frameType: 'first_frame' as const,
      }))

      await api.grid.split({
        imageUrl: gridImageUrl,
        rows,
        cols,
        assignments,
      })

      toast({ title: `宫格图生成完成，已分配 ${shotsToUse.length} 张镜头图片` })
    } catch (err) {
      toast({ title: '宫格图生成失败', description: String(err), variant: 'destructive' })
    } finally {
      setGridState((prev) => ({ ...prev, isGeneratingGrid: false, isSplittingGrid: false }))
      setBatchProgress(null)
      await fetchEpisode()
    }
  }

  // ── AI: Generate video for a storyboard ────────────────────

  const handleGenerateVideo = async (storyboard: Storyboard) => {
    if (!storyboard.videoPrompt && !storyboard.imagePrompt) {
      toast({ title: '该镜头没有视频提示词', variant: 'destructive' })
      return
    }
    setGeneratingVideo(storyboard.id)
    try {
      const prompt = storyboard.videoPrompt ?? storyboard.imagePrompt ?? ''
      const result = await api.ai.generateVideo(storyboard.id, prompt, storyboard.firstFrameUrl ?? undefined) as Record<string, unknown>
      if (result.status === 'processing' && result.taskId) {
        toast({ title: `镜头 ${storyboard.shotNumber} 视频生成中...` })
        await pollAsyncTask('video', result.taskId as string, 10000, 60)
      }
      toast({ title: `镜头 ${storyboard.shotNumber} 视频已生成` })
      await fetchEpisode()
    } catch (err) {
      toast({ title: '视频生成失败', description: String(err), variant: 'destructive' })
    } finally {
      setGeneratingVideo(null)
    }
  }

  // ── AI: Generate TTS for a storyboard ───────────────────────

  const handleGenerateTts = async (storyboard: Storyboard) => {
    if (!storyboard.dialogue) {
      toast({ title: '该镜头没有对白', variant: 'destructive' })
      return
    }
    setGeneratingTts(storyboard.id)
    try {
      let voiceId: string | undefined
      if (storyboard.dialogueChar) {
        const character = characters.find(
          (c) => c.name.toLowerCase() === storyboard.dialogueChar!.toLowerCase()
        )
        if (character?.voiceId) {
          voiceId = character.voiceId
        }
      }
      await api.ai.generateTts(storyboard.id, storyboard.dialogue, voiceId)
      toast({ title: `镜头 ${storyboard.shotNumber} 配音已生成` })
      await fetchEpisode()
    } catch (err) {
      toast({ title: '配音生成失败', description: String(err), variant: 'destructive' })
    } finally {
      setGeneratingTts(null)
    }
  }

  // ── AI: Generate all videos ─────────────────────────────────

  const handleGenerateAllVideos = async () => {
    const pending = storyboards.filter((s) => !s.videoUrl && (s.videoPrompt || s.imagePrompt))
    if (pending.length === 0) {
      toast({ title: '没有可生成的镜头视频（需要镜头有视频提示词）' })
      return
    }
    setBatchProgress({ current: 0, total: pending.length, message: '生成视频中...' })
    let successCount = 0
    for (let i = 0; i < pending.length; i++) {
      const sb = pending[i]
      setGeneratingVideo(sb.id)
      setBatchProgress({ current: i + 1, total: pending.length, message: `生成视频 ${i + 1}/${pending.length}（${sb.firstFrameUrl ? '图生视频' : '文生视频'}）...` })
      try {
        const prompt = sb.videoPrompt ?? sb.imagePrompt ?? ''
        const result = await api.ai.generateVideo(sb.id, prompt, sb.firstFrameUrl ?? undefined) as Record<string, unknown>
        if (result.status === 'processing' && result.taskId) {
          setBatchProgress({ current: i + 1, total: pending.length, message: `视频 ${i + 1}/${pending.length} 异步生成中，等待结果...` })
          await pollAsyncTask('video', result.taskId as string, 10000, 60)
        }
        successCount++
      } catch {
        // Continue
      }
    }
    setGeneratingVideo(null)
    setBatchProgress(null)
    toast({ title: `${successCount}/${pending.length}个镜头视频生成完毕` })
    await fetchEpisode()
  }

  // ── AI: Generate all extract images (characters + scenes) ───

  const handleGenerateAllExtractImages = async () => {
    const charsPending = characters.filter((c) => !c.imageUrl)
    const scenesPending = scenes.filter((s) => !s.imageUrl)
    const total = charsPending.length + scenesPending.length

    if (total === 0) {
      toast({ title: '所有角色和场景都已有图片' })
      return
    }

    setBatchProgress({ current: 0, total, message: '一键生成图片中...' })
    let successCount = 0

    for (let i = 0; i < charsPending.length; i++) {
      const char = charsPending[i]
      setGeneratingCharImg(char.id)
      setBatchProgress({ current: i + 1, total, message: `生成角色头像 ${i + 1}/${total}...` })
      try {
        const result = await api.ai.generateCharacterImage(char.id) as Record<string, unknown>
        if (result.status === 'processing' && result.taskId) {
          setBatchProgress({ current: i + 1, total, message: `角色头像 ${i + 1}/${total} 异步生成中...` })
          await pollAsyncTask('image', result.taskId as string)
        }
        successCount++
      } catch {
        // continue
      }
    }
    setGeneratingCharImg(null)

    for (let i = 0; i < scenesPending.length; i++) {
      const scene = scenesPending[i]
      setGeneratingSceneImg(scene.id)
      setBatchProgress({ current: charsPending.length + i + 1, total, message: `生成场景图 ${charsPending.length + i + 1}/${total}...` })
      try {
        const result = await api.ai.generateSceneImage(scene.id) as Record<string, unknown>
        if (result.status === 'processing' && result.taskId) {
          setBatchProgress({ current: charsPending.length + i + 1, total, message: `场景图 ${charsPending.length + i + 1}/${total} 异步生成中...` })
          await pollAsyncTask('image', result.taskId as string)
        }
        successCount++
      } catch {
        // continue
      }
    }
    setGeneratingSceneImg(null)
    setBatchProgress(null)
    toast({ title: `${successCount}/${total}个图片生成完毕` })
    await fetchEpisode()
  }

  // ── Copy to clipboard ──────────────────────────────────────

  const handleCopy = async (text: string, fieldId: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedField(fieldId)
      toast({ title: '已复制到剪贴板' })
      setTimeout(() => setCopiedField(null), 2000)
    } catch {
      toast({ title: '复制失败', variant: 'destructive' })
    }
  }

  // ── Upload local file ──────────────────────────────────────

  const handleUpload = async (
    file: File,
    options: UploadOptions,
    fieldKey: string
  ) => {
    setUploadingField(fieldKey)
    try {
      await api.upload.file(file, options)
      toast({ title: '上传成功' })
      await fetchEpisode()
    } catch (err) {
      toast({ title: '上传失败', description: String(err), variant: 'destructive' })
    } finally {
      setUploadingField(null)
    }
  }

  // ── Generate all TTS ─────────────────────────────────────────

  const handleGenerateAllTts = async () => {
    const pending = storyboards.filter((s) => s.dialogue && !s.ttsAudioUrl)
    if (pending.length === 0) {
      toast({ title: '没有可生成的配音（需要镜头有对白）' })
      return
    }
    setGeneratingAllTts(true)
    setBatchProgress({ current: 0, total: pending.length, message: '生成配音中...' })
    let successCount = 0
    for (let i = 0; i < pending.length; i++) {
      const sb = pending[i]
      setGeneratingTts(sb.id)
      setBatchProgress({ current: i + 1, total: pending.length, message: `生成配音 ${i + 1}/${pending.length}...` })
      try {
        await api.ai.generateTts(sb.id, sb.dialogue!)
        successCount++
      } catch {
        // Continue
      }
    }
    setGeneratingTts(null)
    setBatchProgress(null)
    setGeneratingAllTts(false)
    toast({ title: `${successCount}/${pending.length}个镜头配音生成完毕` })
    await fetchEpisode()
  }

  // ── Server-side FFmpeg compose (single shot) ────────────────

  const handleServerCompose = async (storyboard: Storyboard): Promise<boolean> => {
    if (!selectedEpisodeId || !storyboard.videoUrl) return false
    try {
      const res = await fetch(`/api/episodes/${selectedEpisodeId}/compose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storyboardId: storyboard.id, mode: 'server' }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.composedUrl) {
          await api.storyboards.update(storyboard.id, { composedUrl: data.composedUrl })
          return true
        }
        // If source is server but no composedUrl returned, still update from storyboard
        if (data.storyboard?.composedUrl) {
          await fetchEpisode()
          return true
        }
      }
      if (res.status === 501) {
        // FFmpeg not available on server — signal fallback
        setFfmpegAvailable(false)
        return false
      }
      // Other server error — fallback
      return false
    } catch {
      return false
    }
  }

  // ── Compose a single shot (server FFmpeg first, client fallback) ──

  const handleComposeShot = async (storyboard: Storyboard) => {
    if (!storyboard.videoUrl) {
      toast({ title: '该镜头没有视频，无法合成', variant: 'destructive' })
      return
    }
    setComposing(storyboard.id)
    try {
      // Try server-side FFmpeg compose first if available
      if (ffmpegAvailable) {
        const serverOk = await handleServerCompose(storyboard)
        if (serverOk) {
          toast({ title: `镜头 ${storyboard.shotNumber} 已合成（FFmpeg 服务端）` })
          await fetchEpisode()
          return
        }
        // Server compose failed or FFmpeg unavailable — fallback to client-side
        console.warn('Server compose failed, falling back to client-side')
      }

      // ── Client-side compose (Canvas + MediaRecorder) ──
      const canvas = document.createElement('canvas')
      canvas.width = 1024
      canvas.height = 576
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Canvas context not available')

      const videoEl = document.createElement('video')
      videoEl.crossOrigin = 'anonymous'
      videoEl.playsInline = true
      videoEl.muted = true
      videoEl.src = storyboard.videoUrl

      await new Promise<void>((resolve, reject) => {
        videoEl.onloadeddata = () => resolve()
        videoEl.onerror = () => reject(new Error('Failed to load video'))
      })

      const canvasStream = canvas.captureStream(30)
      let audioCtx: AudioContext | null = null
      let mixedStream: MediaStream | null = null

      if (storyboard.ttsAudioUrl) {
        try {
          audioCtx = new AudioContext()
          const videoSource = audioCtx.createMediaElementSource(
            Object.assign(document.createElement('video'), {
              crossOrigin: 'anonymous',
              src: storyboard.videoUrl,
            })
          )
          const ttsAudioEl = new Audio(storyboard.ttsAudioUrl)
          const ttsSource = audioCtx.createMediaElementSource(ttsAudioEl)
          const dest = audioCtx.createMediaStreamDestination()
          videoSource.connect(dest)
          ttsSource.connect(dest)
          videoSource.connect(audioCtx.destination)
          ttsSource.connect(audioCtx.destination)
          const audioTracks = dest.stream.getAudioTracks()
          const videoTracks = canvasStream.getVideoTracks()
          mixedStream = new MediaStream([...videoTracks, ...audioTracks])
        } catch {
          console.warn('Audio mixing failed, composing without TTS audio')
        }
      }

      const outputStream = mixedStream || canvasStream
      const recorder = new MediaRecorder(outputStream, {
        mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
          ? 'video/webm;codecs=vp9'
          : 'video/webm',
        videoBitsPerSecond: 5000000,
      })

      const chunks: Blob[] = []
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data)
      }

      const blob = await new Promise<Blob>((resolve, reject) => {
        recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }))
        recorder.onerror = reject
        recorder.start()
      })

      videoEl.currentTime = 0
      await new Promise<void>((resolveCompose) => {
        const drawFrame = () => {
          if (videoEl.paused || videoEl.ended) {
            ctx!.drawImage(videoEl, 0, 0, canvas.width, canvas.height)
            if (storyboard.dialogue) {
              ctx!.fillStyle = 'rgba(0,0,0,0.6)'
              ctx!.fillRect(0, canvas.height - 60, canvas.width, 60)
              ctx!.fillStyle = 'white'
              ctx!.font = 'bold 20px sans-serif'
              ctx!.textAlign = 'center'
              const subtitleText = storyboard.dialogueChar
                ? `${storyboard.dialogueChar}：${storyboard.dialogue}`
                : storyboard.dialogue
              ctx!.fillText(subtitleText, canvas.width / 2, canvas.height - 25)
            }
            return
          }
          ctx!.drawImage(videoEl, 0, 0, canvas.width, canvas.height)
          if (storyboard.dialogue) {
            ctx!.fillStyle = 'rgba(0,0,0,0.6)'
            ctx!.fillRect(0, canvas.height - 60, canvas.width, 60)
            ctx!.fillStyle = 'white'
            ctx!.font = 'bold 20px sans-serif'
            ctx!.textAlign = 'center'
            const subtitleText = storyboard.dialogueChar
              ? `${storyboard.dialogueChar}：${storyboard.dialogue}`
              : storyboard.dialogue
            ctx!.fillText(subtitleText, canvas.width / 2, canvas.height - 25)
          }
          requestAnimationFrame(drawFrame)
        }
        videoEl.onplay = () => drawFrame()
        videoEl.onended = () => {
          drawFrame()
          setTimeout(() => resolveCompose(), 100)
        }
        videoEl.play().catch(() => resolveCompose())
      })

      recorder.stop()
      const composedBlob = await blob
      const reader = new FileReader()
      const composedUrl = await new Promise<string>((resolve) => {
        reader.onload = () => resolve(reader.result as string)
        reader.readAsDataURL(composedBlob)
      })

      await api.storyboards.update(storyboard.id, { composedUrl })
      if (audioCtx) audioCtx.close().catch(() => {})
      toast({ title: `镜头 ${storyboard.shotNumber} 已合成（WebM 客户端）` })
      await fetchEpisode()
    } catch (err) {
      toast({ title: '合成失败', description: String(err), variant: 'destructive' })
    } finally {
      setComposing(null)
    }
  }

  // ── Compose all shots ───────────────────────────────────────

  const handleComposeAll = async () => {
    const composable = storyboards.filter((s) => s.videoUrl && !s.composedUrl)
    if (composable.length === 0) {
      toast({ title: '没有可合成的镜头（需要有视频）' })
      return
    }
    setComposingAll(true)
    const mode = ffmpegAvailable ? 'FFmpeg' : 'WebM'
    setBatchProgress({ current: 0, total: composable.length, message: `合成中（${mode}）...` })
    let successCount = 0
    for (let i = 0; i < composable.length; i++) {
      const sb = composable[i]
      setComposing(sb.id)
      setBatchProgress({ current: i + 1, total: composable.length, message: `合成镜头 ${i + 1}/${composable.length}（${mode} 字幕+配音）...` })
      try {
        await handleComposeShot(sb)
        successCount++
      } catch {
        // Continue
      }
    }
    setComposing(null)
    setBatchProgress(null)
    setComposingAll(false)
    toast({ title: `${successCount}/${composable.length}个镜头合成完毕（${mode}）` })
    await fetchEpisode()
  }

  // ── Server-side merge all composed shots ────────────────────

  const handleServerMerge = async () => {
    if (!selectedEpisodeId) return
    if (!ffmpegAvailable) {
      toast({ title: 'FFmpeg 不可用，无法合并成片', description: '服务端 FFmpeg 未安装，请使用导出功能替代。', variant: 'destructive' })
      return
    }
    const shotsWithVideo = storyboards.filter((s) => s.composedUrl || s.videoUrl)
    if (shotsWithVideo.length === 0) {
      toast({ title: '没有可合并的镜头视频', variant: 'destructive' })
      return
    }
    setMerging(true)
    setBatchProgress({ current: 0, total: 1, message: '合并成片中（FFmpeg）...' })
    try {
      const res = await fetch(`/api/episodes/${selectedEpisodeId}/merge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (res.ok) {
        const data = await res.json()
        const mergeInfo = data.merge
        toast({
          title: '合并成片完成',
          description: mergeInfo
            ? `${mergeInfo.shotsMerged ?? '全部'}个镜头，时长 ${mergeInfo.duration ?? 0}秒`
            : undefined,
        })
        await fetchEpisode()
        await fetchMergeStatus()
      } else if (res.status === 501) {
        setFfmpegAvailable(false)
        toast({ title: 'FFmpeg 不可用', description: '服务端 FFmpeg 未安装。', variant: 'destructive' })
      } else {
        const data = await res.json().catch(() => ({}))
        toast({ title: '合并失败', description: data.error || '未知错误', variant: 'destructive' })
      }
    } catch (err) {
      toast({ title: '合并失败', description: String(err), variant: 'destructive' })
    } finally {
      setMerging(false)
      setBatchProgress(null)
    }
  }

  // ── Preview all shots in sequence ───────────────────────────

  const handleStartPreview = () => {
    const videoShots = storyboards.filter((s) => s.videoUrl)
    if (videoShots.length === 0) {
      toast({ title: '没有可预览的镜头视频', variant: 'destructive' })
      return
    }
    setCurrentPreviewShot(0)
    setPreviewMode(true)
  }

  const handlePreviewEnded = () => {
    const videoShots = storyboards.filter((s) => s.videoUrl)
    if (currentPreviewShot < videoShots.length - 1) {
      setCurrentPreviewShot((prev) => prev + 1)
    } else {
      setPreviewMode(false)
      setCurrentPreviewShot(0)
    }
  }

  // ── Export final video ──────────────────────────────────────

  const handleExport = async () => {
    if (!perms.canExport) {
      toast({ title: '导出功能需要专业版', description: '免费用户无法导出成片，请升级专业版。', variant: 'destructive' })
      return
    }
    const videoShots = storyboards.filter((s) => s.composedUrl || s.videoUrl)
    if (videoShots.length === 0) {
      toast({ title: '没有可导出的镜头视频', variant: 'destructive' })
      return
    }
    setExporting(true)
    try {
      const canvas = document.createElement('canvas')
      canvas.width = 1024
      canvas.height = 576
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Canvas context not available')
      const canvasStream = canvas.captureStream(30)
      const recorder = new MediaRecorder(canvasStream, {
        mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm',
        videoBitsPerSecond: 5000000,
      })
      const chunks: Blob[] = []
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data) }
      const blob = await new Promise<Blob>((resolve, reject) => {
        recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }))
        recorder.onerror = reject
        recorder.start()
      })
      const tempVideo = document.createElement('video')
      tempVideo.crossOrigin = 'anonymous'
      tempVideo.playsInline = true
      tempVideo.muted = true
      for (let i = 0; i < videoShots.length; i++) {
        const shot = videoShots[i]
        const videoSource = shot.composedUrl || shot.videoUrl!
        setBatchProgress({ current: i + 1, total: videoShots.length, message: `导出镜头 ${i + 1}/${videoShots.length}...` })
        await new Promise<void>((resolveShot) => {
          tempVideo.src = videoSource
          tempVideo.onloadeddata = () => { tempVideo.play() }
          tempVideo.onended = () => { resolveShot() }
          tempVideo.onerror = () => { resolveShot() }
          const drawFrame = () => {
            if (tempVideo.paused || tempVideo.ended) {
              ctx!.drawImage(tempVideo, 0, 0, canvas.width, canvas.height)
              if (shot.dialogue) {
                ctx!.fillStyle = 'rgba(0,0,0,0.6)'; ctx!.fillRect(0, canvas.height - 60, canvas.width, 60)
                ctx!.fillStyle = 'white'; ctx!.font = 'bold 20px sans-serif'; ctx!.textAlign = 'center'
                ctx!.fillText(shot.dialogueChar ? `${shot.dialogueChar}：${shot.dialogue}` : shot.dialogue, canvas.width / 2, canvas.height - 25)
              }
              return
            }
            ctx!.drawImage(tempVideo, 0, 0, canvas.width, canvas.height)
            if (shot.dialogue) {
              ctx!.fillStyle = 'rgba(0,0,0,0.6)'; ctx!.fillRect(0, canvas.height - 60, canvas.width, 60)
              ctx!.fillStyle = 'white'; ctx!.font = 'bold 20px sans-serif'; ctx!.textAlign = 'center'
              ctx!.fillText(shot.dialogueChar ? `${shot.dialogueChar}：${shot.dialogue}` : shot.dialogue, canvas.width / 2, canvas.height - 25)
            }
            requestAnimationFrame(drawFrame)
          }
          tempVideo.onplay = () => { drawFrame() }
        })
        await new Promise((r) => setTimeout(r, 300))
      }
      recorder.stop()
      const resultBlob = await blob
      const url = URL.createObjectURL(resultBlob)
      const a = document.createElement('a')
      a.href = url; a.download = `${currentEpisode?.title || 'episode'}_export.webm`
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast({ title: '导出完成' })
    } catch (err) {
      toast({ title: '导出失败', description: String(err), variant: 'destructive' })
    } finally {
      setExporting(false)
      setBatchProgress(null)
    }
  }

  // ── Determine sidebar step active state ────────────────────

  const isSidebarStepActive = (step: StepDef): boolean => {
    if (step.subSteps) {
      return step.subSteps.some((ss) => ss.key === activeStep)
    }
    return step.key === activeStep
  }

  // ── Render active panel ────────────────────────────────────

  const episode = currentEpisode

  const renderActivePanel = () => {
    switch (activeStep) {
      case 'raw':
      case 'rewrite':
        return (
          <ScriptPanel
            rawContent={rawContent}
            setRawContent={setRawContent}
            scriptContent={scriptContent}
            setScriptContent={setScriptContent}
            saving={saving}
            aiLoading={aiLoading}
            isRewriting={agentExec.isRunning('script_rewriter')}
            episode={episode}
            agentExec={agentExec}
            activeStep={activeStep}
            handleSaveRaw={handleSaveRaw}
            handleSaveScript={handleSaveScript}
            handleRewrite={handleRewrite}
            handleSkipRewrite={handleSkipRewrite}
          />
        )
      case 'extract':
        return (
          <ExtractPanel
            characters={characters}
            scenes={scenes}
            aiLoading={aiLoading}
            isExtracting={agentExec.isRunning('extractor')}
            episode={episode}
            agentExec={agentExec}
            generatingCharImg={generatingCharImg}
            generatingSceneImg={generatingSceneImg}
            batchProgress={batchProgress}
            uploadingField={uploadingField}
            activePipelineStep={activePipelineStep}
            handleExtract={handleExtract}
            handleGenerateAllExtractImages={handleGenerateAllExtractImages}
            handleGenerateCharSheet={handleGenerateCharSheet}
            handleGenerateCharImage={handleGenerateCharImage}
            handleGenerateSceneImage={handleGenerateSceneImage}
            handleUpload={handleUpload}
          />
        )
      case 'voice':
        return (
          <VoicePanel
            characters={characters}
            aiLoading={aiLoading}
            agentExec={agentExec}
            activeStep={activeStep}
            handleVoiceAssign={handleVoiceAssign}
            voices={voices}
            activeTtsProvider={activeTtsProvider}
            voiceSamples={voiceSamples}
            generatingSample={generatingSample}
            handleAssignVoice={handleAssignVoice}
            handleGenerateVoiceSample={handleGenerateVoiceSample}
            handleBatchGenerateSamples={handleBatchGenerateSamples}
          />
        )
      case 'storyboard':
        return (
          <StoryboardPanel
            storyboards={storyboards}
            aiLoading={aiLoading}
            isStoryboarding={agentExec.isRunning('storyboard_breaker')}
            episode={episode}
            agentExec={agentExec}
            generatingShotImg={generatingShotImg}
            generatingVideo={generatingVideo}
            generatingTts={generatingTts}
            batchProgress={batchProgress}
            uploadingField={uploadingField}
            copiedField={copiedField}
            gridState={gridState}
            activePipelineStep={activePipelineStep}
            handleGenerateStoryboard={handleGenerateStoryboard}
            handleEnhanceShotPrompt={handleEnhanceShotPrompt}
            handleGenerateAllImages={handleGenerateAllImages}
            handleGenerateAllVideos={handleGenerateAllVideos}
            handleGenerateShotImage={handleGenerateShotImage}
            handleGenerateVideo={handleGenerateVideo}
            handleGenerateTts={handleGenerateTts}
            handleUpload={handleUpload}
            handleCopy={handleCopy}
            handleUpdateStoryboard={handleUpdateStoryboard}
            handleGridGenerate={handleGridGenerate}
          />
        )
      case 'production':
        return (
          <ProductionPanel
            storyboards={storyboards}
            characters={characters}
            aiLoading={aiLoading}
            agentExec={agentExec}
            generatingShotImg={generatingShotImg}
            generatingVideo={generatingVideo}
            generatingTts={generatingTts}
            generatingAllTts={generatingAllTts}
            composing={composing}
            composingAll={composingAll}
            batchProgress={batchProgress}
            previewMode={previewMode}
            currentPreviewShot={currentPreviewShot}
            exporting={exporting}
            previewVideoRef={previewVideoRef}
            previewAudioRef={previewAudioRef}
            perms={perms}
            ffmpegAvailable={ffmpegAvailable}
            merging={merging}
            mergeStatus={mergeStatus}
            activePipelineStep={activePipelineStep}
            handleGenerateShotImage={handleGenerateShotImage}
            handleGenerateVideo={handleGenerateVideo}
            handleGenerateTts={handleGenerateTts}
            handleGenerateAllVideos={handleGenerateAllVideos}
            handleGenerateAllTts={handleGenerateAllTts}
            handleComposeShot={handleComposeShot}
            handleComposeAll={handleComposeAll}
            handleServerMerge={handleServerMerge}
            handleStartPreview={handleStartPreview}
            handlePreviewEnded={handlePreviewEnded}
            handleExport={handleExport}
            setActiveStep={setActiveStep}
            setPreviewMode={setPreviewMode}
            setCurrentPreviewShot={setCurrentPreviewShot}
          />
        )
      default:
        return null
    }
  }

  // ── Episode info for top bar ───────────────────────────────

  const dramaTitle = currentDrama?.title ?? '项目'
  const episodeTitle = episode?.title || (episode ? `第${episode.episodeNumber}集` : '集')

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden">
      {/* ── Top Bar ────────────────────────────────────────── */}
      <header className="flex-shrink-0 border-b border-border/50 bg-background/80 backdrop-blur-md z-10">
        <div className="flex items-center gap-3 px-4 py-2.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigateToProject(selectedDramaId!)}
            className="text-muted-foreground hover:text-foreground -ml-2"
          >
            <ArrowLeft className="size-4" />
            <span className="hidden sm:inline">返回</span>
          </Button>

          <Separator orientation="vertical" className="h-5" />

          <h1 className="text-sm font-semibold truncate">{dramaTitle}</h1>

          <Badge variant="secondary" className="text-xs flex-shrink-0">
            {episodeTitle}
          </Badge>

          {/* Model selectors - desktop inline */}
          <div className="hidden md:flex items-center gap-2 ml-auto">
            <ModelSelector
              category="llm"
              value={workspaceModels.llm}
              onChange={(m) => setWorkspaceModel('llm', m)}
              disabled={isConfigLocked}
            />
            <ModelSelector
              category="image"
              value={workspaceModels.image}
              onChange={(m) => setWorkspaceModel('image', m)}
              disabled={isConfigLocked}
            />
            <ModelSelector
              category="video"
              value={workspaceModels.video}
              onChange={(m) => setWorkspaceModel('video', m)}
              disabled={isConfigLocked}
            />

            {/* Lock/Unlock toggle */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={isConfigLocked ? 'default' : 'outline'}
                  size="sm"
                  className={`h-8 px-2.5 gap-1.5 text-xs font-medium ${
                    isConfigLocked
                      ? 'bg-amber-600 hover:bg-amber-700 text-white border-amber-600'
                      : 'hover:bg-muted/80'
                  }`}
                  onClick={isConfigLocked ? handleUnlockConfig : handleLockConfig}
                >
                  {isConfigLocked ? (
                    <Lock className="size-3.5" />
                  ) : (
                    <LockOpen className="size-3.5" />
                  )}
                  {isConfigLocked && (
                    <Badge className="bg-amber-500/30 text-amber-100 text-[10px] px-1 py-0 h-4 border-0 font-medium">
                      已锁定
                    </Badge>
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={6}>
                {isConfigLocked
                  ? '点击解锁 — 解锁后将使用全局默认模型'
                  : '点击锁定 — 将当前模型配置锁定到本集'}
              </TooltipContent>
            </Tooltip>
          </div>

          {/* Status badges - desktop */}
          <div className="hidden md:flex items-center gap-2">
            {episode?.scriptStatus && episode.scriptStatus !== 'pending' && (
              <div className="flex items-center gap-1">
                <FileText className="size-3 text-muted-foreground" />
                {statusBadge(episode.scriptStatus)}
              </div>
            )}
            {episode?.extractStatus && episode.extractStatus !== 'pending' && (
              <div className="flex items-center gap-1">
                <Users className="size-3 text-muted-foreground" />
                {statusBadge(episode.extractStatus)}
              </div>
            )}
            {episode?.storyboardStatus && episode.storyboardStatus !== 'pending' && (
              <div className="flex items-center gap-1">
                <Film className="size-3 text-muted-foreground" />
                {statusBadge(episode.storyboardStatus)}
              </div>
            )}
          </div>

          <div className="ml-auto flex items-center gap-1">
            {/* Mobile sidebar toggle */}
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden size-8"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              {sidebarOpen ? <PanelLeftClose className="size-4" /> : <PanelLeftOpen className="size-4" />}
            </Button>
            <UserMenu />
          </div>
        </div>

        {/* Mobile model selectors row */}
        <div className="flex md:hidden items-center gap-2 px-4 pb-2 overflow-x-auto">
          <ModelSelector
            category="llm"
            value={workspaceModels.llm}
            onChange={(m) => setWorkspaceModel('llm', m)}
            disabled={isConfigLocked}
          />
          <ModelSelector
            category="image"
            value={workspaceModels.image}
            onChange={(m) => setWorkspaceModel('image', m)}
            disabled={isConfigLocked}
          />
          <ModelSelector
            category="video"
            value={workspaceModels.video}
            onChange={(m) => setWorkspaceModel('video', m)}
            disabled={isConfigLocked}
          />

          {/* Lock/Unlock toggle - mobile */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={isConfigLocked ? 'default' : 'outline'}
                size="sm"
                className={`h-8 px-2.5 gap-1.5 text-xs font-medium flex-shrink-0 ${
                  isConfigLocked
                    ? 'bg-amber-600 hover:bg-amber-700 text-white border-amber-600'
                    : 'hover:bg-muted/80'
                }`}
                onClick={isConfigLocked ? handleUnlockConfig : handleLockConfig}
              >
                {isConfigLocked ? <Lock className="size-3.5" /> : <LockOpen className="size-3.5" />}
                {isConfigLocked && (
                  <Badge className="bg-amber-500/30 text-amber-100 text-[10px] px-1 py-0 h-4 border-0 font-medium">
                    已锁定
                  </Badge>
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={6}>
              {isConfigLocked
                ? '点击解锁 — 解锁后将使用全局默认模型'
                : '点击锁定 — 将当前模型配置锁定到本集'}
            </TooltipContent>
          </Tooltip>
        </div>
      </header>

      {/* ── Body: Sidebar + Main + Bottom Nav ──────────────── */}
      <div className="flex-1 flex overflow-hidden">
        {/* 11-Step Pipeline Sidebar */}
        <AnimatePresence>
          {sidebarOpen && (
            <motion.aside
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 240, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="flex-shrink-0 border-r border-border/50 bg-card/50 overflow-hidden"
            >
              <div className="w-[240px] h-full flex flex-col">
                {/* Pipeline steps */}
                <ScrollArea className="flex-1">
                  <div className="p-3 space-y-0.5">
                    <div className="px-2 py-1.5 mb-2">
                      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        制作管线
                      </h3>
                    </div>
                    {PIPELINE_STEPS.map((step) => {
                      const stepStatus = getPipelineStepStatus(step.key)
                      const isActive = activePipelineStep === step.key
                      return (
                        <button
                          key={step.key}
                          onClick={() => handlePipelineStepClick(step.key)}
                          className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-all duration-150 group ${
                            isActive
                              ? 'bg-primary/10 text-primary'
                              : stepStatus === 'completed'
                                ? 'text-emerald-600 hover:bg-emerald-500/5'
                                : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                          }`}
                        >
                          {/* Status indicator */}
                          <div className="flex-shrink-0 size-6 rounded-full flex items-center justify-center">
                            {stepStatus === 'completed' ? (
                              <div className="size-6 rounded-full bg-emerald-500/20 flex items-center justify-center">
                                <Check className="size-3.5 text-emerald-500" />
                              </div>
                            ) : stepStatus === 'active' ? (
                              <div className="size-6 rounded-full bg-primary/20 flex items-center justify-center">
                                <Loader2 className="size-3 text-primary animate-spin" />
                              </div>
                            ) : (
                              <div className="size-6 rounded-full bg-muted flex items-center justify-center">
                                <span className="text-[10px] font-bold text-muted-foreground">
                                  {step.stepNumber}
                                </span>
                              </div>
                            )}
                          </div>

                          <div className="flex-1 min-w-0">
                            <span className={`text-xs font-medium ${isActive ? 'text-primary' : ''}`}>
                              {step.label}
                            </span>
                            {pipelineStatus?.pipeline?.[step.key] && step.key !== 'raw_content' && step.key !== 'script_rewrite' && step.key !== 'storyboard' && (
                              <div className="text-[10px] text-muted-foreground mt-0.5">
                                {pipelineStatus.pipeline[step.key].completed}/{pipelineStatus.pipeline[step.key].total}
                              </div>
                            )}
                          </div>

                          {isActive && (
                            <ChevronRight className="size-3 text-primary flex-shrink-0" />
                          )}
                        </button>
                      )
                    })}
                  </div>
                </ScrollArea>

                {/* Progress */}
                <div className="p-3 border-t border-border/50">
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                    <span>管线进度</span>
                    <span className="font-medium">{pipelineCompletedCount}/{pipelineTotalCount} 步完成</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-emerald-500 rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${pipelineStatus?.progressPercent ?? 0}%` }}
                      transition={{ duration: 0.5 }}
                    />
                  </div>
                </div>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        {/* Main panel area */}
        <main className="flex-1 flex flex-col overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeStep}
              variants={panelVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.15 }}
              className="flex-1 flex flex-col overflow-hidden"
            >
              {renderActivePanel()}
            </motion.div>
          </AnimatePresence>

          {/* ── Bottom Navigation Bar ─────────────────────────── */}
          <div className="flex-shrink-0 border-t border-border/50 bg-card/50 px-4 py-2">
            <div className="flex items-center justify-between">
              {/* Previous button */}
              <Button
                variant="ghost"
                size="sm"
                onClick={handlePrevStep}
                disabled={currentPipelineIndex <= 0}
                className="gap-1 text-xs"
              >
                <ChevronLeft className="size-3.5" />
                <span className="hidden sm:inline">上一步</span>
              </Button>

              {/* Step dots */}
              <div className="flex items-center gap-1.5 overflow-x-auto px-2">
                {PIPELINE_STEPS.map((step) => {
                  const stepStatus = getPipelineStepStatus(step.key)
                  const isActive = activePipelineStep === step.key
                  return (
                    <button
                      key={step.key}
                      onClick={() => handlePipelineStepClick(step.key)}
                      title={step.label}
                      className={`flex-shrink-0 transition-all duration-150 rounded-full ${
                        isActive
                          ? 'size-3 bg-primary'
                          : stepStatus === 'completed'
                            ? 'size-2 bg-emerald-500 hover:bg-emerald-400'
                            : 'size-2 bg-muted-foreground/30 hover:bg-muted-foreground/60'
                      }`}
                    />
                  )
                })}
              </div>

              {/* Next button */}
              <Button
                variant="ghost"
                size="sm"
                onClick={handleNextStep}
                disabled={currentPipelineIndex >= PIPELINE_STEPS.length - 1}
                className="gap-1 text-xs"
              >
                <span className="hidden sm:inline">下一步</span>
                <ChevronRight className="size-3.5" />
              </Button>
            </div>

            {/* Current step label */}
            <div className="text-center mt-1">
              <span className="text-[10px] text-muted-foreground">
                {PIPELINE_STEPS[currentPipelineIndex]?.stepNumber}/11 — {PIPELINE_STEPS[currentPipelineIndex]?.label}
              </span>
            </div>
          </div>
        </main>
      </div>

      <ResultDialog state={resultDialog} onClose={() => setResultDialog(EMPTY_RESULT_DIALOG)} />
    </div>
  )
}
