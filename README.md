# html-to-wechat

把"已经做好排版的 HTML 文章"投递到微信公众号生态及小红书等内容平台的工具集。

## 起因

HTML artifact 的排版/交互/视觉远强于裸 Markdown。但公众号编辑器对 HTML 有严格白名单，直接粘贴会丢样式。这个项目就是把"HTML 是源"的工作流跑通，针对不同发布形态分别做一套转换管线。

## 三种投递形态

| 模式 | 目标平台 | 不装 Skill 能用吗 | 设计文档 |
|---|---|---|---|
| 1. HTML → 公众号兼容富文本 | 公众号长图文 | ✅ 完全可用 | [docs/01-html-to-wechat-html.md](docs/01-html-to-wechat-html.md) |
| 2. HTML → 图文号/小红书图集 | 小红书、公众号图文号 | ⚠️ 自带图可用，自动生成需 Skill | [docs/02-html-to-images.md](docs/02-html-to-images.md) |
| 3. HTML → 口播稿 Markdown | AI 视频生成软件 | ❌ Skill 流程终点 | [docs/03-html-to-script.md](docs/03-html-to-script.md) |

三种模式共享同一个输入（标准 HTML 文件），但产出形态完全不同。

## 项目形态

这是一个 **Skill 包 + 公开静态前端** 的组合项目：

- **静态前端**部署在 GitHub Pages，三个独立 HTML 入口，纯浏览器运行（juice、DOM 转换、Clipboard API 全部在前端）
- **Skill 包**给 Claude / Codex 等 agent 安装，把"HTML → 改造 → 跳转交付页"的流程自动化

两条路径互不强耦合：模式 1 的页面可以脱离 Skill 独立用；模式 2、3 需要 LLM/生图/TTS 参与，必须由 Skill 驱动，最后产物在前端做交付。

## 用户的两种使用情况

**情况 A：不装 Skill，纯访问网页**
- 模式 1 完全可用：粘贴 HTML → 复制富文本 → 粘到公众号后台
- 模式 2 部分可用：自带图，用页面做小红书/图文号排版预览和打包下载
- 模式 3 基本不可用（页面只能预览/下载已有 markdown）

**情况 B：在 agent 里装了 Skill**
- 三种模式全部可用：agent 在本地跑转换/生成，跑完后跳转到对应静态页面，由用户完成最后一步交付（粘贴 / 下载 / 上传）

## 仓库结构

```
html-to-wechat/
├── README.md                       # 本文件
├── docs/                           # 各模式设计文档
│   ├── 01-html-to-wechat-html.md
│   ├── 02-html-to-images.md
│   └── 03-html-to-script.md
├── web/                            # GitHub Pages 静态前端
│   ├── index.html                  # landing：三个入口
│   ├── richtext/                   # 模式 1 页面
│   ├── images/                     # 模式 2 页面
│   └── script/                     # 模式 3 页面
└── skill/                          # Skill 包，可独立安装
    ├── SKILL.md
    └── modes/
        ├── 01-richtext/scripts/
        ├── 02-images/scripts/
        └── 03-script/scripts/
```

## 部署

GitHub Pages 从 `main` 分支 `/web` 子目录发布。HTTPS 自动开启，Clipboard API 直接可用。无后端、无密钥，任何需要 API key 的能力（生图、TTS、LLM 改写）都放在 Skill 端。

## 当前测试输入

`../context-tower-article/03-report.html`

特征：1734 行单文件，~940 行 `<style>`，~183 行 `<script>`（5 个交互功能），1 个内嵌 SVG 头图。这是模式 1 的第一个目标用例。

## 实现路径

按"流量入口先做"的顺序：

1. **页面 1（模式 1 静态前端）** — 流量入口，技术验证。juice + DOM 静态化 + Clipboard API 跑通就证明整条架构可行
2. **Skill 骨架** — 让自己的 agents 能调模式 1（agent 跑完把 HTML 放 URL fragment 跳转页面 1）
3. **模式 3 + 页面 3** — 最简单的端到端 Skill 流程，先拿成就感
4. **模式 2 + 页面 2** — 最复杂，文字卡片渲染 + 可选 AI 插画 + 小红书风格预览
