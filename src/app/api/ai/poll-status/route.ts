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
        if (!pollParsed.videoUrl) {
          return NextResponse.json({ status: 'completed', error: 'No video data' })
        }
        // Persist the provider's temporary URL into file storage so the URL
        // stays servable after the provider expires it. The client (or the
        // batch pipeline) writes the returned URL back to storyboard.videoUrl.
        let videoUrl = pollParsed.videoUrl
        try {
          const videoRes = await fetch(pollParsed.videoUrl)
          if (!videoRes.ok) throw new Error(`provider fetch ${videoRes.status}`)
          const buffer = Buffer.from(await videoRes.arrayBuffer())
          const saveResult = await saveMediaFile(buffer, {
            mimeType: 'video/mp4',
            category: 'storyboards',
            dramaId,
            filename: `async_video_${Date.now()}`,
          })
          videoUrl = saveResult.url
        } catch (err) {
          // Persist failed — fall back to the provider URL rather than failing
          // the whole task (client can still try again later)
          console.warn('[poll-status] Failed to persist async video:', err)
        }
        return NextResponse.json({ status: 'completed', videoUrl })
      }
      return NextResponse.json({ status: pollParsed.status, error: pollParsed.error })
    }

    return NextResponse.json({ error: 'Unsupported category' }, { status: 400 })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
