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
| 2a | Mode 01 1C/1A skill 化 | 1b-1 | `skill/modes/01-richtext/` + LLM 看图产 plan + juice/DOM 清理纯函数从浏览器版抽出 |
| 2b | Mode 03 skill 化 + 跨模式总入口 | 1b-2 | `skill/modes/03-script/` + `skill/SKILL.md` |
| 3 | Mode 4 v0.1 + Mode 3 app | 1c | 飞书侧 DocxXML 直转跑通（HTML→DocxXML→`docs +create`）+ script 页字数时长 |
| 4 | Mode 4 渐进 v0.2-v0.5 | 2-A | **本地图片 → 画板兜底 → 局部精修 → 高保真样式**（DocxXML 主干不变，单点升级）|
| 5 | Mode 2 app 态 | 2-B | fragment 解析 / 单图重生 / zip 打包 |
| 6 | Landing 重制 | 3 | hero 重做 + 4 卡片 + 文案 |

按阶段独立 commit / PR，每阶段结束做一次 PDCA Check + Act。

**执行顺序调整记录**（与文档编号顺序不一致）：
- 原计划：阶段 1 → 2 → 3 → 4 → 5 → 6（按批次 1a/1b/1c/2-A/2-B/3 走）
- 实际：1 → 3（mode 4 v0.1 + mode 3 app）→ 4 v0.2a/b → **2a（mode 01 1C/1A，插队）** → 4 v0.2c → 4 v0.3-v0.5 → 5 → 2b（mode 03 + 总入口）→ 6
- **为什么 2a 提前**：mode 01 是当前唯一已稳定能跑的模式（web/richtext app 上线 + transform.mjs X-A 纯函数已成型），先升级到 1C 能立刻验证「X-C / X-A 跨模式范式」对**非 mode 4** 的模式也成立——mode 4 是范式从零搭起来的 V 字底验证，mode 1 是 V 字顶（已有功能升级）验证，跨度互补
- **为什么 2b 不一起前置**：mode 03 当前只有 web app 没有 skill，skill 化要从零起，工作量等同 mode 4 v0.1，不属于"小步快进"范畴。留到 mode 4 全部稳定后再做

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

## 阶段 2a：Mode 01 1C/1A skill 化（批次 1b-1，**优先级前置**）

> **执行位置**：插在阶段 4 v0.2b 完成之后、v0.2c 开始之前。理由见 §「执行顺序调整记录」。

**P**

- Mode 01 已有 `web/richtext/transform.mjs`（X-A 纯函数，430+ 行）+ `default-plan.mjs`（plan schema 含 `directives: []` 节点级槽位）。架构层面 X-A 已就绪，**1C 改造 = 把这两文件搬进 skill 包 + 加 LLM 看图产 plan.json 的链路 + CLI 编排**，比 mode 4 v0.1 简单
- 边界：skill 入口接收 HTML 文件 → puppeteer 截图 → LLM（agent 自身）看截图 + 源码产 plan.json（含 directives 节点级指令）→ transform(html, plan) → 输出 wechat-ready.html
- **承诺**：`web/richtext/` 网页继续用 DEFAULT_PLAN 零依赖工作，不破坏 1A 独立可用承诺

**D**

1. 建 `skill/modes/01-richtext/scripts/`：
   - `transform.mjs` —— 从 `web/richtext/transform.mjs` 抽出（juice 改 npm 包 import，去 esm.sh CDN；DOMParser 用 jsdom polyfill）
   - `default-plan.mjs` —— 直接复制（兼容浏览器版，避免 schema 双源不同步）
   - `render-snapshot.mjs` —— 复用 mode 4 的 puppeteer 截图脚本（顶/中/底三视角）
   - `analyze.mjs` —— 占位文件，约定调用方式：agent 自己看截图 + 源码后**手写** plan.json（与 mode 4 v0.2b 同模式，不是 skill 内部跑 LLM）
   - `index.mjs` —— CLI 入口：`--input <html>` `--plan <json>` `--dry-run` `--output <html>`
   - `package.json` —— `dependencies: juice / jsdom / cheerio` + `optionalDependencies: puppeteer`
