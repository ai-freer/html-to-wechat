// HTML → 公众号富文本 · 网页 UI 层
//
// 本文件**只负责 UI**：事件绑定、剪贴板、预览、URL fragment 等。
// 实际的 HTML → 富文本转换由 1A 引擎（transform.mjs）提供，使用 DEFAULT_PLAN 兜底。
//
// 范式 X-A/X-C：
//   - 网页入口（本文件） → transform(html, DEFAULT_PLAN)
//   - skill 入口 → transform(html, llmGeneratedPlan)  // 见 skills/html-to-wechat/
//
// 见 docs/01-html-to-wechat-html.md §2 / §5。

// 注意：import 路径必须带 ?v= cache buster；否则浏览器 ES module map
// 把 './transform.mjs' 作为 URL key 缓存，永远拿不到新版本。
// index.html 的 app.js?v=XX 和此处的版本号必须同步更新。
import { transform, DEFAULT_PLAN } from './transform.mjs?v=19';

const $ = (id) => document.getElementById(id);
const editor = $('editor');
const preview = $('preview');
const inputStats = $('input-stats');
const outputStats = $('output-stats');
const status = $('status');
const warnings = $('warnings');
const btnCopy = $('btn-copy');
const btnSample = $('btn-sample');
const btnClear = $('btn-clear');
const fileInput = $('file-input');
const toast = $('toast');
const btnUrl = $('btn-url');
const urlPopover = $('url-popover');
const urlInput = $('url-input');
const btnUrlFetch = $('btn-url-fetch');
const optExtractMain = $('opt-extract-main');
const viewSourceBtn = $('view-source');
const viewRenderBtn = $('view-render');
const rawPreview = $('raw-preview');

let processedHtml = '';
let processedText = '';
let debounceTimer = null;
let runSeq = 0;

// ---------- pre-render (run JS in sandboxed iframe to populate dynamic content) ----------
//
// 网页入口特有：跑用户原始 HTML 里的 <script>，让动态填充的节点先就位再丢给 1A。
// skill 入口由 Skill 端的 puppeteer 完成同等工作，所以这一步不在 transform.mjs 里。

/**
 * 把 rawHtml 丢进一个跨源 sandboxed iframe，等脚本跑完，postMessage 把渲染后的 DOM
 * 序列化回主页面。用 opaque origin（不开 allow-same-origin），主页不可被 iframe 触达。
 */
function preRender(rawHtml, timeoutMs = 2500) {
  return new Promise((resolve) => {
    if (!/<script[\s>]/i.test(rawHtml)) {
      resolve({ html: rawHtml, executed: false });
      return;
    }
    const id = 'pre-' + Math.random().toString(36).slice(2);
    const snapshotScript = `
<script>
(function(){
  function snap(){
    try {
      var html = '<!doctype html>' + document.documentElement.outerHTML;
      parent.postMessage({ __ptag: ${JSON.stringify(id)}, html: html }, '*');
    } catch(e) {
      parent.postMessage({ __ptag: ${JSON.stringify(id)}, error: String(e) }, '*');
    }
  }
  if (document.readyState === 'complete') setTimeout(snap, 250);
  else window.addEventListener('load', function(){ setTimeout(snap, 250); });
})();
<\/script>`;

    let injected;
    if (/<\/body>/i.test(rawHtml)) {
      injected = rawHtml.replace(/<\/body>/i, snapshotScript + '</body>');
    } else {
      injected = rawHtml + snapshotScript;
    }

    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:1024px;height:768px;border:0;visibility:hidden;';
    iframe.setAttribute('sandbox', 'allow-scripts');

    let done = false;
    const finish = (html, executed) => {
      if (done) return;
      done = true;
      window.removeEventListener('message', onMsg);
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      resolve({ html: html || rawHtml, executed });
    };
    const onMsg = (e) => {
      if (!e.data || e.data.__ptag !== id) return;
      finish(e.data.html, true);
    };
    window.addEventListener('message', onMsg);
    setTimeout(() => finish(rawHtml, false), timeoutMs);

    document.body.appendChild(iframe);
    iframe.srcdoc = injected;
  });
}

