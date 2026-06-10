// ============================================================
// Jianying Export — Export to Jianying (剪映) draft format
// Also supports SRT, ASS, and FCPXML export
// ============================================================

import { db } from '@/lib/db'
import { generateSRT, PATHS, ensureStorageDirs } from '@/lib/ffmpeg'
import { promises as fs } from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'

// ── Types ──────────────────────────────────────────────────────

export interface JianyingExportResult {
  zipPath: string
  episodeTitle: string
  shotCount: number
  duration: number
}

export interface SubtitleExportResult {
  filePath: string
  format: 'srt' | 'ass'
  entryCount: number
}

export interface FCPXMLExportResult {
  filePath: string
  episodeTitle: string
  shotCount: number
}

// ── Jianying Draft Format ──────────────────────────────────────

/**
 * Export episode to Jianying draft format as a ZIP file.
 * Contains: draft_content.json, draft_meta_info.json, Materials/
 */
export async function exportToJianying(episodeId: string): Promise<JianyingExportResult> {
  await ensureStorageDirs()

  const episode = await db.episode.findUnique({
    where: { id: episodeId },
    include: {
      storyboards: { orderBy: { shotNumber: 'asc' } },
      drama: true,
    },
  })

  if (!episode) {
    throw new Error(`Episode not found: ${episodeId}`)
  }

  const exportId = randomUUID()
  const exportDir = path.join(PATHS.composed, `jianying_${exportId}`)
  const materialsDir = path.join(exportDir, 'Materials')

  await fs.mkdir(exportDir, { recursive: true })
  await fs.mkdir(materialsDir, { recursive: true })

  // Build draft_content.json
  const tracks: any[] = []
  let currentTime = 0
  const materialsList: any[] = []
  const materialRefs: string[] = []

  for (const storyboard of episode.storyboards) {
    const materialId = randomUUID()
    const duration = (storyboard.duration || 3) * 1000000 // microseconds

    // Add material entry
    const material: any = {
      id: materialId,
      type: storyboard.videoUrl ? 'video' : 'image',
      path: '', // Will be relative
      duration: duration,
      width: 1080,
      height: 1920,
    }

    // Download media file to Materials dir if available
    if (storyboard.videoUrl) {
      const fileName = `shot_${storyboard.shotNumber}_video.mp4`
      try {
        const { downloadFile } = await import('@/lib/ffmpeg')
        await downloadFile(storyboard.videoUrl, path.join(materialsDir, fileName))
        material.path = `Materials/${fileName}`
      } catch {
        material.path = storyboard.videoUrl
      }
    } else if (storyboard.firstFrameUrl) {
      const fileName = `shot_${storyboard.shotNumber}_image.png`
      try {
        const { downloadFile } = await import('@/lib/ffmpeg')
        await downloadFile(storyboard.firstFrameUrl, path.join(materialsDir, fileName))
        material.path = `Materials/${fileName}`
      } catch {
        material.path = storyboard.firstFrameUrl
      }
    }

    materialsList.push(material)
    materialRefs.push(materialId)

    // Add video/image track segment
    tracks.push({
      id: randomUUID(),
      type: storyboard.videoUrl ? 'video' : 'image',
      material_id: materialId,
      target_timerange: {
        start: currentTime,
        duration: duration,
      },
      source_timerange: {
        start: 0,
        duration: duration,
      },
    })

    // Add audio track if TTS available
    if (storyboard.ttsAudioUrl) {
      const audioMaterialId = randomUUID()
      const audioFileName = `shot_${storyboard.shotNumber}_audio.mp3`
      try {
        const { downloadFile } = await import('@/lib/ffmpeg')
        await downloadFile(storyboard.ttsAudioUrl, path.join(materialsDir, audioFileName))
      } catch {
        // Skip if download fails
      }

      materialsList.push({
        id: audioMaterialId,
        type: 'audio',
        path: `Materials/${audioFileName}`,
        duration: duration,
      })

      tracks.push({
        id: randomUUID(),
        type: 'audio',
        material_id: audioMaterialId,
        target_timerange: {
          start: currentTime,
          duration: duration,
        },
        source_timerange: {
          start: 0,
          duration: duration,
        },
      })
    }

    currentTime += duration
  }

  const draftContent = {
    id: randomUUID(),
    name: episode.title || `Episode ${episode.episodeNumber}`,
    platform: 'mobile',
    materials: materialsList,
    tracks: tracks,
    canvas: {
      width: 1080,
      height: 1920,
    },
    duration: currentTime,
    create_time: Date.now(),
    update_time: Date.now(),
  }

  // Build draft_meta_info.json
  const draftMetaInfo = {
    draft_cloud_capcut_purchase_info: '',
    draft_cloud_last_action_download: false,
    draft_cloud_materials: [],
    draft_cloud_purchase_info: '',
    draft_cloud_template_id: '',
    draft_cloud_tutorial_info: '',
    draft_cloud_videocut_purchase_info: '',
    draft_cover: '',
    draft_deeplink_url: '',
    draft_enterprise_info: {
      draft_enterprise_extra: '',
      enterprise_id: '',
      shop_id: '',
    },
    draft_fold_path: '',
    draft_id: randomUUID(),
    draft_is_ai_shorts: false,
    draft_is_article_video_draft: false,
    draft_is_from_deeplink: false,
    draft_is_invisible: false,
    draft_materials_copied: false,
    draft_name: episode.title || `Episode ${episode.episodeNumber}`,
    draft_new_version: '',
    draft_removable_storage_device: '',
    draft_root_path: exportDir,
    draft_segment_extra_info: '',
    draft_timeline_materials_size_: 0,
    draft_type: 0,
    tm_draft_cloud_completed: '',
    tm_draft_cloud_modified: 0,
    tm_draft_create: Date.now(),
    tm_draft_modified: Date.now(),
    tm_draft_removed: 0,
    tm_duration: currentTime / 1000000,
  }

  // Write JSON files
  await fs.writeFile(
    path.join(exportDir, 'draft_content.json'),
    JSON.stringify(draftContent, null, 2),
    'utf-8'
  )

  await fs.writeFile(
    path.join(exportDir, 'draft_meta_info.json'),
    JSON.stringify(draftMetaInfo, null, 2),
    'utf-8'
  )

  // Create ZIP
  const zipPath = path.join(PATHS.composed, `jianying_${episodeId}_${Date.now()}.zip`)
  await createZipFromDirectory(exportDir, zipPath)

  // Clean up temp directory
  try {
    await fs.rm(exportDir, { recursive: true })
  } catch {
    // Ignore cleanup errors
  }

  const totalDuration = episode.storyboards.reduce((sum, sb) => sum + (sb.duration || 3), 0)

  return {
    zipPath,
    episodeTitle: episode.title || `Episode ${episode.episodeNumber}`,
    shotCount: episode.storyboards.length,
    duration: totalDuration,
  }
}

