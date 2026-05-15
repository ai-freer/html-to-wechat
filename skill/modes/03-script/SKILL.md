---
name: html-to-wechat-script
version: 0.1.0-dev
description: "把一份 standalone HTML Artifact 转成口播稿 markdown。输入 HTML → 输出可念出来的口播稿（去格式、去图、表格摘要化），附带字数/估时长/段落/句长统计。X-A 纯函数 transform(html, plan) — 可单跑也可配合 1C agent 看图后产 plan.json。"
metadata:
  requires:
    bins: []
    skills: []
  cliHelp: "node scripts/index.mjs --help"
---

# html-to-wechat-script (mode 3)

## 设计范式

- **X-A（执行层，纯函数）**：HTML → cheerio 清洗 → turndown 转 markdown → analyze 统计
- **X-C（决策层）— 本 mode 通常退化为不需要**：mode 3 plan 只有 4 个字段（extractMain / bannedTags / keepImages / turndownOptions）—— 文本结构信息从 HTML DOM 直接读就够，**不强制要求 agent 看截图**
- **X-C 仍然有用的场景**：多 article 报告 + 装饰性页面 chrome 干扰严重时（参考 bench 对比：单 article 用 default plan 够 / `samples/full-report-standalone.html` 14 个 article 必须 `{extractMain:false}` 兜底）；agent 截图看完后能更精准定 `bannedTags`
- 250 字/分钟 = 4 字/秒 估时长；句长警告：平均 > 35 字、单句 > 50 字、>200 字未切段

## 前置

```bash
cd skill/modes/03-script/scripts && npm install
```

## 调用

```bash
# 最简
node scripts/index.mjs --input path/to/report.html --output spoken.md

# 干跑（只看统计）
node scripts/index.mjs --input path/to/report.html --dry-run

# 用 plan 覆盖默认（如保留图片占位、保留表格）
node scripts/index.mjs --input report.html --plan plan.json --output spoken.md

# 可选：先截图给 agent 看，再让 agent 写更精准的 plan（X-C 路径）
node scripts/render-snapshot.mjs path/to/report.html /tmp/m3-snap.png
# agent Read /tmp/m3-snap.png 后写 plan.json，再调上面 --plan 流程
```

输出：markdown 到 stdout + stats/warnings/sections 到 stderr。

## 范围

- ✅ HTML 黑名单剥除（script/style/nav/aside/header/footer/svg 等）
- ✅ 正文抽取（`<article>` 选最长 / `<main>` / `<body>` 兜底）
- ✅ 图片默认去除（口播稿不要图）
- ✅ 表格 → "[此处原文是一张表格，口播时跳过或用 1-2 句话总结]"
- ✅ markdown 转换（turndown，可定制 headingStyle / codeBlockStyle / 列表标记）
- ✅ 字数 / 估时长 / 句数 / 平均句长 / 段落切分（按 `## H`）
- ✅ 段落级时长 hint：`## 标题 (12s)` 支持人工标注
- ✅ 警告：长句、超长段、无切段

## plan.json schema（简）

```json
{
  "extractMain": true,
  "bannedTags": ["script","style","..."],
  "keepImages": false,
  "turndownOptions": {
    "headingStyle": "atx",
    "codeBlockStyle": "fenced",
    "bulletListMarker": "-"
  }
}
```

完整 schema 见 `html-to-script.mjs` 顶部 `DEFAULT_PLAN`。

## 与 web/script/ 关系

- 浏览器版 `web/script/` 接收 fragment markdown 直接 analyze（不做 HTML→md，因为 fragment 协议已经传 md 进来）
- skill 版本是「HTML → md → analyze」三步管线，给 agent 在本地端跑
- 共享算法核心：`analyze.mjs`（与 `web/script/app.mjs` 的 analyze 部分行为等价；同步约定）

## 已知坑

- 无 `<article>` / `<main>` 时启发式 `<body>` 兜底，可能保留过多页面装饰——这时用 plan 加 `bannedTags` 扩列
- **多 `<article>` 报告（如 dashboard 类）启发式只取最长的一个**：会大幅丢内容（bench 实测 full-report 取出 130 chars / body 含 34863 chars）→ 必须 `--plan` 传 `{"extractMain": false}` 兜底
- turndown 对超长 inline 元素（如 100+ 字 `<span>`）可能产生超长段落——长句警告会提示
