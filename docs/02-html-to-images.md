# 模式 2：HTML → 图文号 / 小红书图集

> 目标：把一篇长 HTML 文章转换成"上图下文"的图集格式（小红书、公众号图文号），其中"图"以**文字卡片为主、AI 插画为辅**，文字部分是精炼摘要 + hashtags。

## 1. 输入与输出

**输入**：standalone HTML 文章（同模式 1）。

**最终交付物**：
- N 张图片（PNG / JPG），按发布顺序命名（`01.png` `02.png` ...）
- 一段精炼文案（标题 + 摘要 + hashtags），保存为 `caption.txt`

**目标平台特性**：
| 平台 | 图片数量 | 标题字数 | 正文字数 | 推荐尺寸 |
|---|---|---|---|---|
| 小红书 | 1-18 张 | ≤20 字 | ≤1000 字 | 3:4（1242×1656）或 1:1 |
| 公众号图文号 | 1-9 张 | 短标题 | 摘要 ≤140 字 | 3:4 |

## 2. "图"的三种路线（A / B / C）

| 路线 | 图的形态 | 适合内容 | 实现复杂度 |
|---|---|---|---|
| **A. 文字卡片 / Infographic** | HTML 模板渲染成图（标题大字、引用、列表、对比表） | 知识点、金句、结构化信息 | 低（HTML→PNG） |
| **B. AI 插画** | 文生图模型生成的视觉插图 | 概念隐喻、情绪表达、首图 | 高（API + prompt 设计） |
| **C. 混合** | 首图 AI 插画作钩子，正文卡片为文字 | 大多数文章 | 中 |

**本项目采用 A 为主、B 为辅的 C 路线**：
- 大部分卡片走 A：HTML 模板渲染，无需 API、无版权风险、可控性强
- 必要时点缀 B：首图、概念图，由 agent 判断是否需要并调用文生图 API（GPT Image v2 / 即梦 / Flux 等，由 Skill 配置）

## 3. 核心管线

```
input.html
   │
   ├─ ① 内容拆解（agent 直接做，不写脚本）
   │     LLM 读全文 → 决定切成 N 个卡片
   │     每个卡片确定：标题 / 类型（文字卡 / 插画）/ 核心内容
   │     输出：plan.json
   │       [
   │         {idx: 1, type: "illustration", role: "cover", prompt: "..."},
   │         {idx: 2, type: "text-card", template: "concept", title: "...", body: "..."},
   │         {idx: 3, type: "text-card", template: "comparison", ...},
   │         ...
   │       ]
   │
   ├─ ② 文字卡片渲染（脚本）
   │     按 plan 里的 type=text-card，套对应模板
   │     模板是 HTML + CSS，用 satori / puppeteer 转 PNG
   │     输出：02.png 03.png ...
   │
   ├─ ③ AI 插画生成（脚本，可选）
   │     按 plan 里的 type=illustration，调文生图 API
   │     prompt 由 agent 在 ① 步生成
   │     输出：01.png（首图）等
   │
   ├─ ④ 文案生成（agent 直接做）
   │     LLM 基于全文写：
   │       - 钩子标题（≤20 字）
   │       - 摘要正文（≤500 字，分段）
   │       - hashtags（5-10 个）
   │     输出：caption.txt
   │
   └─ ⑤ 前端预览与下载
         GitHub Pages /web/images/ 页
         agent 把图集打包指引（或直接拖入文件夹）让用户在前端查看
         小红书 / 图文号视角切换预览
         单张下载 / 打包 zip / 复制文案
```

## 4. 关键工具与机制

### 4.1 文字卡片模板系统

预置一组 HTML 模板，每个对应一种内容类型：

| 模板 ID | 用途 | 视觉特征 |
|---|---|---|
| `cover` | 首图 | 大标题 + 副标题 + 装饰元素 |
| `concept` | 单概念解释 | 标题 + 一段说明 + 关键词高亮 |
| `comparison` | 对比/before-after | 左右两栏 |
| `list` | 要点清单 | 编号 + 短句列表 |
| `quote` | 金句 | 引号 + 大字段落 + 出处 |
| `data` | 数据/数字 | 大数字 + 单位 + 上下文 |
| `closing` | 结尾/CTA | 总结 + 标签 + "关注/点赞" 引导 |

模板是纯 HTML+CSS，渲染走两条技术路线选其一：

**方案 1：satori（推荐）**
- Vercel 出品，HTML/JSX → SVG → PNG
- 不需要 headless browser，纯 JS，速度快
- 只支持 flex 布局子集，但对卡片设计够用
- 字体需要显式加载（中文字体推荐思源黑体）

**方案 2：puppeteer**
- 完整 Chrome 渲染，CSS 全支持
- 重，启动慢，但灵活度高
- 适合需要复杂效果（渐变、阴影、特殊字体）的卡片

