// ============================================================
// Single Prop API
// PATCH /api/props/[id] — Update a prop
// DELETE /api/props/[id] — Delete a prop
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    // Only allow updating specific fields
    const allowedFields = ['name', 'category', 'description', 'imagePrompt', 'imageUrl']
    const data: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(body)) {
      if (allowedFields.includes(key)) {
        data[key] = value
      }
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: '没有可更新的字段' }, { status: 400 })
    }

    const prop = await db.prop.update({
      where: { id },
      data,
    })

    return NextResponse.json({ prop })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[props/update] Failed:', message)
    return NextResponse.json({ error: '更新道具失败' }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    await db.prop.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[props/delete] Failed:', message)
    return NextResponse.json({ error: '删除道具失败' }, { status: 500 })
  }
}
