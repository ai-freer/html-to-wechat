---
name: html-to-wechat-images
version: 0.1.0-dev
description: "把一份 standalone HTML Artifact 转成小红书 / 公众号图文号的 8-10 张图集 + 配套文案。这个 mode 由 agent 主导编排：截图理解 → 拆卡片写 prompt → 调顶级生图模型（gpt-image-2 等）→ 写 caption + tags → 用 make-fragment.mjs 产 GH Pages app 态 URL。本 skill 提供工具脚本（render-snapshot / make-fragment），不内置生图 API 与 LLM——生图走外部 skill（anthropic-skills:gpt-image），LLM 决策由 agent 自己跑。"
metadata:
  requires:
    bins: []
    skills: ["anthropic-skills:gpt-image"]
  cliHelp: "见下方「Agent 调用 contract」"
---

# html-to-wechat-images (mode 2)

> **核心约束**：卡片图一律走顶级文生图模型（gpt-image-2 等），**禁用** SVG / Canvas / satori / puppeteer 等代码渲染。详见 ROADMAP §「不在 Roadmap 范围内 → 代码渲染卡片图」。

## 设计范式

这个 mode 的 X-C/X-A 边界跟其它三 mode 不一样：

- **X-C（决策层，agent 自己跑）**：截图理解 → 拆 8-10 张卡片 → 为每张写 prompt（含全局风格前缀，保证图集风格一致）→ 写 caption 文案 + hashtags
- **X-A（执行层）**：
  - `anthropic-skills:gpt-image`（外部 skill）跑生图，每张图独立调用
  - `make-fragment.mjs`（本目录）把最终 payload 编成 base64 URL hash
  - `web/images/`（GH Pages 前端 app 态）做拖排序 / 单图重生指引 / zip 下载

也就是说，**本 skill 没有 `index.mjs` 端到端 CLI 入口** — mode 2 是 agent 主导的多轮工作流，不是"丢 HTML 进去等 URL 出来"。SKILL.md 写死 contract 让 agent 按步走。

## 前置（用户首次使用）

```bash
# 装可选依赖（仅 render-snapshot 需要 puppeteer）
cd skill/modes/02-images/scripts && npm install

# 确认外部生图 skill 可用（agent 端检查）
# anthropic-skills:gpt-image 在 Claude Code / 类似 agent 里已默认装好
```

## Agent 调用 contract（必读）

agent 收到「把这份 HTML 转成图集」类请求时，按下面 6 步：

### 步骤 1：截图理解（强约束）

```bash
node skill/modes/02-images/scripts/render-snapshot.mjs <input.html> /tmp/mode2-snapshot.png
```

然后 **必须 Read** `/tmp/mode2-snapshot.png` —— agent 是 multimodal，靠看图理解视觉层次（卡片分组、强调色、装饰元素），仅读 DOM 容易拆错卡片边界。同源约束见 mode 4 §6.2。

### 步骤 2：内容拆解（agent 写 plan）

agent 看图 + 读 HTML 源码后，决定切成 N 张卡片（一般 8-10 张，封面 + 总论 + 各论 + 收尾）。每张卡片确定：
- `alt` —— 卡片简短描述（"01 / 封面：上下文管理九层塔" 这种）
- `prompt` —— 完整 gpt-image-2 prompt，含**全局风格前缀**（一段固定文案确保整组卡片风格一致）

输出：内存里的 plan 对象，结构见 `scripts/payload-example.json`（先不含 `src`，因为图还没生）。

### 步骤 3：逐张调 gpt-image-2 生图

每张图调一次 `anthropic-skills:gpt-image`（agent 用 Skill 工具）：
- 推荐参数：`--size 1024x1536`（3:4 小红书最优，也兼容图文号）+ `--quality high`
- `--output <localpath>` 写到本地（agent 工作区或 /tmp）
- 生图返回后 **必须 Read 那张图**（CLAUDE.md memory：生图后必须呈出图给用户）

