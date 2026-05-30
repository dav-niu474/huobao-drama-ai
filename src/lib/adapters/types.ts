// ============================================================
// Adapter Type Definitions — Multi-Provider Architecture
// Standardized interfaces for image, video, and TTS generation
// across different AI providers (OpenAI, Gemini, MiniMax, etc.)
// ============================================================

/** Standardized provider request structure */
export interface ProviderRequest {
  url: string
  method: string
  headers: Record<string, string>
  body: unknown
}

/** Pre-fetched reference image data for providers that need base64 inline data */
export interface ReferenceImageData {
  base64: string
  mimeType: string
}

/** Image generation adapter interface */
export interface ImageProviderAdapter {
  buildGenerateRequest(
    config: { baseUrl: string; apiKey: string; model: string },
    params: {
      prompt: string
      size?: string
      negativePrompt?: string
      referenceImages?: string[]
      referenceImagesData?: ReferenceImageData[]
    }
  ): ProviderRequest

  parseGenerateResponse(result: unknown): {
    isAsync: boolean
    taskId?: string
    imageUrl?: string
    imageBase64?: string
  }

  buildPollRequest(
    config: { baseUrl: string; apiKey: string; model: string },
    taskId: string
  ): ProviderRequest | null

  parsePollResponse(result: unknown): {
    status: 'pending' | 'processing' | 'completed' | 'failed'
    imageUrl?: string
    imageBase64?: string
    error?: string
  }
}

/** Video generation adapter interface */
export interface VideoProviderAdapter {
  buildGenerateRequest(
    config: { baseUrl: string; apiKey: string; model: string },
    params: { prompt: string; firstFrameUrl?: string; lastFrameUrl?: string; duration?: number }
  ): ProviderRequest

  parseGenerateResponse(result: unknown): {
    isAsync: boolean
    taskId?: string
    videoUrl?: string
  }

  buildPollRequest(
    config: { baseUrl: string; apiKey: string; model: string },
    taskId: string
  ): ProviderRequest | null

  parsePollResponse(result: unknown): {
    status: 'pending' | 'processing' | 'completed' | 'failed'
    videoUrl?: string
    error?: string
  }
}

/** TTS generation adapter interface */
export interface TTSProviderAdapter {
  buildGenerateRequest(
    config: { baseUrl: string; apiKey: string; model: string },
    params: { text: string; voiceId?: string; speed?: number; voiceStyle?: string }
  ): ProviderRequest

  parseResponse(result: unknown): {
    audioBase64?: string
    audioHex?: string
    format: string
    sampleRate?: number
  }
}
