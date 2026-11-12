import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helpers'
import { userIdContext } from '@/lib/ai-config'
import { db } from '@/lib/db'
import { generateStoryboardPrompt, type PromptMode } from '@/lib/storyboard-prompt-templates'

// ============================================================
// POST /api/ai/polish-storyboard-prompts
// Body: { episodeId, videoModel?, mode? }
// Generates model-aware image + video prompts for all storyboards in an episode
// ============================================================

export const maxDuration = 300

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const body = await request.json().catch(() => ({}))
  const { episodeId, videoModel, mode } = body as {
    episodeId?: string
    videoModel?: string
    mode?: PromptMode
  }

  if (!episodeId) {
    return NextResponse.json({ error: '缺少 episodeId' }, { status: 400 })
  }

  const episode = await db.episode.findUnique({
    where: { id: episodeId },
    include: {
      drama: {
        select: { userId: true },
      },
      storyboards: {
        orderBy: { shotNumber: 'asc' },
      },
    },
  })

  if (!episode) {
    return NextResponse.json({ error: 'Episode not found' }, { status: 404 })
  }

  // Access control: owner or admin
  if (episode.drama.userId && episode.drama.userId !== auth.userId && auth.role !== 'admin') {
    return NextResponse.json({ error: '无权访问此项目' }, { status: 403 })
  }

  // Fetch drama-level assets for reference (characters, scenes, props)
  const [characters, scenes, props] = await Promise.all([
    db.character.findMany({ where: { dramaId: episode.dramaId } }),
    db.scene.findMany({ where: { dramaId: episode.dramaId } }),
    db.prop.findMany({ where: { dramaId: episode.dramaId } }),
  ])

  return userIdContext.run(auth.userId, async () => {
    const updated: Array<{ id: string; imagePrompt: string; videoPrompt: string }> = []

    for (const sb of episode.storyboards) {
      // Build associated assets list from storyboard dialogue characters + scenes
      const associatedAssets: Array<{ id: string; name: string; type: 'character' | 'scene' | 'prop' }> = []

      // Add scene — Storyboard has no scene field; use title (often encodes scene info)
      // and try to match it against drama scenes by location.
      const sceneAnchorCandidate = sb.title || sb.description || ''
      const matchedScene = scenes.find(
        (s) => sceneAnchorCandidate.includes(s.location) || (s.description && sceneAnchorCandidate.includes(s.description))
      )
      if (matchedScene) {
        associatedAssets.push({ id: matchedScene.id, name: matchedScene.location, type: 'scene' })
      }

      // Add character mentioned in dialogue
      if (sb.dialogueChar) {
        const char = characters.find((c) => c.name === sb.dialogueChar)
        if (char) {
          associatedAssets.push({ id: char.id, name: char.name, type: 'character' })
        }
      }

      // Resolve the scene anchor string
      const sceneAnchor = matchedScene?.location || sb.title || ''

      const generated = generateStoryboardPrompt(
        {
          // Storyboard has no dedicated shot description field; prefer action then description
          shotDescription: sb.action || sb.description || '',
          sceneAnchor,
          shotType: sb.shotType || '',
          cameraMovement: sb.cameraMovement || '',
          characterAction: sb.action || '',
          // Storyboard has no separate emotion/lighting fields; atmosphere covers both
          emotion: sb.atmosphere || '',
          lighting: sb.atmosphere || '',
          dialogue: sb.dialogue || '',
          soundEffect: sb.soundEffect || '',
          associatedAssets,
          duration: sb.duration || 5,
        },
        { videoModel, mode }
      )

      await db.storyboard.update({
        where: { id: sb.id },
        data: {
          imagePrompt: generated.imagePrompt,
          videoPrompt: generated.videoPrompt,
        },
      })

      updated.push({ id: sb.id, imagePrompt: generated.imagePrompt, videoPrompt: generated.videoPrompt })
    }

    return NextResponse.json({
      success: true,
      updated: updated.length,
      mode: mode || (videoModel ? 'auto-detected' : 'text-only'),
      storyboards: updated,
    })
  })
}
