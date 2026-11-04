# 在 WorkBuddy / CodeBuddy 中安装 HTML-to-WeChat 插件

本页说明仓库插件市场的安装方式。`ai-freer/html-to-wechat` 已推送为公开仓库，**推荐用 GitHub 市场源安装**，以便跨设备分发和跟踪云端更新；本地目录源仅用于改插件结构时自测。插件包含公众号富文本、图集、口播稿和飞书本地导出四个工作流，不内置生图服务、浏览器或飞书凭据。

## 目录约定（与 Claude / Codex 不同）

| 文件 | 位置 | 作用 |
|---|---|---|
| 市场清单 | 仓库根 `.codebuddy-plugin/marketplace.json` | 声明市场 `ai-freer` 与插件条目，`source` 指向 `./plugins/release/workbuddy` |
| 插件清单 | `plugins/release/workbuddy/.workbuddy-plugin/plugin.json` | 插件名、版本、元数据 |
| 技能包 | `plugins/release/workbuddy/skills/html-to-wechat/` | 唯一入口 `SKILL.md`，四个工作流在 `modes/*/MODE.md` |

桌面端只扫描 `.codebuddy-plugin/marketplace.json` 和 `.claude-plugin/marketplace.json`，**不扫描** `.workbuddy-plugin/marketplace.json`；插件包内的清单目录则按顺序兼容 `.codebuddy-plugin/` → `.workbuddy-plugin/` → `.claude-plugin/`。因此市场清单必须放在 `.codebuddy-plugin/`，插件清单可以沿用 `.workbuddy-plugin/`。市场条目默认 `strict: true`，插件包内必须有 `plugin.json`，且 `source` 必须是相对仓库根、以 `./` 开头的路径。

## 安装

在 WorkBuddy 对话或 CodeBuddy Code 的 `/plugin` 界面执行。标准安装走 GitHub：

```text
/plugin marketplace add ai-freer/html-to-wechat
/plugin install html-to-wechat@ai-freer
/reload-plugins
```

只有在本机改插件结构、还没推送时才用目录绝对路径（这种源依赖本机路径，换机即失效，且不跟踪云端提交）：

```text
/plugin marketplace add /绝对路径/html-to-wechat
/plugin install html-to-wechat@ai-freer
```

若本机有 `codebuddy` CLI，等价写法是 `codebuddy plugin marketplace add <owner/repo 或路径>` 与 `codebuddy plugin install html-to-wechat@ai-freer --scope user`。用 `/plugin marketplace list` 确认市场类型为 `github`，在 `/plugin` 的已安装标签页查看启用状态，并在新会话确认 Skill 被发现。

### 桌面端自带 CLI 的实测要点

macOS 桌面端的 CLI 在 `/Applications/WorkBuddy.app/Contents/Resources/app.asar.unpacked/cli/bin/codebuddy`，不在 `PATH` 里。从 WorkBuddy 会话内调用时有两个坑：

- CLI 默认读写 `~/.codebuddy`，桌面端读写 `~/.workbuddy`。要装进桌面端看到的那份，必须显式设置 `CODEBUDDY_CONFIG_DIR=~/.workbuddy`，否则 `plugin marketplace list` 会返回空列表，装完 UI 里也看不到。
- 会话环境里的 `SERVER__PORT` 会让 CLI 尝试绑定桌面端已占用的端口，报 `EADDRINUSE`。执行时用 `env -u SERVER__PORT -u SERVER__HOST` 去掉。

可直接校验清单，再执行安装：

```bash
CLI=/Applications/WorkBuddy.app/Contents/Resources/app.asar.unpacked/cli/bin/codebuddy
env -u SERVER__PORT -u SERVER__HOST CODEBUDDY_CONFIG_DIR="$HOME/.workbuddy" \
  "$CLI" plugin validate /绝对路径/html-to-wechat
env -u SERVER__PORT -u SERVER__HOST CODEBUDDY_CONFIG_DIR="$HOME/.workbuddy" \
  "$CLI" plugin marketplace add ai-freer/html-to-wechat
env -u SERVER__PORT -u SERVER__HOST CODEBUDDY_CONFIG_DIR="$HOME/.workbuddy" \
  "$CLI" plugin install html-to-wechat@ai-freer --scope user
env -u SERVER__PORT -u SERVER__HOST CODEBUDDY_CONFIG_DIR="$HOME/.workbuddy" \
  "$CLI" plugin list
```

安装命令可能打印 `[safe-delete] broker denied delete: .settings.json.workbuddy.lock` 并报失败，这是宿主安全代理拒绝清理锁目录的噪音；以 `plugin list` 的 `Status: enabled`、`installed_plugins.json` 记录和 `settings.json` 的 `enabledPlugins` 为准。安装后执行 `/reload-plugins` 或开新会话让技能生效。

## 云端跟踪与自动更新

