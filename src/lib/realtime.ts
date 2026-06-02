// ============================================================
// Real-time Event System — SSE + polling fallback
// Designed with a WebSocket-like API so it's easy to swap later
// ============================================================

// ── Event Types ─────────────────────────────────────────────

export type RealtimeEventType =
  | 'user_join'
  | 'user_leave'
  | 'cursor_move'
  | 'storyboard_update'
  | 'comment_add'
  | 'comment_reply'
  | 'lock_resource'
  | 'unlock_resource'
  | 'presence_update'

export interface RealtimeEvent {
  type: RealtimeEventType
  dramaId: string
  episodeId?: string
  userId: string
  userName: string
  userAvatar: string | null
  timestamp: number
  data: Record<string, unknown>
}

export interface PresenceInfo {
  userId: string
  userName: string
  userAvatar: string | null
  dramaId: string
  episodeId?: string
  currentPage: string
  cursorX: number
  cursorY: number
  lastHeartbeat: string
  color: string
}

export interface ResourceLockInfo {
  id: string
  userId: string
  userName: string
  userAvatar: string | null
  dramaId: string
  resourceType: string
  resourceId: string
  lockedAt: string
  expiresAt: string
}

export interface ActivityItem {
  id: string
  userId: string
  userName: string
  userAvatar: string | null
  dramaId: string
  episodeId?: string
  type: string
  description: string
  metadata: Record<string, unknown>
  createdAt: string
}

// ── User Color Assignment ───────────────────────────────────

const USER_COLORS = [
  '#E5484D', // Red
  '#F76B15', // Orange
  '#E54600', // Deep Orange
  '#12A594', // Teal
  '#0CA4A5', // Cyan
  '#3E63DD', // Blue
  '#8E4EC6', // Purple
  '#AB4ABA', // Magenta
  '#E93D82', // Pink
  '#30A46C', // Green
  '#889096', // Gray
  '#9A4700', // Brown
]

export function getUserColor(userId: string): string {
  let hash = 0
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash + userId.charCodeAt(i)) | 0
  }
  return USER_COLORS[Math.abs(hash) % USER_COLORS.length]
}

// ── Event Bus (Client-side) ─────────────────────────────────

type EventHandler = (event: RealtimeEvent) => void

class EventBus {
  private handlers: Map<RealtimeEventType, Set<EventHandler>> = new Map()
  private globalHandlers: Set<EventHandler> = new Set()

  on(type: RealtimeEventType, handler: EventHandler): () => void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set())
    }
    this.handlers.get(type)!.add(handler)
    return () => {
      this.handlers.get(type)?.delete(handler)
    }
  }

  onAny(handler: EventHandler): () => void {
    this.globalHandlers.add(handler)
    return () => {
      this.globalHandlers.delete(handler)
    }
  }

  emit(event: RealtimeEvent): void {
    // Type-specific handlers
    this.handlers.get(event.type)?.forEach((handler) => {
      try { handler(event) } catch (e) { console.error('[realtime] Event handler error:', e) }
    })
    // Global handlers
    this.globalHandlers.forEach((handler) => {
      try { handler(event) } catch (e) { console.error('[realtime] Global handler error:', e) }
    })
  }

  removeAll(): void {
    this.handlers.clear()
    this.globalHandlers.clear()
  }
}

// ── SSE Connection Manager ──────────────────────────────────

export class RealtimeClient {
  private eventBus = new EventBus()
  private sseConnection: EventSource | null = null
  private pollingInterval: ReturnType<typeof setInterval> | null = null
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null
  private dramaId: string | null = null
  private userId: string | null = null
  private _connected = false
  private lastActivityId = ''
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null

  get connected(): boolean {
    return this._connected
  }

  // ── Connect to SSE stream ────────────────────────────────

  connect(dramaId: string, userId: string): void {
    this.dramaId = dramaId
    this.userId = userId
    this.disconnect()

    // Register presence
    this.sendPresence('join')

    // Start heartbeat (every 15s)
    this.heartbeatInterval = setInterval(() => {
      this.sendPresence('heartbeat')
    }, 15000)

    // Try SSE first, fallback to polling
    this.startSSE()
  }

