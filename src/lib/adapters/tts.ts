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
    params: { text: string; voiceId?: string; speed?: number; voiceStyle?: string }
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
    params: { text: string; voiceId?: string; speed?: number; voiceStyle?: string }
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
    params: { text: string; voiceId?: string; speed?: number; voiceStyle?: string }
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
    params: { text: string; voiceId?: string; speed?: number; voiceStyle?: string }
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
// MiMo TTS Adapter (Xiaomi MiMo — Chat Completions-based TTS API)
//
// MiMo TTS uses the same /chat/completions endpoint as LLM,
// with an `audio` parameter for voice configuration.
// The text to synthesize goes in the `assistant` message,
// and style/emotion instructions go in the `user` message.
// Audio is returned as base64 in choices[0].message.audio.data.
// ============================================================================

export class MiMoTTSAdapter implements TTSProviderAdapter {
  buildGenerateRequest(
    config: { baseUrl: string; apiKey: string; model: string },
    params: { text: string; voiceId?: string; speed?: number; voiceStyle?: string }
  ): ProviderRequest {
    const model = config.model || 'mimo-v2.5-tts'
    // MiMo preset voices: Chloe, Mia (English female); Milo, Dean (English male)
    // 冰糖, 茉莉 (Chinese female); 苏打, 白桦 (Chinese male)
    const voice = params.voiceId || 'Chloe'
    // Use voiceStyle if provided, otherwise use natural reading style
    const styleInstruction = params.voiceStyle || '用自然流畅的语调朗读'

    return {
      url: joinProviderUrl(config.baseUrl, '/v1', '/chat/completions'),
      method: 'POST',
      headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
      body: {
        model,
        messages: [
          // user message: style/emotion instruction (not spoken)
          { role: 'user', content: styleInstruction },
          // assistant message: the actual text to synthesize
          { role: 'assistant', content: params.text },
        ],
        audio: {
          format: 'mp3',
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
    // MiMo TTS returns a Chat Completions response with audio in:
    // choices[0].message.audio.data (base64-encoded WAV)
    if (typeof result === 'object' && result !== null) {
      const resp = result as Record<string, unknown>
      const choices = resp.choices as Array<Record<string, unknown>> | undefined
      if (choices && choices.length > 0) {
        const message = choices[0].message as Record<string, unknown> | undefined
        if (message) {
          const audio = message.audio as Record<string, unknown> | undefined
          if (audio && typeof audio.data === 'string') {
            return {
              audioBase64: audio.data as string,
              format: 'mp3',
              sampleRate: 24000,
            }
          }
        }
      }
    }

    // Fallback: raw binary response (shouldn't happen with MiMo Chat Completions)
    if (typeof result === 'string') {
      return {
        audioBase64: result,
        format: 'mp3',
      }
    }

    if (result instanceof ArrayBuffer || result instanceof Uint8Array) {
      const bytes = result instanceof Uint8Array ? result : new Uint8Array(result)
      const base64 = uint8ArrayToBase64(bytes)
      return {
        audioBase64: base64,
        format: 'mp3',
      }
    }

    return { format: 'mp3' }
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
  mimo: new MiMoTTSAdapter(), // Xiaomi MiMo — OpenAI-compatible TTS
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
