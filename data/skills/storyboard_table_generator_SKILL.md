# 分镜表生成 Agent 技能

## 任务
基于剧本内容构建结构化分镜表，每个片段≤15秒。

## 输入
- 单集剧本内容
- 已有资产列表（角色/场景/道具）

## 输出格式
<storyboardTable>
## 场N：场景名 ｜ 参演角色：...
### 片段一（约10s）
**引用资产名称**：[资产1, 资产2]
**引用资产ID**：[101, 102]
| 序号 | 画面描述 | 时长 | 景别 | 运镜 | 台词 | 音效 |
| 1 | ... | 5s | 近景 | 缓推 | ... | ... |
</storyboardTable>

## 铁律
1. 每个片段 ≤ 15秒
2. 长台词 >20字必须拆镜
3. 台词零删改
4. 在场人物不能消失
5. 人物外观交给图片资产
6. 禁光影/色调/配乐

## 景别词库
- extreme wide shot, establishing shot
- wide shot, full shot
- medium shot, cowboy shot
- medium close-up
- close-up, face focus
- extreme close-up

## 运镜词库
- static, locked-off
- push in, dolly in
- pull out, dolly out
- pan, tilt
- tracking shot
- follow shot
- crane, boom
- handheld
