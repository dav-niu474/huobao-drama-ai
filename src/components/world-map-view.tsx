'use client'

import { useAppStore } from '@/lib/store'
import { WorldMap } from '@/components/world-map'
import { Badge } from '@/components/ui/badge'
import { ChevronRight, Map } from 'lucide-react'

export function WorldMapView() {
  const selectedDramaId = useAppStore((s) => s.selectedDramaId)
  const currentDrama = useAppStore((s) => s.currentDrama)
  const navigateBackToCreative = useAppStore((s) => s.navigateBackToCreative)

  if (!selectedDramaId) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <Map className="size-8 mb-3 opacity-30" />
        <p className="text-sm">请先选择一个项目</p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden">
      {/* Top Bar */}
      <div className="h-12 border-b border-border flex items-center px-4 gap-3 shrink-0">
        <button
          onClick={navigateBackToCreative}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
        >
          <Map className="size-3.5" />
          <span className="truncate max-w-24">{currentDrama?.title || '项目'}</span>
        </button>
        <ChevronRight className="size-3.5 text-muted-foreground/50 shrink-0" />
        <div className="flex items-center gap-1.5">
          <Map className="size-4 text-amber-500" />
          <span className="text-sm font-medium">世界观地图</span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        <WorldMap dramaId={selectedDramaId} />
      </div>
    </div>
  )
}
