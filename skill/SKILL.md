---
name: html-to-wechat
version: 0.1.0-dev
description: "把一份 standalone HTML Artifact 转成 4 种发布格式之一：公众号富文本（mode 1）/ 小红书图集（mode 2）/ 口播稿 markdown（mode 3）/ 飞书云文档（mode 4）。每个 mode 自成 skill，按 modes/0X-XXX/ 子目录组织；本入口指引 agent 选 mode。"
metadata:
  requires:
    bins: []
    skills: []
  cliHelp: "见各 mode 的 modes/0X-XXX/SKILL.md"
---

# html-to-wechat · 跨模式总入口

把一份 HTML Artifact 转成 4 种发布格式之一。每个模式是独立 skill；本文件帮助 agent 在用户场景下选对 mode。

## 模式速查

| Mode | 目标平台 | 输入 | 输出 | 状态 |
|---|---|---|---|---|
| **01-richtext** | 公众号富文本 | HTML | 公众号可粘贴的 HTML（juice 内联 CSS + DOM 清理） | ✅ 阶段 2a |
| **02-images** | 小红书图集 / 公众号图文号 | HTML | 8-10 张顶级生图模型卡片 + 文案 | ⏸ 阶段 5（前端 app 态 MVP 完成，agent 跑生图链路待续） |
| **03-script** | 口播稿（视频/播客） | HTML | spoken.md（去格式 + 字数时长） | ✅ 阶段 2b |
| **04-feishu** | 飞书云文档 | HTML | 飞书文档 URL（DocxXML 直转 → `docs +create`） | ✅ v0.1-v0.5b 全功能可用 |

## Mode 选择决策树（agent 用）

```
用户：「把这篇 HTML 转成 ...」
  ├─ 要在公众号发布、长图文风格 → mode 01-richtext
  ├─ 要在小红书 / 公众号图文号、图为主、需要 8-10 张卡片 → mode 02-images
  ├─ 要做视频脚本 / 播客口播稿 → mode 03-script
  └─ 要在飞书协同编辑、保留结构 → mode 04-feishu
```

## 跨模式范式：**X-C / X-A**

所有 mode 都按「**决策层（LLM 看截图产 plan.json）+ 执行层（pure function transform(html, plan)）**」拆分：

- **X-A**（execution，pure function）：纯算法，不依赖 LLM/网络/IO。本仓库的 `web/<mode>/transform.mjs` 是单 source of truth
- **X-C**（cognition，LLM）：跨 mode 共享 `render-snapshot.mjs`（puppeteer 截图）→ agent 自身看图 → 产 plan.json
- **default plan**（hardcoded 兜底）：服务"结构标准 HTML"，零依赖网页可直接跑；mode 01 web/richtext + mode 03 web/script 都靠 default plan 独立可用
- **LLM-generated plan**（X-C 产出）：服务复杂报告，把"视觉编码翻译成结构指令"（如 `.card-lvl` 当 callout / `.rail` drop 等）

详见 ROADMAP §「关键决策 → X-C/X-A」。

## 跨模式工具

- `render-snapshot.mjs`（puppeteer 截图，1280x800 dsf=2）：mode 04 / mode 01 共用，未来抽到 `lib/`
- 各 mode 自带 `package.json` 管 Node 依赖（juice/jsdom/cheerio/turndown/puppeteer/lark-cli 等）
- `make-fragment.mjs`（mode 02 web 投递工具）：agent 端生成 GH Pages app 态 URL

## 安装与使用

```bash
# 装单个 mode 的依赖
cd skill/modes/0X-XXX/scripts && npm install

# 跑（每个 mode 的 CLI 用法略不同）
node skill/modes/01-richtext/scripts/index.mjs --help
node skill/modes/03-script/scripts/index.mjs   --help
node skill/modes/04-feishu/scripts/index.mjs   --help

# mode 02 在前端 app 态运行；agent 端用 make-fragment 投递：
node skill/.../web/images/make-fragment.mjs payload.json
```

## 设计文档

- `docs/01-html-to-wechat-html.md` — mode 1
- `docs/02-html-to-images.md` — mode 2
- `docs/03-html-to-script.md` — mode 3
- `docs/04-html-to-feishu.md` — mode 4
- `ROADMAP.md` — PDCA 推进 + 阶段总览 + 当前状态指针
