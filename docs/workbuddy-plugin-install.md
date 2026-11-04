# 在 WorkBuddy / CodeBuddy 中安装 HTML-to-WeChat 插件

本页说明仓库插件市场的安装方式。GitHub 命令只有在对应提交已推送到公开仓库后才能给其他人使用。插件包含公众号富文本、图集、口播稿和飞书本地导出四个工作流，不内置生图服务、浏览器或飞书凭据。

## 目录约定（与 Claude / Codex 不同）

| 文件 | 位置 | 作用 |
|---|---|---|
| 市场清单 | 仓库根 `.codebuddy-plugin/marketplace.json` | 声明市场 `ai-freer` 与插件条目，`source` 指向 `./plugins/release/workbuddy` |
| 插件清单 | `plugins/release/workbuddy/.workbuddy-plugin/plugin.json` | 插件名、版本、元数据 |
| 技能包 | `plugins/release/workbuddy/skills/html-to-wechat/` | 唯一入口 `SKILL.md`，四个工作流在 `modes/*/MODE.md` |

桌面端只扫描 `.codebuddy-plugin/marketplace.json` 和 `.claude-plugin/marketplace.json`，**不扫描** `.workbuddy-plugin/marketplace.json`；插件包内的清单目录则按顺序兼容 `.codebuddy-plugin/` → `.workbuddy-plugin/` → `.claude-plugin/`。因此市场清单必须放在 `.codebuddy-plugin/`，插件清单可以沿用 `.workbuddy-plugin/`。市场条目默认 `strict: true`，插件包内必须有 `plugin.json`，且 `source` 必须是相对仓库根、以 `./` 开头的路径。

## 安装

在 WorkBuddy 对话或 CodeBuddy Code 的 `/plugin` 界面执行。本地开发用目录绝对路径，公开分发用 GitHub 仓库：

```text
/plugin marketplace add /绝对路径/html-to-wechat
/plugin install html-to-wechat@ai-freer
/reload-plugins
```

推送到 GitHub 后：

```text
/plugin marketplace add ai-freer/html-to-wechat
/plugin install html-to-wechat@ai-freer
```

若本机有 `codebuddy` CLI，等价写法是 `codebuddy plugin marketplace add <路径或 owner/repo>` 与 `codebuddy plugin install html-to-wechat@ai-freer`。用 `/plugin marketplace list` 确认市场已添加，在 `/plugin` 的已安装标签页查看启用状态，并在新会话确认 Skill 被发现。

更新：`/plugin marketplace update ai-freer` 后 `/plugin update html-to-wechat@ai-freer`，必要时 `/reload-plugins`。版本号不变时已安装用户可能收不到更新，维护者改版见下文。

## 缓存与依赖

市场插件不会原地加载，而是复制到版本化缓存（WorkBuddy 桌面端）：

```text
~/.workbuddy/plugins/cache/ai-freer/html-to-wechat/<version>/
```

CodeBuddy Code 使用 `~/.codebuddy/plugins/cache/...`。构建产物不包含 `node_modules`：首次使用时按**当前实际加载的缓存副本**内 `skills/html-to-wechat/SKILL.md` 的说明，运行该副本的 `scripts/setup.mjs` 从锁文件安装依赖；不要只在仓库或 `plugins/release/` 里安装后假设缓存副本也有依赖。插件升级会换缓存目录，依赖通常需要重新准备；宿主若提供 `${CODEBUDDY_PLUGIN_DATA}` / `${CLAUDE_PLUGIN_DATA}` 持久化数据目录，可用它存放依赖以避免每次升级重装，但这需要相应脚本改造，当前包尚未实现。依赖安装需要网络或可用的 npm 缓存；缓存不可写或安装失败时如实报告，不称插件开箱即用。

截图或测宽另需可选浏览器模块和已有浏览器；飞书本地 XML 不需要登录，云端创建另需 CLI、账号及单独授权。

用合成 HTML 验证公众号转换、图集 payload、口播提取和飞书本地 XML；这不等于真实生图、飞书云端写入、公众号保存或手机验收。用户未授权时不执行上传、发布、生图或云端写入。**本机尚未完成桌面端真实安装与端到端对话验收**，以上为按桌面端实际加载规则对齐后的安装路径。

## 维护发布包

`plugins/workbuddy/` 是清单与包内说明的源码，`plugins/release/workbuddy/` 是提交到仓库供市场安装的完整构建产物，`skill/` 与共享转换实现是能力开发源。

版本必须一致：`skill/` 的 `metadata.version`、`.codebuddy-plugin/marketplace.json` 条目的 `version`、`plugins/workbuddy/.workbuddy-plugin/plugin.json` 的 `version`，以及构建出的 `.skill-package.json`。刷新或检查产物：

```bash
node plugins/release.mjs
node plugins/release.mjs --check
node plugins/test.mjs
```

`--check` 核对三个客户端清单版本与总包一致，`test.mjs` 核对市场条目的 `source`、名称、版本和技能包哈希。更新源码后重新生成并审阅 `plugins/release/workbuddy/`；不把 `node_modules`、凭据、真实输入或私有样本放进发布包。市场添加成功不等于依赖或业务验收通过。
