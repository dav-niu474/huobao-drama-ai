// ============================================================
// Reference Image Collector
// Collects character and scene reference images from the database
// for injection into image generation prompts — the core
// consistency mechanism for maintaining character/scene coherence
// across AI-generated storyboard frames.
// ============================================================

import { db } from '@/lib/db'

export interface CollectedReferences {
  characterImages: Array<{
    name: string
    imageUrl: string
    description: string
    visualFingerprint?: string  // JSON string of extracted visual features
    styleLock?: boolean         // Whether this character has style lock enabled
  }>
  sceneImages: Array<{
    location: string
    imageUrl: string
    description: string
    styleLock?: boolean         // Whether this scene has style lock enabled
  }>
  allImageUrls: string[]
}

export interface VisualFingerprint {
  hair?: string        // e.g., "black shoulder-length hair"
  eyes?: string        // e.g., "dark brown eyes"
  face?: string        // e.g., "sharp jawline, high cheekbones"
  skin?: string        // e.g., "fair skin"
  build?: string       // e.g., "slim build"
  clothing?: string    // e.g., "dark blue business suit"
  distinctive?: string // e.g., "scar on left cheek"
  overall?: string     // Full description for injection
}

/**
 * Collect reference images for a storyboard frame.
 * Looks up the episode → drama → characters + scenes,
 * then gathers their reference images.
 * Now includes style lock and visual fingerprint data.
 *
 * @param episodeId   The episode ID to look up
 * @param dialogueChar  Optional: character name mentioned in dialogue (for prioritized lookup)
 * @param sceneLocation Optional: scene location string (for scene reference lookup)
 */
export async function collectStoryboardReferences(
  episodeId: string,
  dialogueChar?: string,
  sceneLocation?: string
): Promise<CollectedReferences> {
  // 1. Find the episode and drama
  const episode = await db.episode.findUnique({
    where: { id: episodeId },
    select: { dramaId: true },
  })
  if (!episode) return { characterImages: [], sceneImages: [], allImageUrls: [] }

  const dramaId = episode.dramaId

  // 2. Collect character reference images
  const characterImages: CollectedReferences['characterImages'] = []

  // If a specific character is mentioned in dialogue, prioritize their reference
  if (dialogueChar) {
    // Support alias matching (e.g., "顾娘子/顾盼之")
    const characters = await db.character.findMany({
      where: { dramaId, name: { contains: dialogueChar } },
      include: { appearances: { where: { appearanceIndex: 0 }, take: 1 } },
    })

    for (const char of characters) {
      const primaryAppearance = char.appearances[0]
      // Use locked reference image when style lock is enabled
      const refUrl = char.styleLock && char.lockedReferenceImage
        ? char.lockedReferenceImage
        : (primaryAppearance?.imageUrl || char.imageUrl)

      if (refUrl) {
        characterImages.push({
          name: char.name,
          imageUrl: refUrl,
          description: primaryAppearance?.description || char.appearance,
          visualFingerprint: char.visualFingerprint || undefined,
          styleLock: char.styleLock || undefined,
        })
      }
    }
  }

  // If no specific character matched, collect ALL character references for this drama
  if (characterImages.length === 0) {
    const allCharacters = await db.character.findMany({
      where: { dramaId },
      include: { appearances: { where: { appearanceIndex: 0 }, take: 1 } },
    })

    for (const char of allCharacters) {
      const primaryAppearance = char.appearances[0]
      // Use locked reference image when style lock is enabled
      const refUrl = char.styleLock && char.lockedReferenceImage
        ? char.lockedReferenceImage
        : (primaryAppearance?.imageUrl || char.imageUrl)

      if (refUrl) {
        characterImages.push({
          name: char.name,
          imageUrl: refUrl,
          description: primaryAppearance?.description || char.appearance,
          visualFingerprint: char.visualFingerprint || undefined,
          styleLock: char.styleLock || undefined,
        })
      }
    }
  }

  // 3. Collect scene reference images
  const sceneImages: CollectedReferences['sceneImages'] = []

  if (sceneLocation) {
    const scenes = await db.scene.findMany({
      where: { dramaId, location: { contains: sceneLocation } },
      include: { images: { where: { isSelected: true }, take: 1 } },
    })

    for (const scene of scenes) {
      const selectedImage = scene.images[0]
      // Use locked reference image when style lock is enabled
      const refUrl = scene.styleLock && scene.lockedReferenceImage
        ? scene.lockedReferenceImage
        : (selectedImage?.imageUrl || scene.imageUrl)

      if (refUrl) {
        sceneImages.push({
          location: scene.location,
          imageUrl: refUrl,
          description: selectedImage?.description || scene.description,
          styleLock: scene.styleLock || undefined,
        })
      }
    }
  }

  // 4. Deduplicate and filter image URLs
  const allImageUrls = Array.from(
    new Set(
      [
        ...characterImages.map((c) => c.imageUrl),
        ...sceneImages.map((s) => s.imageUrl),
      ].filter((url): url is string => Boolean(url && url.trim()))
    )
  )

  return { characterImages, sceneImages, allImageUrls }
}

