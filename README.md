# 🔥 火爆短剧 AI — AI 驱动的短剧制作平台

> 从剧本到成片，AI 全链路赋能短剧创作。剧本解析、角色塑造、场景生成、分镜制作、配音配乐，一站式完成。

## 项目概览

火爆短剧 AI 是一个面向短剧创作者的全流程 AI 辅助制作平台。平台整合了多种 AI 模型（LLM / 图像 / 视频 / TTS），通过结构化的工作流将剧本文本逐步转化为可视化的分镜素材和最终成片，大幅降低短剧制作门槛。

### 核心价值

- **剧本智能解析**：上传剧本文本，AI 自动拆解角色、场景、道具，生成结构化分镜
- **角色一致性保障**：支持角色形象锁定、多形态管理、视觉指纹提取，确保跨镜头角色一致
- **批量素材生成**：角色肖像、场景概念图、分镜帧画面支持批量生成与多方案选择
- **全链路成本追踪**：每次 AI 调用的 Token 消耗、生成耗时、成本积分全程记录
- **全局资产库**：角色、场景、道具资产跨项目复用，沉淀可视化素材库

---

## 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| 框架 | Next.js 15 (App Router) | React 全栈框架，SSR + API Routes |
| 语言 | TypeScript | 全项目类型安全 |
| UI | shadcn/ui + Radix UI | 高质量可组合组件库 |
| 样式 | Tailwind CSS 4 | 原子化 CSS，响应式设计 |
| 动画 | Framer Motion | 页面切换与交互动画 |
| 数据库 | SQLite (本地) / PostgreSQL (生产) | 通过 Prisma ORM 统一访问 |
| ORM | Prisma | 类型安全的数据库操作，自动迁移 |
| 认证 | NextAuth.js | 邮箱密码登录，角色权限管理 |
| AI 接入 | 多 Provider 架构 | NVIDIA / OpenAI / DeepSeek / SiliconFlow / 商汤 / Volcengine / Fish Audio 等 |
| 部署 | Vercel | Preview 部署 + 生产部署，自动 CI/CD |
| 包管理 | Bun | 高性能 JavaScript 运行时与包管理器 |

---

## 功能模块

### 📝 项目管理
- 创建/删除剧本项目，设置类型（都市/古风/科幻等）与风格
- 项目级默认 AI 模型锁定（LLM / 图像 / 视频 / TTS 可分别锁定）
- 风格模板持久化，所有生成统一风格前缀
- 项目封面自动生成

### 📖 剧本工作台
- **剧本上传**：支持纯文本 / Markdown 剧本上传
- **AI 剧本改写**：基于 Agent 配置的剧本改写，支持流式输出
- **智能提取**：AI 自动从剧本中提取角色、场景、道具
- **分镜拆分**：将剧本内容按镜头拆分为结构化分镜表

### 🎭 角色塑造
- 角色基本信息管理（姓名、性别、年龄、性格、外貌）
- **多形态形象管理**：主形象 + 多套子形态（战斗形态/夜晚形态等），每套形态支持多张图选择与回退
- **形象锁定**：锁定满意的角色形象作为一致性参考
- **视觉指纹**：提取角色视觉特征用于跨镜头一致性提示词
- 音色绑定：为角色绑定 TTS 音色

### 🏔 场景管理
- 场景描述与 AI 提示词自动生成
- **多角度场景图**：支持不同时段（日/夜/黄昏）与镜头角度（远景/中景/特写）的图片生成
- **场景风格锁定**：锁定满意的场景风格作为一致性参考

### 🔧 道具系统
- 道具分类管理（日常/武器/交通/装饰/信物/科技/其他）
- AI 生成道具提示词与图片
- 道具名称项目内唯一约束

### 🎬 分镜制作
- **分镜表视图**：结构化表格展示场景编号、镜头编号、描述、动作、对话、场景类型
- **分镜面板视图**：缩略图网格预览，支持缩放、批量选择、合并预览
- 每个分镜包含：首帧图、尾帧图、视频、TTS 音频、BGM 提示、音效、参考图
- **宫格图生成**：批量生成分镜宫格图，支持异步轮询状态

### 🎬 视频生成与合成
- 支持首帧驱动、首尾帧驱动、纯文本等多种视频生成模式
- 异步任务队列，轮询状态追踪
- 视频合并：将分镜视频按顺序合并为完整集数视频
- 音频合成：TTS 配音 + BGM + 音效混合

### 📊 成本统计
- 按 AI 类别（图片/视频/TTS/LLM）统计消耗
- 按 Provider 和模型细分成本
- 标准化积分体系（1 积分 ≈ 1 张标准图 / 1 段 5s 标准视频）

### 🗂 全局资产库
- 角色 / 场景 / 道具资产跨项目复用
- 从资产库一键应用到当前项目
- 资产标签、分类、使用次数追踪
- 公共资产与私有资产隔离

