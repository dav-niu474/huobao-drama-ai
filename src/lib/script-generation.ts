import { userIdContext, aiClient } from '@/lib/ai-config'
import { db } from '@/lib/db'

// ============================================================
// 统一的剧集剧本生成核心（Toonflow 风格格式）
//
// 供两处调用，保证「单集生成」与「批量管线」产出格式一致：
// 1. POST /api/episodes/[id]/generate-script（剧本工坊单集生成）
// 2. src/lib/batch-pipeline.ts（批量管线 script:rewrite 步骤）
//
// 输出格式：
//   {集号}-{场号} {场景名} {时间}
//   场景：内景/外景 · 场景名 · 时间
//   人物：A、B
//   --
//   △画面描述
//   A：台词
//   （动作/情绪描写）
//   ---
// ============================================================

export const SCRIPT_DURATIONS = ['90s', '120s', '180s', '300s'] as const
export type ScriptDuration = (typeof SCRIPT_DURATIONS)[number]

const DURATION_MAP: Record<ScriptDuration, { desc: string; scenes: string; chars: string }> = {
  '90s': { desc: '约 90 秒（150-250 字）', scenes: '2-3 个场景', chars: '300 字' },
  '120s': { desc: '约 2 分钟（300-450 字）', scenes: '3-4 个场景', chars: '450 字' },
  '180s': { desc: '约 3 分钟（450-650 字）', scenes: '4-5 个场景', chars: '650 字' },
  '300s': { desc: '约 5 分钟（750-1000 字）', scenes: '5-7 个场景', chars: '1000 字' },
}

function stripWrapper(raw: string): string {
  let out = raw.trim()
  const m = out.match(/<scriptItem\s+name="[^"]*">([\s\S]*?)<\/scriptItem>/)
  if (m) out = m[1].trim()
  // 去掉可能的残留 XML 标签与思考块
  out = out
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<\/?scriptItem[^>]*>/g, '')
    .replace(/<script>[\s\S]*?<\/script>/gi, '')
  return out.trim()
}

export interface GenerateEpisodeScriptOptions {
  /** 目标时长，默认 '120s' */
  duration?: string
  /** 用户补充要求（最长 2000 字） */
  instruction?: string
  /** AI 供应商解析用的用户 ID（批量管线等脱离请求上下文的场景传入） */
  userId?: string
}

export interface GeneratedScriptResult {
  episodeId: string
  dramaId: string
  scriptContent: string
  duration: ScriptDuration
  /** 若集标题为默认值（EP{n}），返回 AI 推断的新标题 */
  titleUpdate: string | null
}

/**
 * 基于本集小说章节（sourceChapterIds 两种历史格式 + rawContent 兜底）
 * 生成 Toonflow 格式剧本并写回 Episode.scriptContent / scriptStatus。
 * 失败时将 scriptStatus 标记为 failed 并抛出原始错误。
 */
