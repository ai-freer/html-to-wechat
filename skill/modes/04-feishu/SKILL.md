---
name: html-to-feishu
version: 0.1.0-dev
description: "把一份 standalone HTML Artifact 转成飞书云文档（DocxXML 直转）。输入 HTML 文件路径或 stdin → 输出飞书文档 URL。当用户给你一份 HTML 报告/分析/卡片想要在飞书里协同编辑时，用本 skill。包含 grid/callout/whiteboard 等飞书独家容器支持（v0.1 需要 plan 标注，v0.2+ 视觉理解自动判定）。"
metadata:
  requires:
    bins: ["lark-cli"]
    skills: ["lark-doc"]
  cliHelp: "node scripts/index.mjs --help"
---

# html-to-feishu (mode 4)

## 前置（用户首次使用）

```bash
# 1. 装飞书官方 CLI（npm prefix 在用户目录可避开 sudo）
npm install -g @larksuite/cli

# 2. 装配套官方 agent skills（含 lark-doc，本 skill 依赖）
npx -y skills add https://open.feishu.cn --skill -y

# 3. 配应用凭据（浏览器引导，~1 分钟）
lark-cli config init --new

# 4. OAuth 登录（device flow，扫码，~30 秒）
lark-cli auth login --recommend

# 5. 验证
lark-cli auth status
```

## 调用

```bash
# 装本 skill 依赖（首次）
cd skill/modes/04-feishu/scripts && npm install

# 转换 + 创建飞书文档
node scripts/index.mjs --input path/to/report.html

# 干跑（不调真实 API）
node scripts/index.mjs --input path/to/report.html --dry-run

# 仅输出 DocxXML（不创建文档）
node scripts/index.mjs --input path/to/report.html --output-xml out.docxxml --dry-run
```

输出：飞书文档 URL（stdout 最后一行）；统计与警告（stderr）。

## v0.1 范围

- ✅ 文本类：h1-h6 / p / ul / ol / table / blockquote / hr / code 块 / 行内 b/em/a/u/del/code/span
- ✅ 远程 URL `<img>`（DocxXML href，服务端拉取，必带 width/height）
- ✅ 标签清理（剥 script/style/nav/aside/header/footer/...）
- ⏸ 飞书独家容器（grid/callout/whiteboard）：依赖 4C agent 视觉理解 plan；v0.1 default plan 不识别——HTML 源里这些视觉容器会被穿透为扁平段落
- ⏸ 本地/base64 图片（v0.2 走 `+media-insert`）
- ⏸ 复杂 mermaid 兜底（v0.3）
- ⏸ 局部精修 / 高保真样式（v0.4 / v0.5）

详见 `docs/04-html-to-feishu.md`。

## 已知坑（高优先级）

- **emoji 静默 fallback（坑 A）**：DocxXML 不支持的 emoji（如 ⚠️/📷）会被服务端替换为 💡。v0.1 转换器统一用 💡 兜底
- **img 默认尺寸放大失真（坑 C）**：远程 `<img>` 必须显式 width/height，否则飞书放大到容器宽度造成模糊。v0.1 兜底 800×600
- **document URL 是 tenant subdomain**：`https://{tenant}.feishu.cn/docx/...`，不是 `feishu.cn/docx/`。本 skill 始终用 create 响应的 `data.document.url` 字段

## 出现问题怎么办

- `lark-cli: command not found` → 没装 CLI / 没加 PATH。回到「前置」§1
- `validation: --content: invalid file path` → 升级到本 skill v0.1.1+（修复了走 stdin 而不是 `@path`）
- `unauthorized` → token 过期。跑 `lark-cli auth status`；如失效跑 `lark-cli auth login --recommend`
- 转换出来文档结构错乱（重复编号 / 游离 span / 容器被穿透）→ 这是 v0.1 default plan 限制，等 v0.2 视觉理解 plan 启用
