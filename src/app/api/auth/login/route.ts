import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'

// ============================================================
// POST /api/auth/login — Validate credentials
// Returns user info on success; client then calls signIn()
// This avoids NextAuth redirect issues in proxied environments
// ============================================================

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, password } = body

    if (!email || !password) {
      return NextResponse.json({ error: '请输入邮箱和密码' }, { status: 400 })
    }

    // Find user
    const user = await db.user.findUnique({ where: { email } })
    if (!user) {
      return NextResponse.json({ error: '邮箱或密码错误' }, { status: 401 })
    }

    if (!user.isActive) {
      return NextResponse.json({ error: '账号已被禁用' }, { status: 403 })
    }

    // Verify password
    const isValid = await bcrypt.compare(password, user.password)
    if (!isValid) {
      return NextResponse.json({ error: '邮箱或密码错误' }, { status: 401 })
    }

    // Return user info
    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        avatar: user.avatar,
      },
    })
  } catch (error: any) {
    console.error('[auth/login] Error:', error)
    return NextResponse.json(
      { error: error.message || '登录失败，请重试' },
      { status: 500 }
    )
  }
}
