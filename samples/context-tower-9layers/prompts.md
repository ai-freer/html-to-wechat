# Prompts — 上下文管理九层塔（8 张图）

> 每张图 prompt = 共享 style 前缀 + type 模板 + 卡片具体内容。
> 共享前缀只在文件顶部写一遍，每张 prompt 实际调用时拼接。

---

## 共享 style 前缀（粘在每张 prompt 最前）

```
STYLE: Late-night engineering blueprint aesthetic, flat illustration with geometric precision, like a senior engineer's whiteboard sketch refined into a magazine cover. Restrained, intellectual, blue-hour mood. NOT cartoon, NOT cyberpunk neon, NOT glassmorphism, NOT metallic gloss, NOT decorative AI flourishes.

PALETTE: Deep midnight blue background (#0E1A2B), ivory text (#F5F1E8) for headings, muted fog grey (#A8B0BF) for secondary text, warning orange (#FF6B35) used SPARINGLY only for critical emphasis, electric cyan (#4FD1C5) for structural lines and data flow, occasional cream paper (#EBE5D6) for inverse cards. Very faint blueprint grid (#1E2A3E) on background, barely visible.

TYPOGRAPHY: Modern Chinese sans-serif, bold for headlines (思源黑体 Heavy / Source Han Sans Heavy feel), regular for body text, monospaced or condensed sans for L1-L9 labels and numbers. Generous line height in body. Confident headline sizes, restrained body sizes, clear visual breathing room.

LAYOUT: Sharp right angles dominate; rounded corners minimal. Grid-aligned composition. Whitespace is restrained but rhythmic. Elements have clear visual boundaries. No drop shadows; no 3D effects; no gradients except a subtle background fade.

ASPECT: 3:4 vertical (1024×1536). Output the image at this exact aspect, no letterboxing.

AVOID: warm-color domination, cartoon style, neon glow, glassmorphism, frosted glass, beveled edges, AI-generated decorative ornaments, peacock blue, magenta, watermarks, signatures.

ALL Chinese text must be rendered crisply and exactly as written. Do not paraphrase or alter the Chinese characters. Do not add any additional decorative Chinese text not specified in the prompt.
```

---

## Card 01 — Cover (Type C, image-dominant)

```
[STYLE PREFIX]

A cinematic vertical magazine-style cover illustration of an abstract 9-tier architectural tower, viewed from slightly below at a confident upward angle. The tower is rendered in flat-illustration style with crisp geometric edges and clean planar surfaces. It has exactly 9 horizontal tiers, stacked clearly visible, each tier a distinct slab. The 9 tiers are visually grouped into 3 sections of 3 tiers each (bottom 3 / middle 3 / top 3), separated by very thin horizontal dividers; each group has a subtle tonal shift to suggest different "phases" (foundation / runtime / evolution). The middle 3 tiers (suggesting the critical "runtime" group) carry a single warm-orange (#FF6B35) accent highlight running along one edge — a "this is the dangerous zone" hint, but subtle and elegant, not loud. Very thin electric-cyan (#4FD1C5) lines connect adjacent tiers, suggesting data flow between layers. Background: deep midnight blue (#0E1A2B) with the faintest blueprint grid texture, almost imperceptible, evoking a late-night architect's drawing board.

Overlay Chinese title near the upper third, centered, in bold modern sans-serif (思源黑体 Heavy style), color ivory (#F5F1E8):
"上下文管理九层塔"

Below the main title, smaller, in muted fog grey (#A8B0BF), Latin sans-serif:
"Context Engineering · 9 Layers"

The image fills the frame; the title sits over the upper third with strong typographic presence. No other text on the image. No people. No logos. No watermarks.

Aspect ratio: 3:4 vertical (1024×1536).
```

---

## Card 02 — 核心论点 (Type B, text-dominant)

