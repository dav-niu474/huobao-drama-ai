# 分镜拆解 Agent 技能

## 任务
将剧本拆解为分镜序列，为每个镜头生成可直接使用的 imagePrompt / videoPrompt，并分批保存。

## 工作顺序（必须遵守）
1. `read_storyboard_context` 读取剧本+角色+场景上下文
2. 在思考中规划镜头划分（先不调用工具）
3. **分批保存**：每批 3-5 个镜头调用 `save_storyboards`
   - 第一批：`save_storyboards(storyboards=[...], append=false)`
   - 后续批次：`append=true`
4. 报告总保存结果

## 为什么必须分批
一次性输出全部分镜会被 max_tokens 截断或超时，导致整批丢失。分批保证每批完整落库。

## 镜头字段速查

| 字段 | 可选值（常用） |
|------|--------------|
| shotType | extreme-wide / wide / medium / close-up / extreme-close-up / over-shoulder / pov / two-shot |
| cameraAngle | eye-level / low-angle / high-angle / dutch-angle / birds-eye / worms-eye |
| cameraMovement | static / pan / tilt / zoom / dolly / tracking / crane / handheld |
| duration | 动作 3-5s；对白 5-8s；情感高潮 8-15s |
| dialogue / dialogueChar | 无对白时为 null |

## imagePrompt 六维度（缺一不可）
```
[风格], [镜头类型+构图], [角色位置动作], [场景要素], [氛围光线色调], [画质标签]
```
示范质量基准：
`Cinematic film still, medium shot from eye-level, young Chinese woman in white silk blouse sitting at cafe table, warm wood interior with steam rising from coffee cup, soft Rembrandt lighting with golden hour glow, 8k ultra detailed, shallow depth of field, film grain`

禁止：模糊主语（"a woman"）、缺光线术语、缺镜头构图。

## videoPrompt 3秒分段 XML
```xml
<location>场景+空间布局+关键道具</location>
<role>角色外貌+服装+状态</role>
<action>动作段1<n>动作段2<n>动作段3</action>
<atmosphere>光线+色彩+声音+情绪</atmosphere>
<voice>旁白/内心独白（无则留空）</voice>
```
- 10-15 秒镜头分 3-5 段，段间用 `<n>` 分隔，不可省略

## 拆解节奏参考
- 每个重要情节点 ≥ 2-3 个镜头
- 对白镜头优先 medium / close-up
- 场景切换用 wide / extreme-wide 过渡
- 镜头间动作与位置保持连续性
