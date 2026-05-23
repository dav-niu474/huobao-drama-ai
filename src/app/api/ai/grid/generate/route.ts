// ============================================================
// Grid Image Generation API Route — POST /api/ai/grid/generate
// Generates a grid image (multiple storyboard frames in a
// single image) using the existing image adapter system.
// Creates an ImageGeneration record with frameType: 'grid'
// for tracking purposes.
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helpers'
import { aiClient, getActiveProviderForUser } from '@/lib/ai-config'
import { db } from '@/lib/db'
import {
  calculateGridResolution,
  getGridSizeString,
  validateGridDimensions,
} from '@/lib/grid'
import { getImageAdapter } from '@/lib/adapters/image'
import { saveMediaFile } from '@/lib/file-storage'

// POST /api/ai/grid/generate — Generate a grid image
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (auth.error) return auth.error
    aiClient._userId = auth.userId

    const body = await request.json()
    const {
      episodeId,
      dramaId,
      prompt,
      rows,
      cols,
      imageConfigId,
      cellPrompts,
      shotIds,
      gridMode,
    } = body as {
      episodeId?: string
      dramaId?: string
      prompt: string
      rows: number
      cols: number
      imageConfigId?: string
      cellPrompts?: string[]
      shotIds?: string[]
      gridMode?: string
    }

    // Validate required fields
    if (!prompt) {
      return NextResponse.json(
        { error: 'prompt is required' },
        { status: 400 }
      )
    }

    if (!rows || !cols) {
      return NextResponse.json(
        { error: 'rows and cols are required' },
        { status: 400 }
      )
    }

    // Validate grid dimensions
    const dimValidation = validateGridDimensions(rows, cols)
    if (!dimValidation.valid) {
      return NextResponse.json(
        { error: dimValidation.error },
        { status: 400 }
      )
    }

    // Calculate grid resolution
    const { width, height } = calculateGridResolution(rows, cols)
    const size = getGridSizeString(rows, cols)

    // Create ImageGeneration record for tracking
    const imageGeneration = await db.imageGeneration.create({
      data: {
        dramaId: dramaId || null,
        prompt,
        model: '',
        provider: '',
        size,
        frameType: 'grid',
        referenceImages:
          cellPrompts || shotIds
            ? JSON.stringify({
                cellPrompts: cellPrompts || [],
                shotIds: shotIds || [],
                gridMode: gridMode || 'first_frame',
                rows,
                cols,
              })
            : null,
        status: 'processing',
      },
    })

    // Generate the grid image using the image adapter system
    try {
      const provider = await getActiveProviderForUser('image', auth.userId)
      if (!provider) {
        await db.imageGeneration.update({
          where: { id: imageGeneration.id },
          data: {
            status: 'failed',
            errorMsg: '未配置图片生成供应商',
          },
        })
        return NextResponse.json(
          { error: '未配置图片生成供应商。请在设置中配置 API Key。' },
          { status: 400 }
        )
      }

      // Update ImageGeneration with provider info
      await db.imageGeneration.update({
        where: { id: imageGeneration.id },
        data: {
          model: provider.model,
          provider: provider.provider,
        },
      })

      // Use the adapter to generate the image
      const adapter = getImageAdapter(provider.provider)
      const config = {
        baseUrl: provider.baseUrl,
        apiKey: provider.apiKey,
        model: provider.model,
      }

      // Build the generation request
      const req = adapter.buildGenerateRequest(config, {
        prompt,
        size,
        negativePrompt:
          'blurry, low quality, distorted, watermark, text overlay, grid lines broken, misaligned cells',
      })

      const res = await fetch(req.url, {
        method: req.method,
        headers: req.headers,
        body: JSON.stringify(req.body),
      })

      if (!res.ok) {
        const text = await res.text().catch(() => 'Unknown error')
        const errorMsg = `图片生成API错误 (${res.status}): ${text.slice(0, 300)}`
        await db.imageGeneration.update({
          where: { id: imageGeneration.id },
          data: { status: 'failed', errorMsg },
        })
        return NextResponse.json({ error: errorMsg }, { status: 500 })
      }

      const result = await res.json()
      const parsed = adapter.parseGenerateResponse(result)

      // Handle async response
      if (parsed.isAsync && parsed.taskId) {
        await db.imageGeneration.update({
          where: { id: imageGeneration.id },
          data: {
            taskId: parsed.taskId,
          },
        })

        return NextResponse.json({
          status: 'processing',
          taskId: parsed.taskId,
          imageGenerationId: imageGeneration.id,
          size,
          rows,
          cols,
          message: '宫格图生成中，请使用 /api/ai/grid/status 查询进度',
        })
      }

      // Handle sync response with URL
      if (!parsed.isAsync && parsed.imageUrl) {
        // Download the image and save to file storage
        const imgRes = await fetch(parsed.imageUrl)
        const buffer = Buffer.from(await imgRes.arrayBuffer())
        const saveResult = await saveMediaFile(buffer, {
          mimeType: 'image/png',
          category: 'grid',
          dramaId: dramaId || undefined,
          filename: `grid_${imageGeneration.id}`,
        })
        const imageUrl = saveResult.url

        await db.imageGeneration.update({
          where: { id: imageGeneration.id },
          data: {
            imageUrl,
            status: 'completed',
          },
        })

        return NextResponse.json({
          imageUrl,
          imageGenerationId: imageGeneration.id,
          size,
          rows,
          cols,
        })
      }

      // Handle sync response with base64
      if (!parsed.isAsync && parsed.imageBase64) {
        const saveResult = await saveMediaFile(parsed.imageBase64, {
          mimeType: 'image/png',
          category: 'grid',
          dramaId: dramaId || undefined,
          filename: `grid_${imageGeneration.id}`,
        })
        const imageUrl = saveResult.url

        await db.imageGeneration.update({
          where: { id: imageGeneration.id },
          data: {
            imageUrl,
            status: 'completed',
          },
        })

        return NextResponse.json({
          imageUrl,
          imageGenerationId: imageGeneration.id,
          size,
          rows,
          cols,
        })
      }

      // No image data returned
      await db.imageGeneration.update({
        where: { id: imageGeneration.id },
        data: {
          status: 'failed',
          errorMsg: '图片生成返回数据为空',
        },
      })

      return NextResponse.json(
        { error: '图片生成返回数据为空' },
        { status: 500 }
      )
    } catch (error: unknown) {
      // Handle async task error
      if (
        error instanceof Error &&
        error.name === 'AsyncTaskError' &&
        error.message.startsWith('ASYNC_TASK:')
      ) {
        const taskId = error.message.replace('ASYNC_TASK:', '')
        await db.imageGeneration.update({
          where: { id: imageGeneration.id },
          data: { taskId },
        })

        return NextResponse.json({
          status: 'processing',
          taskId,
          imageGenerationId: imageGeneration.id,
          size,
          rows,
          cols,
          message: '宫格图生成中，请使用 /api/ai/grid/status 查询进度',
        })
      }

      throw error
    }
  } catch (error) {
    console.error('Failed to generate grid image:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
