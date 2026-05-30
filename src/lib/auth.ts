import type { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { db } from '@/lib/db'

// Re-export permissions from the client-safe module
export { ROLE_PERMISSIONS, canCreateProject, canUseAiGeneration, getPermissions } from './permissions'
export type { UserRole } from './permissions'

// ============================================================
// NextAuth v4 Configuration — Credentials + JWT strategy
// Works with both SQLite (local) and PostgreSQL (Vercel)
//
// Key design decisions for Vercel:
//   1. useSecureCookies=false — Vercel terminates SSL at CDN,
//      the internal connection is HTTP. Non-secure cookies work
//      because the browser sends them over HTTPS to the CDN,
//      and Vercel forwards them to the server.
//   2. NEXTAUTH_SECRET auto-fallback — prevents hard crash on
//      misconfigured deployments.
// ============================================================

/**
 * Ensure NEXTAUTH_SECRET exists.
 * - If set in env: use it (normal case)
 * - If missing in production: generate temporary one + log FATAL warning
 * - If missing in development: generate stable one for consistent sessions
 */
function ensureNextAuthSecret(): string {
  const existing = process.env.NEXTAUTH_SECRET
  if (existing && existing.trim() !== '' && existing.trim() !== 'change-this-to-a-random-secret-in-production') {
    return existing.trim()
  }

  // In production, NEXTAUTH_SECRET is REQUIRED
  if (process.env.NODE_ENV === 'production') {
    console.error(
      '[auth] FATAL: NEXTAUTH_SECRET is not set or is still the default value. ' +
      'Generate one with: openssl rand -base64 32 ' +
      'Then set it in your Vercel project Settings > Environment Variables.'
    )
    // Generate a temporary one so the server doesn't crash immediately,
    // but sessions will be invalid after each serverless function cold start
    const tempSecret = crypto.randomBytes(32).toString('base64')
    console.warn('[auth] Using auto-generated NEXTAUTH_SECRET (sessions will be lost on cold start!)')
    process.env.NEXTAUTH_SECRET = tempSecret
    return tempSecret
  }

  // In development, generate a stable secret so sessions survive dev server restarts
  const stableSecret = crypto
    .createHash('sha256')
    .update('huobao-drama-ai-dev-secret')
    .digest('base64')
  console.warn(
    '[auth] NEXTAUTH_SECRET not set, using stable dev secret. ' +
    'Set NEXTAUTH_SECRET in .env for production deployments.'
  )
  process.env.NEXTAUTH_SECRET = stableSecret
  return stableSecret
}

// Initialize secret before creating authOptions
ensureNextAuthSecret()

export const authOptions: NextAuthOptions = {
  // Vercel terminates SSL at the CDN edge. The internal connection
  // between Vercel's CDN and the Next.js serverless function is HTTP.
  // Therefore, useSecureCookies must be false — the server doesn't
  // see an HTTPS connection, and secure cookies wouldn't be set.
  //
  // This is safe because:
  // - The browser connects to Vercel via HTTPS
  // - The browser sends both secure and non-secure cookies over HTTPS
  // - Vercel's CDN forwards all cookies to the serverless function
  //
  // Setting useSecureCookies=true would BREAK Vercel deployments
  // because the serverless function would try to set Secure cookies
  // over an internal HTTP connection.
  useSecureCookies: false,

  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: '邮箱', type: 'email', placeholder: 'your@email.com' },
        password: { label: '密码', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null
        }

        try {
          const user = await db.user.findUnique({
            where: { email: credentials.email },
          })

          if (!user) {
            return null
          }

          if (!user.isActive) {
            return null
          }

          const isValid = await bcrypt.compare(credentials.password, user.password)
          if (!isValid) {
            return null
          }

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            avatar: user.avatar,
          }
        } catch (error) {
          // Log database errors but don't expose them to the client
          console.error('[auth] authorize() error:', error instanceof Error ? error.message : error)
          return null
        }
      },
    }),
  ],

  session: {
    strategy: 'jwt',
    maxAge: 7 * 24 * 60 * 60, // 7 days
  },

  jwt: {
    maxAge: 7 * 24 * 60 * 60, // 7 days
  },

  cookies: {
    sessionToken: {
      name: 'next-auth.session-token',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: false,
      },
    },
    callbackUrl: {
      name: 'next-auth.callback-url',
      options: {
        httpOnly: false,
        sameSite: 'lax',
        path: '/',
        secure: false,
      },
    },
    csrfToken: {
      name: 'next-auth.csrf-token',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: false,
      },
    },
  },

  callbacks: {
    async redirect({ url, baseUrl }) {
      // In proxied environments (like Vercel), baseUrl may be wrong
      // (e.g., http://localhost:3000 instead of the actual domain).
      // We handle this by trusting the url parameter.
      if (url.startsWith('/')) return url

      try {
        const parsedUrl = new URL(url)
        // Keep the full URL — it contains the correct host from the browser
        return url
      } catch {
        return baseUrl
      }
    },

    async jwt({ token, user, trigger, session }) {
      // Initial sign in — add user info to token
      if (user) {
        token.id = user.id
        token.role = (user as any).role
        token.avatar = (user as any).avatar
      }

      // Update session (e.g., when user updates profile)
      if (trigger === 'update' && session) {
        token.name = session.name ?? token.name
        token.role = session.role ?? token.role
        token.avatar = session.avatar ?? token.avatar
      }

      return token
    },

    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id
        ;(session.user as any).role = token.role
        ;(session.user as any).avatar = token.avatar
      }
      return session
    },
  },

  pages: {
    // Use our custom login page instead of NextAuth's default error page.
    // This prevents the "Server error" page from showing to users.
    signIn: '/',
    error: '/',
  },

  debug: process.env.NODE_ENV === 'development',
}
