import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerSession } from 'next-auth'

// DELETE /api/series/[id]/members/[dramaId] — Remove drama from series
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; dramaId: string }> }
) {
  try {
    const session = await getServerSession()
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const { id: seriesId, dramaId } = await params

    // Verify series exists and user owns it
    const series = await db.series.findUnique({ where: { id: seriesId } })
    if (!series) {
      return NextResponse.json({ error: '系列不存在' }, { status: 404 })
    }

    const user = session.user as any
    if (series.userId !== user.id) {
      return NextResponse.json({ error: '无权限操作此系列' }, { status: 403 })
    }

    // Delete the member
    await db.seriesMember.deleteMany({
      where: { seriesId, dramaId },
    })

    // Check if this drama still has any series member entries
    const remainingMembers = await db.seriesMember.findFirst({
      where: { dramaId, seriesId },
    })

    if (!remainingMembers) {
      // Clear seriesId on drama if it was pointing to this series
      const drama = await db.drama.findUnique({ where: { id: dramaId } })
      if (drama && drama.seriesId === seriesId) {
        await db.drama.update({ where: { id: dramaId }, data: { seriesId: null } })
      }
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[SeriesMember] Remove failed:', error)
    return NextResponse.json({ error: error.message || '从系列中移除剧集失败' }, { status: 500 })
  }
}
