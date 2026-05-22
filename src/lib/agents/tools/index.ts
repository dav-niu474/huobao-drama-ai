// ============================================================
// Agent Architecture — Tool Registry
// Defines tools for each agent type in OpenAI function calling format.
// Tools are closures that capture episodeId and dramaId at runtime,
// so the LLM never needs to pass these IDs (preventing hallucination).
// ============================================================

import { AgentType, ToolDefinition } from '../types'

// ---- OpenAI function calling format types ----

export interface OpenAIToolParameter {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object'
  description: string
  enum?: string[]
  items?: OpenAIToolParameter
  properties?: Record<string, OpenAIToolParameter>
  required?: string[]
}

export interface OpenAIToolFunction {
  name: string
  description: string
  parameters: {
    type: 'object'
    properties: Record<string, OpenAIToolParameter>
    required: string[]
  }
}

export interface OpenAITool {
  type: 'function'
  function: OpenAIToolFunction
}

/**
 * Recursively convert a ToolParameter to OpenAI function calling parameter format.
 * Includes `items` for arrays and `properties`/`required` for objects.
 */
function paramToOpenAI(param: import('../types').ToolParameter): OpenAIToolParameter {
  const result: OpenAIToolParameter = {
    type: param.type,
    description: param.description,
    ...(param.enum ? { enum: param.enum } : {}),
  }

  // For array type: include items schema so LLMs know the element structure
  if (param.type === 'array' && param.items) {
    result.items = paramToOpenAI(param.items)
  }

  // For object type: include properties and required fields
  if (param.type === 'object' && param.properties) {
    result.properties = {}
    const objRequired: string[] = []
    for (const [key, prop] of Object.entries(param.properties)) {
      result.properties[key] = paramToOpenAI(prop)
      if (prop.required) {
        objRequired.push(key)
      }
    }
    if (objRequired.length > 0) {
      result.required = objRequired
    }
  }

  return result
}

/**
 * Convert a ToolDefinition to OpenAI function calling format
 */
export function toolDefinitionToOpenAI(tool: ToolDefinition): OpenAITool {
  const properties: Record<string, OpenAIToolParameter> = {}
  const required: string[] = []

  for (const [key, param] of Object.entries(tool.parameters)) {
    properties[key] = paramToOpenAI(param)
    if (param.required) {
      required.push(key)
    }
  }

  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: {
        type: 'object',
        properties,
        required,
      },
    },
  }
}

// ============================================================
// Tool Definitions per Agent Type
// ============================================================

const SCRIPT_REWRITER_TOOLS: ToolDefinition[] = [
  {
    name: 'read_episode_script',
    description: '读取当前集的原始内容和已有剧本。返回rawContent和scriptContent。',
    parameters: {},
  },
  {
    name: 'save_script',
    description: '保存改写后的剧本内容到当前集。',
    parameters: {
      scriptContent: {
        type: 'string',
        description: '改写后的完整剧本内容',
        required: true,
      },
    },
  },
]

