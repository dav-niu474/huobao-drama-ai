---
name: art-director
skill_id: "05-art-director"
version: "2.0"
phase: "M2"
inputs: [assets/index.json, scripts, art_style_packs]
outputs: [project.art_style_id, style_meta]
dependencies: [04-asset-extractor]
description: 画风定调。从内置 art-styles 包中推荐或选择画风，确定全片视觉锚点（正向词 + 负向词 + 风格示例图）。当用户说"换画风"、"风格"或 Orchestrator 检测到资产已提取但画风未定时使用。
agent_type: subagent
required_tools:
  - list_art_style_packs       # 列出 art-styles/ 目录下可选画风
  - read_art_style_pack        # 读取某个画风包的内容（prefix.md / images / art_prompt/）
  - analyze_script_for_style   # 让 LLM 分析剧本最适合的画风
  - save_project_art_style     # 保存到 project.json.art_style
---

# 画风定调指南

> 灵感来源：`lumenx` Step 2 "Art Direction" + `Toonflow` `art_skills/<style>/` 包结构。
>
> 画风一旦定下来，会被注入到所有后续生图/生视频的 prompt 前缀里，并在 08-keyframe-generator / 09-video-generator 中提供风格锚点词与负向词。

---

## 工作模式

### 模式 A · 智能推荐（默认）

1. 调用 `list_art_style_packs` 获取可选画风列表（`art-styles/` 下每个目录是一个画风）：
   ```
   2D-chinese-anime         （国风二次元）
   2D-90s-japanese-anime    （90 年代日漫）
   2D-flat-design           （扁平插画）
   3D-pixar                 （三维卡通）
   2D-mature-urban-romance  （都市言情）
   photorealistic-cinema    （写实电影）
   ```
2. 调用 `analyze_script_for_style` 让 LLM 读完剧本/前 3 个分镜后，给出 Top 3 推荐：
   ```json
   {
     "recommendations": [
       {
         "style_id": "2D-chinese-anime",
         "score": 0.92,
         "rationale": "故事是仙侠题材，国风二次元最契合（修真/古装/灵气特效）"
       },
       {
         "style_id": "2D-mature-urban-romance",
         "score": 0.45,
         "rationale": "如果想做现代化改编可选"
       }
     ]
   }
   ```
3. 把 Top 3 + 各自的预览图给用户选

### 模式 B · 用户指定

用户直接说"我要国风"/"我要扁平插画"，跳过推荐直接锁定。

### 模式 C · 自定义画风

用户提供：
- **参考图 1-5 张**（必填）
- 风格描述（可选）

执行：
1. 用 LLM 分析参考图 → 提炼正向词 + 负向词
2. 在 `art-styles/custom/<id>/` 创建新画风包（自动生成 `prefix.md` + `art_prompt/*.md`）
3. 让用户预览生成示例并确认

---

## 画风包的结构（输出契约）

每个画风包目录下：

```
art-styles/<style-id>/
  README.md                       # 画风介绍 + 适用场景
  prefix.md                       # 画风锚点词（所有图都拼上的前缀）
  style_meta.yaml                 # 元信息
  images/
    preview.png                   # 风格示例图
    01.png, 02.png, ...           # 参考图集
  art_prompt/
    art_character.md              # 角色提示词模板
    art_character_derivative.md   # 角色衍生（多服装/多动作）
    art_scene.md                  # 场景提示词模板
    art_prop.md                   # 道具提示词模板
    art_storyboard_video.md       # 视频提示词风格约束
  director_skills/
    director_planning_style.md    # 该画风的拍摄/构图规划要点
    director_storyboard.md        # 该画风专属的分镜技法（情绪→面容词映射等）
```

> 这一结构 **完全照搬 Toonflow** 的 `art_skills/<style>/`。详见 [`art-styles/2D-chinese-anime/`](../../art-styles/2D-chinese-anime/) 样例。

---

## style_meta.yaml 必备字段

```yaml
style_id: 2D-chinese-anime
display_name: 国风二次元
display_name_en: Chinese Anime
tags: [仙侠, 古装, 国风, 新国潮, 二次元]
suitable_for:
  - 仙侠 / 修真 / 玄幻
  - 古装言情
  - 武侠
not_suitable_for:
  - 写实电影感
  - 赛博朋克 / 科幻
recommended_models:
  image: [seedream-5.0, gpt-image-2, nano-banana-pro]
  video: [seedance-2.0, veo-3.1]
positive_anchors:
  - "Chinese style anime"
  - "cel-shaded"
  - "neo-chic oriental aesthetic"
  - "fine brushwork"
  - "vivid colors"
negative_anchors:
  - "photorealistic"
  - "3D render"
  - "western fantasy"
  - "cyberpunk"
  - "modern elements"
```

---

## 提示词注入策略

被 08-keyframe-generator / 09-video-generator 等下游 Skill 使用时：

```
最终 prompt = [画风 prefix] + [资产描述] + [镜头描述] + [画质锁定词]
                  ↑ 来自这里         ↑ 来自资产库       ↑ 来自分镜       ↑ 来自画风包
```

### 双语策略
画风包的提示词模板支持两种模式：
- **模式 A（中文）** —— Seedream / 通义万相 等中国厂商对中文敏感
- **模式 B（英文）** —— GPT Image / Gemini / Nano Banana 等更适合英文

模板中的所有 `art_prompt/*.md` 必须**两种模式都给出**，运行时按所选 image_backend 自动切换。

---

## 输出给 Orchestrator 的摘要

```json
{
  "status": "success",
  "art_style": {
    "style_id": "2D-chinese-anime",
    "display_name": "国风二次元",
    "preview_url": "art-styles/2D-chinese-anime/images/preview.png"
  },
  "warnings": [],
  "next_action_hint": "06-character-designer"
}
```

---

## 反模式

❌ 把画风词混入资产 prompt（应该在画风包统一管）  
❌ 让用户直接写 prompt 前缀（不利于复用与版本管理）  
❌ 不给负向词（不同画风的负向词差异大）  
❌ 让 LLM 推荐时不给评分（用户难以选择）  
❌ 让用户中途换画风但不重生角色定妆（会导致风格漂移）—— 必须警告并触发重生
