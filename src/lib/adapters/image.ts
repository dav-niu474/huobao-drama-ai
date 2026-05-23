// ============================================================
// Image Provider Adapters
// Implements ImageProviderAdapter for each supported provider:
// OpenAI/Chatfire, Gemini, MiniMax, VolcEngine, Ali
// ============================================================

import type { ImageProviderAdapter, ProviderRequest, ReferenceImageData } from './types'

import { joinProviderUrl } from './url'

// ============================================================
// Helper: GCD for aspect ratio calculation (Gemini)
// ============================================================

function gcd(a: number, b: number): number {
  a = Math.abs(a)
  b = Math.abs(b)
  while (b) {
    const t = b
    b = a % b
    a = t
  }
  return a
}

/**
 * Parse a size string like "1920x1080" and compute a simplified
 * aspect ratio string like "16:9".
 * Falls back to "1:1" if parsing fails.
 */
function sizeToAspectRatio(size?: string): string {
  if (!size) return '1:1'
  const parts = size.toLowerCase().split('x')
  if (parts.length !== 2) return '1:1'
  const w = parseInt(parts[0], 10)
  const h = parseInt(parts[1], 10)
  if (isNaN(w) || isNaN(h) || w === 0 || h === 0) return '1:1'
  const d = gcd(w, h)
  return `${w / d}:${h / d}`
}

/**
 * Parse a size string like "1920x1080" into width/height numbers.
 */
function parseSize(size?: string): { width: number; height: number } {
  if (!size) return { width: 1024, height: 1024 }
  const parts = size.toLowerCase().split('x')
  if (parts.length !== 2) return { width: 1024, height: 1024 }
  const w = parseInt(parts[0], 10)
  const h = parseInt(parts[1], 10)
  if (isNaN(w) || isNaN(h)) return { width: 1024, height: 1024 }
  return { width: w, height: h }
}

// ============================================================
// OpenAI Image Adapter (also used by Chatfire)
// ============================================================

export class OpenAIImageAdapter implements ImageProviderAdapter {
  buildGenerateRequest(
    config: { baseUrl: string; apiKey: string; model: string },
    params: { prompt: string; size?: string; negativePrompt?: string; referenceImages?: string[]; referenceImagesData?: ReferenceImageData[] }
  ): ProviderRequest {
    const url = joinProviderUrl(config.baseUrl, '/v1', '/images/generations')

    const body: Record<string, unknown> = {
      model: config.model,
      prompt: params.prompt,
      size: params.size || '1024x1024',
      n: 1,
      response_format: 'url',
    }

    // OpenAI GPT-Image-1 supports reference images via the image field
    // Also works with Chatfire and other OpenAI-compatible providers
    if (params.referenceImages?.length) {
      body.image = params.referenceImages[0]
    }

    return {
      url,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body,
    }
  }

  parseGenerateResponse(result: any): {
    isAsync: boolean
    taskId?: string
    imageUrl?: string
    imageBase64?: string
  } {
    // Async response — provider returns a task_id
    if (result?.task_id) {
      return { isAsync: true, taskId: result.task_id }
    }

    // Sync response — provider returns data array with image URLs
    if (result?.data?.length) {
      const url = result.data[0]?.url
      const b64 = result.data[0]?.b64_json
      if (b64) {
        return { isAsync: false, imageBase64: b64 }
      }
      return { isAsync: false, imageUrl: url }
    }

    return { isAsync: false }
  }

  buildPollRequest(
    config: { baseUrl: string; apiKey: string; model: string },
    taskId: string
  ): ProviderRequest | null {
    return {
      url: joinProviderUrl(config.baseUrl, '/v1', `/images/task/${taskId}`),
      method: 'GET',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: null,
    }
  }

  parsePollResponse(result: any): {
    status: 'pending' | 'processing' | 'completed' | 'failed'
    imageUrl?: string
    imageBase64?: string
    error?: string
  } {
    const status = result?.status?.toLowerCase()
    if (status === 'completed' || status === 'succeeded') {
      const url = result?.data?.[0]?.url
      const b64 = result?.data?.[0]?.b64_json
      if (b64) {
        return { status: 'completed', imageBase64: b64 }
      }
      return { status: 'completed', imageUrl: url }
    }
    if (status === 'failed') {
      return { status: 'failed', error: result?.error?.message || result?.message || 'Image generation failed' }
    }
    // Still in progress
    if (status === 'processing') {
      return { status: 'processing' }
    }
    return { status: 'pending' }
  }
}

