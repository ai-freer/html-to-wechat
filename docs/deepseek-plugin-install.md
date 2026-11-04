# DeepSeek Harness 插件安装与验证

本仓库的 DeepSeek Harness（下称 DSH）插件是 Cordis bundle：`plugins/release/deepseek/` 里带 `package.json`（`dsh.bundle.patch`）、`cordis.patch.yml`、`locale/`、`icon.png` 和闭合的 `skills/html-to-wechat/`。它通过 `ctx.skills.registerProvider` 把总入口注册为一个技能，四种模式仍按包内 `modes/*/MODE.md` 执行。

分发方式是 **GitHub 仓库 + GitHub Pages 市场索引**，不发布 npm。

## 环境要求

| 项 | 要求 |
|---|---|
| DSH | `0.2.1-rc.5` 及以上、`0.3.0` 以下（见包内 `engines.dsh`） |
| Node.js | 20.19+（Desktop 自带运行时即可） |
| 网络 | 安装与更新需要访问 GitHub |
| 可选 | 截图/测宽需要本机已有浏览器；飞书云端需要 `lark-cli` 与账号 |

`engines.dsh` 不满足时，安装会在 `pnpm` 执行前被拒绝并报 `incompatible-version`；升级 DSH 后先确认本插件已发布对应的 `engines.dsh` 范围。

## 方式一：从市场索引安装（推荐）

1. 打开 **Plugins → Discover**。
2. **Add index source** 填入：

   ```text
   https://ai-freer.github.io/html-to-wechat/plugins/market.json
   ```

3. 找到 **HTML 多平台交付**，点 **Install** 并确认。
4. 在 **Installed** 页确认该 bundle 已启用。

索引由 `.github/workflows/deploy-pages.yml` 在每次发布时生成：它把当前版本固定到部署所用的 commit，因此索引文件本身不提交进仓库；索引只列当前版本，需要回退时按目标 commit 用方式二安装。首次使用前，仓库必须在 **Settings → Pages** 选择 **GitHub Actions**，并至少完成一次 Pages 部署；否则上述 URL 不可用。

## 方式二：按 commit 用命令行安装

从市场索引（或本地 `node scripts/build-market-index.mjs --check`）拿到当前版本的 40 位 commit，然后：

```bash
DSH="/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh"
"$DSH" plugin --profile desktop add \
  "git+https://github.com/ai-freer/html-to-wechat.git#<commit>&path:/plugins/release/deepseek"
```

`dsh plugin` 会把参数原样交给 profile 目录里的 `pnpm`；`path:` 指向仓库内已提交的发布包，安装时不执行构建。装完重启 DSH，或在 **Plugins** 页确认已启用。

## 方式三：本地目录（开发自测）

```bash
"$DSH" plugin --profile desktop add /绝对路径/html-to-wechat/plugins/release/deepseek
```

`file:`/`link:` 安装由 `pnpm` 建立软链，**不会**安装包的 `dependencies`：本地要跑脚本时先在插件目录执行 `npm install`（或按方式二装一份 git 版本）。改完源码要重新 `node plugins/release.mjs`，并重启宿主。

## 依赖

插件自己声明了四个运行时依赖（`cheerio`、`jsdom`、`juice`、`turndown`）。从市场、git 或 tarball 安装时 `pnpm` 会一并装好，**不需要**再进插件副本跑 `scripts/setup.mjs`；只有方式三的本地链接安装不带依赖。只有需要截图/测宽时才额外准备浏览器：

```bash
cd ~/.dsh/profiles/desktop/node_modules/@ai-freer/html-to-wechat
node skills/html-to-wechat/scripts/setup.mjs --with-browser
```

浏览器二进制与 `lark-cli` 始终是外部前置条件，不随插件分发。

## 更新与卸载

- **更新**：市场当前只提示 *Update available*，没有一键升级。先 **Remove** 再 **Install**，或用方式二把 `<commit>` 换成新提交后重新 `add`。整包替换后依赖由 `pnpm` 按新的 `package.json` 重装。
- **卸载**：在 **Plugins → Installed** 用 **Remove**（走 plugin manager，会同时取消 bundle 选择）。不要只用 `pnpm remove`，那会留下指向缺失包的 `dsh.profile.bundles` 条目。

## 与本地同名 Skill 的关系

插件注册的技能名是 `html-to-wechat`，优先级 rank 600，高于项目/用户目录里的同名技能（100–500）。若本机 `~/.agents/skills/html-to-wechat` 或 `~/.dsh/skills/html-to-wechat` 仍有副本，插件版会遮蔽它；建议先移除本地副本，避免"改了文件却不生效"的困惑。

## 验收清单

```bash
"$DSH" --profile desktop --dump-config | grep -A3 html-to-wechat
```

逐项确认：

1. **能发现**：Plugins 页出现该 bundle，标题、描述（中英）和图标正常，无 metadata diagnostic。
2. **能加载**：新会话的技能目录里有 `html-to-wechat`，说明文字来自 `SKILL.md`。
3. **能执行**：同一份合成 HTML 跑四条本地路径——公众号富文本、图集 payload 链接、口播提取、飞书本地 XML。
4. **更新后仍可用**：换版本重装后，`node -e "import('cheerio')"` 之类能解析到依赖，四模式再跑一遍。
5. **重启后仍可用**：退出并重开 DSH，技能仍在、无重复 provider 报错。
6. **自然语言路由**：新会话直接说"把这份 HTML 转成公众号"，能被路由到该技能。

生图、飞书云端创建、公众号保存和手机预览须分别授权并单独验收；本页不覆盖这些远端操作。

## 已验证与未验证

维护者已用隔离的 `DSH_HOME` 实测：

| 检查 | 结果 |
|---|---|
| npm tarball 安装进 profile | 101 个依赖随包解析；四种模式脚本都能从安装副本运行 |
| `git+file://…` 加 `path:/plugins/release/deepseek` 安装 | 按 `files` 打包成功、依赖解析、`--dump-config` 出现该 bundle 行 |
| 市场索引 | 用 DSH 自带 `parseMarketIndex` 校验通过，生成的安装 spec 为 `git+https://github.com/ai-freer/html-to-wechat.git#<commit>&path:/plugins/release/deepseek` |
| `node plugins/test.mjs` | 四个客户端全部通过，含 DeepSeek 清单字段、打包清单、locale/icon 与 provider 注册断言 |

未验证：从 `github.com` 真实拉取（当时的测试环境拦截了外部域名）；Discover 页面的实际点击流程；真实会话里的自然语言路由。首次推送后请按上面的验收清单在 Desktop 里走一遍。

## 发布流程（维护者）

```bash
# 1. 统一版本：skill/metadata.version、skill/locks、各客户端清单、plugins/deepseek/package.json
# 2. 重新生成发布目录（含 plugins/release/deepseek）
node plugins/release.mjs
# 3. 校验市场索引形状
node scripts/build-market-index.mjs --check
# 4. 提交后由 deploy-pages 生成并部署市场索引
```

`engines.dsh` 需要随 DSH 升级而调整；版本号必须与总包 `.skill-package.json` 一致，否则 `node plugins/release.mjs --check` 会失败。
