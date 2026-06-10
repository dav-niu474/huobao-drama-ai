import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  getPhaseStatus,
  isValidPhase,
  derivePhaseFromDrama,
  getPhasesByModule,
  type CreationPhase,
} from '@/lib/orchestrator/orchestrator';

// GET /api/orchestrator/progress?dramaId=xxx — Get detailed progress information for each phase
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
            id: true,
            scriptContent: true,
            scriptStatus: true,
            status: true,
            videoUrl: true,
            duration: true,
            storyboards: { select: { id: true } },
          },
        },
        characters: { select: { id: true, name: true } },
        scenes: { select: { id: true, location: true } },
        props: { select: { id: true } },
        novel: { select: { parseStatus: true, fileSize: true } },
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
      currentPhase = drama.currentPhase as CreationPhase;
    } else {
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
    }

    const phases = getPhaseStatus(currentPhase);
    const phasesByModule = getPhasesByModule(currentPhase);

    // Compute detailed progress for each phase
    const totalEpisodes = drama.episodes.length;
    const episodesWithScript = drama.episodes.filter(
      (ep) => ep.scriptContent
    ).length;
    const episodesWithVideo = drama.episodes.filter(
      (ep) => ep.status === 'completed' || (ep.videoUrl && ep.duration > 0)
    ).length;

    const progressDetails: Record<string, { completed: number; total: number; percentage: number; details: string }> = {
      novel_upload: {
        completed: drama.novelSource ? 1 : 0,
        total: 1,
        percentage: drama.novelSource ? 100 : 0,
        details: drama.novelSource ? '已上传' : '未上传',
      },
      novel_analysis: {
        completed: drama.novelParsed ? 1 : 0,
        total: 1,
        percentage: drama.novelParsed ? 100 : 0,
        details: drama.novelParsed ? '已解析' : '未解析',
      },
      show_planning: {
        completed: drama.showPlanLocked ? 1 : 0,
        total: 1,
        percentage: drama.showPlanLocked ? 100 : 0,
        details: drama.showPlanLocked ? '已锁定' : '未锁定',
      },
      script_writing: {
        completed: episodesWithScript,
        total: totalEpisodes || 1,
        percentage: totalEpisodes > 0 ? Math.round((episodesWithScript / totalEpisodes) * 100) : 0,
        details: `${episodesWithScript}/${totalEpisodes} 集已生成`,
      },
      asset_extraction: {
        completed: drama.assetStatus === 'ready' ? 1 : (drama.characters.length > 0 || drama.scenes.length > 0) ? 0.5 : 0,
        total: 1,
        percentage: drama.assetStatus === 'ready' ? 100 : (drama.characters.length > 0 || drama.scenes.length > 0) ? 50 : 0,
        details: `${drama.characters.length} 角色, ${drama.scenes.length} 场景, ${drama.props.length} 道具`,
      },
      art_direction: {
        completed: drama.artStyle ? 1 : 0,
        total: 1,
        percentage: drama.artStyle ? 100 : 0,
        details: drama.artStyle || '未选择',
      },
      production: {
        completed: episodesWithVideo,
        total: totalEpisodes || 1,
        percentage: totalEpisodes > 0 ? Math.round((episodesWithVideo / totalEpisodes) * 100) : 0,
        details: `${episodesWithVideo}/${totalEpisodes} 集已完成`,
      },
      export: {
        completed: 0,
        total: totalEpisodes || 1,
        percentage: 0,
        details: '未开始导出',
      },
    };

    return NextResponse.json({
      dramaId,
      currentPhase,
      phases,
      phasesByModule,
      progressDetails,
      summary: {
        totalPhases: 8,
        completedPhases: phases.filter((p) => p.status === 'completed').length,
        activePhase: currentPhase,
        overallPercentage: Math.round(
          (phases.filter((p) => p.status === 'completed').length / 8) * 100
        ),
      },
    });
  } catch (error) {
    console.error('Failed to get orchestrator progress:', error);
    return NextResponse.json(
      { error: 'Failed to get progress information' },
      { status: 500 }
    );
  }
}