```
[STYLE PREFIX]

A vertical magazine-style page where Chinese text is the dominant element. The composition has the text occupying the upper two-thirds of the frame on a deep midnight blue (#0E1A2B) background. The text must be rendered crisply, exactly as written, in modern Chinese sans-serif (思源黑体 Heavy for the headline, Regular for body).

Headline at top (large, ivory #F5F1E8):
"大上下文窗口 ≠ 上下文管理"
(The "≠" symbol should be visually prominent, possibly slightly oversized or highlighted with the warning orange #FF6B35.)

Body text below the headline (medium size, ivory text, generous line height):
"窗口解决「能装多少」
不解决「装什么、何时召回、如何压缩、怎样进化」"

In the lower third of the image, a small supportive flat-illustration: a stylized abstract "window frame" (a glowing thin rectangle) being stuffed with a chaotic pile of small geometric cards / chips — the cards spill out, suggesting capacity ≠ organization. The illustration is small, supportive, NOT the focus. Electric-cyan (#4FD1C5) accent on the window frame outline.

Aspect ratio: 3:4 vertical. Generous whitespace around the text. No people, no logos, no watermarks.
```

---

## Card 03 — 5 个问题 (Type A, infographic)

```
[STYLE PREFIX]

A vertical information graphic on deep midnight blue (#0E1A2B) background with faint blueprint grid.

Title at the top, in ivory (#F5F1E8) bold sans-serif:
"三层架构不够用，会发生什么"

Below the title, 5 numbered rows stacked vertically, each row is a horizontal bar layout containing: 
  [a small geometric icon on the left, ~80px wide]  [a circled number in electric cyan (#4FD1C5)]  [Chinese label in ivory bold]  [one-line Chinese description in muted fog grey (#A8B0BF)]

The 5 rows render exactly this text (Chinese must be exact, do not paraphrase):

  1  记忆膨胀     文件越来越多，bootstrap 注入被截断
  2  噪声累积     日志 / heartbeat / maintenance 混入记忆
  3  召回失败     记了但找不到，或找到的不是最相关的
  4  压缩丢失     长会话被 compaction 后，关键决策丢了
  5  重复劳动     同样的任务做了十次，每次从零开始

Each icon (left column) is a minimalist flat geometric symbol representing the concept:
  - 记忆膨胀: a small box overflowing with stacked planks
  - 噪声累积: scattered tiny dots / particles
  - 召回失败: a magnifying glass over an empty grid
  - 压缩丢失: a compressed accordion with fragments falling away
  - 重复劳动: a circular arrow / repeat symbol

Icons use electric cyan (#4FD1C5) outlines on the dark background. Row backgrounds alternate between #0E1A2B and #152238 to create subtle banding. Numbers in electric cyan circles, ~40px diameter.

The 5 rows fill the middle ~70% of the vertical space. No footer text. No watermark.

Aspect ratio: 3:4 vertical (1024×1536).
```

---

## Card 04 v2 — 九层塔总览 (Type A, infographic — CENTERPIECE, with icons)

> v1 (无图标版) 信息正确但过于"表格化"。v2 加左列线稿图标后视觉密度上来，从"信息表"变成"架构图"。这是最终版本。