2. 建 `skill/modes/01-richtext/SKILL.md`：front-matter 含 name/version/description/requires，调用 contract 写明"1C agent 看图后产 plan，1A 跑转换"
3. 测：用 `samples/bench-standalone.html` 跑：
   - `--dry-run` 模式跑 default plan，对照 web 浏览器版的转换结果，应**完全一致**（同一份 transform.mjs）
   - 1C 完整流程：截图 → agent 手写 plan（含 directives，如 `{ selector: '.metric-strip', action: 'drop' }`）→ transform → 对比看 metric strip 是否消失

**C**

- 用 bench sample 跑 1C 完整链路，验证 directives 能正确驱动 transform 的节点级处理
- 验证浏览器版 `web/richtext/` 在 transform.mjs/default-plan.mjs 抽走后依然工作（symlink / 二份同步策略）
- 跑 mode 4 同一 sample 的转换器对比：mode 01 输出 HTML（公众号目标）vs mode 04 输出 DocxXML（飞书目标），plan 是否能共用大部分语义（boundaryAnnotations 概念是否可复用到 mode 01）

**A**

- 跨模式 plan schema 是否能统一（mode 1 现用 `directives` + mode 4 用 `boundaryAnnotations`）记入 docs/01
- 跑通后即可让 mode 01 进入"agent 视觉理解 → 公众号高保真"的完整闭环
- 把"shared 代码（transform.mjs / default-plan.mjs / render-snapshot.mjs）跨 skill 包的复用方式（symlink / build 拷贝 / npm workspace）"决策落地——这影响后续所有 mode 的 skill 骨架

**Done 标准**：agent 装 `skill/modes/01-richtext/` 后，能用 `lark-cli`-like 流程把 HTML → 公众号 HTML（含 LLM 视觉理解），且浏览器版 `web/richtext/` 仍然零依赖独立可用。

### ✅ 阶段 2a 完成（待 commit）

**实施数据**：
- skill 代码 5 文件 + SKILL.md：transform.mjs (44KB，从 web/richtext 移植) / default-plan.mjs (5.9KB，diff=0 byte-perfect copy) / render-snapshot.mjs (2.4KB，从 mode 4 复制) / index.mjs (4.7KB CLI 编排) / package.json / SKILL.md (3.7KB)
- 依赖：juice 10 + jsdom 25（npm install 装 186 pkg / 10s）
- transform.mjs 主体（自 `/**` 起）与 web/richtext/transform.mjs **0 diff**（byte-identical body），仅顶部 imports 改 npm + 注入 jsdom DOMParser
- bench sample 跑通：default plan 模式 = `chars: 6731 / counters: extractedFrom='article'`；1C plan 模式（5 directives）= `chars: 531568 / directivesApplied: 9 / directivesMissed: 0`
- 1C 完整链路验证：render-snapshot 出 28790px 截图 → puppeteer 切 3 视角 PNG → agent 看图后产 `samples/bench-plan-v0.1-mode1-demo.json`（rail remove / final-quote lighten-bg / brand-caveat 加 ⚠️ 前缀 / obs-note 加 📌 编号 / margin-note 加 📝）→ transform 应用 → grep 验证 5 类 directives 全部落点正确

**Act 总结**：

