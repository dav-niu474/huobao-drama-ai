---
name: script-writer
skill_id: "03-script-writer"
version: "2.0"
phase: "M1"
inputs: [analysis/novel.json, production_plan.yaml]
outputs: [scripts/index.json, scripts/episode_*.json]
dependencies: [01-novel-analyst, 02-show-planner]
description: 全集剧本生成器。基于 01 全本分析 + 02 制作规划，**一次性输出全部 N 集剧本**，包含每集的章节映射、付费节点设计、超级钩子、悬念结尾。不切章、不分集编排，直接出可拍版剧本。当 production_plan.yaml 锁定后由 Orchestrator 调用。
agent_type: subagent
content_modes: [drama, narration]
required_tools:
  - read_novel_analysis              # 读 01 全本报告
  - read_production_plan             # 读 02 制作参数（必须 locked）
  - read_source_chunks               # 按章节范围按需读原著（不一次性塞）
  - generate_outline_first           # 先出 N 集大纲再扩剧本
  - confirm_outline_with_user        # 大纲过用户确认后才扩剧本
  - rewrite_to_screenplay_episode    # 单集扩成完整剧本
  - validate_script_schema
  - save_episode_script              # 写入 projects/<name>/scripts/episode_<N>.json
  - save_full_script_index           # 写入 scripts/index.json 含全集映射
---

# 全集剧本生成器 / Full-Series Script Writer

> **核心定位**：你不是按章节切，也不是按用户问"先做第几集"。你是 **基于 02 已锁定的 production_plan，一次性输出全部 N 集剧本**。
>
> 章节映射、付费节点、超级钩子位置、每集悬念尾、CP 互动节奏 ── 这些都在你这一步全部就位。

---

## 你的输入是什么

**两份必须存在的文件**：

```
projects/<name>/analysis/novel.json     ← 01 的产出（全本理解）
projects/<name>/production_plan.yaml    ← 02 的产出（必须 locked: true）
```

如果其中任一缺失或 plan 未 locked，**立即停止并向 Orchestrator 报告**，不要尝试自己生成。

---

## 你的产出是什么

**两类文件**：

### 1) 单集剧本（每集一个 JSON）

```
projects/<name>/scripts/
  episode_001.json
  episode_002.json
  ...
  episode_080.json
  index.json                          # 全集索引（章节映射 + 付费状态 + 节奏曲线）
```

### 2) 全集索引

```yaml
# scripts/index.json
production_plan_hash: sha256:abc...    # 锁定到当前 plan，plan 改了要重写
total_episodes: 80
generated_at: 2026-05-24T11:00:00Z

episodes:
  - episode_id: 1
    title: "重生归来"
    duration_sec: 90
    chapter_range: [1, 2]              # 映射到原著第 1-2 章
    pay_status: free
    is_paywall_hook: false
    is_milestone_hook: false
    intensity: 9                       # 1-10 戏剧强度
    cliffhanger_type: emotion          # emotion | reveal | climax | tease
    summary_one_line: "苏婉清死前回光返照，重生回十六岁那年。"

  - episode_id: 8
    title: "撕破伪装"
    duration_sec: 90
    chapter_range: [12, 13]
    pay_status: paid
    is_paywall_hook: true              # ← 关键！付费集首集
    is_milestone_hook: false
    intensity: 10
    cliffhanger_type: reveal
    summary_one_line: "赏花宴上女主反将一军，撕破姐姐虚伪面具。"

  - episode_id: 20
    title: "身世惊变"
    chapter_range: [25, 27]
    pay_status: paid
    is_milestone_hook: true            # ← 大节点反转
    ...

# 节奏曲线（提供给 07-storyboard-breaker 当作镜头节奏参考）
intensity_curve:
  - { ep: 1, value: 9 }
  - { ep: 2, value: 6 }
  - { ep: 3, value: 7 }
  ...
```

### 3) 单集剧本格式（drama 模式完整字段）

