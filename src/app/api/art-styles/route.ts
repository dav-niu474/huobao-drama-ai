// ============================================================
// Art Styles — List, Create, Sync
// GET  /api/art-styles              — List all art styles
// GET  /api/art-styles?action=sync  — Sync from data/art-styles/ directory
// POST /api/art-styles              — Create a new art style
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { readdir, readFile, stat } from 'fs/promises'
import { join } from 'path'

// ── GET: List art styles or sync from filesystem ────────────

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const action = searchParams.get('action')

    // Sync from filesystem
    if (action === 'sync') {
      return await syncFromFilesystem()
    }

    // List all art styles
    const artStyles = await db.artStyle.findMany({
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    })

    return NextResponse.json({ artStyles })
  } catch (error: any) {
    console.error('[art-styles] GET error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// ── POST: Create a new art style ─────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const body = await req.json()
    const { key, name, category, description, prefixMd, styleMeta, previewUrl, isActive } = body

    if (!key || !name) {
      return NextResponse.json({ error: 'key 和 name 为必填项' }, { status: 400 })
    }

    const artStyle = await db.artStyle.create({
      data: {
        key,
        name,
        category: category || '2D',
        description: description || null,
        prefixMd: prefixMd || null,
        styleMeta: styleMeta ? JSON.stringify(styleMeta) : null,
        previewUrl: previewUrl || null,
        isActive: isActive !== undefined ? isActive : true,
        isBuiltin: false,
      },
    })

    return NextResponse.json({ artStyle }, { status: 201 })
  } catch (error: any) {
    console.error('[art-styles] POST error:', error)
    if (error.code === 'P2002') {
      return NextResponse.json({ error: '该 key 已存在' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// ── Helper: Sync art styles from data/art-styles/ ────────────

async function syncFromFilesystem() {
  const artStylesDir = join(process.cwd(), 'data', 'art-styles')

  let dirs: string[]
  try {
    dirs = (await readdir(artStylesDir, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
  } catch {
    return NextResponse.json({ error: 'data/art-styles/ 目录不存在' }, { status: 404 })
  }

  let created = 0
  let updated = 0

  for (const dirName of dirs) {
    const dirPath = join(artStylesDir, dirName)

    // Read prefix.md
    let prefixMd: string | null = null
    try {
      prefixMd = await readFile(join(dirPath, 'prefix.md'), 'utf-8')
    } catch {
      // No prefix.md, skip
    }

    // Read README.md for description
    let description: string | null = null
    try {
      const readme = await readFile(join(dirPath, 'README.md'), 'utf-8')
      // Extract first paragraph as description
      const lines = readme.split('\n').filter((l) => l.trim() && !l.startsWith('#'))
      description = lines.slice(0, 3).join(' ').trim().slice(0, 500) || null
    } catch {
      // No README
    }

    // Parse category from directory name (e.g., "2D_mature_urban_romance" → "2D")
    const category = dirName.split('_')[0] === '3D' ? '3D' : dirName.split('_')[0] === 'realpeople' ? 'realpeople' : '2D'

    // Build display name from directory name
    const name = dirName
      .replace(/^[23]D_|^realpeople_/, '')
      .split('_')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ')

    // Check for preview image
    let previewUrl: string | null = null
    try {
      const imagesDir = join(dirPath, 'images')
      const imageFiles = await readdir(imagesDir)
      const firstImage = imageFiles.find((f) => /\.(png|jpg|jpeg|webp)$/i.test(f))
      if (firstImage) {
        previewUrl = `/api/files/art-styles/${dirName}/images/${firstImage}`
      }
    } catch {
      // No images directory
    }

    // Upsert
    const existing = await db.artStyle.findUnique({ where: { key: dirName } })
    if (existing) {
      await db.artStyle.update({
        where: { key: dirName },
        data: {
          name,
          category,
          description: description || existing.description,
          prefixMd: prefixMd || existing.prefixMd,
          previewUrl: previewUrl || existing.previewUrl,
          isBuiltin: true,
        },
      })
      updated++
    } else {
      await db.artStyle.create({
        data: {
          key: dirName,
          name,
          category,
          description,
          prefixMd,
          previewUrl,
          isActive: true,
          isBuiltin: true,
        },
      })
      created++
    }
  }

  const total = await db.artStyle.count()
  return NextResponse.json({ synced: dirs.length, created, updated, total })
}
