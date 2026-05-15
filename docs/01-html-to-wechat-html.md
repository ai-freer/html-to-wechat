# 模式 1：HTML → 公众号兼容富文本

> 目标：把一份 HTML Artifact 转换成可直接粘贴到公众号后台编辑器、且样式不丢的富文本。
> 采用统一范式 **1C（决策）+ 1A（执行）**：1C 用 LLM 决策处理方案，1A 是纯函数按方案执行。两种入口共享同一个 1A 引擎。
>
> **跨项目范式对应**：1C/1A 是项目级 **X-C/X-A** 范式在 mode 1 的命名实例。X-C/X-A 总论见 `skill/SKILL.md` 与 `ROADMAP.md §「关键决策」`。本 mode 的 skill 包在 `skill/modes/01-richtext/`，X-A 主体 `transform.mjs` 与 web 浏览器版 `web/richtext/transform.mjs` byte-identical 同源。

## 1. 输入与输出

**输入**：HTML 内容，**三种来源任一**：
- 本地 standalone HTML 文件（`<style>` 嵌入、`<script>` 嵌入、SVG 内联或外链均可）
- 公开可访问的 HTML 网页 URL（http/https，Skill 端 fetch 后等价于上一种）
- HTML 字符串直接传入（粘贴框 / agent fragment）

Skill 端在前置处理时把三种来源**归一化**成"内存中的 HTML 字符串 + 关联资源目录"，后续管线统一处理。模式 2/3/4 同此。

**最终交付物**：浏览器剪贴板里的 `text/html` blob，到公众号后台编辑器 Cmd+V 即可。

**中间产物**（用于调试和归档）：
- `*.plan.json` —— 1C 产出的转换方案（skill 路径有，网页路径用 default plan 无此文件）
- `*.wechat.html` —— 1A 执行后的最终版

## 2. 统一范式（核心）

mode 01 的两条入口都跑在同一个 1A 引擎上，**差别只在 plan 的来源**：

```
入口 A：网页（web/richtext/）
  HTML（用户粘贴 / URL 拉取 / fragment 注入）
   ↓
  1A(HTML, default-plan)
   ↓
  公众号富文本 → Clipboard API → 用户 Cmd+V 投递
  
  特征：零 LLM、零 skill、零 token；服务"结构标准 HTML"

入口 C：skill（skills/html-to-wechat/）
  HTML（agent 接收的输入）
   ↓
  1C-pre: agent 看截图 + 读源码 → 输出 plan.json
   ↓
  1A(HTML, plan)
   ↓
  公众号富文本 + assets-checklist.md
   ↓
  1C-post: agent 对比前后截图 → 验证 / 重跑
   ↓
  agent 给用户一个 fragment URL，跳网页页一键复制
  
  特征：依赖 LLM；服务视觉复杂报告（车展、对标分析类）
```

**1A = 纯函数 `transform(html, plan) → { html, text, stats, warnings }`**

无副作用、无 IO、无 LLM 调用。所有"长尾"决策都被 plan 吸收。

**plan schema 的两层**：
- **全局开关 / 阈值**（数值类，default plan 提供合理值）
- **节点级 directives**（数组，LLM 在 1C 阶段针对具体 DOM 节点生成；default plan 为空数组）

## 3. plan.json schema