const EXTRACTOR_TOOLS: ToolDefinition[] = [
  {
    name: 'read_script_for_extraction',
    description: '读取当前集的剧本内容，用于提取角色和场景。',
    parameters: {},
  },
  {
    name: 'read_existing_characters',
    description: '读取项目中已有的角色列表，用于去重判断。',
    parameters: {},
  },
  {
    name: 'read_existing_scenes',
    description: '读取项目中已有的场景列表，用于去重判断。',
    parameters: {},
  },
  {
    name: 'save_characters',
    description: '保存提取到的角色信息。会自动与已有角色进行去重合并。',
    parameters: {
      characters: {
        type: 'array',
        description:
          '要保存的角色数组（直接传入数组对象，不要字符串化）',
        required: true,
        items: {
          type: 'object',
          description: '单个角色的数据',
          properties: {
            name: { type: 'string', description: '角色名称', required: true },
            role: { type: 'string', description: '角色类型：protagonist | antagonist | supporting | minor' },
            gender: { type: 'string', description: '性别：male | female | unknown' },
            age: { type: 'string', description: '年龄段描述' },
            appearance: { type: 'string', description: '外貌描述' },
            personality: { type: 'string', description: '性格特征' },
            voiceStyle: { type: 'string', description: '声音特征' },
          },
          requiredFields: ['name'],
        },
      },
    },
  },
  {
    name: 'save_scenes',
    description: '保存提取到的场景信息。会自动与已有场景进行去重合并。',
    parameters: {
      scenes: {
        type: 'array',
        description:
          '要保存的场景数组（直接传入数组对象，不要字符串化）',
        required: true,
        items: {
          type: 'object',
          description: '单个场景的数据',
          properties: {
            location: { type: 'string', description: '地点名称', required: true },
            timeOfDay: { type: 'string', description: '时间段：day | night | dawn | dusk | morning | afternoon | evening' },
            description: { type: 'string', description: '场景描述' },
            prompt: { type: 'string', description: 'AI绘图英文提示词' },
          },
          requiredFields: ['location'],
        },
      },
    },
  },
]

const STORYBOARD_BREAKER_TOOLS: ToolDefinition[] = [
  {
    name: 'read_storyboard_context',
    description: '读取当前集的剧本、角色和场景信息，作为分镜拆解的上下文。',
    parameters: {},
  },
  {
    name: 'save_storyboards',
    description: '批量保存生成的分镜镜头序列。当append=false（默认）时，会先删除该集已有的分镜再创建新的；当append=true时，直接追加新分镜，不删除已有数据。⚠️重要：storyboards参数必须直接传入数组对象，不要传入JSON字符串。分批保存时，第一次用append=false，后续用append=true。',
    parameters: {
      storyboards: {
        type: 'array',
        description:
          '分镜数组，每个元素是一个分镜对象（直接传入对象，不要字符串化）',
        required: true,
        items: {
          type: 'object',
          description: '单个分镜镜头的数据',
          properties: {
            shotNumber: {
              type: 'number',
              description: '镜头编号（正整数，从1开始）',
              required: true,
            },
            title: {
              type: 'string',
              description: '镜头标题（3-5字简短描述）',
            },
            shotType: {
              type: 'string',
              description: '景别：extreme-wide | wide | medium | close-up | extreme-close-up | over-shoulder | pov | two-shot',
              enum: ['extreme-wide', 'wide', 'medium', 'close-up', 'extreme-close-up', 'over-shoulder', 'pov', 'two-shot'],
            },
            cameraAngle: {
              type: 'string',
              description: '摄影角度：eye-level | low-angle | high-angle | dutch-angle | birds-eye | worms-eye',
              enum: ['eye-level', 'low-angle', 'high-angle', 'dutch-angle', 'birds-eye', 'worms-eye'],
            },
            cameraMovement: {
              type: 'string',
              description: '运镜方式：static | pan-left | pan-right | tilt-up | tilt-down | zoom-in | zoom-out | dolly-in | dolly-out | tracking | crane-up | crane-down | handheld | steady',
            },
            action: {
              type: 'string',
              description: '画面中的动作描述（谁+做什么+身体细节+表情）',
            },
            description: {
              type: 'string',
              description: '镜头的视觉描述（详细的画面构成说明）',
            },
            dialogue: {
              type: 'string',
              description: '对白内容（无对白则不传或传null）',
            },
            dialogueChar: {
              type: 'string',
              description: '说话的角色名（无对白则不传或传null）',
            },
            duration: {
              type: 'number',
              description: '镜头时长（秒），默认3.0',
            },
            imagePrompt: {
              type: 'string',
              description: '专业级英文图片提示词（6维度：风格+构图+角色+场景+光线+画质）',
            },
            videoPrompt: {
              type: 'string',
              description: '专业级XML格式视频提示词（3秒分段，用<n>分隔）',
            },
            atmosphere: {
              type: 'string',
              description: '氛围描述（光线+色彩+声音+整体情绪）',
            },
          },
          requiredFields: ['shotNumber'],
        },
      },
      append: {
        type: 'boolean',
        description: '是否追加模式。false（默认）：先删除该集已有分镜再保存，适用于第一批分镜；true：直接追加新分镜，不删除已有数据，适用于后续批次。分批保存时：第一次append=false，后续append=true。',
        required: false,
      },
    },
  },
  {
    name: 'update_storyboard',
    description: '更新某个特定的分镜镜头。',
    parameters: {
      shotNumber: {
        type: 'number',
        description: '要更新的镜头编号',
        required: true,
      },
      updates: {
        type: 'object',
        description: '要更新的字段，如 { imagePrompt: "...", videoPrompt: "..." }',
        required: true,
      },
    },
  },
]

