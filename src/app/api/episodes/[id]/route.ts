import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth-helpers';

// GET /api/episodes/[id] - Get episode with storyboards
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { id } = await params;
    const episode = await db.episode.findUnique({
      where: { id },
      include: {
        storyboards: { orderBy: { shotNumber: 'asc' } },
        drama: { select: { userId: true } },
      },
    });

    if (!episode) {
      return NextResponse.json({ error: 'Episode not found' }, { status: 404 });
    }

    // Ownership check: deny if drama belongs to another non-admin user
    if (
      episode.drama.userId &&
      episode.drama.userId !== auth.userId &&
      auth.role !== 'admin'
    ) {
      return NextResponse.json({ error: '无权访问' }, { status: 403 });
    }

    // Strip the drama relation before returning to avoid leaking owner info
    const { drama: _drama, ...episodeData } = episode;
    return NextResponse.json(episodeData);
  } catch (error) {
    console.error('Failed to get episode:', error);
    return NextResponse.json({ error: 'Failed to get episode' }, { status: 500 });
  }
}

// PATCH /api/episodes/[id] - Update episode
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { id } = await params;
    const body = await request.json();

    // Only allow updating specific fields
    const allowedFields = [
      'title', 'rawContent', 'scriptContent', 'scriptStatus',
      'extractStatus', 'storyboardStatus', 'status', 'videoUrl', 'duration',
      'lockedConfig',
    ];
    const data: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (field in body) {
        if (field === 'lockedConfig') {
          // Store as JSON string; accept object or string
          const val = body[field];
          data[field] = typeof val === 'string' ? val : JSON.stringify(val);
        } else {
          data[field] = body[field];
        }
      }
    }

    const episode = await db.episode.update({
      where: { id },
      data,
    });

    return NextResponse.json(episode);
  } catch (error) {
    console.error('Failed to update episode:', error);
    return NextResponse.json({ error: 'Failed to update episode' }, { status: 500 });
  }
}

// DELETE /api/episodes/[id] - Delete episode
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { id } = await params;

    // Get episode info to update drama totalEpisodes
    const episode = await db.episode.findUnique({
      where: { id },
      select: { dramaId: true },
    });

    if (!episode) {
      return NextResponse.json({ error: 'Episode not found' }, { status: 404 });
    }

    await db.episode.delete({ where: { id } });

    // Update drama totalEpisodes
    const count = await db.episode.count({ where: { dramaId: episode.dramaId } });
    await db.drama.update({
      where: { id: episode.dramaId },
      data: { totalEpisodes: count },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete episode:', error);
    return NextResponse.json({ error: 'Failed to delete episode' }, { status: 500 });
  }
}
