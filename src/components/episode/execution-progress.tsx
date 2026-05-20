'use client'

import { type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, Loader2 } from 'lucide-react'

// ── Types ──────────────────────────────────────────────────

export interface ExecutionStep {
  label: string
  icon?: ReactNode
}

export interface ExecutionProgressProps {
  /** List of sequential execution steps */
  steps: ExecutionStep[]
  /** Index of the currently active step (0-based) */
  currentStep: number
  /** Optional override message to show instead of step label */
  message?: string
}

// ── Typing Indicator (three animated dots) ────────────────

function TypingIndicator() {
  return (
    <span className="inline-flex items-center gap-0.5 ml-1 text-primary">
      <span className="typing-dot" />
      <span className="typing-dot" />
      <span className="typing-dot" />
    </span>
  )
}

// ── Main Component ────────────────────────────────────────

export function ExecutionProgress({
  steps,
  currentStep,
  message,
}: ExecutionProgressProps) {
  return (
    <div className="space-y-2">
      {steps.map((step, index) => {
        const isCompleted = index < currentStep
        const isActive = index === currentStep
        const isPending = index > currentStep

        return (
          <motion.div
            key={index}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2, delay: index * 0.05 }}
            className={`flex items-center gap-2.5 py-1.5 px-3 rounded-lg transition-colors duration-200 ${
              isActive
                ? 'bg-primary/8'
                : isCompleted
                  ? 'bg-emerald-500/5'
                  : ''
            }`}
          >
            {/* Status icon */}
            <div className="flex-shrink-0 size-5 rounded-full flex items-center justify-center">
              {isCompleted ? (
                <div className="size-5 rounded-full bg-emerald-500/20 flex items-center justify-center">
                  <Check className="size-3 text-emerald-500" />
                </div>
              ) : isActive ? (
                <div className="size-5 rounded-full bg-primary/20 flex items-center justify-center">
                  <div className="size-2 rounded-full bg-primary exec-pulse-dot" />
                </div>
              ) : (
                <div className="size-5 rounded-full bg-muted/50 flex items-center justify-center">
                  <span className="text-[9px] font-bold text-muted-foreground/60">
                    {index + 1}
                  </span>
                </div>
              )}
            </div>

            {/* Step label */}
            <div className="flex-1 min-w-0">
              <span
                className={`text-xs transition-colors duration-200 ${
                  isActive
                    ? 'text-primary font-medium'
                    : isCompleted
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-muted-foreground/60'
                }`}
              >
                {isActive && message ? message : step.label}
              </span>
              {isActive && (
                <TypingIndicator />
              )}
            </div>

            {/* Step icon (optional) */}
            {step.icon && (
              <span
                className={`flex-shrink-0 ${
                  isActive
                    ? 'text-primary'
                    : isCompleted
                      ? 'text-emerald-500'
                      : 'text-muted-foreground/40'
                }`}
              >
                {step.icon}
              </span>
            )}
          </motion.div>
        )
      })}
    </div>
  )
}

// ── Convenience: Script Rewrite Steps ─────────────────────

export const SCRIPT_REWRITE_STEPS: ExecutionStep[] = [
  { label: '正在读取原始内容...' },
  { label: '正在改写剧本...' },
  { label: '正在保存结果...' },
]

// ── Convenience: Extract Steps ─────────────────────────────

export const EXTRACT_STEPS: ExecutionStep[] = [
  { label: '正在读取剧本内容...' },
  { label: '正在提取角色信息...' },
  { label: '正在提取场景信息...' },
  { label: '正在保存提取结果...' },
]

// ── Convenience: Storyboard Steps ──────────────────────────

export const STORYBOARD_STEPS: ExecutionStep[] = [
  { label: '正在读取分镜上下文...' },
  { label: '正在拆解镜头序列...' },
  { label: '正在生成提示词...' },
  { label: '正在保存分镜数据...' },
]

// ── Helper: Derive execution step from agent logs ──────────
// Parses agent log entries to determine which logical step the agent is on

interface AgentLogLike {
  type: string
  message?: string
  toolCall?: { name: string }
}

export function deriveScriptStep(logs: AgentLogLike[]): number {
  let step = 0
  for (const log of logs) {
    if (log.type === 'tool_call' && log.toolCall?.name) {
      const name = log.toolCall.name
      if (name === 'read_episode_script' && step < 1) step = 1
      if ((name === 'save_script') && step < 2) step = 2
    }
    if (log.type === 'completed') step = 3
  }
  return Math.min(step, SCRIPT_REWRITE_STEPS.length - 1)
}

export function deriveExtractStep(logs: AgentLogLike[]): number {
  let step = 0
  for (const log of logs) {
    if (log.type === 'tool_call' && log.toolCall?.name) {
      const name = log.toolCall.name
      if (name === 'read_script_for_extraction' && step < 1) step = 1
      if ((name === 'save_characters' || name === 'read_existing_characters') && step < 2) step = 2
      if ((name === 'save_scenes' || name === 'read_existing_scenes') && step < 3) step = 3
    }
    if (log.type === 'completed') step = 4
  }
  return Math.min(step, EXTRACT_STEPS.length - 1)
}

export function deriveStoryboardStep(logs: AgentLogLike[]): number {
  let step = 0
  for (const log of logs) {
    if (log.type === 'tool_call' && log.toolCall?.name) {
      const name = log.toolCall.name
      if (name === 'read_storyboard_context' && step < 1) step = 1
      if (name === 'save_storyboards' && step < 2) step = 2
      if (name === 'update_storyboard' && step < 3) step = 3
    }
    if (log.type === 'completed') step = 4
  }
  return Math.min(step, STORYBOARD_STEPS.length - 1)
}
