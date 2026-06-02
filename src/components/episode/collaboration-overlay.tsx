'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { getRealtimeClient, getUserColor } from '@/lib/realtime'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  MessageSquare,
  X,
  Send,
  Pin,
  Reply,
  AtSign,
  Check,
  Loader2,
} from 'lucide-react'

// ── Types ───────────────────────────────────────────────────

interface CommentPin {
  id: string
  content: string
  resolved: boolean
  position: { x: number; y: number } | null
  createdAt: string
  userId: string
  userName: string
  userAvatar: string | null
  parentId: string | null
  replies: CommentPin[]
}

interface CollaborationOverlayProps {
  dramaId: string
  episodeId?: string
  storyboardId?: string
  containerRef?: React.RefObject<HTMLDivElement | null>
}

// ── Component ───────────────────────────────────────────────

export function CollaborationOverlay({
  dramaId,
  episodeId,
  storyboardId,
  containerRef,
}: CollaborationOverlayProps) {
  const { toast } = useToast()
  const client = getRealtimeClient()

  const [comments, setComments] = useState<CommentPin[]>([])
  const [loading, setLoading] = useState(true)
  const [activePin, setActivePin] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')
  const [newPinMode, setNewPinMode] = useState(false)
  const [newPinPosition, setNewPinPosition] = useState<{ x: number; y: number } | null>(null)
  const [newPinText, setNewPinText] = useState('')
  const [sending, setSending] = useState(false)
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [members, setMembers] = useState<Array<{ id: string; name: string; avatar: string | null }>>([])

  // Fetch comments
  const fetchComments = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (storyboardId) params.set('storyboardId', storyboardId)
      else if (episodeId) params.set('episodeId', episodeId)

      const res = await fetch(`/api/dramas/${dramaId}/comments?${params.toString()}`)
      if (!res.ok) return
      const data = await res.json()
      const rawComments = data.comments ?? []

      // Build threaded structure
      const rootComments: CommentPin[] = []
      const replyMap = new Map<string, CommentPin[]>()

      for (const c of rawComments) {
        const pin: CommentPin = {
          id: c.id,
          content: c.content,
          resolved: c.resolved,
          position: c.position ? JSON.parse(c.position) : null,
          createdAt: c.createdAt,
          userId: c.userId,
          userName: c.user?.name ?? '',
          userAvatar: c.user?.avatar ?? null,
          parentId: c.parentId,
          replies: [],
        }
        if (c.parentId) {
          if (!replyMap.has(c.parentId)) replyMap.set(c.parentId, [])
          replyMap.get(c.parentId)!.push(pin)
        } else {
          rootComments.push(pin)
        }
      }

      // Attach replies
      for (const root of rootComments) {
        root.replies = replyMap.get(root.id) ?? []
      }

      setComments(rootComments)
    } catch {
      // Silently fail
    } finally {
      setLoading(false)
    }
  }, [dramaId, episodeId, storyboardId])

  // Fetch members for @mention
  const fetchMembers = useCallback(async () => {
    try {
      const res = await fetch(`/api/dramas/${dramaId}/members`)
      if (!res.ok) return
      const data = await res.json()
      setMembers(
        (data.members ?? []).map((m: any) => ({
          id: m.userId,
          name: m.user?.name ?? '',
          avatar: m.user?.avatar ?? null,
        }))
      )
    } catch {
      // Silently fail
    }
  }, [dramaId])

  useEffect(() => {
    fetchComments()
    fetchMembers()
  }, [fetchComments, fetchMembers])

  // Subscribe to new comment events
  useEffect(() => {
    const unsub = client.on('comment_add', () => fetchComments())
    const unsub2 = client.on('comment_reply', () => fetchComments())
    return () => {
      unsub()
      unsub2()
    }
  }, [client, fetchComments])

  // Click to add pin
  const handleContainerClick = useCallback(
    (e: React.MouseEvent) => {
      if (!newPinMode) return
      const container = containerRef?.current
      if (!container) return
      const rect = container.getBoundingClientRect()
      const x = (e.clientX - rect.left) / rect.width
      const y = (e.clientY - rect.top) / rect.height
      setNewPinPosition({ x, y })
    },
    [newPinMode, containerRef]
  )

  // Add a pinned comment
  const handleAddPinComment = async () => {
    if (!newPinText.trim()) return
    setSending(true)
    try {
      const body: any = {
        content: newPinText.trim(),
        episodeId: episodeId || undefined,
        storyboardId: storyboardId || undefined,
        position: newPinPosition ? JSON.stringify(newPinPosition) : undefined,
      }

      // Extract mentions
      const mentionRegex = /@(\S+)/g
      const mentions: string[] = []
      let match
      while ((match = mentionRegex.exec(newPinText)) !== null) {
        const member = members.find((m) => m.name === match[1])
        if (member) mentions.push(member.id)
      }
      if (mentions.length > 0) {
        body.mentions = JSON.stringify(mentions)
      }

      const res = await fetch(`/api/dramas/${dramaId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('Failed to add comment')

      setNewPinText('')
      setNewPinPosition(null)
      setNewPinMode(false)
      fetchComments()
      toast({ title: '评论已添加' })
    } catch (err) {
      toast({ title: '评论失败', description: String(err), variant: 'destructive' })
    } finally {
      setSending(false)
    }
  }

  // Reply to a comment
  const handleReply = async (parentId: string) => {
    if (!replyText.trim()) return
    setSending(true)
    try {
      const body: any = {
        content: replyText.trim(),
        episodeId: episodeId || undefined,
        storyboardId: storyboardId || undefined,
        parentId,
      }

      const mentionRegex = /@(\S+)/g
      const mentions: string[] = []
      let match
      while ((match = mentionRegex.exec(replyText)) !== null) {
        const member = members.find((m) => m.name === match[1])
        if (member) mentions.push(member.id)
      }
      if (mentions.length > 0) {
        body.mentions = JSON.stringify(mentions)
      }

      const res = await fetch(`/api/dramas/${dramaId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('Failed to reply')

      setReplyText('')
      setActivePin(null)
      fetchComments()
      toast({ title: '回复已添加' })
    } catch (err) {
      toast({ title: '回复失败', description: String(err), variant: 'destructive' })
    } finally {
      setSending(false)
    }
  }

  // Resolve/unresolve comment
  const handleToggleResolve = async (commentId: string, resolved: boolean) => {
    try {
      await fetch(`/api/comments/${commentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolved: !resolved }),
      })
      fetchComments()
    } catch {
      // Silently fail
    }
  }

  // Filter to pinned comments only (have position)
  const pinnedComments = comments.filter((c) => c.position && !c.resolved)

  return (
    <div
      className="absolute inset-0 z-20"
      onClick={handleContainerClick}
      style={{ cursor: newPinMode ? 'crosshair' : 'default' }}
    >
      {/* Pin mode toggle button */}
      <div className="absolute top-2 right-2 z-40">
        <Button
          variant={newPinMode ? 'default' : 'outline'}
          size="sm"
          className="h-7 gap-1 text-xs"
          onClick={(e) => {
            e.stopPropagation()
            setNewPinMode(!newPinMode)
            setNewPinPosition(null)
          }}
        >
          <Pin className="size-3" />
          {newPinMode ? '取消标注' : '添加标注'}
        </Button>
      </div>

      {/* Floating pins on storyboard */}
      <AnimatePresence>
        {pinnedComments.map((comment) => (
          <motion.div
            key={comment.id}
            className="absolute"
            style={{
              left: `${(comment.position?.x ?? 0) * 100}%`,
              top: `${(comment.position?.y ?? 0) * 100}%`,
            }}
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          >
            {/* Pin marker */}
            <button
              className="pointer-events-auto -translate-x-1/2 -translate-y-full"
              onClick={(e) => {
                e.stopPropagation()
                setActivePin(activePin === comment.id ? null : comment.id)
              }}
            >
              <div className="relative">
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold shadow-md border-2 border-white"
                  style={{ backgroundColor: getUserColor(comment.userId) }}
                >
                  {comment.userName[0] || '?'}
                </div>
                <div
                  className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent"
                  style={{ borderTopColor: getUserColor(comment.userId) }}
                />
              </div>
            </button>

            {/* Comment popup */}
            <AnimatePresence>
              {activePin === comment.id && (
                <motion.div
                  className="pointer-events-auto absolute left-4 top-0 w-64 bg-background border border-border rounded-lg shadow-lg z-50"
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Avatar className="size-5">
                        <AvatarImage src={comment.userAvatar ?? undefined} />
                        <AvatarFallback className="text-[8px]">
                          {comment.userName[0] || '?'}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-xs font-medium">{comment.userName}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="ml-auto h-5 w-5 p-0"
                        onClick={() => setActivePin(null)}
                      >
                        <X className="size-3" />
                      </Button>
                    </div>
                    <p className="text-xs text-foreground/90 mb-2 break-words">{comment.content}</p>

                    {/* Replies */}
                    {comment.replies.length > 0 && (
                      <div className="space-y-1.5 mb-2 pl-3 border-l-2 border-border">
                        {comment.replies.map((reply) => (
                          <div key={reply.id}>
                            <div className="flex items-center gap-1.5">
                              <Avatar className="size-4">
                                <AvatarImage src={reply.userAvatar ?? undefined} />
                                <AvatarFallback className="text-[7px]">
                                  {reply.userName[0] || '?'}
                                </AvatarFallback>
                              </Avatar>
                              <span className="text-[10px] font-medium">{reply.userName}</span>
                            </div>
                            <p className="text-[10px] text-foreground/80 mt-0.5 break-words">{reply.content}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Reply input */}
                    <div className="flex items-center gap-1">
                      <Input
                        placeholder="回复..."
                        value={replyText}
                        onChange={(e) => {
                          setReplyText(e.target.value)
                          // Detect @mention
                          const lastAtIndex = e.target.value.lastIndexOf('@')
                          if (lastAtIndex !== -1) {
                            const query = e.target.value.slice(lastAtIndex + 1)
                            if (query.length > 0 && !query.includes(' ')) {
                              setMentionQuery(query)
                            } else {
                              setMentionQuery(null)
                            }
                          } else {
                            setMentionQuery(null)
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault()
                            handleReply(comment.id)
                          }
                        }}
                        className="h-7 text-[10px]"
                        disabled={sending}
                      />
                      <Button
                        size="sm"
                        className="h-7 w-7 p-0 shrink-0"
                        onClick={() => handleReply(comment.id)}
                        disabled={!replyText.trim() || sending}
                      >
                        {sending ? <Loader2 className="size-3 animate-spin" /> : <Send className="size-3" />}
                      </Button>
                    </div>

                    {/* @mention dropdown */}
                    {mentionQuery && (
                      <div className="mt-1 border rounded-md bg-popover p-1 max-h-24 overflow-y-auto">
                        {members
                          .filter((m) => m.name.toLowerCase().includes(mentionQuery.toLowerCase()))
                          .slice(0, 5)
                          .map((m) => (
                            <button
                              key={m.id}
                              className="flex items-center gap-1.5 w-full px-2 py-1 text-[10px] hover:bg-muted rounded"
                              onClick={() => {
                                const lastAtIndex = replyText.lastIndexOf('@')
                                setReplyText(
                                  replyText.slice(0, lastAtIndex) + `@${m.name} `
                                )
                                setMentionQuery(null)
                              }}
                            >
                              <Avatar className="size-4">
                                <AvatarImage src={m.avatar ?? undefined} />
                                <AvatarFallback className="text-[7px]">{m.name[0]}</AvatarFallback>
                              </Avatar>
                              <span>{m.name}</span>
                            </button>
                          ))}
                      </div>
                    )}

                    {/* Resolve button */}
                    <div className="mt-2 flex justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-5 px-1.5 text-[9px] gap-0.5 text-emerald-600 hover:text-emerald-700"
                        onClick={() => handleToggleResolve(comment.id, comment.resolved)}
                      >
                        <Check className="size-2.5" />
                        标记解决
                      </Button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        ))}
      </AnimatePresence>

      {/* New pin placement popup */}
      <AnimatePresence>
        {newPinPosition && (
          <motion.div
            className="pointer-events-auto absolute z-50"
            style={{
              left: `${newPinPosition.x * 100}%`,
              top: `${newPinPosition.y * 100}%`,
            }}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-56 bg-background border border-border rounded-lg shadow-lg p-3 -translate-x-1/2 -translate-y-full mb-2">
              <div className="flex items-center gap-1.5 mb-2">
                <Pin className="size-3 text-primary" />
                <span className="text-xs font-medium">添加标注</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto h-5 w-5 p-0"
                  onClick={() => {
                    setNewPinPosition(null)
                    setNewPinMode(false)
                  }}
                >
                  <X className="size-3" />
                </Button>
              </div>
              <div className="flex items-center gap-1">
                <Input
                  placeholder="输入评论..."
                  value={newPinText}
                  onChange={(e) => setNewPinText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleAddPinComment()
                    }
                  }}
                  className="h-7 text-xs"
                  autoFocus
                  disabled={sending}
                />
                <Button
                  size="sm"
                  className="h-7 w-7 p-0 shrink-0"
                  onClick={handleAddPinComment}
                  disabled={!newPinText.trim() || sending}
                >
                  {sending ? <Loader2 className="size-3 animate-spin" /> : <Send className="size-3" />}
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
