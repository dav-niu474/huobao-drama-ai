// Usage Tracker — intercept generation calls to track usage and check budgets
import { db } from '@/lib/db'

/**
 * Check if a user's budget allows a new generation.
 * Returns { allowed: true } or { allowed: false, message: string }
 */
export async function checkBudget(userId: string, estimatedCredits: number): Promise<{ allowed: boolean; message?: string; budgetId?: string }> {
  const budgets = await db.budget.findMany({
    where: { userId, enabled: true },
  })

  for (const budget of budgets) {
    const usagePercent = (budget.currentUsage / budget.limit) * 100
    if (usagePercent >= 100) {
      return {
        allowed: false,
        message: `本月预算已用完 (${budget.currentUsage.toFixed(1)}/${budget.limit} 积分)`,
        budgetId: budget.id,
      }
    }
  }

  return { allowed: true }
}

/**
 * Record usage after a generation completes.
 * Auto-increments budget usage and triggers alerts at thresholds.
 */
export async function recordUsage(
  userId: string,
  category: 'image' | 'video' | 'tts' | 'llm',
  credits: number
): Promise<void> {
  const budgets = await db.budget.findMany({
    where: { userId, enabled: true },
  })

  for (const budget of budgets) {
    const prevUsage = budget.currentUsage
    const newUsage = prevUsage + credits

    await db.budget.update({
      where: { id: budget.id },
      data: { currentUsage: newUsage },
    })

    // Check thresholds and create alerts
    const prevPercent = (prevUsage / budget.limit) * 100
    const newPercent = (newUsage / budget.limit) * 100

    const thresholds = [50, 75, 90, 100]
    for (const threshold of thresholds) {
      if (prevPercent < threshold && newPercent >= threshold) {
        const type = threshold >= 100 ? 'exceeded' : 'warning'
        const message = threshold >= 100
          ? `预算已超出！当前使用 ${newPercent.toFixed(0)}% (${newUsage.toFixed(1)}/${budget.limit})`
          : `预算警告：已使用 ${newPercent.toFixed(0)}% (${newUsage.toFixed(1)}/${budget.limit})`

        await db.budgetAlert.create({
          data: {
            budgetId: budget.id,
            type,
            message,
          },
        })
      }
    }
  }
}

/**
 * Get current period usage for a user
 */
export async function getUserUsage(userId: string) {
  const budgets = await db.budget.findMany({
    where: { userId },
    include: { alerts: { orderBy: { createdAt: 'desc' }, take: 10 } },
  })
  return budgets
}
