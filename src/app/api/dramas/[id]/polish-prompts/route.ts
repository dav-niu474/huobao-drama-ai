// ============================================================
// POST /api/dramas/[id]/polish-prompts
// Polish all asset prompts with art style
// ============================================================

export const maxDuration = 300

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { polishAssetPrompts } from '@/lib/prompt-polisher'

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
      select: { userId: true, artStyle: true },
    })
    if (!drama) {
      return NextResponse.json({ error: 'Drama 不存在' }, { status: 404 })
    }
    if (drama.userId && drama.userId !== auth.userId && auth.role !== 'admin') {
      return NextResponse.json({ error: '无权访问此项目' }, { status: 403 })
    }

    // Parse request body
    let body: { artStyle?: string; overwriteExisting?: boolean } = {}
    try {
      body = await request.json()
    } catch {
      // Empty body is fine
    }

    // Use provided artStyle or fall back to drama's artStyle
    const artStyle = body.artStyle || drama.artStyle
    if (!artStyle) {
      return NextResponse.json(
        { error: '未指定艺术风格。请先为项目选择艺术风格，或在请求中指定artStyle参数。', code: 'NO_ART_STYLE' },
        { status: 400 }
      )
    }

    // Run the polishing
    const result = await polishAssetPrompts(dramaId, artStyle, {
      overwriteExisting: body.overwriteExisting ?? false,
      userId: auth.userId,
    })

    return NextResponse.json({
      polished: result.polished,
      skipped: result.skipped,
    })
  } catch (error) {
    console.error('[polish-prompts] Failed:', error)
    return NextResponse.json(
      {
        error: `提示词风格化失败: ${
          error instanceof Error ? error.message : String(error)
        }`,
      },
      { status: 500 }
    )
  }
}
