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
| 3 | Mode 4 v0.1 + Mode 3 app | 1c | 飞书侧 DocxXML 直转跑通（HTML→DocxXML→`docs +create`）+ script 页字数时长 |
| 4 | Mode 4 渐进 v0.2-v0.5 | 2-A | **本地图片 → 画板兜底 → 局部精修 → 高保真样式**（DocxXML 主干不变，单点升级）|
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

- Mode 4 v0.1 边界：**DocxXML 直转**——视觉理解 → DOM 清理 + plan 应用 → HTML→DocxXML 纯函数 → 一次 `lark-cli docs +create --api-version v2 --content @output.docxxml` → 出 URL。**v0.1 已支持 grid/callout/whiteboard（飞书独家容器）+ 远程 URL 图片**（DocxXML 服务端直接吃）。**不做**：本地/base64 图片（v0.2）、画板兜底（v0.3）、局部精修（v0.4）、高保真样式（v0.5）。详见 `docs/04 §5`
- Mode 3 app 边界：接收 fragment → 渲染预览 → 字数 + 时长（按 250 字/分钟）+ 下载按钮 + V2C 外链

**D（按顺序，✅ 标记已完成）**

1. ✅ **环境解锁**：装 `@larksuite/cli`（npm prefix 到用户目录避 sudo）+ `npx skills add` 装 25 个飞书 agent skills + `lark-cli config init --new` 配独立 app + `lark-cli auth login --recommend` UAT 扫码登录 + `lark-cli api GET /open-apis/authen/v1/user_info` ping 通
2. ✅ **DocxXML 能力 audit**：基于 `lark-doc` skill 的 `lark-doc-xml.md` / `lark-doc-create.md` / `lark-doc-md.md` 等 reference，确认 DocxXML 覆盖 docs/04 §4 全部 14 个 block_type 零盲区，包括飞书独家 grid/callout/whiteboard
3. ✅ **DocxXML CLI 探针实测**：手工写 `samples/probe/01-minimal.docxxml`，跑 `docs +create` + `docs +fetch` 验证嵌套深度（5 层 OK）、远程 `<img href>` 服务端拉取（OK）、callout 内嵌 img（OK）、whiteboard mermaid DSL（OK）
4. ✅ **浏览器视觉质检**：用 Chrome MCP 连接用户浏览器，打开探针生成的飞书文档，全文滚动截图。结论：DocxXML 路径完全可走，发现 2 个新坑（emoji fallback / img 默认尺寸放大失真），1 个原坑撤销（background-color 实际渲染正常）
5. ✅ **修订 docs/04 + ROADMAP**：把 audit + 探针 + 视觉质检的结论一次性固化到 docs/04（rewrite）和 ROADMAP（本次提交）
6. **实现 `skill/modes/04-feishu/scripts/`**（v0.1，next）：
   - `render-snapshot.mjs` —— puppeteer 渲染整页 PNG（视觉理解前置）
   - `html-to-docxxml.mjs` —— 核心转换器（纯函数：HTML + plan → DocxXML string）
   - `create-doc.mjs` —— spawn `lark-cli docs +create`，解析响应取 URL
   - `index.mjs` —— 编排 1+2+3，CLI 入口
7. **实现 `web/script/` app 化**：fragment 解析 + marked 渲染 + 字数 / 时长 / 下载

**C**

- 用 `samples/context-tower-9layers/` 跑通 mode 4 v0.1：出来是一份能编辑的飞书云文档，文本结构 + grid/callout/whiteboard/远程图全部正确渲染。视觉相似度估计 60-70%（细装饰丢失，主体语义保留）
- 用 mode 3 跑通 sample，前端预览正常
- 飞书 OAuth 走通且 token 在 keychain 持久（已验证）

**A**

- **样例驱动迭代**：跑完第一个真实 sample 后收集「丢失清单」（哪些容器视觉理解没正确判定 / 哪些 `<img>` 尺寸算错 / 哪些自定义 div 装饰丢失）→ 分两类
- 同时收集「DocxXML 长度上限实测」结果（v0.1 真实 sample 第一次触发的边界）
- 更新 `docs/04 §4` 映射表条目和 §7 已知坑
- 多跑 2-3 个不同风格的 sample，确认 v0.1 DocxXML 路径对各种 HTML Artifact 都稳定
- 更新 ROADMAP（如果发现 v0.2-v0.5 的边界要调整）

**Done 标准**：可以让 agent 把一份 HTML Artifact 转成飞书文档（DocxXML 路径，含 grid/callout/whiteboard/远程图），并打开链接看到结果。映射表的 sample-driven 迭代节奏成立——每个 vX 的 A 阶段都会有新增条目，这是预期，不是问题。