```
[STYLE PREFIX with ICON RULES — see top of file]

ICON RULES (extra strict for this card): All icons MUST be minimalist flat line-icons drawn with thin electric-cyan (#4FD1C5) strokes (or warning-orange for the L6 row) on the dark blue background. They are line-icon style — like Feather Icons, Lucide, or Phosphor. They are NOT colorful emoji. They are NOT cartoon. Thin clean strokes only (~2-3px line weight).

---

A vertical architectural diagram of a 9-tier 'context engineering tower' on deep midnight blue background with very faint blueprint grid texture. The centerpiece infographic.

Title at top, centered, ivory bold sans-serif: "九层塔总览"

Below the title, a vertical stack of 9 horizontal layer-bars, stacked from L9 at top to L1 at bottom. Each layer-bar has FOUR columns left to right:
  [Column 1: line-icon ~80×80px, electric cyan strokes (orange for L6)]
  [Column 2: Layer code in monospace, electric cyan (orange for L6)]
  [Column 3: Chinese layer name, ivory bold]
  [Column 4: thin vertical separator, then one-line Chinese description in muted fog grey]

The 9 rows render exactly (top to bottom, Chinese exact):

L9 — icon: upward chevron arrow with small sprout/leaf above (growth)
  L9  能力进化层  ｜  经验到可复用技能

L8 — icon: circular refresh / spiral loop (iteration)
  L8  自我迭代层  ｜  错误反馈到行为规则

L7 — icon: crescent moon with two small dots (overnight dreaming)
  L7  后台整理层  ｜  短期记忆到长期记忆

── divider: '运行时层 L4-L6' in muted fog grey small caps ──

L6 (ALL elements in warning orange #FF6B35) — icon: heartbeat pulse waveform (ECG)
  L6  会话生存层  ｜  Lossless Context Engine

L5 — icon: magnet shape with two small lines being pulled toward it
  L5  主动召回层  ｜  消息前自动注入相关上下文

L4 — icon: magnifying glass with small dot pattern inside lens
  L4  语义检索层  ｜  embedding + 混合搜索

── divider: '基础层 L1-L3' in muted fog grey small caps ──

L3 — icon: stack of 3 horizontal document sheets
  L3  文件记忆层  ｜  Markdown 长期事实

L2 — icon: checklist (3 short lines with small checkmarks)
  L2  规则治理层  ｜  行为边界 / 工具协议

L1 — icon: simple person silhouette (head circle + shoulder line, abstract)
  L1  身份注入层  ｜  身份 / 用户 / persona

Also add top divider '进化层 L7-L9' above the L9 row.

Each row: thin electric-cyan left-edge accent (orange for L6). Subtle alternating background banding. Generous internal padding.

Aspect ratio: 3:4 vertical (1024×1536). No watermark.
```

---

## Card 05 v4 — L6 会话生存层 (Type B, architectural portrait + warning footer) — FINAL

> **三次迭代的教训**：
> - **v1**（warning-centric）出乱码：误判为"密度超限"，错。
> - **v2**（warning-centric, simplified）：勉强能读但损失术语精度，错的方向。
> - **v3**（warning-centric, full content, retry）：用户当时认可了，但**框架仍是错的** —— 把 L6 框成"warning 卡片"低估了它在架构里的位置。
> - **v4**（architectural portrait + 小警示备注）：用户指出 L6 真正的重要性是"会话生存层 / Lossless Context Engine"，长上下文得以保鲜的核心运行时；warning 应该是底部小备注。**这才是这张卡正确的语义框架**。
>
> **结构 lesson**：当一张卡片想讲一个"架构层"时，开头先讲它是谁、做什么，再讲坑；颠倒就把"重要的事"压成了"工程八卦"。

```
[STYLE PREFIX]

A vertical architectural-portrait card celebrating the L6 layer as a critical runtime engine. Three regions top to bottom:

REGION 1 — TOP TITLE BLOCK (~30%):
Very large headline, centered. 'L6' in warning orange (#FF6B35), the rest in ivory:
"L6 会话生存层"
Subtitle below, medium, muted fog grey:
"Lossless Context Engine — 长对话不丢上下文的运行时引擎"

REGION 2 — CENTER VISUALIZATION (~45%):
A flat architectural diagram showing how L6 works:
- LEFT: three short cyan arrows feeding INTO a central hub, labeled (top to bottom): '实时摄入消息' / '历史摘要' / '运行状态'
- CENTER HUB: a hexagonal/diamond DAG-mesh structure in thin electric-cyan lines (suggesting 'lossless assembly'). Inside hub: monospace label 'DAG / 摘要 / 分层压缩'
- RIGHT: one thicker warning-orange arrow flowing OUT, labeled '组装下一轮上下文'
Metaphor: scattered inputs → ordered structured output.
Below visualization, 2-line caption in ivory regular:
"让早期约定、任务状态、关键决策"
"在长会话中持续存活"

REGION 3 — BOTTOM WARNING FOOTER (~25%):
A thin bordered panel, slightly darker bg (#152238), thin warning-orange top edge.
Small header in warning orange: "⚠ 工程上要避开的两个'安静吃亏'的坑"
Two short lines in muted fog grey with small orange bullets:
"• slot 不绑定 → 默默退化到 legacy 截断"
"• 摘要前不 redact → sk-XXX 经 FTS 持续放大注入"

The composition reads top-to-bottom: identity → function → caveats. The warning is subordinate.

Aspect ratio: 3:4 vertical (1024×1536). No watermark. All Chinese rendered exactly as written.
```

