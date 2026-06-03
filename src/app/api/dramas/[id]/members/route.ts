import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helpers'
import { db } from '@/lib/db'

// Role hierarchy for permission checks
const ROLE_LEVELS: Record<string, number> = { owner: 3, editor: 2, viewer: 1 }

/**
 * Helper: require minimum drama access level.
 * Returns { userId, role, member } or an error NextResponse.
 */
async function requireDramaAccess(
  dramaId: string,
  userId: string,
  minRole: 'viewer' | 'editor' | 'owner'
): Promise<{ userId: string; role: string; member: any } | { error: NextResponse }> {
  const drama = await db.drama.findUnique({
    where: { id: dramaId },
    select: { userId: true },
  })

  if (!drama) {
    return { error: NextResponse.json({ error: '项目不存在' }, { status: 404 }) }
  }

  // Drama creator is always owner
  if (drama.userId === userId) {
    return { userId, role: 'owner', member: null }
  }

  // Check membership
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

  return { userId, role: member.role, member }
}

// GET /api/dramas/[id]/members — List all members
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

    const members = await db.dramaMember.findMany({
      where: { dramaId, status: 'active' },
      include: {
        user: { select: { id: true, name: true, email: true, avatar: true } },
      },
      orderBy: { joinedAt: 'asc' },
    })

    // Also include the drama owner as an implicit member
    const drama = await db.drama.findUnique({
      where: { id: dramaId },
      include: { user: { select: { id: true, name: true, email: true, avatar: true } } },
    })

    const ownerEntry = {
      id: '__owner__',
      userId: drama?.userId ?? '',
      role: 'owner',
      status: 'active',
      joinedAt: drama?.createdAt ?? new Date(),
      user: drama?.user ?? { id: '', name: '', email: '', avatar: null },
    }

    // Filter out the owner from members list (they're shown separately)
    const filteredMembers = members.filter((m) => m.userId !== drama?.userId)

    return NextResponse.json({
      members: [ownerEntry, ...filteredMembers],
    })
  } catch (error) {
    console.error('Failed to list members:', error)
    return NextResponse.json({ error: 'Failed to list members' }, { status: 500 })
  }
}

// POST /api/dramas/[id]/members — Invite a member
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
    const { userEmail, role } = body as { userEmail: string; role: string }

    if (!userEmail || !userEmail.trim()) {
      return NextResponse.json({ error: '请输入邮箱地址' }, { status: 400 })
    }

    const validRoles = ['editor', 'viewer']
    if (!validRoles.includes(role)) {
      return NextResponse.json({ error: '角色必须是 editor 或 viewer' }, { status: 400 })
    }

    // Look up user by email
    const targetUser = await db.user.findUnique({
      where: { email: userEmail.trim().toLowerCase() },
    })

    if (!targetUser) {
      return NextResponse.json({ error: '未找到该邮箱对应的用户' }, { status: 404 })
    }

    // Don't invite the owner
    const drama = await db.drama.findUnique({ where: { id: dramaId }, select: { userId: true } })
    if (drama?.userId === targetUser.id) {
      return NextResponse.json({ error: '不能邀请项目所有者' }, { status: 400 })
    }

    // Check existing membership
    const existing = await db.dramaMember.findUnique({
      where: { dramaId_userId: { dramaId, userId: targetUser.id } },
    })

    if (existing && existing.status === 'active') {
      return NextResponse.json({ error: '该用户已是项目成员' }, { status: 400 })
    }

    // Create or reactivate membership
    const member = await db.dramaMember.upsert({
      where: { dramaId_userId: { dramaId, userId: targetUser.id } },
      update: { role, status: 'active', invitedBy: auth.userId, joinedAt: new Date() },
      create: {
        dramaId,
        userId: targetUser.id,
        role,
        invitedBy: auth.userId,
        status: 'active',
      },
      include: {
        user: { select: { id: true, name: true, email: true, avatar: true } },
      },
    })

    return NextResponse.json({ member })
  } catch (error) {
    console.error('Failed to invite member:', error)
    return NextResponse.json({ error: 'Failed to invite member' }, { status: 500 })
  }
}
