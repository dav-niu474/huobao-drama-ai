'use client'

import { SessionProvider, useSession } from 'next-auth/react'
import { AnimatePresence, motion } from 'framer-motion'
import { useAppStore } from '@/lib/store'
import { AuthView } from '@/components/auth-view'
import { ProjectListView } from '@/components/project-list'
import { ProjectDetailView } from '@/components/project-detail'
import { EpisodeWorkspace } from '@/components/episode-workspace'
import { SettingsView } from '@/components/settings-view'
import { AssetLibraryView } from '@/components/asset-library-view'
import { Loader2 } from 'lucide-react'

const pageVariants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -12 },
}

const pageTransition = {
  duration: 0.25,
  ease: 'easeInOut' as const,
}

function ViewRouter() {
  const view = useAppStore((s) => s.view)

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={view}
        variants={pageVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={pageTransition}
        className="flex-1 flex flex-col"
      >
        {view === 'projects' && <ProjectListView />}
        {view === 'project-detail' && <ProjectDetailView />}
        {view === 'episode-workspace' && <EpisodeWorkspace />}
        {view === 'settings' && <SettingsView />}
        {view === 'asset-library' && <AssetLibraryView />}
      </motion.div>
    </AnimatePresence>
  )
}

function AuthGuard() {
  const { data: session, status } = useSession()

  // Loading state
  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="size-8 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">加载中...</span>
        </div>
      </div>
    )
  }

  // Not authenticated — show auth view
  if (!session) {
    return <AuthView />
  }

  // Authenticated — show app
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <ViewRouter />
      <footer className="mt-auto border-t border-border/50 py-4 text-center text-xs text-muted-foreground">
        <span className="opacity-70">AI短剧创作平台 &copy; {new Date().getFullYear()}</span>
      </footer>
    </div>
  )
}

// SessionProvider with refetch interval to quickly detect login state changes
export default function Home() {
  return (
    <SessionProvider refetchInterval={5} refetchOnWindowFocus={true}>
      <AuthGuard />
    </SessionProvider>
  )
}
