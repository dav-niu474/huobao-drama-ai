import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerSession } from 'next-auth'

// GET /api/budgets/alerts — Get unread alerts
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
      select: { id: true },
    })
    const budgetIds = budgets.map(b => b.id)

    const alerts = await db.budgetAlert.findMany({
      where: { budgetId: { in: budgetIds } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    return NextResponse.json({ alerts })
  } catch (error) {
    console.error('[budget-alerts] Error:', error)
    return NextResponse.json({ error: 'Failed to fetch alerts' }, { status: 500 })
  }
}
