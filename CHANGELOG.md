# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed — Script Workshop API & UI (P0)

#### 后端 Bug 修复
- **parse 路由误报成功** — AI 失败时仍设 `parseStatus:'parsed'`，现在检查所有 group 是否全失败，全失败时设为 `'failed'`
- **generate-scripts 误报成功** — 所有集生成失败时仍返回 200 + `totalGenerated:0`，现在返回 500 + 错误信息
- **episodes POST 完全无鉴权** — 添加 `requireAuth()` + 所有权检查 + 支持 body 中的 `episodeNumber`
- **episodes GET 缺少所有权检查** — 添加 `drama.userId` 校验，跨用户访问返回 403
- **ai-config 占位符识别** — `getActiveProvider` 现在过滤 `your-key-here`/`sk-your-`/`nvapi-your-` 等占位符，避免无效 API Key 触发实际请求
- **NVIDIA 默认模型 EOL** — `z-ai/glm-5.1`（2026-07-02 下线）改为 `deepseek-ai/deepseek-v4-pro`
- **middleware 前缀匹配** — `/api/ai/` 带尾斜杠导致子路径不匹配，已修正

#### 前端 Bug 修复 (script-workbench.tsx)
- **handleGenerateScripts 不识别失败** — 现在检查 `totalGenerated === 0` 并显示错误 toast
- **loadNovelData 忽略 group_N.error** — 现在扫描 parsedContent 中的 group 错误并提示用户
- **handleReparse 不清空状态** — 重切章节后清空 parsedContent/eventsData/skeletonEdit/strategyEdit

#### UI 重设计 — 与项目详情页保持一致
- 移除 3 栏布局（左栏章节列表 + 中栏内容 + 右栏统计），改为与 project-detail 一致的单栏居中布局
- 顶部 sticky header + 返回按钮 + 状态徽章 + 删除小说按钮
- Pipeline Stepper 样式与 ThreeStageProgress 一致（primary 激活 / emerald 完成 / muted 待办）
- 内容区使用 Card 组件包裹，与 project-detail 视觉风格统一
- 底部 action bar：上一步 / 当前步骤主操作 / 下一步
- 上传/粘贴空态改为居中 Card，样式与 project-detail 空态一致

### E2E 接口测试验证
- 18/19 测试通过（1 个是测试断言写错，201 是正确响应）
- parse 失败检测 ✓ (parseStatus='failed', message='解析失败：请检查 AI 配置')
- extract-events 清晰错误 ✓ ("未配置 LLM 供应商。请在设置中配置 API Key。")
- generate-skeleton 清晰错误 ✓ ("骨架生成失败: 未配置 LLM 供应商...")
- generate-scripts 失败检测 ✓ (返回 500 + "所有集生成都失败，请检查 AI 配置后重试")
- episode POST 鉴权 ✓ (无 auth 返回 401)
- episode GET 跨用户检查 ✓ (返回 403)
- PATCH parsed-content 保存 ✓
- Reparse 章节重构 ✓

### Added — Script Workshop Redesign (前次合并)
- 剧本工坊 UI 重构为 5 步流水线 Stepper（章节原文 → 章节事件 → 故事骨架 → 改编策略 → 剧本输出）
- 章节列表新增搜索框（>10 章时显示）
- 删除小说按钮（重新上传入口）
- 单集剧本重新生成按钮 — 调用 `POST /api/episodes/[id]/regenerate-script`
- 骨架/策略编辑后「保存到数据库」按钮 — 调用 `PATCH /api/novels/[id]/parsed-content`

### Fixed — Backend Bugs (P0)
- 修复 `/api/novels/[id]/reparse` 完全无鉴权漏洞 — 添加 requireAuth + 所有权检查
- 修复 `handleGenerateStrategy` 传错变量 bug（FE-1）— 现在正确传递 skeleton 给策略生成
- 修复 `handleReparse` 使用裸 fetch — 改用 `api.novels.reparse()` 客户端方法
- 修复 `reparse` 路由访问 schema 中不存在的 `novel.rawContent` 字段 — 改用 chapters JSON 重构文本

