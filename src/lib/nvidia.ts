// ============================================================
// NVIDIA NIM API Client
// Wraps NVIDIA NIM (OpenAI-compatible) API calls for
// chat completions and image generation.
// ============================================================

// ---- Types ----

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatCompletionOptions {
  /** Model identifier. Defaults to meta/llama-3.1-405b-instruct */
  model?: string
  /** Sampling temperature 0-1. Defaults to 0.7 */
  temperature?: number
  /** Maximum tokens to generate. Defaults to 4096 */
  max_tokens?: number
  /** Top-p nucleus sampling. Defaults to 1 */
  top_p?: number
  /** Number of completions. Defaults to 1 */
  n?: number
  /** Stop sequences */
  stop?: string[]
  /** Whether to stream. Not supported in this helper — use streaming endpoint directly if needed. */
  stream?: false
}

export interface ChatCompletionResponse {
  id: string
  object: string
  created: number
  model: string
  choices: Array<{
    index: number
    message: { role: string; content: string }
    finish_reason: string
  }>
  usage: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

export interface ImageGenerationOptions {
  /** Model identifier. Defaults to stabilityai/stable-diffusion-xl */
  model?: string
  /** CFG scale (prompt adherence). Defaults to 7 */
  cfg_scale?: number
  /** Image height. Defaults to 1024 */
  height?: number
  /** Image width. Defaults to 1024 */
  width?: number
  /** Number of diffusion steps. Defaults to 50 */
  steps?: number
  /** Sampler algorithm. Defaults to "K_DPMPP_2M" */
  sampler?: string
  /** Random seed. 0 = random. Defaults to 0 */
  seed?: number
  /** Negative prompt weight. Defaults to -1 (applied to second prompt if provided) */
  negative_weight?: number
}

export interface ImageGenerationResponse {
  id: string
  art: string // base64-encoded image
}

// ---- Available models ----

export const NVIDIA_CHAT_MODELS = {
  /** GLM-5.1 — Latest GLM model (推荐) */
  GLM_5_1: 'z-ai/glm-5.1',
  /** GLM-5 */
  GLM_5: 'z-ai/glm5',
  /** GLM-4.7 */
  GLM_4_7: 'z-ai/glm4.7',
  /** DeepSeek V4 Pro — Most capable DeepSeek (推荐) */
  DEEPSEEK_V4_PRO: 'deepseek-ai/deepseek-v4-pro',
  /** DeepSeek V4 Flash — Fast variant */
  DEEPSEEK_V4_FLASH: 'deepseek-ai/deepseek-v4-flash',
  /** DeepSeek V3.2 */
  DEEPSEEK_V3_2: 'deepseek-ai/deepseek-v3.2',
  /** DeepSeek V3.1 Terminus */
  DEEPSEEK_V3_1_TERMINUS: 'deepseek-ai/deepseek-v3.1-terminus',
  /** MiniMax M2.7 — Latest MiniMax */
  MINIMAX_M2_7: 'minimaxai/minimax-m2.7',
  /** MiniMax M2.5 */
  MINIMAX_M2_5: 'minimaxai/minimax-m2.5',
  /** Qwen 3.5 397B — Largest Qwen (推荐) */
  QWEN_3_5_397B: 'qwen/qwen3.5-397b-a17b',
  /** Qwen 3.5 122B */
  QWEN_3_5_122B: 'qwen/qwen3.5-122b-a10b',
  /** Kimi K2.5 — Latest Kimi */
  KIMI_K2_5: 'moonshotai/kimi-k2.5',
  /** Kimi K2 */
  KIMI_K2: 'moonshotai/kimi-k2-instruct',
  /** Llama 4 Maverick — Latest Meta model */
  LLAMA_4_MAVERICK: 'meta/llama-4-maverick-17b-128e-instruct',
  /** Most capable — best for complex reasoning & long context */
  LLAMA_405B: 'meta/llama-3.1-405b-instruct',
  /** Balanced — good trade-off of quality and speed */
  LLAMA_70B: 'meta/llama-3.1-70b-instruct',
  /** Llama 3.3 70B */
  LLAMA_3_3_70B: 'meta/llama-3.3-70b-instruct',
  /** Nemotron Ultra 253B — NVIDIA's most capable model (推荐) */
  NEMOTRON_ULTRA: 'nvidia/llama-3.1-nemotron-ultra-253b-v1',
  /** Nemotron — NVIDIA fine-tuned for instruction following */
  NEMOTRON_70B: 'nvidia/llama-3.1-nemotron-70b-instruct',
  /** Mistral Large 3 675B — Largest Mistral */
  MISTRAL_LARGE_3: 'mistralai/mistral-large-3-675b-instruct-2512',
  /** Mistral Medium 3 */
  MISTRAL_MEDIUM_3: 'mistralai/mistral-medium-3-instruct',
  /** Mixtral MoE — efficient for diverse tasks */
  MIXTRAL_8X22B: 'mistralai/mixtral-8x22b-instruct-v0.1',
  /** Yi Large — 01.ai flagship */
  YI_LARGE: '01-ai/yi-large',
  /** Seed OSS 36B — Bytedance */
  SEED_OSS_36B: 'bytedance/seed-oss-36b-instruct',
  /** GPT-OSS 120B — OpenAI open source */
  GPT_OSS_120B: 'openai/gpt-oss-120b',
} as const

export const NVIDIA_IMAGE_MODELS = {
  SDXL: 'stabilityai/stable-diffusion-xl',
  SD3_MEDIUM: 'stabilityai/stable-diffusion-3-medium',
  SD3_LARGE: 'stabilityai/stable-diffusion-3-large',
} as const

export const NVIDIA_TTS_MODELS = {
  RIVA_TTS: 'nvidia/riva-tts',
} as const

// ---- Configuration ----

const CHAT_API_URL = 'https://integrate.api.nvidia.com/v1/chat/completions'
const IMAGE_API_URL =
  'https://ai.api.nvidia.com/v1/genai/stabilityai/stable-diffusion-xl'

function getApiKey(): string {
  const key = process.env.NVIDIA_API_KEY
  if (!key) {
    throw new Error(
      'NVIDIA_API_KEY environment variable is not set. ' +
        'Please add it to your .env.local or environment configuration.'
    )
  }
  return key
}

// ---- Error handling ----

export class NvidiaApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly statusText: string,
    public readonly body: string,
    public readonly endpoint: string
  ) {
    super(
      `NVIDIA API error (${status} ${statusText}) on ${endpoint}: ${body.slice(0, 200)}`
    )
    this.name = 'NvidiaApiError'
  }
}

