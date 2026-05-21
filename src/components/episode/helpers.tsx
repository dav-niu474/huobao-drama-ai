import { FileText, Users, Mic, Film, Clapperboard } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { StepDef, PipelineStepDef, PipelineStepKey, StepKey } from './types'

// ── Step definitions ─────────────────────────────────────────

export const STEPS: StepDef[] = [
  {
    key: 'raw',
    label: '剧本',
    icon: <FileText className="size-4" />,
    subSteps: [
      { key: 'raw', label: '原始内容' },
      { key: 'rewrite', label: 'AI改写' },
    ],
  },
  {
    key: 'extract',
    label: '提取',
    icon: <Users className="size-4" />,
  },
  {
    key: 'voice',
    label: '音色',
    icon: <Mic className="size-4" />,
  },
  {
    key: 'storyboard',
    label: '分镜',
    icon: <Film className="size-4" />,
  },
  {
    key: 'production',
    label: '制作',
    icon: <Clapperboard className="size-4" />,
  },
]

// ── 11-Step Production Pipeline ──────────────────────────────

export const PIPELINE_STEPS: PipelineStepDef[] = [
  { key: 'raw_content', stepNumber: 1, label: '原始内容', description: '输入原始故事或剧本内容', stepKey: 'raw' },
  { key: 'script_rewrite', stepNumber: 2, label: '剧本改写', description: 'AI将原始内容改写为标准剧本格式', stepKey: 'rewrite' },
  { key: 'character_extract', stepNumber: 3, label: '角色提取', description: '从剧本中提取角色信息和场景信息', stepKey: 'extract' },
  { key: 'voice_assign', stepNumber: 4, label: '配音分配', description: '为每个角色分配合适的TTS音色', stepKey: 'voice' },
  { key: 'storyboard', stepNumber: 5, label: '分镜生成', description: '将剧本拆解为分镜镜头序列', stepKey: 'storyboard' },
  { key: 'character_images', stepNumber: 6, label: '角色图片', description: '生成角色设定图和头像', stepKey: 'extract' },
  { key: 'scene_images', stepNumber: 7, label: '场景图片', description: '生成场景背景图', stepKey: 'extract' },
  { key: 'dubbing', stepNumber: 8, label: '配音生成', description: '生成角色对话的TTS语音', stepKey: 'production' },
  { key: 'shot_frames', stepNumber: 9, label: '镜头图片', description: '生成分镜首帧图片', stepKey: 'storyboard' },
  { key: 'video', stepNumber: 10, label: '视频生成', description: '生成每个镜头的视频', stepKey: 'production' },
  { key: 'compose_merge', stepNumber: 11, label: '合成合并', description: '合成音视频并合并为成片', stepKey: 'production' },
]

// ── Pipeline-to-Step mapping (pipeline key → legacy step key) ──

export const PIPELINE_TO_STEP_MAP: Record<PipelineStepKey, StepKey> = {
  raw_content: 'raw',
  script_rewrite: 'rewrite',
  character_extract: 'extract',
  voice_assign: 'voice',
  storyboard: 'storyboard',
  character_images: 'extract',
  scene_images: 'extract',
  dubbing: 'production',
  shot_frames: 'storyboard',
  video: 'production',
  compose_merge: 'production',
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
