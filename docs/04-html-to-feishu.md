# 模式 4：HTML → 飞书云文档（Docx Block 直转）

> 目标：把一份 standalone HTML Artifact 直接灌成一份**可协同编辑的飞书云文档**，画板可拖、嵌套结构正确、视觉接近原图。不走 Markdown 中转，HTML → Block 树一步到位。

## 1. 输入与输出

**输入**：HTML 内容（同模式 1，**三种来源任一**：本地文件 / 公开 URL / HTML 字符串）。

**最终交付物**：一个飞书云文档 URL。用户点开即可在飞书里看到完整文档，可编辑、可分享、可邀请协同。

**中间产物**（用于调试与归档）：
- `*.snapshot.png` —— 整页截图，**给 agent 视觉理解用**，不入文档
- `*.blocks.json` —— Block IR 树，`--dry-run` 模式下产出，不调真实 API
- `*.assets.json` —— 资源上传清单（图片 url → file_token、画板 DSL → board_id）

## 2. 关键决策（已在 ROADMAP 对齐）

- **飞书身份**：默认 UAT（用户身份，扫码 OAuth），文档作者归属用户本人。`--as bot` 作为可选参数，留给"应用代表组织发文档"场景
- **CLI 调用方式**：全程 `lark-cli api POST/GET` 通用子命令，Token 在 keychain，Skill 脚本零代码触碰
- **Block 映射策略**：B 方案为主——尽力映射到语义最近的 block，宁可平也要可编辑；真正语义化不了的视觉块走截图兜底（v0.5 才上）
- **不走 Markdown 中转**：HTML AST → Block 树同构递归，避开"扩展 Markdown 语法"的不可移植性
- **模式 4 是 100% Skill-only**：飞书 token 不能放静态前端，没有"纯网页入口"

## 3. 飞书 Block 数据模型（理解前置）

飞书云文档（Docx）的底层是**有序的 Block 树**：

```
document
└─ children[]: [block_1, block_2, ...]
                 ├─ block_1.children: [...]   # 容器型 block 才有
                 └─ block_2.children: [...]
```

- 每个 block 有 `block_type`（heading1 / text / bullet / column / callout / image / board / table / code 等几十种）
- 容器型 block（如 column、callout、quote_container）通过 `children` 嵌套
- 内联样式（粗体、斜体、链接、颜色）写在 block 的 `elements` 数组里，不是独立 block
- 创建用 `POST /open-apis/docx/v1/documents/{id}/blocks/{parent_id}/children/batch_create`
- 一次 batch_create 有数量上限（实测 ~50 / 批），超量需要分批

## 4. HTML → Block 映射表

> **本节是 sample-driven 渐进式补全的**——初始版基于通用 HTML Artifact 结构推演，**实际覆盖度通过样例迭代完善**：
> - v0.1 跑第一个 sample → C 阶段收集"丢失清单"（没映射到任何 block 的 DOM 节点 / agent 视觉理解后觉得映射不准的节点）
> - A 阶段把清单分两类：「下个 vX 必须支持的」与「截图兜底就行的」
> - 映射表每个 vX 都会有新条目，不追求一次写全
>
> 当前表是「计划支持的最小集合」，不是「最终形态」。

### 4.1 文本类（叶子 block）

| HTML | Feishu Block | 备注 |
|---|---|---|
| `<h1>` ~ `<h9>` | `heading1` ~ `heading9` | 飞书最多 9 级 |
| `<p>` | `text` | |
| `<pre><code>` | `code` | 识别 `class="language-xxx"` → 设 `language` 字段 |
| `<blockquote>` | `quote_container` | 容器，子节点再 emit |
| `<hr>` | `divider` | |
| `<img>` | `image` | 必须先上传换 `file_token`（见 6.4） |
| `<table>` | `table` | 子节点 `table_cell` |
| inline `<strong>` `<em>` `<u>` `<a>` `<code>` | text 的 `elements` 内联样式 | 不产生独立 block |

### 4.2 列表类

| HTML | Feishu Block | 备注 |
|---|---|---|
| `<ul><li>` | `bullet` | 每个 `<li>` 一个 block，嵌套 `<ul>` 走 children |
| `<ol><li>` | `ordered` | 同上，自动编号 |
| `<input type="checkbox"> + <li>` | `todo` | 识别 task list 语法 |

