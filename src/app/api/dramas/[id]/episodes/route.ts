import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/dramas/[id]/episodes - List episodes for a drama
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: dramaId } = await params;
    const episodes = await db.episode.findMany({
      where: { dramaId },
      orderBy: { episodeNumber: 'asc' },
      include: {
        _count: { select: { storyboards: true } },
      },
    });

    const result = episodes.map((e) => ({
      ...e,
      _count: {
        storyboards: e._count.storyboards,
      },
    }));

    return NextResponse.json({ episodes: result });
  } catch (error) {
    console.error('Failed to list episodes:', error);
    return NextResponse.json({ error: 'Failed to list episodes' }, { status: 500 });
  }
}

// POST /api/dramas/[id]/episodes - Create episode
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: dramaId } = await params;
    const body = await request.json();
    const { title } = body;

    // Get current max episode number
    const maxEpisode = await db.episode.findFirst({
      where: { dramaId },
      orderBy: { episodeNumber: 'desc' },
      select: { episodeNumber: true },
    });

    const episodeNumber = (maxEpisode?.episodeNumber ?? 0) + 1;

    // Copy defaultLockedConfig from drama to new episode
    let lockedConfig = 'null';
    const drama = await db.drama.findUnique({
      where: { id: dramaId },
      select: { defaultLockedConfig: true },
    });
    if (drama?.defaultLockedConfig && drama.defaultLockedConfig !== 'null') {
      lockedConfig = drama.defaultLockedConfig;
    }

    const episode = await db.episode.create({
      data: {
        dramaId,
        episodeNumber,
        title: title || `第${episodeNumber}集`,
        lockedConfig,
      },
    });

    // Update totalEpisodes on drama
    await db.drama.update({
      where: { id: dramaId },
      data: { totalEpisodes: episodeNumber },
    });

    return NextResponse.json(episode, { status: 201 });
  } catch (error) {
    console.error('Failed to create episode:', error);
    return NextResponse.json({ error: 'Failed to create episode' }, { status: 500 });
  }
}
