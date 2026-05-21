import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// PATCH /api/storyboards/[id] - Update storyboard
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    // Only allow updating specific fields
    const allowedFields = [
      'shotNumber', 'title', 'shotType', 'cameraAngle', 'cameraMovement',
      'action', 'description', 'dialogue', 'dialogueChar', 'duration', 'imagePrompt',
      'videoPrompt', 'atmosphere', 'firstFrameUrl', 'lastFrameUrl', 'videoUrl',
      'ttsAudioUrl', 'composedUrl', 'bgmPrompt', 'soundEffect', 'referenceImages', 'status',
    ];
    const data: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (field in body) {
        data[field] = body[field];
      }
    }

    const storyboard = await db.storyboard.update({
      where: { id },
      data,
    });

    return NextResponse.json(storyboard);
  } catch (error) {
    console.error('Failed to update storyboard:', error);
    return NextResponse.json({ error: 'Failed to update storyboard' }, { status: 500 });
  }
}
