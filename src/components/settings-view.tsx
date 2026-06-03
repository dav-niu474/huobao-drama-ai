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
  Wallet,
  Globe,
} from 'lucide-react'

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
        const result = await api.agents.update(agentType, config)
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

  return (
    <div className="flex-1 flex flex-col min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-border/50 bg-background/80 backdrop-blur-md">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
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
            <Settings className="size-5 text-primary" />
            <h1 className="text-xl font-bold">{ts('platformSettings')}</h1>
          </div>
          <UserMenu />
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 max-w-4xl mx-auto w-full px-4 sm:px-6 py-6 space-y-6">
        {/* Loading state */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center space-y-3">
              <Loader2 className="size-8 animate-spin text-primary mx-auto" />
              <p className="text-sm text-muted-foreground">{ts('loadingSettings')}</p>
            </div>
          </div>
        ) : (
          <>
            {/* Tabs for categories */}
            <Tabs
              value={activeTab}
              onValueChange={setActiveTab}
              className="w-full"
            >
              <TabsList className={`w-full sm:w-auto grid ${isAdmin ? 'grid-cols-7' : 'grid-cols-6'} sm:inline-flex h-auto p-1`}>
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
                {isAdmin && (
                <TabsTrigger
                  value="agent"
                  className="gap-1.5 text-xs sm:text-sm py-2 px-2 sm:px-3"
                >
                  <Bot className="size-4" />
                  <span className="hidden sm:inline">{ts('agentConfig')}</span>
                  <span className="sm:hidden">{ts('agentConfigShort')}</span>
                  {agentsList.some((a) => a.config.isActive) && (
                    <span className="inline-block size-1.5 rounded-full bg-emerald-500" />
                  )}
                </TabsTrigger>
                )}
                <TabsTrigger
                  value="budget"
                  className="gap-1.5 text-xs sm:text-sm py-2 px-2 sm:px-3"
                >
                  <Wallet className="size-4" />
                  <span className="hidden sm:inline">{ts('budgetControl')}</span>
                  <span className="sm:hidden">{ts('budgetShort')}</span>
                </TabsTrigger>
                <TabsTrigger
                  value="publish"
                  className="gap-1.5 text-xs sm:text-sm py-2 px-2 sm:px-3"
                >
                  <Globe className="size-4" />
                  <span className="hidden sm:inline">{ts('publishPlatform')}</span>
                  <span className="sm:hidden">{ts('publishShort')}</span>
                </TabsTrigger>
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

              {/* Agent Configuration Tab — admin only */}
              {isAdmin && (
              <TabsContent value="agent" className="mt-4">
                <div className="space-y-4">
                  {/* Header */}
                  <div className="flex items-center gap-2">
                    <Bot className="size-4 text-primary" />
                    <h2 className="text-base font-bold">{ts('agentConfig')}</h2>
                    <Badge variant="secondary" className="text-[10px]">
                      {ts('agentCount', { count: agentsList.length })}
                    </Badge>
                  </div>

                  {/* Agent list */}
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

                  {/* Info hint */}
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/20 border border-border/30">
                    <Info className="size-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      {ts('agentDescription')}
                    </p>
                  </div>
                </div>
              </TabsContent>
              )}
              {/* Budget Control Tab */}
              <TabsContent value="budget" className="mt-4">
                <BudgetPanel />
              </TabsContent>

              {/* Publish Platform Config Tab */}
              <TabsContent value="publish" className="mt-4">
                <PlatformConfig />
              </TabsContent>
            </Tabs>

            {/* Bottom info */}
            <div className="pt-4 pb-8 border-t border-border/30">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                  <Info className="size-3.5 mt-0.5 flex-shrink-0" />
                  {isAdmin
                    ? ts('adminKeyInfo')
                    : ts('userKeyInfo')}
                </p>
                <p className="text-[10px] text-muted-foreground/60">
                  {ts('configCompleteHint')}
                </p>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
