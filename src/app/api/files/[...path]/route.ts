// ============================================================
// File Serving Route
// GET /api/files/dramas/{dramaId}/{category}/{filename}
// Serves locally-stored media files from the uploads directory.
// This is the local development alternative to Vercel Blob URLs.
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { readFile, stat } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'
import { getUploadDir } from '@/lib/file-storage'

// MIME type mapping for common extensions
const EXT_TO_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path: pathParts } = await params

    // Security: prevent path traversal
    const safePath = pathParts
      .filter((p) => !p.includes('..') && !p.includes('\0'))
      .join('/')

    if (!safePath) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
    }

    const uploadDir = getUploadDir()
    const filePath = path.join(uploadDir, safePath)

    // Ensure the resolved path is within the upload directory
    const resolvedPath = path.resolve(filePath)
    const resolvedUploadDir = path.resolve(uploadDir)
    if (!resolvedPath.startsWith(resolvedUploadDir)) {
      return NextResponse.json({ error: 'Path traversal denied' }, { status: 403 })
    }

    if (!existsSync(resolvedPath)) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }

    // Read file
    const buffer = await readFile(resolvedPath)
    const fileStat = await stat(resolvedPath)

    // Determine MIME type from extension
    const ext = path.extname(resolvedPath).toLowerCase()
    const mimeType = EXT_TO_MIME[ext] || 'application/octet-stream'

    // Build response with caching headers
    const response = new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': mimeType,
        'Content-Length': String(buffer.length),
        'Cache-Control': 'public, max-age=86400, immutable', // Cache for 24h
        'Last-Modified': fileStat.mtime.toUTCString(),
      },
    })

    return response
  } catch (error) {
    console.error('[files] Error serving file:', error)
    return NextResponse.json(
      { error: 'Failed to serve file' },
      { status: 500 }
    )
  }
}
