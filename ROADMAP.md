# HTML-to-WeChat 推进 Roadmap

> 本文是项目从「3 模式规划 + 1 模式可用」推到「4 模式全可用 + Skill 包发布 + Landing 同步」的执行计划。按 PDCA 节奏推进，每阶段一个子循环。

## Goal

**最终交付状态**：

- 4 种模式全部端到端可用：HTML → 公众号富文本 / 小红书图集 / 口播稿 / **飞书云文档**
- Skill 包可被 Claude Code / Codex 等 agent 一键安装并自动调用
- GitHub Pages 前端三页（richtext / images / script）从「占位介绍页」推到「真正 app 态」
- Landing 主页同步反映 4 种形态，hero 重制
- 设计文档完整：`docs/01..04` + `ROADMAP.md` + `SKILL.md`

## 关键决策（在 Plan 阶段已对齐）

### 跨模式统一范式：**C 决策 + A 执行（X-C / X-A）**

所有 4 个模式都采用「决策层 + 执行层」分离的统一架构：

```
HTML
  ↓
X-C（决策层，LLM）
  看截图 + 源码 → 输出 transform-plan.json：
    - 输入类型分类、视觉单元识别
    - 每个单元的处理指令（保留 / 重编码 / 截图 / 删除）
    - 视觉编码 → 文字层翻译指令（"对比维度 1"、"📅 日期"等）
    - 阅读节奏 / 章节切分建议
  ↓
X-A（执行层，纯函数）
  pure function: (HTML, plan) → 模式特定产物
  - 输入空间从 "open-ended HTML" 收窄为 "固定 schema 的 plan"
  - long tail 转移到 X-C 那一层，让 LLM 处理（这是 LLM 强项）
  - 脚本逻辑稳定、可测试、不为输入多样性买单
  ↓
X-C-validate（验证层，LLM）
  对比前后截图 → 失败清单 / 接受
```

**为什么不是 X-A → X-C（先执行后修补）**：X-A 输出后视觉编码已丢失，X-C 看不到原始结构，无从补救结构性信息损失。

**为什么不是完全独立（用户自选 A 或 C）**：用户判断负担 + A 通道修复成本累积。

**保留"X-A 独立可用"承诺**：X-A 是纯函数 `transform(HTML, plan)`。两种 plan 来源——
- **default plan**（hardcoded 兜底）：服务"结构标准 HTML"，零依赖网页可直接跑
- **LLM-generated plan**（X-C 产出）：服务复杂报告

mode 01 的 `web/richtext/` 网页用 default plan，**不依赖 skill / LLM**，原承诺成立。复杂报告由 mode 01 skill 通道（1C → 1A）处理。

**对各模式的具体形态**：
- mode 01：1C 出 plan → 1A 跑 juice + DOM 清理 + 文字层重编码 → 公众号富文本
- mode 02：2C 出 plan（卡片切分 + 模板选择 + 生图 prompt） → 2A 渲染
- mode 03：3C 出 plan（切段 + 改写规则） → 3A 文本输出
- mode 04：4C 出 plan（Block 树结构 + 嵌套决策） → 4A lark-cli 灌块

### 其他决策

- **飞书身份**：mode 4 默认走 UAT（用户身份，OAuth 扫码），文档作者归属用户本人，匹配"我用 AI 操作我的飞书"语境。bot 身份（TAT）作为可选参数 `--as bot` 保留，留给"应用代表组织发文档"场景。
- **Skill 发布形态**：纯 GitHub 仓库分发，**不发 npm 包**。Claude Code skill 的标准就是文件夹结构，用户 install 是把文件夹拷到 `.claude/skills/` 或 plugin 管理器拉取。Skill 内部 `scripts/` 用 `package.json` 管 Node 依赖（juice、cheerio、puppeteer 等），首次执行自动 `npm install`。
- **Skill 包结构**：路径 B（4 个独立 skill），命名 `html-to-wechat` / `html-to-images` / `html-to-script` / `html-to-feishu`。每个 skill self-contained——shared 代码通过 build-script 注入（或直接复制，待定）。

## 阶段总览

