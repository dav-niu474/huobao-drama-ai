import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

// Helper: check drama access
async function checkDramaAccess(id: string, session: any) {
  const userId = (session.user as any).id
  const role = (session.user as any).role
  const drama = await db.drama.findUnique({ where: { id }, select: { userId: true } })
  if (!drama) return { error: null, notFound: true }
  if (role !== 'admin' && drama.userId && drama.userId !== userId) {
    return { error: '无权访问此项目', forbidden: true }
  }
  return { error: null, notFound: false, forbidden: false }
}

// GET /api/dramas/[id]/show-plan — Return the 7 commercial parameters + showPlanLocked status
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const { id } = await params
    const access = await checkDramaAccess(id, session)
    if (access.notFound) return NextResponse.json({ error: 'Drama not found' }, { status: 404 })
    if (access.forbidden) return NextResponse.json({ error: access.error }, { status: 403 })

    const drama = await db.drama.findUnique({
      where: { id },
      select: {
        coverage: true,
        episodeFormat: true,
        aspectRatio: true,
        genreTone: true,
        paywallConfig: true,
        targetPlatform: true,
        budgetConstraints: true,
        showPlanLocked: true,
        novelAnalysis: true,
        currentPhase: true,
      },
    })

    if (!drama) {
      return NextResponse.json({ error: 'Drama not found' }, { status: 404 })
    }

    // Parse JSON fields
    let parsedCoverage = null
    let parsedEpisodeFormat = null
    let parsedGenreTone = null
    let parsedPaywallConfig = null
    let parsedBudgetConstraints = null
    let parsedNovelAnalysis = null

    try { parsedCoverage = drama.coverage ? JSON.parse(drama.coverage) : null } catch { parsedCoverage = drama.coverage }
    try { parsedEpisodeFormat = drama.episodeFormat ? JSON.parse(drama.episodeFormat) : null } catch { parsedEpisodeFormat = drama.episodeFormat }
    try { parsedGenreTone = drama.genreTone ? JSON.parse(drama.genreTone) : null } catch { parsedGenreTone = drama.genreTone }
    try { parsedPaywallConfig = drama.paywallConfig ? JSON.parse(drama.paywallConfig) : null } catch { parsedPaywallConfig = drama.paywallConfig }
    try { parsedBudgetConstraints = drama.budgetConstraints ? JSON.parse(drama.budgetConstraints) : null } catch { parsedBudgetConstraints = drama.budgetConstraints }
    try { parsedNovelAnalysis = drama.novelAnalysis ? JSON.parse(drama.novelAnalysis) : null } catch { parsedNovelAnalysis = null }

    return NextResponse.json({
      coverage: parsedCoverage,
      episodeFormat: parsedEpisodeFormat,
      aspectRatio: drama.aspectRatio,
      genreTone: parsedGenreTone,
      paywallConfig: parsedPaywallConfig,
      targetPlatform: drama.targetPlatform,
      budgetConstraints: parsedBudgetConstraints,
      showPlanLocked: drama.showPlanLocked,
      currentPhase: drama.currentPhase,
      novelAnalysis: parsedNovelAnalysis,
    })
  } catch (error) {
    console.error('Failed to get show plan:', error)
    return NextResponse.json({ error: 'Failed to get show plan' }, { status: 500 })
  }
}

// POST /api/dramas/[id]/show-plan — Update parameters or lock show plan
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const { id } = await params
    const access = await checkDramaAccess(id, session)
    if (access.notFound) return NextResponse.json({ error: 'Drama not found' }, { status: 404 })
    if (access.forbidden) return NextResponse.json({ error: access.error }, { status: 403 })

    const body = await request.json()
    const { action } = body

    // Lock action: validate all 7 parameters are set, then lock
    if (action === 'lock') {
      const drama = await db.drama.findUnique({
        where: { id },
        select: {
          coverage: true,
          episodeFormat: true,
          aspectRatio: true,
          genreTone: true,
          paywallConfig: true,
          targetPlatform: true,
          budgetConstraints: true,
          showPlanLocked: true,
        },
      })

      if (!drama) {
        return NextResponse.json({ error: 'Drama not found' }, { status: 404 })
      }

      if (drama.showPlanLocked) {
        return NextResponse.json({ error: 'Show plan is already locked' }, { status: 400 })
      }

      // Validate all 7 parameters are set
      const missing: string[] = []
      if (!drama.coverage) missing.push('coverage')
      if (!drama.episodeFormat) missing.push('episodeFormat')
      if (!drama.aspectRatio) missing.push('aspectRatio')
      if (!drama.genreTone) missing.push('genreTone')
      if (!drama.paywallConfig) missing.push('paywallConfig')
      if (!drama.targetPlatform) missing.push('targetPlatform')
      if (!drama.budgetConstraints) missing.push('budgetConstraints')

      if (missing.length > 0) {
        return NextResponse.json({
          error: `Cannot lock: missing parameters: ${missing.join(', ')}`,
          missing,
        }, { status: 400 })
      }

      // Lock and advance phase
      await db.drama.update({
        where: { id },
        data: {
          showPlanLocked: true,
          currentPhase: 'script_writing',
        },
      })

      return NextResponse.json({ success: true, showPlanLocked: true, currentPhase: 'script_writing' })
    }

    // Update action: update one or more of the 7 parameters
    const allowedFields = [
      'coverage',
      'episodeFormat',
      'aspectRatio',
      'genreTone',
      'paywallConfig',
      'targetPlatform',
      'budgetConstraints',
    ]

    const data: Record<string, unknown> = {}
    for (const field of allowedFields) {
      if (field in body) {
        // Store objects as JSON strings
        const val = body[field]
        if (typeof val === 'object' && val !== null) {
          data[field] = JSON.stringify(val)
        } else {
          data[field] = val
        }
      }
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    // Check if already locked
    const currentDrama = await db.drama.findUnique({
      where: { id },
      select: { showPlanLocked: true },
    })

    if (currentDrama?.showPlanLocked) {
      return NextResponse.json({ error: 'Show plan is locked and cannot be modified' }, { status: 400 })
    }

    const drama = await db.drama.update({
      where: { id },
      data,
    })

    return NextResponse.json({ success: true, updated: Object.keys(data) })
  } catch (error) {
    console.error('Failed to update show plan:', error)
    return NextResponse.json({ error: 'Failed to update show plan' }, { status: 500 })
  }
}
