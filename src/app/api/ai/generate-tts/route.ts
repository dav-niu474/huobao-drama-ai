import { NextRequest, NextResponse } from 'next/server'
import { aiClient } from '@/lib/ai-config'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-helpers'

// POST /api/ai/generate-tts - Generate TTS audio for a storyboard shot (multi-provider)
// Now looks up the character's voiceId and voiceStyle from the database
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (auth.error) return auth.error
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

    // Resolve voiceId and voiceStyle from the character if not explicitly provided
    let resolvedVoiceId = voiceId
    let resolvedVoiceStyle = voiceStyle

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
            name: { equals: storyboard.dialogueChar, mode: 'insensitive' },
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

    // Use multi-provider aiClient with voice instructions
    await aiClient.generateTts(storyboardId, ttsText, resolvedVoiceId, resolvedVoiceStyle, auth.userId)

    // Fetch updated storyboard
    const updatedStoryboard = await db.storyboard.findUnique({
      where: { id: storyboardId },
    })

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
