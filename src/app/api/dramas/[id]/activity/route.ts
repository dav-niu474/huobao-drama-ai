import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helpers'
import { db } from '@/lib/db'

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

// GET /api/dramas/[id]/activity — Get activity list or SSE stream
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth()
    if (auth.error) return auth.error

    const { id: dramaId } = await params
    const access = await requireDramaAccess(dramaId, auth.userId, 'viewer')
    if ('error' in access) return access.error

    const { searchParams } = new URL(request.url)
    const isStream = searchParams.get('stream') === 'true'

    // ── SSE Stream ────────────────────────────────────────
    if (isStream) {
      const encoder = new TextEncoder()
      const stream = new ReadableStream({
        async start(controller) {
          // Send initial connection event
          controller.enqueue(encoder.encode(`event: connected\ndata: ${JSON.stringify({ type: 'connected', dramaId })}\n\n`))

          // Poll for new activities and send them
          let lastCheck = new Date()

          const interval = setInterval(async () => {
            try {
              const activities = await db.activity.findMany({
                where: {
                  dramaId,
                  createdAt: { gt: lastCheck },
                },
                include: { user: { select: { name: true, avatar: true } } },
                orderBy: { createdAt: 'desc' },
                take: 20,
              })

              if (activities.length > 0) {
                lastCheck = new Date()
                for (const activity of activities.reverse()) {
                  const data = JSON.stringify({
                    id: activity.id,
                    type: activity.type,
                    dramaId: activity.dramaId,
                    episodeId: activity.episodeId,
                    userId: activity.userId,
                    userName: activity.user.name,
                    userAvatar: activity.user.avatar,
                    description: activity.description,
                    metadata: JSON.parse(activity.metadata || '{}'),
                    timestamp: new Date(activity.createdAt).getTime(),
                  })
                  controller.enqueue(encoder.encode(`data: ${data}\n\n`))
                }
              }
            } catch {
              // Continue polling on error
            }
          }, 2000)

          // Cleanup on abort
          request.signal.addEventListener('abort', () => {
            clearInterval(interval)
            controller.close()
          })
        },
      })

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      })
    }

    // ── Regular JSON response ─────────────────────────────
    const afterId = searchParams.get('afterId')
    const limit = parseInt(searchParams.get('limit') || '50', 10)

    const where: any = { dramaId }
    if (afterId) {
      const afterActivity = await db.activity.findUnique({ where: { id: afterId } })
      if (afterActivity) {
        where.createdAt = { gt: afterActivity.createdAt }
      }
    }

    const activities = await db.activity.findMany({
      where,
      include: { user: { select: { name: true, avatar: true } } },
      orderBy: { createdAt: 'desc' },
      take: limit,
    })

    return NextResponse.json({
      activities: activities.map((a) => ({
        id: a.id,
        userId: a.userId,
        userName: a.user.name,
        userAvatar: a.user.avatar,
        dramaId: a.dramaId,
        episodeId: a.episodeId,
        type: a.type,
        description: a.description,
        metadata: JSON.parse(a.metadata || '{}'),
        createdAt: a.createdAt,
      })),
    })
  } catch (error) {
    console.error('Failed to get activities:', error)
    return NextResponse.json({ error: 'Failed to get activities' }, { status: 500 })
  }
}
