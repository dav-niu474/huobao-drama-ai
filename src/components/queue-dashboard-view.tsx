'use client'

import { QueueDashboard } from '@/components/queue-dashboard'
import { Activity } from 'lucide-react'

export function QueueDashboardView() {
  return (
    <div className="h-full flex flex-col bg-background overflow-hidden">
      {/* Top Bar */}
      <div className="h-12 border-b border-border flex items-center px-4 gap-3 shrink-0">
        <div className="flex items-center gap-1.5">
          <Activity className="size-4 text-amber-500" />
          <span className="text-sm font-medium">生成队列</span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        <QueueDashboard />
      </div>
    </div>
  )
}
