import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

// GET /api/marketplace/my-purchases
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await db.user.findUnique({ where: { email: session.user.email } })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const purchases = await db.templatePurchase.findMany({
      where: { buyerId: user.id },
      include: {
        template: {
          include: {
            creator: { select: { id: true, name: true, avatar: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ purchases })
  } catch (error) {
    console.error('[my-purchases] Error:', error)
    return NextResponse.json({ error: 'Failed to fetch purchases' }, { status: 500 })
  }
}