### 4.3 容器类（飞书独家价值，重点）

| HTML（约定） | Feishu Block | 触发条件 |
|---|---|---|
| `<div class="grid grid-cols-2">` 或 Tailwind 类 column 布局 | `grid` + `grid_column` 子项 | agent 视觉理解判断"这是分栏布局" |
| `<div class="callout">` / 带 emoji icon 的卡片 | `callout` | 带 `background_color` + `emoji_id` 字段 |
| 多个 callout 横排 | `grid` 套 `callout` | 参考用户提供的「column + callout 嵌套」示例 |

### 4.4 图表类（画板）

| HTML | Feishu Block | 备注 |
|---|---|---|
| ` ```mermaid ` 代码块 | `board` | DSL 直接调画板 API，**可编辑矢量画板** |
| ` ```plantuml ` 代码块 | `board` | 同上 |
| inline `<svg>` 装饰图 | `image`（rasterize 成 PNG） | 矢量图变光栅，但不可编辑 |
| inline `<svg>` 图表 | 优先尝试翻译成 Mermaid → `board`；失败 → `image` | v0.2 不强求，先走 image |

### 4.5 降级（v0.5 才上）

| HTML | 处理 | 备注 |
|---|---|---|
| 复杂背景层 / 装饰性 div 套娃 | 整块截图 → `image` block | 视觉保真但失去可编辑——只在 v0.5 兜底使用 |
| 交互元素（hover / click 状态切换） | 静态化为默认状态，删除控件 | 复用模式 1 的"交互静态化"逻辑 |

## 5. 核心管线

```
input.html
   │
   ├─ ① 视觉理解（puppeteer，关键约束）
   │     headless render 整页 → snapshot.png
   │     agent 读图 + 读源码，决策："哪些是分栏 / callout / 图表 / 装饰"
   │     这一步的输出是 agent 上下文里的"理解"，落到 IR 决策中
   │
   ├─ ② DOM 清理（复用模式 1）
   │     juice 内联 CSS、删 <script>
   │     展平交互（折叠/tab/弹窗 → 默认可见态）
   │
   ├─ ③ 资源预处理（两遍法的第一遍）
   │     扫所有 <img> / inline base64 / inline SVG → 并发上传飞书素材
   │     扫所有 ```mermaid ``` / ```plantuml ``` → 调画板 API 预创建
   │     产出 assets.json：url → file_token / dsl → board_id 映射
   │
   ├─ ④ Block IR 生成（递归 emitter）
   │     emitBlock(domNode, parentId) 递归
   │     按 §4 映射表 + agent 的视觉理解决策 → block 树
   │     查 assets.json 把图/画板的 token 填进去
   │     产出 blocks.json（dry-run 时停在这里）
   │
   ├─ ⑤ 创建文档
   │     lark-cli api POST /docx/v1/documents
   │     拿到 document_id
   │
   ├─ ⑥ 灌块（深度优先，按批）
   │     遍历 block 树，按 parent_id 分组
   │     每组 ≤ 50 块走一次 batch_create
   │     有 children 的容器块插完后递归插子节点
   │
   └─ ⑦ 输出文档 URL
         echo https://feishu.cn/docx/{document_id}
```

## 6. 关键工具与机制

### 6.1 飞书 CLI 调用约定

**全程 `lark-cli` 子进程**，Skill 脚本不直接接触 token：

```bash
# 一次性 OAuth（用户扫码）
lark-cli auth login

# 通用 OpenAPI 调用
lark-cli api POST /open-apis/docx/v1/documents --data '{"folder_token": "..."}'
lark-cli api POST /open-apis/docx/v1/documents/{id}/blocks/{parent}/children/batch_create --data @blocks-batch.json
lark-cli api POST /open-apis/drive/v1/medias/upload_all --form file=@cover.png

# dry-run 验证（不发请求，看用了哪组凭证）
lark-cli api GET /open-apis/calendar/v4/calendars --dry-run
```

Token 由 CLI 管理（环境变量 / keychain），Skill 端只 spawn 子进程 + 拼 JSON 数据。

