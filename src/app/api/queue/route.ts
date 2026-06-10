// ============================================================
// Queue API — GET status, POST enqueue, DELETE cancel
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { getGenerationQueue } from '@/lib/queue/generation-queue'

const queue = getGenerationQueue()

// GET /api/queue — Get queue status
export async function GET() {
  try {
    const status = queue.getStatus()
    return NextResponse.json(status)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST /api/queue — Add task to queue
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Validate required fields
    if (!body.type || !body.category || !body.referenceId || !body.dramaId) {
      return NextResponse.json(
        { error: 'Missing required fields: type, category, referenceId, dramaId' },
        { status: 400 }
      )
    }

    if (!['image', 'video', 'tts'].includes(body.type)) {
      return NextResponse.json(
        { error: 'Invalid type. Must be: image, video, tts' },
        { status: 400 }
      )
    }

    const taskId = queue.enqueue({
      type: body.type,
      category: body.category,
      referenceId: body.referenceId,
      dramaId: body.dramaId,
      episodeId: body.episodeId,
      priority: body.priority || 0,
      maxRetries: body.maxRetries || 3,
      checkpoint: body.checkpoint,
    })

    return NextResponse.json({ taskId, status: 'queued' }, { status: 201 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// DELETE /api/queue — Cancel a queued task
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const taskId = searchParams.get('taskId')

    if (!taskId) {
      return NextResponse.json(
        { error: 'Missing taskId query parameter' },
        { status: 400 }
      )
    }

    const cancelled = queue.cancel(taskId)
    if (!cancelled) {
      return NextResponse.json(
        { error: 'Task not found or cannot be cancelled' },
        { status: 404 }
      )
    }

    return NextResponse.json({ success: true, taskId })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
