# samples/

本目录混合两类内容，**git 追踪规则不同**：

## ✅ 公开追踪（test infrastructure）

| 路径 | 说明 |
|---|---|
| `probe/*.docxxml` `probe/*.html` `probe/*.json` | Mode 4 各 v0.X 的探针 fixture — 手写的 DocxXML 测试样本（如 `03-callout-in-list-{A,B,C}.docxxml` 测嵌套规则、`05a-emoji-whitelist.docxxml` 测 33 个 emoji、`05c-snapshot-fallback.html` 测装饰块截图兜底）。无业务内容，是测试基础设施 |
| `bench-plan-v0.1-mode1-demo.json` `bench-plan-v0.2-demo.json` | Mode 1 / Mode 4 的 plan schema demo，agent 视觉理解产 plan 的范例 |
| `README.md` | 本文件 |

## 🚫 内部不追踪（content samples）

`samples/` 下的所有 `*.html` `*.png` `*.md` `*.json` 和子目录默认被 `.gitignore` 屏蔽。这些是开发驱动测试的真实输入文档：

它们覆盖多 article 压力测试、报告类页面的正文提取兜底、图集 demo、多 SVG 文档、大体积页面和图片管线等场景。这里不列具体文件名。

## 怎么放新样本

放任何 HTML / payload.json / 生成的 PNG 进 `samples/` 都会被 `.gitignore` 默认屏蔽。如果需要让某个新 fixture 变 public（合成测试无业务内容），加白名单到根 `.gitignore`：

```
!samples/<your-new-fixture-pattern>
```

不要把 PRD / 产品文档 / 内部报告 commit 上来。如已不慎 commit，单独问 Claude 处理（涉及历史重写）。