// ============================================================
// Gemini Image Adapter
// ============================================================

export class GeminiImageAdapter implements ImageProviderAdapter {
  buildGenerateRequest(
    config: { baseUrl: string; apiKey: string; model: string },
    params: { prompt: string; size?: string; negativePrompt?: string; referenceImages?: string[]; referenceImagesData?: ReferenceImageData[] }
  ): ProviderRequest {
    const model = config.model || 'gemini-2.0-flash-exp-image-generation'
    const base = config.baseUrl.replace(/\/$/, '')

    // Gemini uses query param for auth
    const url = `${base}/v1beta/models/${model}:generateContent?key=${config.apiKey}`

    const aspectRatio = sizeToAspectRatio(params.size)

    // Build parts array — text prompt + optional reference images as inlineData
    const parts: Array<Record<string, unknown>> = [{ text: params.prompt }]

    // Gemini supports reference images via inlineData parts in the contents array
    if (params.referenceImagesData?.length) {
      for (const refData of params.referenceImagesData) {
        parts.push({
          inlineData: {
            mimeType: refData.mimeType,
            data: refData.base64,
          },
        })
      }
    }

    const body: Record<string, unknown> = {
      contents: [{ parts }],
      generationConfig: {
        responseModalities: ['IMAGE', 'TEXT'],
        imageConfig: {
          aspectRatio,
          imageSize: '2K',
        },
      },
    }

    return {
      url,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': config.apiKey,
        Authorization: `Bearer ${config.apiKey}`,
      },
      body,
    }
  }

  parseGenerateResponse(result: any): {
    isAsync: boolean
    taskId?: string
    imageUrl?: string
    imageBase64?: string
  } {
    // Gemini is synchronous — no task_id polling
    // Response: candidates[0].content.parts[].inlineData.data (base64)
    const candidates = result?.candidates
    if (candidates?.length) {
      for (const candidate of candidates) {
        const parts = candidate?.content?.parts
        if (parts?.length) {
          for (const part of parts) {
            const inlineData = part?.inlineData
            if (inlineData?.data) {
              return { isAsync: false, imageBase64: inlineData.data }
            }
          }
        }
      }
    }
    return { isAsync: false }
  }

  buildPollRequest(
    _config: { baseUrl: string; apiKey: string; model: string },
    _taskId: string
  ): ProviderRequest | null {
    // Gemini is synchronous — no polling needed
    return null
  }

  parsePollResponse(_result: unknown): {
    status: 'pending' | 'processing' | 'completed' | 'failed'
    imageUrl?: string
    imageBase64?: string
    error?: string
  } {
    // Should never be called for Gemini
    return { status: 'failed', error: 'Gemini adapter does not support polling' }
  }
}

// ============================================================
// MiniMax Image Adapter
// ============================================================

export class MiniMaxImageAdapter implements ImageProviderAdapter {
  buildGenerateRequest(
    config: { baseUrl: string; apiKey: string; model: string },
    params: { prompt: string; size?: string; negativePrompt?: string; referenceImages?: string[]; referenceImagesData?: ReferenceImageData[] }
  ): ProviderRequest {
    const url = joinProviderUrl(config.baseUrl, '/v1', '/image_generation')

    const model = config.model || 'MiniMax-Image-01'

    const { width, height } = parseSize(params.size)

    const body: Record<string, unknown> = {
      model,
      prompt: params.prompt,
      size: params.size || '1920x1080',
      n: 1,
      aspect_ratio: `${width}/${height}`,
    }

    // MiniMax supports reference images via the `image` field
    if (params.referenceImages?.length) {
      body.image = params.referenceImages
    }

    return {
      url,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body,
    }
  }

