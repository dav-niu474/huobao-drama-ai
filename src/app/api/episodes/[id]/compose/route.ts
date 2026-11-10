import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-helpers'
import {
  isFFmpegAvailable,
  composeShot,
  generateSRT,
  parseDialogueForTTS,
  downloadFile,
  PATHS,
  ensureStorageDirs,
} from '@/lib/ffmpeg'
import { saveMediaFile, migrateDataUrlToFile, isDataUrl } from '@/lib/file-storage'
import path from 'path'

// GET /api/episodes/[id]/compose?storyboardId=xxx
// Returns compositing instructions for client-side audio-video compositing
// This is the fallback for environments without FFmpeg (e.g., Vercel Serverless)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth()
    if (auth.error) return auth.error
    const { id } = await params
    const { searchParams } = new URL(request.url)
    const storyboardId = searchParams.get('storyboardId')

    if (!storyboardId) {
      return NextResponse.json(
        { error: 'storyboardId query parameter is required' },
        { status: 400 }
      )
    }

    const storyboard = await db.storyboard.findUnique({
      where: { id: storyboardId },
    })

    if (!storyboard) {
      return NextResponse.json(
        { error: 'Storyboard not found' },
        { status: 404 }
      )
    }

    if (!storyboard.videoUrl) {
      return NextResponse.json(
        { error: 'Storyboard has no video URL — cannot compose without video' },
        { status: 400 }
      )
    }

    // Check if server-side FFmpeg is available
    const ffmpegAvailable = await isFFmpegAvailable()

    // Return all the data the client needs for compositing
    return NextResponse.json({
      storyboardId: storyboard.id,
      shotNumber: storyboard.shotNumber,
      title: storyboard.title,
      // Video source
      videoUrl: storyboard.videoUrl,
      // Audio source (TTS)
      audioUrl: storyboard.ttsAudioUrl || null,
      // Subtitle data
      dialogue: storyboard.dialogue || null,
      dialogueChar: storyboard.dialogueChar || null,
      // Duration info
      duration: storyboard.duration || 5,
      // Server-side FFmpeg availability
      ffmpegAvailable,
      // Compositing instructions for client
      composeInstructions: {
        hasVideo: !!storyboard.videoUrl,
        hasAudio: !!storyboard.ttsAudioUrl,
        hasSubtitle: !!storyboard.dialogue,
        steps: [
          'Load video element with videoUrl',
          storyboard.ttsAudioUrl ? 'Load audio element with audioUrl' : null,
          'Create canvas element (1024x576)',
          'Draw video frames onto canvas with requestAnimationFrame',
          storyboard.dialogue ? 'Overlay subtitle text on canvas' : null,
          storyboard.ttsAudioUrl ? 'Use Web Audio API to create mixed audio stream' : null,
          'Capture canvas stream + audio stream with MediaRecorder',
          'Save composed blob and update storyboard.composedUrl',
        ].filter(Boolean),
      },
    })
  } catch (error) {
    console.error('Failed to get compose data:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// POST /api/episodes/[id]/compose
// Server-side FFmpeg compositing (preferred) or save client-side composed result
//
// Mode 1 (server-side): { storyboardId, mode: "server" }
//   - Uses FFmpeg to compose video + audio + subtitles
//   - Returns the composed URL
//
// Mode 2 (client-side fallback): { storyboardId, composedUrl }
//   - Saves the client-side composed result URL
//   - For environments without FFmpeg (Vercel)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth()
    if (auth.error) return auth.error
    const { id: episodeId } = await params
    const body = await request.json()
    const { storyboardId, mode, composedUrl } = body

    if (!storyboardId) {
      return NextResponse.json(
        { error: 'storyboardId is required' },
        { status: 400 }
      )
    }

    // ── Mode 2: Client-side fallback — save composed URL ──
    if (composedUrl) {
      // Persist data URLs (client Canvas/MediaRecorder output) to file
      // storage so we don't store megabyte-scale base64 in the database
      let persistedUrl = composedUrl
      if (isDataUrl(composedUrl)) {
        try {
          const storyboardRow = await db.storyboard.findUnique({
            where: { id: storyboardId },
            select: { episodeId: true },
          })
          const ep = storyboardRow
            ? await db.episode.findUnique({
                where: { id: storyboardRow.episodeId },
                select: { dramaId: true },
              })
            : null
          const saved = await migrateDataUrlToFile(composedUrl, {
            category: 'composed',
            dramaId: ep?.dramaId,
            filename: `shot_client_${Date.now()}`,
          })
          if (saved) persistedUrl = saved
        } catch (err) {
          console.warn('[compose] Failed to persist client composed data URL:', err)
        }
      }
      const storyboard = await db.storyboard.update({
        where: { id: storyboardId },
        data: { composedUrl: persistedUrl },
      })
      return NextResponse.json({ storyboard, source: 'client' })
    }

    // ── Mode 1: Server-side FFmpeg compositing ──
    // Check FFmpeg availability first
    const ffmpegAvailable = await isFFmpegAvailable()
    if (!ffmpegAvailable) {
      return NextResponse.json(
        {
          error: 'FFmpeg not available',
          fallback: 'client',
          message: 'Server-side FFmpeg is not installed. Use client-side Canvas + MediaRecorder compositing instead.',
        },
        { status: 501 }
      )
    }

    // Get storyboard from DB
    const storyboard = await db.storyboard.findUnique({
      where: { id: storyboardId },
    })

    if (!storyboard) {
      return NextResponse.json(
        { error: 'Storyboard not found' },
        { status: 404 }
      )
    }

    if (!storyboard.videoUrl) {
      return NextResponse.json(
        { error: 'Storyboard has no video URL — cannot compose without video' },
        { status: 400 }
      )
    }

    await ensureStorageDirs()

    const shotTag = `shot_${storyboard.shotNumber}_${storyboard.id.slice(-6)}`
    const timestamp = Date.now()

    // Resolve dramaId for file-storage organization
    const parentEpisode = await db.episode.findUnique({
      where: { id: storyboard.episodeId },
      select: { dramaId: true },
    })

    // ── Step 1: Download video to local file ──
    const localVideoPath = path.join(PATHS.composed, `${shotTag}_video_${timestamp}.mp4`)
    await downloadFile(storyboard.videoUrl, localVideoPath)

    // ── Step 2: Download TTS audio (if available) ──
    let localAudioPath: string | undefined
    if (storyboard.ttsAudioUrl) {
      localAudioPath = path.join(PATHS.audio, `${shotTag}_audio_${timestamp}.mp3`)
      try {
        await downloadFile(storyboard.ttsAudioUrl, localAudioPath)
      } catch (err) {
        console.warn(`[compose] Failed to download TTS audio for shot ${storyboard.shotNumber}:`, err)
        localAudioPath = undefined
      }
    }

    // ── Step 3: Generate SRT subtitle file (if dialogue exists) ──
    let localSubtitlePath: string | undefined
    if (storyboard.dialogue) {
      const parsed = parseDialogueForTTS(storyboard.dialogue)

      if (!parsed.ignorable && parsed.pureText) {
        // Prepend speaker name if available
        const subtitleText = storyboard.dialogueChar
          ? `${storyboard.dialogueChar}：${parsed.pureText}`
          : parsed.pureText

        const srtContent = generateSRT(subtitleText, storyboard.duration || 5)

        if (srtContent) {
          localSubtitlePath = path.join(PATHS.subtitles, `${shotTag}_subtitle_${timestamp}.srt`)
          const { writeFile } = await import('fs/promises')
          await writeFile(localSubtitlePath, srtContent, 'utf-8')
        }
      }
    }

    // ── Step 4: Run FFmpeg composition ──
    const composedOutputPath = path.join(PATHS.composed, `${shotTag}_composed_${timestamp}.mp4`)

    try {
      const resultPath = await composeShot(
        localVideoPath,
        localAudioPath,
        localSubtitlePath,
        composedOutputPath
      )

      // Persist composed MP4 to file storage → servable URL (/api/files/...)
      const composedBuffer = await import('fs/promises').then((m) => m.readFile(resultPath))
      const saveResult = await saveMediaFile(composedBuffer, {
        mimeType: 'video/mp4',
        category: 'composed',
        dramaId: parentEpisode?.dramaId,
        filename: `${shotTag}_composed`,
      })
      const composedFileUrl = saveResult.url

      // Update storyboard in DB
      const updatedStoryboard = await db.storyboard.update({
        where: { id: storyboardId },
        data: { composedUrl: composedFileUrl },
      })

      // Clean up temporary files (composed output already saved to storage)
      const { unlink } = await import('fs/promises')
      for (const tmpPath of [localVideoPath, localAudioPath, localSubtitlePath, resultPath]) {
        if (tmpPath) {
          try { await unlink(tmpPath) } catch { /* ignore */ }
        }
      }

      return NextResponse.json({
        storyboard: updatedStoryboard,
        source: 'server',
        composedUrl: composedFileUrl,
      })
    } catch (ffmpegError) {
      console.error('[compose] FFmpeg composition failed:', ffmpegError)

      // Clean up temporary files on failure
      const { unlink } = await import('fs/promises')
      for (const tmpPath of [localVideoPath, localAudioPath, localSubtitlePath, composedOutputPath]) {
        if (tmpPath) {
          try { await unlink(tmpPath) } catch { /* ignore */ }
        }
      }

      const message = ffmpegError instanceof Error ? ffmpegError.message : 'FFmpeg composition failed'
      return NextResponse.json(
        { error: message, fallback: 'client' },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error('Failed to compose:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
