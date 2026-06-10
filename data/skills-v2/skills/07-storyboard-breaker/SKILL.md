---
name: storyboard-breaker
skill_id: "07-storyboard-breaker"
version: "2.0"
phase: "M3"
inputs: [episode_script, characters, scenes, art_style]
outputs: [storyboards/episode_N/storyboards.json]
dependencies: [03-script-writer, 06-character-designer]
description: 把单集剧本拆解为分镜序列。每个分镜包含完整的镜头语言字段（景别/角度/运镜）+ 文案/动作/情绪 + 三类提示词（image_prompt / video_prompt / bgm_prompt + sound_effect）。当用户说"拆分镜"、"做storyboard"或剧本生成后使用。
agent_type: subagent
content_modes: [drama, narration]
required_tools:
  - read_storyboard_context     # 读剧本+角色+场景+已有分镜摘要
  - read_art_style              # 读当前画风的导演技法（director_storyboard.md）
  - save_storyboards            # 一次性保存
  - update_storyboard           # 单镜头修改
---

# 分镜拆解指南

> 灵感来源：`huobao-drama` `storyboard_breaker`（最完整字段定义）+ `Toonflow` `director_skills/director_storyboard.md`（情绪→面容词映射、光影氛围词库）。

---

## 拆解原则

1. **单一动作原则**：每个镜头聚焦一个动作或情绪点。
2. **节奏控制**：每个镜头时长 6–15 秒；对白镜头偏 8–12 秒；动作/情绪镜头偏 6–10 秒。
3. **总数控制**：单集 8–15 个分镜（少了细节不够，多了成本爆炸）。
4. **覆盖叙事**：所有 dialogue 行至少出现在一个分镜的 `dialogue` 字段中。
5. **避免连续同一景别**：不要 5 个分镜全是中景；至少穿插 1-2 个特写或全景。

---

## 分镜字段（完整 17 字段，参照 huobao）

```yaml
shot_id: SH001
title: 噩梦惊醒                  # 3-5 字概括
scene_id: S03                    # 关联到剧本场景
sequence: 1                      # 镜头序号

# === 镜头语言 ===
shot_type: close_up              # wide / full / medium / close_up / extreme_close_up
angle: low_angle                 # eye_level / high_angle / low_angle / dutch / over_shoulder
movement: static                 # static / push_in / pull_out / pan / tilt / tracking / handheld

# === 时空 ===
location: 卧室                   # 来自 scene
time_of_day: 深夜
duration_sec: 8

# === 内容 ===
character_ids: [char_001]        # 涉及的角色（来自资产库）
character_outfits:               # 各角色穿什么（来自衣橱）
  char_001: pajamas
prop_ids: [prop_002]             # 涉及的道具
clue_ids: []                     # 涉及的关键线索

action: 林小红从噩梦中惊醒，坐起来，额头满是冷汗，手紧抓被子
dialogue:
  - character: 林小红
    emotion: 喘息
    line: 又是这个梦…
visual_result: 镜头停在她仍然颤抖的手上
atmosphere: 冷蓝色调，仅有一缕窗外月光，气氛压抑

# === 三类提示词（关键！）===
image_prompt: ""                  # 用于首帧/尾帧/宫格图（由 06 生成时填充）
video_prompt: ""                  # 用于视频生成（按 3 秒分段）
bgm_prompt: 紧张悬疑，弦乐持续低音
sound_effect: 重喘息声 + 心跳加速 + 风吹窗帘

# === 转场到下一镜 ===
transition_to_next: cut          # cut / fade / dissolve / wipe

# === 节奏与合并候选标记（08a 必读）===
intensity: 8                     # 1-10，从 03.intensity_curve 继承到 shot 级
beat_role: rising                # cold_open / hook / rising / climax / cliffhanger / normal
mergeable_with_next: false       # 是否可与下一 shot 合并为 grid/multi_shot
                                 # 满足以下全部条件时设 true：
                                 #   - 同 scene_id
                                 #   - 同 character_ids（主角集合一致）
                                 #   - 时间连续（sequence 连续）
                                 #   - 镜头语言相近（不要把 wide 和 close_up 标 mergeable）
                                 #   - 不是 climax 或 cliffhanger（关键 shot 必须独立精控）
```

---

## image_prompt 与 video_prompt 的区别（必读）

**两者不要互相替代**。

### image_prompt
- **用途**：生成 Start/End Frame 或宫格图
- **关键**：单帧构图、角色外观、环境、光线（无运动）
- **示例**：
  ```
  Close-up shot, low angle, young woman with chin-length black hair sitting upright in bed,
  cold sweat on forehead, pajamas, gripping blanket, blue moonlight from window,
  empty bedroom in background, fearful expression, [画风锚点], [画质锁定词]
  ```

### video_prompt
- **用途**：图生视频或文生视频时的运动描述
- **关键**：时间推进、动作变化、镜头语言
- **格式**：按 3 秒分段（仿 huobao），用 `<n>` 分隔

