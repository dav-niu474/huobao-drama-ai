import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

// GET /api/dramas/[id]/generations?type=image|video|tts&page=1&limit=20&status=&sort=desc|asc|cost_desc|cost_asc
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: dramaId } = await params
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') || 'image'
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const status = searchParams.get('status') || ''
    const sort = searchParams.get('sort') || 'desc'
    const skip = (page - 1) * limit

    // Verify drama exists
    const drama = await db.drama.findUnique({ where: { id: dramaId } })
    if (!drama) {
      return NextResponse.json({ error: 'Drama not found' }, { status: 404 })
    }

    let items: any[] = []
    let total = 0

    const statusFilter = status && status !== 'all' ? { status } : {}

    // Determine sort order
    let orderBy: any
    if (sort === 'cost_desc') {
      orderBy = { costCredits: 'desc' }
    } else if (sort === 'cost_asc') {
      orderBy = { costCredits: 'asc' }
    } else {
      orderBy = { createdAt: sort === 'asc' ? 'asc' : 'desc' }
    }

    if (type === 'image') {
      total = await db.imageGeneration.count({
        where: { dramaId, ...statusFilter },
      })
      items = await db.imageGeneration.findMany({
        where: { dramaId, ...statusFilter },
        orderBy,
        skip,
        take: limit,
      })
    } else if (type === 'video') {
      total = await db.videoGeneration.count({
        where: { dramaId, ...statusFilter },
      })
      items = await db.videoGeneration.findMany({
        where: { dramaId, ...statusFilter },
        orderBy,
        skip,
        take: limit,
      })
    } else if (type === 'tts') {
      total = await db.ttsGeneration.count({
        where: { dramaId, ...statusFilter },
      })
      items = await db.ttsGeneration.findMany({
        where: { dramaId, ...statusFilter },
        orderBy,
        skip,
        take: limit,
      })
    }

    return NextResponse.json({
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    })
  } catch (error) {
    console.error('[generations] Error:', error)
    return NextResponse.json({ error: 'Failed to fetch generations' }, { status: 500 })
  }
}
