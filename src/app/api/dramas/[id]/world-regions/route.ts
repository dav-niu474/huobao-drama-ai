// ============================================================
// World Regions — List & Create (per drama)
// GET  /api/dramas/[id]/world-regions
// POST /api/dramas/[id]/world-regions
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const { id: dramaId } = await params

    // Get regions from the drama's novelAnalysis or worldBuildingDoc
    // Since we don't have a dedicated WorldRegion table, we store regions
    // in the Drama's data fields as JSON
    const drama = await db.drama.findUnique({
      where: { id: dramaId },
      select: { id: true, novelAnalysis: true },
    })

    if (!drama) {
      return NextResponse.json({ error: '项目不存在' }, { status: 404 })
    }

    // Parse regions from novelAnalysis
    let regions: any[] = []
    try {
      const analysis = JSON.parse(drama.novelAnalysis || '{}')
      regions = analysis.worldRegions || []
    } catch {}

    return NextResponse.json({ regions })
  } catch (error: any) {
    console.error('[world-regions] GET error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const { id: dramaId } = await params
    const body = await req.json()
    const { name, description, atmosphere, musicStyle } = body

    if (!name) {
      return NextResponse.json({ error: '区域名称为必填项' }, { status: 400 })
    }

    const drama = await db.drama.findUnique({ where: { id: dramaId } })
    if (!drama) {
      return NextResponse.json({ error: '项目不存在' }, { status: 404 })
    }

    // Store region in novelAnalysis.worldRegions
    let analysis: any = {}
    try {
      analysis = JSON.parse(drama.novelAnalysis || '{}')
    } catch {}

    if (!Array.isArray(analysis.worldRegions)) {
      analysis.worldRegions = []
    }

    const region = {
      id: `region_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      dramaId,
      name,
      description: description || '',
      atmosphere: atmosphere || '',
      musicStyle: musicStyle || '',
      sortOrder: analysis.worldRegions.length,
      locations: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    analysis.worldRegions.push(region)

    await db.drama.update({
      where: { id: dramaId },
      data: { novelAnalysis: JSON.stringify(analysis) },
    })

    return NextResponse.json({ region }, { status: 201 })
  } catch (error: any) {
    console.error('[world-regions] POST error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
