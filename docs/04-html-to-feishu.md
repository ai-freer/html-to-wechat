# 模式 4：HTML → 飞书文档（2026-10-31 修订）

默认保留原生文档块转换；HTML 内容块是用户显式选择的另一条交付路径。当前实现按 CLI **1.0.98** 的命令、内嵌 Skill 与官方 XML 能力重新对齐。仅完成本地验证与 dry-run，未创建或更新云端文档。

旧实现及实战记录保留在 [历史设计](history/04-html-to-feishu-pre-2026-10-31.md)，其中 v1 更新、图片后置上传及部分能力限制已经过时，不再作为执行指南。

## 两条路径

| | 原生块（默认 `native`） | HTML 内容块（显式 `html-block`） |
|---|---|---|
| 主要目标 | 可编辑、可搜索、可评论的结构化正文 | 在文档内展示一份单文件网页 |
| 实现 | HTML + Agent plan → DocxXML → 创建 | 完整 HTML → html5-block 资源 → 创建 |
| 文字 | 转为标题/段落/列表/表格等 | 留在网页内部，不声称获得原生文字协作能力 |
| 视觉 | HTML CSS 映射为有限的文档语义与颜色；不追求 CSS 像素等价 | 有机会保留网页布局与交互；实际支持必须云端实测 |
| SVG/图表 | Agent 选择补述、截图或显式画板 plan；不自动把所有 SVG 当可编辑画板 | 留在 HTML 中，尚未验证飞书容器对具体效果的支持 |
| 当前证据 | 本地转换、资源/顺序检查、v2 请求 dry-run | 完整 HTML 资源导出、meta/体积检查、请求 dry-run |
| 未验证 | 云端图片落位、callout 降级、精修后回读、手机效果 | 云端导入、脚本/样式/资源加载、高度、搜索/评论边界、手机效果 |

不得在原生转换失败时自动换成整篇 HTML 内容块。用户原本要求原生编辑时，这会改变交付性质。

## 原生路径

1. Agent 看完整源码；复杂卡片/图表同时看截图，产 JSON plan。默认 plan 不做视觉理解，不能以“默认无警告”判断完整。
2. 转换标题、段落、列表、表格、行内格式；通过 boundaryAnnotations 映射 grid/column/callout/画板/截图兜底。
3. 本地/base64 图片和截图在**创建前**准备为本地资源，替换为 `<img path="@./资源目录/..." width="..." height="..."/>`，保留原文位置；无需旧版 `+media-insert --selection-with-ellipsis --before`。
4. 按当前 XML 合约整理 callout：标题降为加粗段落，直接包含的图片等资源移为相邻块并警告；文本/列表内部嵌套资源无法安全整理时明确失败，交给 Agent 调整 plan。保留内容优先，不能静默吞资源。
5. 本地导出 XML 和旁边的 `<文件名>.assets/`；资源缺失、非法类型、过大、截图失败在创建前停止。
6. `docs +create --doc-format xml --content - --as user`；本地脚本使用明确 CWD，避免相对资源同名歧义。实际写入按具体账号/目标/内容授权。
7. 创建后检查 warnings/tips，使用返回 URL；回读结构/资源并人工看图。不能只看退出码或 `new_blocks` 数量验收。

SVG 默认清理会明确报告数量，Agent 必须核对图中文字和结论。原生 `<whiteboard type="svg">` 是当前官方能力，但任意 SVG→可编辑节点的保真度不在本轮自动承诺范围内。

## 局部精修