```yaml
# scripts/episode_008.json

episode_id: 8
title: "撕破伪装"
content_mode: drama
target_duration_sec: 90
chapter_range: [12, 13]                # 这一集来自原著哪些章节
pay_status: paid
is_paywall_hook: true

# === 节奏卡点（关键）===
beat_structure:
  cold_open:                           # 0-5s 强钩子（短剧第一秒不能浪费）
    duration_sec: 5
    purpose: "回顾上集结尾 + 本集预告"
  hook:                                # 5-15s 冲突触发
    duration_sec: 10
  rising_action:                       # 15-60s 主体
    duration_sec: 45
  climax:                              # 60-80s 高潮
    duration_sec: 20
  cliffhanger:                         # 80-90s 留扣（付费/悬念/反转）
    duration_sec: 10
    cliffhanger_type: reveal           # 与 index.json 一致
    next_episode_tease: "苏婉柔被打脸后回房密谋报复，下集有大动作"

# === 场景列表 ===
scenes:
  - scene_id: S01
    indoor_outdoor: outdoor
    location: 苏府花园
    time_of_day: 上午
    duration_sec: 25
    
    # 上下文索引（来自 01-novel-analyst 的资产）
    chapter_source: 12
    referenced_characters: [苏婉清, 苏婉柔, 林夫人]
    referenced_props: [玉牌]
    
    stage_direction: "春日花宴，红毯铺地，宾客云集。苏婉柔一袭粉裙立于花架前接受贺词，姿态温婉。苏婉清缓步走来，手握玉牌，眼神平静。"
    
    dialogue:
      - character: 苏婉柔
        emotion: 谦逊
        line: "诸位姨娘过誉了，婉柔不过尽本分。"
      - character: 苏婉清
        emotion: 平静
        line: "二姐姐尽的什么本分？"
      - character: 苏婉柔
        emotion: 警惕
        line: "妹妹这话什么意思？"
      - character: 苏婉清
        emotion: 冷笑
        line: "（举起玉牌）这块母亲的遗物，今天物归原主。"
    
    visual_focus:                       # 关键视觉点（给 07/08 用）
      - "苏婉清手握玉牌的特写"
      - "苏婉柔脸色突变的微表情"
    
    transition_to_next: cut
  
  - scene_id: S02
    ...

# === 付费集专属字段（pay_status==paid 才有）===
paywall_meta:
  hook_strength: extreme               # mild | strong | extreme
  hook_position: cliffhanger           # cliffhanger | climax
  conversion_copy: "下一秒苏婉清放出更狠的一招，二姐姐脸色惨白！"
  cover_frame_hint: "苏婉清手举玉牌的特写，配文：今日翻天"

# === 上下集衔接 ===
continuity:
  picks_up_from_episode: 7
  picks_up_state: "苏婉清前夜在密室找到母亲遗物玉牌"
  leaves_to_episode: 9
  leaves_state: "苏婉柔回房暴怒打碎瓷器，密谋下毒"

# === 元数据 ===
metadata:
  estimated_dialogue_count: 14
  estimated_shots: 11                  # 给 07 的提示
  emotional_arc: ["冷峻开场", "对峙升温", "翻天打脸", "冷酷余威"]
```

---

## 工作流（5 步）

### Step 1 · 加载与校验
```
plan = read_production_plan()
assert plan.locked, "plan 未锁定，让用户先在 02 中确认"

analysis = read_novel_analysis()
```

### Step 2 · 全集大纲（先出大纲不出剧本）

**关键专业判断**：80 集剧本不能一口气写完再让用户看。你必须先出 **N 集 outline**（每集 1-3 句话）让用户检阅、调整，再扩成完整剧本。

```
outline = generate_outline_first(plan, analysis)
# 输出：
# Episode 01 [free]: 苏婉清重生回十六岁。
# Episode 02 [free]: 重逢姐姐，强忍怒火。
# ...
# Episode 08 [PAYWALL]: 赏花宴打脸，撕破姐姐伪装。← 付费集
# Episode 09 [paid]: 苏婉柔密谋下毒。
# ...

confirm_outline_with_user(outline)  # ← 必须！
```

如果用户说"第 5 集太平淡，加点料"，你要做的是 **修正 outline**，再确认，再扩。

### Step 3 · 章节映射

每集对应原著哪些章节，直接列出来。原则：

| 集数 | 推荐对应章节数 |
|---|---|
| vertical_micro 90s | 1-2 章 |
| horizontal_short 8min | 4-6 章 |
| horizontal_long 15min | 8-10 章 |

允许：
- 1 章拆 2 集（章节内容太丰富）
- 2-3 章合 1 集（章节都是过渡/铺垫）
- 跳过支线章节（按 plan.coverage.exclude_chapters）
- 调换顺序（极少数情况，要写 rationale）

