'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslations } from 'next-intl'
import { useAppStore } from '@/lib/store'
import { api, type ProviderConfig, type AiCategory, type ProviderPreset, type ModelOption } from '@/lib/api'
import { PROVIDER_PRESETS } from '@/lib/provider-presets'
import { useToast } from '@/hooks/use-toast'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { Textarea } from '@/components/ui/textarea'
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from '@/components/ui/collapsible'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { UserMenu } from '@/components/user-menu'
import { BudgetPanel } from '@/components/budget-panel'
import { PlatformConfig } from '@/components/publish/platform-config'
import {
  ArrowLeft,
  Settings,
  Key,
  Cpu,
  Save,
  Loader2,
  CheckCircle2,
  XCircle,
  Eye,
  EyeOff,
  Sparkles,
  ImageIcon,
  Film,
  Volume2,
  ChevronDown,
  ChevronUp,
  Copy,
  Info,
  Wifi,
  ListChecks,
  Zap,
  Star,
  Sparkle,
  Bot,
  RotateCcw,
  Wrench,
  Check,
  Trash2,
  User,
  Globe,
  Plug,
  Grid3x3,
  BarChart3,
  Plus,
  Pencil,
  Server,
  RefreshCw,
} from 'lucide-react'

// ============================================================
// SidebarItem — left navigation entry
// ============================================================

function SidebarItem({
  icon: Icon,
  label,
  active,
  onClick,
  warning = false,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  active: boolean
  onClick: () => void
  warning?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs transition-colors text-left ${
        active
          ? 'bg-primary/10 text-primary font-medium'
          : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
      }`}
    >
      <Icon className="size-3.5 flex-shrink-0" />
      <span className="flex-1 truncate">{label}</span>
      {warning && (
        <span className="inline-block size-1.5 rounded-full bg-amber-500 flex-shrink-0" />
      )}
    </button>
  )
}

// ============================================================
// Category metadata
// ============================================================

const CATEGORY_META: Record<AiCategory, { labelKey: string; icon: React.ReactNode; badgeKey: string }> = {
  llm: {
    labelKey: 'llmModel',
    icon: <Sparkles className="size-4" />,
    badgeKey: 'llmBadge',
  },
  image: {
    labelKey: 'imageGeneration',
    icon: <ImageIcon className="size-4" />,
    badgeKey: 'imageBadge',
  },
  video: {
    labelKey: 'videoGeneration',
    icon: <Film className="size-4" />,
    badgeKey: 'videoBadge',
  },
  tts: {
    labelKey: 'ttsSynthesis',
    icon: <Volume2 className="size-4" />,
    badgeKey: 'ttsBadge',
  },
}

// ============================================================
// Agent type for config
// ============================================================

interface AgentInfo {
  agentType: string
  name: string
  description: string
  config: {
    systemPrompt: string
    model: string | null
    temperature: number
    maxTokens: number
    isActive: boolean
  }
  defaultSystemPrompt: string
  tools: Array<{ name: string; description: string; parameters: Record<string, unknown> }>
  skillContent: string | null
}

// ============================================================
// Model Selector — dropdown for available models with custom input
// ============================================================

const TAG_STYLES: Record<string, string> = {
  '推荐': 'bg-amber-500/15 text-amber-600 border-amber-500/20',
  '最新': 'bg-emerald-500/15 text-emerald-600 border-emerald-500/20',
  '快速': 'bg-sky-500/15 text-sky-600 border-sky-500/20',
  '经济': 'bg-violet-500/15 text-violet-600 border-violet-500/20',
  '推理': 'bg-rose-500/15 text-rose-600 border-rose-500/20',
  '高清': 'bg-teal-500/15 text-teal-600 border-teal-500/20',
}

const TAG_I18N_KEYS: Record<string, string> = {
  '推荐': 'tagRecommended',
  '最新': 'tagNewest',
  '快速': 'tagFast',
  '经济': 'tagEconomical',
  '推理': 'tagReasoning',
  '高清': 'tagHD',
}

function ModelSelector({
  models,
  value,
  onChange,
  defaultModel,
  disabled = false,
}: {
  models: ModelOption[]
  value: string
  onChange: (val: string) => void
  defaultModel: string
  disabled?: boolean
}) {
  const ts = useTranslations('settings')
  const tc = useTranslations('common')
  const [showCustom, setShowCustom] = useState(false)
  const [customValue, setCustomValue] = useState(value)

  // Check if current value matches any known model
  const isKnownModel = models.some((m) => m.id === value)

  // Sync custom value when value changes
  useEffect(() => {
    setCustomValue(value)
  }, [value])

  const handleModelSelect = (modelId: string) => {
    onChange(modelId)
    setShowCustom(false)
  }

  const handleCustomConfirm = () => {
    if (customValue.trim()) {
      onChange(customValue.trim())
      setShowCustom(false)
    }
  }

  return (
    <div className="space-y-2">
      {/* Model list - scrollable with native overflow + global scrollbar CSS */}
      <div className="max-h-72 overflow-y-auto overscroll-contain">
        <div className="flex flex-col gap-1.5 pr-1">
          {models.map((m) => {
            const isSelected = value === m.id
            return (
              <div
                key={m.id}
                role="button"
                tabIndex={disabled ? -1 : 0}
                onClick={() => !disabled && handleModelSelect(m.id)}
                onKeyDown={(e) => { if (!disabled && (e.key === 'Enter' || e.key === ' ')) handleModelSelect(m.id) }}
                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md border text-left transition-all duration-150 ${
                  disabled ? 'opacity-50 cursor-not-allowed' :
                  isSelected
                    ? 'border-primary/50 bg-primary/10 ring-1 ring-primary/20 cursor-pointer'
                    : 'border-border/40 bg-muted/20 hover:bg-muted/40 hover:border-border/60 cursor-pointer'
                }`}
              >
                {/* Selection indicator */}
                {isSelected && (
                  <Check className="size-3 text-primary flex-shrink-0" />
                )}
                {/* Model info - contained within card */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium truncate">{m.name}</span>
                    {m.id === defaultModel && (
                      <span className="text-[8px] px-1 py-px rounded bg-primary/10 text-primary border border-primary/20 flex-shrink-0 whitespace-nowrap">
                        {ts('defaultLabel')}
                      </span>
                    )}
                    {m.tags && m.tags.length > 0 && (
                      <span className="flex gap-0.5 flex-shrink-0">
                        {m.tags.map((tag) => (
                          <span
                            key={tag}
                            className={`text-[8px] px-1 py-px rounded border whitespace-nowrap ${TAG_STYLES[tag] ?? 'bg-muted/30 text-muted-foreground border-border/30'}`}
                          >
                            {TAG_I18N_KEYS[tag] ? ts(TAG_I18N_KEYS[tag]) : tag}
                          </span>
                        ))}
                      </span>
                    )}
                  </div>
                  <p className="text-[9px] text-muted-foreground truncate leading-tight mt-0.5">{m.id}</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Custom model input toggle */}
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="text-[10px] h-6 gap-1"
          onClick={() => setShowCustom(!showCustom)}
          disabled={disabled}
        >
          <ListChecks className="size-3" />
          {showCustom ? ts('collapseCustomInput') : ts('manualInputModelId')}
        </Button>
        {!isKnownModel && value && (
          <span className="text-[10px] text-muted-foreground truncate">
            {ts('currentLabel')}: <code className="bg-muted/50 px-1 rounded">{value}</code>
          </span>
        )}
      </div>

      {/* Custom model input */}
      {showCustom && (
        <div className="flex gap-2">
          <Input
            placeholder={ts('modelIdPlaceholder')}
            value={customValue}
            onChange={(e) => setCustomValue(e.target.value)}
            className="bg-muted/30 border-border/50 text-xs flex-1"
            disabled={disabled}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCustomConfirm()
            }}
          />
          <Button
            type="button"
            size="sm"
            onClick={handleCustomConfirm}
            disabled={disabled}
            className="text-[10px] h-9"
          >
            {tc('apply')}
          </Button>
        </div>
      )}
    </div>
  )
}

// ============================================================
// Provider Card — one per provider within a category
// ============================================================

