# 模式 4：HTML → 飞书云文档（DocxXML 直转）

> 目标：把一份 standalone HTML Artifact 直接灌成一份**可协同编辑的飞书云文档**，画板可拖、嵌套结构正确、视觉接近原图。**HTML → DocxXML → `lark-cli docs +create`** 一步到位——服务端把 DocxXML 解析成原生 Block 树，飞书独家容器（grid / callout / whiteboard）全部原生支持。

## 0. 决策演进史（开工前必读）

模式 04 的实现路径经历了三次重大修订，每次都缩小工作量：

| 版本 | 路径 | 工作量 | 触发原因 |
|---|---|---|---|
| 初稿 | HTML → Block IR → `batch_create` 全自建 emitter | 大（需要写 IR 树 + 分批 + parent_id 追踪 + 容器递归）| —— |
| v2 | HTML → convert 端点（服务端解析）| 中（v0.1 一次 API，v0.3+ 挖锚点 + 增量改造）| 发现 `POST /docx/v1/documents/:id/blocks/convert` 端点 |
| **v3 当前** | **HTML → DocxXML → `docs +create`** | **小（v0.1 一次 CLI，飞书独家容器原生覆盖）** | `npx skills add` 装上官方 `lark-doc` skill 后发现 `docs +create --content '<docx-xml>'` 直接吃 DocxXML，且 DocxXML 覆盖 grid/callout/whiteboard |

v3 路径已通过 **CLI 探针 + 视觉质检**双重验证（见 `samples/probe/01-minimal.docxxml` 生成的实测文档）。

## 1. 输入与输出

**输入**：HTML 内容（同模式 1，**三种来源任一**：本地文件 / 公开 URL / HTML 字符串）。

**最终交付物**：一个飞书云文档 URL（形如 `https://{tenant}.feishu.cn/docx/{doc_id}`，tenant subdomain 取决于用户租户）。用户点开即可在飞书里看到完整文档，可编辑、可分享、可邀请协同。

**中间产物**（用于调试与归档）：
- `*.snapshot.png` —— 整页截图，**给 agent 视觉理解用**，不入文档
- `*.docxxml` —— DocxXML 字符串，`--dry-run` 模式下产出，不调真实 API
- `*.create-response.json` —— `docs +create` 响应，含 `document.url` / `document.document_id` / `new_blocks[]`（whiteboard 等资源块的 block_token 列表）

## 2. 关键决策（已对齐）

- **飞书身份**：默认 UAT（用户身份，扫码 OAuth），文档作者归属用户本人。`--as bot` 作为可选参数，留给"应用代表组织发文档"场景
- **CLI 调用方式**：全程 `lark-cli` 子进程。`docs +create / +fetch / +update` 三个高阶子命令覆盖 v0.1-v0.5 所有写入操作；通用 `lark-cli api POST/GET` 仅用于 v0.5 兜底全自建 IR 时调用 `batch_create`
- **API 版本**：mode 4 全程 `--api-version v2`。v2 之外（`--api-version v1` 默认值）不接受 DocxXML，参数集合也不同；不要混用
- **DocxXML 为唯一中间表示**：不走 Markdown 中转——`lark-doc` skill 自己也说 Markdown 不支持 callout / grid / whiteboard / todo / 文字颜色等飞书独家 block，需要在 Markdown 里混 XML 才行，**Markdown 路径反而更复杂**
- **DocxXML 解析在服务端**：客户端只生成 XML 字符串，不维护 Block 树 / 不追 block_id / 不分批——这些都是服务端的事
- **`<title>` 取自 HTML `<title>` 或第一个 `<h1>`**：DocxXML `<title>` 是文档级标题，每篇唯一
- **视觉理解仍强制**：HTML 类名再花哨也猜不准 grid / callout / whiteboard 容器语义——agent 看截图 + 读源码做容器判定，详见 §6.2
- **模式 4 是 100% Skill-only**：飞书 token 不能放静态前端，没有"纯网页入口"
- **第三方 skill 不进 git**：用户自己装 `@larksuite/cli` + 跑 `npx skills add https://open.feishu.cn --skill -y`，跟装 `git`/`gh` 一样属于用户环境前置。`.agents/` / `skills/` / `.claude/` 已加 `.gitignore`

