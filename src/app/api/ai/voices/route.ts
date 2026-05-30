import { NextRequest, NextResponse } from 'next/server'
import { getActiveProviderForUser } from '@/lib/ai-config'
import { PROVIDER_PRESETS } from '@/lib/provider-presets'
import { requireAuth } from '@/lib/auth-helpers'

// Voice definitions per TTS provider
// These are the available voice IDs for each provider
interface VoiceEntry {
  id: string
  name: string
  provider: string
  language?: string
  description?: string
  gender?: string
}

const VOICE_CATALOG: Record<string, VoiceEntry[]> = {
  minimax: [
    { id: 'male-qn-qingse', name: '青涩青年', provider: 'minimax', language: 'zh', description: '清澈青年男声', gender: 'male' },
    { id: 'male-qn-jingying', name: '精英青年', provider: 'minimax', language: 'zh', description: '沉稳精英男声', gender: 'male' },
    { id: 'male-qn-badao', name: '霸道青年', provider: 'minimax', language: 'zh', description: '霸道强硬男声', gender: 'male' },
    { id: 'male-qn-daxuesheng', name: '大学生', provider: 'minimax', language: 'zh', description: '阳光大学生男声', gender: 'male' },
    { id: 'female-shaonv', name: '少女', provider: 'minimax', language: 'zh', description: '甜美少女声', gender: 'female' },
    { id: 'female-yujie', name: '御姐', provider: 'minimax', language: 'zh', description: '成熟御姐声', gender: 'female' },
    { id: 'female-chengshu', name: '成熟女性', provider: 'minimax', language: 'zh', description: '知性成熟女声', gender: 'female' },
    { id: 'female-tianmei', name: '甜美女性', provider: 'minimax', language: 'zh', description: '温柔甜美女声', gender: 'female' },
    { id: 'presenter_male', name: '男主持人', provider: 'minimax', language: 'zh', description: '专业播音男声', gender: 'male' },
    { id: 'presenter_female', name: '女主持人', provider: 'minimax', language: 'zh', description: '专业播音女声', gender: 'female' },
    { id: 'audiobook_male_1', name: '有声书男声1', provider: 'minimax', language: 'zh', description: '有声读物男声', gender: 'male' },
    { id: 'audiobook_female_1', name: '有声书女声1', provider: 'minimax', language: 'zh', description: '有声读物女声', gender: 'female' },
  ],
  chatfire: [
    { id: 'male-qn-qingse', name: '青涩青年', provider: 'chatfire', language: 'zh', description: '清澈青年男声', gender: 'male' },
    { id: 'male-qn-jingying', name: '精英青年', provider: 'chatfire', language: 'zh', description: '沉稳精英男声', gender: 'male' },
    { id: 'female-shaonv', name: '少女', provider: 'chatfire', language: 'zh', description: '甜美少女声', gender: 'female' },
    { id: 'female-yujie', name: '御姐', provider: 'chatfire', language: 'zh', description: '成熟御姐声', gender: 'female' },
    { id: 'female-chengshu', name: '成熟女性', provider: 'chatfire', language: 'zh', description: '知性成熟女声', gender: 'female' },
  ],
  openai: [
    { id: 'alloy', name: 'Alloy', provider: 'openai', language: 'en', description: 'Neutral, balanced voice', gender: 'neutral' },
    { id: 'echo', name: 'Echo', provider: 'openai', language: 'en', description: 'Warm, conversational male', gender: 'male' },
    { id: 'fable', name: 'Fable', provider: 'openai', language: 'en', description: 'Expressive storyteller', gender: 'neutral' },
    { id: 'onyx', name: 'Onyx', provider: 'openai', language: 'en', description: 'Deep, authoritative male', gender: 'male' },
    { id: 'nova', name: 'Nova', provider: 'openai', language: 'en', description: 'Friendly, energetic female', gender: 'female' },
    { id: 'shimmer', name: 'Shimmer', provider: 'openai', language: 'en', description: 'Clear, professional female', gender: 'female' },
  ],
  fish_audio: [
    { id: 'alloy', name: 'Alloy', provider: 'fish_audio', language: 'en', description: 'Balanced voice (OpenAI-compatible)', gender: 'neutral' },
    { id: 'echo', name: 'Echo', provider: 'fish_audio', language: 'en', description: 'Warm male (OpenAI-compatible)', gender: 'male' },
    { id: 'nova', name: 'Nova', provider: 'fish_audio', language: 'en', description: 'Energetic female (OpenAI-compatible)', gender: 'female' },
  ],
  ali: [
    { id: 'zhitian_emo', name: '知甜', provider: 'ali', language: 'zh', description: '温柔甜美女声', gender: 'female' },
    { id: 'zhiyan_emo', name: '知燕', provider: 'ali', language: 'zh', description: '年轻活力女声', gender: 'female' },
    { id: 'zhimi_emo', name: '知蜜', provider: 'ali', language: 'zh', description: '可爱甜美女声', gender: 'female' },
    { id: 'zhibei_emo', name: '知贝', provider: 'ali', language: 'zh', description: '童声女声', gender: 'female' },
    { id: 'zhiyuan_emo', name: '知远', provider: 'ali', language: 'zh', description: '年轻阳光男声', gender: 'male' },
    { id: 'zhida_emo', name: '知达', provider: 'ali', language: 'zh', description: '成熟稳重男声', gender: 'male' },
    { id: 'zhiqiang_emo', name: '知强', provider: 'ali', language: 'zh', description: '低沉浑厚男声', gender: 'male' },
    { id: 'zhibo_emo', name: '知博', provider: 'ali', language: 'zh', description: '中年磁性男声', gender: 'male' },
  ],
  mimo: [
    { id: '冰糖', name: '冰糖', provider: 'mimo', language: 'zh', description: '甜美中文女声', gender: 'female' },
    { id: '茉莉', name: '茉莉', provider: 'mimo', language: 'zh', description: '温柔中文女声', gender: 'female' },
    { id: '苏打', name: '苏打', provider: 'mimo', language: 'zh', description: '清澈中文男声', gender: 'male' },
    { id: '白桦', name: '白桦', provider: 'mimo', language: 'zh', description: '低沉中文男声', gender: 'male' },
    { id: 'Chloe', name: 'Chloe', provider: 'mimo', language: 'en', description: 'Clear English female', gender: 'female' },
    { id: 'Mia', name: 'Mia', provider: 'mimo', language: 'en', description: 'Warm English female', gender: 'female' },
    { id: 'Milo', name: 'Milo', provider: 'mimo', language: 'en', description: 'Deep English male', gender: 'male' },
    { id: 'Dean', name: 'Dean', provider: 'mimo', language: 'en', description: 'Authoritative English male', gender: 'male' },
  ],
}

// GET /api/ai/voices - List available voices from TTS providers
export async function GET(request: NextRequest) {
  try {
    // Try to get userId for user-level provider resolution
    let userId: string | undefined
    try {
      const auth = await requireAuth()
      if (!auth.error) userId = auth.userId
    } catch {
      // Not authenticated — use platform defaults
    }

    const { searchParams } = new URL(request.url)
    const providerFilter = searchParams.get('provider')
    const languageFilter = searchParams.get('language')

    // Get active TTS provider (respect user-level keys)
    const activeProvider = await getActiveProviderForUser('tts', userId)

    // Collect voices from all providers or the specified one
    const allVoices: VoiceEntry[] = []

    const providers = providerFilter
      ? [providerFilter]
      : Object.keys(VOICE_CATALOG)

    for (const provider of providers) {
      const voices = VOICE_CATALOG[provider] || []
      const filtered = voices.filter((v) => {
        if (languageFilter && v.language !== languageFilter) return false
        return true
      })
      allVoices.push(...filtered)
    }

    return NextResponse.json({
      voices: allVoices,
      activeProvider: activeProvider?.provider || null,
      activeModel: activeProvider?.model || null,
    })
  } catch (error) {
    console.error('Failed to list voices:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
