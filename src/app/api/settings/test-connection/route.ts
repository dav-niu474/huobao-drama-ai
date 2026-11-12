import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helpers'

// ============================================================
// POST /api/settings/test-connection
// Body: { baseUrl, apiKey, model?, models?, protocol? }
// Tests connection by sending a minimal chat completion request
// to an OpenAI-compatible /chat/completions endpoint.
// If no model specified, tries each discovered model until one works.
// ============================================================

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const body = await request.json().catch(() => ({}))
  const { baseUrl, apiKey, model, models, protocol = 'openai' } = body

  if (!baseUrl || !apiKey) {
    return NextResponse.json(
      { error: '缺少 baseUrl 或 apiKey' },
      { status: 400 }
    )
  }

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

  // Determine which models to try
  // Priority: explicitly selected model > first discovered text model > first discovered model > fallback
  const candidateModels: string[] = []
  if (model) {
    candidateModels.push(model)
  }
  if (Array.isArray(models)) {
    // Prefer text models first, then any model
    const textModels = models.filter((m: any) => 
      typeof m === 'string' ? true : m.type === 'text'
    )
    const otherModels = models.filter((m: any) =>
      typeof m === 'string' ? false : m.type !== 'text'
    )
    for (const m of textModels) {
      const id = typeof m === 'string' ? m : m.id
      if (!candidateModels.includes(id)) candidateModels.push(id)
    }
    for (const m of otherModels) {
      const id = typeof m === 'string' ? m : m.id
      if (!candidateModels.includes(id)) candidateModels.push(id)
    }
  }
  // Last resort fallbacks (only if no models specified at all)
  if (candidateModels.length === 0) {
    if (protocol === 'anthropic') {
      candidateModels.push('claude-3-5-sonnet-20241022')
    } else {
      candidateModels.push('gpt-3.5-turbo')
    }
  }

  // Try each candidate model until one succeeds
  let lastError = ''
  for (const tryModel of candidateModels) {
    try {
      const payload =
        protocol === 'anthropic'
          ? {
              model: tryModel,
              max_tokens: 5,
              messages: [{ role: 'user', content: 'Hi' }],
            }
          : {
              model: tryModel,
              messages: [{ role: 'user', content: 'Hi' }],
              max_tokens: 5,
            }

      const res = await fetch(chatUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(30_000),
      })

      if (res.ok) {
        // Success — consume body and return
        await res.text().catch(() => '')
        return NextResponse.json({
          success: true,
          message: `连接成功（测试模型: ${tryModel}）`,
          model: tryModel,
        })
      }

      // If 401/403, the API key is wrong — no point trying other models
      if (res.status === 401 || res.status === 403) {
        const text = await res.text().catch(() => 'Unknown')
        return NextResponse.json(
          { error: `API Key 认证失败 (${res.status})：请检查密钥是否正确` },
          { status: 400 }
        )
      }

      // For 404 (model not found), try next model
      lastError = `(${res.status}): ${await res.text().catch(() => 'Unknown')}`
      console.log(`[test-connection] Model ${tryModel} failed: ${lastError}`)

      // If 429 (rate limit), stop trying
      if (res.status === 429) {
        return NextResponse.json(
          { error: `请求频率超限 (429)：请稍后重试` },
          { status: 400 }
        )
      }
    } catch (err: any) {
      lastError = err?.message ?? String(err)
      // Network error — try next model
      console.log(`[test-connection] Model ${tryModel} error: ${lastError}`)
    }
  }

  // All models failed
  return NextResponse.json(
    { error: `连接测试失败：所有模型都不可用。最后一个错误: ${lastError.slice(0, 200)}` },
    { status: 400 }
  )
}