async function handleResponse<T>(
  res: Response,
  endpoint: string
): Promise<T> {
  if (!res.ok) {
    const body = await res.text().catch(() => 'Unable to read response body')
    throw new NvidiaApiError(res.status, res.statusText, body, endpoint)
  }
  return res.json() as Promise<T>
}

// ============================================================
// Chat Completions
// ============================================================

/**
 * Send a chat completion request to the NVIDIA NIM API.
 *
 * @example
 * ```ts
 * const response = await nvidiaChatCompletion({
 *   messages: [
 *     { role: 'system', content: 'You are a helpful screenwriting assistant.' },
 *     { role: 'user', content: 'Rewrite this script in a dramatic style...' },
 *   ],
 * });
 * console.log(response.choices[0].message.content);
 * ```
 */
export async function nvidiaChatCompletion(
  messages: ChatMessage[],
  options: ChatCompletionOptions = {}
): Promise<ChatCompletionResponse> {
  const apiKey = getApiKey()

  const body = {
    model: options.model ?? NVIDIA_CHAT_MODELS.LLAMA_70B,
    messages,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.max_tokens ?? 4096,
    top_p: options.top_p ?? 1,
    n: options.n ?? 1,
    ...(options.stop && { stop: options.stop }),
    stream: false,
  }

  const res = await fetch(CHAT_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  return handleResponse<ChatCompletionResponse>(res, CHAT_API_URL)
}

/**
 * Convenience: send a single user message and return the assistant's text.
 */
export async function nvidiaChat(
  prompt: string,
  systemPrompt?: string,
  options?: ChatCompletionOptions
): Promise<string> {
  const messages: ChatMessage[] = []
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt })
  }
  messages.push({ role: 'user', content: prompt })

  const response = await nvidiaChatCompletion(messages, options)
  return response.choices[0]?.message?.content ?? ''
}

