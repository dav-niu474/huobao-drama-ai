import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerSession } from 'next-auth'

// GET /api/budgets — List user's budgets
export async function GET() {
  try {
    const session = await getServerSession()
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await db.user.findUnique({ where: { email: session.user.email } })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const budgets = await db.budget.findMany({
      where: { userId: user.id },
      include: { alerts: { orderBy: { createdAt: 'desc' } } },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ budgets })
  } catch (error) {
    console.error('[budgets] Error:', error)
    return NextResponse.json({ error: 'Failed to fetch budgets' }, { status: 500 })
  }
}

// POST /api/budgets — Create budget
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await db.user.findUnique({ where: { email: session.user.email } })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const body = await request.json()
    const { period, limit, alertThreshold, enabled } = body

    const budget = await db.budget.create({
      data: {
        userId: user.id,
        period: period || 'monthly',
        limit: limit || 1000,
        alertThreshold: alertThreshold || 80,
        enabled: enabled !== false,
      },
    })

    return NextResponse.json({ budget }, { status: 201 })
  } catch (error) {
    console.error('[budgets] Error:', error)
    return NextResponse.json({ error: 'Failed to create budget' }, { status: 500 })
  }
}
