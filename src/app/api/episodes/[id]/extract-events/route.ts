import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helpers'
import { userIdContext, aiClient } from '@/lib/ai-config'
import { db } from '@/lib/db'
import { splitChapters } from '@/lib/novel-parser'

// Allow up to 5 minutes for AI extraction
export const maxDuration = 300

// ============================================================
// /api/episodes/[id]/extract-events
//
// Iterates over the episode's chapters (stored as JSON inside
// episode.sourceChapterIds by the /novel endpoint), invokes
// the LLM in groups of 5 chapters, parses the `|`-delimited
// response into structured events, and persists them back into
// sourceChapterIds alongside the chapter content.
// ============================================================

export interface EpisodeChapter {
  index: number
  title: string
  content: string
  event?: string
  characters?: string
  mainline?: string
  density?: string
  estimatedDuration?: string
  emotion?: string
}

export interface ExtractedEvent {
  chapterIndex: number
  title: string
  event: string
  characters: string
  mainline: string
  density: string
  estimatedDuration: string
  emotion: string
}

// ── Parser ────────────────────────────────────────────────────
// The LLM is asked to emit a markdown table where each data row
// looks like:
//   | 第X章 标题 | 角色 | 事件 | 主线 | 密度 | 时长 | 情绪 |
// We split on `|`, drop empties, and take the first 7 fields.
function parseEventLines(
  text: string,
  fallbackChapters: EpisodeChapter[],
  groupStart: number
): ExtractedEvent[] {
  const events: ExtractedEvent[] = []
  if (!text) return events

  const lines = text.split('\n')
  let fallbackIdx = groupStart
  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line.startsWith('|')) continue
    if (line.includes('---')) continue

    const fields = line
      .split('|')
      .map((f) => f.trim())
      .filter((f) => f.length > 0)

    if (fields.length < 7) continue

    const [chapterField, characters, event, mainline, density, estimatedDuration, emotion] = fields

    const chapterMatch = chapterField.match(/第\s*(\d+)\s*[章回节]\s*(.*)/)
    if (chapterMatch) {
      events.push({
        chapterIndex: parseInt(chapterMatch[1], 10),
        title: chapterMatch[2].trim() || chapterField,
        event,
        characters,
        mainline,
        density,
        estimatedDuration,
        emotion,
      })
    } else {
      // No "第X章" prefix — fall back to the group's order
      const fallback = fallbackChapters[fallbackIdx - groupStart]
      events.push({
        chapterIndex: fallback?.index ?? fallbackIdx,
        title: fallback?.title ?? chapterField,
        event,
        characters,
        mainline,
        density,
        estimatedDuration,
        emotion,
      })
    }
    fallbackIdx += 1
  }
  return events
}

// POST /api/episodes/[id]/extract-events
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const { id: episodeId } = await params

  const episode = await db.episode.findUnique({
    where: { id: episodeId },
    include: { drama: { select: { userId: true, id: true } } },
  })

  if (!episode) {
    return NextResponse.json({ error: 'Episode not found' }, { status: 404 })
  }
  if (
    episode.drama.userId &&
    episode.drama.userId !== auth.userId &&
    auth.role !== 'admin'
  ) {
    return NextResponse.json({ error: '无权访问' }, { status: 403 })
  }

  // Load chapters — try stored JSON first, then re-split rawContent
  let chapters: EpisodeChapter[] = []
  try {
    const parsed = JSON.parse(episode.sourceChapterIds || '[]')
    if (Array.isArray(parsed) && parsed.length > 0 && parsed[0]?.title) {
      chapters = parsed
    } else if (episode.rawContent) {
      chapters = splitChapters(episode.rawContent)
    }
  } catch {
    if (episode.rawContent) {
      chapters = splitChapters(episode.rawContent)
    }
  }

  if (chapters.length === 0) {
    return NextResponse.json(
      { error: '没有章节内容，请先导入小说原文' },
      { status: 400 }
    )
  }

  return await userIdContext.run(auth.userId, async () => {
    const events: ExtractedEvent[] = []

    // Process chapters in groups of 5 to keep prompts small and
    // surface progress to the user in chunks.
    const GROUP_SIZE = 5
    for (let i = 0; i < chapters.length; i += GROUP_SIZE) {
      const group = chapters.slice(i, i + GROUP_SIZE)
      const groupText = group
        .map(
          (ch) =>
            `## 第${ch.index + 1}章 ${ch.title}\n\n${ch.content}`
        )
        .join('\n\n---\n\n')

      const systemPrompt = `你是小说事件提取专家。为每章提取结构化事件摘要。

输出格式（每章一行，使用 | 分隔，恰好 7 个字段）：
| 章节 | 涉及角色 | 核心事件 | 主线关系 | 信息密度 | 预估时长 | 情绪强度 |
| 第X章 标题 | 角色A、角色B | 30-60字事件描述 | 强/中/弱(理由) | 高/中/低 | X秒 | 标签+标签 |

只输出数据行（以 | 开头），不要其他文字、不要解释。`

      try {
        const response = await aiClient.chat(groupText, systemPrompt, {
          temperature: 0.3,
        })
        const parsed = parseEventLines(response, group, i)
        if (parsed.length === 0) {
          // No parseable rows — record failure for each chapter in this group
          for (const ch of group) {
            events.push({
              chapterIndex: ch.index,
              title: ch.title,
              event: '提取失败: 未识别到事件行',
              characters: '',
              mainline: '',
              density: '',
              estimatedDuration: '',
              emotion: '',
            })
          }
        } else {
          events.push(...parsed)
        }
      } catch (err: any) {
        console.error(
          `[extract-events] Group ${i}-${i + GROUP_SIZE} failed:`,
          err?.message
        )
        for (const ch of group) {
          events.push({
            chapterIndex: ch.index,
            title: ch.title,
            event: '提取失败: ' + (err?.message || '未知错误'),
            characters: '',
            mainline: '',
            density: '',
            estimatedDuration: '',
            emotion: '',
          })
        }
      }
    }

    // Merge extracted events back into the stored chapter list so the
    // table view can show them per-row.
    const updatedChapters: EpisodeChapter[] = chapters.map((ch) => {
      const evt = events.find((e) => e.chapterIndex === ch.index)
      return {
        index: ch.index,
        title: ch.title,
        content: ch.content,
        event: evt?.event || '',
        characters: evt?.characters || '',
        mainline: evt?.mainline || '',
        density: evt?.density || '',
        estimatedDuration: evt?.estimatedDuration || '',
        emotion: evt?.emotion || '',
      }
    })

    await db.episode.update({
      where: { id: episodeId },
      data: {
        sourceChapterIds: JSON.stringify(updatedChapters),
      },
    })

    return NextResponse.json({
      success: true,
      events,
      chapters: updatedChapters,
      chapterCount: chapters.length,
    })
  })
}
