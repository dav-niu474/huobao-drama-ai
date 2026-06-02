import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import createMiddleware from 'next-intl/middleware'
import { routing } from '@/i18n/routing'

// ============================================================
// next-intl middleware for locale detection
// ============================================================
const intlMiddleware = createMiddleware(routing)

// ============================================================
// API route protection — cookie-based auth check
// ============================================================
const protectedPrefixes = [
  '/api/dramas',
  '/api/episodes',
  '/api/characters',
  '/api/scenes',
  '/api/storyboards',
  '/api/ai/',
  '/api/agent/',
  '/api/agents',
  '/api/settings',
  '/api/upload',
  '/api/auth/profile',
  '/api/auth/users',
  '/api/series',
]

function isApiProtected(pathname: string): boolean {
  return protectedPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + '/')
  )
}

export async function middleware(request: NextRequest) {
  const { pathname } = new URL(request.url)

  // API routes: only auth protection, no locale handling
  if (pathname.startsWith('/api/')) {
    if (isApiProtected(pathname)) {
      const sessionToken =
        request.cookies.get('next-auth.session-token')?.value ||
        request.cookies.get('__Secure-next-auth.session-token')?.value

      if (!sessionToken) {
        return NextResponse.json({ error: '未登录' }, { status: 401 })
      }
    }
    return NextResponse.next()
  }

  // Static files, _next, etc. — skip locale
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/static') ||
    pathname.includes('.') // static file with extension
  ) {
    return NextResponse.next()
  }

  // Page routes: handle locale via next-intl
  return intlMiddleware(request)
}

export const config = {
  matcher: ['/', '/(zh-CN|en)/:path*', '/api/:path*'],
}