/**
 * Build an enhanced prompt that includes character/scene descriptions
 * from the collected references. This is used when the image provider
 * does NOT support reference images natively — the text descriptions
 * still help the model maintain some consistency.
 *
 * @param basePrompt   The original image generation prompt
 * @param references   Collected references from collectStoryboardReferences()
 * @returns Enhanced prompt string
 */
export function buildEnhancedPrompt(
  basePrompt: string,
  references: CollectedReferences
): string {
  const parts: string[] = []

  if (references.characterImages.length > 0) {
    const charDescs = references.characterImages
      .map((c) => `${c.name} (${c.description})`)
      .join('; ')
    parts.push(`Characters in scene: [${charDescs}]`)
  }

  if (references.sceneImages.length > 0) {
    const sceneDescs = references.sceneImages
      .map((s) => `${s.location} (${s.description})`)
      .join('; ')
    parts.push(`Scene: [${sceneDescs}]`)
  }

  if (parts.length === 0) return basePrompt

  // Keep the enhanced context concise — don't overload the model
  return `${parts.join('. ')}. ${basePrompt}`
}

/**
 * Build a consistency instruction prompt from character visual fingerprints.
 * This is a STRONGER version of buildEnhancedPrompt that injects explicit
 * visual feature requirements — ensuring the AI model maintains character
 * appearance across all generations, even without native reference image support.
 *
 * Works across ALL providers because it's purely text-based.
 *
 * @param basePrompt      The original image generation prompt
 * @param references      Collected references with visual fingerprints
 * @param dramaStyle      Optional drama-level style template prefix
 * @returns Enhanced prompt with consistency instructions
 */
export function buildConsistencyPrompt(
  basePrompt: string,
  references: CollectedReferences,
  dramaStyle?: string
): string {
  const sections: string[] = []

  // Drama-level style template
  if (dramaStyle?.trim()) {
    sections.push(`STYLE: ${dramaStyle.trim()}`)
  }

  // Character consistency instructions
  const lockedChars = references.characterImages.filter(c => c.styleLock && c.visualFingerprint)
  if (lockedChars.length > 0) {
    const charInstructions = lockedChars.map(c => {
      try {
        const fp: VisualFingerprint = JSON.parse(c.visualFingerprint!)
        const features = [
          fp.hair, fp.eyes, fp.face, fp.skin, fp.build, fp.clothing, fp.distinctive
        ].filter(Boolean).join(', ')
        return `- ${c.name}: MUST have ${features || fp.overall || c.description}`
      } catch {
        return `- ${c.name}: MUST maintain appearance: ${c.description}`
      }
    }).join('\n')

    sections.push(
      'CHARACTER CONSISTENCY REQUIREMENT (DO NOT ALTER THESE FEATURES):\n' +
      charInstructions
    )
  }

  // Scene consistency instructions
  const lockedScenes = references.sceneImages.filter(s => s.styleLock)
  if (lockedScenes.length > 0) {
    const sceneInstructions = lockedScenes.map(s =>
      `- ${s.location}: MUST maintain visual style consistency`
    ).join('\n')

    sections.push(
      'SCENE CONSISTENCY REQUIREMENT:\n' + sceneInstructions
    )
  }

  // Fallback: add basic character/scene descriptions if no style locks
  const unlockedChars = references.characterImages.filter(c => !c.styleLock)
  if (unlockedChars.length > 0) {
    const charDescs = unlockedChars
      .map(c => `${c.name} (${c.description})`)
      .join('; ')
    sections.push(`Characters: [${charDescs}]`)
  }

  const unlockedScenes = references.sceneImages.filter(s => !s.styleLock)
  if (unlockedScenes.length > 0) {
    const sceneDescs = unlockedScenes
      .map(s => `${s.location} (${s.description})`)
      .join('; ')
    sections.push(`Scene: [${sceneDescs}]`)
  }

  if (sections.length === 0) return basePrompt

  return sections.join('\n\n') + '\n\n' + basePrompt
}

/**
 * Collect reference images for character portrait generation.
 * Now respects styleLock and lockedReferenceImage when enabled.
 *
 * @param characterId  The character ID
 * @returns Array of reference image URLs (locked reference or primary appearance)
 */
