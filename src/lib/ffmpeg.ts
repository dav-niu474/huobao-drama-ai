// ============================================================
// FFmpeg Utility Module — Server-side video compositing
// Uses Node.js child_process to call FFmpeg directly
// No fluent-ffmpeg dependency required
// ============================================================

import { execFile } from 'child_process'
import { promises as fs } from 'fs'
import path from 'path'

// ── Storage paths ──────────────────────────────────────────────
const STORAGE_ROOT = '/tmp/drama-storage'

export const PATHS = {
  audio: path.join(STORAGE_ROOT, 'audio'),
  subtitles: path.join(STORAGE_ROOT, 'subtitles'),
  composed: path.join(STORAGE_ROOT, 'composed'),
  merged: path.join(STORAGE_ROOT, 'merged'),
} as const

/**
 * Ensure all storage directories exist
 */
export async function ensureStorageDirs(): Promise<void> {
  for (const dir of Object.values(PATHS)) {
    await fs.mkdir(dir, { recursive: true })
  }
}

// ── FFmpeg Availability ────────────────────────────────────────

let _ffmpegAvailable: boolean | null = null

/**
 * Check if FFmpeg is installed and available on the system.
 * Result is cached after first check.
 */
export async function isFFmpegAvailable(): Promise<boolean> {
  if (_ffmpegAvailable !== null) return _ffmpegAvailable

  return new Promise((resolve) => {
    execFile('ffmpeg', ['-version'], (error) => {
      _ffmpegAvailable = !error
      resolve(_ffmpegAvailable)
    })
  })
}

/**
 * Reset cached FFmpeg availability (useful for testing)
 */
export function resetFFmpegCache(): void {
  _ffmpegAvailable = null
}

// ── Core FFmpeg Execution ──────────────────────────────────────

interface FFmpegResult {
  stdout: string
  stderr: string
  exitCode: number
}

/**
 * Execute an FFmpeg command with the given arguments.
 * Uses execFile (not shell) for security.
 */
function runFFmpeg(args: string[]): Promise<FFmpegResult> {
  return new Promise((resolve, reject) => {
    execFile('ffmpeg', args, { maxBuffer: 50 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`FFmpeg failed: ${error.message}\nstderr: ${stderr?.slice(-500)}`))
        return
      }
      resolve({ stdout, stderr, exitCode: 0 })
    })
  })
}

/**
 * Execute an FFprobe command with the given arguments.
 */
function runFFprobe(args: string[]): Promise<FFmpegResult> {
  return new Promise((resolve, reject) => {
    execFile('ffprobe', args, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`FFprobe failed: ${error.message}\nstderr: ${stderr?.slice(-500)}`))
        return
      }
      resolve({ stdout, stderr, exitCode: 0 })
    })
  })
}

// ── SRT Subtitle Generation ────────────────────────────────────

/**
 * Format a timestamp in seconds to SRT time format: HH:MM:SS,mmm
 */
function formatSRTTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const ms = Math.round((seconds % 1) * 1000)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`
}

/**
 * Generate SRT subtitle content from text and duration.
 * The subtitle will span the entire duration of the shot.
 * If the text is long, it will be split into multiple subtitle entries.
 */
export function generateSRT(text: string, duration: number): string {
  if (!text || !text.trim()) return ''

  const cleanText = text.trim()

  // Split long text into chunks (~20 chars per second of video)
  const maxCharsPerSegment = Math.max(15, Math.floor(duration * 6))
  const segments = splitSubtitleText(cleanText, maxCharsPerSegment)

  if (segments.length === 0) return ''

  const segmentDuration = duration / segments.length
  const lines: string[] = []

  for (let i = 0; i < segments.length; i++) {
    const startTime = i * segmentDuration
    const endTime = (i + 1) * segmentDuration
    lines.push(`${i + 1}`)
    lines.push(`${formatSRTTime(startTime)} --> ${formatSRTTime(endTime)}`)
    lines.push(segments[i])
    lines.push('') // blank line between entries
  }

  return lines.join('\n')
}

/**
 * Split text into subtitle-sized segments.
 * Tries to split at natural boundaries (punctuation, spaces).
 */
function splitSubtitleText(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text]

  const segments: string[] = []
  let remaining = text

  while (remaining.length > 0) {
    if (remaining.length <= maxChars) {
      segments.push(remaining)
      break
    }

    // Try to find a natural split point
    let splitIdx = -1

    // Prefer splitting at Chinese punctuation or spaces
    const punctuations = ['。', '！', '？', '，', '；', '：', '…', '—', ' ', ',', '.', '!', '?', ';', ':']
    for (const punct of punctuations) {
      const idx = remaining.lastIndexOf(punct, maxChars)
      if (idx > 0 && idx < maxChars) {
        splitIdx = idx + 1
        break
      }
    }

    // Fallback: hard split
    if (splitIdx <= 0) {
      splitIdx = maxChars
    }

    segments.push(remaining.slice(0, splitIdx).trim())
    remaining = remaining.slice(splitIdx).trim()
  }

  return segments.filter(Boolean)
}

// ── Dialogue Parsing ───────────────────────────────────────────

export interface ParsedDialogue {
  speaker: string
  pureText: string
  ignorable: boolean
}

/**
 * Parse dialogue text for TTS generation.
 * Extracts speaker name and pure dialogue text.
 * Marks ignorable dialogue (stage directions, narration).
 *
 * Examples:
 *   "小明：你好啊" → { speaker: "小明", pureText: "你好啊", ignorable: false }
 *   "（转身离去）" → { speaker: "", pureText: "（转身离去）", ignorable: true }
 *   "旁白：天空飘来一朵云" → { speaker: "旁白", pureText: "天空飘来一朵云", ignorable: true }
 */
export function parseDialogueForTTS(dialogue: string): ParsedDialogue {
  if (!dialogue || !dialogue.trim()) {
    return { speaker: '', pureText: '', ignorable: true }
  }

  const text = dialogue.trim()

  // Check if it's a stage direction (purely in parentheses)
  if (/^[（(].*[）)]$/.test(text)) {
    return { speaker: '', pureText: text, ignorable: true }
  }

  // Check for speaker pattern: "Name：text" or "Name:text"
  const speakerMatch = text.match(/^([^：:]{1,20})[：:]\s*(.+)$/)
  if (speakerMatch) {
    const speaker = speakerMatch[1].trim()
    const pureText = speakerMatch[2].trim()

    // Narrator / stage directions are ignorable for TTS
    const ignorableSpeakers = ['旁白', '画外音', '解说', 'OS', 'V.O.', 'VO', 'NARRATOR']
    const ignorable = ignorableSpeakers.some(
      (s) => speaker.toLowerCase() === s.toLowerCase()
    )

    return { speaker, pureText, ignorable }
  }

  // No speaker prefix — treat as regular dialogue
  return { speaker: '', pureText: text, ignorable: false }
}

// ── Video Compositing ──────────────────────────────────────────

/**
 * Compose a single shot: merge video + audio + burn-in subtitles.
 * Output: H.264/AAC MP4
 *
 * @param videoPath  - Path to the source video file
 * @param audioPath  - Optional path to TTS audio file
 * @param subtitlePath - Optional path to SRT subtitle file
 * @param outputPath - Path for the output MP4 file
 */
export async function composeShot(
  videoPath: string,
  audioPath?: string,
  subtitlePath?: string,
  outputPath?: string
): Promise<string> {
  await ensureStorageDirs()

  const output = outputPath || path.join(PATHS.composed, `composed_${Date.now()}.mp4`)

  const args: string[] = ['-y'] // overwrite output

  // Input: video
  args.push('-i', videoPath)

  // Input: audio (if provided)
  let audioInputIdx = -1
  if (audioPath) {
    args.push('-i', audioPath)
    audioInputIdx = 1
  }

  // Map video from first input
  args.push('-map', '0:v')

  // Map audio: prefer TTS audio if available, otherwise use video's audio
  if (audioPath && audioInputIdx >= 0) {
    args.push('-map', `${audioInputIdx}:a`)
  } else {
    // Use audio from video if it exists, otherwise no audio
    args.push('-map', '0:a?')
  }

  // Video codec: H.264
  args.push('-c:v', 'libx264')
  args.push('-preset', 'medium')
  args.push('-crf', '23')
  args.push('-pix_fmt', 'yuv420p')

  // Audio codec: AAC
  args.push('-c:a', 'aac')
  args.push('-b:a', '128k')

  // Subtitle burn-in (hardcode subtitles into video)
  if (subtitlePath) {
    // Use subtitles filter for burn-in
    // Escape special characters in path for FFmpeg filter
    const escapedPath = subtitlePath
      .replace(/\\/g, '/')
      .replace(/:/g, '\\:')
      .replace(/\[/g, '\\[')
      .replace(/\]/g, '\\]')

    args.push('-vf', `subtitles='${escapedPath}':force_style='FontSize=18,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=2,Alignment=2,MarginV=30'`)
  } else {
    // Ensure video is properly sized even without subtitles
    args.push('-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2')
  }

  // Shortest flag to handle mismatched durations
  args.push('-shortest')

  // Output
  args.push(output)

  await runFFmpeg(args)
  return output
}

// ── Video Merging ──────────────────────────────────────────────

/**
 * Merge multiple composed shot videos into a single episode video.
 * Uses FFmpeg concat demuxer for lossless concatenation.
 *
 * @param shotPaths - Array of paths to composed shot MP4 files
 * @param outputPath - Optional path for the output merged MP4
 */
export async function mergeShots(
  shotPaths: string[],
  outputPath?: string
): Promise<string> {
  await ensureStorageDirs()

  if (shotPaths.length === 0) {
    throw new Error('No shots to merge')
  }

  // If only one shot, just copy it
  if (shotPaths.length === 1) {
    const output = outputPath || path.join(PATHS.merged, `merged_${Date.now()}.mp4`)
    await fs.copyFile(shotPaths[0], output)
    return output
  }

  const output = outputPath || path.join(PATHS.merged, `merged_${Date.now()}.mp4`)

  // Create concat file list
  const concatListPath = path.join(PATHS.merged, `concat_${Date.now()}.txt`)
  const concatContent = shotPaths
    .map((p) => `file '${p.replace(/'/g, "'\\''")}'`)
    .join('\n')

  await fs.writeFile(concatListPath, concatContent, 'utf-8')

  try {
    // Use concat demuxer for fast, lossless concatenation
    // All inputs must have the same codecs and dimensions
    const args = [
      '-y',
      '-f', 'concat',
      '-safe', '0',
      '-i', concatListPath,
      '-c:v', 'libx264',
      '-preset', 'medium',
      '-crf', '23',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-movflags', '+faststart',
      output,
    ]

    await runFFmpeg(args)
    return output
  } finally {
    // Clean up concat list file
    try {
      await fs.unlink(concatListPath)
    } catch {
      // Ignore cleanup errors
    }
  }
}

