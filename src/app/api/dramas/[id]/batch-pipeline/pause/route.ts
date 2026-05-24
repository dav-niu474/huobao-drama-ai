import { NextRequest, NextResponse } from 'next/server'
import { batchPipelineManager } from '@/lib/batch-pipeline'
import { requireAuth } from '@/lib/auth-helpers'

// POST /api/dramas/[id]/batch-pipeline/pause — Pause batch execution
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth()
    if (auth.error) return auth.error

    const { id: dramaId } = await params

    await batchPipelineManager.pauseBatch(dramaId)

    return NextResponse.json({ status: 'paused' })
  } catch (error) {
    console.error('[batch-pipeline/pause] POST failed:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
