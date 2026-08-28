import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { splitChapters, parseNovelFile } from '@/lib/novel-parser'

export const maxDuration = 60

// ============================================================
// POST /api/dramas/[id]/split-episodes
//
// 小说 → 分集：按用户指定的"每集章节数"把小说章节切分成剧集。
//
// Body:
//   text?: string             — 粘贴的小说全文（与 file 二选一）
//   fileName?: string         — 粘贴时的文件名
//   chaptersPerEpisode?: number — 每集章节数（0/缺省 = 自动）
//   replace?: boolean         — 是否清空原有无剧本的旧集（默认 true）
//   startNumber?: number      — 起始集号（默认 1）
//
// 行为：
//   1. 拆分章节（splitChapters）
//   2. 按 chaptersPerEpisode 分组 → 生成 Episode 列表
//      - title = 首章标题（截断）
//      - rawContent = 该组章节全文拼接（供管线直接使用）
//      - sourceChapterIds = 该组章节 index 的 JSON 数组
//   3. 写入 Novel 表（全量章节 JSON）
//   4. 默认删除没有剧本内容的旧集（避免重复），已有剧本的旧集保留
// ============================================================

interface Chapter {
  index: number
  title: string
  content: string
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const { id: dramaId } = await params

  const drama = await db.drama.findUnique({
    where: { id: dramaId },
    select: { id: true, userId: true, title: true },
  })

  if (!drama) {
    return NextResponse.json({ error: '项目不存在' }, { status: 404 })
  }
  if (drama.userId && drama.userId !== auth.userId && auth.role !== 'admin') {
    return NextResponse.json({ error: '无权访问' }, { status: 403 })
  }

  let text = ''
  let fileName = 'pasted-novel.txt'
  let chaptersPerEpisode = 0 // 0 = auto
  let replace = true
  let startNumber = 1

  const contentType = request.headers.get('content-type') || ''
  try {
    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData()
      const file = formData.get('file') as File | null
      if (!file) {
        return NextResponse.json({ error: '缺少文件' }, { status: 400 })
      }
      const buffer = Buffer.from(await file.arrayBuffer())
      text = await parseNovelFile(buffer, file.name)
      text = text.replace(/^\uFEFF/, '')
      fileName = file.name
      const cpe = formData.get('chaptersPerEpisode')
      if (cpe) chaptersPerEpisode = parseInt(String(cpe), 10) || 0
    } else {
      const body = await request.json().catch(() => ({}))
      text = (body?.text ?? '').toString()
      fileName = (body?.fileName ?? fileName).toString()
      chaptersPerEpisode = parseInt(String(body?.chaptersPerEpisode ?? 0), 10) || 0
      replace = body?.replace !== false
      startNumber = parseInt(String(body?.startNumber ?? 1), 10) || 1
      if (text.trim().length < 10) {
        return NextResponse.json(
          { error: '小说内容过短（至少 10 字符）' },
          { status: 400 }
        )
      }
    }
  } catch (err: any) {
    return NextResponse.json(
      { error: `解析输入失败: ${err?.message || String(err)}` },
      { status: 400 }
    )
  }

  // ── 1. 拆分章节 ──
  const chapters: Chapter[] = splitChapters(text)
  if (chapters.length === 0) {
    return NextResponse.json({ error: '未能从文本中识别出章节' }, { status: 400 })
  }

  // ── 2. 计算每集章节数 ──
  if (chaptersPerEpisode <= 0) {
    // auto: 默认 3 章/集；章节很多时适当加大以控制集数 ≤ 24
    chaptersPerEpisode = 3
    if (chapters.length > 72) chaptersPerEpisode = Math.ceil(chapters.length / 24)
  }
  chaptersPerEpisode = Math.max(1, Math.min(chaptersPerEpisode, 50))

  const groups: Chapter[][] = []
  for (let i = 0; i < chapters.length; i += chaptersPerEpisode) {
    groups.push(chapters.slice(i, i + chaptersPerEpisode))
  }

  // ── 3. 事务：写 Novel + 建集 ──
  try {
    const result = await db.$transaction(async (tx) => {
      // 写 Novel 表（全量章节，供后续工坊/骨架使用）
      await tx.novel.upsert({
        where: { dramaId },
        create: {
          dramaId,
          title: drama.title,
          fileName,
          fileSize: Buffer.byteLength(text, 'utf-8'),
          chapters: JSON.stringify(chapters),
          parseStatus: 'parsed',
        },
        update: {
          fileName,
          fileSize: Buffer.byteLength(text, 'utf-8'),
          chapters: JSON.stringify(chapters),
          parseStatus: 'parsed',
        },
      })

      // 删除旧的"没有剧本内容"的集（保留已有剧本的集）
      if (replace) {
        await tx.episode.deleteMany({
          where: { dramaId, scriptContent: null },
        })
      }

      // 现有集号（避免冲突）
      const existing = await tx.episode.findMany({
        where: { dramaId },
        select: { episodeNumber: true },
      })
      const usedNumbers = new Set(existing.map((e) => e.episodeNumber))

      const created: Array<{
        id: string
        episodeNumber: number
        title: string
        sourceChapterIds: string
      }> = []
      let nextNum = startNumber
      for (let gi = 0; gi < groups.length; gi++) {
        const group = groups[gi]
        while (usedNumbers.has(nextNum)) nextNum++
        usedNumbers.add(nextNum)

        const firstTitle = group[0]?.title || ''
        const cleanFirst = firstTitle
          .replace(/^第[0-9一二三四五六七八九十百千]+[章回节卷集][\s:：]*/, '')
          .trim()
        const shortTitle = (cleanFirst || firstTitle).slice(0, 24)

        // 该组章节全文拼接作为原始内容（供剧本生成 / 管线步骤直接使用）
        const rawContent = group
          .map((ch) => `${ch.title}\n\n${ch.content}`)
          .join('\n\n')

        const ep = await tx.episode.create({
          data: {
            dramaId,
            episodeNumber: nextNum,
            title: shortTitle || `EP${String(nextNum).padStart(2, '0')}`,
            rawContent,
            sourceChapterIds: JSON.stringify(group.map((ch) => ch.index)),
            scriptStatus: 'pending',
          },
        })
        created.push(ep)
        nextNum++
      }

      // 更新项目总集数
      const total = await tx.episode.count({ where: { dramaId } })
      await tx.drama.update({
        where: { id: dramaId },
        data: {
          totalEpisodes: total,
          novelParsed: true,
          novelSource: fileName,
        },
      })

      return created
    })

    return NextResponse.json({
      success: true,
      chapterCount: chapters.length,
      chaptersPerEpisode,
      episodeCount: result.length,
      episodes: result.map((e) => ({
        id: e.id,
        episodeNumber: e.episodeNumber,
        title: e.title,
        chapterCount: JSON.parse(e.sourceChapterIds || '[]').length,
      })),
    })
  } catch (err: any) {
    console.error('[split-episodes] Failed:', err)
    return NextResponse.json(
      { error: `分集失败: ${err?.message || String(err)}` },
      { status: 500 }
    )
  }
}