// ---------- UI ----------

function renderPreview(html) {
  const wrapStyle = `
    *{box-sizing:border-box}
    html,body{margin:0;padding:0;background:#fafaf9}
    body{font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;color:#1c1917;padding:32px 16px}
    .preview-card{background:#fff;max-width:480px;margin:0 auto;padding:32px 24px;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,0.04),0 0 0 1px rgba(0,0,0,0.04);font-size:15px;line-height:1.75}
    .preview-card img{max-width:100%;height:auto}
    .preview-card>:first-child{margin-top:0}
    .preview-card>:last-child{margin-bottom:0}
  `.replace(/\s+/g, ' ');
  preview.srcdoc = html
    ? `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>${wrapStyle}</style></head><body><div class="preview-card">${html}</div></body></html>`
    : `<!doctype html><html><head><style>html,body{margin:0;height:100%;background:#fafaf9}body{display:flex;align-items:center;justify-content:center;font-family:-apple-system,sans-serif;color:#a8a29e;font-size:13px}</style></head><body>在左侧输入 HTML 后预览出现在这里</body></html>`;
}

function renderWarnings(warns) {
  warnings.innerHTML = '';
  warns.forEach(w => {
    const chip = document.createElement('span');
    chip.className = `chip ${w.level}`;
    chip.textContent = w.text;
    warnings.appendChild(chip);
  });
}

function setStatus(text, kind = '') {
  status.textContent = text;
  status.className = 'status' + (kind ? ' ' + kind : '');
}

function setStep(n) {
  document.body.setAttribute('data-step', String(n));
}

// ---------- editor view (源码 / 渲染) ----------

let editorView = 'source';

function renderRawPreview() {
  const raw = editor.value;
  if (!raw.trim()) {
    rawPreview.srcdoc = '<!doctype html><html><head><style>html,body{margin:0;height:100%;background:#fafaf9}body{display:flex;align-items:center;justify-content:center;font-family:-apple-system,sans-serif;color:#a8a29e;font-size:13px}</style></head><body>切回「源码」输入 HTML 后这里会显示原始渲染效果</body></html>';
    return;
  }
  if (/<head[\s>]/i.test(raw)) {
    rawPreview.srcdoc = raw;
  } else {
    rawPreview.srcdoc = '<!doctype html><html><head><base target="_blank"><meta charset="utf-8"></head><body>' + raw + '</body></html>';
  }
}

function setEditorView(mode) {
  editorView = mode;
  const isSource = mode === 'source';
  editor.hidden = !isSource;
  rawPreview.hidden = isSource;
  viewSourceBtn.classList.toggle('is-active', isSource);
  viewRenderBtn.classList.toggle('is-active', !isSource);
  viewSourceBtn.setAttribute('aria-selected', String(isSource));
  viewRenderBtn.setAttribute('aria-selected', String(!isSource));
  if (!isSource) renderRawPreview();
  else editor.focus();
}

viewSourceBtn.addEventListener('click', () => setEditorView('source'));
viewRenderBtn.addEventListener('click', () => setEditorView('render'));

function showToast(msg, ms = 1800) {
  toast.textContent = msg;
  toast.hidden = false;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => { toast.hidden = true; }, ms);
}

function updateInputStats() {
  const n = editor.value.length;
  inputStats.textContent = n ? `${n.toLocaleString()} 字符` : '0 字符';
}

