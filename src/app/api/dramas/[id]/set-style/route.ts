// ============================================================
// Drama Style API Routes
// POST /api/dramas/[id]/set-style — Set art style for a drama
// GET  /api/dramas/[id]/set-style — List available art styles
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import {
  getArtStyleList,
  validateArtStyle,
  getStorySkillList,
} from '@/lib/art-prompt-loader'

// Helper: check drama access
async function checkDramaAccess(id: string, session: any) {
  const userId = (session.user as any).id
  const role = (session.user as any).role

  const drama = await db.drama.findUnique({
    where: { id },
    select: { userId: true },
  })

  if (!drama) return { error: null, notFound: true }
  if (role !== 'admin' && drama.userId && drama.userId !== userId) {
    return { error: '无权访问此项目', forbidden: true }
  }
  return { error: null, notFound: false, forbidden: false }
}

// GET /api/dramas/[id]/set-style — List available art styles
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

    const styles = getArtStyleList()
    const storySkills = getStorySkillList()

    return NextResponse.json({ styles, storySkills })
  } catch (error) {
    console.error('[set-style] GET failed:', error)
    return NextResponse.json(
      { error: 'Failed to list art styles' },
      { status: 500 }
    )
  }
}

// POST /api/dramas/[id]/set-style — Set art style for a drama
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
    const { artStyle } = body

    if (!artStyle || typeof artStyle !== 'string') {
      return NextResponse.json(
        { error: '缺少 artStyle 参数' },
        { status: 400 }
      )
    }

    // Validate the style exists
    if (!validateArtStyle(artStyle)) {
      return NextResponse.json(
        { error: `风格 "${artStyle}" 不存在` },
        { status: 400 }
      )
    }

    // Update Drama
    const drama = await db.drama.update({
      where: { id },
      data: { artStyle },
    })

    return NextResponse.json({ drama, artStyle })
  } catch (error) {
    console.error('[set-style] POST failed:', error)
    return NextResponse.json(
      { error: 'Failed to set art style' },
      { status: 500 }
    )
  }
}
