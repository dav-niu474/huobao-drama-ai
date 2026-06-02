import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerSession } from 'next-auth'

// GET /api/generations/[id]?type=image|video|tts
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession()
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
    const session = await getServerSession()
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') || 'image'

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