function ProviderCard({
  provider,
  preset,
  isActive,
  onSetActive,
  onSave,
  saving,
  isAdmin,
}: {
  provider: ProviderConfig
  preset: ProviderPreset | undefined
  isActive: boolean
  onSetActive: () => void
  onSave: (updated: ProviderConfig) => Promise<void>
  saving: boolean
  isAdmin: boolean
}) {
  const ts = useTranslations('settings')
  const [expanded, setExpanded] = useState(isActive)
  const [expandDone, setExpandDone] = useState(false)
  // Track whether the user has edited the API key since loading
  // If the key is masked (starts with ****), we need to know it hasn't been changed
  const isMaskedKey = (provider.apiKey ?? '').startsWith('****')
  const [apiKey, setApiKey] = useState(isMaskedKey ? '' : (provider.apiKey ?? ''))
  const [apiKeyEdited, setApiKeyEdited] = useState(false)
  const [baseUrl, setBaseUrl] = useState(provider.baseUrl ?? '')
  const [model, setModel] = useState(provider.model ?? '')
  const [showKey, setShowKey] = useState(false)
  const [localSaving, setLocalSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{
    success: boolean
    provider?: string
    model?: string
    error?: string
    responsePreview?: string
    latency?: number
  } | null>(null)

  // Sync local state when provider data changes
  useEffect(() => {
    const newMasked = (provider.apiKey ?? '').startsWith('****')
    setApiKey(newMasked ? '' : (provider.apiKey ?? ''))
    setApiKeyEdited(false)
    setBaseUrl(provider.baseUrl ?? '')
    setModel(provider.model ?? '')
  }, [provider.apiKey, provider.baseUrl, provider.model])

  // Auto-expand active provider
  useEffect(() => {
    if (isActive) setExpanded(true)
  }, [isActive])

  // Reset expandDone when collapsing
  useEffect(() => {
    if (!expanded) setExpandDone(false)
  }, [expanded])

  // For non-admin: a masked key still counts as "configured"
  const hasApiKey = Boolean(apiKey.trim()) || isMaskedKey

  const handleApiKeyChange = (value: string) => {
    setApiKey(value)
    setApiKeyEdited(true)
  }

  const handleSave = async () => {
    setLocalSaving(true)
    try {
      await onSave({
        ...provider,
        // If key wasn't edited and current is masked, send the masked value
        // The backend will detect masked keys and preserve the existing one
        apiKey: apiKeyEdited ? apiKey : (isMaskedKey ? provider.apiKey : apiKey),
        baseUrl,
        model,
      })
    } finally {
      setLocalSaving(false)
    }
  }

  const isSaving = saving || localSaving

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      // Use current local values (not saved yet) for testing
      const effectiveApiKey = apiKeyEdited ? apiKey : (isMaskedKey ? '' : apiKey)
      const result = await api.ai.testConnection(
        provider.category,
        model,
        {
          provider: provider.provider,
          apiKey: effectiveApiKey || undefined,
          baseUrl: baseUrl || undefined,
        }
      )
      setTestResult(result)
    } catch (error) {
      setTestResult({
        success: false,
        error: error instanceof Error ? error.message : ts('testFailed'),
      })
    } finally {
      setTesting(false)
    }
  }

  return (
    <Card
      className={`border-border/50 transition-all duration-200 ${
        isActive
          ? 'ring-1 ring-primary/30 bg-card'
          : 'bg-card/50 hover:bg-card/80'
      }`}
    >
      <CardContent className="p-4 sm:p-5">
        {/* Provider header row */}
        <div className="flex items-start gap-3">
          {/* Radio button to set active */}
          <div className="pt-0.5">
            <RadioGroup
              value={isActive ? provider.provider : ''}
              onValueChange={() => {
                if (isAdmin && !isActive) onSetActive()
              }}
              className="flex"
            >
              <RadioGroupItem
                value={provider.provider}
                id={`${provider.category}-${provider.provider}`}
                disabled={!isAdmin}
                className={isActive ? 'text-primary border-primary' : ''}
              />
            </RadioGroup>
          </div>

          {/* Provider info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Label
                htmlFor={`${provider.category}-${provider.provider}`}
                className="text-sm font-semibold cursor-pointer"
              >
                {provider.name}
              </Label>
              {isActive ? (
                <Badge className="text-[10px] bg-primary/15 text-primary border-primary/20 hover:bg-primary/20">
                  {ts('currentUsing')}
                </Badge>
              ) : null}
              {hasApiKey ? (
                <Badge
                  variant="secondary"
                  className="text-[10px] bg-emerald-500/10 text-emerald-500 border-emerald-500/20 gap-1"
                >
                  <CheckCircle2 className="size-2.5" />
                  {ts('configured')}
                </Badge>
              ) : (
                <Badge
                  variant="secondary"
                  className="text-[10px] bg-destructive/10 text-destructive border-destructive/20 gap-1"
                >
                  <span className="inline-block size-1.5 rounded-full bg-destructive" />
                  {ts('notConfigured')}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              {preset?.description ?? provider.name}
            </p>
            {isAdmin && preset?.envKey && (
              <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                {ts('envVariable')}: {preset.envKey}
              </p>
            )}
          </div>

          {/* Expand toggle */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
            className="text-muted-foreground hover:text-foreground -mr-2"
          >
            {expanded ? (
              <ChevronUp className="size-4" />
            ) : (
              <ChevronDown className="size-4" />
            )}
          </Button>
        </div>

        {/* Expandable configuration */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ maxHeight: 0, opacity: 0 }}
              animate={{ maxHeight: 2000, opacity: 1 }}
              exit={{ maxHeight: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: 'easeInOut' }}
              className={expandDone ? '' : 'overflow-hidden'}
              onAnimationComplete={() => setExpandDone(true)}
            >
              <div className="mt-4 pt-4 border-t border-border/30 space-y-4">
                {/* API Key */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium flex items-center gap-1.5">
                    <Key className="size-3" />
                    {ts('apiKey')}
                    {!isAdmin && isMaskedKey && (
                      <Badge variant="secondary" className="text-[9px] px-1.5 py-0 bg-amber-500/10 text-amber-600 border-amber-500/20">
                        {ts('adminOnlyVisible')}
                      </Badge>
                    )}
                  </Label>
                  <div className="relative">
                    <Input
                      type={showKey ? 'text' : 'password'}
                      placeholder={isAdmin ? 'sk-...' : (isMaskedKey ? ts('adminConfigured') : 'sk-...')}
                      value={isAdmin ? apiKey : (isMaskedKey ? provider.apiKey : apiKey)}
                      onChange={(e) => handleApiKeyChange(e.target.value)}
                      disabled={!isAdmin}
                      className="bg-muted/30 border-border/50 pr-10"
                    />
                    {isAdmin && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowKey(!showKey)}
                        className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                      >
                        {showKey ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                      </Button>
                    )}
                  </div>
                  {!hasApiKey && (
                    <p className="text-[10px] text-muted-foreground/80 flex items-start gap-1">
                      <Info className="size-3 mt-0.5 flex-shrink-0" />
                      {ts('noApiKeyTip')}
                    </p>
                  )}
                </div>

                {/* Base URL */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">{ts('baseUrl')}</Label>
                  <Input
                    placeholder={
                      preset?.defaultBaseUrl
                        ? ts('defaultBaseUrl', { url: preset.defaultBaseUrl })
                        : 'https://api.example.com/v1'
                    }
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    disabled={!isAdmin}
                    className="bg-muted/30 border-border/50"
                  />
                  {isAdmin && preset?.defaultBaseUrl && baseUrl !== preset.defaultBaseUrl && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-[10px] h-6"
                      onClick={() => setBaseUrl(preset.defaultBaseUrl)}
                    >
                      {ts('restoreDefaultBaseUrl')}
                    </Button>
                  )}
                </div>

                {/* Model Selection */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium flex items-center gap-1.5">
                    <Cpu className="size-3" />
                    {ts('model')}
                  </Label>
                  {/* Model selector with dropdown if available */}
                  {preset?.availableModels && preset.availableModels.length > 0 ? (
                    <ModelSelector
                      models={preset.availableModels}
                      value={model}
                      onChange={setModel}
                      defaultModel={preset.defaultModel}
                      disabled={!isAdmin}
                    />
                  ) : (
                    <Input
                      placeholder={
                        preset?.defaultModel
                          ? ts('defaultModel', { model: preset.defaultModel })
                          : 'model-name'
                      }
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      disabled={!isAdmin}
                      className="bg-muted/30 border-border/50"
                    />
                  )}
                </div>

                {/* Test result display */}
                {testResult && (
                  <div className={`flex items-start gap-2 p-2.5 rounded-md border text-xs ${
                    testResult.success
                      ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400'
                      : 'border-destructive/30 bg-destructive/5 text-destructive'
                  }`}>
                    {testResult.success
                      ? <CheckCircle2 className="size-3.5 flex-shrink-0 mt-0.5" />
                      : <XCircle className="size-3.5 flex-shrink-0 mt-0.5" />
                    }
                    <div className="flex-1 min-w-0">
                      <span className="font-medium">{testResult.success ? ts('connectionSuccess') : ts('connectionFailed')}</span>
                      {testResult.model && <span className="text-muted-foreground ml-1">· {testResult.model}</span>}
                      {testResult.latency && <span className="text-muted-foreground ml-1">{testResult.latency}ms</span>}
                      {testResult.responsePreview && (
                        <p className="text-muted-foreground truncate mt-0.5">{ts('responseLabel')}: {testResult.responsePreview}</p>
                      )}
                      {testResult.error && (
                        <p className="break-all mt-0.5">{testResult.error}</p>
                      )}
                    </div>
                  </div>
                )}

                {/* Action buttons — admin only */}
                {isAdmin && (
                <div className="flex items-center justify-end gap-2 pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleTest}
                    disabled={testing || isSaving || !hasApiKey}
                    className="gap-1.5"
                  >
                    {testing ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Wifi className="size-3.5" />
                    )}
                    {ts('testConnection')}
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSave}
                    disabled={isSaving}
                    className="amber-glow"
                  >
                    {isSaving ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Save className="size-3.5" />
                    )}
                    {ts('saveConfig')}
                  </Button>
                </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  )
}

// ============================================================
// User Provider Card — editable card for non-admin users
// to configure their own API keys per provider
// ============================================================

