---
name: voice-assigner
skill_id: "10-voice-assigner"
version: "2.0"
phase: "M3"
inputs: [characters, voice_library, tts_provider]
outputs: [character.voice_id, character.cloned_voice_path]
dependencies: [04-asset-extractor]
description: 角色音色分配。从可用 TTS 音色库中为每个角色分配最合适的音色，遵循性别/年龄/性格匹配原则。当角色就绪但 voice_id 缺失时使用。
agent_type: subagent
required_tools:
  - list_voices                # 列出所有可用音色（按 TTS 供应商）
  - read_characters            # 读取角色（含性别/年龄/性格标签）
  - preview_voice              # 试听音色样本
  - assign_voice               # 写回 character.voice_id
---

# 角色音色分配指南

> 灵感来源：`huobao-drama` `voice_assigner` skill。

---

## 分配原则（按优先级）

1. **性别匹配**（硬约束）：男角色用男声，女角色用女声，特殊角色（机器人/儿童/老人）单独处理。
2. **年龄匹配**：
   - 童声 (≤12)
   - 少年 (13-17)
   - 青年 (18-30)
   - 中年 (31-50)
   - 老年 (51+)
3. **性格匹配**：
   | 性格标签 | 推荐音色风格 |
   |---|---|
   | 活泼/开朗/灵动 | 明亮、有活力、语速偏快 |
   | 沉稳/内敛/严肃 | 低沉、平稳、语速中等 |
   | 温柔/体贴/治愈 | 柔和、甜美、气息感 |
   | 威严/霸气/王者 | 浑厚、有力、低音 |
   | 神秘/冷酷 | 低沉、清冷、留白多 |
   | 邪魅/反派 | 拖音、压低、带笑意 |
4. **角色定位差异化**：
   - 主角用 **辨识度高** 的音色（避免泯然众人）
   - 配角用 **中性、不抢戏** 的音色
   - 同剧不同角色音色之间要有显著区分（避免观众混淆）

---

## 工作流程

```
1. characters = read_characters(project_id)
2. voices = list_voices(provider=project.tts_provider)
3. voice_map = {}                        # voice_id → 已分配次数
4. for char in characters (按 role_type 排序：protagonist > supporting > extra):
     4.1 candidates = filter_voices(voices,
                          gender=char.appearance.gender,
                          age=age_bucket(char.appearance.age_range))
     4.2 candidates = sort_by_personality_match(candidates, char.personality_tags)
     4.3 候选去重：同性别同年龄的角色不用相同音色（除非候选池太小）
     4.4 选择得分最高的 voice
     4.5 assign_voice(char.id, voice.id)
     4.6 voice_map[voice.id] += 1
5. 汇总分配结果给用户
```

---

## 多供应商支持

不同供应商的音色库差异极大。建议在画风/项目设定时确定 TTS 供应商，避免后期切换：

| 供应商 | 强项 | 弱项 |
|---|---|---|
| **MiniMax** | 中文角色音色多、情感细腻、支持声音克隆 | 英文较少 |
| **Index-TTS** | 开源、可本地、声音克隆质量高 | 部署成本高 |
| **Edge-TTS** | 免费、多语言 | 情感表达弱、无克隆 |
| **OpenAI TTS** | 英文质量高 | 中文较弱 |
| **元宝/讯飞/Volcengine** | 中文官方、稳定 | 角色化弱 |

---

## 声音克隆支持

如果用户上传了**参考音频**：

1. 优先调用支持克隆的供应商（MiniMax / Index-TTS / 火山）
2. 把音频文件路径写入 `character.cloned_voice_path`
3. `voice_id` 记为 `cloned:<character_id>` 以示区别
4. 后续 11-tts-synthesizer 检测到 `cloned:` 前缀会自动调用克隆 API

---

## 音色试听（可选用户交互）

用户对音色挑剔时，可以让 Orchestrator 触发：

```
> 我觉得林小红的声音不够温柔，换一个
```

Orchestrator → dispatch 10-voice-assigner with `mode=replace, character_id=char_001, exclude=[原voice_id]`：

1. 列出 5 个备选
2. 调用 `preview_voice` 用同一句台词为每个备选生成 3 秒样片
3. 用户选择后写回

---

## 输出给 Orchestrator 的摘要

```json
{
  "status": "success",
  "summary": {
    "characters_total": 5,
    "assigned": 5,
    "needs_clone": 1,
    "voice_distribution": [
      { "char": "林小红", "voice_id": "minimax_chineseW3", "rationale": "温柔甜美匹配 personality_tags" },
      { "char": "陆寒", "voice_id": "minimax_chineseM7", "rationale": "低沉冷峻匹配冷酷王者人设" }
    ],
    "warnings": []
  },
  "next_action_hint": "11-tts-synthesizer"
}
```

---

## 反模式

❌ 多个角色用同一 voice_id（观众分不清）  
❌ 性别错配（男声配女角色）  
❌ 不考虑年龄（青年角色用老人声）  
❌ 不预留克隆接口（用户后续想换克隆音必须重做）  
❌ 切换 TTS 供应商不重新分配（旧 voice_id 在新供应商不存在）
