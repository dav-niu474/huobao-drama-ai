---
name: keyframe-planner
skill_id: "08a-keyframe-planner"
version: "2.0"
phase: "M3"
inputs: [storyboards, production_plan, assets_index]
outputs: [keyframe_plan.yaml]
dependencies: [07-storyboard-breaker]
description: 关键帧 Pre-flight 方案审阅。在 08-keyframe-generator 真正烧钱生图前，先为每个 shot 推荐 generation_mode（image2video / first_last / grid / reference_video / multi_shot）+ batch_size，让用户逐镜头审阅整集方案。当 storyboards/episode_<N> 就绪而 keyframe_plan.json 缺失时调用。
agent_type: subagent
content_modes: [drama, narration]
required_tools:
  - read_storyboard               # 读单集分镜（07 产出）
  - read_production_plan          # 读 plan.budget_constraints / paywall / asset_quality_tier
  - read_assets_index             # 读角色/场景/道具是否齐全（决定可用参考图）
  - estimate_per_shot_cost        # 各 mode × 模型 × tier 的单 shot 成本表
  - propose_keyframe_plan         # LLM 推理：每 shot 该走哪种 mode + batch
  - confirm_plan_with_user        # 用户审阅整集方案（必须）
  - save_keyframe_plan            # 落盘 storyboards/episode_<N>/keyframe_plan.yaml
---

# 关键帧 Pre-flight 方案审阅 / Keyframe Planner

> 灵感来源：`ArcReel` 的"Pre-flight 全自动方案审阅"——LLM 给出方案，用户逐镜头确认走九宫格还是首尾帧。
>
> **核心理念**：08-keyframe-generator 是流水线里**第二贵**的步骤（仅次于 09-video-generator）。每个 shot 的 generation_mode 选择决定其成本可以差 **5-10 倍**。让 LLM 先列方案、用户审完再花钱，是行业通行做法。

---

## 你解决什么问题

**反例**（v1 没有 08a 的情况）：
- 80 集 × 11 shot/集 = 880 shot
- 全部走 `first_last` × Seedance 5.0 × ¥0.5/张 = **¥880**
- 但其实 60% shot 完全可以走 `grid_9`（一张图出 9 帧）：成本降至 ~¥150
- 没有 08a 用户根本不知道这个选择存在 → 损失 ¥730

**08a 做的事**：在花钱前给用户看一张表，让用户**整集逐 shot 审一次**后才进入 08。

---

## 五种 generation_mode 决策规则

按"控制力 × 成本 × 适用场景"排表：

| Mode | 控制力 | 单 shot 成本（基线）| 适用 |
|---|---|---|---|
| `image2video` | 中 | ¥0.3（1 张关键帧） | 默认；通用对话/叙事镜头 |
| `first_last` | 高 | ¥0.5（2 张关键帧） | 明确状态变化（坐→站、平静→惊恐）；显著运镜（推/拉） |
| `grid_4` | 中-高 | ¥0.1/shot（4 shot 共一张宫格图） | 同 scene 同角色连续 4 个分镜 |
| `grid_6` | 中 | ¥0.07/shot（6 shot 共一张） | 同 scene 同角色连续 6 个分镜，节奏快 |
| `grid_9` | 中 | ¥0.05/shot（9 shot 共一张） | 同 scene 同角色长对话/铺陈段 |
| `reference_video` | 中-高 | ¥0/帧（不生帧，直接生视频） | 角色/场景资产够用，可跳过分帧 |
| `multi_shot` | 高 | 与 09 合并计算 | 2-4 个相邻 shot 合并为长镜头（仅 Seedance 2.0） |

### 决策规则（按优先级）

1. **付费集（is_paywall_hook=true）的关键 shot**：强制 `first_last` + `batch_size ≥ 3`（不省钱）
   - 该集的 climax shot
   - cliffhanger shot（最后一个 shot）