- 当前 CLI `+update` 默认 XML，也支持显式 Markdown；旧结论“更新只能 Markdown”已失效。
- 使用 `--command` / `--content` / `--doc-format`；不再发送 `--mode`、`--markdown`、`--selection-by-title`、`--selection-with-ellipsis`。
- 先 `docs +fetch --detail full`，尽量按 outline/section/keyword 读取最小范围；用最新 block ID 做 block_replace、block_insert_after、block_delete。
- `update-doc.mjs` 保留 helper 名称，但章节/跨块替换和删除要求传 `blockId` 或 `startBlockId/endBlockId`。不猜 ID、不将标题模糊匹配默认为唯一命中。
- 简单行内替换可用 str_replace；资源与跨块内容不能用它。
- 每次结构更新后重新 fetch；服务返回 partial_success/failed 明确报错，warnings/tips 不丢弃。未授权整篇重建时不要使用 overwrite。

## HTML 内容块路径

```bash
node skill/modes/04-feishu/scripts/index.mjs --input artifact.html \
  --target html-block --height-mode auto \
  --export-only --output-xml output/html.xml
```

- 必须是含 head/body 的完整单文件 HTML；不自动上传相对/本地依赖。不满足时停止并要求先制作 standalone 文件。
- 保留原始 HTML，仅整理 `use-iframe=true` 与 `html-box-height-mode` meta；不重绘资产或改写页面布局。
- `auto` 用于正文自然展开；`viewport` 用于内部滚动/切页。用户明确选择后才能改变展示模式。像素高度不是合法 meta 值。
- UTF-8 内容严格按 500,000 字节保守检查；超过则报错，不截断、不自动塞大 base64。
- 有外部资源时明确警告；CLI dry-run 不证明飞书能访问、运行或稳定显示它们。
- 下一轮云端探针用合成内容覆盖：普通排版、SVG、CSS/JS 交互、图表、auto/viewport、手机。记录每项保存重开和手机结果，再决定正式推荐范围。

## 本地命令与资源

```bash
# 安装对应工具依赖；先看当前帮助，不自动更换全局 CLI
npm install --prefix skill/modes/04-feishu/scripts
node skill/modes/04-feishu/scripts/index.mjs --help

# 完全本地，不调用 CLI
node skill/modes/04-feishu/scripts/index.mjs --input report.html \
  --plan plan.json --export-only --output-xml output/native.xml

# CLI dry-run，无云端写入
node skill/modes/04-feishu/scripts/index.mjs --input report.html \
  --plan plan.json --dry-run --output-xml output/native.xml
```

- `--profile` / `LARK_CLI_PROFILE` 明确账号；脚本固定显式 user 身份，不读写凭据。
- `--no-measure` 跳过可选浏览器测宽；退回源属性/CSS/默认值，须报告视觉限制。
- 远程图交 CLI 通过 href 处理；本地图支持 PNG/JPEG/GIF/WebP。SVG 需 Agent 决定路径。
- `--chunk-bytes` 手动按 UTF-8 字节、顶层块分块；单个不可拆大块可能仍超阈值。自动错误重试仍等待真实失败样本，避免重复创建。
- 输出 XML 时资源目录持久保留，一起移动；未指定输出文件时仅在 CLI 完成前保留临时目录。

## 当前官方依据

核查日期 2026-10-31，npm latest 与隔离运行版本均为 1.0.98，系统安装仍为 1.0.97。执行以版本匹配的 `lark-cli skills read ...` 和 `--help` 为准。

- [DocxXML：本地图片、画板、callout 合约](https://github.com/larksuite/cli/blob/main/skills/lark-doc/references/lark-doc-xml.md)
- [HTML 内容块及 500KB/meta 约定](https://github.com/larksuite/cli/blob/main/skills/lark-doc/references/lark-doc-xml-extended-blocks.md)
- [当前更新接口与 block ID](https://github.com/larksuite/cli/blob/main/skills/lark-doc/references/lark-doc-update.md)

## 验收边界

本轮没有登录、创建、上传、发布或同步 Hub。原生/HTML 路径 dry-run 通过只证明本地转换、资源和 CLI 请求兼容，不证明飞书服务端接受所有嵌套结构，也不证明手机视觉效果。剩余工作统一登记在 [Skill 与 milestone 审计](skill-roadmap-audit-2026-10-31.md)。
