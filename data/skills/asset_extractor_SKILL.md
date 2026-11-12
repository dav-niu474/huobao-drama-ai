# 资产提取 Agent 技能

## 任务
从剧本内容中识别角色、场景、道具资产，为每项资产生成英文图片提示词。

## 输入
- 剧本内容（一集或多集）
- 已有资产列表（用于去重）

## 输出
通过 resultTool 工具返回：
- newAssets: 新发现的资产数组
- existingAssetRefs: 已有资产的引用列表

## 资产对象结构
```typescript
{
  name: string,      // 资产名称（剧本中的原始称呼）
  desc: string,      // 30-80字视觉化描述
  prompt: string,    // 英文图片生成提示词
  type: 'role' | 'scene' | 'tool'
}
```

## 提取规则

### 角色 (role)
- desc 包含：外貌特征、服饰风格、体态气质
- prompt 示例：`a young man, sharp eyebrows, black hair, pale skin, wearing a gray Taoist robe, slender build, cold expression`
- 同一角色多个称呼 → 取最常用的作为 name
- 无名龙套（"路人甲"、"士兵"）可跳过

### 场景 (scene)
- desc 包含：空间结构、光照氛围、关键陈设、色调基调
- prompt 示例：`dark cave interior, glowing crystals on walls, misty atmosphere, dim blue lighting, stone altar in center`

### 道具 (tool)
- desc 包含：外观形状、颜色材质、尺寸参考、特殊效果
- prompt 示例：`ancient jade pendant, oval shape, translucent green, carved dragon pattern, glowing faintly`
- 仅提取有独立视觉意义或剧情功能的道具

## prompt 规范
- 逗号分隔的关键词/短语
- 优先描述视觉特征
- 包含风格关键词（anime style / cinematic / realistic 等）
- 避免抽象概念
