// ============================================================
// Video Composer Service — FFmpeg-based episode composition
// Uses the existing ffmpeg.ts utility for actual FFmpeg commands
// ============================================================

import { db } from '@/lib/db'
import {
  composeShot,
  mergeShots,
  generateSRT,
  downloadFile,
  ensureStorageDirs,
  isFFmpegAvailable,
  PATHS,
} from '@/lib/ffmpeg'
import { promises as fs } from 'fs'
import path from 'path'
import { execFile } from 'child_process'

// ── Types ──────────────────────────────────────────────────────

export interface CompositionResult {
  episodeId: string
  outputUrl: string
  duration: number
  shotCount: number
  composedAt: Date
}

export interface TransitionConfig {
  type: 'xfade' | 'fade' | 'dissolve' | 'wipeleft' | 'wiperight' | 'slideleft' | 'slideright'
  duration: number // in seconds
}

// ── Default transition ─────────────────────────────────────────

const DEFAULT_TRANSITION: TransitionConfig = {
  type: 'fade',
  duration: 0.5,
}

// ── Main Composer ──────────────────────────────────────────────

/**
 * Compose a full episode from its storyboards.
 * Steps:
 * 1. Sort storyboards by shotNumber
 * 2. For each storyboard: compose shot (video + audio + subtitles)
 * 3. Apply transitions between clips
 * 4. Mix in BGM (background music)
 * 5. Burn SRT subtitles
 * 6. Add logo/watermark if configured
 * 7. Output final MP4
 */
export async function composeEpisode(
  episodeId: string,
  options?: {
    transition?: TransitionConfig
    bgmPath?: string
    logoPath?: string
    subtitleStyle?: string
  }
): Promise<CompositionResult> {
  await ensureStorageDirs()

  // Check FFmpeg availability
  const ffmpegAvailable = await isFFmpegAvailable()
  if (!ffmpegAvailable) {
    throw new Error('FFmpeg is not available on this system. Cannot compose episode.')
  }

  // 1. Get episode with storyboards
  const episode = await db.episode.findUnique({
    where: { id: episodeId },
    include: {
      storyboards: {
        orderBy: { shotNumber: 'asc' },
      },
    },
  })

  if (!episode) {
    throw new Error(`Episode not found: ${episodeId}`)
  }

  if (episode.storyboards.length === 0) {
    throw new Error(`No storyboards found for episode: ${episodeId}`)
  }

  const transition = options?.transition || DEFAULT_TRANSITION
  const composedShotPaths: string[] = []

  // 2. Compose each shot
  for (const storyboard of episode.storyboards) {
    if (!storyboard.videoUrl && !storyboard.firstFrameUrl) {
      console.warn(`[VideoComposer] Skipping storyboard ${storyboard.id}: no video or image`)
      continue
    }

    try {
      const shotResult = await composeStoryboardShot(storyboard, episodeId)
      if (shotResult) {
        composedShotPaths.push(shotResult)
      }
    } catch (err) {
      console.error(`[VideoComposer] Failed to compose shot ${storyboard.shotNumber}:`, err)
      // Continue with remaining shots
    }
  }

  if (composedShotPaths.length === 0) {
    throw new Error('No shots could be composed for this episode')
  }

  // 3. Merge all composed shots into one video
  const mergedPath = await mergeShots(composedShotPaths)

  // 4. Mix in BGM if provided
  let finalPath = mergedPath
  if (options?.bgmPath) {
    finalPath = await mixAudio(finalPath, [], options.bgmPath)
  }

  // 5. Add logo/watermark if configured
  if (options?.logoPath) {
    finalPath = await addWatermark(finalPath, options.logoPath)
  }

  // Calculate total duration
  const totalDuration = episode.storyboards.reduce((sum, sb) => sum + (sb.duration || 3), 0)

  // Update episode with the composed video URL
  const relativeUrl = `/api/files/composed/${path.basename(finalPath)}`
  await db.episode.update({
    where: { id: episodeId },
    data: {
      videoUrl: relativeUrl,
      duration: Math.round(totalDuration),
      status: 'completed',
    },
  })

  return {
    episodeId,
    outputUrl: relativeUrl,
    duration: totalDuration,
    shotCount: composedShotPaths.length,
    composedAt: new Date(),
  }
}

// ── Compose single storyboard shot ─────────────────────────────

