// ============================================================
// Shared Voice Catalog — Single Source of Truth
// Used by:
//   - src/lib/agents/tools/executors.ts (voice_assigner agent)
//   - src/app/api/ai/voices/route.ts (voice list API)
//   - src/components/episode/voice-panel.tsx (via API)
//
// When adding new voices or providers, only edit this file.
// ============================================================

export interface VoiceEntry {
  id: string
  name: string
  provider: string
  language?: string
  description?: string
  gender?: string
}

// ── MiniMax / Chatfire voices (34+ voices) ──────────────────────
// Full catalog from MiniMax Speech 2.8 HD API documentation.
// Chatfire uses the same voice IDs via its MiniMax-compatible gateway.
const MINIMAX_VOICES: VoiceEntry[] = [
  // ── 青年男声 ──
  { id: 'male-qn-qingse', name: '青涩青年', provider: 'minimax', language: 'zh', description: '清澈青年男声', gender: 'male' },
  { id: 'male-qn-jingying', name: '精英青年', provider: 'minimax', language: 'zh', description: '沉稳精英男声', gender: 'male' },
  { id: 'male-qn-badao', name: '霸道青年', provider: 'minimax', language: 'zh', description: '霸道强硬男声', gender: 'male' },
  { id: 'male-qn-daxuesheng', name: '大学生', provider: 'minimax', language: 'zh', description: '阳光大学生男声', gender: 'male' },
  { id: 'male-qn-qingse-v2', name: '青涩青年V2', provider: 'minimax', language: 'zh', description: '升级版清澈青年男声', gender: 'male' },
  { id: 'male-qn-jingying-v2', name: '精英青年V2', provider: 'minimax', language: 'zh', description: '升级版沉稳精英男声', gender: 'male' },
  // ── 中年男声 ──
  { id: 'male-qn-qiangzhuang', name: '强壮男声', provider: 'minimax', language: 'zh', description: '力量感强壮男声', gender: 'male' },
  { id: 'male-qn-qingchun', name: '青春男声', provider: 'minimax', language: 'zh', description: '阳光青春男声', gender: 'male' },
  { id: 'male-qn-lengku', name: '冷酷男声', provider: 'minimax', language: 'zh', description: '冷酷低沉男声', gender: 'male' },
  // ── 少年/儿童 ──
  { id: 'male-qn-ertong', name: '男童声', provider: 'minimax', language: 'zh', description: '活泼男童声', gender: 'male' },
  { id: 'male-qn-shaonian', name: '少年', provider: 'minimax', language: 'zh', description: '青春少年男声', gender: 'male' },
  // ── 青年女声 ──
  { id: 'female-shaonv', name: '少女', provider: 'minimax', language: 'zh', description: '甜美少女声', gender: 'female' },
  { id: 'female-yujie', name: '御姐', provider: 'minimax', language: 'zh', description: '成熟御姐声', gender: 'female' },
  { id: 'female-chengshu', name: '成熟女性', provider: 'minimax', language: 'zh', description: '知性成熟女声', gender: 'female' },
  { id: 'female-tianmei', name: '甜美女性', provider: 'minimax', language: 'zh', description: '温柔甜美女声', gender: 'female' },
  { id: 'female-shaonv-v2', name: '少女V2', provider: 'minimax', language: 'zh', description: '升级版甜美少女声', gender: 'female' },
  { id: 'female-yujie-v2', name: '御姐V2', provider: 'minimax', language: 'zh', description: '升级版成熟御姐声', gender: 'female' },
  { id: 'female-chengshu-v2', name: '成熟女性V2', provider: 'minimax', language: 'zh', description: '升级版知性成熟女声', gender: 'female' },
  { id: 'female-tianmei-v2', name: '甜美女性V2', provider: 'minimax', language: 'zh', description: '升级版温柔甜美女声', gender: 'female' },
  // ── 特色女声 ──
  { id: 'female-qingxin', name: '清新女声', provider: 'minimax', language: 'zh', description: '清新自然女声', gender: 'female' },
  { id: 'female-wenrou', name: '温柔女声', provider: 'minimax', language: 'zh', description: '温柔舒缓女声', gender: 'female' },
  { id: 'female-huoji', name: '活泼女声', provider: 'minimax', language: 'zh', description: '活泼俏皮女声', gender: 'female' },
  { id: 'female-zhixing', name: '知性女声', provider: 'minimax', language: 'zh', description: '知性优雅女声', gender: 'female' },
  // ── 儿童 ──
  { id: 'female-ertong', name: '女童声', provider: 'minimax', language: 'zh', description: '甜美女童声', gender: 'female' },
  // ── 主持人 ──
  { id: 'presenter_male', name: '男主持人', provider: 'minimax', language: 'zh', description: '专业播音男声', gender: 'male' },
  { id: 'presenter_female', name: '女主持人', provider: 'minimax', language: 'zh', description: '专业播音女声', gender: 'female' },
  { id: 'presenter_male-v2', name: '男主持人V2', provider: 'minimax', language: 'zh', description: '升级版专业播音男声', gender: 'male' },
  { id: 'presenter_female-v2', name: '女主持人V2', provider: 'minimax', language: 'zh', description: '升级版专业播音女声', gender: 'female' },
  // ── 有声书 ──
  { id: 'audiobook_male_1', name: '有声书男声1', provider: 'minimax', language: 'zh', description: '有声读物男声', gender: 'male' },
  { id: 'audiobook_female_1', name: '有声书女声1', provider: 'minimax', language: 'zh', description: '有声读物女声', gender: 'female' },
  { id: 'audiobook_male_2', name: '有声书男声2', provider: 'minimax', language: 'zh', description: '深情有声读物男声', gender: 'male' },
  { id: 'audiobook_female_2', name: '有声书女声2', provider: 'minimax', language: 'zh', description: '温柔有声读物女声', gender: 'female' },
  // ── 方言 ──
  { id: 'male-cantonese', name: '粤语男声', provider: 'minimax', language: 'zh-yue', description: '标准粤语男声', gender: 'male' },
  { id: 'female-cantonese', name: '粤语女声', provider: 'minimax', language: 'zh-yue', description: '标准粤语女声', gender: 'female' },
]

