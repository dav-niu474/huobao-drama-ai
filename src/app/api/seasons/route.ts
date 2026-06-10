import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

// GET /api/seasons?dramaId=xxx — List seasons by dramaId
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const dramaId = searchParams.get('dramaId')
    if (!dramaId) {
      return NextResponse.json({ error: 'dramaId is required' }, { status: 400 })
    }

    // Check access
    const userId = (session.user as any).id
    const role = (session.user as any).role
    const drama = await db.drama.findUnique({ where: { id: dramaId }, select: { userId: true } })
    if (!drama) return NextResponse.json({ error: 'Drama not found' }, { status: 404 })
    if (role !== 'admin' && drama.userId && drama.userId !== userId) {
      return NextResponse.json({ error: '无权访问此项目' }, { status: 403 })
    }

    const seasons = await db.season.findMany({
      where: { dramaId },
      orderBy: { sortOrder: 'asc' },
      include: { _count: { select: { episodes: true } } },
    })

    return NextResponse.json({ seasons })
  } catch (error) {
    console.error('Failed to list seasons:', error)
    return NextResponse.json({ error: 'Failed to list seasons' }, { status: 500 })
  }
}

// POST /api/seasons — Create a new season with auto-increment seasonNumber
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const body = await request.json()
    const { dramaId, title, description } = body
    if (!dramaId) {
      return NextResponse.json({ error: 'dramaId is required' }, { status: 400 })
    }

    // Check access
    const userId = (session.user as any).id
    const role = (session.user as any).role
    const drama = await db.drama.findUnique({ where: { id: dramaId }, select: { userId: true } })
    if (!drama) return NextResponse.json({ error: 'Drama not found' }, { status: 404 })
    if (role !== 'admin' && drama.userId && drama.userId !== userId) {
      return NextResponse.json({ error: '无权访问此项目' }, { status: 403 })
    }

    // Auto-increment seasonNumber
    const maxSeason = await db.season.findFirst({
      where: { dramaId },
      orderBy: { seasonNumber: 'desc' },
      select: { seasonNumber: true },
    })
    const seasonNumber = (maxSeason?.seasonNumber ?? 0) + 1

    // Auto-increment sortOrder
    const maxSort = await db.season.findFirst({
      where: { dramaId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    })
    const sortOrder = (maxSort?.sortOrder ?? -1) + 1

    const season = await db.season.create({
      data: {
        dramaId,
        seasonNumber,
        title: title || `Season ${seasonNumber}`,
        description: description || null,
        sortOrder,
      },
      include: { _count: { select: { episodes: true } } },
    })

    return NextResponse.json(season, { status: 201 })
  } catch (error) {
    console.error('Failed to create season:', error)
    return NextResponse.json({ error: 'Failed to create season' }, { status: 500 })
  }
}
