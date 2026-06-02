import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerSession } from 'next-auth'

// GET /api/series/[id]/consistency — Check world-building consistency across dramas
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession()
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const { id: seriesId } = await params
    const series = await db.series.findUnique({
      where: { id: seriesId },
      include: {
        members: {
          include: {
            drama: {
              select: {
                id: true, title: true,
                characters: { select: { name: true, gender: true, role: true } },
                scenes: { select: { location: true, timeOfDay: true } },
              },
            },
          },
          orderBy: { order: 'asc' },
        },
      },
    })

    if (!series) {
      return NextResponse.json({ error: '系列不存在' }, { status: 404 })
    }

    // Simple consistency checks
    const issues: Array<{ type: string; description: string; dramas: string[] }> = []

    // Check for duplicate character names across dramas
    const charNameMap: Record<string, string[]> = {}
    for (const member of series.members) {
      for (const char of member.drama.characters) {
        if (!charNameMap[char.name]) charNameMap[char.name] = []
        charNameMap[char.name].push(member.drama.title)
      }
    }

    for (const [name, dramaTitles] of Object.entries(charNameMap)) {
      if (dramaTitles.length > 1) {
        const charsByDrama = series.members.flatMap((m) =>
          m.drama.characters.filter((c) => c.name === name).map((c) => ({ ...c, drama: m.drama.title }))
        )
        const genders = new Set(charsByDrama.map((c) => c.gender))
        if (genders.size > 1) {
          issues.push({
            type: 'character_gender_mismatch',
            description: `角色「${name}」在不同剧集中性别不一致: ${charsByDrama.map((c) => `${c.drama}: ${c.gender}`).join(', ')}`,
            dramas: dramaTitles,
          })
        }
        const roles = new Set(charsByDrama.map((c) => c.role))
        if (roles.size > 1) {
          issues.push({
            type: 'character_role_mismatch',
            description: `角色「${name}」在不同剧集中角色类型不一致: ${charsByDrama.map((c) => `${c.drama}: ${c.role}`).join(', ')}`,
            dramas: dramaTitles,
          })
        }
      }
    }

    // Check for shared scene locations
    const sceneLocationMap: Record<string, string[]> = {}
    for (const member of series.members) {
      for (const scene of member.drama.scenes) {
        const key = scene.location.toLowerCase()
        if (!sceneLocationMap[key]) sceneLocationMap[key] = []
        if (!sceneLocationMap[key].includes(member.drama.title)) {
          sceneLocationMap[key].push(member.drama.title)
        }
      }
    }

    for (const [location, dramaTitles] of Object.entries(sceneLocationMap)) {
      if (dramaTitles.length > 1) {
        issues.push({
          type: 'shared_location',
          description: `场景「${location}」在多个剧集中出现，请确保场景描述一致`,
          dramas: dramaTitles,
        })
      }
    }

    return NextResponse.json({
      seriesId,
      seriesTitle: series.title,
      dramaCount: series.members.length,
      worldBuildingDoc: series.worldBuildingDoc,
      issues,
      passed: issues.length === 0,
    })
  } catch (error: any) {
    console.error('[Series] Consistency check failed:', error)
    return NextResponse.json({ error: error.message || '一致性检查失败' }, { status: 500 })
  }
}
