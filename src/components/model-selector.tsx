'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { api, type AiCategory, type ProviderPreset, type ModelOption } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { Sparkles, ImageIcon, Film, ChevronDown, Check, Volume2, Search, Lock, X } from 'lucide-react'

interface ModelSelectorProps {
  category: AiCategory
  value: string
  onChange: (model: string) => void
  disabled?: boolean
}

const CATEGORY_CONFIG: Record<AiCategory, { icon: React.ReactNode; label: string; color: string }> = {
  llm: { icon: <Sparkles className="size-3.5" />, label: 'LLM', color: 'text-amber-600' },
  image: { icon: <ImageIcon className="size-3.5" />, label: '图片', color: 'text-emerald-600' },
  video: { icon: <Film className="size-3.5" />, label: '视频', color: 'text-violet-600' },
  tts: { icon: <Volume2 className="size-3.5" />, label: 'TTS', color: 'text-sky-600' },
}

const TAG_STYLES: Record<string, string> = {
  '推荐': 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  '最新': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  '快速': 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-400',
  '推理': 'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-400',
  '经济': 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-400',
  '高清': 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-400',
  '免费': 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400',
}

// All unique tags across all models, for quick filter buttons
const QUICK_FILTER_TAGS = ['推荐', '最新', '快速', '推理', '免费']

interface GroupedModels {
  provider: string
  providerName: string
  models: (ModelOption & { providerName: string })[]
}