const VOICE_ASSIGNER_TOOLS: ToolDefinition[] = [
  {
    name: 'get_characters',
    description: '获取项目中所有角色的信息，包括已分配和未分配音色的角色。',
    parameters: {},
  },
  {
    name: 'list_available_voices',
    description: '列出可用的TTS音色列表，包含音色ID、名称、性别和描述。',
    parameters: {
      gender: {
        type: 'string',
        description: '按性别筛选音色：male | female | all',
        enum: ['male', 'female', 'all'],
      },
    },
  },
  {
    name: 'assign_voice',
    description: '为指定角色分配TTS音色。',
    parameters: {
      characterName: {
        type: 'string',
        description: '角色名称',
        required: true,
      },
      voiceId: {
        type: 'string',
        description: 'TTS音色ID',
        required: true,
      },
    },
  },
]

const SCRIPT_PARSER_TOOLS: ToolDefinition[] = [
  {
    name: 'read_uploaded_text',
    description: '读取上传的剧本文本内容。返回完整的上传文本。',
    parameters: {},
  },
  {
    name: 'save_parsed_script',
    description: '保存解析后的剧本结构数据，包含项目名称、题材、风格、集数拆分、场次拆分、角色/场景/道具提取等信息。',
    parameters: {
      title: {
        type: 'string',
        description: '项目名称（从内容推断或使用文件名）',
        required: true,
      },
      genre: {
        type: 'string',
        description: '题材类型：都市/古装/悬疑/科幻/甜宠/复仇/励志/校园',
        required: true,
        enum: ['都市', '古装', '悬疑', '科幻', '甜宠', '复仇', '励志', '校园'],
      },
      style: {
        type: 'string',
        description: '视觉风格：realistic/anime/cinematic/comic/watercolor/3d',
        required: true,
        enum: ['realistic', 'anime', 'cinematic', 'comic', 'watercolor', '3d'],
      },
      totalEpisodes: {
        type: 'number',
        description: '总集数',
        required: true,
      },
      episodes: {
        type: 'array',
        description: '剧集数组，每个元素包含标题、内容和场次拆分',
        required: true,
        items: {
          type: 'object',
          description: '单集数据',
          properties: {
            title: { type: 'string', description: '集标题（如：第1集：初遇）', required: true },
            content: { type: 'string', description: '该集的完整文本内容（不要截断或摘要）', required: true },
            scenes: {
              type: 'array',
              description: '该集的场次拆分数组',
              items: {
                type: 'object',
                description: '单场数据',
                properties: {
                  sceneNumber: { type: 'number', description: '场次编号（从1开始）', required: true },
                  location: { type: 'string', description: '场景地点（如：咖啡馆、办公室）', required: true },
                  timeOfDay: { type: 'string', description: '时间段：day/night/dawn/dusk/morning/afternoon/evening' },
                  description: { type: 'string', description: '场景简要描述' },
                  content: { type: 'string', description: '该场次的文本内容', required: true },
                },
                requiredFields: ['sceneNumber', 'location', 'content'],
              },
            },
          },
          requiredFields: ['title', 'content'],
        },
      },
      characters: {
        type: 'array',
        description: '提取的角色数组',
        items: {
          type: 'object',
          description: '角色数据',
          properties: {
            name: { type: 'string', description: '角色名称', required: true },
            role: { type: 'string', description: '角色类型：protagonist/supporting/minor' },
            gender: { type: 'string', description: '性别：male/female/unknown' },
            description: { type: 'string', description: '角色外貌和性格的简要描述' },
          },
          requiredFields: ['name'],
        },
      },
      scenes: {
        type: 'array',
        description: '提取的场景数组（去重后的唯一场景列表）',
        items: {
          type: 'object',
          description: '场景数据',
          properties: {
            location: { type: 'string', description: '地点名称', required: true },
            timeOfDay: { type: 'string', description: '时间段：day/night/dawn/dusk/morning/afternoon/evening' },
            description: { type: 'string', description: '场景描述' },
          },
          requiredFields: ['location'],
        },
      },
      props: {
        type: 'array',
        description: '提取的道具数组（只提取对剧情有推动作用的关键道具）',
        items: {
          type: 'object',
          description: '道具数据',
          properties: {
            name: { type: 'string', description: '道具名称', required: true },
            description: { type: 'string', description: '道具外观和用途描述' },
          },
          requiredFields: ['name'],
        },
      },
      summary: {
        type: 'string',
        description: '1-2句话的故事概要',
        required: true,
      },
    },
  },
]