| # | 阶段 | 批次 | 主交付 |
|---|---|---|---|
| 1 | 设计落定 | 1a | `docs/04-html-to-feishu.md` + `docs/02` 视觉理解补丁 |
| 2 | Skill 骨架 | 1b | `skill/SKILL.md` + mode 1/3 脚本 |
| 3 | Mode 4 v0.1 + Mode 3 app | 1c | 飞书侧文本骨架跑通 + script 页字数时长 |
| 4 | Mode 4 渐进 v0.2-v0.5 | 2-A | **画板 → 嵌套块 → 图片 → 高保真** |
| 5 | Mode 2 app 态 | 2-B | fragment 解析 / 单图重生 / zip 打包 |
| 6 | Landing 重制 | 3 | hero 重做 + 4 卡片 + 文案 |

按阶段独立 commit / PR，每阶段结束做一次 PDCA Check + Act。

---

## 阶段 1：设计落定（批次 1a）

**P (Plan)**

- 把模式 4 的所有取舍写成正式设计文档（套用模式 1/2/3 的章节模板）
- 把跨模式约束「HTML 转换必须视觉理解」追加到模式 2 文档
- 不写代码，只写文档；让架构在文字层面无歧义后再动手

**D (Do)**

- 新建 `docs/04-html-to-feishu.md`，章节：输入/输出、Block 映射表、嵌套递归、画板 DSL、图片上传两遍法、Skill 与前端边界、已知坑、实现路径 v0.1-v0.5、不在范围内
- 修改 `docs/02-html-to-images.md`，加「视觉理解」一节作为强约束
- 更新 `README.md`：把"三种模式"改成"四种模式"，新增模式 4 行

**C (Check)**

- 用户 review 全部三处改动
- 确认 mode 4 设计无歧义、可直接照着实现
- 确认 mode 2 视觉理解约束的表述与 memory 一致

**A (Act)**

- 根据 review 修文档
- 如出现新的跨模式约束 → 写入 memory
- 标记阶段 1 完成，进入阶段 2

**Done 标准**：所有文档 commit；用户口头/书面确认设计落定。

### ✅ 阶段 1 完成（commit fe0ffb5）

**Act 总结**：
- 用户在 C 阶段补了 5 条约束（视觉理解 / UAT 身份 / GitHub 直装不发 npm / 输入三来源 / 映射表 sample-driven）——这些都是从对话里浮现的，不是 P 阶段能"设计"出来的
- **Learning**：每个阶段的 P 阶段不要锁死细节，要预留"用户在 C 阶段补约束"的空间，PDCA 的 C/A 不是走过场
- **Learning**：映射表、能力清单这类"覆盖度无法预判"的内容，要在文档里显式声明"sample-driven 渐进补全"，避免后续 commit 看起来像"被推翻"
- **Learning**：sample 反向推动顺序——拿到车展报告 + 座舱对标两份样本后，发现 CSS 60%+、无 DSL 图表，阶段 4 子迭代顺序被反推调整（画板下放到 v0.4，嵌套块升 v0.2）。**P 阶段排定的子任务顺序在 D 之前应该再用真 sample 校验一次**
- 跨模式约束（如视觉理解）一旦确认，要同时写进 memory + 相关 docs，单点声明会被遗忘

---

## 阶段 2：Skill 骨架（批次 1b）

**P**

- 定义 SKILL.md 总入口结构（模式选择、调用约定、依赖说明）
- 定义 `skill/modes/0X-XXX/scripts/` 子目录约定
- 把模式 1（已可工作的 `web/richtext/app.js` 核心逻辑）和模式 3（最简单）先 Skill 化，作为 Skill 体系的端到端验证

**D**

- 建 `skill/SKILL.md`（参考 anthropic-skills 的格式）
- 建 `skill/modes/01-richtext/scripts/`：把 juice + DOM 清理逻辑从浏览器版抽出成 Node 脚本
- 建 `skill/modes/03-script/scripts/`：cheerio + turndown 抽文本脚本（最薄）
- 验证：agent 装 Skill 后，能执行「输入 HTML 文件 → 跑模式 1 → 输出 wechat.html」和「跑模式 3 → 输出 spoken.md」

