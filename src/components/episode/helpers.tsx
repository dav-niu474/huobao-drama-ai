import { FileText, Users, Mic, Film, Clapperboard } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { StepDef } from './types'

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