  parseGenerateResponse(result: any): {
    isAsync: boolean
    taskId?: string
    imageUrl?: string
    imageBase64?: string
  } {
    // Async response — returns task_id
    if (result?.task_id) {
      return { isAsync: true, taskId: result.task_id }
    }

    // Sync response — data array with url
    if (result?.data?.length) {
      const url = result.data[0]?.url || result.data[0]?.image_url
      const b64 = result.data[0]?.b64_json
      if (b64) {
        return { isAsync: false, imageBase64: b64 }
      }
      return { isAsync: false, imageUrl: url }
    }

    // Also check top-level image_url
    if (result?.image_url) {
      return { isAsync: false, imageUrl: result.image_url }
    }

    return { isAsync: false }
  }

  buildPollRequest(
    config: { baseUrl: string; apiKey: string; model: string },
    taskId: string
  ): ProviderRequest | null {
    return {
      url: joinProviderUrl(config.baseUrl, '/v1', `/image_generation/task/${taskId}`),
      method: 'GET',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: null,
    }
  }

  parsePollResponse(result: any): {
    status: 'pending' | 'processing' | 'completed' | 'failed'
    imageUrl?: string
    imageBase64?: string
    error?: string
  } {
    const status = result?.status?.toLowerCase()
    if (status === 'completed' || status === 'succeeded') {
      // MiniMax returns image_url at top level or nested in data
      const url = result?.image_url || result?.data?.image_url || result?.data?.url
      return { status: 'completed', imageUrl: url }
    }
    if (status === 'failed') {
      return { status: 'failed', error: result?.error?.message || result?.message || 'Image generation failed' }
    }
    if (status === 'processing') {
      return { status: 'processing' }
    }
    return { status: 'pending' }
  }
}

// ============================================================
// VolcEngine Image Adapter (火山引擎 / Seedream)
// ============================================================

export class VolcEngineImageAdapter implements ImageProviderAdapter {
  buildGenerateRequest(
    config: { baseUrl: string; apiKey: string; model: string },
    params: { prompt: string; size?: string; negativePrompt?: string; referenceImages?: string[]; referenceImagesData?: ReferenceImageData[] }
  ): ProviderRequest {
    const url = joinProviderUrl(config.baseUrl, '/api/v3', '/images/generations')

    const model = config.model || 'doubao-seedream-5-0-lite'
    const { width, height } = parseSize(params.size)

    const body: Record<string, unknown> = {
      model,
      prompt: params.prompt,
      width,
      height,
    }

    // VolcEngine Seedream supports reference image via ref_img parameter
    if (params.referenceImages?.length) {
      body.ref_img = params.referenceImages[0]
      body.ref_img_weight = 0.5  // Balance between reference and prompt
    }

    return {
      url,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body,
    }
  }

  parseGenerateResponse(result: any): {
    isAsync: boolean
    taskId?: string
    imageUrl?: string
    imageBase64?: string
  } {
    // Async — returns task_id
    if (result?.task_id) {
      return { isAsync: true, taskId: result.task_id }
    }

    // Sync — data array
    if (result?.data?.length) {
      const url = result.data[0]?.url
      const b64 = result.data[0]?.b64_json
      if (b64) {
        return { isAsync: false, imageBase64: b64 }
      }
      return { isAsync: false, imageUrl: url }
    }

    return { isAsync: false }
  }

  buildPollRequest(
    config: { baseUrl: string; apiKey: string; model: string },
    taskId: string
  ): ProviderRequest | null {
    return {
      url: joinProviderUrl(config.baseUrl, '/api/v3', `/images/generations/${taskId}`),
      method: 'GET',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: null,
    }
  }

  parsePollResponse(result: any): {
    status: 'pending' | 'processing' | 'completed' | 'failed'
    imageUrl?: string
    imageBase64?: string
    error?: string
  } {
    const status = result?.status?.toLowerCase()
    if (status === 'succeeded' || status === 'completed') {
      const url = result?.data?.[0]?.url
      return { status: 'completed', imageUrl: url }
    }
    if (status === 'failed') {
      return { status: 'failed', error: result?.error?.message || result?.message || 'Image generation failed' }
    }
    if (status === 'processing') {
      return { status: 'processing' }
    }
    return { status: 'pending' }
  }
}

// ============================================================
// Ali Image Adapter (阿里 / 万相)
// ============================================================

