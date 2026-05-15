# HTML-to-WeChat

> 仓库名 / URL 路径保持小写 `html-to-wechat`；展示标题用 `HTML-to-WeChat`。

把 **Agent 生成的 HTML Artifact 文章**投递到微信公众号、小红书、AI 视频生成软件、飞书云文档的工具集。

在线工具：https://ai-freer.github.io/html-to-wechat/

## 起因

agent（Claude / Codex 等）生成的 HTML artifact，排版/交互/视觉远强于裸 Markdown。但公众号编辑器对 HTML 有严格白名单，直接粘贴会丢样式；小红书要"上图下文"图集格式；AI 视频软件要纯文字口播稿；飞书云文档需要原生 Block 结构才能协同编辑。这个项目把"HTML 是源"的工作流跑通，针对不同发布形态分别做一套转换管线。

## 四种投递形态

| 模式 | 目标平台 | 不装 Skill 能用吗 | 实现状态 | 设计文档 |
|---|---|---|---|---|
| 1. HTML → 公众号兼容富文本 | 公众号长图文 | ✅ 完全可用 | ✅ web + skill 同源 | [docs/01](docs/01-html-to-wechat-html.md) |
| 2. HTML → 图文号 / 小红书图集 | 小红书、公众号图文号 | ✅ app 态 + demo 可看，真出图需 Skill 调外部生图 | ✅ app 态 MVP + skill 工具 | [docs/02](docs/02-html-to-images.md) |
| 3. HTML → 口播稿 Markdown | AI 视频生成软件 | ⚠️ web 端接收 fragment 预览；HTML→md 在 Skill 端 | ✅ skill X-A 完整，X-C 退化为可选 | [docs/03](docs/03-html-to-script.md) |
| 4. HTML → 飞书云文档（Block 直转）| 飞书云文档 / 团队协同 | ❌ Skill-only（飞书 CLI + UAT） | ✅ v0.5c 完整（v0.5d marker） | [docs/04](docs/04-html-to-feishu.md) |

四种模式共享：同一个输入（标准 HTML 文件）、**X-C/X-A 范式**（X-C = LLM 决策层产 plan / X-A = 纯函数执行层）、`render-snapshot.mjs` 视觉理解工具。产出形态完全不同。整体推进计划见 [ROADMAP.md](ROADMAP.md)；跨 mode 范式总论见 [skill/SKILL.md](skill/SKILL.md)。

## 项目形态：1 个总 Skill + 4 个独立模式 Skill

本质上是一个 **大 Skill**（`skill/SKILL.md` 跨模式总入口）+ **4 个独立模式 Skill**（每个模式都是一个独立工作状态，agent 选 mode 后进入对应 `skill/modes/0X-XXX/SKILL.md`）+ **公开静态前端**（GitHub Pages）：

- **总入口 Skill** `skill/SKILL.md`：4 模式选择决策树、共享调用约定、X-C/X-A 范式说明
- **4 个模式 Skill**：每个独立可调用，自带 contract 与依赖
  - `skill/modes/01-richtext/` — 公众号富文本（juice + DOM + plan directives）
  - `skill/modes/02-images/` — 图集（agent 主导 + 调外部生图 + fragment 投递）
  - `skill/modes/03-script/` — 口播稿（cheerio + turndown + analyze）
  - `skill/modes/04-feishu/` — 飞书云文档（DocxXML + 飞书 CLI）
- **静态前端** `web/`：GH Pages 上 4 个独立 HTML 入口（landing + 3 个 mode 工具页）

两条路径互不强耦合：模式 1 的网页可脱离 Skill 独立用；模式 2 网页 app 态接收 fragment、真出图靠 Skill；模式 3 网页接收 fragment markdown、HTML→md 在 Skill 端；模式 4 是 100% Skill-only。

## 用户的两种使用情况

**情况 A：不装 Skill，纯访问网页**
- 模式 1 完全可用：粘贴 HTML → 复制富文本 → 粘到公众号后台
- 模式 2 部分可用：app 态壳子 + demo 可看；要真生图必须 Skill
- 模式 3 部分可用：网页接收 fragment markdown 渲染 + 字数/时长统计 + 下载
- 模式 4 不可用（需飞书 token，纯前端无法承载）

**情况 B：在 agent 里装了 Skill**
- 四种模式全部可用：agent 在本地跑转换/生成，跑完后跳转到对应静态页面（模式 1/2/3）或直接输出飞书文档 URL（模式 4），由用户完成最后一步交付（粘贴 / 下载 / 上传 / 打开链接）

