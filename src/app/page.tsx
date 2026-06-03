import { redirect } from 'next/navigation'
import { routing } from '@/i18n/routing'

// Root page redirects to the default locale.
// The next-intl middleware normally handles this, but having an explicit
// redirect here ensures the root page.tsx is never rendered without i18n.
export default function RootPage() {
  redirect(`/${routing.defaultLocale}`)
}
