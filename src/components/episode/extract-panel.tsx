'use client'

import { useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  Sparkles,
  Users,
  RefreshCw,
  MapPin,
  UserCircle,
  Clock,
  Copy,
  Check,
  PencilLine,
  Info,
  Package,
  BookmarkPlus,
  Loader2,
  Lock,
  Unlock,
  Eye,
  Download,
  Globe,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { AgentExecutionPanel } from '@/components/agent-execution-panel'
import { statusBadge } from './helpers'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import type { ExtractPanelProps } from './types'

// ── Inline editable field ────────────────────────────────────

function InlineField({
  label,
  value,
  fieldId,
  charId,
  sceneId,
  copiedField,
  handleCopy,
  onUpdate,
  multiline = false,
}: {
  label: string
  value: string
  fieldId: string
  charId?: string
  sceneId?: string
  copiedField: string | null
  handleCopy: (text: string, fieldId: string) => Promise<void>
  onUpdate?: (id: string, field: string, val: string) => void
  multiline?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  const handleStartEdit = useCallback(() => {
    setDraft(value)
    setEditing(true)
  }, [value])

  const handleFinishEdit = useCallback(() => {
    setEditing(false)
    if (draft !== value && onUpdate) {
      if (charId) onUpdate(charId, fieldId, draft)
      if (sceneId) onUpdate(sceneId, fieldId, draft)
    }
  }, [draft, value, onUpdate, charId, sceneId, fieldId])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleFinishEdit()
      }
      if (e.key === 'Escape') {
        setDraft(value)
        setEditing(false)
      }
    },
    [handleFinishEdit, value]
  )

  const isCopied = copiedField === fieldId

  return (
    <div className="group/field">
      <div className="flex items-center gap-1.5 mb-0.5">
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
          {label}
        </span>
        <div className="flex items-center gap-0.5 opacity-0 group-hover/field:opacity-100 transition-opacity">
          {value && (
            <Button
              size="sm"
              variant="ghost"
              className="size-5 p-0"
              onClick={() => handleCopy(value, fieldId)}
            >
              {isCopied ? (
                <Check className="size-3 text-emerald-500" />
              ) : (
                <Copy className="size-3" />
              )}
            </Button>
          )}
          {onUpdate && !editing && (
            <Button
              size="sm"
              variant="ghost"
              className="size-5 p-0"
              onClick={handleStartEdit}
            >
              <PencilLine className="size-3" />
            </Button>
          )}
        </div>
      </div>
      {editing ? (
        multiline ? (
          <textarea
            className="w-full text-xs bg-muted/50 border border-border rounded-md px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-primary min-h-[60px]"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={handleFinishEdit}
            onKeyDown={handleKeyDown}
            autoFocus
          />
        ) : (
          <input
            className="w-full text-xs bg-muted/50 border border-border rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={handleFinishEdit}
            onKeyDown={handleKeyDown}
            autoFocus
          />
        )
      ) : (
        <p className={`text-xs ${value ? 'text-foreground' : 'text-muted-foreground/60 italic'}`}>
          {value || '—'}
        </p>
      )}
    </div>
  )
}

// ── Role label helper ────────────────────────────────────────

function roleLabel(role: string): string {
  const map: Record<string, string> = {
    protagonist: '主角',
    antagonist: '反派',
    supporting: '配角',
  }
  return map[role] ?? role
}

// ── Gender label helper ──────────────────────────────────────

function genderLabel(gender: string): string {
  const map: Record<string, string> = {
    male: '男',
    female: '女',
    other: '其他',
  }
  return map[gender] ?? gender
}

// ── Main ExtractPanel component ──────────────────────────────

