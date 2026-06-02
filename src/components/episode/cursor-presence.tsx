'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { getRealtimeClient, getUserColor, type PresenceInfo } from '@/lib/realtime'

// ── Types ───────────────────────────────────────────────────

interface CursorPresenceProps {
  dramaId: string
  containerRef?: React.RefObject<HTMLDivElement | null>
  episodeId?: string
}

interface CursorData {
  userId: string
  userName: string
  userAvatar: string | null
  x: number  // 0-1 percentage
  y: number  // 0-1 percentage
  color: string
  lastUpdate: number
}

// ── Component ───────────────────────────────────────────────

export function CursorPresence({ dramaId, containerRef, episodeId }: CursorPresenceProps) {
  const [cursors, setCursors] = useState<Map<string, CursorData>>(new Map())
  const client = getRealtimeClient()
  const lastCursorSent = useRef(0)

  // Fetch presence periodically
  const fetchPresence = useCallback(async () => {
    const presences = await client.getPresence()
    const newCursors = new Map<string, CursorData>()
    for (const p of presences) {
      // Filter to current episode if specified
      if (episodeId && p.episodeId && p.episodeId !== episodeId) continue
      // Skip cursors at 0,0 (not actively tracking)
      if (p.cursorX === 0 && p.cursorY === 0) continue
      newCursors.set(p.userId, {
        userId: p.userId,
        userName: p.userName,
        userAvatar: p.userAvatar,
        x: p.cursorX,
        y: p.cursorY,
        color: getUserColor(p.userId),
        lastUpdate: Date.now(),
      })
    }
    setCursors(newCursors)
  }, [client, episodeId])

  // Subscribe to cursor events
  useEffect(() => {
    const unsub = client.on('cursor_move', (event) => {
      if (episodeId && event.episodeId && event.episodeId !== episodeId) return
      const cursorX = (event.data.cursorX as number) ?? 0
      const cursorY = (event.data.cursorY as number) ?? 0
      setCursors((prev) => {
        const next = new Map(prev)
        next.set(event.userId, {
          userId: event.userId,
          userName: event.userName,
          userAvatar: event.userAvatar,
          x: cursorX,
          y: cursorY,
          color: getUserColor(event.userId),
          lastUpdate: Date.now(),
        })
        return next
      })
    })

    return unsub
  }, [client, episodeId])

  // Track mouse movements and send cursor position
  useEffect(() => {
    const container = containerRef?.current
    if (!container) return

    const handleMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect()
      const x = (e.clientX - rect.left) / rect.width
      const y = (e.clientY - rect.top) / rect.height

      // Throttle to ~100ms
      const now = Date.now()
      if (now - lastCursorSent.current < 100) return
      lastCursorSent.current = now

      client.updateCursor(x, y, episodeId)
    }

    container.addEventListener('mousemove', handleMouseMove)
    return () => container.removeEventListener('mousemove', handleMouseMove)
  }, [client, containerRef, episodeId])

  // Periodic presence refresh
  useEffect(() => {
    fetchPresence()
    const interval = setInterval(fetchPresence, 3000)
    return () => clearInterval(interval)
  }, [fetchPresence])

  // Clean up stale cursors (> 60s without update)
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now()
      setCursors((prev) => {
        const next = new Map(prev)
        for (const [key, cursor] of next) {
          if (now - cursor.lastUpdate > 60000) {
            next.delete(key)
          }
        }
        return next
      })
    }, 10000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="pointer-events-none absolute inset-0 z-30">
      <AnimatePresence>
        {Array.from(cursors.entries()).map(([userId, cursor]) => (
          <motion.div
            key={userId}
            className="absolute"
            style={{
              left: `${cursor.x * 100}%`,
              top: `${cursor.y * 100}%`,
            }}
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5 }}
            transition={{ type: 'spring', stiffness: 500, damping: 35, mass: 0.5 }}
          >
            {/* Cursor arrow */}
            <svg
              width="16"
              height="20"
              viewBox="0 0 16 20"
              fill="none"
              className="drop-shadow-sm"
            >
              <path
                d="M0 0L16 12L8 12L4 20L0 0Z"
                fill={cursor.color}
                stroke="white"
                strokeWidth="1"
              />
            </svg>
            {/* Name label */}
            <div
              className="absolute left-4 top-3 rounded-md px-1.5 py-0.5 text-[10px] font-medium text-white whitespace-nowrap shadow-sm"
              style={{ backgroundColor: cursor.color }}
            >
              {cursor.userName}
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
