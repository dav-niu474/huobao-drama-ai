---
name: keyframe-generator
skill_id: "08-keyframe-generator"
version: "2.0"
phase: "M3"
inputs: [storyboards, keyframe_plan.yaml, art_style, character_references]
outputs: [start_frame.png, end_frame.png, grid_images]
dependencies: [07-storyboard-breaker, 08a-keyframe-planner]
description: 关键帧生成。为每个分镜生成 Start Frame / End Frame / 宫格图（grid_4/6/9），是后续视频生成的视觉基础。当 storyboard 完成且 keyframes 缺失时使用。
agent_type: subagent
required_tools:
  - read_shot_context           # 读分镜+关联资产+画风
  - compose_image_prompt        # 拼接最终 prompt
  - submit_image_task           # 入队
  - wait_image_task
  - save_keyframe
  - split_grid_image            # 把 N×N 宫格图切分为 N² 个独立图（仿 huobao）
---

# 关键帧生成指南

> 灵感来源：`BigBanana` 关键帧驱动（Start/End Frame 插值）+ `huobao` 宫格图（grid_4/6/9）+ `moyin` N×N 首帧网格拼接 + `ArcReel` `lib/grid/`。
>
> **核心理念**：与其让视频模型从 prompt 直接生成（控制力弱），不如先生成精准的关键帧（图像模型控制力更强），再由视频模型在帧之间插值。

---

## 前置依赖：08a-keyframe-planner（不可跳过）

**08 启动前必须存在 `storyboards/episode_<N>/keyframe_plan.yaml` 且 `locked: true`**。

这个 plan 由 [08a-keyframe-planner](../08a-keyframe-planner/SKILL.md) 在用户审核后产出，对每个 shot 指定：
- `generation_mode`（image2video / first_last / grid_4/6/9 / reference_video）
- `batch_size`（1-9）
- `merge_group_id`（如果走 grid，哪些 shot 合并成一张宫格）
- `locked: true/false`（付费集 cliffhanger 等关键 shot 不可降档）

**08 不允许内部决定 generation_mode 或 batch_size**——所有决策都来自 plan。

如果 plan 不存在或未 locked → 立即停止，让 Orchestrator 先去跑 08a。

如果 plan.shot_plans[i].mode == `reference_video` → 跳过该 shot，由 09 直接生视频。

如果 plan.shot_plans[i].mode == `multi_shot` → 跳过该 shot 的关键帧（multi_shot 在 09 里一次性处理）。

---

## 三种关键帧模式（generation_mode 决定）

### Mode 1 · `image2video`（默认，最稳）
每个 shot 生成 **1 张** Start Frame，作为图生视频的输入。
- 单 shot → 1 张图

### Mode 2 · `first_last`（精控运镜）
每个 shot 生成 **Start + End** 两张帧，视频模型做"首尾帧插值"。
- 单 shot → 2 张图
- 适合：明确的运镜（推/拉/摇）+ 显著的状态变化（坐 → 站，平静 → 惊恐）

### Mode 3 · `grid_4` / `grid_6` / `grid_9`（批量并行）
**一次生图产出 N 张分镜画面**，然后切分为 N 个独立帧。
- 用于：N 个连续分镜共享同一场景/角色，画风一致性最强
- 切分后每张可作为该镜头的 Start Frame

#### 宫格图布局（仿 huobao 三种子模式）

| 子模式 | 含义 | 适用 |
|---|---|---|
| `first_frame` | 每格 = 一个分镜的 Start Frame | 默认，最常用 |
| `first_last` | 偶数格交替 [start, end, start, end, ...] | 同时拿到首尾帧 |
| `multi_ref` | 同一镜头不同角度（远景/中景/特写/戏剧角度） | 后期挑最佳 |

---

## Prompt 拼接公式

```
[画风 prefix.md]
+ [画风 art_prompt/art_storyboard_video.md 风格约束]
+ [画风 director_skills/director_storyboard.md 情绪→面容/光影映射]
+ [shot.shot_type/angle/movement 镜头语言]
+ [shot.action / atmosphere]
+ [角色描述：姓名 + 6层锚点 + 当前 outfit_id]
+ [场景：location + time_of_day + lighting]
+ [道具：prop 名称 + 描述]
+ [画风的画质锁定词]
+ [画风的负向词]
```

