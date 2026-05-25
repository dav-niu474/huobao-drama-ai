import type {
  ProviderRequest,
  TTSProviderAdapter,
} from './types'

import { joinProviderUrl } from './url'

// ============================================================================
// MiniMax TTS Adapter
// ============================================================================

export class MiniMaxTTSAdapter implements TTSProviderAdapter {
  buildGenerateRequest(
    config: { baseUrl: string; apiKey: string; model: string },
    params: { text: string; voiceId?: string; speed?: number }
  ): ProviderRequest {
    const model = config.model || 'speech-2.8-hd'
    const voiceId = params.voiceId || 'male-qn-qingse'
    const speed = params.speed ?? 1

    return {
      url: joinProviderUrl(config.baseUrl, '/v1', '/t2a_v2'),
      method: 'POST',
      headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
      body: {
        model,
        text: params.text,
        stream: false,
        voice_setting: {
          voice_id: voiceId,
          speed,
          vol: 1,
          pitch: 0,
        },
        audio_setting: {
          sample_rate: 32000,
          bitrate: 128000,
          format: 'mp3',
          channel: 1,
        },
        subtitle_enable: false,
      },
    }
  }

  parseResponse(result: unknown): {
    audioBase64?: string
    audioHex?: string
    format: string
    sampleRate?: number
  } {
    const resp = result as Record<string, unknown>

    // Check for error in base_resp
    const baseResp = resp.base_resp as Record<string, unknown> | undefined
    if (baseResp && (baseResp.status_code as number) !== 0) {
      return {
        format: 'mp3',
        // Return empty audio on error — caller should check base_resp separately
        // or we could throw; but the interface doesn't have an error field
        // so we return minimal info
      }
    }

    const data = resp.data as Record<string, unknown> | undefined
    if (!data) {
      return { format: 'mp3' }
    }

    const audioHex = data.audio as string | undefined
    const extraInfo = data.extra_info as Record<string, unknown> | undefined

    // Convert hex to base64 for consistency
    const audioBase64 = audioHex ? hexToBase64(audioHex) : undefined

    return {
      audioBase64,
      audioHex,
      format: (extraInfo?.audio_format as string) || 'mp3',
      sampleRate: extraInfo?.audio_sample_rate as number | undefined,
    }
  }
}

// ============================================================================
// Chatfire TTS Adapter (MiniMax-compatible gateway)
// ============================================================================

export class ChatfireTTSAdapter implements TTSProviderAdapter {
  buildGenerateRequest(
    config: { baseUrl: string; apiKey: string; model: string },
    params: { text: string; voiceId?: string; speed?: number }
  ): ProviderRequest {
    const model = config.model || 'speech-2.8-hd'
    const voiceId = params.voiceId || 'male-qn-qingse'
    const speed = params.speed ?? 1

    return {
      url: joinProviderUrl(config.baseUrl, '/v1', '/t2a_v2'),
      method: 'POST',
      headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
      body: {
        model,
        text: params.text,
        stream: false,
        voice_setting: {
          voice_id: voiceId,
          speed,
          vol: 1,
          pitch: 0,
        },
        audio_setting: {
          sample_rate: 32000,
          bitrate: 128000,
          format: 'mp3',
          channel: 1,
        },
        subtitle_enable: false,
      },
    }
  }

  parseResponse(result: unknown): {
    audioBase64?: string
    audioHex?: string
    format: string
    sampleRate?: number
  } {
    // Same parsing logic as MiniMax — Chatfire wraps MiniMax's TTS API
    const resp = result as Record<string, unknown>

    const baseResp = resp.base_resp as Record<string, unknown> | undefined
    if (baseResp && (baseResp.status_code as number) !== 0) {
      return { format: 'mp3' }
    }

    const data = resp.data as Record<string, unknown> | undefined
    if (!data) {
      return { format: 'mp3' }
    }

    const audioHex = data.audio as string | undefined
    const extraInfo = data.extra_info as Record<string, unknown> | undefined

    const audioBase64 = audioHex ? hexToBase64(audioHex) : undefined

    return {
      audioBase64,
      audioHex,
      format: (extraInfo?.audio_format as string) || 'mp3',
      sampleRate: extraInfo?.audio_sample_rate as number | undefined,
    }
  }
}

// ============================================================================
// OpenAI TTS Adapter (compatible with OpenAI, Fish Audio)
// ============================================================================

