// ============================================================
// Queue Events SSE — Real-time status updates
// ============================================================

import { NextRequest } from 'next/server'
import { getGenerationQueue, QueueEvent } from '@/lib/queue/generation-queue'

const queue = getGenerationQueue()

// GET /api/queue/events — SSE stream of queue events
export async function GET(request: NextRequest) {
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    start(controller) {
      // Send initial connection message
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: 'connected', timestamp: new Date().toISOString() })}\n\n`)
      )

      // Subscribe to queue events
      const unsubscribe = queue.onEvent((event: QueueEvent) => {
        try {
          const data = JSON.stringify({
            type: event.type,
            task: {
              id: event.task.id,
              type: event.task.type,
              category: event.task.category,
              referenceId: event.task.referenceId,
              dramaId: event.task.dramaId,
              episodeId: event.task.episodeId,
              status: event.task.status,
              priority: event.task.priority,
              retryCount: event.task.retryCount,
              error: event.task.error,
            },
            timestamp: event.timestamp.toISOString(),
          })
          controller.enqueue(encoder.encode(`data: ${data}\n\n`))
        } catch {
          // Stream might be closed
        }
      })

      // Handle client disconnect
      const signal = request.signal
      const onAbort = () => {
        unsubscribe()
        try {
          controller.close()
        } catch {
          // Already closed
        }
      }
      signal.addEventListener('abort', onAbort, { once: true })

      // Periodic heartbeat to keep connection alive
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(
            encoder.encode(`: heartbeat\n\n`)
          )
        } catch {
          clearInterval(heartbeat)
          unsubscribe()
        }
      }, 15000)

      // Clean up on close
      const originalClose = controller.close.bind(controller)
      // @ts-expect-error - override close for cleanup
      controller.close = () => {
        clearInterval(heartbeat)
        unsubscribe()
        originalClose()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    },
  })
}
