'use client'

import { useTranslations } from 'next-intl'
import {
  FolderKanban,
  Package,
  Sparkles,
  FolderOpen,
  FileText,
  Palette,
  Film,
  Settings,
  Library,
  Store,
  Layers,
  BookOpen,
  Users,
  Map,
  Activity,
  Paintbrush,
} from 'lucide-react'
import { useAppStore, type AppModule, type AppView, getModuleForView } from '@/lib/store'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
  useSidebar,
} from '@/components/ui/sidebar'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { UserMenu } from '@/components/user-menu'
import { LanguageSwitcher } from '@/components/language-switcher'

// ============================================================
// Module definitions
// ============================================================

interface ModuleDef {
  id: AppModule
  labelKey: string
  icon: React.ElementType
  views: { view: AppView; labelKey: string; icon: React.ElementType }[]
}

const MODULES: ModuleDef[] = [
  {
    id: 'project',
    labelKey: 'projectModule',
    icon: FolderKanban,
    views: [
      { view: 'projects', labelKey: 'projects', icon: FolderOpen },
      { view: 'project-detail', labelKey: 'projectDetail', icon: FileText },
      { view: 'script-workbench', labelKey: 'scriptWorkbench', icon: FileText },
      { view: 'asset-workbench', labelKey: 'assetWorkbench', icon: Palette },
      { view: 'episode-workspace', labelKey: 'episodeWorkspace', icon: Film },
      { view: 'series', labelKey: 'series', icon: Layers },
    ],
  },
  {
    id: 'asset',
    labelKey: 'assetModule',
    icon: Package,
    views: [
      { view: 'asset-library', labelKey: 'assetLibrary', icon: Library },
      { view: 'marketplace', labelKey: 'marketplace', icon: Store },
    ],
  },
  {
    id: 'creative',
    labelKey: 'creativeModule',
    icon: Sparkles,
    views: [
      { view: 'creative-workspace', labelKey: 'creativeWorkspace', icon: Sparkles },
      { view: 'script-v2', labelKey: 'scriptV2', icon: BookOpen },
      { view: 'asset-v2', labelKey: 'assetV2', icon: Palette },
      { view: 'character-bible', labelKey: 'characterBibleNav', icon: Users },
      { view: 'world-map', labelKey: 'worldMapNav', icon: Map },
      { view: 'queue-dashboard', labelKey: 'queueDashboardNav', icon: Activity },
      { view: 'art-style', labelKey: 'artStyleNav', icon: Paintbrush },
    ],
  },
]

// ============================================================
// ModuleTab — clickable module header in the sidebar
// ============================================================

function ModuleTab({
  module,
  isActive,
  onClick,
}: {
  module: ModuleDef
  isActive: boolean
  onClick: () => void
}) {
  const t = useTranslations('nav')
  const { state } = useSidebar()
  const Icon = module.icon
  const label = t(module.labelKey)
  const isCollapsed = state === 'collapsed'

  const button = (
    <button
      onClick={onClick}
      className={`
        flex items-center gap-2 w-full rounded-md px-2 py-1.5 text-sm font-medium
        transition-colors duration-150
        ${
          isActive
            ? 'bg-sidebar-accent text-sidebar-accent-foreground'
            : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground'
        }
        ${isCollapsed ? 'justify-center px-0' : ''}
      `}
      data-active={isActive}
    >
      <Icon className="size-4 shrink-0" />
      {!isCollapsed && <span className="truncate">{label}</span>}
    </button>
  )

  if (isCollapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent side="right" align="center">
          {label}
        </TooltipContent>
      </Tooltip>
    )
  }

  return button
}

// ============================================================
// ModuleSidebar — main sidebar component
// ============================================================

