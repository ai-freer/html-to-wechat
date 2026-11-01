# 模式 2：HTML → 图文号 / 小红书图集

本模式由 Agent 理解 HTML、拆分内容并使用宿主可用的生图能力制作图集；网页负责预览和整理已有结果。执行说明以 [图集 Skill](../skill/modes/02-images/SKILL.md) 为准。

## 输入与交付

输入为 HTML 文章。Agent 读取全文并结合截图理解视觉层次、图表和章节，再按用户指定的平台、张数及风格拆卡；未指定张数时可参考 8–10 张的常用结构。

交付通常包括逐卡图片、文案、标签和 payload；网页可接收 payload，供用户预览、拖排、复制文案或提示词、下载 ZIP。重做按钮只复制请求，不在网页内生图。最终发布由用户自行完成。

图集继续采用 AI 生图，不以代码绘卡替代。已有批准资产应保留，不擅自重画。用户自带的宿主、生图工具和授权方式各不相同，遵循用户选择和当前工具实际能力；Codex/ChatGPT 使用宿主内置生图工具，参数以当前工具为准。

## 制作流程

1. 阅读完整 HTML 和截图，记录章节、论点、数字和图表，避免遗漏长报告的后半部分。截图用于理解原文，不作为最终 AI 卡片。
2. 根据目标平台与用户要求确定整组比例、目标尺寸和张数。逐卡记录内容、必须准确呈现的文字、alt 和完整提示词；确定共用风格。
3. 生成并检查样张。工具支持参考图时，可用批准的样张约束后续图片的风格，明确参考图的作用，避免把其内容误带入新卡片。
4. 逐张核对文字、数字、单位、图表关系、可读性、实际尺寸及整组风格，并展示结果。局部错误优先编辑原图，说明要修改与保留的部分，再复核整图；必要时重生。不要删除关键内容来掩盖乱码。无法核准时明确说明。
5. 编写配套文案和标签，制作 payload。图片托管、公开分享和平台发布须取得对应授权。fragment 只是编码，不是加密，分享前检查其中的文案、提示词和图片地址。
6. 将成品图片与 payload 保存在本地成果目录，用安装包的 `preview-local.mjs` 启动仅本机可访问的预览，交付 URL 并检查图片加载、排序与下载。远程图片须能被浏览器 fetch，包括 CORS；任一图片下载失败时 ZIP 不应被当作完整交付。

文字密度根据内容和手机阅读效果决定，不把历史样例的单卡字数当作保证。准确文字应明确列出，逐字验收；如果画面放不下，调整卡片数量或布局，保留必要信息。

## 本地工具

```bash
node skill/modes/02-images/scripts/render-snapshot.mjs report.html /tmp/source.png
node skill/modes/02-images/scripts/preview-local.mjs output/session/payload.json
# payload 中的 src 为相对 payload.json 的本地图片路径；保持服务运行。
```

payload 结构为 `{title, captionTitle?, captionText, captionTags: string[], images: [{src, alt, prompt?}]}`。`alt` 不带序号；`src` 支持 HTTP(S)，小型 PNG/JPEG/GIF/WebP data URL 仅用于测试。完整图片不应塞进分享链接。示例见 [payload-example.json](../skill/modes/02-images/scripts/payload-example.json)。

网页有示例展示、空白 app 预览和 fragment 图集三种状态；本地服务只提供清单指定的图片；ZIP 使用安装包内的 JSZip，无需联网。另有 make-fragment.mjs 供经授权的远程图源使用，默认指向 GitHub Pages。公网可读不等于允许跨域下载，应实际验证。模型、工具和宿主能力差异可能影响参考图、尺寸控制和局部编辑，按实际结果报告。

## 当前验证边界

图集 payload 和网页交付已有本地兼容测试；当前宿主从真实生图、逐张核字到经授权托管与网页交付的完整链路，以及移动端排序和平台发帖，仍需实测。示例图片位于 `web/images/demo/`；历史素材和设计过程未作为公开交付的一部分。
