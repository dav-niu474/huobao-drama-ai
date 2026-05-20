import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { getAllProvidersForUser, hasGlobalDefaultProvider, PROVIDER_PRESETS, type AiCategory } from '@/lib/ai-config'

// GET /api/user/provider - Get user's own provider configs
export async function GET() {
  try {
    const auth = await requireAuth()
    if (auth.error) return auth.error

    const { userId, role } = auth
    const isAdmin = role === 'admin'

    const providers: Record<string, any[]> = {}
    const hasDefault: Record<string, boolean> = {}

    for (const cat of ['llm', 'image', 'video', 'tts'] as AiCategory[]) {
      providers[cat] = await getAllProvidersForUser(cat, userId, isAdmin)
      hasDefault[cat] = await hasGlobalDefaultProvider(cat)
    }

    return NextResponse.json({
      providers,
      hasDefault,
      isAdmin,
    })
  } catch (error) {
    console.error('Failed to get user providers:', error)
    return NextResponse.json({ error: 'Failed to get user providers' }, { status: 500 })
  }
}

// POST /api/user/provider - Save user's own provider config
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (auth.error) return auth.error

    const { userId, role } = auth

    // Admin users should use the global settings API
    if (role === 'admin') {
      return NextResponse.json({ error: '管理员请使用全局设置API' }, { status: 400 })
    }

    const data = await request.json()
    const { category, provider, apiKey, baseUrl, model, isActive } = data

    if (!category || !provider) {
      return NextResponse.json({ error: 'category and provider are required' }, { status: 400 })
    }

    // If setting as active, deactivate others in same category
    if (isActive) {
      await db.userProvider.updateMany({
        where: { userId, category },
        data: { isActive: false },
      })
    }

    // Get preset defaults
    const preset = PROVIDER_PRESETS[category as AiCategory]?.find((p) => p.provider === provider)

    await db.userProvider.upsert({
      where: {
        userId_category_provider: {
          userId,
          category,
          provider,
        },
      },
      create: {
        userId,
        category,
        provider,
        apiKey: apiKey || '',
        baseUrl: baseUrl || preset?.defaultBaseUrl || '',
        model: model || preset?.defaultModel || '',
        isActive: isActive ?? false,
      },
      update: {
        ...(apiKey !== undefined ? { apiKey } : {}),
        ...(baseUrl !== undefined ? { baseUrl } : {}),
        ...(model !== undefined ? { model } : {}),
        isActive: isActive ?? undefined,
      },
    })

    // Return updated providers
    const providers: Record<string, any[]> = {}
    const hasDefault: Record<string, boolean> = {}
    for (const cat of ['llm', 'image', 'video', 'tts'] as AiCategory[]) {
      providers[cat] = await getAllProvidersForUser(cat, userId, false)
      hasDefault[cat] = await hasGlobalDefaultProvider(cat)
    }

    return NextResponse.json({ providers, hasDefault })
  } catch (error) {
    console.error('Failed to save user provider:', error)
    return NextResponse.json({ error: 'Failed to save user provider' }, { status: 500 })
  }
}

// DELETE /api/user/provider - Delete user's own provider config
export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (auth.error) return auth.error

    const { userId, role } = auth

    if (role === 'admin') {
      return NextResponse.json({ error: '管理员请使用全局设置API' }, { status: 400 })
    }

    const { category, provider } = await request.json()
    if (!category || !provider) {
      return NextResponse.json({ error: 'category and provider are required' }, { status: 400 })
    }

    await db.userProvider.deleteMany({
      where: { userId, category, provider },
    })

    // Return updated providers
    const providers: Record<string, any[]> = {}
    const hasDefault: Record<string, boolean> = {}
    for (const cat of ['llm', 'image', 'video', 'tts'] as AiCategory[]) {
      providers[cat] = await getAllProvidersForUser(cat, userId, false)
      hasDefault[cat] = await hasGlobalDefaultProvider(cat)
    }

    return NextResponse.json({ providers, hasDefault })
  } catch (error) {
    console.error('Failed to delete user provider:', error)
    return NextResponse.json({ error: 'Failed to delete user provider' }, { status: 500 })
  }
}