// ── SRT Export ─────────────────────────────────────────────────

/**
 * Export episode subtitles in SRT format.
 */
export async function exportSRT(episodeId: string): Promise<SubtitleExportResult> {
  await ensureStorageDirs()

  const episode = await db.episode.findUnique({
    where: { id: episodeId },
    include: {
      storyboards: { orderBy: { shotNumber: 'asc' } },
    },
  })

  if (!episode) {
    throw new Error(`Episode not found: ${episodeId}`)
  }

  let srtContent = ''
  let entryIndex = 1
  let currentTime = 0

  for (const storyboard of episode.storyboards) {
    const dialogue = storyboard.dialogue
    if (dialogue) {
      const text = storyboard.dialogueChar
        ? `${storyboard.dialogueChar}: ${dialogue}`
        : dialogue

      const srt = generateSRT(text, storyboard.duration || 3)
      if (srt) {
        // Re-index the SRT entries with global timing
        const lines = srt.split('\n')
        let inTimeSection = false
        for (const line of lines) {
          if (line.includes(' --> ')) {
            // Adjust timestamps with global offset
            const [startStr, endStr] = line.split(' --> ')
            const start = parseSRTTime(startStr) + currentTime
            const end = parseSRTTime(endStr) + currentTime
            srtContent += `${entryIndex}\n`
            srtContent += `${formatSRTTime(start)} --> ${formatSRTTime(end)}\n`
            inTimeSection = true
          } else if (inTimeSection && line.trim() === '') {
            srtContent += '\n'
            entryIndex++
            inTimeSection = false
          } else if (!line.match(/^\d+$/)) {
            // Not an index line
            srtContent += line + '\n'
          }
        }
      }
    }
    currentTime += storyboard.duration || 3
  }

  const filePath = path.join(PATHS.subtitles, `episode_${episodeId}_${Date.now()}.srt`)
  await fs.writeFile(filePath, srtContent.trim(), 'utf-8')

  return {
    filePath,
    format: 'srt',
    entryCount: entryIndex - 1,
  }
}

