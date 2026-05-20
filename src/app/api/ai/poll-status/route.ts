import { NextRequest, NextResponse } from 'next/server'
import { getActiveProvider } from '@/lib/ai-config'
import { requireAuth } from '@/lib/auth-helpers'

// POST /api/ai/poll-status - Check the status of an async AI generation task
// Used by the client to poll for results when the API returns { status: 'processing', taskId }
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (auth.error) return auth.error

    const body = await request.json()
    const { category, taskId } = body

    if (!category || !taskId) {
      return NextResponse.json({ error: 'Missing category or taskId' }, { status: 400 })
    }

    const provider = await getActiveProvider(category)
    if (!provider) {
      return NextResponse.json({ error: 'No active provider' }, { status: 400 })
    }

    if (category === 'image') {
      const { getImageAdapter } = await import('@/lib/adapters/image')
      const adapter = getImageAdapter(provider.provider)
      const config = { baseUrl: provider.baseUrl, apiKey: provider.apiKey, model: provider.model }
      const pollReq = adapter.buildPollRequest(config, taskId)
      if (!pollReq) {
        return NextResponse.json({ status: 'unsupported', error: '该供应商不支持轮询' }, { status: 400 })
      }
      const pollRes = await fetch(pollReq.url, { method: pollReq.method, headers: pollReq.headers })
      const pollData = await pollRes.json()
      const pollParsed = adapter.parsePollResponse(pollData)

      if (pollParsed.status === 'completed') {
        if (pollParsed.imageUrl) {
          const imgRes = await fetch(pollParsed.imageUrl)
          const buffer = Buffer.from(await imgRes.arrayBuffer())
          return NextResponse.json({ status: 'completed', imageBase64: buffer.toString('base64') })
        }
        if (pollParsed.imageBase64) {
          return NextResponse.json({ status: 'completed', imageBase64: pollParsed.imageBase64 })
        }
        return NextResponse.json({ status: 'completed', error: 'No image data' })
      }
      return NextResponse.json({ status: pollParsed.status, error: pollParsed.error })
    }

    if (category === 'video') {
      const { getVideoAdapter } = await import('@/lib/adapters/video')
      const adapter = getVideoAdapter(provider.provider)
      const config = { baseUrl: provider.baseUrl, apiKey: provider.apiKey, model: provider.model }
      const pollReq = adapter.buildPollRequest(config, taskId)
      if (!pollReq) {
        return NextResponse.json({ status: 'unsupported', error: '该供应商不支持轮询' }, { status: 400 })
      }
      const pollRes = await fetch(pollReq.url, { method: pollReq.method, headers: pollReq.headers })
      const pollData = await pollRes.json()
      const pollParsed = adapter.parsePollResponse(pollData)

      if (pollParsed.status === 'completed') {
        return NextResponse.json({ status: 'completed', videoUrl: pollParsed.videoUrl })
      }
      return NextResponse.json({ status: pollParsed.status, error: pollParsed.error })
    }

    return NextResponse.json({ error: 'Unsupported category' }, { status: 400 })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
