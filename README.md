# 🎬 AI短剧创作平台 (Huobao Drama AI)

**AI驱动的短剧创作平台** — 从剧本到成片，一站式AI短剧制作工作台。

[![Deploy on Vercel](https://img.shields.io/badge/Deploy-Vercel-black?logo=vercel)](https://huobao-drama-ai.vercel.app)
[![Next.js 16](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)

> 基于 [huobao-drama](https://github.com/chatfire-AI/huobao-drama) 参考设计，使用 Next.js 16 + 多AI供应商架构 构建。

## ✨ 功能特性

### 📝 剧本创作
- **剧本文件上传** — 支持 .txt/.md/.docx/.pdf 格式上传，AI智能解析剧本结构
- **AI剧本解析** — 自动识别集数拆分、推断题材与视觉风格，支持AI增强解析
- **一键创建项目** — 解析完成后自动创建项目及所有集数，即刻进入创作流程
- **AI剧本改写** — 将小说/故事大纲自动改写为标准剧本格式
- **流式输出** — 支持SSE流式响应，实时查看生成过程
- **角色与场景提取** — AI自动识别角色信息（外貌、性格、角色定位）和场景描述
- **智能分镜生成** — 自动拆解为分镜镜头，含景别、运镜、动作、对白、氛围等

### 🎨 视觉生成
- **角色头像生成** — 基于角色描述AI生成人物肖像
- **场景图生成** — 基于场景提示词生成环境背景
- **分镜帧生成** — 为每个镜头生成首帧图片
- **批量生成** — 一键生成所有镜头图片
- **本地上传** — 支持本地上传图片/视频/音频文件

### 🎬 视频制作
- **图片转视频** — 将静态帧图片转化为动态视频片段
- **Seedance 2.0** — 支持字节跳动Seedance 2.0视频生成（图生视频）
- **AI配音(TTS)** — 为对话镜头自动生成语音
- **完整制作流水线** — 图片→视频→配音→成片

### 📋 提示词管理
- **提示词输出** — 每个镜头自动生成图片/视频提示词
- **一键复制** — 复制提示词到剪贴板，方便在其他平台使用
- **无Key也可用** — 即使没有API Key，也能复制提示词去其他平台生成后本地上传

### ⚙️ 多供应商配置
- **LLM语言模型** — 70+ 模型可选：NVIDIA NIM / 商汤SenseNova(日日新) / OpenAI / SiliconFlow / DeepSeek / OpenRouter / 自定义兼容接口
- **图片生成** — NVIDIA SDXL / OpenAI DALL·E / SiliconFlow / Stability AI / z-ai-sdk / 自定义接口
- **视频生成** — Seedance 2.0 / z-ai-sdk / SiliconFlow / 火山引擎(Kling) / 自定义接口
- **语音合成** — OpenAI TTS / NVIDIA Riva / Fish Audio / z-ai-sdk / 火山引擎 / 自定义接口
- **可视化模型选择器** — 网格式选择模型，支持标签筛选（推荐/最新/快速/推理）
- **可视化配置** — 每个供应商独立配置 API Key、Base URL、模型名称
- **一键切换** — 选择活跃供应商，立即生效
- **连接测试** — 一键验证API连通性，支持测试特定模型
- **数据库存储** — 设置保存在数据库，Vercel部署兼容

## 🛠️ 技术栈

| 类别 | 技术 |
|------|------|
| **框架** | Next.js 16 (App Router) + TypeScript 5 |
| **UI** | Tailwind CSS 4 + shadcn/ui + Lucide Icons + Framer Motion |
| **数据库** | Prisma ORM + SQLite (开发) / PostgreSQL (生产) |
| **状态管理** | Zustand + TanStack Query |
| **动画** | Framer Motion |
| **AI-LLM** | 多供应商：NVIDIA NIM (70+模型) / 商汤SenseNova / OpenAI / DeepSeek / SiliconFlow / OpenRouter |
| **AI-图像** | 多供应商：NVIDIA SDXL / DALL·E / GPT Image / Stability AI / SiliconFlow / z-ai-sdk |
| **AI-视频** | 多供应商：Seedance 2.0 / z-ai-sdk / SiliconFlow / 火山引擎 |
| **AI-语音** | 多供应商：OpenAI TTS / NVIDIA Riva / Fish Audio / z-ai-sdk / 火山引擎 |
| **部署** | Vercel Serverless Functions，自动数据库迁移 |

## 🚀 快速开始

### 环境要求
- Node.js 18+ / Bun
- 至少一个 AI 供应商的 API Key（推荐 NVIDIA 或 OpenAI）

### 安装

```bash
# 克隆仓库
git clone https://github.com/dav-niu474/huobao-drama-ai.git
cd huobao-drama-ai

# 安装依赖
bun install

# 配置环境变量
cp .env.example .env
# 编辑 .env 文件，填入你的 API Key

# 初始化数据库
bun run db:push

# 启动开发服务器
bun run dev
```

### Vercel 部署

1. Fork 本仓库到你的 GitHub
2. 在 Vercel 中导入项目
3. 配置环境变量（至少填入一个 AI 供应商的 API Key）
4. 部署完成后，在平台设置页面配置更多供应商
5. 首次访问时数据库表会自动迁移

### 环境变量

| 变量名 | 说明 | 必填 |
|--------|------|------|
| `DATABASE_URL` | 数据库连接字符串 | ✅ (Vercel自动配置) |
| `DIRECT_URL` | 数据库直连URL (Vercel Postgres) | ✅ (Vercel部署) |
| `NVIDIA_API_KEY` | NVIDIA NIM API 密钥 | ❌ |
| `OPENAI_API_KEY` | OpenAI API 密钥 | ❌ |
| `DEEPSEEK_API_KEY` | DeepSeek API 密钥 | ❌ |
| `SILICONFLOW_API_KEY` | SiliconFlow API 密钥 | ❌ |
| `STABILITY_API_KEY` | Stability AI API 密钥 | ❌ |
| `VOLCENGINE_API_KEY` | 火山引擎 API 密钥 | ❌ |
| `FISH_AUDIO_API_KEY` | Fish Audio API 密钥 | ❌ |
| `SENSENOVA_KEY` | 商汤日日新 SenseNova API 密钥 | ❌ |
| `OPENROUTER_API_KEY` | OpenRouter API 密钥 | ❌ |

> 💡 只需配置至少一个供应商即可使用，也可在平台设置页面中配置（保存到数据库）

## 📱 使用流程

```
方式一：上传剧本（快速入门）
1. 点击「上传剧本」→ 选择 .txt/.md/.docx/.pdf 文件
2. AI自动解析 → 识别集数、题材、风格
3. 确认创建 → 项目及集数自动生成，即刻开始创作

方式二：手动创建
1. 新建项目 → 选择题材和视觉风格
2. 创建集数 → 进入集数工作台
3. 粘贴原始内容 → AI改写为剧本（流式输出）
4. AI提取角色与场景 → 生成角色头像和场景图
5. AI生成分镜 → 查看镜头列表及提示词
6. 生成图片/视频/配音 → 完成制作
   ↳ 或复制提示词到其他平台生成，然后本地上传
```

### 无API Key使用方式

即使没有配置AI供应商的API Key，你也可以：

1. **复制提示词** — 每个分镜都会生成图片/视频提示词，点击复制按钮即可复制
2. **其他平台生成** — 将复制的提示词粘贴到 Midjourney、Runway、Kling 等平台生成内容
3. **本地上传** — 将生成的内容通过上传按钮导入到平台中

## 📁 项目结构

```
src/
├── app/
│   ├── api/
│   │   ├── ai/              # AI API 路由
│   │   │   ├── rewrite-script/         # 剧本改写
│   │   │   ├── extract/                # 角色/场景提取
│   │   │   ├── extract-stream/         # 流式提取
│   │   │   ├── generate-storyboard/    # 分镜生成
│   │   │   ├── generate-storyboard-stream/ # 流式分镜
│   │   │   ├── generate-image/         # 图片生成
│   │   │   ├── generate-scene-image/   # 场景图生成
│   │   │   ├── generate-character-image/ # 角色头像
│   │   │   ├── generate-video/         # 视频生成
│   │   │   ├── generate-tts/           # TTS配音
│   │   │   └── test-connection/        # 连接测试
│   │   ├── agent/           # Agent执行 API (5大AI Agent)
│   │   ├── dramas/          # 剧本管理 API (含create-from-script)
│   │   ├── episodes/        # 集数管理 API (含pipeline-status/compose)
│   │   ├── storyboards/     # 分镜管理 API
│   │   ├── upload/          # 文件上传 API (script剧本上传)
│   │   ├── settings/        # 设置 API (数据库存储)
│   │   ├── auth/            # 认证 API (NextAuth)
│   │   ├── migrate/         # 数据库迁移 API
│   │   └── health/          # 健康检查 API
│   ├── page.tsx             # 主页面
│   ├── layout.tsx           # 根布局
│   └── globals.css          # 全局样式
├── components/
│   ├── project-list.tsx     # 项目列表（含上传剧本入口）
│   ├── project-detail.tsx   # 项目详情
│   ├── episode-workspace.tsx # 集数工作台
│   ├── script-upload-dialog.tsx # 剧本上传三步Dialog
│   ├── agent-execution-panel.tsx # Agent执行面板
│   ├── settings-view.tsx    # 设置页面 (多供应商配置)
│   ├── model-selector.tsx   # 模型选择器组件
│   ├── episode/             # 集数工作台子面板
│   └── ui/                  # shadcn/ui 组件
├── lib/
│   ├── agents/              # AI Agent系统 (factory + skills + tools)
│   ├── nvidia.ts            # NVIDIA NIM API 客户端 (底层)
│   ├── ai-config.ts         # 多供应商 AI 配置 + 统一客户端
│   ├── api.ts               # API 客户端 (含剧本上传/创建)
│   ├── pipeline-helpers.ts  # 3阶段12步管线状态计算
│   ├── store.ts             # Zustand 状态管理
│   ├── db.ts                # Prisma 数据库 (自动迁移)
│   └── utils.ts             # 工具函数
└── prisma/
    └── schema.prisma        # 数据库模型 (Drama/Episode/Character/Scene/Storyboard/AiProvider)
```

## 🤖 支持的 AI 供应商

### LLM 语言模型

#### NVIDIA NIM（70+ 模型）
| 模型 | 说明 | 标签 |
|------|------|------|
| GLM-5.1 | 智谱最新大模型 | ⭐ 推荐, 🆕 最新 |
| GLM-5 / GLM-4.7 | 智谱GLM系列 | — |
| DeepSeek V4 Pro | DeepSeek最新推理模型 | ⭐ 推荐, 🆕 最新 |
| DeepSeek V4 Flash | DeepSeek快速版 | ⚡ 快速 |
| DeepSeek V3.2 / V3.1 Terminus | DeepSeek V3系列 | — |
| MiniMax M2.7 / M2.5 | MiniMax最新模型 | 🆕 最新 |
| Qwen 3.5 397B / 122B | 阿里通义千问3.5 | ⭐ 推荐, 🆕 最新 |
| Qwen 3 Next 80B (Thinking) | 通义千问推理版 | 🧠 推理 |
| Kimi K2.5 / K2 / K2 Thinking | 月之暗面Kimi系列 | 🆕 最新, 🧠 推理 |
| Llama 4 Maverick | Meta最新开源模型 | 🆕 最新 |
| Llama 3.3 70B / 3.1 405B/70B/8B | Meta Llama 3系列 | ⚡ 快速 |
| Nemotron Ultra 253B / Super 49B | NVIDIA自研模型 | ⭐ 推荐 |
| Mistral Large 3 675B / Medium 3 / Small 4 | Mistral系列 | 🆕 最新 |
| Mixtral 8x22B | Mistral MoE模型 | — |
| GPT-OSS 120B / Yi Large / Seed OSS 36B | 其他开源模型 | — |

#### 商汤 SenseNova（日日新）
| 模型 | 说明 | 标签 |
|------|------|------|
| DeepSeek V4 Flash | DeepSeek快速版（限时免费） | 🆓 免费, ⭐ 推荐 |
| SenseChat-5 | 商汤日日新5代对话模型 | ⭐ 推荐 |
| SenseChat-5 Pro | 商汤日日新5代增强版 | 💎 高级 |
| DeepSeek V3 | DeepSeek V3 | — |
| Qwen3 235B | 通义千问3 235B | — |
| Qwen3 30B | 通义千问3 30B | ⚡ 快速 |

#### 其他LLM供应商
| 供应商 | 模型示例 | 适用场景 |
|--------|----------|----------|
| OpenAI | GPT-4o, GPT-4.1, o3, o4-mini | 通用任务, 推理 |
| SiliconFlow | DeepSeek-V3, Qwen, Llama | 国内高速访问 |
| DeepSeek | DeepSeek Chat, DeepSeek Reasoner | 性价比高 |
| OpenRouter | 300+模型聚合，含免费模型 | 一个Key访问所有模型 |
| 自定义 | 任何 OpenAI 兼容接口 | 中转站/私有部署 |

### 图片生成
| 供应商 | 模型示例 | 说明 |
|--------|----------|------|
| NVIDIA NIM | SDXL, SD 3 Medium, SD 3 Large | 高质量生成，70+LLM同Key |
| OpenAI | DALL·E 3, GPT Image 1 | 创意图片, 最新模型 |
| SiliconFlow | SDXL, FLUX.1 Schnell/Dev, SD 3.5 Large | 国内高速访问 |
| Stability AI | SDXL, SD 3.5 Large, Stable Image Core | 官方API |
| z-ai-sdk | DALL·E 3 | 内置，无需额外配置 |

### 视频生成
| 供应商 | 模型 | 说明 |
|--------|------|------|
| Seedance 2.0 | Pro / Lite | 字节跳动，支持图生视频，高质量 |
| SiliconFlow | Ali Video 01, Hunyuan Video | 国内视频生成 |
| z-ai-sdk | 内置模型 | 内置视频生成 |
| 火山引擎 | Kling | 高质量视频 |

### 语音合成
| 供应商 | 模型 | 说明 |
|--------|------|------|
| OpenAI TTS | TTS-1, TTS-1 HD, GPT-4o Mini TTS | 高质量语音, 最新模型 |
| NVIDIA Riva | Riva TTS | 支持多语言 |
| Fish Audio | 自定义模型 | 专业语音克隆 |
| z-ai-sdk | 内置TTS | 内置语音合成 |
| 火山引擎 | 国内TTS | 国内语音 |

## 🔧 架构亮点

### 多数据库兼容
- **开发环境**：SQLite 本地文件数据库，零配置
- **生产环境**：Vercel Postgres (PostgreSQL)，自动迁移
- **构建时切换**：`scripts/build.js` 自动切换 Prisma schema
- **自动迁移**：`ensureDatabaseReady()` 在首次API请求时自动创建表

### 多AI供应商统一接口
- **Provider Preset**：预设供应商配置，开箱即用
- **DB + Env 双加载**：优先从数据库读取，环境变量作为回退
- **模型选择器**：可视化网格式模型选择，标签分类（推荐/最新/快速/推理）
- **连接测试**：支持测试特定模型的连通性

### 3阶段12步制作管线
- **剧本阶段**（5步）：原始内容 → AI改写 → 角色场景提取 → 音色分配 → 分镜生成
- **制作阶段**（6步）：角色形象 → 场景图片 → 配音生成 → 镜头图片 → 视频生成 → 视频合成
- **导出阶段**（1步）：拼接导出
- 侧边栏可视化导航：completed=中性灰底+绿色勾号，active=蓝色左边框，pending=默认

### AI Agent架构
- **5大专业Agent**：剧本解析器 / 剧本改写专家 / 角色场景提取器 / 分镜拆解专家 / 音色分配师
- **Skill文件驱动**：每个Agent独立SKILL.md技能指南，运行时动态加载
- **工具调用机制**：Agent可调用read_uploaded_text、save_parsed_script等工具完成结构化输出
- **流式执行**：SSE实时推送Agent工作过程，用户可感知AI推理进度

### 流式生成
- SSE (Server-Sent Events) 流式响应
- 剧本改写、角色提取、分镜生成均支持流式输出
- 用户实时感知生成进度

## 🗺️ 开发迭代计划

基于与 [huobao-drama](https://github.com/chatfire-AI/huobao-drama) 及 [MovieFlow Studio](https://studio.movieflow.ai) 的竞品分析，制定以下迭代计划：

### 版本进度

| 版本 | 名称 | 状态 | 进度 |
|------|------|------|------|
| **v0.1** | 基础框架 | ✅ 已完成 | 100% |
| **v0.2** | AI核心集成 | ✅ 已完成 | 100% |
| **v0.3** | 多模态创作 | ✅ 已完成 | 100% |
| **v0.4** | 多用户体系 | ✅ 已完成 | 100% |
| **v0.5** | 生产工具补齐 | ✅ 已完成 | 100% |
| **v0.6** | 体验打磨与深度优化 | 🚧 开发中 | 45% |
| **v0.7** | 资产库与协作体系 | 📋 规划中 | 0% |
| **v0.8** | 专业创作与发布上线 | 📋 规划中 | 0% |

### v0.5 生产工具补齐 ✅ 已完成

| 优先级 | 功能 | 工期 | 状态 |
|--------|------|------|------|
| P0 | 服务端FFmpeg视频合成（H.264/MP4/SRT字幕） | 2-3周 | ✅ |
| P0 | 宫格图生成与切分系统（3-5x效率提升） | 2周 | ✅ |
| P1 | 11步制作流水线导航 | 1周 | ✅ |
| P1 | 分镜编辑界面增强（17字段精细编辑） | 1-2周 | ✅ |
| P1 | 角色音色试听与手动分配 | 1周 | ✅ |

### v0.6 体验打磨与深度优化 🚧 开发中

基于竞品分析深度对比，继续打磨体验和补齐高级功能：

| 优先级 | 功能 | 工期 | 状态 | 竞品参考 |
|--------|------|------|------|----------|
| P2 | 剧本文件上传+AI解析+一键创建 | 1周 | ✅ 已完成 | — |
| P2 | 集级AI配置锁定（风格一致性） | 3天 | 🚧 开发中 | — |
| P0 | 剧本解析升级（场次/镜头级拆解，角色/场景/道具自动提取入库） | 1-2周 | 🔜 | MovieFlow 百万字3分钟拆解 |
| P2 | 宫格图UI集成到分镜面板 | 3天 | 🔜 | — |
| P2 | 服务端FFmpeg合成UI集成到制作面板 | 3天 | 🔜 | — |
| P2 | 分镜参考图/首尾帧UI增强 | 2天 | 🔜 | — |
| P2 | 本地文件存储优化（替代DataURL） | 1周 | 🔜 | — |
| P3 | 图片/视频生成历史追踪 | 1周 | 🔜 | — |
| P3 | 批量操作进度条优化 | 2天 | 🔜 | — |
| P3 | 生成成本统计（Token/积分消耗可视化） | 3天 | 🔜 | MovieFlow 积分/预算管理 |

### v0.7 资产库与协作体系 📋 规划中

对标 MovieFlow Studio 的资产库体系与多人协作能力，补齐工业化生产核心短板：

| 优先级 | 功能 | 工期 | 状态 | 竞品参考 |
|--------|------|------|------|----------|
| P0 | 全局资产库（角色库/场景库/道具库，跨项目复用与引用） | 2-3周 | 🔜 | MovieFlow 企业级资产库 |
| P0 | 角色一致性保障（资产引用+参考图锁定，消除角色漂移） | 1周 | 🔜 | MovieFlow 角色统一度95% |
| P1 | 角色资产版本管理（多外观快照，一键回溯） | 1周 | 🔜 | MovieFlow 资产沉淀体系 |
| P1 | 小团队协作（项目邀请+成员权限+评论批注） | 2周 | 🔜 | MovieFlow 千人分级协作 |
| P2 | 项目进度看板（管线进度可视化+资产流转追踪） | 1周 | 🔜 | MovieFlow 项目管理后台 |
| P2 | 角色模板市场（用户发布/引用高质量角色模板） | 2-3周 | 🔜 | MovieFlow 数字演员生态 |

### v0.8 专业创作与发布上线 📋 规划中

面向专业创作者的高级创作工具与最终发布：

| 优先级 | 功能 | 工期 | 状态 | 竞品参考 |
|--------|------|------|------|----------|
| P1 | 可视化时间线编辑器（帧级控制+转场+叠加） | 2-3周 | 🔜 | MovieFlow 时间线剪辑器 |
| P1 | 画布协同编辑（类飞书文档，多人实时批注与排序） | 2周 | 🔜 | MovieFlow 画布协同 |
| P2 | 多语言界面支持（i18n） | 1周 | 🔜 | MovieFlow 36种语言 |
| P2 | 系列化项目管理（跨剧IP资产绑定+世界观一致性校验） | 2周 | 🔜 | MovieFlow 系列化内容管理 |
| P3 | 数字演员/角色IP授权体系 | 3周 | 🔜 | MovieFlow 数字演员资产库 |
| P3 | 成片一键发布与分发 | 2周 | 🔜 | — |

### 竞品对比核心优势

| 优势维度 | 说明 |
|----------|------|
| **开源自部署** | MIT开源，数据自主、无锁定，Vercel一键部署 |
| **模型自由度** | 15+供应商、300+模型，含商汤日日新免费模型，用户随时切换 |
| **提示词透明** | 每个分镜可复制图片/视频提示词，无Key也能工作流 |
| **渐进式使用** | 从0成本（复制提示词）到完整AI生产，用户按需投入 |
| **流式Agent** | SSE流式5大Agent执行，实时查看AI工作过程 |
| **用户体系** | NextAuth完整认证 + free/pro/admin角色权限 + 用户自配API Key |
| **TTS多样** | 5家语音供应商，34+音色可选 |
| **Serverless** | Vercel零运维部署，自动DB迁移 |

### 竞品对标差距（vs MovieFlow Studio）

| 差距维度 | 当前状态 | 目标 | 对应版本 |
|----------|----------|------|----------|
| **资产库体系** | 仅单项目内多形象管理 | 全局资产库，跨项目复用，Token降70% | v0.7 |
| **剧本解析深度** | 集级拆解+题材风格 | 场次/镜头级拆解，角色/场景/道具自动提取 | v0.6 |
| **角色一致性** | 手动保证，易漂移 | 资产引用+参考图锁定，统一度95% | v0.7 |
| **时间线剪辑** | 管线步骤式执行，无精确控制 | 可视化时间线，帧级编辑 | v0.8 |
| **多人协作** | 多用户但无团队协作 | 小团队协作+评论+进度看板 | v0.7 |
| **成本管控** | 无统计 | Token消耗可视化+预算统计 | v0.6 |

### 核心功能完成度

| 模块 | 功能 | 状态 |
|------|------|------|
| **AI对话** | 多模型对话 | ✅ |
| **AI对话** | 流式输出 | ✅ |
| **AI对话** | 管理员/免费用户模型隔离 | ✅ |
| **AI对话** | 用户自配API Key | ✅ |
| **剧本生成** | 剧本结构大纲 | ✅ |
| **剧本生成** | 剧本对话生成 | ✅ |
| **剧本生成** | 剧本导出 | ✅ |
| **剧本上传** | 文件上传(txt/md/docx/pdf) | ✅ |
| **剧本上传** | AI智能解析(集数/题材/风格) | ✅ |
| **剧本上传** | 一键创建项目+集数 | ✅ |
| **TTS** | 5家供应商语音合成 | ✅ |
| **TTS** | 音色试听与手动分配 | ✅ |
| **图片** | AI角色形象 | ✅ |
| **图片** | AI场景图 | ✅ |
| **图片** | 宫格图生成与切分 | ✅ |
| **视频** | AI视频生成 | ✅ |
| **视频** | FFmpeg服务端合成 | ✅ |
| **视频** | SRT字幕烧录 | ✅ |
| **流水线** | 3阶段12步制作导航 | ✅ |
| **流水线** | 侧边栏视觉状态指示 | ✅ |
| **流水线** | 分镜17字段精细编辑 | ✅ |
| **设置** | 供应商管理(15+预设) | ✅ |
| **设置** | 连接测试 | ✅ |
| **设置** | 用户API Key | ✅ |
| **多用户** | 认证与权限体系 | ✅ |
| **多用户** | 角色权限(free/pro/admin) | ✅ |
| **剧本上传** | 剧本文件上传+AI解析 | ✅ |
| **剧本解析** | 场次/镜头级拆解+角色/场景/道具自动提取 | 🔜 |
| **配置锁定** | 集级AI配置锁定 | 🚧 |
| **成本统计** | Token/积分消耗可视化 | 🔜 |
| **历史追踪** | 图片/视频生成历史 | 🔜 |
| **全局资产库** | 角色库/场景库/道具库，跨项目复用 | 🔜 |
| **角色一致性** | 资产引用+参考图锁定，消除漂移 | 🔜 |
| **团队协作** | 项目邀请+成员权限+评论批注 | 🔜 |
| **时间线编辑** | 可视化时间线，帧级控制 | 🔜 |
| **画布协同** | 多人实时批注与排序 | 🔜 |
| **角色模板市场** | 用户发布/引用角色模板 | 🔜 |

## 📄 License

MIT

## 🙏 致谢

- [huobao-drama](https://github.com/chatfire-AI/huobao-drama) — 参考设计灵感
- [NVIDIA NIM](https://build.nvidia.com/) — AI 模型服务 (70+ LLM, Image, TTS)
- [Next.js](https://nextjs.org/) — 全栈框架
- [shadcn/ui](https://ui.shadcn.com/) — UI 组件库
- [Vercel](https://vercel.com/) — 部署平台
- [Prisma](https://www.prisma.io/) — 数据库 ORM
