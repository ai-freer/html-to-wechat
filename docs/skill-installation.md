# Skill 独立安装与依赖闭合

普通使用者可将仓库地址和安装目标交给 Agent，由 [Agent 安装入口](agent-install.md) 引导其执行。本页保留给开发者和手动安装场景。

本项目提供一个总包和四个可单独安装的模式包。开发源仍在 `skill/`，共享实现仍在仓库根 `lib/`；不要手工复制源 mode 目录当作安装包。

## 本地构建

前置 Node.js 20.19+ 和 npm。构建只读显式白名单，不联网、不安装依赖。

```bash
node scripts/build-skills.mjs --out output/skill-packages-local
```

产物目录：

- `html-to-wechat`：总入口、全部模式工具和共享库。
- `html-to-wechat-richtext`：公众号模式。
- `html-to-wechat-images`：图集模式。
- `html-to-wechat-script`：口播稿模式。
- `html-to-feishu`：飞书模式。

每个产物包含 SKILL.md、所需脚本、包内 lib、必要说明、锁文件和 `.skill-package.json` 指纹清单。构建时改写共享库相对引用；不包含真实长文、生成图片、node_modules、环境文件、主机设置或凭据。示例 bench 命令不随安装包引用仓库外的私有样本。

锁文件开发源是 `skill/locks/<模式>.json`，构建时写为包内 scripts/package-lock.json。按 manifest 校验依赖声明与锁一致，并以 npm ci 安装精确依赖及完整性哈希。

## 安装到显式指定的目录

```bash
# 总包；路径为示例，必须由使用者选择实际目标
node scripts/install-skills.mjs \
  --from output/skill-packages-local/html-to-wechat \
  --dest /tmp/my-isolated-skills

# 或只安装一个模式
node scripts/install-skills.mjs \
  --from output/skill-packages-local/html-to-wechat-script \
  --dest /tmp/my-isolated-skills
```

安装器不推断 ~/.agents 或客户端位置，不同步 Hub。默认校验清单和逐文件 SHA-256，在 staging 中安装依赖，全部成功后移动到目标；目标已存在则拒绝覆盖，损坏的产物也拒绝安装。`--no-deps` 仅复制文件，不能将此称为运行依赖已就绪。

总包或独立包也可完整复制到选定位置，再从包根运行 `node scripts/setup.mjs`。总包可用 `--mode 03-script` 只安装一个模式的依赖；独立包不依赖其他模式的安装。

## 可选浏览器与外部 CLI

默认安装跳过可选 Puppeteer 依赖，所有 npm lifecycle scripts 均关闭。基础转换、文本提取、payload 生成、飞书 `--export-only --no-measure` 不需要浏览器。

需要截图/测宽时：

```bash
# 安装 Puppeteer 模块，但不会下载浏览器二进制
node scripts/setup.mjs --with-browser

# 显式使用已安装的 Chrome；路径依实际机器确定
PUPPETEER_EXECUTABLE_PATH="<现有 Chrome 可执行文件>" \
  node scripts/render-snapshot.mjs input.html snapshot.png
```

没有现有浏览器时，按 Puppeteer 官方安装方式另行准备，不将全局浏览器下载藏在默认安装过程中。本轮用 macOS 现有 Chrome 实际执行过独立图集包的截图 CLI。

飞书云端创建和 dry-run 需要外部 `lark-cli`；纯本地 XML 导出不调用它。脚本不安装 CLI、不登录、不复制账号设置；用当前 CLI 的内嵌文档和 `--profile` 明确账号。

## 三层验收

1. **产物闭合**：所有相对 imports 都留在包内，依赖有锁，清单无私有样本和配置。
2. **安装及命令调用**：干净目录 npm ci；从另一工作目录实际运行转换器、提取器、payload 工具、原生 XML 导出和截图，验证结果。
3. **宿主发现与业务效果**：目标 Codex/另一宿主能发现、选中和使用 Skill；生成内容准确，平台实际接受。

产物闭合与安装调用已验证；随后 Codex 项目级自动发现和独立口播包自然语言触发也通过真实长文试跑。总包多目标调用经路由调整后已完成两轮本地冷启动转换。详见 [验证与待完成事项](validation.md)。未改全局宿主发现目录，Hub、其他客户端与云端业务验收仍另行执行。


## Codex 项目级自动发现（2026-10-31 实测）

在一个项目根目录下，将完整安装包安装到 `.agents/skills/`：

```bash
node scripts/install-skills.mjs \
  --from output/skill-packages-local/html-to-wechat \
  --dest /path/to/project/.agents/skills
```

`/path/to/project` 必须替换为实际项目目录。随后从该项目启动新的 Codex 会话。不要仅让旧会话手动读取文件，就宣称已自动发现。

Codex CLI `0.165.0-alpha.1.2` 的 app-server `skills/list` 实测识别到总入口与其下四个模式，均为 `scope: repo`、`enabled: true`，项目内解析错误为零。独立口播包在另一个干净项目中也通过相同检查。总包与独立包是两种安装选择：装总包后不必再装四个同名模式。

可选宿主集成检查（需要本机已有 `codex`，不调用模型、不修改客户端配置）：

```bash
node tests/codex-discovery.mjs /path/to/project \
  html-to-wechat html-to-wechat-richtext html-to-wechat-images \
  html-to-wechat-script html-to-feishu
```

此检查只证明指定项目内 Skill 被宿主识别且启用；模型是否按具体任务选中它，仍需新会话的自然语言业务试跑。全局 Skills、Hub 与其他客户端均不因这个项目级安装而改变。


## 总包的公众号＋飞书本地任务

总包优先路由到 `references/multi-target.md` 和 `scripts/local-pair.mjs`。先 `--input report.html --inspect` 检查结构，Agent 判断后分别保存两个目标的 plan，再执行：

```bash
node "$h2w_root/scripts/local-pair.mjs" --input report.html \
  --wechat-plan wechat-plan.json --feishu-plan feishu-plan.json \
  --out output/pair
```

`h2w_root` 为实际安装的总包根目录；`output/pair` 必须不存在。基础本地导出无需可选浏览器或飞书 CLI。`run.json` 的 converted 只表示转换成功，仍须核对正文、表格与视觉。需要截图、SVG 画板或 HTML 内容块时按需进入独立模式。排查记录见 [验证与待完成事项](validation.md)。
