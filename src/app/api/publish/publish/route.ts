import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

// POST /api/publish/publish — Execute publish
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { dramaId, episodeId, platform, title, description, tags } = body

    if (!dramaId || !platform) {
      return NextResponse.json({ error: 'dramaId and platform are required' }, { status: 400 })
    }

    // Create publish record
    const record = await db.publishRecord.create({
      data: {
        dramaId,
        episodeId: episodeId || null,
        platform,
        title: title || '',
        description: description || '',
        tags: JSON.stringify(tags || []),
        status: 'pending',
      },
    })

    // In a real app, this would trigger an actual upload to the platform
    // For now, we simulate the publish process
    setTimeout(async () => {
      try {
        await db.publishRecord.update({
          where: { id: record.id },
          data: {
            status: 'published',
            publishedAt: new Date(),
            platformVideoId: `mock_${platform}_${Date.now()}`,
          },
        })
      } catch (e) {
        console.error('[publish-async] Error updating record:', e)
      }
    }, 2000)

    return NextResponse.json({ record }, { status: 201 })
  } catch (error) {
    console.error('[publish] Error:', error)
    return NextResponse.json({ error: 'Failed to publish' }, { status: 500 })
  }
}