## 3. DocxXML 数据模型（理解前置）

DocxXML 是飞书定义的"HTML 子集 + 扩展标签"格式。**所有标准 HTML 标签语义不变**（p, h1-h9, ul, ol, li, table, thead, tbody, tr, th, td, blockquote, pre, code, hr, img, b, em, u, del, a, br, span），在此之上加飞书独家扩展。

### 3.1 扩展标签速查

**块级 / 容器**：
- `<title>` — 文档标题（每篇唯一）
- `<callout>` — 高亮框。属性：`emoji`（默认 💡）/ `background-color` / `border-color` / `text-color`
- `<grid>` + `<column>` — 分栏。`<column>` 必带 `width-ratio`，同 grid 内列的 ratio 之和为 1
- `<whiteboard>` — 嵌入画板。`type="mermaid|plantuml|blank"`
- `<checkbox>` — 待办项。`done="true|false"`
- `<figure>` / `<bookmark>` —— v0.5 才用

**行内**：
- `<img>` — 图片，**可独立成块或内联**。属性：`width` / `height` / `caption` / `name` / `href`（远程 URL）或 `src`（已上传 token）
- `<cite type="user|doc">` — @人 / @文档
- `<latex>` — 行内公式（v0.5）
- `<a type="url-preview">` — 链接预览卡片

### 3.2 美化系统（颜色与 emoji）

**颜色命名色（基础 7 色）**：`red / orange / yellow / green / blue / purple / gray`，可加前缀派生 `light-{色}` / `medium-{色}`。也支持 `rgb(...)`。

**官方 emoji 推荐表**：`💡(默认) ✅ ❌ ⚠️ 📝 ❓ ❗ 👍 ❤️ 📌 🏁 ⭐`——其中 ⚠️ 实测 fallback。

✅ **v0.5a 实证白名单（probe W6Y6dEImAo5cUFxbFlRcb0hBnvf, 30 个保留）**：
`💡 📌 ✅ ❌  📝 📋 📄 📑  ❗ 🔔 🚨 🛑  🔍 🔧  📊 📈 📉 📅 🕐  ⭐ 🎯 🔥 🚀 🎉 🆕  🌟 🤔 💬 💼 📷`

❌ **实证 fallback 名单（4 个）**：`⚠️ ℹ️ ⚙️ 🛠`（普遍带 U+FE0F 变体选择符）。转换器自动替换：⚠️→❗ / ℹ️→💡 / ⚙️→🔧 / 🛠→🔧（`emojiFallbackSubstitutes` 表可覆盖）。详见 §7 坑 A 更新条目。

### 3.3 行内样式硬嵌套顺序

行内样式标签**必须按以下固定顺序嵌套**（外 → 内）：

```
<a> → <b> → <em> → <del> → <u> → <code> → <span> → 文本
```

关闭顺序严格反转。HTML 源里 `<em><b>X</b></em>` 必须改写成 `<b><em>X</em></b>`——这是 HTML → DocxXML 转换器的硬约束。

### 3.4 列表合并规则

- 连续同类型 `<li>` 自动合并为一个 `<ul>` 或 `<ol>`
- 嵌套子列表必须放在 `<li>` 内部
- 有序列表的每个 `<li>` 用 `seq="auto"` 自动编号

### 3.5 转义规则

**标签本身禁止转义**，**只有文本内容里的 `< > &` 要转义**：

```
❌ &lt;p&gt;内容&lt;/p&gt;
✅ <p>A &amp; B 的对比：1 &lt; 2</p>
```

`\n` 在文本节点里转 `<br/>`。

## 4. HTML → DocxXML 映射表

> **sample-driven 渐进补全**——v0.1 跑通后 C 阶段收集"丢失/不准清单" → A 阶段把清单分两类：「下个 vX 必须支持的」与「截图兜底就行的」。每个 vX 都会有新增条目，这是预期。

### 4.1 文本与列表（v0.1 全支持）