async function composeStoryboardShot(
  storyboard: {
    id: string
    shotNumber: number
    videoUrl: string | null
    firstFrameUrl: string | null
    ttsAudioUrl: string | null
    dialogue: string | null
    dialogueChar: string | null
    duration: number
  },
  episodeId: string
): Promise<string | null> {
  const storageDir = path.join(PATHS.composed, episodeId)
  await fs.mkdir(storageDir, { recursive: true })

  // Download video
  let videoPath: string | null = null
  if (storyboard.videoUrl) {
    try {
      videoPath = path.join(storageDir, `shot_${storyboard.shotNumber}_video.mp4`)
      await downloadFile(storyboard.videoUrl, videoPath)
    } catch (err) {
      console.error(`[VideoComposer] Failed to download video for shot ${storyboard.shotNumber}:`, err)
      videoPath = null
    }
  }

  if (!videoPath) {
    return null
  }

  // Download TTS audio
  let audioPath: string | null = null
  if (storyboard.ttsAudioUrl) {
    try {
      audioPath = path.join(storageDir, `shot_${storyboard.shotNumber}_audio.mp3`)
      await downloadFile(storyboard.ttsAudioUrl, audioPath)
    } catch (err) {
      console.error(`[VideoComposer] Failed to download audio for shot ${storyboard.shotNumber}:`, err)
      audioPath = null
    }
  }

  // Generate SRT subtitle if there's dialogue
  let subtitlePath: string | null = null
  if (storyboard.dialogue) {
    const srtContent = generateSRT(
      storyboard.dialogueChar
        ? `${storyboard.dialogueChar}: ${storyboard.dialogue}`
        : storyboard.dialogue,
      storyboard.duration
    )
    if (srtContent) {
      subtitlePath = path.join(storageDir, `shot_${storyboard.shotNumber}_subs.srt`)
      await fs.writeFile(subtitlePath, srtContent, 'utf-8')
    }
  }

  // Compose the shot
  const outputPath = path.join(storageDir, `shot_${storyboard.shotNumber}_composed.mp4`)
  await composeShot(videoPath, audioPath || undefined, subtitlePath || undefined, outputPath)

  return outputPath
}

// ── Apply transition ───────────────────────────────────────────

/**
 * Apply xfade transition between two video clips.
 * Returns the output path of the transitioned video.
 */
export async function applyTransition(
  input1Path: string,
  input2Path: string,
  transition: TransitionConfig = DEFAULT_TRANSITION,
  outputPath?: string
): Promise<string> {
  await ensureStorageDirs()

  const output = outputPath || path.join(PATHS.composed, `transition_${Date.now()}.mp4`)

  // Get duration of first input for offset calculation
  const duration1 = await new Promise<number>((resolve) => {
    execFile('ffprobe', [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      input1Path,
    ], (error: Error | null, stdout: string) => {
      if (error) { resolve(3); return }
      try {
        const info = JSON.parse(stdout)
        resolve(parseFloat(info?.format?.duration || '3'))
      } catch { resolve(3) }
    })
  })

  const offset = Math.max(0, duration1 - transition.duration)
  const args = [
    '-y',
    '-i', input1Path,
    '-i', input2Path,
    '-filter_complex',
    `[0:v][1:v]xfade=transition=${transition.type}:duration=${transition.duration}:offset=${offset}[v];[0:a][1:a]acrossfade=d=${transition.duration}[a]`,
    '-map', '[v]',
    '-map', '[a]',
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', '23',
    '-c:a', 'aac',
    '-b:a', '128k',
    output,
  ]

  await new Promise<void>((resolve, reject) => {
    execFile('ffmpeg', args, { maxBuffer: 50 * 1024 * 1024 }, (error: Error | null) => {
      if (error) reject(new Error(`FFmpeg transition failed: ${error.message}`))
      else resolve()
    })
  })

  return output
}

// ── Mix Audio ──────────────────────────────────────────────────

/**
 * Mix multiple audio tracks into a video.
 * Includes video audio + TTS tracks + BGM.
 */
