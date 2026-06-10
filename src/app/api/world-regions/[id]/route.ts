// ============================================================
// World Region — Update & Delete
// PATCH /api/world-regions/[id]
// DELETE /api/world-regions/[id]
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

    const { id: regionId } = await params
    const body = await req.json()

    // Find the drama containing this region
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

    // Update fields
    if (body.name !== undefined) regions[regionIndex].name = body.name
    if (body.description !== undefined) regions[regionIndex].description = body.description
    if (body.atmosphere !== undefined) regions[regionIndex].atmosphere = body.atmosphere
    if (body.musicStyle !== undefined) regions[regionIndex].musicStyle = body.musicStyle
    regions[regionIndex].updatedAt = new Date().toISOString()

    await db.drama.update({
      where: { id: drama.id },
      data: { novelAnalysis: JSON.stringify(analysis) },
    })

    return NextResponse.json({ region: regions[regionIndex] })
  } catch (error: any) {
    console.error('[world-regions/[id]] PATCH error:', error)
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

    const { id: regionId } = await params

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
    analysis.worldRegions = regions.filter((r: any) => r.id !== regionId)

    await db.drama.update({
      where: { id: drama.id },
      data: { novelAnalysis: JSON.stringify(analysis) },
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[world-regions/[id]] DELETE error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