### ✅ Mode 4 v0.1 完成（待 commit）

**实施数据**：
- D 步骤 1-7 全部完成（环境解锁 + audit + 探针 + 视觉质检 + docs/ROADMAP 重写 + skill 脚本实现 + bench sample 实测）
- skill 代码 6 文件 ~24KB：default-plan.mjs / html-to-docxxml.mjs / create-doc.mjs / render-snapshot.mjs / index.mjs / SKILL.md
- bench-standalone.html（378KB HTML） → DocxXML 32KB → 飞书文档 `FLLIdnbNXoAan5xH6g8cDvFdnlf`
- 0 warnings，3 次 lark-cli 调用（dry-run + 修 stdin 路径 + 真创建）

**Act 总结**：

- **路径 3 次修订带来的工作量缩水真实**：初稿（自建 emitter）→ convert 端点 → DocxXML 直转。最终代码量比初稿预估 < 30%。**Learning**：开工前的 audit / 探针 / 视觉质检三步，每一步都把工作量再压缩一档，比"按初稿一路写"省下数天工作
- **`@larksuite/cli` + `lark-doc` skill 的存在 = 上游护城河**：飞书官方在 SDK 层把"HTML→Block"封装好（DocxXML 格式 + `+create` 命令 + media-insert/whiteboard-update 高阶接口），我们项目只需做 HTML→DocxXML 字符串变换。**Learning**：在选择路径前先 `npx skills add` 装上垂直领域的 agent skills 包，能省去重复造轮子
- **视觉理解 plan 的角色变化**：原以为 v0.1 必须带视觉理解（render-snapshot.mjs 是 D 第 6 步必做项）。实测发现 default plan + 标签级映射已经能跑出"60-65% 视觉相似度"的可读文档——视觉理解从"v0.1 强制"变成"v0.2+ 升级"。render-snapshot.mjs 仍然实现了但 v0.1 不消费输出
- **bench-standalone 实测后的丢失清单**（v0.2 待优化）：
  - HTML 里 `<div><span>01</span><span>title</span></div>` 这种 "metric strip"（标签型数字 + 文字 stack）被穿透后变成游离 span，跟后续 `<ol>` 编号连成 `1. 01 / Planner / 2. 02 / 生态闭环 Agent`——视觉上重复混乱
  - 复杂 CSS 卡片（`<div class="rule-card">...</div>`）被穿透为扁平段落，视觉装饰丢失 ~30-40%
  - HTML `<title>` + `<h1>` 双标题被 DocxXML 写成 title + h1，飞书 outline 把 h1 视为"二级"——影响左侧 outline 的层级
- **Learning**：bench 实测确认 DocxXML 路径"内容完整、装饰丢失"的预期。**视觉理解 plan 的价值在 v0.2 才显现**——把那些 metric strip / 卡片包装 div 识别为 grid / callout / whiteboard
- **0 warnings 比预期好**：cheerio + 简单的"穿透容器 / 同名标签映射 / 黑名单过滤"已经对 bench HTML 全 cover；没有触发"unknown tag"路径
- **`docs +create --content` 接受 stdin (`-`)**：原先用 `@/tmp/xxx.docxxml` 被 CLI 拒绝（要求当前目录相对路径，安全约束）。**Learning**：spawn 调 lark-cli 时，DocxXML 字符串走 stdin 是最干净的——既避开了文件路径约束，又避开了命令行长度限制

**遗留问题**（推到 v0.2 PDCA）：
- `samples/bench-standalone.html` 重新跑一次 + 视觉理解 plan（4C agent 看截图后产 plan.json），对比 v0.1 default plan 结果，量化视觉理解的提升幅度
- `samples/full-report-standalone.html`（2.3MB）跑一次实测 `--content` 长度上限（v0.1 没测的开放问题 2）
- Mode 3 app 化（ROADMAP 阶段 3 P 列的并行任务）拆出来单独一个 PDCA 子周期

---

## 阶段 4：Mode 4 渐进 v0.2-v0.5（批次 2-A）

每个子迭代一个完整 PDCA，但可在同一阶段串行。**顺序基于 DocxXML 主干 + 单点升级**——v0.1 已经把"文本/列表/表格/grid/callout/whiteboard 内联 DSL/远程 URL 图片"全部跑通，后续是补齐 v0.1 没覆盖的能力：本地图、画板兜底、局部精修、样式细节。顺序：**本地图片 → 画板兜底 → 局部精修 → 高保真样式**。

