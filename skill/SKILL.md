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
| **01-richtext** | 公众号富文本 | HTML | 公众号可粘贴的 HTML（juice 内联 CSS + DOM 清理 + directives） | ✅ 完整（web/skill 同源）|
| **02-images** | 小红书图集 / 公众号图文号 | HTML | 8-10 张 gpt-image-2 卡片 + caption + fragment URL | ✅ skill 工具 + agent contract + 前端 app 态 MVP |
| **03-script** | 口播稿（视频/播客）| HTML | spoken.md（HTML→md + 字数/时长/句长统计） | ✅ X-A 完整，X-C 退化为可选（X-C 仍可用于多 article 报告） |
| **04-feishu** | 飞书云文档 | HTML | 飞书文档 URL（DocxXML 直转 → `docs +create` + media 后置 + 局部精修） | ✅ v0.5c 完整（v0.5d marker） |

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

- `render-snapshot.mjs`（puppeteer 截图，1280x800 dsf=2 fullPage + selector 区块截图）：mode 01/02/03/04 四份等价副本（第三次重复出现时正式抽到 `lib/`）
- 各 mode 自带 `package.json` 管 Node 依赖（juice/jsdom/cheerio/turndown/puppeteer/lark-cli 等）
- `make-fragment.mjs`（mode 02 投递工具）：agent 端生成 GH Pages app 态 URL；本 skill `skill/modes/02-images/scripts/make-fragment.mjs` 与 web 端 `web/images/make-fragment.mjs` 等价同源

## 安装与使用

```bash
# 装单个 mode 的依赖（按需）
cd skill/modes/0X-XXX/scripts && npm install

# Mode 01: 公众号富文本（端到端 CLI）
node skill/modes/01-richtext/scripts/index.mjs --help
node skill/modes/01-richtext/scripts/index.mjs --input report.html --output wechat.html

# Mode 02: 图集（agent 主导工作流，看 SKILL.md 6 步 contract）
node skill/modes/02-images/scripts/render-snapshot.mjs report.html /tmp/snap.png
# agent Read /tmp/snap.png → 写 plan → 调外部 anthropic-skills:gpt-image 出图
node skill/modes/02-images/scripts/make-fragment.mjs payload.json
# 出 https://ai-freer.github.io/html-to-wechat/images/#app=<base64>

# Mode 03: 口播稿
node skill/modes/03-script/scripts/index.mjs --input report.html --output spoken.md
# 多 article 报告必须传 plan
node skill/modes/03-script/scripts/index.mjs --input report.html --plan '{"extractMain":false}' --output spoken.md

# Mode 04: 飞书云文档（端到端 CLI）
node skill/modes/04-feishu/scripts/index.mjs --input report.html
# 出飞书文档 URL
```

## 设计文档

- `docs/01-html-to-wechat-html.md` — mode 1
- `docs/02-html-to-images.md` — mode 2
- `docs/03-html-to-script.md` — mode 3
- `docs/04-html-to-feishu.md` — mode 4
- `ROADMAP.md` — PDCA 推进 + 阶段总览 + 当前状态指针
