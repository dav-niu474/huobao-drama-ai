// ============================================================
// DLQ API — GET list DLQ items, POST retry a DLQ item
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { getGenerationQueue } from '@/lib/queue/generation-queue'

const queue = getGenerationQueue()

// GET /api/queue/dlq — List dead letter queue items
export async function GET() {
  try {
    const items = queue.getDLQItems()
    return NextResponse.json({ items, count: items.length })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST /api/queue/dlq — Retry a DLQ item
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const taskId = body.taskId

    if (!taskId) {
      return NextResponse.json(
        { error: 'Missing taskId' },
        { status: 400 }
      )
    }

    const retried = queue.retryFromDLQ(taskId)
    if (!retried) {
      return NextResponse.json(
        { error: 'Task not found in DLQ' },
        { status: 404 }
      )
    }

    return NextResponse.json({ success: true, taskId, status: 'queued' })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
