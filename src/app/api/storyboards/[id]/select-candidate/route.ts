import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// POST /api/storyboards/[id]/select-candidate — Select a candidate image
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { candidateIndex } = body as { candidateIndex: number }

    if (typeof candidateIndex !== 'number' || candidateIndex < 0) {
      return NextResponse.json(
        { error: 'candidateIndex must be a non-negative number' },
        { status: 400 }
      )
    }

    // Fetch storyboard
    const storyboard = await db.storyboard.findUnique({ where: { id } })
    if (!storyboard) {
      return NextResponse.json({ error: 'Storyboard not found' }, { status: 404 })
    }

    // Parse candidate URLs
    let candidateUrls: string[] = []
    if (storyboard.candidateUrls) {
      try {
        candidateUrls = JSON.parse(storyboard.candidateUrls)
      } catch { /* ignore */ }
    }

    if (candidateIndex >= candidateUrls.length) {
      return NextResponse.json(
        { error: `candidateIndex ${candidateIndex} out of range (0-${candidateUrls.length - 1})` },
        { status: 400 }
      )
    }

    const selectedUrl = candidateUrls[candidateIndex]

    // Update storyboard: set selectedCandidateIndex and corresponding image fields
    const updateData: Record<string, unknown> = {
      selectedCandidateIndex: candidateIndex,
    }

    // Determine which frame field to update based on generation mode
    const mode = storyboard.generationMode ?? 'image2video'
    switch (mode) {
      case 'image2video':
        updateData.firstFrameUrl = selectedUrl
        updateData.startFrameImageUrl = selectedUrl
        break
      case 'first_last':
        // For first_last, candidates could be for first frame or last frame
        // We update startFrameImageUrl as the primary selection
        updateData.startFrameImageUrl = selectedUrl
        updateData.firstFrameUrl = selectedUrl
        break
      case 'grid':
        updateData.gridImageUrl = selectedUrl
        break
      case 'reference_video':
        updateData.firstFrameUrl = selectedUrl
        break
    }

    const updated = await db.storyboard.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json({
      success: true,
      storyboardId: id,
      selectedCandidateIndex: candidateIndex,
      selectedUrl,
      generationMode: mode,
      updatedFields: Object.keys(updateData),
    })
  } catch (error) {
    console.error('Failed to select candidate:', error)
    return NextResponse.json({ error: 'Failed to select candidate' }, { status: 500 })
  }
}