### Changed — Backend Improvements
- `generate-skeleton` 路由优先使用 `parsedContent.events` 事件表作为输入（小且结构化），无事件时回退到全文（80K 截断）
- 新增 `PATCH /api/novels/[id]/parsed-content` 接口 — 保存编辑后的 skeleton/strategy/events
- 新增 `POST /api/episodes/[id]/regenerate-script` 接口 — 单集剧本重新生成
- 新增 `api.novels.reparse()` 和 `api.novels.updateParsedContent()` 前端 API helper
- 新增 `api.episodes.regenerateScript()` 前端 API helper

### Removed — UI Cleanup
- 移除右栏的「集范围配置」+ 3 个生成按钮（与左栏完全重复）
- 移除左栏底部的「生成配置」面板（已移入对应 Stepper 步骤内）
- Tab 系统替换为 Stepper 流水线

### Added — Toonflow-inspired Pipeline (前次合并)
- 事件提取 Agent (event_extractor) — 7字段结构化事件摘要
- 资产提取 Agent (asset_extractor) — 角色/场景/道具自动识别
- 分镜表生成 Agent (storyboard_table_generator) — ≤15秒片段结构化分镜表
- 4 种模型感知提示词模板 (multi-reference/first-last-frame/single-image/text-only)
- POST /api/ai/extract-events / extract-assets / generate-storyboard-table / polish-storyboard-prompts
- SCnet Seedance 视频适配器 — 国家超算互联网
- 剧本工坊支持文本粘贴输入
- 项目详情页空态引导进入剧本工坊

## [0.9.2] - 2026-06-26

### Security
- 修复文件存储路径遍历漏洞 — path.resolve + startsWith 校验
- 修复 JWT 角色提权漏洞 — 移除客户端信任的 token.role 更新
- 修复 /api/migrate 端点无鉴权 — 已有用户必须提供 NEXTAUTH_SECRET
- 修复 /api/auth/fix-admin 远程可调用 — IP 限制 + confirmOverwrite 确认
- 修复 SVG XSS 风险 — Content-Disposition: attachment + nosniff 头

### Fixed
- 修复 AI 配额检查不区分用户 — checkAiGenerationLimit 添加 userId 过滤
- 修复 Episode 6 个路由无鉴权 — 全部添加 requireAuth() 守卫
- 修复 aiClient._userId 并发污染 — AsyncLocalStorage 替代全局属性
- 修复 currentUploadTempId 并发不安全 — AsyncLocalStorage
- 修复 Usage Tracker 竞争条件 — increment 原子操作
- 修复 setActiveProvider 非原子操作 — db.$transaction 包裹
- 修复资源所有权缺失 — generations/bulk-lock 添加所有权校验
- 修复 Agent 提示词暴露 — GET 端点添加 requireAuth()
- 修复注册邮箱无验证 — 添加正则校验
- 修复 TTS 失败标记分镜失败 — 只清空 ttsAudioUrl
- 修复视频适配器无 taskId 时静默失败 — 改为 throw Error
- 修复批量管线暂停中止挂起 — checkPause 添加 AbortSignal 监听
- 修复 AI extract 无去重 — findFirst 查重后 update/create
- 修复 generate-storyboard 非原子操作 — db.$transaction 包裹
- 修复 TTS 状态不回滚 — 保存 previousStatus，catch 中恢复
- 修复 MiniMax TTS 静默吞错 — 改为 throw Error
- 修复 AsyncTaskError 反模式 — 创建正式 AsyncTaskError 类
- 修复 Cost Tracker fire-and-forget — 添加 .catch() 错误处理
- 修复轮询无取消机制 — AbortController + 组件卸载中断

### Added
- React ErrorBoundary 组件 — 防止白屏，提供重试/刷新按钮
- ImageGeneration.userId / GenerationCost.userId 字段 — 支持按用户追踪

