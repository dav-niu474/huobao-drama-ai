// ============================================================
// File Storage Abstraction
// Saves media files to local filesystem or Vercel Blob,
// returning URL paths instead of base64 data URLs.
// This dramatically reduces database size (from MB-scale
// base64 blobs to short path strings).
// ============================================================

import { writeFile, mkdir, unlink, readFile } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'

// ============================================================
// Types
// ============================================================

export type StorageBackend = 'local' | 'vercel-blob'

export interface SaveOptions {
  /** MIME type, e.g. 'image/png', 'video/mp4', 'audio/mpeg' */
  mimeType: string
  /** Logical category: 'characters' | 'scenes' | 'storyboards' | 'props' | 'grid' | 'general' */
  category: string
  /** Drama ID for path organization */
  dramaId?: string
  /** Optional custom filename (without extension). Auto-generated if omitted. */
  filename?: string
  /** Optional subfolder within the category */
  subfolder?: string
}

export interface SaveResult {
  /** The URL path to access the file (e.g. '/api/files/dramas/abc/characters/xyz.png') */
  url: string
  /** The storage backend used */
  backend: StorageBackend
  /** The original filename */
  filename: string
  /** File size in bytes */
  size: number
}

// ============================================================
// Configuration
// ============================================================

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), 'data', 'uploads')
const STORAGE_MODE: StorageBackend = (process.env.STORAGE_MODE as StorageBackend) || 'local'

// Map MIME types to file extensions
const MIME_TO_EXT: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
  'audio/mpeg': '.mp3',
  'audio/wav': '.wav',
  'audio/ogg': '.ogg',
  'audio/mp4': '.m4a',
  'audio/aac': '.aac',
  'audio/webm': '.webm',
}

function getExtension(mimeType: string): string {
  return MIME_TO_EXT[mimeType] || '.bin'
}

// ============================================================
// Local Filesystem Storage
// ============================================================

/**
 * Build the relative file path for local storage.
 * Structure: dramas/{dramaId}/{category}/{subfolder?}/{filename}.{ext}
 */
function buildLocalPath(options: SaveOptions, ext: string): string {
  const parts = ['dramas']
  if (options.dramaId) parts.push(options.dramaId)
  parts.push(options.category)
  if (options.subfolder) parts.push(options.subfolder)
  const fileName = options.filename || `${Date.now()}_${randomUUID().slice(0, 8)}`
  parts.push(`${fileName}${ext}`)
  return path.join(...parts)
}

/**
 * Save a file to the local filesystem.
 * Creates directories as needed.
 */
async function saveToLocal(buffer: Buffer, options: SaveOptions): Promise<SaveResult> {
  const ext = getExtension(options.mimeType)
  const relativePath = buildLocalPath(options, ext)
  const absolutePath = path.join(UPLOAD_DIR, relativePath)

  // Ensure directory exists
  const dir = path.dirname(absolutePath)
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true })
  }

  // Write file
  await writeFile(absolutePath, buffer)

  // Return URL path (served via /api/files/[...path] route)
  const url = `/api/files/${relativePath.replace(/\\/g, '/')}`

  return {
    url,
    backend: 'local',
    filename: path.basename(relativePath),
    size: buffer.length,
  }
}

/**
 * Delete a file from local storage.
 */