**C**

- 用 `samples/context-tower-9layers/` 跑通 mode 1 和 mode 3 端到端
- 确认 Skill 包能被本地 agent 安装并调用（不要求 npm 发布，先本地 link）

**A**

- 把跑通时发现的"调用约定/参数命名"等细节固化进 SKILL.md
- 把过程中的新约束记入 memory

**Done 标准**：agent 能用 Skill 自动跑 mode 1 和 mode 3 端到端。

---

## 阶段 3：Mode 4 v0.1 + Mode 3 app（批次 1c）

**P**

- Mode 4 v0.1 边界：文本骨架（h1-h6 / p / ul / ol / hr）+ 创建文档 + batch_create 灌块；**不做** 图片、画板、嵌套样式
- Mode 3 app 边界：接收 fragment → 渲染预览 → 字数 + 时长（按 250 字/分钟）+ 下载按钮 + V2C 外链

**D**

- 实现 `skill/modes/04-feishu/scripts/html-to-feishu.mjs`（v0.1）：
  - puppeteer 渲染整页 PNG（给 agent 视觉理解用）
  - DOM 解析 → 文本块 IR
  - `lark-cli api POST /docx/v1/documents`
  - `lark-cli api POST /docx/v1/documents/{id}/blocks/batch_create`
  - 输出文档 URL
- 实现 `web/script/` app 化：fragment 解析 + marked 渲染 + 字数 / 时长 / 下载

**C**

- 用 `samples/context-tower-9layers/` 跑通 mode 4 v0.1（出来是一个能编辑的飞书云文档，纯文本，无图）
- 用 mode 3 跑通 sample，前端预览正常
- 飞书 OAuth 走通且 token 在 keychain 持久

**A**

- **样例驱动迭代**：跑完第一个 sample 后收集「丢失清单」（哪些 DOM 节点没映射到 block / agent 视觉理解后觉得映射不准的）→ 分两类：「下个 vX 必须支持的」与「截图兜底就行的」
- 更新 `docs/04 §4` 映射表条目（这是预期动作，不是异常）
- 多跑 2-3 个不同风格的 sample，确认 v0.1 文本骨架对各种 HTML Artifact 都稳定
- 更新 ROADMAP（如果发现 v0.2-v0.5 的边界要调整）

**Done 标准**：可以让 agent 把一份 HTML Artifact 转成飞书文档（纯文本骨架），并打开链接看到结果。映射表的 sample-driven 迭代节奏成立——每个 vX 的 A 阶段都会有新增条目，这是预期，不是问题。

---

## 阶段 4：Mode 4 渐进 v0.2-v0.5（批次 2-A）

每个子迭代一个完整 PDCA，但可在同一阶段串行。**顺序基于 sample 复杂度画像**——`samples/full-report-standalone.html` 与 `samples/bench-standalone.html` 两份样本（车展报告 + AI 座舱对标）显示：CSS 占文件 60%+，无 mermaid/PlantUML/SVG，视觉全靠 CSS 卡片嵌套绘制。因此嵌套块路径远比画板路径紧迫，顺序调整为：**嵌套 → 图片 → 画板 → 样式**。

### v0.2 — 嵌套块（column / callout）

- **P**：DOM 树递归 emit，column 嵌 column、column 嵌 callout、callout 嵌 list 等任意深度。这是当前两个 sample 的**主要视觉编码方式**，也是飞书相对其他平台的独家价值
- **D**：递归 emitter，参考用户提供的「column + callout 嵌套」示例；元素 → block-type 映射表落到代码
- **C**：sample 里复杂卡片视觉接近原 HTML 且层级正确
- **A**：记录"非语义视觉块"（纯装饰 div、复杂背景层）的降级清单 → 决定哪些下放到 v0.5 截图处理

### v0.3 — 图片上传

- **P**：扫描 `<img>` / inline base64 / inline SVG → 并发上传飞书素材 → 替换为 image block（两遍法）
- **D**：实现 `image-uploader.mjs`；inline SVG 矢量装饰图 rasterize 成 PNG
- **C**：sample 跑出来图片正确显示，base64 / 外链 / SVG 三种来源都能 cover
- **A**：记录 SVG 转 PNG 的清晰度参数

