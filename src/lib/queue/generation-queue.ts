// ============================================================
// Generation Queue — Dual-channel in-memory task queue
// Inspired by ArcReel's two-lane architecture
// ============================================================

import { EventEmitter } from 'events'
import { randomUUID } from 'crypto'

// ── Types ──────────────────────────────────────────────────────

export interface QueueTask {
  id: string
  type: 'image' | 'video' | 'tts'
  category: string // character_image, scene_image, storyboard_image, storyboard_video, tts
  referenceId: string // storyboard/character/scene ID
  dramaId: string
  episodeId?: string
  priority: number // 0=normal, 1=high (paid episodes)
  status: 'queued' | 'leased' | 'running' | 'completed' | 'failed'
  maxRetries: number
  retryCount: number
  leaseUntil?: Date
  workerId?: string
  checkpoint?: string // JSON for resume
  result?: any
  error?: string
  createdAt: Date
  updatedAt: Date
}

export type QueueEventType =
  | 'task:queued'
  | 'task:leased'
  | 'task:running'
  | 'task:completed'
  | 'task:failed'
  | 'task:retried'
  | 'task:dlq'
  | 'task:cancelled'
  | 'dlq:retried'

export interface QueueEvent {
  type: QueueEventType
  task: QueueTask
  timestamp: Date
}

export interface ChannelConfig {
  concurrency: number
  rpm: number
}

export interface ChannelStatus {
  name: string
  concurrency: number
  rpm: number
  activeCount: number
  queueDepth: number
  currentRpm: number
  totalCompleted: number
  totalFailed: number
  activeTasks: QueueTask[]
}

export interface QueueStatus {
  image: ChannelStatus
  video: ChannelStatus
  dlqCount: number
  dlqItems: QueueTask[]
  totalQueued: number
  totalActive: number
  totalCompleted: number
  totalFailed: number
}

// ── Token Bucket RPM Limiter ───────────────────────────────────

class TokenBucket {
  private tokens: number
  private lastRefill: Date
  private readonly maxTokens: number
  private readonly refillRate: number // tokens per second

  constructor(rpm: number) {
    this.maxTokens = rpm
    this.tokens = rpm
    this.lastRefill = new Date()
    this.refillRate = rpm / 60 // tokens per second
  }

  refill(): void {
    const now = new Date()
    const elapsed = (now.getTime() - this.lastRefill.getTime()) / 1000
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRate)
    this.lastRefill = now
  }

  tryConsume(): boolean {
    this.refill()
    if (this.tokens >= 1) {
      this.tokens -= 1
      return true
    }
    return false
  }

  getCurrentRpm(): number {
    this.refill()
    return Math.max(0, this.maxTokens - this.tokens)
  }

  getRemainingTokens(): number {
    this.refill()
    return Math.floor(this.tokens)
  }
}

// ── Generation Queue ───────────────────────────────────────────

const IMAGE_CHANNEL: ChannelConfig = { concurrency: 3, rpm: 20 }
const VIDEO_CHANNEL: ChannelConfig = { concurrency: 1, rpm: 5 }
const DEFAULT_MAX_RETRIES = 3
const LEASE_DURATION_MS = 5 * 60 * 1000 // 5 minutes

class GenerationQueueImpl extends EventEmitter {
  private tasks: Map<string, QueueTask> = new Map()
  private imageQueue: string[] = [] // task IDs, sorted by priority
  private videoQueue: string[] = [] // task IDs, sorted by priority
  private dlq: string[] = [] // task IDs in dead letter queue

  // Per-channel active workers
  private imageActive: Set<string> = new Set() // task IDs currently leased/running
  private videoActive: Set<string> = new Set()

  // RPM limiters (per provider bucket)
  private imageRpmBuckets: Map<string, TokenBucket> = new Map()
  private videoRpmBuckets: Map<string, TokenBucket> = new Map()

  // Stats
  private imageCompleted = 0
  private imageFailed = 0
  private videoCompleted = 0
  private videoFailed = 0

  // Checkpoint
  private checkpointTimer?: ReturnType<typeof setInterval>

  constructor() {
    super()
    this.setMaxListeners(100)
  }

  // ── Enqueue ──────────────────────────────────────────────────