```
0-3秒：<location>卧室</location>，特写，<role>林小红</role>从梦中惊醒，猛然坐起，眼神惊恐。
<n>3-6秒：<location>卧室</location>，特写微推，林小红低头看自己颤抖的手，呼吸急促。
<n>6-8秒：<location>卧室</location>，特写定格，手仍在抖，<voice>林小红</voice>："又是这个梦…"
```

标签：
- `<location>X</location>` — 场景标记
- `<role>X</role>` — 出场角色
- `<voice>X</voice>` — 画外音/独白
- `<n>` — 时间段分隔

---

## 镜头语言变化曲线（避免单调）

按 huobao 经验：

| 单集分镜数 | 推荐节奏 |
|---|---|
| 8-10 | 全景开场 → 中景叙事 → 特写情绪 → 全景收尾 |
| 11-15 | 上面 + 中间穿插 1-2 个 extreme_close_up（关键道具）+ 1 个 over_shoulder（对话） |

**禁止**：
- 连续 ≥ 3 个同 shot_type
- 整集无特写（缺情绪）
- 整集无全景（缺空间感）
- 所有镜头都 static（缺节奏）

---

## 角色绑定与衣橱选取

```python
# Pseudocode
for shot in storyboards:
    # 角色：从剧本 dialogue 中识别说话/出场的人
    shot.character_ids = identify_characters_in_scene(scene_id, action, dialogue)

    # 衣橱：根据 scene 的场合从角色 wardrobe 选择
    for char_id in shot.character_ids:
        shot.character_outfits[char_id] = pick_wardrobe(char_id, scene.occasion)
```

衣橱选择规则（仿 BigBanana 衣橱系统）：
- 战斗场景 → `combat`
- 重要正式场合 → `formal`
- 日常 → `casual`
- 睡眠场景 → `pajamas`
- 不明确时用 default（reference.png 自带）

---

## 场景关联规则

- `scene_id` **必须**从 `read_storyboard_context` 返回的 `scenes` 中选择
- 不要凭空创造新场景 ID
- 如果剧本中明显是新场景但 scene 库没有 → 先 dispatch 04-asset-extractor 补齐再回来

---

## 合并候选检测（为 08a 准备）

07 的核心新职责（v2）：在拆完分镜后，**对每对相邻 shot 标记 `mergeable_with_next`**。这是 08a 决定走 grid 还是单 shot 的输入。

```python
def mark_mergeable(shots):
    for i in range(len(shots) - 1):
        a, b = shots[i], shots[i+1]
        a.mergeable_with_next = (
            a.scene_id == b.scene_id
            and set(a.character_ids) == set(b.character_ids)
            and a.beat_role not in ("climax", "cliffhanger")
            and b.beat_role not in ("climax", "cliffhanger")
            and abs(a.shot_type_to_int() - b.shot_type_to_int()) <= 1   # 镜头语言不能跨度太大
            and a.character_outfits == b.character_outfits              # 同套衣橱
        )
    shots[-1].mergeable_with_next = false   # 最后一个 shot 永远 false
```

08a 在做 grid 合并时，会从 `mergeable_with_next == true` 的连续段提取最长合并组（最多 9 个）。

### `intensity` 字段的来源

`intensity` 不是 07 凭空判断的，而是从 03-script-writer 的 `intensity_curve`（每集级）继承下来，再在 shot 级微调：

```python
shot.intensity = clamp(
    episode.intensity                                     # 该集基础强度（来自 03）
    + (3 if shot.beat_role == "climax" else 0)
    + (2 if shot.beat_role == "cliffhanger" else 0)
    + (1 if shot.beat_role == "hook" else 0)
    - (1 if shot.beat_role == "cold_open" else 0)
    - (2 if shot.beat_role == "normal" else 0),
    1, 10
)
```

`intensity ≥ 9` 的 shot 会被 08a 自动 `locked: true`（不允许降档）。

---

## drama 与 narration 的差异

### drama
按场景 → 镜头层级。每个 scene 拆 1-3 个 shot。

### narration
直接按朗读节奏拆。每个 NarrationSegment 对应 1 个 shot：
- shot_type 多用 wide/full（说书风）
- 较多 push_in / pull_out
- dialogue 字段 = narration（用 voice 标签包裹）

---

## 输出给 Orchestrator 的摘要

```json
{
  "status": "success",
  "summary": {
    "shots_count": 11,
    "total_duration_sec": 124,
    "shot_type_distribution": {
      "wide": 2, "full": 2, "medium": 4, "close_up": 2, "extreme_close_up": 1
    },
    "warnings": [
      "shot_005 与 shot_006 都是 medium，建议中间插一个特写"
    ]
  },
  "artifact_path": "projects/xx/storyboards/episode_1/storyboards.json",
  "next_action_hint": "08-keyframe-generator"
}
```

---

## 反模式

❌ 把 image_prompt 当 video_prompt 复用（没有时间维度，会生成静止画面）  
❌ 不填 character_outfits（衣橱信息丢失，下游会用错服饰）  
❌ 一个 shot 时长 30 秒（视频模型大多最大 8-15s）  
❌ 全集无 close_up（缺情绪表现力）  
❌ scene_id 凭空生成不存在的 ID（下游引用失败）  
❌ video_prompt 不分段（模型难以控制时间推进）
