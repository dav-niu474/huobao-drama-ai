---
name: director_storyboard
description: 导演分镜提示词技法 · 国风3D
metaData: director_skills
---

# 分镜提示词 · 国风3D · 风格专属技法

---

## 适用范围

本 Skill 专用于**国风3D**风格的分镜提示词生成。

---

## 情绪 → 面容/眼神词映射

| 情绪输入 | 面容词 | 眼神词 | 微表情补充 |
|----------|--------|--------|-----------|
| 端庄 / 优雅 | 神情端庄，目光平静 | 眼神清亮，目光沉稳 | 嘴角微扬，表情典雅 |
| 忧伤 / 哀婉 | 神情哀婉，眼神黯淡 | 眼神含泪，目光低垂 | 嘴角下沉，表情哀伤 |
| 温柔 / 深情 | 神情温柔，眉目含情 | 眼神专注柔和，目光温暖 | 嘴角微扬，表情治愈 |
| 凌厉 / 肃杀 | 神情冷峻，目光如刀 | 眼神锐利，目光坚定 | 下颌收紧，表情威严 |
| 惊讶 / 欣喜 | 眼睛微睁，表情生动 | 眼神明亮，目光聚焦 | 嘴角上扬，表情惊喜 |
| 沉思 / 内省 | 神情淡淡，目光悠远 | 眼神放空，目光失焦 | 表情平静，气质内敛 |
| 喜悦 / 欢快 | 表情灿烂，眼睛弯月 | 眼神明亮，目光灵动 | 脸颊微红，表情生动 |
| 疲惫 / 倦怠 | 眼神朦胧，表情柔和 | 目光略显疲惫，眼神柔和 | 微微打哈欠，表情慵懒 |
| 期待 / 盼望 | 眼神发光，表情鲜活 | 眼神期待，目光闪烁 | 嘴角上扬，表情生动 |
| 决绝 / 坚定 | 神情认真，目光清亮 | 眼神坚定，目光向前 | 下巴微抬，表情果敢 |

---

## 光影氛围词库（国风3D）

### 时间段光线

| 时间段 | 主光词 | 色调词 | 气氛词 |
|--------|--------|--------|--------|
| 清晨 | 柔和晨光，暖色侧射 | 月白 + 青绿 | 薄雾弥漫，空气清新 |
| 正午 | 明亮阳光，直射柔光 | 朱红 + 金黄高光 | 光影清晰，色彩鲜明 |
| 傍晚/黄昏 | 逆光剪影，暖色渐变 | 朱红 + 靛蓝渐变 | 夕阳余晖，轮廓光 |
| 夜间 | 冷色背景 + 暖光点缀 | 靛蓝主调 + 暖黄光点 | 宁静温馨，灯光柔和 |
| 雨天 | 漫射冷光，无主光源 | 青绿 + 月白 | 空气湿润，低对比 |

### 情绪光影

| 情绪基调 | 光线类型 | 补充约束 |
|----------|----------|----------|
| 宫廷华贵 | 暖光照明，局部高光 | PBR材质反射，景深层次 |
| 山水意境 | 体积光漫射，雾气氛围 | 青绿色调，景深虚化 |
| 闺阁温婉 | 局部柔光，柔和阴影 | 胭脂色调，近景特写 |
| 武侠肃杀 | 冷调阴影，硬光对比 | 靛蓝 + 墨黑，低饱和度 |
| 月夜清幽 | 月光照明，冷暖对比 | 靛蓝背景，暖光点缀 |

---

## 场景质感约束词（按场景类型）

| 场景类型 | 必加约束词 |
|----------|-----------|
| 宫廷建筑 | 朱红宫墙、金顶琉璃、雕梁画栋、汉白玉栏杆 |
| 山水园林 | 青绿山水、飞檐亭台、曲径通幽、假山池沼 |
| 闺阁室内 | 屏风格扇、雕花窗棂、纱幔帐帘、古典家具 |
| 武侠场景 | 竹林/雪地/山崖、冷色调、氛围压抑、线条凌厉 |
| 节日庆典 | 灯笼/彩带/烟花、高饱和暖色、氛围热闹、人群熙攘 |
| 夜晚街景 | 灯笼/街灯/店铺、暖光点缀、冷色背景、倒影反射 |

---

## 固定风格锚定词（所有输出必须包含）

**3D渲染锚定（必选）：**

3D渲染风格，高精度建模，PBR材质，国风3D，电影级光影

**人物质感（含人物镜头时必选）：**

3D古风建模，高精贴图，服饰纹理清晰，发丝细腻渲染，光影层次丰富

**场景质感（含场景镜头时必选）：**

3D场景渲染，建筑细节丰富，材质质感真实，景深虚化，体积光

**一致性锚定（参考图模式必选）：**

保持人物造型与参考图一致，保持场景风格与参考图一致，保持光影色彩基调统一

**风格收尾（固定）：**

国风3D渲染，东方美学，PBR材质，电影级渲染

**画质锁定词（所有输出必须包含，置于风格收尾之后）：**

模式A（中文）——默认（画面无画内文字需求时）：
3D高清渲染，高细节，高精度建模，PBR材质，画面无字幕、无水印、无标题叠字

模式A（中文）——画内文字场景（画面描述中含牌匾/对联/书籍等道具文字时）：
3D高清渲染，高细节，高精度建模，PBR材质，画面无字幕、无水印、无标题叠字，牌匾/对联等场景道具上的文字清晰可辨