  enqueue(task: Omit<QueueTask, 'id' | 'status' | 'retryCount' | 'createdAt' | 'updatedAt'>): string {
    const id = randomUUID()
    const now = new Date()
    const fullTask: QueueTask = {
      ...task,
      id,
      status: 'queued',
      retryCount: 0,
      createdAt: now,
      updatedAt: now,
    }

    this.tasks.set(id, fullTask)

    // Add to appropriate channel queue (sorted by priority, high first)
    if (this.isImageTask(fullTask)) {
      this.imageQueue.push(id)
      this.sortQueue(this.imageQueue)
    } else {
      this.videoQueue.push(id)
      this.sortQueue(this.videoQueue)
    }

    this.emitEvent('task:queued', fullTask)
    return id
  }

  // ── Dequeue (lease-based claiming) ───────────────────────────

  dequeue(channel: 'image' | 'video', workerId?: string): QueueTask | null {
    const queue = channel === 'image' ? this.imageQueue : this.videoQueue
    const active = channel === 'image' ? this.imageActive : this.videoActive
    const config = channel === 'image' ? IMAGE_CHANNEL : VIDEO_CHANNEL
    const rpmBucket = channel === 'image' ? this.imageRpmBuckets : this.videoRpmBuckets

    // Check concurrency limit
    if (active.size >= config.concurrency) {
      return null
    }

    // Find next eligible task (considering RPM limits)
    for (let i = 0; i < queue.length; i++) {
      const taskId = queue[i]
      const task = this.tasks.get(taskId)
      if (!task || task.status !== 'queued') {
        // Remove stale entries
        queue.splice(i, 1)
        i--
        continue
      }

      // Check RPM for the provider (default bucket if no specific provider)
      const providerKey = task.category || 'default'
      let bucket = rpmBucket.get(providerKey)
      if (!bucket) {
        bucket = new TokenBucket(config.rpm)
        rpmBucket.set(providerKey, bucket)
      }

      if (!bucket.tryConsume()) {
        continue // RPM limit reached for this provider, try next task
      }

      // Claim this task
      queue.splice(i, 1)
      const now = new Date()
      const leaseUntil = new Date(now.getTime() + LEASE_DURATION_MS)
      task.status = 'leased'
      task.leaseUntil = leaseUntil
      task.workerId = workerId || randomUUID()
      task.updatedAt = now
      active.add(taskId)

      this.emitEvent('task:leased', task)
      return task
    }

    return null
  }

  // ── Start (mark as running) ──────────────────────────────────

  start(taskId: string): void {
    const task = this.tasks.get(taskId)
    if (!task || task.status !== 'leased') return

    task.status = 'running'
    task.updatedAt = new Date()
    this.emitEvent('task:running', task)
  }

  // ── Complete ─────────────────────────────────────────────────

  complete(taskId: string, result: any): void {
    const task = this.tasks.get(taskId)
    if (!task) return

    task.status = 'completed'
    task.result = result
    task.updatedAt = new Date()
    task.leaseUntil = undefined
    task.workerId = undefined

    this.removeFromActive(taskId, task)

    if (this.isImageTask(task)) {
      this.imageCompleted++
    } else {
      this.videoCompleted++
    }

    this.emitEvent('task:completed', task)
  }

  // ── Fail (retry or DLQ) ──────────────────────────────────────

  fail(taskId: string, error: string): void {
    const task = this.tasks.get(taskId)
    if (!task) return

    this.removeFromActive(taskId, task)
    task.error = error
    task.updatedAt = new Date()
    task.leaseUntil = undefined
    task.workerId = undefined

    if (task.retryCount < task.maxRetries) {
      // Retry: re-queue with incremented counter
      task.retryCount++
      task.status = 'queued'

      if (this.isImageTask(task)) {
        this.imageQueue.push(taskId)
        this.sortQueue(this.imageQueue)
      } else {
        this.videoQueue.push(taskId)
        this.sortQueue(this.videoQueue)
      }

      this.emitEvent('task:retried', task)
    } else {
      // Move to DLQ
      task.status = 'failed'
      this.dlq.push(taskId)

      if (this.isImageTask(task)) {
        this.imageFailed++
      } else {
        this.videoFailed++
      }

      this.emitEvent('task:dlq', task)
    }
  }

  // ── Cancel ───────────────────────────────────────────────────

  cancel(taskId: string): boolean {
    const task = this.tasks.get(taskId)
    if (!task) return false
    if (task.status === 'completed') return false

    // Remove from queue
    if (this.isImageTask(task)) {
      const idx = this.imageQueue.indexOf(taskId)
      if (idx >= 0) this.imageQueue.splice(idx, 1)
    } else {
      const idx = this.videoQueue.indexOf(taskId)
      if (idx >= 0) this.videoQueue.splice(idx, 1)
    }

    this.removeFromActive(taskId, task)

    task.status = 'failed'
    task.error = 'Cancelled by user'
    task.updatedAt = new Date()
    task.leaseUntil = undefined
    task.workerId = undefined

    this.emitEvent('task:cancelled', task)
    return true
  }