export function ModuleSidebar() {
  const t = useTranslations('nav')
  const view = useAppStore((s) => s.view)
  const activeModule = useAppStore((s) => s.activeModule)
  const setActiveModule = useAppStore((s) => s.setActiveModule)
  const navigateToSettings = useAppStore((s) => s.navigateToSettings)
  const navigateToProjects = useAppStore((s) => s.navigateToProjects)
  const navigateToAssetLibrary = useAppStore((s) => s.navigateToAssetLibrary)
  const navigateToMarketplace = useAppStore((s) => s.navigateToMarketplace)
  const navigateToSeries = useAppStore((s) => s.navigateToSeries)
  const navigateToCreativeWorkspace = useAppStore((s) => s.navigateToCreativeWorkspace)
  const navigateToScriptV2 = useAppStore((s) => s.navigateToScriptV2)
  const navigateToAssetV2 = useAppStore((s) => s.navigateToAssetV2)
  const navigateToCharacterBible = useAppStore((s) => s.navigateToCharacterBible)
  const navigateToWorldMap = useAppStore((s) => s.navigateToWorldMap)
  const navigateToQueueDashboard = useAppStore((s) => s.navigateToQueueDashboard)
  const navigateToArtStyle = useAppStore((s) => s.navigateToArtStyle)
  const { state } = useSidebar()
  const isCollapsed = state === 'collapsed'

  // Map view to navigation action
  const viewNavMap: Record<AppView, () => void> = {
    'projects': navigateToProjects,
    'project-detail': navigateToProjects,
    'script-workbench': navigateToProjects,
    'asset-workbench': navigateToProjects,
    'episode-workspace': navigateToProjects,
    'settings': navigateToSettings,
    'asset-library': navigateToAssetLibrary,
    'marketplace': navigateToMarketplace,
    'series': navigateToSeries,
    'creative-workspace': navigateToCreativeWorkspace,
    'script-v2': navigateToScriptV2,
    'asset-v2': navigateToAssetV2,
    'character-bible': navigateToCharacterBible,
    'world-map': navigateToWorldMap,
    'queue-dashboard': navigateToQueueDashboard,
    'art-style': navigateToArtStyle,
  }

  // Derive the active module from current view (for consistency)
  const currentModule = getModuleForView(view)

  return (
    <Sidebar collapsible="icon" className="border-r border-border/50">
      {/* ── Header: App Logo ── */}
      <SidebarHeader className="px-3 py-3">
        <div className={`flex items-center gap-2 ${isCollapsed ? 'justify-center' : ''}`}>
          <div className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground font-bold text-xs shrink-0">
            D
          </div>
          {!isCollapsed && (
            <span className="text-sm font-semibold truncate">{t('appName')}</span>
          )}
        </div>
      </SidebarHeader>

      <SidebarSeparator />

      {/* ── Module Tabs ── */}
      <div className="px-2 py-1 flex flex-col gap-0.5">
        {MODULES.map((mod) => (
          <ModuleTab
            key={mod.id}
            module={mod}
            isActive={currentModule === mod.id}
            onClick={() => setActiveModule(mod.id)}
          />
        ))}
      </div>

      <SidebarSeparator />

      {/* ── Sub-navigation for active module ── */}
      <SidebarContent>
        {MODULES.filter((m) => m.id === currentModule).map((mod) => (
          <SidebarGroup key={mod.id}>
            <SidebarGroupLabel>{t(mod.labelKey)}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {mod.views.map((item) => {
                  const isActive = view === item.view
                  const ItemIcon = item.icon
                  const label = t(item.labelKey)

                  return (
                    <SidebarMenuItem key={item.view}>
                      <SidebarMenuButton
                        isActive={isActive}
                        onClick={() => viewNavMap[item.view]()}
                        tooltip={label}
                      >
                        <ItemIcon />
                        <span>{label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}

        {/* Creative module placeholder — replaced with real views above */}
      </SidebarContent>

      {/* ── Footer: Settings + User ── */}
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={view === 'settings'}
              onClick={navigateToSettings}
              tooltip={t('settings')}
            >
              <Settings />
              <span>{t('settings')}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <SidebarSeparator />
        <div className={`flex items-center gap-2 px-2 py-1 ${isCollapsed ? 'justify-center' : ''}`}>
          <UserMenu />
          {!isCollapsed && <LanguageSwitcher />}
        </div>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}