function UserProviderCard({
  provider,
  preset,
  isActive,
  onSetActive,
  onSave,
  onDelete,
  saving,
}: {
  provider: ProviderConfig | null // null means user hasn't configured this provider yet
  preset: ProviderPreset | undefined
  isActive: boolean
  onSetActive: () => void
  onSave: (data: { category: string; provider: string; name?: string; apiKey: string; baseUrl?: string; model?: string; isActive?: boolean }) => Promise<void>
  onDelete: () => Promise<void>
  saving: boolean
}) {
  const ts = useTranslations('settings')
  const [expanded, setExpanded] = useState(false)
  const [expandDone, setExpandDone] = useState(false)
  const [apiKey, setApiKey] = useState(provider?.apiKey ?? '')
  const [baseUrl, setBaseUrl] = useState(provider?.baseUrl ?? preset?.defaultBaseUrl ?? '')
  const [model, setModel] = useState(provider?.model ?? preset?.defaultModel ?? '')
  const [showKey, setShowKey] = useState(false)
  const [localSaving, setLocalSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{
    success: boolean
    provider?: string
    model?: string
    error?: string
    responsePreview?: string
    latency?: number
  } | null>(null)

  const hasConfig = Boolean(provider?.apiKey?.trim())
  // Fix: derive category from preset when provider is null
  const category = provider?.category ?? (preset ? (Object.entries(PROVIDER_PRESETS).find(([, presets]) => presets.some(p => p.provider === preset.provider))?.[0] ?? '') : '')
  const providerName = preset?.name ?? provider?.provider ?? ''

  // Sync when provider data changes
  useEffect(() => {
    setApiKey(provider?.apiKey ?? '')
    setBaseUrl(provider?.baseUrl ?? preset?.defaultBaseUrl ?? '')
    setModel(provider?.model ?? preset?.defaultModel ?? '')
  }, [provider?.apiKey, provider?.baseUrl, provider?.model, preset?.defaultBaseUrl, preset?.defaultModel])

  // Auto-expand if active
  useEffect(() => {
    if (isActive) setExpanded(true)
  }, [isActive])

  useEffect(() => {
    if (!expanded) setExpandDone(false)
  }, [expanded])

  const handleSave = async () => {
    if (!apiKey.trim()) return
    setLocalSaving(true)
    try {
      await onSave({
        category,
        provider: preset?.provider ?? provider?.provider ?? '',
        name: preset?.name,
        apiKey,
        baseUrl,
        model,
        isActive: true,
      })
    } finally {
      setLocalSaving(false)
    }
  }

  const isSaving = saving || localSaving

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const result = await api.ai.testConnection(
        category as AiCategory,
        model,
        {
          provider: preset?.provider ?? provider?.provider ?? '',
          apiKey: apiKey || undefined,
          baseUrl: baseUrl || undefined,
        }
      )
      setTestResult(result)
    } catch (error) {
      setTestResult({
        success: false,
        error: error instanceof Error ? error.message : ts('testFailed'),
      })
    } finally {
      setTesting(false)
    }
  }

  return (
    <Card
      className={`border-border/50 transition-all duration-200 border-dashed ${
        isActive
          ? 'ring-1 ring-amber-500/40 bg-amber-50/5 dark:bg-amber-950/10'
          : 'bg-card/50 hover:bg-card/80'
      }`}
    >
      <CardContent className="p-4 sm:p-5">
        {/* Provider header row */}
        <div className="flex items-start gap-3">
          {/* Radio button */}
          <div className="pt-0.5">
            <RadioGroup
              value={isActive ? (preset?.provider ?? provider?.provider ?? '') : ''}
              onValueChange={() => { if (!isActive) onSetActive() }}
              className="flex"
            >
              <RadioGroupItem
                value={preset?.provider ?? provider?.provider ?? ''}
                id={`user-${category}-${preset?.provider ?? provider?.provider ?? ''}`}
                className={isActive ? 'text-amber-500 border-amber-500' : ''}
              />
            </RadioGroup>
          </div>

          {/* Provider info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Label
                htmlFor={`user-${category}-${preset?.provider ?? provider?.provider ?? ''}`}
                className="text-sm font-semibold cursor-pointer"
              >
                {providerName}
              </Label>
              {isActive ? (
                <Badge className="text-[10px] bg-amber-500/15 text-amber-600 border-amber-500/20 hover:bg-amber-500/20">
                  {ts('currentUsing')}
                </Badge>
              ) : null}
              {hasConfig ? (
                <Badge
                  variant="secondary"
                  className="text-[10px] bg-amber-500/10 text-amber-600 border-amber-500/20 gap-1"
                >
                  <Zap className="size-2.5" />
                  {ts('selfProvidedKey')}
                </Badge>
              ) : (
                <Badge
                  variant="secondary"
                  className="text-[10px] bg-muted/30 text-muted-foreground border-border/30"
                >
                  {ts('notConfigured')}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {ts('keyPriority')}
            </p>
          </div>

          {/* Expand toggle */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
            className="text-muted-foreground hover:text-foreground -mr-2"
          >
            {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          </Button>
        </div>

        {/* Expandable configuration */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ maxHeight: 0, opacity: 0 }}
              animate={{ maxHeight: 2000, opacity: 1 }}
              exit={{ maxHeight: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: 'easeInOut' }}
              className={expandDone ? '' : 'overflow-hidden'}
              onAnimationComplete={() => setExpandDone(true)}
            >
              <div className="mt-4 pt-4 border-t border-border/30 space-y-4">
                {/* API Key */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium flex items-center gap-1.5">
                    <Key className="size-3" />
                    {ts('myApiKey')}
                  </Label>
                  <div className="relative">
                    <Input
                      type={showKey ? 'text' : 'password'}
                      placeholder="sk-..."
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      className={`bg-muted/30 border-border/50 ${apiKey.trim() ? 'pr-10' : ''}`}
                    />
                    {apiKey.trim() && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowKey(!showKey)}
                        className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                      >
                        {showKey ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                      </Button>
                    )}
                  </div>
                  {!apiKey.trim() && (
                    <p className="text-[10px] text-muted-foreground/80 flex items-start gap-1">
                      <Info className="size-3 mt-0.5 flex-shrink-0" />
                      {ts('myKeyTip')}
                    </p>
                  )}
                </div>

                {/* Base URL */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">{ts('baseUrl')}</Label>
                  <Input
                    placeholder={
                      preset?.defaultBaseUrl
                        ? ts('defaultBaseUrl', { url: preset.defaultBaseUrl })
                        : 'https://api.example.com/v1'
                    }
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    className="bg-muted/30 border-border/50"
                  />
                  {preset?.defaultBaseUrl && baseUrl !== preset.defaultBaseUrl && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-[10px] h-6"
                      onClick={() => setBaseUrl(preset.defaultBaseUrl)}
                    >
                      {ts('restoreDefaultBaseUrl')}
                    </Button>
                  )}
                </div>

                {/* Model Selection */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium flex items-center gap-1.5">
                    <Cpu className="size-3" />
                    {ts('model')}
                  </Label>
                  {preset?.availableModels && preset.availableModels.length > 0 ? (
                    <ModelSelector
                      models={preset.availableModels}
                      value={model}
                      onChange={setModel}
                      defaultModel={preset.defaultModel}
                    />
                  ) : (
                    <Input
                      placeholder={
                        preset?.defaultModel
                          ? ts('defaultModel', { model: preset.defaultModel })
                          : 'model-name'
                      }
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      className="bg-muted/30 border-border/50"
                    />
                  )}
                </div>

                {/* Test result display */}
                {testResult && (
                  <div className={`flex items-start gap-2 p-2.5 rounded-md border text-xs ${
                    testResult.success
                      ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400'
                      : 'border-destructive/30 bg-destructive/5 text-destructive'
                  }`}>
                    {testResult.success
                      ? <CheckCircle2 className="size-3.5 flex-shrink-0 mt-0.5" />
                      : <XCircle className="size-3.5 flex-shrink-0 mt-0.5" />
                    }
                    <div className="flex-1 min-w-0">
                      <span className="font-medium">{testResult.success ? ts('connectionSuccess') : ts('connectionFailed')}</span>
                      {testResult.model && <span className="text-muted-foreground ml-1">· {testResult.model}</span>}
                      {testResult.latency && <span className="text-muted-foreground ml-1">{testResult.latency}ms</span>}
                      {testResult.responsePreview && (
                        <p className="text-muted-foreground truncate mt-0.5">{ts('responseLabel')}: {testResult.responsePreview}</p>
                      )}
                      {testResult.error && (
                        <p className="break-all mt-0.5">{testResult.error}</p>
                      )}
                    </div>
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex items-center justify-between pt-1">
                  {hasConfig && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={onDelete}
                      className="text-[10px] h-8 gap-1 text-destructive hover:text-destructive"
                    >
                      <Trash2 className="size-3" />
                      {ts('deleteMyConfig')}
                    </Button>
                  )}
                  <div className="flex gap-2 ml-auto">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleTest}
                      disabled={testing || isSaving || !apiKey.trim()}
                      className="gap-1.5"
                    >
                      {testing ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Wifi className="size-3.5" />
                      )}
                      {ts('testConnection')}
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleSave}
                      disabled={isSaving || !apiKey.trim()}
                      className="gap-1.5"
                    >
                      {isSaving ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Save className="size-3.5" />
                      )}
                      {ts('saveMyConfig')}
                    </Button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  )
}

// ============================================================
// Category Panel — renders the list of providers for one category
// ============================================================