async function run() {
  updateInputStats();
  if (editorView === 'render') renderRawPreview();
  const raw = editor.value;

  if (!raw.trim()) {
    setStatus('等待输入…');
    btnCopy.disabled = true;
    renderPreview('');
    outputStats.textContent = '';
    renderWarnings([]);
    setStep(1);
    return;
  }

  const seq = ++runSeq;
  const hasScript = /<script[\s>]/i.test(raw);
  if (hasScript) setStatus('正在执行脚本以补全动态内容…');

  // pre-render 在 sandboxed iframe 里跑用户的 <script>，把动态填充的 DOM 抓回来
  const { html: rendered, executed } = await preRender(raw);
  if (seq !== runSeq) return; // a newer run started; discard

  // 1A 调用：网页入口用 DEFAULT_PLAN（UI 的 extractMain 复选框作为唯一可调字段）
  const plan = { ...DEFAULT_PLAN, extractMain: optExtractMain.checked };
  const result = transform(rendered, plan);

  if (result.error) {
    setStatus(result.error, 'warn');
    btnCopy.disabled = true;
    renderPreview('');
    outputStats.textContent = '';
    renderWarnings([]);
    setStep(1);
    return;
  }

  processedHtml = result.html;
  processedText = result.text;
  renderPreview(processedHtml);

  const finalWarnings = executed
    ? [{ level: 'ok', text: '已执行脚本捕获动态内容' }, ...result.warnings]
    : result.warnings;
  renderWarnings(finalWarnings);

  const s = result.stats;
  const kb = (s.bytes / 1024).toFixed(1);
  outputStats.textContent = `${kb} KB · ${s.counters.images + s.counters.svgImages} 张图`;
  setStatus('已处理，可复制', 'ok');
  btnCopy.disabled = false;
  setStep(3);
}

// debounced run on edit
editor.addEventListener('input', () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(run, 250);
});

// re-run when toggle changes
optExtractMain.addEventListener('change', run);

// ---------- clipboard ----------

btnCopy.addEventListener('click', async () => {
  if (!processedHtml) return;
  try {
    const htmlBlob = new Blob([processedHtml], { type: 'text/html' });
    const textBlob = new Blob([processedText], { type: 'text/plain' });
    await navigator.clipboard.write([
      new ClipboardItem({ 'text/html': htmlBlob, 'text/plain': textBlob }),
    ]);
    showToast('✓ 已复制富文本，去公众号编辑器 Cmd+V');
  } catch (e) {
    try {
      await navigator.clipboard.writeText(processedHtml);
      showToast('已复制 HTML 源码（浏览器不支持富文本剪贴板，需用 Chrome/Edge）');
    } catch (e2) {
      showToast('复制失败：' + (e.message || e2.message));
    }
  }
});

// ---------- file/sample/clear ----------

fileInput.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const text = await file.text();
  editor.value = text;
  fileInput.value = '';
  run();
});

btnClear.addEventListener('click', () => {
  editor.value = '';
  run();
  editor.focus();
});

btnSample.addEventListener('click', () => {
  editor.value = SAMPLE_HTML;
  run();
});

// ---------- URL fetch ----------

function openUrlPopover() {
  urlPopover.hidden = false;
  btnUrl.setAttribute('aria-expanded', 'true');
  setTimeout(() => urlInput.focus(), 0);
}
function closeUrlPopover() {
  urlPopover.hidden = true;
  btnUrl.setAttribute('aria-expanded', 'false');
}

btnUrl.addEventListener('click', (e) => {
  e.stopPropagation();
  if (urlPopover.hidden) openUrlPopover(); else closeUrlPopover();
});

document.addEventListener('click', (e) => {
  if (urlPopover.hidden) return;
  if (urlPopover.contains(e.target) || btnUrl.contains(e.target)) return;
  closeUrlPopover();
});

urlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    btnUrlFetch.click();
  } else if (e.key === 'Escape') {
    closeUrlPopover();
    btnUrl.focus();
  }
});

async function fetchHtml(url) {
  try {
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return { html: await res.text(), viaProxy: false };
  } catch (directErr) {
    setStatus('直接拉取被 CORS 阻止，改走 corsproxy.io …');
    const proxied = 'https://corsproxy.io/?' + encodeURIComponent(url);
    try {
      const res = await fetch(proxied);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return { html: await res.text(), viaProxy: true };
    } catch (proxyErr) {
      const msg = (directErr && directErr.message) || '';
      throw new Error('拉取失败：直接 ' + (msg || '未知错误') + '；代理 ' + proxyErr.message);
    }
  }
}

