// ============================================================
// Grid Split API Route — POST /api/ai/grid/split
// Splits a grid image into individual cell images and
// assigns them to storyboards. Uses Sharp for image splitting.
// Saves split images as data URLs and updates storyboard
// records with the assigned frame URLs.
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { splitGridImage } from '@/lib/grid.server'
import { validateGridDimensions } from '@/lib/grid'
import { saveMediaFile, readMediaFile, isFileStorageUrl } from '@/lib/file-storage'

// POST /api/ai/grid/split — Split a grid image and assign to storyboards
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (auth.error) return auth.error

    const body = await request.json()
    const {
      imageUrl,
      rows,
      cols,
      assignments,
    } = body as {
      imageUrl: string
      rows: number
      cols: number
      assignments: {
        cellIndex: number
        storyboardId: string
        frameType: 'first_frame' | 'last_frame'
      }[]
    }

    // Validate required fields
    if (!imageUrl) {
      return NextResponse.json(
        { error: 'imageUrl is required' },
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

    if (!assignments || !Array.isArray(assignments) || assignments.length === 0) {
      return NextResponse.json(
        { error: 'assignments must be a non-empty array' },
        { status: 400 }
      )
    }

    // Validate assignments
    const totalCells = rows * cols
    for (const assignment of assignments) {
      if (
        assignment.cellIndex < 0 ||
        assignment.cellIndex >= totalCells
      ) {
        return NextResponse.json(
          {
            error: `Invalid cellIndex ${assignment.cellIndex}. Must be 0-${totalCells - 1}`,
          },
          { status: 400 }
        )
      }

      if (!assignment.storyboardId) {
        return NextResponse.json(
          { error: 'Each assignment must have a storyboardId' },
          { status: 400 }
        )
      }

      if (
        assignment.frameType !== 'first_frame' &&
        assignment.frameType !== 'last_frame'
      ) {
        return NextResponse.json(
          { error: 'frameType must be "first_frame" or "last_frame"' },
          { status: 400 }
        )
      }
    }

    // 1. Download the grid image
    let imageBuffer: Buffer

    if (imageUrl.startsWith('data:')) {
      // Data URL — extract base64 portion
      const base64Match = imageUrl.match(/^data:image\/[^;]+;base64,(.+)$/)
      if (!base64Match) {
        return NextResponse.json(
          { error: 'Invalid data URL format' },
          { status: 400 }
        )
      }
      imageBuffer = Buffer.from(base64Match[1]!, 'base64')
    } else if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
      // HTTP URL — download the image
      const imgRes = await fetch(imageUrl)
      if (!imgRes.ok) {
        return NextResponse.json(
          { error: `Failed to download image: ${imgRes.status}` },
          { status: 400 }
        )
      }
      const arrayBuffer = await imgRes.arrayBuffer()
      imageBuffer = Buffer.from(arrayBuffer)
    } else if (imageUrl.startsWith('/api/files/')) {
      // Local file storage URL — read from disk
      const fileBuffer = await readMediaFile(imageUrl)
      if (!fileBuffer) {
        return NextResponse.json(
          { error: 'File not found in storage' },
          { status: 400 }
        )
      }
      imageBuffer = fileBuffer
    } else {
      return NextResponse.json(
        { error: 'imageUrl must be a data URL, HTTP URL, or file storage path' },
        { status: 400 }
      )
    }

    // 2. Split the grid image into cells
    const cellBuffers = await splitGridImage(imageBuffer, rows, cols)

    // 3. Save each cell buffer to file storage
    const cellImageUrls: string[] = []
    for (let i = 0; i < cellBuffers.length; i++) {
      const buffer = cellBuffers[i]!
      const saveResult = await saveMediaFile(buffer, {
        mimeType: 'image/png',
        category: 'storyboards',
        dramaId: assignments[0]?.storyboardId ? (await db.storyboard.findUnique({ where: { id: assignments[0].storyboardId }, select: { episode: { select: { dramaId: true } } } }))?.episode.dramaId : undefined,
        filename: `cell_${i}_${Date.now()}`,
      })
      cellImageUrls.push(saveResult.url)
    }

    // 4. Assign cells to storyboards and update DB
    const cells: Array<{
      index: number
      imageUrl: string
      assignedTo: string
    }> = []

    for (const assignment of assignments) {
      const { cellIndex, storyboardId, frameType } = assignment

      const cellImageUrl = cellImageUrls[cellIndex]
      if (!cellImageUrl) {
        console.warn(`Cell index ${cellIndex} out of range, skipping`)
        continue
      }

      // Verify the storyboard exists
      const storyboard = await db.storyboard.findUnique({
        where: { id: storyboardId },
        select: { id: true, shotNumber: true },
      })

      if (!storyboard) {
        console.warn(`Storyboard ${storyboardId} not found, skipping`)
        cells.push({
          index: cellIndex,
          imageUrl: cellImageUrl,
          assignedTo: 'not_found',
        })
        continue
      }

      // Update the storyboard with the assigned frame URL
      if (frameType === 'first_frame') {
        await db.storyboard.update({
          where: { id: storyboardId },
          data: {
            firstFrameUrl: cellImageUrl,
            status: 'image_generated',
          },
        })
      } else {
        // last_frame — write to lastFrameUrl
        await db.storyboard.update({
          where: { id: storyboardId },
          data: {
            lastFrameUrl: cellImageUrl,
            status: 'image_generated',
          },
        })
      }

      cells.push({
        index: cellIndex,
        imageUrl: cellImageUrl,
        assignedTo: storyboardId,
      })
    }

    // 5. Also include unassigned cells in the response
    for (let i = 0; i < cellImageUrls.length; i++) {
      const isAssigned = cells.some((c) => c.index === i)
      if (!isAssigned) {
        cells.push({
          index: i,
          imageUrl: cellImageUrls[i]!,
          assignedTo: 'unassigned',
        })
      }
    }

    // Sort by index
    cells.sort((a, b) => a.index - b.index)

    return NextResponse.json({
      cells,
      totalCells: cellImageUrls.length,
      assignedCount: assignments.length,
      rows,
      cols,
    })
  } catch (error) {
    console.error('Failed to split grid image:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