// ── ASS Export ─────────────────────────────────────────────────

/**
 * Export episode subtitles in ASS (Advanced SubStation Alpha) format.
 */
export async function exportASS(episodeId: string): Promise<SubtitleExportResult> {
  await ensureStorageDirs()

  const episode = await db.episode.findUnique({
    where: { id: episodeId },
    include: {
      storyboards: { orderBy: { shotNumber: 'asc' } },
    },
  })

  if (!episode) {
    throw new Error(`Episode not found: ${episodeId}`)
  }

  // ASS header
  const assLines: string[] = [
    '[Script Info]',
    'Title: ' + (episode.title || `Episode ${episode.episodeNumber}`),
    'ScriptType: v4.00+',
    'PlayResX: 1080',
    'PlayResY: 1920',
    'WrapStyle: 0',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    'Style: Default,Noto Sans CJK SC,52,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,3,1,2,30,30,40,1',
    'Style: Character,Noto Sans CJK SC,48,&H00FFFF00,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,3,1,2,30,30,40,1',
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ]

  let currentTime = 0
  let entryCount = 0

  for (const storyboard of episode.storyboards) {
    const dialogue = storyboard.dialogue
    if (dialogue) {
      const startTime = currentTime
      const endTime = currentTime + (storyboard.duration || 3)
      const style = storyboard.dialogueChar ? 'Character' : 'Default'
      const name = storyboard.dialogueChar || ''
      const text = dialogue.replace(/\n/g, '\\N')

      assLines.push(
        `Dialogue: 0,${formatASSTime(startTime)},${formatASSTime(endTime)},${style},${name},0,0,0,,${text}`
      )
      entryCount++
    }
    currentTime += storyboard.duration || 3
  }

  const assContent = assLines.join('\n')
  const filePath = path.join(PATHS.subtitles, `episode_${episodeId}_${Date.now()}.ass`)
  await fs.writeFile(filePath, assContent, 'utf-8')

  return {
    filePath,
    format: 'ass',
    entryCount,
  }
}

// ── FCPXML Export ──────────────────────────────────────────────

/**
 * Export episode in FCPXML (Final Cut Pro XML) format.
 */
