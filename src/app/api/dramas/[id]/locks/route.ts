import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { acquireLock, releaseLock, getActiveLocks } from '@/lib/resource-lock'

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

// GET /api/dramas/[id]/locks — Get locked resources
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

    const locks = await getActiveLocks(dramaId)
    return NextResponse.json({ locks })
  } catch (error) {
    console.error('Failed to get locks:', error)
    return NextResponse.json({ error: 'Failed to get locks' }, { status: 500 })
  }
}

// POST /api/dramas/[id]/locks — Lock a resource
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth()
    if (auth.error) return auth.error

    const { id: dramaId } = await params
    const access = await requireDramaAccess(dramaId, auth.userId, 'editor')
    if ('error' in access) return access.error

    const body = await request.json()
    const { resourceType, resourceId } = body as {
      resourceType: string
      resourceId: string
    }

    if (!resourceType || !resourceId) {
      return NextResponse.json({ error: '缺少 resourceType 或 resourceId' }, { status: 400 })
    }

    const result = await acquireLock(dramaId, auth.userId, resourceType, resourceId)

    if (!result.acquired) {
      return NextResponse.json({
        acquired: false,
        conflict: result.conflict,
      }, { status: 409 }) // Conflict
    }

    // Log activity
    const user = await db.user.findUnique({ where: { id: auth.userId }, select: { name: true } })
    await db.activity.create({
      data: {
        userId: auth.userId,
        dramaId,
        type: 'lock_resource',
        description: `锁定了 ${resourceType} ${resourceId}`,
        metadata: JSON.stringify({ resourceType, resourceId }),
      },
    })

    return NextResponse.json({ acquired: true, lock: result.lock })
  } catch (error) {
    console.error('Failed to lock resource:', error)
    return NextResponse.json({ error: 'Failed to lock resource' }, { status: 500 })
  }
}
