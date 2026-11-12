# 剧本解析 Agent 技能

## 任务
解析上传的剧本文本，拆分为集与场次，并提取角色、场景、道具，一次性调用 `save_parsed_script` 保存。

## 解析层次
```
全文 → 集（第N集/第N章/EP.N 分隔） → 场次（地点或时间变化处） → 结构化字段
```
- 无明确分集标记时整篇视为 1 集
- 无明确场次标记时从叙事转折（地点变化、时间跳跃）推断

## 硬性要求

| 项 | 要求 |
|----|------|
| episode.content | 必须保留该集**完整原文**，禁止概括或截断 |
| scenes[].content | 该场次对应的那段原文 |
| 场次字段 | sceneNumber 从 1 起、location、timeOfDay、description |
| genre | 都市/古装/悬疑/科幻/甜宠/复仇/励志/校园 之一 |
| style | realistic/anime/cinematic/comic/watercolor/3d 之一 |

## 角色提取
- 所有具名角色都要提取；有对白的匿名角色用描述名（如"服务员甲"）
- role 按戏份与剧情重要性：protagonist / supporting / minor
- gender 从上下文推断，无依据用 unknown

## 场景与道具
- location + timeOfDay 去重：同地点同时段=同一场景，不同时段=不同场景
- 只提取剧情关键道具（武器、信物、线索），跳过背景道具

## 常见错误
- episode.content 被概括 → 直接判失败，必须原文
- 场次编号不连续或从 0 开始 → 必须从 1 连续编号
- 把"咖啡馆-日"和"咖啡馆-夜"合并 → 不同时段是不同场景
