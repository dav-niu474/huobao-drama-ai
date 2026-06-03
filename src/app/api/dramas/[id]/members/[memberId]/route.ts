import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helpers'
import { db } from '@/lib/db'

// Role hierarchy for permission checks
const ROLE_LEVELS: Record<string, number> = { owner: 3, editor: 2, viewer: 1 }

// PATCH /api/dramas/[id]/members/[memberId] — Update member role
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  try {
    const auth = await requireAuth()
    if (auth.error) return auth.error

    const { id: dramaId, memberId } = await params

    // Only owner can change roles
    const drama = await db.drama.findUnique({
      where: { id: dramaId },
      select: { userId: true },
    })

    if (!drama) {
      return NextResponse.json({ error: '项目不存在' }, { status: 404 })
    }

    if (drama.userId !== auth.userId) {
      return NextResponse.json({ error: '只有项目所有者可以修改成员角色' }, { status: 403 })
    }

    const body = await request.json()
    const { role } = body as { role: string }

    const validRoles = ['editor', 'viewer']
    if (!validRoles.includes(role)) {
      return NextResponse.json({ error: '角色必须是 editor 或 viewer' }, { status: 400 })
    }

    // Cannot modify the owner entry
    if (memberId === '__owner__') {
      return NextResponse.json({ error: '不能修改项目所有者角色' }, { status: 400 })
    }

    const member = await db.dramaMember.update({
      where: { id: memberId },
      data: { role },
      include: {
        user: { select: { id: true, name: true, email: true, avatar: true } },
      },
    })

    return NextResponse.json({ member })
  } catch (error) {
    console.error('Failed to update member:', error)
    return NextResponse.json({ error: 'Failed to update member' }, { status: 500 })
  }
}

// DELETE /api/dramas/[id]/members/[memberId] — Remove a member
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  try {
    const auth = await requireAuth()
    if (auth.error) return auth.error

    const { id: dramaId, memberId } = await params

    // Only owner can remove members
    const drama = await db.drama.findUnique({
      where: { id: dramaId },
      select: { userId: true },
    })

    if (!drama) {
      return NextResponse.json({ error: '项目不存在' }, { status: 404 })
    }

    if (drama.userId !== auth.userId) {
      return NextResponse.json({ error: '只有项目所有者可以移除成员' }, { status: 403 })
    }

    if (memberId === '__owner__') {
      return NextResponse.json({ error: '不能移除项目所有者' }, { status: 400 })
    }

    // Set status to removed instead of deleting
    await db.dramaMember.update({
      where: { id: memberId },
      data: { status: 'removed' },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to remove member:', error)
    return NextResponse.json({ error: 'Failed to remove member' }, { status: 500 })
  }
}
