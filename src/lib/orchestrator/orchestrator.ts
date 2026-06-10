// ============================================================
// Orchestrator State Machine
// Manages the 8-phase creation workflow for drama projects.
// Phase transitions: novel_upload → novel_analysis → show_planning →
//   script_writing → asset_extraction → art_direction → production → export
// ============================================================

export type CreationPhase =
  | 'novel_upload'
  | 'novel_analysis'
  | 'show_planning'
  | 'script_writing'
  | 'asset_extraction'
  | 'art_direction'
  | 'production'
  | 'export';

export const PHASE_ORDER: CreationPhase[] = [
  'novel_upload',
  'novel_analysis',
  'show_planning',
  'script_writing',
  'asset_extraction',
  'art_direction',
  'production',
  'export',
];

export type PhaseModule = 'M1' | 'M2' | 'M3';

export type PhaseStatusValue = 'locked' | 'active' | 'completed';

export interface PhaseStatus {
  phase: CreationPhase;
  status: PhaseStatusValue;
  label: string;
  description: string;
  module: PhaseModule;
  moduleLabel: string;
  icon: string; // Lucide icon name
}

// Map each phase to its module
const PHASE_MODULE_MAP: Record<CreationPhase, PhaseModule> = {
  novel_upload: 'M1',
  novel_analysis: 'M1',
  show_planning: 'M1',
  script_writing: 'M1',
  asset_extraction: 'M2',
  art_direction: 'M2',
  production: 'M3',
  export: 'M3',
};

// Human-readable labels for each phase
const PHASE_LABELS: Record<CreationPhase, { label: string; description: string; icon: string }> = {
  novel_upload: {
    label: 'novel_upload',
    description: 'Upload the source novel or script material',
    icon: 'Upload',
  },
  novel_analysis: {
    label: 'novel_analysis',
    description: 'Full novel analysis and understanding',
    icon: 'BookOpen',
  },
  show_planning: {
    label: 'show_planning',
    description: 'Commercial parameters and show configuration',
    icon: 'Settings2',
  },
  script_writing: {
    label: 'script_writing',
    description: 'One-shot full script generation',
    icon: 'Pencil',
  },
  asset_extraction: {
    label: 'asset_extraction',
    description: 'Extract characters, scenes, and props from scripts',
    icon: 'Palette',
  },
  art_direction: {
    label: 'art_direction',
    description: 'Select art style and visual direction',
    icon: 'Brush',
  },
  production: {
    label: 'production',
    description: 'Per-episode production pipeline',
    icon: 'Film',
  },
  export: {
    label: 'export',
    description: 'Final composition and export',
    icon: 'Download',
  },
};

// Module labels
const MODULE_LABELS: Record<PhaseModule, { zh: string; en: string }> = {
  M1: { zh: '内容规划', en: 'Content Planning' },
  M2: { zh: '资产准备', en: 'Asset Preparation' },
  M3: { zh: '制作输出', en: 'Production Output' },
};

/**
 * Get the index of a phase in the PHASE_ORDER array
 */
export function getPhaseIndex(phase: CreationPhase): number {
  return PHASE_ORDER.indexOf(phase);
}

/**
 * Return array of all 8 phases with their status based on currentPhase
 */
export function getPhaseStatus(currentPhase: CreationPhase): PhaseStatus[] {
  const currentIndex = getPhaseIndex(currentPhase);

  return PHASE_ORDER.map((phase) => {
    const phaseIndex = getPhaseIndex(phase);
    const meta = PHASE_LABELS[phase];
    const phaseModule = PHASE_MODULE_MAP[phase];

    let status: PhaseStatusValue;
    if (phaseIndex < currentIndex) {
      status = 'completed';
    } else if (phaseIndex === currentIndex) {
      status = 'active';
    } else {
      status = 'locked';
    }

    return {
      phase,
      status,
      label: meta.label,
      description: meta.description,
      module: phaseModule,
      moduleLabel: MODULE_LABELS[phaseModule].en,
      icon: meta.icon,
    };
  });
}

/**
 * Can only advance forward (or stay at current)
 */
export function canAdvanceTo(
  currentPhase: CreationPhase,
  targetPhase: CreationPhase
): boolean {
  const currentIndex = getPhaseIndex(currentPhase);
  const targetIndex = getPhaseIndex(targetPhase);
  return targetIndex >= currentIndex;
}

/**
 * Return next phase or null if at end
 */
export function getNextPhase(
  currentPhase: CreationPhase
): CreationPhase | null {
  const currentIndex = getPhaseIndex(currentPhase);
  if (currentIndex >= PHASE_ORDER.length - 1) {
    return null;
  }
  return PHASE_ORDER[currentIndex + 1];
}

/**
 * Validate if a string is a valid CreationPhase
 */
export function isValidPhase(phase: string): phase is CreationPhase {
  return PHASE_ORDER.includes(phase as CreationPhase);
}

/**
 * Get the initial phase for a new project
 */
export function getInitialPhase(): CreationPhase {
  return 'novel_upload';
}

/**
 * Derive the current phase from drama data (for auto-detection)
 * This is used when the drama doesn't have an explicit creationPhase set
 */
export function derivePhaseFromDrama(drama: {
  novelParsed?: boolean;
  novelSource?: string | null;
  episodes?: Array<{ scriptContent?: string | null; scriptStatus?: string }>;
  characters?: unknown[];
  scenes?: unknown[];
  assetStatus?: string;
  artStyle?: string | null;
  episodesWithVideo?: number;
  totalEpisodes?: number;
}): CreationPhase {
  // If there's a novel source but not parsed, still at novel_upload/novel_analysis
  const hasNovelSource = !!drama.novelSource;
  const isNovelParsed = drama.novelParsed ?? false;

  // Check script status
  const episodes = drama.episodes ?? [];
  const episodesWithScript = episodes.filter(
    (ep) => ep.scriptContent && ep.scriptStatus === 'completed'
  ).length;
  const totalEpisodes = drama.totalEpisodes ?? episodes.length;

  // Check assets
  const hasAssets =
    (drama.characters?.length ?? 0) > 0 || (drama.scenes?.length ?? 0) > 0;
  const assetStatus = drama.assetStatus ?? 'pending';

  // Check art style
  const hasArtStyle = !!drama.artStyle;

  // Check production
  const episodesWithVideo = drama.episodesWithVideo ?? 0;

  // Derive phase from data
  if (!hasNovelSource && episodesWithScript === 0) {
    return 'novel_upload';
  }

  if (hasNovelSource && !isNovelParsed) {
    return 'novel_analysis';
  }

  if (episodesWithScript === 0 && isNovelParsed) {
    return 'show_planning';
  }

  if (episodesWithScript < totalEpisodes) {
    return 'script_writing';
  }

  if (!hasAssets && assetStatus !== 'ready') {
    return 'asset_extraction';
  }

  if (!hasArtStyle) {
    return 'art_direction';
  }

  if (episodesWithVideo < totalEpisodes) {
    return 'production';
  }

  return 'export';
}

/**
 * Get phases grouped by module
 */
export function getPhasesByModule(
  currentPhase: CreationPhase
): Record<PhaseModule, PhaseStatus[]> {
  const allStatuses = getPhaseStatus(currentPhase);
  return {
    M1: allStatuses.filter((p) => p.module === 'M1'),
    M2: allStatuses.filter((p) => p.module === 'M2'),
    M3: allStatuses.filter((p) => p.module === 'M3'),
  };
}