export async function exportFCPXML(episodeId: string): Promise<FCPXMLExportResult> {
  await ensureStorageDirs()

  const episode = await db.episode.findUnique({
    where: { id: episodeId },
    include: {
      storyboards: { orderBy: { shotNumber: 'asc' } },
      drama: true,
    },
  })

  if (!episode) {
    throw new Error(`Episode not found: ${episodeId}`)
  }

  const totalDuration = episode.storyboards.reduce((sum, sb) => sum + (sb.duration || 3), 0)
  const fcpxmlDuration = totalDuration * 24000 / 1001 // Convert to FCPXML time (24fps)

  // Build FCPXML structure
  let clipItems = ''
  let currentTime = 0
  let assetId = 1

  for (const storyboard of episode.storyboards) {
    const clipDuration = (storyboard.duration || 3) * 24000 / 1001
    const assetRef = `r${assetId}`
    assetId++

    clipItems += `
      <asset-clip ref="${assetRef}" name="Shot ${storyboard.shotNumber}" offset="${formatFCPXMLTime(currentTime)}" duration="${formatFCPXMLTime(clipDuration)}" start="${formatFCPXMLTime(0)}">
        ${storyboard.dialogue ? `<title ref="r${assetId}" name="Subtitle" offset="${formatFCPXMLTime(0)}" duration="${formatFCPXMLTime(clipDuration)}"><text><text-style>{{storyboard.dialogueChar || ""}}${storyboard.dialogue}</text-style></text></title>` : ''}
      </asset-clip>`

    currentTime += clipDuration
  }

  const fcpxml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE fcpxml>
<fcpxml version="1.9">
  <resources>
    <format id="r1" name="FFVideoFormat1080p2398" frameDuration="100/2400s" width="1080" height="1920"/>
    ${episode.storyboards.map((_, i) => `<asset id="r${i + 2}" name="Shot ${i + 1}" src="file://shot_${i + 1}.mp4" hasVideo="1" hasAudio="1"/>`).join('\n    ')}
  </resources>
  <library>
    <event name="${episode.title || `Episode ${episode.episodeNumber}`}">
      <project name="${episode.title || `Episode ${episode.episodeNumber}`}">
        <sequence format="r1" duration="${formatFCPXMLTime(fcpxmlDuration)}" tcStart="${formatFCPXMLTime(0)}" tcFormat="NDF">
          <spine>
            ${clipItems}
          </spine>
        </sequence>
      </project>
    </event>
  </library>
</fcpxml>`

  const filePath = path.join(PATHS.composed, `episode_${episodeId}_${Date.now()}.fcpxml`)
  await fs.writeFile(filePath, fcpxml, 'utf-8')

  return {
    filePath,
    episodeTitle: episode.title || `Episode ${episode.episodeNumber}`,
    shotCount: episode.storyboards.length,
  }
}

// ── Images ZIP Export ──────────────────────────────────────────

/**
 * Export all storyboard images as a ZIP file.
 */
export async function exportImagesZip(episodeId: string): Promise<string> {
  await ensureStorageDirs()

  const episode = await db.episode.findUnique({
    where: { id: episodeId },
    include: {
      storyboards: { orderBy: { shotNumber: 'asc' } },
    },
  })

  if (!episode) {
    throw new Error(`Episode not found: ${episodeId}`)
  }

  const exportDir = path.join(PATHS.composed, `images_${episodeId}_${Date.now()}`)
  await fs.mkdir(exportDir, { recursive: true })

  for (const storyboard of episode.storyboards) {
    const imageUrl = storyboard.firstFrameUrl || storyboard.composedUrl
    if (imageUrl) {
      const ext = imageUrl.includes('.png') ? 'png' : 'jpg'
      const fileName = `shot_${String(storyboard.shotNumber).padStart(3, '0')}.${ext}`
      try {
        const { downloadFile } = await import('@/lib/ffmpeg')
        await downloadFile(imageUrl, path.join(exportDir, fileName))
      } catch {
        // Skip failed downloads
      }
    }
  }

  const zipPath = path.join(PATHS.composed, `images_${episodeId}_${Date.now()}.zip`)
  await createZipFromDirectory(exportDir, zipPath)

  // Clean up
  try {
    await fs.rm(exportDir, { recursive: true })
  } catch {
    // Ignore cleanup errors
  }

  return zipPath
}

// ── Helper: Create ZIP ─────────────────────────────────────────

async function createZipFromDirectory(dirPath: string, zipPath: string): Promise<void> {
  // Use Node.js built-in or archiver for ZIP creation
  try {
    const { execFile } = await import('child_process')
    await new Promise<void>((resolve, reject) => {
      execFile('zip', ['-r', '-j', zipPath, dirPath], (error: any) => {
        if (error) reject(error)
        else resolve()
      })
    })
  } catch {
    // Fallback: manual ZIP using archiver or simple approach
    // For now, create a tar-like structure using a simple approach
    const archiver = await import('archiver').catch(() => null)
    if (archiver) {
      const archive = archiver.default('zip', { zlib: { level: 9 } })
      const output = (await import('fs')).createWriteStream(zipPath)
      archive.pipe(output)
      archive.directory(dirPath, false)
      await archive.finalize()
    } else {
      throw new Error('No ZIP utility available. Install archiver or ensure zip command exists.')
    }
  }
}

// ── Time formatting helpers ────────────────────────────────────

function formatSRTTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const ms = Math.round((seconds % 1) * 1000)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`
}

function parseSRTTime(timeStr: string): number {
  const parts = timeStr.trim().replace(',', '.').split(':')
  if (parts.length !== 3) return 0
  return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2])
}

function formatASSTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const cs = Math.round((seconds % 1) * 100)
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`
}

function formatFCPXMLTime(frames: number): string {
  return `${Math.round(frames)}s`
}
