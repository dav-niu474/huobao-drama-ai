import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helpers'
import { inferModelType } from '@/lib/model-type-detection'

// ============================================================
// POST /api/settings/discover-models
// Body: { baseUrl, apiKey, protocol? }
// Fetches available models from the provider's /models endpoint.
// Supports OpenAI-compatible /v1/models style endpoints.
// Uses inferModelType() for accurate type detection.
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
    if (protocol === 'anthropic') {
      headers['x-api-key'] = apiKey
      headers['anthropic-version'] = '2023-06-01'
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
    const rawModels: any[] = data.data || data.models || (Array.isArray(data) ? data : [])

    const models = rawModels
      .map((m: any) => {
        const id = m.id || m.name || ''
        if (!id) return null
        const typeInfo = inferModelType(id)
        return {
          id,
          name: m.name || id,
          type: typeInfo.mediaType,
          typeLabel: typeInfo.label,
        }
      })
      .filter((m): m is { id: string; name: string; type: string; typeLabel: string } => m !== null)

    return NextResponse.json({ models })
  } catch (err: any) {
    return NextResponse.json(
      { error: `获取模型列表失败: ${err?.message ?? String(err)}` },
      { status: 500 }
    )
  }
}
