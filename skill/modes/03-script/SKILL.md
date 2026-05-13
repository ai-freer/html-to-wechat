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

- **X-A（执行层）**：HTML → cheerio 清洗 → turndown 转 markdown → analyze 统计
- **X-C（决策层）**：可选 plan.json 覆盖默认行为（extractMain / bannedTags / keepImages / turndownOptions）
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
- turndown 对超长 inline 元素（如 100+ 字 `<span>`）可能产生超长段落——长句警告会提示
