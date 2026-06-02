import { useRef, useEffect } from 'react'
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
import { Loader2 } from 'lucide-react'

// ════════════════════════════════════════════════════════════
// ViewRouter — 纯 switch/case，同时只渲染一个组件
//
// ★★★ 核心修复 ★★★
//
//   1. 完全不使用 AnimatePresence / motion.div
//      之前：AnimatePresence mode="wait" + motion.div key={view}
//      切换 view 时，exit 动画期间旧组件仍在 DOM 中
//      新组件也开始挂载，导致两个页面 DOM 同时存在并重叠
//
//   2. 现在用纯 React switch + key={view}
//      key 变化时 React 立即卸载旧组件、挂载新组件
//      绝对不会有两个组件同时存在的情况
//
//   3. 每次只 return 一个组件，不是 && 条件渲染
//      之前：{view === 'X' && <X />} {view === 'Y' && <Y />}
//      多个条件可能短暂同时为 true（React concurrent mode）
//      现在：switch-case 只 return 一个
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
    default:
      return <ProjectListView />
  }
}

// ════════════════════════════════════════════════════════════
// 全屏视图列表 — 这些视图自己管理内部滚动和布局
// ════════════════════════════════════════════════════════════

const FULLSCREEN_VIEWS = new Set([
  'script-workbench',
  'asset-workbench',
  'episode-workspace',
  'marketplace',
  'series',
])

// ════════════════════════════════════════════════════════════
// AuthGuard
//
// ★★★ 核心修复 ★★★
//
//   1. 永远只用一个 DOM 容器结构，不再根据 view 切换容器
//   2. 全屏视图用 overflow-hidden（自己管理滚动）
//      非全屏视图用 overflow-auto（容器提供滚动）
//   3. hasEverHadSession ref：拿到过 session 后绝不卸载 ViewRouter
//   4. footer 只在非全屏视图时显示
// ════════════════════════════════════════════════════════════

function AuthGuard() {
  const { data: session, status } = useSession()
  const view = useAppStore((s) => s.view)

  // ★ 保险：一旦 session 曾经存在过，就绝不卸载 ViewRouter
  const hasEverHadSession = useRef(false)

  useEffect(() => {
    if (session) {
      hasEverHadSession.current = true
    }
  }, [session])

  // 首次加载（从未拿到过 session）：显示 loading
  if (status === 'loading' && !hasEverHadSession.current) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="size-8 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">加载中...</span>
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
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* 主内容区：全屏视图自己管滚动，非全屏由容器滚动 */}
      <div className={`flex-1 min-h-0 ${isFullscreen ? 'overflow-hidden' : 'overflow-auto'}`}>
        <ViewRouter view={view} key={view} />
      </div>
      {/* 非全屏视图显示底部 footer */}
      {!isFullscreen && (
        <footer className="shrink-0 border-t border-border/50 py-4 text-center text-xs text-muted-foreground">
          <span className="opacity-70">AI短剧创作平台 &copy; {new Date().getFullYear()}</span>
        </footer>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════
// SessionProvider:
//   refetchInterval=0: 不自动 refetch（之前=5导致每5秒重渲染！）
//   refetchOnWindowFocus=false: 窗口聚焦时不 refetch
//
// ★★★ 这是"几秒后刷新出另一个页面"的直接原因！★★★
//   之前 refetchInterval=5 → 每5秒 session 更新 → AuthGuard 重渲染
//   → AnimatePresence exit+enter 动画 → 旧页面和新页面短暂同时存在
// ════════════════════════════════════════════════════════════

export default function Home() {
  return (
    <SessionProvider refetchInterval={0} refetchOnWindowFocus={false}>
      <AuthGuard />
    </SessionProvider>
  )
}