```jsonc
{
  // === 正文抽取 ===
  "extractMain": true,
  "extractMainMinChars": 200,    // <article>/<main> 至少多少字才信任

  // === 标签清理 ===
  "bannedTags": ["script", "iframe", "form", "input", "link", "meta", "noscript"],
  "removeIds": true,             // 公众号会强制剥离 id，预先删了避免歧义

  // === 页面骨架剥离（无 article/main 时启发式）===
  "chromeSelectors": [
    "nav", "aside",
    "[role=navigation]", "[role=banner]", "[role=contentinfo]",
    "[role=complementary]", "[role=search]"
  ],

  // === 多列 flex/grid → table ===
  "multiColConversion": {
    "enabled": true,
    "minKids": 2,
    "maxKids": 3,                // 4+ 子级不转（chip / icon 排）
    "assumedDocWidth": 700       // px → 百分比折算用
  },

  // === 表格列宽估算 ===
  "tableColumnSizing": {
    "enabled": true,
    "textCellMaxLen": 40,        // 单列最多算 N 字符
    "minColPctRatio": 0.4        // 最小不低于均分的 N%
  },

  // === 同结构表合并 ===
  "tableMerging": {
    "enabled": true,
    "minRows": 3                 // ≥ N 行连续同结构才合并
  },

  // === <dl><div><dt><dd> → <table> ===
  // 公众号会把 dt/dd 当 list item 加 bullet，必须重写
  "dlToTable": {
    "enabled": true,
    "minKids": 2,
    "maxKids": 6                 // metrics 卡片网格常见 4-5 列
  },

  // === 公众号兼容性修复层（v0.2 引入，针对车展报告类视觉重 HTML）===
  // 公众号对 inline style "一条 declaration 不认就整条丢"。
  // 这里把不认的属性预先剥掉，避免连带砍掉 background/color 等关键属性。
  "stripUnknownCssProps": {
    "enabled": true,
    "blacklist": [
      "min-height", "max-height", "min-width", "max-width",
      "overflow", "overflow-x", "overflow-y",
      "backdrop-filter", "-webkit-backdrop-filter",
      "object-fit", "object-position",
      "aspect-ratio",
      "inset", "inset-block", "inset-inline",
      "will-change", "transform-origin", "transform-style",
      "filter", "-webkit-filter"
    ]
  },

  // clamp/min/max 公众号不支持，整条 declaration 会丢
  "cssFunctionFlatten": {
    "enabled": true
    // clamp(min, ideal, max) → ideal（之后被 viewportUnits 继续换算）
    // min(a, b) → a
    // max(a, b) → a
  },

  // vw/vh 换算成 px。公众号视宽 ~375-414px，但 HTML Artifact 多按 750px 设计
  "viewportUnits": {
    "enabled": true,
    "docWidth": 750,
    "docHeight": 900
  },

  // 半透明 rgba 背景预先压平到不透明等效色。
  // 公众号渲染半透明色不可靠 + 父链一断下游 alpha 全乱。
  // 自顶向下 alpha-blend 到父背景上，写回不透明色。
  "flattenAlphaBackgrounds": {
    "enabled": true,
    "defaultPageBg": "#ffffff"   // 找不到不透明父背景时的兜底
  },

  // === 图片策略 ===
  "imageStrategy": "manual",     // "manual" | "placeholder" | "inline-base64"

  // === 节点级 directives（LLM 产出 / default 为空）===
  // 1C 看完 HTML 后针对具体节点的处理指令
  "directives": [
    {
      "selector": ".timeline-container",
      "action": "unwrap",
      "reason": "timeline 容器自身无视觉作用，子节点直接进流"
    },
    {
      "selector": ".timeline-item",
      "action": "prepend-text",
      "content": "📅 {{data-date}}",
      "format": "h3",
      "reason": "把时间编码进文字层"
    },
    {
      "selector": ".comparison-card",
      "action": "wrap-section",
      "headingTemplate": "对比维度 {{index}}：{{title}}",
      "reason": "横向对比卡 → 章节式叙述"
    },
    {
      "selector": ".decorative-bg",
      "action": "remove",
      "reason": "纯装饰，无信息"
    },
    {
      "selector": "section.dark-theme",
      "action": "lighten-bg",
      "reason": "公众号暗色模式会反色，强制改浅底"
    }
  ]
}
```

**directives 当前支持的 action**（v1，未来扩展）：
- `unwrap` — 删除元素自身，保留子节点
- `remove` — 删除元素及其子节点
- `prepend-text` / `append-text` — 插入文字前缀/后缀
- `wrap-section` — 把元素包成章节（前置 heading + 后置 divider）
- `lighten-bg` / `darken-bg` — 背景色翻转
- `flatten` — 把嵌套盒子拍平成 block 序列

## 4. 1A 管线（pure function）