| HTML | DocxXML | 备注 |
|---|---|---|
| `<h1>` ~ `<h6>` | `<h1>` ~ `<h6>` | 飞书支持到 `<h9>`，HTML 只有 6 级 |
| `<p>` | `<p>` | 直接保留 |
| `<blockquote>` | `<blockquote>` | 直接保留 |
| `<hr>` | `<hr/>` | 自闭合 |
| `<pre><code class="language-bash">` | `<pre lang="bash"><code>` | `class="language-XXX"` → `lang="XXX"` |
| `<ul><li>` / `<ol><li>` | `<ul><li>` / `<ol><li seq="auto">` | 嵌套子列表必须放 `<li>` 内 |
| `<input type="checkbox"> + label` | `<checkbox done="true|false">` | 识别 task list 语法 |
| inline `<strong>` / `<b>` | `<b>` | 注意 §3.3 嵌套顺序 |
| inline `<em>` / `<i>` | `<em>` | 同上 |
| inline `<a href>` | `<a href>` | 同上 |
| inline `<code>` | `<code>` | 同上 |
| inline `<u>` / `<del>` / `<span>` | 同名 | 同上 |
| inline `<br>` | `<br/>` | 自闭合 |

### 4.2 表格（v0.1 全支持）

| HTML | DocxXML | 备注 |
|---|---|---|
| `<table><thead><tr><th>` | 同上 | 飞书自动补 `<colgroup>` + 单元格 `<p>` 包裹 |
| `<tbody><tr><td>` | 同上 | `vertical-align="top"` 自动加 |
| `<td colspan="2">` / `<td rowspan="2">` | 同名 | 合并单元格仅起始格输出 |
| 列宽控制 | `<colgroup><col span="N" width="120"/></colgroup>` | HTML 没有 → 默认均分。如需指定：在 §6.2 视觉理解阶段决策 |

### 4.3 图片（v0.1 支持远程 URL 直转，v0.2 接入本地/base64）

| HTML | DocxXML | 备注 |
|---|---|---|
| `<img src="https://...">` 远程公网 URL | `<img href="https://..." width="W" height="H"/>` | **服务端自动拉取入库**——§6.4 两遍法 v0.1 不需要。**必须显式 width/height**（否则放大失真，见 §7 坑 C）|
| `<img src="data:image/...;base64,...">` | v0.1 占位为 `<p>[图片：alt 文本]</p>` | v0.2 先解码到本地再走 `+media-insert` |
| `<img src="./local.png">` | 同上，v0.1 占位 | v0.2 同上 |
| inline `<svg>` 装饰图 | v0.1 占位 / v0.2 puppeteer rasterize 后上传 | v0.4 才决策 SVG → image 的标准 |

### 4.4 飞书独家容器（v0.1 全支持，需视觉理解决策）

| HTML（约定） | DocxXML | 触发判定 |
|---|---|---|
| `<div class="grid grid-cols-N">` 或 Tailwind 双栏布局 | `<grid><column width-ratio="0.5">...</column>...</grid>` | agent 看截图判断"这是分栏布局" |
| `<div class="callout">` / 带 emoji icon 的卡片 / 带显著背景色的 div | `<callout emoji="💡" background-color="light-yellow">...</callout>` | agent 看截图判断"这是高亮提示框" |
| 多个 callout 横排 | `<grid><column>` 嵌 `<callout>` | 同上 |
| 复杂卡片视觉（圆角 + 阴影 + 标题 + 内容） | 优先 `<callout>` 容纳 + 内部 h3/p/ul | callout 子块限文本/标题/列表/待办/引用（**实测 img 也支持，文档过时**）|

### 4.5 画板（v0.1 部分支持）

| HTML | DocxXML | 备注 |
|---|---|---|
| `<pre><code class="language-mermaid">` | `<whiteboard type="mermaid">DSL</whiteboard>` | **服务端创建可编辑画板**，返回 block_token |
| `<pre><code class="language-plantuml">` | `<whiteboard type="plantuml">DSL</whiteboard>` | 同上 |
| inline `<svg>` 图表（非装饰）| v0.1 占位 / v0.4 尝试翻译成 Mermaid → `<whiteboard>`；失败兜底 image | 复杂场景 |

### 4.6 降级（v0.5 才上）

