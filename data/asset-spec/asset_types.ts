/**
 * asset_types.ts — Central Asset Type Specification
 *
 * One spec drives all CRUD. Inspired by ArcReel's asset_types.py.
 * This file is the single source of truth for:
 *   - Asset categories and their fields
 *   - Validation rules
 *   - Anchor layers for visual consistency
 *   - Weight tiers for generation depth
 *
 * Loaded at runtime by the skill system and asset CRUD services.
 */

// ─── Weight Tier Definitions ────────────────────────────────────────────────

export type WeightTier = 'A' | 'B' | 'C';

export const WEIGHT_TIERS: Record<WeightTier, {
  label: string;
  labelZh: string;
  weightRange: [number, number];
  requiredVisualAssets: string[];
  totalImagesMin: number;
}> = {
  A: {
    label: 'Protagonist',
    labelZh: '主角',
    weightRange: [7, 10],
    requiredVisualAssets: ['reference', 'three_views', 'avatar', 'wardrobe_all'],
    totalImagesMin: 5,
  },
  B: {
    label: 'Key Supporting',
    labelZh: '重要配角',
    weightRange: [4, 6],
    requiredVisualAssets: ['reference', 'three_views', 'avatar', 'wardrobe_min2'],
    totalImagesMin: 5,
  },
  C: {
    label: 'Extra',
    labelZh: '群演',
    weightRange: [1, 3],
    requiredVisualAssets: ['reference', 'avatar'],
    totalImagesMin: 2,
  },
};

// ─── Asset Quality Tiers (controlled by 02-show-planner) ────────────────────

export type AssetQualityTier = 'economy' | 'standard' | 'premium';

export const ASSET_QUALITY_TIERS: Record<AssetQualityTier, {
  label: string;
  description: string;
  tierAMinimum: string[];
  tierBMinimum: string[];
  tierCMinimum: string[];
  estimatedImagesFor12Chars: number;
  estimatedCostCNY: number;
}> = {
  economy: {
    label: '经济档',
    description: '仅 Tier-A 主角四件套；Tier-B 仅 reference + avatar；Tier-C 仅 reference',
    tierAMinimum: ['reference', 'three_views', 'avatar', 'wardrobe_all'],
    tierBMinimum: ['reference', 'avatar'],
    tierCMinimum: ['reference'],
    estimatedImagesFor12Chars: 20,
    estimatedCostCNY: 9,
  },
  standard: {
    label: '标准档',
    description: 'Tier-A 四件套 + 全衣橱；Tier-B 四件套 + 衣橱 ≥ 2 套；Tier-C reference + avatar',
    tierAMinimum: ['reference', 'three_views', 'avatar', 'wardrobe_all'],
    tierBMinimum: ['reference', 'three_views', 'avatar', 'wardrobe_min2'],
    tierCMinimum: ['reference', 'avatar'],
    estimatedImagesFor12Chars: 38,
    estimatedCostCNY: 18,
  },
  premium: {
    label: '高端档',
    description: '全角色按 Tier-A 处理（含群演也做三视图 + 衣橱）',
    tierAMinimum: ['reference', 'three_views', 'avatar', 'wardrobe_all'],
    tierBMinimum: ['reference', 'three_views', 'avatar', 'wardrobe_all'],
    tierCMinimum: ['reference', 'three_views', 'avatar', 'wardrobe_all'],
    estimatedImagesFor12Chars: 60,
    estimatedCostCNY: 30,
  },
};

// ─── Character Asset Type ───────────────────────────────────────────────────

export interface CharacterAsset {
  character_id: string;
  name: string;
  aliases: string[];

  // Role & Weight
  role_type: 'protagonist' | 'antagonist' | 'supporting' | 'extra';
  weight: number; // 1-10, determines tier

  // Appearance
  appearance: {
    gender: 'male' | 'female' | 'other';
    age_range: 'child' | 'teen' | 'young_adult' | 'middle_aged' | 'elderly';
    body_type: string;
    facial: string;
    hair: string;
    clothing: string;
    distinguishing_features: string;
  };

  personality_tags: string[];
  arc_brief: string;
  background: string;

  // 6-Layer Identity Anchors (key for visual consistency)
  identity_anchors: {
    face_shape: string;        // e.g., "椭圆 + 微尖下巴 + 左眼尾小痣"
    hair_signature: string;    // e.g., "乌黑长发 + 白玉簪"
    color_palette: string;     // e.g., "#0F1729 + #C9A96E + #E8DCC4"
    silhouette: string;        // e.g., "瘦高直立姿态 + 长袍轻摆"
    signature_prop: string;    // e.g., "母亲遗物玉牌（系于腰间）"
    scene_context: string;     // e.g., "苏府闺阁 / 落霞峰修仙宗门"
  };

  // Wardrobe
  wardrobe: Array<{
    outfit_id: string;
    description: string;
    occasion: 'casual' | 'formal' | 'combat' | 'pajamas' | 'default';
    appears_in_episodes: number[];
  }>;

  // Appearance distribution
  appearance_episodes: number[];
  total_episode_count: number;
  total_dialogue_count: number;

  // Relationships
  relationships: Array<{
    target_id: string;
    type: string;
    note: string;
  }>;

  // Merge tracking
  merge_history?: Array<{
    merged_from: string;
    merged_at: string;
    merged_by_plan: string;
    affected_episodes: number[];
  }>;

  // Voice (written by 10-voice-assigner)
  voice_id: string | null;
  cloned_voice_path: string | null;

  // Visual references (written by 06-character-designer)
  reference_image: string | null;
  prompt_zh: string;
  prompt_en: string;
}

// ─── Scene Asset Type ───────────────────────────────────────────────────────

