import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth-helpers';

// GET /api/episodes/[id]/storyboards - List storyboards for an episode
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { id: episodeId } = await params;
    const storyboards = await db.storyboard.findMany({
      where: { episodeId },
      orderBy: { shotNumber: 'asc' },
    });

    return NextResponse.json({ storyboards });
  } catch (error) {
    console.error('Failed to list storyboards:', error);
    return NextResponse.json({ error: 'Failed to list storyboards' }, { status: 500 });
  }
}

// POST /api/episodes/[id]/storyboards - Create storyboard
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { id: episodeId } = await params;
    const body = await request.json();
    const {
      shotNumber,
      title,
      shotType,
      cameraAngle,
      cameraMovement,
      action,
      dialogue,
      dialogueChar,
      duration,
      imagePrompt,
      videoPrompt,
      atmosphere,
    } = body;

    if (shotNumber === undefined || shotNumber === null) {
      return NextResponse.json({ error: 'shotNumber is required' }, { status: 400 });
    }

    const storyboard = await db.storyboard.create({
      data: {
        episodeId,
        shotNumber,
        title: title || '',
        shotType: shotType || 'medium',
        cameraAngle: cameraAngle || 'eye-level',
        cameraMovement: cameraMovement || 'static',
        action: action || '',
        dialogue: dialogue || null,
        dialogueChar: dialogueChar || null,
        duration: duration ?? 3.0,
        imagePrompt: imagePrompt || null,
        videoPrompt: videoPrompt || null,
        atmosphere: atmosphere || null,
      },
    });

    return NextResponse.json(storyboard, { status: 201 });
  } catch (error) {
    console.error('Failed to create storyboard:', error);
    return NextResponse.json({ error: 'Failed to create storyboard' }, { status: 500 });
  }
}
