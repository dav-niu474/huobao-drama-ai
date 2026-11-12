// ============================================================
// Model Type Detection — Endpoint Registry
// Inspired by ArcReel's ENDPOINT_REGISTRY + infer_endpoint
// Maps model IDs to media types (text/image/video/tts) using
// heuristic pattern matching + endpoint metadata.
// ============================================================

export type MediaType = 'text' | 'image' | 'video' | 'audio'

export interface ModelTypeInfo {
  mediaType: MediaType
  endpoint: string  // API endpoint pattern
  label: string     // Display label for type tag
}

// ============================================================
// Heuristic model type inference
// Matches model ID against known patterns to determine type.
// Order matters — more specific patterns first.
// ============================================================

interface PatternRule {
  patterns: RegExp[]
  type: MediaType
  label: string
}

const TYPE_PATTERNS: PatternRule[] = [
  // ---- VIDEO ----
  {
    type: 'video',
    label: 'VIDEO',
    patterns: [
      /cogvideo/i,
      /video[-_]?(gen|generation|creation)/i,
      /seedance/i,
      /sora/i,
      /kling[-_]?video/i,
      /wan[-_]?video/i,
      /wan[-_]?2[-_]?7[-_]?i2v/i,  // wan2.7-i2v (video)
      /wan[-_]?2[-_]?7[-_]?t2v/i,  // wan2.7-t2v (video)
      /img[-_]?2[-_]?video/i,
      /text[-_]?2[-_]?video/i,
      /video/i,
      /cog[-_]?video/i,
      /vidu/i,
      /hailuo[-_]?video/i,
      /minimax[-_]?video/i,
      /seedance/i,
      /doubao[-_]?seedance/i,
    ],
  },
  // ---- IMAGE ----
  {
    type: 'image',
    label: 'IMAGE',
    patterns: [
      /cogview/i,
      /dall[-_]?e/i,
      /imagen/i,
      /seedream/i,
      /stable[-_]?diffusion/i,
      /sdxl/i,
      /flux/i,
      /midjourney/i,
      /kolors/i,
      /wan[-_]?image/i,  // wan-image (but NOT wan-video)
      /wan[-_]?2[-_]?7[-_]?i2i/i,  // image-to-image
      /text[-_]?2[-_]?image/i,
      /image[-_]?generation/i,
      /image[-_]?gen/i,
      /t2i/i,
      /i2i/i,
      /sensenova[-_]?u/i,  // sensenova-u1-fast, u1.5-lite (image models)
      /doubao[-_]?seedream/i,
      /seedream/i,
      /flux[-_]?schnell/i,
      /flux[-_]?dev/i,
      /image/i,
    ],
  },
  // ---- AUDIO / TTS ----
  {
    type: 'audio',
    label: 'TTS',
    patterns: [
      /tts/i,
      /speech/i,
      /cosyvoice/i,
      /cogtts/i,
      /audio[-_]?gen/i,
      /voice/i,
      /minimax[-_]?speech/i,
      /minimax[-_]?tts/i,
      /bark/i,
      /fish[-_]?speech/i,
      /xtts/i,
    ],
  },
  // ---- TEXT (default) ----
  // Text models are the catch-all — if no other pattern matches,
  // the model is assumed to be a text/chat model.
]

// ============================================================
// inferModelType — main entry point
// ============================================================

export function inferModelType(modelId: string): ModelTypeInfo {
  const id = modelId.toLowerCase()

  // Check each pattern rule in order
  for (const rule of TYPE_PATTERNS) {
    for (const pattern of rule.patterns) {
      if (pattern.test(id)) {
        return {
          mediaType: rule.type,
          endpoint: getEndpointForType(rule.type),
          label: rule.label,
        }
      }
    }
  }

  // Default: text model
  return {
    mediaType: 'text',
    endpoint: 'openai-chat',
    label: 'TEXT',
  }
}

function getEndpointForType(type: MediaType): string {
  switch (type) {
    case 'video': return 'video-generation'
    case 'image': return 'image-generation'
    case 'audio': return 'audio-speech'
    case 'text':
    default: return 'openai-chat'
  }
}

// ============================================================
// Batch inference — for processing /models API response
// ============================================================

export function inferModelTypes(modelIds: string[]): Array<{ id: string; name: string; type: MediaType; typeLabel: string }> {
  return modelIds.map(id => {
    const info = inferModelType(id)
    return {
      id,
      name: id,
      type: info.mediaType,
      typeLabel: info.label,
    }
  })
}

// ============================================================
// Category mapping — media type → AI category
// ============================================================

export function mediaTypeToCategory(mediaType: MediaType): 'llm' | 'image' | 'video' | 'tts' {
  switch (mediaType) {
    case 'text': return 'llm'
    case 'image': return 'image'
    case 'video': return 'video'
    case 'audio': return 'tts'
  }
}

// ============================================================
// Color mapping for type tags (matching ArcReel's design)
// ============================================================

export function getTypeTagColor(type: MediaType): { bg: string; text: string; border: string } {
  switch (type) {
    case 'text':
      return { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/30' }
    case 'image':
      return { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/30' }
    case 'video':
      return { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/30' }
    case 'audio':
      return { bg: 'bg-green-500/10', text: 'text-green-400', border: 'border-green-500/30' }
  }
}