**Spawn 开销估算**：单文档总 CLI 调用 < 20 次（create-doc 1 次 + 上传 N 次 + batch_create M 次 + 画板 K 次），每次 ~30-50ms spawn，总开销 < 1s，相对于网络往返可忽略。

### 6.2 视觉理解（强约束，跨模式）

详细规约见 memory `feedback_html_visual_understanding.md`。

**为什么强制**：HTML Artifact 大量信息编码在视觉里（卡片分组、颜色对比、阴影层级、空间分割）。只读 DOM 极易把视觉上一个语义单元误拆，或把装饰元素当正文。本约束**强制**所有模式 4 转换流程：

1. Skill 端预渲染：`render-snapshot.mjs` 用 puppeteer 输出全页 PNG（必要时分段输出）
2. agent 工作流第一步：用 `Read` 工具读 PNG（agent 是 multimodal，能直接看）
3. agent 在做 IR 决策时**同时看截图 + 读源码**，截图本身不进入产物

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

### 6.3 嵌套块递归 emitter

DOM 树 → Block 树**同构递归**，核心就一个函数：

```javascript
async function emitBlock(domNode, parentBlockId, depth = 0) {
  const blockSpec = mapDomToBlock(domNode, agentDecisions);  // 查映射表 + agent 决策
  const blockId = await batchCreateOne(blockSpec, parentBlockId);
  for (const child of getSemanticChildren(domNode)) {
    await emitBlock(child, blockId, depth + 1);
  }
}
```

- 容器块（grid / callout / quote_container）先创建，拿到 `block_id` 再插子节点
- 兄弟节点同 parent_id 的可批量打包，减少 API 调用
- 深度无硬限制，但飞书 UI 对 column 嵌套有视觉建议（一般 ≤ 3 层）

### 6.4 图片上传两遍法

```
第一遍（扫描 & 上传）
  walkDom(html, node => {
    if (node.tagName === 'IMG') queue.push(node.src);
    if (node.tagName === 'SVG') queue.push(rasterizeToTempPng(node));
  });
  await Promise.all(queue.map(src =>
    exec(`lark-cli api POST /drive/v1/medias/upload_all --form file=@${src}`)
      .then(resp => assets.set(src, resp.data.file_token))
  ));

第二遍（emit 时查表）
  在 emitBlock 中遇到 IMG：
    blockSpec = { block_type: 'image', image: { token: assets.get(src) } }
```

- `<img src>` 是远程 URL → 先下载到 tmp 再上传
- base64 `<img src="data:image/png;base64,...">` → 直接 decode 写 tmp 再上传
- inline `<svg>` → puppeteer 单独 render 该元素 → PNG → 上传

### 6.5 画板 DSL 直转

**飞书会把 Mermaid / PlantUML DSL 自动转成可编辑矢量画板**——这是模式 4 选择飞书作为目标的核心理由之一。

```
识别：HTML 里的 <pre><code class="language-mermaid">graph TD; ...</code></pre>
抽取：DSL 文本
调用：lark-cli api POST /board/v1/whiteboards
          --data '{"create_type": "mermaid", "dsl": "..."}'
拿到：board_id
嵌入：在 doc 里 batch_create 一个 block_type=board 的块，引用 board_id
```

团队成员打开文档点画板 → 进入完整画板编辑器 → 拖节点、改文字、加新图形 → 跟原生画板完全一致。

**降级**：复杂 Mermaid 失败时（语法不支持 / 太大 / 渲染异常），用 puppeteer rasterize Mermaid 块为 PNG，走 image block 路径。这一步在 v0.5 兜底。

## 7. 已知坑（开工前必读）