- **范式普适性验证成立**：mode 1（已有功能升级）+ mode 4（V 字底从零搭建）两端都成功跑通 X-A 纯函数 + X-C agent 看图产 plan 的同一模式。**Learning**：X-C/X-A 范式的工程成本远低于"为每个 mode 单独设计 IR"——transform.mjs 的 `directives: []` 接口槽位 + selector + action 的简单 schema 足以覆盖"任意节点级处理需求"
- **Node ↔ 浏览器代码同源策略可行**：transform.mjs 主体逻辑 byte-identical 跨两边，仅顶部 imports 各自适配（esm.sh CDN vs npm + jsdom DOMParser）。代价：维护两份文件 → 后续 ROADMAP Act item「抽到 `lib/richtext/` 共享」可以放在 mode 03 skill 化时一并做（阶段 2b）
- **bench 是"压力测试样本"不是"典型样本"**：bench 含 37 个 `<article>`，extractMain 启发式只能抓单卡。Mode 1 的真实使用场景（如 mode 1 自带的 `samples/context-tower-9layers`）通常是单 `<article>` 包，default plan 直接就好用。1C plan 价值场景：复杂多 article 报告 + 装饰性 rail/nav 需清理
- **mode 4 v0.2b 的 render-snapshot.mjs 可零修改复用**：mode 1 也用 puppeteer + 同样的 viewport 设置（1280×800 / dsf=2）。`render-snapshot.mjs` 是事实标准的跨 mode 模块——**Learning**：未来 mode 2/3 截图也复用，第三次出现时正式抽到 `lib/`
- **遗留**：transform.mjs/default-plan.mjs 跨 web/skill 两处同步的工程化（symlink / git hook / 抽 lib），先用文档约定，等下次维护触发再做

---

## 阶段 2b：Mode 03 skill 化 + 跨模式总入口（批次 1b-2）

**P**

- 定义 `skill/SKILL.md` 总入口结构（4 个 mode 的选择逻辑、共享调用约定、依赖说明）
- 模式 3 当前只有 web app 没有 skill，从零起骨架

**D**

- 建 `skill/SKILL.md`（参考 anthropic-skills 的格式）
- 建 `skill/modes/03-script/scripts/`：cheerio + turndown 抽文本脚本（最薄）+ 字数/时长统计（与 `web/script/app.mjs` 对齐）
- 验证：agent 装 Skill 后，能执行「输入 HTML 文件 → 跑模式 3 → 输出 spoken.md」

**C**

- 用 `samples/full-report-standalone.html`（2.2MB 多 article 报告）跑通 mode 3 端到端
- 确认跨模式总入口 SKILL.md 能让 agent 在 4 个 mode 间正确路由

**A**

- 把跑通时发现的"调用约定/参数命名"等细节固化进 SKILL.md
- 把过程中的新约束记入 memory

**Done 标准**：agent 能用 Skill 自动跑 mode 1、3、4 端到端（mode 2 在阶段 5）。

### ✅ 阶段 2b 完成（待 commit）

**实施数据**：
- skill 代码骨架（commit `af49ace` 时已落地）：`skill/SKILL.md`（73 行跨模式总入口）+ `skill/modes/03-script/`（SKILL.md / scripts/index.mjs / scripts/html-to-script.mjs / scripts/analyze.mjs / package.json，共 444 行）
- 依赖：cheerio + turndown（26 包，已装）
- 端到端验证：
  - `bench-standalone.html` (default plan) → 1 article 取出 / 430 chars
  - `full-report-standalone.html` (plan `{extractMain:false}`) → **12424 chars / 51.7 分钟时长 / 14 sections / 340 句 / avg 37 字**，3 类警告全部触发（avg sentence too long / 70 句超 50 字 / 无 ## 段落切分时给 warning）
  - 4 种入参模式（--input file / --stdin / --plan / --dry-run）全跑通
- `analyze.mjs` 与 `web/script/app.mjs` 同算法（注释明确"同步约定"），mdToPlain/countChars/splitSentences/splitSections 接口签名一致