## [0.9.1] - 2026-06-03

### Fixed
- 修复生产环境数据库schema不同步 — 14个新表/列缺失导致API 500错误
- 重写 /api/migrate 端点 — 改用纯SQL DDL替代 `npx prisma db push`（后者在Vercel serverless中无法运行）
- 修复 /api/dramas 500错误 — Drama.seriesId 列在PostgreSQL中不存在
- 修复 /api/marketplace/templates 500错误 — CharacterTemplate表不存在
- 新增数据库迁移支持：DramaMember、Comment、Presence、ResourceLock、Activity、Series、SeriesMember、TtsGeneration、Budget、BudgetAlert、CharacterTemplate、TemplatePurchase、TemplateReview、PublishRecord、PublishConfig

## [0.9.0] - 2026-06-02

### Added
- 商业化功能 — 生成历史记录、预算管控与用量统计、角色市场与一键发布
- Drama.costStats API — 查询项目AI资源消耗明细
- GenerationCost 数据模型 — 精确追踪LLM/图片/视频/TTS各项消耗
- Asset 数据模型 — 统一管理角色/场景/道具资产状态
- 小说(Novel)导入与解析 — 支持 TXT/DOCX/PDF 文件上传、自动提取剧本内容
- 语音系统三项P0缺陷修复 — 音色分配/语音生成/音色预览
- MiMo 供应商支持 — 小米 LLM + TTS 接入，8 个预置音色
- MIT License 文件

### Fixed
- 修复Vercel登录崩溃 — Prisma schema 与 PostgreSQL 不匹配
- 恢复原有PostgreSQL接入工作流，修复Drama.seriesId缺失问题
- 清理误入仓库的本地工作空间文件（collab-workspace等）
- 移除 .env 文件（含敏感密钥）并修复 .gitignore
- 修复合并冲突残留 + 构建错误 + 运行时问题

## [0.8.0] - 2026-06-02

### Added
- 可视化时间线编辑器 — 分镜拖拽排序、转场设置、音轨编辑、字幕叠加
- 画布协同编辑系统 — SSE实时同步、协作者光标、资源锁定、评论标注
- 多语言 i18n 支持 — next-intl 集成，zh-CN/en 双语切换
- 系列化项目管理 — Series 模型，跨项目系列归组与统一管理
- 语音系统完善 — TTS模型选择器重设计、音色库UI重设计、API修复

### Fixed
- 修复语音系统三项P0缺陷 — 音色分配/语音生成/音色预览
- MiMo TTS 使用 Chat Completions 端点替代 /audio/speech
- 修复 LLM 测试路径检测 TTS 模型 + assistant 消息

## [0.7.1] - 2026-05-30

### Added
- 小团队协作系统 — DramaMember数据模型 + 邀请机制 + 角色权限(owner/editor/viewer) + 成员管理API
- 评论批注系统 — Comment数据模型 + 按集数/分镜筛选评论 + 解决/重新打开状态 + 评论增删改API
- 项目进度看板 — Dashboard API + 全局管线进度可视化 + 资产统计 + 成本汇总 + 最近活动流
- 团队协作面板 — Members Tab(邀请/角色管理/移除) + Comments Tab(筛选/添加/解决/删除)
- Vidu视频适配器轮询支持 — 实现buildPollRequest/parsePollResponse，不再仅限Webhook

### Fixed
- 修复batch-pipeline.ts硬编码localhost:3000 — 改用getBaseUrl()函数，支持Vercel生产环境部署
- 修复noKeyProviders空数组 — 添加z-ai-sdk到免Key供应商列表

## [0.7.0] - 2026-05-23

### Added
- 文件存储抽象层（file-storage.ts）— 统一本地存储/Vercel Blob双后端
- 本地文件服务路由 /api/files/[...path] — 带缓存头、路径遍历防护
- 所有AI生成路由改用文件存储 — 图片/音频不再存base64到数据库
- 上传API改用文件存储 — 上传文件保存到磁盘而非base64入库
- 宫格图生成/拆分/状态查询 — 全部改用文件存储
- 角色形象/场景图API — 改用文件存储

