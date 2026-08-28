'use client'

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAppStore, type EpisodeDetail, type Character, type Scene, type Prop, type Storyboard, type LockedConfig, type Episode } from '@/lib/store'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { usePermissions } from '@/hooks/use-permissions'
import { useAgentExecution } from '@/components/agent-execution-panel'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import {
  ArrowLeft,
  Loader2,
  FileText,
  Users,
  Film,
  Check,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  Lock,
  LockOpen,
  Download,
  Globe,
  BookOpenText,
  Settings2,
  LayoutGrid,
  Clapperboard,
  Plus,
} from 'lucide-react'
import { UserMenu } from '@/components/user-menu'
import { ResultDialog, EMPTY_RESULT_DIALOG, type ResultDialogState } from '@/components/episode/result-dialog'

// Sub-components
import { ScriptStudio } from '@/components/episode/script-studio'
import { StoryboardSeko } from '@/components/episode/storyboard-seko'
import { ExtractPanel } from '@/components/episode/extract-panel'
import { VoicePanel } from '@/components/episode/voice-panel'
import { CharImagesPanel } from '@/components/episode/char-images-panel'
import { SceneImagesPanel } from '@/components/episode/scene-images-panel'
import { DubbingPanel } from '@/components/episode/dubbing-panel'
import { ShotFramesPanel } from '@/components/episode/shot-frames-panel'
import { VideoPanel } from '@/components/episode/video-panel'
import { ComposePanel } from '@/components/episode/compose-panel'
import { TimelineEditor } from '@/components/episode/timeline-editor'

// Shared types & helpers
import type { UploadOptions, BatchProgress, PipelineStepKey, PipelineStepStatus, PipelineStatus, VoiceInfo, MergeStatus, GridConfig, GridGenerationState } from '@/components/episode/types'
import { PIPELINE_STEPS, statusBadge, panelVariants } from '@/components/episode/helpers'

// ── Main tab definition (剧本 / 设定 / 分镜 / 短片) ──────────

type MainTab = 'script' | 'settings' | 'storyboard' | 'film'
type SettingsTab = 'extract' | 'chars' | 'scenes' | 'voice'
type FilmTab = 'dubbing' | 'shots' | 'videos' | 'compose' | 'timeline'

