---
name: html-to-wechat-richtext
version: 0.1.0-dev
description: "把一份 standalone HTML Artifact 转成微信公众号兼容富文本。输入 HTML 文件路径或 stdin → 输出公众号粘贴即用的 HTML（CSS 已 inline、表格列宽估算、半透明背景压平、details 展开等）。X-A 1A 纯函数 transform(html, plan)，可单独跑（默认 DEFAULT_PLAN）或配合 1C agent 看图后产的 plan.json 提供节点级 directives。"
metadata:
  requires:
    bins: []
    skills: []
  cliHelp: "node scripts/index.mjs --help"
---

# html-to-wechat-richtext (mode 1)

## 设计范式

- **X-A（执行层，纯函数）**：`transform(html, plan)` 跑 juice CSS 内联 + DOM 清理 + 公众号兼容修复，无 LLM、无 IO、无 UI 副作用
- **X-C（决策层，agent）**：用 `render-snapshot.mjs` puppeteer 截图后，让 multimodal LLM 看图 + 源码后产 `plan.json`（含节点级 directives）
- 1C 是可选的——零依赖时直接跑 default plan，能处理"结构标准"的 HTML（juice + 内置启发式）；复杂报告需要 1C 标注

## 前置（用户首次使用）

```bash
# 装本 skill 依赖（juice + jsdom；可选 puppeteer 用于 1C 视觉理解）
cd skill/modes/01-richtext/scripts && npm install
```

## 调用

```bash
# 最简：纯 1A，默认 plan
node scripts/index.mjs --input path/to/report.html --output wechat-ready.html

# 干跑（只看统计、不写文件）
node scripts/index.mjs --input path/to/report.html --dry-run

# 1C 流程（agent 视觉理解版）：
# 1) 先截图给 agent 看
node scripts/render-snapshot.mjs path/to/report.html /tmp/snapshot.png
# 2) agent 看图后产 plan.json（直接由调用方/agent 完成；本 skill 不内置 LLM）
# 3) 把 plan 喂给转换器
node scripts/index.mjs --input path/to/report.html --plan plan.json --output wechat-ready.html
```

输出：公众号兼容 HTML（stdout，便于管道）；统计与警告（stderr）；`--output` 指定时同时落盘。

## 范围

- ✅ CSS 内联（juice 10）+ unknown property 剥除（公众号"一条 declaration 不认就整条丢"）
- ✅ CSS 函数展平（clamp/min/max → ideal value，避免连带丢 background-color）
- ✅ viewport 单位换算（vw/vh → px，按 750×900 设计稿假设）
- ✅ Gradient / `var()` 背景展平（提取第一个 color stop）
- ✅ 半透明背景 alpha-blend 到不透明等效色（公众号渲染不可靠）
- ✅ 正文抽取（`<main>` / `<article>` / 启发式 chrome 剥除）
- ✅ 多列 flex/grid → `<table>`（公众号不认 flex/grid）
- ✅ `<dl><div><dt><dd>` → `<table>`（公众号会给 dt/dd 加 bullet）
- ✅ `<details>` 静态化展开（公众号 collapsed body 不显示）
- ✅ 长文本卡片折叠（5 列 + 长字 → 2 列 N 行）
- ✅ 同结构表合并（拖列宽改全部）
- ✅ 表格列宽估算（基于单元格文本长度）
- ✅ 节点级 directives（plan.json 来自 1C agent；selector + action）

## plan.json schema（简）

```json
{
  "extractMain": true,
  "bannedTags": ["script", "iframe", ...],
  "multiColConversion": { "enabled": true, ... },
  "directives": [
    { "selector": ".metric-strip", "action": "drop" },
    { "selector": ".lede-quote", "action": "preserve" }
  ]
}
```

完整 schema 见 `default-plan.mjs` 顶部注释 + `docs/01-html-to-wechat-html.md §3`。
不传 plan 等同 DEFAULT_PLAN（兜底，行为与浏览器版 `web/richtext/` 一致）。

## 已知坑

- **图片**：公众号必须用素材库链接，`<img src>` 远程 URL 粘贴后会被剥成本地占位。本 skill 不处理图片重新上传——产物里的 `<img>` 需要用户手动在公众号编辑器换素材库链接
- **SVG**：`<svg>` 内 `<image>` 同上，需手动换
- **iframe / script**：剥除，公众号不支持

## 出现问题怎么办

- `Cannot find module 'juice'` → 没装依赖。`cd scripts && npm install`
- 转换出来正文丢失 → 检查 `<main>` / `<article>` 是否存在；不存在时启发式 chromeSelectors 会剥过头，可在 plan 里把 `extractMain: false`
- 与浏览器版 `web/richtext/` 结果不一致 → 报 bug（应该 byte-identical；transform.mjs 主体是同源）
