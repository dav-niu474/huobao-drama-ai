// ============================================================
// POST /api/dramas/[id]/generate-strategy
// Generate adaptation strategy using adaptation_strategy agent
// Stores result in Novel.parsedContent alongside skeleton
// ============================================================

export const maxDuration = 300

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { executeAgent } from '@/lib/agents/factory'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth()
    if (auth.error) return auth.error

    const { id: dramaId } = await params

    // Parse request body
    let body: { skeletonContent?: string }
    try {
      body = await request.json()
    } catch {
      body = {}
    }

    // Validate drama exists and user has access
    const drama = await db.drama.findUnique({
      where: { id: dramaId },
      select: { userId: true },
    })
    if (!drama) {
      return NextResponse.json({ error: 'Drama 不存在' }, { status: 404 })
    }
    if (drama.userId && drama.userId !== auth.userId && auth.role !== 'admin') {
      return NextResponse.json({ error: '无权访问此项目' }, { status: 403 })
    }

    // Find the Novel linked to this Drama
    const novel = await db.novel.findUnique({
      where: { dramaId },
    })

    if (!novel) {
      return NextResponse.json(
        { error: '该戏剧项目没有关联小说', code: 'NO_NOVEL' },
        { status: 400 }
      )
    }

    // Get skeleton content from body or from stored parsedContent
    let skeletonContent = body.skeletonContent

    if (!skeletonContent) {
      let parsedContent: Record<string, unknown> = {}
      try {
        parsedContent = JSON.parse(novel.parsedContent || '{}')
      } catch {
        parsedContent = {}
      }

      skeletonContent = parsedContent.skeleton as string | undefined

      if (!skeletonContent) {
        return NextResponse.json(
          { error: '没有故事骨架内容，请先生成故事骨架', code: 'NO_SKELETON' },
          { status: 400 }
        )
      }
    }

    const prompt = `基于以下故事骨架，制定详细的改编策略。策略需要指导后续的剧本生成工作。

故事骨架：
${skeletonContent}`

    // Execute adaptation_strategy agent directly
    const result = await executeAgent(
      'adaptation_strategy',
      dramaId,
      dramaId,
      prompt,
      undefined,
      { userId: auth.userId }
    )

    // Store strategy in Novel.parsedContent (merge with existing data)
    let parsedContent: Record<string, unknown> = {}
    try {
      parsedContent = JSON.parse(novel.parsedContent || '{}')
    } catch {
      parsedContent = {}
    }

    parsedContent.strategy = result.text
    parsedContent.strategyGeneratedAt = new Date().toISOString()

    await db.novel.update({
      where: { id: novel.id },
      data: {
        parsedContent: JSON.stringify(parsedContent),
      },
    })

    return NextResponse.json({
      strategy: result.text,
      novelId: novel.id,
    })
  } catch (error) {
    console.error('[generate-strategy] Failed:', error)
    return NextResponse.json(
      {
        error: `改编策略生成失败: ${
          error instanceof Error ? error.message : String(error)
        }`,
      },
      { status: 500 }
    )
  }
}
