---
name: video-composer
skill_id: "12-video-composer"
version: "2.0"
phase: "M3"
inputs: [episode_script, video_clips, audio_clips, bgm, production_plan]
outputs: [output/episode_N.mp4, paywall_cover, jianying_draft]
dependencies: [09-video-generator, 11-tts-synthesizer]
description: 把已生成的视频片段按剧本顺序拼接为单集成片，处理转场（cut/fade/dissolve/wipe）、混入对白音轨与可选 BGM，输出 mp4 与剪映草稿。当所有 shot 完成时使用。
agent_type: utility
content_modes: [drama]
required_tools: []                # 这是 utility skill，所有逻辑都在 scripts/compose_video.py 内完成，可不依赖 LLM tool
---

# 视频拼接 / 成片合成指南

> 灵感来源（强烈推荐看原文件）：[`ArcReel/agent_runtime_profile/.claude/skills/compose-video/SKILL.md`](https://github.com/ArcReel/ArcReel)。
>
> 本 Skill 是 **utility 类**（确定性脚本，不需要 LLM 推理），可由 Orchestrator 直接调用对应 Python/TS 脚本，无需走 Subagent 路径。

---

## 适用范围（重要）

- ✅ **drama 模式** —— 顶层 `scenes[]` / `shots[]`，按剧本顺序拼接
- ❌ **narration 模式** —— 走单独的 narration composer（按朗读节奏拼）
- ❌ **多集合并** —— 不支持，每集独立拼接

如果只是想做 narration 内容，请用 `narration-composer.py`（同目录，待 M1 阶段实现）。

---

## CLI 用法（更新）

脚本必须在含 `project.json` 的项目 cwd 内运行：

```bash
# 默认：含片头/Recap/Tease/片尾 + 字幕烧录（按 plan.target_platform）
python scripts/compose_video.py scripts/episode_8.json

# 关闭片头片尾（拍样片用）
python scripts/compose_video.py scripts/episode_8.json --no-intro --no-outro

# 关闭字幕烧录（仅在平台允许时）
python scripts/compose_video.py scripts/episode_8.json --no-burn-subtitles

# 关闭 Recap（独立单集预览）
python scripts/compose_video.py scripts/episode_8.json --no-recap

# 自定义 BGM
python scripts/compose_video.py scripts/episode_8.json --music background.mp3

# 同时输出付费墙封面（仅付费集，自动检测）
python scripts/compose_video.py scripts/episode_8.json --emit-paywall-cover

# 同时导出剪映草稿
python scripts/compose_video.py scripts/episode_8.json --emit-jianying
```

### 完整参数

| 参数 | 类型 | 说明 |
|---|---|---|
| `script` | 位置参数（必填） | 剧本文件路径 |
| `--output OUTPUT` | 可选 | 输出文件名 |
| `--music MUSIC` | 可选 | BGM 文件路径（覆盖 11a 的 BGM 决策）|
| `--no-intro` | flag | 关闭片头 Logo |
| `--no-outro` | flag | 关闭片尾 Logo |
| `--no-recap` | flag | 关闭上集回顾（首集自动关闭） |
| `--no-tease` | flag | 关闭下集预告（末集自动关闭） |
| `--no-burn-subtitles` | flag | 关闭字幕烧录（仅在平台允许时） |
| `--no-transitions` | flag | Body 内部全部用 cut（覆盖 transition_to_next） |
| `--emit-paywall-cover` | flag | 付费集额外输出付费墙封面 |
| `--emit-jianying` | flag | 同时输出剪映草稿 ZIP |
| `--quality {low,med,high}` | 可选 | 输出质量预设（CRF 26/22/18） |
| `--resolution WxH` | 可选 | 强制输出分辨率（默认按 plan.aspect_ratio） |

---

## 工作流程（专业短剧拼接结构）

### 完整成片结构（按 plan.target_platform 自动注入）

```
┌──────────────────────────────────────────────────────────────┐
│ [00:00 - 00:02]  片头 Logo（intro）                          │
│ [00:02 - 00:07]  上集回顾 Recap（仅 ep ≥ 2，从 ep_{N-1} 自动剪）│
│ [00:07 - 00:12]  Cold Open（剧本 beat_role=cold_open）       │
│ [00:12 - 00:22]  Hook（剧本 beat_role=hook）                 │
│ [00:22 - 01:07]  Rising Action（剧本主体）                   │
│ [01:07 - 01:27]  Climax（剧本 beat_role=climax）             │
│ [01:27 - 01:37]  Cliffhanger（剧本 beat_role=cliffhanger）   │
│ [01:37 - 01:42]  下集预告 Tease（仅 ep < N_total）           │
│ [01:42 - 01:44]  片尾 Logo（outro）                          │
│                                                                │
│ 全程：字幕烧录（按 plan.target_platform 决定）                │
└──────────────────────────────────────────────────────────────┘
```

### 详细步骤

```
1. 加载 + 校验
   - 剧本 episode_<N>.json (drama schema)
   - 所有 shot 的 readiness_status == shot_ready（不齐则报错）
   - plan.target_platform / plan.paywall

2. Normalize：所有 clip 转码为统一编码 (H.264 / AAC, 30fps, plan.aspect_ratio)

3. 构建 5 段时间线
   3a. 片头 Logo                       ← 来自 templates/<aspect>/intro.mp4
   3b. 上集回顾 Recap (仅 ep ≥ 2)
        ↳ 自动从 ep_{N-1}.cliffhanger 的 video_clip 抽 5s
        ↳ 加快 1.5×，叠 "前情提要" 字幕
   3c. 主体 Body（按 shot.sequence 顺序拼接 + transitions）
   3d. 下集预告 Tease (仅 ep < total_episodes)
        ↳ 来自 ep.paywall_meta.next_episode_tease 文本（来自 03）
        ↳ 视觉：从 ep_{N+1} 的关键 shot 抽 3-5s 快剪（如已生成）；否则用占位"下集精彩继续"
        ↳ 叠 conversion_copy 文字（付费集独享）
   3e. 片尾 Logo                       ← 来自 templates/<aspect>/outro.mp4

4. 拼接 + 转场
   - Recap → Body 用 fade（强制，体验过渡）
   - Body 内部按 shot.transition_to_next（cut/fade/dissolve/wipe）
   - Body → Tease 用 fade（强制）
   - 其他段落都用 cut

5. 混音
   - dialogue_track（已含 sfx，来自 11）：0 dB
   - bgm_track（来自 11a-bgm-builder）：auto-ducking
   - 片头/片尾用 logo BGM 替代

6. 字幕烧录（关键，按平台规则）

7. 输出
   - mp4 → output/episode_<N>.mp4
   - 付费集：额外输出付费墙封面 output/episode_<N>.paywall_cover.png（来自 cliffhanger 的最后一帧）
   - 可选：剪映草稿 .jianying.zip
```

---

## 字幕烧录（subtitle burn-in）

### 何时强制烧录

| plan.target_platform | 默认行为 | 是否可关闭 |
|---|---|---|
| 抖音 / 快手 / 小程序 | **强制烧录** | ❌（平台审核要求） |
| 红果 / 西瓜短剧 | 强制烧录 | ❌ |
| 优酷 / 腾讯 / 爱奇艺 长剧短剧 | 默认外挂 .srt | ✅（用户可改烧录） |
| 海外平台 | 烧录英文 + 外挂源语言 | 部分可改 |

通过 `--no-burn-subtitles` 可手动关闭（仅在平台允许时）。

### 字幕来源与时间戳

来自 11 的 audio 段（每段已对应一句 dialogue + 起止时间戳）：

```python
subtitle_entries = [
    {
        "shot_id": "ep8_shot_007",
        "start_sec": 67.2,
        "end_sec": 70.5,
        "text": "等很久了吗？",
        "speaker": "苏婉清",
    },
    ...
]
```

### 样式（按 plan.aspect_ratio）

| ratio | 字幕位置 | 字号 | 描边 |
|---|---|---|---|
| 9:16 | 距底 220px | 56px（1080 宽度） | 黑 4px + 白 2px |
| 16:9 | 距底 80px | 42px（1920 宽度） | 黑 3px + 白 1px |
| 1:1 | 距底 100px | 48px | 黑 3px + 白 2px |

### FFmpeg 实现（drawtext vs subtitles 滤镜）

短剧推荐用 **`subtitles` 滤镜读 .ass 文件**（样式自由度高）而非 drawtext：

```bash
# 1. 把 11 的时间戳数据先写为 .ass
ffmpeg -i input.mp4 -vf "subtitles=subs.ass:force_style='Fontname=PingFang SC,FontSize=56,PrimaryColour=&Hffffff,OutlineColour=&H000000,BorderStyle=1,Outline=4,Shadow=0,MarginV=220'" -c:a copy output.mp4
```

`.ass` 比 `.srt` 灵活（支持中文字体、描边、阴影、位置），是专业短剧标配。

### 字幕预处理

写入 .ass 之前对每条字幕做：
- 长度限制：每行 ≤ 14 字（竖屏） / 18 字（横屏）；超过的句子拆 2 行
- 标点：去掉句末"。"，保留"？""！"
- 拟声词处理：`(笑)` `(叹气)` 不进字幕
- 旁白/独白用斜体

---

## 付费集封面（paywall cover）

`is_paywall_hook=true` 的集额外输出 `output/episode_<N>.paywall_cover.png`：

- **视觉**：cliffhanger shot 的关键 1 帧（自动从 ep.scenes[-1].shots[-1].clip.mp4 抽末帧）
- **叠加文字**：来自 ep.paywall_meta.conversion_copy（如"下一秒苏婉清放出更狠的一招"）
- **用途**：上传到平台后台的"付费墙封面"

字体 + 排版规范：见 `templates/<aspect>/paywall_cover.html`（M1 阶段实现）。

---

## CLI 用法（更新）

---

## 转场映射（仿 ArcReel）

| `transition_to_next` | ffmpeg 命令 |
|---|---|
| `cut` 或缺省 | concat 直接拼接 |
| `fade` | `xfade=transition=fade:duration=0.5` |
| `dissolve` | `xfade=transition=dissolve:duration=0.5` |
| `wipe` | `xfade=transition=wipeleft:duration=0.5` |

xfade 滤镜对编码一致性敏感。Step 3 的 normalize 是必需的（否则 xfade 会报"timestamp differs"）。

---

## BGM 混音逻辑

```
final_audio = mix(
    dialogue_track,    # 0 dB
    bgm_track,         # auto-ducking: 对白时 -18 dB, 其他 -10 dB
    sfx_track,         # 已在 11-tts-synthesizer 阶段混入 dialogue_track
)
```

Auto-ducking 用 `sidechaincompress` 滤镜：dialogue 出现时 BGM 自动降低音量。

---

## 剪映草稿导出（--emit-jianying）

仿 ArcReel `lib/jianying_draft_service.py`：

输出 ZIP 包含：
```
episode_1.jianying/
  draft_content.json        # 时间线
  draft_meta_info.json
  manifest.json
  resources/
    video_001.mp4
    video_002.mp4
    ...
    audio_001.wav
    bgm.mp3
```

支持剪映 5.x / 6+ 双版本格式（按用户配置选择）。

---

## 前置检查（脚本会自动跑）

- [ ] 当前 cwd 是项目根（含 `project.json`）
- [ ] 剧本 content_mode == "drama"
- [ ] 每个 shot 的 video_clip 存在
- [ ] 每个有 dialogue 的 shot 有 audio
- [ ] `ffmpeg` / `ffprobe` 在 PATH
- [ ] 如指定 `--music`，BGM 文件存在且位于项目目录内（防路径越界）

---

## 输出给 Orchestrator 的摘要

由于这是 utility 类 Skill，直接通过脚本退出码与 stdout 报告：

```json
{
  "status": "success",
  "output_path": "output/episode_1.mp4",
  "duration_sec": 124.5,
  "resolution": "1080x1920",
  "shots_used": 11,
  "transitions_used": { "cut": 7, "fade": 3, "dissolve": 1 },
  "jianying_draft_path": "output/episode_1.jianying.zip",
  "file_size_mb": 18.7
}
```

---

## 缺失能力（明确不支持）

如果用户需要以下能力，建议导出剪映草稿继续后期：

- ❌ narration / reference_video 模式（本脚本只识别 drama）
- ❌ 多集合并 / 单集分片裁剪
- ❌ 字幕渲染（让用户在剪映加，可视化更友好）
- ❌ 片头片尾 intro/outro
- ❌ BGM 多轨道与精细的音量自动化
- ❌ 转场之外的 VFX（粒子/光效）

---

## 反模式

❌ 跳过 normalize 直接 xfade（编码不一致会失败）  
❌ BGM 不做 ducking（盖住对白）  
❌ 输出文件不固定路径（output/ 是约定，不要写到 cwd 根目录）  
❌ 项目目录外的 BGM 路径（路径越界，安全风险）  
❌ 把转场 duration 写得太长（> 1s 节奏崩坏）

---

## 实现参考

`scripts/compose_video.py` 的 skeleton（伪代码，待 M1 实现）：

```python
import argparse, ffmpeg, json
from pathlib import Path

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("script")
    parser.add_argument("--output")
    parser.add_argument("--music")
    parser.add_argument("--no-transitions", action="store_true")
    parser.add_argument("--emit-jianying", action="store_true")
    args = parser.parse_args()

    project_root = find_project_root()
    script = json.load(open(project_root / args.script))
    assert script["content_mode"] == "drama", "only drama supported"

    clips = []
    for scene in script["scenes"]:
        for shot in scene["shots"]:
            clip_path = project_root / "storyboards" / f"ep{script['episode_id']}" / shot["shot_id"] / "clip.mp4"
            assert clip_path.exists(), f"missing {clip_path}"
            clips.append((clip_path, shot["transition_to_next"], shot.get("audio_path")))

    # 1. normalize
    normalized = [normalize_clip(c) for c, _, _ in clips]
    # 2. concat with transitions
    if args.no_transitions:
        video = concat_cut(normalized)
    else:
        video = concat_with_xfade(normalized, [t for _, t, _ in clips])
    # 3. mix audio
    audio = mix_dialogue([a for _, _, a in clips])
    if args.music:
        audio = mix_bgm(audio, project_root / args.music)
    # 4. output
    out = project_root / "output" / (args.output or f"episode_{script['episode_id']}.mp4")
    ffmpeg.output(video, audio, str(out), vcodec="libx264", crf=22, acodec="aac").run()
    # 5. jianying
    if args.emit_jianying:
        emit_jianying_draft(script, normalized, audio, out.with_suffix(".jianying.zip"))
```