**Act 总结**：
- **bench 与真实样本的差异**：单 article 样本（bench）走 default plan 即可，多 article 报告样本（full-report）必须 `extractMain:false` 兜底——把这条**写进 mode 3 skill SKILL.md 的"已知坑"段**，让 agent 在遇到 14 articles 的报告时知道用什么 plan
- **plan schema 简洁性的红利**：mode 3 plan 只有 4 个字段（extractMain / bannedTags / keepImages / turndownOptions），覆盖了所有真实场景，没必要做更细的 directive 系统。X-A/X-C 不强求每个 mode plan 体系相同——mode 1 用 `directives[]` / mode 4 用 `boundaryAnnotations{}` / mode 3 用平铺布尔 + 选项，**用什么形状取决于该 mode 的真实变化点**
- **跨模式 skill/SKILL.md 总入口**：用一张表 + 决策树 + X-C/X-A 范式说明，agent 选 mode 的成本极低；以后加 mode 只需再加一行表 + 一个分支

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
- **v0.2c ✅**：本地/base64 图片走 `+media-insert` 后置上传管线跑通——3 文件改动（emitImg 产 placeholder + mediaTasks 边信道 / 新增 upload-media.mjs 两步管线 / index.mjs 加 media phase），sample `v0.2c-images-test.html`（1 本地 PNG + 1 base64 + 1 远程对照）跑通 → `LvijdX2jyolIZOxTYnzcZHVHnig`，**uploaded=2 / failed=0**，浏览器质检：两张图位置正确、caption 渲染、placeholder paragraph 已删；远程 placehold.co 拉取失败是外部 dep（不是 v0.2c bug）

**v0.2c Act Learning**：
- **lark-cli `--file` 跟 `--content` 同款安全约束**："must be relative path within current directory"。绕开方式：spawn 时 `{ cwd: dirname(file) }` + `--file <basename>`。**沉淀为 helper**：未来任何 lark-cli `--file/--content` 类参数都按此模式
- **三步管线（insert + delete_range）成立**：用 `--selection-with-ellipsis <marker>` 命中 placeholder 块，`--before` 插图到 placeholder 之前，再 `--mode delete_range --selection-with-ellipsis <fullPlaceholderText>` 删 placeholder paragraph。两个 API call 一图，但 100% 可靠
- **Failure-tolerant 设计有用**：upload-media.mjs 每个 task 独立 try/catch，单图失败不打断其他图；失败的 task 留 placeholder 在文档可见——用户能直接定位"哪张图没上传"，比静默丢图友好
- **远程 URL 图可用性是独立维度**：placehold.co 上传失败提醒我们「v0.5 截图兜底」要兼顾"远程 URL 拉取失败"也走兜底（不只是装饰性 div）

### v0.3 — callout-in-list 视觉规则探针 + Mermaid 画板验证（✅ 完成）

- **P**：v0.2b 留了两条线索——「`.card-lvl` callout 在 ol 上下文里视觉合并为列表项」（推测）+「Mermaid 画板兜底未实测」
- **D**：
  - **3 个 DocxXML 变体探针**（A/B/C）测 ol 与 callout 的嵌套关系
  - 重跑 bench 看实际渲染，**修正 v0.2b finding 描述**
  - **3 个 Mermaid 变体探针**（简单流程图 / sequence / subgraph + 自定义样式）测 v0.1 内联 DSL 路径
- **C**：6 个探针文档全部创建并通过 Chrome MCP 视觉质检
- **A（findings）**：
  - **`<ol>` 直接包 `<callout>` → 服务端整体吞掉**（探针 A 实证）：当时 v0.2b finding 描述错了，不是"合并为列表项"——是整体丢失
  - **v0.2b 真实问题是 callout 内多 inline 兄弟节点粘连**（重跑 bench 实证）：`<span>Current</span><span>C2-C3</span>...` 渲染为 `CurrentC2-C3PotentialC4...` 飞书 callout 把 inline 间空白吃光。**修复**：plan schema 加 `joinWith` 字段，transform.mjs 加 `emitChildrenJoined()` 用可见分隔符串联子节点
  - **v0.1 Mermaid 内联 DSL 已经足够稳**（v0.3b 探针实证）：3 变体一次成功，原计划的 +fetch 验证 + rasterize 兜底**暂不需要**——等真出现失败 sample 再上
- 全部探针 DocxXML 落到 `samples/probe/03-callout-in-list-{A,B,C}.docxxml` + `04-mermaid-whiteboard.docxxml`
- `docs/04 §7` 新增条目 13/14/15 固化三项发现
- bench `.card-lvl` callout 16 个用 ` · ` 分隔后视觉清晰（`📌 Current · C3–C4 · Potential · C5 · Evidence · B`）

### v0.4 — 局部精修（docs +update 工程化）（✅ 完成）

