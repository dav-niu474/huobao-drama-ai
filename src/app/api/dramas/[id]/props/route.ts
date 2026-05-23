// ============================================================
// Drama Props API
// GET  /api/dramas/[id]/props — List all props for a drama
// POST /api/dramas/[id]/props — Create a new prop for a drama
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const props = await db.prop.findMany({
      where: { dramaId: id },
      orderBy: { createdAt: 'asc' },
    })

    return NextResponse.json({ props })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[props/list] Failed:', message)
    return NextResponse.json({ error: '获取道具列表失败' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { name, category, description, imagePrompt } = body

    if (!name) {
      return NextResponse.json({ error: '道具名称不能为空' }, { status: 400 })
    }

    // Check for duplicate name
    const existing = await db.prop.findFirst({
      where: { dramaId: id, name: { equals: name, mode: 'insensitive' } },
    })

    if (existing) {
      return NextResponse.json(
        { error: `道具"${name}"已存在` },
        { status: 409 }
      )
    }

    const prop = await db.prop.create({
      data: {
        dramaId: id,
        name,
        category: category || 'other',
        description: description || '',
        imagePrompt: imagePrompt || null,
      },
    })

    return NextResponse.json({ prop }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[props/create] Failed:', message)
    return NextResponse.json({ error: '创建道具失败' }, { status: 500 })
  }
}
