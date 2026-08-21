import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-helpers'
import {
  isFFmpegAvailable,
  mergeShots,
  downloadFile,
  getVideoDuration,
  PATHS,
  ensureStorageDirs,
} from '@/lib/ffmpeg'
import path from 'path'

// POST /api/episodes/[id]/merge
// Merge all composed storyboard videos into a full episode video using FFmpeg
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth()
    if (auth.error) return auth.error
    const { id: episodeId } = await params

    // Check FFmpeg availability
    const ffmpegAvailable = await isFFmpegAvailable()
    if (!ffmpegAvailable) {
      return NextResponse.json(
        {
          error: 'FFmpeg not available',
          fallback: 'client',
          message: 'Server-side FFmpeg is not installed. Cannot merge videos server-side.',
        },
        { status: 501 }
      )
    }

    // Get episode with storyboards
    const episode = await db.episode.findUnique({
      where: { id: episodeId },
      include: {
        storyboards: { orderBy: { shotNumber: 'asc' } },
      },
    })

    if (!episode) {
      return NextResponse.json(
        { error: 'Episode not found' },
        { status: 404 }
      )
    }

    const storyboards = episode.storyboards

    // Verify all storyboards have composedUrl (or at least videoUrl)
    const shotsWithVideo = storyboards.filter((s) => s.composedUrl || s.videoUrl)
    if (shotsWithVideo.length === 0) {
      return NextResponse.json(
        { error: 'No composed or video shots available for merging' },
        { status: 400 }
      )
    }

    // Warn if some shots are missing
    const missingShots = storyboards.filter((s) => !s.composedUrl && !s.videoUrl)
    if (missingShots.length > 0) {
      console.warn(
        `[merge] Episode ${episodeId}: ${missingShots.length} shots missing video, ` +
        `merging ${shotsWithVideo.length}/${storyboards.length} shots`
      )
    }

    // Create a VideoMerge tracking record
    const mergeRecord = await db.videoMerge.create({
      data: {
        episodeId,
        dramaId: episode.dramaId,
        status: 'processing',
      },
    })

    try {
      await ensureStorageDirs()

      // Download all composed/video files to local storage
      const localPaths: string[] = []
      const timestamp = Date.now()

      for (let i = 0; i < shotsWithVideo.length; i++) {
        const shot = shotsWithVideo[i]
        const url = shot.composedUrl || shot.videoUrl!
        const shotTag = `shot_${shot.shotNumber}_${shot.id.slice(-6)}`
        const localPath = path.join(PATHS.composed, `${shotTag}_merge_${timestamp}.mp4`)

        try {
          await downloadFile(url, localPath)
          localPaths.push(localPath)
        } catch (err) {
          console.error(`[merge] Failed to download shot ${shot.shotNumber}:`, err)
          // Skip failed downloads but continue with others
        }
      }

      if (localPaths.length === 0) {
        await db.videoMerge.update({
          where: { id: mergeRecord.id },
          data: { status: 'failed', errorMsg: 'No shots could be downloaded for merging' },
        })
        return NextResponse.json(
          { error: 'No shots could be downloaded for merging' },
          { status: 500 }
        )
      }

      // Merge all shots
      const outputPath = path.join(PATHS.merged, `episode_${episodeId}_${timestamp}.mp4`)
      const mergedPath = await mergeShots(localPaths, outputPath)

      // Get duration of merged video
      const duration = await getVideoDuration(mergedPath)

      // Store the merged video path as episode videoUrl
      const mergedFileUrl = `/tmp/drama-storage/merged/${path.basename(mergedPath)}`

      // Update episode and merge record
      const [updatedEpisode] = await Promise.all([
        db.episode.update({
          where: { id: episodeId },
          data: {
            videoUrl: mergedFileUrl,
            duration: Math.round(duration),
            status: 'completed',
          },
        }),
        db.videoMerge.update({
          where: { id: mergeRecord.id },
          data: {
            status: 'completed',
            mergedUrl: mergedFileUrl,
            duration: Math.round(duration),
          },
        }),
      ])

      // Clean up temporary downloaded files (keep the merged output)
      const { unlink } = await import('fs/promises')
      for (const tmpPath of localPaths) {
        try { await unlink(tmpPath) } catch { /* ignore */ }
      }

      return NextResponse.json({
        episode: updatedEpisode,
        merge: {
          id: mergeRecord.id,
          status: 'completed',
          mergedUrl: mergedFileUrl,
          duration: Math.round(duration),
          shotsMerged: localPaths.length,
          totalShots: storyboards.length,
        },
      })
    } catch (mergeError) {
      console.error('[merge] FFmpeg merge failed:', mergeError)

      const message = mergeError instanceof Error ? mergeError.message : 'FFmpeg merge failed'
      await db.videoMerge.update({
        where: { id: mergeRecord.id },
        data: { status: 'failed', errorMsg: message },
      })

      return NextResponse.json(
        { error: message, fallback: 'client' },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error('Failed to merge episode:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// GET /api/episodes/[id]/merge
// Check the merge status for an episode
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth()
    if (auth.error) return auth.error
    const { id: episodeId } = await params

    // Get the latest merge record for this episode
    const mergeRecord = await db.videoMerge.findFirst({
      where: { episodeId },
      orderBy: { createdAt: 'desc' },
    })

    // Also get episode status
    const episode = await db.episode.findUnique({
      where: { id: episodeId },
      include: {
        storyboards: { orderBy: { shotNumber: 'asc' } },
      },
    })

    if (!episode) {
      return NextResponse.json(
        { error: 'Episode not found' },
        { status: 404 }
      )
    }

    const storyboards = episode.storyboards
    const total = storyboards.length
    const composed = storyboards.filter((s) => s.composedUrl).length
    const withVideo = storyboards.filter((s) => s.videoUrl).length

    // Determine merge readiness
    const canMerge = composed === total && total > 0
    const canMergePartial = withVideo > 0

    return NextResponse.json({
      episodeId,
      episodeStatus: episode.status,
      episodeVideoUrl: episode.videoUrl,
      episodeDuration: episode.duration,
      // Merge record (if any)
      merge: mergeRecord || null,
      // Shot statistics
      shots: {
        total,
        composed,
        withVideo,
        missing: total - withVideo,
      },
      // Merge readiness
      canMerge,
      canMergePartial,
      // FFmpeg availability
      ffmpegAvailable: await isFFmpegAvailable(),
    })
  } catch (error) {
    console.error('Failed to get merge status:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
