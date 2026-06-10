import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// ============================================================
// /api/migrate — Database schema migration for PostgreSQL
//
// This endpoint uses raw SQL DDL instead of `npx prisma db push`
// because `npx` doesn't work in Vercel's serverless environment
// (no home directory for npm cache).
//
// All DDL is idempotent (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS),
// safe to run repeatedly without side effects.
//
// POST: Execute all pending migrations
// GET:  Check migration status (existing vs missing tables/columns)
// ============================================================

// Helper: generate a safe ADD COLUMN IF NOT EXISTS SQL
function addColumn(table: string, column: string, definition: string): string {
  return `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "${column}" ${definition};`
}

// Helper: generate a safe ADD CONSTRAINT IF NOT EXISTS for FK
function addFkConstraint(constraintName: string, table: string, column: string, refTable: string, refColumn: string, onDelete: string = 'SET NULL', onUpdate: string = 'CASCADE'): string {
  return `DO $$
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${constraintName}') THEN
      ALTER TABLE "${table}" ADD CONSTRAINT "${constraintName}"
        FOREIGN KEY ("${column}") REFERENCES "${refTable}"("${refColumn}") ON DELETE ${onDelete} ON UPDATE ${onUpdate};
    END IF;
  END $$;`
}

// ============================================================
// MIGRATIONS — ordered by dependency
// ============================================================
const MIGRATIONS: { table: string; sql: string }[] = [
  // ==========================================================
  // SECTION 1: Core tables that may have been created by prisma
  // db push in earlier deployments but might be missing on a
  // fresh database. Using CREATE TABLE IF NOT EXISTS is safe.
  // ==========================================================

  // ---- Asset (must exist before Character/Scene/Prop FKs) ----
  {
    table: 'Asset',
    sql: `CREATE TABLE IF NOT EXISTS "Asset" (
      "id" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "category" TEXT NOT NULL,
      "subcategory" TEXT,
      "tags" TEXT NOT NULL DEFAULT '[]',
      "thumbnail" TEXT,
      "userId" TEXT,
      "isPublic" BOOLEAN NOT NULL DEFAULT true,
      "usageCount" INTEGER NOT NULL DEFAULT 0,
      "description" TEXT NOT NULL DEFAULT '',
      "imagePrompt" TEXT,
      "imageUrls" TEXT NOT NULL DEFAULT '[]',
      "data" TEXT NOT NULL DEFAULT '{}',
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "Asset_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "Asset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
    );`,
  },

  // ---- Novel (小说源文件) ----
  {
    table: 'Novel',
    sql: `CREATE TABLE IF NOT EXISTS "Novel" (
      "id" TEXT NOT NULL,
      "dramaId" TEXT NOT NULL,
      "title" TEXT NOT NULL DEFAULT '',
      "chapters" TEXT NOT NULL DEFAULT '[]',
      "parsedContent" TEXT NOT NULL DEFAULT '{}',
      "parseStatus" TEXT NOT NULL DEFAULT 'pending',
      "fileSize" INTEGER NOT NULL DEFAULT 0,
      "fileName" TEXT NOT NULL DEFAULT '',
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "Novel_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "Novel_dramaId_fkey" FOREIGN KEY ("dramaId") REFERENCES "Drama"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "Novel_dramaId_key" UNIQUE ("dramaId")
    );`,
  },

  // ---- CharacterAppearance (核心资产沉淀) ----
  {
    table: 'CharacterAppearance',
    sql: `CREATE TABLE IF NOT EXISTS "CharacterAppearance" (
      "id" TEXT NOT NULL,
      "characterId" TEXT NOT NULL,
      "appearanceIndex" INTEGER NOT NULL DEFAULT 0,
      "label" TEXT NOT NULL DEFAULT '',
      "description" TEXT NOT NULL DEFAULT '',
      "imagePrompt" TEXT NOT NULL DEFAULT '',
      "imageUrl" TEXT,
      "imageUrls" TEXT NOT NULL DEFAULT '[]',
      "selectedIndex" INTEGER NOT NULL DEFAULT 0,
      "previousImageUrl" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "CharacterAppearance_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "CharacterAppearance_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "CharacterAppearance_characterId_appearanceIndex_key" UNIQUE ("characterId", "appearanceIndex")
    );`,
  },

  // ---- SceneImage (核心资产沉淀) ----
  {
    table: 'SceneImage',
    sql: `CREATE TABLE IF NOT EXISTS "SceneImage" (
      "id" TEXT NOT NULL,
      "sceneId" TEXT NOT NULL,
      "description" TEXT NOT NULL DEFAULT '',
      "imageUrl" TEXT,
      "timeOfDay" TEXT NOT NULL DEFAULT '',
      "angle" TEXT NOT NULL DEFAULT '',
      "isSelected" BOOLEAN NOT NULL DEFAULT false,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "SceneImage_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "SceneImage_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "Scene"("id") ON DELETE CASCADE ON UPDATE CASCADE
    );`,
  },

  // ---- ImageGeneration (图片生成追踪) ----
  {
    table: 'ImageGeneration',
    sql: `CREATE TABLE IF NOT EXISTS "ImageGeneration" (
      "id" TEXT NOT NULL,
      "storyboardId" TEXT,
      "characterId" TEXT,
      "sceneId" TEXT,
      "dramaId" TEXT,
      "prompt" TEXT NOT NULL,
      "model" TEXT NOT NULL DEFAULT '',
      "provider" TEXT NOT NULL DEFAULT '',
      "size" TEXT NOT NULL DEFAULT '1024x1024',
      "frameType" TEXT,
      "referenceImages" TEXT,
      "taskId" TEXT,
      "imageUrl" TEXT,
      "status" TEXT NOT NULL DEFAULT 'pending',
      "errorMsg" TEXT,
      "tokensUsed" INTEGER,
      "generationMs" INTEGER,
      "costCredits" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ImageGeneration_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "ImageGeneration_dramaId_fkey" FOREIGN KEY ("dramaId") REFERENCES "Drama"("id") ON DELETE SET NULL ON UPDATE CASCADE
    );`,
  },
  {
    table: 'ImageGeneration_dramaId_status_idx',
    sql: `CREATE INDEX IF NOT EXISTS "ImageGeneration_dramaId_status_idx" ON "ImageGeneration"("dramaId", "status");`,
  },
  {
    table: 'ImageGeneration_dramaId_createdAt_idx',
    sql: `CREATE INDEX IF NOT EXISTS "ImageGeneration_dramaId_createdAt_idx" ON "ImageGeneration"("dramaId", "createdAt");`,
  },
  {
    table: 'ImageGeneration_dramaId_costCredits_idx',
    sql: `CREATE INDEX IF NOT EXISTS "ImageGeneration_dramaId_costCredits_idx" ON "ImageGeneration"("dramaId", "costCredits");`,
  },

  // ---- VideoGeneration (视频生成追踪) ----
  {
    table: 'VideoGeneration',
    sql: `CREATE TABLE IF NOT EXISTS "VideoGeneration" (
      "id" TEXT NOT NULL,
      "storyboardId" TEXT,
      "dramaId" TEXT,
      "provider" TEXT NOT NULL DEFAULT '',
      "model" TEXT NOT NULL DEFAULT '',
      "prompt" TEXT NOT NULL DEFAULT '',
      "referenceMode" TEXT,
      "firstFrameUrl" TEXT,
      "lastFrameUrl" TEXT,
      "duration" INTEGER NOT NULL DEFAULT 5,
      "aspectRatio" TEXT NOT NULL DEFAULT '16:9',
      "taskId" TEXT,
      "videoUrl" TEXT,
      "status" TEXT NOT NULL DEFAULT 'pending',
      "errorMsg" TEXT,
      "tokensUsed" INTEGER,
      "generationMs" INTEGER,
      "costCredits" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "VideoGeneration_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "VideoGeneration_dramaId_fkey" FOREIGN KEY ("dramaId") REFERENCES "Drama"("id") ON DELETE SET NULL ON UPDATE CASCADE
    );`,
  },
  {
    table: 'VideoGeneration_dramaId_status_idx',
    sql: `CREATE INDEX IF NOT EXISTS "VideoGeneration_dramaId_status_idx" ON "VideoGeneration"("dramaId", "status");`,
  },
  {
    table: 'VideoGeneration_dramaId_createdAt_idx',
    sql: `CREATE INDEX IF NOT EXISTS "VideoGeneration_dramaId_createdAt_idx" ON "VideoGeneration"("dramaId", "createdAt");`,
  },
  {
    table: 'VideoGeneration_dramaId_costCredits_idx',
    sql: `CREATE INDEX IF NOT EXISTS "VideoGeneration_dramaId_costCredits_idx" ON "VideoGeneration"("dramaId", "costCredits");`,
  },

  // ---- VideoMerge (视频合成追踪) ----
  {
    table: 'VideoMerge',
    sql: `CREATE TABLE IF NOT EXISTS "VideoMerge" (
      "id" TEXT NOT NULL,
      "episodeId" TEXT NOT NULL,
      "dramaId" TEXT,
      "status" TEXT NOT NULL DEFAULT 'pending',
      "mergedUrl" TEXT,
      "duration" INTEGER NOT NULL DEFAULT 0,
      "errorMsg" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "VideoMerge_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "VideoMerge_dramaId_fkey" FOREIGN KEY ("dramaId") REFERENCES "Drama"("id") ON DELETE SET NULL ON UPDATE CASCADE
    );`,
  },

  // ---- GenerationCost (费用追踪) ----
  {
    table: 'GenerationCost',
    sql: `CREATE TABLE IF NOT EXISTS "GenerationCost" (
      "id" TEXT NOT NULL,
      "dramaId" TEXT NOT NULL,
      "episodeId" TEXT,
      "category" TEXT NOT NULL,
      "provider" TEXT NOT NULL,
      "model" TEXT NOT NULL,
      "credits" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "tokensUsed" INTEGER NOT NULL DEFAULT 0,
      "count" INTEGER NOT NULL DEFAULT 1,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "GenerationCost_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "GenerationCost_dramaId_fkey" FOREIGN KEY ("dramaId") REFERENCES "Drama"("id") ON DELETE CASCADE ON UPDATE CASCADE
    );`,
  },

  // ---- AiProvider (AI供应商配置) ----
  {
    table: 'AiProvider',
    sql: `CREATE TABLE IF NOT EXISTS "AiProvider" (
      "id" TEXT NOT NULL,
      "category" TEXT NOT NULL,
      "provider" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "apiKey" TEXT NOT NULL DEFAULT '',
      "baseUrl" TEXT NOT NULL DEFAULT '',
      "model" TEXT NOT NULL DEFAULT '',
      "isActive" BOOLEAN NOT NULL DEFAULT false,
      "sort" INTEGER NOT NULL DEFAULT 0,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "AiProvider_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "AiProvider_category_provider_key" UNIQUE ("category", "provider")
    );`,
  },

  // ---- UserProvider (用户自定义AI配置) ----
  {
    table: 'UserProvider',
    sql: `CREATE TABLE IF NOT EXISTS "UserProvider" (
      "id" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "category" TEXT NOT NULL,
      "provider" TEXT NOT NULL,
      "apiKey" TEXT NOT NULL DEFAULT '',
      "baseUrl" TEXT NOT NULL DEFAULT '',
      "model" TEXT NOT NULL DEFAULT '',
      "isActive" BOOLEAN NOT NULL DEFAULT false,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "UserProvider_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "UserProvider_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "UserProvider_userId_category_provider_key" UNIQUE ("userId", "category", "provider")
    );`,
  },

  // ---- AgentConfig (Agent配置) ----
  {
    table: 'AgentConfig',
    sql: `CREATE TABLE IF NOT EXISTS "AgentConfig" (
      "id" TEXT NOT NULL,
      "agentType" TEXT NOT NULL,
      "systemPrompt" TEXT,
      "model" TEXT,
      "temperature" DOUBLE PRECISION NOT NULL DEFAULT 0.7,
      "maxTokens" INTEGER NOT NULL DEFAULT 4096,
      "isActive" BOOLEAN NOT NULL DEFAULT true,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "AgentConfig_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "AgentConfig_agentType_key" UNIQUE ("agentType")
    );`,
  },

  // ==========================================================
  // SECTION 2: Series & related (must be before Drama.seriesId)
  // ==========================================================

  // ---- Series (IP/系列管理) ----
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

  // ==========================================================
  // SECTION 3: New columns on existing tables
  // All use ADD COLUMN IF NOT EXISTS for safety
  // ==========================================================

  // ---- Drama: new columns ----
  {
    table: 'Drama_novelSource',
    sql: addColumn('Drama', 'novelSource', 'TEXT'),
  },
  {
    table: 'Drama_novelParsed',
    sql: addColumn('Drama', 'novelParsed', 'BOOLEAN NOT NULL DEFAULT false'),
  },
  {
    table: 'Drama_artStyle',
    sql: addColumn('Drama', 'artStyle', 'TEXT'),
  },
  {
    table: 'Drama_assetStatus',
    sql: addColumn('Drama', 'assetStatus', `TEXT NOT NULL DEFAULT 'pending'`),
  },
  {
    table: 'Drama_defaultLockedConfig',
    sql: addColumn('Drama', 'defaultLockedConfig', `TEXT NOT NULL DEFAULT 'null'`),
  },
  {
    table: 'Drama_styleTemplate',
    sql: addColumn('Drama', 'styleTemplate', `TEXT NOT NULL DEFAULT ''`),
  },
  {
    table: 'Drama_seriesId',
    sql: addColumn('Drama', 'seriesId', 'TEXT'),
  },
  {
    table: 'Drama_seriesId_fkey',
    sql: addFkConstraint('Drama_seriesId_fkey', 'Drama', 'seriesId', 'Series', 'id', 'SET NULL', 'CASCADE'),
  },
  {
    table: 'Drama_seriesId_idx',
    sql: `CREATE INDEX IF NOT EXISTS "Drama_seriesId_idx" ON "Drama"("seriesId");`,
  },

  // ---- Episode: new columns ----
  {
    table: 'Episode_sourceChapterIds',
    sql: addColumn('Episode', 'sourceChapterIds', `TEXT NOT NULL DEFAULT '[]'`),
  },
  {
    table: 'Episode_globalAssetsImported',
    sql: addColumn('Episode', 'globalAssetsImported', 'BOOLEAN NOT NULL DEFAULT false'),
  },
  {
    table: 'Episode_lockedConfig',
    sql: addColumn('Episode', 'lockedConfig', `TEXT NOT NULL DEFAULT 'null'`),
  },
  {
    table: 'Episode_videoUrl',
    sql: addColumn('Episode', 'videoUrl', 'TEXT'),
  },
  {
    table: 'Episode_duration',
    sql: addColumn('Episode', 'duration', 'INTEGER NOT NULL DEFAULT 0'),
  },

  // ---- Character: new columns ----
  {
    table: 'Character_assetId',
    sql: addColumn('Character', 'assetId', 'TEXT'),
  },
  {
    table: 'Character_assetId_fkey',
    sql: addFkConstraint('Character_assetId_fkey', 'Character', 'assetId', 'Asset', 'id', 'SET NULL', 'CASCADE'),
  },
  {
    table: 'Character_styleLock',
    sql: addColumn('Character', 'styleLock', 'BOOLEAN NOT NULL DEFAULT false'),
  },
  {
    table: 'Character_lockedReferenceImage',
    sql: addColumn('Character', 'lockedReferenceImage', 'TEXT'),
  },
  {
    table: 'Character_visualFingerprint',
    sql: addColumn('Character', 'visualFingerprint', `TEXT NOT NULL DEFAULT '{}'`),
  },
  {
    table: 'Character_episodeIds',
    sql: addColumn('Character', 'episodeIds', `TEXT NOT NULL DEFAULT '[]'`),
  },

  // ---- Scene: new columns ----
  {
    table: 'Scene_assetId',
    sql: addColumn('Scene', 'assetId', 'TEXT'),
  },
  {
    table: 'Scene_assetId_fkey',
    sql: addFkConstraint('Scene_assetId_fkey', 'Scene', 'assetId', 'Asset', 'id', 'SET NULL', 'CASCADE'),
  },
  {
    table: 'Scene_styleLock',
    sql: addColumn('Scene', 'styleLock', 'BOOLEAN NOT NULL DEFAULT false'),
  },
  {
    table: 'Scene_lockedReferenceImage',
    sql: addColumn('Scene', 'lockedReferenceImage', 'TEXT'),
  },
  {
    table: 'Scene_episodeIds',
    sql: addColumn('Scene', 'episodeIds', `TEXT NOT NULL DEFAULT '[]'`),
  },

  // ---- Storyboard: new columns ----
  {
    table: 'Storyboard_atmosphere',
    sql: addColumn('Storyboard', 'atmosphere', 'TEXT'),
  },
  {
    table: 'Storyboard_firstFrameUrl',
    sql: addColumn('Storyboard', 'firstFrameUrl', 'TEXT'),
  },
  {
    table: 'Storyboard_lastFrameUrl',
    sql: addColumn('Storyboard', 'lastFrameUrl', 'TEXT'),
  },
  {
    table: 'Storyboard_composedUrl',
    sql: addColumn('Storyboard', 'composedUrl', 'TEXT'),
  },
  {
    table: 'Storyboard_bgmPrompt',
    sql: addColumn('Storyboard', 'bgmPrompt', 'TEXT'),
  },
  {
    table: 'Storyboard_soundEffect',
    sql: addColumn('Storyboard', 'soundEffect', 'TEXT'),
  },
  {
    table: 'Storyboard_referenceImages',
    sql: addColumn('Storyboard', 'referenceImages', 'TEXT'),
  },

  // ---- Prop: new column ----
  {
    table: 'Prop_assetId',
    sql: addColumn('Prop', 'assetId', 'TEXT'),
  },
  {
    table: 'Prop_assetId_fkey',
    sql: addFkConstraint('Prop_assetId_fkey', 'Prop', 'assetId', 'Asset', 'id', 'SET NULL', 'CASCADE'),
  },

  // ---- Asset: new columns (for older databases) ----
  {
    table: 'Asset_subcategory',
    sql: addColumn('Asset', 'subcategory', 'TEXT'),
  },
  {
    table: 'Asset_imagePrompt',
    sql: addColumn('Asset', 'imagePrompt', 'TEXT'),
  },
  {
    table: 'Asset_imageUrls',
    sql: addColumn('Asset', 'imageUrls', `TEXT NOT NULL DEFAULT '[]'`),
  },
  {
    table: 'Asset_data',
    sql: addColumn('Asset', 'data', `TEXT NOT NULL DEFAULT '{}'`),
  },

  // ==========================================================
  // SECTION 4: Collaboration & other tables (from original migrate)
  // ==========================================================

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

// Required tables (from Prisma schema) — all 33 models
const REQUIRED_TABLES = [
  // Core models
  'User', 'Drama', 'Episode', 'Character', 'Scene', 'Storyboard', 'Prop',
  // Asset & media
  'Asset', 'Novel', 'CharacterAppearance', 'SceneImage',
  // Generation tracking
  'ImageGeneration', 'VideoGeneration', 'VideoMerge', 'TtsGeneration', 'GenerationCost',
  // AI configuration
  'AiProvider', 'UserProvider', 'AgentConfig',
  // Collaboration
  'DramaMember', 'Comment', 'Presence', 'ResourceLock', 'Activity',
  // IP/Series
  'Series', 'SeriesMember',
  // Budget
  'Budget', 'BudgetAlert',
  // Marketplace
  'CharacterTemplate', 'TemplatePurchase', 'TemplateReview',
  // Publishing
  'PublishRecord', 'PublishConfig',
]

// New columns that should exist on existing tables
const REQUIRED_COLUMNS: Record<string, string[]> = {
  'Drama': ['novelSource', 'novelParsed', 'artStyle', 'assetStatus', 'defaultLockedConfig', 'styleTemplate', 'seriesId'],
  'Episode': ['sourceChapterIds', 'globalAssetsImported', 'lockedConfig', 'videoUrl', 'duration'],
  'Character': ['assetId', 'styleLock', 'lockedReferenceImage', 'visualFingerprint', 'episodeIds'],
  'Scene': ['assetId', 'styleLock', 'lockedReferenceImage', 'episodeIds'],
  'Storyboard': ['atmosphere', 'firstFrameUrl', 'lastFrameUrl', 'composedUrl', 'bgmPrompt', 'soundEffect', 'referenceImages'],
  'Prop': ['assetId'],
  'Asset': ['subcategory', 'imagePrompt', 'imageUrls', 'data'],
}

// ============================================================
// POST /api/migrate - Execute all pending migrations
// ============================================================
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

    console.log('[migrate] Starting comprehensive SQL-based schema migration...')

    // Get existing tables
    const existingTables = await db.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `
    const existingTableNames = new Set(existingTables.map((t) => t.table_name))

    // Get existing columns for tables that need new columns
    const existingColumns: Record<string, Set<string>> = {}
    for (const table of Object.keys(REQUIRED_COLUMNS)) {
      if (existingTableNames.has(table)) {
        try {
          const cols = await db.$queryRaw<Array<{ column_name: string }>>`
            SELECT column_name FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = ${table}
          `
          existingColumns[table] = new Set(cols.map((c) => c.column_name))
        } catch {
          existingColumns[table] = new Set()
        }
      } else {
        existingColumns[table] = new Set()
      }
    }

    const results: { name: string; status: string; error?: string }[] = []

    for (const migration of MIGRATIONS) {
      const isTableCreation = migration.sql.includes('CREATE TABLE IF NOT EXISTS')
      const isAlterColumn = migration.sql.includes('ADD COLUMN IF NOT EXISTS')
      const isFkConstraint = migration.sql.includes('pg_constraint')
      const isIndex = migration.sql.includes('CREATE INDEX IF NOT EXISTS')

      // Skip table creation if table already exists
      if (isTableCreation && existingTableNames.has(migration.table)) {
        results.push({ name: migration.table, status: 'skipped (table exists)' })
        continue
      }

      // Skip ADD COLUMN if column already exists
      if (isAlterColumn) {
        // Parse table and column name from migration entry like "Drama_novelSource"
        const parts = migration.table.split('_')
        const tableName = parts[0]
        const columnName = parts.slice(1).join('_')

        if (existingColumns[tableName]?.has(columnName)) {
          results.push({ name: migration.table, status: 'skipped (column exists)' })
          continue
        }

        // Also handle special cases like "Character_styleLock" → Character table, styleLock column
        // and "Scene_assetId" → Scene table, assetId column
        for (const [tbl, cols] of Object.entries(REQUIRED_COLUMNS)) {
          if (migration.table.startsWith(tbl + '_')) {
            const col = migration.table.substring(tbl.length + 1)
            if (existingColumns[tbl]?.has(col)) {
              results.push({ name: migration.table, status: 'skipped (column exists)' })
              continue
            }
          }
        }
      }

      // Skip FK constraint if already exists (the DO $$ block handles this)
      // Skip index if already exists (CREATE INDEX IF NOT EXISTS handles this)

      try {
        await db.$executeRawUnsafe(migration.sql)
        results.push({ name: migration.table, status: 'ok' })
        console.log(`[migrate] + ${migration.table}`)
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        results.push({ name: migration.table, status: 'error', error: msg.slice(0, 300) })
        console.warn(`[migrate] x ${migration.table}: ${msg.slice(0, 300)}`)
      }
    }

    // Verify final state
    const finalTables = await db.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `
    const finalTableNames = finalTables.map((t) => t.table_name)
    const missingTables = REQUIRED_TABLES.filter((t) => !finalTableNames.includes(t))

    // Verify columns
    const missingColumns: Record<string, string[]> = {}
    for (const [table, columns] of Object.entries(REQUIRED_COLUMNS)) {
      if (!finalTableNames.includes(table)) continue
      try {
        const cols = await db.$queryRaw<Array<{ column_name: string }>>`
          SELECT column_name FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = ${table}
        `
        const existingColNames = new Set(cols.map((c) => c.column_name))
        const missing = columns.filter((c) => !existingColNames.has(c))
        if (missing.length > 0) {
          missingColumns[table] = missing
        }
      } catch {
        missingColumns[table] = columns
      }
    }

    const hasErrors = missingTables.length > 0 || Object.keys(missingColumns).length > 0

    return NextResponse.json({
      status: hasErrors ? 'partial' : 'ok',
      message: hasErrors
        ? `Missing: tables=[${missingTables.join(', ')}] columns=${JSON.stringify(missingColumns)}`
        : 'All migrations applied successfully',
      applied: results.filter((r) => r.status === 'ok').length,
      skipped: results.filter((r) => r.status.startsWith('skipped')).length,
      errors: results.filter((r) => r.status === 'error'),
      tables: finalTableNames,
      missingTables,
      missingColumns,
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

// ============================================================
// GET /api/migrate - Check migration status
// ============================================================
export async function GET() {
  const dbUrl = process.env.DATABASE_URL || ''
  const isPostgres = dbUrl.startsWith('postgresql://') || dbUrl.startsWith('postgres://')

  try {
    if (isPostgres) {
      const tables = await db.$queryRaw<Array<{ table_name: string }>>`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public'
        ORDER BY table_name
      `
      const tableNames = tables.map((t) => t.table_name)
      const existingTables = REQUIRED_TABLES.filter((t) => tableNames.includes(t))
      const missingTables = REQUIRED_TABLES.filter((t) => !tableNames.includes(t))

      // Check required columns
      const columnStatus: Record<string, { existing: string[]; missing: string[] }> = {}
      for (const [table, columns] of Object.entries(REQUIRED_COLUMNS)) {
        if (!tableNames.includes(table)) {
          columnStatus[table] = { existing: [], missing: columns }
          continue
        }
        try {
          const cols = await db.$queryRaw<Array<{ column_name: string }>>`
            SELECT column_name FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = ${table}
          `
          const existingColNames = new Set(cols.map((c) => c.column_name))
          columnStatus[table] = {
            existing: columns.filter((c) => existingColNames.has(c)),
            missing: columns.filter((c) => !existingColNames.has(c)),
          }
        } catch {
          columnStatus[table] = { existing: [], missing: columns }
        }
      }

      const allColumnsOk = Object.values(columnStatus).every((v) => v.missing.length === 0)
      const allOk = missingTables.length === 0 && allColumnsOk

      return NextResponse.json({
        status: allOk ? 'ok' : 'needs_migration',
        message: allOk
          ? 'All tables and columns exist'
          : missingTables.length > 0
            ? `Missing tables: ${missingTables.join(', ')}`
            : `Missing columns: ${JSON.stringify(Object.fromEntries(Object.entries(columnStatus).filter(([, v]) => v.missing.length > 0).map(([k, v]) => [k, v.missing])))}`,
        provider: 'PostgreSQL',
        existingTables,
        missingTables,
        columnStatus,
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
