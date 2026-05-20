import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import {
  getAllProviders,
  getAllProvidersForUser,
  saveProviderConfig,
  setActiveProvider,
  hasGlobalDefaultProvider,
  PROVIDER_PRESETS,
  type AiCategory,
  type ProviderConfig,
  getExistingProviderConfig,
} from '@/lib/ai-config'

/**
 * Mask an API key — show only the last 4 characters.
 * Returns empty string if key is empty/falsy.
 */
function maskApiKey(apiKey: string): string {
  if (!apiKey) return ''
  if (apiKey.length <= 4) return '****'
  return `****${apiKey.slice(-4)}`
}

// GET /api/settings - Return current settings with provider configs
// Non-admin users: only see their own keys + whether a default exists (no admin key values)
// Admin users: see everything as before
export async function GET() {
  try {
    // Check authentication and role
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const userRole = (session.user as any).role as string
    const userId = (session.user as any).id as string
    const isAdmin = userRole === 'admin'

    // Get provider configs — role-aware
    const providers: Record<string, ProviderConfig[]> = {}
    const hasDefault: Record<string, boolean> = {}

    for (const cat of ['llm', 'image', 'video', 'tts'] as AiCategory[]) {
      if (isAdmin) {
        // Admin sees all provider configs with full keys
        providers[cat] = await getAllProviders(cat)
      } else {
        // Non-admin: only see their own keys + preset info (no admin key values)
        providers[cat] = await getAllProvidersForUser(cat, userId, false)
      }
      // Check if a global default exists for this category
      hasDefault[cat] = await hasGlobalDefaultProvider(cat)
    }

    return NextResponse.json({
      providers,
      presets: PROVIDER_PRESETS,
      isAdmin, // Let frontend know if user is admin
      hasDefault, // Let non-admin frontend know if platform default is available
    })
  } catch (error) {
    console.error('Failed to read settings:', error)
    return NextResponse.json(
      { error: 'Failed to read settings' },
      { status: 500 }
    )
  }
}

// POST /api/settings - Save provider configs
// Only admin users can modify global provider settings
// Non-admin users save to their own UserProvider table
export async function POST(request: NextRequest) {
  try {
    // Check authentication and role
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const userRole = (session.user as any).role as string
    const userId = (session.user as any).id as string
    const isAdmin = userRole === 'admin'

    const data = await request.json()
    const { category, provider, name, apiKey, baseUrl, model, isActive } = data

    if (!category || !provider) {
      return NextResponse.json(
        { error: 'category and provider are required' },
        { status: 400 }
      )
    }

    if (isAdmin) {
      // Admin: save to global AiProvider table (existing behavior)
      // If this is being set as active, deactivate others in same category
      if (isActive) {
        await setActiveProvider(category as AiCategory, provider)
      }

      // Only save full config if fields beyond category/provider/isActive are provided
      const hasConfigFields = apiKey !== undefined || baseUrl !== undefined || model !== undefined || name !== undefined
      if (hasConfigFields) {
        // Get existing config to merge (preserve fields not explicitly provided)
        const existing = await getExistingProviderConfig(category as AiCategory, provider)

        // Check if apiKey is a masked value (starts with ****) — if so, preserve existing key
        const isMaskedKey = apiKey && apiKey.startsWith('****')
        const effectiveApiKey = isMaskedKey
          ? (existing?.apiKey || '')
          : (apiKey !== undefined ? (apiKey || existing?.apiKey || '') : (existing?.apiKey || ''))

        await saveProviderConfig({
          category: category as AiCategory,
          provider,
          name: name !== undefined ? (name || existing?.name || provider) : (existing?.name || provider),
          apiKey: effectiveApiKey,
          baseUrl: baseUrl !== undefined ? (baseUrl || existing?.baseUrl || '') : (existing?.baseUrl || ''),
          model: model !== undefined ? (model || existing?.model || '') : (existing?.model || ''),
          isActive: isActive ?? existing?.isActive ?? false,
        })
      }

      // Return updated providers (admin sees full keys since they just saved)
      const providers: Record<string, ProviderConfig[]> = {}
      for (const cat of ['llm', 'image', 'video', 'tts'] as AiCategory[]) {
        providers[cat] = await getAllProviders(cat)
      }

      return NextResponse.json({ providers, isAdmin: true })
    } else {
      // Non-admin: save to UserProvider table
      const effectiveApiKey = apiKey || ''
      if (isActive) {
        // Deactivate other user providers in same category
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
          apiKey: effectiveApiKey,
          baseUrl: baseUrl || preset?.defaultBaseUrl || '',
          model: model || preset?.defaultModel || '',
          isActive: isActive ?? false,
        },
        update: {
          ...(effectiveApiKey ? { apiKey: effectiveApiKey } : {}),
          ...(baseUrl !== undefined ? { baseUrl } : {}),
          ...(model !== undefined ? { model } : {}),
          isActive: isActive ?? undefined,
        },
      })

      // Return updated providers for non-admin
      const providers: Record<string, ProviderConfig[]> = {}
      const hasDefault: Record<string, boolean> = {}
      for (const cat of ['llm', 'image', 'video', 'tts'] as AiCategory[]) {
        providers[cat] = await getAllProvidersForUser(cat, userId, false)
        hasDefault[cat] = await hasGlobalDefaultProvider(cat)
      }

      return NextResponse.json({ providers, isAdmin: false, hasDefault })
    }
  } catch (error) {
    console.error('Failed to save settings:', error)
    return NextResponse.json(
      { error: 'Failed to save settings' },
      { status: 500 }
    )
  }
}

// DELETE /api/settings - Delete a user's own provider config
// Only non-admin users can delete their own UserProvider entries
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const userId = (session.user as any).id as string
    const userRole = (session.user as any).role as string

    // Admin cannot use this endpoint (admin uses global config)
    if (userRole === 'admin') {
      return NextResponse.json({ error: '管理员请使用全局配置管理' }, { status: 400 })
    }

    const { category, provider } = await request.json()
    if (!category || !provider) {
      return NextResponse.json({ error: 'category and provider are required' }, { status: 400 })
    }

    await db.userProvider.deleteMany({
      where: { userId, category, provider },
    })

    // Return updated providers
    const providers: Record<string, ProviderConfig[]> = {}
    const hasDefault: Record<string, boolean> = {}
    for (const cat of ['llm', 'image', 'video', 'tts'] as AiCategory[]) {
      providers[cat] = await getAllProvidersForUser(cat, userId, false)
      hasDefault[cat] = await hasGlobalDefaultProvider(cat)
    }

    return NextResponse.json({ providers, isAdmin: false, hasDefault })
  } catch (error) {
    console.error('Failed to delete provider:', error)
    return NextResponse.json({ error: 'Failed to delete provider' }, { status: 500 })
  }
}
