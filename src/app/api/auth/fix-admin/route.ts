import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { autoInitProviders } from '@/lib/ai-config'

// ============================================================
// POST /api/auth/fix-admin — Ensure admin account exists with correct role
// Called via secret key to fix admin account on Vercel
// Also auto-initializes default AI providers from environment variables
// ============================================================

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { secret, email, password } = body

    // Verify secret (use NEXTAUTH_SECRET as auth for this endpoint)
    if (secret !== process.env.NEXTAUTH_SECRET) {
      return NextResponse.json({ error: '无效的密钥' }, { status: 403 })
    }

    const clientIp = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'
    const isLocalhost = clientIp === '127.0.0.1' || clientIp === '::1' || clientIp === 'unknown'
    if (!isLocalhost && !process.env.VERCEL) {
      console.warn(`[auth/fix-admin] Blocked remote access from IP: ${clientIp}`)
      return NextResponse.json(
        { error: '此端点仅限本地访问。请使用管理面板修改用户角色。' },
        { status: 403 }
      )
    }
    const userCount = await db.user.count()
    if (userCount > 0 && !body.confirmOverwrite) {
      return NextResponse.json(
        { error: '已有用户存在。如需覆盖，请设置 confirmOverwrite: true。' },
        { status: 400 }
      )
    }

    const adminEmail = email || 'admin@huobao.com'
    const adminPassword = password || 'admin123'
    const adminName = '管理员'

    // Check if user with this email already exists
    const existing = await db.user.findUnique({ where: { email: adminEmail } })

    if (existing) {
      // User exists — force update to admin role with correct password
      const hashedPassword = await bcrypt.hash(adminPassword, 12)
      const updated = await db.user.update({
        where: { id: existing.id },
        data: {
          role: 'admin',
          password: hashedPassword,
          name: adminName,
          isActive: true,
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isActive: true,
        },
      })

      // Auto-initialize AI providers from environment variables
      const initialized = await autoInitProviders()

      return NextResponse.json({
        action: 'updated',
        message: `用户 ${adminEmail} 已升级为管理员`,
        user: updated,
        providersInitialized: initialized.length > 0 ? initialized : undefined,
      })
    }

    // Create new admin user
    const hashedPassword = await bcrypt.hash(adminPassword, 12)
    const admin = await db.user.create({
      data: {
        email: adminEmail,
        name: adminName,
        password: hashedPassword,
        role: 'admin',
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
      },
    })

    // Auto-initialize AI providers from environment variables
    const initialized = await autoInitProviders()

    return NextResponse.json({
      action: 'created',
      message: `管理员 ${adminEmail} 创建成功`,
      user: admin,
      providersInitialized: initialized.length > 0 ? initialized : undefined,
    })
  } catch (error: any) {
    console.error('[auth/fix-admin] Error:', error)
    return NextResponse.json(
      { error: error.message || '修复管理员失败' },
      { status: 500 }
    )
  }
}