export async function generateEpisodeScript(
  episodeId: string,
  options: GenerateEpisodeScriptOptions = {}
): Promise<GeneratedScriptResult> {
  const duration: ScriptDuration = SCRIPT_DURATIONS.includes(
    (options.duration ?? '') as ScriptDuration
  )
    ? (options.duration as ScriptDuration)
    : '120s'
  const instruction = (options.instruction ?? '').toString().slice(0, 2000)

  const episode = await db.episode.findUnique({
    where: { id: episodeId },
    include: {
      drama: {
        select: {
          userId: true,
          id: true,
          title: true,
          genre: true,
          style: true,
          styleTemplate: true,
        },
      },
    },
  })

  if (!episode) {
    throw new Error('剧集不存在')
  }

  await db.episode.update({
    where: { id: episodeId },
    data: { scriptStatus: 'processing' },
  })

  try {
    // ── 收集本集章节内容 ──
    let chapterContent = ''
    try {
      const parsedSource = JSON.parse(episode.sourceChapterIds || '[]')
      if (Array.isArray(parsedSource) && parsedSource.length > 0) {
        if (typeof parsedSource[0] === 'object' && parsedSource[0] !== null) {
          // 旧格式：sourceChapterIds 存的是完整章节对象
          const objs = parsedSource as Array<{ index: number; title: string; content: string }>
          chapterContent = objs
            .map((ch) => `## ${ch.title}\n\n${ch.content}`)
            .join('\n\n---\n\n')
        } else {
          // 新格式：章节 index 数组 → 从 Novel 表取
          const novel = await db.novel.findUnique({
            where: { dramaId: episode.dramaId },
          })
          if (novel) {
            const allChapters = JSON.parse(novel.chapters || '[]') as Array<{
              index: number
              title: string
              content: string
            }>
            const picked = allChapters.filter((ch) =>
              (parsedSource as number[]).includes(ch.index)
            )
            chapterContent = picked
              .map((ch) => `## ${ch.title}\n\n${ch.content}`)
              .join('\n\n---\n\n')
          }
        }
      }
    } catch {
      // ignore JSON errors
    }

    // 兜底：没有章节信息时用 rawContent
    if (!chapterContent.trim()) {
      chapterContent = episode.rawContent || ''
    }
    if (!chapterContent.trim()) {
      throw new Error('本集没有小说原文，请先在项目中导入小说并完成分集')
    }

    const MAX_CHARS = 40000
    if (chapterContent.length > MAX_CHARS) {
      chapterContent =
        chapterContent.slice(0, MAX_CHARS) + '\n\n...(内容过长已截断)'
    }

    // ── 前集衔接上下文 ──
    let prevContext = ''
    if (episode.episodeNumber > 1) {
      const prev = await db.episode.findFirst({
        where: {
          dramaId: episode.dramaId,
          episodeNumber: { lt: episode.episodeNumber },
          scriptStatus: 'completed',
        },
        orderBy: { episodeNumber: 'desc' },
        select: { scriptContent: true },
      })
      if (prev?.scriptContent) {
        prevContext = `\n## 上一集结尾（用于衔接）\n${prev.scriptContent.slice(-800)}\n`
      }
    }

    const dur = DURATION_MAP[duration]
    const styleHint = episode.drama.styleTemplate
      ? `\n- 视觉风格基调：${episode.drama.styleTemplate}`
      : ''

    const systemPrompt = `你是一位专业的短剧编剧，擅长把小说改编成节奏紧凑、画面感强的竖屏/横屏短剧剧本。你只输出剧本正文本身。`

    const userPrompt = `## 项目信息
- 作品名：${episode.drama.title}
- 题材：${episode.drama.genre || '都市'}
- 风格：${episode.drama.style || 'realistic'}${styleHint}
- 本集：第${episode.episodeNumber}集 ${episode.title ? `《${episode.title}》` : ''}
- 目标时长：${dur.desc}
${prevContext}
## 小说原文（本集对应的章节）
${chapterContent}
${instruction ? `\n## 用户补充要求\n${instruction}\n` : ''}
## 任务
将上述小说原文改编为第${episode.episodeNumber}集的完整短剧剧本。

## 输出格式（严格遵守）
每个场景按如下结构，场景之间用单独一行 --- 分隔：

{集号}-{场号} {场景名} {时间}
场景：{内景|外景}·{场景名}·{日|夜|黄昏|清晨}
人物：{人物1}、{人物2}
--
△{环境/画面描述，可直接用于AI视频生成}
{人物名}：{台词}
（{人物动作与情绪描写}）
{人物名}：{台词}
（{动作描写}）

## 硬约束
1. 共 ${dur.scenes}，正文总字数 ≤ ${dur.chars}
2. 场号从 1 开始：{集号}-1、{集号}-2 …
3. △标记的画面描述必须具体、可视化、可直接用于 AI 视频生成
4. 动作与情绪写在（）内；内心独白用 OS（人物名，情绪）：内容
5. 单句台词 ≤ 25 字，口语化、有张力
6. 保留小说的关键情节与情感转折，结尾设置悬念钩子
7. 不要输出任何 XML 标签、标题、梗概或解释，直接输出第一个场景`

    // 批量管线等脱离请求 ALS 上下文的场景，显式注入用户身份以解析其 AI 供应商配置
    const chat = () =>
      aiClient.chat(userPrompt, systemPrompt, {
        temperature: 0.75,
        max_tokens: 16384,
      })
    const raw = options.userId ? await userIdContext.run(options.userId, chat) : await chat()

    const scriptContent = stripWrapper(raw)
    if (!scriptContent || scriptContent.length < 50) {
      throw new Error('AI 返回的剧本内容为空或过短')
    }

    // 用 AI 生成的第一行场景信息推断标题（若集标题还是默认的）
    const firstSceneLine = scriptContent
      .split('\n')
      .map((l) => l.trim())
      .find((l) => /^\d+-\d+/.test(l))
    let titleUpdate: string | null = null
    if (!episode.title || /^EP\d+$/.test(episode.title)) {
      const m = firstSceneLine?.match(/\d+-\d+\s+(.+?)\s+(日|夜|黄昏|清晨|清晨|傍晚|深夜)/)
      if (m) titleUpdate = m[1].slice(0, 24)
    }

    await db.episode.update({
      where: { id: episodeId },
      data: {
        scriptContent,
        scriptStatus: 'completed',
        ...(titleUpdate ? { title: titleUpdate } : {}),
      },
    })

    return {
      episodeId,
      dramaId: episode.dramaId,
      scriptContent,
      duration,
      titleUpdate,
    }
  } catch (error) {
    await db.episode
      .update({ where: { id: episodeId }, data: { scriptStatus: 'failed' } })
      .catch(() => {})
    throw error
  }
}

/** 将底层错误映射为面向用户的友好提示（供 API 路由使用） */
export function friendlyScriptError(err: unknown): string {
  const errMsg = err instanceof Error ? err.message : String(err)
  const isFriendly =
    typeof errMsg === 'string' &&
    (errMsg.includes('HTTP') ||
      errMsg.includes('供应商') ||
      errMsg.includes('模型') ||
      errMsg.includes('API Key') ||
      errMsg.includes('下线') ||
      errMsg.includes('小说原文'))
  return isFriendly ? errMsg : `剧本生成失败: ${errMsg}`
}
