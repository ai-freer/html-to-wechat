# SVG 动效示范库

本目录是项目的能力示范与可复用代码参考。公众号制作与转换优先遵循 [实现规范与验收依据](../../docs/svg-wechat-guidelines.md)；“看起来正常”与“公众号保存后可用”分别记录。

[打开独立预览](index.html)。每张卡片可单独重播，点击型 SVG 可在预览中直接操作；`assets/` 的文件可单独打开和复制。预览页无需外部网络依赖，也不调用上游 Skill。

## 选用与验证状态

| 文件 | 用途 | 本地验证 | 公众号验证 |
| --- | --- | --- | --- |
| [editorial-data.svg](assets/editorial-data.svg) | 原创综合示范：柱状图与连线逐步展示 | Chrome 采样观察柱形和描线变化 | 未验证 |
| [editorial-workflow.svg](assets/editorial-workflow.svg) | 原创综合示范：终端逐字、检查反馈和流程模块 | Chrome 采样观察字符、光标和模块变化 | 未验证 |
| [auto-flow.svg](assets/auto-flow.svg) | 16 秒循环；模拟鼠标依次演示页面、选项和弹窗 | Chrome 模式 1 预览观察画面与指针变化 | F01 所在组合页：粘贴、保存重开、iOS 预览均通过（2026-11-01） |
| [click-color.svg](assets/click-color.svg) | 点击变色并保持 | Chrome 模式 1 单次点击 | 原 D01 所在组合页通过；当前视觉改版待复测 |
| [click-flash.svg](assets/click-flash.svg) | 点击闪动 | Chrome 模式 1 单次点击 | 原 D02 所在组合页通过；当前视觉改版待复测 |
| [click-delay.svg](assets/click-delay.svg) | 点击约一秒后变色 | Chrome 模式 1 单次点击 | 原 D06 所在组合页通过；当前视觉改版待复测 |
| [fade-in.svg](assets/fade-in.svg) | 标题淡入 | Chrome 不同时刻透明度变化 | 此组件未逐项验证 |
| [rise-in.svg](assets/rise-in.svg) | 文字淡入上移 | Chrome 不同时刻位移变化 | 此组件未逐项验证 |
| [typewriter.svg](assets/typewriter.svg) | 终端逐字及光标 | Chrome 字符与光标位置变化 | 此组件未逐项验证 |
| [click-draw.svg](assets/click-draw.svg) | 点击后连线生长 | Chrome 实际点击观察 | 此组件未逐项验证 |

公众号结论仅适用于对应探针、当次公众号环境与 iOS 微信；Android、独立素材的不同嵌入方式和修改后的版本未验证。自动流程中的鼠标不是交互输入。公众号多步选择、返回和弹窗建议先用自动演示；此前依赖焦点的多状态方案保存后 Mac 的 B 闪回、iOS 的 A/B 均无法进入。每篇文章仍需检查粘贴、保存重开及目标手机预览。

HTML Artifact 可直接把 SVG 源码内联到 HTML；含点击事件的示例也可用 `<object>` 嵌入，不应假定普通 `<img>` 能接收内部点击。需要真实输入、分支或多次返回时，按目标容器能力使用 HTML/CSS/JavaScript，并在目标设备测试。按需控制循环数量、复杂度及移动端性能。

## 来源与许可

- `fade-in.svg`、`rise-in.svg`、`typewriter.svg`、`click-draw.svg` 从 [JamieJustTang/wechat-animating](https://github.com/JamieJustTang/wechat-animating) 的 `example/zine.svg` 提取并适配，来源固定于提交 [`372f3b2df2429c1d438dc742910c41ea94b00407`](https://github.com/JamieJustTang/wechat-animating/tree/372f3b2df2429c1d438dc742910c41ea94b00407)。提取时按场景收紧画布、补底色；逐字组件移除外框延迟入场，部分变换补全 `attributeName="transform"`。这些调整不代表公众号兼容。
- 上述上游衍生文件采用 MIT 许可。复制或分发时保留 [上游许可证与版权声明](LICENSE.upstream)，包括用于复制 SVG 片段的情况。
- `editorial-workflow.svg` 和 `editorial-data.svg` 为本项目原创视觉小样，参考暖纸色、深色终端和信息分层的设计思路，未复制参考文章的内容或 SVG。
- `auto-flow.svg`、`click-color.svg`、`click-flash.svg`、`click-delay.svg` 取自本项目的 [公众号组合探针](../../samples/probe/wechat-compat/probe-auto-single.html)，对应 F01、D01、D02、D06；测试记录见[此处](../../samples/probe/wechat-compat/auto-single-test.md)。它们是本项目测试素材，并非上游原始示例。

预览目录中的上游作品只展示各个效果，不引入其 Skill 的编排或分镜流程。具体效果修改后的行为和许可引用仍由使用者按目标场景核对。


自动流程在预览页中内联，重播会重建节点并重置时间轴；维护时应与 `assets/auto-flow.svg` 保持一致。
