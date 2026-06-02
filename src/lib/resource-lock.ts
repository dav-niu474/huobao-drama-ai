// ============================================================
// Resource Locking System
// Manages per-storyboard-shot locks with auto-release
// ============================================================

import { db } from '@/lib/db'

export const LOCK_TIMEOUT_SECONDS = 30
export const LOCK_EXTENSION_SECONDS = 30

export interface LockResult {
  acquired: boolean
  lock?: {
    id: string
    userId: string
    userName: string
    userAvatar: string | null
    resourceType: string
    resourceId: string
    lockedAt: Date
    expiresAt: Date
  }
  conflict?: {
    userId: string
    userName: string
    userAvatar: string | null
    expiresAt: Date
  }
}

/**
 * Try to acquire a lock on a resource.
 * Returns { acquired: true, lock } if successful,
 * or { acquired: false, conflict } if locked by someone else.
 */
export async function acquireLock(
  dramaId: string,
  userId: string,
  resourceType: string,
  resourceId: string
): Promise<LockResult> {
  const now = new Date()

  // Check for existing lock
  const existing = await db.resourceLock.findUnique({
    where: { dramaId_resourceType_resourceId: { dramaId, resourceType, resourceId } },
    include: { user: { select: { name: true, avatar: true } } },
  })

  if (existing) {
    // If lock is expired, we can take it
    if (existing.expiresAt < now) {
      await db.resourceLock.delete({ where: { id: existing.id } })
    } else if (existing.userId === userId) {
      // Same user — extend the lock
      const updated = await db.resourceLock.update({
        where: { id: existing.id },
        data: { expiresAt: new Date(now.getTime() + LOCK_EXTENSION_SECONDS * 1000) },
        include: { user: { select: { name: true, avatar: true } } },
      })
      return {
        acquired: true,
        lock: {
          id: updated.id,
          userId: updated.userId,
          userName: updated.user.name,
          userAvatar: updated.user.avatar,
          resourceType: updated.resourceType,
          resourceId: updated.resourceId,
          lockedAt: updated.lockedAt,
          expiresAt: updated.expiresAt,
        },
      }
    } else {
      // Locked by another user
      return {
        acquired: false,
        conflict: {
          userId: existing.userId,
          userName: existing.user.name,
          userAvatar: existing.user.avatar,
          expiresAt: existing.expiresAt,
        },
      }
    }
  }

  // Create new lock
  const lock = await db.resourceLock.create({
    data: {
      userId,
      dramaId,
      resourceType,
      resourceId,
      expiresAt: new Date(now.getTime() + LOCK_TIMEOUT_SECONDS * 1000),
    },
    include: { user: { select: { name: true, avatar: true } } },
  })

  return {
    acquired: true,
    lock: {
      id: lock.id,
      userId: lock.userId,
      userName: lock.user.name,
      userAvatar: lock.user.avatar,
      resourceType: lock.resourceType,
      resourceId: lock.resourceId,
      lockedAt: lock.lockedAt,
      expiresAt: lock.expiresAt,
    },
  }
}

/**
 * Release a lock on a resource.
 * Only the lock owner (or auto-expire) can release.
 */
export async function releaseLock(
  dramaId: string,
  userId: string,
  resourceType: string,
  resourceId: string
): Promise<boolean> {
  const existing = await db.resourceLock.findUnique({
    where: { dramaId_resourceType_resourceId: { dramaId, resourceType, resourceId } },
  })

  if (!existing) return true // Already released

  // Only owner can release
  if (existing.userId !== userId) return false

  await db.resourceLock.delete({ where: { id: existing.id } })
  return true
}

/**
 * Get all active (non-expired) locks for a drama.
 */
export async function getActiveLocks(dramaId: string) {
  const now = new Date()

  // Delete expired locks
  await db.resourceLock.deleteMany({
    where: { dramaId, expiresAt: { lt: now } },
  })

  const locks = await db.resourceLock.findMany({
    where: { dramaId },
    include: { user: { select: { name: true, avatar: true } } },
    orderBy: { lockedAt: 'desc' },
  })

  return locks.map((lock) => ({
    id: lock.id,
    userId: lock.userId,
    userName: lock.user.name,
    userAvatar: lock.user.avatar,
    dramaId: lock.dramaId,
    resourceType: lock.resourceType,
    resourceId: lock.resourceId,
    lockedAt: lock.lockedAt,
    expiresAt: lock.expiresAt,
  }))
}

/**
 * Clean up all expired locks (can be called periodically).
 */
export async function cleanupExpiredLocks(): Promise<number> {
  const now = new Date()
  const result = await db.resourceLock.deleteMany({
    where: { expiresAt: { lt: now } },
  })
  return result.count
}
