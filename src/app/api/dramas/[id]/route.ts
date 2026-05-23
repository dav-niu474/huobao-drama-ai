import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';

// Helper: check if user can access this drama
async function checkDramaAccess(id: string, session: any) {
  const userId = (session.user as any).id;
  const role = (session.user as any).role;

  const drama = await db.drama.findUnique({
    where: { id },
    select: { userId: true },
  });

  if (!drama) return { error: null, notFound: true };
  // Admin can access all, others only their own
  if (role !== 'admin' && drama.userId && drama.userId !== userId) {
    return { error: '无权访问此项目', forbidden: true };
  }
  return { error: null, notFound: false, forbidden: false };
}

// GET /api/dramas/[id] - Get drama by id with episodes, characters, scenes
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const { id } = await params;
    const access = await checkDramaAccess(id, session);
    if (access.notFound) return NextResponse.json({ error: 'Drama not found' }, { status: 404 });
    if (access.forbidden) return NextResponse.json({ error: access.error }, { status: 403 });

    const drama = await db.drama.findUnique({
      where: { id },
      include: {
        episodes: {
          orderBy: { episodeNumber: 'asc' },
          include: { _count: { select: { storyboards: true } } },
        },
        characters: { orderBy: { createdAt: 'asc' } },
        scenes: { orderBy: { createdAt: 'asc' } },
        props: { orderBy: { createdAt: 'asc' } },
      },
    });

    if (!drama) {
      return NextResponse.json({ error: 'Drama not found' }, { status: 404 });
    }

    return NextResponse.json(drama);
  } catch (error) {
    console.error('Failed to get drama:', error);
    return NextResponse.json({ error: 'Failed to get drama' }, { status: 500 });
  }
}

// PATCH /api/dramas/[id] - Update drama
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const { id } = await params;
    const access = await checkDramaAccess(id, session);
    if (access.notFound) return NextResponse.json({ error: 'Drama not found' }, { status: 404 });
    if (access.forbidden) return NextResponse.json({ error: access.error }, { status: 403 });

    const body = await request.json();

    // Sanitize allowed fields — prevent arbitrary data injection
    const allowedFields = [
      'title', 'description', 'genre', 'style', 'coverImage',
      'totalEpisodes', 'status', 'defaultLockedConfig',
    ];
    const data: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (field in body) {
        if (field === 'defaultLockedConfig') {
          // Store as JSON string; accept object or string
          const val = body[field];
          data[field] = typeof val === 'string' ? val : JSON.stringify(val);
        } else {
          data[field] = body[field];
        }
      }
    }

    const drama = await db.drama.update({
      where: { id },
      data,
    });

    return NextResponse.json(drama);
  } catch (error) {
    console.error('Failed to update drama:', error);
    return NextResponse.json({ error: 'Failed to update drama' }, { status: 500 });
  }
}

// DELETE /api/dramas/[id] - Delete drama
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const { id } = await params;
    const access = await checkDramaAccess(id, session);
    if (access.notFound) return NextResponse.json({ error: 'Drama not found' }, { status: 404 });
    if (access.forbidden) return NextResponse.json({ error: access.error }, { status: 403 });

    await db.drama.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete drama:', error);
    return NextResponse.json({ error: 'Failed to delete drama' }, { status: 500 });
  }
}
