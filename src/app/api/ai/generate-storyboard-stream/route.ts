import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { aiClient, AI_SYSTEM_PROMPTS } from '@/lib/ai-config'
import { requireAuth } from '@/lib/auth-helpers'

interface StoryboardShot {
  shotNumber: number
  title: string
  shotType: string
  cameraAngle: string
  cameraMovement: string
  action: string
  dialogue?: string | null
  dialogueChar?: string | null
  duration: number
  imagePrompt?: string | null
  videoPrompt?: string | null
  atmosphere?: string | null
}

// POST /api/ai/generate-storyboard-stream - AI Generate Storyboard with SSE progress
export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { episodeId } = await request.json()

  if (!episodeId) {
    return new Response(JSON.stringify({ error: 'episodeId is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const encoder = new TextEncoder()
  let closed = false

  const sendEvent = (data: unknown) => {
    if (closed) return
    return `data: ${JSON.stringify(data)}\n\n`
  }

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Step 1: Validate
        controller.enqueue(encoder.encode(sendEvent({
          step: 'validating',
          message: '正在验证剧本内容...',
          progress: 5,
        })))

        const episode = await db.episode.findUnique({
          where: { id: episodeId },
          include: {
            drama: {
              include: {
                characters: true,
                scenes: true,
              },
            },
          },
        })

        if (!episode) {
          controller.enqueue(encoder.encode(sendEvent({
            step: 'error',
            message: '未找到该集',
            progress: 0,
          })))
          controller.close()
          closed = true
          return
        }

        if (!episode.scriptContent) {
          controller.enqueue(encoder.encode(sendEvent({
            step: 'error',
            message: '该集没有剧本内容，请先进行AI改写',
            progress: 0,
          })))
          controller.close()
          closed = true
          return
        }

        // Step 2: Set processing
        await db.episode.update({
          where: { id: episodeId },
          data: { storyboardStatus: 'processing' },
        })

        controller.enqueue(encoder.encode(sendEvent({
          step: 'analyzing',
          message: 'AI正在分析剧本和角色场景信息...',
          progress: 15,
        })))

        // Step 3: Build prompt
        const charactersInfo = episode.drama.characters
          .map(
            (c) =>
              `${c.name}(${c.role}, ${c.gender}${c.appearance ? ', ' + c.appearance : ''})`
          )
          .join('\n')

        const scenesInfo = episode.drama.scenes
          .map(
            (s) =>
              `${s.location}(${s.timeOfDay}${s.description ? ', ' + s.description : ''})`
          )
          .join('\n')

        const userContent = `剧本内容：\n${episode.scriptContent}\n\n${charactersInfo ? `角色列表：\n${charactersInfo}\n` : ''}${scenesInfo ? `场景列表：\n${scenesInfo}` : ''}`

        // Step 4: Call LLM
        controller.enqueue(encoder.encode(sendEvent({
          step: 'generating',
          message: 'AI正在生成分镜镜头...',
          progress: 30,
        })))

        const messages = [
          { role: 'system' as const, content: AI_SYSTEM_PROMPTS.STORYBOARD },
          { role: 'user' as const, content: userContent },
        ]

        const shots = await aiClient.chatJson<StoryboardShot[]>(messages, {
          temperature: 0.5,
        }, auth.userId)

        // Step 5: Delete existing storyboards
        controller.enqueue(encoder.encode(sendEvent({
          step: 'clearing',
          message: '正在清除旧分镜数据...',
          progress: 50,
        })))

        await db.storyboard.deleteMany({
          where: { episodeId },
        })

        // Step 6: Save storyboards one by one
        controller.enqueue(encoder.encode(sendEvent({
          step: 'saving',
          message: `正在保存 ${shots.length} 个分镜镜头...`,
          progress: 55,
          detail: { totalShots: shots.length },
        })))

        const savedStoryboards = []
        for (let i = 0; i < shots.length; i++) {
          const shot = shots[i]
          const saved = await db.storyboard.create({
            data: {
              episodeId,
              shotNumber: shot.shotNumber || savedStoryboards.length + 1,
              title: shot.title || '',
              shotType: shot.shotType || 'medium',
              cameraAngle: shot.cameraAngle || 'eye-level',
              cameraMovement: shot.cameraMovement || 'static',
              action: shot.action || '',
              dialogue: shot.dialogue || null,
              dialogueChar: shot.dialogueChar || null,
              duration: shot.duration ?? 3.0,
              imagePrompt: shot.imagePrompt || null,
              videoPrompt: shot.videoPrompt || null,
              atmosphere: shot.atmosphere || null,
            },
          })
          savedStoryboards.push(saved)

          // Send progress for each shot saved
          const shotProgress = 55 + Math.round((i + 1) / shots.length * 40)
          controller.enqueue(encoder.encode(sendEvent({
            step: 'saving',
            message: `正在保存镜头 ${i + 1}/${shots.length}：${shot.title || '未命名'}`,
            progress: shotProgress,
            detail: { currentShot: i + 1, totalShots: shots.length, shotTitle: shot.title },
          })))
        }

        // Step 7: Complete
        await db.episode.update({
          where: { id: episodeId },
          data: { storyboardStatus: 'completed' },
        })

        controller.enqueue(encoder.encode(sendEvent({
          step: 'completed',
          message: `分镜生成完成！共 ${savedStoryboards.length} 个镜头`,
          progress: 100,
          result: { storyboards: savedStoryboards },
        })))

        controller.close()
        closed = true
      } catch (error) {
        await db.episode.update({
          where: { id: episodeId },
          data: { storyboardStatus: 'failed' },
        }).catch(() => {})

        const message = error instanceof Error ? error.message : 'Failed to generate storyboard'
        controller.enqueue(encoder.encode(sendEvent({
          step: 'error',
          message,
          progress: 0,
        })))
        controller.close()
        closed = true
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
