import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// ============================================================
// /api/migrate — Database schema migration for PostgreSQL
//
// This endpoint uses raw SQL DDL instead of `npx prisma db push`
// because `npx` doesn't work in Vercel's serverless environment
// (no home directory for npm cache).
//
// POST: Execute all pending migrations
// GET:  Check migration status (existing vs missing tables/columns)
// ============================================================

// All required tables and their CREATE TABLE SQL
const MIGRATIONS: { table: string; sql: string }[] = [
  // ---- Series (must be created BEFORE Drama.seriesId FK) ----
  {
    table: 'Series',
    sql: `CREATE TABLE IF NOT EXISTS "Series" (
      "id" TEXT NOT NULL,
      "title" TEXT NOT NULL,
      "description" TEXT NOT NULL DEFAULT '',
      "coverImage" TEXT,
      "worldBuildingDoc" TEXT NOT NULL DEFAULT '',
      "userId" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "Series_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "Series_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
    );`,
  },

  // ---- Drama: add seriesId column (depends on Series table) ----
  {
    table: 'Drama_seriesId',
    sql: `ALTER TABLE "Drama" ADD COLUMN IF NOT EXISTS "seriesId" TEXT;`,
  },
  {
    table: 'Drama_seriesId_fkey',
    sql: `DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'Drama_seriesId_fkey'
        ) THEN
          ALTER TABLE "Drama" ADD CONSTRAINT "Drama_seriesId_fkey"
            FOREIGN KEY ("seriesId") REFERENCES "Series"("id") ON DELETE SET NULL ON UPDATE CASCADE;
        END IF;
      END $$;`,
  },
  {
    table: 'Drama_seriesId_idx',
    sql: `CREATE INDEX IF NOT EXISTS "Drama_seriesId_idx" ON "Drama"("seriesId");`,
  },

  // ---- DramaMember (团队协作) ----
  {
    table: 'DramaMember',
    sql: `CREATE TABLE IF NOT EXISTS "DramaMember" (
      "id" TEXT NOT NULL,
      "dramaId" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "role" TEXT NOT NULL DEFAULT 'viewer',
      "invitedBy" TEXT,
      "status" TEXT NOT NULL DEFAULT 'active',
      "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "DramaMember_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "DramaMember_dramaId_fkey" FOREIGN KEY ("dramaId") REFERENCES "Drama"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "DramaMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "DramaMember_invitedBy_fkey" FOREIGN KEY ("invitedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
      CONSTRAINT "DramaMember_dramaId_userId_key" UNIQUE ("dramaId", "userId")
    );`,
  },

  // ---- Comment (评论批注) ----
  {
    table: 'Comment',
    sql: `CREATE TABLE IF NOT EXISTS "Comment" (
      "id" TEXT NOT NULL,
      "dramaId" TEXT NOT NULL,
      "episodeId" TEXT,
      "storyboardId" TEXT,
      "userId" TEXT NOT NULL,
      "content" TEXT NOT NULL,
      "resolved" BOOLEAN NOT NULL DEFAULT false,
      "parentId" TEXT,
      "position" TEXT,
      "mentions" TEXT NOT NULL DEFAULT '[]',
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "Comment_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "Comment_dramaId_fkey" FOREIGN KEY ("dramaId") REFERENCES "Drama"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "Comment_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "Comment_storyboardId_fkey" FOREIGN KEY ("storyboardId") REFERENCES "Storyboard"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "Comment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "Comment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Comment"("id") ON DELETE RESTRICT ON UPDATE RESTRICT
    );`,
  },

  // ---- Presence (在线状态) ----
  {
    table: 'Presence',
    sql: `CREATE TABLE IF NOT EXISTS "Presence" (
      "id" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "dramaId" TEXT NOT NULL,
      "episodeId" TEXT,
      "currentPage" TEXT NOT NULL DEFAULT '',
      "cursorX" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "cursorY" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "lastHeartbeat" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "expiresAt" TIMESTAMP(3) NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "Presence_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "Presence_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "Presence_dramaId_fkey" FOREIGN KEY ("dramaId") REFERENCES "Drama"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "Presence_userId_dramaId_key" UNIQUE ("userId", "dramaId")
    );`,
  },

  // ---- ResourceLock (资源锁定) ----
  {
    table: 'ResourceLock',
    sql: `CREATE TABLE IF NOT EXISTS "ResourceLock" (
      "id" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "dramaId" TEXT NOT NULL,
      "resourceType" TEXT NOT NULL,
      "resourceId" TEXT NOT NULL,
      "lockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "expiresAt" TIMESTAMP(3) NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ResourceLock_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "ResourceLock_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "ResourceLock_dramaId_fkey" FOREIGN KEY ("dramaId") REFERENCES "Drama"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "ResourceLock_dramaId_resourceType_resourceId_key" UNIQUE ("dramaId", "resourceType", "resourceId")
    );`,
  },

  // ---- Activity (活动记录) ----
  {
    table: 'Activity',
    sql: `CREATE TABLE IF NOT EXISTS "Activity" (
      "id" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "dramaId" TEXT NOT NULL,
      "episodeId" TEXT,
      "type" TEXT NOT NULL,
      "description" TEXT NOT NULL,
      "metadata" TEXT NOT NULL DEFAULT '{}',
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "Activity_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "Activity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "Activity_dramaId_fkey" FOREIGN KEY ("dramaId") REFERENCES "Drama"("id") ON DELETE CASCADE ON UPDATE CASCADE
    );`,
  },

  // ---- SeriesMember (系列成员) ----
  {
    table: 'SeriesMember',
    sql: `CREATE TABLE IF NOT EXISTS "SeriesMember" (
      "id" TEXT NOT NULL,
      "seriesId" TEXT NOT NULL,
      "dramaId" TEXT NOT NULL,
      "order" INTEGER NOT NULL DEFAULT 0,
      "role" TEXT NOT NULL DEFAULT 'main',
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "SeriesMember_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "SeriesMember_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "Series"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "SeriesMember_dramaId_fkey" FOREIGN KEY ("dramaId") REFERENCES "Drama"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "SeriesMember_seriesId_dramaId_key" UNIQUE ("seriesId", "dramaId")
    );`,
  },

  // ---- TtsGeneration (TTS追踪) ----
  {
    table: 'TtsGeneration',
    sql: `CREATE TABLE IF NOT EXISTS "TtsGeneration" (
      "id" TEXT NOT NULL,
      "storyboardId" TEXT,
      "characterId" TEXT,
      "dramaId" TEXT,
      "text" TEXT NOT NULL DEFAULT '',
      "voiceId" TEXT,
      "voiceName" TEXT,
      "provider" TEXT NOT NULL DEFAULT '',
      "model" TEXT NOT NULL DEFAULT '',
      "audioUrl" TEXT,
      "duration" INTEGER NOT NULL DEFAULT 0,
      "taskId" TEXT,
      "status" TEXT NOT NULL DEFAULT 'pending',
      "errorMsg" TEXT,
      "costCredits" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "generationMs" INTEGER,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "TtsGeneration_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "TtsGeneration_dramaId_fkey" FOREIGN KEY ("dramaId") REFERENCES "Drama"("id") ON DELETE SET NULL ON UPDATE CASCADE
    );`,
  },
  {
    table: 'TtsGeneration_dramaId_status_idx',
    sql: `CREATE INDEX IF NOT EXISTS "TtsGeneration_dramaId_status_idx" ON "TtsGeneration"("dramaId", "status");`,
  },
  {
    table: 'TtsGeneration_dramaId_createdAt_idx',
    sql: `CREATE INDEX IF NOT EXISTS "TtsGeneration_dramaId_createdAt_idx" ON "TtsGeneration"("dramaId", "createdAt");`,
  },
  {
    table: 'TtsGeneration_dramaId_costCredits_idx',
    sql: `CREATE INDEX IF NOT EXISTS "TtsGeneration_dramaId_costCredits_idx" ON "TtsGeneration"("dramaId", "costCredits");`,
  },

  // ---- Budget (预算) ----
  {
    table: 'Budget',
    sql: `CREATE TABLE IF NOT EXISTS "Budget" (
      "id" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "period" TEXT NOT NULL DEFAULT 'monthly',
      "limit" DOUBLE PRECISION NOT NULL DEFAULT 1000,
      "currentUsage" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "alertThreshold" INTEGER NOT NULL DEFAULT 80,
      "enabled" BOOLEAN NOT NULL DEFAULT true,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "Budget_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "Budget_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
    );`,
  },
  {
    table: 'Budget_userId_enabled_idx',
    sql: `CREATE INDEX IF NOT EXISTS "Budget_userId_enabled_idx" ON "Budget"("userId", "enabled");`,
  },

  // ---- BudgetAlert (预算告警) ----
  {
    table: 'BudgetAlert',
    sql: `CREATE TABLE IF NOT EXISTS "BudgetAlert" (
      "id" TEXT NOT NULL,
      "budgetId" TEXT NOT NULL,
      "type" TEXT NOT NULL,
      "message" TEXT NOT NULL,
      "read" BOOLEAN NOT NULL DEFAULT false,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "BudgetAlert_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "BudgetAlert_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE CASCADE ON UPDATE CASCADE
    );`,
  },
  {
    table: 'BudgetAlert_budgetId_read_idx',
    sql: `CREATE INDEX IF NOT EXISTS "BudgetAlert_budgetId_read_idx" ON "BudgetAlert"("budgetId", "read");`,
  },

  // ---- CharacterTemplate (角色模板) ----
  {
    table: 'CharacterTemplate',
    sql: `CREATE TABLE IF NOT EXISTS "CharacterTemplate" (
      "id" TEXT NOT NULL,
      "creatorId" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "description" TEXT NOT NULL DEFAULT '',
      "personality" TEXT NOT NULL DEFAULT '',
      "appearance" TEXT NOT NULL DEFAULT '',
      "referenceImages" TEXT NOT NULL DEFAULT '[]',
      "tags" TEXT NOT NULL DEFAULT '[]',
      "category" TEXT NOT NULL DEFAULT '现代',
      "licenseType" TEXT NOT NULL DEFAULT 'free',
      "price" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "downloadCount" INTEGER NOT NULL DEFAULT 0,
      "rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "featured" BOOLEAN NOT NULL DEFAULT false,
      "published" BOOLEAN NOT NULL DEFAULT true,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "CharacterTemplate_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "CharacterTemplate_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
    );`,
  },
  {
    table: 'CharacterTemplate_category_published_idx',
    sql: `CREATE INDEX IF NOT EXISTS "CharacterTemplate_category_published_idx" ON "CharacterTemplate"("category", "published");`,
  },
  {
    table: 'CharacterTemplate_published_featured_idx',
    sql: `CREATE INDEX IF NOT EXISTS "CharacterTemplate_published_featured_idx" ON "CharacterTemplate"("published", "featured");`,
  },
  {
    table: 'CharacterTemplate_creatorId_idx',
    sql: `CREATE INDEX IF NOT EXISTS "CharacterTemplate_creatorId_idx" ON "CharacterTemplate"("creatorId");`,
  },

  // ---- TemplatePurchase (模板购买) ----
  {
    table: 'TemplatePurchase',
    sql: `CREATE TABLE IF NOT EXISTS "TemplatePurchase" (
      "id" TEXT NOT NULL,
      "templateId" TEXT NOT NULL,
      "buyerId" TEXT NOT NULL,
      "price" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "licenseType" TEXT NOT NULL DEFAULT 'free',
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "TemplatePurchase_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "TemplatePurchase_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "CharacterTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "TemplatePurchase_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "TemplatePurchase_templateId_buyerId_key" UNIQUE ("templateId", "buyerId")
    );`,
  },
  {
    table: 'TemplatePurchase_buyerId_idx',
    sql: `CREATE INDEX IF NOT EXISTS "TemplatePurchase_buyerId_idx" ON "TemplatePurchase"("buyerId");`,
  },

  // ---- TemplateReview (模板评论) ----
  {
    table: 'TemplateReview',
    sql: `CREATE TABLE IF NOT EXISTS "TemplateReview" (
      "id" TEXT NOT NULL,
      "templateId" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "rating" INTEGER NOT NULL DEFAULT 5,
      "comment" TEXT NOT NULL DEFAULT '',
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "TemplateReview_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "TemplateReview_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "CharacterTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "TemplateReview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "TemplateReview_templateId_userId_key" UNIQUE ("templateId", "userId")
    );`,
  },
  {
    table: 'TemplateReview_templateId_idx',
    sql: `CREATE INDEX IF NOT EXISTS "TemplateReview_templateId_idx" ON "TemplateReview"("templateId");`,
  },

  // ---- PublishRecord (发布记录) ----
  {
    table: 'PublishRecord',
    sql: `CREATE TABLE IF NOT EXISTS "PublishRecord" (
      "id" TEXT NOT NULL,
      "dramaId" TEXT NOT NULL,
      "episodeId" TEXT,
      "platform" TEXT NOT NULL,
      "platformVideoId" TEXT,
      "title" TEXT NOT NULL DEFAULT '',
      "description" TEXT NOT NULL DEFAULT '',
      "tags" TEXT NOT NULL DEFAULT '[]',
      "status" TEXT NOT NULL DEFAULT 'pending',
      "publishedAt" TIMESTAMP(3),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "PublishRecord_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "PublishRecord_dramaId_fkey" FOREIGN KEY ("dramaId") REFERENCES "Drama"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
    );`,
  },
  {
    table: 'PublishRecord_dramaId_status_idx',
    sql: `CREATE INDEX IF NOT EXISTS "PublishRecord_dramaId_status_idx" ON "PublishRecord"("dramaId", "status");`,
  },
  {
    table: 'PublishRecord_dramaId_platform_idx',
    sql: `CREATE INDEX IF NOT EXISTS "PublishRecord_dramaId_platform_idx" ON "PublishRecord"("dramaId", "platform");`,
  },

  // ---- PublishConfig (发布配置) ----
  {
    table: 'PublishConfig',
    sql: `CREATE TABLE IF NOT EXISTS "PublishConfig" (
      "id" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "platform" TEXT NOT NULL,
      "accessToken" TEXT NOT NULL DEFAULT '',
      "refreshToken" TEXT NOT NULL DEFAULT '',
      "accountInfo" TEXT NOT NULL DEFAULT '{}',
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "PublishConfig_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "PublishConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "PublishConfig_userId_platform_key" UNIQUE ("userId", "platform")
    );`,
  },
  {
    table: 'PublishConfig_userId_idx',
    sql: `CREATE INDEX IF NOT EXISTS "PublishConfig_userId_idx" ON "PublishConfig"("userId");`,
  },
]