const GRID_PROMPT_GENERATOR_TOOLS: ToolDefinition[] = [
  {
    name: 'read_characters',
    description: '读取项目中的角色信息，用于生成角色肖像提示词。',
    parameters: {},
  },
  {
    name: 'read_scenes',
    description: '读取项目中的场景信息，用于生成场景背景提示词。',
    parameters: {},
  },
  {
    name: 'read_shots',
    description: '读取当前集的分镜信息，用于生成宫格图提示词。',
    parameters: {},
  },
  {
    name: 'generate_character_prompt',
    description: '生成并保存角色肖像的AI绘图提示词。',
    parameters: {
      characterName: {
        type: 'string',
        description: '角色名称',
        required: true,
      },
      prompt: {
        type: 'string',
        description: '英文的AI绘图提示词',
        required: true,
      },
    },
  },
  {
    name: 'generate_scene_prompt',
    description: '生成并保存场景背景的AI绘图提示词。',
    parameters: {
      sceneLocation: {
        type: 'string',
        description: '场景地点名称',
        required: true,
      },
      prompt: {
        type: 'string',
        description: '英文的AI绘图提示词',
        required: true,
      },
    },
  },
  {
    name: 'generate_grid_prompt',
    description: '生成并保存宫格分镜图的AI绘图提示词。',
    parameters: {
      shotNumber: {
        type: 'number',
        description: '镜头编号',
        required: true,
      },
      imagePrompt: {
        type: 'string',
        description: '首帧图片的英文提示词',
        required: true,
      },
      videoPrompt: {
        type: 'string',
        description: '视频生成的XML格式提示词',
        required: true,
      },
    },
  },
]

// ============================================================
// Tool Registry Map
// ============================================================

export const AGENT_TOOLS: Record<AgentType, ToolDefinition[]> = {
  script_parser: SCRIPT_PARSER_TOOLS,
  script_rewriter: SCRIPT_REWRITER_TOOLS,
  extractor: EXTRACTOR_TOOLS,
  storyboard_breaker: STORYBOARD_BREAKER_TOOLS,
  voice_assigner: VOICE_ASSIGNER_TOOLS,
  grid_prompt_generator: GRID_PROMPT_GENERATOR_TOOLS,
}

/**
 * Get OpenAI-format tool definitions for an agent type
 */
export function getOpenAIToolsForAgent(agentType: AgentType): OpenAITool[] {
  const tools = AGENT_TOOLS[agentType] || []
  return tools.map(toolDefinitionToOpenAI)
}
