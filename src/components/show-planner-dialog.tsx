'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Slider } from '@/components/ui/slider'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
  Lock,
  Monitor,
  Smartphone,
  Square,
  AlertTriangle,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { api } from '@/lib/api'

interface ShowPlannerDialogProps {
  dramaId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onComplete?: () => void
}

// Genre/Tone tag options
const GENRE_OPTIONS = ['都市', '古装', '悬疑', '科幻', '甜宠', '复仇', '励志', '校园', '宫斗', '玄幻', '职场', '家庭']
const TONE_OPTIONS = ['爽感', '虐心', '搞笑', '温馨', '暗黑', '热血', '治愈']
const STYLE_OPTIONS = ['写实', '动漫', '电影感', '漫画', '水彩', '3D']
const PLATFORM_OPTIONS = [
  { value: 'douyin', label: '抖音' },
  { value: 'kuaishou', label: '快手' },
  { value: 'xiaohongshu', label: '小红书' },
  { value: 'bilibili', label: 'B站' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'other', label: '其他' },
]

export function ShowPlannerDialog({ dramaId, open, onOpenChange, onComplete }: ShowPlannerDialogProps) {
  const t = useTranslations('showPlanner')
  const tc = useTranslations('common')
  const { toast } = useToast()

  const [step, setStep] = useState(1)
  const [saving, setSaving] = useState(false)
  const [locking, setLocking] = useState(false)

  // Step 1: Coverage + Episode Format
  const [coverageStart, setCoverageStart] = useState(1)
  const [coverageEnd, setCoverageEnd] = useState(60)
  const [episodeCount, setEpisodeCount] = useState(80)
  const [episodeDuration, setEpisodeDuration] = useState(90)
  const [episodeFormat, setEpisodeFormat] = useState('vertical')

  // Step 2: Aspect Ratio + Genre/Tone
  const [aspectRatio, setAspectRatio] = useState('9:16')
  const [selectedGenre, setSelectedGenre] = useState('都市')
  const [selectedTone, setSelectedTone] = useState('爽感')
  const [selectedStyle, setSelectedStyle] = useState('电影感')
  const [customTags, setCustomTags] = useState<string[]>([])

  // Step 3: Platform + Paywall + Budget
  const [targetPlatform, setTargetPlatform] = useState('douyin')
  const [freeEpisodes, setFreeEpisodes] = useState(5)
  const [hookEpisodes, setHookEpisodes] = useState<number[]>([3, 5])
  const [budgetTotal, setBudgetTotal] = useState(1000)
  const [modelPreference, setModelPreference] = useState('balanced')
  const [qualityPriority, setQualityPriority] = useState('standard')

  // Pre-fill from novel analysis
  useEffect(() => {
    if (!open || !dramaId) return

    const loadShowPlan = async () => {
      try {
        const data = await api.showPlan.get(dramaId)

        // Pre-fill existing values
        if (data.coverage) {
          setCoverageStart(data.coverage.start ?? 1)
          setCoverageEnd(data.coverage.end ?? 60)
        }
        if (data.episodeFormat) {
          setEpisodeCount(data.episodeFormat.count ?? 80)
          setEpisodeDuration(data.episodeFormat.duration ?? 90)
          setEpisodeFormat(data.episodeFormat.format ?? 'vertical')
        }
        if (data.aspectRatio) setAspectRatio(data.aspectRatio)
        if (data.genreTone) {
          setSelectedGenre(data.genreTone.genre?.primary ?? '都市')
          setSelectedTone(data.genreTone.tone?.primary ?? '爽感')
          setSelectedStyle(data.genreTone.style?.primary ?? '电影感')
          if (data.genreTone.tags) setCustomTags(data.genreTone.tags)
        }
        if (data.targetPlatform) setTargetPlatform(data.targetPlatform)
        if (data.paywallConfig) {
          setFreeEpisodes(data.paywallConfig.freeEpisodes ?? 5)
          setHookEpisodes(data.paywallConfig.hookEpisodes ?? [3, 5])
        }
        if (data.budgetConstraints) {
          setBudgetTotal(data.budgetConstraints.total ?? 1000)
          setModelPreference(data.budgetConstraints.modelPreference ?? 'balanced')
          setQualityPriority(data.budgetConstraints.qualityPriority ?? 'standard')
        }

        // Pre-fill from novel analysis if no show plan yet
        if (!data.coverage && data.novelAnalysis) {
          const analysis = data.novelAnalysis
          if (analysis.episodeRecommendation) {
            setEpisodeCount(analysis.episodeRecommendation.recommendedCount ?? 80)
            setCoverageEnd(analysis.episodeRecommendation.minCount ?? 60)
          }
          if (analysis.genreClassification) {
            setSelectedGenre(analysis.genreClassification.genre?.primary ?? '都市')
            setSelectedTone(analysis.genreClassification.tone?.primary ?? '爽感')
            setSelectedStyle(analysis.genreClassification.style?.primary ?? '电影感')
          }
          if (analysis.paywallCandidates) {
            setFreeEpisodes(analysis.paywallCandidates.recommendedFreeEpisodes ?? 5)
            setHookEpisodes(analysis.paywallCandidates.hookEpisodes ?? [3, 5])
          }
        }
      } catch (err) {
        // Show plan might not exist yet — that's fine
      }
    }

    loadShowPlan()
  }, [open, dramaId])

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.showPlan.update(dramaId, {
        coverage: { start: coverageStart, end: coverageEnd },
        episodeFormat: { count: episodeCount, duration: episodeDuration, format: episodeFormat },
        aspectRatio,
        genreTone: {
          genre: { primary: selectedGenre },
          tone: { primary: selectedTone },
          style: { primary: selectedStyle },
          tags: customTags,
        },
        paywallConfig: { freeEpisodes, hookEpisodes, payStart: freeEpisodes + 1 },
        targetPlatform,
        budgetConstraints: { total: budgetTotal, modelPreference, qualityPriority },
      })
      toast({ title: t('parametersSaved') })
    } catch (err) {
      toast({ title: tc('error'), description: String(err), variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const handleLock = async () => {
    setLocking(true)
    try {
      await handleSave()
      await api.showPlan.lock(dramaId)
      toast({ title: t('showPlanLocked') })
      onOpenChange(false)
      onComplete?.()
    } catch (err) {
      toast({ title: tc('error'), description: String(err), variant: 'destructive' })
    } finally {
      setLocking(false)
    }
  }

  const toggleHook = (ep: number) => {
    setHookEpisodes((prev) =>
      prev.includes(ep) ? prev.filter((e) => e !== ep) : [...prev, ep].sort((a, b) => a - b)
    )
  }

  const toggleCustomTag = (tag: string) => {
    setCustomTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    )
  }

  const steps = [
    { number: 1, label: t('step1Title') },
    { number: 2, label: t('step2Title') },
    { number: 3, label: t('step3Title') },
    { number: 4, label: t('step4Title') },
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {t('title')}
            <Badge variant="outline" className="text-[10px]">
              {t('stepLabel', { current: step, total: 4 })}
            </Badge>
          </DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-1 mb-4">
          {steps.map((s, idx) => (
            <div key={s.number} className="flex items-center gap-1 flex-1">
              <button
                onClick={() => s.number < step && setStep(s.number)}
                className={`
                  flex-1 h-1.5 rounded-full transition-all
                  ${s.number === step ? 'bg-primary' : s.number < step ? 'bg-emerald-500' : 'bg-muted'}
                `}
              />
            </div>
          ))}
        </div>

        {/* Step 1: Coverage + Episode Format */}
        {step === 1 && (
          <div className="space-y-6">
            {/* Coverage */}
            <div className="space-y-3">
              <h3 className="text-sm font-medium">{t('coverageTitle')}</h3>
              <p className="text-xs text-muted-foreground">{t('coverageDesc')}</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs">{t('chapterStart')}</Label>
                  <Input
                    type="number"
                    min={1}
                    value={coverageStart}
                    onChange={(e) => setCoverageStart(Number(e.target.value))}
                    className="h-8 text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs">{t('chapterEnd')}</Label>
                  <Input
                    type="number"
                    min={coverageStart}
                    value={coverageEnd}
                    onChange={(e) => setCoverageEnd(Number(e.target.value))}
                    className="h-8 text-sm"
                  />
                </div>
              </div>
            </div>

            <Separator />

            {/* Episode Format */}
            <div className="space-y-3">
              <h3 className="text-sm font-medium">{t('episodeFormatTitle')}</h3>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label className="text-xs">{t('episodeCount')}</Label>
                  <Input
                    type="number"
                    min={1}
                    value={episodeCount}
                    onChange={(e) => setEpisodeCount(Number(e.target.value))}
                    className="h-8 text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs">{t('episodeDuration')}</Label>
                  <Input
                    type="number"
                    min={30}
                    max={300}
                    value={episodeDuration}
                    onChange={(e) => setEpisodeDuration(Number(e.target.value))}
                    className="h-8 text-sm"
                  />
                  <span className="text-[10px] text-muted-foreground">{t('secondsUnit')}</span>
                </div>
                <div>
                  <Label className="text-xs">{t('formatType')}</Label>
                  <Select value={episodeFormat} onValueChange={setEpisodeFormat}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="vertical">{t('formatVertical')}</SelectItem>
                      <SelectItem value="horizontal">{t('formatHorizontal')}</SelectItem>
                      <SelectItem value="square">{t('formatSquare')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Aspect Ratio + Genre/Tone */}
        {step === 2 && (
          <div className="space-y-6">
            {/* Aspect Ratio */}
            <div className="space-y-3">
              <h3 className="text-sm font-medium">{t('aspectRatioTitle')}</h3>
              <p className="text-xs text-muted-foreground">{t('aspectRatioDesc')}</p>
              <div className="grid grid-cols-3 gap-3">
                <button
                  onClick={() => setAspectRatio('9:16')}
                  className={`
                    flex flex-col items-center gap-2 p-4 rounded-xl border transition-all
                    ${aspectRatio === '9:16' ? 'border-primary bg-primary/5 shadow-sm' : 'border-border/50 hover:border-primary/30'}
                  `}
                >
                  <div className="w-6 h-10 border-2 rounded-sm border-current flex items-center justify-center">
                    <Smartphone className="size-3" />
                  </div>
                  <span className="text-xs font-medium">9:16</span>
                  <span className="text-[10px] text-muted-foreground">{t('verticalShort')}</span>
                </button>
                <button
                  onClick={() => setAspectRatio('16:9')}
                  className={`
                    flex flex-col items-center gap-2 p-4 rounded-xl border transition-all
                    ${aspectRatio === '16:9' ? 'border-primary bg-primary/5 shadow-sm' : 'border-border/50 hover:border-primary/30'}
                  `}
                >
                  <div className="w-10 h-6 border-2 rounded-sm border-current flex items-center justify-center">
                    <Monitor className="size-3" />
                  </div>
                  <span className="text-xs font-medium">16:9</span>
                  <span className="text-[10px] text-muted-foreground">{t('horizontalShort')}</span>
                </button>
                <button
                  onClick={() => setAspectRatio('1:1')}
                  className={`
                    flex flex-col items-center gap-2 p-4 rounded-xl border transition-all
                    ${aspectRatio === '1:1' ? 'border-primary bg-primary/5 shadow-sm' : 'border-border/50 hover:border-primary/30'}
                  `}
                >
                  <div className="w-7 h-7 border-2 rounded-sm border-current flex items-center justify-center">
                    <Square className="size-3" />
                  </div>
                  <span className="text-xs font-medium">1:1</span>
                  <span className="text-[10px] text-muted-foreground">{t('squareShort')}</span>
                </button>
              </div>
            </div>

            <Separator />

            {/* Genre/Tone 4-dimensional tags */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium">{t('genreToneTitle')}</h3>

              {/* Genre dimension */}
              <div>
                <Label className="text-xs mb-1.5 block">{t('genreDimension')}</Label>
                <div className="flex flex-wrap gap-1.5">
                  {GENRE_OPTIONS.map((g) => (
                    <button
                      key={g}
                      onClick={() => setSelectedGenre(g)}
                      className={`
                        px-2.5 py-1 rounded-full text-[11px] transition-all
                        ${selectedGenre === g ? 'bg-primary text-primary-foreground' : 'bg-muted/50 hover:bg-muted text-foreground/70'}
                      `}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tone dimension */}
              <div>
                <Label className="text-xs mb-1.5 block">{t('toneDimension')}</Label>
                <div className="flex flex-wrap gap-1.5">
                  {TONE_OPTIONS.map((tone) => (
                    <button
                      key={tone}
                      onClick={() => setSelectedTone(tone)}
                      className={`
                        px-2.5 py-1 rounded-full text-[11px] transition-all
                        ${selectedTone === tone ? 'bg-primary text-primary-foreground' : 'bg-muted/50 hover:bg-muted text-foreground/70'}
                      `}
                    >
                      {tone}
                    </button>
                  ))}
                </div>
              </div>

              {/* Style dimension */}
              <div>
                <Label className="text-xs mb-1.5 block">{t('styleDimension')}</Label>
                <div className="flex flex-wrap gap-1.5">
                  {STYLE_OPTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => setSelectedStyle(s)}
                      className={`
                        px-2.5 py-1 rounded-full text-[11px] transition-all
                        ${selectedStyle === s ? 'bg-primary text-primary-foreground' : 'bg-muted/50 hover:bg-muted text-foreground/70'}
                      `}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom tags */}
              <div>
                <Label className="text-xs mb-1.5 block">{t('customTags')}</Label>
                <div className="flex flex-wrap gap-1.5">
                  {['逆袭', '打脸', '反转', '甜宠', '复仇', '金手指', '爽文', '虐恋', '双强', '商战'].map((tag) => (
                    <button
                      key={tag}
                      onClick={() => toggleCustomTag(tag)}
                      className={`
                        px-2.5 py-1 rounded-full text-[11px] transition-all
                        ${customTags.includes(tag) ? 'bg-amber-500 text-white' : 'bg-muted/50 hover:bg-muted text-foreground/70'}
                      `}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Platform + Paywall + Budget */}
        {step === 3 && (
          <div className="space-y-6">
            {/* Target Platform */}
            <div className="space-y-3">
              <h3 className="text-sm font-medium">{t('platformTitle')}</h3>
              <Select value={targetPlatform} onValueChange={setTargetPlatform}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PLATFORM_OPTIONS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Separator />

            {/* Paywall Config */}
            <div className="space-y-3">
              <h3 className="text-sm font-medium">{t('paywallTitle')}</h3>
              <p className="text-xs text-muted-foreground">{t('paywallDesc')}</p>

              <div>
                <Label className="text-xs mb-2 block">
                  {t('freeEpisodes')}: {freeEpisodes}
                </Label>
                <Slider
                  value={[freeEpisodes]}
                  onValueChange={([v]) => setFreeEpisodes(v)}
                  min={1}
                  max={Math.min(20, episodeCount)}
                  step={1}
                  className="w-full"
                />
              </div>

              <div>
                <Label className="text-xs mb-2 block">{t('hookEpisodes')}</Label>
                <p className="text-[10px] text-muted-foreground mb-2">{t('hookEpisodesDesc')}</p>
                <div className="flex flex-wrap gap-1.5">
                  {Array.from({ length: Math.min(20, episodeCount) }, (_, i) => i + 1).map((ep) => (
                    <button
                      key={ep}
                      onClick={() => toggleHook(ep)}
                      className={`
                        size-8 rounded-lg text-[11px] font-medium transition-all flex items-center justify-center
                        ${ep <= freeEpisodes
                          ? hookEpisodes.includes(ep)
                            ? 'bg-amber-500 text-white'
                            : 'bg-emerald-500/20 text-emerald-600'
                          : hookEpisodes.includes(ep)
                            ? 'bg-amber-500 text-white'
                            : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                        }
                      `}
                    >
                      {ep}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-4 mt-2 text-[10px]">
                  <span className="flex items-center gap-1">
                    <span className="size-2.5 rounded-full bg-emerald-500/30" />
                    {t('freeLabel')}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="size-2.5 rounded-full bg-amber-500" />
                    {t('hookLabel')}
                  </span>
                </div>
              </div>
            </div>

            <Separator />

            {/* Budget Constraints */}
            <div className="space-y-3">
              <h3 className="text-sm font-medium">{t('budgetTitle')}</h3>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label className="text-xs">{t('budgetTotal')}</Label>
                  <Input
                    type="number"
                    min={0}
                    value={budgetTotal}
                    onChange={(e) => setBudgetTotal(Number(e.target.value))}
                    className="h-8 text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs">{t('modelPreference')}</Label>
                  <Select value={modelPreference} onValueChange={setModelPreference}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="economy">{t('economy')}</SelectItem>
                      <SelectItem value="balanced">{t('balanced')}</SelectItem>
                      <SelectItem value="premium">{t('premium')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">{t('qualityPriority')}</Label>
                  <Select value={qualityPriority} onValueChange={setQualityPriority}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">{t('draftQuality')}</SelectItem>
                      <SelectItem value="standard">{t('standardQuality')}</SelectItem>
                      <SelectItem value="high">{t('highQuality')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Summary Confirmation */}
        {step === 4 && (
          <div className="space-y-4">
            <div className="rounded-xl border p-4 space-y-3 bg-muted/20">
              <h3 className="text-sm font-medium flex items-center gap-2">
                <Check className="size-4 text-emerald-500" />
                {t('summaryTitle')}
              </h3>

              <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('coverageLabel')}</span>
                  <span>{t('chapterRange', { start: coverageStart, end: coverageEnd })}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('episodeCountLabel')}</span>
                  <span>{episodeCount} {tc('episodes')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('durationLabel')}</span>
                  <span>{episodeDuration}{t('secondsUnit')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('formatLabel')}</span>
                  <span>{episodeFormat === 'vertical' ? t('formatVertical') : episodeFormat === 'horizontal' ? t('formatHorizontal') : t('formatSquare')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('aspectRatioLabel')}</span>
                  <span>{aspectRatio}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('genreToneLabel')}</span>
                  <span>{selectedGenre} / {selectedTone} / {selectedStyle}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('platformLabel')}</span>
                  <span>{PLATFORM_OPTIONS.find((p) => p.value === targetPlatform)?.label}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('freeEpLabel')}</span>
                  <span>{freeEpisodes}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('hookEpLabel')}</span>
                  <span>{hookEpisodes.join(', ')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('budgetLabel')}</span>
                  <span>¥{budgetTotal}</span>
                </div>
              </div>

              {customTags.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs text-muted-foreground">{t('tagsLabel')}:</span>
                  {customTags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Lock warning */}
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 flex items-start gap-2">
              <AlertTriangle className="size-4 text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-medium text-amber-600">{t('lockWarningTitle')}</p>
                <p className="text-[10px] text-muted-foreground">{t('lockWarningDesc')}</p>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <DialogFooter className="gap-2 mt-4">
          {step > 1 && (
            <Button variant="outline" size="sm" onClick={() => setStep(step - 1)}>
              <ArrowLeft className="size-3.5 mr-1" />
              {tc('previous')}
            </Button>
          )}
          <div className="flex-1" />
          {step < 4 ? (
            <Button size="sm" onClick={() => setStep(step + 1)}>
              {tc('next')}
              <ArrowRight className="size-3.5 ml-1" />
            </Button>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="size-3.5 animate-spin mr-1" />}
                {t('saveOnly')}
              </Button>
              <Button size="sm" onClick={handleLock} disabled={locking} className="gap-1">
                {locking ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Lock className="size-3.5" />
                )}
                {t('lockPlan')}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
