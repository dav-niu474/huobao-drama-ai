---
name: video-generator
skill_id: "09-video-generator"
version: "2.0"
phase: "M3"
inputs: [keyframes, video_settings, video_prompt]
outputs: [clip.mp4]
dependencies: [08-keyframe-generator]
description: 视频片段生成。为每个分镜调用视频模型（Seedance/Veo/Sora/Kling/Vidu/Wan）生成短视频片段，支持 image2video / first_last / grid / reference_video 多种模式。当 keyframes 就绪而 video_clip 缺失时使用。
agent_type: subagent
required_tools:
  - read_shot_keyframes         # 读分镜的 start/end frame 或宫格输出
  - read_video_settings         # 读项目级视频供应商/分辨率/时长配置
  - compose_video_prompt        # 注入 @ 引用语法，按 3 秒分段
  - submit_video_task           # 入队（注意：video 队列独立通道）
  - wait_video_task
  - save_video_clip
  - check_video_quality         # 自动质检
---

# 视频片段生成指南

> 灵感来源：`huobao-drama` 多供应商 video adapter + `ArcReel` 三种视频模式 + `moyin` Seedance 2.0 多模态引用 + `BigBanana` 关键帧驱动。
>
> 这是整条流水线 **算力消耗最大** 的环节（占总成本 80%+），必须做好成本预估、并发控制、质检。

---

## 前置状态依赖（readiness_status）

按 [`shot.yaml § state_transitions`](../../packages/asset-spec/shot.yaml)，09 的启动条件分两种：

### 路径 A · 标准（依赖 08）
```
shot.readiness_status == keyframes_locked
```
即 08 已生成关键帧并由用户挑选（或单 batch 自动通过）。

### 路径 B · reference_video 跳过 08（来自 08a）
```
keyframe_plan.shot_plans[i].mode == "reference_video"
AND shot.readiness_status == plan_locked
```
跳过 08，09 直接用 character/scene/prop reference.png 生视频。

### 路径 C · multi_shot 合并（仅 Seedance 2.0）
```
keyframe_plan.shot_plans[i].mode == "multi_shot"
AND 该 merge_group 中所有 shot 的 readiness_status >= plan_locked
```
把 2-4 个相邻 shot 合并为一次视频生成调用。

**检测条件**：09 启动前先按 readiness_status 分组：
- `video_pending` 状态的 shot 才进队
- 跨 shot 的 multi_shot 组要等组内全部就位才一起生

---

## Batch 与候选机制（抽卡）

视频比关键帧贵 5-10 倍，**默认 batch_size=1**。但 08a 会标记几类必须 batch：

| batch_size | 适用 | 单 shot 成本估算（Seedance）|
|---|---|---|
| 1（默认） | 普通 shot | ¥1.5 |
| 2 | 大节点 climax shot | ¥3 |
| 3 | 付费集 cliffhanger shot（最后一个）| ¥4.5 |

> 视频 batch ≥ 4 几乎无意义（成本爆炸但边际收益小），08a 的 plan 不会推荐。

### 候选目录

```
storyboards/episode_8/shot_011/
  candidates/
    clip_v1.mp4
    clip_v2.mp4
    clip_v3.mp4
  clip.mp4                            ← 用户挑选后升级
```

### 流程

```
for shot_plan in keyframe_plan.shot_plans:
    if shot.readiness_status not in (keyframes_locked, plan_locked@reference_video):
        skip
        continue

    candidates = []
    for i in range(shot_plan.batch_size):
        prompt = compose_video_prompt(shot, mode, backend, seed=i*1000)
        result = submit_video_task(prompt, frames, backend)
        candidates.append(result)

    quality_results = [check_video_quality(c, shot) for c in candidates]

    if shot_plan.batch_size == 1:
        if quality_results[0].passed:
            save_locked(candidates[0])
            update_readiness(shot, "video_locked")
        else:
            mark_for_review(shot, quality_results[0].issues)
    else:
        save_candidates(shot, candidates, quality_results)
        update_readiness(shot, "video_candidates")
        # 等待用户挑选（batch ≥ 2 永不自动挑）
```

### 用户挑选

