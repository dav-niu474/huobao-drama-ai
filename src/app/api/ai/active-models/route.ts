import { NextResponse } from 'next/server'
import { getActiveProviderForUser, type AiCategory } from '@/lib/ai-config'
import { requireAuth } from '@/lib/auth-helpers'

// GET /api/ai/active-models - Get currently active models for each category
// Respects user-level provider overrides when authenticated
export async function GET() {
  try {
    // Try to get userId for user-level provider resolution
    let userId: string | undefined
    try {
      const auth = await requireAuth()
      if (!auth.error) userId = auth.userId
    } catch {
      // Not authenticated — use platform defaults
    }

    const categories: AiCategory[] = ['llm', 'image', 'video', 'tts']
    const result: Record<string, { provider: string; model: string; name: string } | null> = {}

    for (const cat of categories) {
      const provider = await getActiveProviderForUser(cat, userId)
      result[cat] = provider
        ? { provider: provider.provider, model: provider.model, name: provider.name }
        : null
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('Failed to get active models:', error)
    return NextResponse.json({ error: 'Failed to get active models' }, { status: 500 })
  }
}
