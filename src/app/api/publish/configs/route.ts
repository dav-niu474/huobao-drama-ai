import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerSession } from 'next-auth'

// GET /api/publish/configs — List platform configs
export async function GET() {
  try {
    const session = await getServerSession()
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await db.user.findUnique({ where: { email: session.user.email } })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const configs = await db.publishConfig.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    })

    // Mask access tokens in response
    const masked = configs.map(c => ({
      ...c,
      accessToken: c.accessToken ? '****' : '',
      refreshToken: c.refreshToken ? '****' : '',
    }))

    return NextResponse.json({ configs: masked })
  } catch (error) {
    console.error('[publish-configs] Error:', error)
    return NextResponse.json({ error: 'Failed to fetch configs' }, { status: 500 })
  }
}

// POST /api/publish/configs — Add platform config
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await db.user.findUnique({ where: { email: session.user.email } })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const body = await request.json()
    const { platform, accessToken, refreshToken, accountInfo } = body

    if (!platform) {
      return NextResponse.json({ error: 'Platform is required' }, { status: 400 })
    }

    // Upsert config for this user+platform
    const config = await db.publishConfig.upsert({
      where: {
        userId_platform: { userId: user.id, platform },
      },
      create: {
        userId: user.id,
        platform,
        accessToken: accessToken || '',
        refreshToken: refreshToken || '',
        accountInfo: JSON.stringify(accountInfo || {}),
      },
      update: {
        accessToken: accessToken || '',
        refreshToken: refreshToken || '',
        accountInfo: JSON.stringify(accountInfo || {}),
      },
    })

    return NextResponse.json({
      config: {
        ...config,
        accessToken: '****',
        refreshToken: '****',
      },
    }, { status: 201 })
  } catch (error) {
    console.error('[publish-configs-create] Error:', error)
    return NextResponse.json({ error: 'Failed to create config' }, { status: 500 })
  }
}
