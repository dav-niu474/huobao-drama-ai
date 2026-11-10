import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helpers'
import { db } from '@/lib/db'

export const maxDuration = 60

// ============================================================
// POST /api/dramas/[id]/renumber-episodes
//
// 整理集号：把项目下所有剧集按当前集号升序（稳定排序）重排为 1..N。
//
// 使用场景：重新分集（replace）后，保留了已有剧本的旧集，新集编号
// 接在旧集之后（如 E01 保留、新集从 E02/E102 开始），或历史操作留下
// 编号空洞。此端点一次性把编号整理为连续的 1..N，不改动任何内容。
//
// 注意：Episode 有 @@unique([dramaId, episodeNumber]) 复合唯一约束，
// 不能直接原地改号（中途必然撞唯一键）。采用两阶段更新：
//   阶段一：把所有需要改号的集移到负数暂存位 -(排序位)（互不冲突，
//           且与未改号的正数集号不冲突）
//   阶段二：按排序位写入最终编号 1..N（未改号的集其当前编号必然
//           等于自身排序位，故最终号不会与任何未改号集冲突）
// ============================================================

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const { id: dramaId } = await params

  const drama = await db.drama.findUnique({
    where: { id: dramaId },
    select: { id: true, userId: true },
  })

  if (!drama) {
    return NextResponse.json({ error: '项目不存在' }, { status: 404 })
  }
  if (drama.userId && drama.userId !== auth.userId && auth.role !== 'admin') {
    return NextResponse.json({ error: '无权访问' }, { status: 403 })
  }

  try {
    const result = await db.$transaction(async (tx) => {
      // 稳定排序：先按集号，再按创建时间 —— 相同集号保持创建顺序
      const episodes = await tx.episode.findMany({
        where: { dramaId },
        select: { id: true, episodeNumber: true },
        orderBy: [{ episodeNumber: 'asc' }, { createdAt: 'asc' }],
      })

      // 计算需要改号的集（编号已连续则零写入）
      const moving = episodes
        .map((ep, i) => ({ id: ep.id, from: ep.episodeNumber, to: i + 1 }))
        .filter((m) => m.from !== m.to)

      if (moving.length > 0) {
        // 阶段一：移到负数暂存位，腾出正数区间
        for (let i = 0; i < moving.length; i++) {
          await tx.episode.update({
            where: { id: moving[i].id },
            data: { episodeNumber: -(i + 1) },
          })
        }
        // 阶段二：写入最终编号
        for (const m of moving) {
          await tx.episode.update({
            where: { id: m.id },
            data: { episodeNumber: m.to },
          })
        }
      }

      // 同步项目总集数
      await tx.drama.update({
        where: { id: dramaId },
        data: { totalEpisodes: episodes.length },
      })

      return { total: episodes.length, changed: moving.length }
    }, {
      // 大项目（400+ 集）两阶段逐集 update，放宽事务超时
      maxWait: 10000,
      timeout: 120000,
    })

    return NextResponse.json({
      success: true,
      total: result.total,
      changed: result.changed,
    })
  } catch (err: any) {
    console.error('[renumber-episodes] Failed:', err)
    return NextResponse.json(
      { error: `整理集号失败: ${err?.message || String(err)}` },
      { status: 500 }
    )
  }
}