| HTML | 处理 |
|---|---|
| 复杂背景层 / 装饰性 div 套娃 | 整块截图 → `<img>` 块（视觉保真但失去可编辑）|
| 交互元素（hover / click 状态切换）| 静态化为默认状态，删除控件，复用模式 1 的"交互静态化"逻辑 |
| LaTeX 数学公式（MathJax 渲染）| `<latex>...</latex>` —— HTML 源识别启发式待定 |

## 5. 核心管线（v0.1）

```
input.html
   │
   ├─ ① 视觉理解（puppeteer，强制）
   │     headless render → snapshot.png
   │     agent 看图 + 读源码，决策："哪些是 grid / callout / whiteboard / 装饰"
   │     输出落到 transform-plan.json（参考模式 1 的 X-C 决策层）
   │
   ├─ ② DOM 清理 + plan 应用（复用模式 1 的 1A 思路）
   │     juice 内联 CSS、删 <script>
   │     展平交互（折叠 / tab / 弹窗 → 默认可见态）
   │     按 plan 标注容器边界（哪些 div 是 grid、哪些是 callout、哪些是 whiteboard）
   │
   ├─ ③ HTML → DocxXML 转换（4A，纯函数）
   │     递归 walk HTML AST：
   │       - 标准标签按 §4.1/4.2 同名映射
   │       - 远程 <img> 按 §4.3 加 width/height 改 href
   │       - 容器按 plan 标注改写成 <grid>/<callout>/<whiteboard>
   │       - 行内样式按 §3.3 顺序重排
   │       - 文本节点按 §3.5 转义
   │     输出 standalone DocxXML 字符串
   │
   ├─ ④ 创建文档（一次 CLI 调用）
   │     lark-cli docs +create --api-version v2 --content @output.docxxml
   │     拿到 document_id + url
   │     resp.new_blocks 含 whiteboard 等资源块的 block_token（v0.3 用）
   │
   └─ ⑤ 输出文档 URL
         从 create 响应取 data.document.url
         echo "$url"
```

**v0.2+ 的图片接入** 会在 ③ 之前插一段「资源预处理」，处理本地/base64 图片走 `+media-insert`。**v0.3+ 的画板兜底** 会在 ④ 之后插一段「画板验证 + 失败重建」。**v0.4+ 的精修** 走 `docs +update` 的 8 种局部指令（str_replace / block_insert_after / 等等）。**v0.5+ 的全自建 fallback**：DocxXML 过大或服务端解析失败时退回 IR + `batch_create`（参考初稿设计）。

## 6. 关键工具与机制

### 6.1 lark-cli 调用约定

**前置安装**（用户首次使用）：

```bash
# 1. 装 CLI（npm prefix 在用户目录可避开 sudo）
npm install -g @larksuite/cli

# 2. 装配套官方 agent skills（教 agent 怎么用 docs/im/calendar/...）
npx -y skills add https://open.feishu.cn --skill -y

# 3. 配应用凭据（浏览器引导）
lark-cli config init --new

# 4. OAuth 登录（device flow，扫码同意）
lark-cli auth login --recommend

# 5. 验证
lark-cli auth status
lark-cli api GET /open-apis/authen/v1/user_info
```

**mode 4 实际调用**（Skill 脚本里 spawn 子进程）：

```bash
# 创建文档（v0.1 主入口）
lark-cli docs +create --api-version v2 --content @output.docxxml

# 干跑（不调真实 API，检查请求体）
lark-cli docs +create --api-version v2 --content @output.docxxml --dry-run

# 读已有文档（v0.4 的 block_id 定位 / 调试）
lark-cli docs +fetch --api-version v2 --doc "<URL or doc_id>" --detail with-ids

# 局部更新（v0.4 嵌套容器精修 / 画板替换）
lark-cli docs +update --api-version v2 --doc "<id>" --command block_replace --block-id "<id>" --content "<docx-xml>"

# 本地图片插入（v0.2 关键接口）
lark-cli docs +media-insert --doc "<id>" --file ./image.png
# 或剪贴板图（最优场景，截屏直接拿）
lark-cli docs +media-insert --doc "<id>" --from-clipboard

# 画板更新（v0.3 复杂 Mermaid 兜底）
lark-cli whiteboard +update --whiteboard "<board_token>" --dsl "<mermaid-or-plantuml>"

# 通用 OpenAPI（v0.5 fallback 全自建 IR 时）
lark-cli api POST /open-apis/docx/v1/documents/{id}/blocks/{parent}/children/batch_create --data @blocks-batch.json
```