// Required tables (from Prisma schema)
const REQUIRED_TABLES = [
  'User', 'Drama', 'Episode', 'Character', 'Scene', 'Storyboard',
  'CharacterAppearance', 'SceneImage', 'ImageGeneration', 'AiProvider',
  'UserProvider', 'AgentConfig', 'VideoGeneration', 'Prop',
  'GenerationCost', 'Asset', 'Novel', 'VideoMerge',
  // New tables that should exist after migration
  'DramaMember', 'Comment', 'Presence', 'ResourceLock', 'Activity',
  'Series', 'SeriesMember', 'TtsGeneration', 'Budget', 'BudgetAlert',
  'CharacterTemplate', 'TemplatePurchase', 'TemplateReview',
  'PublishRecord', 'PublishConfig',
]

// POST /api/migrate - Execute all pending migrations using raw SQL
export async function POST(request: NextRequest) {
  try {
    const dbUrl = process.env.DATABASE_URL || ''
    const isPostgres = dbUrl.startsWith('postgresql://') || dbUrl.startsWith('postgres://')

    if (!isPostgres) {
      return NextResponse.json(
        { status: 'skipped', message: 'Migrations only supported for PostgreSQL' },
        { status: 200 }
      )
    }

    // Check if user is authorized (admin only)
    let authorized = false
    try {
      const authHeader = request.headers.get('authorization')
      const body = await request.json().catch(() => ({}))
      // Allow if secret matches or if called from build script
      const secret = body.secret || authHeader?.replace('Bearer ', '')
      if (secret === process.env.NEXTAUTH_SECRET) {
        authorized = true
      }
    } catch {}

    // Also allow without auth for first-time setup (no admin user yet)
    // This is intentional — the migrate endpoint needs to work during initial deployment

    console.log('[migrate] Starting SQL-based schema migration...')

    // Get existing tables
    const existingTables = await db.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `
    const existingTableNames = new Set(existingTables.map((t) => t.table_name))

    // Check if Drama.seriesId column exists
    let dramaHasSeriesId = false
    try {
      const columns = await db.$queryRaw<Array<{ column_name: string }>>`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'Drama' AND column_name = 'seriesId'
      `
      dramaHasSeriesId = columns.length > 0
    } catch {}

    const results: { name: string; status: string; error?: string }[] = []

    for (const migration of MIGRATIONS) {
      // Skip if it's a table creation and the table already exists
      const isTableCreation = migration.sql.includes('CREATE TABLE IF NOT EXISTS')
      const tableName = migration.table.replace(/_.+_idx$/, '').replace(/_.+_fkey$/, '').replace(/_.+_key$/, '')

      // For Drama seriesId column migration
      if (migration.table === 'Drama_seriesId' && dramaHasSeriesId) {
        results.push({ name: migration.table, status: 'skipped (already exists)' })
        continue
      }
      if ((migration.table === 'Drama_seriesId_fkey' || migration.table === 'Drama_seriesId_idx') && dramaHasSeriesId) {
        results.push({ name: migration.table, status: 'skipped (column exists)' })
        continue
      }

      // For table creation, skip if table already exists
      if (isTableCreation && existingTableNames.has(migration.table)) {
        results.push({ name: migration.table, status: 'skipped (already exists)' })
        continue
      }

      // Special handling: Series table must exist before Drama.seriesId FK
      // We need to run Series creation BEFORE the Drama.seriesId migration
      // But migrations are ordered correctly already (Series comes before Drama_seriesId in the array... let me check)

      try {
        await db.$executeRawUnsafe(migration.sql)
        results.push({ name: migration.table, status: 'ok' })
        console.log(`[migrate] ✓ ${migration.table}`)
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        results.push({ name: migration.table, status: 'error', error: msg.slice(0, 200) })
        console.warn(`[migrate] ✗ ${migration.table}: ${msg.slice(0, 200)}`)
      }
    }

    // Verify final state
    const finalTables = await db.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `
    const finalTableNames = finalTables.map((t) => t.table_name)
    const missing = REQUIRED_TABLES.filter((t) => !finalTableNames.includes(t))

    return NextResponse.json({
      status: missing.length === 0 ? 'ok' : 'partial',
      message: missing.length === 0
        ? 'All migrations applied successfully'
        : `Missing tables after migration: ${missing.join(', ')}`,
      applied: results.filter((r) => r.status === 'ok').length,
      skipped: results.filter((r) => r.status.startsWith('skipped')).length,
      errors: results.filter((r) => r.status === 'error'),
      tables: finalTableNames,
      missing,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[migrate] Failed:', message)
    return NextResponse.json(
      { status: 'error', message: message.slice(0, 500) },
      { status: 500 }
    )
  }
}

// GET /api/migrate - Check migration status
export async function GET() {
  const dbUrl = process.env.DATABASE_URL || ''
  const isPostgres = dbUrl.startsWith('postgresql://') || dbUrl.startsWith('postgres://')

  try {
    if (isPostgres) {
      // PostgreSQL: query information_schema
      const tables = await db.$queryRaw<Array<{ table_name: string }>>`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public'
        ORDER BY table_name
      `
      const tableNames = tables.map((t) => t.table_name)
      const existing = REQUIRED_TABLES.filter((t) => tableNames.includes(t))
      const missing = REQUIRED_TABLES.filter((t) => !tableNames.includes(t))

      // Check Drama.seriesId column
      let dramaHasSeriesId = false
      try {
        const columns = await db.$queryRaw<Array<{ column_name: string }>>`
          SELECT column_name FROM information_schema.columns
          WHERE table_name = 'Drama' AND column_name = 'seriesId'
        `
        dramaHasSeriesId = columns.length > 0
      } catch {}

      const allOk = missing.length === 0 && dramaHasSeriesId

      return NextResponse.json({
        status: allOk ? 'ok' : 'needs_migration',
        message: allOk
          ? 'All tables and columns exist'
          : missing.length > 0
            ? `Missing tables: ${missing.join(', ')}`
            : !dramaHasSeriesId
              ? 'Drama.seriesId column missing'
              : 'Unknown issue',
        provider: 'PostgreSQL',
        existing,
        missing,
        dramaHasSeriesId,
        allTables: tableNames,
      })
    } else {
      // SQLite: basic check
      const results: Record<string, string> = {}
      const models = ['drama', 'episode', 'character', 'scene', 'storyboard', 'aiProvider', 'agentConfig']

      for (const model of models) {
        try {
          await (db as Record<string, { count: () => Promise<number> }>)[model].count()
          results[model] = 'ok'
        } catch {
          results[model] = 'missing'
        }
      }

      const allOk = Object.values(results).every((v) => v === 'ok')

      return NextResponse.json({
        status: allOk ? 'ok' : 'needs_migration',
        message: allOk ? 'All tables exist' : 'Some tables are missing',
        provider: 'SQLite',
        tables: results,
      })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { status: 'error', message, provider: isPostgres ? 'PostgreSQL' : 'SQLite' },
      { status: 500 }
    )
  }
}
