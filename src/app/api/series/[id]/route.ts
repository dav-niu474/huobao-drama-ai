import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerSession } from 'next-auth'

// GET /api/series/[id] — Get series with member dramas
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession()
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const { id } = await params
    const series = await db.series.findUnique({
      where: { id },
      include: {
        members: {
          include: {
            drama: {
              select: {
                id: true, title: true, coverImage: true, genre: true, style: true,
                status: true, totalEpisodes: true,
                _count: { select: { episodes: true, characters: true, scenes: true } },
              },
            },
          },
          orderBy: { order: 'asc' },
        },
        dramas: {
          select: { id: true, title: true },
        },
      },
    })

    if (!series) {
      return NextResponse.json({ error: '系列不存在' }, { status: 404 })
    }

    return NextResponse.json(series)
  } catch (error: any) {
    console.error('[Series] Get failed:', error)
    return NextResponse.json({ error: error.message || '获取系列详情失败' }, { status: 500 })
  }
}

// PATCH /api/series/[id] — Update series
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession()
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const { id } = await params
    const body = await req.json()
    const { title, description, coverImage, worldBuildingDoc } = body

    const existing = await db.series.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: '系列不存在' }, { status: 404 })
    }

    const user = session.user as any
    if (existing.userId !== user.id) {
      return NextResponse.json({ error: '无权限编辑此系列' }, { status: 403 })
    }

    const series = await db.series.update({
      where: { id },
      data: {
        ...(title !== undefined && { title: title.trim() }),
        ...(description !== undefined && { description }),
        ...(coverImage !== undefined && { coverImage }),
        ...(worldBuildingDoc !== undefined && { worldBuildingDoc }),
      },
    })

    return NextResponse.json(series)
  } catch (error: any) {
    console.error('[Series] Update failed:', error)
    return NextResponse.json({ error: error.message || '更新系列失败' }, { status: 500 })
  }
}

// DELETE /api/series/[id] — Delete series
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession()
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const { id } = await params
    const existing = await db.series.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: '系列不存在' }, { status: 404 })
    }

    const user = session.user as any
    if (existing.userId !== user.id) {
      return NextResponse.json({ error: '无权限删除此系列' }, { status: 403 })
    }

    // Delete members first, then series
    await db.seriesMember.deleteMany({ where: { seriesId: id } })
    // Clear seriesId on dramas
    await db.drama.updateMany({ where: { seriesId: id }, data: { seriesId: null } })
    await db.series.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[Series] Delete failed:', error)
    return NextResponse.json({ error: error.message || '删除系列失败' }, { status: 500 })
  }
}