btnUrlFetch.addEventListener('click', async () => {
  let url = urlInput.value.trim();
  if (!url) { urlInput.focus(); return; }
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  btnUrlFetch.disabled = true;
  btnUrlFetch.textContent = '拉取中…';
  setStatus('正在拉取 ' + url + ' …');
  try {
    const { html, viaProxy } = await fetchHtml(url);
    editor.value = html;
    closeUrlPopover();
    run();
    if (viaProxy) {
      requestAnimationFrame(() => {
        const chip = document.createElement('span');
        chip.className = 'chip';
        chip.textContent = '已通过 corsproxy.io 拉取';
        warnings.appendChild(chip);
      });
      showToast('✓ 已通过代理拉取');
    } else {
      showToast('✓ 已从 URL 载入');
    }
  } catch (e) {
    setStatus(e.message, 'warn');
    showToast(e.message);
  } finally {
    btnUrlFetch.disabled = false;
    btnUrlFetch.textContent = '获取';
  }
});

// ---------- URL fragment payload (for Skill flow) ----------
//
// Skill 跑完后跳转：
//   .../richtext/#payload=<base64-of-utf8-html>
// 页面读取 fragment，自动填入并处理。

function loadPayloadFromHash() {
  const hash = location.hash;
  if (!hash.startsWith('#payload=')) return;
  const b64 = hash.slice('#payload='.length);
  try {
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const decoded = new TextDecoder().decode(bytes);
    editor.value = decoded;
    run();
    history.replaceState(null, '', location.pathname);
    showToast('已从链接载入内容');
  } catch (e) {
    showToast('链接 payload 解析失败：' + e.message);
  }
}

window.addEventListener('hashchange', loadPayloadFromHash);
loadPayloadFromHash();
updateInputStats();
renderPreview('');

// ---------- sample ----------
const SAMPLE_HTML = `<!doctype html>
<html>
<head>
<style>
  body { font-family: sans-serif; max-width: 640px; margin: 0 auto; padding: 24px; color: #222; }
  h1 { font-size: 28px; color: #d97706; border-bottom: 3px solid #d97706; padding-bottom: 8px; }
  h2 { font-size: 20px; margin-top: 32px; color: #1c1917; }
  p { line-height: 1.8; }
  blockquote { border-left: 4px solid #d97706; background: #fffbeb; padding: 12px 16px; margin: 16px 0; color: #78716c; }
  code { background: #f5f5f4; padding: 2px 6px; border-radius: 4px; font-family: monospace; font-size: 0.9em; }
  .card { background: #fafaf9; border: 1px solid #e7e5e4; border-radius: 8px; padding: 16px; margin: 16px 0; }
  ul li { margin: 6px 0; }
  .tag { display: inline-block; padding: 2px 8px; background: #fef3c7; color: #92400e; border-radius: 999px; font-size: 12px; margin-right: 4px; }
</style>
<script>console.log("这段会被删掉");</script>
</head>
<body>
  <h1>示例文章：HTML 转公众号</h1>
  <p>这是一段示例文字，用来演示 <code>html-to-wechat</code> 的转换效果。</p>
  <p>原始 HTML 包含 <code>&lt;style&gt;</code> 和 <code>&lt;script&gt;</code>，转换后样式会被内联到每个元素的 <code>style</code> 属性上，script 会被删除。</p>

  <h2>它支持什么</h2>
  <ul>
    <li>所有 inline 样式（颜色、字体、边距、边框、圆角）</li>
    <li>表格、列表、引用块</li>
    <li>简单的卡片式布局</li>
  </ul>

  <blockquote>
    引用块也是可以的。公众号正文宽度大约 375-414 像素，桌面端的宽内容要注意。
  </blockquote>

  <div class="card">
    <p><strong>卡片样式</strong>：靠 inline style 模拟。Flex/Grid 在公众号里不稳定，纯靠 padding/margin 做盒模型最保险。</p>
    <p><span class="tag">提示</span><span class="tag">CSS 内联</span></p>
  </div>

  <h2>下一步</h2>
  <p>点底部「复制为富文本」按钮，去公众号后台编辑器 <code>Cmd+V</code> 粘贴即可。</p>
</body>
</html>`;
