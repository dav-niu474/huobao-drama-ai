import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

// POST /api/publish/preview — AI-generate title, description, tags for publish
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { episodeId, dramaId } = body

    if (!dramaId) {
      return NextResponse.json({ error: 'dramaId is required' }, { status: 400 })
    }

    const drama = await db.drama.findUnique({ where: { id: dramaId } })
    if (!drama) return NextResponse.json({ error: 'Drama not found' }, { status: 404 })

    let episodeTitle = ''
    let scriptContent = ''
    if (episodeId) {
      const episode = await db.episode.findUnique({ where: { id: episodeId } })
      if (episode) {
        episodeTitle = episode.title || `第${episode.episodeNumber}集`
        scriptContent = episode.scriptContent?.slice(0, 500) || ''
      }
    }

    const title = `${drama.title}${episodeTitle ? ` - ${episodeTitle}` : ''}`
    const description = `${drama.description || drama.title}，一部${drama.genre}题材的AI短剧。${scriptContent ? `本集简介：${scriptContent.slice(0, 200)}...` : ''}`
    const tags = [drama.genre, 'AI短剧', drama.style].filter(Boolean)

    return NextResponse.json({ preview: { title, description, tags } })
  } catch (error) {
    console.error('[publish-preview] Error:', error)
    return NextResponse.json({ error: 'Failed to generate preview' }, { status: 500 })
  }
}