1. **batch_create 单批上限**：实测 ~50 块/次，超量分批；同 parent_id 的兄弟可一批，跨 parent 必须分批
2. **API rate limit**：飞书有 QPS 限制，并发上传图片不要无脑 `Promise.all`，加 p-limit 控制（≤ 5 并发）
3. **token 过期**：UAT 有效期约 2 小时，CLI 会自动 refresh，但长流程中可能踩到中段过期——失败重试时优先重试 token 流程
4. **column 嵌套深度**：超过 3 层视觉会很挤；emitter 在深度 > 3 时做扁平化兜底
5. **callout 的 emoji_id**：要查飞书 emoji 字典（不是 Unicode），常见的 💡⚠️📝🎯先内置一份白名单
6. **SVG → PNG 清晰度**：deviceScaleFactor 至少 2，否则文字模糊
7. **画板 DSL 失败静默**：飞书画板对 Mermaid 语法子集支持，复杂 syntax 可能"成功创建但内容空"，需要 sanity check（创建后 GET 验证节点数 > 0）
8. **跨账号空间隔离**：document_id 在不同 tenant 不通用，文档分享要走分享 URL，不是 ID
9. **国际版 Lark vs 国内飞书**：base URL 不同（`open.feishu.cn` vs `open.larksuite.com`），CLI 的 brand 字段控制，多账号场景要明确
10. **首次扫码授权后**：用户的 token 在 keychain，跨机器/重装系统会丢——文档要写清"换机器要重新扫码"

## 8. Skill 与前端的边界

| 步骤 | 谁来做 | 在哪跑 |
|---|---|---|
| ① 视觉理解（render snapshot） | puppeteer 脚本 | Skill 本地 Node |
| ② IR 决策（看图判断分块） | agent (multimodal LLM) | agent 进程内 |
| ③ DOM 清理 + IR 生成 | 脚本 | Skill 本地 Node |
| ④ 资源上传 + 画板创建 | 脚本调 `lark-cli` | Skill 本地 Node |
| ⑤ 创建文档 + 灌块 | 脚本调 `lark-cli` | Skill 本地 Node |
| ⑥ 输出文档 URL | 脚本 echo | agent 显示给用户 |

**没有前端入口**——飞书 token 不能放静态前端，模式 4 是 100% Skill-only。可选有一个极简的 `web/feishu/` 落地页，只用来展示"成功 / 失败 / 丢失清单"，不接收 HTML 输入。

## 9. 实现路径（对齐 ROADMAP 阶段 3-4）

```
v0.1（阶段 3）— 文本骨架
  支持：h1-h6 / p / ul / ol / hr / 内联粗体斜体链接
  跑通：create doc → batch_create 文本块 → 出 URL
  不支持：图、画板、嵌套、复杂样式
  Done 标准：sample 跑出来是一份能编辑的飞书文档，文字内容完整

v0.2（阶段 4-A）— 画板（Mermaid / PlantUML）
  识别代码块 → DSL → 调 board API → 嵌入
  Done 标准：含 mermaid 的 sample 出来后画板可拖

v0.3（阶段 4-B）— 嵌套块（column / callout）
  递归 emitter；按 agent 视觉理解决策容器边界
  Done 标准：sample 里的卡片视觉接近原 HTML，层级正确

v0.4（阶段 4-C）— 图片上传
  两遍法；<img> / base64 / inline SVG 三种来源
  Done 标准：图片正确显示，不再"裸 alt 文本"

v0.5（阶段 4-D）— 高保真样式 & 截图兜底
  内联 style → block style 字段映射
  v0.3 标记的"非语义视觉块" → 截图块 fallback
  Done 标准：视觉相似度 > 80%
```

## 10. 不在范围内（明确划界）

- **飞书 → HTML 反向**：用别人发的飞书文档转回 HTML Artifact 编辑（一期不做，飞书有自己的导出）
- **bot 身份作为默认**：UAT 是默认，bot 仅作为 `--as bot` 可选参数，不专门优化 bot 路径
- **团队版凭证集中托管**：用 CLI 默认的 keychain / 环境变量，不上 Credential 扩展点的 Go wrapper（参考 ROADMAP 关键决策）
- **多维表格 / 电子表格作为目标**：模式 4 只到 docx，bitable / sheet 是完全不同的数据模型，未来如有需要走独立模式（5、6）
- **OpenClaw 插件复用**：飞书官方插件底层会跟 CLI 对齐，但本项目走"独立 Skill 包"路径，不依赖 OpenClaw 插件状态
- **后端服务**：项目坚持零后端，飞书 token 通过 CLI keychain 管理，不引入任何中转服务
