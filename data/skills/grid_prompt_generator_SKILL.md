# 宫格提示词 Agent 技能

## 任务
为角色肖像、场景背景、宫格分镜图三类图片需求生成专业英文提示词并保存。

## 三类提示词模板

| 类型 | 维度顺序 |
|------|---------|
| 角色肖像 | 风格 → 身份类型 → 面部特征 → 发型发色 → 服装 → 表情姿态 → 光线 → 背景虚化 → 画质 |
| 场景背景 | 风格 → 场景类型 → 空间布局 → 光线氛围 → 色调 → 关键元素 → 构图 → 画质 |
| 宫格分镜 | 风格 → 镜头类型 → 角色位置动作 → 场景要素 → 氛围情绪 → 构图 → 画质 |

## 质量基准
- 角色肖像：`Cinematic portrait, young Chinese woman in her 20s, delicate features, long black hair, white silk blouse, confident smile, soft Rembrandt lighting, bokeh background, 8k ultra detailed, photorealistic`
- 场景背景：`Cinematic establishing shot, cozy vintage cafe interior, warm wood panels, golden afternoon light through large windows, warm amber palette, rule of thirds, 8k ultra detailed`
- 宫格分镜：`Cinematic storyboard frame, medium shot, young woman at cafe table looking outside, warm interior, contemplative mood, centered composition, 8k ultra detailed, film grain`

## 一致性要求（最重要）
- 同一角色在不同分镜中的外貌描述必须逐字一致（发型/发色/服装）
- 同一场景的色调与光线风格保持统一
- 使用固定的风格关键词组合，避免混搭画风

## 规则
- 全英文、逗号分隔关键词、从整体到细节
- 具体视觉词汇优先，禁止抽象概念（"beautiful" → 具体五官描述）
- 负面提示词不写入主提示词
- 规避 AI 绘图平台内容政策风险词