export class AliImageAdapter implements ImageProviderAdapter {
  buildGenerateRequest(
    config: { baseUrl: string; apiKey: string; model: string },
    params: { prompt: string; size?: string; negativePrompt?: string; referenceImages?: string[] }
  ): ProviderRequest {
    const base = config.baseUrl || 'https://dashscope.aliyuncs.com'
    const url = joinProviderUrl(base, '/api/v1', '/services/aigc/image-generation/generation')

    const model = config.model || 'wan2.6-t2i'

    // Size mapping for Ali
    let aliSize: string
    if (params.size === '1920x1080') {
      aliSize = '1696*960'
    } else if (params.size === '1080x1920') {
      aliSize = '960*1696'
    } else {
      aliSize = '1280*1280'
    }

    // Build content parts — text prompt + optional reference image
    const contentParts: Array<Record<string, unknown>> = [{ text: params.prompt }]

    // Ali Wanxiang supports reference image via image field in content
    if (params.referenceImages?.length) {
      contentParts.push({
        image: params.referenceImages[0],
      })
    }

    const body = {
      model,
      input: {
        messages: [
          {
            role: 'user',
            content: contentParts,
          },
        ],
      },
      parameters: {
        size: aliSize,
        n: 1,
        negative_prompt: params.negativePrompt || '',
        prompt_extend: true,
        watermark: false,
      },
    }

    return {
      url,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
        'X-DashScope-Async': 'enable',
      },
      body,
    }
  }

  parseGenerateResponse(result: any): {
    isAsync: boolean
    taskId?: string
    imageUrl?: string
    imageBase64?: string
  } {
    // Ali always returns async with task_id in output
    const taskId = result?.output?.task_id
    const taskStatus = result?.output?.task_status

    if (taskId) {
      // If task already succeeded (unlikely but possible)
      if (taskStatus === 'SUCCEEDED') {
        const imageUrl = result?.output?.choices?.[0]?.message?.content?.[0]?.image
        return { isAsync: false, imageUrl }
      }
      return { isAsync: true, taskId }
    }

    // Check for sync response with data
    if (result?.data?.length) {
      const url = result.data[0]?.url
      return { isAsync: false, imageUrl: url }
    }

    return { isAsync: false }
  }

  buildPollRequest(
    config: { baseUrl: string; apiKey: string; model: string },
    taskId: string
  ): ProviderRequest | null {
    const base = config.baseUrl || 'https://dashscope.aliyuncs.com'
    return {
      url: joinProviderUrl(base, '/api/v1', `/tasks/${taskId}`),
      method: 'GET',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: null,
    }
  }

  parsePollResponse(result: any): {
    status: 'pending' | 'processing' | 'completed' | 'failed'
    imageUrl?: string
    imageBase64?: string
    error?: string
  } {
    const taskStatus = result?.output?.task_status

    if (taskStatus === 'SUCCEEDED') {
      const imageUrl = result?.output?.choices?.[0]?.message?.content?.[0]?.image
      return { status: 'completed', imageUrl }
    }
    if (taskStatus === 'FAILED') {
      const errMsg = result?.output?.message || result?.output?.error?.message || 'Image generation failed'
      return { status: 'failed', error: errMsg }
    }
    if (taskStatus === 'RUNNING' || taskStatus === 'PROCESSING') {
      return { status: 'processing' }
    }
    // PENDING, QUEUED, etc.
    return { status: 'pending' }
  }
}

// ============================================================
// Adapter Registry
// ============================================================

export const imageAdapters: Record<string, ImageProviderAdapter> = {
  openai: new OpenAIImageAdapter(),
  chatfire: new OpenAIImageAdapter(), // Reuses OpenAI adapter
  gemini: new GeminiImageAdapter(),
  minimax: new MiniMaxImageAdapter(),
  volcengine: new VolcEngineImageAdapter(),
  ali: new AliImageAdapter(),
}

/**
 * Get the image adapter for a given provider name.
 * Falls back to the OpenAI adapter if the provider is not found.
 */
export function getImageAdapter(provider: string): ImageProviderAdapter {
  return imageAdapters[provider] || imageAdapters['openai']
}
