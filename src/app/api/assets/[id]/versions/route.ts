// ============================================================
// Asset Versions — List, Create, Rollback
// GET  /api/assets/[id]/versions                       — List versions
// POST /api/assets/[id]/versions                       — Create new version
// POST /api/assets/[id]/versions { action: 'rollback' } — Rollback to version
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

// ── GET: List all versions of an asset ───────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const { id } = await params

    const asset = await db.asset.findUnique({ where: { id } })
    if (!asset) {
      return NextResponse.json({ error: '资产不存在' }, { status: 404 })
    }

    // Since we don't have a dedicated AssetVersion table in the Prisma schema,
    // we'll use a lightweight JSON-based versioning approach stored in the asset's data field.
    // Versions are stored as: data.__versions = [{ version, snapshot, changeDescription, createdAt }]
    const data = JSON.parse(asset.data || '{}')
    const versions = data.__versions || []

    return NextResponse.json({ versions })
  } catch (error: any) {
    console.error('[assets/[id]/versions] GET error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// ── POST: Create new version or rollback ─────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const userId = (session.user as any).id
    const { id } = await params

    const asset = await db.asset.findUnique({ where: { id } })
    if (!asset) {
      return NextResponse.json({ error: '资产不存在' }, { status: 404 })
    }

    if (asset.userId !== userId) {
      return NextResponse.json({ error: '只能操作自己的资产' }, { status: 403 })
    }

    const body = await req.json()
    const { action, changeDescription, versionId } = body

    const data = JSON.parse(asset.data || '{}')
    const versions = data.__versions || []

    // Rollback
    if (action === 'rollback') {
      if (!versionId) {
        return NextResponse.json({ error: 'versionId 为必填项' }, { status: 400 })
      }

      const targetVersion = versions.find((v: any) => v.id === versionId)
      if (!targetVersion) {
        return NextResponse.json({ error: '版本不存在' }, { status: 404 })
      }

      // Restore asset from snapshot
      const snapshot = JSON.parse(targetVersion.snapshot || '{}')
      const restoredData = { ...snapshot, __versions: versions }

      await db.asset.update({
        where: { id },
        data: {
          data: JSON.stringify(restoredData),
          name: snapshot.name || asset.name,
          description: snapshot.description || asset.description,
          imagePrompt: snapshot.imagePrompt || asset.imagePrompt,
          thumbnail: snapshot.thumbnail || asset.thumbnail,
        },
      })

      const updatedAsset = await db.asset.findUnique({
        where: { id },
        include: { user: { select: { id: true, name: true } } },
      })

      return NextResponse.json({ success: true, asset: updatedAsset })
    }

    // Create new version (auto-archive current)
    const currentSnapshot = {
      name: asset.name,
      description: asset.description,
      category: asset.category,
      subcategory: asset.subcategory,
      tags: asset.tags,
      thumbnail: asset.thumbnail,
      imagePrompt: asset.imagePrompt,
      imageUrls: asset.imageUrls,
      ...Object.fromEntries(
        Object.entries(data).filter(([k]) => k !== '__versions')
      ),
    }

    const newVersion = {
      id: `v_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      version: versions.length + 1,
      snapshot: JSON.stringify(currentSnapshot),
      changeDescription: changeDescription || `Version ${versions.length + 1}`,
      createdBy: userId,
      createdAt: new Date().toISOString(),
    }

    versions.push(newVersion)
    data.__versions = versions

    await db.asset.update({
      where: { id },
      data: { data: JSON.stringify(data) },
    })

    return NextResponse.json({ version: newVersion })
  } catch (error: any) {
    console.error('[assets/[id]/versions] POST error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
