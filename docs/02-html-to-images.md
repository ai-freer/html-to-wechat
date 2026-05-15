# 模式 2：HTML → 图文号 / 小红书图集

> 目标：把一篇长 HTML 文章转成 8-10 张视觉一致的 AI 卡片图 + 配套文案，可发小红书、公众号图文号。

> **核心方向调整（自 v0.1 起）**：图集卡片**一律走顶级文生图模型**（gpt-image-2 / DALL·E 3 / 即梦 等），**禁用** SVG / Canvas / satori / puppeteer 等代码渲染。
> 原因：用户与项目主理人在多轮试验后确认，顶级生图模型对中文长文密度（几百字单卡）的视觉表达 + 排版美感**远超** satori/Canvas 模板系统能达到的天花板。详见 CLAUDE.md memory `feedback_mode2_image_quality.md`。
> 本文档已按这个新方向**全面重写**；早期 satori/puppeteer 模板方案不再保留。

## 1. 输入与输出

**输入**：HTML 内容（同模式 1）。

**最终交付物**：一条 **GH Pages app 态 URL**（含 base64 fragment），用户开链接即看到：
- 8-10 张 AI 生成图集（顺序可拖排）
- 配套文案（钩子 + 价值 + 引导互动）+ hashtags
- 单图重生按钮（点 ↻ 复制 prompt 给 agent 重做）
- 一键打包 zip 下载

**底层产物**：
- N 张 PNG（每张一次 gpt-image-2 调用产出，传到公网可访问位置：图床 / 自有 CDN / fork 仓库的 raw.githubusercontent.com）
- 一份 `payload.json`（agent 端构造，作 fragment 输入）

> 本仓库 `samples/` 默认 `.gitignore` 仅做内部测试驱动用，**不**用 `samples/` 作为 mode 2 公开图源。外部用户用 mode 2 时自行处理图托管。

**目标平台参数**：
| 平台 | 图片数量 | 推荐尺寸 |
|---|---|---|
| 小红书 | 1-18 张（实务 8-10 张最佳）| 1024×1536（3:4） |
| 公众号图文号 | 1-9 张 | 1024×1536 或 1024×1024 |

## 2. X-C / X-A 范式

跟其它三 mode 不同，mode 2 没有"HTML→X 的纯函数"：

- **X-C（决策层，agent 主导）**：截图理解 → 拆 8-10 张卡片边界 → 为每张写完整 prompt（含全局风格前缀）→ 写 caption 与 tags
- **X-A（执行层）**：
  - `anthropic-skills:gpt-image`（**外部 skill**）跑生图，每张图独立调用
  - `skill/modes/02-images/scripts/make-fragment.mjs` 把最终 payload 编 base64 URL
  - `web/images/`（GH Pages app 态）做拖排序 / 重生指引 / zip 下载

所以本 mode 的 skill 包**没有 index.mjs 端到端 CLI**——是 agent 主导的多轮工作流。SKILL.md（`skill/modes/02-images/SKILL.md`）把 6 步 contract 写死。

## 3. 核心管线

