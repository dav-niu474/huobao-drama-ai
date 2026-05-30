import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getActiveProviderForUser } from '@/lib/ai-config'
import { getTTSAdapter } from '@/lib/adapters/tts'
import { requireAuth } from '@/lib/auth-helpers'

// POST /api/ai/voice-sample - Generate a voice sample for a character
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (auth.error) return auth.error

    const body = await request.json()
    const { characterId, voiceId, text } = body as {
      characterId?: string
      voiceId?: string
      text?: string
    }

    if (!voiceId) {
      return NextResponse.json(
        { error: 'voiceId is required' },
        { status: 400 }
      )
    }

    // Get character info for a personalized greeting
    let characterName = ''
    let voiceStyle = ''
    if (characterId) {
      const character = await db.character.findUnique({
        where: { id: characterId },
      })
      if (character) {
        characterName = character.name
        voiceStyle = character.voiceStyle || character.personality || ''
      }
    }

    // Use provided text or generate a greeting
    const sampleText = text || (characterName
      ? `你好，我是${characterName}，很高兴认识你。`
      : '你好，这是一个语音样例，用于试听音色效果。')

    // Get active TTS provider (respect user-level keys)
    const provider = await getActiveProviderForUser('tts', auth.userId)
    if (!provider) {
      return NextResponse.json(
        { error: '未配置TTS供应商，请在设置中配置API Key' },
        { status: 400 }
      )
    }

    // Generate TTS sample using the adapter
    const adapter = getTTSAdapter(provider.provider)
    const config = {
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKey,
      model: provider.model,
    }

    const req = adapter.buildGenerateRequest(config, {
      text: sampleText,
      voiceId,
      speed: 1.0,
      voiceStyle: voiceStyle || undefined,
    })

    console.log(`[voice-sample] Generating sample: provider=${provider.provider}, model=${config.model}, voiceId=${voiceId}, text=${sampleText.slice(0, 30)}...`)

    const res = await fetch(req.url, {
      method: req.method,
      headers: req.headers,
      body: JSON.stringify(req.body),
      signal: AbortSignal.timeout(60_000), // 60s timeout for TTS
    })

    if (!res.ok) {
      const errText = await res.text().catch(() => 'Unknown error')
      return NextResponse.json(
        { error: `TTS API错误 (${res.status}): ${errText.slice(0, 200)}` },
        { status: 500 }
      )
    }

    // Parse response based on content type
    const contentType = res.headers.get('content-type') || ''
    let audioUrl = ''

    if (contentType.includes('application/json')) {
      const jsonResult = await res.json()
      const parsed = adapter.parseResponse(jsonResult)
      if (parsed.audioHex) {
        // Convert hex to base64 data URL
        const buffer = Buffer.from(parsed.audioHex, 'hex')
        const base64 = buffer.toString('base64')
        audioUrl = `data:audio/${parsed.format || 'mp3'};base64,${base64}`
      } else if (parsed.audioBase64) {
        audioUrl = `data:audio/${parsed.format || 'wav'};base64,${parsed.audioBase64}`
      }
    } else {
      // Binary audio response
      const buffer = Buffer.from(await res.arrayBuffer())
      const base64 = buffer.toString('base64')
      audioUrl = `data:audio/wav;base64,${base64}`
    }

    if (!audioUrl) {
      return NextResponse.json(
        { error: '语音生成返回数据为空' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      audioUrl,
      voiceId,
      text: sampleText,
      characterName: characterName || null,
    })
  } catch (error) {
    console.error('Failed to generate voice sample:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
