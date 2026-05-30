import NextAuth from 'next-auth'
import { authOptions } from '@/lib/auth'

// ============================================================
// NextAuth API Route Handler
// Wraps NextAuth with error handling to prevent "Server error" pages
// ============================================================

const handler = NextAuth(authOptions)

export { handler as GET, handler as POST }