export class OpenAITTSAdapter implements TTSProviderAdapter {
  buildGenerateRequest(
    config: { baseUrl: string; apiKey: string; model: string },
    params: { text: string; voiceId?: string; speed?: number }
  ): ProviderRequest {
    const model = config.model || 'tts-1'
    const voice = params.voiceId || 'alloy'

    return {
      url: joinProviderUrl(config.baseUrl, '/v1', '/audio/speech'),
      method: 'POST',
      headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
      body: {
        model,
        input: params.text,
        voice,
        response_format: 'wav',
      },
    }
  }

  parseResponse(result: unknown): {
    audioBase64?: string
    audioHex?: string
    format: string
    sampleRate?: number
  } {
    // OpenAI TTS returns raw audio binary
    // When received as ArrayBuffer or already base64 string
    if (typeof result === 'string') {
      // Already base64 encoded
      return {
        audioBase64: result,
        format: 'wav',
      }
    }

    if (result instanceof ArrayBuffer || result instanceof Uint8Array) {
      // Convert binary to base64
      const bytes = result instanceof Uint8Array ? result : new Uint8Array(result)
      const base64 = uint8ArrayToBase64(bytes)
      return {
        audioBase64: base64,
        format: 'wav',
      }
    }

    // If it's a JSON response (some compatible APIs return JSON)
    if (typeof result === 'object' && result !== null) {
      const resp = result as Record<string, unknown>

      // Check if there's an audio field (some compatible APIs return JSON with audio)
      if (resp.audio && typeof resp.audio === 'string') {
        return {
          audioBase64: resp.audio as string,
          format: (resp.format as string) || 'wav',
        }
      }
    }

    return { format: 'wav' }
  }
}

// ============================================================================
// Ali TTS Adapter (DashScope / Qwen TTS)
// ============================================================================

export class AliTTSAdapter implements TTSProviderAdapter {
  buildGenerateRequest(
    config: { baseUrl: string; apiKey: string; model: string },
    params: { text: string; voiceId?: string; speed?: number }
  ): ProviderRequest {
    const model = config.model || 'qwen3-tts-vd-2026-01-26'
    const voice = params.voiceId || 'zhitian_emo'

    return {
      url: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text2audio/generation',
      method: 'POST',
      headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
      body: {
        model,
        input: {
          text: params.text,
          voice,
        },
      },
    }
  }

  parseResponse(result: unknown): {
    audioBase64?: string
    audioHex?: string
    format: string
    sampleRate?: number
  } {
    const resp = result as Record<string, unknown>
    const output = resp.output as Record<string, unknown> | undefined

    if (!output) {
      return { format: 'wav' }
    }

    const audioBase64 = output.audio as string | undefined
    const audioFormat = (output.audio_format as string) || 'wav'

    return {
      audioBase64,
      format: audioFormat,
    }
  }
}

// ============================================================================
// MiMo TTS Adapter (chat/completions-based TTS)
// MiMo TTS models use the chat completions interface, NOT /audio/speech.
// They require an assistant role message in the conversation.
// ============================================================================

export class MiMoTTSAdapter implements TTSProviderAdapter {
  buildGenerateRequest(
    config: { baseUrl: string; apiKey: string; model: string },
    params: { text: string; voiceId?: string; speed?: number }
  ): ProviderRequest {
    const model = config.model || 'mimo-v2.5-tts'

    // ── Voice ID resolution ──
    // V2.5 preset voices: 茉莉, 冰糖, 苏打, 白桦, Mia, Chloe, Milo, Dean
    // V2 legacy voices: mimo_default, default_zh, default_en
    // V2.5-voiceclone: "data:audio/mpeg;base64,..." (Data URL with audio sample)
    // V2.5-voicedesign: no voice field needed
    const isV2Model = model.startsWith('mimo-v2-') && !model.startsWith('mimo-v2.5')
    const isVoiceDesign = model.includes('voicedesign')
    const isVoiceClone = model.includes('voiceclone')

    // Default voice: V2.5 uses 茉莉, V2 uses mimo_default
    let voiceId = params.voiceId || (isV2Model ? 'mimo_default' : '茉莉')

    // MiMo TTS uses chat/completions interface with a special convention:
    // - assistant message content = the text to be synthesized (REQUIRED)
    // - user message content = style/direction instructions (optional for preset, required for voicedesign)
    // - audio object with format is REQUIRED; voice field depends on model type
    // - Authentication: `api-key` header (preferred) or `Authorization: Bearer`
    //
    // Reference: https://platform.xiaomimimo.com/docs/usage-guide/speech-synthesis-v2.5

    const messages: Array<{ role: string; content: string }> = []

    if (isVoiceDesign) {
      // Voice Design: user message = voice description (REQUIRED)
      // voiceId is treated as the voice description text
      messages.push({ role: 'user', content: voiceId || '温柔的女声，语速适中' })
      messages.push({ role: 'assistant', content: params.text })
    } else {
      // Preset voice / Voice clone: user message = style instructions (optional)
      messages.push({ role: 'user', content: '请用自然、清晰的语速朗读。' })
      messages.push({ role: 'assistant', content: params.text })
    }

    // Build audio object based on model type
    const audioObj: Record<string, string> = { format: 'wav' }
    if (isVoiceDesign) {
      // Voice design: no voice field needed
    } else if (isVoiceClone && voiceId) {
      // Voice clone: voice = data URL with base64 audio sample
      audioObj.voice = voiceId
    } else {
      // Preset voice: voice = voice name (e.g. 茉莉, 冰糖)
      audioObj.voice = voiceId
    }

    return {
      url: joinProviderUrl(config.baseUrl, '/v1', '/chat/completions'),
      method: 'POST',
      headers: {
        'api-key': config.apiKey,
        'Content-Type': 'application/json',
      },
      body: {
        model,
        messages,
        audio: audioObj,
        stream: false,
      },
    }
  }