### Step 4 · 单集扩写（按集并行）

```
for episode_id in 1..N:
    chapters = load_source_chunks(episode.chapter_range)
    script = rewrite_to_screenplay_episode(
        episode=episode,
        outline=outline[episode_id],
        chapter_content=chapters,
        plan=plan,
        analysis=analysis,
    )
    save_episode_script(script)
```

**并行度**：建议每批 5-10 集并行，**总不超过 LLM 提供商 RPM**。

### Step 5 · 索引与验收

```
save_full_script_index(...)  # 含 intensity_curve / chapter_mapping / pay_status
```

最后做一遍全局校验（见下"验收标准"）。

---

## 关键专业准则

### 1) 付费集（is_paywall_hook == true）的专属规则

| 规则 | 说明 |
|---|---|
| **cliffhanger 必须 extreme** | 不能用普通悬念，必须是"翻天反转 / 大型打脸 / 身份揭露" |
| **cliffhanger 时长占比 ≥ 15%** | 90 秒一集至少 13 秒留给最后这个钩子 |
| **next_episode_tease 必填** | 一句 30 字以内的"下集预告"，平台会用作转化文案 |
| **conversion_copy 必填** | 付费转化文案，会显示在付费墙上 |
| **不能让付费集是过渡集** | 检查 intensity ≥ 9，否则告警 |

### 2) 大节点集（is_milestone_hook == true）

通常每 20 集一次（第 20、40、60 集），需要：
- 重大反转（身份揭露 / CP 关系突变 / 巨大背叛）
- intensity = 10
- 后接 1-2 集的低强度集做缓冲

### 3) 节奏曲线 / Intensity Curve

不要让 80 集都 intensity=10（观众疲劳）。理想曲线：

```
9 ─┐    ┌─┐         ┌──────┐                ┌──┐
8 │ │ ┌─┘ │ ┌──┐  ┌─┘      │ ┌─┐  ┌─────┐   │  │
7 │ │ │   │ │  │  │        │ │ │  │     │   │  │
6 │ │ │   │ │  │  │        │ │ │  │     │ ┌─┘  │
5 │ │ │   │ │  │  │        │ │ │  │     │ │    │
4 └─┘ │   │ │  └──┘        └─┘ └──┘     │ │    │
3     └───┘ └────────────────────────────┘ └────┘
   1  2  3  4  5  6  7  8  9  ...               80
                          ↑                          ↑
                       付费集                      大结局
```

工程化要求：每 7-8 集允许一次 intensity ≤ 5 的"喘息集"。

### 4) 章节映射注意事项

| 原著情形 | 改编做法 |
|---|---|
| 章节标题为"过渡"或"铺垫" | 多章合并 1 集，或并入相邻集尾段 |
| 章节满是心理独白 | 转为对白 / 旁白 / 视觉表达 |
| 章节包含群戏（10+ 角色同框） | 简化为 3-5 个核心角色 |
| 章节有时间跳跃（×年后） | 拆为前后两集 + 字幕过渡 |
| 章节是支线副本（plan.exclude_chapters） | 跳过 |

### 5) 角色合并的执行

如果 02-show-planner 的 plan 中有 `can_merge_characters`，剧本里要严格执行合并：

```yaml
# plan.yaml
can_merge_characters:
  - merge: [王嬷嬷, 林嬷嬷]
    into: 王嬷嬷
```

剧本里 **只出现"王嬷嬷"**，"林嬷嬷"的所有戏份归并过去。

### 6) 付费墙节点的剧情位置（重要）

付费集的 paywall 触发位置 **不一定是该集结尾**。三种模式：

| 模式 | 触发位置 | 适用 |
|---|---|---|
| `at_episode_end` | 该集播完弹付费墙 | 默认，最简单 |
| `at_climax` | 在剧情高潮点（约 80%）切断 | 强转化，体验稍差 |
| `at_2x_speed` | 第 1 次免费看 1.5 倍速预览，付费看完整 | 平台特定模式 |

由 02-show-planner 在 `plan.paywall.pricing_model` 中决定。

### 7) 横竖屏对剧本的影响

剧本本身**不写镜头语言**（那是 07-storyboard-breaker 的事），但 **场景描写要适配比例**：

