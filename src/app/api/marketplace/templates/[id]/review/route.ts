import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerSession } from 'next-auth'

// POST /api/marketplace/templates/[id]/review
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession()
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const user = await db.user.findUnique({ where: { email: session.user.email } })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const body = await request.json()
    const { rating, comment } = body

    if (!rating || rating < 1 || rating > 5) {
      return NextResponse.json({ error: 'Rating must be between 1 and 5' }, { status: 400 })
    }

    // Check if already reviewed
    const existing = await db.templateReview.findUnique({
      where: { templateId_userId: { templateId: id, userId: user.id } },
    })
    if (existing) {
      return NextResponse.json({ error: 'Already reviewed' }, { status: 400 })
    }

    const review = await db.templateReview.create({
      data: {
        templateId: id,
        userId: user.id,
        rating,
        comment: comment || '',
      },
    })

    // Recalculate average rating
    const reviews = await db.templateReview.findMany({ where: { templateId: id } })
    const avgRating = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
    await db.characterTemplate.update({
      where: { id },
      data: { rating: Math.round(avgRating * 10) / 10 },
    })

    return NextResponse.json({ review }, { status: 201 })
  } catch (error) {
    console.error('[template-review] Error:', error)
    return NextResponse.json({ error: 'Failed to add review' }, { status: 500 })
  }
}
