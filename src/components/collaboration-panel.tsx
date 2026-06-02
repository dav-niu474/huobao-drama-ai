'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { getRealtimeClient, getUserColor, type PresenceInfo, type ActivityItem } from '@/lib/realtime'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Users,
  MessageSquare,
  UserPlus,
  Trash2,
  Check,
  X,
  Send,
  Loader2,
  Activity,
  Circle,
  Lock,
  AtSign,
  LogIn,
  LogOut,
  Pencil,
} from 'lucide-react'

// ── Types ───────────────────────────────────────────────────

interface MemberUser {
  id: string
  name: string
  email: string
  avatar: string | null
}

interface Member {
  id: string
  userId: string
  role: string
  status: string
  joinedAt: string
  user: MemberUser
}

interface CommentData {
  id: string
  content: string
  resolved: boolean
  createdAt: string
  episodeId?: string
  storyboardId?: string
  parentId?: string | null
  user: {
    name: string
    avatar: string | null
  }
}

// ── Helpers ─────────────────────────────────────────────────

function relativeTime(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diff = Math.max(0, now - then)
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes}分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}小时前`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}天前`
  return `${Math.floor(days / 30)}个月前`
}

const ROLE_BADGE: Record<string, { label: string; className: string }> = {
  owner: { label: '所有者', className: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800' },
  editor: { label: '编辑者', className: 'bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-900/30 dark:text-sky-400 dark:border-sky-800' },
  viewer: { label: '查看者', className: 'bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-800/30 dark:text-zinc-400 dark:border-zinc-700' },
}

const ACTIVITY_ICONS: Record<string, React.ReactNode> = {
  user_join: <LogIn className="size-3 text-emerald-500" />,
  user_leave: <LogOut className="size-3 text-zinc-400" />,
  storyboard_update: <Pencil className="size-3 text-amber-500" />,
  comment_add: <MessageSquare className="size-3 text-sky-500" />,
  comment_reply: <MessageSquare className="size-3 text-violet-500" />,
  lock_resource: <Lock className="size-3 text-red-500" />,
  unlock_resource: <Lock className="size-3 text-emerald-500" />,
  cursor_move: <Circle className="size-3 text-zinc-300" />,
}

// ── Component ───────────────────────────────────────────────

interface CollaborationPanelProps {
  dramaId: string
  episodes?: { id: string; title: string; episodeNumber: number }[]
}

export function CollaborationPanel({ dramaId, episodes = [] }: CollaborationPanelProps) {
  const { toast } = useToast()
  const client = getRealtimeClient()

  // Members state
  const [members, setMembers] = useState<Member[]>([])
  const [membersLoading, setMembersLoading] = useState(true)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('viewer')
  const [inviting, setInviting] = useState(false)

  // Comments state
  const [comments, setComments] = useState<CommentData[]>([])
  const [commentsLoading, setCommentsLoading] = useState(true)
  const [newComment, setNewComment] = useState('')
  const [sendingComment, setSendingComment] = useState(false)
  const [filterEpisodeId, setFilterEpisodeId] = useState<string>('_all')
  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')

  // Presence state (online users)
  const [onlineUsers, setOnlineUsers] = useState<PresenceInfo[]>([])
  const onlineUserIds = new Set(onlineUsers.map((u) => u.userId))

  // Activity feed state
  const [activities, setActivities] = useState<ActivityItem[]>([])
  const [activitiesLoading, setActivitiesLoading] = useState(true)

  // Mention state
  const [mentionOpen, setMentionOpen] = useState(false)
  const [mentionFilter, setMentionFilter] = useState('')

  // Fetch members
  const fetchMembers = useCallback(async () => {
    try {
      const res = await api.members.list(dramaId)
      setMembers(res.members)
    } catch {
      // Silently fail
    } finally {
      setMembersLoading(false)
    }
  }, [dramaId])

  // Fetch comments
  const fetchComments = useCallback(async () => {
    try {
      const params: { episodeId?: string } = {}
      if (filterEpisodeId && filterEpisodeId !== '_all') {
        params.episodeId = filterEpisodeId
      }
      const res = await api.comments.list(dramaId, params)
      setComments(res.comments)
    } catch {
      // Silently fail
    } finally {
      setCommentsLoading(false)
    }
  }, [dramaId, filterEpisodeId])

  // Fetch presence (online users)
  const fetchPresence = useCallback(async () => {
    try {
      const presences = await client.getPresence()
      setOnlineUsers(presences)
    } catch {
      // Silently fail
    }
  }, [client])

  // Fetch activities
  const fetchActivities = useCallback(async () => {
    try {
      const activities = await client.getActivities()
      setActivities(activities)
    } catch {
      // Silently fail
    } finally {
      setActivitiesLoading(false)
    }
  }, [client])

  useEffect(() => {
    fetchMembers()
  }, [fetchMembers])

  useEffect(() => {
    fetchComments()
  }, [fetchComments])

  useEffect(() => {
    fetchPresence()
    fetchActivities()
    const interval = setInterval(() => {
      fetchPresence()
      fetchActivities()
    }, 5000)
    return () => clearInterval(interval)
  }, [fetchPresence, fetchActivities])

  // Subscribe to realtime events for activity
  useEffect(() => {
    const unsub = client.onAny(() => {
      fetchActivities()
      fetchPresence()
    })
    return unsub
  }, [client, fetchActivities, fetchPresence])

  // ── Member handlers ──

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return
    setInviting(true)
    try {
      await api.members.invite(dramaId, { userEmail: inviteEmail.trim(), role: inviteRole })
      toast({ title: '成员已邀请' })
      setInviteOpen(false)
      setInviteEmail('')
      setInviteRole('viewer')
      fetchMembers()
    } catch (err) {
      toast({ title: '邀请失败', description: String(err), variant: 'destructive' })
    } finally {
      setInviting(false)
    }
  }

  const handleUpdateRole = async (memberId: string, role: string) => {
    try {
      await api.members.update(dramaId, memberId, { role })
      toast({ title: '角色已更新' })
      fetchMembers()
    } catch (err) {
      toast({ title: '更新失败', description: String(err), variant: 'destructive' })
    }
  }

  const handleRemoveMember = async (memberId: string) => {
    try {
      await api.members.remove(dramaId, memberId)
      toast({ title: '成员已移除' })
      fetchMembers()
    } catch (err) {
      toast({ title: '移除失败', description: String(err), variant: 'destructive' })
    }
  }

  // ── Comment handlers ──

  const handleAddComment = async () => {
    if (!newComment.trim()) return
    setSendingComment(true)
    try {
      const params: { content: string; episodeId?: string } = { content: newComment.trim() }
      if (filterEpisodeId && filterEpisodeId !== '_all') {
        params.episodeId = filterEpisodeId
      }
      await api.comments.add(dramaId, params)
      setNewComment('')
      fetchComments()
    } catch (err) {
      toast({ title: '评论失败', description: String(err), variant: 'destructive' })
    } finally {
      setSendingComment(false)
    }
  }

  const handleReply = async (parentId: string) => {
    if (!replyText.trim()) return
    setSendingComment(true)
    try {
      const params: { content: string; episodeId?: string; parentId?: string } = {
        content: replyText.trim(),
        parentId,
      }
      if (filterEpisodeId && filterEpisodeId !== '_all') {
        params.episodeId = filterEpisodeId
      }
      await api.comments.add(dramaId, params)
      setReplyText('')
      setReplyingTo(null)
      fetchComments()
    } catch (err) {
      toast({ title: '回复失败', description: String(err), variant: 'destructive' })
    } finally {
      setSendingComment(false)
    }
  }

  const handleToggleResolve = async (commentId: string, resolved: boolean) => {
    try {
      await api.comments.update(commentId, { resolved: !resolved })
      fetchComments()
    } catch (err) {
      toast({ title: '操作失败', description: String(err), variant: 'destructive' })
    }
  }

  const handleDeleteComment = async (commentId: string) => {
    try {
      await api.comments.delete(commentId)
      toast({ title: '评论已删除' })
      fetchComments()
    } catch (err) {
      toast({ title: '删除失败', description: String(err), variant: 'destructive' })
    }
  }

  // Insert @mention into comment input
  const insertMention = (name: string, target: 'comment' | 'reply') => {
    const text = target === 'comment' ? newComment : replyText
    const setter = target === 'comment' ? setNewComment : setReplyText
    const lastAtIndex = text.lastIndexOf('@')
    if (lastAtIndex !== -1) {
      setter(text.slice(0, lastAtIndex) + `@${name} `)
    } else {
      setter(text + `@${name} `)
    }
    setMentionOpen(false)
  }

  // Handle mention detection in input
  const handleMentionInput = (value: string) => {
    const lastAtIndex = value.lastIndexOf('@')
    if (lastAtIndex !== -1) {
      const query = value.slice(lastAtIndex + 1)
      if (query.length > 0 && !query.includes(' ')) {
        setMentionFilter(query)
        setMentionOpen(true)
        return
      }
    }
    setMentionOpen(false)
  }

  // Group comments into threads
  const rootComments = comments.filter((c) => !c.parentId)
  const getReplies = (parentId: string) => comments.filter((c) => c.parentId === parentId)

  // ── Render ──

  return (
    <div className="flex flex-col h-full">
      <Tabs defaultValue="members" className="flex flex-col h-full">
        <TabsList className="grid w-full grid-cols-3 mx-0 shrink-0">
          <TabsTrigger value="members" className="gap-1 text-xs">
            <Users className="size-3.5" />
            成员
            {!membersLoading && (
              <span className="text-muted-foreground">({members.length})</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="comments" className="gap-1 text-xs">
            <MessageSquare className="size-3.5" />
            评论
            {!commentsLoading && (
              <span className="text-muted-foreground">({comments.length})</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="activity" className="gap-1 text-xs">
            <Activity className="size-3.5" />
            动态
          </TabsTrigger>
        </TabsList>

        {/* ── Members Tab (Enhanced with online status) ── */}
        <TabsContent value="members" className="flex-1 mt-0 overflow-hidden">
          {/* Online members section */}
          {onlineUsers.length > 0 && (
            <div className="px-1 py-2 border-b border-border/30">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Circle className="size-2 fill-emerald-500 text-emerald-500" />
                <span className="text-[10px] font-medium text-emerald-600">
                  在线 — {onlineUsers.length}
                </span>
              </div>
              <div className="flex flex-wrap gap-1">
                {onlineUsers.map((user) => (
                  <div
                    key={user.userId}
                    className="flex items-center gap-1 bg-emerald-50 dark:bg-emerald-900/20 rounded-full pl-0.5 pr-2 py-0.5"
                  >
                    <Avatar className="size-5 border-2 border-emerald-400">
                      <AvatarImage src={user.userAvatar ?? undefined} />
                      <AvatarFallback className="text-[8px]" style={{ color: getUserColor(user.userId) }}>
                        {user.userName[0] || '?'}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-[10px] font-medium">{user.userName}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between px-1 py-2">
            <span className="text-xs text-muted-foreground">
              {members.length} 位成员
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => setInviteOpen(true)}
            >
              <UserPlus className="size-3" />
              邀请
            </Button>
          </div>

          <ScrollArea className="flex-1" style={{ maxHeight: 'calc(100vh - 340px)' }}>
            {membersLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : members.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-xs">
                暂无成员
              </div>
            ) : (
              <div className="space-y-1 px-1">
                {members.map((member) => {
                  const badge = ROLE_BADGE[member.role] ?? ROLE_BADGE.viewer
                  const initials = member.user.name
                    ?.split(' ')
                    .map((n: string) => n[0])
                    .join('')
                    .slice(0, 2) ?? '?'
                  const isOnline = onlineUserIds.has(member.userId)

                  return (
                    <div
                      key={member.id}
                      className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-muted/50 transition-colors group"
                    >
                      <div className="relative shrink-0">
                        <Avatar className="size-8">
                          <AvatarImage src={member.user.avatar ?? undefined} />
                          <AvatarFallback className="text-[10px] font-medium">
                            {initials}
                          </AvatarFallback>
                        </Avatar>
                        {isOnline && (
                          <div className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full bg-emerald-500 border-2 border-background" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-medium truncate">
                            {member.user.name}
                          </span>
                          <Badge
                            variant="outline"
                            className={`text-[9px] px-1.5 py-0 h-4 ${badge.className}`}
                          >
                            {badge.label}
                          </Badge>
                        </div>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {isOnline ? '在线' : member.user.email}
                        </p>
                      </div>

                      {/* Actions for non-owner members */}
                      {member.role !== 'owner' && (
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Select
                            value={member.role}
                            onValueChange={(v) => handleUpdateRole(member.id, v)}
                          >
                            <SelectTrigger className="h-6 w-16 text-[9px] border-0 p-0 gap-0">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="editor">编辑者</SelectItem>
                              <SelectItem value="viewer">查看者</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="size-6 p-0 text-muted-foreground hover:text-destructive"
                            onClick={() => handleRemoveMember(member.id)}
                          >
                            <Trash2 className="size-3" />
                          </Button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </ScrollArea>
        </TabsContent>

        {/* ── Comments Tab (Enhanced with threads and mentions) ── */}
        <TabsContent value="comments" className="flex-1 mt-0 overflow-hidden flex flex-col">
          {/* Filter bar */}
          {episodes.length > 0 && (
            <div className="px-1 py-2">
              <Select value={filterEpisodeId} onValueChange={setFilterEpisodeId}>
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue placeholder="筛选集数" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">全部集数</SelectItem>
                  {episodes.map((ep) => (
                    <SelectItem key={ep.id} value={ep.id}>
                      E{String(ep.episodeNumber).padStart(2, '0')} {ep.title || `第${ep.episodeNumber}集`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <ScrollArea className="flex-1" style={{ maxHeight: 'calc(100vh - 380px)' }}>
            {commentsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : comments.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-xs">
                暂无评论
              </div>
            ) : (
              <div className="space-y-2 px-1">
                {rootComments.map((comment) => {
                  const replies = getReplies(comment.id)
                  return (
                    <div
                      key={comment.id}
                      className={`p-2.5 rounded-lg border transition-colors ${
                        comment.resolved
                          ? 'border-emerald-200 bg-emerald-50/50 dark:border-emerald-800/30 dark:bg-emerald-900/10'
                          : 'border-border/50 bg-background'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <Avatar className="size-6 shrink-0 mt-0.5">
                          <AvatarImage src={comment.user.avatar ?? undefined} />
                          <AvatarFallback className="text-[8px]">
                            {comment.user.name?.[0] ?? '?'}
                          </AvatarFallback>
                        </Avatar>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className="text-[11px] font-medium">
                              {comment.user.name}
                            </span>
                            {comment.resolved && (
                              <Badge
                                variant="outline"
                                className="text-[8px] px-1 py-0 h-3.5 bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800"
                              >
                                <Check className="size-2 mr-0.5" />
                                已解决
                              </Badge>
                            )}
                            <span className="text-[9px] text-muted-foreground ml-auto shrink-0">
                              {relativeTime(comment.createdAt)}
                            </span>
                          </div>
                          <p className="text-xs text-foreground/90 break-words">
                            {comment.content}
                          </p>
                        </div>
                      </div>

                      {/* Replies */}
                      {replies.length > 0 && (
                        <div className="mt-2 pl-8 space-y-1.5 border-l-2 border-border/30 ml-3">
                          {replies.map((reply) => (
                            <div key={reply.id} className="flex items-start gap-1.5">
                              <Avatar className="size-4 shrink-0 mt-0.5">
                                <AvatarImage src={reply.user.avatar ?? undefined} />
                                <AvatarFallback className="text-[7px]">
                                  {reply.user.name?.[0] ?? '?'}
                                </AvatarFallback>
                              </Avatar>
                              <div className="min-w-0">
                                <span className="text-[10px] font-medium">{reply.user.name}</span>
                                <span className="text-[10px] text-foreground/80 ml-1 break-words">{reply.content}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Reply input */}
                      {replyingTo === comment.id ? (
                        <div className="mt-2 pl-8 ml-3">
                          <div className="flex items-center gap-1 relative">
                            <Input
                              placeholder="回复..."
                              value={replyText}
                              onChange={(e) => {
                                setReplyText(e.target.value)
                                handleMentionInput(e.target.value)
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                  e.preventDefault()
                                  handleReply(comment.id)
                                }
                                if (e.key === 'Escape') {
                                  setReplyingTo(null)
                                  setReplyText('')
                                }
                              }}
                              className="h-7 text-[10px]"
                              autoFocus
                              disabled={sendingComment}
                            />
                            <Button
                              size="sm"
                              className="h-7 w-7 p-0 shrink-0"
                              onClick={() => handleReply(comment.id)}
                              disabled={!replyText.trim() || sendingComment}
                            >
                              {sendingComment ? <Loader2 className="size-3 animate-spin" /> : <Send className="size-3" />}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 shrink-0"
                              onClick={() => {
                                setReplyingTo(null)
                                setReplyText('')
                              }}
                            >
                              <X className="size-3" />
                            </Button>
                          </div>
                          {/* @mention dropdown */}
                          {mentionOpen && (
                            <div className="absolute mt-1 border rounded-md bg-popover p-1 max-h-20 overflow-y-auto z-50 shadow-md">
                              {members
                                .filter((m) => m.user.name.toLowerCase().includes(mentionFilter.toLowerCase()))
                                .slice(0, 5)
                                .map((m) => (
                                  <button
                                    key={m.userId}
                                    className="flex items-center gap-1.5 w-full px-2 py-1 text-[10px] hover:bg-muted rounded"
                                    onClick={() => insertMention(m.user.name, 'reply')}
                                  >
                                    <Avatar className="size-4">
                                      <AvatarFallback className="text-[7px]">{m.user.name[0]}</AvatarFallback>
                                    </Avatar>
                                    <span>{m.user.name}</span>
                                  </button>
                                ))}
                            </div>
                          )}
                        </div>
                      ) : null}

                      {/* Comment actions */}
                      <div className="flex items-center justify-end gap-1 mt-1.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 px-1.5 text-[9px] gap-0.5 text-muted-foreground hover:text-primary"
                          onClick={() => {
                            setReplyingTo(comment.id)
                            setReplyText('')
                          }}
                        >
                          <AtSign className="size-2.5" />
                          回复
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className={`h-5 px-1.5 text-[9px] gap-0.5 ${
                            comment.resolved
                              ? 'text-emerald-600 hover:text-emerald-700'
                              : 'text-muted-foreground hover:text-emerald-600'
                          }`}
                          onClick={() => handleToggleResolve(comment.id, comment.resolved)}
                        >
                          {comment.resolved ? (
                            <>
                              <Check className="size-2.5" />
                              取消解决
                            </>
                          ) : (
                            <>
                              <Check className="size-2.5" />
                              标记解决
                            </>
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 px-1.5 text-[9px] gap-0.5 text-muted-foreground hover:text-destructive"
                          onClick={() => handleDeleteComment(comment.id)}
                        >
                          <Trash2 className="size-2.5" />
                          删除
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </ScrollArea>

          {/* Add comment input with @mention support */}
          <div className="border-t border-border/50 p-2 mt-auto relative">
            <div className="flex items-center gap-1.5">
              <Input
                placeholder="添加评论... (@提及成员)"
                value={newComment}
                onChange={(e) => {
                  setNewComment(e.target.value)
                  handleMentionInput(e.target.value)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleAddComment()
                  }
                }}
                className="h-8 text-xs"
                disabled={sendingComment}
              />
              <Button
                size="sm"
                className="h-8 w-8 p-0 shrink-0"
                onClick={handleAddComment}
                disabled={!newComment.trim() || sendingComment}
              >
                {sendingComment ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Send className="size-3.5" />
                )}
              </Button>
            </div>
            {/* @mention dropdown */}
            {mentionOpen && (
              <div className="absolute bottom-12 left-2 right-10 border rounded-md bg-popover p-1 max-h-24 overflow-y-auto z-50 shadow-md">
                {members
                  .filter((m) => m.user.name.toLowerCase().includes(mentionFilter.toLowerCase()))
                  .slice(0, 5)
                  .map((m) => (
                    <button
                      key={m.userId}
                      className="flex items-center gap-1.5 w-full px-2 py-1 text-xs hover:bg-muted rounded"
                      onClick={() => insertMention(m.user.name, 'comment')}
                    >
                      <Avatar className="size-5">
                        <AvatarImage src={m.user.avatar ?? undefined} />
                        <AvatarFallback className="text-[8px]">{m.user.name[0]}</AvatarFallback>
                      </Avatar>
                      <span>{m.user.name}</span>
                    </button>
                  ))}
              </div>
            )}
          </div>
        </TabsContent>

        {/* ── Activity Tab (NEW — Real-time feed) ── */}
        <TabsContent value="activity" className="flex-1 mt-0 overflow-hidden flex flex-col">
          <ScrollArea className="flex-1" style={{ maxHeight: 'calc(100vh - 280px)' }}>
            {activitiesLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : activities.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-xs">
                暂无动态
              </div>
            ) : (
              <div className="space-y-0.5 px-1">
                {activities.map((activity, index) => (
                  <div
                    key={activity.id}
                    className="flex items-start gap-2 p-2 rounded-lg hover:bg-muted/30 transition-colors"
                  >
                    <div className="shrink-0 mt-0.5">
                      {ACTIVITY_ICONS[activity.type] ?? <Circle className="size-3 text-zinc-300" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <Avatar className="size-4">
                          <AvatarImage src={activity.userAvatar ?? undefined} />
                          <AvatarFallback
                            className="text-[7px]"
                            style={{ color: getUserColor(activity.userId) }}
                          >
                            {activity.userName[0] || '?'}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-[11px]">
                          <span className="font-medium">{activity.userName}</span>
                          <span className="text-muted-foreground"> {activity.description}</span>
                        </span>
                      </div>
                      <span className="text-[9px] text-muted-foreground">
                        {relativeTime(activity.createdAt)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </TabsContent>
      </Tabs>

      {/* ── Invite Member Dialog ── */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>邀请成员</DialogTitle>
            <DialogDescription>输入用户邮箱邀请其加入项目</DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">邮箱地址</label>
              <Input
                placeholder="user@example.com"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">角色</label>
              <Select value={inviteRole} onValueChange={setInviteRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="editor">
                    <div className="flex items-center gap-2">
                      <Badge className={ROLE_BADGE.editor.className}>编辑者</Badge>
                      <span className="text-xs text-muted-foreground">可编辑内容和生成</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="viewer">
                    <div className="flex items-center gap-2">
                      <Badge className={ROLE_BADGE.viewer.className}>查看者</Badge>
                      <span className="text-xs text-muted-foreground">仅可查看内容</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>
              取消
            </Button>
            <Button onClick={handleInvite} disabled={inviting || !inviteEmail.trim()}>
              {inviting ? '邀请中...' : '发送邀请'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
