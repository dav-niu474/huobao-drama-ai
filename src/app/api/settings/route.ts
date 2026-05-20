import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { getAllProviders, saveProviderConfig, setActiveProvider, PROVIDER_PRESETS, type AiCategory, type ProviderConfig, getExistingProviderConfig, hasGlobalDefaultProvider } from '@/lib/ai-config'

/**
 * Build a safe view of providers for non-admin users.
 * Non-admin users should NOT see admin's API key values at all,
 * but should know which categories have a platform default available.
 * Returns empty provider lists (no admin key info leaked).
 */
function providersForNonAdmin(
  providers: Record<string, ProviderConfig[]>
): Record<string, ProviderConfig[]> {
  // Return empty arrays — non-admin users don't need to see admin provider details
  // They use the separate /api/settings/user-provider endpoint for their own keys
  const result: Record<string, ProviderConfig[]> = {}
  for (const category of Object.keys(providers)) {
    result[category] = []
  }
  return result
}

// GET /api/settings - Return current settings with provider configs
// Non-admin users: no admin key info exposed, only hasDefault flag
export async function GET() {
  try {
    // Check authentication and role
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const userRole = (session.user as any).role as string
    const isAdmin = userRole === 'admin'

    // Get all provider configs from DB
    const providers: Record<string, ProviderConfig[]> = {}
    const hasDefault: Record<string, boolean> = {}
    for (const cat of ['llm', 'image', 'video', 'tts'] as AiCategory[]) {
      providers[cat] = await getAllProviders(cat)
      hasDefault[cat] = await hasGlobalDefaultProvider(cat)
    }

    // For non-admin users: hide admin provider details completely
    // They only need to know if a platform default exists (via hasDefault)
    const viewProviders = isAdmin ? providers : providersForNonAdmin(providers)

    return NextResponse.json({
      providers: viewProviders,
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
// Only admin users can modify provider settings
export async function POST(request: NextRequest) {
  try {
    // Check authentication and role — only admins can save settings
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const userRole = (session.user as any).role as string
    if (userRole !== 'admin') {
      return NextResponse.json(
        { error: '权限不足：只有管理员可以修改设置' },
        { status: 403 }
      )
    }

    const data = await request.json()
    const { category, provider, name, apiKey, baseUrl, model, isActive } = data

    if (!category || !provider) {
      return NextResponse.json(
        { error: 'category and provider are required' },
        { status: 400 }
      )
    }

    // If this is being set as active, deactivate others in same category
    if (isActive) {
      await setActiveProvider(category as AiCategory, provider)
    }

    // Only save full config if fields beyond category/provider/isActive are provided
    // This prevents handleSetActive from overwriting previously saved apiKey/baseUrl/model with empty strings
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

    return NextResponse.json({ providers })
  } catch (error) {
    console.error('Failed to save settings:', error)
    return NextResponse.json(
      { error: 'Failed to save settings' },
      { status: 500 }
    )
  }
}
