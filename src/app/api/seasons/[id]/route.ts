import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

// Helper: check if user can access this season's drama
async function checkSeasonAccess(id: string, session: any) {
  const userId = (session.user as any).id
  const role = (session.user as any).role

  const season = await db.season.findUnique({
    where: { id },
    select: { dramaId: true },
  })
  if (!season) return { error: null, notFound: true }

  const drama = await db.drama.findUnique({
    where: { id: season.dramaId },
    select: { userId: true },
  })
  if (!drama) return { error: null, notFound: true }
  if (role !== 'admin' && drama.userId && drama.userId !== userId) {
    return { error: '无权访问此项目', forbidden: true }
  }
  return { error: null, notFound: false, forbidden: false, dramaId: season.dramaId }
}

// GET /api/seasons/[id] — Get season with its episodes
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const { id } = await params
    const access = await checkSeasonAccess(id, session)
    if (access.notFound) return NextResponse.json({ error: 'Season not found' }, { status: 404 })
    if (access.forbidden) return NextResponse.json({ error: access.error }, { status: 403 })

    const season = await db.season.findUnique({
      where: { id },
      include: {
        episodes: { orderBy: { episodeNumber: 'asc' } },
      },
    })

    if (!season) {
      return NextResponse.json({ error: 'Season not found' }, { status: 404 })
    }

    return NextResponse.json(season)
  } catch (error) {
    console.error('Failed to get season:', error)
    return NextResponse.json({ error: 'Failed to get season' }, { status: 500 })
  }
}

// PATCH /api/seasons/[id] — Update season
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const { id } = await params
    const access = await checkSeasonAccess(id, session)
    if (access.notFound) return NextResponse.json({ error: 'Season not found' }, { status: 404 })
    if (access.forbidden) return NextResponse.json({ error: access.error }, { status: 403 })

    const body = await request.json()
    const allowedFields = ['title', 'description', 'status', 'sortOrder', 'seasonNumber']
    const data: Record<string, unknown> = {}
    for (const field of allowedFields) {
      if (field in body) data[field] = body[field]
    }

    const season = await db.season.update({
      where: { id },
      data,
      include: { _count: { select: { episodes: true } } },
    })

    return NextResponse.json(season)
  } catch (error) {
    console.error('Failed to update season:', error)
    return NextResponse.json({ error: 'Failed to update season' }, { status: 500 })
  }
}

// DELETE /api/seasons/[id] — Delete season
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const { id } = await params
    const access = await checkSeasonAccess(id, session)
    if (access.notFound) return NextResponse.json({ error: 'Season not found' }, { status: 404 })
    if (access.forbidden) return NextResponse.json({ error: access.error }, { status: 403 })

    const body = await request.json().catch(() => ({}))
    const reassignTo = body.reassignTo as string | undefined // season ID to reassign episodes to

    // Get episodes in this season
    const episodes = await db.episode.findMany({
      where: { seasonId: id },
      select: { id: true },
    })

    if (episodes.length > 0) {
      if (reassignTo) {
        // Reassign episodes to another season
        await db.episode.updateMany({
          where: { seasonId: id },
          data: { seasonId: reassignTo },
        })
      } else {
        // Unassign episodes (set seasonId to null)
        await db.episode.updateMany({
          where: { seasonId: id },
          data: { seasonId: null },
        })
      }
    }

    await db.season.delete({ where: { id } })

    return NextResponse.json({ success: true, reassignedEpisodes: episodes.length })
  } catch (error) {
    console.error('Failed to delete season:', error)
    return NextResponse.json({ error: 'Failed to delete season' }, { status: 500 })
  }
}
