import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

// GET /api/marketplace/templates — Browse templates
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category') || ''
    const search = searchParams.get('search') || ''
    const license = searchParams.get('license') || ''
    const sort = searchParams.get('sort') || 'featured' // featured | newest | rating | downloads | free
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const skip = (page - 1) * limit

    const where: any = { published: true }

    if (category) where.category = category
    if (license) where.licenseType = license
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { description: { contains: search } },
      ]
    }

    let orderBy: any = { createdAt: 'desc' }
    if (sort === 'featured') orderBy = [{ featured: 'desc' }, { downloadCount: 'desc' }]
    else if (sort === 'newest') orderBy = { createdAt: 'desc' }
    else if (sort === 'rating') orderBy = { rating: 'desc' }
    else if (sort === 'downloads') orderBy = { downloadCount: 'desc' }
    else if (sort === 'free') { where.licenseType = 'free'; orderBy = { downloadCount: 'desc' } }

    const [templates, total] = await Promise.all([
      db.characterTemplate.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        include: {
          creator: { select: { id: true, name: true, avatar: true } },
          _count: { select: { reviews: true, purchases: true } },
        },
      }),
      db.characterTemplate.count({ where }),
    ])

    return NextResponse.json({ templates, total, page, limit, totalPages: Math.ceil(total / limit) })
  } catch (error) {
    console.error('[marketplace] Error:', error)
    return NextResponse.json({ error: 'Failed to fetch templates' }, { status: 500 })
  }
}

// POST /api/marketplace/templates — Publish template
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await db.user.findUnique({ where: { email: session.user.email } })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const body = await request.json()
    const { name, description, personality, appearance, referenceImages, tags, category, licenseType, price } = body

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    const template = await db.characterTemplate.create({
      data: {
        creatorId: user.id,
        name,
        description: description || '',
        personality: personality || '',
        appearance: appearance || '',
        referenceImages: JSON.stringify(referenceImages || []),
        tags: JSON.stringify(tags || []),
        category: category || '现代',
        licenseType: licenseType || 'free',
        price: price || 0,
      },
    })

    return NextResponse.json({ template }, { status: 201 })
  } catch (error) {
    console.error('[marketplace-publish] Error:', error)
    return NextResponse.json({ error: 'Failed to publish template' }, { status: 500 })
  }
}
