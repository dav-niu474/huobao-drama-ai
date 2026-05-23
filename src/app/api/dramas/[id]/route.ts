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

// DELETE /api/dramas/[id] - Delete drama and all related records
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

    // Use a transaction to safely delete drama and all related records
    // We do manual cascade instead of relying on onDelete because
    // prisma db push may not always sync FK constraints on Vercel
    await db.$transaction(async (tx) => {
      // 1. Get all episode IDs for this drama
      const episodes = await tx.episode.findMany({
        where: { dramaId: id },
        select: { id: true },
      });
      const episodeIds = episodes.map(e => e.id);

      // 2. Get all character IDs for this drama
      const characters = await tx.character.findMany({
        where: { dramaId: id },
        select: { id: true },
      });
      const characterIds = characters.map(c => c.id);

      // 3. Get all scene IDs for this drama
      const scenes = await tx.scene.findMany({
        where: { dramaId: id },
        select: { id: true },
      });
      const sceneIds = scenes.map(s => s.id);

      // ── Delete leaf-level records first (depth-first) ──

      // 4. Delete storyboards (under episodes)
      if (episodeIds.length > 0) {
        await tx.storyboard.deleteMany({ where: { episodeId: { in: episodeIds } } });
      }

      // 5. Delete character appearances
      if (characterIds.length > 0) {
        await tx.characterAppearance.deleteMany({ where: { characterId: { in: characterIds } } });
      }

      // 6. Delete scene images
      if (sceneIds.length > 0) {
        await tx.sceneImage.deleteMany({ where: { sceneId: { in: sceneIds } } });
      }

      // 7. Delete video merges (reference episodes of this drama)
      if (episodeIds.length > 0) {
        await tx.videoMerge.deleteMany({ where: { episodeId: { in: episodeIds } } });
      }

      // ── Delete mid-level records ──

      // 8. Delete episodes
      await tx.episode.deleteMany({ where: { dramaId: id } });

      // 9. Delete characters
      await tx.character.deleteMany({ where: { dramaId: id } });

      // 10. Delete scenes
      await tx.scene.deleteMany({ where: { dramaId: id } });

      // 11. Delete props
      await tx.prop.deleteMany({ where: { dramaId: id } });

      // ── Delete/nullify top-level references ──

      // 12. Delete generation costs
      await tx.generationCost.deleteMany({ where: { dramaId: id } });

      // 13. Nullify references in ImageGeneration (keep records for analytics)
      try {
        await tx.imageGeneration.updateMany({
          where: { dramaId: id },
          data: { dramaId: null },
        });
      } catch {
        // Column might not exist in older DB — safe to ignore
      }

      // 14. Nullify references in VideoGeneration
      try {
        await tx.videoGeneration.updateMany({
          where: { dramaId: id },
          data: { dramaId: null },
        });
      } catch {
        // Column might not exist in older DB — safe to ignore
      }

      // 15. Finally delete the drama itself
      await tx.drama.delete({ where: { id } });
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Failed to delete drama:', error);
    // Return more detailed error info for debugging
    const detail = error?.meta?.cause || error?.message || String(error);
    return NextResponse.json({ error: `Delete failed: ${detail}` }, { status: 500 });
  }
}
