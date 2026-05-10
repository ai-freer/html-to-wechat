# 模式 1：HTML → 公众号兼容富文本

> 目标：把一份带 `<style>`/`<script>`/SVG 的 standalone HTML 文件，转换成可直接粘贴到公众号后台编辑器、且样式不丢的富文本。

## 1. 输入与输出

**输入**：standalone HTML 文件（`<style>` 嵌入、`<script>` 嵌入、SVG 内联或外链均可）。

**最终交付物**：浏览器剪贴板里的 `text/html` blob，到公众号后台编辑器 Cmd+V 即可。

**中间产物**（用于调试和归档）：
- `*.inlined.html` —— CSS 全部内联后的 HTML
- `*.wechat.html` —— 静态化、清理 script、图片替换素材库链接后的最终版

## 2. 公众号 HTML/CSS 白名单（关键约束）

参考：[微信公众号 HTML/CSS 支持情况解析](https://www.axtonliu.ai/newsletters/ai-2/posts/wechat-article-html-css-support)

### 标签层

| 类别 | 状态 |
|---|---|
| `<p>` `<h1>`-`<h6>` `<strong>` `<em>` `<u>` `<br>` `<ul>` `<ol>` `<li>` `<a>` `<img>` | 保留 |
| `<table>` `<tr>` `<td>` `<thead>` `<tbody>` | 保留 |
| `<style>` `<script>` `<iframe>` `<form>` `<input>` `<link>` | **过滤** |
| 所有元素的 `id` 属性 | **删除** |
| `<svg>`（内联） | 保留，但内含的 `<image href>` 必须用素材库链接 |

### CSS 层（**只认 inline `style` 属性**）

| 属性类别 | 支持 |
|---|---|
| 文本：`font-size` `color` `font-weight` `line-height` `letter-spacing` `text-align` | 完全支持 |
| 盒模型：`margin` `padding` `border-*` `border-radius` `box-shadow` | 完全支持 |
| 背景：`background-color` | 支持；`linear-gradient` 在部分设备不稳定，建议纯色兜底 |
| 显示：`display: block / inline-block` | 支持 |
| 显示：Flex / Grid | **基本不支持**，需用传统盒模型重写 |
| 定位：`position` | **过滤** |
| 响应式：`@media` `@keyframes` `:hover` | **过滤** |
| 字体：自定义字体 / `@font-face` | **不可用**，仅系统字体 |
| 单位：`%` 不稳定 | 用 `px` / `vw` / `vh` 替代 |

### 图片

- 外链图片（包括公开 CDN）会被替换或屏蔽
- Base64 内嵌图片不显示
- **只有上传到公众号素材库换得的链接才能显示**
- SVG 里的 `<image href>` 同样受此约束

## 3. 核心管线

```
input.html
   │
   ├─ ① CSS 内联（juice）
   │     <style> 规则展开到每个元素的 style="..." 上
   │     输出：*.inlined.html
   │
   ├─ ② <script> 移除 + 交互静态化
   │     删除全部 <script>
   │     折叠/tab/隐藏元素 → 默认全部展开
   │     输出：*.flat.html
   │
   ├─ ③ 不兼容 CSS 重写
   │     Flex/Grid → table 或 inline-block
   │     position → 删除
   │     %  → px
   │     gradient → 纯色兜底
   │
   ├─ ④ 图片素材库化
   │     抽取所有 <img src> 和 <svg><image href>
   │     提示用户上传到公众号素材库
   │     拿回链接后回填
   │
   └─ ⑤ 剪贴板富文本投递
         GitHub Pages 上的静态交付页（/web/，根路径就是模式 1 的工具）
         payload 通过 URL fragment（#payload=base64...）传入
         按钮 onclick → navigator.clipboard.write({text/html, text/plain})
         浏览器打开链接 → 点按钮 → 公众号后台 Cmd+V
```

**两种入口共享同一个页面**：
- **不装 Skill**：用户直接访问页面，把 HTML 粘贴进左侧文本框，浏览器内跑 juice + DOM 处理，右侧出预览
- **装了 Skill**：agent 在本地跑完前 4 步，把最终 HTML 编进 URL fragment，给用户一个一键链接

## 4. 关键工具与机制

### 4.1 juice：CSS 内联

[Automattic/juice](https://github.com/Automattic/juice) 是事实标准，原本服务于邮件模板生态，规则成熟。

```bash
npx juice input.html output.inlined.html
```

或编程方式：

```js
import juice from 'juice';
const inlined = juice(html, {
  removeStyleTags: true,         // 内联后删 <style>
  preserveImportant: true,       // 保留 !important
  applyAttributesTableElements: true,
});
```

注意：juice 默认不处理伪类（`:hover` 等），公众号本来也不支持，正好对齐。

### 4.2 剪贴板富文本写入

**核心问题**：直接复制 .html 文件，浏览器把它当 `text/plain`，公众号编辑器收到字符串，会显示成 HTML 源码。

**解法**：在浏览器里通过 Clipboard API 显式写入 `text/html` MIME：

```js
const html = document.getElementById('payload').innerHTML;
const blob = new Blob([html], { type: 'text/html' });
const plainBlob = new Blob([html.replace(/<[^>]+>/g, '')], { type: 'text/plain' });
await navigator.clipboard.write([
  new ClipboardItem({
    'text/html': blob,
    'text/plain': plainBlob,
  })
]);
```

公众号编辑器优先读 `text/html`，渲染成富文本。

参考实现思路：[公众号图文编辑器开发必备技能：样式内联化和富文本粘贴](https://juejin.cn/post/7368777511953809434)

### 4.3 交互静态化

公众号没有 JS。所有 `<script>` 必删。但被 JS 控制的视觉状态需要"展平"成默认可见态：

| 原交互 | 静态化策略 |
|---|---|
| 折叠/展开 | 全部展开，删除"展开"按钮 |
| Tab 切换 | 所有 tab 内容顺序排列，加小标题分隔 |
| 复制按钮 | 删除按钮 |
| Modal / 弹窗 | 内容内联到正文流 |
| 进度条 / 动画 | 截图替换或删除 |

实现层面：在管线第 ② 步用类似 cheerio / linkedom 解析 DOM，按 class/id 选择器移除特定元素 + 修改 `display:none` 为 `display:block`。

### 4.4 图片素材库化

**痛点**：公众号要求图片必须托管在自己的素材库，没有自动化 API（开放平台的 API 受限严格）。

**实务方案**：管线产出一份 `assets-checklist.md`，列出所有需要手动上传的图片及其在 HTML 中的位置。用户在公众号后台上传后，把素材库链接逐条回填。可以脚本化为交互式 CLI：

```
[1/3] 请上传 ./assets/cover.png 到公众号后台并粘贴链接：
> https://mmbiz.qpic.cn/mmbiz_png/...
```

回填后产出最终 `*.wechat.html`。

**SVG 头图特殊处理**：如果 SVG 内部全部是矢量绘制（无 `<image href>`），可保留原样直接内联——公众号支持纯矢量 SVG。如果 SVG 含 `<image>`，建议整张 SVG → PNG 后走素材库。

## 5. 已知坑（开工前必读）

1. **复制按钮所在页必须是 `https://` 或 `localhost`**：Clipboard API 在非安全上下文下不可用。
2. **跨浏览器**：Chromium 系（Chrome/Edge/Brave）对 `ClipboardItem` 支持最完整，Firefox 部分版本受限。优先用 Chromium。
3. **公众号编辑器粘贴时偶发"剥层"**：包裹太多 `<div>` 嵌套层时，编辑器会把外层 div 拉平。设计粘贴 HTML 结构时尽量浅。
4. **代码块**：公众号原生不支持代码高亮，要么靠 inline 样式手画（mdnice/juejin 主题就是这么干的），要么截图。
5. **表格宽度**：公众号正文宽度约 375-414px（移动优先），桌面 HTML 的宽表格会溢出。需要在管线里加 `max-width: 100%; overflow-x: auto;` 或重排为纵向卡片。
6. **暗色模式**：公众号读者可能开启暗色阅读，纯白背景配深色字会被反转。设计时避免硬编码 `background: white`，用语义色或留空。

## 6. 实现路径建议

按"流量入口先做"的顺序，先把 GitHub Pages 上的纯前端跑通，Skill 是后续的自动化层。

```
v0.1 静态前端最小可粘贴：
  /web/index.html  ← 模式 1 即根页面，顶栏是三模式切换
    左侧：粘贴/上传 HTML
    中间：浏览器内跑 juice（juice/client 浏览器构建）+ 简单 DOM 清理
    右侧：实时预览
    底部：「复制为富文本」按钮 → Clipboard API
  部署到 GitHub Pages，验证整条路径可行

v0.2 前端加 DOM 静态化与图片清单：
  集成 DOMParser / linkedom，按选择器规则展平交互
  扫描 <img> / <svg><image>，输出图片清单
  支持「粘贴素材库链接回填」交互

v0.3 Skill 包接入：
  /skill/modes/01-richtext/scripts/
    本地脚本跑完 juice + DOM + 抽图，把最终 HTML 编进 URL fragment
    跳转到 https://<user>.github.io/html-to-wechat/#payload=...
    用户开链接 → 复制 → 粘到公众号

v0.4 体验打磨：
  - URL fragment 容量超限时降级方案（localStorage 跨页 / 本地一次性服务）
  - 多版本对比（原始 HTML / 最终 HTML）
  - 移动端预览模式（公众号正文 ~375px）
```

## 7. 已识别的开源参考

实现时先读这几个，不要重复造：

- [doocs/md](https://github.com/doocs/md) —— Markdown → 公众号编辑器，已有完整剪贴板写入逻辑可借鉴
- [ufologist/wechat-mp-article](https://github.com/ufologist/wechat-mp-article) —— 公众号图文排版工具
- [mengjian-github/lark-to-markdown](https://github.com/mengjian-github/lark-to-markdown) —— 飞书 → 公众号，含富文本 → 公众号样式映射
- [Automattic/juice](https://github.com/Automattic/juice) —— CSS 内联底层

doocs/md 是这个领域最成熟的开源实现，Markdown 路线吃透了，但**它的输入是 Markdown**——我们要做的是把"已经成型的 HTML"作为输入，相当于跳过它的 markdown→html 渲染层，直接接入它的"html→公众号"投递层。这部分代码可能可以摘出来复用。

## 8. 不在范围内（明确划界）

- 自动上传素材库（公众号开放平台 API 限制严，且需要认证主体）
- 公众号自动发布（同上）
- 交互的 JS 等价模拟（公众号根本没有 JS 运行时）
- 多平台同步（这是 X / 飞书的事，不在本模式）
- 后端服务（整个项目坚持零后端，需要 API key 的能力一律放 Skill 端）
