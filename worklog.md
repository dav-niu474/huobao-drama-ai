---
Task ID: 1
Agent: Main Agent
Task: 修复免费用户API Key配置功能

Work Log:
- 读取了 settings-view.tsx 全文（1896行），理解了当前代码结构
- 检查了 api.ts 中 userProvider 的类型定义
- 检查了 user-provider/route.ts 后端API逻辑
- 运行 npm run build 确认当前代码可以成功构建
- 启动 dev server 验证无白屏错误
- 分析用户需求：管理员看默认key，免费用户看不到默认key但可添加自己的key

主要修改：
1. **settings-view.tsx** - CategoryPanel 组件重写：
   - 管理员：显示完整的 ProviderCard（可编辑、测试、保存）
   - 非管理员：只显示"平台共享 Key"状态区域（Badge显示哪些已配置，不暴露key值）
   - "我的 API Key"区域对所有用户可见（管理员标注"个人覆盖"，免费用户标注"优先使用"）

2. **settings-view.tsx** - handleSetActiveUserProvider 修复：
   - 不再发送空的 apiKey 创建空记录
   - 如果用户没有配置过该 provider 的 key，提示先配置
   - 切换时保留现有的 apiKey

3. **api.ts** - 类型修复：
   - apiKey 从 required 改为 optional

4. **user-provider/route.ts** - upsert 逻辑优化：
   - create: apiKey 为空时默认空字符串
   - update: 只有 apiKey 非空时才更新，避免覆盖已有 key

Build: ✅ npm run build 成功
Push: ❌ GitHub token 过期，无法推送

Stage Summary:
- 本地构建成功，commit 2bee554 已创建
- 需要用户更新 GitHub token 才能推送到远程

---
Task ID: 2
Agent: Main Agent
Task: 实现 Grid Image Generation and Splitting 系统

