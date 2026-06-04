'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { AlertTriangle } from 'lucide-react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[GlobalError]', error)
  }, [error])

  return (
    <html lang="zh-CN" className="dark">
      <body className="bg-background text-foreground antialiased">
        <div className="flex items-center justify-center min-h-screen p-6">
          <div className="flex flex-col items-center gap-4 text-center max-w-md">
            <div className="size-16 rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertTriangle className="size-8 text-destructive" />
            </div>
            <h2 className="text-xl font-semibold">出了点问题</h2>
            <p className="text-sm text-muted-foreground">页面遇到了一个错误，请尝试重试。</p>
            {error?.message && (
              <p className="text-xs text-muted-foreground/70 font-mono bg-muted/50 px-3 py-1.5 rounded-md max-w-full overflow-hidden text-ellipsis whitespace-nowrap">
                {error.message}
              </p>
            )}
            <Button onClick={reset} className="mt-2">
              重试
            </Button>
          </div>
        </div>
      </body>
    </html>
  )
}