### v0.4 — 画板（Mermaid / PlantUML）

- **P**：识别 ` ```mermaid ` / ` ```plantuml ` 代码块 → 抽 DSL → 调画板 API → 嵌入 doc。**飞书会把 DSL 自动转成可编辑矢量画板**，团队成员能拖节点、改文字
- **D**：实现画板路径；agent 看 HTML 截图判断"哪些是图表"
- **C**：等遇到含 mermaid/PlantUML 的 sample 时跑通，画板可协同编辑
- **A**：记录复杂 Mermaid / 非 DSL 来源图的降级策略（v0.5 走截图 fallback）

> **注**：当前两个 sample 均不含 DSL 图表，v0.4 在拿到合适 sample 后才能真正 C。可以在 v0.2/v0.3 同时建议用户产出含 mermaid 的 Artifact 用作测试。

### v0.5 — 高保真样式 & 截图兜底

- **P**：内联 style 解析 → 映射到 block style 字段（背景色、文字颜色、加粗、对齐）；v0.2 列出的"非语义视觉块"走截图块 fallback
- **D**：style 映射表 + 块级截图工具
- **C**：sample 视觉相似度评估
- **A**：评估是否需要继续迭代

**Done 标准**：复杂 Artifact 转出来的飞书文档嵌套结构正确、视觉接近原图、可协同编辑；含 DSL 图表的 Artifact 画板可拖。

---

## 阶段 5：Mode 2 app 态（批次 2-B）

**P**

- 定 fragment 协议：plan.json + 图片 URL/base64 数组通过 fragment 传入
- 单图重生触发：用户点某张图 → 调 agent 重新生成
- zip 打包下载

**D**

- 改造 `web/images/index.html` + 新增 `app.js`
- 集成 JSZip
- 单图重生用 postMessage / fetch 协议跟 agent 通信

**C**

- 端到端跑通：agent 跑 plan → 出图 → 跳转前端 → 用户拖排序 / 重生 / 打包下载
- 视觉理解约束（memory）已在 SKILL.md mode 2 里强制写入

**A**

- 记录 Skill 端 ↔ 前端通信的 corner case

**Done 标准**：agent 跑完后用户能在前端完成"看图集→重生不满意的→打包"完整流程。

---

## 阶段 6：Landing 重制（批次 3）

**P**

- 确定新 hero 视觉方向（4 种形态怎么呈现）
- 重写 landing 文案（从"3 种形态"到"4 种形态"）
- 主页卡片重排：1+3 还是 2+2，取决于设计

**D**

- 新 hero 图：用 gpt-image-2 生成（按 memory：禁用 SVG/Canvas 代码渲染）
- 更新 `web/index.html` + `landing.css`
- 4 种模式卡片重排
- 更新 `web/assets/hero.png`

**C**

- 视觉走查（桌面/移动）
- 文案 review
- 4 个子页 hero 跟主页一致

**A**

- 部署 GitHub Pages，验证线上效果

**Done 标准**：主页打开能直观看到 4 种形态、新 hero 上线、4 个子页风格统一。

---

## PDCA 元节奏

- **每阶段结束**：在本文件对应阶段加 ✅ + 一段「Act 总结」（学到了什么、有什么后悔的、对下个阶段的调整建议）
- **跨阶段调整**：如果某阶段 Check 发现 Plan 不合理 → 不要硬冲，回到 P 改 ROADMAP 再进 D
- **新约束 → memory**：阶段过程中发现的"以后做同类事都要这样"的约束，写到 `.claude/projects/.../memory/feedback_*.md`

## 当前状态指针

**当前阶段**：阶段 1 — 设计落定（批次 1a）
**当前 PDCA 步骤**：P 完成，待用户 review 后进入 D

## 不在 Roadmap 范围内（明确划界）

- 飞书 API 自动发布到其他平台（不在场景）
- 团队版/SaaS 化（CLI 的自研扩展点不上）
- 双向：飞书文档 → HTML Artifact（一期不做）
- 后端服务（项目坚持零后端）
- 多语言（先做中文，英文是后期话题）