2. **大节点集（is_milestone_hook=true）**：同上
3. **同 scene + 同角色 + ≥ 4 个连续分镜 + 总时长 ≤ 60s**：自动合并为 `grid_4/6/9`
4. **同 scene + 同角色 + 2-4 连续分镜 + 总时长 ≤ 15s + 同动作弧**：标记 `multi_shot` 候选（由 07 的 `mergeable_with_next` 标记）
5. **明确运镜（push_in / pull_out / pan）**：必走 `first_last`
6. **明确状态变化（emotion 字段从 A 到 B）**：必走 `first_last`
7. **资产已就位但无关键帧**：走 `reference_video`（跳过 08，直接进 09）
8. **以上都不匹配**：默认 `image2video`


---

## 工作流（4 步）

### Step 1 · 加载与检查

```python
storyboard = read_storyboard(episode_id)
plan = read_production_plan()
assets = read_assets_index()

# 前置依赖检查
if not all_assets_ready_for(storyboard, assets):
    return "ERROR: 06-character-designer 未完成，无法规划"
```

### Step 2 · 自动初稿（LLM 推理）

```python
draft = propose_keyframe_plan(
    storyboard=storyboard,
    plan_constraints={
        "budget_remaining": plan.budget_constraints.max_total_cny - already_spent,
        "asset_quality_tier": plan.budget_constraints.asset_quality_tier,
        "is_paywall_episode": episode.is_paywall_hook,
        "is_milestone_episode": episode.is_milestone_hook,
    },
    decision_rules=DECISION_RULES,
)
```

### Step 3 · 与用户对照（必须）

输出**整集方案表**让用户逐 shot 审：

```yaml
# storyboards/episode_8/keyframe_plan.draft.yaml
episode_id: 8
is_paywall_hook: true
total_shots: 11
estimated_cost_cny: 4.8
estimated_cost_breakdown:
  image2video: 1.5      # 5 shots × 0.3
  first_last: 2.5       # 1 shot × 2.5 (paywall cliffhanger × batch=5)
  grid_4: 0.4           # 4 shots × 0.1 (合并组 1)
  reference_video: 0    # 1 shot 跳过 08

shot_plans:
  - shot_id: ep8_shot_001
    mode: image2video
    batch_size: 1
    rationale: "对话开场，标准镜头"
    cost_cny: 0.3
    alternatives:
      - { mode: grid_4, with_shots: [002, 003, 004], cost_cny: 0.1, rationale: "若与后 3 镜合并可省 0.6" }

  - shot_id: ep8_shot_007
    mode: first_last
    batch_size: 1
    rationale: "动作转折：苏婉柔从微笑到震怒"
    cost_cny: 0.5

  - shot_id: ep8_shot_011        # 付费集尾帧
    mode: first_last
    batch_size: 5                # ← 强制抽卡，付费集不省
    rationale: "PAYWALL CLIFFHANGER：翻天反转的关键转化镜头，强制 batch=5 取最佳"
    cost_cny: 2.5                # 5 × 0.5
    locked: true                 # 用户不可降档
```

调用 `confirm_plan_with_user`，让用户：
- ✅ 接受推荐
- 修改某 shot 的 mode（如把 first_last 降到 image2video）
- 修改某 shot 的 batch_size
- 添加合并（把 [001,002,003,004] 合并为 grid_4）
- 拆分合并（撤销自动合并）

但 **`locked: true` 的 shot 不允许降档**（付费集 cliffhanger）。

### Step 4 · 落盘

```yaml
# storyboards/episode_8/keyframe_plan.yaml (locked)
locked: true
locked_at: 2026-05-24T11:30:00Z
based_on_storyboard_hash: sha256:...
... (用户最终确认的方案)
```

---

## 与下游 08 的契约

08-keyframe-generator 启动时**必须**：
1. 读 `keyframe_plan.yaml`
2. 检查 `locked == true`（否则拒绝执行，回退到 08a）
3. 严格按 plan 执行（不允许 08 内部自作主张改 mode 或 batch_size）

如果用户在 08 执行中想改某个 shot 的 mode → 必须**回到 08a 重新审阅**这一个 shot（08a 支持 `--shot ep8_shot_007` 单 shot 修订模式）。