// ============================================================
// JSON Response Parsing
// ============================================================

/**
 * Call the NVIDIA chat API and parse the response as JSON.
 *
 * This is robust to common LLM output patterns:
 *  - Wrapped in markdown code fences (```json ... ```)
 *  - Leading/trailing whitespace or prose
 *  - Partial JSON with trailing text
 *
 * @param messages  - Chat messages to send
 * @param options   - Chat completion options
 * @returns Parsed JSON object of type T
 * @throws Error if the response cannot be parsed as valid JSON
 *
 * @example
 * ```ts
 * const characters = await nvidiaChatJson<Character[]>([
 *   { role: 'system', content: 'Extract characters as JSON array.' },
 *   { role: 'user', content: rawScriptText },
 * ]);
 * ```
 */
export async function nvidiaChatJson<T = unknown>(
  messages: ChatMessage[],
  options?: ChatCompletionOptions
): Promise<T> {
  // Append an instruction to return JSON if the system prompt doesn't already mention it
  const hasJsonInstruction = messages.some(
    (m) =>
      m.role === 'system' &&
      (m.content.toLowerCase().includes('json') ||
        m.content.toLowerCase().includes('json格式'))
  )

  const finalMessages: ChatMessage[] = hasJsonInstruction
    ? messages
    : [
        ...messages,
        {
          role: 'system',
          content:
            'IMPORTANT: You must respond with valid JSON only. ' +
            'Do not include any prose, explanations, or markdown formatting. ' +
            'Return the raw JSON object or array.',
        },
      ]

  const response = await nvidiaChatCompletion(finalMessages, {
    ...options,
    temperature: options?.temperature ?? 0.3, // Lower temperature for structured output
  })

  const content = response.choices[0]?.message?.content ?? ''

  return parseJsonFromLlmResponse<T>(content)
}

/**
 * Parse JSON from an LLM response that may include markdown fences,
 * leading/trailing prose, or other formatting artifacts.
 */
export function parseJsonFromLlmResponse<T = unknown>(text: string): T {
  // 1. Try direct parse
  try {
    return JSON.parse(text) as T
  } catch {
    // continue to more aggressive parsing
  }

  // 2. Extract from markdown code fences (```json ... ``` or ``` ... ```)
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/)
  if (fenceMatch?.[1]) {
    try {
      return JSON.parse(fenceMatch[1]) as T
    } catch {
      // continue
    }
  }

  // 3. Find the first `{` or `[` and parse outward
  const objectStart = text.indexOf('{')
  const arrayStart = text.indexOf('[')

  let jsonStart = -1
  if (objectStart !== -1 && arrayStart !== -1) {
    jsonStart = Math.min(objectStart, arrayStart)
  } else if (objectStart !== -1) {
    jsonStart = objectStart
  } else if (arrayStart !== -1) {
    jsonStart = arrayStart
  }

  if (jsonStart !== -1) {
    const opener = text[jsonStart]
    const closer = opener === '{' ? '}' : ']'
    let depth = 0
    let inString = false
    let escape = false

    for (let i = jsonStart; i < text.length; i++) {
      const ch = text[i]

      if (escape) {
        escape = false
        continue
      }

      if (ch === '\\' && inString) {
        escape = true
        continue
      }

      if (ch === '"') {
        inString = !inString
        continue
      }

      if (inString) continue

      if (ch === opener) depth++
      if (ch === closer) depth--

      if (depth === 0) {
        try {
          return JSON.parse(text.slice(jsonStart, i + 1)) as T
        } catch {
          break
        }
      }
    }
  }

  throw new Error(
    `Failed to parse JSON from LLM response. First 500 characters:\n${text.slice(0, 500)}`
  )
}

