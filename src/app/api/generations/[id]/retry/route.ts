import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

// POST /api/generations/[id]/retry?type=image|video|tts
export async function POST(
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

    // Reset the generation to pending status
    if (type === 'image') {
      const gen = await db.imageGeneration.findUnique({ where: { id } })
      if (!gen) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      if (gen.status !== 'failed') return NextResponse.json({ error: 'Only failed generations can be retried' }, { status: 400 })
      await db.imageGeneration.update({
        where: { id },
        data: { status: 'pending', errorMsg: null, taskId: null },
      })
    } else if (type === 'video') {
      const gen = await db.videoGeneration.findUnique({ where: { id } })
      if (!gen) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      if (gen.status !== 'failed') return NextResponse.json({ error: 'Only failed generations can be retried' }, { status: 400 })
      await db.videoGeneration.update({
        where: { id },
        data: { status: 'pending', errorMsg: null, taskId: null },
      })
    } else if (type === 'tts') {
      const gen = await db.ttsGeneration.findUnique({ where: { id } })
      if (!gen) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      if (gen.status !== 'failed') return NextResponse.json({ error: 'Only failed generations can be retried' }, { status: 400 })
      await db.ttsGeneration.update({
        where: { id },
        data: { status: 'pending', errorMsg: null, taskId: null },
      })
    }

    return NextResponse.json({ success: true, message: 'Generation queued for retry' })
  } catch (error) {
    console.error('[generation-retry] Error:', error)
    return NextResponse.json({ error: 'Failed to retry generation' }, { status: 500 })
  }
}
