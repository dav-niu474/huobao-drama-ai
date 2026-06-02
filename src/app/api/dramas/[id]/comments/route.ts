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

// GET /api/dramas/[id]/comments — List comments
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
    const episodeId = searchParams.get('episodeId') ?? undefined
    const storyboardId = searchParams.get('storyboardId') ?? undefined

    const where: any = { dramaId }
    if (episodeId) where.episodeId = episodeId
    if (storyboardId) where.storyboardId = storyboardId

    const comments = await db.comment.findMany({
      where,
      include: {
        user: { select: { name: true, avatar: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ comments })
  } catch (error) {
    console.error('Failed to list comments:', error)
    return NextResponse.json({ error: 'Failed to list comments' }, { status: 500 })
  }
}

// POST /api/dramas/[id]/comments — Add a comment (with thread/position/mention support)
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

    const body = await request.json()
    const { content, episodeId, storyboardId, parentId, position, mentions } = body as {
      content: string
      episodeId?: string
      storyboardId?: string
      parentId?: string
      position?: string     // JSON: { x: 0.5, y: 0.3 }
      mentions?: string     // JSON: ["userId1", "userId2"]
    }

    if (!content || !content.trim()) {
      return NextResponse.json({ error: '评论内容不能为空' }, { status: 400 })
    }

    // Validate parentId if provided
    if (parentId) {
      const parent = await db.comment.findUnique({ where: { id: parentId } })
      if (!parent || parent.dramaId !== dramaId) {
        return NextResponse.json({ error: '父评论不存在' }, { status: 400 })
      }
    }

    const comment = await db.comment.create({
      data: {
        dramaId,
        userId: auth.userId,
        content: content.trim(),
        episodeId: episodeId || null,
        storyboardId: storyboardId || null,
        parentId: parentId || null,
        position: position || null,
        mentions: mentions || '[]',
      },
      include: {
        user: { select: { name: true, avatar: true } },
      },
    })

    // Log activity
    const activityType = parentId ? 'comment_reply' : 'comment_add'
    const description = parentId ? '回复了评论' : '添加了评论'
    await db.activity.create({
      data: {
        userId: auth.userId,
        dramaId,
        episodeId: episodeId || null,
        type: activityType,
        description,
        metadata: JSON.stringify({ commentId: comment.id, contentPreview: content.trim().slice(0, 50) }),
      },
    })

    return NextResponse.json({ comment })
  } catch (error) {
    console.error('Failed to add comment:', error)
    return NextResponse.json({ error: 'Failed to add comment' }, { status: 500 })
  }
}