async function deleteFromLocal(urlPath: string): Promise<void> {
  // Extract relative path from URL: /api/files/dramas/... → dramas/...
  const relativePath = urlPath.replace(/^\/api\/files\//, '')
  const absolutePath = path.join(UPLOAD_DIR, relativePath)

  if (existsSync(absolutePath)) {
    await unlink(absolutePath)
  }
}

/**
 * Read a file from local storage.
 */
async function readFromLocal(urlPath: string): Promise<Buffer | null> {
  const relativePath = urlPath.replace(/^\/api\/files\//, '')
  const absolutePath = path.join(UPLOAD_DIR, relativePath)

  if (!existsSync(absolutePath)) {
    return null
  }

  return readFile(absolutePath)
}

// ============================================================
// Vercel Blob Storage (stub — activated when @vercel/blob is installed)
// ============================================================

async function saveToVercelBlob(buffer: Buffer, options: SaveOptions): Promise<SaveResult> {
  try {
    // @ts-expect-error — @vercel/blob is optional, only available on Vercel
    const { put } = await import('@vercel/blob')
    const ext = getExtension(options.mimeType)
    const fileName = options.filename || `${Date.now()}_${randomUUID().slice(0, 8)}`
    const blobPath = `dramas/${options.dramaId || 'general'}/${options.category}/${fileName}${ext}`

    const blob = await put(blobPath, buffer, {
      contentType: options.mimeType,
      access: 'public',
    })

    return {
      url: blob.url,
      backend: 'vercel-blob',
      filename: path.basename(blobPath),
      size: buffer.length,
    }
  } catch (importError) {
    // @vercel/blob not available, fall back to local storage
    console.warn('[file-storage] @vercel/blob not available, falling back to local storage')
    return saveToLocal(buffer, options)
  }
}

async function deleteFromVercelBlob(url: string): Promise<void> {
  try {
    // @ts-expect-error — @vercel/blob is optional, only available on Vercel
    const { del } = await import('@vercel/blob')
    await del(url)
  } catch {
    // Silently ignore if blob storage not available
  }
}

// ============================================================
// Public API
// ============================================================

/**
 * Save a media file and return a URL path.
 * Auto-selects storage backend based on environment.
 *
 * @param data - File content as Buffer or base64 string (without data: prefix)
 * @param options - Save options (mimeType, category, etc.)
 * @returns SaveResult with URL and metadata
 */
export async function saveMediaFile(
  data: Buffer | string,
  options: SaveOptions
): Promise<SaveResult> {
  // Convert base64 to Buffer if needed
  const buffer = typeof data === 'string' ? Buffer.from(data, 'base64') : data

  if (STORAGE_MODE === 'vercel-blob') {
    return saveToVercelBlob(buffer, options)
  }

  return saveToLocal(buffer, options)
}

/**
 * Save a data URL (data:image/png;base64,...) to file storage.
 * Extracts the base64 content and saves it as a file.
 *
 * @param dataUrl - Full data URL string
 * @param options - Save options (mimeType overridden from data URL)
 * @returns SaveResult with URL and metadata
 */
export async function saveDataUrl(
  dataUrl: string,
  options: Omit<SaveOptions, 'mimeType'>
): Promise<SaveResult> {
  // Parse data URL: data:<mimeType>;base64,<data>
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/)
  if (!match) {
    throw new Error(`Invalid data URL format (expected data:<mime>;base64,<data>)`)
  }

  const mimeType = match[1]
  const base64Data = match[2]

  return saveMediaFile(base64Data, { ...options, mimeType })
}

/**
 * Delete a file from storage by its URL.
 */
export async function deleteMediaFile(url: string): Promise<void> {
  if (url.startsWith('/api/files/')) {
    await deleteFromLocal(url)
  } else if (url.startsWith('https://') && url.includes('blob.vercel-storage.com')) {
    await deleteFromVercelBlob(url)
  }
}

/**
 * Read a file from local storage by URL path.
 * Returns null if file doesn't exist.
 */
export async function readMediaFile(urlPath: string): Promise<Buffer | null> {
  if (urlPath.startsWith('/api/files/')) {
    return readFromLocal(urlPath)
  }
  return null
}

/**
 * Check if a URL is a file-storage URL (as opposed to a data URL or external URL).
 */
export function isFileStorageUrl(url: string | null | undefined): boolean {
  if (!url) return false
  return url.startsWith('/api/files/') || url.includes('blob.vercel-storage.com')
}

/**
 * Check if a URL is a base64 data URL.
 */
export function isDataUrl(url: string | null | undefined): boolean {
  if (!url) return false
  return url.startsWith('data:')
}

/**
 * Convert an existing data URL to file storage.
 * If the URL is already a file path, returns it unchanged.
 * If it's a data URL, saves it to storage and returns the new path.
 */
export async function migrateDataUrlToFile(
  url: string | null | undefined,
  options: Omit<SaveOptions, 'mimeType'>
): Promise<string | null> {
  if (!url) return null
  if (isFileStorageUrl(url)) return url
  if (!isDataUrl(url)) return url // External URL, leave as-is

  const result = await saveDataUrl(url, options)
  return result.url
}

/**
 * Get the storage backend currently in use.
 */
export function getStorageBackend(): StorageBackend {
  return STORAGE_MODE
}

/**
 * Get the upload directory path (for health checks / admin info).
 */
export function getUploadDir(): string {
  return UPLOAD_DIR
}
