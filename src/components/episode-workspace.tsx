'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAppStore, type EpisodeDetail, type Character, type Scene, type Storyboard } from '@/lib/store'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { usePermissions } from '@/hooks/use-permissions'
import { useAgentExecution } from '@/components/agent-execution-panel'
import { ModelSelector } from '@/components/model-selector'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  ArrowLeft,
  Loader2,
  FileText,
  Users,
  Film,
  Clapperboard,
  Check,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
  Mic,
} from 'lucide-react'
import { UserMenu } from '@/components/user-menu'

// Sub-components
import { ScriptPanel } from '@/components/episode/script-panel'
import { ExtractPanel } from '@/components/episode/extract-panel'
import { VoicePanel } from '@/components/episode/voice-panel'
import { StoryboardPanel } from '@/components/episode/storyboard-panel'
import { ProductionPanel } from '@/components/episode/production-panel'

// Shared types & helpers
import type { StepKey, StepDef, UploadOptions, BatchProgress } from '@/components/episode/types'
import { STEPS, statusBadge, panelVariants } from '@/components/episode/helpers'

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

  // Agent execution hook — manages SSE streaming with rich log rendering
  const agentExec = useAgentExecution()
  const [batchProgress, setBatchProgress] = useState<BatchProgress | null>(null)
  const [generatingAllTts, setGeneratingAllTts] = useState(false)
  const [composing, setComposing] = useState<string | null>(null)
  const [composingAll, setComposingAll] = useState(false)
  const [previewMode, setPreviewMode] = useState(false)
  const [currentPreviewShot, setCurrentPreviewShot] = useState(0)
  const [exporting, setExporting] = useState(false)
  const previewVideoRef = useRef<HTMLVideoElement>(null)
  const previewAudioRef = useRef<HTMLAudioElement>(null)

  // Workspace model selection - persisted in global store + localStorage
  const { workspaceModels, setWorkspaceModel, initWorkspaceModels } = useAppStore()

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
      toast({ title: '剧本改写完成' })
      await fetchEpisode()
      setActiveStep('rewrite')
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
      toast({ title: '角色与场景提取完成' })
      await fetchEpisode()
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
      toast({ title: '音色分配完成' })
      await fetchEpisode()
    } catch (err) {
      toast({ title: '音色分配失败', description: String(err), variant: 'destructive' })
    } finally {
      setAiLoading(false)
    }
  }

  // ── AI: Generate storyboard (via Agent) ──────────────────────

  const handleGenerateStoryboard = async () => {
    if (!selectedEpisodeId || !selectedDramaId) return
    setAiLoading(true)
    try {
      await agentExec.startAgent(
        'storyboard_breaker',
        selectedEpisodeId,
        selectedDramaId,
        '请将剧本拆解为分镜序列。先使用read_storyboard_context读取剧本、角色和场景信息，然后为每个镜头生成完整的分镜数据。⚠️重要：每个分镜的imagePrompt必须是6维度专业英文提示词（风格+构图+角色+场景+光线+画质），videoPrompt必须使用3秒分段XML格式。一步到位，无需二次增强。最后用save_storyboards保存所有分镜。',
        { model: workspaceModels.llm || undefined }
      )
      toast({ title: '分镜生成完成' })
      await fetchEpisode()
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
      toast({ title: `镜头 ${storyboard.shotNumber} 提示词已增强` })
      await fetchEpisode()
    } catch (err) {
      toast({ title: '提示词增强失败', description: String(err), variant: 'destructive' })
    } finally {
      setAiLoading(false)
    }
  }

  // ── Client-side async polling helper ──────────────────────

  /** Poll /api/ai/poll-status until the task completes or fails */
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
        // status === 'pending' | 'processing' → continue polling
      } catch (err) {
        // If pollStatus itself fails (e.g. network error), don't abort — retry
        if (i === maxPolls - 1) throw err
      }
    }
    throw new Error('生成超时，请稍后重试')
  }

  // ── AI: Generate scene image ───────────────────────────────

  const handleGenerateSceneImage = async (sceneId: string) => {
    setGeneratingSceneImg(sceneId)
    try {
      const result = await api.ai.generateSceneImage(sceneId) as Record<string, unknown>
      // Check if the response indicates async processing
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
      // Check if the response indicates async processing
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
      // Check if the response indicates async processing
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
        // Check if the response indicates async processing
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
        // Continue with next shot even if one fails
      }
    }
    setGeneratingShotImg(null)
    setBatchProgress(null)
    toast({ title: `${successCount}/${pending.length}个镜头图片生成完毕` })
    await fetchEpisode()
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
      // Check if the response indicates async processing
      if (result.status === 'processing' && result.taskId) {
        toast({ title: `镜头 ${storyboard.shotNumber} 视频生成中...` })
        await pollAsyncTask('video', result.taskId as string, 10000, 60)
        // After polling completes, the server has already updated the storyboard
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
      // Look up the character's voiceId from the characters state
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
    // Remove firstFrameUrl restriction — text-to-video is now supported
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
        // Check if the response indicates async processing
        if (result.status === 'processing' && result.taskId) {
          setBatchProgress({ current: i + 1, total: pending.length, message: `视频 ${i + 1}/${pending.length} 异步生成中，等待结果...` })
          await pollAsyncTask('video', result.taskId as string, 10000, 60)
        }
        successCount++
      } catch {
        // Continue with next shot even if one fails
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

    // Generate character images first
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

    // Then generate scene images
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
        // Continue with next shot even if one fails
      }
    }
    setGeneratingTts(null)
    setBatchProgress(null)
    setGeneratingAllTts(false)
    toast({ title: `${successCount}/${pending.length}个镜头配音生成完毕` })
    await fetchEpisode()
  }

  // ── Compose a single shot (client-side Canvas + Web Audio + MediaRecorder) ────

  const handleComposeShot = async (storyboard: Storyboard) => {
    if (!storyboard.videoUrl) {
      toast({ title: '该镜头没有视频，无法合成', variant: 'destructive' })
      return
    }
    setComposing(storyboard.id)
    try {
      // Use Canvas + Web Audio API + MediaRecorder for real compositing
      const canvas = document.createElement('canvas')
      canvas.width = 1024
      canvas.height = 576
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Canvas context not available')

      // Load video
      const videoEl = document.createElement('video')
      videoEl.crossOrigin = 'anonymous'
      videoEl.playsInline = true
      videoEl.muted = true // Mute video element; we'll capture audio separately
      videoEl.src = storyboard.videoUrl

      await new Promise<void>((resolve, reject) => {
        videoEl.onloadeddata = () => resolve()
        videoEl.onerror = () => reject(new Error('Failed to load video'))
      })

      // Setup canvas stream
      const canvasStream = canvas.captureStream(30)

      // Setup audio if TTS exists
      let audioCtx: AudioContext | null = null
      let mixedStream: MediaStream | null = null

      if (storyboard.ttsAudioUrl) {
        try {
          audioCtx = new AudioContext()
          // Create audio sources
          const videoSource = audioCtx.createMediaElementSource(
            Object.assign(document.createElement('video'), {
              crossOrigin: 'anonymous',
              src: storyboard.videoUrl,
            })
          )
          const ttsAudioEl = new Audio(storyboard.ttsAudioUrl)
          const ttsSource = audioCtx.createMediaElementSource(ttsAudioEl)

          // Create destination for mixed audio
          const dest = audioCtx.createMediaStreamDestination()

          // Mix video audio + TTS audio
          videoSource.connect(dest)
          ttsSource.connect(dest)
          videoSource.connect(audioCtx.destination) // For monitoring
          ttsSource.connect(audioCtx.destination)

          // Combine canvas video + mixed audio
          const audioTracks = dest.stream.getAudioTracks()
          const videoTracks = canvasStream.getVideoTracks()
          mixedStream = new MediaStream([...videoTracks, ...audioTracks])
        } catch {
          // If audio mixing fails, just use canvas stream without audio
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
        recorder.onstop = () => {
          resolve(new Blob(chunks, { type: 'video/webm' }))
        }
        recorder.onerror = reject
        recorder.start()
      })

      // Play video and draw frames onto canvas
      videoEl.currentTime = 0
      await new Promise<void>((resolveCompose) => {
        const drawFrame = () => {
          if (videoEl.paused || videoEl.ended) {
            ctx!.drawImage(videoEl, 0, 0, canvas.width, canvas.height)
            // Draw subtitle if dialogue exists
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
          // Draw subtitle if dialogue exists
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
          // Draw final frame one more time then stop
          drawFrame()
          setTimeout(() => resolveCompose(), 100)
        }
        videoEl.play().catch(() => resolveCompose())
      })

      recorder.stop()
      const composedBlob = await blob

      // Convert blob to base64 data URL for persistence
      const reader = new FileReader()
      const composedUrl = await new Promise<string>((resolve) => {
        reader.onload = () => resolve(reader.result as string)
        reader.readAsDataURL(composedBlob)
      })

      // Save to the storyboard
      await api.storyboards.update(storyboard.id, { composedUrl })

      if (audioCtx) {
        audioCtx.close().catch(() => {})
      }

      toast({ title: `镜头 ${storyboard.shotNumber} 已合成（含字幕+配音）` })
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
    setBatchProgress({ current: 0, total: composable.length, message: '合成中...' })
    let successCount = 0
    for (let i = 0; i < composable.length; i++) {
      const sb = composable[i]
      setComposing(sb.id)
      setBatchProgress({ current: i + 1, total: composable.length, message: `合成镜头 ${i + 1}/${composable.length}（字幕+配音）...` })
      try {
        // Use the real compositing workflow
        await handleComposeShot(sb)
        successCount++
      } catch {
        // Continue with next shot even if one fails
      }
    }
    setComposing(null)
    setBatchProgress(null)
    setComposingAll(false)
    toast({ title: `${successCount}/${composable.length}个镜头合成完毕` })
    await fetchEpisode()
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

  // ── Export final video (client-side canvas + MediaRecorder + audio mixing) ─

  const handleExport = async () => {
    // Check export permission
    if (!perms.canExport) {
      toast({
        title: '导出功能需要专业版',
        description: '免费用户无法导出成片，请升级专业版。',
        variant: 'destructive',
      })
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

      // Try to create an audio context for mixing
      let audioCtx: AudioContext | null = null
      let mixedStream: MediaStream | null = null

      try {
        audioCtx = new AudioContext()
        const dest = audioCtx.createMediaStreamDestination()
        // Connect all TTS audio tracks
        const audioTracks = dest.stream.getAudioTracks()
        const videoTracks = canvasStream.getVideoTracks()
        if (audioTracks.length > 0) {
          mixedStream = new MediaStream([...videoTracks, ...audioTracks])
        }
      } catch {
        // If AudioContext not available, just use canvas stream
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
        recorder.onstop = () => {
          resolve(new Blob(chunks, { type: 'video/webm' }))
        }
        recorder.onerror = reject
        recorder.start()
      })

      // Play each shot video onto the canvas
      const tempVideo = document.createElement('video')
      tempVideo.crossOrigin = 'anonymous'
      tempVideo.playsInline = true
      tempVideo.muted = true

      for (let i = 0; i < videoShots.length; i++) {
        const shot = videoShots[i]
        const videoSource = shot.composedUrl || shot.videoUrl!
        setBatchProgress({
          current: i + 1,
          total: videoShots.length,
          message: `导出镜头 ${i + 1}/${videoShots.length}...`,
        })

        await new Promise<void>((resolveShot) => {
          tempVideo.src = videoSource
          tempVideo.onloadeddata = () => {
            tempVideo.play()
          }
          tempVideo.onended = () => {
            resolveShot()
          }
          tempVideo.onerror = () => {
            resolveShot() // Skip on error
          }

          // Draw frames with subtitle overlay
          const drawFrame = () => {
            if (tempVideo.paused || tempVideo.ended) {
              ctx!.drawImage(tempVideo, 0, 0, canvas.width, canvas.height)
              // Draw subtitle
              if (shot.dialogue) {
                ctx!.fillStyle = 'rgba(0,0,0,0.6)'
                ctx!.fillRect(0, canvas.height - 60, canvas.width, 60)
                ctx!.fillStyle = 'white'
                ctx!.font = 'bold 20px sans-serif'
                ctx!.textAlign = 'center'
                const subtitleText = shot.dialogueChar
                  ? `${shot.dialogueChar}：${shot.dialogue}`
                  : shot.dialogue
                ctx!.fillText(subtitleText, canvas.width / 2, canvas.height - 25)
              }
              return
            }
            ctx!.drawImage(tempVideo, 0, 0, canvas.width, canvas.height)
            // Draw subtitle
            if (shot.dialogue) {
              ctx!.fillStyle = 'rgba(0,0,0,0.6)'
              ctx!.fillRect(0, canvas.height - 60, canvas.width, 60)
              ctx!.fillStyle = 'white'
              ctx!.font = 'bold 20px sans-serif'
              ctx!.textAlign = 'center'
              const subtitleText = shot.dialogueChar
                ? `${shot.dialogueChar}：${shot.dialogue}`
                : shot.dialogue
              ctx!.fillText(subtitleText, canvas.width / 2, canvas.height - 25)
            }
            requestAnimationFrame(drawFrame)
          }
          tempVideo.onplay = () => {
            drawFrame()
          }
        })

        // Small pause between shots
        await new Promise((r) => setTimeout(r, 300))
      }

      recorder.stop()
      const resultBlob = await blob

      if (audioCtx) {
        audioCtx.close().catch(() => {})
      }

      // Download
      const url = URL.createObjectURL(resultBlob)
      const a = document.createElement('a')
      a.href = url
      a.download = `episode-export-${Date.now()}.webm`
      a.click()
      URL.revokeObjectURL(url)

      toast({ title: '视频导出成功（含字幕叠加）' })
    } catch (err) {
      toast({ title: '导出失败', description: String(err), variant: 'destructive' })
    } finally {
      setExporting(false)
      setBatchProgress(null)
    }
  }

  // ── Derive current processing state from episode ───────────

  const episode = currentEpisode as EpisodeDetail | null
  const isRewriting = episode?.scriptStatus === 'processing'
  const isExtracting = episode?.extractStatus === 'processing'
  const isStoryboarding = episode?.storyboardStatus === 'processing'

  // ── Determine sidebar step active state ────────────────────

  const isSidebarStepActive = (step: StepDef): boolean => {
    if (step.subSteps) {
      return step.subSteps.some((ss) => ss.key === activeStep)
    }
    return step.key === activeStep
  }

  // ── Render active panel ────────────────────────────────────

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
            isRewriting={isRewriting}
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
            isExtracting={isExtracting}
            episode={episode}
            agentExec={agentExec}
            generatingCharImg={generatingCharImg}
            generatingSceneImg={generatingSceneImg}
            batchProgress={batchProgress}
            uploadingField={uploadingField}
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
          />
        )
      case 'storyboard':
        return (
          <StoryboardPanel
            storyboards={storyboards}
            aiLoading={aiLoading}
            isStoryboarding={isStoryboarding}
            episode={episode}
            agentExec={agentExec}
            generatingShotImg={generatingShotImg}
            generatingVideo={generatingVideo}
            generatingTts={generatingTts}
            batchProgress={batchProgress}
            uploadingField={uploadingField}
            copiedField={copiedField}
            handleGenerateStoryboard={handleGenerateStoryboard}
            handleEnhanceShotPrompt={handleEnhanceShotPrompt}
            handleGenerateAllImages={handleGenerateAllImages}
            handleGenerateAllVideos={handleGenerateAllVideos}
            handleGenerateShotImage={handleGenerateShotImage}
            handleGenerateVideo={handleGenerateVideo}
            handleGenerateTts={handleGenerateTts}
            handleUpload={handleUpload}
            handleCopy={handleCopy}
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
            handleGenerateShotImage={handleGenerateShotImage}
            handleGenerateVideo={handleGenerateVideo}
            handleGenerateTts={handleGenerateTts}
            handleGenerateAllVideos={handleGenerateAllVideos}
            handleGenerateAllTts={handleGenerateAllTts}
            handleComposeShot={handleComposeShot}
            handleComposeAll={handleComposeAll}
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
            />
            <ModelSelector
              category="image"
              value={workspaceModels.image}
              onChange={(m) => setWorkspaceModel('image', m)}
            />
            <ModelSelector
              category="video"
              value={workspaceModels.video}
              onChange={(m) => setWorkspaceModel('video', m)}
            />
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
          />
          <ModelSelector
            category="image"
            value={workspaceModels.image}
            onChange={(m) => setWorkspaceModel('image', m)}
          />
          <ModelSelector
            category="video"
            value={workspaceModels.video}
            onChange={(m) => setWorkspaceModel('video', m)}
          />
        </div>
      </header>

      {/* ── Body: Sidebar + Main ───────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
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
                  <div className="p-3 space-y-1">
                    {STEPS.map((step, idx) => (
                      <div key={step.key}>
                        {/* Main step */}
                        <button
                          onClick={() => {
                            if (step.subSteps) {
                              setActiveStep(step.subSteps[0].key)
                            } else {
                              setActiveStep(step.key)
                            }
                          }}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all duration-150 group ${
                            isSidebarStepActive(step)
                              ? 'bg-primary/10 text-primary'
                              : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                          }`}
                        >
                          {/* Step number */}
                          <div
                            className={`flex-shrink-0 size-7 rounded flex items-center justify-center text-xs font-bold ${
                              isSidebarStepActive(step)
                                ? 'bg-primary text-primary-foreground'
                                : isStepCompleted(step.key)
                                  ? 'bg-emerald-500/20 text-emerald-500'
                                  : 'bg-muted text-muted-foreground'
                            }`}
                          >
                            {isStepCompleted(step.key) && !isSidebarStepActive(step) ? (
                              <Check className="size-3.5" />
                            ) : (
                              idx + 1
                            )}
                          </div>

                          <span className="text-sm font-medium">{step.label}</span>

                          {isStepCompleted(step.key) && !isSidebarStepActive(step) && (
                            <Check className="size-3.5 text-emerald-500 ml-auto" />
                          )}
                        </button>

                        {/* Sub-steps */}
                        {step.subSteps && (
                          <div className="ml-4 border-l border-border/50 pl-3 mt-1 space-y-0.5">
                            {step.subSteps.map((sub) => (
                              <button
                                key={sub.key}
                                onClick={() => setActiveStep(sub.key)}
                                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-xs transition-all duration-150 ${
                                  activeStep === sub.key
                                    ? 'bg-primary/10 text-primary font-medium'
                                    : isStepCompleted(sub.key)
                                      ? 'text-emerald-500'
                                      : 'text-muted-foreground hover:text-foreground'
                                }`}
                              >
                                {isStepCompleted(sub.key) && activeStep !== sub.key ? (
                                  <Check className="size-3 flex-shrink-0" />
                                ) : (
                                  <ChevronRight className="size-3 flex-shrink-0" />
                                )}
                                {sub.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>

                {/* Progress */}
                <div className="p-3 border-t border-border/50">
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                    <span>总进度</span>
                    <span>{progressPercent}%</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-primary rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${progressPercent}%` }}
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
        </main>
      </div>
    </div>
  )
}
