import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerSession } from 'next-auth'

// PATCH /api/budgets/alerts/[id]/read — Mark alert as read
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession()
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const alert = await db.budgetAlert.update({
      where: { id },
      data: { read: true },
    })

    return NextResponse.json({ alert })
  } catch (error) {
    console.error('[alert-read] Error:', error)
    return NextResponse.json({ error: 'Failed to mark alert as read' }, { status: 500 })
  }
}
