// ============================================================
// GET /api/dramas/[id]/extract-status
// Get extraction progress for a drama
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helpers'
import { db } from '@/lib/db'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth()
    if (auth.error) return auth.error

    const { id: dramaId } = await params

    // Validate drama exists and user has access
    const drama = await db.drama.findUnique({
      where: { id: dramaId },
      select: { userId: true, assetStatus: true, updatedAt: true },
    })
    if (!drama) {
      return NextResponse.json({ error: 'Drama 不存在' }, { status: 404 })
    }
    if (drama.userId && drama.userId !== auth.userId && auth.role !== 'admin') {
      return NextResponse.json({ error: '无权访问此项目' }, { status: 403 })
    }

    // Count assets
    const [totalCharacters, totalScenes, totalProps] = await Promise.all([
      db.character.count({ where: { dramaId } }),
      db.scene.count({ where: { dramaId } }),
      db.prop.count({ where: { dramaId } }),
    ])

    return NextResponse.json({
      assetStatus: drama.assetStatus,
      totalCharacters,
      totalScenes,
      totalProps,
      lastExtractionAt: drama.updatedAt.toISOString(),
    })
  } catch (error) {
    console.error('[extract-status] Failed:', error)
    return NextResponse.json(
      {
        error: `获取提取状态失败: ${
          error instanceof Error ? error.message : String(error)
        }`,
      },
      { status: 500 }
    )
  }
}
