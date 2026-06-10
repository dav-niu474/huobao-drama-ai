// ============================================================
// Assets — Batch Operations
// POST /api/assets/batch  { action: 'delete'|'export', ids: string[] }
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const userId = (session.user as any).id
    const body = await req.json()
    const { action, ids } = body

    if (!action || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'action 和 ids 为必填项' }, { status: 400 })
    }

    if (ids.length > 100) {
      return NextResponse.json({ error: '单次操作最多100个资产' }, { status: 400 })
    }

    if (action === 'delete') {
      // Only delete own assets
      const assets = await db.asset.findMany({
        where: { id: { in: ids }, userId },
      })

      // Unlink references
      for (const asset of assets) {
        await db.character.updateMany({ where: { assetId: asset.id }, data: { assetId: null } })
        await db.scene.updateMany({ where: { assetId: asset.id }, data: { assetId: null } })
        await db.prop.updateMany({ where: { assetId: asset.id }, data: { assetId: null } })
      }

      const result = await db.asset.deleteMany({
        where: { id: { in: ids }, userId },
      })

      return NextResponse.json({ success: true, affected: result.count })
    }

    if (action === 'export') {
      const assets = await db.asset.findMany({
        where: {
          id: { in: ids },
          OR: [{ userId }, { isPublic: true }],
        },
        include: {
          user: { select: { id: true, name: true } },
        },
      })

      return NextResponse.json({ success: true, affected: assets.length, assets })
    }

    return NextResponse.json({ error: '不支持的操作类型' }, { status: 400 })
  } catch (error: any) {
    console.error('[assets/batch] POST error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
