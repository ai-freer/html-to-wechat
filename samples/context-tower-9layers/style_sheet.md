# Style Sheet — 上下文管理九层塔

> 这是为这一篇文章定制的全局视觉风格描述。生成图集时，每一张图的 prompt 都以这段描述为前缀，确保 8 张图风格一致。

## 文章定位

- **类型**：科技深度长文 / 工程方法论
- **受众**：AI Agent / LLM 工程师，系统架构师，高阶 AI 玩家
- **气质**：克制、有信息密度、像资深工程师在白板前讲清楚一件事；不是市场化吹嘘，不是入门科普

## 视觉关键词

`engineering blueprint` · `late-night whiteboard` · `flat illustration with geometric precision` · `senior engineer's sketch refined into a magazine cover` · `restrained, intellectual, blue-hour mood`

## 色板（严格执行）

| 角色 | 颜色 | 用途 |
|---|---|---|
| primary background | `#0E1A2B` 深夜墨蓝 | 大多数图的主背景 |
| secondary background | `#152238` 略浅墨蓝 | 二级面板/卡片底 |
| ivory text | `#F5F1E8` 象牙白 | 标题、正文文字（暗底上） |
| muted text | `#A8B0BF` 雾灰 | 次级信息、标签 |
| accent warm | `#FF6B35` 警示橙 | 仅用于强调 critical / 风险 / L6 / 关键标注 |
| accent cool | `#4FD1C5` 电光青 | 结构线、连接线、数据流向 |
| neutral card | `#EBE5D6` 卡纸米色 | 偶尔的反色卡片（少量） |
| grid line | `#1E2A3E` 极淡网格 | 蓝图网格背景，几乎不可见 |

## 插画风格

- **扁平 + 工程蓝图 + 极少手绘质感**
- 类似 Stripe 文档插画的几何精度，但更暗、更冷、更"深夜工程师白板"
- 偶尔可见极淡的蓝图网格背景，强化"架构图/草稿纸"的感觉
- 不要：光斑、玻璃拟态、霓虹、金属反光、AI 浮夸装饰、卡通拟人、立体渐变

## 字体感

- 中文：现代无衬线粗体（思源黑体 Heavy / 阿里巴巴普惠体）—— 标题厚重，正文清晰
- 英文/数字：mono 或 condensed sans，用于数字、L1-L9 这类标签
- 标题字号大胆，正文字号克制，中间留呼吸感

## 版式感

- 留白克制但有节奏；信息可以密集，但元素之间必须有清晰边界
- 网格暗示（不是网格线 visible，是元素对齐有秩序感）
- 直角偏多，偶尔点缀圆形装饰元素（数字标号、节点）
- 不要圆角过度、不要 glassmorphism、不要立体阴影

## 必须避免（写进每张 prompt 的反例列表）

- 暖色调主导（不要红黄主色）
- 卡通、可爱、Q 版风格
- 霓虹、赛博朋克、glitch、扫描线
- 玻璃拟态、磨砂、立体浮雕
- AI 自动生成那种过度装饰的金属光泽、装饰花纹
- 孔雀蓝、粉紫等情绪化色
- 水印、签名、版权标识

## 一致性机制

1. **每张 prompt 都以这份 style_sheet 的浓缩版本作为前缀**（约 200 字）
2. **首图（card 01）先单独生成 2-3 候选，挑定后**作为后续每张图的 `--input` 参考图，走 edit 模式 + `--no-preserve`，prompt 指令"使用此参考图相同的色板、画风、版式精神，重新绘制为以下内容"
3. 所有图 **3:4 比例（1024×1536）**，统一小红书主投放尺寸