// ── Video Duration ─────────────────────────────────────────────

/**
 * Get the duration of a video file in seconds using FFprobe.
 */
export async function getVideoDuration(videoPath: string): Promise<number> {
  try {
    const result = await runFFprobe([
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      videoPath,
    ])

    const info = JSON.parse(result.stdout)
    const duration = parseFloat(info?.format?.duration || '0')
    return isNaN(duration) ? 0 : duration
  } catch {
    return 0
  }
}

// ── File Download Helper ───────────────────────────────────────

/**
 * Download a file from a URL to a local path.
 * Handles data URLs, file-storage paths (/api/files/...), and regular URLs.
 */
export async function downloadFile(url: string, localPath: string): Promise<string> {
  await ensureStorageDirs()

  // Handle data URLs (base64-encoded content)
  if (url.startsWith('data:')) {
    const match = url.match(/^data:([^;]+);base64,(.+)$/)
    if (match) {
      const buffer = Buffer.from(match[2], 'base64')
      await fs.writeFile(localPath, buffer)
      return localPath
    }
    throw new Error('Invalid data URL format')
  }

  // Handle file-storage paths (/api/files/...) — read directly from
  // local storage instead of HTTP-fetching our own API (works even
  // when the base URL is unknown during server-side execution)
  if (url.startsWith('/api/files/')) {
    const { readMediaFile } = await import('@/lib/file-storage')
    const buffer = await readMediaFile(url)
    if (!buffer) {
      throw new Error(`File not found in storage: ${url}`)
    }
    await fs.writeFile(localPath, buffer)
    return localPath
  }

  // Regular HTTP/HTTPS URL
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`)
  }

  const arrayBuffer = await response.arrayBuffer()
  await fs.writeFile(localPath, Buffer.from(arrayBuffer))
  return localPath
}