// ============================================================
// Image Generation
// ============================================================

/**
 * Generate an image using NVIDIA's Stable Diffusion XL endpoint.
 *
 * @param prompt  - Text prompt describing the desired image
 * @param negativePrompt - Optional negative prompt (what to avoid)
 * @param options - Generation options (size, steps, seed, etc.)
 * @returns Base64-encoded PNG image string
 *
 * @example
 * ```ts
 * const base64Image = await nvidiaGenerateImage(
 *   'A cinematic portrait of a detective in fog, dramatic lighting',
 *   'blurry, low quality',
 *   { width: 1024, height: 1024 }
 * );
 * ```
 */
export async function nvidiaGenerateImage(
  prompt: string,
  negativePrompt?: string,
  options: ImageGenerationOptions = {}
): Promise<string> {
  const apiKey = getApiKey()

  const text_prompts: Array<{ text: string; weight: number }> = [
    { text: prompt, weight: 1 },
  ]

  if (negativePrompt) {
    text_prompts.push({
      text: negativePrompt,
      weight: options.negative_weight ?? -1,
    })
  }

  const body = {
    text_prompts,
    cfg_scale: options.cfg_scale ?? 7,
    height: options.height ?? 1024,
    width: options.width ?? 1024,
    steps: options.steps ?? 50,
    sampler: options.sampler ?? 'K_DPMPP_2M',
    seed: options.seed ?? 0,
  }

  const res = await fetch(IMAGE_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  const data = await handleResponse<ImageGenerationResponse>(
    res,
    IMAGE_API_URL
  )

  if (!data.art) {
    throw new Error(
      'NVIDIA image generation returned an empty result. ' +
        'The API may be temporarily unavailable or the prompt may have been rejected.'
    )
  }

  return data.art
}

// ============================================================
// Retry wrapper
// ============================================================

export interface RetryOptions {
  /** Maximum number of retry attempts. Defaults to 3 */
  maxRetries?: number
  /** Base delay in ms between retries (doubles each attempt). Defaults to 1000 */
  baseDelayMs?: number
  /** Whether to retry on rate-limit (429) errors. Defaults to true */
  retryOnRateLimit?: boolean
  /** Whether to retry on server (5xx) errors. Defaults to true */
  retryOnServerError?: boolean
}

/**
 * Wrap an async function with exponential-backoff retry logic.
 *
 * @example
 * ```ts
 * const response = await withRetry(
 *   () => nvidiaChatCompletion(messages),
 *   { maxRetries: 3, baseDelayMs: 2000 }
 * );
 * ```
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    baseDelayMs = 1000,
    retryOnRateLimit = true,
    retryOnServerError = true,
  } = options

  let lastError: Error | undefined

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))

      // Only retry on specific conditions
      const isNvidiaError = lastError instanceof NvidiaApiError
      const shouldRetry =
        (isNvidiaError &&
          retryOnRateLimit &&
          (lastError as any).status === 429) ||
        (isNvidiaError &&
          retryOnServerError &&
          (lastError as any).status >= 500)

      if (!shouldRetry || attempt === maxRetries) {
        throw lastError
      }

      // Exponential backoff with jitter
      const delay =
        baseDelayMs * Math.pow(2, attempt) +
        Math.random() * baseDelayMs * 0.5

      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }

  // This should be unreachable, but TypeScript needs it
  throw lastError ?? new Error('Retry loop exited without an error')
}
