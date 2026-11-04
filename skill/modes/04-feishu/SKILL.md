---
name: html-to-feishu
description: "将 HTML 转为飞书原生 DocxXML，保留协作正文；也可显式导出 HTML 内容块。先本地导出/CLI dry-run，授权后创建，再回读与视觉核对。使用当前 lark-doc 能力和 CLI v2，非旧版 mode/markdown 定位接口。"
metadata:
  version: "0.2.0"
  requires:
    bins: []
    skills: []
  cliHelp: "node scripts/index.mjs --help"
---

# HTML → 飞书文档

## 先确定目标

默认 `native`：文字、标题、列表、表格、grid/callout、显式画板 plan → 原生块，适合协作编辑。

仅用户明确选择展示网页时用 `html-block`：完整单文件 HTML 放入 HTML 内容块，保留网页表达的机会更大，但正文不因此变成原生可协作文字。500KB 上限、auto/viewport 高度、交互与移动端需要单独验收；不自动把原生转换失败改为整篇 HTML。

## 本地任务先走这条路径

本文件所在目录是模式根，scripts/ 相对这里；输入、plan、产物相对用户工作目录。纯本地导出无需 lark-cli、账号、登录或 lark-doc Skill。不要因本地任务先读云端更新接口或遍历依赖目录。

```bash
# h2w_mode 设为本文件所在目录；不改变用户工作目录
node "$h2w_mode/scripts/index.mjs" --input report.html \
  --plan output/feishu-plan.json --export-only --no-measure \
  --output-xml output/feishu.xml > output/feishu.stdout.log 2> output/feishu.log
```

无图片或不要求浏览器测宽时使用 --no-measure。标准 HTML 可以省略 --plan；复杂版式先看源码和必要截图再保存 plan。最小注释示例（选择器必须匹配实际原文）：

```json
{
  "boundaryAnnotations": {
    ".toolbar": { "type": "drop" },
    ".notice": { "type": "callout", "emoji": "💡", "backgroundColor": "light-yellow" }
  }
}
```

原生转换会递归普通容器，不因 CSS display:none 自动丢正文；但仍需核对正文和表格完整性。这里的 drop 与公众号的 remove 是不同 schema，不混用。先执行并读简短日志；遇到具体错误再定点查看实现。XML 与旁边 .assets 资源目录一起交付，不把本地 XML 当作云端文档已创建。

## 何时读取更多说明

- 只有用户要求 CLI dry-run 或已授权云端创建/更新，才读 `references/cloud-workflow.md`。本地导出任务不要把 CLI parse、账号检查、keychain 或云端接口审查作为前置；XML 的本地语法和内容可用本包已安装的解析器核对。
- 需要未覆盖的转换字段才查 `scripts/default-plan.mjs` 对应部分，执行后出现明确差异才查转换实现；不用先穷尽所有默认规则。
- 方案与边界见 `../../../docs/04-html-to-feishu.md`，复杂 SVG 需要决定补述/截图/画板，不能静默丢弃后声称完整。截图不可用时记录视觉未验证；源码足够确定正文和目标块结构时仍可先完成本地转换，不反复尝试其他渲染工具。

XML 与同目录 `<文件名>.assets/` 一起保留。调用成功不等于内容完整，更不等于飞书云端与手机已验收。