```
input.html
   │
   ├─ ⓪ 视觉理解（强约束，见 §4.0）
   │     node skill/modes/02-images/scripts/render-snapshot.mjs input.html /tmp/snap.png
   │     agent Read /tmp/snap.png ← multimodal 看图
   │     截图不入产物，只是 agent 决策的视觉参考
   │
   ├─ ① 内容拆解（agent 写 plan）
   │     LLM 读全文 + 看截图 → 决定 8-10 张卡片
   │     每张写：alt（简述）+ prompt（含全局风格前缀，保证图集统一）
   │     输出：内存里的 plan 对象（先没 src，图还没生）
   │
   ├─ ② 逐张调 gpt-image-2 生图（外部 skill）
   │     用 anthropic-skills:gpt-image
   │     推荐：--size 1024x1536 --quality high
   │     每张 Read 确认（CLAUDE.md memory: 生图后必须呈出图）
   │     中文糊字时不要压 prompt（CLAUDE.md memory: 禁压 prompt 救乱码）
   │
   ├─ ③ 把图放公网（远程 URL 必须公网可读）
   │     选 1：图床（imgur / sm.ms / Cloudflare R2 / 用户自有 CDN）— 最常用
   │     选 2：commit 到自己的 fork / 独立仓库（注意本仓库 samples/ 是 .gitignore 不能用）
   │
   ├─ ④ 写 caption + tags（agent 直接做）
   │     captionText：钩子（≤30 字单段）+ 价值（2-4 行）+ 引导互动
   │     captionTags：3-7 个，含 1-2 个泛领域大标签
   │
   └─ ⑤ make-fragment → GH Pages URL → 给用户
         node skill/modes/02-images/scripts/make-fragment.mjs payload.json
         出 https://ai-freer.github.io/html-to-wechat/images/#app=<base64>
         用户点开 = app 态：拖排 / 重生 / zip
```

## 4. 关键工具与机制

### 4.0 视觉理解（强约束）

**所有内容拆解决策必须基于"截图 + 源码"双输入，不能只读 DOM**。

**Why**：HTML Artifact 的信息大量编码在视觉里——卡片分组、颜色对比、阴影层级、空间分割。只读 DOM 树容易：
- 把视觉上一个语义单元误拆成多个（带阴影复合卡片）
- 把装饰性 div 当成正文段落
- 错过视觉强调（大字号 / 高对比色块标识的核心金句）
- 不理解信息的"视觉权重"，切卡片时主次倒置

这条约束已被项目早期踩坑实证（CLAUDE.md memory `feedback_html_visual_understanding.md`）。

**How**：
```bash
node skill/modes/02-images/scripts/render-snapshot.mjs input.html /tmp/snap.png
# 然后 agent Read /tmp/snap.png
```

跨模式约束：mode 4 同样强制（docs/04 §6.2）；mode 1 用于 1C plan；mode 3 可选。

### 4.1 gpt-image-2 的 prompt 工程

**全局风格前缀**：图集风格统一靠 prompt 第一段。Agent 在 step ① 决定一段固定文案（如"deep navy background, isometric vector illustration, single warm orange accent color, clean typography in Chinese, no decorative borders"），每张图 prompt 前都拼上。

**单卡 prompt 结构**：
```
{全局风格前缀}, {本卡视觉主题}, {核心文字内容（标题 / 副标题 / 关键词）},
{构图：center / left-aligned / split-screen / stacked}, {字数密度提示}
```

中文长文密度（一张图含 200-400 字）的处理：gpt-image-2 实测能扛，糊字时**重试原 prompt** 而不是压缩——这是 CLAUDE.md memory `feedback_no_prompt_shrinking.md` 的硬约束。

**尺寸**：默认 `1024x1536`（3:4，小红书最优），图文号 `1024x1024` 也行。

### 4.2 Fragment 协议 + payload.json schema

把整个图集状态编 base64 进 URL hash，零后端、可收藏、可分享。

```json
{
  "title": "上下文管理九层塔",
  "captionText": "...\n\n...\n\n...",
  "captionTags": ["#AI #Agent", "#上下文工程", ...],
  "images": [
    { "src": "https://...", "alt": "01 / 封面：xxx", "prompt": "完整 gpt-image-2 prompt" },
    ...
  ]
}
```

schema 范本：`skill/modes/02-images/scripts/payload-example.json`。
约束：
- `images[i].src` 必须**公网可读**（app 端 fetch 不可达就显示黑底占位）
- `images[i].alt` **不要**含 "01 / " 前缀（app 端自动加序号；payload alt 含前缀会被 strip 后再加，行为定义在 app.mjs line 104）
- `images[i].prompt` 推荐填——↻ 重生按钮直接复制本字段给 agent

