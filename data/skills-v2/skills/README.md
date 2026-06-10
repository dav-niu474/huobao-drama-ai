# Agents Studio · Skills

> 一套 14 个 Markdown SKILL.md，把"小说 → 短剧成片"的全流程拆成可并行调度的 Subagent。
>
> **现在就能用**：把整个 `skills/` 目录拷进任意支持 Skill 协议的 Agent Runtime（Claude Agent SDK / Cursor / Cline / Kiro），不需要后端就能跑通 70% 的流程。

---

## 14 个 Skill 一览

```
M1 · 内容理解阶段（不可跳过）
─────────────────────────────────────────────────────
00 orchestrator         — 编排器：状态机检测 + dispatch
01 novel-analyst        — 全本理解，产出 analysis/novel.json
02 show-planner         — 7 参数协商，产出 production_plan.yaml
03 script-writer        — 一次性出全集剧本 + 章节映射

M2 · 资产准备阶段
─────────────────────────────────────────────────────
04 asset-extractor      — 全集一次性资产提取
05 art-director         — 画风定调
06 character-designer   — 角色/场景/道具/线索定妆（按 weight tier 强制 + 主角抽卡）

M3 · 单集制作循环（按集 N 重复）
─────────────────────────────────────────────────────
07 storyboard-breaker   — 拆分镜（标记 mergeable_with_next + intensity）
08a keyframe-planner    — Pre-flight 方案审阅（每 shot 选 mode + batch）
08 keyframe-generator   — 生成关键帧（候选 + 用户挑选）
09 video-generator      — 视频片段（候选 + 用户挑选）
10 voice-assigner       — 音色分配（仅首次）
11 tts-synthesizer      — TTS 配音
12 video-composer       — Logo + Recap + 拼接 + Tease + 字幕烧录
```

---

## 状态机：Orchestrator 怎么调度它们

详见 [`00-orchestrator/SKILL.md`](./00-orchestrator/SKILL.md)。简版：

| 项目状态 | → Dispatch |
|---|---|
| 源文件已上传 + 全本未分析 | **01-novel-analyst** |
| 全本分析完成 + plan 未锁定 | **02-show-planner** |
| plan 锁定 + 全集剧本未生成 | **03-script-writer** |
| 全集剧本就位 + 资产未提取 | **04-asset-extractor** |
| 资产已提取 + 画风未确定 | **05-art-director** |
| 画风已确定 + 资产视觉缺失 | **06-character-designer** |
| 第 N 集剧本就位 + 分镜未拆 | **07-storyboard-breaker** with episode_id=N |
| 第 N 集分镜就位 + 关键帧方案未审 | **08a-keyframe-planner** with episode_id=N |
| 第 N 集方案 locked + 关键帧缺失 | **08-keyframe-generator** with episode_id=N |
| 第 N 集关键帧候选生成 + 用户未挑（batch>1） | **等用户挑选**（不 dispatch） |
| 第 N 集关键帧 locked + 视频缺失 | **09-video-generator** with episode_id=N |
| 第 N 集视频候选生成 + 用户未挑（batch>1） | **等用户挑选**（不 dispatch） |
| 角色就位 + 音色未分配 | **10-voice-assigner** |
| 第 N 集音色已分配 + 配音缺失 | **11-tts-synthesizer** with episode_id=N |
| 第 N 集所有 shot.readiness == shot_ready | **12-video-composer** with episode_id=N |

---

## 关键专业流程（短剧行业认知）

> 以下每条都是 **从专业短剧制作流程倒推** 的设计判断，不是凭空设计的。

### 1) 全本理解先于一切
任何短剧立项前，制片必须把原著吃透：核心角色、主线节奏、爆款元素、付费节点候选位置、AI 生成不友好的场面。这是 **01-novel-analyst** 的工作。

### 2) 商业参数必须前置协商
集数、单集时长、横竖屏、付费集位置、目标平台、预算 —— 这 7 项参数 **决定下游每一步**：横竖屏决定所有图像/视频尺寸；集数决定剧本结构；付费集决定第 8 集的悬念强度。**不能让用户在生成完之后才发现搞错了**。这是 **02-show-planner** 的工作。