  disconnect(): void {
    // Leave presence
    if (this.dramaId && this.userId) {
      this.sendPresence('leave')
    }

    // Cleanup SSE
    if (this.sseConnection) {
      this.sseConnection.close()
      this.sseConnection = null
    }

    // Cleanup polling
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval)
      this.pollingInterval = null
    }

    // Cleanup heartbeat
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
    }

    // Cleanup reconnect
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout)
      this.reconnectTimeout = null
    }

    this._connected = false
    this.reconnectAttempts = 0
  }

  // ── Event subscription ───────────────────────────────────

  on(type: RealtimeEventType, handler: EventHandler): () => void {
    return this.eventBus.on(type, handler)
  }

  onAny(handler: EventHandler): () => void {
    return this.eventBus.onAny(handler)
  }

  // ── Presence / cursor ────────────────────────────────────

  async updateCursor(cursorX: number, cursorY: number, episodeId?: string): Promise<void> {
    if (!this.dramaId) return
    try {
      await fetch(`/api/dramas/${this.dramaId}/presence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cursorX, cursorY, episodeId }),
      })
    } catch {
      // Graceful degradation
    }
  }

  async updatePage(currentPage: string, episodeId?: string): Promise<void> {
    if (!this.dramaId) return
    try {
      await fetch(`/api/dramas/${this.dramaId}/presence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPage, episodeId }),
      })
    } catch {
      // Graceful degradation
    }
  }

  // ── Fetch helpers ────────────────────────────────────────

  async getPresence(): Promise<PresenceInfo[]> {
    if (!this.dramaId) return []
    try {
      const res = await fetch(`/api/dramas/${this.dramaId}/presence`)
      if (!res.ok) return []
      const data = await res.json()
      return (data.presences ?? []).map((p: any) => ({
        ...p,
        color: getUserColor(p.userId),
      }))
    } catch {
      return []
    }
  }

  async getLocks(): Promise<ResourceLockInfo[]> {
    if (!this.dramaId) return []
    try {
      const res = await fetch(`/api/dramas/${this.dramaId}/locks`)
      if (!res.ok) return []
      const data = await res.json()
      return data.locks ?? []
    } catch {
      return []
    }
  }

  async getActivities(afterId?: string): Promise<ActivityItem[]> {
    if (!this.dramaId) return []
    try {
      const params = afterId ? `?afterId=${afterId}` : ''
      const res = await fetch(`/api/dramas/${this.dramaId}/activity${params}`)
      if (!res.ok) return []
      const data = await res.json()
      return data.activities ?? []
    } catch {
      return []
    }
  }

  // ── Lock management ──────────────────────────────────────

  async lockResource(resourceType: string, resourceId: string): Promise<ResourceLockInfo | null> {
    if (!this.dramaId) return null
    try {
      const res = await fetch(`/api/dramas/${this.dramaId}/locks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resourceType, resourceId }),
      })
      if (!res.ok) return null
      const data = await res.json()
      return data.lock ?? null
    } catch {
      return null
    }
  }

  async unlockResource(resourceType: string, resourceId: string): Promise<boolean> {
    if (!this.dramaId) return false
    try {
      const res = await fetch(`/api/dramas/${this.dramaId}/locks/${resourceId}?resourceType=${resourceType}`, {
        method: 'DELETE',
      })
      return res.ok
    } catch {
      return false
    }
  }

  // ── Private methods ──────────────────────────────────────

  private startSSE(): void {
    if (!this.dramaId) return

    try {
      const url = `/api/dramas/${this.dramaId}/activity?stream=true&lastId=${this.lastActivityId}`
      this.sseConnection = new EventSource(url)

      this.sseConnection.onopen = () => {
        this._connected = true
        this.reconnectAttempts = 0
      }

      this.sseConnection.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          if (data.id) {
            this.lastActivityId = data.id
          }
          const rtEvent: RealtimeEvent = {
            type: data.type as RealtimeEventType,
            dramaId: data.dramaId ?? this.dramaId!,
            episodeId: data.episodeId,
            userId: data.userId ?? '',
            userName: data.userName ?? '',
            userAvatar: data.userAvatar ?? null,
            timestamp: data.timestamp ?? Date.now(),
            data: data.metadata ?? {},
          }
          this.eventBus.emit(rtEvent)
        } catch {
          // Ignore parse errors
        }
      }

      this.sseConnection.onerror = () => {
        this._connected = false
        this.sseConnection?.close()
        this.sseConnection = null

        // Fallback to polling
        this.startPolling()
      }
    } catch {
      this.startPolling()
    }
  }

  private startPolling(): void {
    if (this.pollingInterval) return

    this.pollingInterval = setInterval(async () => {
      try {
        const activities = await this.getActivities(this.lastActivityId)
        for (const activity of activities) {
          if (activity.id) {
            this.lastActivityId = activity.id
          }
          const rtEvent: RealtimeEvent = {
            type: activity.type as RealtimeEventType,
            dramaId: activity.dramaId,
            episodeId: activity.episodeId,
            userId: activity.userId,
            userName: activity.userName,
            userAvatar: activity.userAvatar,
            timestamp: new Date(activity.createdAt).getTime(),
            data: activity.metadata ?? {},
          }
          this.eventBus.emit(rtEvent)
        }
        if (activities.length > 0) {
          this._connected = true
        }
      } catch {
        // Continue polling
      }
    }, 3000) // Poll every 3 seconds
  }

  private async sendPresence(action: 'join' | 'heartbeat' | 'leave'): Promise<void> {
    if (!this.dramaId) return
    try {
      const url = `/api/dramas/${this.dramaId}/presence`
      if (action === 'leave') {
        await fetch(url, { method: 'DELETE' })
      } else {
        await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action }),
        })
      }
    } catch {
      // Graceful degradation
    }
  }
}

// ── Singleton ───────────────────────────────────────────────

let _client: RealtimeClient | null = null

export function getRealtimeClient(): RealtimeClient {
  if (!_client) {
    _client = new RealtimeClient()
  }
  return _client
}

export function resetRealtimeClient(): void {
  if (_client) {
    _client.disconnect()
    _client = null
  }
}