export function ExtractPanel({
  characters,
  scenes,
  props,
  aiLoading,
  isExtracting,
  episode,
  agentExec,
  copiedField,
  handleExtract,
  handleCopy,
  onUpdateCharacter,
  onUpdateScene,
  onUpdateProp,
  // PR-F: Global asset import props
  globalAssetsImported,
  importingAssets,
  onReimportGlobalAssets,
}: ExtractPanelProps) {
  const { toast } = useToast()
  const [savingToLibrary, setSavingToLibrary] = useState<string | null>(null)
  const [lockingStyle, setLockingStyle] = useState<string | null>(null)

  // Save entity to asset library
  const handleSaveToLibrary = async (type: 'character' | 'scene' | 'prop', id: string, name: string) => {
    const key = `${type}-${id}`
    setSavingToLibrary(key)
    try {
      await api.assets.create({
        name,
        category: type,
        sourceType: type,
        sourceId: id,
      })
      toast({ title: '已保存到资产库', description: `「${name}」已添加为可复用模板` })
    } catch (err: any) {
      toast({ title: '保存失败', description: err.message, variant: 'destructive' })
    } finally {
      setSavingToLibrary(null)
    }
  }

  // Toggle character style lock
  const handleToggleCharacterStyleLock = async (char: any) => {
    setLockingStyle(char.id)
    try {
      if (char.styleLock) {
        await api.ai.unlockCharacterStyle(char.id)
        toast({ title: '风格已解锁', description: `「${char.name}」的形象风格不再锁定` })
      } else {
        const result = await api.ai.lockCharacterStyle(char.id)
        toast({
          title: '风格已锁定',
          description: `「${char.name}」的形象已锁定，后续生成将保持一致性`,
        })
      }
      // Refresh data if callback available
      if (onUpdateCharacter) {
        onUpdateCharacter(char.id, 'styleLock', String(!char.styleLock))
      }
    } catch (err: any) {
      toast({ title: '操作失败', description: err.message, variant: 'destructive' })
    } finally {
      setLockingStyle(null)
    }
  }

  // Toggle scene style lock
  const handleToggleSceneStyleLock = async (scene: any) => {
    setLockingStyle(scene.id)
    try {
      if (scene.styleLock) {
        await api.ai.unlockSceneStyle(scene.id)
        toast({ title: '场景风格已解锁', description: `「${scene.location}」的场景风格不再锁定` })
      } else {
        await api.ai.lockSceneStyle(scene.id)
        toast({
          title: '场景风格已锁定',
          description: `「${scene.location}」的场景已锁定，后续生成将保持一致性`,
        })
      }
      if (onUpdateScene) {
        onUpdateScene(scene.id, 'styleLock', String(!scene.styleLock))
      }
    } catch (err: any) {
      toast({ title: '操作失败', description: err.message, variant: 'destructive' })
    } finally {
      setLockingStyle(null)
    }
  }
  // ── Empty state ──────────────────────────────────────────
  if (characters.length === 0 && scenes.length === 0 && props.length === 0 && !isExtracting && !aiLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center max-w-md"
        >
          <div className="mx-auto size-16 rounded-full bg-primary/10 flex items-center justify-center mb-5">
            <Users className="size-8 text-primary" />
          </div>
          <h2 className="text-lg font-semibold mb-2">提取角色与场景</h2>
          <p className="text-sm text-muted-foreground mb-6">
            AI将从剧本中提取角色信息和场景描述，用于后续分镜制作
          </p>
          {/* PR-F: Import global assets button if available */}
          {globalAssetsImported === false && onReimportGlobalAssets && (
            <div className="mb-4">
              <Button
                variant="outline"
                onClick={onReimportGlobalAssets}
                disabled={importingAssets}
                className="text-primary border-primary/30 hover:bg-primary/5"
              >
                {importingAssets ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
                导入全局素材
              </Button>
              <p className="text-xs text-muted-foreground mt-2">从素材工作台导入已有的角色和场景</p>
            </div>
          )}
          <Button
            onClick={handleExtract}
            disabled={aiLoading}
            className="amber-glow"
          >
            <Sparkles className="size-4" />
            开始提取
          </Button>
        </motion.div>
      </div>
    )
  }

  // ── Loading state — show Agent Execution Panel ──────────
  if (isExtracting || aiLoading) {
    return (
      <div className="flex-1 p-6 overflow-y-auto">
        <AgentExecutionPanel
          agentType="extractor"
          agentName="角色场景提取器"
          isRunning={agentExec.isRunning('extractor')}
          logs={agentExec.logs['extractor'] || []}
          resultText={agentExec.resultTexts['extractor']}
          duration={agentExec.durations['extractor']}
          error={agentExec.errors['extractor']}
        />
      </div>
    )
  }

  // ── Content exists ──────────────────────────────────────
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border/50">
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono text-primary/80">03</span>
          <h2 className="text-sm font-semibold">提取角色与场景</h2>
          {episode?.extractStatus && statusBadge(episode.extractStatus)}
          {/* PR-F: Global assets imported badge */}
          {globalAssetsImported && (
            <Badge variant="secondary" className="text-[10px] gap-1 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
              <Globe className="size-3" />
              使用全局素材
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* PR-F: Re-import Global Assets button */}
          {onReimportGlobalAssets && (
            <Button
              size="sm"
              variant="outline"
              onClick={onReimportGlobalAssets}
              disabled={importingAssets}
              className="text-primary border-primary/30 hover:bg-primary/5"
            >
              {importingAssets ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
              重新导入全局
            </Button>
          )}
          {/* PR-F: Supplement with AI button */}
          {globalAssetsImported && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleExtract}
              disabled={aiLoading || isExtracting}
              className="text-amber-600 border-amber-300 hover:bg-amber-50 dark:text-amber-400 dark:border-amber-700 dark:hover:bg-amber-950/30"
            >
              <Sparkles className="size-3.5" />
              AI补充提取
            </Button>
          )}
          {!globalAssetsImported && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleExtract}
              disabled={aiLoading || isExtracting}
            >
              <RefreshCw className="size-3.5" />
              重新提取
            </Button>
          )}
        </div>
      </div>

      {/* Results */}
      <ScrollArea className="flex-1">
        <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* ── Characters column ────────────────────────── */}
          <div>
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <UserCircle className="size-4 text-primary" />
              角色列表
              <Badge variant="secondary" className="text-[10px]">
                {characters.length}
              </Badge>
            </h3>
            <div className="space-y-3">
              {characters.map((char) => (
                <Card key={char.id} className="border-border/50 py-0 gap-0">
                  <CardContent className="p-4">
                    <div className="flex flex-col gap-2.5">
                      {/* Name + badges + style lock row */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">{char.name}</span>
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                          {roleLabel(char.role)}
                        </Badge>
                        {char.gender && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            {genderLabel(char.gender)}
                          </Badge>
                        )}
                        {/* Style Lock Button */}
                        <Button
                          size="sm"
                          variant={char.styleLock ? 'default' : 'ghost'}
                          className={`size-6 p-0 ${char.styleLock ? 'bg-amber-500 hover:bg-amber-600 text-white' : 'text-muted-foreground hover:text-amber-500'}`}
                          disabled={lockingStyle === char.id}
                          onClick={() => handleToggleCharacterStyleLock(char)}
                          title={char.styleLock ? '解锁风格 — 角色形象将不再强制一致' : '锁定风格 — 后续生成将保持角色形象一致'}
                        >
                          {lockingStyle === char.id ? (
                            <Loader2 className="size-3 animate-spin" />
                          ) : char.styleLock ? (
                            <Lock className="size-3" />
                          ) : (
                            <Unlock className="size-3" />
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="size-6 p-0 ml-auto text-muted-foreground hover:text-primary"
                          disabled={savingToLibrary === `character-${char.id}`}
                          onClick={() => handleSaveToLibrary('character', char.id, char.name)}
                          title="保存到资产库"
                        >
                          {savingToLibrary === `character-${char.id}` ? (
                            <Loader2 className="size-3 animate-spin" />
                          ) : (
                            <BookmarkPlus className="size-3" />
                          )}
                        </Button>
                      </div>

                      {/* Visual fingerprint summary when locked */}
                      {char.styleLock && char.visualFingerprint && (() => {
                        try {
                          const fp = typeof char.visualFingerprint === 'string' ? JSON.parse(char.visualFingerprint) : char.visualFingerprint
                          if (fp && Object.keys(fp).length > 0) {
                            return (
                              <div className="rounded-md bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-800/40 px-2.5 py-1.5">
                                <div className="flex items-center gap-1 mb-0.5">
                                  <Eye className="size-3 text-amber-600 dark:text-amber-400" />
                                  <span className="text-[10px] font-medium text-amber-700 dark:text-amber-300 uppercase tracking-wide">
                                    视觉指纹
                                  </span>
                                </div>
                                <p className="text-[10px] text-amber-800/80 dark:text-amber-400/70 leading-relaxed">
                                  {fp.overall || [fp.hair, fp.eyes, fp.face, fp.clothing].filter(Boolean).join(' · ')}
                                </p>
                              </div>
                            )
                          }
                        } catch {}
                        return null
                      })()}

                      {/* Appearance — with copy button prominently visible */}
                      {char.appearance && (
                        <div className="rounded-md bg-muted/40 px-3 py-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide block mb-0.5">
                                外貌描述
                              </span>
                              <p className="text-xs text-foreground leading-relaxed">
                                {char.appearance}
                              </p>
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="size-7 p-0 flex-shrink-0"
                              onClick={() => handleCopy(char.appearance, `char-appearance-${char.id}`)}
                            >
                              {copiedField === `char-appearance-${char.id}` ? (
                                <Check className="size-3.5 text-emerald-500" />
                              ) : (
                                <Copy className="size-3.5 text-muted-foreground" />
                              )}
                            </Button>
                          </div>
                        </div>
                      )}

                      {/* Personality */}
                      <InlineField
                        label="性格"
                        value={char.personality}
                        fieldId={`char-personality-${char.id}`}
                        charId={char.id}
                        copiedField={copiedField}
                        handleCopy={handleCopy}
                        onUpdate={onUpdateCharacter}
                        multiline
                      />

                      {/* Image Prompt — 形象设计描述提示词 */}
                      {char.imagePrompt ? (
                        <div className="rounded-md bg-primary/5 border border-primary/10 px-3 py-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <span className="text-[10px] font-medium text-primary/70 uppercase tracking-wide block mb-0.5">
                                形象提示词
                              </span>
                              <p className="text-xs text-foreground leading-relaxed">
                                {char.imagePrompt}
                              </p>
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="size-7 p-0 flex-shrink-0"
                              onClick={() => handleCopy(char.imagePrompt!, `char-imagePrompt-${char.id}`)}
                            >
                              {copiedField === `char-imagePrompt-${char.id}` ? (
                                <Check className="size-3.5 text-emerald-500" />
                              ) : (
                                <Copy className="size-3.5 text-muted-foreground" />
                              )}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <InlineField
                          label="形象提示词"
                          value=""
                          fieldId={`char-imagePrompt-${char.id}`}
                          charId={char.id}
                          copiedField={copiedField}
                          handleCopy={handleCopy}
                          onUpdate={onUpdateCharacter}
                          multiline
                        />
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
              {characters.length === 0 && (
                <p className="text-xs text-muted-foreground py-4 text-center">暂无角色</p>
              )}
            </div>
          </div>

          {/* ── Scenes column ────────────────────────────── */}
          <div>
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <MapPin className="size-4 text-primary" />
              场景列表
              <Badge variant="secondary" className="text-[10px]">
                {scenes.length}
              </Badge>
            </h3>
            <div className="space-y-3">
              {scenes.map((scene) => (
                <Card key={scene.id} className="border-border/50 py-0 gap-0">
                  <CardContent className="p-4">
                    <div className="flex flex-col gap-2.5">
                      {/* Location + timeOfDay + style lock row */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">{scene.location}</span>
                        {scene.timeOfDay && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            <Clock className="size-2.5 mr-1" />
                            {scene.timeOfDay}
                          </Badge>
                        )}
                        {/* Style Lock Button */}
                        <Button
                          size="sm"
                          variant={scene.styleLock ? 'default' : 'ghost'}
                          className={`size-6 p-0 ${scene.styleLock ? 'bg-amber-500 hover:bg-amber-600 text-white' : 'text-muted-foreground hover:text-amber-500'}`}
                          disabled={lockingStyle === scene.id}
                          onClick={() => handleToggleSceneStyleLock(scene)}
                          title={scene.styleLock ? '解锁场景风格 — 场景将不再强制一致' : '锁定场景风格 — 后续生成将保持场景风格一致'}
                        >
                          {lockingStyle === scene.id ? (
                            <Loader2 className="size-3 animate-spin" />
                          ) : scene.styleLock ? (
                            <Lock className="size-3" />
                          ) : (
                            <Unlock className="size-3" />
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="size-6 p-0 ml-auto text-muted-foreground hover:text-primary"
                          disabled={savingToLibrary === `scene-${scene.id}`}
                          onClick={() => handleSaveToLibrary('scene', scene.id, scene.location)}
                          title="保存到资产库"
                        >
                          {savingToLibrary === `scene-${scene.id}` ? (
                            <Loader2 className="size-3 animate-spin" />
                          ) : (
                            <BookmarkPlus className="size-3" />
                          )}
                        </Button>
                      </div>

                      {/* Description */}
                      <InlineField
                        label="描述"
                        value={scene.description}
                        fieldId={`scene-description-${scene.id}`}
                        sceneId={scene.id}
                        copiedField={copiedField}
                        handleCopy={handleCopy}
                        onUpdate={onUpdateScene}
                        multiline
                      />

                      {/* Prompt — with copy button prominently visible */}
                      {scene.prompt && (
                        <div className="rounded-md bg-muted/40 px-3 py-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide block mb-0.5">
                                场景提示词
                              </span>
                              <p className="text-xs text-foreground leading-relaxed">
                                {scene.prompt}
                              </p>
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="size-7 p-0 flex-shrink-0"
                              onClick={() => handleCopy(scene.prompt, `scene-prompt-${scene.id}`)}
                            >
                              {copiedField === `scene-prompt-${scene.id}` ? (
                                <Check className="size-3.5 text-emerald-500" />
                              ) : (
                                <Copy className="size-3.5 text-muted-foreground" />
                              )}
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
              {scenes.length === 0 && (
                <p className="text-xs text-muted-foreground py-4 text-center">暂无场景</p>
              )}
            </div>
          </div>

          {/* ── Props column ────────────────────────────── */}
          <div>
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Package className="size-4 text-primary" />
              道具列表
              <Badge variant="secondary" className="text-[10px]">
                {props.length}
              </Badge>
            </h3>
            <div className="space-y-3">
              {props.map((prop) => (
                <Card key={prop.id} className="border-border/50 py-0 gap-0">
                  <CardContent className="p-4">
                    <div className="flex flex-col gap-2.5">
                      {/* Name + category row */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">{prop.name}</span>
                        {prop.category && prop.category !== 'other' && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            {prop.category}
                          </Badge>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="size-6 p-0 ml-auto text-muted-foreground hover:text-primary"
                          disabled={savingToLibrary === `prop-${prop.id}`}
                          onClick={() => handleSaveToLibrary('prop', prop.id, prop.name)}
                          title="保存到资产库"
                        >
                          {savingToLibrary === `prop-${prop.id}` ? (
                            <Loader2 className="size-3 animate-spin" />
                          ) : (
                            <BookmarkPlus className="size-3" />
                          )}
                        </Button>
                      </div>

                      {/* Description */}
                      <InlineField
                        label="描述"
                        value={prop.description}
                        fieldId={`prop-description-${prop.id}`}
                        charId={prop.id}
                        copiedField={copiedField}
                        handleCopy={handleCopy}
                        onUpdate={onUpdateProp}
                        multiline
                      />

                      {/* Image Prompt — with copy button */}
                      {prop.imagePrompt && (
                        <div className="rounded-md bg-primary/5 border border-primary/10 px-3 py-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <span className="text-[10px] font-medium text-primary/70 uppercase tracking-wide block mb-0.5">
                                道具提示词
                              </span>
                              <p className="text-xs text-foreground leading-relaxed">
                                {prop.imagePrompt}
                              </p>
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="size-7 p-0 flex-shrink-0"
                              onClick={() => handleCopy(prop.imagePrompt!, `prop-imagePrompt-${prop.id}`)}
                            >
                              {copiedField === `prop-imagePrompt-${prop.id}` ? (
                                <Check className="size-3.5 text-emerald-500" />
                              ) : (
                                <Copy className="size-3.5 text-muted-foreground" />
                              )}
                            </Button>
                          </div>
                        </div>
                      )}

                      {/* Prop Image */}
                      {prop.imageUrl && (
                        <div className="rounded-md overflow-hidden border border-border/50">
                          <img
                            src={prop.imageUrl}
                            alt={prop.name}
                            className="w-full h-24 object-cover"
                          />
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
              {props.length === 0 && (
                <p className="text-xs text-muted-foreground py-4 text-center">暂无道具</p>
              )}
            </div>
          </div>
        </div>

        {/* ── Hint section at bottom ──────────────────────── */}
        <div className="px-6 pb-6">
          <div className="rounded-lg border border-amber-200/60 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-800/40 px-4 py-3">
            <div className="flex items-start gap-2.5">
              <Info className="size-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-medium text-amber-800 dark:text-amber-300 mb-1">
                  角色描述可复制用于AI生图
                </p>
                <p className="text-xs text-amber-700/80 dark:text-amber-400/70 leading-relaxed">
                  角色外貌描述和场景提示词已入库，可在「制作」阶段批量生成图片，也可复制提示词到外部工具生成后上传。
                </p>
              </div>
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  )
}
