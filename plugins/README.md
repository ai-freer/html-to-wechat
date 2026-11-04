# HTML-to-WeChat 客户端插件适配

四个插件由同一个已闭合的 Skill 总包构建，包含总入口和四种模式：公众号、图集、口播和飞书。插件不内置生图服务、飞书凭据或浏览器；所有发布、上传和云端操作仍按原 Skill 的授权边界执行。保留现有总包及独立 Skill 安装方式。

## 构建和本地验证

需要 Node.js 20.19+ 和 npm。输出目录必须不存在；构建不联网、不安装依赖，也不修改客户端。

```bash
node plugins/build.mjs --out plugins/dist
node plugins/test.mjs
```

插件源码和适配清单位于 `plugins/` 内对应客户端目录；完整构建产物分别位于 `plugins/dist/codex/`、`plugins/dist/claude/`、`plugins/dist/workbuddy/`、`plugins/dist/deepseek/`。`dist/` 不纳入 Git，改动源码后应构建到一个新的输出目录。测试在临时目录构建并从锁文件安装基础运行依赖（可能需要访问 npm），检查每个包的四条本地执行路径；图集检查 payload 链接，不调用生图；飞书仅本地 XML。测试还模拟 DeepSeek provider 注册、加载和打包，并在本机有 Claude CLI 时调用其插件校验器。**这些不等于四个客户端已实际安装、发现或完成端到端对话测试。**

每个包只有一个直接可发现的 Skill `skills/html-to-wechat`；该入口按需读取包内 `modes/*/MODE.md` 的四个工作流。总包内的模式入口不命名为 `SKILL.md`，否则 Claude 应用会把它们识别为独立技能；单独的模式包仍使用 `SKILL.md`。不要再将四个模式分别作为插件技能重复安装。总包与原来的独立包是不同安装选择，已有版本共存时需检查名称和宿主优先级。

## Claude、Codex、WorkBuddy 与 DeepSeek 插件发布

四个插件都从仓库内已提交的构建产物安装：

| 客户端 | 插件市场 | 安装内容 | 安装 ID |
|---|---|---|---|
| Claude | `.claude-plugin/marketplace.json` | `plugins/release/claude/` | `html-to-wechat@ai-freer` |
| Codex | `.agents/plugins/marketplace.json` | `plugins/release/codex/` | `html-to-wechat@html-to-wechat` |
| WorkBuddy / CodeBuddy | `.codebuddy-plugin/marketplace.json` | `plugins/release/workbuddy/` | `html-to-wechat@ai-freer` |
| DeepSeek Harness | GitHub Pages 市场索引（部署时生成，见下） | `plugins/release/deepseek/` | `@ai-freer/html-to-wechat` |

WorkBuddy 的市场清单**必须**放在 `.codebuddy-plugin/marketplace.json`：桌面端只扫描 `.codebuddy-plugin/` 和 `.claude-plugin/` 下的 `marketplace.json`，不扫描 `.workbuddy-plugin/marketplace.json`。插件包内的清单目录按顺序兼容 `.codebuddy-plugin/`、`.workbuddy-plugin/`、`.claude-plugin/`（取第一个存在的），本仓库沿用已有的 `.workbuddy-plugin/plugin.json`。市场条目默认 `strict: true`，插件包内必须有清单。

其余 `plugins/dist/` 产物仍不纳入 Git。

发布步骤：

1. 统一修改版本号：`scripts/build-skills.mjs`、`skill/` 下的 `metadata.version` 和 `package.json`、`skill/locks/`、`.codebuddy-plugin/marketplace.json`，以及 `plugins/` 下各客户端清单（含 `plugins/deepseek/package.json`）。版本不变时，已安装用户可能收不到更新；`--check` 会核对四个客户端清单与总包版本一致，`test.mjs` 会核对市场条目与 WorkBuddy 发布包一致。
2. 运行 `node plugins/release.mjs` 刷新四个发布目录，并一起提交。
3. CI 运行 `node plugins/release.mjs --check` 与 `node scripts/build-market-index.mjs --check`；发布目录与 `skill/` 不一致、或市场索引形状不合法时失败。
4. DeepSeek 的市场索引 `web/plugins/market.json` 不提交：`.github/workflows/deploy-pages.yml` 在每次部署时用当前 commit 生成并随 Pages 发布。