### ⚙️ 系统设置
- **AI Provider 管理**：全局配置各 AI 服务的 API Key、Base URL、模型
- **用户级 Provider 覆盖**：用户可配置自己的 API Key，优先级高于全局配置
- **Agent 配置**：自定义各 Agent 的系统提示词、模型、温度、最大 Token
- 用户角色管理（free / pro / admin）

---

## API 路由一览

### 剧本项目
| 路由 | 方法 | 说明 |
|------|------|------|
| `/api/dramas` | GET / POST | 列表 / 创建项目 |
| `/api/dramas/[id]` | GET / PATCH / DELETE | 详情 / 更新 / 删除项目 |
| `/api/dramas/create-from-script` | POST | 从剧本创建项目 |
| `/api/dramas/[id]/characters` | GET / POST | 角色列表 / 创建 |
| `/api/dramas/[id]/scenes` | GET / POST | 场景列表 / 创建 |
| `/api/dramas/[id]/props` | GET / POST | 道具列表 / 创建 |
| `/api/dramas/[id]/episodes` | GET / POST | 集数列表 / 创建 |
| `/api/dramas/[id]/bulk-lock` | POST | 批量锁定 AI 模型配置 |
| `/api/dramas/[id]/cost-stats` | GET | 成本统计 |

### AI 能力
| 路由 | 方法 | 说明 |
|------|------|------|
| `/api/ai/extract` | POST | AI 提取角色/场景/道具 |
| `/api/ai/extract-stream` | POST | 流式提取 |
| `/api/ai/rewrite-script` | POST | 剧本改写 |
| `/api/ai/generate-image` | POST | 通用图片生成 |
| `/api/ai/generate-character-image` | POST | 角色肖像生成 |
| `/api/ai/generate-character-sheet` | POST | 角色多角度图 |
| `/api/ai/generate-scene-image` | POST | 场景图生成 |
| `/api/ai/generate-storyboard` | POST | 分镜生成 |
| `/api/ai/generate-storyboard-stream` | POST | 流式分镜生成 |
| `/api/ai/generate-video` | POST | 视频生成 |
| `/api/ai/generate-tts` | POST | TTS 配音生成 |
| `/api/ai/voice-sample` | GET | 音色试听 |
| `/api/ai/voices` | GET | 可用音色列表 |
| `/api/ai/lock-character-style` | POST | 锁定角色风格 |
| `/api/ai/lock-scene-style` | POST | 锁定场景风格 |
| `/api/ai/poll-status` | GET | 轮询异步任务状态 |
| `/api/ai/test-connection` | POST | 测试 AI 连接 |
| `/api/ai/active-models` | GET | 当前活跃模型列表 |
| `/api/ai/grid/generate` | POST | 宫格图生成 |
| `/api/ai/grid/split` | POST | 宫格图拆分 |
| `/api/ai/grid/status` | GET | 宫格图状态 |

### 资产库
| 路由 | 方法 | 说明 |
|------|------|------|
| `/api/assets` | GET / POST | 资产列表 / 创建 |
| `/api/assets/[id]` | GET / PATCH / DELETE | 资产详情 / 更新 / 删除 |
| `/api/assets/[id]/apply` | POST | 应用资产到项目 |

### 其他
| 路由 | 方法 | 说明 |
|------|------|------|
| `/api/auth/*` | - | NextAuth 认证 |
| `/api/settings` | GET / PATCH | 全局设置 |
| `/api/settings/user-provider` | GET / POST | 用户级 Provider |
| `/api/agent/[type]` | GET / PATCH | Agent 配置 |
| `/api/agent/[type]/stream` | POST | Agent 流式执行 |
| `/api/upload` | POST | 通用文件上传 |
| `/api/upload/script` | POST | 剧本文件上传 |
| `/api/files/[...path]` | GET | 文件访问 |
| `/api/health` | GET | 健康检查 |

---

## 数据模型

```
User ──┬── Drama ──┬── Episode ──── Storyboard
       │           ├── Character ── CharacterAppearance
       │           ├── Scene ────── SceneImage
       │           ├── Prop
       │           ├── GenerationCost
       │           ├── ImageGeneration
       │           ├── VideoGeneration
       │           └── VideoMerge
       ├── UserProvider
       └── Asset ──┬── Character (引用)
                   ├── Scene (引用)
                   └── Prop (引用)

AiProvider (全局 AI 配置)
AgentConfig (Agent 提示词与参数)
```

---

## 快速开始

### 环境要求

- Node.js 18+
- Bun（推荐）或 npm
- SQLite（本地开发，无需额外安装）

### 安装步骤

```bash
# 1. 克隆仓库
git clone https://github.com/dav-niu474/huobao-drama-ai.git
cd huobao-drama-ai

# 2. 安装依赖
bun install

# 3. 配置环境变量
cp .env.example .env
# 编辑 .env 填入必要的 API Key

# 4. 初始化数据库
bun run db:push

# 5. 启动开发服务器
bun run dev
```

访问 http://localhost:3000 即可使用。

### 环境变量说明

