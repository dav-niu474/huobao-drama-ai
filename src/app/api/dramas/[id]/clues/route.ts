// ============================================================
// GET /api/dramas/[id]/clues — List all clues for a drama
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helpers'
import { db } from '@/lib/db'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const { id: dramaId } = await params

  // Validate access
  const drama = await db.drama.findUnique({
    where: { id: dramaId },
    select: { userId: true },
  })

  if (!drama) {
    return NextResponse.json({ error: 'Drama 不存在' }, { status: 404 })
  }
  if (drama.userId && drama.userId !== auth.userId && auth.role !== 'admin') {
    return NextResponse.json({ error: '无权访问此项目' }, { status: 403 })
  }

  const clues = await db.clue.findMany({
    where: { dramaId },
    orderBy: { createdAt: 'asc' },
  })

  return NextResponse.json({ clues })
}