插件文件夹内的 `README.md`、图标和清单元数据分别维护在 `plugins/claude/`、`plugins/codex/`、`plugins/workbuddy/` 和 `plugins/deepseek/`。

`SKILL.md` 的版本写在 `metadata.version`，不用顶层 `version`，以符合 Agent Skills 规范。

## 客户端适配

- **Codex / ChatGPT**：`codex/` 为 Agent Plugins 根 `plugin.json` 结构，附 OpenAI 展示信息。使用客户端实际支持的本地插件市场入口安装；不同版本的导入、缓存及权限行为需实测。参考 [OpenAI 打包文档](https://developers.openai.com/plugins/build/plugins)。
- **Claude Code**：`claude/` 使用 `.claude-plugin/plugin.json` 和 `skills/`。可按 [Claude 插件文档](https://code.claude.com/docs/en/plugins) 在隔离会话通过插件目录测试；Claude 的其他产品形态可能具有不同的运行环境和限制。
- **WorkBuddy / CodeBuddy**：仓库根的 `.codebuddy-plugin/marketplace.json` 声明市场条目并指向 `plugins/release/workbuddy/`；插件包使用 `.workbuddy-plugin/plugin.json` 和 `skills/`。桌面端通过 `/plugin marketplace add <本地目录或 ai-freer/html-to-wechat>` 添加市场，再 `/plugin install html-to-wechat@ai-freer`；市场插件会被复制到版本化缓存 `~/.workbuddy/plugins/cache/<marketplace>/<plugin>/<version>/`，不是原地加载。清单字段遵循 [WorkBuddy 插件 API](https://cloud.tencent.cn/document/product/1831/137036)；安装、缓存依赖和验收边界见 [WorkBuddy 插件安装与验证](../docs/workbuddy-plugin-install.md)。真实桌面安装与端到端对话验收尚未完成，需实测。
- **DeepSeek Harness**：`deepseek/` 是 Cordis bundle，用 `ctx.skills.registerProvider` 注册总入口，`resourceBase` 指向实际安装包内的 Skill；`ctx.effect` 持有注册以便卸载/热重载时释放。清单声明 `dsh.manifestVersion`、`dsh.bundle.patch`、`engines.dsh`、`locale/*.json` 展示元数据和 `icon`，运行时依赖写在 `dependencies` 里，装完即可用。分发走 GitHub（不发布 npm）：`.github/workflows/deploy-pages.yml` 把 `plugins/release/deepseek/` 的版本和部署 commit 生成为 `web/plugins/market.json`（格式 1 市场索引），用户在 DSH 的 Plugins → Discover 添加该 URL 即可安装。安装、更新、卸载与验收见 [DeepSeek Harness 插件安装与验证](../docs/deepseek-plugin-install.md)。

## 依赖和真实验收

插件构建产物不包含 `node_modules`。DeepSeek 包把四个必需依赖写进 `dependencies`，由 `pnpm` 在安装时解析，无需 `setup.mjs`；Claude、Codex、WorkBuddy 仍按**客户端当前加载的插件副本**的 `skills/html-to-wechat/SKILL.md` 和 `scripts/setup.mjs --help` 安装锁定依赖；不要只在构建目录安装后假设客户端缓存或 DeepSeek 的 npm 安装副本也有依赖。安装缓存是否允许写入、更新后是否保留依赖需要逐客户端验证；不可写时要使用该客户端支持的持久化依赖方案，不能声称插件开箱即用。截图/测宽需可选浏览器依赖及已有浏览器；飞书云端需另行配置 CLI 和账号。

晚些进行真实安装测试时，每个客户端至少检查：能发现入口；从插件实际副本加载和执行本地依赖；用同一个合成 HTML 跑公众号、图集 payload、口播提取、飞书本地 XML；新会话自然语言路由；重启或插件更新后的依赖路径。生图、飞书云端创建、公众号保存和手机预览须分别授权并验收。