### 3) 一次性出全集剧本（不要按集走）
**最关键的反直觉判断**：
- ❌ 错误做法：先切章 → 改一集剧本 → 提资产 → 再下一集 → 再提资产
- ✅ 正确做法：先出 80 集大纲 → 用户审阅 → 一次性扩成 80 集完整剧本 → 一次性抽资产

原因：节奏曲线、付费集卡点、角色弧、CP 互动节奏 这些是 **跨集级** 设计，不能逐集做。

### 4) 资产从全集一次抽
04 不再分 `peek_chapters/split_chapters/extract_assets` 三种 mode。章节切分已在 02+03 完成。04 的唯一职责是：**从全套剧本一次性扫描，建立项目级资产库**，然后反向标注每集用到哪些资产。

### 5) 单集制作循环
内容关卡过完之后，才进入"按集制作"循环。这部分可以高度并行，特别是付费集可优先制作。

---

## Skill 编写约定

每个 Skill 目录约定为：

```
<skill-id>/
  SKILL.md           # 必需，YAML frontmatter + 指南内容
  scripts/           # 可选，可被 Skill 直接调用的脚本
  reference/         # 可选，被 SKILL.md 引用的子模板
  examples/          # 可选，输入输出示例
```

**SKILL.md 头部必须包含**：

```yaml
---
name: <skill-id>
description: <一句话+触发词，给上层 LLM 做语义路由>
agent_type: orchestrator | subagent | utility
content_modes: [drama, narration]   # 可选，限定模式
required_tools:                      # 必需的 MCP/Tool
  - tool_name_1
  - tool_name_2
---
```

> 详见 [`docs/ARCHITECTURE.md` § 4](../docs/ARCHITECTURE.md#4-skill-体系)。

---

## 工具（Tool）实现说明

本仓库的 Skill **只描述"做什么"**，不内嵌"怎么做"。具体的 MCP / Tool 实现由后端接管。当前阶段的 4 种使用方式：

1. **Mock 模式**：Agent 用占位输出（`# TODO: implement read_novel_analysis`），快速验证流程编排
2. **Local Tool**：在 Cursor / Cline / Kiro 中把 tool 实现为本地 Python/TS 函数
3. **MCP Server**：M1+ 阶段提供 `studio-mcp-server`，按 [`packages/asset-spec/`](../packages/asset-spec/) 实现所有 tool
4. **真后端调用**：M2 阶段 FastAPI server 暴露 `/api/v1/tools/*` 路由

---

## 试用

```bash
# 在任何支持 Skill 的 Agent 中
# 示例：Cursor / Claude Code / Kiro

# 1. 把整个 skills/ 目录指向 .claude/skills/ 或等价位置
ln -s skills .claude/skills

# 2. 跟 Agent 对话
> 我有一篇 35 万字仙侠小说，想做短剧

# Orchestrator 会按 13 步状态机：
# - 检测到无 analysis → dispatch 01-novel-analyst
# - 完成后让你 02 协商 7 参数
# - 锁定 plan 后 03 出全集剧本（先大纲再扩写）
# - 04 抽资产、05 定画风、06 定妆
# - 按集走 07→08→09→11→12 循环
# - 在每个关卡向你确认
```

---

## 与上一版的关键变化

> 如果你看过早期版本（11 个 Skill 的 v0），重要变化：

| 变化 | 原因 |
|---|---|
| 新增 **01-novel-analyst** | 任何专业短剧立项前必须做全本理解，之前缺这一步 |
| 新增 **02-show-planner** | 集数 / 横竖屏 / paywall 等 7 项商业参数必须前置协商，不能让 03 替用户决定 |
| **03-script-writer** 改为一次性出全集 | 节奏曲线、付费卡点是跨集级设计，不能逐集做 |
| **04-asset-extractor** 删除 peek/split mode | 章节切分由 02+03 完成，04 专注资产 |
| 下游 5-12 编号顺延 +2 | 给 01/02 让位 |
| 状态机增加"内容关卡 / 资产关卡 / 单集循环"三段式 | 与短剧行业实际工作流对齐 |