> **决策演进史**：本阶段子迭代顺序经过 3 次修订——
> - 初稿（基于自建 emitter 全建路径）：v0.2 嵌套块、v0.3 图片、v0.4 画板、v0.5 样式
> - convert 端点中段修订：v0.2 图片、v0.3 画板、v0.4 嵌套容器、v0.5 样式
> - **当前（DocxXML 路径）**：v0.2 本地图片、v0.3 画板兜底、v0.4 局部精修、v0.5 样式 + emoji 白名单
>
> 嵌套容器从子迭代中**整体消失**——DocxXML 服务端原生支持 grid/callout/whiteboard，能力已在 v0.1 覆盖。这是路径变化带来的工作量塌缩。

### v0.2 — 视觉理解 plan 集成（首批 demo） / 本地图片接入推到 v0.2b

- **P**：v0.1 的 plan schema 已经留了 `boundaryAnnotations / columnRatios / whiteboardDsls` 字段但 emit 没消费——v0.2a 让 plan 真正驱动容器映射。本地图片接入大、单独 PDCA（v0.2b）
- **D（v0.2a）**：
  - transform 阶段 2.5：plan.boundaryAnnotations 用 cheerio selector 命中节点，加 `data-mode4-as` / `data-mode4-emoji` 等属性
  - emit 检测 `data-mode4-as`：值为 callout / grid / column / whiteboard-mermaid / whiteboard-plantuml / drop 时改写为对应 DocxXML 标签
  - 写 demo plan：`samples/bench-plan-v0.2-demo.json` 把 5 类容器（lede-quote / final-quote / margin-note / obs-note / brand-caveat）升级为 callout
- **C**：用 demo plan 重跑 bench → 飞书文档 `Zn9adlrNOo8cwZxODtOc2O0mn4b`，**第一屏底部 `.lede-quote` 渲染为浅黄背景 + 💡 callout**（视觉验证通过）；`annotationsApplied: 6`，9 个 HTML 类匹配里 6 个命中（差的 3 个在 `<aside>` 黑名单子节点里）
- **A（v0.2a Learning）**：
  - **plan-driven 容器映射机制成立**：CSS selector → cheerio 命中 → data-mode4-as 属性 → emit 改写。零侵入原 HTML，agent 只产 plan.json
  - **黑名单 vs 视觉容器的边界冲突**：`<aside class="margin-note">` 被 `aside` 黑名单剥掉，无法升级为 callout。v0.3 要把"plan 命中"提到"黑名单"之前——agent 标注了的节点不剥
  - **emoji fallback 影响 demo 完整性**：plan 里写 `emoji="⚠️"` 服务端仍 fallback 为 💡（坑 A），demo 看不到颜色之外的 emoji 区分。v0.5 emoji 白名单专项探针
  - **视觉理解 plan 的 agent 工作流仍未落地**：v0.2a demo plan 是我（agent）手写的，没经过 puppeteer 截图 + 4C 视觉理解链路。真正的 v0.2 完整闭环还要 v0.2b
- **v0.2b ✅**：装 puppeteer（`optionalDependencies` 实际安装）+ render-snapshot 输出 `/tmp/bench-{top,mid,bot}.png` + agent 看图（top/mid/bot 三视角）补 plan：加 `.rail` (drop) + `.card-lvl` (callout)，annotations 命中 9 → **26**；同时修了 emit 黑名单 patch bug（banned tag 子树含 mode4-as 时穿透 children），实际 callout 输出 6 → **22**
- **v0.2b finding（v0.3+ 解）**：`.card-lvl` 16 个 callout 在 docxxml 里**已正确写入**（grep 验证），但飞书前端在 callout 内嵌 `<ol seq="auto">` 上下文时把 callout 视觉合并为列表项——是飞书渲染规则，非转换器 bug。v0.3 应单独探针 callout 在 list 上下文的视觉行为
- **v0.2c 待做**：本地/base64 图片走 `docs +media-insert` 接入

### v0.3 — 画板验证与兜底

- **P**：v0.1 已经让 DocxXML `<whiteboard type="mermaid">DSL</whiteboard>` 内联创建画板。但复杂 DSL 可能服务端创建"成功但内容空"或解析失败——需要 create 后验证 + 修复
- **D**：`docs +create` 后用 `+fetch` 检查响应里 whiteboard 块的实际节点数；< 1 时调 `lark-cli whiteboard +update --whiteboard <token> --dsl <fixed-dsl>` 修复；多次失败 → puppeteer rasterize 原 DSL 为 PNG → `+media-insert` 替换
- **C**：含复杂 Mermaid（10+ 节点 / subgraph / 自定义样式）的 sample 跑通，画板可协同编辑
- **A**：记录飞书画板对 Mermaid/PlantUML 语法子集的支持边界

