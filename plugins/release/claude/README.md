# HTML-to-WeChat

把 Agent 生成的 HTML 文章交付为公众号富文本、图集、口播稿或飞书文档。

Turn an HTML article into WeChat Official Account rich text, an image-card set, a spoken script, or a Feishu document. A single skill routes each request to the right workflow, checks the source first, and runs the conversion locally.

## Install

In the Claude app, go to Customize > Plugins > Add > Add marketplace and enter `ai-freer/html-to-wechat`. In Claude Code, run:

```text
/plugin install html-to-wechat --marketplace ai-freer/html-to-wechat
```

## Use it

Give Claude an HTML file and say what you want, for example "把这篇 HTML 转成公众号富文本" or "turn this article into a spoken script". You can also run `/html-to-wechat:html-to-wechat`.

## Requirements

Node.js 20.19+ and access to the npm registry. Dependencies install from bundled lockfiles the first time the plugin runs, with package install scripts turned off. Screenshots and width measurement also need an optional browser dependency and an existing browser.

## What it runs and sends

- **Local conversion:** bundled Node.js scripts read your HTML and write results to your working folder. The plugin adds no telemetry, credentials or background services.
- **npm:** first use downloads the locked packages from the npm registry.
- **Preview links:** image-set and spoken-script links open static pages on `ai-freer.github.io`, with the content carried in the link's `#` fragment.
- **Image generation:** the plugin has no image service. It uses your host's image tool, only after you authorize it, and your prompts go to that service.
- **Feishu:** local XML export needs no login. Creating or updating cloud documents and uploading media go through your own `lark-cli` account, only after you authorize it.

## License

MIT. Bundled JSZip keeps its own license.

Source: https://github.com/ai-freer/html-to-wechat