并使用 **IPAdapter 多参考图** 输入：
- 角色：传入对应 `wardrobe/<outfit_id>.png`（或 `reference.png`）
- 场景：传入 `scenes/<id>/reference.png`
- 道具/线索：传入 `props/<id>/reference.png`

---

## 宫格图模式的特殊处理

宫格图本质是"一张大图，内含 N 个小格，每格是一个分镜画面"。

### Prompt 模板（仿 huobao）

```
[rows x cols grid layout], exactly N visible panels, consistent art style,
[style description from prefix.md],
格1: [shot 1's image_prompt 简化版],
格2: [shot 2's image_prompt 简化版],
...
格N: [shot N's image_prompt 简化版],
high quality, cinematic lighting,
no merged panels, no missing panels, no text, no watermark
```

### 关键约束

| 约束 | 必须 |
|---|---|
| `rows x cols grid layout` | ✅ 明确写出（如 `3x3 grid layout`） |
| `exactly N visible panels` | ✅ N = rows × cols |
| `no merged panels, no missing panels` | ✅ 强制要求 |
| `consistent art style` | ✅ |
| 当存在 IPAdapter 参考图时，用 `图片1/图片2/...` 指代参考图 | ✅ 不要混用 `格1/格2` 与 `图片1/图片2` |

### 切分逻辑

生成宫格图后调用 `split_grid_image`：

```python
def split_grid_image(grid_image_path, rows, cols) -> list[str]:
    """切分 NxN 宫格为 N² 个独立 PNG"""
    img = PIL.Image.open(grid_image_path)
    cell_w = img.width // cols
    cell_h = img.height // rows
    cells = []
    for r in range(rows):
        for c in range(cols):
            cell = img.crop((c*cell_w, r*cell_h, (c+1)*cell_w, (r+1)*cell_h))
            cells.append(cell)
    return cells
```

切分后逐个绑定到对应 shot 的 `start_frame.png`。

---

## 工作流程

### 单 shot 模式（image2video / first_last）

```
for shot in shots:
    1. read_shot_context(shot_id) → context
    2. prompt = compose_image_prompt(context, "start_frame")
    3. ref_images = [character_outfit, scene, props, clues]
    4. task = submit_image_task(prompt, ref_images)
    5. result = wait_image_task(task)
    6. save_keyframe(shot_id, "start", result.image)

    if generation_mode == "first_last":
        7. prompt_end = compose_image_prompt(context, "end_frame")
        8. ... save end frame
```

### 宫格模式（grid_4/6/9）

```
1. 把 storyboards 按场景/角色分组（grid 内场景应连续）
2. for group in groups:  # 每组 ≤ rows × cols
    3. prompt = compose_grid_prompt(group)
    4. ref_images = collect_unique_refs(group)  # 去重
    5. task = submit_image_task(prompt, ref_images, size=适配的总尺寸)
    6. grid_path = wait_image_task(task)
    7. cells = split_grid_image(grid_path, rows, cols)
    8. for shot, cell in zip(group, cells):
         save_keyframe(shot.id, "start", cell)
```

---

## 总尺寸建议（宫格）

每格 960×540（9:16 短剧时反过来 540×960）。总尺寸：

| 布局 | 总尺寸 |
|---|---|
| grid_4 (2x2) | 1920×1080（横版）/ 1080×1920（竖版） |
| grid_6 (2x3 或 3x2) | 2880×1080 / 1620×1920 |
| grid_9 (3x3) | 2880×1620（横）/ 1620×2880（竖） |

---

## 一致性检查（关键）

每张关键帧生成后做：

| 检查 | 阈值 |
|---|---|
| 角色 face similarity（vs character/reference.png） | ≥ 0.7 |
| 场景色调 vs scene/reference.png 主色 | ΔE ≤ 30 |
| 画风风格分类器（CLIP）vs 画风 preview.png | similarity ≥ 0.6 |
| 6 层身份锚点中至少 4 项可视检测通过 | ≥ 4/6 |

