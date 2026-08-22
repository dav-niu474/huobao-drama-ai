import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth-helpers';

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
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const { id: dramaId } = await params;

    // Verify drama exists and user has access
    const drama = await db.drama.findUnique({
      where: { id: dramaId },
      select: { userId: true, defaultLockedConfig: true },
    });
    if (!drama) {
      return NextResponse.json({ error: 'Drama not found' }, { status: 404 });
    }
    if (drama.userId && drama.userId !== auth.userId && auth.role !== 'admin') {
      return NextResponse.json({ error: '无权访问此项目' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const { title, episodeNumber } = body;

    // If episodeNumber provided, use it; otherwise auto-increment from max
    let epNumber: number;
    if (typeof episodeNumber === 'number' && Number.isFinite(episodeNumber)) {
      epNumber = Math.floor(episodeNumber);
    } else {
      const maxEp = await db.episode.aggregate({
        where: { dramaId },
        _max: { episodeNumber: true },
      });
      epNumber = (maxEp._max.episodeNumber || 0) + 1;
    }

    // Copy defaultLockedConfig from drama to new episode
    let lockedConfig = 'null';
    if (drama.defaultLockedConfig && drama.defaultLockedConfig !== 'null') {
      lockedConfig = drama.defaultLockedConfig;
    }

    const episode = await db.episode.create({
      data: {
        dramaId,
        episodeNumber: epNumber,
        title: title || `第${epNumber}集`,
        lockedConfig,
      },
    });

    // Update totalEpisodes on drama
    const count = await db.episode.count({ where: { dramaId } });
    await db.drama.update({
      where: { id: dramaId },
      data: { totalEpisodes: count },
    });

    return NextResponse.json(episode, { status: 201 });
  } catch (error) {
    console.error('Failed to create episode:', error);
    return NextResponse.json({ error: 'Failed to create episode' }, { status: 500 });
  }
}