**Spawn 开销**：单文档总 CLI 调用通常 ≤ 3 次（create-doc + 视情况补 media-insert / whiteboard-update），spawn 总开销 < 500ms，相对网络往返可忽略。

**Token 管理**：CLI 自己管 keychain，access token 2 小时有效，refresh token 7 天有效，CLI 自动续期。Skill 脚本零代码触碰 token。

### 6.2 视觉理解（跨模式强制约束）

详细规约见 memory `feedback_html_visual_understanding.md`。

**为什么强制**：HTML Artifact 大量信息编码在视觉里（卡片分组、颜色对比、阴影层级、空间分割）。只读 DOM 极易把视觉上一个语义单元误拆，或把装饰元素当正文。**模式 4 强制**：

1. Skill 端预渲染：`render-snapshot.mjs` 用 puppeteer 输出全页 PNG（必要时分段）
2. agent 工作流第一步：用 `Read` 工具读 PNG（multimodal）
3. agent 在做转换决策时**同时看截图 + 读源码**，决定：
   - 哪些 div 应该改写成 `<grid>` / `<column>` / `<callout>` / `<whiteboard>`
   - 哪些 `<img>` 是关键图、哪些是装饰图（决定 width/height 怎么设）
   - 哪些视觉元素无法语义化（v0.5 兜底走截图块）

**实现要点**：

```javascript
// skill/modes/04-feishu/scripts/render-snapshot.mjs
import puppeteer from 'puppeteer';
const browser = await puppeteer.launch({ headless: 'new' });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 2 });
await page.goto(`file://${inputPath}`, { waitUntil: 'networkidle0' });
await page.screenshot({ path: outputPng, fullPage: true });
```

### 6.3 HTML → DocxXML 转换器（纯函数，4A 执行层）

**输入**：清理后的 HTML 字符串 + transform-plan.json（容器边界标注）
**输出**：DocxXML 字符串

核心是 cheerio 递归 walk：

```javascript
function emit(node, plan) {
  if (node.type === 'text') return escapeText(node.data);  // §3.5
  const tag = node.tagName;
  const children = node.childNodes.map(c => emit(c, plan)).join('');

  // 容器决策：plan 标注的边界覆盖标签级映射
  const boundary = plan.boundariesAt(node);
  if (boundary === 'grid') return `<grid>${children}</grid>`;
  if (boundary === 'column') return `<column width-ratio="${plan.ratioFor(node)}">${children}</column>`;
  if (boundary === 'callout') return `<callout emoji="💡" background-color="light-yellow">${children}</callout>`;
  if (boundary === 'whiteboard-mermaid') return `<whiteboard type="mermaid">${plan.dslFor(node)}</whiteboard>`;

  // 标签级同名映射（§4.1/4.2）
  if (tag in DIRECT_MAP) return wrap(DIRECT_MAP[tag], children, node);

  // 图片（§4.3）
  if (tag === 'img') return emitImg(node, plan);

  // 行内样式重排（§3.3）
  if (tag in INLINE_TAGS) return reorderInline(node, children);

  // 未知标签：丢标签留 children（降级）
  return children;
}
```

**关键约束**：
- 转换器**不做任何 API 调用**——纯字符串变换，可单元测试
- 容器边界决策**完全由 plan 提供**——agent 在 ① 阶段产出
- 列表合并由 cheerio walk 自然产生（连续 `<li>` 同父）
- 转义只发生在文本节点（§3.5）

### 6.4 图片处理三档（v0.1 → v0.2）

```
v0.1：
  远程 URL <img src="https://..."> → <img href="https://..." width="W" height="H"/>
  - 服务端自动拉取
  - width/height 来自 HTML 源 attr / CSS 计算值 / 视觉理解兜底（默认 800x600）
  - 没显式尺寸 → 放大失真（§7 坑 C）

  base64 / 本地路径 → v0.1 占位 <p>[图片：alt]</p>