```
1A(rawHtml, plan) {
   │
   ├─ ① CSS 内联（juice）
   │
   ├─ ② preRender（可选，仅网页入口）
   │     sandbox iframe 跑脚本捕获动态内容
   │
   ├─ ②.5 CSS 兼容性修复层（针对视觉重 HTML 的关键修复）
   │     a. stripUnknownCssProps — 剥 min-height / overflow / inset 等
   │        公众号不认的属性，避免 background 等关键属性被一锅端
   │     b. cssFunctionFlatten — clamp/min/max → 单值
   │     c. convertViewportUnits — vw/vh → px（按 docWidth/docHeight 换算）
   │     d. flattenAlphaBackgrounds — 半透明 rgba 沿父链 alpha-blend
   │        到不透明等效色，对抗"父链一断下游全乱"的级联失败
   │
   ├─ ③ 删除 plan.bannedTags
   │
   ├─ ④ 应用 plan.directives（节点级指令）
   │     按 selector 找到节点 → 执行 action
   │     这一层是 LLM 决策落地的入口
   │
   ├─ ⑤ 正文抽取（plan.extractMain）
   │     <article> / <main> 优先 → 否则启发式剥页面骨架
   │
   ├─ ⑥ flex/grid → <table>（plan.multiColConversion）
   │     公众号会剥 flex/grid，table 才能活下来
   │
   ├─ ⑥.5 <dl><div><dt><dd> → <table>（plan.dlToTable）
   │     公众号会把 dt/dd 当 list item 加 ▪，必须重写
   │
   ├─ ⑦ 同结构表合并（plan.tableMerging）
   │     连续 N 行同列结构 <a><table> → 单个多行 <table>
   │
   ├─ ⑧ 剩余 flex/grid → block 降级 + position 删除时连带删 top/right/bottom/left
   │
   ├─ ⑨ 表格列宽估算（plan.tableColumnSizing）
   │     公众号 / 飞书无 colgroup 时均分列宽，按文本长度估
   │
   ├─ ⑩ 删除 id 属性
   │
   ├─ ⑪ 提取 body innerHTML + 纯文本 fallback
   │
   └─ 返回 { html, text, stats, warnings }
}
```

## 5. 两个入口的实现

### 入口 A：网页（web/richtext/）

```
web/richtext/
├── index.html
├── styles.css
├── transform.mjs        ← 1A 引擎（纯函数，无 UI）
├── default-plan.mjs     ← default plan 常量
└── app.js               ← UI 层，import transform + default-plan
                           调用 transform(html, defaultPlan)
```

**特征**：
- 浏览器内运行，不依赖 Node / skill / token / LLM
- 用户三种路径：粘贴 / URL 拉取 / fragment 注入（skill 路径产物用）
- "结构标准 HTML"用 default plan 就够，复杂报告产出会失味——这种就走入口 C

### 入口 C：skill（skills/html-to-wechat/）

```
skills/html-to-wechat/
├── SKILL.md             ← 三段式工作流：1C-pre / 1A / 1C-post
├── scripts/
│   ├── transform.mjs    ← 与网页版同一份 1A（通过 build-script 注入或直接复制）
│   ├── default-plan.mjs
│   ├── render-snapshot.mjs   ← puppeteer 全页截图，给 agent 视觉理解用
│   └── runner.mjs       ← 接 plan.json 文件路径，跑 transform，输出 wechat.html
└── references/
    ├── wechat-html-css-whitelist.md  ← 公众号白名单速查
    └── directive-patterns.md          ← directives action 写法 cookbook
```

**SKILL.md 工作流**：
```
Step 1 (1C-pre): agent 用 render-snapshot 截图 → Read 截图 → 看视觉
Step 2 (1C-pre): agent 读 HTML 源码 → 结合截图判断视觉单元 → 写 plan.json
Step 3 (1A):     agent 执行 `node runner.mjs --html INPUT.html --plan plan.json --out OUTPUT.html`
Step 4 (1C-post): agent 用 puppeteer 渲染 OUTPUT.html 截图 → 对比原截图 → 验证
Step 5:          agent 把 OUTPUT.html 编 fragment URL，给用户跳网页一键复制
```

## 6. 公众号 HTML/CSS 白名单（关键约束）

