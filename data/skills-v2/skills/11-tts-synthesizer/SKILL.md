---
name: tts-synthesizer
skill_id: "11-tts-synthesizer"
version: "2.0"
phase: "M3"
inputs: [shot_dialogue, character_voice, sound_effects]
outputs: [shot_audio.wav]
dependencies: [09-video-generator, 10-voice-assigner]
description: TTS 配音合成。按分镜顺序为每条 dialogue 合成音频，并对齐到对应 video_clip 时长。当角色已分配 voice 但 audio 缺失时使用。
agent_type: subagent
required_tools:
  - read_shot_dialogue            # 读分镜的 dialogue + character_ids
  - read_character_voice          # 读 character.voice_id 或 cloned_voice_path
  - submit_tts_task               # 入队 TTS 任务
  - wait_tts_task
  - align_audio_to_duration       # 时长对齐（拉伸/压缩 ≤ 10%）
  - mix_audio_with_sfx            # 混入 sound_effect / bgm
  - save_shot_audio
---

# TTS 配音合成指南

> 灵感来源：`huobao-drama` MiniMax TTS adapter + `Pixelle-Video` Edge-TTS / Index-TTS pipeline。

---

## 工作流程（按 shot 串行）

```
for shot in shots:
    audios = []
    for line in shot.dialogue:
        # 处理画外音/旁白
        if line.character == "旁白" or line.character.startswith("voice:"):
            voice_id = project.narration_voice_id
        else:
            voice_id = read_character_voice(line.character)

        # TTS 合成
        task = submit_tts_task(
            voice_id=voice_id,
            text=line.line,
            emotion=line.emotion,           # MiniMax 等支持情感参数
            speed=auto_calc_speed(line, shot.duration_sec),
        )
        audio = wait_tts_task(task)
        audios.append((line, audio))

    # 拼接 + 对齐 + 混音
    track = concat_audios(audios, gap_ms=300)        # 对白间隔
    track = align_audio_to_duration(track, shot.duration_sec, max_stretch=0.1)
    if shot.sound_effect:
        track = mix_audio_with_sfx(track, shot.sound_effect, sfx_volume=-15)  # dB
    save_shot_audio(shot.id, track)
```

---

## 关键约束

### 1) 时长对齐
对白合成后总时长应 ≈ video_clip 时长。误差控制：

| 偏差 | 处理 |
|---|---|
| ±10% 内 | 用 atempo 拉伸/压缩（不改音调） |
| 10–20% | 拉伸 + 提示用户该镜头节奏可能轻微违和 |
| > 20% | 失败：建议拆分 shot 或缩短台词 |

### 2) 角色一致性
**同一角色在所有 shot 必须使用同一 voice_id 与同一情感/语速基线。**

不要为了某句台词临时换音色（除非剧情需要）。

### 3) 旁白特殊处理
- drama 模式中的 `<voice>角色名</voice>` 标签 → 用对应角色的 voice_id 合成
- narration 模式整段都是旁白 → 用 `project.narration_voice_id`（在项目设置中预指定）

### 4) 多语言
如果 character 有 `target_language` 字段（来自 03-script-writer 的多语翻译），TTS 必须用对应语言的音色。**不要用中文音色读英文文本**（多数 TTS 会失败或拼读异常）。

---

## 情感参数注入

不同 TTS 供应商情感支持不同，做接入层兼容：

| 供应商 | 情感支持方式 |
|---|---|
| MiniMax | 显式 `emotion` 参数（happy/sad/angry/...） |
| Index-TTS | 通过情感参考音频或风格 token |
| Edge-TTS | 通过 SSML `<mstts:express-as style="...">` |
| OpenAI TTS | 不支持情感 → 通过 prompt 工程（"sadly say:..."） |
| Volcengine | 显式 `emotion` 参数 |

`submit_tts_task` 工具应封装这些差异，对上层统一接口。

---

## 音效与 BGM 混音（C4 模块的入口）

每个 shot 的 `sound_effect` 字段（来自 07-storyboard-breaker）：

```yaml
sound_effect: 重喘息声 + 心跳加速 + 风吹窗帘
```

处理：
1. 用 LLM/规则把短语拆为音效查询：`["heavy breathing", "fast heartbeat", "wind blowing curtains"]`
2. 从内置音效库（仿 Pixelle `bgm/`）+ Freesound API 检索匹配音频
3. 混入 dialogue 轨道，dialogue 优先级 0dB，sfx 默认 -15dB

BGM（背景音乐）由 12-video-composer 在拼接成片时统一加，**不在 shot 级处理**。

---

## 多角色对话的处理

```yaml
shot_007.dialogue:
  - { character: 林小红, emotion: 喘息, line: "又是这个梦…" }
  - { character: 陆寒, emotion: 平静, line: "梦到什么了？" }
  - { character: 林小红, emotion: 哽咽, line: "我看见…自己死了。" }
```

合成顺序：严格按 dialogue 数组顺序，逐条合成 → 拼接（line 间默认 300ms 间隔，可由 `pause_after_ms` 字段覆盖）。

---

## 输出给 Orchestrator 的摘要

```json
{
  "status": "success",
  "summary": {
    "shots_with_dialogue": 9,
    "audios_generated": 9,
    "speakers_used": { "林小红": 4, "陆寒": 3, "旁白": 2 },
    "duration_offset_warnings": 1,
    "estimated_cost_cny": 0.5
  },
  "artifacts": "projects/xx/storyboards/episode_1/<shot_id>/audio.wav",
  "warnings": [
    "shot_007: 对白合成后 12.3s，但 video_clip 仅 10s，已用 atempo 压缩到 1.0x"
  ],
  "next_action_hint": "12-video-composer"
}
```

---

## 反模式

❌ 不做时长对齐（视频结束了对白没说完）  
❌ 同角色多 shot 跨用不同 voice_id  
❌ 把 narration 用 character voice 配（违和）  
❌ 高估 TTS 速度自由度（atempo > 1.15 会变 chipmunk）  
❌ 把 BGM 混进 shot 级 audio（应该统一在成片时混）  
❌ 中文文本用英文音色合成