function CategoryPanel({
  category,
  providers,
  presets,
  userProviders,
  onSaveProvider,
  onSetActive,
  onTestConnection,
  testResult,
  testing,
  savingProvider,
  isAdmin,
  onSaveUserProvider,
  onDeleteUserProvider,
  onSetActiveUserProvider,
  savingUserProvider,
  hasPlatformDefault = false,
}: {
  category: AiCategory
  providers: ProviderConfig[]
  presets: ProviderPreset[]
  userProviders: ProviderConfig[]
  onSaveProvider: (config: ProviderConfig) => Promise<void>
  onSetActive: (category: AiCategory, provider: string) => void
  onTestConnection: (category: AiCategory) => void
  testResult: { success: boolean; provider?: string; model?: string; error?: string; responsePreview?: string } | null
  testing: boolean
  savingProvider: string | null
  isAdmin: boolean
  onSaveUserProvider: (data: { category: string; provider: string; name?: string; apiKey: string; baseUrl?: string; model?: string; isActive?: boolean }) => Promise<void>
  onDeleteUserProvider: (data: { category: string; provider: string }) => Promise<void>
  onSetActiveUserProvider: (category: string, provider: string) => void
  savingUserProvider: string | null
  hasPlatformDefault?: boolean
}) {
  const ts = useTranslations('settings')
  const meta = CATEGORY_META[category]

  // Find user-level active provider
  const userActiveProvider = userProviders.find((p) => p.isActive)

  return (
    <div className="space-y-4">
      {/* Category header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-primary">{meta.icon}</span>
          <h2 className="text-base font-bold">{ts(meta.labelKey)}</h2>
          <Badge variant="secondary" className="text-[10px]">
            {ts(meta.badgeKey)}
          </Badge>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onTestConnection(category)}
          disabled={testing}
          className="gap-1.5"
        >
          {testing ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Wifi className="size-3.5" />
        )}
        {ts('testConnection')}
      </Button>
      </div>

      {/* Test result */}
      <AnimatePresence>
        {testResult && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
          >
            <Card
              className={`border-border/50 ${
                testResult.success ? 'border-emerald-500/30' : 'border-destructive/30'
              }`}
            >
              <CardContent className="p-3 flex items-start gap-3">
                {testResult.success ? (
                  <CheckCircle2 className="size-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="size-4 text-destructive flex-shrink-0 mt-0.5" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">
                    {testResult.success ? ts('connectionSuccess') : ts('connectionFailed')}
                  </p>
                  {testResult.provider && (
                    <p className="text-xs text-muted-foreground">
                      {ts('providerLabel')}: {testResult.provider}
                      {testResult.model ? ` · ${ts('modelLabel')}: ${testResult.model}` : ''}
                    </p>
                  )}
                  {testResult.responsePreview && (
                    <p className="text-xs text-muted-foreground truncate">
                      {ts('responseLabel')}: {testResult.responsePreview}
                    </p>
                  )}
                  {testResult.error && (
                    <p className="text-xs text-destructive break-all">
                      {testResult.error}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Platform shared key section (global config from admin) — admin only */}
      {isAdmin && providers.length > 0 && (
        <RadioGroup
          value={providers.find((p) => p.isActive)?.provider ?? ''}
          onValueChange={(val) => onSetActive(category, val)}
          className="space-y-3"
        >
          {providers.map((provider) => {
            const preset = presets.find((p) => p.provider === provider.provider)
            return (
              <ProviderCard
                key={`${provider.category}-${provider.provider}`}
                provider={provider}
                preset={preset}
                isActive={provider.isActive}
                onSetActive={() => onSetActive(category, provider.provider)}
                onSave={onSaveProvider}
                saving={savingProvider === `${provider.category}-${provider.provider}`}
                isAdmin={isAdmin}
              />
            )
          })}
        </RadioGroup>
      )}

      {/* User's own key section — visible for all users (admin included) */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 pt-2">
          <User className="size-4 text-amber-500" />
          <h3 className="text-sm font-semibold">{ts('myApiKey')}</h3>
          <Badge variant="secondary" className="text-[9px] bg-amber-500/10 text-amber-600 border-amber-500/20">
            {ts('priorityUse')}
          </Badge>
        </div>
        {!isAdmin && hasPlatformDefault ? (
          <p className="text-[11px] text-muted-foreground -mt-1">
            {ts('userKeyTipWithPlatform')}
          </p>
        ) : !isAdmin ? (
          <p className="text-[11px] text-muted-foreground -mt-1">
            {ts('userKeyTipNoPlatform')}
          </p>
        ) : (
          <p className="text-[11px] text-muted-foreground -mt-1">
            {ts('userKeyTipAdmin')}
          </p>
        )}
        {!isAdmin && hasPlatformDefault && (
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-sky-500/10 border border-sky-500/20">
            <Wifi className="size-3 text-sky-500" />
            <span className="text-[10px] text-sky-600 font-medium">{ts('platformKeyAvailable')}</span>
          </div>
        )}

          <RadioGroup
            value={userActiveProvider?.provider ?? ''}
            onValueChange={(val) => onSetActiveUserProvider(category, val)}
            className="space-y-3"
          >
            {presets.map((preset) => {
              const userProvider = userProviders.find((p) => p.provider === preset.provider)
              const isUserActive = userActiveProvider?.provider === preset.provider
              return (
                <UserProviderCard
                  key={`user-${category}-${preset.provider}`}
                  provider={userProvider ?? null}
                  preset={preset}
                  isActive={isUserActive}
                  onSetActive={() => onSetActiveUserProvider(category, preset.provider)}
                  onSave={onSaveUserProvider}
                  onDelete={() => onDeleteUserProvider({ category, provider: preset.provider })}
                  saving={savingUserProvider === `${category}-${preset.provider}`}
                />
              )
            })}
          </RadioGroup>
      </div>

      {/* Helpful hint */}
      <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/20 border border-border/30">
        <Copy className="size-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          {ts('noApiKeyHint')}
        </p>
      </div>
    </div>
  )
}

// ============================================================
// Agent Config Card — one per agent type
// ============================================================

function AgentConfigCard({
  agent,
  saving,
  onSave,
}: {
  agent: AgentInfo
  saving: boolean
  onSave: (agentType: string, config: Partial<AgentInfo['config']>) => Promise<void>
}) {
  const ts = useTranslations('settings')
  const [expanded, setExpanded] = useState(false)
  const [promptExpanded, setPromptExpanded] = useState(false)
  const [toolsExpanded, setToolsExpanded] = useState(false)
  const [skillExpanded, setSkillExpanded] = useState(false)
  const [systemPrompt, setSystemPrompt] = useState(agent.config.systemPrompt)
  const [model, setModel] = useState(agent.config.model ?? '')
  const [temperature, setTemperature] = useState(agent.config.temperature)
  const [maxTokens, setMaxTokens] = useState(agent.config.maxTokens)
  const [isActive, setIsActive] = useState(agent.config.isActive)

  // Track the agent key to detect when we need to re-sync state
  const agentKey = `${agent.agentType}-${agent.config.systemPrompt}-${agent.config.model}-${agent.config.temperature}-${agent.config.maxTokens}-${agent.config.isActive}`
  const [prevAgentKey, setPrevAgentKey] = useState(agentKey)
  if (agentKey !== prevAgentKey) {
    setPrevAgentKey(agentKey)
    setSystemPrompt(agent.config.systemPrompt)
    setModel(agent.config.model ?? '')
    setTemperature(agent.config.temperature)
    setMaxTokens(agent.config.maxTokens)
    setIsActive(agent.config.isActive)
  }

  const hasCustomPrompt = systemPrompt !== agent.defaultSystemPrompt

  const handleSave = async (updates: Partial<AgentInfo['config']>) => {
    await onSave(agent.agentType, updates)
  }

  const handleToggleActive = async (checked: boolean) => {
    setIsActive(checked)
    await handleSave({ isActive: checked })
  }

  const handleResetPrompt = async () => {
    setSystemPrompt(agent.defaultSystemPrompt)
    await handleSave({ systemPrompt: agent.defaultSystemPrompt })
  }

  return (
    <Card className={`border-border/50 transition-all duration-200 ${isActive ? 'bg-card' : 'bg-card/50 opacity-75'}`}>
      <CardContent className="p-4 sm:p-5">
        {/* Agent header */}
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 size-9 rounded bg-primary/10 flex items-center justify-center">
            <Bot className="size-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold">{agent.name}</span>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono">
                {agent.agentType}
              </Badge>
              {isActive ? (
                <Badge className="text-[10px] bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                  {ts('enabled')}
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-[10px]">
                  {ts('disabledLabel')}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              {agent.description}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={isActive}
              onCheckedChange={handleToggleActive}
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded(!expanded)}
              className="text-muted-foreground hover:text-foreground -mr-2"
            >
              {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
            </Button>
          </div>
        </div>

        {/* Expandable config */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="mt-4 pt-4 border-t border-border/30 space-y-5">
                {/* Model */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium flex items-center gap-1.5">
                    <Cpu className="size-3" />
                    {ts('model')}
                  </Label>
                  <Input
                    placeholder={ts('modelPlaceholder')}
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    onBlur={() => handleSave({ model: model || null })}
                    className="bg-muted/30 border-border/50 text-sm"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    {ts('followGlobalLlm')}
                  </p>
                  {model && (
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="secondary" className="text-[9px] bg-amber-500/10 text-amber-600 border-amber-500/20">
                        覆盖全局模型
                      </Badge>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-[10px] h-5 px-2 text-muted-foreground hover:text-foreground"
                        onClick={() => {
                          setModel('')
                          handleSave({ model: null })
                        }}
                      >
                        清空（跟随全局 LLM）
                      </Button>
                    </div>
                  )}
                </div>

                {/* Temperature */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium">Temperature</Label>
                    <span className="text-xs font-mono text-primary">{temperature.toFixed(1)}</span>
                  </div>
                  <Slider
                    value={[temperature]}
                    onValueChange={([val]) => setTemperature(val)}
                    onValueCommit={([val]) => handleSave({ temperature: val })}
                    min={0}
                    max={2}
                    step={0.1}
                    className="w-full"
                  />
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>{ts('precise')}</span>
                    <span>{ts('creative')}</span>
                  </div>
                </div>

                {/* Max Tokens */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Max Tokens</Label>
                  <Input
                    type="number"
                    min={256}
                    max={32768}
                    step={256}
                    value={maxTokens}
                    onChange={(e) => setMaxTokens(Number(e.target.value))}
                    onBlur={() => handleSave({ maxTokens: maxTokens })}
                    className="bg-muted/30 border-border/50 text-sm"
                  />
                </div>

                {/* System Prompt Editor */}
                <Collapsible open={promptExpanded} onOpenChange={setPromptExpanded}>
                  <CollapsibleTrigger className="flex items-center gap-2 text-xs font-medium w-full hover:text-foreground transition-colors">
                    <Sparkles className="size-3 text-primary" />
                    {ts('systemPrompt')}
                    {hasCustomPrompt && (
                      <Badge variant="secondary" className="text-[9px] px-1 py-0 bg-amber-500/10 text-amber-600 border-amber-500/20">
                        {ts('customized')}
                      </Badge>
                    )}
                    <ChevronDown className={`size-3 ml-auto transition-transform ${promptExpanded ? 'rotate-180' : ''}`} />
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="mt-2 space-y-2">
                      <Textarea
                        value={systemPrompt}
                        onChange={(e) => setSystemPrompt(e.target.value)}
                        className="min-h-[200px] bg-muted/30 border-border/50 text-xs leading-relaxed font-mono"
                      />
                      <div className="flex items-center justify-between">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="text-[10px] h-7 gap-1"
                          onClick={handleResetPrompt}
                          disabled={!hasCustomPrompt}
                        >
                          <RotateCcw className="size-3" />
                          {ts('resetDefaultPrompt')}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          className="text-[10px] h-7"
                          onClick={() => handleSave({ systemPrompt })}
                          disabled={saving}
                        >
                          {saving ? <Loader2 className="size-3 animate-spin" /> : <Save className="size-3" />}
                          {ts('savePrompt')}
                        </Button>
                      </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>

                {/* Tools List */}
                <Collapsible open={toolsExpanded} onOpenChange={setToolsExpanded}>
                  <CollapsibleTrigger className="flex items-center gap-2 text-xs font-medium w-full hover:text-foreground transition-colors">
                    <Wrench className="size-3 text-primary" />
                    {ts('availableTools')}
                    <Badge variant="secondary" className="text-[9px] px-1 py-0">
                      {agent.tools.length}
                    </Badge>
                    <ChevronDown className={`size-3 ml-auto transition-transform ${toolsExpanded ? 'rotate-180' : ''}`} />
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="mt-2 space-y-2">
                      {agent.tools.map((tool) => (
                        <div key={tool.name} className="rounded-md border border-border/40 bg-muted/20 p-2.5">
                          <div className="flex items-center gap-2 mb-0.5">
                            <code className="text-xs font-medium text-primary">{tool.name}</code>
                          </div>
                          <p className="text-[11px] text-muted-foreground leading-relaxed">
                            {tool.description}
                          </p>
                        </div>
                      ))}
                      {agent.tools.length === 0 && (
                        <p className="text-[11px] text-muted-foreground">{ts('noTools')}</p>
                      )}
                    </div>
                  </CollapsibleContent>
                </Collapsible>

                {/* SKILL.md Preview */}
                {agent.skillContent && (
                  <Collapsible open={skillExpanded} onOpenChange={setSkillExpanded}>
                    <CollapsibleTrigger className="flex items-center gap-2 text-xs font-medium w-full hover:text-foreground transition-colors">
                      <Star className="size-3 text-primary" />
                      {ts('skillGuide')}
                      <ChevronDown className={`size-3 ml-auto transition-transform ${skillExpanded ? 'rotate-180' : ''}`} />
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="mt-2">
                        <pre className="text-[10px] leading-relaxed bg-muted/30 rounded-md border border-border/40 p-3 max-h-64 overflow-y-auto whitespace-pre-wrap break-words">
                          {agent.skillContent}
                        </pre>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  )
}

// ============================================================
// Main Settings View
// ============================================================

export function SettingsView() {
  const { navigateToProjects } = useAppStore()
  const { toast } = useToast()
  const ts = useTranslations('settings')
  const tc = useTranslations('common')

  // Admin state — determined by API response
  const [isAdmin, setIsAdmin] = useState(false)

  // Provider data from API
  const [providersData, setProvidersData] = useState<Record<AiCategory, ProviderConfig[]>>({
    llm: [],
    image: [],
    video: [],
    tts: [],
  })
  const [presetsData, setPresetsData] = useState<Record<AiCategory, ProviderPreset[]>>({
    llm: [],
    image: [],
    video: [],
    tts: [],
  })

  // User provider data (per-user API key overrides)
  const [userProvidersData, setUserProvidersData] = useState<Record<string, ProviderConfig[]>>({
    llm: [],
    image: [],
    video: [],
    tts: [],
  })

  // Whether a platform default provider exists for each category
  const [hasDefaultData, setHasDefaultData] = useState<Record<string, boolean>>({
    llm: false,
    image: false,
    video: false,
    tts: false,
  })

  // Loading / saving / testing states
  const [loading, setLoading] = useState(true)
  const [savingProvider, setSavingProvider] = useState<string | null>(null)
  const [savingUserProvider, setSavingUserProvider] = useState<string | null>(null)
  const [testingCategory, setTestingCategory] = useState<AiCategory | null>(null)
  const [testResults, setTestResults] = useState<
    Record<AiCategory, { success: boolean; provider?: string; model?: string; error?: string; responsePreview?: string } | null>
  >({ llm: null, image: null, video: null, tts: null })

  // Agent config data
  const [agentsList, setAgentsList] = useState<AgentInfo[]>([])
  const [agentSaving, setAgentSaving] = useState<string | null>(null)

  // Active tab
  const [activeTab, setActiveTab] = useState<string>('llm')

  // ============================================================
  // 3-column layout state
  // ============================================================
  // Left-sidebar navigation entry — 'providers' uses the 3-column
  // layout (sidebar + provider list + detail). Other entries
  // (agents, models, usage, apikeys, about) reuse the legacy
  // Tabs layout in the right column.
  type SettingsTab = 'providers' | 'agents' | 'models' | 'usage' | 'apikeys' | 'about'
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('providers')
  // Key of the currently selected provider in the middle column.
  // Format: `${category}:${provider}` (e.g. "llm:openai").
  const [selectedProviderKey, setSelectedProviderKey] = useState<string | null>(null)
  // True when the right panel is showing the edit form for a provider
  const [editingProvider, setEditingProvider] = useState(false)
  // True when the right panel is showing the "Add Custom Provider" form
  const [addingCustom, setAddingCustom] = useState(false)
  // Models discovered from the provider's /models endpoint (edit mode)
  const [discoveredModels, setDiscoveredModels] = useState<
    Array<{ id: string; name: string; type: string }>
  >([])
  const [discovering, setDiscovering] = useState(false)
  const [discoverError, setDiscoverError] = useState<string | null>(null)
  // Edit form state
  const [editName, setEditName] = useState('')
  const [editBaseUrl, setEditBaseUrl] = useState('')
  const [editApiKey, setEditApiKey] = useState('')
  const [editShowKey, setEditShowKey] = useState(false)
  const [editProtocol, setEditProtocol] = useState<'openai' | 'anthropic' | 'custom'>('openai')
  const [editModel, setEditModel] = useState('')
  const [testingCustom, setTestingCustom] = useState(false)
  const [customTestResult, setCustomTestResult] = useState<{
    success: boolean
    message?: string
    error?: string
  } | null>(null)

  // Load settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      setLoading(true)
      try {
        const data = await api.settings.get()
        setProvidersData(data.providers as Record<AiCategory, ProviderConfig[]>)
        setPresetsData(data.presets as Record<AiCategory, ProviderPreset[]>)
        // Track admin status from API response
        setIsAdmin((data as any).isAdmin === true)
        // Track whether platform default exists for each category
        if ((data as any).hasDefault) {
          setHasDefaultData((data as any).hasDefault as Record<string, boolean>)
        }
        // Load agent configs
        const agents = await api.agents.list()
        setAgentsList(agents)
        // Load user provider configs
        const userProviders = await api.userProvider.get()
        setUserProvidersData(userProviders.providers as Record<string, ProviderConfig[]>)
      } catch (err) {
        toast({
          title: ts('loadSettingsFailed'),
          description: String(err),
          variant: 'destructive',
        })
      } finally {
        setLoading(false)
      }
    }
    loadSettings()
  }, [toast])

  // Update local providers data from API response
  const updateProvidersFromResponse = useCallback(
    (updated: Record<string, ProviderConfig[]>) => {
      setProvidersData(updated as Record<AiCategory, ProviderConfig[]>)
    },
    []
  )

  // Handle setting active provider
  const handleSetActive = useCallback(
    async (category: AiCategory, provider: string) => {
      try {
        const result = await api.settings.save({
          category,
          provider,
          isActive: true,
        })
        updateProvidersFromResponse(result.providers)

        // Also deactivate this admin's own UserProvider for the same category.
        // Otherwise UserProvider takes priority over AiProvider in
        // getActiveProviderForUser and the admin's platform switch silently
        // does not take effect (Script Workshop bug).
        try {
          const deactivateResult = await api.userProvider.deactivate(category)
          if (deactivateResult?.providers) {
            setUserProvidersData(
              deactivateResult.providers as Record<string, ProviderConfig[]>
            )
          }
        } catch {
          // Non-critical — admin may not have a UserProvider record for this category
        }

        toast({ title: ts('providerSwitched') })
      } catch (err) {
        toast({
          title: ts('switchFailed'),
          description: String(err),
          variant: 'destructive',
        })
      }
    },
    [toast, updateProvidersFromResponse, ts]
  )

  // Handle saving provider config
  const handleSaveProvider = useCallback(
    async (config: ProviderConfig) => {
      const key = `${config.category}-${config.provider}`
      setSavingProvider(key)
      try {
        const result = await api.settings.save({
          category: config.category,
          provider: config.provider,
          name: config.name,
          apiKey: config.apiKey,
          baseUrl: config.baseUrl,
          model: config.model,
          isActive: config.isActive,
        })
        updateProvidersFromResponse(result.providers)
        toast({ title: ts('configSaved') })
      } catch (err) {
        toast({
          title: ts('saveFailed'),
          description: String(err),
          variant: 'destructive',
        })
      } finally {
        setSavingProvider(null)
      }
    },
    [toast, updateProvidersFromResponse, ts]
  )

  // Handle saving user provider config
  const handleSaveUserProvider = useCallback(
    async (data: { category: string; provider: string; name?: string; apiKey: string; baseUrl?: string; model?: string; isActive?: boolean }) => {
      const key = `${data.category}-${data.provider}`
      setSavingUserProvider(key)
      try {
        const result = await api.userProvider.save(data)
        setUserProvidersData(result.providers as Record<string, ProviderConfig[]>)
        toast({ title: ts('myConfigSaved') })
      } catch (err) {
        toast({
          title: ts('saveFailed'),
          description: String(err),
          variant: 'destructive',
        })
      } finally {
        setSavingUserProvider(null)
      }
    },
    [toast, ts]
  )

  // Handle deleting user provider config
  const handleDeleteUserProvider = useCallback(
    async (data: { category: string; provider: string }) => {
      try {
        const result = await api.userProvider.delete(data)
        setUserProvidersData(result.providers as Record<string, ProviderConfig[]>)
        toast({ title: ts('myConfigDeleted') })
      } catch (err) {
        toast({
          title: ts('deleteFailed'),
          description: String(err),
          variant: 'destructive',
        })
      }
    },
    [toast, ts]
  )

  // Handle setting active user provider
  const handleSetActiveUserProvider = useCallback(
    async (category: string, provider: string) => {
      try {
        // Check if the user already has a config for this provider
        const existingProvider = userProvidersData[category]?.find((p) => p.provider === provider)
        if (existingProvider?.apiKey) {
          // User has a config with a key, just activate it
          const result = await api.userProvider.save({
            category,
            provider,
            apiKey: existingProvider.apiKey,
            baseUrl: existingProvider.baseUrl,
            model: existingProvider.model,
            isActive: true,
          })
          setUserProvidersData(result.providers as Record<string, ProviderConfig[]>)
          toast({ title: ts('myProviderSwitched') })
        } else {
          // No config yet, just toggle active state — user needs to input key first
          // Still deactivate other user providers in this category
          const currentActive = userProvidersData[category]?.find((p) => p.isActive)
          if (currentActive) {
            const result = await api.userProvider.save({
              category,
              provider: currentActive.provider,
              apiKey: currentActive.apiKey,
              baseUrl: currentActive.baseUrl,
              model: currentActive.model,
              isActive: false,
            })
            setUserProvidersData(result.providers as Record<string, ProviderConfig[]>)
          }
          toast({ title: ts('enterApiKeyFirst'), description: ts('enterApiKeyDesc') })
        }
      } catch (err) {
        toast({
          title: ts('switchFailed'),
          description: String(err),
          variant: 'destructive',
        })
      }
    },
    [toast, userProvidersData, ts]
  )

  // Handle saving agent config
  const handleSaveAgent = useCallback(
    async (agentType: string, config: Partial<AgentInfo['config']>) => {
      setAgentSaving(agentType)
      try {
        // Coerce null model back to undefined — the API client types
        // expect `model?: string` (Prisma treats null/undefined the same
        // for optional fields, but the TS contract here is `string | undefined`).
        const { model, ...rest } = config
        const result = await api.agents.update(agentType, {
          ...rest,
          model: model || undefined,
        })
        setAgentsList((prev) =>
          prev.map((a) =>
            a.agentType === agentType
              ? { ...a, config: result.config }
              : a
          )
        )
        toast({ title: ts('agentConfigSaved') })
      } catch (err) {
        toast({
          title: ts('agentConfigSaveFailed'),
          description: String(err),
          variant: 'destructive',
        })
      } finally {
        setAgentSaving(null)
      }
    },
    [toast, ts]
  )

  // Handle test connection
  const handleTestConnection = useCallback(
    async (
      category: AiCategory,
      provider?: string,
      apiKey?: string,
      baseUrl?: string,
      model?: string
    ) => {
      // If called from CategoryPanel's global test button (no provider specified)
      if (!provider) {
        setTestingCategory(category)
        setTestResults((prev) => ({ ...prev, [category]: null }))
        try {
          const activeProvider = providersData[category]?.find((p) => p.isActive)
          const result = await api.ai.testConnection(category, activeProvider?.model)
          setTestResults((prev) => ({ ...prev, [category]: result }))
          if (result.success) {
            toast({
              title: ts('connectionSuccess'),
              description: result.model ? `${ts('modelLabel')}: ${result.model}` : undefined,
            })
          } else {
            toast({
              title: ts('connectionFailed'),
              description: result.error,
              variant: 'destructive',
            })
          }
        } catch (err) {
          const errorResult = {
            success: false as const,
            error: String(err),
          }
          setTestResults((prev) => ({ ...prev, [category]: errorResult }))
          toast({
            title: ts('connectionFailed'),
            description: String(err),
            variant: 'destructive',
          })
        } finally {
          setTestingCategory(null)
        }
        return null
      }

      // Called from ProviderCard's test button — the ProviderCard handles its own result display
      // We just proxy to the API here
      try {
        const result = await api.ai.testConnection(category, model, {
          provider,
          apiKey,
          baseUrl,
        })
        return result
      } catch (err) {
        return {
          success: false as const,
          error: String(err),
        }
      }
    },
    [toast, providersData, ts]
  )

  // ============================================================
  // 3-column layout handlers
  // ============================================================

  // Determine the status of a preset provider (for the middle column dot)
  function getPresetStatus(category: AiCategory, provider: string): 'connected' | 'has-key' | 'unconfigured' {
    const platformProvider = providersData[category]?.find((p) => p.provider === provider && p.isActive)
    const platformHasAny = providersData[category]?.some((p) => p.provider === provider && p.apiKey)
    const userProvider = userProvidersData[category]?.find((p) => p.provider === provider)
    const userHasKey = Boolean(userProvider?.apiKey)
    if (platformProvider?.apiKey || userHasKey) return 'connected'
    if (platformHasAny) return 'has-key'
    return 'unconfigured'
  }

  // Enter edit mode for the currently selected provider.
  // Pre-fills the edit form with the provider's existing config.
  function handleEditProvider() {
    if (!selectedProviderKey) return
    const [category, provider] = selectedProviderKey.split(':') as [AiCategory, string]
    const preset = PROVIDER_PRESETS[category]?.find((p) => p.provider === provider)
    const platformProvider = providersData[category]?.find((p) => p.provider === provider)
    const userProvider = userProvidersData[category]?.find((p) => p.provider === provider)

    setEditName(preset?.name ?? platformProvider?.name ?? provider)
    setEditBaseUrl(platformProvider?.baseUrl || userProvider?.baseUrl || preset?.defaultBaseUrl || '')
    // Don't pre-fill API key — backend masks it. User can re-enter if needed.
    setEditApiKey('')
    setEditProtocol('openai')
    setEditModel(platformProvider?.model || userProvider?.model || preset?.defaultModel || '')
    setDiscoveredModels(
      (preset?.availableModels ?? []).map((m) => ({
        id: m.id,
        name: m.name,
        type:
          category === 'image'
            ? 'image'
            : category === 'video'
              ? 'video'
              : category === 'tts'
                ? 'tts'
                : 'text',
      }))
    )
    setDiscoverError(null)
    setCustomTestResult(null)
    setEditingProvider(true)
    setAddingCustom(false)
  }

  // Enter "Add Custom Provider" mode
  function handleAddCustom() {
    setEditName('')
    setEditBaseUrl('')
    setEditApiKey('')
    setEditShowKey(false)
    setEditProtocol('openai')
    setEditModel('')
    setDiscoveredModels([])
    setDiscoverError(null)
    setCustomTestResult(null)
    setAddingCustom(true)
    setEditingProvider(false)
    setSelectedProviderKey(null)
  }

  // Cancel edit / add mode
  function handleCancelEdit() {
    setEditingProvider(false)
    setAddingCustom(false)
    setDiscoveredModels([])
    setDiscoverError(null)
    setCustomTestResult(null)
  }

  // Discover models from the provider's /models endpoint
  async function handleDiscoverModels() {
    if (!editBaseUrl || !editApiKey) {
      setDiscoverError('请填写 Base URL 和 API Key 后再发现模型')
      return
    }
    setDiscovering(true)
    setDiscoverError(null)
    try {
      const result = await api.settings.discoverModels(editBaseUrl, editApiKey, editProtocol)
      setDiscoveredModels(result.models)
      if (result.models.length === 0) {
        setDiscoverError('未发现可用模型，请检查 Base URL 和 API Key')
      }
    } catch (err) {
      setDiscoverError(err instanceof Error ? err.message : String(err))
    } finally {
      setDiscovering(false)
    }
  }

  // Test custom provider connection
  async function handleTestCustomConnection() {
    if (!editBaseUrl || !editApiKey) {
      setCustomTestResult({ success: false, error: '请填写 Base URL 和 API Key' })
      return
    }
    setTestingCustom(true)
    setCustomTestResult(null)
    try {
      const result = await api.settings.testConnection(
        editBaseUrl,
        editApiKey,
        editModel || undefined,
        editProtocol,
        discoveredModels.length > 0 ? discoveredModels : undefined
      )
      setCustomTestResult({
        success: result.success,
        message: result.message,
        error: result.error,
      })
    } catch (err) {
      setCustomTestResult({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setTestingCustom(false)
    }
  }

  // Save custom provider — saves as a user provider for the LLM category
  // (custom providers are always LLM-compatible for now)
  async function handleSaveCustom() {
    if (!editName.trim() || !editApiKey.trim()) {
      toast({
        title: ts('saveFailed'),
        description: '请填写名称和 API Key',
        variant: 'destructive',
      })
      return
    }
    const category: AiCategory = 'llm'
    const provider = editingProvider && selectedProviderKey
      ? selectedProviderKey.split(':')[1]
      : `custom-${Date.now()}`
    try {
      const result = await api.userProvider.save({
        category,
        provider,
        name: editName,
        apiKey: editApiKey,
        baseUrl: editBaseUrl,
        model: editModel,
        isActive: false,
      })
      setUserProvidersData(result.providers as Record<string, ProviderConfig[]>)
      toast({ title: ts('myConfigSaved') })
      setSelectedProviderKey(`${category}:${provider}`)
      handleCancelEdit()
    } catch (err) {
      toast({
        title: ts('saveFailed'),
        description: String(err),
        variant: 'destructive',
      })
    }
  }

  return (
    <div className="flex-1 flex flex-col h-screen">
      {/* Header */}
      <header className="shrink-0 border-b border-border/50 bg-background/80 backdrop-blur-md z-10">
        <div className="px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={navigateToProjects}
              className="text-muted-foreground hover:text-foreground -ml-2"
            >
              <ArrowLeft className="size-4" />
              <span className="hidden sm:inline">{tc('back')}</span>
            </Button>
            <Separator orientation="vertical" className="h-5" />
            <Settings className="size-4 text-primary" />
            <h1 className="text-base font-bold">{ts('platformSettings')}</h1>
          </div>
          <UserMenu />
        </div>
      </header>

      {/* 3-column layout */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-3">
            <Loader2 className="size-8 animate-spin text-primary mx-auto" />
            <p className="text-sm text-muted-foreground">{ts('loadingSettings')}</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex min-h-0">
          {/* ============================================================ */}
          {/* Left Sidebar — Navigation                                    */}
          {/* ============================================================ */}
          <div className="w-56 border-r border-border/50 shrink-0 flex flex-col hidden md:flex">
            <div className="p-3 border-b border-border/50">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                Configuration
              </p>
            </div>
            <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
              <SidebarItem
                icon={Plug}
                label="Providers"
                active={settingsTab === 'providers'}
                onClick={() => setSettingsTab('providers')}
              />
              {isAdmin && (
                <SidebarItem
                  icon={Bot}
                  label="Agents"
                  active={settingsTab === 'agents'}
                  onClick={() => setSettingsTab('agents')}
                />
              )}
              <SidebarItem
                icon={Grid3x3}
                label="Models"
                active={settingsTab === 'models'}
                onClick={() => setSettingsTab('models')}
              />
            </nav>
            <div className="p-3 border-t border-border/50">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-2">
                Access
              </p>
              <div className="space-y-0.5">
                <SidebarItem
                  icon={BarChart3}
                  label="Usage"
                  active={settingsTab === 'usage'}
                  onClick={() => setSettingsTab('usage')}
                />
                <SidebarItem
                  icon={Globe}
                  label="API Keys"
                  active={settingsTab === 'apikeys'}
                  onClick={() => setSettingsTab('apikeys')}
                />
              </div>
            </div>
            <div className="p-3 border-t border-border/50">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-2">
                System
              </p>
              <div className="space-y-0.5">
                <SidebarItem
                  icon={Info}
                  label="About"
                  active={settingsTab === 'about'}
                  onClick={() => setSettingsTab('about')}
                />
              </div>
            </div>
          </div>

          {/* ============================================================ */}
          {/* Middle Column — Provider List (only for "providers" tab)     */}
          {/* ============================================================ */}
          {settingsTab === 'providers' && (
            <div className="w-72 border-r border-border/50 shrink-0 overflow-y-auto hidden lg:block">
              {/* Preset Providers section */}
              <div className="p-3 border-b border-border/50 sticky top-0 bg-background/80 backdrop-blur-md z-10">
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Preset Providers
                </h3>
              </div>
              <div className="p-2 space-y-3">
                {(Object.keys(PROVIDER_PRESETS) as AiCategory[]).map((category) => {
                  const meta = CATEGORY_META[category]
                  const presets = PROVIDER_PRESETS[category]
                  return (
                    <div key={category}>
                      <div className="flex items-center gap-1.5 px-2 py-1">
                        <span className="text-primary/80">{meta.icon}</span>
                        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                          {ts(meta.labelKey)}
                        </p>
                      </div>
                      <div className="space-y-0.5">
                        {presets.map((preset) => {
                          const key = `${category}:${preset.provider}`
                          const isSelected = selectedProviderKey === key
                          const status = getPresetStatus(category, preset.provider)
                          return (
                            <button
                              key={key}
                              type="button"
                              onClick={() => {
                                setSelectedProviderKey(key)
                                handleCancelEdit()
                              }}
                              className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs transition-colors text-left ${
                                isSelected
                                  ? 'bg-primary/10 text-primary'
                                  : 'text-foreground hover:bg-muted/40'
                              }`}
                            >
                              <span
                                className={`inline-block size-1.5 rounded-full flex-shrink-0 ${
                                  status === 'connected'
                                    ? 'bg-emerald-500'
                                    : status === 'has-key'
                                      ? 'bg-amber-500'
                                      : 'bg-muted-foreground/30'
                                }`}
                              />
                              <span className="flex-1 truncate">
                                {preset.name}
                              </span>
                              {isSelected && (
                                <Check className="size-3 text-primary flex-shrink-0" />
                              )}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}

                {/* Custom providers section */}
                <div>
                  <div className="flex items-center gap-1.5 px-2 py-1 mt-2">
                    <Server className="size-3 text-muted-foreground" />
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                      Custom
                    </p>
                  </div>
                  <div className="space-y-0.5">
                    {/* Show user providers that are custom (don't match a preset) */}
                    {(Object.keys(userProvidersData) as AiCategory[]).flatMap((category) => {
                      const presets = PROVIDER_PRESETS[category]
                      return (userProvidersData[category] ?? [])
                        .filter((up) => !presets.some((p) => p.provider === up.provider))
                        .map((up) => {
                          const key = `${category}:${up.provider}`
                          const isSelected = selectedProviderKey === key
                          return (
                            <button
                              key={key}
                              type="button"
                              onClick={() => {
                                setSelectedProviderKey(key)
                                handleCancelEdit()
                              }}
                              className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs transition-colors text-left ${
                                isSelected
                                  ? 'bg-primary/10 text-primary'
                                  : 'text-foreground hover:bg-muted/40'
                              }`}
                            >
                              <span className="inline-block size-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                              <span className="flex-1 truncate">
                                {up.name || up.provider}
                              </span>
                              {isSelected && (
                                <Check className="size-3 text-primary flex-shrink-0" />
                              )}
                            </button>
                          )
                        })
                    })}
                    {/* Add Custom Provider button */}
                    <button
                      type="button"
                      onClick={handleAddCustom}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 mt-1 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted/40 border border-dashed border-border/60 transition-colors"
                    >
                      <Plus className="size-3 flex-shrink-0" />
                      <span>Add Custom Provider</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ============================================================ */}
          {/* Right Column — Detail Panel / Edit Form / Other tabs         */}
          {/* ============================================================ */}
          <div className="flex-1 overflow-y-auto min-w-0">
            {/* ---- PROVIDERS TAB ---- */}
            {settingsTab === 'providers' && (
              <div className="p-6 max-w-3xl">
                {addingCustom || editingProvider ? (
                  /* ===== Edit / Add Custom Provider Form ===== */
                  <div className="space-y-5">
                    <div className="flex items-center justify-between">
                      <h2 className="text-lg font-semibold">
                        {addingCustom ? 'Add Custom Provider' : 'Edit Provider'}
                      </h2>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleCancelEdit}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        {tc('cancel')}
                      </Button>
                    </div>

                    {/* Name */}
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium flex items-center gap-1.5">
                        <Bot className="size-3" />
                        Provider Name
                      </Label>
                      <Input
                        placeholder="My Custom Provider"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="bg-muted/30 border-border/50"
                      />
                    </div>

                    {/* Base URL */}
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium flex items-center gap-1.5">
                        <Globe className="size-3" />
                        Base URL
                      </Label>
                      <Input
                        placeholder="https://api.example.com/v1"
                        value={editBaseUrl}
                        onChange={(e) => setEditBaseUrl(e.target.value)}
                        className="bg-muted/30 border-border/50"
                      />
                      {editBaseUrl && (
                        <p className="text-[10px] text-muted-foreground truncate">
                          Models endpoint: <code className="bg-muted/50 px-1 rounded">
                            {editBaseUrl.endsWith('/models') ? editBaseUrl : `${editBaseUrl.replace(/\/$/, '')}/models`}
                          </code>
                        </p>
                      )}
                    </div>

                    {/* API Key */}
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium flex items-center gap-1.5">
                        <Key className="size-3" />
                        API Key
                      </Label>
                      <div className="relative">
                        <Input
                          type={editShowKey ? 'text' : 'password'}
                          placeholder="sk-..."
                          value={editApiKey}
                          onChange={(e) => setEditApiKey(e.target.value)}
                          className="bg-muted/30 border-border/50 pr-10"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditShowKey(!editShowKey)}
                          className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                        >
                          {editShowKey ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                        </Button>
                      </div>
                    </div>

                    {/* Model Discovery Protocol */}
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium flex items-center gap-1.5">
                        <Cpu className="size-3" />
                        Model Discovery Protocol
                      </Label>
                      <div className="flex gap-2">
                        {(['openai', 'anthropic', 'custom'] as const).map((p) => (
                          <button
                            key={p}
                            type="button"
                            onClick={() => setEditProtocol(p)}
                            className={`px-3 py-1.5 rounded-md text-xs border transition-colors ${
                              editProtocol === p
                                ? 'border-primary/50 bg-primary/10 text-primary'
                                : 'border-border/40 bg-muted/20 text-muted-foreground hover:text-foreground hover:bg-muted/40'
                            }`}
                          >
                            {p === 'openai'
                              ? 'OpenAI Compatible'
                              : p === 'anthropic'
                                ? 'Anthropic'
                                : 'Custom'}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Discover Models button */}
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleDiscoverModels}
                        disabled={discovering || !editBaseUrl || !editApiKey}
                        className="gap-1.5"
                      >
                        {discovering ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <RefreshCw className="size-3.5" />
                        )}
                        Discover Models
                      </Button>
                      {discoverError && (
                        <span className="text-[11px] text-destructive">{discoverError}</span>
                      )}
                    </div>

                    {/* Model List */}
                    {discoveredModels.length > 0 && (
                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium">
                          Models ({discoveredModels.length})
                        </Label>
                        <div className="rounded-md border border-border/40 bg-muted/20 divide-y divide-border/30 max-h-64 overflow-y-auto">
                          {discoveredModels.map((m) => (
                            <div
                              key={m.id}
                              className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted/40"
                            >
                              <Check
                                className={`size-3 flex-shrink-0 ${
                                  editModel === m.id ? 'text-emerald-500' : 'text-muted-foreground/40'
                                }`}
                              />
                              <button
                                type="button"
                                onClick={() => setEditModel(m.id)}
                                className="flex-1 text-left text-xs"
                              >
                                <span className="font-mono">{m.id}</span>
                                <span className="text-muted-foreground ml-2">{m.name}</span>
                              </button>
                              <Badge
                                variant="outline"
                                className={`text-[9px] px-1 py-0 ${
                                  m.type === 'text'
                                    ? 'bg-sky-500/10 text-sky-600 border-sky-500/20'
                                    : m.type === 'image'
                                      ? 'bg-violet-500/10 text-violet-600 border-violet-500/20'
                                      : m.type === 'video'
                                        ? 'bg-amber-500/10 text-amber-600 border-amber-500/20'
                                        : 'bg-teal-500/10 text-teal-600 border-teal-500/20'
                                }`}
                              >
                                {m.type.toUpperCase()}
                              </Badge>
                            </div>
                          ))}
                        </div>
                        {editModel && (
                          <p className="text-[10px] text-muted-foreground">
                            Default model: <code className="bg-muted/50 px-1 rounded">{editModel}</code>
                          </p>
                        )}
                      </div>
                    )}

                    {/* Test result */}
                    {customTestResult && (
                      <div
                        className={`flex items-start gap-2 p-2.5 rounded-md border text-xs ${
                          customTestResult.success
                            ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400'
                            : 'border-destructive/30 bg-destructive/5 text-destructive'
                        }`}
                      >
                        {customTestResult.success ? (
                          <CheckCircle2 className="size-3.5 flex-shrink-0 mt-0.5" />
                        ) : (
                          <XCircle className="size-3.5 flex-shrink-0 mt-0.5" />
                        )}
                        <div className="flex-1 min-w-0">
                          <span className="font-medium">
                            {customTestResult.success ? '连接成功' : '连接失败'}
                          </span>
                          {customTestResult.message && (
                            <span className="text-muted-foreground ml-1">
                              · {customTestResult.message}
                            </span>
                          )}
                          {customTestResult.error && (
                            <p className="break-all mt-0.5">{customTestResult.error}</p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Action buttons */}
                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/30">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleTestCustomConnection}
                        disabled={testingCustom || !editBaseUrl || !editApiKey}
                        className="gap-1.5"
                      >
                        {testingCustom ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Wifi className="size-3.5" />
                        )}
                        Test Connection
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleSaveCustom}
                        disabled={!editName.trim() || !editApiKey.trim()}
                        className="gap-1.5"
                      >
                        <Save className="size-3.5" />
                        Save
                      </Button>
                    </div>
                  </div>
                ) : selectedProviderKey ? (
                  /* ===== Provider Detail View ===== */
                  <ProviderDetailView
                    providerKey={selectedProviderKey}
                    providersData={providersData}
                    userProvidersData={userProvidersData}
                    presets={PROVIDER_PRESETS}
                    isAdmin={isAdmin}
                    onEdit={handleEditProvider}
                    onTest={async () => {
                      const [category, provider] = selectedProviderKey.split(':') as [AiCategory, string]
                      return handleTestConnection(category, provider)
                    }}
                    onDelete={async () => {
                      const [category, provider] = selectedProviderKey.split(':') as [AiCategory, string]
                      await handleDeleteUserProvider({ category, provider })
                    }}
                    savingUserProvider={savingUserProvider}
                  />
                ) : (
                  /* ===== Empty state — no provider selected ===== */
                  <div className="flex items-center justify-center py-20">
                    <div className="text-center space-y-3 max-w-sm">
                      <div className="size-12 rounded-full bg-muted/40 flex items-center justify-center mx-auto">
                        <Plug className="size-6 text-muted-foreground/50" />
                      </div>
                      <h3 className="text-sm font-medium">Select a Provider</h3>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        Choose a provider from the list to view its connection details and models, or click "Add Custom Provider" to configure a new one.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ---- AGENTS TAB ---- */}
            {settingsTab === 'agents' && isAdmin && (
              <div className="p-6 max-w-3xl space-y-4">
                <div className="flex items-center gap-2">
                  <Bot className="size-4 text-primary" />
                  <h2 className="text-base font-bold">{ts('agentConfig')}</h2>
                  <Badge variant="secondary" className="text-[10px]">
                    {ts('agentCount', { count: agentsList.length })}
                  </Badge>
                </div>
                <div className="space-y-3">
                  {agentsList.map((agent) => (
                    <AgentConfigCard
                      key={agent.agentType}
                      agent={agent}
                      saving={agentSaving === agent.agentType}
                      onSave={handleSaveAgent}
                    />
                  ))}
                  {agentsList.length === 0 && (
                    <div className="flex items-center justify-center py-12">
                      <div className="text-center">
                        <Bot className="size-10 text-muted-foreground/30 mx-auto mb-3" />
                        <p className="text-sm text-muted-foreground">{ts('loadingAgentConfig')}</p>
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/20 border border-border/30">
                  <Info className="size-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    {ts('agentDescription')}
                  </p>
                </div>
              </div>
            )}

            {/* ---- MODELS TAB (legacy category tabs) ---- */}
            {settingsTab === 'models' && (
              <div className="p-6">
                <Tabs
                  value={activeTab}
                  onValueChange={setActiveTab}
                  className="w-full"
                >
                  <TabsList className="w-full sm:w-auto grid grid-cols-4 sm:inline-flex h-auto p-1">
                    {(Object.keys(CATEGORY_META) as AiCategory[]).map((cat) => {
                      const meta = CATEGORY_META[cat]
                      const activeProvider = providersData[cat]?.find((p) => p.isActive)
                      const hasAnyKey = providersData[cat]?.some((p) => p.apiKey)
                      const hasUserKey = userProvidersData[cat]?.some((p) => p.apiKey)
                      return (
                        <TabsTrigger
                          key={cat}
                          value={cat}
                          className="gap-1.5 text-xs sm:text-sm py-2 px-2 sm:px-3"
                        >
                          {meta.icon}
                          <span className="hidden sm:inline">{ts(meta.labelKey)}</span>
                          <span className="sm:hidden">
                            {cat === 'llm' ? 'LLM' : cat === 'tts' ? 'TTS' : cat === 'image' ? ts('tabImage') : ts('tabVideo')}
                          </span>
                          {hasUserKey ? (
                            <span className="inline-block size-1.5 rounded-full bg-amber-500" />
                          ) : activeProvider ? (
                            <span className="inline-block size-1.5 rounded-full bg-emerald-500" />
                          ) : hasAnyKey ? (
                            <span className="inline-block size-1.5 rounded-full bg-amber-500" />
                          ) : null}
                        </TabsTrigger>
                      )
                    })}
                  </TabsList>

                  {(Object.keys(CATEGORY_META) as AiCategory[]).map((category) => (
                    <TabsContent key={category} value={category} className="mt-4">
                      <CategoryPanel
                        category={category}
                        providers={providersData[category] ?? []}
                        presets={presetsData[category] ?? []}
                        userProviders={userProvidersData[category] ?? []}
                        onSaveProvider={handleSaveProvider}
                        onSetActive={handleSetActive}
                        onTestConnection={(cat: AiCategory) => handleTestConnection(cat)}
                        testResult={testResults[category]}
                        testing={testingCategory === category}
                        savingProvider={savingProvider}
                        isAdmin={isAdmin}
                        onSaveUserProvider={handleSaveUserProvider}
                        onDeleteUserProvider={handleDeleteUserProvider}
                        onSetActiveUserProvider={handleSetActiveUserProvider}
                        savingUserProvider={savingUserProvider}
                        hasPlatformDefault={hasDefaultData[category] ?? false}
                      />
                    </TabsContent>
                  ))}
                </Tabs>
              </div>
            )}

            {/* ---- USAGE TAB ---- */}
            {settingsTab === 'usage' && (
              <div className="p-6">
                <BudgetPanel />
              </div>
            )}

            {/* ---- API KEYS TAB ---- */}
            {settingsTab === 'apikeys' && (
              <div className="p-6">
                <PlatformConfig />
              </div>
            )}

            {/* ---- ABOUT TAB ---- */}
            {settingsTab === 'about' && (
              <div className="p-6 max-w-2xl space-y-4">
                <div className="flex items-center gap-2">
                  <Info className="size-4 text-primary" />
                  <h2 className="text-base font-bold">About</h2>
                </div>
                <Card className="border-border/50">
                  <CardContent className="p-5 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="size-10 rounded bg-primary/10 flex items-center justify-center">
                        <Settings className="size-5 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold">huobao-drama-ai</p>
                        <p className="text-xs text-muted-foreground">AI-powered drama production platform</p>
                      </div>
                    </div>
                    <Separator />
                    <div className="space-y-2 text-xs">
                      <div className="flex items-start gap-2">
                        <Info className="size-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
                        <p className="text-muted-foreground leading-relaxed">
                          {isAdmin ? ts('adminKeyInfo') : ts('userKeyInfo')}
                        </p>
                      </div>
                      <div className="flex items-start gap-2">
                        <Info className="size-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
                        <p className="text-muted-foreground leading-relaxed">
                          {ts('configCompleteHint')}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================
// ProviderDetailView — detail panel for the selected provider
// Shows: provider name + status badge, connection info card,
// model list with type tags, edit/test/delete buttons.
// ============================================================

function ProviderDetailView({
  providerKey,
  providersData,
  userProvidersData,
  presets,
  isAdmin,
  onEdit,
  onTest,
  onDelete,
  savingUserProvider,
}: {
  providerKey: string
  providersData: Record<AiCategory, ProviderConfig[]>
  userProvidersData: Record<string, ProviderConfig[]>
  presets: Record<AiCategory, ProviderPreset[]>
  isAdmin: boolean
  onEdit: () => void
  onTest: () => Promise<{ success: boolean; model?: string; error?: string; responsePreview?: string } | null>
  onDelete: () => Promise<void>
  savingUserProvider: string | null
}) {
  const ts = useTranslations('settings')
  const [category, provider] = providerKey.split(':') as [AiCategory, string]
  const preset = presets[category]?.find((p) => p.provider === provider)
  const platformProvider = providersData[category]?.find((p) => p.provider === provider)
  const userProvider = userProvidersData[category]?.find((p) => p.provider === provider)
  const isActive = platformProvider?.isActive || userProvider?.isActive
  const isCustom = !preset || preset.provider === 'custom'
  const displayName = preset?.name ?? platformProvider?.name ?? userProvider?.name ?? provider

  // Status: connected (has key) / unconfigured
  const hasKey = Boolean(
    (platformProvider?.apiKey && !platformProvider.apiKey.startsWith('****')) ||
      userProvider?.apiKey
  )
  const isMaskedKey = (platformProvider?.apiKey ?? '').startsWith('****')
  const status: 'connected' | 'unconfigured' = hasKey || isMaskedKey ? 'connected' : 'unconfigured'

  // Build the model list from preset.availableModels (or just the single configured model)
  const modelList: Array<{ id: string; name: string; type: 'text' | 'image' | 'video' | 'tts' }> = preset?.availableModels
    ? preset.availableModels.map((m) => ({
        id: m.id,
        name: m.name,
        type:
          category === 'image'
            ? 'image'
            : category === 'video'
              ? 'video'
              : category === 'tts'
                ? 'tts'
                : 'text',
      }))
    : platformProvider?.model
      ? [{
          id: platformProvider.model,
          name: platformProvider.model,
          type:
            category === 'image'
              ? 'image'
              : category === 'video'
                ? 'video'
                : category === 'tts'
                  ? 'tts'
                  : 'text',
        }]
      : []

  // Default model — either preset.defaultModel or the configured model
  const defaultModel = platformProvider?.model || userProvider?.model || preset?.defaultModel

  // Test result state
  const [testResult, setTestResult] = useState<{
    success: boolean
    model?: string
    error?: string
    responsePreview?: string
  } | null>(null)
  const [testing, setTesting] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const result = await onTest()
      if (result) setTestResult(result)
    } finally {
      setTesting(false)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await onDelete()
    } finally {
      setDeleting(false)
    }
  }

  const protocolLabel = preset?.provider === 'custom'
    ? 'Custom'
    : preset?.defaultBaseUrl?.includes('anthropic')
      ? 'Anthropic'
      : 'OpenAI'

  const baseUrl = platformProvider?.baseUrl || userProvider?.baseUrl || preset?.defaultBaseUrl || '—'
  const apiKeyDisplay = isMaskedKey
    ? '••••••••' + (platformProvider?.apiKey?.slice(-4) ?? '')
    : userProvider?.apiKey
      ? '••••••••' + userProvider.apiKey.slice(-4)
      : hasKey
        ? '••••••••'
        : '—'

  return (
    <div className="space-y-5">
      {/* Provider info header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="size-9 rounded bg-primary/10 flex items-center justify-center">
            <Plug className="size-4 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold">{displayName}</h2>
              <Badge
                variant="outline"
                className={`text-[9px] px-1.5 py-0 ${
                  status === 'connected'
                    ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                    : 'bg-muted/30 text-muted-foreground border-border/30'
                }`}
              >
                {status === 'connected' ? 'CONNECTED' : 'UNCONFIGURED'}
              </Badge>
              {isActive && (
                <Badge className="text-[9px] px-1.5 py-0 bg-primary/10 text-primary border-primary/20">
                  {ts('currentUsing')}
                </Badge>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {protocolLabel} · URL
            </p>
          </div>
        </div>
      </div>

      {/* Connection info card */}
      <Card className="border-border/50">
        <CardContent className="p-0">
          <div className="px-4 py-2.5 border-b border-border/30">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              Connection
            </p>
          </div>
          <div className="divide-y divide-border/30">
            <div className="px-4 py-2.5 grid grid-cols-3 gap-3 text-xs">
              <span className="text-muted-foreground">Model Protocol</span>
              <span className="col-span-2 font-mono">{protocolLabel}</span>
            </div>
            <div className="px-4 py-2.5 grid grid-cols-3 gap-3 text-xs">
              <span className="text-muted-foreground">Base URL</span>
              <span className="col-span-2 font-mono break-all">{baseUrl}</span>
            </div>
            <div className="px-4 py-2.5 grid grid-cols-3 gap-3 text-xs">
              <span className="text-muted-foreground">API Key</span>
              <span className="col-span-2 font-mono">{apiKeyDisplay}</span>
            </div>
            <div className="px-4 py-2.5 grid grid-cols-3 gap-3 text-xs">
              <span className="text-muted-foreground">Env Variable</span>
              <span className="col-span-2 font-mono text-muted-foreground">
                {preset?.envKey || '—'}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Model list */}
      {modelList.length > 0 && (
        <Card className="border-border/50">
          <CardContent className="p-0">
            <div className="px-4 py-2.5 border-b border-border/30">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                Model List
              </p>
            </div>
            <div className="divide-y divide-border/30">
              {modelList.map((m) => {
                const isDefault = m.id === defaultModel
                return (
                  <div
                    key={m.id}
                    className="px-4 py-2 flex items-center gap-2 text-xs"
                  >
                    <Check
                      className={`size-3 flex-shrink-0 ${
                        isDefault ? 'text-emerald-500' : 'text-muted-foreground/40'
                      }`}
                    />
                    <code className="font-mono flex-1 truncate">{m.id}</code>
                    <Badge
                      variant="outline"
                      className={`text-[9px] px-1 py-0 ${
                        m.type === 'text'
                          ? 'bg-sky-500/10 text-sky-600 border-sky-500/20'
                          : m.type === 'image'
                            ? 'bg-violet-500/10 text-violet-600 border-violet-500/20'
                            : m.type === 'video'
                              ? 'bg-amber-500/10 text-amber-600 border-amber-500/20'
                              : 'bg-teal-500/10 text-teal-600 border-teal-500/20'
                      }`}
                    >
                      {m.type.toUpperCase()}
                    </Badge>
                    {isDefault && (
                      <Badge className="text-[9px] px-1 py-0 bg-primary/10 text-primary border-primary/20">
                        DEFAULT
                      </Badge>
                    )}
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Test result */}
      {testResult && (
        <div
          className={`flex items-start gap-2 p-2.5 rounded-md border text-xs ${
            testResult.success
              ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400'
              : 'border-destructive/30 bg-destructive/5 text-destructive'
          }`}
        >
          {testResult.success ? (
            <CheckCircle2 className="size-3.5 flex-shrink-0 mt-0.5" />
          ) : (
            <XCircle className="size-3.5 flex-shrink-0 mt-0.5" />
          )}
          <div className="flex-1 min-w-0">
            <span className="font-medium">
              {testResult.success ? ts('connectionSuccess') : ts('connectionFailed')}
            </span>
            {testResult.model && (
              <span className="text-muted-foreground ml-1">· {testResult.model}</span>
            )}
            {testResult.responsePreview && (
              <p className="text-muted-foreground truncate mt-0.5">
                {ts('responseLabel')}: {testResult.responsePreview}
              </p>
            )}
            {testResult.error && (
              <p className="break-all mt-0.5">{testResult.error}</p>
            )}
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/30">
        {!isCustom && isAdmin && (
          <Button
            variant="default"
            size="sm"
            onClick={onEdit}
            className="gap-1.5"
          >
            <Pencil className="size-3.5" />
            Edit
          </Button>
        )}
        {isCustom && (
          <Button
            variant="default"
            size="sm"
            onClick={onEdit}
            className="gap-1.5"
          >
            <Pencil className="size-3.5" />
            Edit
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={handleTest}
          disabled={testing || status === 'unconfigured'}
          className="gap-1.5"
        >
          {testing ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Wifi className="size-3.5" />
          )}
          {ts('testConnection')}
        </Button>
        {userProvider && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleDelete}
            disabled={deleting || savingUserProvider === `${category}-${provider}`}
            className="gap-1.5 text-destructive hover:text-destructive"
          >
            {deleting ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Trash2 className="size-3.5" />
            )}
            Delete
          </Button>
        )}
      </div>
    </div>
  )
}
