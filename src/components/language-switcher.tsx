'use client'

import { useLocale } from 'next-intl'
import { useRouter, usePathname } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Globe } from 'lucide-react'

const LOCALE_LABELS: Record<string, { label: string; flag: string }> = {
  'zh-CN': { label: '中文', flag: '🇨🇳' },
  'en': { label: 'English', flag: '🇺🇸' },
}

export function LanguageSwitcher() {
  const locale = useLocale()
  const router = useRouter()
  const pathname = usePathname()

  const currentLocale = locale || 'zh-CN'
  const currentInfo = LOCALE_LABELS[currentLocale] ?? LOCALE_LABELS['zh-CN']

  const handleLocaleChange = (newLocale: string) => {
    // Replace the locale segment in the current path
    const segments = pathname.split('/')
    if (segments[1] && LOCALE_LABELS[segments[1]]) {
      segments[1] = newLocale
    } else {
      segments.splice(1, 0, newLocale)
    }
    router.replace(segments.join('/'))
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-9" title="Language">
          <Globe className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {Object.entries(LOCALE_LABELS).map(([key, info]) => (
          <DropdownMenuItem
            key={key}
            onClick={() => handleLocaleChange(key)}
            className={currentLocale === key ? 'bg-accent' : ''}
          >
            <span className="mr-2">{info.flag}</span>
            <span>{info.label}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
