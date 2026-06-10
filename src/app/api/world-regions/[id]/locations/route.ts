// ============================================================
// World Region Locations — List & Create
// GET  /api/world-regions/[id]/locations
// POST /api/world-regions/[id]/locations
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

    const { id: regionId } = await params

    const dramas = await db.drama.findMany({
      where: { novelAnalysis: { contains: regionId } },
      select: { id: true, novelAnalysis: true },
    })

    if (dramas.length === 0) {
      return NextResponse.json({ error: '区域不存在' }, { status: 404 })
    }

    let analysis: any = {}
    try {
      analysis = JSON.parse(dramas[0].novelAnalysis || '{}')
    } catch {}

    const region = (analysis.worldRegions || []).find((r: any) => r.id === regionId)
    if (!region) {
      return NextResponse.json({ error: '区域不存在' }, { status: 404 })
    }

    return NextResponse.json({ locations: region.locations || [] })
  } catch (error: any) {
    console.error('[world-regions/[id]/locations] GET error:', error)
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

    const { id: regionId } = await params
    const body = await req.json()
    const { name, description, timeOfDayOptions } = body

    if (!name) {
      return NextResponse.json({ error: '地点名称为必填项' }, { status: 400 })
    }

    const dramas = await db.drama.findMany({
      where: { novelAnalysis: { contains: regionId } },
      select: { id: true, novelAnalysis: true },
    })

    if (dramas.length === 0) {
      return NextResponse.json({ error: '区域不存在' }, { status: 404 })
    }

    const drama = dramas[0]
    let analysis: any = {}
    try {
      analysis = JSON.parse(drama.novelAnalysis || '{}')
    } catch {}

    const regions = analysis.worldRegions || []
    const regionIndex = regions.findIndex((r: any) => r.id === regionId)
    if (regionIndex === -1) {
      return NextResponse.json({ error: '区域不存在' }, { status: 404 })
    }

    if (!Array.isArray(regions[regionIndex].locations)) {
      regions[regionIndex].locations = []
    }

    const location = {
      id: `loc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      regionId,
      name,
      description: description || '',
      timeOfDayOptions: JSON.stringify(timeOfDayOptions || ['dawn', 'morning', 'afternoon', 'dusk', 'night']),
      imageUrl: null,
      sortOrder: regions[regionIndex].locations.length,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    regions[regionIndex].locations.push(location)
    regions[regionIndex].updatedAt = new Date().toISOString()

    await db.drama.update({
      where: { id: drama.id },
      data: { novelAnalysis: JSON.stringify(analysis) },
    })

    return NextResponse.json({ location }, { status: 201 })
  } catch (error: any) {
    console.error('[world-regions/[id]/locations] POST error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
