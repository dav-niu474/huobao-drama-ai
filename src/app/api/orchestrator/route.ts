import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  getPhaseStatus,
  getNextPhase,
  isValidPhase,
  derivePhaseFromDrama,
  type CreationPhase,
} from '@/lib/orchestrator/orchestrator';

// GET /api/orchestrator?dramaId=xxx — Get current phase status for a drama project
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const dramaId = searchParams.get('dramaId');
    if (!dramaId) {
      return NextResponse.json(
        { error: 'dramaId query parameter is required' },
        { status: 400 }
      );
    }

    // Check access
    const userId = (session.user as any).id;
    const role = (session.user as any).role;
    const drama = await db.drama.findUnique({
      where: { id: dramaId },
      include: {
        episodes: {
          select: {
            scriptContent: true,
            scriptStatus: true,
            status: true,
            videoUrl: true,
            duration: true,
          },
        },
        characters: { select: { id: true } },
        scenes: { select: { id: true } },
        novel: { select: { parseStatus: true } },
      },
    });

    if (!drama) {
      return NextResponse.json({ error: 'Drama not found' }, { status: 404 });
    }

    if (role !== 'admin' && drama.userId && drama.userId !== userId) {
      return NextResponse.json({ error: '无权访问此项目' }, { status: 403 });
    }

    // Determine current phase
    let currentPhase: CreationPhase;

    if (drama.currentPhase && isValidPhase(drama.currentPhase)) {
      // Use the stored phase
      currentPhase = drama.currentPhase as CreationPhase;
    } else {
      // Derive from drama data if no stored phase
      const episodesWithVideo = drama.episodes.filter(
        (ep) => ep.status === 'completed' || (ep.videoUrl && ep.duration > 0)
      ).length;

      currentPhase = derivePhaseFromDrama({
        novelParsed: drama.novelParsed,
        novelSource: drama.novelSource,
        episodes: drama.episodes.map((ep) => ({
          scriptContent: ep.scriptContent,
          scriptStatus: ep.scriptStatus,
        })),
        characters: drama.characters,
        scenes: drama.scenes,
        assetStatus: drama.assetStatus,
        artStyle: drama.artStyle,
        episodesWithVideo,
        totalEpisodes: drama.episodes.length,
      });

      // Persist the derived phase if it wasn't stored
      if (drama.currentPhase !== currentPhase) {
        await db.drama.update({
          where: { id: dramaId },
          data: { currentPhase },
        });
      }
    }

    const phases = getPhaseStatus(currentPhase);
    const nextPhase = getNextPhase(currentPhase);

    return NextResponse.json({
      dramaId,
      currentPhase,
      phases,
      nextPhase,
      canAdvance: nextPhase !== null,
    });
  } catch (error) {
    console.error('Failed to get orchestrator status:', error);
    return NextResponse.json(
      { error: 'Failed to get phase status' },
      { status: 500 }
    );
  }
}

// POST /api/orchestrator — Advance to next phase
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const body = await request.json();
    const { dramaId } = body;
    if (!dramaId) {
      return NextResponse.json(
        { error: 'dramaId is required' },
        { status: 400 }
      );
    }

    // Check access
    const userId = (session.user as any).id;
    const role = (session.user as any).role;
    const drama = await db.drama.findUnique({
      where: { id: dramaId },
      select: { userId: true, currentPhase: true },
    });

    if (!drama) {
      return NextResponse.json({ error: 'Drama not found' }, { status: 404 });
    }

    if (role !== 'admin' && drama.userId && drama.userId !== userId) {
      return NextResponse.json({ error: '无权访问此项目' }, { status: 403 });
    }

    // Get current phase
    const currentPhase = (drama.currentPhase || 'novel_upload') as CreationPhase;
    const nextPhase = getNextPhase(currentPhase);

    if (!nextPhase) {
      return NextResponse.json(
        { error: 'Already at the final phase (export)' },
        { status: 400 }
      );
    }

    // Advance to next phase
    await db.drama.update({
      where: { id: dramaId },
      data: { currentPhase: nextPhase },
    });

    const phases = getPhaseStatus(nextPhase);
    const newNextPhase = getNextPhase(nextPhase);

    return NextResponse.json({
      success: true,
      dramaId,
      previousPhase: currentPhase,
      currentPhase: nextPhase,
      phases,
      nextPhase: newNextPhase,
      canAdvance: newNextPhase !== null,
    });
  } catch (error) {
    console.error('Failed to advance phase:', error);
    return NextResponse.json(
      { error: 'Failed to advance phase' },
      { status: 500 }
    );
  }
}
