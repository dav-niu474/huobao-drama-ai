import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { requireAuth } from '@/lib/auth-helpers'

// GET /api/generations/[id]?type=image|video|tts
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') || 'image'

    let item: any = null

    if (type === 'image') {
      item = await db.imageGeneration.findUnique({ where: { id } })
    } else if (type === 'video') {
      item = await db.videoGeneration.findUnique({ where: { id } })
    } else if (type === 'tts') {
      item = await db.ttsGeneration.findUnique({ where: { id } })
    }

    if (!item) {
      return NextResponse.json({ error: 'Generation not found' }, { status: 404 })
    }

    return NextResponse.json({ item })
  } catch (error) {
    console.error('[generation-detail] Error:', error)
    return NextResponse.json({ error: 'Failed to fetch generation' }, { status: 500 })
  }
}

// DELETE /api/generations/[id]?type=image|video|tts
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth()
    if (auth.error) return auth.error

    const { id } = await params
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') || 'image'

    // Fetch the record first to verify ownership before deleting.
    // Supports image / video / tts generation tables.
    let item: { id: string; userId?: string | null } | null = null
    if (type === 'image') {
      item = await db.imageGeneration.findUnique({ where: { id } })
    } else if (type === 'video') {
      item = await db.videoGeneration.findUnique({ where: { id } })
    } else if (type === 'tts') {
      item = await db.ttsGeneration.findUnique({ where: { id } })
    }

    if (!item) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    // Ownership check — only the creator (or records without a userId) can delete.
    if (item.userId && item.userId !== auth.userId) {
      return NextResponse.json({ error: '无权删除此记录' }, { status: 403 })
    }

    if (type === 'image') {
      await db.imageGeneration.delete({ where: { id } })
    } else if (type === 'video') {
      await db.videoGeneration.delete({ where: { id } })
    } else if (type === 'tts') {
      await db.ttsGeneration.delete({ where: { id } })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[generation-delete] Error:', error)
    return NextResponse.json({ error: 'Failed to delete generation' }, { status: 500 })
  }
}
