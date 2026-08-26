// ============================================================
// Chapter splitting — pure client-safe function
// Extracted from novel-parser.ts so it can be imported from
// client components without pulling in server-only modules
// (db, agents/factory, mammoth, etc.)
// ============================================================

export interface Chapter {
  index: number
  title: string
  content: string
}

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

function isValidChapterTitle(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed) return false

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

  const firstLine = text.split('\n')[0].trim()
  const title = firstLine.length > 40 ? firstLine.slice(0, 40) + '...' : (firstLine.length >= 2 ? firstLine : '全文')

  return [{
    index: 0,
    title,
    content: text.trim(),
  }]
}