中文渲染失败时不要压缩 prompt（CLAUDE.md memory：禁止压 prompt 救乱码，重试原 prompt）。

### 步骤 4：把图放到可公网访问的位置

GH Pages app 态需要远程图 URL（不能用 base64：fragment 太大）。三种放法：
1. **`raw.githubusercontent.com`**：把图 commit 进当前仓库的 `samples/<name>/images/` → URL 直接可用（推荐）
2. **图床**（imgur / sm.ms / 用户自有）：上传后拿 URL
3. **本地预览**：纯本地试看，可在 `web/images/?app=true` 下点"复制 app 链接"先验流程，但发布前必须换远程 URL

### 步骤 5：写 caption + tags

agent 直接写。约束：
- captionText：钩子（≤30 字单段）+ 价值（2-4 行）+ 引导互动（点赞/收藏/评论/关注）
- captionTags：3-7 个，含 1-2 个泛领域大标签

### 步骤 6：用 make-fragment 产 GH Pages URL

写 `payload.json`（schema 见 `scripts/payload-example.json`），然后：

```bash
node skill/modes/02-images/scripts/make-fragment.mjs payload.json
# 出：https://ai-freer.github.io/html-to-wechat/images/#app=eyJ0aXR...
```

把这条 URL 给用户。用户点开就是 app 态：拖排序、单图重生（点 ↻ 复制 prompt 回粘给 agent）、一键打包 zip。

## 范围

- ✅ 截图理解前置（`render-snapshot.mjs`，与 mode 4 同源）
- ✅ Fragment 协议投递（`make-fragment.mjs`，与 `web/images/` 同源；3043 chars / 8 图）
- ✅ Payload schema 范本 + agent contract 文档
- ✅ 拖排序 / 单图重生（复制 prompt）/ zip 下载在 app 态（前端 commit 7c8ed17）
- ⏸ 不做：本地代码渲染图（satori/puppeteer/Canvas/SVG）—— 这条 ban 见 CLAUDE.md memory `feedback_mode2_image_quality.md`

## payload.json schema

详见 `scripts/payload-example.json`。关键字段：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `title` | string | ✅ | 显示在 app 态 hero 顶部 |
| `captionText` | string | ✅ | 下方文案，含 `\n` 分段 |
| `captionTags` | string[] | ✅ | hashtag 数组，每条带 `#` |
| `images[i].src` | URL | ✅ | 远程图 URL（raw.githubusercontent / 图床）|
| `images[i].alt` | string | ✅ | 卡片简述；**不要含 "01 / " 前缀**（app 端自动加序号） |
| `images[i].prompt` | string | 推荐 | 原 gpt-image-2 prompt；点 ↻ 重生时会复制给 agent |

## 与 web/images/ 关系

- 浏览器版 `web/images/`：前端 app 态壳子 + 教育页 demo
- skill 版（本目录）：agent 端工具 + contract
- 共享：fragment 协议（base64-utf8 JSON）+ payload schema
- 同源文件：`make-fragment.mjs` 两边等价；改一处同步另一处

## 已知坑

- **中文渲染**：gpt-image-2 中文长文本偶尔糊字，CLAUDE.md memory 明确 **不要靠收缩 prompt 救乱码**——重试原 prompt 即可
- **远程图 URL 必须公网可读**：fragment 只编 URL 不编图本身；URL 不通 app 端只能显示黑色占位
- **fragment 长度**：8 图含 prompt 约 3KB，50 图约 20KB，浏览器 URL 上限 ~2MB 完全够用
- **生图后必须 Read 那张图**：CLAUDE.md memory `feedback_present_generated_images.md`

## 出现问题怎么办

- `make-fragment` 出的 URL 在浏览器里只显示黑底卡片 → 检查 `images[i].src` 公网可达（curl -I 试一下）
- app 端 hero 字数不对 / tile 序号重复 → 升级到本 skill v0.1.1+（修复了 alt 前缀重复 bug）
- 想本地试看不公开图 → 用 `web/images/?app=true` demo 模式先验流程，发布前换远程 URL
