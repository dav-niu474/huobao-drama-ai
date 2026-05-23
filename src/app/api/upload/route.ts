// ============================================================
// General File Upload API
// POST /api/upload
// Accepts a media file (image/video/audio) via FormData,
// saves it to file storage, and updates the corresponding
// database record (Storyboard / Character / Scene / Prop).
//
// v0.7: Saves files to disk/Vercel Blob instead of base64
// data URLs, dramatically reducing database size.
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { saveMediaFile, isDataUrl, migrateDataUrlToFile } from '@/lib/file-storage'

const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50 MB (videos can be large)

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg']
const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.mov', '.avi', '.mkv']
const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.webm']

function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.')
  if (lastDot === -1) return ''
  return filename.slice(lastDot).toLowerCase()
}

function getMediaType(ext: string): 'image' | 'video' | 'audio' | 'unknown' {
  if (IMAGE_EXTENSIONS.includes(ext)) return 'image'
  if (VIDEO_EXTENSIONS.includes(ext)) return 'video'
  if (AUDIO_EXTENSIONS.includes(ext)) return 'audio'
  return 'unknown'
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file')

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: '未提供文件，请上传文件（字段名: file）' },
        { status: 400 }
      )
    }

    const fileName = file.name
    const fileSize = file.size
    const ext = getFileExtension(fileName)
    const mediaType = getMediaType(ext)

    // Validate file size
    if (fileSize > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `文件过大: ${(fileSize / 1024 / 1024).toFixed(1)}MB。最大允许: ${MAX_FILE_SIZE / 1024 / 1024}MB` },
        { status: 400 }
      )
    }

    // Read file buffer
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const mimeType = file.type || (mediaType === 'image' ? 'image/png' : mediaType === 'video' ? 'video/mp4' : 'audio/mpeg')

    // Determine which record to update based on options
    const storyboardId = formData.get('storyboardId') as string | null
    const characterId = formData.get('characterId') as string | null
    const sceneId = formData.get('sceneId') as string | null
    const propId = formData.get('propId') as string | null
    const fieldType = formData.get('fieldType') as string | null

    // Resolve dramaId for file path organization
    let dramaId = formData.get('dramaId') as string | null
    if (!dramaId) {
      if (storyboardId) {
        const sb = await db.storyboard.findUnique({ where: { id: storyboardId }, select: { episode: { select: { dramaId: true } } } })
        if (sb) dramaId = sb.episode.dramaId
      } else if (characterId) {
        const ch = await db.character.findUnique({ where: { id: characterId }, select: { dramaId: true } })
        if (ch) dramaId = ch.dramaId
      } else if (sceneId) {
        const sc = await db.scene.findUnique({ where: { id: sceneId }, select: { dramaId: true } })
        if (sc) dramaId = sc.dramaId
      } else if (propId) {
        const pr = await db.prop.findUnique({ where: { id: propId }, select: { dramaId: true } })
        if (pr) dramaId = pr.dramaId
      }
    }

    // Save file to storage
    const category = mediaType === 'video' ? 'videos' : mediaType === 'audio' ? 'audio' : 'images'
    const saveResult = await saveMediaFile(buffer, {
      mimeType,
      category: 'uploads',
      dramaId: dramaId || undefined,
      filename: fileName.replace(/\.[^.]+$/, ''), // strip extension
    })

    const fileUrl = saveResult.url

    // ── Update Storyboard ─────────────────────────────────
    if (storyboardId) {
      const storyboard = await db.storyboard.findUnique({ where: { id: storyboardId } })
      if (!storyboard) {
        return NextResponse.json({ error: '分镜不存在' }, { status: 404 })
      }

      const updateField = mapStoryboardField(fieldType, mediaType)
      if (!updateField) {
        return NextResponse.json(
          { error: `无效的 fieldType: ${fieldType}` },
          { status: 400 }
        )
      }

      const updated = await db.storyboard.update({
        where: { id: storyboardId },
        data: { [updateField]: fileUrl },
      })

      return NextResponse.json({
        url: fileUrl,
        storyboard: updated,
        mediaType,
        fileName,
        fileSize,
      })
    }

    // ── Update Character ──────────────────────────────────
    if (characterId) {
      const character = await db.character.findUnique({ where: { id: characterId } })
      if (!character) {
        return NextResponse.json({ error: '角色不存在' }, { status: 404 })
      }

      const updated = await db.character.update({
        where: { id: characterId },
        data: { imageUrl: fileUrl },
      })

      return NextResponse.json({
        url: fileUrl,
        character: updated,
        mediaType,
        fileName,
        fileSize,
      })
    }

    // ── Update Scene ──────────────────────────────────────
    if (sceneId) {
      const scene = await db.scene.findUnique({ where: { id: sceneId } })
      if (!scene) {
        return NextResponse.json({ error: '场景不存在' }, { status: 404 })
      }

      const updated = await db.scene.update({
        where: { id: sceneId },
        data: { imageUrl: fileUrl },
      })

      return NextResponse.json({
        url: fileUrl,
        scene: updated,
        mediaType,
        fileName,
        fileSize,
      })
    }

    // ── Update Prop ───────────────────────────────────────
    if (propId) {
      const prop = await db.prop.findUnique({ where: { id: propId } })
      if (!prop) {
        return NextResponse.json({ error: '道具不存在' }, { status: 404 })
      }

      const updated = await db.prop.update({
        where: { id: propId },
        data: { imageUrl: fileUrl },
      })

      return NextResponse.json({
        url: fileUrl,
        prop: updated,
        mediaType,
        fileName,
        fileSize,
      })
    }

    // ── No target specified — just return the file URL ────
    return NextResponse.json({
      url: fileUrl,
      mediaType,
      fileName,
      fileSize,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[upload] Failed:', message)
    return NextResponse.json(
      { error: '文件上传失败', detail: message },
      { status: 500 }
    )
  }
}

/**
 * Map fieldType to Storyboard database field name.
 */
function mapStoryboardField(
  fieldType: string | null,
  mediaType: 'image' | 'video' | 'audio' | 'unknown'
): string | null {
  if (!fieldType) {
    // Auto-detect based on media type
    if (mediaType === 'video') return 'videoUrl'
    if (mediaType === 'audio') return 'ttsAudioUrl'
    return 'firstFrameUrl' // default for images
  }

  const fieldMap: Record<string, string> = {
    firstFrameUrl: 'firstFrameUrl',
    lastFrameUrl: 'lastFrameUrl',
    videoUrl: 'videoUrl',
    ttsAudioUrl: 'ttsAudioUrl',
    composedUrl: 'composedUrl',
    // Shorthand aliases
    firstFrame: 'firstFrameUrl',
    lastFrame: 'lastFrameUrl',
    video: 'videoUrl',
    audio: 'ttsAudioUrl',
    tts: 'ttsAudioUrl',
    composed: 'composedUrl',
  }

  return fieldMap[fieldType] || null
}
