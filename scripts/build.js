// ============================================================
// Build script: ensures PostgreSQL schema + generates client + pushes
// Restores schema from SQLite (local dev) back to PostgreSQL (Vercel)
// ============================================================

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const schemaPath = path.join(__dirname, '..', 'prisma', 'schema.prisma')
const markerPath = path.join(__dirname, '..', 'prisma', '.sqlite-mode')

// Step 1: Restore schema to PostgreSQL if it was switched to SQLite by pre-dev.js
function ensurePostgresqlSchema() {
  let schema = fs.readFileSync(schemaPath, 'utf8')

  if (schema.includes('provider = "sqlite"')) {
    console.log('[build] Restoring Prisma schema from SQLite → PostgreSQL...')

    schema = schema.replace(
      /datasource db \{[\s\S]*?\}/,
      `datasource db {
  provider          = "postgresql"
  url               = env("DATABASE_URL")
  directUrl         = env("DIRECT_URL")
  relationMode      = "prisma"
}`
    )

    fs.writeFileSync(schemaPath, schema)

    // Remove marker
    if (fs.existsSync(markerPath)) {
      fs.unlinkSync(markerPath)
    }

    console.log('[build] Schema restored to PostgreSQL')
  } else {
    console.log('[build] Schema already using PostgreSQL')
  }
}

ensurePostgresqlSchema()

// Step 2: Resolve PostgreSQL URL (with huobao_ prefix priority)
const huobaoNonPooling = process.env.huobao_POSTGRES_URL_NON_POOLING
const huobaoPrisma = process.env.huobao_POSTGRES_PRISMA_URL
const huobaoGeneric = process.env.huobao_POSTGRES_URL
const nonPoolingUrl = process.env.POSTGRES_URL_NON_POOLING
const prismaUrl = process.env.POSTGRES_PRISMA_URL
const genericUrl = process.env.POSTGRES_URL

// DATABASE_URL: runtime (pooled connection)
// DIRECT_URL: migrations (direct connection)
const runtimeUrl = huobaoPrisma || prismaUrl || process.env.DATABASE_URL
const migrationUrl = huobaoNonPooling || nonPoolingUrl || process.env.DIRECT_URL || runtimeUrl

if (runtimeUrl) {
  process.env.DATABASE_URL = runtimeUrl
  process.env.DIRECT_URL = migrationUrl
  console.log('[build] DATABASE_URL configured for PostgreSQL')
} else {
  console.warn('[build] WARNING: No PostgreSQL URL found. Database features may not work.')
}

// Step 3: Generate Prisma client
try {
  console.log('[build] Generating Prisma client...')
  execSync('npx prisma generate', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: runtimeUrl, DIRECT_URL: migrationUrl },
    timeout: 120000
  })
  console.log('[build] Prisma client generated successfully')
} catch (error) {
  console.warn('[build] Prisma generate warning:', error.message?.slice(0, 300))
}

// Step 4: Push schema to database with retry logic
// This is critical for adding new models (like DramaMember, Comment)
// to the PostgreSQL database on Vercel.
if (migrationUrl && (migrationUrl.startsWith('postgresql') || migrationUrl.startsWith('postgres://'))) {
  const MAX_RETRIES = 3
  let pushSucceeded = false

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`[build] Pushing schema to PostgreSQL (attempt ${attempt}/${MAX_RETRIES}, 60s timeout)...`)
      execSync('npx prisma db push --skip-generate', {
        stdio: 'pipe',
        env: { ...process.env, DATABASE_URL: migrationUrl, DIRECT_URL: migrationUrl },
        timeout: 60000  // Increased from 30s to 60s
      })
      console.log('[build] Schema pushed to PostgreSQL successfully')
      pushSucceeded = true
      break
    } catch (error) {
      const errMsg = error.message?.slice(0, 300) || 'Unknown error'
      console.warn(`[build] Prisma db push attempt ${attempt} failed: ${errMsg}`)
      if (attempt < MAX_RETRIES) {
        console.log('[build] Retrying in 5 seconds...')
        execSync('sleep 5', { stdio: 'pipe' })
      }
    }
  }

  if (!pushSucceeded) {
    console.warn('[build] Prisma db push failed after all retries. Run /api/migrate manually after deployment.')
  }
} else if (migrationUrl) {
  console.warn(`[build] WARNING: migrationUrl does not look like PostgreSQL: ${migrationUrl.slice(0, 30)}... — skipping db push`)
} else {
  console.warn('[build] WARNING: No migration URL found — skipping db push')
}

console.log('[build] Prisma setup complete, starting Next.js build...')

// Step 5: Ensure admin user exists (ONLY create if missing — do NOT reset password)
// This is safe: it only creates a new admin if one doesn't exist yet.
// It will NOT overwrite existing passwords, names, or other user data.
if (migrationUrl && (migrationUrl.startsWith('postgresql') || migrationUrl.startsWith('postgres://'))) {
  try {
    console.log('[build] Checking if admin user exists...')
    const bcrypt = require('bcryptjs')
    const { PrismaClient } = require('@prisma/client')
    const db = new PrismaClient({
      datasources: { db: { url: migrationUrl } }
    });

    (async () => {
      try {
        const adminEmail = process.env.ADMIN_EMAIL || 'admin@huobao.com'
        const adminPassword = process.env.ADMIN_PASSWORD || 'admin123'
        const adminName = process.env.ADMIN_NAME || '管理员'

        const existing = await db.user.findUnique({ where: { email: adminEmail } })

        if (existing) {
          // Admin exists — do NOT reset password or modify user data!
          // Only ensure role is admin (in case it was accidentally changed)
          if (existing.role !== 'admin') {
            await db.user.update({
              where: { id: existing.id },
              data: { role: 'admin' },
            })
            console.log(`[build] Admin user ${adminEmail} role corrected to admin`)
          } else {
            console.log(`[build] Admin user ${adminEmail} already exists — no changes needed`)
          }
        } else {
          // Create admin — only when it doesn't exist
          const hashedPassword = await bcrypt.hash(adminPassword, 12)
          await db.user.create({
            data: {
              email: adminEmail,
              name: adminName,
              password: hashedPassword,
              role: 'admin',
            },
          })
          console.log(`[build] Admin user ${adminEmail} created`)
        }

        await db.$disconnect()
      } catch (err) {
        console.warn('[build] Admin user setup warning:', err.message?.slice(0, 200))
        try { await db.$disconnect() } catch (_) {}
      }
    })()
  } catch (err) {
    console.warn('[build] Admin user setup skipped:', err.message?.slice(0, 100))
  }
}
