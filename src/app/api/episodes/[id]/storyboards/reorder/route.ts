import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// POST /api/episodes/[id]/storyboards/reorder - Batch reorder storyboards
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: episodeId } = await params;
    const body = await request.json();
    const { orderedIds } = body as { orderedIds: string[] };

    if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
      return NextResponse.json(
        { error: 'orderedIds must be a non-empty array of storyboard IDs' },
        { status: 400 }
      );
    }

    // Verify all storyboards belong to this episode
    const storyboards = await db.storyboard.findMany({
      where: { episodeId },
    });

    const storyboardIds = new Set(storyboards.map((s) => s.id));

    for (const id of orderedIds) {
      if (!storyboardIds.has(id)) {
        return NextResponse.json(
          { error: `Storyboard ${id} does not belong to episode ${episodeId}` },
          { status: 400 }
        );
      }
    }

    // Update shot numbers in a transaction
    const updates = orderedIds.map((id, index) =>
      db.storyboard.update({
        where: { id },
        data: { shotNumber: index + 1 },
      })
    );

    await db.$transaction(updates);

    // Return updated storyboards
    const updatedStoryboards = await db.storyboard.findMany({
      where: { episodeId },
      orderBy: { shotNumber: 'asc' },
    });

    return NextResponse.json({ storyboards: updatedStoryboards });
  } catch (error) {
    console.error('Failed to reorder storyboards:', error);
    return NextResponse.json(
      { error: 'Failed to reorder storyboards' },
      { status: 500 }
    );
  }
}
