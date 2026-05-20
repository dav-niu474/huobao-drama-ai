import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { PROVIDER_PRESETS, getActiveProvider, type AiCategory, type ProviderConfig } from '@/lib/ai-config'

// ============================================================
// Helper — check if an apiKey matches a platform (admin) key
// ============================================================

async function isPlatformApiKey(category: string, provider: string, apiKey: string): Promise<boolean> {
  if (!apiKey || apiKey.startsWith('****')) return false

  // Check against DB admin key
  const adminProvider = await db.aiProvider.findUnique({
    where: { category_provider: { category, provider } },
  })
  if (adminProvider?.apiKey && adminProvider.apiKey === apiKey) return true

  // Check against env var key
  const preset = PROVIDER_PRESETS[category as AiCategory]?.find((p) => p.provider === provider)
  if (preset?.envKey) {
    const envKey = process.env[preset.envKey]
      || (provider === 'openrouter' ? process.env['OpenRouter_API_KEY'] : '')
      || ''
    if (envKey && envKey === apiKey) return true
  }

  return false
}

// ============================================================
// Helper — build ProviderConfig from a UserProvider DB row
// SECURITY: Filters out records whose apiKey matches the platform key
// ============================================================

function userProviderToConfig(up: {
  category: string
  provider: string
  apiKey: string
  baseUrl: string
  model: string
  isActive: boolean
}): ProviderConfig {
  const preset = PROVIDER_PRESETS[up.category as AiCategory]?.find(
    (p) => p.provider === up.provider
  )
  return {
    category: up.category as AiCategory,
    provider: up.provider,
    name: preset?.name ?? up.provider,
    // SECURITY: Only use the user's own apiKey, NEVER fall back to env vars
    // which would expose the platform's API key to free users.
    apiKey: up.apiKey || '',
    baseUrl: up.baseUrl || preset?.defaultBaseUrl || '',
    model: up.model || preset?.defaultModel || '',
    isActive: up.isActive,
  }
}

/**
 * Build the providers map for all categories for the current user.
 * SECURITY: Filters out any UserProvider records whose apiKey matches
 * a platform (admin/env) key — these are "dirty data" from a previous
 * bug that leaked platform keys into the UserProvider table.
 */
async function buildUserProvidersMap(userId: string): Promise<Record<string, ProviderConfig[]>> {
  const userProviders = await db.userProvider.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
  })

  const result: Record<string, ProviderConfig[]> = {
    llm: [],
    image: [],
    video: [],
    tts: [],
  }

  for (const up of userProviders) {
    const cat = up.category
    if (!result[cat]) result[cat] = []

    // SECURITY CHECK: If this userProvider's apiKey matches a platform key,
    // delete the dirty record and skip it — this was leaked data from a previous bug
    if (up.apiKey && await isPlatformApiKey(up.category, up.provider, up.apiKey)) {
      console.warn(`[SECURITY] Cleaning dirty UserProvider record: user=${userId}, category=${up.category}, provider=${up.provider} — apiKey matches platform key, deleting`)
      await db.userProvider.deleteMany({
        where: { userId, category: up.category, provider: up.provider },
      })
      continue
    }

    result[cat].push(userProviderToConfig(up))
  }

  return result
}

// ============================================================
// GET /api/settings/user-provider
// Returns the current user's provider configs for all categories.
// Any logged-in user can access this. Keys are NOT masked
// since they belong to the user themselves.
// ============================================================
export async function GET() {
  try {
    const auth = await requireAuth()
    if (auth.error) return auth.error

    const providers = await buildUserProvidersMap(auth.userId)
    return NextResponse.json({ providers })
  } catch (error) {
    console.error('Failed to get user providers:', error)
    return NextResponse.json(
      { error: 'Failed to get user providers' },
      { status: 500 }
    )
  }
}

// ============================================================
// POST /api/settings/user-provider
// Saves a user's provider config. Any logged-in user can save.
// Upserts the UserProvider record for (userId, category, provider).
// If isActive: true, deactivates other UserProviders in the same
// category for this user.
// SECURITY: Rejects apiKey that matches a platform (admin/env) key.
// ============================================================
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (auth.error) return auth.error

    const data = await request.json()
    const { category, provider, name, apiKey, baseUrl, model, isActive } = data

    if (!category || !provider) {
      return NextResponse.json(
        { error: 'category and provider are required' },
        { status: 400 }
      )
    }

    // SECURITY: Block saving if the provided apiKey matches a platform key
    if (apiKey && await isPlatformApiKey(category, provider, apiKey)) {
      console.warn(`[SECURITY] Blocked save of platform key to UserProvider: user=${auth.userId}, category=${category}, provider=${provider}`)
      // Also clean any existing dirty record
      await db.userProvider.deleteMany({
        where: { userId: auth.userId, category, provider },
      })
      const providers = await buildUserProvidersMap(auth.userId)
      return NextResponse.json({ providers })
    }

    // If setting this as active, deactivate other user providers in same category
    if (isActive) {
      await db.userProvider.updateMany({
        where: { userId: auth.userId, category, isActive: true },
        data: { isActive: false },
      })
    }

    // Upsert the user provider record
    const preset = PROVIDER_PRESETS[category as AiCategory]?.find(
      (p) => p.provider === provider
    )

    await db.userProvider.upsert({
      where: {
        userId_category_provider: {
          userId: auth.userId,
          category,
          provider,
        },
      },
      create: {
        userId: auth.userId,
        category,
        provider,
        apiKey: apiKey ?? '',
        baseUrl: baseUrl || preset?.defaultBaseUrl || '',
        model: model || preset?.defaultModel || '',
        isActive: isActive ?? false,
      },
      update: {
        apiKey: apiKey !== undefined ? apiKey : undefined,
        baseUrl: baseUrl !== undefined ? baseUrl : undefined,
        model: model !== undefined ? model : undefined,
        isActive: isActive !== undefined ? isActive : undefined,
      },
    })

    const providers = await buildUserProvidersMap(auth.userId)
    return NextResponse.json({ providers })
  } catch (error) {
    console.error('Failed to save user provider:', error)
    return NextResponse.json(
      { error: 'Failed to save user provider' },
      { status: 500 }
    )
  }
}

// ============================================================
// DELETE /api/settings/user-provider
// Deletes a user's provider config.
// Body: { category, provider }
// ============================================================
export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (auth.error) return auth.error

    const data = await request.json()
    const { category, provider } = data

    if (!category || !provider) {
      return NextResponse.json(
        { error: 'category and provider are required' },
        { status: 400 }
      )
    }

    await db.userProvider.deleteMany({
      where: {
        userId: auth.userId,
        category,
        provider,
      },
    })

    const providers = await buildUserProvidersMap(auth.userId)
    return NextResponse.json({ providers })
  } catch (error) {
    console.error('Failed to delete user provider:', error)
    return NextResponse.json(
      { error: 'Failed to delete user provider' },
      { status: 500 }
    )
  }
}
