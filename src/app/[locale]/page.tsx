'use client'

import { useRef, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { SessionProvider, useSession } from 'next-auth/react'
import { useAppStore } from '@/lib/store'
import { AuthView } from '@/components/auth-view'
import { ProjectListView } from '@/components/project-list'
import { ProjectDetailView } from '@/components/project-detail'
import { EpisodeWorkspace } from '@/components/episode-workspace'
import { SettingsView } from '@/components/settings-view'
import { AssetLibraryView } from '@/components/asset-library-view'
import { ScriptWorkbench } from '@/components/script-workbench'
import { AssetWorkbench } from '@/components/asset-workbench'
import { MarketplacePage } from '@/components/marketplace/marketplace-page'
import { SeriesPanel } from '@/components/series-panel'
import { ModuleSidebar } from '@/components/module-sidebar'
import { CreativeWorkspace } from '@/components/creative-workspace'
import { ScriptWorkbenchV2 } from '@/components/script-workbench-v2'
import { AssetWorkbenchV2 } from '@/components/asset-workbench-v2'
import { CharacterBibleView } from '@/components/character-bible-view'
import { WorldMapView } from '@/components/world-map-view'
import { QueueDashboardView } from '@/components/queue-dashboard-view'
import { ArtStyleView } from '@/components/art-style-view'
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar'
import { Loader2 } from 'lucide-react'

// ════════════════════════════════════════════════════════════
// ViewRouter — pure switch/case, renders only one component
// ════════════════════════════════════════════════════════════

function ViewRouter({ view }: { view: string }) {
  switch (view) {
    case 'projects':
      return <ProjectListView />
    case 'project-detail':
      return <ProjectDetailView />
    case 'script-workbench':
      return <ScriptWorkbench />
    case 'asset-workbench':
      return <AssetWorkbench />
    case 'episode-workspace':
      return <EpisodeWorkspace />
    case 'settings':
      return <SettingsView />
    case 'asset-library':
      return <AssetLibraryView />
    case 'marketplace':
      return <MarketplacePage />
    case 'series':
      return <SeriesPanel />
    case 'creative-workspace':
      return <CreativeWorkspace />
    case 'script-v2':
      return <ScriptWorkbenchV2 />
    case 'asset-v2':
      return <AssetWorkbenchV2 />
    case 'character-bible':
      return <CharacterBibleView />
    case 'world-map':
      return <WorldMapView />
    case 'queue-dashboard':
      return <QueueDashboardView />
    case 'art-style':
      return <ArtStyleView />
    default:
      return <ProjectListView />
  }
}

// ════════════════════════════════════════════════════════════
// Fullscreen views — manage their own scrolling and layout
// ════════════════════════════════════════════════════════════

const FULLSCREEN_VIEWS = new Set([
  'script-workbench',
  'asset-workbench',
  'episode-workspace',
  'series',
  'script-v2',
  'asset-v2',
  'character-bible',
  'world-map',
])

// ════════════════════════════════════════════════════════════
// AuthGuard
// ════════════════════════════════════════════════════════════

function AuthGuard() {
  const { data: session, status } = useSession()
  const view = useAppStore((s) => s.view)
  const hydrateWorkspaceModels = useAppStore((s) => s.hydrateWorkspaceModels)
  const t = useTranslations('common')

  // ★ 保险：一旦 session 曾经存在过，就绝不卸载 ViewRouter
  const hasEverHadSession = useRef(false)

  useEffect(() => {
    if (session) {
      hasEverHadSession.current = true
    }
  }, [session])

  // Hydrate workspaceModels from localStorage after mount to avoid SSR mismatch
  useEffect(() => {
    hydrateWorkspaceModels()
  }, [hydrateWorkspaceModels])

  // 首次加载（从未拿到过 session）：显示 loading
  if (status === 'loading' && !hasEverHadSession.current) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="size-8 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">{t('loading')}</span>
        </div>
      </div>
    )
  }

  // 没有 session 且之前也没有拿到过 → 显示登录页
  if (!session && !hasEverHadSession.current) {
    return <AuthView />
  }

  // ★★★ 核心：永远同一个 DOM 结构 ★★★
  const isFullscreen = FULLSCREEN_VIEWS.has(view)

  return (
    <SidebarProvider defaultOpen>
      <ModuleSidebar />
      <SidebarInset>
        <div className="flex flex-col h-screen">
          {!isFullscreen && (
            <header className="flex items-center gap-2 px-4 py-2 border-b border-border/50 shrink-0 md:hidden">
              <SidebarTrigger />
            </header>
          )}
          <div className={`flex-1 min-h-0 ${isFullscreen ? 'overflow-hidden' : 'overflow-auto'}`}>
            <ViewRouter view={view} key={view} />
          </div>
          {!isFullscreen && (
            <footer className="shrink-0 border-t border-border/50 py-4 text-center text-xs text-muted-foreground">
              <span className="opacity-80">AI短剧创作平台 &copy; {new Date().getFullYear()}</span>
            </footer>
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}

export default function Home() {
  return (
    <SessionProvider refetchInterval={0} refetchOnWindowFocus={false}>
      <AuthGuard />
    </SessionProvider>
  )
}