**Fragment 大小估算**：8 图含 prompt ~3KB，50 图也只 ~20KB；浏览器 URL 上限 2MB 完全够。

### 4.3 前端 app 态 (`web/images/`)

无后端，纯静态。两种触发：

| URL 形态 | 行为 |
|---|---|
| `web/images/` | Landing 教育页：展示 demo 图集 + 工作流说明 |
| `web/images/?app=true` | app 态壳子（无 payload）：用 demo 图演示交互 |
| `web/images/#app=<base64>` | app 态 + payload：agent 投递的完整产物 |

app 态特性（commit `7c8ed17` MVP 完成 + `b886b18` bug 修复 + 视觉质检通过）：
- 拖排序（HTML5 dragstart/dragover）
- 单图重生按钮（点 ↻ → 复制 prompt 给 agent）
- 一键打包 zip（JSZip fetch 所有图 + caption.txt）
- 复制 fragment URL

## 5. 已知坑与设计取舍

1. **中文渲染偶失**：gpt-image-2 中文长文本（300+ 字单卡）偶尔糊字。**禁止压 prompt 救乱码**（CLAUDE.md memory）—— 重试原 prompt 即可
2. **远程图必须公网**：fragment 编的是 URL 不是图本身；URL 不通 app 端只能黑底占位
3. **首图权重 90%**：图集生态首图决定点击率。Agent 必须在 step ① 给首图最重的视觉设计
4. **风格一致性**：靠全局风格前缀强约束。Agent 在 step ① 写完风格前缀后，后续每张图 prompt 必须复用
5. **文案不是文章摘要**：小红书文案是"钩子 + 价值 + 引导"的话术，不是论文摘要
6. **alt 不要含序号前缀**：app 端自动加 "01 / "；payload alt 已含会被 strip 后再加（修复了重复 bug，commit b886b18）

## 6. Skill 与前端的边界

| 步骤 | 谁来做 | 在哪跑 |
|---|---|---|
| ⓪ 截图理解 | agent（Read 截图） | `node render-snapshot.mjs` 产 PNG |
| ① 内容拆解（plan） | LLM | agent 进程内 |
| ② gpt-image-2 生图 | 外部 skill `anthropic-skills:gpt-image` | agent 调用，API key 在外部 skill |
| ③ 图入仓库 / 图床 | agent + git/curl | agent 进程 + 远程 |
| ④ caption + tags | LLM | agent 进程内 |
| ⑤ make-fragment | Node 脚本 | 本 skill `make-fragment.mjs` |
| ⑥ 前端 app 态交互 | 静态前端 | 浏览器（GH Pages） |

**关键约束**：前端零密钥、零后端。任何花钱、需鉴权的事都在 agent / 外部 skill 端做完，前端只接收 fragment URL 渲染。

## 7. 实现状态

- ✅ **app 态前端 MVP**（commit `7c8ed17`）：fragment 协议 + 拖排 + 单图重生（复制 prompt）+ zip 下载
- ✅ **skill 骨架**（commit pending）：`skill/modes/02-images/SKILL.md` + `scripts/render-snapshot.mjs` + `scripts/make-fragment.mjs` + `scripts/payload-example.json`
- ✅ **真实图集 demo**：`samples/context-tower-9layers/`（8 张 AI 卡 + caption + prompts + plan + learnings + style_sheet；现内部追踪，详见 `samples/README.md`）
- ✅ **app 态视觉质检 + 3 处 alt 前缀重复 bug 修复**（commit `b886b18`）

## 8. 不在范围内

- 自动发布到小红书 / 公众号（两个平台都没有公开发图 API，且小红书反自动化严格）
- 视频化（属于模式 3 的衍生）
- **代码渲染图模板**（satori / Canvas / SVG / puppeteer 排版）—— 已确认不如顶级生图模型，**永久不做**
- 自建 image_provider 抽象层 —— 用外部 skill `anthropic-skills:gpt-image` 即可，不重复造轮子
