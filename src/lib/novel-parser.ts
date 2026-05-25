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

// Chinese chapter patterns (ordered by specificity → broadest match first)
//
// Design principles:
// 1. Use .*$ with `m` flag — matches within a single line, avoids [\s\S]*$ consuming entire text
// 2. First group of patterns require explicit chapter markers (第X章, 卷X, Chapter, etc.)
// 3. Broader fallback patterns catch less structured headings
// 4. Each pattern's matches are validated: must produce ≥ 2 results AND the titles
//    should look like genuine headings (not body text accidentally matching)
//
// The "序号+标题" pattern (e.g. "1 标题", "1. 标题", "1、标题") is handled separately
// as a secondary pass because it can produce false positives with numbered lists in body text.

// ── Primary patterns: explicit chapter markers ──
const PRIMARY_PATTERNS = [
  // 第X章/回/节/卷 + optional title  (e.g. "第一章 缘起", "第100章", "第十二章 大战")
  // Requires: marker at line start, optional space+title after marker, end of line
  /^[\s]*第[零一二三四五六七八九十百千万〇\d]+[章回节卷部篇集][\s　]+.*$/gm,
  /^[\s]*第[零一二三四五六七八九十百千万〇\d]+[章回节卷部篇集]$/gm,

  // 卷X + optional title  (e.g. "卷一 风起", "卷三")
  /^[\s]*卷[零一二三四五六七八九十百千万〇\d]+[\s　]+.*$/gm,
  /^[\s]*卷[零一二三四五六七八九十百千万〇\d]+$/gm,

  // Chapter X / CHAPTER X (English)
  /^[\s]*Chapter\s+\d+.*$/gim,
]

// ── Secondary patterns: numbered headings (more permissive, need extra validation) ──
const SECONDARY_PATTERNS = [
  // "一、" "二、" style (Chinese ordinal + 顿号)
  /^[\s]*[零一二三四五六七八九十百千万]+、.*$/gm,

  // "1." "1、" "1 " style (Arabic numeral + delimiter + title)
  /^[\s]*\d+[\.、\s]\s*\S.*$/gm,
]

// ── Tertiary patterns: catch-all for indented/bracketed headings ──
const TERTIARY_PATTERNS = [
  // 【标题】 or ［标题］ style
  /^[\s]*[【\[［].*[】\]］].*$/gm,
]

/**
 * Validate that a set of matches represents genuine chapter headings
 * rather than body text.  Heuristics:
 * - Average title length shouldn't be too long (real titles < 30 chars)
 * - At least 2 matches
 * - Most titles shouldn't look like paragraph content
 */
function isValidChapterMatch(matches: RegExpMatchArray[], text: string): boolean {
  if (matches.length < 2) return false

  // Check average title length — real chapter titles are short
  const avgLen = matches.reduce((sum, m) => sum + m[0].trim().length, 0) / matches.length
  if (avgLen > 40) return false

  // Check that matches are spread across the text (not clustered in one paragraph)
  const positions = matches.map((m) => m.index!)
  const textLen = text.length
  const firstPos = positions[0]
  const lastPos = positions[positions.length - 1]
  // Chapters should span at least 30% of the text
  if (lastPos - firstPos < textLen * 0.3) return false

  return true
}

/**
 * Try to extract a meaningful title from the first line of a chunk.
 * Looks for patterns like "XXX", quoted text, or just takes the first sentence.
 */
function extractTitleFromContent(content: string, fallbackIndex: number): string {
  const firstLine = content.split('\n').find((l) => l.trim().length > 0)
  if (!firstLine) return `第${fallbackIndex}章`

  const trimmed = firstLine.trim()

  // If first line looks like a heading (short, no punctuation at end except ！？)
  if (trimmed.length <= 30 && !/[，。；、：]/.test(trimmed)) {
    return trimmed
  }

  // If first line is short enough, use it even with punctuation
  if (trimmed.length <= 20) {
    return trimmed
  }

  // Take first 15 chars + "…"
  return trimmed.slice(0, 15) + '…'
}

export function splitChapters(text: string): Chapter[] {
  if (!text || text.trim().length === 0) {
    return []
  }

  // ── Pass 1: Try primary patterns (strictest, most reliable) ──
  for (const pattern of PRIMARY_PATTERNS) {
    const matches = [...text.matchAll(pattern)]
    if (isValidChapterMatch(matches, text)) {
      return buildChaptersFromMatches(matches, text)
    }
  }

  // ── Pass 2: Try secondary patterns (numbered headings) with extra validation ──
  for (const pattern of SECONDARY_PATTERNS) {
    const matches = [...text.matchAll(pattern)]
    if (isValidChapterMatch(matches, text)) {
      return buildChaptersFromMatches(matches, text)
    }
  }

  // ── Pass 3: Try tertiary patterns (bracketed headings) ──
  for (const pattern of TERTIARY_PATTERNS) {
    const matches = [...text.matchAll(pattern)]
    if (isValidChapterMatch(matches, text)) {
      return buildChaptersFromMatches(matches, text)
    }
  }

  // ── Pass 4: Heuristic — look for short isolated lines that could be headings ──
  // Many web novels use bare text on its own line as a chapter heading
  const heuristicChapters = tryHeuristicHeadingSplit(text)
  if (heuristicChapters.length >= 3) {
    return heuristicChapters
  }

  // ── Pass 5: Fallback — split by character count with intelligent titles ──
  return splitByChunkSize(text)
}