const MAIN_TABS: Array<{ key: MainTab; label: string; icon: React.ReactNode }> = [
  { key: 'script', label: '剧本', icon: <BookOpenText className="size-3.5" /> },
  { key: 'settings', label: '设定', icon: <Settings2 className="size-3.5" /> },
  { key: 'storyboard', label: '分镜', icon: <LayoutGrid className="size-3.5" /> },
  { key: 'film', label: '短片', icon: <Clapperboard className="size-3.5" /> },
]

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

  // ★ 四大主 Tab：剧本 / 设定 / 分镜 / 短片（参考 seko 式工作台）
  const [mainTab, setMainTab] = useState<MainTab>('script')
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('extract')
  const [filmTab, setFilmTab] = useState<FilmTab>('dubbing')
  const [scriptGenerating, setScriptGenerating] = useState(false)
  const [dramaEpisodes, setDramaEpisodes] = useState<Episode[]>([])
  const [switchingEpisode, setSwitchingEpisode] = useState(false)
  const [rawContent, setRawContent] = useState('')
  const [scriptContent, setScriptContent] = useState('')
  const [characters, setCharacters] = useState<Character[]>([])
  const [scenes, setScenes] = useState<Scene[]>([])
  const [props, setProps] = useState<Prop[]>([])
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

  // PR-F: Global asset import state
  const [importingAssets, setImportingAssets] = useState(false)

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
  }, [currentEpisode?.id])

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
      // Fetch characters & scenes & props + episodes list from drama
      if (selectedDramaId) {
        const dramaDetail = await api.dramas.get(selectedDramaId)
        setCharacters(dramaDetail.characters ?? [])
        setScenes(dramaDetail.scenes ?? [])
        setProps(dramaDetail.props ?? [])
        setDramaEpisodes(dramaDetail.episodes ?? [])
      }
      setStoryboards(detail.storyboards ?? [])
    } catch (err) {
      toast({ title: '加载集数据失败', description: String(err), variant: 'destructive' })
    }
  }, [selectedEpisodeId, selectedDramaId, setCurrentEpisode, toast])

  useEffect(() => {
    fetchEpisode()
  }, [fetchEpisode])

  // ── Auto-extract: if scriptContent exists but no characters/scenes have
  //    been extracted yet, kick off the extractor agent automatically so the
  //    user doesn't have to click "提取" manually after the workshop hands off.
  //    The existing "提取完成" toast inside handleExtract will surface the result.
  const autoExtractTriggeredRef = useRef<string | null>(null)
  useEffect(() => {
    if (!currentEpisode?.scriptContent?.trim()) return
    if (autoExtractTriggeredRef.current === currentEpisode.id) return // only once per episode
    // Skip if extractor already running OR characters/scenes already present
    if (characters.length > 0 || scenes.length > 0) return
    if (aiLoading || agentExec.isRunning('extractor')) return
    autoExtractTriggeredRef.current = currentEpisode.id
    // Fire-and-forget — handleExtract has its own error handling/toast
    void handleExtract()
  }, [currentEpisode?.id, currentEpisode?.scriptContent])

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
          totalSteps: raw.totalSteps ?? 12,
          completedSteps: raw.completedSteps ?? 0,
          partialSteps: 0,
          pendingSteps: (raw.totalSteps ?? 12) - (raw.completedSteps ?? 0),
          overallProgress: raw.progressPercent ?? 0,
          currentStep: '',
        },
        ffmpegAvailable: false,
        // Alias for code that references pipelineStatus.pipeline
        pipeline: raw.pipeline as Record<PipelineStepKey, PipelineStepStatus> ?? {} as Record<PipelineStepKey, PipelineStepStatus>,
        completedSteps: raw.completedSteps ?? 0,
        totalSteps: raw.totalSteps ?? 12,
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
      setVoices(result.voices as VoiceInfo[])
      setActiveTtsProvider(result.activeProvider)
    }).catch(() => {})
  }, [])

  // ── AbortController for pollAsyncTask — cancelled on unmount ──
  const pollAbortRef = useRef<AbortController | null>(null)
  useEffect(() => {
    return () => {
      pollAbortRef.current?.abort()
    }
  }, [])

  // ── Pipeline step completion info (for sidebar badges) ─────

  const getStepCompletionInfo = useCallback(
    (key: PipelineStepKey): string => {
      switch (key) {
        case 'script:raw':
          return rawContent.trim() ? '已完成' : '待输入'
        case 'script:rewrite':
          return scriptContent.trim() ? '已完成' : '待改写'
        case 'script:extract':
          return characters.length > 0 || scenes.length > 0 ? `${characters.length} 角色 · ${scenes.length} 场景` : '待提取'
        case 'script:voice':
          return characters.some((c) => c.voiceId) ? `${characters.filter((c) => c.voiceId).length}/${characters.length} 已分配` : '待分配'
        case 'script:storyboard':
          return storyboards.length > 0 ? `${storyboards.length} 镜头` : '待生成'
        case 'prod:chars':
          return characters.length > 0 ? `${characters.filter((c) => c.imageUrl).length}/${characters.length} 形象` : '待生成'
        case 'prod:scenes':
          return scenes.length > 0 ? `${scenes.filter((s) => s.imageUrl).length}/${scenes.length} 图片` : '待生成'
        case 'prod:dubbing':
          return storyboards.filter((s) => s.dialogue).length > 0 ? `${storyboards.filter((s) => s.ttsAudioUrl).length}/${storyboards.filter((s) => s.dialogue).length} 配音` : '待生成'
        case 'prod:shots':
          return storyboards.length > 0 ? `${storyboards.filter((s) => s.firstFrameUrl).length}/${storyboards.length} 帧图` : '待生成'
        case 'prod:videos':
          return storyboards.length > 0 ? `${storyboards.filter((s) => s.videoUrl).length}/${storyboards.length} 视频` : '待生成'
        case 'prod:compose':
          return storyboards.some((s) => s.videoUrl) ? `${storyboards.filter((s) => s.composedUrl).length}/${storyboards.filter((s) => s.videoUrl).length} 合成` : '待合成'
        case 'export:merge':
          return storyboards.some((s) => s.composedUrl || s.videoUrl) ? '可导出' : '待合成'
        default:
          return ''
      }
    },
    [rawContent, scriptContent, characters, scenes, storyboards]
  )

  // ── Pipeline step status helper ────────────────────────────

  const getPipelineStepStatus = useCallback(
    (key: PipelineStepKey): 'pending' | 'active' | 'completed' => {
      if (pipelineStatus?.pipeline?.[key]) {
        const status = pipelineStatus.pipeline[key].status
        // api.ts already maps: done→completed, partial→active, pending→pending
        if (status === 'completed') return 'completed'
        if (status === 'active') return 'active'
        return 'pending'
      }
      return 'pending'
    },
    [pipelineStatus]
  )

  const pipelineCompletedCount = pipelineStatus?.completedSteps ?? 0
  const pipelineTotalCount = pipelineStatus?.totalSteps ?? 12

  // ── Pipeline step navigation — replaced by 4 main tabs ─────

  // ── Save raw content ─────────────────────────────────────────

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

  // ── AI: Generate / re-confirm script from this episode's novel chapters ──
  // Calls the dedicated /generate-script endpoint which builds a Toonflow-style
  // prompt from the episode's chapters (sourceChapterIds) on the server.

  const handleGenerateScript = async (opts: { duration: string; instruction: string }) => {
    if (!selectedEpisodeId) return
    setScriptGenerating(true)
    setAiLoading(true)
    try {
      const result = await api.episodes.generateScript(selectedEpisodeId, opts)
      if (!result.scriptContent) {
        throw new Error('AI 返回空结果')
      }
      setScriptContent(result.scriptContent)
      await fetchEpisode()
      toast({ title: '剧本生成完成', description: '可在左侧分场大纲中查看场景结构，或直接编辑正文。' })
    } catch (err) {
      toast({ title: '剧本生成失败', description: String(err), variant: 'destructive' })
    } finally {
      setScriptGenerating(false)
      setAiLoading(false)
    }
  }

  // ── Episode switching (header selector) ────────────────────

  const handleSwitchEpisode = async (episodeId: string) => {
    if (!selectedDramaId || episodeId === selectedEpisodeId) return
    setSwitchingEpisode(true)
    try {
      const { navigateToEpisode } = useAppStore.getState()
      navigateToEpisode(selectedDramaId, episodeId)
    } finally {
      setSwitchingEpisode(false)
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
        '请从剧本中提取所有角色、场景和道具信息。先使用read_script_for_extraction读取剧本，再使用read_existing_characters、read_existing_scenes和read_existing_props查看已有数据，最后用save_characters、save_scenes和save_props保存提取结果（注意去重）。道具只提取对剧情有推动作用的关键道具。',
        { model: workspaceModels.llm || undefined }
      )
      // Check if agent reported an error
      const extractError = agentExec.errors['extractor']
      if (extractError) {
        toast({ title: '提取失败', description: extractError, variant: 'destructive' })
        return
      }
      await fetchEpisode()
      showResultDialog('success', '角色、场景与道具提取完成', 'AI已从剧本中提取角色、场景和道具信息，结果已自动保存。')
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
      const res = await fetch(`/api/dramas/${selectedDramaId}/characters`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ characterId, voiceId }),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
        throw new Error(errData.error || `音色分配失败 (${res.status})`)
      }
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
        const agentError = agentExec.errors['storyboard_breaker']
        let diagInfo: string
        if (agentError) {
          // Top-level agent error (e.g., LLM timeout, API error)
          if (agentError.includes('超时') || agentError.includes('timeout') || agentError.includes('timed out')) {
            diagInfo = `LLM响应超时，模型生成时间过长。建议：1) 在设置中切换更快的模型；2) 缩短剧本后再试。错误：${agentError}`
          } else if (agentError.includes('未配置') || agentError.includes('API Key')) {
            diagInfo = `LLM供应商未配置或API Key无效。请在设置中检查API Key配置。错误：${agentError}`
          } else if (agentError.includes('429') || agentError.includes('rate')) {
            diagInfo = `API调用频率超限，请稍后重试。错误：${agentError}`
          } else {
            diagInfo = `Agent执行失败：${agentError}`
          }
        } else if (result.toolErrors.length > 0) {
          diagInfo = `工具执行错误：${result.toolErrors.slice(0, 3).join('；')}`
        } else {
          diagInfo = 'AI未能成功调用save_storyboards工具。可能原因：1) LLM输出被截断（max_tokens不够）——已自动调高至32768，请重试；2) LLM没有正确调用工具——已添加自动引导逻辑；3) 当前模型不支持function calling——请切换到支持function calling的模型（如GPT-4o、DeepSeek V4、Qwen3等）。建议：在设置中检查LLM模型是否支持工具调用。'
        }
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
    maxPolls = 60,
    signal?: AbortSignal
  ): Promise<{ imageBase64?: string; videoUrl?: string } | null> => {
    for (let i = 0; i < maxPolls; i++) {
      if (signal?.aborted) return null
      await new Promise((r) => setTimeout(r, interval))
      if (signal?.aborted) return null
      try {
        const pollResult = await api.ai.pollStatus(category, taskId)
        if (pollResult.status === 'completed') {
          return { imageBase64: pollResult.imageBase64, videoUrl: pollResult.videoUrl }
        }
        if (pollResult.status === 'failed') {
          throw new Error(pollResult.error || '生成失败')
        }
      } catch (err) {
        if (signal?.aborted) return null
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
        pollAbortRef.current?.abort()
        const controller = new AbortController()
        pollAbortRef.current = controller
        await pollAsyncTask('image', result.taskId as string, undefined, undefined, controller.signal)
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
        pollAbortRef.current?.abort()
        const controller = new AbortController()
        pollAbortRef.current = controller
        await pollAsyncTask('image', result.taskId as string, undefined, undefined, controller.signal)
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
        pollAbortRef.current?.abort()
        const controller = new AbortController()
        pollAbortRef.current = controller
        const pollResult = await pollAsyncTask('image', result.taskId as string, undefined, undefined, controller.signal)
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
          pollAbortRef.current?.abort()
          const controller = new AbortController()
          pollAbortRef.current = controller
          const pollResult = await pollAsyncTask('image', result.taskId as string, undefined, undefined, controller.signal)
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
        pollAbortRef.current?.abort()
        const controller = new AbortController()
        pollAbortRef.current = controller
        await pollAsyncTask('video', result.taskId as string, 10000, 60, controller.signal)
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
          pollAbortRef.current?.abort()
          const controller = new AbortController()
          pollAbortRef.current = controller
          await pollAsyncTask('video', result.taskId as string, 10000, 60, controller.signal)
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

  // ── AI: Batch generate all character images ──────────────

  const handleGenerateAllCharImages = async () => {
    const charsPending = characters.filter((c) => !c.imageUrl)
    if (charsPending.length === 0) {
      toast({ title: '所有角色都已有图片' })
      return
    }
    setBatchProgress({ current: 0, total: charsPending.length, message: '生成角色图片中...' })
    let successCount = 0
    for (let i = 0; i < charsPending.length; i++) {
      const char = charsPending[i]
      setGeneratingCharImg(char.id)
      setBatchProgress({ current: i + 1, total: charsPending.length, message: `生成角色头像 ${i + 1}/${charsPending.length}...` })
      try {
        const result = await api.ai.generateCharacterImage(char.id) as Record<string, unknown>
        if (result.status === 'processing' && result.taskId) {
          setBatchProgress({ current: i + 1, total: charsPending.length, message: `角色头像 ${i + 1}/${charsPending.length} 异步生成中...` })
          pollAbortRef.current?.abort()
          const controller = new AbortController()
          pollAbortRef.current = controller
          await pollAsyncTask('image', result.taskId as string, undefined, undefined, controller.signal)
        }
        successCount++
      } catch {
        // continue
      }
    }
    setGeneratingCharImg(null)
    setBatchProgress(null)
    toast({ title: `${successCount}/${charsPending.length}个角色图片生成完毕` })
    await fetchEpisode()
  }

  // ── AI: Batch generate all scene images ───────────────────

  const handleGenerateAllSceneImages = async () => {
    const scenesPending = scenes.filter((s) => !s.imageUrl)
    if (scenesPending.length === 0) {
      toast({ title: '所有场景都已有图片' })
      return
    }
    setBatchProgress({ current: 0, total: scenesPending.length, message: '生成场景图片中...' })
    let successCount = 0
    for (let i = 0; i < scenesPending.length; i++) {
      const scene = scenesPending[i]
      setGeneratingSceneImg(scene.id)
      setBatchProgress({ current: i + 1, total: scenesPending.length, message: `生成场景图 ${i + 1}/${scenesPending.length}...` })
      try {
        const result = await api.ai.generateSceneImage(scene.id) as Record<string, unknown>
        if (result.status === 'processing' && result.taskId) {
          setBatchProgress({ current: i + 1, total: scenesPending.length, message: `场景图 ${i + 1}/${scenesPending.length} 异步生成中...` })
          pollAbortRef.current?.abort()
          const controller = new AbortController()
          pollAbortRef.current = controller
          await pollAsyncTask('image', result.taskId as string, undefined, undefined, controller.signal)
        }
        successCount++
      } catch {
        // continue
      }
    }
    setGeneratingSceneImg(null)
    setBatchProgress(null)
    toast({ title: `${successCount}/${scenesPending.length}个场景图片生成完毕` })
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

  // ── PR-F: Import global assets ──────────────────────────────

  const handleImportGlobalAssets = async () => {
    if (!selectedEpisodeId) return
    setImportingAssets(true)
    try {
      const result = await api.episodes.importAssets(selectedEpisodeId, true)
      toast({
        title: '全局素材导入完成',
        description: `已导入 ${result.imported.characters} 角色、${result.imported.scenes} 场景、${result.imported.props} 道具`,
      })
      await fetchEpisode()
    } catch (err) {
      toast({ title: '导入全局素材失败', description: String(err), variant: 'destructive' })
    } finally {
      setImportingAssets(false)
    }
  }

  // ── PR-F: Import from Script Workbench (fill rawContent) ────

  const handleImportFromScriptWorkbench = async () => {
    if (!selectedEpisodeId || !episode) return
    setImportingAssets(true)
    try {
      // The import-assets API will fill rawContent from novel chapters
      await api.episodes.importAssets(selectedEpisodeId, false)
      // Reload episode to get the filled rawContent
      await fetchEpisode()
      toast({ title: '已从剧本工作台导入内容', description: '原始内容已自动填充' })
    } catch (err) {
      toast({ title: '导入失败', description: String(err), variant: 'destructive' })
    } finally {
      setImportingAssets(false)
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
        // Resolve voiceId from character lookup (same as single-shot handler)
        let voiceId: string | undefined
        if (sb.dialogueChar) {
          const character = characters.find(
            (c) => c.name.toLowerCase() === sb.dialogueChar!.toLowerCase()
          )
          if (character?.voiceId) {
            voiceId = character.voiceId
          }
        }
        await api.ai.generateTts(sb.id, sb.dialogue!, voiceId)
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
  // ── Render: main tab content ───────────────────────────────

  const episode = currentEpisode

  const storyboardProps = {
    storyboards,
    aiLoading,
    isStoryboarding: agentExec.isRunning('storyboard_breaker'),
    episode,
    agentExec,
    generatingShotImg,
    generatingVideo,
    generatingTts,
    batchProgress,
    uploadingField,
    copiedField,
    gridState,
    activePipelineStep: 'script:storyboard' as PipelineStepKey,
    handleGenerateStoryboard,
    handleEnhanceShotPrompt,
    handleGenerateAllImages,
    handleGenerateAllVideos,
    handleGenerateShotImage,
    handleGenerateVideo,
    handleGenerateTts,
    handleUpload,
    handleCopy,
    handleUpdateStoryboard,
    handleGridGenerate,
    onRefresh: fetchEpisode,
    workspaceModels,
  }

  const renderSubTabs = (
    tabs: Array<{ key: string; label: string; icon?: React.ReactNode }>,
    active: string,
    onChange: (key: string) => void
  ) => (
    <div className="flex-shrink-0 flex items-center gap-1 px-4 py-2 border-b border-neutral-800/60 bg-neutral-950/80 overflow-x-auto">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onChange(tab.key)}
          className={`flex-shrink-0 flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium transition-colors ${
            active === tab.key
              ? 'bg-neutral-800 text-neutral-100'
              : 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-900'
          }`}
        >
          {tab.icon}
          {tab.label}
        </button>
      ))}
    </div>
  )

  const SETTINGS_TABS = [
    { key: 'extract', label: '角色场景', icon: <Users className="size-3.5" /> },
    { key: 'chars', label: '角色形象', icon: <FileText className="size-3.5" /> },
    { key: 'scenes', label: '场景图片', icon: <Film className="size-3.5" /> },
    { key: 'voice', label: '音色分配', icon: <Globe className="size-3.5" /> },
  ]

  const FILM_TABS = [
    { key: 'dubbing', label: '配音', icon: <Globe className="size-3.5" /> },
    { key: 'videos', label: '镜头视频', icon: <Film className="size-3.5" /> },
    { key: 'compose', label: '合成预览', icon: <Clapperboard className="size-3.5" /> },
    { key: 'timeline', label: '时间线', icon: <LayoutGrid className="size-3.5" /> },
  ]

  const renderMainTab = () => {
    // ── 剧本 ──
    if (mainTab === 'script') {
      return (
        <ScriptStudio
          key={episode?.id ?? 'no-episode'}
          episode={episode}
          scriptContent={scriptContent}
          onScriptContentChange={setScriptContent}
          onSaveDraft={handleSaveScript}
          onGenerate={handleGenerateScript}
          generating={scriptGenerating}
          saving={saving}
          rawContent={rawContent}
          onGoSettings={() => setMainTab('settings')}
        />
      )
    }

    // ── 设定 ──
    if (mainTab === 'settings') {
      return (
        <div className="flex-1 flex flex-col overflow-hidden dark">
          {renderSubTabs(SETTINGS_TABS, settingsTab, (k) => setSettingsTab(k as SettingsTab))}
          <div className="flex-1 min-h-0 overflow-hidden">
            {settingsTab === 'extract' && (
              <ExtractPanel
                characters={characters}
                scenes={scenes}
                props={props}
                aiLoading={aiLoading}
                isExtracting={agentExec.isRunning('extractor')}
                episode={episode}
                agentExec={agentExec}
                copiedField={copiedField}
                handleExtract={handleExtract}
                handleCopy={handleCopy}
                onUpdateProp={async (id, field, value) => {
                  try {
                    await api.props.update(id, { [field]: value })
                    setProps((prev) =>
                      prev.map((p) => (p.id === id ? { ...p, [field]: value } : p))
                    )
                  } catch (err) {
                    toast({ title: '更新道具失败', description: String(err), variant: 'destructive' })
                  }
                }}
                globalAssetsImported={episode?.globalAssetsImported ?? false}
                importingAssets={importingAssets}
                onReimportGlobalAssets={handleImportGlobalAssets}
                onRefresh={fetchEpisode}
              />
            )}
            {settingsTab === 'chars' && (
              <CharImagesPanel
                characters={characters}
                aiLoading={aiLoading}
                generatingCharImg={generatingCharImg}
                batchProgress={batchProgress}
                uploadingField={uploadingField}
                copiedField={copiedField}
                handleGenerateCharSheet={handleGenerateCharSheet}
                handleGenerateCharImage={handleGenerateCharImage}
                handleUpload={handleUpload}
                handleCopy={handleCopy}
              />
            )}
            {settingsTab === 'scenes' && (
              <SceneImagesPanel
                scenes={scenes}
                aiLoading={aiLoading}
                generatingSceneImg={generatingSceneImg}
                batchProgress={batchProgress}
                uploadingField={uploadingField}
                copiedField={copiedField}
                handleGenerateSceneImage={handleGenerateSceneImage}
                handleUpload={handleUpload}
                handleCopy={handleCopy}
              />
            )}
            {settingsTab === 'voice' && (
              <VoicePanel
                characters={characters}
                aiLoading={aiLoading}
                agentExec={agentExec}
                activeStep={'voice'}
                handleVoiceAssign={handleVoiceAssign}
                handleAssignVoice={handleAssignVoice}
                handleGenerateVoiceSample={handleGenerateVoiceSample}
                voiceSamples={voiceSamples}
                generatingSample={generatingSample}
              />
            )}
          </div>
        </div>
      )
    }

    // ── 分镜 ──
    if (mainTab === 'storyboard') {
      return <StoryboardSeko {...storyboardProps} />
    }

    // ── 短片 ──
    return (
      <div className="flex-1 flex flex-col overflow-hidden dark">
        {renderSubTabs(FILM_TABS, filmTab, (k) => setFilmTab(k as FilmTab))}
        <div className="flex-1 min-h-0 overflow-hidden">
          {filmTab === 'dubbing' && (
            <DubbingPanel
              storyboards={storyboards}
              characters={characters}
              aiLoading={aiLoading}
              generatingTts={generatingTts}
              generatingAllTts={generatingAllTts}
              batchProgress={batchProgress}
              uploadingField={uploadingField}
              handleGenerateTts={handleGenerateTts}
              handleGenerateAllTts={handleGenerateAllTts}
              handleUpload={handleUpload}
            />
          )}
          {filmTab === 'videos' && (
            <VideoPanel
              storyboards={storyboards}
              aiLoading={aiLoading}
              generatingVideo={generatingVideo}
              batchProgress={batchProgress}
              uploadingField={uploadingField}
              copiedField={copiedField}
              handleGenerateVideo={handleGenerateVideo}
              handleGenerateAllVideos={handleGenerateAllVideos}
              handleUpload={handleUpload}
              handleCopy={handleCopy}
            />
          )}
          {filmTab === 'compose' && (
            <ComposePanel
              storyboards={storyboards}
              aiLoading={aiLoading}
              composing={composing}
              composingAll={composingAll}
              batchProgress={batchProgress}
              previewMode={previewMode}
              currentPreviewShot={currentPreviewShot}
              exporting={exporting}
              previewVideoRef={previewVideoRef}
              previewAudioRef={previewAudioRef}
              perms={perms}
              handleComposeShot={handleComposeShot}
              handleComposeAll={handleComposeAll}
              handleStartPreview={handleStartPreview}
              handlePreviewEnded={handlePreviewEnded}
              handleExport={handleExport}
              setPreviewMode={setPreviewMode}
              setCurrentPreviewShot={setCurrentPreviewShot}
            />
          )}
          {filmTab === 'timeline' && (
            <TimelineEditor
              storyboards={storyboards}
              episodeId={selectedEpisodeId || ''}
              dramaId={selectedDramaId || ''}
              onSelectStoryboard={(sb) => {
                setMainTab('storyboard')
              }}
              onUpdateStoryboard={handleUpdateStoryboard}
              onReorderStoryboards={async (orderedIds) => {
                try {
                  await api.storyboards.reorder(selectedEpisodeId!, orderedIds)
                  await fetchEpisode()
                } catch (err) {
                  throw err
                }
              }}
            />
          )}
        </div>
      </div>
    )
  }

  // ── Pipeline next-action hint (畅通管线引导) ────────────────

  const nextAction = useMemo(() => {
    if (!scriptContent.trim()) return { tab: 'script' as MainTab, label: '生成剧本' }
    if (characters.length === 0 && scenes.length === 0)
      return { tab: 'settings' as MainTab, label: '提取角色与场景' }
    if (storyboards.length === 0) return { tab: 'storyboard' as MainTab, label: '生成分镜' }
    if (!storyboards.some((s) => s.videoUrl))
      return { tab: 'film' as MainTab, label: '生成镜头视频' }
    return null
  }, [scriptContent, characters, scenes, storyboards])

  const tabDone = (key: MainTab): boolean => {
    switch (key) {
      case 'script':
        return scriptContent.trim().length > 0
      case 'settings':
        return characters.length > 0 || scenes.length > 0
      case 'storyboard':
        return storyboards.length > 0
      case 'film':
        return storyboards.some((s) => s.videoUrl)
    }
  }

  // ── Episode info for top bar ───────────────────────────────

  const dramaTitle = currentDrama?.title ?? '项目'
  const episodeTitle = episode?.title || (episode ? `第${episode.episodeNumber}集` : '集')
  const sortedEpisodes = [...dramaEpisodes].sort((a, b) => a.episodeNumber - b.episodeNumber)

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-neutral-950 text-neutral-200">
      {/* ── Top Bar ────────────────────────────────────────── */}
      <header className="flex-shrink-0 border-b border-neutral-800/70 bg-neutral-950/90 backdrop-blur-md z-10">
        <div className="flex items-center gap-3 px-4 py-2.5 flex-wrap sm:flex-nowrap">
          {/* 返回 + 项目名 */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => selectedDramaId && navigateToProject(selectedDramaId)}
            className="text-neutral-400 hover:text-neutral-100 hover:bg-neutral-900 -ml-2 gap-1"
          >
            <ArrowLeft className="size-4" />
            <span className="hidden md:inline max-w-32 truncate">{dramaTitle}</span>
          </Button>

          {/* 剧集选择器 */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                disabled={switchingEpisode || sortedEpisodes.length === 0}
                className="h-8 gap-1.5 border-neutral-800 bg-neutral-900 text-neutral-200 hover:bg-neutral-800 hover:text-neutral-100 text-xs max-w-44"
              >
                {switchingEpisode ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Badge className="bg-lime-300/15 text-lime-300 border-0 text-[10px] px-1.5 h-4 shrink-0">
                    第{episode?.episodeNumber ?? '-'}集
                  </Badge>
                )}
                <span className="truncate">{episodeTitle}</span>
                <ChevronDown className="size-3.5 text-neutral-500 shrink-0" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-80 overflow-y-auto bg-neutral-900 border-neutral-800">
              {sortedEpisodes.map((ep) => (
                <DropdownMenuItem
                  key={ep.id}
                  onClick={() => handleSwitchEpisode(ep.id)}
                  className={`gap-2 text-xs cursor-pointer ${
                    ep.id === selectedEpisodeId ? 'text-lime-300' : 'text-neutral-300'
                  }`}
                >
                  <span className="font-mono text-[10px] text-neutral-500 w-10 shrink-0">
                    EP{String(ep.episodeNumber).padStart(2, '0')}
                  </span>
                  <span className="truncate max-w-48">{ep.title || `第${ep.episodeNumber}集`}</span>
                  {ep.scriptStatus === 'completed' && (
                    <Check className="size-3 text-emerald-400 ml-auto shrink-0" />
                  )}
                  {ep.id === selectedEpisodeId && (
                    <span className="ml-auto size-1.5 rounded-full bg-lime-300 shrink-0" />
                  )}
                </DropdownMenuItem>
              ))}
              {sortedEpisodes.length === 0 && (
                <div className="px-3 py-4 text-xs text-neutral-500 text-center">暂无剧集</div>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* 中央 Tab 组：剧本 — 设定 — 分镜 — 短片（移动端换行居中） */}
          <div className="order-last w-full basis-full sm:order-none sm:w-auto sm:basis-auto sm:flex-1 flex items-center justify-center min-w-0 overflow-x-auto">
            <div className="flex items-center gap-1 whitespace-nowrap">
              {MAIN_TABS.map((tab, idx) => {
                const isActive = mainTab === tab.key
                const done = tabDone(tab.key)
                return (
                  <div key={tab.key} className="flex items-center whitespace-nowrap">
                    {idx > 0 && <span className="w-3 h-px bg-neutral-700 mx-0.5 shrink-0" />}
                    <button
                      onClick={() => setMainTab(tab.key)}
                      className={`flex items-center gap-1.5 h-8 px-3 sm:px-3.5 rounded-lg text-xs font-medium transition-all ${
                        isActive
                          ? 'bg-neutral-800 text-neutral-100 shadow-sm ring-1 ring-neutral-700'
                          : 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-900/70'
                      }`}
                    >
                      {tab.icon}
                      <span>{tab.label}</span>
                      <span
                        className={`size-1.5 rounded-full ${
                          done
                            ? 'bg-lime-300'
                            : isActive
                              ? 'bg-neutral-600'
                              : 'bg-neutral-800'
                        }`}
                      />
                    </button>
                  </div>
                )
              })}
            </div>
          </div>

          {/* 右侧：锁定 + 用户 */}
          <div className="flex items-center gap-1.5 ml-auto shrink-0">
            {episode?.globalAssetsImported && (
              <Badge variant="secondary" className="hidden lg:flex text-[10px] gap-1 bg-emerald-500/10 text-emerald-400 border-0">
                <Globe className="size-3" />
                全局素材已导入
              </Badge>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className={`h-8 px-2 gap-1.5 text-xs ${
                    isConfigLocked
                      ? 'text-amber-400 hover:text-amber-300 hover:bg-amber-500/10'
                      : 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-900'
                  }`}
                  onClick={isConfigLocked ? handleUnlockConfig : handleLockConfig}
                >
                  {isConfigLocked ? <Lock className="size-3.5" /> : <LockOpen className="size-3.5" />}
                  <span className="hidden md:inline">{isConfigLocked ? '已锁定' : '锁定模型'}</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={6}>
                {isConfigLocked ? '解锁后将使用全局默认模型' : '将当前模型配置锁定到本集'}
              </TooltipContent>
            </Tooltip>
            <UserMenu />
          </div>
        </div>
      </header>

      {/* ── Body ───────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={mainTab}
            variants={panelVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.15 }}
            className="flex-1 flex flex-col overflow-hidden"
          >
            {renderMainTab()}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ── Bottom: 管线进度 + 下一步引导 ──────────────────── */}
      <div className="flex-shrink-0 border-t border-neutral-800/70 bg-neutral-950 px-4 py-1.5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[10px] text-neutral-500 shrink-0">管线进度</span>
            <div className="w-24 sm:w-40 h-1 bg-neutral-800 rounded-full overflow-hidden shrink-0">
              <motion.div
                className="h-full bg-lime-300 rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${pipelineStatus?.progressPercent ?? 0}%` }}
                transition={{ duration: 0.5 }}
              />
            </div>
            <span className="text-[10px] text-neutral-600 shrink-0">
              {pipelineCompletedCount}/{pipelineTotalCount}
            </span>
          </div>
          {nextAction && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setMainTab(nextAction.tab)}
              className="h-6 px-2 text-[10px] gap-1 text-lime-300 hover:text-lime-200 hover:bg-lime-300/10"
            >
              下一步：{nextAction.label}
              <ChevronRight className="size-3" />
            </Button>
          )}
        </div>
      </div>

      <ResultDialog state={resultDialog} onClose={() => setResultDialog(EMPTY_RESULT_DIALOG)} />
    </div>
  )
}
