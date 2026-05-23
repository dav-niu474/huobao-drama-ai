// ============================================================
// Grid Status API Route — GET /api/ai/grid/status
// Checks the status of a grid image generation task.
// Polls the image generation provider for status when the
// generation is async. Also supports checking via
// ImageGeneration record ID.
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helpers'
import { getActiveProviderForUser } from '@/lib/ai-config'
import { db } from '@/lib/db'
import { getImageAdapter } from '@/lib/adapters/image'
import { saveMediaFile } from '@/lib/file-storage'

// GET /api/ai/grid/status — Check grid generation status
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (auth.error) return auth.error

    const { searchParams } = new URL(request.url)
    const taskId = searchParams.get('taskId')
    const imageGenerationId = searchParams.get('imageGenerationId')

    if (!taskId && !imageGenerationId) {
      return NextResponse.json(
        { error: 'taskId or imageGenerationId is required' },
        { status: 400 }
      )
    }

    // 1. Look up the ImageGeneration record
    let imageGeneration

    if (imageGenerationId) {
      imageGeneration = await db.imageGeneration.findUnique({
        where: { id: imageGenerationId },
      })
    } else if (taskId) {
      imageGeneration = await db.imageGeneration.findFirst({
        where: { taskId },
      })
    }

    if (!imageGeneration) {
      return NextResponse.json(
        { error: 'Image generation record not found' },
        { status: 404 }
      )
    }

    // 2. If already completed or failed, return directly
    if (imageGeneration.status === 'completed') {
      return NextResponse.json({
        status: 'completed',
        imageUrl: imageGeneration.imageUrl,
        imageGenerationId: imageGeneration.id,
        size: imageGeneration.size,
      })
    }

    if (imageGeneration.status === 'failed') {
      return NextResponse.json({
        status: 'failed',
        error: imageGeneration.errorMsg || 'Image generation failed',
        imageGenerationId: imageGeneration.id,
      })
    }

    // 3. If processing, poll the provider for status
    if (!imageGeneration.taskId) {
      return NextResponse.json({
        status: 'processing',
        imageGenerationId: imageGeneration.id,
        message: '图片生成中，暂无任务ID',
      })
    }

    // Get the provider for polling (respect user-level keys)
    const provider = await getActiveProviderForUser('image', auth.userId)
    if (!provider) {
      return NextResponse.json(
        { status: 'failed', error: '未配置图片生成供应商' },
        { status: 400 }
      )
    }

    const adapter = getImageAdapter(provider.provider)
    const config = {
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKey,
      model: provider.model,
    }

    // Build and execute the poll request
    const pollReq = adapter.buildPollRequest(config, imageGeneration.taskId)

    if (!pollReq) {
      // Provider doesn't support polling — just return current status
      return NextResponse.json({
        status: 'processing',
        taskId: imageGeneration.taskId,
        imageGenerationId: imageGeneration.id,
        message: '供应商不支持轮询，请稍后手动检查',
      })
    }

    const pollRes = await fetch(pollReq.url, {
      method: pollReq.method,
      headers: pollReq.headers,
    })

    if (!pollRes.ok) {
      const text = await pollRes.text().catch(() => 'Unknown error')
      return NextResponse.json(
        {
          status: 'processing',
          taskId: imageGeneration.taskId,
          imageGenerationId: imageGeneration.id,
          message: `轮询请求失败 (${pollRes.status}): ${text.slice(0, 200)}`,
        }
      )
    }

    const pollData = await pollRes.json()
    const pollParsed = adapter.parsePollResponse(pollData)

    // Handle completed
    if (pollParsed.status === 'completed') {
      let imageUrl = imageGeneration.imageUrl

      if (pollParsed.imageUrl) {
        // Download the image and save to file storage
        const imgRes = await fetch(pollParsed.imageUrl)
        const buffer = Buffer.from(await imgRes.arrayBuffer())
        const saveResult = await saveMediaFile(buffer, {
          mimeType: 'image/png',
          category: 'grid',
          dramaId: imageGeneration.dramaId || undefined,
          filename: `grid_${imageGeneration.id}`,
        })
        imageUrl = saveResult.url
      } else if (pollParsed.imageBase64) {
        const saveResult = await saveMediaFile(pollParsed.imageBase64, {
          mimeType: 'image/png',
          category: 'grid',
          dramaId: imageGeneration.dramaId || undefined,
          filename: `grid_${imageGeneration.id}`,
        })
        imageUrl = saveResult.url
      }

      // Update the ImageGeneration record
      await db.imageGeneration.update({
        where: { id: imageGeneration.id },
        data: {
          imageUrl,
          status: 'completed',
        },
      })

      return NextResponse.json({
        status: 'completed',
        imageUrl,
        imageGenerationId: imageGeneration.id,
        size: imageGeneration.size,
      })
    }

    // Handle failed
    if (pollParsed.status === 'failed') {
      const errorMsg =
        pollParsed.error || 'Image generation failed'

      await db.imageGeneration.update({
        where: { id: imageGeneration.id },
        data: {
          status: 'failed',
          errorMsg,
        },
      })

      return NextResponse.json({
        status: 'failed',
        error: errorMsg,
        imageGenerationId: imageGeneration.id,
      })
    }

    // Still processing or pending
    return NextResponse.json({
      status: pollParsed.status === 'processing' ? 'processing' : 'processing',
      taskId: imageGeneration.taskId,
      imageGenerationId: imageGeneration.id,
      message: '图片生成中，请稍后再试',
    })
  } catch (error) {
    console.error('Failed to check grid status:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