---

## Card 06 v4 — 数据流闭环 (Type A, branching cascade + dashed loopback) — FINAL

> **四次迭代的教训**：
> - **v1**（环形布局）：中文乱码，误判为密度问题。
> - **v2**（环形 + 简化标签）：能读但结构错——压平了"时序感"。
> - **v3**（线性垂直级联 10 节）：用户对照原文 HTML artifact 后指出**还是错**——原图里 L7/L8/L9 是**从 L3 文件记忆并列分出的三路下游分支**，不是线性后续。我把"并列消费 L3 产物"的语义错误压平成"一条直线下去"。
> - **v4**（顶部级联 + 底部三路分支 + 虚线橙色回流）：完整对齐原文 HTML 那张流程图。一次过。
>
> **结构 lesson**：**视觉结构要严格忠实于原文的视觉表达**——markdown 版的线性 ↓ 不等于 HTML artifact 的真实拓扑。生成图集 plan 时，应该优先看文章的 HTML 图，而不是 markdown 文本，因为前者保留了真实层级关系。

```
[STYLE PREFIX]

A vertical top-down flowchart with 3-way branching near the bottom.

Title at the top, ivory bold sans-serif:
"九层不是流水线，是闭环"

The flowchart proceeds top to bottom. Each node is a rounded rectangle with #152238 fill and thin electric-cyan (#4FD1C5) border, EXCEPT the Agent node which is FILLED with warning orange (#FF6B35) background and ivory text. Each non-Agent node has an L-code in upper-left corner (monospace electric cyan) and the main Chinese label centered, with a parenthetical sub-label below in muted fog grey.

(A) TOP CASCADE — 7 sequential nodes connected by downward cyan arrows:

  Node 1:                      用户消息
  Node 2 [L1/L2]:              身份+规则注入 (自动注入)
  Node 3 [L5]:                 主动召回 (自动搜索)
  Node 4 [L4]:                 语义检索 (按需查找)
  Node 5 [AGENT — ORANGE FILL]: Agent 回答 / 执行
  Node 6 [L6]:                 会话生存 (lossless-claw)
  Node 7 [L3]:                 文件记忆 (durable)

(B) 3-WAY BRANCH — from bottom of Node 7, three diverging cyan arrows fan out to three side-by-side nodes (same horizontal row, full width spread):

  Branch left   [L7]:  Dreaming (整理)
  Branch center [L8]:  自我迭代 (纠错 → 规则)
  Branch right  [L9]:  技能进化 (→ skill)

(C) CONVERGE — three converging cyan arrows meet at a single FINAL node spanning the middle 60% width:

  Final node:  下一轮对话继续使用

(D) LOOPBACK — a long DASHED CURVED ARROW in warning orange (#FF6B35) loops from the right edge of the Final node, sweeping up along the right side of the entire frame, arrives back at the right edge of Node 1 (用户消息) with a directional arrowhead. The curve is clearly DASHED, not solid. NO label on the line.

Bottom small caption in muted fog grey, centered:
"虚线表示跨轮闭环"

Aspect ratio: 3:4 vertical (1024×1536). No watermark.
```

