// ============================================================
// Novel Parser Library
// Supports: .txt (UTF-8), .docx (via mammoth)
// Splits text into chapters by Chinese/English chapter patterns
// Extracts events from chapters via AI agent (story_skeleton)
// ============================================================

import { EventEmitter } from 'events'
import { db } from '@/lib/db'

// ============================================================
// Types
// ============================================================

export interface Chapter {
  index: number
  title: string
  content: string
}

export interface ParseProgress {
  current: number
  total: number
  message: string
}

// ============================================================
// parseNovelFile — Extract text from .txt / .docx
// ============================================================

export async function parseNovelFile(
  buffer: Buffer,
  fileName: string
): Promise<string> {
  const ext = fileName.toLowerCase().split('.').pop()

  if (ext === 'txt') {
    // Decode as UTF-8 text
    return buffer.toString('utf-8')
  }

  if (ext === 'docx') {
    // Use mammoth to extract text from .docx
    const mammoth = await import('mammoth')
    const result = await mammoth.extractRawText({ buffer })
    return result.value
  }

  throw new Error(`Unsupported file type: .${ext}. Only .txt and .docx are supported.`)
}

// ============================================================
// splitChapters — Split novel text into chapters
// ============================================================

// Chinese chapter patterns (ordered by specificity — most specific first)
const CHAPTER_PATTERNS = [
  // Level 1: 标准"第X章/回/节/卷/部/篇/集"格式（含中文数字、阿拉伯数字、〇字）
  /^[\s]*第[零〇一二三四五六七八九十百千万\d]+[章回节卷部篇集][\s\t]*[：:·\-\s]?\s*\S?.*$/gm,
  // Level 2: 纯中文数字章节（如"一、"、"十二、"）
  /^[\s]*[一二三四五六七八九十百千万]+[、．\.]\s*\S?.*$/gm,
  // Level 3: 阿拉伯数字编号（如"1."、"1、"、"第1节"）
  /^[\s]*\d+[\.\、]\s*\S?.*$/gm,
  // Level 4: 英文 Chapter X
  /^[\s]*Chapter\s+\d+[\s\S]*$/gim,
  // Level 5: 【标题】括号格式
  /^[\s]*【[^】]+】[\s]*$/gm,
  // Level 6: 独立短行（5-30字，不以标点结尾，前后有空行——启发式章节标题）
  /^[\s]*[^\n]{2,30}[\s]*$/gm,
]

// 验证匹配到的行是否真的像章节标题（排除正文误匹配）
function isValidChapterTitle(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed) return false

  // 包含典型章节关键词 → 一定是标题
  if (/^第[零〇一二三四五六七八九十百千万\d]+[章回节卷部篇集]/.test(trimmed)) return true
  if (/^Chapter\s+\d+/i.test(trimmed)) return true
  if (/^【[^】]+】$/.test(trimmed)) return true
  if (/^\d+[\.\、]/.test(trimmed)) return true
  if (/^[一二三四五六七八九十百千万]+[、．\.]/.test(trimmed)) return true

  // 启发式：短行且不以常见句末标点结尾
  if (trimmed.length <= 30 && !/[。，！？；：…、""''）】》]$/.test(trimmed)) {
    // 进一步排除：全是数字或太短
    if (/^\d+$/.test(trimmed) && trimmed.length > 3) return false
    if (trimmed.length < 2) return false
    return true
  }

  return false
}

