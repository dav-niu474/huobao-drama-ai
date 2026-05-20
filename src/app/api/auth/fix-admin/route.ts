import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'

// ============================================================
// POST /api/auth/fix-admin — Ensure admin account exists with correct role
// Called via secret key to fix admin account on Vercel
// ============================================================

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { secret, email, password } = body

    // Verify secret (use NEXTAUTH_SECRET as auth for this endpoint)
    if (secret !== process.env.NEXTAUTH_SECRET) {
      return NextResponse.json({ error: '无效的密钥' }, { status: 403 })
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
      return NextResponse.json({
        action: 'updated',
        message: `用户 ${adminEmail} 已升级为管理员`,
        user: updated,
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

    return NextResponse.json({
      action: 'created',
      message: `管理员 ${adminEmail} 创建成功`,
      user: admin,
    })
  } catch (error: any) {
    console.error('[auth/fix-admin] Error:', error)
    return NextResponse.json(
      { error: error.message || '修复管理员失败' },
      { status: 500 }
    )
  }
}
