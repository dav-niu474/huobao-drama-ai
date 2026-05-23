import { NextRequest, NextResponse } from 'next/server'
import { getActiveProvider } from '@/lib/ai-config'
import { requireAuth } from '@/lib/auth-helpers'
import { saveMediaFile } from '@/lib/file-storage'

// POST /api/ai/poll-status - Check the status of an async AI generation task
// Used by the client to poll for results when the API returns { status: 'processing', taskId }
// v0.7: Saves polled image data to file storage instead of returning base64
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (auth.error) return auth.error

    const body = await request.json()
    const { category, taskId, dramaId } = body

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
          // Download image from provider URL and save to file storage
          const imgRes = await fetch(pollParsed.imageUrl)
          const buffer = Buffer.from(await imgRes.arrayBuffer())
          const saveResult = await saveMediaFile(buffer, {
            mimeType: 'image/png',
            category: 'storyboards',
            dramaId,
            filename: `async_img_${Date.now()}`,
          })
          return NextResponse.json({ status: 'completed', imageUrl: saveResult.url })
        }
        if (pollParsed.imageBase64) {
          // Save base64 to file storage
          const saveResult = await saveMediaFile(pollParsed.imageBase64, {
            mimeType: 'image/png',
            category: 'storyboards',
            dramaId,
            filename: `async_img_${Date.now()}`,
          })
          return NextResponse.json({ status: 'completed', imageUrl: saveResult.url })
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
