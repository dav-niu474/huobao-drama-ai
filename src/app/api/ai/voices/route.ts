import { NextRequest, NextResponse } from 'next/server'
import { getActiveProviderForUser } from '@/lib/ai-config'
import { VOICE_CATALOG, type VoiceEntry } from '@/lib/voice-catalog'
import { requireAuth } from '@/lib/auth-helpers'

// GET /api/ai/voices - List available voices from TTS providers
// Uses the shared voice catalog from @/lib/voice-catalog
export async function GET(request: NextRequest) {
  try {
    // Try to get userId for user-level provider resolution
    let userId: string | undefined
    try {
      const auth = await requireAuth()
      if (!auth.error) userId = auth.userId
    } catch {
      // Not authenticated — use platform defaults
    }

    const { searchParams } = new URL(request.url)
    const providerFilter = searchParams.get('provider')
    const languageFilter = searchParams.get('language')

    // Get active TTS provider (respect user-level keys)
    const activeProvider = await getActiveProviderForUser('tts', userId)

    // Collect voices from all providers or the specified one
    const allVoices: VoiceEntry[] = []

    const providers = providerFilter
      ? [providerFilter]
      : Object.keys(VOICE_CATALOG)

    for (const provider of providers) {
      const voices = VOICE_CATALOG[provider] || []
      const filtered = voices.filter((v) => {
        if (languageFilter && v.language !== languageFilter) return false
        return true
      })
      allVoices.push(...filtered)
    }

    return NextResponse.json({
      voices: allVoices,
      activeProvider: activeProvider?.provider || null,
      activeModel: activeProvider?.model || null,
    })
  } catch (error) {
    console.error('Failed to list voices:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