模式B（英文）——默认：
3D rendered style, high-poly modeling, PBR materials, Chinese style, cinematic lighting, high detail, no subtitles, no captions, no watermark, no title overlay

模式B（英文）——画内文字场景：
3D rendered style, high-poly modeling, PBR materials, Chinese style, cinematic lighting, high detail, no subtitles, no captions, no watermark, no title overlay, legible text on in-scene props such as plaques and couplets

**负向词模板（模式B 必须包含，置于提示词末尾）：**

> ⚠️ Seedream（模式A）**不支持负向提示词**，负向词仅适用于模式B。模式A 通过正向词中的质感锚定和画质锁定来保证画面质量。

模式B（英文）：
no photorealistic, no realistic photography, no low-poly, no rough modeling, no plastic texture, no harsh lines, no cartoon style, no anime style, no western fantasy, no cyberpunk, no sci-fi, no modern elements, no subtitles, no captions, no watermark, no title overlay, no UI text

---

## 美学禁止项（生成时严格规避）

以下词汇/风格不得出现于输出提示词中：

- ❌ 写实摄影/照片级真实感词（如：photorealistic, realistic photography）
- ❌ 高饱和荧光色/霓虹色/数码感强
- ❌ 西方奇幻/赛博朋克/现代元素
- ❌ 低精度建模/粗糙贴图/塑料质感
- ❌ 卡通/动漫/二次元风格
- ❌ 扁平设计/无3D纵深感
- ❌ 色彩混乱/光影错误/透视错误
- ❌ 现代建筑/现代服饰元素

> 💡 **例外**：某些现代3D渲染技术（如光线追踪、体积光）可以合理使用，但应保持国风美学基调。

---

## 完整生成示例

> 以下为同一输入分别使用模式A和模式B的对照展示，实际使用时**仅输出其中一种**。

### 输入（分镜表行数据）

| 序号 | 画面描述 | 场景 | 关联资产名称 | 时长 | 景别 | 运镜 | 角色动作 | 情绪 | 光影氛围 |
|------|---------|------|-------------|------|------|------|---------|------|----------|
| 1 | 女子身着华服站在宫殿前，手持宫灯 | 宫殿 | 女子 | 6s | 中景 | 缓推 | 侧身持灯，眼神温柔 | 温婉 / 典雅 | 暖光照明 |

### 示例输出A（模式A · Seedream）

[Prompt]
3D渲染风格，高精度建模，PBR材质，国风3D，电影级光影，3D古风建模，高精贴图，服饰纹理清晰，发丝细腻渲染，光影层次丰富，中景构图，女子身着华服站在宫殿前，手持宫灯侧身而立，神情温婉，眼神温柔，朱红宫墙背景，金黄高光点缀，体积光氛围，景深虚化，国风3D渲染，东方美学，PBR材质，3D高清渲染，高细节，高精度建模，PBR材质，画面无字幕、无水印、无标题叠字。
Based on the reference image of 女子，maintain consistent: face features, hairstyle, costume details. Generate a new scene: standing in front of palace at dusk, holding lantern. Keep visual style identical to reference.

### 示例输出B（模式B · Nanobanana）

```xml
<role>
You are a 3D storyboard artist.
Maintain strict visual continuity across all shots.
</role>
<character_reference>
Image [1]: 女子 — 3D古风造型，典雅服饰，国风3D风格
</character_reference>
<continuity_rules>
- Same outfit, hairstyle, face features across ALL shots
- Same 3D rendered style, PBR materials
- Same scene lighting, Chinese aesthetic
- Do NOT introduce photorealistic or western fantasy elements
</continuity_rules>
<shot>
Medium shot, woman in elegant traditional Chinese attire standing before palace, holding lantern, gentle expression, soft gaze, cinematic lighting, volumetric fog, depth of field blur, PBR material rendering, high-poly modeling, Chinese palace architecture, warm lighting, golden highlights, Chinese style 3D render, Eastern aesthetics, high detail, no subtitles, no captions, no watermark, no title overlay.
</shot>
<negative>
no photorealistic, no realistic photography, no low-poly, no rough modeling, no plastic texture, no harsh lines, no cartoon style, no anime style, no western fantasy, no cyberpunk, no sci-fi, no modern elements, no subtitles, no captions, no watermark, no title overlay, no UI text
</negative>


## 快速参考卡

### 情绪 → 画面词速查

| 情绪 | 面容关键词 | 光线匹配 |
|------|-----------|---------|
| 端庄 | 神情端庄，目光沉稳 | 暖光照明 + 高光 |
| 忧伤 | 神情哀婉，眼神黯淡 | 冷调阴影 + 低对比 |
| 温柔 | 神情温柔，眼神专注 | 局部柔光 + 柔焦 |
| 凌厉 | 神情冷峻，目光如刀 | 冷调阴影 + 硬光 |
| 喜悦 | 表情灿烂，眼睛弯月 | 暖光照明 + 高饱和 |
| 沉思 | 神情淡淡，目光悠远 | 体积光 + 雾气 |
| 疲惫 | 眼神朦胧，表情柔和 | 柔和光线 + 低对比 |
| 坚定 | 神情认真，目光清亮 | 暖光侧射 + 清晰轮廓 |
