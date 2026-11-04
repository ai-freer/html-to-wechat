# CLI dry-run 与云端操作

仅用户要求 CLI dry-run 或授权云端创建/更新时读取。路径相对模式根；完整设计说明按主 Skill 的链接查阅。

## 仅在需要 CLI dry-run 或已授权云端操作时

1. 检查 `lark-cli --version` / 相关 `--help`。本地适配基线为 1.0.98；lark-doc Skill 不是脚本硬依赖；文档优先 `lark-cli skills read lark-doc/references/lark-doc-xml.md`，避免 Hub 与执行器版本漂移。
2. 使用者身份/账号必须明确。脚本显式 `--as user`；多账号传 `--profile` 或 `LARK_CLI_PROFILE`，不默用另一租户。脚本不读写 token。用户仅要求本地验证时，不登录新账号、不建文档。
3. 复杂报告同时看图和源码，Agent 写 plan JSON 文件：容器边界、比例、画板 DSL、截图兜底。默认 plan 只做标签转换，绝不能称为自动理解了全部视觉。
4. 先 `--export-only` 生成 XML 和同目录资源包。所有本地/base64/截图图片在创建前准备为 `<img path="@./..." width="..."/>`，保留原位置；失败在云端创建前停止。复杂 callout 的资源会移到相邻块或明确拒绝，不复用旧版图片后置上传参数。
5. 用 `--dry-run` 验证当前 CLI 请求，不输出其鉴权上下文。创建/上传须有覆盖账号、内容和目的地的授权，不能把 dry-run 当云端成功。
6. 创建后检查 warnings/tips，以响应 URL 为准。按当前 `lark-doc` 的 fetch 路径回读正文和资源，再看网页/手机实际效果；有损项逐条交付。
7. 精修先 fetch 最新 block ID；`update-doc.mjs` 用 `--command`、`--content`、明确格式。章节/跨块替换和删除须传 blockId 或同父范围；插入前方用 previousBlockId。旧标题/省略号选择器已不支持，不猜 ID。局部更新后必须重新 fetch，防止复用失效 ID。

## 调用与交付

`h2w_mode` 为主 MODE.md 所在目录；从用户工作目录执行。先用 `--help` 确认接口与当前账号配置，不擅自登录。

```bash
# CLI dry-run，需要用户已配置的外部 CLI；不会创建云端文档
node "$h2w_mode/scripts/index.mjs" --input report.html --plan output/feishu-plan.json \
  --dry-run --output-xml output/feishu.xml
```

移除 --dry-run 会进入云端创建，必须已有覆盖账号、内容与目的地的授权。多账号显式指定 --profile。完整 HTML 内容块要由用户明确选择，追加 --target html-block；不能作为原生转换失败时的静默兜底。

`--chunk-bytes N` 按 UTF-8 字节和顶层块切分；不可拆单块可能超阈值，没有按失败样本自动重试。XML 与旁边 .assets 资源目录一起保留。详细目标取舍见主 Skill，云端渲染和手机效果须单独验收。
