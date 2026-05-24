'use client'

import { motion } from 'framer-motion'
import { Loader2, Sparkles, RefreshCw, Download, BookOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { AgentExecutionPanel } from '@/components/agent-execution-panel'
import { statusBadge } from './helpers'
import type { ScriptPanelProps } from './types'

export function ScriptPanel({
  rawContent,
  setRawContent,
  scriptContent,
  setScriptContent,
  saving,
  aiLoading,
  isRewriting,
  episode,
  agentExec,
  activeStep,
  handleSaveRaw,
  handleSaveScript,
  handleRewrite,
  handleSkipRewrite,
  // PR-F: Global asset import props
  hasGlobalAssets,
  globalAssetsImported,
  importingAssets,
  onImportGlobalAssets,
  onImportFromScriptWorkbench,
}: ScriptPanelProps) {
  // ── Determine source info ──
  const hasSourceChapterIds = (() => {
    try {
      const ids = JSON.parse(episode?.sourceChapterIds || '[]')
      return Array.isArray(ids) && ids.length > 0
    } catch {
      return false
    }
  })()

  // ── Raw content panel ──────────────────────────────────────

  if (activeStep === 'raw') {
    return (
      <div className="flex flex-col h-full">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-border/50">
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono text-primary/80">01</span>
            <h2 className="text-sm font-semibold">原始内容</h2>
            {/* Source info badge */}
            {hasSourceChapterIds && (
              <Badge variant="secondary" className="text-[10px] gap-1 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                <BookOpen className="size-3" />
                来自剧本工作台
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Import from Script Workbench button */}
            {hasSourceChapterIds && !rawContent.trim() && onImportFromScriptWorkbench && (
              <Button
                size="sm"
                variant="outline"
                onClick={onImportFromScriptWorkbench}
                disabled={importingAssets}
                className="text-emerald-600 border-emerald-300 hover:bg-emerald-50 dark:text-emerald-400 dark:border-emerald-700 dark:hover:bg-emerald-950/30"
              >
                {importingAssets ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
                从剧本工作台导入
              </Button>
            )}
            {/* Import Global Assets button */}
            {hasGlobalAssets && !globalAssetsImported && onImportGlobalAssets && (
              <Button
                size="sm"
                variant="outline"
                onClick={onImportGlobalAssets}
                disabled={importingAssets}
                className="text-primary border-primary/30 hover:bg-primary/5"
              >
                {importingAssets ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
                导入全局素材
              </Button>
            )}
            {globalAssetsImported && (
              <Badge variant="secondary" className="text-[10px] bg-primary/10 text-primary">
                全局素材已导入
              </Badge>
            )}
            <span className="text-xs text-muted-foreground">{rawContent.length} 字</span>
            <Button size="sm" onClick={handleSaveRaw} disabled={saving || !rawContent.trim()}>
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : null}
              保存
            </Button>
          </div>
        </div>

        {/* Text area */}
        <div className="flex-1 p-6">
          {rawContent.trim() || true ? (
            <Textarea
              className="h-full min-h-[60vh] resize-none bg-muted/30 border-border/50 focus-visible:ring-primary/30 text-sm leading-relaxed"
              placeholder="粘贴小说原文、故事大纲或分镜描述..."
              value={rawContent}
              onChange={(e) => setRawContent(e.target.value)}
              onBlur={rawContent.trim() ? handleSaveRaw : undefined}
            />
          ) : null}
        </div>
      </div>
    )
  }

  // ── AI Rewrite panel ───────────────────────────────────────

  // No script content and not loading → empty state
  if (!scriptContent.trim() && !isRewriting && !aiLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center max-w-md"
        >
          <div className="mx-auto size-16 rounded-full bg-primary/10 flex items-center justify-center mb-5">
            <Sparkles className="size-8 text-primary" />
          </div>
          <h2 className="text-lg font-semibold mb-2">AI改写剧本</h2>
          <p className="text-sm text-muted-foreground mb-6">
            AI将把原始内容改写为标准剧本格式，包含场景描述、对白和动作指示
          </p>
          <div className="flex gap-3 justify-center">
            <Button
              onClick={handleRewrite}
              disabled={!rawContent.trim() || aiLoading}
              className="amber-glow"
            >
              <Sparkles className="size-4" />
              开始改写
            </Button>
            <Button variant="outline" onClick={handleSkipRewrite} disabled={!rawContent.trim()}>
              跳过改写
            </Button>
          </div>
          {!rawContent.trim() && (
            <p className="text-xs text-muted-foreground mt-4">请先在「原始内容」中填写内容</p>
          )}
        </motion.div>
      </div>
    )
  }

  // Loading state — show Agent Execution Panel
  if (isRewriting || (aiLoading && activeStep === 'rewrite')) {
    return (
      <div className="flex-1 p-6 overflow-y-auto">
        <AgentExecutionPanel
          agentType="script_rewriter"
          agentName="剧本改写专家"
          isRunning={agentExec.isRunning('script_rewriter')}
          logs={agentExec.logs['script_rewriter'] || []}
          resultText={agentExec.resultTexts['script_rewriter']}
          duration={agentExec.durations['script_rewriter']}
          error={agentExec.errors['script_rewriter']}
        />
      </div>
    )
  }

  // Content exists → editable textarea
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-3 border-b border-border/50">
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono text-primary/80">02</span>
          <h2 className="text-sm font-semibold">AI改写</h2>
          {episode?.scriptStatus && statusBadge(episode.scriptStatus)}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">{scriptContent.length} 字</span>
          <Button
            size="sm"
            variant="outline"
            onClick={handleRewrite}
            disabled={aiLoading || isRewriting}
          >
            <RefreshCw className="size-3.5" />
            重新改写
          </Button>
          <Button size="sm" onClick={handleSaveScript} disabled={saving}>
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : null}
            保存
          </Button>
        </div>
      </div>
      <div className="flex-1 p-6">
        <Textarea
          className="h-full min-h-[60vh] resize-none bg-muted/30 border-border/50 focus-visible:ring-primary/30 text-sm leading-relaxed font-mono"
          value={scriptContent}
          onChange={(e) => setScriptContent(e.target.value)}
        />
      </div>
    </div>
  )
}