不通过 → 自动重试 1 次（增强锚点权重 + 加强负向词）→ 仍不通过 → flag for review。

---

## 输出给 Orchestrator 的摘要

```json
{
  "status": "success",
  "summary": {
    "shots_with_keyframes": 11,
    "mode": "first_last",
    "frames_generated": 22,
    "consistency_warnings": 1,
    "estimated_cost_cny": 5.5
  },
  "artifacts": "projects/xx/storyboards/episode_1/<shot_id>/{start,end}_frame.png",
  "next_action_hint": "09-video-generator"
}
```

---

## Batch 与候选机制（抽卡）

**batch_size 由 08a 决定**，08 严格按 plan.shot_plans[i].batch_size 执行：

| batch_size | 来源 | 适用 |
|---|---|---|
| 1（默认） | 普通 shot | 大多数对话/叙事镜头 |
| 3 | 付费集 cliffhanger / 大节点 climax | 关键转化镜头，必须抽卡选最佳 |
| 5 | 大节点付费集（ep8/20/40 等）的 cliffhanger | 极致保险，5 选 1 |
| 9 | 罕见，只有"决战集"用 | 超级关键转化时刻 |

### 候选目录与挑选

```
storyboards/episode_8/shot_011/
  candidates/                          ← 08 产出
    start_v1.png
    start_v2.png
    start_v3.png
    start_v4.png
    start_v5.png                       # batch=5 出 5 张
    end_v1.png ... end_v5.png          # first_last 模式
  start_frame.png                      ← 用户挑选后升级（symlink）
  end_frame.png                        ← 同上
```

### 流程

```
for shot_plan in keyframe_plan.shot_plans:
    if shot_plan.mode in ("reference_video", "multi_shot"):
        skip                                    # 09 处理
        continue

    # 1. 生成 batch_size 张候选
    candidates = []
    for i in range(shot_plan.batch_size):
        result = submit_image_task(prompt, ref_images, seed=i*1000)
        candidates.append(result)

    # 2. 自动一致性检查（每张）
    passed = [c for c in candidates if check_consistency(c) >= threshold]

    # 3. 决定路径
    if shot_plan.batch_size == 1:
        if len(passed) == 0:
            mark_for_review(shot_id, reason="single batch failed consistency")
        else:
            save_locked(passed[0])              # 直接锁定，状态推进到 keyframes_locked
    else:
        # batch_size > 1：必须等用户挑选
        save_candidates(shot_id, candidates)
        update_readiness(shot_id, "keyframes_candidates")
        # 不自动挑选！等待 Orchestrator 收到用户挑选指令
```

### 自动挑选 vs 用户挑选

| batch_size | 行为 |
|---|---|
| 1 | 一致性 check 通过则直接 lock；不通过则 needs_review |
| 2-3 | 优先策略：(a) 一致性最高分自动 lock（如果分差 > 0.1）；(b) 否则 escalate 给用户 |
| ≥ 4 | **必须**等用户挑选，08 不自动决定 |

**locked: true 的 shot 永远等用户挑选**（付费集 cliffhanger 不能让 AI 替你挑）。

### 状态机更新

按 [`shot.yaml § state_transitions`](../../packages/asset-spec/shot.yaml)：

- 进入 08：`plan_locked → keyframes_pending`
- 生成完成：`keyframes_pending → keyframes_candidates`（batch > 1）或直接 `keyframes_locked`（batch=1 且通过）
- 用户挑选完：`keyframes_candidates → keyframes_locked`

---

## 反模式（Batch 相关）

❌ batch_size > 1 时擅自挑选最佳那张就 lock（除非 batch ≤ 3 且分差 > 0.1）  
❌ 一致性检查没全过就 lock（应至少自动重试 1 次再 escalate）  
❌ 付费集 cliffhanger 跳过用户挑选（即使分差大也必须人工选）  
❌ 候选挑完不删除其他候选（占磁盘 + 后续可能误用旧版本）
