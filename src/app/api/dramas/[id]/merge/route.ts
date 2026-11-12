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
import { saveMediaFile } from '@/lib/file-storage'
import path from 'path'

// GET /api/dramas/[id]/merge
// Drama-level merge status: which episodes have final cuts, readiness, latest merged output
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth()
    if (auth.error) return auth.error
    const { id: dramaId } = await params

    const drama = await db.drama.findUnique({
      where: { id: dramaId },
      include: {
        episodes: { orderBy: { episodeNumber: 'asc' } },
      },
    })

    if (!drama) {
      return NextResponse.json({ error: 'Drama not found' }, { status: 404 })
    }

    const total = drama.episodes.length
    const episodesWithVideo = drama.episodes.filter((ep) => ep.videoUrl)
    const withVideo = episodesWithVideo.length
    const totalDuration = episodesWithVideo.reduce((sum, ep) => sum + (ep.duration || 0), 0)

    return NextResponse.json({
      dramaId,
      dramaTitle: drama.title,
      // Drama-level merged output
      finalVideoUrl: drama.finalVideoUrl,
      finalVideoDuration: drama.finalVideoDuration,
      dramaMergedAt: drama.dramaMergedAt,
      // Episode readiness
      episodes: {
        total,
        withVideo,
        missing: total - withVideo,
        estimatedDuration: totalDuration,
        list: drama.episodes.map((ep) => ({
          id: ep.id,
          episodeNumber: ep.episodeNumber,
          title: ep.title,
          hasVideo: !!ep.videoUrl,
          duration: ep.duration,
        })),
      },
      // Readiness: at least one episode with a final cut
      canMerge: withVideo > 0,
      ffmpegAvailable: await isFFmpegAvailable(),
    })
  } catch (error) {
    console.error('Failed to get drama merge status:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// POST /api/dramas/[id]/merge
// Merge all episode final cuts (episode.videoUrl) into a single full-drama MP4
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth()
    if (auth.error) return auth.error
    const { id: dramaId } = await params

    // FFmpeg availability gate
    const ffmpegAvailable = await isFFmpegAvailable()
    if (!ffmpegAvailable) {
      return NextResponse.json(
        {
          error: 'FFmpeg not available',
          message: '服务器未安装 FFmpeg，无法在服务端合并整剧成片。',
        },
        { status: 501 }
      )
    }

    const drama = await db.drama.findUnique({
      where: { id: dramaId },
      include: { episodes: { orderBy: { episodeNumber: 'asc' } } },
    })

    if (!drama) {
      return NextResponse.json({ error: 'Drama not found' }, { status: 404 })
    }

    const episodesWithVideo = drama.episodes.filter((ep) => ep.videoUrl)
    if (episodesWithVideo.length === 0) {
      return NextResponse.json(
        { error: '没有任何已出片的剧集可供合并' },
        { status: 400 }
      )
    }

    const skipped = drama.episodes.length - episodesWithVideo.length

    try {
      await ensureStorageDirs()

      // Download each episode final cut into local storage (ordered by episodeNumber)
      const localPaths: string[] = []
      const timestamp = Date.now()
      const failedEpisodes: string[] = []

      for (const ep of episodesWithVideo) {
        const localPath = path.join(
          PATHS.merged,
          `drama_src_E${String(ep.episodeNumber).padStart(2, '0')}_${ep.id.slice(-6)}_${timestamp}.mp4`
        )
        try {
          await downloadFile(ep.videoUrl!, localPath)
          localPaths.push(localPath)
        } catch (err) {
          console.error(`[drama-merge] Failed to download episode ${ep.episodeNumber}:`, err)
          failedEpisodes.push(`E${ep.episodeNumber}`)
          // Skip failed downloads but continue with the rest
        }
      }

      if (localPaths.length === 0) {
        return NextResponse.json(
          { error: '所有剧集成片下载失败，无法合并' },
          { status: 500 }
        )
      }

      // Concat all episode videos
      const outputPath = path.join(PATHS.merged, `drama_${dramaId}_${timestamp}.mp4`)
      const mergedPath = await mergeShots(localPaths, outputPath)
      const duration = await getVideoDuration(mergedPath)

      // Persist to file storage → servable URL (/api/files/...)
      const mergedBuffer = await import('fs/promises').then((m) => m.readFile(mergedPath))
      const saveResult = await saveMediaFile(mergedBuffer, {
        mimeType: 'video/mp4',
        category: 'merged',
        dramaId,
        filename: `drama_${dramaId.slice(-8)}`,
      })
      const mergedFileUrl = saveResult.url

      const updatePromises: Array<Promise<unknown>> = [
        db.drama.update({
          where: { id: dramaId },
          data: {
            finalVideoUrl: mergedFileUrl,
            finalVideoDuration: Math.round(duration),
            dramaMergedAt: new Date(),
          },
        }),
      ]
      // Mark drama as completed when every episode has a final cut
      if (skipped === 0) {
        updatePromises.push(
          db.drama.update({
            where: { id: dramaId },
            data: { status: 'completed' },
          })
        )
      }
      const [updatedDrama] = await Promise.all(updatePromises)

      // Clean up temporary files
      const { unlink } = await import('fs/promises')
      for (const tmpPath of [...localPaths, mergedPath]) {
        try { await unlink(tmpPath) } catch { /* ignore */ }
      }

      return NextResponse.json({
        drama: updatedDrama,
        merge: {
          url: mergedFileUrl,
          duration: Math.round(duration),
          episodesMerged: localPaths.length,
          totalEpisodes: drama.episodes.length,
          failedEpisodes,
        },
      })
    } catch (mergeError) {
      console.error('[drama-merge] FFmpeg merge failed:', mergeError)
      const message =
        mergeError instanceof Error ? mergeError.message : '整剧合并失败'
      return NextResponse.json({ error: message }, { status: 500 })
    }
  } catch (error) {
    console.error('Failed to merge drama:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