export async function collectCharacterReferences(
  characterId: string
): Promise<string[]> {
  // Check for style lock first
  const character = await db.character.findUnique({
    where: { id: characterId },
    select: {
      styleLock: true,
      lockedReferenceImage: true,
      imageUrl: true,
      appearances: {
        where: { appearanceIndex: 0 },
        take: 1,
        select: { imageUrl: true },
      },
    },
  })

  if (!character) return []

  const urls: string[] = []

  // If style lock is enabled, use the locked reference image
  if (character.styleLock && character.lockedReferenceImage) {
    urls.push(character.lockedReferenceImage)
  }

  // Also add primary appearance as additional reference
  const primaryAppearance = character.appearances[0]
  if (primaryAppearance?.imageUrl && primaryAppearance.imageUrl.trim()) {
    if (!urls.includes(primaryAppearance.imageUrl)) {
      urls.push(primaryAppearance.imageUrl)
    }
  }

  // Fallback to character.imageUrl
  if (urls.length === 0 && character.imageUrl?.trim()) {
    urls.push(character.imageUrl)
  }

  return urls.filter(Boolean)
}

/**
 * Collect reference images for scene image generation.
 * Now respects styleLock and lockedReferenceImage when enabled.
 *
 * @param sceneId  The scene ID
 * @returns Array of reference image URLs
 */
export async function collectSceneReferences(
  sceneId: string
): Promise<string[]> {
  // Check for style lock first
  const scene = await db.scene.findUnique({
    where: { id: sceneId },
    select: {
      styleLock: true,
      lockedReferenceImage: true,
      imageUrl: true,
      images: {
        where: { isSelected: true },
        take: 1,
        select: { imageUrl: true },
      },
    },
  })

  if (!scene) return []

  const urls: string[] = []

  // If style lock is enabled, use the locked reference image
  if (scene.styleLock && scene.lockedReferenceImage) {
    urls.push(scene.lockedReferenceImage)
  }

  // Also add selected scene image as additional reference
  const selectedImage = scene.images[0]
  if (selectedImage?.imageUrl && selectedImage.imageUrl.trim()) {
    if (!urls.includes(selectedImage.imageUrl)) {
      urls.push(selectedImage.imageUrl)
    }
  }

  // Fallback to scene.imageUrl
  if (urls.length === 0 && scene.imageUrl?.trim()) {
    urls.push(scene.imageUrl)
  }

  return urls.filter(Boolean)
}

/**
 * Extract a detailed visual fingerprint from a character image using AI Vision.
 * Returns structured JSON with hair, eyes, face, skin, build, clothing features.
 *
 * @param imageUrl  The character image URL to analyze
 * @param characterName  Optional character name for context
 * @returns VisualFingerprint object
 */
export async function extractVisualFingerprint(
  imageUrl: string,
  characterName?: string
): Promise<VisualFingerprint> {
  const { aiClient } = await import('@/lib/ai-config')

  const prompt = `Analyze this character portrait image and extract detailed visual features. Return a JSON object with these fields:
- hair: hair color, style, length (e.g., "black shoulder-length straight hair")
- eyes: eye color, shape (e.g., "dark brown almond-shaped eyes")
- face: facial structure (e.g., "oval face, sharp jawline, high cheekbones")
- skin: skin tone (e.g., "fair skin with warm undertone")
- build: body type (e.g., "slim athletic build")
- clothing: outfit description (e.g., "dark navy business suit, white shirt")
- distinctive: any unique features (e.g., "small mole on left cheek, thin glasses")
- overall: a single comprehensive sentence describing the character's complete visual appearance${characterName ? `\n\nCharacter name: ${characterName}` : ''}

IMPORTANT: Return ONLY valid JSON, no other text.`

  try {
    // Use AI Vision (chat with image) to extract features
    // For providers that support multimodal, we'd pass the image
    // For text-only LLMs, we fall back to the character description
    const result = await aiClient.chatJson<VisualFingerprint>(
      [
        {
          role: 'system',
          content: 'You are a character design analyst. Extract precise visual features from character descriptions. Always return valid JSON.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      { temperature: 0.3, max_tokens: 500 }
    )

    // Validate and return
    if (result && typeof result === 'object') {
      return {
        hair: result.hair || undefined,
        eyes: result.eyes || undefined,
        face: result.face || undefined,
        skin: result.skin || undefined,
        build: result.build || undefined,
        clothing: result.clothing || undefined,
        distinctive: result.distinctive || undefined,
        overall: result.overall || undefined,
      }
    }
  } catch (err) {
    console.warn('Failed to extract visual fingerprint via AI Vision:', err)
  }

  // Fallback: return empty fingerprint
  return {}
}
