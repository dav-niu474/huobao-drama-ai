import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { aiClient, userIdContext, AI_SYSTEM_PROMPTS } from '@/lib/ai-config'
import { requireAuth } from '@/lib/auth-helpers'

// POST /api/ai/extract-stream - AI Extract Characters & Scenes with SSE progress
export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  return await userIdContext.run(auth.userId, async () => {
  const { episodeId, dramaId } = await request.json()

  if (!episodeId || !dramaId) {
    return new Response(JSON.stringify({ error: 'episodeId and dramaId are required' }), {
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
        // Step 1: Validate episode
        controller.enqueue(encoder.encode(sendEvent({
          step: 'validating',
          message: '正在验证剧本内容...',
          progress: 5,
        })))

        const episode = await db.episode.findUnique({ where: { id: episodeId } })
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

        // Step 2: Set processing status
        await db.episode.update({
          where: { id: episodeId },
          data: { extractStatus: 'processing' },
        })

        controller.enqueue(encoder.encode(sendEvent({
          step: 'analyzing',
          message: 'AI正在分析剧本内容...',
          progress: 15,
        })))

        // Step 3: Call LLM for extraction
        controller.enqueue(encoder.encode(sendEvent({
          step: 'extracting',
          message: 'AI正在提取角色和场景信息...',
          progress: 30,
        })))

        interface ExtractedData {
          characters: Array<{
            name: string
            role: string
            gender: string
            appearance: string
            personality: string
          }>
          scenes: Array<{
            location: string
            timeOfDay: string
            description: string
            prompt: string
          }>
        }

        const messages = [
          { role: 'system' as const, content: AI_SYSTEM_PROMPTS.EXTRACT },
          { role: 'user' as const, content: episode.scriptContent },
        ]

        const extracted = await aiClient.chatJson<ExtractedData>(messages, {
          temperature: 0.3,
        })

        const { characters = [], scenes = [] } = extracted

        // Step 4: Save characters
        controller.enqueue(encoder.encode(sendEvent({
          step: 'saving-characters',
          message: `正在保存 ${characters.length} 个角色...`,
          progress: 55,
          detail: { characterCount: characters.length },
        })))

        const savedCharacters = []
        for (let i = 0; i < characters.length; i++) {
          const char = characters[i]
          const saved = await db.character.create({
            data: {
              dramaId,
              name: char.name || 'Unknown',
              role: char.role || 'supporting',
              gender: char.gender || 'unknown',
              appearance: char.appearance || '',
              personality: char.personality || '',
            },
          })
          savedCharacters.push(saved)

          // Send progress update for each character saved
          const charProgress = 55 + Math.round((i + 1) / characters.length * 15)
          controller.enqueue(encoder.encode(sendEvent({
            step: 'saving-characters',
            message: `正在保存角色 (${i + 1}/${characters.length})...`,
            progress: charProgress,
          })))
        }

        // Step 5: Save scenes
        controller.enqueue(encoder.encode(sendEvent({
          step: 'saving-scenes',
          message: `正在保存 ${scenes.length} 个场景...`,
          progress: 75,
          detail: { sceneCount: scenes.length },
        })))

        const savedScenes = []
        for (let i = 0; i < scenes.length; i++) {
          const scene = scenes[i]
          const saved = await db.scene.create({
            data: {
              dramaId,
              location: scene.location || 'Unknown',
              timeOfDay: scene.timeOfDay || 'day',
              description: scene.description || '',
              prompt: scene.prompt || '',
            },
          })
          savedScenes.push(saved)

          const sceneProgress = 75 + Math.round((i + 1) / scenes.length * 15)
          controller.enqueue(encoder.encode(sendEvent({
            step: 'saving-scenes',
            message: `正在保存场景 (${i + 1}/${scenes.length})...`,
            progress: sceneProgress,
          })))
        }

        // Step 6: Complete
        await db.episode.update({
          where: { id: episodeId },
          data: { extractStatus: 'completed' },
        })

        controller.enqueue(encoder.encode(sendEvent({
          step: 'completed',
          message: '提取完成！',
          progress: 100,
          result: { characters: savedCharacters, scenes: savedScenes },
        })))

        controller.close()
        closed = true
      } catch (error) {
        // Update episode status to failed
        await db.episode.update({
          where: { id: episodeId },
          data: { extractStatus: 'failed' },
        }).catch(() => {})

        const message = error instanceof Error ? error.message : 'Failed to extract'
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
  })
}