const CHATFIRE_VOICES: VoiceEntry[] = MINIMAX_VOICES.map((v) => ({
  ...v,
  provider: 'chatfire',
}))

// ── OpenAI TTS voices ──────────────────────────────────────────
const OPENAI_VOICES: VoiceEntry[] = [
  { id: 'alloy', name: 'Alloy', provider: 'openai', language: 'en', description: '中性平衡声', gender: 'neutral' },
  { id: 'echo', name: 'Echo', provider: 'openai', language: 'en', description: '温暖男声', gender: 'male' },
  { id: 'fable', name: 'Fable', provider: 'openai', language: 'en', description: '表达力强声', gender: 'neutral' },
  { id: 'onyx', name: 'Onyx', provider: 'openai', language: 'en', description: '深沉权威男声', gender: 'male' },
  { id: 'nova', name: 'Nova', provider: 'openai', language: 'en', description: '友好活力女声', gender: 'female' },
  { id: 'shimmer', name: 'Shimmer', provider: 'openai', language: 'en', description: '清澈专业女声', gender: 'female' },
  { id: 'ash', name: 'Ash', provider: 'openai', language: 'en', description: '轻松随性男声', gender: 'male' },
  { id: 'ballad', name: 'Ballad', provider: 'openai', language: 'en', description: '温暖叙事声', gender: 'neutral' },
  { id: 'coral', name: 'Coral', provider: 'openai', language: 'en', description: '自信活力女声', gender: 'female' },
  { id: 'sage', name: 'Sage', provider: 'openai', language: 'en', description: '沉稳智慧声', gender: 'neutral' },
  { id: 'verse', name: 'Verse', provider: 'openai', language: 'en', description: '诗意抒情声', gender: 'neutral' },
]

// ── Fish Audio voices (OpenAI-compatible) ───────────────────────
const FISH_AUDIO_VOICES: VoiceEntry[] = [
  { id: 'alloy', name: 'Alloy', provider: 'fish_audio', language: 'en', description: '平衡声(OpenAI兼容)', gender: 'neutral' },
  { id: 'echo', name: 'Echo', provider: 'fish_audio', language: 'en', description: '温暖男声(OpenAI兼容)', gender: 'male' },
  { id: 'nova', name: 'Nova', provider: 'fish_audio', language: 'en', description: '活力女声(OpenAI兼容)', gender: 'female' },
  { id: 'shimmer', name: 'Shimmer', provider: 'fish_audio', language: 'en', description: '清澈女声(OpenAI兼容)', gender: 'female' },
]