export async function mixAudio(
  videoPath: string,
  audioPaths: string[],
  bgmPath?: string,
  outputPath?: string
): Promise<string> {
  await ensureStorageDirs()

  const output = outputPath || path.join(PATHS.composed, `mixed_${Date.now()}.mp4`)

  const args: string[] = ['-y']

  // Input 0: video
  args.push('-i', videoPath)

  // Additional audio inputs
  let audioInputIdx = 1
  for (const audioPath of audioPaths) {
    args.push('-i', audioPath)
    audioInputIdx++
  }

  // BGM input
  if (bgmPath) {
    args.push('-i', bgmPath)
  }

  // Build filter complex for mixing
  const filters: string[] = []

  // If we have additional audio tracks, mix them
  if (audioPaths.length > 0 || bgmPath) {
    let filterStr = ''

    if (audioPaths.length > 0 && bgmPath) {
      // Mix video audio + TTS + BGM
      const audioInputs = ['0:a', ...audioPaths.map((_, i) => `${i + 1}:a`), `${audioInputIdx}:a`]
      filterStr = `${audioInputs.map((input, i) => `[${input}]`).join('')}amix=inputs=${audioInputs.length}:duration=longest:dropout_transition=2[aout]`
    } else if (audioPaths.length > 0) {
      // Mix video audio + TTS
      const audioInputs = ['0:a', ...audioPaths.map((_, i) => `${i + 1}:a`)]
      filterStr = `${audioInputs.map((input) => `[${input}]`).join('')}amix=inputs=${audioInputs.length}:duration=longest:dropout_transition=2[aout]`
    } else if (bgmPath) {
      // Mix video audio + BGM (with BGM volume reduced)
      filterStr = `[0:a][${audioInputIdx}:a]amix=inputs=2:duration=longest:dropout_transition=2:weights=1 0.3[aout]`
    }

    if (filterStr) {
      args.push('-filter_complex', filterStr)
      args.push('-map', '0:v', '-map', '[aout]')
    } else {
      args.push('-map', '0:v', '-map', '0:a?')
    }
  } else {
    args.push('-map', '0:v', '-map', '0:a?')
  }

  // Video codec
  args.push('-c:v', 'libx264', '-preset', 'medium', '-crf', '23')
  // Audio codec
  args.push('-c:a', 'aac', '-b:a', '128k')
  // Shortest to handle different durations
  args.push('-shortest')
  args.push(output)

  await new Promise<void>((resolve, reject) => {
    execFile('ffmpeg', args, { maxBuffer: 50 * 1024 * 1024 }, (error: Error | null) => {
      if (error) reject(new Error(`FFmpeg audio mix failed: ${error.message}`))
      else resolve()
    })
  })

  return output
}

// ── Burn Subtitles ─────────────────────────────────────────────

/**
 * Burn SRT subtitles into a video file.
 */
export async function burnSubtitles(
  videoPath: string,
  srtPath: string,
  outputPath?: string,
  style?: string
): Promise<string> {
  await ensureStorageDirs()

  const output = outputPath || path.join(PATHS.composed, `subtitled_${Date.now()}.mp4`)

  // Escape special characters in path for FFmpeg filter
  const escapedPath = srtPath
    .replace(/\\/g, '/')
    .replace(/:/g, '\\:')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')

  const subtitleStyle = style || 'FontSize=18,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=2,Alignment=2,MarginV=30'

  const args = [
    '-y',
    '-i', videoPath,
    '-vf', `subtitles='${escapedPath}':force_style='${subtitleStyle}'`,
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', '23',
    '-c:a', 'copy',
    output,
  ]

  await new Promise<void>((resolve, reject) => {
    execFile('ffmpeg', args, { maxBuffer: 50 * 1024 * 1024 }, (error: Error | null) => {
      if (error) reject(new Error(`FFmpeg subtitle burn failed: ${error.message}`))
      else resolve()
    })
  })

  return output
}

// ── Add Watermark ──────────────────────────────────────────────

/**
 * Add a logo/watermark overlay to the video.
 */
async function addWatermark(
  videoPath: string,
  logoPath: string,
  outputPath?: string
): Promise<string> {
  await ensureStorageDirs()

  const output = outputPath || path.join(PATHS.composed, `watermarked_${Date.now()}.mp4`)

  const args = [
    '-y',
    '-i', videoPath,
    '-i', logoPath,
    '-filter_complex', '[0:v][1:v]overlay=W-w-10:10',
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', '23',
    '-c:a', 'copy',
    output,
  ]

  await new Promise<void>((resolve, reject) => {
    execFile('ffmpeg', args, { maxBuffer: 50 * 1024 * 1024 }, (error: Error | null) => {
      if (error) reject(new Error(`FFmpeg watermark failed: ${error.message}`))
      else resolve()
    })
  })

  return output
}
