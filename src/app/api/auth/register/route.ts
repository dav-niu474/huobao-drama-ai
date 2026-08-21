import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'

// ============================================================
// POST /api/auth/register — Create a new user account
// ============================================================

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, name, password } = body

    // Validation
    if (!email || !name || !password) {
      return NextResponse.json(
        { error: '邮箱、用户名和密码为必填项' },
        { status: 400 }
      )
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: '邮箱格式不正确' }, { status: 400 })
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: '密码至少6位' },
        { status: 400 }
      )
    }

    if (name.length < 2 || name.length > 20) {
      return NextResponse.json(
        { error: '用户名长度2-20个字符' },
        { status: 400 }
      )
    }

    // Check if email already exists
    const existing = await db.user.findUnique({ where: { email } })
    if (existing) {
      return NextResponse.json(
        { error: '该邮箱已注册' },
        { status: 409 }
      )
    }

    // Reserved admin emails — prevent registration with these
    const reservedEmails = ['admin@huobao.com', 'admin@huobao.ai']
    if (reservedEmails.includes(email.toLowerCase())) {
      return NextResponse.json(
        { error: '该邮箱为系统保留邮箱，不可注册' },
        { status: 403 }
      )
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12)

    // Create user
    const user = await db.user.create({
      data: {
        email,
        name,
        password: hashedPassword,
        role: 'free',
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        avatar: true,
        createdAt: true,
      },
    })

    return NextResponse.json({
      message: '注册成功',
      user,
    })
  } catch (error: any) {
    console.error('[auth/register] Error:', error)
    return NextResponse.json(
      { error: error.message || '注册失败，请稍后重试' },
      { status: 500 }
    )
  }
}
