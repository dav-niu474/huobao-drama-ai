import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

// POST /api/series — Create a new series
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const body = await req.json()
    const { title, description, coverImage, worldBuildingDoc } = body

    if (!title?.trim()) {
      return NextResponse.json({ error: '系列名称不能为空' }, { status: 400 })
    }

    const user = session.user as any
    const series = await db.series.create({
      data: {
        title: title.trim(),
        description: description || '',
        coverImage: coverImage || null,
        worldBuildingDoc: worldBuildingDoc || '',
        userId: user.id,
      },
    })

    return NextResponse.json(series, { status: 201 })
  } catch (error: any) {
    console.error('[Series] Create failed:', error)
    return NextResponse.json({ error: error.message || '创建系列失败' }, { status: 500 })
  }
}

// GET /api/series — List user's series
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const user = session.user as any
    const seriesList = await db.series.findMany({
      where: { userId: user.id },
      include: {
        members: {
          include: {
            drama: {
              select: { id: true, title: true, coverImage: true, genre: true, status: true },
            },
          },
          orderBy: { order: 'asc' },
        },
        dramas: {
          select: { id: true, title: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
    })

    return NextResponse.json(seriesList)
  } catch (error: any) {
    console.error('[Series] List failed:', error)
    return NextResponse.json({ error: error.message || '获取系列列表失败' }, { status: 500 })
  }
}
