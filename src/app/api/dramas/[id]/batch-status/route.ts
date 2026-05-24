import { NextRequest, NextResponse } from 'next/server'
import { batchPipelineManager } from '@/lib/batch-pipeline'
import { requireAuth } from '@/lib/auth-helpers'

// GET /api/dramas/[id]/batch-status — Get batch pipeline status
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth()
    if (auth.error) return auth.error

    const { id: dramaId } = await params

    const status = batchPipelineManager.getStatusResponse(dramaId)
    if (!status) {
      return NextResponse.json(
        { error: 'No batch pipeline found for this drama' },
        { status: 404 }
      )
    }

    return NextResponse.json(status)
  } catch (error) {
    console.error('[batch-status] GET failed:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
