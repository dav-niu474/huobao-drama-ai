import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions, canCreateProject } from '@/lib/auth';
import { db } from '@/lib/db';

// GET /api/dramas - List dramas (filtered by user, or all for admin)
// Returns lightweight per-project production progress + cost aggregates
// computed in 3 batched queries (no N+1) so cards can show real status.
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const userId = (session.user as any).id;
    const role = (session.user as any).role;

    // Admin can see all projects; others see only their own
    const where = role === 'admin' ? {} : { userId };

    const dramas = await db.drama.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include: {
        _count: {
          select: {
            episodes: true,
            characters: true,
            scenes: true,
          },
        },
      },
    });

    const dramaIds = dramas.map((d) => d.id);

    // ── Batched aggregates across all listed dramas ──
    let episodeRows: Array<{
      dramaId: string;
      scriptStatus: string;
      videoUrl: string | null;
      duration: number;
    }> = [];
    let storyboardRows: Array<{
      episode: { dramaId: string };
      firstFrameUrl: string | null;
      videoUrl: string | null;
      composedUrl: string | null;
      ttsAudioUrl: string | null;
    }> = [];
    let costRows: Array<{ dramaId: string; _sum: { credits: number | null } }> = [];

    if (dramaIds.length > 0) {
      const [eps, sbs, costs] = await Promise.all([
        db.episode.findMany({
          where: { dramaId: { in: dramaIds } },
          select: {
            dramaId: true,
            scriptStatus: true,
            videoUrl: true,
            duration: true,
          },
        }),
        db.storyboard.findMany({
          where: { episode: { dramaId: { in: dramaIds } } },
          select: {
            episode: { select: { dramaId: true } },
            firstFrameUrl: true,
            videoUrl: true,
            composedUrl: true,
            ttsAudioUrl: true,
          },
        }),
        db.generationCost.groupBy({
          by: ['dramaId'],
          where: { dramaId: { in: dramaIds } },
          _sum: { credits: true },
        }),
      ]);
      episodeRows = eps;
      storyboardRows = sbs;
      costRows = costs;
    }

    // ── Per-drama in-memory rollup ──
    const progressByDrama = new Map<
      string,
      {
        scriptedEpisodes: number;
        episodesWithVideo: number;
        totalDuration: number;
        storyboards: number;
        shotsWithImage: number;
        shotsWithVideo: number;
        shotsComposed: number;
        costCredits: number;
      }
    >();
    const ensure = (dramaId: string) => {
      let p = progressByDrama.get(dramaId);
      if (!p) {
        p = {
          scriptedEpisodes: 0,
          episodesWithVideo: 0,
          totalDuration: 0,
          storyboards: 0,
          shotsWithImage: 0,
          shotsWithVideo: 0,
          shotsComposed: 0,
          costCredits: 0,
        };
        progressByDrama.set(dramaId, p);
      }
      return p;
    };

    for (const ep of episodeRows) {
      const p = ensure(ep.dramaId);
      if (ep.scriptStatus === 'completed') p.scriptedEpisodes++;
      if (ep.videoUrl) p.episodesWithVideo++;
      p.totalDuration += ep.duration || 0;
    }
    for (const sb of storyboardRows) {
      const p = ensure(sb.episode.dramaId);
      p.storyboards++;
      if (sb.firstFrameUrl) p.shotsWithImage++;
      if (sb.videoUrl) p.shotsWithVideo++;
      if (sb.composedUrl) p.shotsComposed++;
    }
    for (const c of costRows) {
      ensure(c.dramaId).costCredits = Math.round((c._sum.credits || 0) * 100) / 100;
    }

    const result = dramas.map((d) => ({
      ...d,
      _count: {
        episodes: d._count.episodes,
        characters: d._count.characters,
        scenes: d._count.scenes,
      },
      progress: progressByDrama.get(d.id) ?? {
        scriptedEpisodes: 0,
        episodesWithVideo: 0,
        totalDuration: 0,
        storyboards: 0,
        shotsWithImage: 0,
        shotsWithVideo: 0,
        shotsComposed: 0,
        costCredits: 0,
      },
    }));

    return NextResponse.json({ dramas: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : '';
    console.error('Failed to list dramas:', message, stack);
    return NextResponse.json(
      { error: 'Failed to list dramas', detail: message },
      { status: 500 }
    );
  }
}

// POST /api/dramas - Create a new drama
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const userId = (session.user as any).id;
    const role = (session.user as any).role;

    // Check project limit
    const currentCount = await db.drama.count({
      where: { userId },
    });

    if (!canCreateProject(role, currentCount)) {
      return NextResponse.json(
        { error: `免费用户最多创建3个项目，当前已有${currentCount}个。升级专业版可无限制创建。` },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { title, description, genre, style } = body;

    if (!title) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    const drama = await db.drama.create({
      data: {
        title,
        description: description || '',
        genre: genre || '都市',
        style: style || 'realistic',
        userId,
      },
    });

    return NextResponse.json(drama, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Failed to create drama:', message);
    return NextResponse.json(
      { error: 'Failed to create drama', detail: message },
      { status: 500 }
    );
  }
}