- **P**：v0.1 是「一次 create 灌满」。实际场景里 agent 常需要「先 create 骨架 → 针对性精修一段 callout / 在某节后插引用 / 删除过时段落 / 在文档末尾 append 续写」。`lark-cli docs +update` 提供 7 种 mode（append/overwrite/replace_range/replace_all/insert_before/insert_after/delete_range）+ 2 种 selector（--selection-by-title '## H' / --selection-with-ellipsis 'start...end'）+ markdown 内容。封装成意图清晰的 helper API
- **D**：
  - `skill/modes/04-feishu/scripts/update-doc.mjs` — 9 个 helper（appendToDoc / overwriteDoc / replaceSection / replaceByText / insertAfterSection / insertBeforeSection / insertAfterText / deleteByText / deleteSection），统一底层 `runUpdate()` spawn lark-cli，markdown 走 stdin
  - `skill/modes/04-feishu/scripts/demo-update.mjs` — 串跑 8 helper 在 fresh 基底文档上演示
- **C**：fresh base doc `PuFLdgE9yogJESx2vvvcoNzgnJC` 跑 demo-update，**8/8 helper ✓**，Chrome MCP 视觉质检：
  - replaceSection 把 demo-append 整段换成 demo-replaceSection ✓
  - insertAfterSection / insertBeforeSection 在指定 H2 前后插入新节 ✓
  - insertAfterText 在文本片段后插入引用块（含 markdown blockquote）✓
  - replaceByText 把 paragraph 文本整段替换 ✓
  - deleteByText / deleteSection 把段/节完整删除 ✓
  - 左侧 outline 自动同步
- **A（Act Learning）**：
  - **`+update --markdown` 走 stdin 优雅绕开 lark-cli "must be relative path" 安全约束**（同 v0.1 +create / v0.2c +media-insert）。**沉淀**：所有 lark-cli 文件/内容类参数统一走 stdin/cwd-relocate 模式
  - **selection-by-title 是 mode 4 最实用的 selector**：H2/H3 比段落文本稳定，agent 通常以章节为单位精修；selection-with-ellipsis 适合「文本里某个 callout 改造」场景
  - **8 种 mode 实际 mode 4 工作流只用 6 种**：overwrite（整文重写）+ replace_all（全文替换）适配场景少，可以保留 helper 但不需要在 demo 跑。append/replace_range/insert_*/delete_range 是核心 6
  - **markdown 协议 vs DocxXML 不混用**：`+create` 走 DocxXML，`+update --markdown` 走 Lark-flavored Markdown——同一份文档创建用一种格式、精修用另一种，**Lark-flavored Markdown 是飞书生态的"通用编辑语言"**

### v0.5 — 高保真样式 + emoji 白名单 + 截图兜底（分 a/b/c/d 子迭代）

- **P**：四件事：
  - **v0.5a** emoji 白名单专项探针（坑 A 的根治）
  - **v0.5b** 内联 CSS style 解析 → 映射到 DocxXML 的 `<span text-color>` / `<span background-color>` / 单元格 / callout 样式属性
  - **v0.5c** 装饰性视觉块（嵌套 div 套娃 / 复杂背景层）→ puppeteer 区块截图 → `+media-insert` 兜底
  - **v0.5d** DocxXML 整体过大 / 服务端解析失败 → fallback 全自建 IR + `batch_create`（最后退路）

#### v0.5a ✅（已完成）

- 探针 `samples/probe/05a-emoji-whitelist.docxxml` 测 33 个 callout emoji，doc `W6Y6dEImAo5cUFxbFlRcb0hBnvf` 浏览器质检
- **30 个保留**：💡 📌 ✅ ❌ / 📝 📋 📄 📑 / ❗ 🔔 🚨 🛑 / 🔍 🔧 / 📊 📈 📉 📅 🕐 / ⭐ 🎯 🔥 🚀 🎉 🆕 / 🌟 🤔 💬 💼 📷
- **4 个 fallback**：⚠️ ℹ️ ⚙️ 🛠（普遍带 U+FE0F 变体选择符）
- transform.mjs emit 自动替换：⚠️→❗ / ℹ️→💡 / ⚙️→🔧 / 🛠→🔧，并 push warning
- default-plan.mjs 加 `emojiFallbackSubstitutes` + `safeCalloutEmojis` 两个字段，用户可在 plan 里覆盖
- docs/04 §3.2 美化系统 + §7 坑 A 同步更新

