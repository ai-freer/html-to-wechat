# 在 Codex 中安装 HTML-to-WeChat 插件

本页说明仓库插件市场的安装方式。以下 GitHub 命令只有在对应提交已经推送到公开仓库后才能给其他人使用。插件包含公众号富文本、图集、口播稿和飞书本地导出四个工作流。它不包含生图服务、浏览器或飞书凭据。

## 安装

在支持插件市场的 Codex CLI 中运行：

```bash
codex plugin marketplace add ai-freer/html-to-wechat
codex plugin add html-to-wechat@html-to-wechat
```

或将仓库地址与此页交给 Codex，请它根据当前宿主支持的插件市场流程安装。不要覆盖已有市场和同名插件；安装后用 `codex plugin list --marketplace html-to-wechat --json` 检查启用状态，在新会话确认 Skill 被发现。不同版本的桌面界面可能需要刷新或重启。

插件要求 Node.js 20.19+ 和 npm。安装的插件副本**不包含 node_modules**：首次使用时，按该副本内 `skills/html-to-wechat/SKILL.md` 的说明准备锁定依赖。安装器可能把包复制到缓存，必须对实际加载的副本执行其 `scripts/setup.mjs`，不要以为仓库里的依赖会自动进入缓存。依赖安装需要网络或可用的 npm 缓存；没有写入权限或安装失败时如实报告，不称为可用。插件升级、刷新或清理缓存后可能需要重新准备。截图或测宽另需可选浏览器模块和现有浏览器；飞书本地 XML 不需要登录，云端创建另需 CLI、账号及授权。

用合成 HTML 验证公众号转换、图集 payload、口播提取和飞书本地 XML；这不等于真实生图、飞书云端写入、公众号保存或手机验收。用户未授权时不执行上传、发布、生图或云端写入。

## 维护发布包

`plugins/codex/plugin.json` 是 Codex 清单源；`plugins/release/codex/` 是提交到仓库供市场安装的完整构建产物。`skill/` 和共享转换实现仍是能力的开发源。刷新或检查产物：

```bash
node plugins/release.mjs
node plugins/release.mjs --check
```

维护者在更新源代码后应重新生成并审阅 `plugins/release/codex/`；不将 `node_modules`、凭据、真实输入或私有样本放入发布包。请在干净环境分别验证安装、Skill 发现和四条本地执行路径。市场添加成功不等于依赖或业务验收通过。