v0.2：
  base64 / 本地：
    base64 → 解码到 tmp/{hash}.png
    本地 → 直接用
    → 调 lark-cli docs +media-insert --doc <id> --file <path>
    （CLI 内部 4 步编排：upload media → fetch doc → insert block → 验证；含自动 rollback）

  inline <svg>：
    puppeteer rasterize 该元素 → tmp/{hash}.png
    走上面 media-insert 路径
```

**关键差异 vs 初稿"两遍法"**：v0.1/v0.2 都**不需要**预扫上传 + token 替换两遍——v0.1 把远程 URL 直接交给服务端，v0.2 用 `+media-insert` 一次封装。

### 6.5 画板 DSL（v0.1 内联 + v0.3 兜底）

```
v0.1：
  <pre><code class="language-mermaid">DSL</code></pre>
    → <whiteboard type="mermaid">DSL</whiteboard>
  服务端创建可编辑画板，create 响应里 new_blocks[] 含 board_token

v0.3：
  画板验证 + 兜底
    create 后用 +fetch 检查 whiteboard 块的实际节点数
    DSL 解析失败 → lark-cli whiteboard +update --whiteboard <token> --dsl <修正后 DSL>
    多次失败 → puppeteer rasterize 原 DSL 为 PNG → 走 +media-insert 替换
