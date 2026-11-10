import { NextRequest, NextResponse } from 'next/server'
import { batchPipelineManager } from '@/lib/batch-pipeline'
import { requireAuth } from '@/lib/auth-helpers'

// POST /api/dramas/[id]/batch-pipeline — Start batch pipeline execution
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth()
    if (auth.error) return auth.error

    const { id: dramaId } = await params

    let body: { episodeIds?: string[]; steps?: string[] } = {}
    try {
      body = await request.json()
    } catch {
      // No body — use defaults
    }

    // 转发发起者的会话 Cookie：批次在后台执行，原始请求上下文已丢失，
    // 内部生成 API（requireAuth）需要该 Cookie 才能通过鉴权（修复制作步骤 401）
    const authCookie = request.cookies.toString()

    const batchState = await batchPipelineManager.startBatch(
      dramaId,
      body.episodeIds,
      body.steps,
      { authCookie: authCookie || undefined }
    )

    return NextResponse.json({
      batchId: batchState.dramaId,
      totalEpisodes: batchState.totalEpisodes,
      status: batchState.status,
    })
  } catch (error) {
    console.error('[batch-pipeline] POST failed:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
