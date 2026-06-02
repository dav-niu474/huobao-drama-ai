import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helpers'
import { db } from '@/lib/db'

const PRESENCE_TTL_SECONDS = 30

// Helper: check drama access
async function requireDramaAccess(
  dramaId: string,
  userId: string,
  minRole: 'viewer' | 'editor' | 'owner'
): Promise<{ userId: string; role: string } | { error: NextResponse }> {
  const drama = await db.drama.findUnique({
    where: { id: dramaId },
    select: { userId: true },
  })

  if (!drama) {
    return { error: NextResponse.json({ error: '项目不存在' }, { status: 404 }) }
  }

  const ROLE_LEVELS: Record<string, number> = { owner: 3, editor: 2, viewer: 1 }

  if (drama.userId === userId) {
    return { userId, role: 'owner' }
  }

  const member = await db.dramaMember.findUnique({
    where: { dramaId_userId: { dramaId, userId } },
  })

  if (!member || member.status !== 'active') {
    return { error: NextResponse.json({ error: '无权访问此项目' }, { status: 403 }) }
  }

  const minLevel = ROLE_LEVELS[minRole] ?? 3
  const userLevel = ROLE_LEVELS[member.role] ?? 0

  if (userLevel < minLevel) {
    return { error: NextResponse.json({ error: '权限不足' }, { status: 403 }) }
  }

  return { userId, role: member.role }
}

// GET /api/dramas/[id]/presence — Get current online users for a drama
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth()
    if (auth.error) return auth.error

    const { id: dramaId } = await params
    const access = await requireDramaAccess(dramaId, auth.userId, 'viewer')
    if ('error' in access) return access.error

    const now = new Date()

    // Clean up expired presences
    await db.presence.deleteMany({
      where: { dramaId, expiresAt: { lt: now } },
    })

    // Get active presences
    const presences = await db.presence.findMany({
      where: { dramaId },
      include: { user: { select: { id: true, name: true, avatar: true } } },
      orderBy: { lastHeartbeat: 'desc' },
    })

    return NextResponse.json({
      presences: presences.map((p) => ({
        userId: p.userId,
        userName: p.user.name,
        userAvatar: p.user.avatar,
        dramaId: p.dramaId,
        episodeId: p.episodeId,
        currentPage: p.currentPage,
        cursorX: p.cursorX,
        cursorY: p.cursorY,
        lastHeartbeat: p.lastHeartbeat,
      })),
    })
  } catch (error) {
    console.error('Failed to get presence:', error)
    return NextResponse.json({ error: 'Failed to get presence' }, { status: 500 })
  }
}

// POST /api/dramas/[id]/presence — Update user presence (heartbeat/cursor)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth()
    if (auth.error) return auth.error

    const { id: dramaId } = await params
    const access = await requireDramaAccess(dramaId, auth.userId, 'viewer')
    if ('error' in access) return access.error

    const body = await request.json().catch(() => ({}))
    const {
      action = 'heartbeat',
      cursorX,
      cursorY,
      currentPage,
      episodeId,
    } = body as {
      action?: 'join' | 'heartbeat' | 'leave'
      cursorX?: number
      cursorY?: number
      currentPage?: string
      episodeId?: string
    }

    if (action === 'leave') {
      await db.presence.deleteMany({
        where: { userId: auth.userId, dramaId },
      })
      // Log activity
      await db.activity.create({
        data: {
          userId: auth.userId,
          dramaId,
          type: 'user_leave',
          description: '离开了项目',
        },
      })
      return NextResponse.json({ ok: true })
    }

    const now = new Date()
    const expiresAt = new Date(now.getTime() + PRESENCE_TTL_SECONDS * 1000)

    // Upsert presence
    const presence = await db.presence.upsert({
      where: { userId_dramaId: { userId: auth.userId, dramaId } },
      update: {
        lastHeartbeat: now,
        expiresAt,
        ...(cursorX !== undefined ? { cursorX } : {}),
        ...(cursorY !== undefined ? { cursorY } : {}),
        ...(currentPage !== undefined ? { currentPage } : {}),
        ...(episodeId !== undefined ? { episodeId } : {}),
      },
      create: {
        userId: auth.userId,
        dramaId,
        episodeId: episodeId ?? null,
        currentPage: currentPage ?? '',
        cursorX: cursorX ?? 0,
        cursorY: cursorY ?? 0,
        lastHeartbeat: now,
        expiresAt,
      },
      include: { user: { select: { name: true, avatar: true } } },
    })

    // If join action, log activity
    if (action === 'join') {
      await db.activity.create({
        data: {
          userId: auth.userId,
          dramaId,
          type: 'user_join',
          description: '加入了项目',
        },
      })
    }

    return NextResponse.json({
      presence: {
        userId: presence.userId,
        userName: presence.user.name,
        userAvatar: presence.user.avatar,
        dramaId: presence.dramaId,
        episodeId: presence.episodeId,
        currentPage: presence.currentPage,
        cursorX: presence.cursorX,
        cursorY: presence.cursorY,
        lastHeartbeat: presence.lastHeartbeat,
      },
    })
  } catch (error) {
    console.error('Failed to update presence:', error)
    return NextResponse.json({ error: 'Failed to update presence' }, { status: 500 })
  }
}

// DELETE /api/dramas/[id]/presence — User leaves
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth()
    if (auth.error) return auth.error

    const { id: dramaId } = await params

    await db.presence.deleteMany({
      where: { userId: auth.userId, dramaId },
    })

    // Log activity
    await db.activity.create({
      data: {
        userId: auth.userId,
        dramaId,
        type: 'user_leave',
        description: '离开了项目',
      },
    })

    // Release all locks for this user in this drama
    await db.resourceLock.deleteMany({
      where: { userId: auth.userId, dramaId },
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Failed to leave presence:', error)
    return NextResponse.json({ error: 'Failed to leave presence' }, { status: 500 })
  }
}