export function ModelSelector({ category, value, onChange, disabled }: ModelSelectorProps) {
  const [presets, setPresets] = useState<ProviderPreset[]>([])
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [activeTag, setActiveTag] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const catConfig = CATEGORY_CONFIG[category]

  useEffect(() => {
    api.settings.get().then((data) => {
      setPresets(data.presets[category] || [])
    }).catch(() => {})
  }, [category])

  // Group models by provider
  const grouped = useMemo<GroupedModels[]>(() => {
    const groups: GroupedModels[] = []
    for (const preset of presets) {
      if (preset.availableModels && preset.availableModels.length > 0) {
        const models = preset.availableModels.map(m => ({
          ...m,
          providerName: preset.name,
        }))
        groups.push({
          provider: preset.provider,
          providerName: preset.name,
          models,
        })
      }
    }
    return groups
  }, [presets])

  // Flat list for name lookup
  const allModels = useMemo(() => {
    const flat: (ModelOption & { providerName: string })[] = []
    for (const g of grouped) {
      flat.push(...g.models)
    }
    return flat
  }, [grouped])

  // Total count for display
  const totalCount = allModels.length

  // When searching, ignore tag filter to avoid confusion
  const effectiveTag = search.trim() ? null : activeTag

  // Filter by search and active tag
  const filtered = useMemo(() => {
    return grouped
      .map(g => ({
        ...g,
        models: g.models.filter(m => {
          // Search filter
          if (search.trim()) {
            const q = search.toLowerCase()
            const matchesSearch =
              m.name.toLowerCase().includes(q) ||
              m.id.toLowerCase().includes(q) ||
              m.tags?.some(t => t.toLowerCase().includes(q))
            if (!matchesSearch) return false
          }
          // Tag filter (ignored when searching)
          if (effectiveTag && !m.tags?.includes(effectiveTag)) return false
          return true
        }),
      }))
      .filter(g => g.models.length > 0)
  }, [grouped, search, effectiveTag])

  // Filtered count
  const filteredCount = filtered.reduce((acc, g) => acc + g.models.length, 0)

  // Find the display name for current model
  const currentModel = allModels.find(m => m.id === value)
  const displayName = currentModel?.name || value || '未选择'

  // Find which provider the current model belongs to
  const currentProvider = currentModel?.providerName || ''

  // Scroll to selected model when opening
  useEffect(() => {
    if (open && listRef.current) {
      requestAnimationFrame(() => {
        const selectedEl = listRef.current?.querySelector('[data-selected="true"]')
        if (selectedEl) {
          selectedEl.scrollIntoView({ block: 'nearest' })
        }
      })
    }
  }, [open])

  // ── Fix: Prevent Radix Popover from closing on wheel scroll ──
  // Handle wheel events on the entire popover content to prevent
  // Radix UI from interpreting wheel events as "outside interactions"
  // that would close the popover. We must use stopPropagation at the
  // content level, not just the scroll container, because child elements
  // (buttons, badges) may not propagate wheel events to the parent div.
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.stopPropagation()
  }, [])

  return (
    <Popover open={disabled ? false : open} onOpenChange={(v) => { if (disabled) return; setOpen(v); if (!v) { setSearch(''); setActiveTag(null) } }}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          className={`h-8 px-3 gap-1.5 text-xs font-medium ${disabled ? 'opacity-60 cursor-not-allowed border-amber-700/40 bg-amber-950/20' : 'hover:bg-muted/80'}`}
        >
          <span className={catConfig.color}>{catConfig.icon}</span>
          <span className="max-w-[120px] sm:max-w-[160px] truncate">{displayName}</span>
          {currentProvider && (
            <span className="hidden sm:inline text-[10px] text-muted-foreground/70 truncate max-w-[80px]">
              {currentProvider}
            </span>
          )}
          {!disabled && <ChevronDown className="size-3 opacity-40 ml-0.5" />}
          {disabled && <Lock className="size-3 text-amber-500 ml-0.5" />}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[360px] sm:w-[420px] p-0"
        align="end"
        sideOffset={4}
        side="bottom"
        // Fix Bug 3: Keep popover within viewport bounds, with padding
        collisionPadding={16}
        // Fix Bug 3: Allow Radix to auto-flip if no room at bottom
        avoidCollisions={true}
        onOpenAutoFocus={(e) => {
          // Prevent auto-focus from stealing focus from search input
          e.preventDefault()
        }}
        // Fix Bug 2: Prevent wheel events from bubbling through the Portal
        // to the document level, where Radix might interpret them as
        // "interact outside" events and close the popover
        onWheel={handleWheel}
      >
        {/* Search bar */}
        <div className="p-2 border-b border-border/50">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground/60" />
            <Input
              className="h-8 pl-8 pr-8 text-xs bg-muted/40 border-border/50 focus-visible:ring-primary/20"
              placeholder={`搜索 ${totalCount} 个模型...`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
            {search && (
              <button
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-muted/80"
                onClick={() => setSearch('')}
              >
                <X className="size-3 text-muted-foreground" />
              </button>
            )}
          </div>
          {/* Quick filter tags */}
          <div className="flex items-center gap-1 mt-1.5 flex-wrap">
            {QUICK_FILTER_TAGS.map(tag => (
              <button
                key={tag}
                onClick={() => setActiveTag(activeTag === tag ? null : tag)}
                className={`text-[10px] px-1.5 py-0.5 rounded-full border transition-colors ${
                  activeTag === tag
                    ? 'border-primary/50 bg-primary/10 text-primary'
                    : 'border-border/40 text-muted-foreground hover:bg-muted/50'
                }`}
              >
                {tag}
              </button>
            ))}
            {filteredCount < totalCount && (
              <span className="text-[10px] text-muted-foreground ml-1">
                {filteredCount}/{totalCount}
              </span>
            )}
          </div>
        </div>

        {/* Model list — using native div with overflow-y-auto for reliable wheel scrolling */}
        <div
          ref={listRef}
          // Fix Bug 3: Use calc(100vh - 120px) to ensure the list fits within
          // the viewport with room for the trigger button and search bar.
          // This replaces the old min(480px,70vh) which could overflow on
          // shorter screens or waste space on taller ones.
          className="overflow-y-auto max-h-[min(480px,calc(100vh-120px))]"
          style={{
            scrollbarGutter: 'stable',
            WebkitOverflowScrolling: 'touch',
          }}
          onWheel={handleWheel}
        >
          {filtered.length === 0 && (
            <p className="text-xs text-muted-foreground p-4 text-center">
              {search ? `没有匹配 "${search}" 的模型` : activeTag ? `没有带 "${activeTag}" 标签的模型` : '暂无可用模型，请先在设置中配置'}
            </p>
          )}
          {filtered.map((group) => (
            <div key={group.provider}>
              {/* Provider header */}
              <div className="px-3 py-1.5 text-[11px] font-semibold text-muted-foreground/80 uppercase tracking-wider bg-muted/30 border-b border-border/30 sticky top-0 z-10">
                {group.providerName}
                <span className="ml-1 font-normal text-muted-foreground/50">({group.models.length})</span>
              </div>
              {/* Model items */}
              {group.models.map((m) => {
                const isSelected = value === m.id
                return (
                  <div
                    key={m.id}
                    data-selected={isSelected ? 'true' : undefined}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => { onChange(m.id); setOpen(false) }}
                    className={`w-full flex items-start gap-2.5 px-3 py-2 text-left hover:bg-muted/60 transition-colors cursor-pointer ${
                      isSelected ? 'bg-primary/5' : ''
                    }`}
                  >
                    {/* Check indicator */}
                    <div className="pt-0.5 flex-shrink-0 w-4">
                      {isSelected && <Check className="size-3.5 text-primary" />}
                    </div>
                    {/* Model info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`text-sm font-medium truncate ${isSelected ? 'text-primary' : ''}`}>
                          {m.name}
                        </span>
                        {m.tags?.map((tag) => (
                          <Badge
                            key={tag}
                            variant="secondary"
                            className={`text-[9px] px-1 py-0 h-4 font-medium ${TAG_STYLES[tag] || ''}`}
                          >
                            {tag}
                          </Badge>
                        ))}
                      </div>
                      <div className="text-[11px] text-muted-foreground/60 mt-0.5 truncate font-mono">
                        {m.id}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
