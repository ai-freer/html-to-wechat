# HTML-to-WeChat 客户端插件适配（本地开发版）

四个插件由同一个已闭合的 Skill 总包构建，包含总入口和四种模式：公众号、图集、口播和飞书。插件不内置生图服务、飞书凭据或浏览器；所有发布、上传和云端操作仍按原 Skill 的授权边界执行。保留现有总包及独立 Skill 安装方式。

## 构建和本地验证

需要 Node.js 20.19+ 和 npm。输出目录必须不存在；构建不联网、不安装依赖，也不修改客户端。

```bash
node plugins/build.mjs --out plugins/dist
node plugins/test.mjs
```

插件源码和适配清单位于 `plugins/` 内对应客户端目录；完整构建产物分别位于 `plugins/dist/codex/`、`plugins/dist/claude/`、`plugins/dist/workbuddy/`、`plugins/dist/deepseek/`。`dist/` 不纳入 Git，改动源码后应构建到一个新的输出目录。测试在临时目录构建并从锁文件安装基础运行依赖（可能需要访问 npm），检查每个包的四条本地执行路径；图集检查 payload 链接，不调用生图；飞书仅本地 XML。测试还模拟 DeepSeek provider 注册、加载和打包，并在本机有 Claude CLI 时调用其插件校验器。**这些不等于四个客户端已实际安装、发现或完成端到端对话测试。**

每个包只有一个直接可发现的 Skill `skills/html-to-wechat`；该入口按需读取包内 `modes/` 的四个工作流。不要再将四个模式分别作为插件技能重复安装。总包与原来的独立包是不同安装选择，已有版本共存时需检查名称和宿主优先级。

## Claude 插件发布

Claude 插件通过仓库根目录的 `.claude-plugin/marketplace.json` 分发，安装内容是已提交的 `plugins/release/claude/`。其余 `plugins/dist/` 产物仍不纳入 Git。

发布步骤：

1. 修改 `plugins/claude/.claude-plugin/plugin.json` 的 `version`。版本不变时，已安装用户收不到更新。
2. 运行 `node plugins/release.mjs` 刷新发布目录，并一起提交。
3. CI 运行 `node plugins/release.mjs --check`，发布目录与 `skill/` 不一致时失败。

`SKILL.md` 的版本写在 `metadata.version`，不用顶层 `version`，以符合 Agent Skills 规范。

## 客户端适配

- **Codex / ChatGPT**：`codex/` 为 Agent Plugins 根 `plugin.json` 结构，附 OpenAI 展示信息。使用客户端实际支持的本地插件市场入口安装；不同版本的导入、缓存及权限行为需实测。参考 [OpenAI 打包文档](https://developers.openai.com/plugins/build/plugins)。
- **Claude Code**：`claude/` 使用 `.claude-plugin/plugin.json` 和 `skills/`。可按 [Claude 插件文档](https://code.claude.com/docs/en/plugins) 在隔离会话通过插件目录测试；Claude 的其他产品形态可能具有不同的运行环境和限制。
- **WorkBuddy / CodeBuddy**：`workbuddy/` 使用 `.workbuddy-plugin/plugin.json`。依据 [腾讯插件 API](https://cloud.tencent.cn/document/product/1831/137036)，该结构用于 WorkBuddy Enterprise 文档中的 CodeBuddy 插件体系；具体 WorkBuddy 桌面版本的安装入口和支持范围需要实测。
- **DeepSeek Harness**：`deepseek/` 是 Cordis bundle，使用 `ctx.skills` provider 注册总入口，资源指向实际安装包内的 Skill。依赖宿主启用 Skill registry、provider 消费端以及文件执行能力；不同版本需核对其 [Skill 子系统](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/skills.md)。package 为本地开发包，未发布 npm。

## 依赖和真实验收

插件构建产物不包含 `node_modules`。实际安装后，按**客户端当前加载的插件副本**的 `skills/html-to-wechat/SKILL.md` 和 `scripts/setup.mjs --help` 安装锁定依赖；不要只在构建目录安装后假设客户端缓存或 DeepSeek 的 npm 安装副本也有依赖。安装缓存是否允许写入、更新后是否保留依赖需要逐客户端验证；不可写时要使用该客户端支持的持久化依赖方案，不能声称插件开箱即用。截图/测宽需可选浏览器依赖及已有浏览器；飞书云端需另行配置 CLI 和账号。

晚些进行真实安装测试时，每个客户端至少检查：能发现入口；从插件实际副本加载和执行本地依赖；用同一个合成 HTML 跑公众号、图集 payload、口播提取、飞书本地 XML；新会话自然语言路由；重启或插件更新后的依赖路径。生图、飞书云端创建、公众号保存和手机预览须分别授权并验收。