| 变量 | 必填 | 说明 |
|------|------|------|
| `DATABASE_URL` | 是 | SQLite 文件路径（本地）或 PostgreSQL URL（生产） |
| `NEXTAUTH_SECRET` | 是 | NextAuth 签名密钥 |
| `NEXTAUTH_URL` | 是 | 应用 URL |
| `NVIDIA_API_KEY` | 否 | NVIDIA NIM API（LLM + 图像） |
| `OPENAI_API_KEY` | 否 | OpenAI API（LLM + 图像 + TTS） |
| `DEEPSEEK_API_KEY` | 否 | DeepSeek API（LLM） |
| `SILICONFLOW_API_KEY` | 否 | SiliconFlow API（LLM + 图像 + 视频） |
| `SENSENOVA_KEY` | 否 | 商汤日日新 API（LLM） |
| `STABILITY_API_KEY` | 否 | Stability AI（图像） |
| `VOLCENGINE_API_KEY` | 否 | 火山引擎 / 可灵（视频 + TTS） |
| `FISH_AUDIO_API_KEY` | 否 | Fish Audio（TTS） |

> 也可以启动后在 **设置页面** 中配置 API Key，数据库配置优先级高于环境变量。

---

## 项目结构

```
huobao-drama-ai/
├── prisma/
│   └── schema.prisma          # 数据库模型定义
├── src/
│   ├── app/
│   │   ├── api/               # API Routes（见上方路由表）
│   │   ├── globals.css        # 全局样式
│   │   ├── layout.tsx         # 根布局
│   │   └── page.tsx           # 主页面（View Router）
│   ├── components/
│   │   ├── ui/                # shadcn/ui 基础组件
│   │   ├── episode/           # 剧集工作台子面板
│   │   │   ├── script-panel.tsx       # 剧本面板
│   │   │   ├── extract-panel.tsx      # 提取面板
│   │   │   ├── storyboard-panel.tsx   # 分镜面板
│   │   │   ├── shot-frames-panel.tsx  # 分镜帧画面
│   │   │   ├── char-images-panel.tsx  # 角色形象面板
│   │   │   ├── scene-images-panel.tsx # 场景图面板
│   │   │   ├── video-panel.tsx        # 视频生成面板
│   │   │   ├── voice-panel.tsx        # 音色面板
│   │   │   ├── dubbing-panel.tsx      # 配音面板
│   │   │   ├── compose-panel.tsx      # 合成面板
│   │   │   ├── production-panel.tsx   # 制作面板
│   │   │   ├── cost-stats-panel.tsx   # 成本统计面板
│   │   │   └── grid-generate-dialog.tsx # 宫格图生成
│   │   ├── agent-execution-panel.tsx  # Agent 执行面板
│   │   ├── asset-library-view.tsx     # 全局资产库
│   │   ├── auth-view.tsx              # 登录/注册
│   │   ├── episode-workspace.tsx      # 剧集工作台
│   │   ├── model-selector.tsx         # 模型选择器
│   │   ├── project-detail.tsx         # 项目详情
│   │   ├── project-list.tsx           # 项目列表
│   │   ├── script-upload-dialog.tsx   # 剧本上传
│   │   ├── settings-view.tsx          # 系统设置
│   │   └── user-menu.tsx              # 用户菜单
│   ├── hooks/                 # 自定义 React Hooks
│   └── lib/
│       └── store.ts           # Zustand 全局状态管理
├── .env.example               # 环境变量模板
├── package.json
└── README.md
```

---

## 版本历史

| 版本 | PR | 说明 |
|------|----|------|
| v0.2 | - | 基础项目骨架搭建 |
| v0.3 | #20 | 剧本解析升级 + 配置锁定 + 宫格图 UI + 成本统计 |
| v0.4 | #21 | Prisma 事务超时修复 |
| v0.5 | #22 | 上传体验优化 + 角色形象提示词 + 音色库人工配置 |
| v0.6 | #23 | 道具模型 + AI 提取 + 上传路由修复 |
| v0.7 | #25, #26 | 文件存储优化 + 全局资产库 + parsedData 修复 + AI 解析手动触发 + 删除超时修复 + 白屏修复 |

---

## 部署

项目通过 Vercel 自动部署：

- **Preview 部署**：每个 PR 自动创建 Preview 环境，用于测试验证
- **生产部署**：main 分支合并后自动部署到生产环境
- **数据库**：Vercel Postgres（生产）/ SQLite（本地开发）

---

## 开发规范

### Git 工作流（铁律）

```
功能分支 → GitHub PR → Vercel Preview → 自测 → 合入 main
```

1. 每个功能/修复创建独立分支 `feat/xxx` 或 `fix/xxx`
2. 推送后创建 GitHub Pull Request
3. Vercel 自动部署 Preview 环境
4. 自测通过后通过 GitHub PR **Squash Merge** 合入 main
5. **禁止**直接 `git merge` 或 `git push` 到 main 分支

### 代码规范

- TypeScript 严格模式
- ESLint 检查
- 组件化开发，关注点分离
- API Route 统一错误处理

---

## License

Private — All Rights Reserved