/**
 * Build Chapter[] from regex matches
 */
function buildChaptersFromMatches(
  matches: RegExpMatchArray[],
  text: string
): Chapter[] {
  const chapters: Chapter[] = []
  for (let i = 0; i < matches.length; i++) {
    const startIdx = matches[i].index!
    const endIdx = i + 1 < matches.length ? matches[i + 1].index! : text.length
    const title = matches[i][0].trim()
    const content = text.slice(startIdx + matches[i][0].length, endIdx).trim()
    if (content.length > 0 || title.length > 0) {
      chapters.push({ index: chapters.length, title, content })
    }
  }
  return chapters
}

/**
 * Heuristic: find lines that look like chapter headings
 * Criteria: short line (≤20 chars), stands alone (blank lines before/after),
 *           doesn't end with typical sentence punctuation
 */
function tryHeuristicHeadingSplit(text: string): Chapter[] {
  const lines = text.split('\n')
  const headingLines: { lineIdx: number; text: string; charPos: number }[] = []

  let charPos = 0
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    const lineStartCharPos = charPos
    charPos += lines[i].length + 1 // +1 for \n

    if (line.length === 0) continue
    if (line.length > 25) continue // Headings shouldn't be long

    // Must not end with typical body punctuation (but ！？ are ok for dramatic headings)
    if (/[，。；、：…"」』]/.test(line.slice(-1))) continue

    // Must have blank line before or after (standalone line = likely heading)
    const prevBlank = i === 0 || lines[i - 1].trim().length === 0
    const nextBlank = i === lines.length - 1 || lines[i + 1].trim().length === 0
    if (!prevBlank && !nextBlank) continue

    // Must not be purely numeric (that's not a heading)
    if (/^\d+$/.test(line)) continue

    // Must not be too similar to surrounding content lines (likely body)
    headingLines.push({ lineIdx: i, text: line, charPos: lineStartCharPos })
  }

  if (headingLines.length < 3) return []

  // Filter: keep only headings that are spaced apart (not clustered)
  // Remove headings that are too close together (< 200 chars apart) — likely body
  const filtered: typeof headingLines = []
  for (const h of headingLines) {
    if (filtered.length === 0 || h.charPos - filtered[filtered.length - 1].charPos > 200) {
      filtered.push(h)
    } else {
      // Replace previous if this one looks more heading-like (shorter)
      if (h.text.length < filtered[filtered.length - 1].text.length) {
        filtered[filtered.length - 1] = h
      }
    }
  }

  if (filtered.length < 3) return []

  // Build chapters from filtered headings
  const chapters: Chapter[] = []
  for (let i = 0; i < filtered.length; i++) {
    const startIdx = filtered[i].charPos
    const endIdx = i + 1 < filtered.length ? filtered[i + 1].charPos : text.length
    const title = filtered[i].text
    const content = text.slice(startIdx + lines[filtered[i].lineIdx].length + 1, endIdx).trim()
    if (content.length > 0) {
      chapters.push({ index: chapters.length, title, content })
    }
  }

  return chapters
}

/**
 * Fallback: split by chunk size with intelligent title extraction
 * Tries to extract meaningful titles from content instead of just "片段 N"
 */
function splitByChunkSize(text: string): Chapter[] {
  const CHUNK_SIZE = 3000
  const chapters: Chapter[] = []
  let idx = 0

  while (idx < text.length) {
    let endIdx = Math.min(idx + CHUNK_SIZE, text.length)

    // Try to break at paragraph boundary (double newline)
    if (endIdx < text.length) {
      const lastParagraphBreak = text.lastIndexOf('\n\n', endIdx)
      if (lastParagraphBreak > idx + CHUNK_SIZE * 0.5) {
        endIdx = lastParagraphBreak
      } else {
        // Also try single newline break
        const lastLineBreak = text.lastIndexOf('\n', endIdx)
        if (lastLineBreak > idx + CHUNK_SIZE * 0.5) {
          endIdx = lastLineBreak
        }
      }
    }

    const content = text.slice(idx, endIdx).trim()
    if (content.length > 0) {
      // Extract meaningful title from content
      const title = extractTitleFromContent(content, chapters.length + 1)
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
