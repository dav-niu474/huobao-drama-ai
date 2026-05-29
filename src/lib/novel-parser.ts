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
    return buffer.toString('utf-8')
  }

  if (ext === 'docx') {
    const mammoth = await import('mammoth')
    const result = await mammoth.extractRawText({ buffer })
    return result.value
  }

  throw new Error(`Unsupported file type: .${ext}. Only .txt and .docx are supported.`)
}

// ============================================================
// splitChapters — Split novel text into chapters
//
// ★★★ 核心设计原则 ★★★
//
//   用户的核心需求：把小说按原始章节拆分，不要乱切片段！
//
//   章节识别策略（优先级从高到低）：
//   1. "第X章/回/节/卷/部/篇/集" — 中文小说最常见格式
//   2. 纯中文数字章节 — "一、"、"十二、" 等
//   3. 阿拉伯数字编号 — "1."、"1、" 等
//   4. 英文 Chapter X
//   5. 【标题】括号格式
//   6. 空行分隔的独立短行 — 启发式标题检测
//
//   如果以上都匹配不到 ≥2 个章节标题：
//   → 用空行（双换行 \n\n）分段，每段取首行做标题
//   → 这比按字数切割好得多，因为空行通常是章节/场景的自然分界
//   → 绝对不按固定字数切割成无意义的片段
// ============================================================

const CHAPTER_PATTERNS = [
  // Level 1: 标准"第X章/回/节/卷/部/篇/集"格式
  /^[\s]*第[零〇一二三四五六七八九十百千万\d]+[章回节卷部篇集][\s\t]*[：:·\-\s]?\s*\S?.*$/gm,
  // Level 2: 纯中文数字章节（如"一、"、"十二、"）
  /^[\s]*[一二三四五六七八九十百千万]+[、．\.]\s*\S?.*$/gm,
  // Level 3: 阿拉伯数字编号（如"1."、"1、"）
  /^[\s]*\d+[\.\、]\s*\S?.*$/gm,
  // Level 4: 英文 Chapter X
  /^[\s]*Chapter\s+\d+[\s\S]*$/gim,
  // Level 5: 【标题】括号格式
  /^[\s]*【[^】]+】[\s]*$/gm,
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

  return false
}

export function splitChapters(text: string): Chapter[] {
  if (!text || text.trim().length === 0) {
    return []
  }

  // ── Strategy 1: 用正则模式匹配章节标题 ──
  for (const pattern of CHAPTER_PATTERNS) {
    const source = pattern.source
    const flags = pattern.flags
    const regex = new RegExp(source, flags)
    const matches = [...text.matchAll(regex)]

    const validMatches = matches.filter((m) => isValidChapterTitle(m[0]))

    if (validMatches.length >= 2) {
      const chapters: Chapter[] = []
      for (let i = 0; i < validMatches.length; i++) {
        const startIdx = validMatches[i].index!
        const endIdx = i + 1 < validMatches.length ? validMatches[i + 1].index! : text.length
        const title = validMatches[i][0].trim()
        const content = text.slice(startIdx + validMatches[i][0].length, endIdx).trim()
        if (content.length > 0) {
          chapters.push({ index: chapters.length, title, content })
        }
      }
      if (chapters.length >= 2) return chapters
    }
  }

  // ── Strategy 2: 按空行（双换行）分段 ──
  // 空行是小说中最自然的段落/场景分界，比按字数切割好得多
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0)

  if (paragraphs.length >= 2) {
    // 进一步：如果段落太多（>50），可能只是普通段落不是章节
    // 尝试合并为更合理的章节大小
    if (paragraphs.length <= 100) {
      // 段落数合理，每个段落（或相邻几个小段落）作为一个章节
      const chapters: Chapter[] = []
      let currentContent = ''
      let currentTitle = ''

      for (let i = 0; i < paragraphs.length; i++) {
        const para = paragraphs[i].trim()
        const firstLine = para.split('\n')[0].trim()

        // 如果当前段落是一个短行（可能是章节标题）
        if (firstLine.length <= 50 && firstLine.length >= 2 && !/[。，！？；：…""''）】》]$/.test(firstLine)) {
          // 保存前一个章节
          if (currentContent.trim().length > 0) {
            const title = currentTitle || currentContent.split('\n')[0].trim().slice(0, 40)
            chapters.push({
              index: chapters.length,
              title: title.length >= 2 ? title : `第${chapters.length + 1}章`,
              content: currentContent.trim(),
            })
          }
          currentTitle = firstLine
          currentContent = para
        } else {
          // 正文段落，追加到当前章节
          currentContent += '\n\n' + para
        }
      }

      // 保存最后一个章节
      if (currentContent.trim().length > 0) {
        const title = currentTitle || currentContent.split('\n')[0].trim().slice(0, 40)
        chapters.push({
          index: chapters.length,
          title: title.length >= 2 ? title : `第${chapters.length + 1}章`,
          content: currentContent.trim(),
        })
      }

      if (chapters.length >= 2) return chapters
    }

    // 段落太多，按段落分但限制最大章节数
    const chapters: Chapter[] = []
    // 每 N 个段落合并为一个章节
    const PARAS_PER_CHAPTER = Math.max(1, Math.floor(paragraphs.length / 30))
    let paraIdx = 0

    while (paraIdx < paragraphs.length) {
      const chunk = paragraphs.slice(paraIdx, paraIdx + PARAS_PER_CHAPTER).join('\n\n').trim()
      if (chunk.length > 0) {
        const firstLine = chunk.split('\n')[0].trim()
        let title = firstLine.length > 40 ? firstLine.slice(0, 40) + '...' : firstLine
        if (title.length < 2) {
          title = `第${chapters.length + 1}章`
        }
        chapters.push({
          index: chapters.length,
          title,
          content: chunk,
        })
      }
      paraIdx += PARAS_PER_CHAPTER
    }

    if (chapters.length >= 2) return chapters
  }

  // ── Strategy 3: 实在找不到任何分界，整体作为一个章节 ──
  // 绝对不按固定字数切割成无意义的片段！
  const firstLine = text.split('\n')[0].trim()
  const title = firstLine.length > 40 ? firstLine.slice(0, 40) + '...' : (firstLine.length >= 2 ? firstLine : '全文')

  return [{
    index: 0,
    title,
    content: text.trim(),
  }]
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

    const chaptersText = group
      .map((ch) => `## ${ch.title}\n\n${ch.content}`)
      .join('\n\n---\n\n')

    const prompt = `请分析以下小说章节，提取故事骨架信息，包括：核心设定、关键事件、人物关系、情感弧线、改编建议。\n\n${chaptersText}`

    try {
      const result = await callStorySkeletonAgent(agentType, dramaId, prompt)
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
  const { executeAgent } = await import('@/lib/agents/factory')

  const result = await executeAgent(
    agentType as 'story_skeleton',
    dramaId,
    dramaId,
    message
  )

  return result.text
}
