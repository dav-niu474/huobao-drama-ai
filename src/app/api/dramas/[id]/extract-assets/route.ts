// ============================================================
// POST /api/dramas/[id]/extract-assets
// Batch extract assets (characters, scenes, props) from scripts
// ============================================================

export const maxDuration = 300

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { extractAssetsFromScripts } from '@/lib/asset-extraction'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth()
    if (auth.error) return auth.error

    const { id: dramaId } = await params

    // Validate drama exists and user has access
    const drama = await db.drama.findUnique({
      where: { id: dramaId },
      select: { userId: true, assetStatus: true },
    })
    if (!drama) {
      return NextResponse.json({ error: 'Drama 不存在' }, { status: 404 })
    }
    if (drama.userId && drama.userId !== auth.userId && auth.role !== 'admin') {
      return NextResponse.json({ error: '无权访问此项目' }, { status: 403 })
    }

    // Check if extraction is already in progress
    if (drama.assetStatus === 'extracting') {
      return NextResponse.json(
        { error: '素材提取正在进行中，请稍后', code: 'EXTRACTION_IN_PROGRESS' },
        { status: 409 }
      )
    }

    // Parse request body
    let body: { episodeIds?: string[] } = {}
    try {
      body = await request.json()
    } catch {
      // Empty body is fine
    }

    // Run the extraction
    const result = await extractAssetsFromScripts(
      dramaId,
      body.episodeIds,
      undefined, // No progress callback for sync route
      auth.userId
    )

    return NextResponse.json({
      characters: result.characters,
      scenes: result.scenes,
      props: result.props,
      dramaId,
    })
  } catch (error) {
    console.error('[extract-assets] Failed:', error)
    return NextResponse.json(
      {
        error: `素材提取失败: ${
          error instanceof Error ? error.message : String(error)
        }`,
      },
      { status: 500 }
    )
  }
}