**结构选择**：原文 HTML artifact 的流程图就是这个形态——上半部线性级联，下半部三路并列消费 L3 产物，最后归一到下一轮，虚线表示跨轮闭环。这条图把"九层之间的真实拓扑"完整保留了下来，不是市场化的"圆形闭环"美感取舍。

---

## Card 07 — 三阶段路径 (Type A, infographic)

```
[STYLE PREFIX]

A vertical 3-phase build path diagram on deep midnight blue (#0E1A2B) background.

Title at the top, ivory (#F5F1E8) bold sans-serif:
"不必一次搭满，分三阶段"

Below the title, three large vertical phase blocks stacked top-to-bottom, each block clearly numbered and labeled. Each block is a panel in slightly different tonal shade of dark blue, separated by thin electric-cyan (#4FD1C5) horizontal dividers.

Render exactly these three phases:

  ── Phase 1 ──
  基础可用（几小时上手）
  L1 - L3：身份 / 规则 / Markdown 记忆目录

  ── Phase 2 ── (this phase block carries a subtle warning-orange #FF6B35 accent on its left edge)
  质变临界点
  L4 - L6：检索 + 主动召回 + 会话生存
  注：L6 一次到位，别留坑

  ── Phase 3 ──
  系统自愈
  L7 - L9：Dreaming + 自我迭代 + 技能进化

Phase numbers (1/2/3) shown in large condensed sans, electric cyan. Each phase has a small geometric icon in the right side of its block (e.g. Phase 1 = three stacked rectangles; Phase 2 = a circuit-like junction; Phase 3 = an upward spiral). Icons are minimal, electric cyan outlines.

A small footer line at the bottom, in muted fog grey:
"每个阶段都可独立运行 · 完整九层才形成闭环"

Aspect ratio: 3:4 vertical (1024×1536). No watermark. Chinese rendered exactly.
```

---

## Card 08 — 收尾金句 (Type C, image-dominant)

```
[STYLE PREFIX]

A cinematic vertical closing illustration. The full frame is filled with an atmospheric, quiet, contemplative scene: a single late-night moment of an engineer's thought finally crystallizing.

Scene: a stylized abstract composition representing "memory and forgetting." Suggested elements (the model should pick ONE and execute it well, not stack them):

  Option A — A thin silhouette of a person at a whiteboard in a dark room, the whiteboard showing a faint 9-tier tower sketch in electric-cyan chalk lines, the person's posture suggesting they have finally stepped back to see it clearly.

  Option B — A geometric metaphor: a row of small cards on a table, half of them fading / dissolving into faint dust at the edges, illuminated by a single overhead light — suggesting that knowing what to forget is itself a skill.

Mood: late blue hour, quiet, restrained, the satisfaction of clarity after long work. Color palette stays in the deep midnight blue + ivory + electric cyan family. A whisper of warm orange light source somewhere off-frame.

Overlay Chinese title in the upper third, centered, ivory (#F5F1E8) bold sans-serif (思源黑体 Heavy):
"好的 Agent 不是记得更多"

A smaller subtitle below the main title, muted fog grey (#A8B0BF), slightly italicized feel:
"而是知道何时遗忘"

The image is the star; the text sits over the upper third with strong typographic presence but does not dominate. No other text. No people's faces (silhouettes OK). No watermarks. No logos.

Aspect ratio: 3:4 vertical (1024×1536).
```

---

## 一致性策略备注

- **Card 01 (cover)** 先单独生成。如果首图视觉成立，把它作为 `--input` 参考图，**Card 02-08** 走 `edit` 模式 + `--no-preserve`，每张 prompt 开头加一段引子："Use the visual style, color palette, typography feeling and illustration aesthetic of the reference image. Completely recompose the frame to show the following content instead:"，然后再接对应卡片的完整 prompt。
- 如果首图风格不对，先迭代首图（调整 style_sheet 或 cover prompt），不要急着批量。
- 文字部分如果某张图渲染错字（中文偶尔会被换形），单独重生那张即可，整套不需要重来。