  // ── Retry from DLQ ───────────────────────────────────────────

  retryFromDLQ(taskId: string): boolean {
    const idx = this.dlq.indexOf(taskId)
    if (idx < 0) return false

    const task = this.tasks.get(taskId)
    if (!task) return false

    this.dlq.splice(idx, 1)
    task.status = 'queued'
    task.retryCount = 0
    task.error = undefined
    task.result = undefined
    task.updatedAt = new Date()

    if (this.isImageTask(task)) {
      this.imageQueue.push(taskId)
      this.sortQueue(this.imageQueue)
    } else {
      this.videoQueue.push(taskId)
      this.sortQueue(this.videoQueue)
    }

    this.emitEvent('dlq:retried', task)
    return true
  }

  // ── Get task ─────────────────────────────────────────────────

  getTask(taskId: string): QueueTask | undefined {
    return this.tasks.get(taskId)
  }

  // ── Get status ───────────────────────────────────────────────

  getStatus(): QueueStatus {
    // Reclaim expired leases
    this.reclaimExpiredLeases()

    const imageActiveTasks = Array.from(this.imageActive)
      .map((id) => this.tasks.get(id))
      .filter(Boolean) as QueueTask[]
    const videoActiveTasks = Array.from(this.videoActive)
      .map((id) => this.tasks.get(id))
      .filter(Boolean) as QueueTask[]

    const dlqItems = this.dlq
      .map((id) => this.tasks.get(id))
      .filter(Boolean) as QueueTask[]

    // Calculate current RPM usage
    const imageRpmUsage = this.getCurrentRpm(this.imageRpmBuckets)
    const videoRpmUsage = this.getCurrentRpm(this.videoRpmBuckets)

    return {
      image: {
        name: 'image',
        concurrency: IMAGE_CHANNEL.concurrency,
        rpm: IMAGE_CHANNEL.rpm,
        activeCount: this.imageActive.size,
        queueDepth: this.imageQueue.length,
        currentRpm: imageRpmUsage,
        totalCompleted: this.imageCompleted,
        totalFailed: this.imageFailed,
        activeTasks: imageActiveTasks,
      },
      video: {
        name: 'video',
        concurrency: VIDEO_CHANNEL.concurrency,
        rpm: VIDEO_CHANNEL.rpm,
        activeCount: this.videoActive.size,
        queueDepth: this.videoQueue.length,
        currentRpm: videoRpmUsage,
        totalCompleted: this.videoCompleted,
        totalFailed: this.videoFailed,
        activeTasks: videoActiveTasks,
      },
      dlqCount: this.dlq.length,
      dlqItems,
      totalQueued: this.imageQueue.length + this.videoQueue.length,
      totalActive: this.imageActive.size + this.videoActive.size,
      totalCompleted: this.imageCompleted + this.videoCompleted,
      totalFailed: this.imageFailed + this.videoFailed,
    }
  }

  // ── Get DLQ items ────────────────────────────────────────────

  getDLQItems(): QueueTask[] {
    return this.dlq
      .map((id) => this.tasks.get(id))
      .filter(Boolean) as QueueTask[]
  }

  // ── Subscribe to events ──────────────────────────────────────

  onEvent(callback: (event: QueueEvent) => void): () => void {
    const handler = (event: QueueEvent) => callback(event)
    this.on('queue-event', handler)
    return () => this.off('queue-event', handler)
  }

  // ── Checkpoint (for resume capability) ───────────────────────

  getCheckpoint(): string {
    const data = {
      tasks: Array.from(this.tasks.entries()),
      imageQueue: this.imageQueue,
      videoQueue: this.videoQueue,
      dlq: this.dlq,
      imageCompleted: this.imageCompleted,
      imageFailed: this.imageFailed,
      videoCompleted: this.videoCompleted,
      videoFailed: this.videoFailed,
      checkpointAt: new Date().toISOString(),
    }
    return JSON.stringify(data)
  }

