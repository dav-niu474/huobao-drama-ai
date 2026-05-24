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

// Chinese chapter patterns (ordered by specificity)
const CHAPTER_PATTERNS = [
  /^[\s]*第[零一二三四五六七八九十百千万\d]+[章回节卷卷][\s\S]*$/gm,  // 第X章/第X回/第X节/第X卷
  /^[\s]*Chapter\s+\d+[\s\S]*$/gim,                                     // Chapter X (English)
  /^[\s]*CHAPTER\s+\d+[\s\S]*$/gm,                                      // CHAPTER X
  /^[\s]*卷[零一二三四五六七八九十百千万\d]+[\s\S]*$/gm,                  // 卷X
  /^[\s]*\d+[\.\、][\s\S]*$/gm,                                         // 1. / 1、 numbered
]

export function splitChapters(text: string): Chapter[] {
  if (!text || text.trim().length === 0) {
    return []
  }

  // Try each pattern until we find one that splits into >= 2 chapters
  for (const pattern of CHAPTER_PATTERNS) {
    const matches = [...text.matchAll(pattern)]
    if (matches.length >= 2) {
      const chapters: Chapter[] = []
      for (let i = 0; i < matches.length; i++) {
        const startIdx = matches[i].index!
        const endIdx = i + 1 < matches.length ? matches[i + 1].index! : text.length
        const title = matches[i][0].trim()
        const content = text.slice(startIdx + matches[i][0].length, endIdx).trim()
        chapters.push({ index: i, title, content })
      }
      return chapters
    }
  }

  // No chapter pattern found — split by ~5000 char chunks
  const CHUNK_SIZE = 5000
  const chapters: Chapter[] = []
  let idx = 0
  let chunkNum = 1

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
      chapters.push({
        index: chapters.length,
        title: `片段 ${chunkNum}`,
        content,
      })
      chunkNum++
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
