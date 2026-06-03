import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

// PATCH /api/budgets/[id] — Update budget
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const body = await request.json()

    const budget = await db.budget.update({
      where: { id },
      data: {
        ...(body.period && { period: body.period }),
        ...(body.limit !== undefined && { limit: body.limit }),
        ...(body.alertThreshold !== undefined && { alertThreshold: body.alertThreshold }),
        ...(body.enabled !== undefined && { enabled: body.enabled }),
      },
    })

    return NextResponse.json({ budget })
  } catch (error) {
    console.error('[budget-update] Error:', error)
    return NextResponse.json({ error: 'Failed to update budget' }, { status: 500 })
  }
}

// DELETE /api/budgets/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    await db.budget.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[budget-delete] Error:', error)
    return NextResponse.json({ error: 'Failed to delete budget' }, { status: 500 })
  }
}