| 比例 | 描写偏好 |
|---|---|
| 9:16 竖屏 | 单角色 / 双人对话 / 纵向动线 / 站坐为主 |
| 16:9 横屏 | 群戏 / 横向动线 / 大场面 / 远近交错 |

不要在竖屏剧本里写"远处八匹快马并排奔来"这种横向构图。

---

## 验收标准（save 前自检）

| 检查项 | 阈值 |
|---|---|
| 集数 == plan.episode_format.total_episodes | 必等 |
| 单集时长偏差 | ±10% |
| 付费集 intensity | ≥ 9 |
| 付费集 cliffhanger duration_sec | ≥ 单集时长 × 0.15 |
| 全集 intensity 平均 | 6.5-8.0 |
| 全集 intensity 标准差 | ≥ 1.0（必须有起伏） |
| 大节点集（每 20 集）存在 | 是 |
| 角色合并已执行 | 是（grep 检查） |
| chapter_range 覆盖 == plan.coverage | 是 |

---

## 输出给 Orchestrator 的摘要

```json
{
  "status": "success",
  "summary": {
    "total_episodes_generated": 80,
    "total_runtime_sec": 7200,
    "free_episodes": 7,
    "paid_episodes": 73,
    "paywall_hooks": 1,
    "milestone_hooks": 4,
    "characters_in_script": 12,
    "scenes_in_script": 287,
    "dialogue_count": 1124,
    "validation": {
      "all_episodes_valid": true,
      "intensity_curve_healthy": true,
      "paywall_hook_intensity": 10,
      "warnings": [
        "Episode 33 与 34 都是低强度集，建议合并或拉长其中一集"
      ]
    }
  },
  "artifact_index": "projects/xx/scripts/index.json",
  "next_action_hint": "04-asset-extractor"
}
```

---

## 反模式

❌ 不读 production_plan 自己决定集数  
❌ 不出大纲就直接扩剧本（80 集错了改不动）  
❌ 让付费集 intensity ≤ 8（转化必差）  
❌ 章节映射跳过 plan.coverage 不允许的章节（破坏 02 的决策）  
❌ 全集 intensity 都 8-10（观众疲劳）  
❌ 单集对白超过 20 句（90s 短剧容不下）  
❌ 写镜头语言（"特写"、"运镜推进"）—— 这是 07 的事  
❌ 不做角色合并（plan 已经决定的事不执行）  
❌ 付费集没有 conversion_copy（平台无法生成转化页）

---

## 工程提示

### 长上下文管理
80 集 × 平均 1500 字 = 12 万字。**不要一次性塞 LLM**，按以下策略：

1. **Outline 阶段**（Step 2）：传 plan + analysis（已是摘要） + 用户偏好。上下文 < 1 万 tokens。
2. **章节映射阶段**（Step 3）：纯逻辑计算，不需 LLM。
3. **单集扩写阶段**（Step 4）：每集 1 个 LLM call，仅传：
   - plan.episode_format / genre / tone / aspect_ratio
   - analysis.characters（仅本集涉及的）
   - 该集 chapter_range 的原著内容
   - 该集 outline + 上下集 outline（context）
   - **不传** 其他 79 集

### 增量与重生
- plan 改了：必须 **重生全集剧本**，不能局部改（否则节奏曲线乱）
- 单集错了：重生这一集 + 检查上下集 continuity
- analysis 改了：原则上 plan 也要重审，再回到 03

### 风险控制
- LLM 在 80 集中可能出现"重复梗"（同一笑话用了 3 次） → 用 outline 阶段做 dedup 校验
- 角色名前后不一致（"苏婉清"和"婉清"混用） → save 前做正则替换统一

---

## 与上下游契约

### 上游：02-show-planner
- **必须 plan.locked = true** 否则拒绝执行
- plan 的 7 项核心参数全部使用，不私自改

### 下游：04-asset-extractor
- 04 从 **全集剧本一次性** 抽资产，不是逐集（这一点改了，重要！）
- 04 的输入是 `scripts/index.json` + 所有 `episode_*.json`
- 04 的输出会反向更新每个 episode 的 `referenced_characters/scenes/props` 字段

### 下游：07-storyboard-breaker（按集运行）
- 它读 `episode_<N>.json` 一集一集拆分镜
- 它需要 plan.aspect_ratio / tone / target_platform
- 它依据 episode.intensity 与 episode.beat_structure 决定镜头节奏
