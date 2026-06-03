import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

// GET /api/budgets/usage — Current period usage summary
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await db.user.findUnique({ where: { email: session.user.email } })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    // Get all user's dramas
    const dramas = await db.drama.findMany({
      where: { userId: user.id },
      select: { id: true },
    })
    const dramaIds = dramas.map(d => d.id)

    // Get current period start
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const weekStart = new Date(now)
    weekStart.setDate(now.getDate() - now.getDay())
    weekStart.setHours(0, 0, 0, 0)
    const dayStart = new Date(now)
    dayStart.setHours(0, 0, 0, 0)

    // Aggregate usage by category
    const imageUsage = await db.imageGeneration.aggregate({
      where: { dramaId: { in: dramaIds }, createdAt: { gte: monthStart } },
      _sum: { costCredits: true },
      _count: true,
    })

    const videoUsage = await db.videoGeneration.aggregate({
      where: { dramaId: { in: dramaIds }, createdAt: { gte: monthStart } },
      _sum: { costCredits: true },
      _count: true,
    })

    const ttsUsage = await db.ttsGeneration.aggregate({
      where: { dramaId: { in: dramaIds }, createdAt: { gte: monthStart } },
      _sum: { costCredits: true },
      _count: true,
    })

    const llmUsage = await db.generationCost.aggregate({
      where: { dramaId: { in: dramaIds }, category: 'llm', createdAt: { gte: monthStart } },
      _sum: { credits: true },
      _count: true,
    })

    const totalCredits =
      (imageUsage._sum.costCredits || 0) +
      (videoUsage._sum.costCredits || 0) +
      (ttsUsage._sum.costCredits || 0) +
      (llmUsage._sum.credits || 0)

    // 7-day trend
    const dailyTrend = []
    for (let i = 6; i >= 0; i--) {
      const day = new Date(now)
      day.setDate(now.getDate() - i)
      day.setHours(0, 0, 0, 0)
      const nextDay = new Date(day)
      nextDay.setDate(nextDay.getDate() + 1)

      const imgC = await db.imageGeneration.aggregate({
        where: { dramaId: { in: dramaIds }, createdAt: { gte: day, lt: nextDay } },
        _sum: { costCredits: true },
      })
      const vidC = await db.videoGeneration.aggregate({
        where: { dramaId: { in: dramaIds }, createdAt: { gte: day, lt: nextDay } },
        _sum: { costCredits: true },
      })
      const ttsC = await db.ttsGeneration.aggregate({
        where: { dramaId: { in: dramaIds }, createdAt: { gte: day, lt: nextDay } },
        _sum: { costCredits: true },
      })

      dailyTrend.push({
        date: day.toISOString().slice(0, 10),
        credits: (imgC._sum.costCredits || 0) + (vidC._sum.costCredits || 0) + (ttsC._sum.costCredits || 0),
      })
    }

    return NextResponse.json({
      totalCredits,
      byCategory: {
        image: imageUsage._sum.costCredits || 0,
        video: videoUsage._sum.costCredits || 0,
        tts: ttsUsage._sum.costCredits || 0,
        llm: llmUsage._sum.credits || 0,
      },
      byCount: {
        image: imageUsage._count,
        video: videoUsage._count,
        tts: ttsUsage._count,
        llm: llmUsage._count,
      },
      dailyTrend,
      period: 'monthly',
      periodStart: monthStart.toISOString(),
    })
  } catch (error) {
    console.error('[budgets-usage] Error:', error)
    return NextResponse.json({ error: 'Failed to fetch usage' }, { status: 500 })
  }
}
