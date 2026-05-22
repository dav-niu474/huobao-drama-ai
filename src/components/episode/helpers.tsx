import { FileText, Users, Mic, Clapperboard, Image, Video, Layers, Download, MapPin } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { PipelineStepDef, PipelineStepKey, StageKey, StageDef, ProdTabKey } from './types'

// ── Stage definitions ─────────────────────────────────────────

export const STAGES: StageDef[] = [
  { key: 'script', label: '剧本', icon: <FileText className="size-4" /> },
  { key: 'production', label: '制作', icon: <Clapperboard className="size-4" /> },
  { key: 'export', label: '导出', icon: <Download className="size-4" /> },
]

// ── 12-Step Production Pipeline (3 stages) ────────────────────

export const PIPELINE_STEPS: PipelineStepDef[] = [
  // Script stage
  { key: 'script:raw',        stepNumber: 1,  label: '原始内容',     description: '输入原始故事或剧本内容',        stage: 'script' },
  { key: 'script:rewrite',    stepNumber: 2,  label: 'AI改写',      description: 'AI将原始内容改写为标准剧本格式', stage: 'script' },
  { key: 'script:extract',    stepNumber: 3,  label: '角色场景提取', description: '从剧本中提取角色和场景信息',     stage: 'script' },
  { key: 'script:voice',      stepNumber: 4,  label: '音色分配',     description: '为每个角色分配合适的TTS音色',    stage: 'script' },
  { key: 'script:storyboard', stepNumber: 5,  label: '分镜生成',     description: '将剧本拆解为分镜镜头序列',      stage: 'script' },
  // Production stage
  { key: 'prod:chars',   stepNumber: 6,  label: '角色形象', description: '生成或上传角色设定图',     stage: 'production' },
  { key: 'prod:scenes',  stepNumber: 7,  label: '场景图片', description: '生成或上传场景背景图',     stage: 'production' },
  { key: 'prod:dubbing', stepNumber: 8,  label: '配音生成', description: '生成或上传角色对话语音',   stage: 'production' },
  { key: 'prod:shots',   stepNumber: 9,  label: '镜头图片', description: '生成或上传分镜首帧尾帧图', stage: 'production' },
  { key: 'prod:videos',  stepNumber: 10, label: '视频生成', description: '生成或上传每个镜头视频',   stage: 'production' },
  { key: 'prod:compose', stepNumber: 11, label: '视频合成', description: 'FFmpeg合成视频+音频+字幕', stage: 'production' },
  // Export stage
  { key: 'export:merge', stepNumber: 12, label: '拼接导出', description: 'FFmpeg合并为成片', stage: 'export' },
]

// ── Production tab definitions ────────────────────────────────

export const PROD_TABS: { key: ProdTabKey; label: string; stepNumber: number; icon: React.ReactNode }[] = [
  { key: 'chars',   label: '角色形象', stepNumber: 6,  icon: <Users className="size-3.5" /> },
  { key: 'scenes',  label: '场景图片', stepNumber: 7,  icon: <MapPin className="size-3.5" /> },
  { key: 'dubbing', label: '配音生成', stepNumber: 8,  icon: <Mic className="size-3.5" /> },
  { key: 'shots',   label: '镜头图片', stepNumber: 9,  icon: <Image className="size-3.5" /> },
  { key: 'videos',  label: '视频生成', stepNumber: 10, icon: <Video className="size-3.5" /> },
  { key: 'compose', label: '视频合成', stepNumber: 11, icon: <Layers className="size-3.5" /> },
]

// ── Helper: get pipeline steps for a stage ────────────────────

export function getStepsForStage(stage: StageKey): PipelineStepDef[] {
  return PIPELINE_STEPS.filter(s => s.stage === stage)
}

// ── Helper: get step by key ───────────────────────────────────

export function getStepByKey(key: PipelineStepKey): PipelineStepDef | undefined {
  return PIPELINE_STEPS.find(s => s.key === key)
}

// ── Helper: status badge ─────────────────────────────────────

export function statusBadge(status: string) {
  switch (status) {
    case 'completed':
      return <Badge className="status-completed text-[10px] px-1.5 py-0">完成</Badge>
    case 'processing':
      return <Badge className="status-processing text-[10px] px-1.5 py-0 amber-pulse">生成中</Badge>
    case 'failed':
      return <Badge className="status-failed text-[10px] px-1.5 py-0">失败</Badge>
    default:
      return <Badge variant="outline" className="text-[10px] px-1.5 py-0">待处理</Badge>
  }
}

// ── Helper: shot type label ──────────────────────────────────

export function shotTypeLabel(type: string): string {
  const map: Record<string, string> = {
    'close-up': '特写',
    'medium': '中景',
    'wide': '全景',
    'extreme-close-up': '大特写',
    'medium-close-up': '近景',
    'full-shot': '全景',
    'long-shot': '远景',
    'over-the-shoulder': '过肩',
    'point-of-view': '主观',
  }
  return map[type] ?? type
}

// ── Panel transition variants ────────────────────────────────

export const panelVariants = {
  initial: { opacity: 0, x: 16 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -16 },
}
