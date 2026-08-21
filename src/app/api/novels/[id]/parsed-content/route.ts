import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helpers'
import { db } from '@/lib/db'

// PATCH /api/novels/[id]/parsed-content
// Body: { key: 'skeleton' | 'strategy' | 'events', value: string | object }
//
// Merges a single field into the novel's parsedContent JSON blob.
// Used by the script workbench to persist user edits to the generated
// skeleton / strategy / events table.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const { id } = await params
  const body = await request.json().catch(() => null)
  if (!body || !body.key || body.value === undefined) {
    return NextResponse.json(
      { error: '缺少 key 或 value 参数' },
      { status: 400 }
    )
  }

  const novel = await db.novel.findUnique({
    where: { id },
    include: { drama: { select: { userId: true } } },
  })

  if (!novel) {
    return NextResponse.json({ error: 'Novel not found' }, { status: 404 })
  }
  if (
    novel.drama.userId &&
    novel.drama.userId !== auth.userId &&
    auth.role !== 'admin'
  ) {
    return NextResponse.json({ error: '无权访问' }, { status: 403 })
  }

  // Merge into parsedContent JSON
  let parsed: Record<string, unknown> = {}
  try {
    parsed = JSON.parse(novel.parsedContent || '{}')
  } catch {
    parsed = {}
  }
  parsed[body.key] = body.value
  if (body.key === 'skeleton') parsed.skeletonUpdatedAt = new Date().toISOString()
  if (body.key === 'strategy') parsed.strategyUpdatedAt = new Date().toISOString()

  await db.novel.update({
    where: { id },
    data: { parsedContent: JSON.stringify(parsed) },
  })

  return NextResponse.json({ success: true, key: body.key })
}
