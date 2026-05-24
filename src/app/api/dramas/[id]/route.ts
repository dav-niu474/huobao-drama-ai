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
        novel: true,
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

    // Use a transaction with extended timeout to safely delete drama and all related records.
    // We do manual cascade instead of relying on onDelete because
    // prisma db push may not always sync FK constraints on Vercel.
    // Timeout increased to 30s (default 5s is too short for many deleteMany calls).
    await db.$transaction(async (tx) => {
      // ── Delete leaf-level records first (depth-first) ──
      // Use subqueries via $queryRaw to get IDs in a single round-trip per parent model,
      // instead of separate findMany + deleteMany which doubles the query count.

      // 1. Delete storyboards linked to episodes of this drama
      await tx.$executeRaw`
        DELETE FROM "Storyboard" WHERE "episodeId" IN (
          SELECT id FROM "Episode" WHERE "dramaId" = ${id}
        )
      `;

      // 2. Delete character appearances linked to characters of this drama
      await tx.$executeRaw`
        DELETE FROM "CharacterAppearance" WHERE "characterId" IN (
          SELECT id FROM "Character" WHERE "dramaId" = ${id}
        )
      `;

      // 3. Delete scene images linked to scenes of this drama
      await tx.$executeRaw`
        DELETE FROM "SceneImage" WHERE "sceneId" IN (
          SELECT id FROM "Scene" WHERE "dramaId" = ${id}
        )
      `;

      // 4. Delete video merges linked to episodes of this drama
      await tx.$executeRaw`
        DELETE FROM "VideoMerge" WHERE "episodeId" IN (
          SELECT id FROM "Episode" WHERE "dramaId" = ${id}
        )
      `;

      // ── Delete mid-level records ──

      // 4b. Delete associated novel (if exists)
      await tx.novel.deleteMany({ where: { dramaId: id } });

      // 5. Delete episodes
      await tx.episode.deleteMany({ where: { dramaId: id } });

      // 6. Delete characters
      await tx.character.deleteMany({ where: { dramaId: id } });

      // 7. Delete scenes
      await tx.scene.deleteMany({ where: { dramaId: id } });

      // 8. Delete props
      await tx.prop.deleteMany({ where: { dramaId: id } });

      // ── Delete/nullify top-level references ──

      // 9. Delete generation costs
      await tx.generationCost.deleteMany({ where: { dramaId: id } });

      // 10. Nullify references in ImageGeneration (keep records for analytics)
      await tx.$executeRaw`
        UPDATE "ImageGeneration" SET "dramaId" = NULL WHERE "dramaId" = ${id}
      `;

      // 11. Nullify references in VideoGeneration
      await tx.$executeRaw`
        UPDATE "VideoGeneration" SET "dramaId" = NULL WHERE "dramaId" = ${id}
      `;

      // 12. Finally delete the drama itself
      await tx.drama.delete({ where: { id } });
    }, { maxWait: 10000, timeout: 30000 });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Failed to delete drama:', error);
    const detail = error?.meta?.cause || error?.message || String(error);
    return NextResponse.json({ error: `Delete failed: ${detail}` }, { status: 500 });
  }
}
