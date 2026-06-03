import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

// GET /api/marketplace/templates/[id] — Template detail
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const template = await db.characterTemplate.findUnique({
      where: { id },
      include: {
        creator: { select: { id: true, name: true, avatar: true } },
        reviews: {
          include: { user: { select: { id: true, name: true, avatar: true } } },
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
        _count: { select: { purchases: true, reviews: true } },
      },
    })

    if (!template || !template.published) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }

    return NextResponse.json({ template })
  } catch (error) {
    console.error('[template-detail] Error:', error)
    return NextResponse.json({ error: 'Failed to fetch template' }, { status: 500 })
  }
}

// PATCH /api/marketplace/templates/[id] — Update template
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

    const template = await db.characterTemplate.findUnique({ where: { id } })
    if (!template) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const user = await db.user.findUnique({ where: { email: session.user.email } })
    if (!user || (template.creatorId !== user.id && user.role !== 'admin')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const updated = await db.characterTemplate.update({
      where: { id },
      data: {
        ...(body.name && { name: body.name }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.personality !== undefined && { personality: body.personality }),
        ...(body.appearance !== undefined && { appearance: body.appearance }),
        ...(body.referenceImages && { referenceImages: JSON.stringify(body.referenceImages) }),
        ...(body.tags && { tags: JSON.stringify(body.tags) }),
        ...(body.category && { category: body.category }),
        ...(body.licenseType && { licenseType: body.licenseType }),
        ...(body.price !== undefined && { price: body.price }),
        ...(body.featured !== undefined && { featured: body.featured }),
      },
    })

    return NextResponse.json({ template: updated })
  } catch (error) {
    console.error('[template-update] Error:', error)
    return NextResponse.json({ error: 'Failed to update template' }, { status: 500 })
  }
}

// DELETE /api/marketplace/templates/[id] — Unpublish template
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
    const template = await db.characterTemplate.findUnique({ where: { id } })
    if (!template) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const user = await db.user.findUnique({ where: { email: session.user.email } })
    if (!user || (template.creatorId !== user.id && user.role !== 'admin')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    await db.characterTemplate.update({
      where: { id },
      data: { published: false },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[template-delete] Error:', error)
    return NextResponse.json({ error: 'Failed to unpublish template' }, { status: 500 })
  }
}
