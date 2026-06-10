---
name: character-designer
skill_id: "06-character-designer"
version: "2.0"
phase: "M2"
inputs: [assets/characters/*/meta.json, art_style_pack, production_plan.yaml]
outputs: [reference.png, three_views.png, avatar.png, wardrobe/*.png]
dependencies: [04-asset-extractor, 05-art-director]
description: 视觉资产生成。生成角色定妆图（全身 → 三视图 → 头像 → 衣橱多套服饰）、场景图、道具图。当 Orchestrator 检测到资产视觉缺失时，或用户说"画一下角色"、"生成场景图"、"重画道具"时使用。
agent_type: subagent
required_tools:
  - read_asset_meta             # 读 character/scene/prop 的 meta.json
  - read_art_style              # 读当前 art-style 包
  - compose_image_prompt        # 拼接最终 prompt（画风 + 资产 + 锚点 + 画质锁定）
  - submit_image_task           # 入队图像生成任务
  - wait_image_task             # 等待完成
  - save_asset_image            # 保存到 characters/<id>/reference.png 等
  - update_asset_meta           # 更新 meta.json 状态
---

# 视觉资产生成指南

> 灵感来源：`lumenx` Step 3 "Assets"（先全身→三视图→头像）+ `moyin` 6 层身份锚点 + `BigBanana` 衣橱系统 + `Toonflow` 画风包。
>
> **核心原则**：先生成"角色身份签名"（一张全身定妆图），再以这张为参考衍生其他视图（三视图、头像、不同服饰、不同场景中的角色）。**所有衍生图必须以定妆图为参考输入，避免身份漂移。**

---

## 工作模式（按 target 参数分发）

### `target=character` —— 角色定妆（最复杂、最重要）

#### 视觉资产是按 weight 强制必产的，不是"可选"

视觉四件套（reference / three_views / avatar / wardrobe）的产出由角色 weight 决定，由 [`packages/asset-spec/character.yaml § weight_tier`](../../packages/asset-spec/character.yaml) 强制约束：

| Tier | weight | reference.png | three_views.png | avatar.png | wardrobe/*.png | 总图数 |
|---|---|---|---|---|---|---|
| **A · 主角** | ≥ 7 | ✅ 必产 | ✅ **必产** | ✅ **必产** | ✅ **必产**（按 wardrobe[] 全套）| ≥ 5 |
| **B · 重要配角** | 4–6 | ✅ 必产 | ✅ **必产** | ✅ **必产** | ✅ **必产**（≥ 2 套：default + 主要场合服）| 5 |
| **C · 群演** | ≤ 3 | ✅ 必产 | ⚪ 可选 | ✅ **必产** | ❌ 不产（用 reference + 临时换装词）| 2 |

> ⚠️ **为什么 three_views / avatar 不能可选**：
> - 没有 three_views，08-keyframe 在生成"背身走位 / 侧脸特写 / 转头镜头"时只能从正面图反推 → 必漂
> - 没有 avatar，09-video 的中景/特写/对话镜头（占短剧 70%+ 镜头）面部分辨率不够 → 必糊
> - 没有 wardrobe，跨场景换装每次现拼 → 战斗服时而铠甲时而布衣，必崩
>
> 如果用户预算紧张，由 02-show-planner 的 `asset_quality_tier=economy` 整体降档（仅主角保留四件套），**不要在 Skill 里"按需省略"**。

#### 严格生成顺序（不可跳过、不可并行）

```
Step 1: reference.png  ← 文生图，纯背景，全身正面（基准图，所有衍生图的 IPAdapter 输入）
        │
        │  ⚠️ Step 1 一致性 check 不过 → 重试或 needs_review，不要继续
        ↓
Step 2: three_views.png ← 图生图，输入 reference.png + "三视图布局" prompt
Step 3: avatar.png      ← 图生图，输入 reference.png，构图为头肩特写
Step 4: wardrobe/*.png  ← 图生图，输入 reference.png + 替换 clothing 字段
```

**Step 2-4 必须以 Step 1 为参考，且必须串行依次生成**。Step 1 完成后 Step 2-4 才允许并行（都以 Step 1 为输入）。

#### 每张图的具体规格

| 图 | 构图 | 分辨率（按 plan.aspect_ratio） | 关键 prompt 要素 |
|---|---|---|---|
| reference.png | 全身正面 + T-pose | 9:16 → 1080×1920；16:9 → 1920×1080 | 6 层锚点 + 中性背景 + 标准光照 |
| three_views.png | 正面/侧面/背面 横向并排 | 与 ratio 适配，宽 ≥ 2400 | "three view sheet, front side back, identical character" |
| avatar.png | 头肩特写，正脸 | 1024×1024 方图 | 6 层锚点（face_shape / hair_signature 加权）+ neutral expression |
| wardrobe/<id>.png | 全身展示该 outfit | 与 reference 同 | 仅替换 clothing 字段，其他 5 层锚点保持 |

#### Prompt 拼接公式（全身定妆）

```
[画风 prefix.md]
+ [art_prompt/art_character.md 模板]
+ [character.appearance（来自 04-asset-extractor）]
+ [identity_anchors 6 层锚点全部展开]
+ "full body, neutral pose, standing, plain neutral background, T-pose preferred"
+ "no background distractions, no other characters"
+ [画风的画质锁定词]
+ [画风的负向词]
```

### `target=scene` —— 场景图

```
Step 1: 读 scene.prompt_en + scene.location/time/ambience/lighting
Step 2: 拼 prompt = [画风 prefix] + [art_scene.md 模板] + scene 字段
Step 3: 单张文生图，纯背景无人
Step 4: 保存到 scenes/<id>/reference.png
```

### `target=prop` —— 道具图

```
Step 1: 读 prop.description + prop.prompt_en
Step 2: 拼 prompt = [画风 prefix] + [art_prop.md 模板] + prop 字段
Step 3: 单张文生图，纯背景或 isolated on white
Step 4: 保存到 props/<id>/reference.png
```

---

## 6 层身份锚点的注入（角色专用）

仿 moyin-creator，把 `identity_anchors` 转为正向词：

| 锚点字段 | 转 prompt 示例 |
|---|---|
| face_shape: "椭圆 + 尖下巴" | `oval face with pointed chin` |
| hair_signature: "齐耳短发 + 右侧发卡" | `chin-length bob hair, hairpin on right side` |
| color_palette: "#1F2937 + #F59E0B" | `dark navy and amber color scheme` |
| silhouette: "高瘦 + 直立姿态" | `tall slim silhouette, upright posture` |
| signature_prop: "金丝眼镜" | `gold-rimmed glasses` |
| scene_context: "图书馆/书房" | `(used as fallback only when no scene specified)` |

锚点词必须**全部进 prompt**，并且每次（reference / three_views / avatar / wardrobe / 后续 storyboard）都重复注入，是身份一致的最强保证。

---

## 衣橱（wardrobe）逻辑

角色资产的 `wardrobe` 字段是一个数组：

```yaml
wardrobe:
  - outfit_id: casual
    description: 白 T 恤 + 牛仔裤
    occasion: 日常
  - outfit_id: formal
    description: 黑色西装 + 白衬衫
    occasion: 重要场合
  - outfit_id: combat
    description: 古装战袍
    occasion: 打斗场面
```

每套服饰：
1. 以 `reference.png`（基准图）为图生图参考
2. Prompt 在 6 层锚点基础上 **替换 `appearance.clothing`**
3. 输出 `characters/<id>/wardrobe/<outfit_id>.png`

后续 08-keyframe-generator 会按 shot 的 `outfit_id` 选取对应的衣橱图作为 IPAdapter 参考输入。

---

## 一致性校验（重要！）

每张图生成后必须做 **一致性 check**：

| 检查项 | 方法 |
|---|---|
| **face similarity** | 用 ArcFace / MTCNN 提取 reference.png 与新图的人脸特征向量，cosine ≥ 0.7 |
| **color palette match** | 抽取主色 vs identity_anchors.color_palette 的 hex，ΔE ≤ 25 |
| **signature_prop present** | 用 CLIP 检测标志性道具是否出现（avatar/全身必检） |

如果 check 失败：
- 自动重试 1 次（增强锚点词权重）
- 仍失败则 flag 为 `needs_review` 返回给 Orchestrator，让用户决定

---

## 输出给 Orchestrator 的摘要

```json
{
  "status": "success",
  "summary": {
    "characters_generated": 3,
    "scenes_generated": 4,
    "props_generated": 2,
    "consistency_warnings": [
      { "asset_id": "char_001", "issue": "face similarity 0.65 (target ≥ 0.7)" }
    ]
  },
  "artifacts": [
    "characters/char_001/reference.png",
    "characters/char_001/three_views.png",
    "characters/char_001/avatar.png",
    "characters/char_001/wardrobe/casual.png",
    "characters/char_002/reference.png"
  ],
  "next_action_hint": "07-storyboard-breaker"
}
```

---

## 性能与成本控制

### 单角色成本（按 tier 分级）

| Tier | 图数 | 单角色成本（Seedream 5.0）|
|---|---|---|
| A · 主角 | 5+（含 ≥2 套衣橱）| ¥2.5–4.0 |
| B · 重要配角 | 5（reference + 三视图 + 头像 + 2 套衣橱）| ¥2.0 |
| C · 群演 | 2（reference + avatar）| ¥0.6 |

典型短剧 12 个角色（2 主 + 5 配 + 5 群）≈ **¥21**。

### 并发与串行约束

- **跨角色并行**：N 个角色可并行处理（不超过 image_channel.concurrency）
- **单角色内必须串行**：Step 1 → 2/3/4
- **Step 2-4 之间允许并行**（都以 Step 1 为参考）
- **失败重试上限 = 2**，超过 flag `needs_review` 不阻塞其他角色

### 画风模型选择

按画风包 `style_meta.yaml.recommended_models.image` 优先级尝试：
1. primary 失败 → fallback
2. fallback 失败 → flag `needs_review`，由 Orchestrator 询问用户

### 成本预警

如果该项目所有角色四件套总成本 ≥ ¥30，必须先报给 Orchestrator 由其向用户确认（特别是预算 ≤ ¥1000 的小项目）。

---

## Batch 与候选机制（抽卡）

仿 lumenx 的"抽卡机制"：reference.png 是后续所有衍生图的基准，质量不稳定的话整链路都崩。**关键资产支持 batch_size > 1**：

| 资产 | 默认 batch | 推荐 batch（按 weight） | 说明 |
|---|---|---|---|
| **char.reference.png（主角，weight ≥ 7）** | 1 | **3** | 抽卡 3 张让用户挑最佳，定基准 |
| char.reference.png（配角/群演） | 1 | 1 | 默认 |
| char.three_views.png | 1 | 1 | 严格依赖 reference，不抽 |
| char.avatar.png | 1 | 1 | 同上 |
| char.wardrobe/*.png | 1 | 1 | 同上 |
| scene.reference.png（主场景） | 1 | 2 | 主场景影响 80%+ 镜头，可抽 |
| scene.reference.png（衍生场景） | 1 | 1 | 默认 |
| prop.reference.png（plot_critical 道具） | 1 | 2 | 关键线索道具可抽 |
| prop.reference.png（普通） | 1 | 1 | 默认 |

### 候选目录结构

```
characters/<id>/
  candidates/                           ← 抽卡产物
    reference_v1.png
    reference_v2.png
    reference_v3.png
  reference.png                         ← 用户挑选后的最终版（symlink 或 copy）
  three_views.png                       ← 基于已挑选的 reference.png 生成
  ...
```

### 用户挑选流程

batch_size > 1 时，**禁止自动选择**：
1. 生成所有候选到 candidates/ 目录
2. 输出给 Orchestrator：`status: "needs_pick"`
3. Orchestrator 把候选展示给用户，等待挑选
4. 用户挑完 → 升级为 reference.png + 删除其他候选
5. 然后才进入 Step 2-4（three_views / avatar / wardrobe）

> ⚠️ 不要在 batch 没挑选的情况下提前生成 three_views——必须等 reference 锁定。

---

## 前置状态依赖（readiness_status）

按 [`packages/asset-spec/shot.yaml`](../../packages/asset-spec/shot.yaml) 的状态机：

- 角色资产产出后：每个角色的 meta.json 写入 `readiness_status: assets_complete`
- 06 启动条件：所有 weight ≥ plan.asset_quality_tier 阈值的角色 meta 已存在（来自 04）
- 06 完成条件：每个角色的视觉资产按 tier 全部生成完成 + 一致性 check 通过

如果用户后续改了某角色的 `appearance` 或 `identity_anchors`：
- 该角色所有视觉资产 invalidate（reference / three_views / avatar / wardrobe）
- 所有引用该角色的 shot 状态回退到 `storyboard_locked`（详见 shot.yaml § rollback_rules）

---

## 反模式

❌ 跳过 Step 1 直接生成三视图/头像（无参考图，必漂移）  
❌ 忘记注入 6 层锚点（一致性必差）  
❌ 把场景词混入角色 prompt（角色应该是纯人物 + 中性背景）  
❌ 不做 face similarity 校验（漂移问题积累到分镜阶段才暴露太晚）  
❌ 一个角色 wardrobe 不参考 reference.png 各自独立生成（会成多个不同的人）

---

## 画风切换的特殊处理

如果用户在角色定妆完成后切换画风：
- **必须**重新生成所有 reference.png（旧画风的资产不能用）
- 给用户警告："切换画风将作废现有 6 个角色的定妆图，约 ¥10 成本，确认？"
- 不要默默重做