| batch | 行为 |
|---|---|
| 1 | 通过 → 锁定；不通过 → needs_review |
| 2-3 | **必须**用户挑选（视频成本高，不能 AI 替决策） |

### 状态机更新

- `keyframes_locked → video_pending`（入队）
- `video_pending → video_candidates`（batch > 1）或 `video_locked`（batch=1 且通过）
- 用户挑选 → `video_locked`

---

## 输入分支（按 generation_mode）

```
generation_mode = ?
├─ image2video        → input: shot.start_frame.png
├─ first_last         → input: shot.start_frame.png + shot.end_frame.png
├─ grid_*             → input: shot.start_frame.png（已从宫格切出）
├─ reference_video    → input: 角色/场景/道具的 reference.png（无分镜）
└─ multi_shot         → input: 多个 shot 资产合并（仅 Seedance 2.0）
```

---

## Video Prompt 工程

仿 huobao + moyin Seedance 2.0：

### 基础结构（按 3 秒分段）

```
0-3秒：<location>{scene}</location>，{shot_type}，<role>{char}</role>{action}，{emotion}。
<n>3-6秒：<location>{scene}</location>，{movement}，{...}。
<n>6-9秒：<location>{scene}</location>，{...}。
```

### Seedance 2.0 多模态引用语法（仿 moyin）

可以在 video_prompt 内嵌入资产引用：

```
0-3秒：@Image:character/林小红 @Image:scene/卧室，特写，林小红从噩梦中惊醒。
<n>3-6秒：@Image:scene/卧室，镜头微推，林小红颤抖的手部特写，@Audio:林小红/喘息声。
<n>6-8秒：@Voice:林小红 "又是这个梦…"
```

| 引用语法 | 含义 |
|---|---|
| `@Image:character/<name>` | 角色定妆图 |
| `@Image:scene/<name>` | 场景图 |
| `@Image:prop/<name>` | 道具图 |
| `@Video:character/<name>` | 角色参考视频（用于 reference_video 模式） |
| `@Audio:<name>/<event>` | 角色或环境音效 |
| `@Voice:<name>` | 角色对白声纹 |

> ⚠️ 不是所有视频模型都支持 @ 语法。Seedance 2.0 / Vidu Q3 Reference 支持；Veo / Sora 大多不支持。  
> 由 `compose_video_prompt` 工具按所选 backend 自动转换：
> - 支持的 backend：保留 @ 语法 + 把引用文件作为 reference 输入
> - 不支持的 backend：把 @ 语法展开为文字描述并把图片作为多 IPAdapter 参考图

### 三层提示词融合（Seedance 2.0 必读）

仿 moyin-creator 的三层融合策略：

1. **动作层**（叙事语言）：林小红从噩梦中惊醒
2. **镜头语言层**（专业术语）：close-up shot, low angle, slight push-in
3. **对白唇形同步层**（仅有对白时）：[lip sync] "又是这个梦…"

最终 prompt = 动作层 + 镜头语言层 + 对白唇形层

### Seedance 2.0 参数约束（必校验）

| 约束 | 上限 |
|---|---|
| 总参考图数（@Image） | ≤ 9 |
| 总参考视频数（@Video） | ≤ 3 |
| 总参考音频数（@Audio） | ≤ 3 |
| prompt 字符数 | ≤ 5000 |

超过会自动剔除优先级低的资产（道具 < 场景 < 角色）。

---

## 双通道队列（重要）

视频任务和图像任务**必须走独立通道**（仿 ArcReel）：

```
GenerationQueue
├─ image_channel  (concurrency=4, RPM=20)   ← 08-keyframe-generator 用
└─ video_channel  (concurrency=2, RPM=4)    ← 09-video-generator 用
```

为什么：
- 视频生成单任务 2-5 分钟，比图像慢一个数量级
- 视频模型 RPM 普遍很低（Veo Free 可能 1 RPM）
- 同 worker 池会让长任务饿死短任务

---

## 失败处理

| 失败类型 | 处理 |
|---|---|
| 超时 | 自动重试 1 次（同模型）→ 仍失败建议切供应商 |
| 内容审核拒绝 | 立即停止，不重试，向用户报告并提示修改 prompt |
| 配额耗尽 | 切到该项目的 fallback 供应商 |
| 质量过低（CLIP 检测） | 重试 1 次，重新组帧或微调 prompt |
| 角色身份漂移（face cosine < 0.55） | 重试 1 次，加强 IPAdapter 权重 |

