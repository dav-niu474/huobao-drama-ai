# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