export interface SceneAsset {
  scene_id: string;
  location: string;
  description: string;

  // Optional fields
  time_of_day?: 'dawn' | 'morning' | 'noon' | 'afternoon' | 'dusk' | 'night' | 'late_night';
  atmosphere?: string;
  season?: 'spring' | 'summer' | 'autumn' | 'winter';
  lighting?: string;

  // Classification
  importance: 'high' | 'medium' | 'low';
  is_main_scene: boolean;
  derived_from?: string; // parent scene_id if this is a derivative

  // Tracking
  appearances: number[]; // episode numbers

  // Prompts (written by 04-asset-extractor)
  prompt_zh: string;
  prompt_en: string;

  // Visual (written by 06-character-designer)
  reference_image: string | null;
}

// ─── Prop Asset Type ────────────────────────────────────────────────────────

export interface PropAsset {
  prop_id: string;
  name: string;
  category: 'weapon' | 'vehicle' | 'keyItem' | 'costume' | 'food' | 'document' | 'other';
  description: string;

  // Importance
  importance: 'plot_critical' | 'scene_important' | 'background';
  state_tracking?: boolean; // whether this prop changes state across episodes

  // Tracking
  appears_in_episodes: number[];

  // Prompts
  prompt_zh: string;
  prompt_en: string;

  // Visual
  reference_image: string | null;
}

// ─── Wardrobe Asset Type ────────────────────────────────────────────────────

export interface WardrobeAsset {
  wardrobe_id: string;
  name: string;
  character_id: string; // FK to character

  description: string;
  scene_match?: string; // which scenes this outfit is for

  // Visual views
  views: Array<{
    view_type: 'front' | 'back' | 'detail';
    image_path: string | null;
  }>;
}

// ─── Clue Asset Type ────────────────────────────────────────────────────────

export interface ClueAsset {
  clue_id: string;
  name: string;
  visual_anchor: string; // e.g., "玉色泛青 + 雕刻'凤离'二字 + 系红绳"

  // Cross-episode tracking
  trace_episodes: number[];
  state_changes: Array<{
    episode: number;
    state: string;
    visual_diff: string;
  }>;

  importance: 'plot_critical' | 'symbolic' | 'recurring';

  // Prompts
  prompt_zh: string;
  prompt_en: string;

  // Visual
  reference_image: string | null;
}

// ─── Central ASSET_TYPES Registry ───────────────────────────────────────────

export const ASSET_TYPES = {
  character: {
    label: '角色',
    labelEn: 'Character',
    requiredFields: ['name', 'role_type', 'appearance.gender'] as const,
    optionalFields: ['aliases', 'arc_brief', 'background', 'personality_tags'] as const,
    anchorLayers: ['face_shape', 'hair_signature', 'color_palette', 'silhouette', 'signature_prop', 'scene_context'] as const,
    views: ['fullbody', 'threeView', 'headshot', 'wardrobe'] as const,
    weightTiers: WEIGHT_TIERS,
  },
  scene: {
    label: '场景',
    labelEn: 'Scene',
    requiredFields: ['location', 'description'] as const,
    optionalFields: ['time_of_day', 'atmosphere', 'season', 'lighting'] as const,
    anchorLayers: [] as const,
    views: ['main', 'alternative'] as const,
  },
  prop: {
    label: '道具',
    labelEn: 'Prop',
    requiredFields: ['name', 'category'] as const,
    optionalFields: ['description', 'state_tracking'] as const,
    categories: ['weapon', 'vehicle', 'keyItem', 'costume', 'food', 'document', 'other'] as const,
    views: ['main'] as const,
  },
  wardrobe: {
    label: '服饰',
    labelEn: 'Wardrobe',
    requiredFields: ['name', 'character_id'] as const,
    optionalFields: ['scene_match', 'description'] as const,
    views: ['front', 'back', 'detail'] as const,
  },
  clue: {
    label: '线索',
    labelEn: 'Clue',
    requiredFields: ['name', 'visual_anchor', 'importance'] as const,
    optionalFields: ['state_changes'] as const,
    views: ['main'] as const,
  },
} as const;

export type AssetCategory = keyof typeof ASSET_TYPES;

// ─── Validation Helpers ─────────────────────────────────────────────────────

/**
 * Validates that an asset object has all required fields for its category.
 */
export function validateAsset<T extends Record<string, unknown>>(
  category: AssetCategory,
  data: T
): { valid: boolean; missingFields: string[] } {
  const spec = ASSET_TYPES[category];
  const missingFields: string[] = [];

  for (const field of spec.requiredFields) {
    // Support nested field paths like 'appearance.gender'
    const parts = field.split('.');
    let current: unknown = data;
    let found = true;
    for (const part of parts) {
      if (current === null || current === undefined || typeof current !== 'object') {
        found = false;
        break;
      }
      current = (current as Record<string, unknown>)[part];
    }
    if (!found || current === null || current === undefined) {
      missingFields.push(field);
    }
  }

  return {
    valid: missingFields.length === 0,
    missingFields,
  };
}

/**
 * Returns the weight tier for a character based on their weight value.
 */
export function getWeightTier(weight: number): WeightTier {
  if (weight >= 7) return 'A';
  if (weight >= 4) return 'B';
  return 'C';
}

/**
 * Returns the required visual assets for a character based on weight tier
 * and the project's asset quality tier.
 */
export function getRequiredVisualAssets(
  weight: number,
  qualityTier: AssetQualityTier
): string[] {
  const tier = getWeightTier(weight);
  return ASSET_QUALITY_TIERS[qualityTier][`tier${tier}Minimum` as keyof typeof ASSET_QUALITY_TIERS[AssetQualityTier]] as string[];
}