---

## 自动质检（check_video_quality）

每个生成完的 video_clip 必须过：

| 检查 | 方法 | 阈值 |
|---|---|---|
| **时长偏差** | ffprobe duration vs requested | ±10% 内 |
| **黑帧比例** | 帧分析平均亮度 | < 5% |
| **角色面部一致性** | 抽样 5 帧做 face cosine | ≥ 0.55 |
| **画风一致性** | CLIP vs 画风 preview | ≥ 0.5 |
| **音画对位**（如果是 first_last） | 视频末帧 vs end_frame.png 相似度 | ≥ 0.6 |

不通过 → 标记 `needs_review`，不阻塞下一个 shot。

---

## 工作流程

```
1. read_video_settings(project) → backend, resolution, default_duration
2. for shot in shots (并发 ≤ video_channel.concurrency):
     2.1 read_shot_keyframes(shot.id) → start_frame [+ end_frame]
     2.2 prompt = compose_video_prompt(shot, mode, backend)
     2.3 task = submit_video_task(prompt, frames, backend)
     2.4 video = wait_video_task(task, timeout=15min)
     2.5 quality = check_video_quality(video, shot)
     2.6 if quality.passed:
            save_video_clip(shot.id, video)
         else:
            mark_for_review(shot.id, quality.issues)
3. 汇总
```

---

## 输出给 Orchestrator 的摘要

```json
{
  "status": "success",
  "summary": {
    "shots_total": 11,
    "shots_succeeded": 10,
    "shots_failed": 1,
    "shots_needs_review": 1,
    "backend_used": "volcengine-seedance-2.0",
    "total_duration_sec": 1234,
    "estimated_cost_cny": 80.0,
    "average_quality_score": 0.78
  },
  "artifacts": "projects/xx/storyboards/episode_1/<shot_id>/clip.mp4",
  "warnings": [
    "shot_007: face cosine 0.51, below threshold - marked for review"
  ],
  "next_action_hint": "10-voice-assigner"
}
```

---

## 成本预估（必须在执行前给出）

```python
def estimate_video_cost(shots, backend) -> dict:
    backend_pricing = {
        "seedance-2.0":  cny_per_sec * 1.0,
        "veo-3.1":       cny_per_sec * 2.5,
        "sora-2":        cny_per_sec * 3.0,
        "kling-v3":      cny_per_sec * 1.5,
        "vidu-q3":       cny_per_sec * 0.8,
        "wan-2.6":       cny_per_sec * 1.2,
    }
    total_sec = sum(shot.duration_sec for shot in shots)
    return {
        "total_seconds": total_sec,
        "estimated_cny": total_sec * backend_pricing[backend],
        "shots_count": len(shots),
    }
```

执行前向 Orchestrator 报告，由 Orchestrator 决定是否要用户确认（特别是 ≥ ¥50 时）。

---

## 反模式

❌ 把 video 任务和 image 任务混进同一队列（会互相饿死）  
❌ 不做 prompt 字符数限制检查（Seedance 超 5000 直接 400）  
❌ 一次性提交所有 shot（无法控制 RPM）  
❌ 失败不分类型一律重试（内容审核失败重试还是失败）  
❌ 不做质检直接保存（劣质成片下游拼出来更糟）  
❌ 切供应商不更新 prompt 格式（不同模型 prompt 风格差很多）

---

## 配套：multi_shot 模式（Seedance 2.0 独有）

仿 moyin-creator 的"多镜头合并叙事视频"：将 2-4 个连续相邻 shot 合并为一个长 video_prompt，让模型一次输出长镜头。

适用：连续对话场景、平滑运镜的同场景多角度切换。

参数约束（叠加 Seedance 限制）：
- 合并的 shot 必须同 scene
- 合并后总时长 ≤ 15s
- ≤ 9 张参考图 / ≤ 3 视频 / ≤ 3 音频

不要在跨场景或跨角色的 shot 之间使用 multi_shot。