## 仓库结构

```
html-to-wechat/
├── README.md                                  # 本文件
├── ROADMAP.md                                 # PDCA 推进计划 + 阶段总览 + 状态指针
├── docs/                                      # 各模式设计文档
│   ├── 01-html-to-wechat-html.md
│   ├── 02-html-to-images.md
│   ├── 03-html-to-script.md
│   └── 04-html-to-feishu.md
├── samples/                                   # 测试样本（详见 samples/README.md）
│   ├── README.md                              # 公开/私有约定
│   ├── probe/                                 # mode 4 各 v0.X 探针 fixture（公开）
│   ├── bench-plan-*.json                      # mode 1/4 plan schema demo（公开）
│   └── [内容样本走 .gitignore，本地落盘 / 不进 public]
├── web/                                       # GitHub Pages 静态前端
│   ├── index.html                             # Landing：项目门面 + 4 模式入口卡
│   ├── landing.css                            # Landing 样式
│   ├── richtext/                              # 模式 1 工具页（juice + DOM + 剪贴板）
│   ├── images/                                # 模式 2 app 态（fragment 协议 + 拖排 + zip）
│   └── script/                                # 模式 3 web 端（接收 markdown fragment）
└── skill/                                     # Skill 包（1 总入口 + 4 模式）
    ├── SKILL.md                               # 跨模式总入口（决策树 + X-C/X-A 范式）
    └── modes/
        ├── 01-richtext/SKILL.md + scripts/    # transform/default-plan/render-snapshot/index
        ├── 02-images/SKILL.md + scripts/      # render-snapshot/make-fragment/payload-example
        ├── 03-script/SKILL.md + scripts/      # html-to-script/analyze/render-snapshot/index
        └── 04-feishu/SKILL.md + scripts/      # html-to-docxxml/create-doc/update-doc/upload-media/render-snapshot/index
```

## 部署

GitHub Pages 从 `main` 分支 `/web` 子目录发布。HTTPS 自动开启，Clipboard API 直接可用。无后端、无密钥，任何需要 API key 的能力（生图、LLM 改写）都放在 Skill 端 / 外部 skill。

## 测试样本

`samples/` 默认 **.gitignore**（内部驱动测试用，可能含 PRD / 未发布内容）。仅 `samples/probe/`（合成 DocxXML/HTML 测试 fixture）和 `samples/bench-plan-*.json`（plan schema demo）公开追踪作为测试基础设施，详见 [`samples/README.md`](samples/README.md)。

5 个内部驱动 sample：
- `bench-standalone.html` 车载 AI 评测（mode 1/4 多 article 压测）
- `full-report-standalone.html` 车展报告 2.3 MB（mode 3 多 article 兜底）
- `context-tower-9layers/` 上下文管理九层塔（mode 2 真实图集 demo）
- `saic-prd-ai-travel-guide-standalone.html` 出行攻略 PRD（mode 4 飞书）
- `saic-prd-trip-planning-flow-standalone.html` 行程流程 PRD 5.6 MB（mode 4 飞书 + v0.5d 体积压测）

外部用户跑 skill 用自己的 HTML 即可，本仓库不需要也不应提供真实内容样本。

## 项目演进史

按 ROADMAP 实际推进顺序（详见 ROADMAP.md）：

1. **阶段 1** 设计落定（4 mode docs + 跨 mode X-C/X-A 范式）
2. **阶段 2a** Mode 01 1C/1A skill 化（transform.mjs web/skill 同源）
3. **阶段 3** Mode 4 v0.1 + Mode 3 web app
4. **阶段 4** Mode 4 v0.2-v0.5 渐进（v0.2a/b/c plan-driven + 视觉理解 + 本地图 / v0.3 callout-in-list 探针 + Mermaid / v0.4 局部精修 9 helper / v0.5a emoji 白名单 / v0.5b CSS color 映射 / v0.5c 装饰块截图兜底 / v0.5d marker）
5. **阶段 5** Mode 2 app 态 MVP（fragment 协议 + 拖排 + 单图重生 + zip）
6. **阶段 2b** Mode 03 skill 化 + 跨模式 `skill/SKILL.md` 总入口
7. **阶段 6** Landing 重制（4-mode 2x2 网格）
8. **收尾审计**（本轮）— 补 Mode 02 skill 包、Mode 03 X-C 接口、docs/02 重写、docs/01/03/04 X-A/X-C 范式段、README 准确化