  parseResponse(result: unknown): {
    audioBase64?: string
    audioHex?: string
    format: string
    sampleRate?: number
  } {
    const resp = result as Record<string, unknown>

    // MiMo TTS response format (chat completions style):
    // { choices: [{ message: { role: "assistant", audio: { data: "<base64>" } } }] }
    const choices = resp.choices as Array<Record<string, unknown>> | undefined
    if (choices && choices.length > 0) {
      const message = choices[0].message as Record<string, unknown> | undefined
      if (message) {
        // Primary path: audio.data field (MiMo official format)
        const audio = message.audio as Record<string, unknown> | string | undefined
        if (audio && typeof audio === 'object') {
          const audioData = audio.data as string | undefined
          if (audioData) {
            return { audioBase64: audioData, format: 'wav', sampleRate: 24000 }
          }
        }
        if (audio && typeof audio === 'string') {
          return { audioBase64: audio, format: 'wav', sampleRate: 24000 }
        }

        // Fallback: check content field (some compatible APIs might return base64 in content)
        const content = message.content as string | undefined
        if (content && /^[A-Za-z0-9+/=]+$/.test(content) && content.length > 100) {
          return { audioBase64: content, format: 'wav', sampleRate: 24000 }
        }
      }
    }

    // Fallback: check for direct audio data fields
    const audioField = resp.audio as Record<string, unknown> | string | undefined
    if (audioField && typeof audioField === 'object') {
      const audioData = (audioField as Record<string, unknown>).data as string | undefined
      if (audioData) {
        return { audioBase64: audioData, format: 'wav', sampleRate: 24000 }
      }
    }
    if (typeof audioField === 'string') {
      return { audioBase64: audioField, format: 'wav', sampleRate: 24000 }
    }

    return { format: 'wav' }
  }
}

// ============================================================================
// Adapter Registry
// ============================================================================

export const ttsAdapters: Record<string, TTSProviderAdapter> = {
  minimax: new MiniMaxTTSAdapter(),
  chatfire: new ChatfireTTSAdapter(), // MiniMax-compatible gateway
  openai: new OpenAITTSAdapter(),
  fish_audio: new OpenAITTSAdapter(), // OpenAI-compatible
  ali: new AliTTSAdapter(),
  mimo: new MiMoTTSAdapter(),         // chat/completions-based TTS
}

export function getTTSAdapter(provider: string): TTSProviderAdapter {
  return ttsAdapters[provider] || ttsAdapters['minimax']
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Convert a hex-encoded string to base64
 */
function hexToBase64(hexString: string): string {
  const bytes = new Uint8Array(hexString.length / 2)
  for (let i = 0; i < hexString.length; i += 2) {
    const byte = parseInt(hexString.substring(i, i + 2), 16)
    bytes[i / 2] = byte
  }
  return uint8ArrayToBase64(bytes)
}

/**
 * Convert a Uint8Array to a base64-encoded string
 */
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return typeof btoa !== 'undefined'
    ? btoa(binary)
    : Buffer.from(binary, 'binary').toString('base64')
}
