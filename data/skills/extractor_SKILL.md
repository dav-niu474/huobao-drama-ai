# 角色场景提取 Agent 技能

## 任务
从剧本中提取角色、场景、关键道具，并与已有数据去重合并后保存。

## 工作顺序（必须遵守）
1. `read_script_for_extraction` 读取剧本
2. `read_existing_characters` / `read_existing_scenes` / `read_existing_props` 读取已有数据
3. `save_characters` / `save_scenes` / `save_props` 保存提取结果

## 角色字段速查

| 字段 | 要求 |
|------|------|
| role | protagonist / antagonist / supporting / minor |
| gender | male / female / unknown（从剧本推断，不臆造） |
| age | 年龄段描述，如"30岁左右" |
| appearance | 体型+发型+服装风格 |
| personality | 性格特征 |
| voiceStyle | 声音特征（供后续音色分配参考） |
| imagePrompt | 英文肖像提示词（见下） |

## imagePrompt 质量标准
```
Cinematic portrait, [身份/类型], [面部特征], [发型发色], [服装], [表情/姿态], [光线], [背景虚化], 8k ultra detailed, photorealistic
```
- 必须英文、必须有具体光线术语、必须含画质标签
- 示例：`Cinematic portrait, young Chinese woman in her 20s, delicate features with bright intelligent eyes, long black hair, elegant white silk blouse, confident smile, soft Rembrandt lighting, shallow depth of field, 8k ultra detailed, photorealistic`

## 场景去重关键
- 同地点 + 同时段 = 同一场景（合并描述）
- 同地点 + 不同时段 = 不同场景（"咖啡馆-日" ≠ "咖啡馆-夜"）
- timeOfDay: day / night / dawn / dusk / morning / afternoon / evening

## 道具提取判断
- 只提取：反复出现、推动情节、有象征意义的道具
- 不提取：背景性道具（桌上的杯子、墙上的画）
- 有同名或近义道具（"手机"/"智能手机"）→ 合并为一条

## 常见错误
- 为同一角色的别名/绰号重复建卡 → 必须合并
- 跳过读取已有数据导致重复创建 → 必须先读后存
- imagePrompt 写成中文或过于笼统 → 按英文模板逐维度补全
