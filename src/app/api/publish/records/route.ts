import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

// GET /api/publish/records — List publish records
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const dramaId = searchParams.get('dramaId') || ''

    const user = await db.user.findUnique({ where: { email: session.user.email } })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    // Get user's dramas
    const dramas = await db.drama.findMany({
      where: { userId: user.id },
      select: { id: true },
    })
    const dramaIds = dramas.map(d => d.id)

    const where: any = { dramaId: { in: dramaIds } }
    if (dramaId) where.dramaId = dramaId

    const records = await db.publishRecord.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    return NextResponse.json({ records })
  } catch (error) {
    console.error('[publish-records] Error:', error)
    return NextResponse.json({ error: 'Failed to fetch records' }, { status: 500 })
  }
}
