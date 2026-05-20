import { NextRequest, NextResponse } from 'next/server'
import { aiClient, getActiveProviderForUser } from '@/lib/ai-config'
import type { AiCategory } from '@/lib/ai-config'
import { requireAuth } from '@/lib/auth-helpers'

// POST /api/ai/test-connection - Test AI provider connectivity
// Admin tests the global provider, non-admin tests their own key
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (auth.error) return auth.error
    const { userId, role } = auth
    const body = await request.json().catch(() => ({}))
    const category = (body.category || 'llm') as AiCategory
    const testModel = body.model as string | undefined

    // Non-admin: test with user's own provider key
    // Admin: test with global provider key (existing behavior via aiClient)
    if (role !== 'admin') {
      // Non-admin: use getActiveProviderForUser which checks user key first
      const provider = await getActiveProviderForUser(category, userId)
      if (!provider) {
        return NextResponse.json({
          success: false,
          error: '未配置 API Key。请在设置中配置您自己的 API Key。',
        })
      }

      // Check if this is the user's own key (not the global default)
      // We allow testing even if it falls back to global, but inform the user
      const userProvider = await require('@/lib/db').db.userProvider.findFirst({
        where: { userId, category, isActive: true },
      })
      const usingOwnKey = !!userProvider?.apiKey

      try {
        if (category === 'llm') {
          const url = provider.baseUrl.endsWith('/chat/completions')
            ? provider.baseUrl
            : `${provider.baseUrl.replace(/\/$/, '')}/chat/completions`

          const res = await fetch(url, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${provider.apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: testModel || provider.model,
              messages: [{ role: 'user', content: 'Say "OK" and nothing else.' }],
              max_tokens: 10,
              temperature: 0,
            }),
          })

          if (!res.ok) {
            const text = await res.text().catch(() => 'Unknown error')
            return NextResponse.json({
              success: false,
              error: `API错误 (${res.status}): ${text.slice(0, 200)}`,
            })
          }

          const result = await res.json()
          const content = result.choices?.[0]?.message?.content ?? ''

          return NextResponse.json({
            success: true,
            provider: provider.name,
            model: testModel || provider.model,
            responsePreview: content.slice(0, 100),
            usingOwnKey,
          })
        }

        // For image/video/tts, use the standard aiClient test
        const testResult = await aiClient.testConnection(category)
        return NextResponse.json({
          ...testResult,
          usingOwnKey,
        })
      } catch (error) {
        return NextResponse.json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    }

    // Admin: existing behavior
    if (testModel && category === 'llm') {
      try {
        const response = await aiClient.chat('Say "OK" and nothing else.', undefined, {
          max_tokens: 10,
          temperature: 0,
          model: testModel,
        })
        return NextResponse.json({
          success: true,
          model: testModel,
          responsePreview: response.slice(0, 100),
        })
      } catch (error) {
        return NextResponse.json({
          success: false,
          model: testModel,
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    }

    const result = await aiClient.testConnection(category)
    return NextResponse.json(result)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown error occurred'

    return NextResponse.json({
      success: false,
      error: message,
    })
  }
}