#### v0.5b ✅（已完成）

- `<span style="color: ...">` / `<span style="background-color: ...">` → DocxXML `<span text-color="...">` / `<span background-color="...">`
- 新增 `pickStyleColor()` 归一化：
  - 命名色（red/blue/green/...）→ 命名色直传
  - `#hex`（3/6 位）→ `rgb(r, g, b)`
  - `rgb()/rgba()` → 去 alpha 重格式化
  - var()/hsl()/oklch()/transparent/inherit → 跳过（null）
- stats 加 `spansColored / spansBgColored` 计数
- 探针 `samples/probe/05b-span-color.html` 跑通 6 个 case，doc `TUjZdF39LoaYjgxk2sQcBCYLnX4` 浏览器质检：
  - 命名色 / #hex / rgb 全部上色 ✓
  - background-color 黄底 / 桃色 ✓
  - color+background 组合 ✓（navy 走 null 兜底，行为符合预期）
  - var()/hsl()/transparent/inherit 全部跳过保持黑色 ✓

#### v0.5c ✅（已完成）

- 新增 `snapshotRegion(htmlPath, selector, output, opts)` 到 `render-snapshot.mjs`（puppeteer 区块 boundingBox 截图）
- 新增 plan directive `snapshot-fallback`：`{".decoration-strip":{"type":"snapshot-fallback","alt":"..."}}`
- transform 在 `emitAnnotated` 加 case：emit `<p>「IMG_PLACEHOLDER_NNN」 [图片：alt]</p>` 占位 + push `mediaTasks` 类型 `snapshot` + `selector` 边信道
- `index.mjs` 在 `+create` 后、`uploadMedia` 前实化 snapshot tasks：puppeteer 截 selector 区块 → 写 `/tmp/mode4-snapshot-${id}-*.png` → 改写 task `type:'local'`，复用 v0.2c 上传管线
- bench `samples/probe/05c-snapshot-fallback.html` + `samples/probe/05c-plan.json` 跑通：
  - 渐变 hero（indigo→pink→amber + 伪元素 + 87.3% 大字）720×196px
  - 三阶段虚线纸卡 grid 720×77px
  - 两张全部上传成功 uploaded=2/failed=0，doc `AscTdEVP2omvrbx0mHXcPpkGnxc`
  - 浏览器质检 ✅：两块装饰像素级保真 + caption 居中 + placeholder 全删 + 普通段落仍走 DocxXML 直转
- stats 加 `snapshotFallbacks: N`

#### v0.5d marker ✅ / 实现待真失败 sample

- 实现层暂搁置——飞书服务端解析失败的真 sample 还没出现
- transform 加体积预警：DocxXML > 200KB（plan 可覆盖 `v05dWarnAtBytes`）→ push warning + `stats.dx_size_warning = true`
- 触发条件落地标准（写进 docs/04）：
  - `+create` 返回 4xx 且 reason 含 "content too long" / "parse failed"
  - DocxXML > 500KB 但 200~500KB 也算疑似（先看 warning）
  - 真出现 → 留 minimal failing sample 到 `samples/probe/v0.5d-*` → 再实现 fallback IR + batch_create
- mock 验证 warning 触发逻辑（10KB 阈值压力下 63.5KB DocxXML 正确触发 warning，`dx_size_warning: true`）

**Done 标准**：复杂 Artifact 转出来的飞书文档嵌套结构正确、视觉接近原图、可协同编辑；含 DSL 图表的 Artifact 画板可拖。

---

## 阶段 5：Mode 2 app 态（批次 2-B）（✅ MVP 完成）

**P**

