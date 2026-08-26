import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helpers'

// ============================================================
// POST /api/settings/test-connection
// Body: { baseUrl, apiKey, model?, protocol? }
// Tests connection by sending a minimal chat completion request
// to an OpenAI-compatible /chat/completions endpoint.
// ============================================================

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const body = await request.json().catch(() => ({}))
  const { baseUrl, apiKey, model, protocol = 'openai' } = body

  if (!baseUrl || !apiKey) {
    return NextResponse.json(
      { error: '缺少 baseUrl 或 apiKey' },
      { status: 400 }
    )
  }

  try {
    // Build chat completions URL
    let chatUrl: string
    if (baseUrl.endsWith('/chat/completions')) {
      chatUrl = baseUrl
    } else if (baseUrl.endsWith('/v1')) {
      chatUrl = `${baseUrl}/chat/completions`
    } else if (baseUrl.endsWith('/v1/')) {
      chatUrl = `${baseUrl}chat/completions`
    } else {
      chatUrl = `${baseUrl.replace(/\/$/, '')}/chat/completions`
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

    const payload =
      protocol === 'anthropic'
        ? {
            model: model || 'claude-3-5-sonnet-20241022',
            max_tokens: 5,
            messages: [{ role: 'user', content: 'Hi' }],
          }
        : {
            model: model || 'gpt-3.5-turbo',
            messages: [{ role: 'user', content: 'Hi' }],
            max_tokens: 5,
          }

    const res = await fetch(chatUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30_000),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => 'Unknown')
      return NextResponse.json(
        { error: `连接测试失败 (${res.status}): ${text.slice(0, 200)}` },
        { status: 400 }
      )
    }

    // Consume the body so the connection is released
    await res.text().catch(() => '')

    return NextResponse.json({
      success: true,
      message: '连接成功',
      model: model || (protocol === 'anthropic' ? 'claude-3-5-sonnet' : 'gpt-3.5-turbo'),
    })
  } catch (err: any) {
    return NextResponse.json(
      { error: `连接测试失败: ${err?.message ?? String(err)}` },
      { status: 500 }
    )
  }
}
