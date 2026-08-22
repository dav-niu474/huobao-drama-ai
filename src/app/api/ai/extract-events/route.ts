// ============================================================
// POST /api/ai/extract-events — Event Extraction Agent
// Inspired by Toonflow's event-graph extraction pattern.
//
// Loads a Drama's Novel (chapters), invokes the `event_extractor`
// agent (text-only output, | delimited, 7 fields per chapter),
// parses the lines into structured events, and persists the
// result into Novel.parsedContent under the `events` key
// (merged with any existing parsed skeleton/strategy data).
// ============================================================

// Allow up to 5 minutes for AI extraction
export const maxDuration = 300

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { userIdContext } from '@/lib/ai-config'
import { executeAgent } from '@/lib/agents/factory'

// ============================================================
// Types
// ============================================================

export interface NovelChapter {
  index: number
  title: string
  content: string
}

export interface ExtractedEvent {
  chapter: string
  characters: string
  event: string
  mainline: string
  density: string
  estimatedDuration: string
  emotion: string
}

// ============================================================
// Parser — turn agent's | delimited text output into structured events
// ============================================================

/**
 * Parse the event_extractor agent's text response into structured events.
 * Only lines that start with `|` are considered. Each line is split on `|`
 * and the first 7 non-empty trimmed segments are taken as the 7 fields.
 */
function parseEventLines(text: string): ExtractedEvent[] {
  const events: ExtractedEvent[] = []
  if (!text) return events

  const lines = text.split('\n')
  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line.startsWith('|')) continue

    // Split on | and trim each segment; drop empty leading/trailing pieces
    const parts = line
      .split('|')
      .map((s) => s.trim())
      // Remove the empty string before the first | and after the last |
      .filter((s, idx, arr) => {
        // Keep all non-empty parts
        if (s.length > 0) return true
        // Drop empty parts (they come from leading/trailing/multiple `|`)
        // But preserve meaningful empties only if necessary — here we just drop
        // them, since the agent spec says each field must be filled.
        void idx
        void arr
        return false
      })

    if (parts.length < 7) continue

    const [chapter, characters, event, mainline, density, estimatedDuration, emotion] = parts
    events.push({
      chapter,
      characters,
      event,
      mainline,
      density,
      estimatedDuration,
      emotion,
    })
  }

  return events
}

// ============================================================
// POST handler
// ============================================================

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (auth.error) return auth.error

    return await userIdContext.run(auth.userId, async () => {
      const body = (await request.json()) as {
        dramaId?: string
        chapterRange?: { start: number; end: number }
      }

      const { dramaId, chapterRange } = body

      if (!dramaId) {
        return NextResponse.json(
          { error: 'dramaId is required' },
          { status: 400 }
        )
      }

      // Verify drama exists and user has access
      const drama = await db.drama.findUnique({
        where: { id: dramaId },
        select: { id: true, userId: true },
      })

      if (!drama) {
        return NextResponse.json(
          { error: '项目不存在' },
          { status: 404 }
        )
      }

      if (
        drama.userId &&
        drama.userId !== auth.userId &&
        auth.role !== 'admin'
      ) {
        return NextResponse.json(
          { error: '无权操作' },
          { status: 403 }
        )
      }

      // Fetch novel by dramaId (dramaId is unique on Novel)
      const novel = await db.novel.findUnique({ where: { dramaId } })

      if (!novel) {
        return NextResponse.json(
          { error: '该项目还没有小说原文，请先在剧本工坊上传' },
          { status: 400 }
        )
      }

      // Parse chapters
      let chapters: NovelChapter[] = []
      try {
        chapters = JSON.parse(novel.chapters)
      } catch {
        return NextResponse.json(
          { error: '小说章节数据格式错误' },
          { status: 500 }
        )
      }

      if (!Array.isArray(chapters) || chapters.length === 0) {
        return NextResponse.json(
          { error: '小说章节为空，请先在剧本工坊上传' },
          { status: 400 }
        )
      }

      // Apply chapter range filter (1-indexed, inclusive on both ends)
      if (
        chapterRange &&
        typeof chapterRange.start === 'number' &&
        typeof chapterRange.end === 'number'
      ) {
        const start = Math.max(1, chapterRange.start)
        const end = Math.min(chapters.length, chapterRange.end)
        if (start > end) {
          return NextResponse.json(
            { error: 'chapterRange 无效：start 不能大于 end' },
            { status: 400 }
          )
        }
        chapters = chapters.filter(
          (ch) => ch.index + 1 >= start && ch.index + 1 <= end
        )
      }

      if (chapters.length === 0) {
        return NextResponse.json(
          { error: '筛选后没有可处理的章节' },
          { status: 400 }
        )
      }

      // Process chapters in groups of GROUP_SIZE to avoid context overflow
      // and to mirror the chunking approach used by novel-parser.ts.
      const GROUP_SIZE = 5
      const allEvents: ExtractedEvent[] = []

      for (let i = 0; i < chapters.length; i += GROUP_SIZE) {
        const group = chapters.slice(i, i + GROUP_SIZE)
        const chaptersText = group
          .map((ch) => `# 第${ch.index + 1}章 ${ch.title}\n\n${ch.content}`)
          .join('\n\n---\n\n')

        const prompt =
          `请为以下小说章节提取结构化事件，每章输出一行，使用 | 分隔，恰好 7 个字段。\n\n` +
          `## 章节内容\n\n${chaptersText}`

        const result = await executeAgent(
          'event_extractor',
          dramaId,
          dramaId,
          prompt,
          undefined,
          { userId: auth.userId }
        )

        const parsed = parseEventLines(result.text)
        allEvents.push(...parsed)
      }

      // Merge with existing parsed content (preserve skeleton/strategy data)
      let existingParsed: Record<string, unknown> = {}
      try {
        existingParsed = JSON.parse(novel.parsedContent || '{}')
        if (
          typeof existingParsed !== 'object' ||
          Array.isArray(existingParsed) ||
          existingParsed === null
        ) {
          existingParsed = {}
        }
      } catch {
        existingParsed = {}
      }
      existingParsed.events = allEvents
      existingParsed.eventsUpdatedAt = new Date().toISOString()
      existingParsed.eventsChapterRange = chapterRange ?? null

      await db.novel.update({
        where: { id: novel.id },
        data: {
          parsedContent: JSON.stringify(existingParsed),
        },
      })

      return NextResponse.json({ events: allEvents })
    })
  } catch (error: any) {
    const errMsg = error?.message || (error instanceof Error ? error.message : String(error))
    console.error('[extract-events] POST failed:', errMsg)

    // If the error message already looks user-friendly (HTTP / 供应商 / 模型 / API Key),
    // surface it as-is; otherwise wrap it with a friendlier prefix.
    const isFriendly =
      typeof errMsg === 'string' &&
      (errMsg.includes('HTTP') ||
        errMsg.includes('供应商') ||
        errMsg.includes('模型') ||
        errMsg.includes('API Key'))

    return NextResponse.json(
      { error: isFriendly ? errMsg : `事件提取失败: ${errMsg}` },
      { status: 500 }
    )
  }
}
