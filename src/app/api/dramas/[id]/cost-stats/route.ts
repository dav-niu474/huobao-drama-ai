// ============================================================
// Cost Statistics API — GET /api/dramas/[id]/cost-stats
// Returns aggregated generation cost statistics for a drama
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-helpers'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth()
    if (auth.error) return auth.error

    const { id: dramaId } = await params

    // Verify drama exists
    const drama = await db.drama.findUnique({
      where: { id: dramaId },
      select: { id: true },
    })

    if (!drama) {
      return NextResponse.json(
        { error: 'Drama not found' },
        { status: 404 }
      )
    }

    // ── Fetch all cost records for this drama ──
    const costRecords = await db.generationCost.findMany({
      where: { dramaId },
      orderBy: { createdAt: 'desc' },
    })

    // ── Total credits ──
    const totalCredits = costRecords.reduce((sum, r) => sum + r.credits, 0)

    // ── By category ──
    const byCategory: Record<string, number> = { image: 0, video: 0, tts: 0, llm: 0 }
    for (const r of costRecords) {
      byCategory[r.category] = (byCategory[r.category] || 0) + r.credits
    }

    // ── By provider ──
    const byProvider: Record<string, number> = {}
    for (const r of costRecords) {
      byProvider[r.provider] = (byProvider[r.provider] || 0) + r.credits
    }

    // ── By model ──
    const byModel: Record<string, { credits: number; count: number }> = {}
    for (const r of costRecords) {
      const key = r.model || 'unknown'
      if (!byModel[key]) byModel[key] = { credits: 0, count: 0 }
      byModel[key].credits += r.credits
      byModel[key].count += r.count
    }

    // ── By episode ──
    const episodeCredits: Record<string, number> = {}
    for (const r of costRecords) {
      const epKey = r.episodeId || '_drama_level'
      episodeCredits[epKey] = (episodeCredits[epKey] || 0) + r.credits
    }

    // Fetch episode titles for display
    const episodeIds = Object.keys(episodeCredits).filter((k) => k !== '_drama_level')
    const episodes = episodeIds.length > 0
      ? await db.episode.findMany({
          where: { id: { in: episodeIds } },
          select: { id: true, episodeNumber: true, title: true },
        })
      : []

    const episodeMap = new Map(episodes.map((ep) => [ep.id, ep]))

    const byEpisode = Object.entries(episodeCredits)
      .map(([epId, credits]) => {
        if (epId === '_drama_level') {
          return { episodeId: '', episodeTitle: '项目级', credits }
        }
        const ep = episodeMap.get(epId)
        return {
          episodeId: epId,
          episodeTitle: ep ? (ep.title || `第${ep.episodeNumber}集`) : '未知集',
          credits,
        }
      })
      .sort((a, b) => b.credits - a.credits)

    // ── Daily trend (last 30 days) ──
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const dailyMap: Record<string, number> = {}
    for (const r of costRecords) {
      if (r.createdAt >= thirtyDaysAgo) {
        const dateKey = r.createdAt.toISOString().split('T')[0]!
        dailyMap[dateKey] = (dailyMap[dateKey] || 0) + r.credits
      }
    }

    const dailyTrend = Object.entries(dailyMap)
      .map(([date, credits]) => ({ date, credits }))
      .sort((a, b) => a.date.localeCompare(b.date))

    // ── Recent generations (last 20) ──
    const recentGenerations = costRecords.slice(0, 20).map((r) => ({
      id: r.id,
      category: r.category,
      provider: r.provider,
      model: r.model,
      credits: r.credits,
      tokensUsed: r.tokensUsed,
      count: r.count,
      createdAt: r.createdAt.toISOString(),
    }))

    return NextResponse.json({
      totalCredits,
      byCategory,
      byProvider,
      byModel,
      byEpisode,
      dailyTrend,
      recentGenerations,
    })
  } catch (error) {
    console.error('Failed to get cost stats:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
