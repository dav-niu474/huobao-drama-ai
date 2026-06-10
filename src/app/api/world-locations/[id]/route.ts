// ============================================================
// World Location — Update & Delete
// PATCH /api/world-locations/[id]
// DELETE /api/world-locations/[id]
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const { id: locationId } = await params
    const body = await req.json()

    const dramas = await db.drama.findMany({
      where: { novelAnalysis: { contains: locationId } },
      select: { id: true, novelAnalysis: true },
    })

    if (dramas.length === 0) {
      return NextResponse.json({ error: '地点不存在' }, { status: 404 })
    }

    const drama = dramas[0]
    let analysis: any = {}
    try {
      analysis = JSON.parse(drama.novelAnalysis || '{}')
    } catch {}

    const regions = analysis.worldRegions || []
    let foundLocation: any = null

    for (const region of regions) {
      if (!Array.isArray(region.locations)) continue
      const locIndex = region.locations.findIndex((l: any) => l.id === locationId)
      if (locIndex !== -1) {
        if (body.name !== undefined) region.locations[locIndex].name = body.name
        if (body.description !== undefined) region.locations[locIndex].description = body.description
        if (body.timeOfDayOptions !== undefined) region.locations[locIndex].timeOfDayOptions = JSON.stringify(body.timeOfDayOptions)
        if (body.imageUrl !== undefined) region.locations[locIndex].imageUrl = body.imageUrl
        region.locations[locIndex].updatedAt = new Date().toISOString()
        foundLocation = region.locations[locIndex]
        break
      }
    }

    if (!foundLocation) {
      return NextResponse.json({ error: '地点不存在' }, { status: 404 })
    }

    await db.drama.update({
      where: { id: drama.id },
      data: { novelAnalysis: JSON.stringify(analysis) },
    })

    return NextResponse.json({ location: foundLocation })
  } catch (error: any) {
    console.error('[world-locations/[id]] PATCH error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const { id: locationId } = await params

    const dramas = await db.drama.findMany({
      where: { novelAnalysis: { contains: locationId } },
      select: { id: true, novelAnalysis: true },
    })

    if (dramas.length === 0) {
      return NextResponse.json({ error: '地点不存在' }, { status: 404 })
    }

    const drama = dramas[0]
    let analysis: any = {}
    try {
      analysis = JSON.parse(drama.novelAnalysis || '{}')
    } catch {}

    const regions = analysis.worldRegions || []
    for (const region of regions) {
      if (!Array.isArray(region.locations)) continue
      const before = region.locations.length
      region.locations = region.locations.filter((l: any) => l.id !== locationId)
      if (region.locations.length < before) {
        region.updatedAt = new Date().toISOString()
        break
      }
    }

    await db.drama.update({
      where: { id: drama.id },
      data: { novelAnalysis: JSON.stringify(analysis) },
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[world-locations/[id]] DELETE error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
