// ============================================================
// Bulk Lock/Unlock API — /api/dramas/[id]/bulk-lock
// POST: Lock or unlock all episodes in a drama
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

// POST /api/dramas/[id]/bulk-lock
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const { id: dramaId } = await params

    // Verify drama exists
    const drama = await db.drama.findUnique({
      where: { id: dramaId },
      select: { id: true, defaultLockedConfig: true },
    })
    if (!drama) {
      return NextResponse.json({ error: 'Drama not found' }, { status: 404 })
    }

    const body = await request.json()
    const { action, config } = body as {
      action: 'lock' | 'unlock'
      config?: { llm?: string; image?: string; video?: string; tts?: string }
    }

    if (!action || (action !== 'lock' && action !== 'unlock')) {
      return NextResponse.json(
        { error: 'action must be "lock" or "unlock"' },
        { status: 400 }
      )
    }

    if (action === 'unlock') {
      // Unlock all episodes: set lockedConfig to "null"
      const result = await db.episode.updateMany({
        where: { dramaId },
        data: { lockedConfig: 'null' },
      })
      return NextResponse.json({
        action: 'unlock',
        updatedCount: result.count,
        message: `已解锁全部 ${result.count} 集`,
      })
    }

    // Lock: determine the config to use
    let lockConfigValue: string

    if (config && Object.keys(config).length > 0) {
      // Use provided config
      const clean: Record<string, string> = {}
      for (const [k, v] of Object.entries(config)) {
        if (v) clean[k] = v
      }
      lockConfigValue = Object.keys(clean).length > 0
        ? JSON.stringify(clean)
        : 'null'
    } else if (drama.defaultLockedConfig && drama.defaultLockedConfig !== 'null') {
      // Use drama's defaultLockedConfig
      lockConfigValue = drama.defaultLockedConfig
    } else {
      return NextResponse.json(
        { error: 'No config provided and drama has no defaultLockedConfig. Provide config or set drama defaultLockedConfig first.' },
        { status: 400 }
      )
    }

    if (lockConfigValue === 'null') {
      return NextResponse.json(
        { error: 'Resolved config is empty — nothing to lock with' },
        { status: 400 }
      )
    }

    const result = await db.episode.updateMany({
      where: { dramaId },
      data: { lockedConfig: lockConfigValue },
    })

    return NextResponse.json({
      action: 'lock',
      updatedCount: result.count,
      lockedConfig: lockConfigValue,
      message: `已锁定全部 ${result.count} 集`,
    })
  } catch (error) {
    console.error('Failed to bulk lock/unlock:', error)
    return NextResponse.json(
      { error: 'Failed to bulk lock/unlock' },
      { status: 500 }
    )
  }
}
