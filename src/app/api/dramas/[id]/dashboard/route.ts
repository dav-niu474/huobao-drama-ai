// ============================================================
// Dashboard API — GET /api/dramas/[id]/dashboard
// Returns comprehensive dashboard data for a drama project
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-helpers'

// Role hierarchy for drama access check
const ROLE_LEVELS: Record<string, number> = { owner: 3, editor: 2, viewer: 1 }

async function requireDramaAccess(dramaId: string, userId: string) {
  const drama = await db.drama.findUnique({
    where: { id: dramaId },
    select: { userId: true },
  })

  if (!drama) {
    return { error: NextResponse.json({ error: '项目不存在' }, { status: 404 }) }
  }

  if (drama.userId === userId) {
    return { role: 'owner' }
  }

  const member = await db.dramaMember.findUnique({
    where: { dramaId_userId: { dramaId, userId } },
  })

  if (!member || member.status !== 'active') {
    return { error: NextResponse.json({ error: '无权访问此项目' }, { status: 403 }) }
  }

  return { role: member.role }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth()
    if (auth.error) return auth.error

    const { id: dramaId } = await params
    const access = await requireDramaAccess(dramaId, auth.userId)
    if ('error' in access) return access.error

    // ── Drama info ──
    const drama = await db.drama.findUnique({
      where: { id: dramaId },
      select: {
        id: true,
        title: true,
        genre: true,
        style: true,
        artStyle: true,
        totalEpisodes: true,
        status: true,
        createdAt: true,
        userId: true,
      },
    })

    if (!drama) {
      return NextResponse.json({ error: '项目不存在' }, { status: 404 })
    }

    // ── Episodes with pipeline progress ──
    const episodes = await db.episode.findMany({
      where: { dramaId },
      include: {
        storyboards: {
          select: {
            id: true,
            firstFrameUrl: true,
            lastFrameUrl: true,
            videoUrl: true,
            ttsAudioUrl: true,
            composedUrl: true,
            dialogue: true,
          },
        },
      },
      orderBy: { episodeNumber: 'asc' },
    })

    const episodeData = episodes.map((ep) => {
      const storyboards = ep.storyboards
      const total = storyboards.length

      // Compute 12-step pipeline progress (same logic as pipeline-status route)
      const steps: { completed: number; total: number }[] = [
        // script:raw
        { completed: ep.rawContent?.trim() ? 1 : 0, total: 1 },
        // script:rewrite
        { completed: ep.scriptContent?.trim() ? 1 : 0, total: 1 },
        // script:extract — will update below
        { completed: 0, total: 1 },
        // script:voice — will update below
        { completed: 0, total: 1 },
        // script:storyboard
        { completed: total > 0 ? 1 : 0, total: 1 },
        // prod:chars — will update below
        { completed: 0, total: 0 },
        // prod:scenes — will update below
        { completed: 0, total: 0 },
        // prod:dubbing
        {
          completed: storyboards.filter((s) => s.ttsAudioUrl).length,
          total: storyboards.filter((s) => s.dialogue).length || total,
        },
        // prod:shots
        {
          completed: storyboards.filter((s) => s.firstFrameUrl || s.lastFrameUrl).length,
          total,
        },
        // prod:videos
        {
          completed: storyboards.filter((s) => s.videoUrl).length,
          total,
        },
        // prod:compose
        {
          completed: storyboards.filter((s) => s.composedUrl).length,
          total,
        },
        // export:merge
        { completed: ep.videoUrl ? 1 : 0, total: 1 },
      ]

      const totalWeight = steps.reduce((sum, s) => sum + s.total, 0)
      const completedWeight = steps.reduce((sum, s) => sum + s.completed, 0)
      const pipelineProgress = totalWeight > 0 ? Math.round((completedWeight / totalWeight) * 100) : 0

      // Find current step
      let currentStep: string | null = null
      const stepLabels = [
        '原始内容', 'AI改写', '角色场景提取', '音色分配', '分镜生成',
        '角色形象', '场景图片', '配音生成', '镜头图片', '视频生成', '视频合成', '拼接导出',
      ]
      for (let i = 0; i < steps.length; i++) {
        if (steps[i]!.completed < steps[i]!.total) {
          currentStep = stepLabels[i]!
          break
        }
      }
      if (!currentStep && pipelineProgress === 100) {
        currentStep = '已完成'
      }

      const completedSteps = steps.filter((s) => s.completed >= s.total && s.total > 0).length

      return {
        id: ep.id,
        episodeNumber: ep.episodeNumber,
        title: ep.title,
        status: ep.status,
        pipelineProgress,
        currentStep,
        completedSteps,
        totalSteps: steps.length,
        hasVideo: !!ep.videoUrl,
      }
    })

    // ── Asset statistics ──
    const [characters, scenes, props, storyboards] = await Promise.all([
      db.character.findMany({
        where: { dramaId },
        select: { id: true, imageUrl: true },
      }),
      db.scene.findMany({
        where: { dramaId },
        select: { id: true, imageUrl: true, images: { select: { imageUrl: true } } },
      }),
      db.prop.findMany({
        where: { dramaId },
        select: { id: true, imageUrl: true },
      }),
      db.storyboard.findMany({
        where: { episode: { dramaId } },
        select: {
          id: true,
          firstFrameUrl: true,
          videoUrl: true,
          ttsAudioUrl: true,
          composedUrl: true,
        },
      }),
    ])

    const totalStoryboards = storyboards.length
    const assets = {
      totalCharacters: characters.length,
      charactersWithImages: characters.filter((c) => c.imageUrl).length,
      totalScenes: scenes.length,
      scenesWithImages: scenes.filter((s) => s.imageUrl || s.images.some((i) => i.imageUrl)).length,
      totalProps: props.length,
      propsWithImages: props.filter((p) => p.imageUrl).length,
      totalStoryboards,
      storyboardsWithFrames: storyboards.filter((s) => s.firstFrameUrl).length,
      storyboardsWithVideos: storyboards.filter((s) => s.videoUrl).length,
      storyboardsWithTts: storyboards.filter((s) => s.ttsAudioUrl).length,
      storyboardsComposed: storyboards.filter((s) => s.composedUrl).length,
    }

    // ── Generation costs ──
    const costRecords = await db.generationCost.findMany({
      where: { dramaId },
    })

    const totalCredits = costRecords.reduce((sum, r) => sum + r.credits, 0)
    const byCategory: Record<string, number> = { image: 0, video: 0, tts: 0, llm: 0 }
    for (const r of costRecords) {
      byCategory[r.category] = (byCategory[r.category] || 0) + r.credits
    }

    const costs = {
      totalCredits: Math.round(totalCredits * 100) / 100,
      byCategory: {
        image: Math.round((byCategory.image || 0) * 100) / 100,
        video: Math.round((byCategory.video || 0) * 100) / 100,
        tts: Math.round((byCategory.tts || 0) * 100) / 100,
        llm: Math.round((byCategory.llm || 0) * 100) / 100,
      },
    }

    // ── Team info ──
    const members = await db.dramaMember.findMany({
      where: { dramaId, status: 'active' },
      select: { role: true, userId: true },
    })

    const owner = await db.user.findUnique({
      where: { id: drama.userId },
      select: { name: true },
    })

    const roleCounts = { owner: 1, editor: 0, viewer: 0 } // owner is always 1
    for (const m of members) {
      if (m.role === 'editor') roleCounts.editor++
      else if (m.role === 'viewer') roleCounts.viewer++
      else if (m.role === 'owner') roleCounts.owner++
    }

    const team = {
      totalMembers: 1 + members.length, // owner + members
      ownerName: owner?.name || '未知',
      roles: roleCounts,
    }

    // ── Recent activity ──
    const [recentComments, recentImages] = await Promise.all([
      db.comment.findMany({
        where: { dramaId },
        include: { user: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      db.imageGeneration.findMany({
        where: { dramaId, status: 'completed' },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          prompt: true,
          frameType: true,
          createdAt: true,
        },
      }),
    ])

    const recentActivity: Array<{
      type: 'comment' | 'image' | 'video' | 'tts'
      description: string
      userName: string
      createdAt: string
    }> = []

    for (const c of recentComments) {
      recentActivity.push({
        type: 'comment',
        description: c.content.length > 60 ? c.content.slice(0, 60) + '...' : c.content,
        userName: c.user.name,
        createdAt: c.createdAt.toISOString(),
      })
    }

    for (const ig of recentImages) {
      const category: 'image' | 'video' | 'tts' =
        ig.frameType === 'storyboard_frame' ? 'image' : 'image'
      recentActivity.push({
        type: category,
        description: `${ig.frameType || '图片'}生成: ${(ig.prompt || '').slice(0, 40)}...`,
        userName: 'AI',
        createdAt: ig.createdAt.toISOString(),
      })
    }

    // Sort by most recent
    recentActivity.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    // ── Return ──
    return NextResponse.json({
      drama: {
        id: drama.id,
        title: drama.title,
        genre: drama.genre,
        style: drama.style,
        artStyle: drama.artStyle,
        totalEpisodes: drama.totalEpisodes,
        status: drama.status,
        createdAt: drama.createdAt.toISOString(),
      },
      episodes: episodeData,
      assets,
      costs,
      team,
      recentActivity: recentActivity.slice(0, 10),
    })
  } catch (error) {
    console.error('Failed to get dashboard data:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
