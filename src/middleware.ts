import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// ============================================================
// Middleware — API route protection
// Lightweight cookie-based check (no next-auth/jwt import)
// to avoid Edge Runtime compatibility issues
// Checks both HTTP and HTTPS cookie name variants
// ============================================================

export async function middleware(request: NextRequest) {
  const { pathname } = new URL(request.url)

  // Only protect specific API route prefixes
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
  ]

  const isProtected = protectedPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + '/')
  )

  if (isProtected) {
    // Check for NextAuth session token cookie
    // Support both HTTP (next-auth.session-token) and HTTPS (__Secure-next-auth.session-token)
    const sessionToken =
      request.cookies.get('next-auth.session-token')?.value ||
      request.cookies.get('__Secure-next-auth.session-token')?.value

    if (!sessionToken) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }
  }

  return NextResponse.next()
}

export const config = {
  // Only run middleware on API routes, skip page routes entirely
  matcher: '/api/:path*',
}
