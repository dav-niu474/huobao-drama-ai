// ============================================================
// Assets — Art Style Filter
// GET /api/assets/art-style-filter?artStyle=<key>
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const userId = (session.user as any).id
    const { searchParams } = new URL(req.url)
    const artStyle = searchParams.get('artStyle')

    if (!artStyle) {
      return NextResponse.json({ error: 'artStyle 参数为必填项' }, { status: 400 })
    }

    // Find assets where data JSON contains the art style reference
    const assets = await db.asset.findMany({
      where: {
        OR: [{ userId }, { isPublic: true }],
        data: { contains: artStyle },
      },
      orderBy: [{ usageCount: 'desc' }, { updatedAt: 'desc' }],
      include: {
        user: { select: { id: true, name: true } },
      },
    })

    return NextResponse.json({ assets, total: assets.length })
  } catch (error: any) {
    console.error('[assets/art-style-filter] GET error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
