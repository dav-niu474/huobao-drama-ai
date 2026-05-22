// ============================================================
// Cost Tracker — Non-blocking generation cost recording
// Wraps all DB writes in try-catch so cost tracking NEVER
// blocks the main generation flow.
// ============================================================

import { db } from '@/lib/db'

// ── Types ──────────────────────────────────────────────────────

export type CostCategory = 'image' | 'video' | 'tts' | 'llm'

export interface RecordCostParams {
  dramaId: string
  episodeId?: string
  category: CostCategory
  provider: string
  model: string
  credits: number
  tokensUsed?: number
  generationMs?: number
}

// ── Credit Calculation Helpers ─────────────────────────────────

/**
 * Calculate image generation credits based on size.
 * 1 credit ≈ standard 1024x1024 image.
 */
export function calcImageCredits(size: string): number {
  const [wStr, hStr] = size.split('x')
  const w = parseInt(wStr || '1024', 10)
  const h = parseInt(hStr || '1024', 10)
  const pixels = w * h
  const standardPixels = 1024 * 1024
  // Normalize to standard image size
  const ratio = pixels / standardPixels
  if (ratio <= 0.5) return 0.5
  if (ratio <= 1.5) return 1.0
  return 2.0
}

/**
 * Calculate video generation credits based on duration.
 * ~5 credits per 5s video (more for longer/higher quality).
 */
export function calcVideoCredits(durationSeconds: number): number {
  return Math.max(1, Math.round((durationSeconds / 5) * 5))
}

/**
 * Calculate TTS credits.
 * ~0.5 credits per TTS generation.
 */
export function calcTtsCredits(): number {
  return 0.5
}

/**
 * Calculate LLM credits from token usage.
 * ~0.1 credits per 1K tokens.
 */
export function calcLlmCredits(tokensUsed: number): number {
  return Math.max(0.1, (tokensUsed / 1000) * 0.1)
}

// ── Main Recording Function ───────────────────────────────────

/**
 * Record a generation cost entry. Non-blocking — errors are logged
 * but never thrown. Returns void.
 */
export function recordGenerationCost(params: RecordCostParams): void {
  // Fire-and-forget: start the async operation but don't await it
  ;(async () => {
    try {
      await db.generationCost.create({
        data: {
          dramaId: params.dramaId,
          episodeId: params.episodeId || null,
          category: params.category,
          provider: params.provider,
          model: params.model,
          credits: params.credits,
          tokensUsed: params.tokensUsed || 0,
          count: 1,
        },
      })
    } catch (err) {
      console.warn('[cost-tracker] Failed to record generation cost:', err instanceof Error ? err.message : String(err))
    }
  })()
}
