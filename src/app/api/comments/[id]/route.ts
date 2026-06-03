import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helpers'
import { db } from '@/lib/db'

// PATCH /api/comments/[id] — Update comment (resolve/unresolve, edit content)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth()
    if (auth.error) return auth.error

    const { id: commentId } = await params

    const comment = await db.comment.findUnique({
      where: { id: commentId },
      include: { drama: { select: { userId: true } } },
    })

    if (!comment) {
      return NextResponse.json({ error: '评论不存在' }, { status: 404 })
    }

    // Check access: comment author, owner, or editor can update
    const isAuthor = comment.userId === auth.userId
    const isOwner = comment.drama.userId === auth.userId

    if (!isAuthor && !isOwner) {
      // Check if user is an editor
      const membership = await db.dramaMember.findUnique({
        where: { dramaId_userId: { dramaId: comment.dramaId, userId: auth.userId } },
      })
      if (!membership || membership.status !== 'active' || membership.role !== 'editor') {
        return NextResponse.json({ error: '无权修改此评论' }, { status: 403 })
      }
    }

    const body = await request.json()
    const { content, resolved } = body as { content?: string; resolved?: boolean }

    // Only author can edit content; owner/editor can resolve
    const data: any = {}
    if (resolved !== undefined) data.resolved = resolved
    if (content !== undefined) {
      if (!isAuthor) {
        return NextResponse.json({ error: '只有评论作者可以编辑内容' }, { status: 403 })
      }
      data.content = content.trim()
    }

    const updated = await db.comment.update({
      where: { id: commentId },
      data,
      include: {
        user: { select: { name: true, avatar: true } },
      },
    })

    return NextResponse.json({ comment: updated })
  } catch (error) {
    console.error('Failed to update comment:', error)
    return NextResponse.json({ error: 'Failed to update comment' }, { status: 500 })
  }
}

// DELETE /api/comments/[id] — Delete comment
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth()
    if (auth.error) return auth.error

    const { id: commentId } = await params

    const comment = await db.comment.findUnique({
      where: { id: commentId },
      include: { drama: { select: { userId: true } } },
    })

    if (!comment) {
      return NextResponse.json({ error: '评论不存在' }, { status: 404 })
    }

    const isAuthor = comment.userId === auth.userId
    const isOwner = comment.drama.userId === auth.userId

    if (!isAuthor && !isOwner) {
      return NextResponse.json({ error: '无权删除此评论' }, { status: 403 })
    }

    await db.comment.delete({ where: { id: commentId } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete comment:', error)
    return NextResponse.json({ error: 'Failed to delete comment' }, { status: 500 })
  }
}