- **fragment 协议**：URL hash `#app=<base64-utf8-json>` 承载 `{ title, captionText, captionTags, images: [{ src, alt, prompt? }] }`，agent 投递端用 `web/images/make-fragment.mjs` 生成
- **app 态触发**：`#app=` fragment 或 `?app=true` query；无 fragment 时 `?app=true` 用 demo 图演示交互
- **单图重生**：不真发请求（GH Pages 静态环境）。点 ↻ 重生 → 把"重做这张图 + 原 prompt + 风格约束"复制到剪贴板 → 用户粘到 agent 让它重做 + 更新 fragment payload
- **zip 打包**：JSZip + Blob，fetch 图片 + 加 caption.txt → 浏览器原生下载

**D**

- `web/images/app.mjs` — 350 行：fragment 解析 + 重建 gallery + 拖排（HTML5 dragstart/dragover）+ 重生按钮 + caption 复制 + zip 下载 + Toast
- `web/images/app.css` — app-mode 样式（仅 body[data-mode="app"] 下生效，不污染教育页）
- `web/images/make-fragment.mjs` — Node CLI：payload.json → base64 fragment URL
- `web/images/index.html` — 接入 app.mjs/app.css

**C**

- 跑通本地 fragment 生成：`/tmp/mode2-sample-payload.json` → `make-fragment.mjs` 出 3460 chars / 8 图 fragment URL
- GH Pages 部署后浏览器质检（commit 7c8ed17 push 后实测；ai-freer.github.io/html-to-wechat/images/）：
  - ✅ `?app=true` → app 态壳子触发：hero 文案改"app 态预览（无 fragment payload）"、status-banner 隐藏、↻ 重生按钮 hover 显示、app-toolbar（zip 下载 / 复制 fragment / 提示）正确插入到 gallery 之后、caption 复制按钮在 caption-sample 内
  - ✅ `#app=<base64-utf8-json>` → payload 重建：hero title 改"上下文管理九层塔"、lede 改"app 态 · agent 已投递 **8** 张图..."、document.title 同步、gallery 用 payload alt 重命名 + 真实图（raw.githubusercontent.com）
  - ✅ regen 按钮 → `navigator.clipboard.writeText` 抓到正确的"重做第 N 张「alt」+ 原 prompt + 1024x1536 风格约束"完整文本
  - ✅ 拖排序：模拟 dragstart/dragover/dragend 事件后 DOM 重排正确（01-08 → 02/03/01/04/...），reindex 重编号 + 序号标签同步
  - ✅ 单图 fetch（caption-copy / tb-copy-frag / tb-zip 三个按钮 DOM 存在 + handler 全部绑定，单图 fetch 1.5MB blob 成功）
  - ⚠️ tile label 重复前缀 bug 现场发现 + 修复（commit 内 3 处）：
    - `rebuildGallery` 的 `num.textContent` 把 payload alt 已含 "01 / " 前缀又叠一遍 → strip 正则修正
    - `handleRegen` 同样把 alt 含前缀传进了 clipboard 文本 → 同正则修正
    - zip 文件名 `safeAlt` 也基于带前缀 alt → 同正则修正

**A**

- **fragment 协议设计 Learning**：
  - 把整个 payload 编 base64 进 hash → 状态完全自持，可收藏、可分享、可粘贴；后端零依赖
  - 单图 prompt 也含在 fragment 里 → 重生工作流不需要外部存储
  - hash 大小估测：8 图 ~3.5KB（含 prompt），50 图也只 ~20KB，浏览器 URL 上限 ~2MB 完全够
- **静态 GH Pages 限制下的"agent 协作"模式**：所有"需要 agent"的交互都设计成"复制 prompt 给 agent 让它做完再回来"，不真发 fetch；这其实是更稳的产品形态——agent 始终在用户终端跑，前端只是状态显示器

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

**当前阶段**：**全部 ROADMAP 计划任务已落地** ✅
- 阶段 1 ✅ / 2a ✅ / 2b ✅（本轮端到端跑通 + ROADMAP 补 Act 总结）
- Mode 4：v0.1 ✅ / v0.2a/b/c ✅ / v0.3 ✅ / v0.4 ✅ / v0.5a/b/c ✅ / v0.5d marker ✅（实现等真失败 sample）
- 阶段 5 ✅ MVP + 浏览器全交互质检 + alt 前缀 bug 修复 ×3
- 阶段 6 ✅ landing 4-mode 网格