// ── Ali Qwen TTS voices ────────────────────────────────────────
const ALI_VOICES: VoiceEntry[] = [
  { id: 'zhitian_emo', name: '知甜', provider: 'ali', language: 'zh', description: '温柔甜美女声', gender: 'female' },
  { id: 'zhiyan_emo', name: '知燕', provider: 'ali', language: 'zh', description: '年轻活力女声', gender: 'female' },
  { id: 'zhimi_emo', name: '知蜜', provider: 'ali', language: 'zh', description: '可爱甜美女声', gender: 'female' },
  { id: 'zhibei_emo', name: '知贝', provider: 'ali', language: 'zh', description: '童声女声', gender: 'female' },
  { id: 'zhiyuan_emo', name: '知远', provider: 'ali', language: 'zh', description: '年轻阳光男声', gender: 'male' },
  { id: 'zhida_emo', name: '知达', provider: 'ali', language: 'zh', description: '成熟稳重男声', gender: 'male' },
  { id: 'zhiqiang_emo', name: '知强', provider: 'ali', language: 'zh', description: '低沉浑厚男声', gender: 'male' },
  { id: 'zhibo_emo', name: '知博', provider: 'ali', language: 'zh', description: '中年磁性男声', gender: 'male' },
  { id: 'zhimi_emo_v2', name: '知蜜V2', provider: 'ali', language: 'zh', description: '升级版可爱甜美女声', gender: 'female' },
  { id: 'zhiyan_emo_v2', name: '知燕V2', provider: 'ali', language: 'zh', description: '升级版年轻活力女声', gender: 'female' },
]

// ── MiMo TTS preset voices ─────────────────────────────────────
// MiMo TTS uses Chat Completions with preset voice names.
// The default voice is "mimo_default" which auto-selects based on context.
const MIMO_VOICES: VoiceEntry[] = [
  { id: 'mimo_default', name: '默认(智能)', provider: 'mimo', language: 'zh', description: 'MiMo默认音色，智能匹配', gender: 'neutral' },
  { id: '冰糖', name: '冰糖', provider: 'mimo', language: 'zh', description: '甜美中文女声', gender: 'female' },
  { id: '茉莉', name: '茉莉', provider: 'mimo', language: 'zh', description: '温柔中文女声', gender: 'female' },
  { id: '苏打', name: '苏打', provider: 'mimo', language: 'zh', description: '清澈中文男声', gender: 'male' },
  { id: '白桦', name: '白桦', provider: 'mimo', language: 'zh', description: '低沉中文男声', gender: 'male' },
  { id: 'Chloe', name: 'Chloe', provider: 'mimo', language: 'en', description: '清晰英文女声', gender: 'female' },
  { id: 'Mia', name: 'Mia', provider: 'mimo', language: 'en', description: '温暖英文女声', gender: 'female' },
  { id: 'Milo', name: 'Milo', provider: 'mimo', language: 'en', description: '深沉英文男声', gender: 'male' },
  { id: 'Dean', name: 'Dean', provider: 'mimo', language: 'en', description: '权威英文男声', gender: 'male' },
]

// ── Full catalog map ────────────────────────────────────────────
export const VOICE_CATALOG: Record<string, VoiceEntry[]> = {
  minimax: MINIMAX_VOICES,
  chatfire: CHATFIRE_VOICES,
  openai: OPENAI_VOICES,
  fish_audio: FISH_AUDIO_VOICES,
  ali: ALI_VOICES,
  mimo: MIMO_VOICES,
}

/**
 * Get voices for a specific provider.
 * Returns empty array if provider not found.
 */
export function getVoicesForProvider(provider: string): VoiceEntry[] {
  return VOICE_CATALOG[provider] || []
}

/**
 * Get all voices across all providers.
 */
export function getAllVoices(): VoiceEntry[] {
  return Object.values(VOICE_CATALOG).flat()
}

/**
 * Get the active TTS provider's voices.
 * Falls back to all voices if provider can't be determined.
 */
export async function getActiveProviderVoices(): Promise<VoiceEntry[]> {
  try {
    const { getActiveProviderForUser } = await import('@/lib/ai-config')
    const provider = await getActiveProviderForUser('tts')
    if (provider && VOICE_CATALOG[provider.provider]) {
      return VOICE_CATALOG[provider.provider]
    }
    // If provider not in catalog (e.g. custom), return all voices
    return getAllVoices()
  } catch {
    return getAllVoices()
  }
}
