# Installed package

Run commands from this package root. Install dependencies with `node scripts/setup.mjs`; use `--with-browser` only when screenshot/measurement is needed and point PUPPETEER_EXECUTABLE_PATH at an existing browser. Browser binaries and lark-cli are external prerequisites, never bundled.

This package contains no real articles, generated images, credentials or host settings. Script output is deterministic conversion; Agent judgment/rewrite/image generation is a separate phase. The GitHub Pages site previews or downloads outputs; it does not run an LLM or authenticated Lark CLI. Native Feishu and HTML-block outputs are distinct. Run local export/dry-run before any authorized cloud write.
