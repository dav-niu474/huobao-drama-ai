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

// DELETE /api/dramas/[id]/locks/[resourceId] — Unlock a resource
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; resourceId: string }> }
) {
  try {
    const auth = await requireAuth()
    if (auth.error) return auth.error

    const { id: dramaId, resourceId } = await params
    const access = await requireDramaAccess(dramaId, auth.userId, 'editor')
    if ('error' in access) return access.error

    const { searchParams } = new URL(request.url)
    const resourceType = searchParams.get('resourceType')

    if (!resourceType) {
      return NextResponse.json({ error: '缺少 resourceType 参数' }, { status: 400 })
    }

    // Find the lock
    const lock = await db.resourceLock.findUnique({
      where: { dramaId_resourceType_resourceId: { dramaId, resourceType, resourceId } },
    })

    if (!lock) {
      return NextResponse.json({ ok: true, message: '锁不存在' })
    }

    // Only the lock owner can unlock
    if (lock.userId !== auth.userId) {
      // Check if lock is expired
      if (lock.expiresAt < new Date()) {
        await db.resourceLock.delete({ where: { id: lock.id } })
        return NextResponse.json({ ok: true, message: '锁已过期并释放' })
      }
      return NextResponse.json({ error: '只能释放自己持有的锁' }, { status: 403 })
    }

    await db.resourceLock.delete({ where: { id: lock.id } })

    // Log activity
    await db.activity.create({
      data: {
        userId: auth.userId,
        dramaId,
        type: 'unlock_resource',
        description: `释放了 ${resourceType} ${resourceId}`,
        metadata: JSON.stringify({ resourceType, resourceId }),
      },
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Failed to unlock resource:', error)
    return NextResponse.json({ error: 'Failed to unlock resource' }, { status: 500 })
  }
}