建议先用 satori，遇到表达力不够再升级到 puppeteer。

### 4.2 AI 插画 prompt 规范

当 agent 决定某张图走插画路线时（首图、概念隐喻、情绪表达），需要生成结构化 prompt。约定的 prompt 模板：

```
{风格描述}, {主体内容}, {构图}, {色调}, {纸张/背景}, {细节限制}

例：
"minimalist line illustration, a tower made of stacked context cards
floating in soft mist, isometric view, monochrome with single accent
color (warm orange), clean white background, no text, vector style"
```

API 选择由 Skill 端配置，跨模型用 abstraction：

```
skill/modes/02-images/scripts/gen-image.mjs
  → 读取 ~/.html-to-wechat/config.json 里的 image_provider
  → 支持：openai (gpt-image-2), volcengine (即梦), replicate (flux), ...
  → 统一接口：genImage({prompt, size, output_path})
```

### 4.3 前端页面 `/web/images/`

无后端，纯静态。两种使用入口：

**入口 A：自带图（不需要 Skill）**
- 拖入本地图片文件夹（File API）
- 拖拽排序
- 编辑文案区
- 切换"小红书视角" / "图文号视角"预览
- 下载 zip / 复制文案

**入口 B：Skill 调用**
- agent 跑完后，把所有图片打包到本地 `output/` 目录
- 给用户一个 URL（含 caption 的 base64）
- 用户开链接，再把 `output/` 文件夹拖进页面，立即看到完整效果

技术栈：纯 HTML + 一点 JS（File API、Drag & Drop API、JSZip 打包），无框架。

## 5. 已知坑与设计取舍

1. **中文字体**：satori 需要显式提供字体 buffer。建议捆绑思源黑体 / 阿里巴巴普惠体 子集（仅常用字，控制体积）。
2. **小红书 vs 图文号尺寸不同**：小红书偏 3:4，图文号偏 1:1 或 4:3。模板要支持响应式或两套尺寸输出。
3. **首图权重 90%**：图集生态首图决定点击率。Skill 流程里首图必走插画路线（或精心设计的文字卡 + 配图），不能简单出文字。
4. **AI 插画的版权与一致性**：同一组卡片应风格一致。给 agent 的指令里要求"先定义全局视觉风格描述（一段固定 prompt 前缀），后续每张图复用"。
5. **文案不是文章摘要**：小红书文案是"钩子 + 价值 + 引导互动"的话术，不是论文摘要。LLM 改写时要给清晰的风格示例。
6. **hashtag 不是越多越好**：小红书算法对 hashtag 偏好平台头部标签。要求 LLM 至少包含 1-2 个泛领域大标签 + 几个细分标签。

## 6. Skill 与前端的边界

| 步骤 | 谁来做 | 在哪跑 |
|---|---|---|
| ① 内容拆解（plan.json） | LLM | agent 进程内 |
| ② 文字卡片渲染 | satori/puppeteer 脚本 | Skill 本地 Node |
| ③ AI 插画生成 | 文生图 API | Skill 本地 Node（API key 在 Skill 配置） |
| ④ 文案生成 | LLM | agent 进程内 |
| ⑤ 预览/下载 | 静态前端 | 浏览器（GitHub Pages） |

**关键约束**：前端零密钥、零后端。任何花钱、需要鉴权的事都在 Skill 端做完，前端只接收成品。

## 7. 实现路径

```
v0.1 文字卡片渲染骨架：
  /skill/modes/02-images/scripts/render-card.mjs
    输入：plan.json 中的一项 + 模板 ID
    输出：单张 PNG
  先做 cover / concept / list 三个模板

v0.2 前端 /web/images/ 静态页：
  支持拖入图片 + 排序 + 文案编辑 + 下载 zip
  这一步即使没有 Skill 也能用，先发布占位

v0.3 全套模板 + 端到端跑通：
  补齐 comparison / quote / data / closing
  Skill 串联：input.html → plan.json → 渲染 → 输出文件夹

v0.4 AI 插画接入（可选）：
  抽象 image_provider 接口，先接一个（GPT Image v2 或即梦）
  在 plan 里支持 type:illustration
  风格一致性约束写进 SKILL.md

v0.5 平台预览精细化：
  小红书视角 / 公众号图文号视角的视觉差异 mock
  字数/尺寸警告
```

## 8. 不在范围内

- 自动发布到小红书 / 公众号（两个平台都没有公开发图 API，且小红书反自动化严格）
- 视频化（属于模式 3 的衍生）
- 模板可视化编辑器（先用代码定义模板，编辑器是后期话题）
- 用户自定义 hashtag 库（先靠 LLM 即时生成）
