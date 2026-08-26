import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helpers'

// ============================================================
// Helper — guess model type (text/image/video/tts) from model id
// ============================================================

function guessModelType(modelId: string): 'text' | 'image' | 'video' | 'tts' {
  const lower = modelId.toLowerCase()
  if (
    lower.includes('image') ||
    lower.includes('dall-e') ||
    lower.includes('cogview') ||
    lower.includes('seedream') ||
    lower.includes('wan2.') || // wan2.7-image, wanx2.1-t2i
    lower.includes('wanx') ||
    lower.includes('imagen') ||
    lower.includes('flux') ||
    lower.includes('gpt-image')
  ) {
    return 'image'
  }
  if (
    lower.includes('video') ||
    lower.includes('cogvideo') ||
    lower.includes('seedance') ||
    lower.includes('sora') ||
    lower.includes('hailuo') ||
    lower.includes('t2v') ||
    lower.includes('i2v') ||
    lower.includes('r2v') ||
    lower.includes('vidu')
  ) {
    return 'video'
  }
  if (
    lower.includes('tts') ||
    lower.includes('speech') ||
    lower.includes('cogtts') ||
    lower.includes('audio') ||
    lower.includes('fish-speech')
  ) {
    return 'tts'
  }
  return 'text'
}

// ============================================================
// POST /api/settings/discover-models
// Body: { baseUrl, apiKey, protocol? }
// Fetches available models from the provider's /models endpoint.
// Supports OpenAI-compatible /v1/models style endpoints.
// ============================================================

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const body = await request.json().catch(() => ({}))
  const { baseUrl, apiKey, protocol = 'openai' } = body

  if (!baseUrl) {
    return NextResponse.json({ error: '缺少 baseUrl' }, { status: 400 })
  }
  if (!apiKey) {
    return NextResponse.json({ error: '缺少 apiKey' }, { status: 400 })
  }

  try {
    // Build models URL — accept both "/models" suffix and full base URL
    let modelsUrl: string
    if (baseUrl.endsWith('/models')) {
      modelsUrl = baseUrl
    } else if (baseUrl.endsWith('/v1')) {
      modelsUrl = `${baseUrl}/models`
    } else if (baseUrl.endsWith('/v1/')) {
      modelsUrl = `${baseUrl}models`
    } else {
      modelsUrl = `${baseUrl.replace(/\/$/, '')}/models`
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    // Anthropic uses x-api-key header, OpenAI uses Authorization: Bearer
    if (protocol === 'anthropic') {
      headers['x-api-key'] = apiKey
      headers['anthropic-version'] = '2023-06-01'
      // Anthropic doesn't have a /models endpoint, but we still try
    } else {
      headers['Authorization'] = `Bearer ${apiKey}`
    }

    const res = await fetch(modelsUrl, {
      headers,
      signal: AbortSignal.timeout(15_000),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => 'Unknown')
      return NextResponse.json(
        { error: `连接失败 (${res.status}): ${text.slice(0, 200)}` },
        { status: 400 }
      )
    }

    const data = await res.json()
    // OpenAI-compatible /models returns { data: [{ id: "model-name", ... }] }
    // Some providers return { models: [...] } or a bare array
    const rawModels: any[] = data.data || data.models || (Array.isArray(data) ? data : [])

    const models = rawModels
      .map((m: any) => {
        const id = m.id || m.name || ''
        if (!id) return null
        return {
          id,
          name: m.name || id,
          type: guessModelType(id),
        }
      })
      .filter((m): m is { id: string; name: string; type: 'text' | 'image' | 'video' | 'tts' } => m !== null)

    return NextResponse.json({ models })
  } catch (err: any) {
    return NextResponse.json(
      { error: `获取模型列表失败: ${err?.message ?? String(err)}` },
      { status: 500 }
    )
  }
}