**已完成节点**（按 commit 时间序）：
  - ✅ Mode 4 v0.1（commit 6700431）— DocxXML 直转主路径，bench sample 跑通
  - ✅ Mode 3 app（commit 5facda4）— fragment + marked + 字数时长 + 复制/下载
  - ✅ Mode 4 v0.2a（commit 481edc6）— plan-driven 容器映射机制 + bench demo callout 视觉验证
  - ✅ Mode 4 v0.2a patch（commit 1da34ac）— 黑名单不剥 plan 标注节点，annotations 6 → 9
  - ✅ 阶段 6 landing 重制（commit fcc6f75）— 主页改 4-mode 2x2 网格，加飞书卡片
  - ✅ Mode 4 v0.2b（commit a8ef927）— puppeteer 视觉理解链路打通 + plan 扩充（rail drop + card-lvl callout，命中 9 → 26）+ emit 黑名单子树穿透 patch（callout 输出 6 → 22）
  - ✅ ROADMAP 顺序重排（commit d239c95）— 阶段 2a 优先级前置到 v0.2c 之前
  - ✅ Mode 01 1C/1A skill 化（commit 748e2db）— `skill/modes/01-richtext/` 落地，transform.mjs body 与 web 版 0 diff，bench 1C plan demo `directivesApplied: 9 / directivesMissed: 0`
  - ✅ Mode 4 v0.2c 本地/base64 图片（commit 48dc451）— `upload-media.mjs` 两步管线 + sample v0.2c-images-test.html 跑通 `LvijdX2jyolIZOxTYnzcZHVHnig`，**uploaded=2/failed=0**
  - ✅ Mode 4 v0.3（commit 0baf858）— 6 个探针文档 + 3 项 finding 固化 docs/04 §7
  - ✅ Mode 4 v0.4（commit 32bdcb7）— update-doc.mjs 9 helper + demo-update.mjs 端到端跑通 8 helper 视觉质检通过（PuFLdgE9yogJESx2vvvcoNzgnJC）
  - ✅ Mode 4 v0.5a（commit 50ad2bf）— emoji 探针 + 自动替换，30 个保留 / 4 个 fallback
  - ✅ Mode 4 v0.5b（commit 8fe990b）— span text-color/background-color，TUjZdF39LoaYjgxk2sQcBCYLnX4 6 case 全过
  - ✅ 阶段 5 Mode 2 app 态 MVP（commit 7c8ed17）— fragment 协议 + app.mjs/app.css + 拖排序 + 重生 + zip
  - ✅ Mode 03 skill 骨架（commit af49ace）— skill/SKILL.md 总入口 + skill/modes/03-script/
  - ✅ **本轮收尾（待 commit）**：
    - 阶段 2b 端到端验证 + Act 总结固化（full-report sample → 12424 chars / 51.7min / 14 sections）
    - 阶段 5 浏览器视觉质检 + alt 前缀重复 bug 修复 ×3 处（rebuildGallery / handleRegen / buildZip）
    - Mode 4 v0.5c 装饰块截图兜底端到端跑通 + 浏览器质检通过（doc `AscTdEVP2omvrbx0mHXcPpkGnxc`）
    - Mode 4 v0.5d warning marker 落地 + 触发条件文档化

**仍待**（明确 defer，等真触发条件出现）：
  - v0.5d 实现层 — 等 `+create` 真返回 4xx 长度错或真实样本超 500KB

## 不在 Roadmap 范围内（明确划界）

- 飞书 API 自动发布到其他平台（不在场景）
- 团队版/SaaS 化（CLI 的自研扩展点不上）
- Docs Add-on 路径（HTML 作为可嵌入文档的 webapp 块）——已单独开发，不进 mode 04，详见 `docs/04 §10`
- 双向：飞书文档 → HTML Artifact（一期不做）
- 后端服务（项目坚持零后端）
- 多语言（先做中文，英文是后期话题）
