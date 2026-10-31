---
name: html-to-wechat-images
description: "Agent 看 HTML 和截图后拆卡、生图、核字，输出图集文案及预览链接。此包提供 payload 工具与网页交付，不内置生图接口；Codex/ChatGPT 使用宿主内置 GPT-Image 2，不自动采用其他 Agent 的第三方配置。"
metadata:
  version: "0.2.0-dev"
---

# HTML → AI 图集

图集继续使用 AI 生图，不改为代码绘卡。原文截图用于理解内容，不冒充最终 AI 卡片。已有批准的资产必须保留，不擅自重画。

## Agent contract

1. 读完整 HTML 并看截图，列出章节、关键论点与图表；不能只看前几屏就压缩长报告。
2. 按用户指定平台和数量拆卡，未指定时沿用项目 8–10 张的常用结构（封面、概览、分论、收尾）。先确定整组比例和目标尺寸，逐张核对输出尺寸；工具不能精确指定时，记录实际尺寸并说明。每卡确定文字、alt、完整 prompt；复用全局风格约束。
3. Codex/ChatGPT 用宿主内置生图工具 GPT-Image 2；其他宿主使用用户明确指定且当前可用的生图能力。不要从旧 Skill 自动导入 API key、第三方服务或模型参数，也不假设 `anthropic-skills:gpt-image` 存在。工具参数以当前工具 schema 为准。
4. 宿主支持参考图时，可用已批准的封面或样张作为后续卡片的风格参考，明确其只约束风格，保留每张卡的内容和构图；不得重画已有批准资产。逐卡保存必须出现的准确文字，逐字核对标题、正文、数字、单位和图表关系，检查清晰度、尺寸及整组风格，并实际展示生成结果。发现局部错误时，优先用原图局部修改，明确变更和保留范围，再复核整张；必要时重生。不能靠删关键内容救图；无法核准的内容明确标注，不视为通过。
5. 写 `captionText`、`captionTags`，制作 payload。本地验证使用已授权的本地图源；公网图片托管属于单独的上传/发布动作，须有对应授权。URL fragment 是编码，不是加密，不能装私有内容后公开分享。
6. `make-fragment.mjs` 校验 payload 并输出链接。网页支持拖排后保存顺序、复制文案/提示词、ZIP 下载；重生按钮只复制请求，不会自动调用生图。远程图片须能被浏览器 fetch（含 CORS）；任一图下载失败则不生成伪成功的不完整 ZIP。

```bash
node skill/modes/02-images/scripts/render-snapshot.mjs report.html /tmp/source.png
node skill/modes/02-images/scripts/make-fragment.mjs payload.json
# 本地验证可显式传第二参数：http://127.0.0.1:<port>/web/images/
```

payload：`{title, captionTitle?, captionText, captionTags: string[], images: [{src,alt,prompt?}]}`。alt 不带序号；src 支持 HTTP(S)，小型 PNG/JPEG/GIF/WebP data URL 仅用于测试，不把大图塞入分享 URL。CLI 不负责截图、生图、上传和发帖的自动编排。

## 当前边界

代码和本地交付工具已存在；实际 Agent 生图/核字、跨宿主安装及平台发帖仍须验收。不要使用不存在的 `/h2w-images` 命令作为安装承诺；给 Agent 普通自然语言请求即可。
