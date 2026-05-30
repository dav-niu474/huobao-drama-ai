import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/dramas/[id]/characters - List characters for a drama
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: dramaId } = await params;
    const characters = await db.character.findMany({
      where: { dramaId },
      orderBy: { createdAt: 'asc' },
    });

    return NextResponse.json({ characters });
  } catch (error) {
    console.error('Failed to list characters:', error);
    return NextResponse.json({ error: 'Failed to list characters' }, { status: 500 });
  }
}

// POST /api/dramas/[id]/characters - Create character
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: dramaId } = await params;
    const body = await request.json();
    const { name, role, gender, age, appearance, personality } = body;

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    const character = await db.character.create({
      data: {
        dramaId,
        name,
        role: role || 'supporting',
        gender: gender || 'unknown',
        age: age || '',
        appearance: appearance || '',
        personality: personality || '',
      },
    });

    return NextResponse.json(character, { status: 201 });
  } catch (error) {
    console.error('Failed to create character:', error);
    return NextResponse.json({ error: 'Failed to create character' }, { status: 500 });
  }
}

// PATCH /api/dramas/[id]/characters - Update a character (e.g., assign voiceId)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: dramaId } = await params;
    const body = await request.json();
    const { characterId, voiceId, voiceStyle, personality, appearance, imagePrompt } = body;

    if (!characterId) {
      return NextResponse.json({ error: 'characterId is required' }, { status: 400 });
    }

    // Verify character belongs to this drama
    const character = await db.character.findUnique({
      where: { id: characterId },
    });

    if (!character || character.dramaId !== dramaId) {
      return NextResponse.json({ error: 'Character not found in this drama' }, { status: 404 });
    }

    // Build update data from provided fields
    const updateData: Record<string, string> = {};
    if (voiceId !== undefined) updateData.voiceId = voiceId;
    if (voiceStyle !== undefined) updateData.voiceStyle = voiceStyle;
    if (personality !== undefined) updateData.personality = personality;
    if (appearance !== undefined) updateData.appearance = appearance;
    if (imagePrompt !== undefined) updateData.imagePrompt = imagePrompt;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const updated = await db.character.update({
      where: { id: characterId },
      data: updateData,
    });

    return NextResponse.json({ character: updated });
  } catch (error) {
    console.error('Failed to update character:', error);
    return NextResponse.json({ error: 'Failed to update character' }, { status: 500 });
  }
}