参考：[微信公众号 HTML/CSS 支持情况解析](https://www.axtonliu.ai/newsletters/ai-2/posts/wechat-article-html-css-support)

### 标签层

| 类别 | 状态 |
|---|---|
| `<p>` `<h1>`-`<h6>` `<strong>` `<em>` `<u>` `<br>` `<ul>` `<ol>` `<li>` `<a>` `<img>` | 保留 |
| `<table>` `<tr>` `<td>` `<thead>` `<tbody>` | 保留 |
| `<style>` `<script>` `<iframe>` `<form>` `<input>` `<link>` | **过滤** |
| 所有元素的 `id` 属性 | **删除** |
| `<svg>`（内联） | 保留，但内含的 `<image href>` 必须用素材库链接 |

### CSS 层（**只认 inline `style` 属性**）

| 属性类别 | 支持 |
|---|---|
| 文本：`font-size` `color` `font-weight` `line-height` `letter-spacing` `text-align` | 完全支持 |
| 盒模型：`margin` `padding` `border-*` `border-radius` `box-shadow` | 完全支持 |
| 背景：`background-color` | 支持；`linear-gradient` 在部分设备不稳定，建议纯色兜底 |
| 显示：`display: block / inline-block` | 支持 |
| 显示：Flex / Grid | **基本不支持**，需用传统盒模型重写（→ table 或 inline-block） |
| 定位：`position` | **过滤** |
| 响应式：`@media` `@keyframes` `:hover` | **过滤** |
| 字体：自定义字体 / `@font-face` | **不可用**，仅系统字体 |
| 单位：`%` 不稳定 | 用 `px` / `vw` / `vh` 替代 |

### 图片

- 外链图片（包括公开 CDN）会被替换或屏蔽
- Base64 内嵌图片不显示
- **只有上传到公众号素材库换得的链接才能显示**
- SVG 里的 `<image href>` 同样受此约束

## 7. 已知坑（开工前必读）

1. **Clipboard API 必须 https / localhost**：非安全上下文下不可用
2. **跨浏览器**：Chromium 系（Chrome/Edge/Brave）对 `ClipboardItem` 支持最完整
3. **公众号编辑器"剥层"**：包裹太多 `<div>` 嵌套层时外层 div 会被拉平，1A 输出尽量浅嵌套
4. **代码块**：公众号原生不支持代码高亮，靠 inline 样式手画或截图
5. **表格宽度**：公众号正文 ~375-414px，桌面宽表格溢出。1A 已加 `width:100%; table-layout:fixed` + colgroup 锁列
6. **暗色模式**：公众号读者可能开启暗色阅读，纯白背景配深色字会被反转。设计时避免硬编码 `background: white`
7. **directives 误匹配**：LLM 生成的 selector 可能命中多个节点。1A 执行 directives 时应 log warning 提示用户
8. **空 plan 兼容**：1A 必须能用纯 default plan 跑（即 `directives: []`），跟当前 `app.js` 的行为完全一致

## 8. 实现路径

```
v0.1（当前阶段 = 范式落地）：
  - 重构 web/richtext/app.js → transform.mjs + default-plan.mjs + app.js（UI）
  - default plan 字段覆盖 process() 内部所有硬编码值
  - directives 接口预留但 v0.1 不实现（plan.directives = []）
  - 网页 UI 行为完全不变

v0.2（阶段 2 D 阶段 = mode 01 skill）：
  - 实现 skills/html-to-wechat/
  - 实现 directives 的 action（v1 集合：unwrap / remove / prepend-text / wrap-section / lighten-bg / flatten）
  - 跑 sample（车展报告 / AI 座舱对标）

v0.3（阶段 4-x）：
  - 1C-post 验证机制
  - 失败块清单返流给 agent 重生
  - 评估是否需要更复杂的 action

v0.4 体验打磨：
  - URL fragment 容量超限的降级方案
  - 移动端预览（公众号正文 ~375px）
```

## 9. 已识别的开源参考

- [doocs/md](https://github.com/doocs/md) —— Markdown → 公众号编辑器，剪贴板写入逻辑可借鉴
- [Automattic/juice](https://github.com/Automattic/juice) —— CSS 内联底层（已用）
- [ufologist/wechat-mp-article](https://github.com/ufologist/wechat-mp-article) —— 公众号图文排版工具

## 10. 不在范围内（明确划界）

- 自动上传素材库（公众号开放平台 API 限制严，且需要认证主体）
- 公众号自动发布（同上）
- 交互的 JS 等价模拟（公众号没有 JS 运行时）
- 后端服务（项目坚持零后端）
- 修复 1A 已知 bug（深色排版失误等）——由独立 hotfix 轨道处理，不在范式落地的 commit 里
