# HTML-to-WeChat（WorkBuddy / CodeBuddy 插件）

把 Agent 生成的 HTML 文章交付为公众号富文本、图集、口播稿或飞书文档。本目录是插件适配源；完整安装包由仓库根的 `.codebuddy-plugin/marketplace.json` 声明，构建产物在 `plugins/release/workbuddy/`。

## 安装

在 WorkBuddy 对话或 CodeBuddy Code 的 `/plugin` 界面添加市场后安装：

```text
/plugin marketplace add ai-freer/html-to-wechat
/plugin install html-to-wechat@ai-freer
```

安装后新开一个会话（或在插件面板切换启用状态）让技能生效；`/reload-plugins` 是 CodeBuddy Code CLI 命令，WorkBuddy 桌面端未注册。

本地开发时可把第一条换成仓库的绝对路径。安装、版本化缓存与依赖边界见仓库 `docs/workbuddy-plugin-install.md`。

## 使用与边界

给 Agent 一个 HTML 文件并说明目标，例如「把这篇 HTML 转成公众号富文本」。唯一入口 `skills/html-to-wechat/SKILL.md` 会按请求路由到四个 `modes/*/MODE.md`。转换在本地运行；生图、上传和飞书云端写入需要单独授权，插件不含凭据、生图服务或后台进程。

需要 Node.js 20.19+。首次使用按**当前加载的插件副本**内 `skills/html-to-wechat/SKILL.md` 与 `scripts/setup.mjs` 从锁文件安装依赖；截图测宽另需可选浏览器模块和已有浏览器。

MIT；随包 JSZip 保留其自身许可证。源码：https://github.com/ai-freer/html-to-wechat
