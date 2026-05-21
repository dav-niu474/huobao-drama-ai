'use client'

import { CheckCircle2, XCircle, AlertCircle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

// ── Types ────────────────────────────────────────────────────────

export type ResultStatus = 'success' | 'warning' | 'error'

export interface ResultDialogState {
  open: boolean
  status: ResultStatus
  title: string
  description: string
  details?: string[]
  confirmLabel?: string
  /** Optional callback when user confirms — typically to refresh data */
  onConfirm?: () => void
}

export const EMPTY_RESULT_DIALOG: ResultDialogState = {
  open: false,
  status: 'success',
  title: '',
  description: '',
}

// ── Component ────────────────────────────────────────────────────

interface ResultDialogProps {
  state: ResultDialogState
  onClose: () => void
}

export function ResultDialog({ state, onClose }: ResultDialogProps) {
  const {
    status,
    title,
    description,
    details,
    confirmLabel,
  } = state

  const iconMap = {
    success: <CheckCircle2 className="size-10 text-emerald-500" />,
    warning: <AlertCircle className="size-10 text-amber-500" />,
    error: <XCircle className="size-10 text-red-500" />,
  }

  const buttonVariantMap = {
    success: 'default' as const,
    warning: 'default' as const,
    error: 'outline' as const,
  }

  return (
    <Dialog open={state.open} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-md"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <div className="flex flex-col items-center gap-3 pt-2">
            {iconMap[status]}
            <DialogTitle className="text-center text-lg">
              {title}
            </DialogTitle>
          </div>
          <DialogDescription className="text-center pt-1">
            {description}
          </DialogDescription>
        </DialogHeader>

        {details && details.length > 0 && (
          <div className="bg-muted/50 rounded-lg p-3 space-y-1.5">
            {details.map((detail, i) => (
              <p key={i} className="text-xs text-muted-foreground flex items-center gap-1.5">
                <span className="text-primary/60">•</span>
                {detail}
              </p>
            ))}
          </div>
        )}

        <DialogFooter className="sm:justify-center pt-2">
          <Button
            variant={buttonVariantMap[status]}
            onClick={() => {
              state.onConfirm?.()
              onClose()
            }}
            className={status === 'success' ? 'amber-glow min-w-[120px]' : 'min-w-[120px]'}
          >
            {confirmLabel || '确定'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