---

## 输出给 Orchestrator 的摘要

```json
{
  "status": "success",
  "summary": {
    "episode_id": 8,
    "total_shots": 11,
    "estimated_cost_cny": 4.8,
    "mode_distribution": {
      "image2video": 5,
      "first_last": 2,
      "grid_4": 4
    },
    "merge_groups": 1,
    "locked_shots": 1,
    "user_modifications": [
      "shot_003 → grid_4 合并到 [001,002,003,004]（用户接受推荐）",
      "shot_007 → 保持 first_last（用户接受）"
    ]
  },
  "artifact_path": "projects/xx/storyboards/episode_8/keyframe_plan.yaml",
  "next_action_hint": "08-keyframe-generator (按 plan 执行，预算 ¥4.8)"
}
```

---

## 关键专业准则

### 1) 付费集 Cliffhanger 强制 batch ≥ 3

抖音/快手的付费转化 70%+ 来自付费集的最后一帧（"翻天反转"）。AI 一次出图不一定够好，必须 batch=3-5 抽卡：
- batch=3：基线，付费集最低
- batch=5：大节点付费集（ep8 / ep20 / ep40）
- batch=1：明确禁止

### 2) `locked: true` 的判定

某 shot 自动 locked 的条件（用户不允许降档）：
- 该集 `is_paywall_hook` 且该 shot 是 `cliffhanger` 或 `climax`
- 该集 `is_milestone_hook` 且该 shot 是 `climax`
- 该 shot `intensity ≥ 9`

### 3) 合并候选检测（grid 模式）

合并为 grid 的硬性条件：
- 同 scene_id
- 同 character_ids（主角集合一致）
- 时间连续（shot 序号连续）
- 总时长 ≤ 60s（grid_9）/ 40s（grid_4）
- 镜头语言相近（不要把 wide 和 extreme_close_up 合并）

不满足任一条 → 不合并。

### 4) reference_video 模式的特殊路径

少数情况可以**完全跳过分帧**直接进 09：
- 角色 reference + 场景 reference + 道具 reference 都齐全
- shot 没有明确运镜（static 或 push_in）
- 时长 ≤ 5s
- 不是付费集

08a 把这类 shot 标记 `mode: reference_video`，08 直接跳过该 shot，09 用 `@Image:character + @Image:scene` 直生视频。

### 5) 累计预算监控

每生成一个集的 plan 后，更新 `project.json.spending.estimated_image_cost_cny`。如果累计超过 `plan.budget_constraints.max_total_cny × 0.4`（图像应占总预算 ≤ 40%），主动警告用户。

---

## 反模式

❌ 跳过 08a 直接进 08（不知道每 shot 走哪种 mode 是浪费）  
❌ 让用户在 08 执行中临时改 mode（应回到 08a）  
❌ 自动合并跨 scene 或跨主角的 shot 为 grid（视觉风格冲突）  
❌ 付费集 cliffhanger 用 image2video + batch=1（不够保险，必须 first_last + batch ≥ 3）  
❌ 大节点集（每 20 集一次的反转集）默认 batch=1（应自动 batch ≥ 2）  
❌ 不显示 alternatives（用户没法做权衡）  
❌ 让 LLM 一边规划一边执行（必须先全部规划完，过审，再执行）

---

## 与上下游的契约

### 上游：07-storyboard-breaker
- 必须已写入 `mergeable_with_next: true/false` 标记（07 的合并候选检测）
- 必须已计算 `intensity` 字段（来自 03.intensity_curve）

### 下游：08-keyframe-generator
- 严格按 keyframe_plan.yaml 执行
- 不允许内部决定 mode 或 batch_size
- 一致性检查失败时回报 08a，由 08a 决定是用候选 batch 中的另一张还是回 07 改分镜

### 同级：09-video-generator
- 当 keyframe_plan.shot_plans[i].mode == "reference_video" 时，跳过 08 → 直接进 09
- 当 keyframe_plan.shot_plans[i].mode == "multi_shot" 时，09 把这一组 shot 一次性生成
