'use client'

import { useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { AlertTriangle } from 'lucide-react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const tc = useTranslations('common')

  useEffect(() => {
    console.error('[ErrorBoundary]', error)
  }, [error])

  return (
    <div className="flex-1 flex items-center justify-center p-6 min-h-[60vh]">
      <div className="flex flex-col items-center gap-4 text-center max-w-md">
        <div className="size-16 rounded-full bg-destructive/10 flex items-center justify-center">
          <AlertTriangle className="size-8 text-destructive" />
        </div>
        <h2 className="text-xl font-semibold">{tc('somethingWentWrong')}</h2>
        <p className="text-sm text-muted-foreground">{tc('errorDescription')}</p>
        {error?.message && (
          <p className="text-xs text-muted-foreground/70 font-mono bg-muted/50 px-3 py-1.5 rounded-md max-w-full overflow-hidden text-ellipsis whitespace-nowrap">
            {error.message}
          </p>
        )}
        <Button onClick={reset} className="mt-2">
          {tc('retry')}
        </Button>
      </div>
    </div>
  )
}