桌面端**会**跟踪云端市场：`github` 类型市场把仓库 clone 到 `~/.workbuddy/plugins/marketplaces/<市场名>/`，`update` 时拉取新提交并重装/补齐已启用的插件。`directory` 类型（本地路径）没有这一步。市场条目结构：

```json
{ "type": "github", "source": { "source": "github", "repo": "ai-freer/html-to-wechat" }, "autoUpdate": true }
```

需要注意的默认行为：

- **第三方市场默认 `autoUpdate: false`**，只有内置市场默认开启。CLI 的 `marketplace add` 没有开关，要自动更新需把 `~/.workbuddy/plugins/known_marketplaces.json` 里该条目的 `autoUpdate` 改为 `true`（等价于插件管理 API 的 `setMarketplaceAutoUpdate`），或设环境变量 `CODEBUDDY_AUTO_UPDATE_THIRD_PARTY_MARKETPLACES=true` 对所有第三方市场开启。
- 检查在会话启动约 5 秒后触发，默认间隔 **24 小时**（`CODEBUDDY_MARKETPLACE_AUTO_UPDATE_INTERVAL_MS` 可调）；`lastUpdated` 会刷新。更新成功后宿主会调用 `repairEnabledPlugins()` 补齐已启用插件。
- **版本号必须递增**：缓存按 `<version>` 分目录，市场清单里的 `version` 不变时，即使云端代码变了，已安装副本也不会被替换。改版时同步四处版本号并重建发布包（见下文）。
- 手动立即同步：`/plugin marketplace update ai-freer` → `/plugin update html-to-wechat@ai-freer` → 必要时 `/reload-plugins`。

维护者已于 2026-11-04 用 `github` 源安装、开启 `autoUpdate: true`，并实测 `plugin marketplace update ai-freer` 成功：本地 clone 的 HEAD 与 GitHub 远端 HEAD 一致（`a581ee5`）。

## 缓存与依赖

市场插件不会原地加载，而是复制到版本化缓存（WorkBuddy 桌面端）：

```text
~/.workbuddy/plugins/cache/ai-freer/html-to-wechat/<version>/
```

CodeBuddy Code 使用 `~/.codebuddy/plugins/cache/...`。维护者的 0.2.0 缓存副本已执行 `node skills/html-to-wechat/scripts/setup.mjs`，四个 `runtimeDirs` 均从锁文件装好依赖（默认 `--omit=optional`，未装可选 Puppeteer），可直接跑本地转换。构建产物不包含 `node_modules`：首次使用时按**当前实际加载的缓存副本**内 `skills/html-to-wechat/SKILL.md` 的说明，运行该副本的 `scripts/setup.mjs` 从锁文件安装依赖；不要只在仓库或 `plugins/release/` 里安装后假设缓存副本也有依赖。插件升级会换缓存目录，依赖通常需要重新准备；宿主若提供 `${CODEBUDDY_PLUGIN_DATA}` / `${CLAUDE_PLUGIN_DATA}` 持久化数据目录，可用它存放依赖以避免每次升级重装，但这需要相应脚本改造，当前包尚未实现。依赖安装需要网络或可用的 npm 缓存；缓存不可写或安装失败时如实报告，不称插件开箱即用。

截图或测宽另需可选浏览器模块和已有浏览器；飞书本地 XML 不需要登录，云端创建另需 CLI、账号及单独授权。

用合成 HTML 验证公众号转换、图集 payload、口播提取和飞书本地 XML；这不等于真实生图、飞书云端写入、公众号保存或手机验收。用户未授权时不执行上传、发布、生图或云端写入。维护者已于 2026-11-04 从 **GitHub 市场源**完成真实安装（`ai-freer`、0.2.0、`Status: enabled`、`gitCommitSha` 已记录），缓存副本与云端发布包逐文件一致，依赖已准备并通过合成 HTML 冒烟；端到端对话与上述云端/手机验收仍未执行。换安装源只改变分发与更新链路，插件运行时仍是本地转换，云端发布能力不受影响。

## 维护发布包

`plugins/workbuddy/` 是清单与包内说明的源码，`plugins/release/workbuddy/` 是提交到仓库供市场安装的完整构建产物，`skill/` 与共享转换实现是能力开发源。

版本必须一致：`skill/` 的 `metadata.version`、`.codebuddy-plugin/marketplace.json` 条目的 `version`、`plugins/workbuddy/.workbuddy-plugin/plugin.json` 的 `version`，以及构建出的 `.skill-package.json`。刷新或检查产物：

```bash
node plugins/release.mjs
node plugins/release.mjs --check
node plugins/test.mjs
```

`--check` 核对三个客户端清单版本与总包一致，`test.mjs` 核对市场条目的 `source`、名称、版本和技能包哈希。更新源码后重新生成并审阅 `plugins/release/workbuddy/`；不把 `node_modules`、凭据、真实输入或私有样本放进发布包。市场添加成功不等于依赖或业务验收通过。
