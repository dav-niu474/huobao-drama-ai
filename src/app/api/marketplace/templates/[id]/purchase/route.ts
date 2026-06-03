import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

// POST /api/marketplace/templates/[id]/purchase
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const user = await db.user.findUnique({ where: { email: session.user.email } })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const template = await db.characterTemplate.findUnique({ where: { id } })
    if (!template || !template.published) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }

    // Check if already purchased
    const existing = await db.templatePurchase.findUnique({
      where: { templateId_buyerId: { templateId: id, buyerId: user.id } },
    })
    if (existing) {
      return NextResponse.json({ error: 'Already purchased', purchase: existing }, { status: 400 })
    }

    // Free templates are auto-acquired
    if (template.licenseType === 'free' || template.price === 0) {
      const purchase = await db.templatePurchase.create({
        data: {
          templateId: id,
          buyerId: user.id,
          price: 0,
          licenseType: 'free',
        },
      })

      // Increment download count
      await db.characterTemplate.update({
        where: { id },
        data: { downloadCount: { increment: 1 } },
      })

      return NextResponse.json({ purchase }, { status: 201 })
    }

    // For paid templates, create purchase record (in real app, process payment first)
    const purchase = await db.templatePurchase.create({
      data: {
        templateId: id,
        buyerId: user.id,
        price: template.price,
        licenseType: template.licenseType,
      },
    })

    await db.characterTemplate.update({
      where: { id },
      data: { downloadCount: { increment: 1 } },
    })

    return NextResponse.json({ purchase }, { status: 201 })
  } catch (error) {
    console.error('[template-purchase] Error:', error)
    return NextResponse.json({ error: 'Failed to purchase template' }, { status: 500 })
  }
}