> **注**：当前两个 sample 均不含 DSL 图表，v0.3 在拿到合适 sample 后才能真正 C。

### v0.4 — 局部精修（docs +update 工程化）

- **P**：v0.1 是「一次 create 灌满」模式。但实际场景里经常需要「先 create 出骨架，再针对性精修一个 callout / 替换一段代码 / 在特定位置插入引用」——这需要 `docs +update` 的 8 种局部指令（str_replace / block_insert_after / block_copy_insert_after / block_replace / block_delete / block_move_after / overwrite / append）
- **D**：封装最常用的 3 种指令（block_replace / block_insert_after / str_replace）成 helper 函数；HTML 转换器接受 "差异更新" 输入而不是 "全量重建"
- **C**：能演示完整工作流：用户基于 sample 创建文档 → 让 agent 把某个 callout 改为不同 emoji + 文字 → agent 用 block_replace 精修，文档其他部分不动
- **A**：评估 8 种指令哪些在实际 HTML→DocxXML 场景里有用、哪些可以省略

> **注意**：原计划 v0.4「自建递归 emitter 处理嵌套容器」**已删除**——DocxXML 服务端原生支持 grid/callout/whiteboard，那部分工作量塌缩到 v0.1。v0.4 现在是「精修工程化」，跟原计划完全不同。

### v0.5 — 高保真样式 + emoji 白名单 + 截图兜底

- **P**：四件事：
  - 内联 CSS style 解析 → 映射到 DocxXML 的 `<span text-color>` / `<span background-color>` / 单元格 / callout 样式属性
  - emoji 白名单专项探针——实测哪些 emoji 不被 fallback（坑 A 的根治）
  - 装饰性视觉块（嵌套 div 套娃 / 复杂背景层）→ puppeteer 区块截图 → `+media-insert` 兜底
  - DocxXML 整体过大 / 服务端解析失败 → fallback 全自建 IR + `batch_create`（保留作为最后退路）
- **D**：style 映射表 + 块级截图工具 + emoji 探针 + 全自建 IR fallback 实现
- **C**：sample 视觉相似度 > 80%
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

**当前阶段**：阶段 4 v0.2b ✅ / v0.2c-v0.5 待续 / 阶段 5 Mode 2 app 未启动
**已完成节点**（本轮 session）：
  - ✅ Mode 4 v0.1（commit 6700431）— DocxXML 直转主路径，bench sample 跑通
  - ✅ Mode 3 app（commit 5facda4）— fragment + marked + 字数时长 + 复制/下载
  - ✅ Mode 4 v0.2a（commit 481edc6）— plan-driven 容器映射机制 + bench demo callout 视觉验证
  - ✅ Mode 4 v0.2a patch（commit 1da34ac）— 黑名单不剥 plan 标注节点，annotations 6 → 9
  - ✅ 阶段 6 landing 重制（commit fcc6f75）— 主页改 4-mode 2x2 网格，加飞书卡片
  - ✅ Mode 4 v0.2b（待 commit）— puppeteer 视觉理解链路打通 + plan 扩充（rail drop + card-lvl callout，命中 9 → 26）+ emit 黑名单子树穿透 patch（callout 输出 6 → 22）
**仍待**（按 ROADMAP 顺序）：
  - v0.2c — 本地/base64 图片走 `+media-insert`
  - v0.3 — 画板验证兜底 + **callout 在 ol/list 上下文的视觉规则探针**（v0.2b finding）
  - v0.4 — 局部精修工程化（`docs +update` 8 种指令的 helper）
  - v0.5 — 高保真样式 + emoji 白名单专项 + 截图兜底
  - 阶段 5 — Mode 2 app 态（fragment 解析 / 单图重生 / zip 打包）
**阶段 2「Skill 骨架」状态**：未开始（每个 mode 自带 SKILL.md，但跨模式总入口 `skill/SKILL.md` 还没建）

## 不在 Roadmap 范围内（明确划界）

- 飞书 API 自动发布到其他平台（不在场景）
- 团队版/SaaS 化（CLI 的自研扩展点不上）
- Docs Add-on 路径（HTML 作为可嵌入文档的 webapp 块）——已单独开发，不进 mode 04，详见 `docs/04 §10`
- 双向：飞书文档 → HTML Artifact（一期不做）
- 后端服务（项目坚持零后端）
- 多语言（先做中文，英文是后期话题）
