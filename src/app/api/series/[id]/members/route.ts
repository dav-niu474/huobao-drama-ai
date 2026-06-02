import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerSession } from 'next-auth'

// POST /api/series/[id]/members — Add drama to series
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession()
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const { id: seriesId } = await params
    const body = await req.json()
    const { dramaId, role, order } = body

    if (!dramaId) {
      return NextResponse.json({ error: '缺少dramaId' }, { status: 400 })
    }

    // Verify series exists and user owns it
    const series = await db.series.findUnique({ where: { id: seriesId } })
    if (!series) {
      return NextResponse.json({ error: '系列不存在' }, { status: 404 })
    }

    const user = session.user as any
    if (series.userId !== user.id) {
      return NextResponse.json({ error: '无权限操作此系列' }, { status: 403 })
    }

    // Verify drama exists
    const drama = await db.drama.findUnique({ where: { id: dramaId } })
    if (!drama) {
      return NextResponse.json({ error: '剧集不存在' }, { status: 404 })
    }

    // Check if already a member
    const existing = await db.seriesMember.findUnique({
      where: { seriesId_dramaId: { seriesId, dramaId } },
    })
    if (existing) {
      return NextResponse.json({ error: '该剧集已在此系列中' }, { status: 409 })
    }

    // Get max order
    const maxOrder = await db.seriesMember.findFirst({
      where: { seriesId },
      orderBy: { order: 'desc' },
      select: { order: true },
    })

    const member = await db.seriesMember.create({
      data: {
        seriesId,
        dramaId,
        role: role || 'main',
        order: order ?? (maxOrder ? maxOrder.order + 1 : 0),
      },
    })

    // Also update drama.seriesId
    await db.drama.update({ where: { id: dramaId }, data: { seriesId } })

    return NextResponse.json(member, { status: 201 })
  } catch (error: any) {
    console.error('[SeriesMember] Add failed:', error)
    return NextResponse.json({ error: error.message || '添加剧集到系列失败' }, { status: 500 })
  }
}
