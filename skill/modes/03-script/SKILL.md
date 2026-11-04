---
name: html-to-wechat-script
description: "从 HTML 提取结构化 Markdown，交给 Agent 改写为口播稿；提供预览、统计、逐句换行和 md/txt 下载。CLI 提取不是成品改写。"
metadata:
  version: "0.2.2"
---

# HTML → 口播稿

## 工作流程

1. 用脚本提取，输出命名为 `extracted.md`。多 article 自动保留完整 main/body 并警告，不再只选最长 article。
2. Agent 阅读提取稿和原文；有图表、SVG、卡片对比时看原始截图，补述图中关键结论。表格占位必须处理，不把占位符或代码直接当旁白交付。
3. 由当前宿主模型直接做口语化改写：短句、一句一行、每段一个意思；解释首次出现的术语，保留数字含义，不擅自删掉整节。标题/链接仅在适合口述时保留。
4. 输出 `spoken.md`，用 `##` 分镜头；可加 `<!-- scene: 画面提示 -->`、`## 标题 (12s)` 时长提示。手工时长与按 250 字/分钟的估时分开，不承诺真实 TTS 时长。
5. 对照原文核对章节、数字、结论；将成品 UTF-8 base64 编为网页 `#payload=...`，或由用户粘贴/上传 .md。网页不调用改写模型、不直接接收 HTML 做转换。
6. 网页预览会清除事件、危险 URL 和活动标签；复制/TXT 保留换行。生成的 Markdown 依然按外部内容对待，不能把预览清理当作可执行任意附件的授权。

## 仓库内调用

```bash
npm install --prefix skill/modes/03-script/scripts
node skill/modes/03-script/scripts/index.mjs --input report.html --output extracted.md
node skill/modes/03-script/scripts/index.mjs --input report.html --plan plan.json --dry-run
# 完成 Agent 改写后，将成品投递到指定的本地预览页
node skill/modes/03-script/scripts/make-fragment.mjs spoken.md http://127.0.0.1:8772/web/script/
```

`--plan` 接受 JSON 文件路径，不接受内联 JSON。字段为 `extractMain`、`bannedTags`、`keepImages`、`turndownOptions`。`extractMain:false` 保留整个 body；默认多 article 也不丢整章。复杂导航可用 bannedTags 或由 Agent 在提取后核对。

## 验证边界

本地脚本/预览回归不等于口语化质量验收，也不生成视频或音频。当前分析算法在网页和 Skill 各一份，通过内容一致性测试防止漂移。真实长报告的 Agent 改写质量与跨宿主安装另行验收。
