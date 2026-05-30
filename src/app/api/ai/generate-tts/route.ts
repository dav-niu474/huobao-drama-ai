import { NextRequest, NextResponse } from 'next/server'
import { aiClient } from '@/lib/ai-config'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-helpers'
import { getActiveProviderForUser } from '@/lib/ai-config'
import { recordGenerationCost, calcTtsCredits } from '@/lib/cost-tracker'
import { saveDataUrl, isDataUrl } from '@/lib/file-storage'

// POST /api/ai/generate-tts - Generate TTS audio for a storyboard shot (multi-provider)
// Now looks up the character's voiceId and voiceStyle from the database
// v0.7: Saves audio to file storage instead of base64 data URLs in DB
export async function POST(request: NextRequest) {
  const startTime = Date.now()
  let providerName = ''
  let modelName = ''

  try {
    const auth = await requireAuth()
    if (auth.error) return auth.error
    aiClient._userId = auth.userId
    const { storyboardId, text, voiceId, voiceStyle } = await request.json()

    if (!storyboardId) {
      return NextResponse.json(
        { error: 'storyboardId is required' },
        { status: 400 }
      )
    }

    // Get storyboard from DB
    const storyboard = await db.storyboard.findUnique({
      where: { id: storyboardId },
    })

    if (!storyboard) {
      return NextResponse.json(
        { error: 'Storyboard not found' },
        { status: 404 }
      )
    }

    // Use provided text, or fall back to storyboard dialogue
    const ttsText = text || storyboard.dialogue || ''

    if (!ttsText) {
      return NextResponse.json(
        { error: 'No text provided and storyboard has no dialogue' },
        { status: 400 }
      )
    }

    // Resolve provider/model info for cost tracking
    try {
      const provider = await getActiveProviderForUser('tts', auth.userId)
      if (provider) {
        providerName = provider.provider
        modelName = provider.model
      }
    } catch {
      // non-critical
    }

    // Resolve voiceId and voiceStyle from the character if not explicitly provided
    let resolvedVoiceId = voiceId
    let resolvedVoiceStyle = voiceStyle

    // Resolve dramaId and episodeId for cost tracking
    let dramaId: string | undefined
    let episodeId: string | undefined
    try {
      const episode = await db.episode.findUnique({
        where: { id: storyboard.episodeId },
        select: { dramaId: true, id: true },
      })
      if (episode) {
        dramaId = episode.dramaId
        episodeId = episode.id
      }
    } catch {
      // non-critical
    }

    if (!resolvedVoiceId && storyboard.dialogueChar) {
      // Look up the episode to get dramaId, then find the character
      const episode = await db.episode.findUnique({
        where: { id: storyboard.episodeId },
        select: { dramaId: true },
      })

      if (episode) {
        const character = await db.character.findFirst({
          where: {
            dramaId: episode.dramaId,
            name: { equals: storyboard.dialogueChar },
          },
        })

        if (character) {
          if (character.voiceId) {
            resolvedVoiceId = character.voiceId
          }
          if (character.voiceStyle) {
            resolvedVoiceStyle = character.voiceStyle
          }
          // Build voice instructions from character personality + voiceStyle
          if (!resolvedVoiceStyle && character.personality) {
            resolvedVoiceStyle = character.personality
          }
        }
      }
    }

    // Mark storyboard as processing
    await db.storyboard.update({
      where: { id: storyboardId },
      data: { status: 'processing' },
    })

    // Generate TTS — aiClient now returns the audio data URL
    const audioDataUrl = await aiClient.generateTts(storyboardId, ttsText, resolvedVoiceId, resolvedVoiceStyle || undefined)

    // Save audio to file storage instead of storing base64 in DB
    let audioUrl = audioDataUrl
    if (isDataUrl(audioDataUrl)) {
      const saveResult = await saveDataUrl(audioDataUrl, {
        category: 'audio',
        dramaId,
        filename: `tts_${storyboardId}_${Date.now()}`,
      })
      audioUrl = saveResult.url
    }

    // Update storyboard with file URL
    const updatedStoryboard = await db.storyboard.update({
      where: { id: storyboardId },
      data: { ttsAudioUrl: audioUrl, status: 'completed' },
    })

    // Record cost for TTS generation
    if (dramaId) {
      try {
        recordGenerationCost({
          dramaId,
          episodeId,
          category: 'tts',
          provider: providerName,
          model: modelName,
          credits: calcTtsCredits(),
          generationMs: Date.now() - startTime,
        })
      } catch { /* non-blocking */ }
    }

    return NextResponse.json({ storyboard: updatedStoryboard })
  } catch (error) {
    console.error('Failed to generate TTS:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