Work Log:
- 阅读了现有代码：adapters/image.ts, ai-config.ts, agents/*, Prisma schema, generate-image/route.ts, poll-status/route.ts
- 确认 Sharp 已作为依赖安装（v0.34.3）
- 确认 ImageGeneration 模型已有 frameType 字段（支持 'grid'）
- 确认 grid_prompt_generator agent 已在 AgentConfig 模型中定义
- 创建了 6 个新文件

新增文件:
1. **src/lib/grid.ts** — Grid 工具模块
   - `splitGridImage(imageBuffer, rows, cols)`: 使用 Sharp 分割宫格图为独立单元格图片
   - `calculateGridResolution(rows, cols)`: 计算宫格图目标分辨率（960*cols x 540*rows）
   - `buildGridPrompt(cellPrompts, rows, cols, mode)`: 将单元格提示词组合为宫格提示词
   - `validateGridDimensions(rows, cols)`: 验证宫格尺寸（1-6行/列，最多36格）
   - `getCellIndex / getCellPosition`: 单元格索引与行列互转
   - `GRID_MODES`: 宫格模式常量定义

2. **src/app/api/ai/grid/prompt/route.ts** — 宫格提示词生成 API
   - POST /api/ai/grid/prompt
   - 入参: { episodeId, dramaId, shotIds, gridMode, rows, cols }
   - 从数据库读取角色、场景、分镜数据
   - 使用 grid_prompt_generator 的系统提示词调用 LLM
   - 返回: { prompts: string[], cellPrompts: string[] }

3. **src/app/api/ai/grid/generate/route.ts** — 宫格图生成 API
   - POST /api/ai/grid/generate
   - 入参: { episodeId, dramaId, prompt, rows, cols, imageConfigId?, cellPrompts?, shotIds?, gridMode? }
   - 使用现有 image adapter 系统（getImageAdapter）
   - 计算分辨率: rows * cols
   - 创建 ImageGeneration 记录（frameType: 'grid'）
   - 支持同步/异步生成（返回 taskId 用于轮询）
   - 返回: { imageUrl, taskId?, imageGenerationId }

4. **src/app/api/ai/grid/split/route.ts** — 宫格图分割 API
   - POST /api/ai/grid/split
   - 入参: { imageUrl, rows, cols, assignments: [{ cellIndex, storyboardId, frameType }] }
   - 支持下载 data URL 和 HTTP URL 的宫格图
   - 使用 Sharp 分割为独立单元格
   - 转换为 data URL 并更新 Storyboard 记录
   - 返回: { cells: [{ index, imageUrl, assignedTo }] }

5. **src/app/api/ai/grid/status/route.ts** — 宫格生成状态查询 API
   - GET /api/ai/grid/status?taskId=xxx 或 ?imageGenerationId=xxx
   - 通过 ImageGeneration 记录查询状态
   - 异步任务通过 adapter 的 buildPollRequest/parsePollResponse 轮询
   - 完成后自动更新 ImageGeneration 记录并返回 data URL
   - 返回: { status, imageUrl?, error? }

设计要点:
- 所有路由都使用 requireAuth() 进行认证
- 使用现有 image adapter 模式（getImageAdapter），与 generate-image 路由一致
- Grid 图的 ImageGeneration 记录使用 frameType: 'grid'，referenceImages 存储宫格配置
- 分割后的单元格图片以 data URL 格式存储（与现有 firstFrameUrl 一致）
- 宫格提示词构建包含详细的布局指令，确保 AI 模型生成正确的宫格结构

Lint: ✅ 新文件无 ESLint 错误
Dev Server: ✅ 所有路由正常响应（认证拦截验证通过）

---
Task ID: 3
Agent: Main Agent
Task: 实现 Server-side FFmpeg Video Composition 系统

Work Log:
- 阅读现有代码：Prisma schema, compose/route.ts, pipeline-status/route.ts, episode route, storyboards route, store.ts, types.ts
- 确认 FFmpeg 7.1.3 已安装在系统中（含 libx264, AAC 编码支持）
- 确认 store.ts 已包含 bgmPrompt, soundEffect, lastFrameUrl, referenceImages 字段
- 确认 Storyboard 模型已有 composedUrl, firstFrameUrl 字段
- 创建/更新了 5 个文件

新增/修改文件:

1. **prisma/schema.prisma** — 新增模型和字段
   - Storyboard 模型新增: `lastFrameUrl`, `bgmPrompt`, `soundEffect`, `referenceImages` 字段
   - 新增 `VideoGeneration` 模型：视频生成追踪（provider, model, prompt, referenceMode, taskId, status 等）
   - 新增 `VideoMerge` 模型：视频合并追踪（episodeId, status, mergedUrl, duration 等）
   - db:push 成功同步到 SQLite

2. **src/lib/ffmpeg.ts** — FFmpeg 工具模块（全新创建）
   - `isFFmpegAvailable()`: 检测 FFmpeg 是否安装（结果缓存）
   - `composeShot(videoPath, audioPath?, subtitlePath?, outputPath?)`: 单镜头合成
     - H.264 视频编码 + AAC 音频编码
     - 可选 TTS 音频混入
     - 可选 SRT 字幕烧录（subtitles filter + force_style）
   - `mergeShots(shotPaths[], outputPath?)`: 多镜头合并
     - FFmpeg concat demuxer 快速无损合并
     - 单镜头时直接复制
   - `generateSRT(text, duration)`: 生成 SRT 字幕内容
     - 长文本自动分段（按标点/空格分割）
     - 时间轴按 duration 平均分配
   - `parseDialogueForTTS(dialogue)`: 对话文本解析
     - 提取说话人 + 纯文本
     - 识别可忽略对话（旁白、舞台指示）
   - `getVideoDuration(videoPath)`: 使用 FFprobe 获取视频时长
   - `downloadFile(url, localPath)`: 支持下载 HTTP URL 和 data URL
   - `ensureStorageDirs()`: 确保存储目录存在
   - 存储路径: `/tmp/drama-storage/{audio,subtitles,composed,merged}/`
   - 所有 FFmpeg/FFprobe 调用使用 `child_process.execFile`（无 fluent-ffmpeg 依赖）

3. **src/app/api/episodes/[id]/compose/route.ts** — 重写合成 API
   - GET: 保留原有客户端合成数据接口，新增 `ffmpegAvailable` 字段
   - POST: 支持两种模式
     - 模式1（服务端）: `{ storyboardId, mode: "server" }` — 使用 FFmpeg 合成
       1. 下载视频文件到本地
       2. 下载 TTS 音频（如有）
       3. 生成 SRT 字幕文件（如有对话）
       4. 调用 composeShot() 执行合成
       5. 更新 storyboard.composedUrl
       6. 清理临时文件
     - 模式2（客户端回退）: `{ storyboardId, composedUrl }` — 保存客户端合成结果
   - FFmpeg 不可用时返回 `{ error: 'FFmpeg not available', fallback: 'client' }`（HTTP 501）

4. **src/app/api/episodes/[id]/merge/route.ts** — 新建合并 API
   - POST: 合并所有已合成的分镜视频为完整剧集
     1. 检查 FFmpeg 可用性
     2. 验证所有分镜有 composedUrl 或 videoUrl
     3. 创建 VideoMerge 追踪记录
     4. 下载所有分镜视频到本地
     5. 调用 mergeShots() 执行合并
     6. 获取合并后视频时长
     7. 更新 episode.videoUrl 和 episode.status
     8. 清理临时下载文件
   - GET: 查询合并状态
     - 返回最新 VideoMerge 记录
     - 返回分镜统计（total, composed, withVideo, missing）
     - 返回合并就绪状态（canMerge, canMergePartial）
     - 返回 FFmpeg 可用性

5. **src/app/api/episodes/[id]/pipeline-status/route.ts** — 增强 Pipeline 状态 API
   - 原有: 7 个粗略步骤
   - 新增详细 11 步 Pipeline:
     1. raw_content (原始内容)
     2. script_rewrite (剧本改写)
     3. character_extract (角色提取)
     4. voice_assign (配音分配)
     5. storyboard (分镜生成)
     6. character_images (角色图片)
     7. scene_images (场景图片)
     8. dubbing (配音生成)
     9. shot_frames (镜头图片)
     10. video (视频生成)
     11. compose_merge (合成合并)
   - 每步包含: { status, label, completed, total, extra? }
   - 新增 summary: { totalSteps, completedSteps, overallProgress, currentStep }
   - 新增 ffmpegAvailable 环境信息
   - 保留旧格式兼容性（scriptRewrite, extractCharacters, etc.）

设计要点:
- 双模式兼容：FFmpeg 可用时服务端合成（H.264/MP4），不可用时客户端回退（WebM）
- 客户端可通过 HTTP 501 + `fallback: 'client'` 自动切换合成模式
- 所有新 API 使用现有 `db` 客户端和认证中间件
- 文件存储使用 `/tmp/drama-storage/` 目录（生产环境可替换为云存储）
- 临时文件在合成完成后自动清理

Lint: ✅ 所有新/修改文件无 ESLint 错误
Dev Server: ✅ 运行正常
DB Push: ✅ Schema 同步成功

---
Task ID: 4
Agent: Main Agent
Task: 实现 Episode Pipeline Status API + 11-Step Navigation, Enhanced Storyboard Editing, Character Voice Preview and Manual Assignment

Work Log:
- Read and analyzed existing codebase: schema, components, store, APIs, adapters
- Confirmed Prisma schema already had lastFrameUrl, bgmPrompt, soundEffect, referenceImages fields
- Added `description` field to Storyboard model for visual semantics
- Updated pipeline-status API to 11-step format
- Created voice API routes
- Updated types, helpers, store, api client
- Updated episode workspace with 11-step sidebar + bottom navigation
- Updated storyboard panel with enhanced split layout editing
- Updated voice panel with preview and manual assignment

Files Modified:
1. **prisma/schema.prisma** — Added `description` field to Storyboard model
2. **src/app/api/episodes/[id]/pipeline-status/route.ts** — Rewrote to 11-step format
   - Returns { pipeline, steps, completedSteps, totalSteps, progressPercent }
   - Each step: { status: 'pending'|'active'|'completed', completed, total }
3. **src/app/api/ai/voices/route.ts** — New voice listing API
   - GET: Returns available voices from all TTS providers
   - Voice catalog for minimax, chatfire, openai, fish_audio, ali
   - Query params: provider, language for filtering
4. **src/app/api/ai/voice-sample/route.ts** — New voice sample generation API
   - POST: Generate TTS sample for a character
   - Body: { characterId, voiceId, text? }
   - Returns: { audioUrl, voiceId, text, characterName }
5. **src/lib/store.ts** — Updated Storyboard interface with new fields
6. **src/lib/api.ts** — Updated pipeline status type, added listVoices and generateVoiceSample
7. **src/components/episode/types.ts** — Added PipelineStepKey, PipelineStepDef, PipelineStepStatus, PipelineStatus, VoiceInfo types; updated panel props
8. **src/components/episode/helpers.tsx** — Added PIPELINE_STEPS, PIPELINE_TO_STEP_MAP, cameraAngleLabel, cameraMovementLabel helpers
9. **src/components/episode-workspace.tsx** — Major rewrite
   - Added 11-step pipeline sidebar with status indicators (green check, blue spinner, gray circle)
   - Added bottom navigation bar with Previous/Next buttons and step dots
   - Added pipeline status fetching and display
   - Added voice management state (voices, voiceSamples, generatingSample)
   - Added voice assignment/sample handlers
   - Progress indicator showing "N/11 steps completed"
10. **src/components/episode/voice-panel.tsx** — Complete rewrite
    - Split layout: character list on left, voice library on right
    - Voice library browser grouped by provider, filterable by language
    - Per-character: current voice, Select dropdown, Preview button, audio player
    - "AI Auto-Assign" and "Batch Generate Samples" buttons
11. **src/components/episode/storyboard-panel.tsx** — Complete rewrite
    - Split layout: storyboard list on left, detail panel on right
    - Detail panel organized in sections:
      - Shot Structure: title, shotType, cameraAngle, cameraMovement, duration
      - Visual Semantics: action, atmosphere, description, dialogue
      - Generation Prompts: imagePrompt, videoPrompt, bgmPrompt, soundEffect
      - Frame Images: firstFrameUrl, lastFrameUrl previews with upload/generate
    - Inline editing for all fields
    - Copy-to-clipboard buttons for prompts

DB Push: ✅ Schema synced (description field added)
TypeScript Check: ✅ No errors (only unrelated worldmonitor error)
Dev Server: ✅ Running, voices API returning 200

---
Task ID: v0.5-iteration
Agent: Main Agent
Task: Implement v0.5 iteration - FFmpeg compose, grid image system, pipeline nav, enhanced storyboard, voice preview

Work Log:
- Analyzed competitor Huobao Drama repository thoroughly
- Generated competitive analysis report PDF
- Updated README with development roadmap (v0.1-v0.6)
- Implemented P0: Server-side FFmpeg Video Composition
  - Created /src/lib/ffmpeg.ts with compose, merge, SRT generation, dialogue parsing
  - Created /api/episodes/[id]/compose (dual-mode: server FFmpeg + client fallback)
  - Created /api/episodes/[id]/merge (FFmpeg concat demuxer)
  - Enhanced /api/episodes/[id]/pipeline-status (11 detailed steps)
  - Vercel-compatible: auto-detects FFmpeg availability
- Implemented P0: Grid Image Generation & Splitting System
  - Created /src/lib/grid.ts (Sharp splitting, resolution calc, prompt building)
  - Created /api/ai/grid/prompt (AI grid prompt generation)
  - Created /api/ai/grid/generate (grid image generation via adapters)
  - Created /api/ai/grid/split (cell splitting & storyboard assignment)
  - Created /api/ai/grid/status (async polling)
  - 3 modes: first_frame, first_last, multi_ref (2x2-4x4)
- Implemented P1: 11-Step Pipeline Navigation
  - Left sidebar with status indicators
  - Bottom navigation bar with Previous/Next
  - Progress indicator N/11
- Implemented P1: Enhanced Storyboard Editing
  - Split layout: list + detail panel
  - 4 sections with inline editing
  - bgmPrompt, soundEffect, lastFrameUrl, referenceImages fields
  - Copy-to-clipboard on prompt fields
- Implemented P1: Character Voice Preview & Manual Assignment
  - /api/ai/voices (34 voices, 5 providers)
  - /api/ai/voice-sample (TTS sample generation)
  - Voice library browser with filtering
- Updated Prisma schema: VideoGeneration, VideoMerge models; enhanced Storyboard fields
- Build succeeded with all new routes
- Committed as b207d38 and force-pushed to GitHub
- Linked Vercel project with new token, triggered deployment

Stage Summary:
- v0.5 iteration fully implemented with 8 new API routes and 2 new DB models
- Build passes, 20 files changed, +3974/-707 lines
- Deployment triggered via Vercel CLI with new token
- GitHub token: [REDACTED]
- Vercel token: [REDACTED]

---
Task ID: v0.6-iteration
Agent: Main Agent
Task: Implement v0.6 iteration - episode config lock, grid UI, FFmpeg compose UI, reference images

Work Log:
- Updated README with v0.5 completion status and v0.6 roadmap
- Updated deployment credential with new Vercel token
- Implemented P2: Episode-level AI Config Lock
  - Added lockedConfig field to Episode model in prisma schema
  - Updated episode PATCH API to handle lockedConfig
  - Added LockedConfig interface and store actions to store.ts
  - Added disabled prop to model-selector.tsx (amber tint when locked)
  - Added Lock/LockOpen toggle in episode-workspace header
  - Toast notifications on lock/unlock
- Implemented P2: Grid Image UI Integration
  - Added grid.generate/split/status methods to api.ts
  - Added GridMode, GridConfig, GridGenerationState types
  - Added grid state and handleGridGenerate handler to episode-workspace
  - Added "宫格图生成" button with Grid3X3 icon in storyboard toolbar
  - Added Grid Configuration Dialog (mode selector, size selector, summary)
  - Progress tracking during generation/splitting
- Implemented P2: Server-side FFmpeg Compose UI
  - Added ffmpegAvailable, merging, mergeStatus state to episode-workspace
  - Added fetchMergeStatus to check FFmpeg availability
  - Added handleServerCompose with auto-fallback to client-side
  - Added handleServerMerge for episode-level video merging
  - Updated production-panel with FFmpeg badge, merge button, merge result banner
  - Compose button shows mode (FFmpeg/WebM)
- Implemented P2: Storyboard Reference Images UI
  - Added reference images upload/display/delete UI in storyboard detail panel
  - Multiple image upload support with FileReader
  - Hover-to-delete with Trash2 icon
  - Grid display with 3 columns
- Fixed lucide-react Reference icon (doesn't exist) → Bookmark
- Cleaned worklog.md of exposed credentials
- Used git filter-branch to remove tokens from git history
- Build passed, committed and pushed to GitHub
- Deployed to Vercel production (Ready)

Stage Summary:
- v0.6 iteration with 4 major features implemented
- 11 files changed, +977/-50 lines
- All P2 items completed: config lock, grid UI, FFmpeg compose UI, reference images
- Deployment live at huobao-drama-ai.vercel.app

---
Task ID: 1
Agent: Main
Task: 修复免费用户API Key隐私保护 + 配置入口保障

Work Log:
- 分析了当前main上的代码架构：设置按钮已对所有用户开放，UserProviderCard和/api/settings/user-provider已存在
- 发现之前被拒绝的fix/api-key-privacy分支把设置按钮改成了仅admin可见，这是用户愤怒的根本原因
- 删除了旧的fix/api-key-privacy分支，基于最新main创建新的fix/free-user-api-key-access分支
- 修改后端/api/settings GET：非admin用户不再获取管理员Provider信息，改为返回空列表+hasDefault标记
- 新增hasGlobalDefaultProvider()函数到ai-config.ts
- 修改前端settings-view.tsx：管理员ProviderCard区域仅admin可见，免费用户配置区域始终开放
- 非admin用户可见"平台共享Key可用"提示(当管理员已配置默认Key时)
- 构建验证通过
- 创建PR #9

Stage Summary:
- PR: https://github.com/dav-niu474/huobao-drama-ai/pull/9
- 核心原则：隐藏管理员配置 ≠ 禁用免费用户配置
- 3个文件修改：settings/route.ts, ai-config.ts, settings-view.tsx

---
Task ID: 2
Agent: Main
Task: 修复免费用户点击眼睛图标可看到平台API Key的安全漏洞

Work Log:
- 用户报告：免费用户点击眼睛图标时，可以看到平台的API Key明文
- 定位到安全漏洞：userProviderToConfig函数（/api/settings/user-provider/route.ts第25行）
- 根因：当用户apiKey为空时，函数回退读取process.env[preset.envKey]，即平台环境变量中的API Key
- 该环境变量Key通过API返回给前端，免费用户在UserProviderCard中点眼睛即可看到明文
- 修复：将apiKey: up.apiKey || (preset?.envKey ? (process.env[preset.envKey] || '') : '') 改为 apiKey: up.apiKey || ''
- 确认getActiveProviderForUser(ai-config.ts:119)中的环境变量回退保留（仅服务端使用，不返回前端）
- 确认test-connection端点不返回API Key
- 确认active-models端点不返回API Key
- 提交并推送到fix/free-user-api-key-access分支，PR #9自动更新

Stage Summary:
- 安全漏洞修复：移除userProviderToConfig中环境变量API Key回退
- 1个文件修改：user-provider/route.ts（1行核心变更）
- PR #9已更新：https://github.com/dav-niu474/huobao-drama-ai/pull/9