  restoreFromCheckpoint(checkpoint: string): void {
    try {
      const data = JSON.parse(checkpoint)
      this.tasks = new Map(data.tasks)
      this.imageQueue = data.imageQueue || []
      this.videoQueue = data.videoQueue || []
      this.dlq = data.dlq || []
      this.imageCompleted = data.imageCompleted || 0
      this.imageFailed = data.imageFailed || 0
      this.videoCompleted = data.videoCompleted || 0
      this.videoFailed = data.videoFailed || 0

      // Reset active sets — leased tasks need to be re-claimed
      this.imageActive.clear()
      this.videoActive.clear()

      // Re-queue any leased/running tasks (they'll be picked up again)
      for (const [id, task] of this.tasks) {
        if (task.status === 'leased' || task.status === 'running') {
          task.status = 'queued'
          task.leaseUntil = undefined
          task.workerId = undefined
          task.updatedAt = new Date()

          if (this.isImageTask(task)) {
            this.imageQueue.push(id)
          } else {
            this.videoQueue.push(id)
          }
        }
      }

      this.sortQueue(this.imageQueue)
      this.sortQueue(this.videoQueue)
    } catch (err) {
      console.error('[GenerationQueue] Failed to restore checkpoint:', err)
    }
  }

  // ── Internal helpers ─────────────────────────────────────────

  private isImageTask(task: QueueTask): boolean {
    return task.type === 'image' || task.type === 'tts'
  }

  private sortQueue(queue: string[]): void {
    queue.sort((a, b) => {
      const taskA = this.tasks.get(a)
      const taskB = this.tasks.get(b)
      if (!taskA || !taskB) return 0
      // Higher priority first, then earlier createdAt
      if (taskB.priority !== taskA.priority) return taskB.priority - taskA.priority
      return taskA.createdAt.getTime() - taskB.createdAt.getTime()
    })
  }

  private removeFromActive(taskId: string, task: QueueTask): void {
    if (this.isImageTask(task)) {
      this.imageActive.delete(taskId)
    } else {
      this.videoActive.delete(taskId)
    }
  }

  private reclaimExpiredLeases(): void {
    const now = new Date()
    const checkAndReclaim = (activeSet: Set<string>) => {
      for (const taskId of activeSet) {
        const task = this.tasks.get(taskId)
        if (task && task.leaseUntil && task.leaseUntil < now) {
          // Lease expired — treat as failure
          activeSet.delete(taskId)
          task.error = 'Lease expired'
          task.updatedAt = now
          task.leaseUntil = undefined
          task.workerId = undefined

          if (task.retryCount < task.maxRetries) {
            task.retryCount++
            task.status = 'queued'
            if (this.isImageTask(task)) {
              this.imageQueue.push(taskId)
              this.sortQueue(this.imageQueue)
            } else {
              this.videoQueue.push(taskId)
              this.sortQueue(this.videoQueue)
            }
            this.emitEvent('task:retried', task)
          } else {
            task.status = 'failed'
            this.dlq.push(taskId)
            if (this.isImageTask(task)) {
              this.imageFailed++
            } else {
              this.videoFailed++
            }
            this.emitEvent('task:dlq', task)
          }
        }
      }
    }
    checkAndReclaim(this.imageActive)
    checkAndReclaim(this.videoActive)
  }

  private emitEvent(type: QueueEventType, task: QueueTask): void {
    const event: QueueEvent = {
      type,
      task: { ...task },
      timestamp: new Date(),
    }
    this.emit('queue-event', event)
  }

  private getCurrentRpm(buckets: Map<string, TokenBucket>): number {
    let total = 0
    for (const bucket of buckets.values()) {
      total += bucket.getCurrentRpm()
    }
    return total
  }

  // ── Start periodic checkpoint ────────────────────────────────

  startCheckpointTimer(intervalMs: number = 30000): void {
    this.stopCheckpointTimer()
    this.checkpointTimer = setInterval(async () => {
      // Auto-save checkpoint to memory (can be persisted to disk/DB in Phase 4)
      const checkpoint = this.getCheckpoint()
      // Store in a file for resume capability
      try {
        const fs = await import('fs/promises')
        const path = await import('path')
        const dir = '/tmp/drama-storage/queue'
        await fs.mkdir(dir, { recursive: true })
        await fs.writeFile(path.join(dir, 'checkpoint.json'), checkpoint)
      } catch {
        // Ignore checkpoint save errors
      }
    }, intervalMs)
  }

  stopCheckpointTimer(): void {
    if (this.checkpointTimer) {
      clearInterval(this.checkpointTimer)
      this.checkpointTimer = undefined
    }
  }
}

// ── Singleton ──────────────────────────────────────────────────

let _instance: GenerationQueueImpl | null = null

export function getGenerationQueue(): GenerationQueueImpl {
  if (!_instance) {
    _instance = new GenerationQueueImpl()
    _instance.startCheckpointTimer()
  }
  return _instance
}

// Also export the class for testing
export { GenerationQueueImpl }

// Re-export types for convenience
export type { ChannelConfig, ChannelStatus }