```

## 7. 已知坑（开工前必读）

按"v0.1 探针实测 + 视觉质检"实证之后的清单：

1. **`docs +create --content` 长度上限未实测**：v0.1 第一个真实 sample 跑车展报告 standalone（几万字 + 几十个块）时同时探。预估上限存在；超量时按 skill 文档建议「只建骨架 + `+update --command append` 分段追加」
2. **API rate limit**：飞书有 QPS 限制——单文档 mode 4 只 ≤ 3 次 API 不会触发；批处理多文档时加 p-limit 控制（≤ 5 并发）
3. **token 过期**：UAT access token 2 小时 / refresh token 7 天，CLI 自动续期。**长流程（如批转 100 份 Artifact）中途可能踩到 refresh 失败**——监控 CLI 退出码，非 0 时单独重试 auth 流程
4. **嵌套深度 ≤ 5 层视觉无压力**：实测 grid > column > callout > h3 > ul > nested-ul 五层渲染正常。超过 5 层未实测，谨慎
5. **emoji 静默 fallback（坑 A）**：原 XML 写 `emoji="⚠️"` 服务端**不报错**，静默替换成默认 💡。**v0.5a 探针实证白名单已固定**（probe W6Y6dEImAo5cUFxbFlRcb0hBnvf）：30 个保留、4 个 fallback（⚠️ ℹ️ ⚙️ 🛠，普遍带 U+FE0F 变体选择符）。**v0.5a 起转换器自动替换**：⚠️→❗ / ℹ️→💡 / ⚙️→🔧 / 🛠→🔧，并 push 一条 warning 让调用方知道。完整白名单见 §3.2；plan.emojiFallbackSubstitutes 可覆盖默认替换
6. **fetch 输出不含样式属性 ≠ 创建丢失（撤销原坑 B）**：原以为 `background-color` 丢了——实际**视觉渲染完全正确**，只是 `docs +fetch` 输出的 XML 不回显样式属性。是 fetch 协议的事，不是创建丢失。**这条不是坑，作为提醒**：v0.4 用 fetch + str_replace 做精修时，不能用 fetch 输出当唯一真实来源，样式靠创建时写入
7. **img 默认尺寸放大失真（坑 C）**：原 XML `<img href="..."/>` 无 width/height，飞书默认放大到容器宽度。**16x16 favicon 拉到 700+ 像素严重模糊**。**必须**：从 HTML 源 attr / CSS 计算值取尺寸；HTML 没标尺寸时由 §6.2 视觉理解给一个合理值（默认 800x600 兜底）
8. **Code 块 caption 异常自吃换行**（已**撤销**担忧）：探针时见 `caption="&#xA;"`，担心污染显示——视觉质检看到代码块显示正常（"Code block" 标签 + 行号 + 代码内容），caption 换行被 CLI 自动处理。**不是坑**
9. **文档 URL 是 tenant subdomain**：`https://xcnstdjabsyi.feishu.cn/docx/...`，不是统一 `feishu.cn/docx/...`。**始终用 create 响应里的 `data.document.url` 字段**，不要自己拼 URL
10. **行内样式嵌套顺序硬约束**：`<a> → <b> → <em> → <del> → <u> → <code> → <span>` 外→内。HTML 源里顺序错乱必须重排；否则 DocxXML 解析失败或样式丢失
11. **首次扫码授权后**：用户的 token 在 keychain，跨机器/重装系统会丢——文档要写清"换机器要重新扫码"
12. **国际版 Lark vs 国内飞书**：base URL 不同（`open.feishu.cn` vs `open.larksuite.com`），CLI 的 `--brand feishu|lark` 控制。多账号场景要明确
13. **`<ol>` 直接包 `<callout>` 子节点 → 服务端整体丢弃（v0.3a 探针 A 实证）**：DocxXML 写 `<ol><callout/><callout/></ol>`，飞书前端**不**渲染那些 callout——既不合并为列表项也不显示，整体被吞。**修法**：plan 标注 `.card-lvl`-类视觉容器时，要让它们 emit 为 callout 平级兄弟，不能套在 ol 内。已 v0.3a 探针 A/B/C 三变体证实
14. **`<callout>` 内多 inline 兄弟节点空白被吞 → 文本粘连（v0.3a bench 实证）**：源 HTML 是 `<span>Current</span><span>C2-C3</span>...`，cheerio + escapeText 输出后 docxxml 也保留了空白，但**飞书 callout 渲染时把 inline 元素间所有空白吃掉**，渲染出 `CurrentC2-C3PotentialC4EvidenceA` 粘连文本。**修法**：plan 在 `boundaryAnnotations` 里给 callout 类标注加 `joinWith: " · "`，emit 时用可见分隔符串联子元素。已落地 transform.mjs:`emitChildrenJoined()` + bench-plan v0.2-demo
15. **Mermaid 画板：v0.1 内联 DSL 路径足够稳（v0.3b 探针实证）**：3 变体（简单流程图 / sequence diagram / subgraph + 自定义样式）全部一次成功，无需 v0.3 原计划的 +fetch 验证 + rasterize 兜底。**结论**：仅当后续遇到真实失败 sample 再上 v0.3 的兜底分支，先不预防性写
16. **`+update` 走 Lark-flavored Markdown，不是 DocxXML（v0.4 实证）**：`+create` 走 DocxXML、`+update` 走 markdown。同一份文档"创建用一种格式、精修用另一种"——这是飞书的协议设计，看起来不一致但是合理的——markdown 是飞书生态的通用编辑语言。**所以**：mode 4 高层流程里，agent 产精修指令时要直接生成 Lark-flavored Markdown，不要尝试转 DocxXML 片段
17. **`lark-cli --file / --content / --markdown` 类参数统一规则（v0.1/v0.2c/v0.4 三次踩到）**：所有这类参数都有 "must be relative path within current directory" 安全约束。**统一绕开方法**：
    - `--content -` / `--markdown -` → 通过 stdin 灌内容（v0.1 +create / v0.4 +update 用法）
    - `--file <basename>` + spawn `{ cwd: dirname(file) }` → 让 CLI 看到"相对路径"（v0.2c +media-insert 用法）

## 8. Skill 与前端的边界

| 步骤 | 谁来做 | 在哪跑 |
|---|---|---|
| ① 视觉理解（render snapshot）| puppeteer 脚本 | Skill 本地 Node |
| ② plan 决策（看图判分块/容器）| agent (multimodal LLM) | agent 进程内 |
| ③ DOM 清理 + HTML → DocxXML | 脚本（纯函数）| Skill 本地 Node |
| ④ 创建文档（一次 `docs +create`）| 脚本调 `lark-cli` | Skill 本地 Node，spawn 子进程 |
| ⑤ 输出文档 URL | 脚本 echo | agent 显示给用户 |

**没有前端入口**——飞书 token 不能放静态前端，模式 4 是 100% Skill-only。可选有一个极简的 `web/feishu/` 落地页，只用来展示"成功 / 失败 / 丢失清单"，不接收 HTML 输入。

