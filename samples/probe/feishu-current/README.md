# 飞书当前能力探针

纯合成内容，不含真实业务信息。`probe.html` 含两个 article、callout 图片、Mermaid、SVG 文字和点击按钮；`plan.json` 显式标注 callout/Mermaid。

2026-10-31 本地验证：原生转换保留两章/结尾、base64 图在原位置变本地引用；callout 标题降为加粗段落、图移相邻块并报告。SVG 未映射明确警告。CLI 1.0.98 原生/HTML 内容块创建 dry-run、9 个精修 helper dry-run 通过。没有创建云端文档。

| 待云端验证 | 原生路径 | HTML 内容块 |
|---|---|---|
| 保存重开/回读 | 文字、图片顺序、callout、本例资源 | HTML 资源回读完整性 |
| 桌面视觉 | callout、原生图片、Mermaid | CSS 布局、SVG 文字、按钮交互 |
| 手机 | 图片比例、结构阅读 | auto/viewport 高度、交互/滚动 |
| 精修 | 用新 block ID 局部替换/插入/删除后资源仍在 | 不把 HTML 内文字当原生块编辑 |

命令和边界见 `docs/04-html-to-feishu.md`。实际云端测试前须明确账号、目标和测试内容授权。
