---
name: html-to-wechat-richtext
description: "将 HTML 转为公众号兼容富文本；复杂页面先检查正文和视觉状态，生成显式 plan，再调用现有转换器。输出本地 HTML/纯文本，不发布。"
metadata:
  version: "0.2.0"
  requires:
    bins: []
    skills: []
  cliHelp: "node scripts/index.mjs --help"
---

# HTML → 公众号富文本

本文件所在目录是模式根，`scripts/` 相对模式根，不相对用户工作目录。总包中位于 `modes/01-richtext/`，独立包中就是包根。用绝对模式路径调用，输入/输出留在用户工作目录。依赖已安装就直接用，不先 npm install 或遍历源码。

## 从输入到产物

1. 读原 HTML，核对章节、表格、隐藏面板与图形；复杂视觉结合必要截图。脚本默认规则不等于已理解所有视觉状态。
2. 标准页面可使用默认 plan；需要展开/删界面/调整结构时先保存显式 plan JSON。
3. 含 SVG、动画或互动时，先读模式根的 `references/svg-wechat.md`，按其边界检查输入与预期；转换器不会自动理解或修复业务交互。
4. 调用现有 CLI，核对正文、隐藏状态、图形与警告；只有具体失败或未知字段才查对应实现。

```bash
# h2w_mode 设为本文件所在目录；从用户工作目录执行
node "$h2w_mode/scripts/index.mjs" --input report.html \
  --plan output/wechat-plan.json --output output/wechat.html \
  --output-text output/wechat.txt --no-measure \
  > output/wechat-stdout.html 2> output/wechat.log
```

不需要 plan 时省略 --plan；无图片或不需精确图片测宽时可用 --no-measure，否则去掉并准备浏览器。CLI 即使指定 --output 仍将 HTML 写到 stdout，长文应重定向。`--dry-run` 只看转换统计、不落盘。`--help` 可查看真实参数，`--input` 是文件路径，不支持 --url。

## 常用 plan（有效 JSON）

下例仅说明字段；选择器必须来自实际输入，不应直接套用到每篇文章：

```json
{
  "directives": [
    { "selector": ".toolbar", "action": "remove" },
    { "selector": ".tab-panel", "action": "unwrap" }
  ]
}
```

`remove` 删除节点及后代，仅用于确认不要的界面；`unwrap` 去掉容器、保留全部子节点，可解除容器上的隐藏样式，但也失去该容器样式，需要核对。没有 `drop` / `preserve` 动作；无需修改的节点不写指令。隐藏状态有其他来源时不能仅靠 unwrap 宣称解决。

`extractMain` 控制正文抽取；多列/表格等默认规则见 `scripts/default-plan.mjs`，只在需要覆盖时查对应字段。其他节点动作在 `scripts/transform.mjs` 的 `applyDirective`，有实际需求再查，不先读整条转换管线。

## 截图与限制

截图：`node "$h2w_mode/scripts/render-snapshot.mjs" report.html output/source.png [selector]`。需要该模式的可选 Puppeteer 与现有浏览器，可用 `PUPPETEER_EXECUTABLE_PATH` 显式指定；缺依赖须说明，不能空成功。截图和临时分析也写在工作目录。

CSS 内联、布局转表格、details 展开等均由既有转换器完成。图片仍可能需要在公众号替换为素材库资源；SVG/动画的本地诊断不能代替公众号粘贴、保存重开和手机验收。保留已有 SVG/MG 规则，不因局部探针通过就声称所有交互受支持。