## 9. 实现路径（对齐 ROADMAP 阶段 3-4）

```
v0.1（阶段 3）— DocxXML 直转最短路径 ⭐ 当前
  实施前：已通过 samples/probe/01-minimal.docxxml 探针 + 浏览器视觉质检
  支持：
    - 文本类：h1-h6 / p / ul / ol / blockquote / hr / table / 内联粗体斜体链接代码
    - 飞书独家：grid + callout + whiteboard(mermaid) **原生支持**
    - 图片：远程 URL 直转（带 width/height）
  不支持：
    - 本地/base64 图片（v0.2）
    - 画板复杂 DSL 兜底（v0.3）
    - 局部精修（v0.4）
    - 高保真样式（v0.5）
  跑通：DOM 清理 + plan 应用 → HTML→DocxXML → 一次 docs +create → 出 URL
  Done 标准：sample（context-tower-9layers / 车展报告）跑通；视觉质检通过；自写 emitter 代码量为零，纯转换器代码量预估 < 500 行

v0.2（阶段 4-A）— 本地/base64 图片接入
  保留 v0.1 DocxXML 主干
  HTML → DocxXML 转换器扩展：base64 → tmp 解码、本地路径直用
  调 docs +media-insert 替换 v0.1 的占位
  Done 标准：context-tower-9layers（含 base64 图）跑通，图正确显示

v0.3（阶段 4-B）— 画板验证与兜底
  create 后 +fetch 验证 whiteboard 节点数
  失败 → whiteboard +update 重试；多次失败 → puppeteer rasterize 为 PNG → media-insert 兜底
  Done 标准：含复杂 Mermaid 的 sample 跑通，画板可拖

v0.4（阶段 4-C）— 局部精修（docs +update 8 种命令的工程化）
  HTML 源里散布的「关键 block 需要后置加工」场景（比如 callout 内嵌特殊 block / 跨页同步引用）
  封装 +update 的 block_replace / block_insert_after / str_replace 三个最常用指令
  Done 标准：能演示「先 create 出骨架文档，再针对性精修一个 callout / 替换一段代码块」

  ⚠️ 注意：原计划 v0.4「自建递归 emitter 处理嵌套容器」**已删除**——DocxXML 服务端原生支持 grid/callout/whiteboard，那部分工作量塌缩到 v0.1。
  v0.4 现在的内容是「精修工程化」，跟原计划完全不同。

v0.5（阶段 4-D）— 高保真样式 + emoji 白名单 + 截图兜底
  - 内联 style 解析 → DocxXML 的 span text-color / background-color
  - emoji 白名单专项探针（实测哪些 emoji 不被 fallback）
  - 装饰性视觉块（无法语义化的 div 套娃）→ puppeteer 区块截图 → media-insert
  - DocxXML 过大 / 服务端解析失败 → fallback 全自建 IR + batch_create（保留作为最后退路）
  Done 标准：视觉相似度 > 80%
```

## 10. 不在范围内（明确划界）

- **飞书 → HTML 反向**：用别人发的飞书文档转回 HTML Artifact 编辑（一期不做，飞书有自己的导出）
- **bot 身份作为默认**：UAT 是默认，bot 仅作为 `--as bot` 可选参数
- **团队版凭证集中托管**：用 CLI 默认的 keychain，不上 Credential 扩展点
- **多维表格 / 电子表格作为目标**：模式 4 只到 docx，bitable / sheet 是不同数据模型，未来如有需要走独立模式
- **OpenClaw 插件复用**：飞书官方插件底层会跟 CLI 对齐，但本项目走"独立 Skill 包"路径
- **后端服务**：项目坚持零后端，飞书 token 通过 CLI keychain 管理
- **Docs Add-on（文档块插件）路径**：把 HTML Artifact 注册成可嵌入飞书文档的 webapp 块——这是**独立项目**，不进模式 04。两者目标不同：模式 04 要的是 HTML 内容**变成飞书原生 Block**（可搜索 / 可评论 / 可协同编辑文字）；Add-on 给的是"在文档里嵌一个 webapp 容器"，内容仍是网页，不进飞书 Block 模型
