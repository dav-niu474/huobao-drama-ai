// ============================================================
// Queue Task API — GET task status, PATCH update task
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { getGenerationQueue } from '@/lib/queue/generation-queue'

const queue = getGenerationQueue()

// GET /api/queue/[id] — Get task status
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const task = queue.getTask(id)

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    return NextResponse.json({ task })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// PATCH /api/queue/[id] — Update task (retry, cancel)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const action = body.action

    if (!action) {
      return NextResponse.json(
        { error: 'Missing action field. Use: retry, cancel, start, complete, fail' },
        { status: 400 }
      )
    }

    switch (action) {
      case 'retry': {
        const retried = queue.retryFromDLQ(id)
        if (!retried) {
          return NextResponse.json(
            { error: 'Task not found in DLQ' },
            { status: 404 }
          )
        }
        return NextResponse.json({ success: true, taskId: id, status: 'queued' })
      }

      case 'cancel': {
        const cancelled = queue.cancel(id)
        if (!cancelled) {
          return NextResponse.json(
            { error: 'Task not found or cannot be cancelled' },
            { status: 404 }
          )
        }
        return NextResponse.json({ success: true, taskId: id, status: 'cancelled' })
      }

      case 'start': {
        queue.start(id)
        return NextResponse.json({ success: true, taskId: id, status: 'running' })
      }

      case 'complete': {
        if (!body.result) {
          return NextResponse.json(
            { error: 'Missing result field for complete action' },
            { status: 400 }
          )
        }
        queue.complete(id, body.result)
        return NextResponse.json({ success: true, taskId: id, status: 'completed' })
      }

      case 'fail': {
        if (!body.error) {
          return NextResponse.json(
            { error: 'Missing error field for fail action' },
            { status: 400 }
          )
        }
        queue.fail(id, body.error)
        const task = queue.getTask(id)
        return NextResponse.json({
          success: true,
          taskId: id,
          status: task?.status || 'failed',
          inDLQ: task?.status === 'failed',
        })
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        )
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
