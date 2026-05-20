import { NextResponse } from 'next/server'
import { getActiveProviderForUser, type AiCategory } from '@/lib/ai-config'
import { requireAuth } from '@/lib/auth-helpers'

// GET /api/ai/active-models - Get currently active models for each category
export async function GET() {
  try {
    const auth = await requireAuth()
    if (auth.error) return auth.error

    const categories: AiCategory[] = ['llm', 'image', 'video', 'tts']
    const result: Record<string, { provider: string; model: string; name: string } | null> = {}

    for (const cat of categories) {
      const provider = await getActiveProviderForUser(cat, auth.userId)
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