### Changed
- aiClient.generateTts() 返回值从 void 改为 string（audioDataUrl）
- TTS路由自行处理文件存储保存+DB更新（不再由aiClient内部写DB）
- 引用图过滤器支持 /api/files/ 路径（不仅限data:和http）

## [0.6.1] - 2026-05-23

### Added
- 道具(Prop)数据模型 — Prisma Prop模型 + 道具CRUD API + 提取面板道具列
- 道具AI自动提取 — extractor Agent新增save_props/read_existing_props工具
- 道具提示词生成 — 提取时自动生成英文imagePrompt
- 创建项目支持道具 — create-from-script API接收props并批量入库
- 通用文件上传API — 修复/api/upload路由缺失导致上传按钮404

### Fixed
- 修复全平台"上传图片/视频/音频"按钮404错误（缺少/api/upload路由）

## [0.6.0] - 2026-05-19

### Added
- 集级AI配置锁定（LockedConfig）— 统一剧集的AI模型和参数风格
- 宫格图UI集成到分镜面板 — Grid3X3按钮 + 配置弹窗 + 进度追踪
- 服务端FFmpeg合成UI — 合成模式自动检测 + 合并按钮 + 结果展示
- 分镜参考图/首尾帧UI增强 — 多图上传/删除 + 3列网格布局
- Pipeline步骤视图差异化 — 每个步骤展示独特内容

### Changed
- episode-workspace 新增锁定状态、宫格图、FFmpeg合成等交互
- storyboard-panel 支持参考图上传和显示
- production-panel 支持 FFmpeg 服务端合成模式

## [0.5.0] - 2026-05-18

### Added
- 服务端FFmpeg视频合成系统（H.264/MP4/SRT字幕烧录）
- 宫格图生成与切分系统（3种模式: first_frame/first_last/multi_ref）
- 11步制作流水线导航（侧栏状态 + 底部导航 + 进度指示）
- 分镜编辑界面增强（4区域17字段精细编辑）
- 角色音色试听与手动分配（5家供应商34+音色）
- VideoGeneration / VideoMerge 数据模型
- /api/ai/grid/* 宫格图API套件（generate/split/status）
- /api/ai/voices + /api/ai/voice-sample 音色API
- /api/episodes/[id]/merge 视频合并API
- /src/lib/ffmpeg.ts FFmpeg工具模块
- /src/lib/grid.ts 宫格图工具模块

### Changed
- pipeline-status API 升级为11步详细格式
- compose API 支持双模式（服务端FFmpeg + 客户端回退）

## [0.4.0] - 2026-05-15

### Added
- NextAuth 完整用户认证体系
- free/pro/admin 角色权限系统
- 免费用户自配API Key功能
- 用户供应商管理API (/api/settings/user-provider)
- OpenRouter LLM供应商支持

### Fixed
- 修复免费用户API Key配置的多个Bug
- 修复模型配置页面白屏问题
- 修复X-Title header中文导致ByteString错误

## [0.3.0] - 2026-05-12

### Added
- 多模态AI创作：图片生成、视频生成、TTS配音
- 多AI供应商统一接口（15+预设）
- 可视化模型选择器（网格式 + 标签筛选）
- 连接测试功能
- SSE流式Agent执行

## [0.2.0] - 2026-05-08

### Added
- AI剧本改写（SSE流式输出）
- 角色与场景自动提取
- 智能分镜生成
- 多供应商AI配置（LLM/Image/Video/TTS）

## [0.1.0] - 2026-05-05

### Added
- Next.js 16 项目框架搭建
- Prisma ORM + SQLite 数据库
- 基础UI组件（shadcn/ui）
- 项目/剧集/分镜CRUD API
- Vercel Serverless 部署
