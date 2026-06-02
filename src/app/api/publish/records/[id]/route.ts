import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerSession } from 'next-auth'

// GET /api/publish/records/[id] — Get record status
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

    const record = await db.publishRecord.findUnique({ where: { id } })
    if (!record) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    return NextResponse.json({ record })
  } catch (error) {
    console.error('[publish-record-detail] Error:', error)
    return NextResponse.json({ error: 'Failed to fetch record' }, { status: 500 })
  }
}