export function splitChapters(text: string): Chapter[] {
  if (!text || text.trim().length === 0) {
    return []
  }

  // Try each pattern until we find one that produces valid chapter splits
  for (const pattern of CHAPTER_PATTERNS) {
    const source = pattern.source
    const flags = pattern.flags
    // Reset regex by creating a new one each iteration
    const regex = new RegExp(source, flags)
    const matches = [...text.matchAll(regex)]

    // Filter matches to only valid chapter titles
    const validMatches = matches.filter((m) => isValidChapterTitle(m[0]))

    if (validMatches.length >= 2) {
      const chapters: Chapter[] = []
      for (let i = 0; i < validMatches.length; i++) {
        const startIdx = validMatches[i].index!
        const endIdx = i + 1 < validMatches.length ? validMatches[i + 1].index! : text.length
        const title = validMatches[i][0].trim()
        const content = text.slice(startIdx + validMatches[i][0].length, endIdx).trim()
        // Skip empty chapters (title-only matches with no content)
        if (content.length > 0) {
          chapters.push({ index: chapters.length, title, content })
        }
      }
      // Only return if we got at least 2 real chapters
      if (chapters.length >= 2) return chapters
    }
  }

  // Fallback: No chapter pattern found — split by ~8000 char chunks at paragraph boundary
  // Use the first meaningful line as the chunk title instead of "片段 N"
  const CHUNK_SIZE = 8000
  const chapters: Chapter[] = []
  let idx = 0

  while (idx < text.length) {
    let endIdx = Math.min(idx + CHUNK_SIZE, text.length)

    // Try to break at paragraph boundary (double newline)
    if (endIdx < text.length) {
      const lastParagraphBreak = text.lastIndexOf('\n\n', endIdx)
      if (lastParagraphBreak > idx + CHUNK_SIZE * 0.5) {
        endIdx = lastParagraphBreak
      }
    }

    const content = text.slice(idx, endIdx).trim()
    if (content.length > 0) {
      // Extract title from the first non-empty line of the chunk
      const firstLine = content.split('\n').find((l) => l.trim().length > 0)?.trim() || ''
      // Limit title length, remove common prefixes
      let title = firstLine.length > 40 ? firstLine.slice(0, 40) + '...' : firstLine
      // If first line looks like a chapter heading, use it; otherwise "第N部分"
      const chunkNum = chapters.length + 1
      if (title.length < 2) {
        title = `第${chunkNum}部分`
      }

      chapters.push({
        index: chapters.length,
        title,
        content,
      })
    }
    idx = endIdx
  }

  return chapters
}

// ============================================================
// extractChapterEvents — AI-based event extraction
// Uses story_skeleton agent to extract events from chapter groups
// ============================================================

export async function extractChapterEvents(
  chapters: Chapter[],
  agentType: string,
  dramaId: string,
  emitter?: EventEmitter
): Promise<Record<string, unknown>> {
  const GROUP_SIZE = 5
  const groups: Chapter[][] = []

  // Group chapters (5 per group)
  for (let i = 0; i < chapters.length; i += GROUP_SIZE) {
    groups.push(chapters.slice(i, i + GROUP_SIZE))
  }

  const totalGroups = groups.length
  const allEvents: Record<string, unknown> = {}

  emitter?.emit('progress', {
    current: 0,
    total: totalGroups,
    message: `开始解析，共 ${chapters.length} 章，分为 ${totalGroups} 组`,
  } as ParseProgress)

  for (let g = 0; g < groups.length; g++) {
    const group = groups[g]
    const chapterRange = `第${group[0].index + 1}-${group[group.length - 1].index + 1}章`

    emitter?.emit('progress', {
      current: g,
      total: totalGroups,
      message: `正在解析 ${chapterRange}...`,
    } as ParseProgress)

    // Build the prompt content for this group
    const chaptersText = group
      .map((ch) => `## ${ch.title}\n\n${ch.content}`)
      .join('\n\n---\n\n')

    const prompt = `请分析以下小说章节，提取故事骨架信息，包括：核心设定、关键事件、人物关系、情感弧线、改编建议。

${chaptersText}`

    try {
      // Call the agent via the internal API
      // We use the agent stream route internally
      const result = await callStorySkeletonAgent(agentType, dramaId, prompt)

      // Store result keyed by chapter range
      allEvents[`group_${g + 1}`] = {
        chapters: group.map((ch) => ch.index),
        chapterRange,
        result,
      }
    } catch (error) {
      console.error(`[novel-parser] Failed to extract events for ${chapterRange}:`, error)
      allEvents[`group_${g + 1}`] = {
        chapters: group.map((ch) => ch.index),
        chapterRange,
        error: error instanceof Error ? error.message : String(error),
      }
    }

    emitter?.emit('progress', {
      current: g + 1,
      total: totalGroups,
      message: `已完成 ${chapterRange} 的解析 (${g + 1}/${totalGroups})`,
    } as ParseProgress)
  }

  return allEvents
}

// ============================================================
// Internal: Call story_skeleton agent via DB + LLM
// ============================================================

async function callStorySkeletonAgent(
  agentType: string,
  dramaId: string,
  message: string
): Promise<string> {
  // Import agent execution dynamically
  const { executeAgent } = await import('@/lib/agents/factory')

  // Create a dummy episodeId since story_skeleton doesn't need a specific episode
  // We use dramaId as a reference
  const result = await executeAgent(
    agentType as 'story_skeleton',
    dramaId, // episodeId placeholder — story_skeleton doesn't use it for DB reads
    dramaId,
    message
  )

  return result.text
}
