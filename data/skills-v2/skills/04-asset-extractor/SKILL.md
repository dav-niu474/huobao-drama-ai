---
name: asset-extractor
skill_id: "04-asset-extractor"
version: "2.0"
phase: "M2"
inputs: [scripts/index.json, scripts/episode_*.json, analysis/novel.json, production_plan.yaml]
outputs: [assets/index.json, assets/characters/*, assets/scenes/*, assets/props/*, assets/clues/*]
dependencies: [01-novel-analyst, 02-show-planner, 03-script-writer]
description: 全集资产提取器。从全部 N 集剧本一次性抽取核心角色、场景、道具、线索；执行角色合并；构建跨集资产索引。这是从"剧本"过渡到"视觉制作"的关卡。当 scripts/index.json 已就绪而资产库为空时使用。
agent_type: subagent
content_modes: [drama, narration]
required_tools:
  - read_full_script_index           # 读 03 的全集索引
  - read_episode_script              # 读单集剧本
  - read_novel_analysis              # 借用 01 的 characters / scene_inventory 作底稿
  - read_production_plan             # 读 02 的 can_merge_characters 等约束
  - dedupe_and_consolidate           # LLM 辅助同一性判断
  - save_character_library           # 项目级 / 全局级写入
  - save_scene_library
  - save_prop_library
  - save_clue_library
  - update_episode_asset_refs        # 反向写回 episode_<N>.json 的 referenced_*
---

# 全集资产提取器 / Full-Series Asset Extractor

> **定位变化（vs 旧版）**：
> 不再分 `peek_chapters / split_chapters / extract_assets` 三种 mode。
> 章节切分已经在 02-show-planner + 03-script-writer 完成，**04 只做一件事**：从全套剧本里把所有可视化资产一次性抽干净，建立项目级资产库。
>
> 之前的"逐集提取 + 跨集去重"方案在专业短剧流程里会出现：每集提的角色描述都不一样、画风不一致。**正确做法是从全集一次性抽完，再反向标注每集用到的资产。**

---

## 你的输入

```
projects/<name>/analysis/novel.json        ← 01 全本理解（含 characters/scene_inventory 作底稿）
projects/<name>/production_plan.yaml       ← 02 的 can_merge_characters 必须执行
projects/<name>/scripts/index.json         ← 03 全集索引
projects/<name>/scripts/episode_001.json
                       ...
                       episode_080.json
```

---

## 你的产出

### 项目级资产库（核心）

```
projects/<name>/assets/
  characters/
    char_001/
      meta.json                        # 6 层身份锚点 + 衣橱 + 戏份分布
      reference.png                    # 由 06-character-designer 后续生成
    char_002/...
  scenes/
    scene_001/
      meta.json
  props/
    prop_001/...
  clues/
    clue_001/...
  index.json                            # 资产汇总索引
```

### 反向写回每集剧本的资产引用

每个 `episode_<N>.json` 的 `scenes[].referenced_characters/scenes/props` 字段被填上**真实 asset_id**（之前 03 写的是名字字符串）。

---

## 工作流（4 步）

### Step 1 · 加载与策略选择
```python
plan = read_production_plan()
analysis = read_novel_analysis()
script_index = read_full_script_index()

# 决定提取深度
extraction_depth = "deep" if plan.budget_constraints.quality_priority == "quality_first" else "balanced"
```

### Step 2 · 整体扫描全集剧本

**不要按集拆分调用 LLM**。一次性把所有集合并扫描（如果上下文不够，分 2-3 批，但**每批要带跨批 context**）：

```python
all_dialogues = collect_all(episodes, "dialogue")
all_directions = collect_all(episodes, "stage_direction")
all_visual_focus = collect_all(episodes, "visual_focus")

# 候选资产清单（让 LLM 抽取）
candidates = llm_extract(
    system="你是短剧资产提取专家。从下面所有剧本中提取所有出现过的角色/场景/道具/线索。",
    payload={
        "novel_characters": analysis.characters,         # 底稿
        "novel_scenes": analysis.scene_inventory,        # 底稿
        "must_keep": analysis.must_keep_scenes,
        "can_merge": plan.can_merge_characters,
        "scripts": [ep.compress() for ep in episodes],
    }
)
```

### Step 3 · 去重、合并、补全

#### 3.1 角色处理

```python
for char_candidate in candidates.characters:
    # (a) 检查 plan.can_merge_characters，强制合并
    char_candidate = apply_merge_rules(char_candidate, plan.can_merge_characters)
    
    # (b) LLM 同一性判断（同名 ≠ 同人，同人 ≠ 同名）
    existing = find_similar(char_library, char_candidate)
    if existing:
        merge_aliases(existing, char_candidate)
        continue
    
    # (c) 补全 6 层身份锚点（来自 02 的 analysis.characters 底稿）
    anchors = build_identity_anchors(char_candidate, analysis)
    
    # (d) 计算戏份分布
    appearances = compute_appearances(char_candidate, episodes)
    weight = compute_weight(appearances, char_candidate.role_type)
    
    # (e) 衣橱推断
    wardrobe = infer_wardrobe(char_candidate, episodes, plan.genre)
    
    save_character(char_candidate, anchors, appearances, weight, wardrobe)
```

#### 3.2 场景处理

```python
for scene_candidate in candidates.scenes:
    # 同地点同时间的场景视为同一个
    existing = find_by_location_and_time(scene_library, scene_candidate)
    if existing:
        merge_appearances(existing, scene_candidate)
        continue
    
    save_scene(scene_candidate)
```

#### 3.3 道具 vs 线索的区分（重要）

```python
for item in candidates.items:
    if item.appears_across_episodes_with_visual_continuity():
        # 跨集持续出现 + 视觉一致性要求 → 线索
        save_as_clue(item)
    else:
        # 单次/局部出现 → 道具
        save_as_prop(item)
```

参考 [`packages/asset-spec/clue.yaml`](../../packages/asset-spec/clue.yaml)。

### Step 4 · 反向更新 episode 引用

最后一步：把每集剧本里 `referenced_characters/scenes/props` 字段从字符串名字改为 asset_id：

```python
for episode in episodes:
    for scene in episode.scenes:
        scene.referenced_characters = [name_to_asset_id(c) for c in scene.referenced_characters]
        scene.referenced_scenes = [name_to_asset_id(s) for s in scene.referenced_scenes]
        scene.referenced_props = [name_to_asset_id(p) for p in scene.referenced_props]
    save_episode_script(episode)
```

---

## 关键专业准则

### 1) 角色字段（详细规范）

```yaml
character_id: char_001
name: 苏婉清
aliases: [婉清, 苏家大姑娘, 凤离]

role_type: protagonist                 # protagonist | supporting | extra | antagonist
weight: 10                             # 来自 03.intensity 加权戏份
arc_brief: "重生废柴 → 隐忍布局 → 修真崛起"

# 戏份分布
appearance_episodes: [1, 2, 3, 5, 6, 7, 8, ...]   # 哪几集出现
total_episode_count: 76
total_dialogue_count: 412
weight_evolution:                      # 戏份随集数变化
  - { ep_range: [1, 10], weight: 10 }
  - { ep_range: [11, 30], weight: 9 }
  - { ep_range: [31, 80], weight: 10 }

# 外貌（综合 01 全本 + 全集剧本提取）
appearance:
  gender: female
  age_range: young_adult                # 16 岁 → 但短剧默认 young_adult 表达
  body_type: slim
  facial: "椭圆脸型，杏眼柳眉，肤白如玉，左眼尾有一颗小痣（重生标记）"
  hair: "乌黑及腰长发，常以白玉簪固定，少女时代会束高马尾"
  clothing: "古装，多素色或淡雅绣花襦裙，腰间常佩玉牌"
  distinguishing_features: "左眼尾痣 + 玉牌 + 行走步伐沉稳"

personality_tags: [冷静, 隐忍, 决绝, 重生宿命感]

# 6 层身份锚点（关键，下游所有视觉 skill 都用）
identity_anchors:
  face_shape: "椭圆 + 微尖下巴 + 左眼尾小痣"
  hair_signature: "乌黑长发 + 白玉簪"
  color_palette: "#0F1729 + #C9A96E + #E8DCC4"   # 墨蓝 / 暖金 / 米白
  silhouette: "瘦高直立姿态 + 长袍轻摆"
  signature_prop: "母亲遗物玉牌（系于腰间）"
  scene_context: "苏府闺阁 / 落霞峰修仙宗门 / 月下"

background: "苏府嫡长女，前世被姐姐和未婚夫联手害死。重生回十六岁那年。"

# 衣橱（按 02 plan.genre 推断 + 全集中实际场合）
wardrobe:
  - outfit_id: 苏府日常
    description: "素色襦裙 + 白玉簪"
    occasion: casual
    appears_in_episodes: [1, 2, 3, ...]
  - outfit_id: 宗门修真
    description: "白色道袍 + 银色法器"
    occasion: combat
    appears_in_episodes: [25, 26, 27, ...]
  - outfit_id: 宫廷盛装
    description: "暗金长袍 + 凤冠"
    occasion: formal
    appears_in_episodes: [70, 71, 80]

# 关系
relationships:
  - target_id: char_002                # 苏婉柔
    type: 姐妹敌对
    note: "前世仇人，重生后步步反击"
  - target_id: char_003                # 萧澈
    type: 道侣
    note: "前世今生的灵魂伴侣"

# 后续 skill 写入
voice_id: null                         # 由 10-voice-assigner 写
cloned_voice_path: null
reference_image: null                  # 由 06-character-designer 写
```

### 2) 全集统一性 vs 局部变化

跨集要保持的：
- ✅ identity_anchors 6 项
- ✅ name + aliases
- ✅ 主要外貌特征
- ✅ 角色弧（不能从"温柔"突变到"狂战"）

跨集允许变化的：
- ✅ wardrobe（按场景换衣服）
- ✅ 发型小调整（古装少女→出嫁盘发）
- ✅ 表情/姿态（情绪驱动）
- ✅ 年龄阶段（如有时间跳跃，会有少年 / 成年 / 老年三套 outfit）

### 3) 戏份权重计算

```python
def compute_weight(char, episodes):
    total_dialogues = sum(c.dialogue_count_in(ep) for ep in episodes)
    total_appearances = sum(1 for ep in episodes if char.id in ep.referenced_characters)
    is_protagonist = (char.role_type == "protagonist")
    
    weight = (
        (total_appearances / len(episodes)) * 0.5 +
        (total_dialogues / max_dialogues) * 0.3 +
        (1.0 if is_protagonist else 0.0) * 0.2
    ) * 10
    return round(weight)
```

### 3.1) Weight Tier → 视觉资产清单（硬性契约）

权重档位**直接决定** 06-character-designer 必产的图，由 [`character.yaml § weight_tier`](../../packages/asset-spec/character.yaml) 强制约束：

| Tier | weight | 必产视觉资产（不可省） | 总图数 |
|---|---|---|---|
| **A · 主角** | ≥ 7 | reference + three_views + avatar + 全套 wardrobe[]（按 char.wardrobe 数组） | ≥ 5 |
| **B · 重要配角** | 4–6 | reference + three_views + avatar + wardrobe ≥ 2 套（default + 主要场合） | 5 |
| **C · 群演** | ≤ 3 | reference + avatar | 2 |

**为什么 three_views / avatar 不能"按需省略"**：
- three_views 缺失 → 08-keyframe 在生成"侧面 / 背身 / 转头"镜头时无参考，必漂移
- avatar 缺失 → 09-video 中景/特写镜头面部分辨率不够（短剧 70%+ 镜头是中近景）
- wardrobe 缺失 → 跨场景换装每次现拼，战斗服时而铠甲时而布衣

如果用户预算紧张，由 **02-show-planner 的 `asset_quality_tier`** 整体降档（economy 仅 Tier-A 保留四件套），**不能在 04 里根据感觉"少给一张"**。

### 3.2) 计算总视觉成本（必须输出）

04 必须在 `visual_asset_plan` 中按角色逐个列出"06 将产几张图"以及总成本估算。这是用户在 02 之后第二个看到具体成本的关卡，让他在 06 真正花钱前还有调整 `asset_quality_tier` 的机会。

### 4) 场景的"主场景 vs 衍生"

短剧通常 8-15 个主要场景。识别主场景：

```python
main_scenes = [s for s in scenes if s.appearances >= 3 or s.is_in_must_keep_scenes]
derived_scenes = [s for s in scenes if s.is_variant_of(main_scenes)]   # 同地点不同时间
```

主场景生 reference.png；衍生场景在主场景基础上 image-to-image 改光线/天气。

### 5) 线索追踪 / clue tracking

```yaml
clue_id: clue_001
name: 母亲的玉牌
trace_episodes: [1, 8, 47, 70, 80]     # 出现的集
visual_anchor: "玉色泛青 + 雕刻'凤离'二字 + 系红绳"
state_changes:
  - { episode: 1, state: 完整, visual_diff: 干净玉色 }
  - { episode: 47, state: 半碎, visual_diff: 边缘有裂痕 }
  - { episode: 80, state: 浴血, visual_diff: 染血玉色 + 红绳褪色 }
importance: plot_critical
```

跨集追踪是 clue 与 prop 的本质区别（详见 `packages/asset-spec/clue.yaml`）。

### 6) 角色合并的执行（必检）

如果 02 的 plan 里写：

```yaml
can_merge_characters:
  - merge: [王嬷嬷, 林嬷嬷]
    into: 王嬷嬷
```

那 04 必须：
1. 不为"林嬷嬷"建独立 character
2. 把 03 剧本里的"林嬷嬷"全部替换为"王嬷嬷"
3. 把 1 + 2 的所有戏份合并到 char "王嬷嬷"
4. 在 character.merge_history 里记录合并来源

```yaml
character_id: char_007
name: 王嬷嬷
merge_history:
  - merged_from: 林嬷嬷
    merged_at: 2026-05-24T11:30:00Z
    merged_by_plan: production_plan_v1
    affected_episodes: [12, 34, 67]
```

### 7) 提示词（prompt_en / prompt_zh）的产出

每个资产的 prompt 是为 06-character-designer / 08-keyframe-generator 准备的。**不要带画风词**（画风词由 05-art-director 负责注入）。

例如角色：
```
prompt_zh: 16岁少女，椭圆脸型，左眼尾小痣，乌黑长发束白玉簪，素色襦裙，腰间玉牌，瘦高身姿，神情冷静坚毅
prompt_en: A 16-year-old young woman, oval face with small mole near left eye corner, long black hair held by white jade hairpin, plain hanfu dress, jade pendant at waist, slim tall figure, calm and resolute expression
```

不要写"国风二次元、赛璐璐平涂、cinematic"等，那些由画风包统一加。

---

## 验收标准

| 检查项 | 要求 |
|---|---|
| 角色总数 | 8-15 个（短剧合理范围） |
| 主角色（weight ≥ 7） | 至少 1 个 |
| 6 层身份锚点 | 主角色必须 6 层全填，配角至少填 face_shape + hair_signature + color_palette |
| 角色合并已执行 | 验证 plan.can_merge_characters 中所有合并 |
| 主场景数 | 5-12 个 |
| 关键道具 | 与 01 的 key_props 一一对应 |
| 线索数 | 通常 1-3 个 |
| episode 反向引用已更新 | 每个 episode_<N>.json 的 referenced_* 字段都是 asset_id 不是名字 |

---

## 输出给 Orchestrator 的摘要

```json
{
  "status": "success",
  "summary": {
    "characters": {
      "total": 12,
      "protagonist": 2,
      "antagonist": 1,
      "supporting": 6,
      "extra": 3,
      "merged_count": 2
    },
    "scenes": {
      "total": 9,
      "main": 7,
      "derived": 2
    },
    "props": { "total": 14 },
    "clues": { "total": 2 },
    "all_episodes_updated": true,
    "visual_asset_plan": {
      "tier_a_chars": 2,
      "tier_b_chars": 6,
      "tier_c_chars": 4,
      "estimated_image_count": 38,
      "estimated_image_cost_cny": 18.5,
      "breakdown": {
        "char_001 (林小红, weight=10, Tier-A)": { "images": 7, "items": ["reference", "three_views", "avatar", "wardrobe/苏府日常", "wardrobe/宗门修真", "wardrobe/宫廷盛装", "wardrobe/战斗"] },
        "char_002 (陆寒, weight=9, Tier-A)": { "images": 6, "items": ["reference", "three_views", "avatar", "wardrobe/...×3"] },
        "char_003 (苏婉柔, weight=8, Tier-A)": { "images": 6 },
        "char_004 (王嬷嬷, weight=4, Tier-B)": { "images": 5, "items": ["reference", "three_views", "avatar", "wardrobe/default", "wardrobe/外出"] },
        "...": "..."
      }
    },
    "warnings": [
      "char_011 的 weight 仅 1，可考虑合并入 char_007"
    ]
  },
  "artifact_index": "projects/xx/assets/index.json",
  "next_action_hint": "05-art-director (画风定调) → 06-character-designer (按上述 plan 生 38 张图，约 ¥18.5)"
}
```

> ⚠️ **`visual_asset_plan` 是契约**：04 在这里列出的图，下游 06 必须按此清单全部产出。这不是建议，是基于 weight tier 与 plan.asset_quality_tier 的硬性约定（详见 [`packages/asset-spec/character.yaml § weight_tier`](../../packages/asset-spec/character.yaml)）。
>
> 用户在 04 完成后审阅 plan，如果觉得"林小红的 7 张图太奢侈"，应回到 02-show-planner 把 `asset_quality_tier` 从 standard 降到 economy；**不要在 06 里临时省图**。

---

## 反模式

❌ 按集逐个提取再去重（应一次性扫全集）  
❌ 不执行 plan.can_merge_characters（破坏 02 的决策）  
❌ 主角不做完整 6 层锚点（下游一致性必崩）  
❌ 把跨集追踪元素当 prop 而不是 clue（导致跨集状态变化无管理）  
❌ 资产 prompt 里夹带画风词（污染画风系统）  
❌ 戏份权重不影响下游生成深度（导致 weight=1 的群演也生成完整衣橱，浪费成本）  
❌ 不写 episode 反向引用（下游 skill 拿到 referenced_characters 还得自己解析名字）
