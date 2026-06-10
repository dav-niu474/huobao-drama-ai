// ============================================================
// Export API — POST with format parameter
// Supports: mp4, jianying, srt, ass, fcpxml, images
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { composeEpisode } from '@/lib/creative/video-composer'
import {
  exportToJianying,
  exportSRT,
  exportASS,
  exportFCPXML,
  exportImagesZip,
} from '@/lib/creative/jianying-export'
import { promises as fs } from 'fs'

type ExportFormat = 'mp4' | 'jianying' | 'srt' | 'ass' | 'fcpxml' | 'images'

const VALID_FORMATS: ExportFormat[] = ['mp4', 'jianying', 'srt', 'ass', 'fcpxml', 'images']

// POST /api/episodes/[id]/export
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: episodeId } = await params
    const body = await request.json()
    const format: ExportFormat = body.format || 'mp4'

    if (!VALID_FORMATS.includes(format)) {
      return NextResponse.json(
        { error: `Invalid format. Must be one of: ${VALID_FORMATS.join(', ')}` },
        { status: 400 }
      )
    }

    switch (format) {
      case 'mp4': {
        const result = await composeEpisode(episodeId, {
          bgmPath: body.bgmPath,
          logoPath: body.logoPath,
          transition: body.transition,
          subtitleStyle: body.subtitleStyle,
        })
        return NextResponse.json({
          format: 'mp4',
          episodeId: result.episodeId,
          outputUrl: result.outputUrl,
          duration: result.duration,
          shotCount: result.shotCount,
        })
      }

      case 'jianying': {
        const result = await exportToJianying(episodeId)
        // Return the ZIP file as a download
        const zipBuffer = await fs.readFile(result.zipPath)
        return new NextResponse(zipBuffer, {
          headers: {
            'Content-Type': 'application/zip',
            'Content-Disposition': `attachment; filename="jianying_${episodeId}.zip"`,
          },
        })
      }

      case 'srt': {
        const result = await exportSRT(episodeId)
        const srtContent = await fs.readFile(result.filePath, 'utf-8')
        return new NextResponse(srtContent, {
          headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Content-Disposition': `attachment; filename="episode_${episodeId}.srt"`,
          },
        })
      }

      case 'ass': {
        const result = await exportASS(episodeId)
        const assContent = await fs.readFile(result.filePath, 'utf-8')
        return new NextResponse(assContent, {
          headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Content-Disposition': `attachment; filename="episode_${episodeId}.ass"`,
          },
        })
      }

      case 'fcpxml': {
        const result = await exportFCPXML(episodeId)
        const fcpxmlContent = await fs.readFile(result.filePath, 'utf-8')
        return new NextResponse(fcpxmlContent, {
          headers: {
            'Content-Type': 'application/xml; charset=utf-8',
            'Content-Disposition': `attachment; filename="episode_${episodeId}.fcpxml"`,
          },
        })
      }

      case 'images': {
        const zipPath = await exportImagesZip(episodeId)
        const zipBuffer = await fs.readFile(zipPath)
        return new NextResponse(zipBuffer, {
          headers: {
            'Content-Type': 'application/zip',
            'Content-Disposition': `attachment; filename="images_${episodeId}.zip"`,
          },
        })
      }

      default:
        return NextResponse.json({ error: 'Unsupported format' }, { status: 400 })
    }
  } catch (error: any) {
    console.error('[Export API] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
