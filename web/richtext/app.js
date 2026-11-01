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
import { transform, DEFAULT_PLAN } from './transform.mjs?v=28';

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
  if (document.readyState === 'complete') setTimeout(snap, 1500);
  else window.addEventListener('load', function(){ setTimeout(snap, 1500); });
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

let previewBlobUrl = null;
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
  const markup = html
    ? `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>${wrapStyle}</style></head><body><div class="preview-card">${html}</div></body></html>`
    : `<!doctype html><html><head><style>html,body{margin:0;height:100%;background:#fafaf9}body{display:flex;align-items:center;justify-content:center;font-family:-apple-system,sans-serif;color:#a8a29e;font-size:13px}</style></head><body>在左侧输入 HTML 后预览出现在这里</body></html>`;
  const previousBlob = previewBlobUrl;
  previewBlobUrl = null;
  // srcdoc resolves #fragments against the editor URL. A blob document has its
  // own URL, so :target links stay inside the preview without enabling scripts.
  if (html && /<svg\b[\s\S]*?<style\b/i.test(html) && /\b(?:xlink:)?href\s*=\s*["']#/i.test(html)) {
    previewBlobUrl = URL.createObjectURL(new Blob([markup], { type: 'text/html' }));
    preview.removeAttribute('srcdoc');
    preview.src = previewBlobUrl;
  } else {
    preview.removeAttribute('src');
    preview.srcdoc = markup;
  }
  if (previousBlob) URL.revokeObjectURL(previousBlob);
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
  const seq = ++runSeq;
  btnCopy.disabled = true;
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
    ? [{ level: 'ok', text: '已执行脚本并截取当前内容，延迟内容请检查' }, ...result.warnings]
    : hasScript ? [{ level: 'warn', text: '动态内容截取超时，请检查预览' }, ...result.warnings] : result.warnings;
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
  ++runSeq;
  btnCopy.disabled = true;
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
<html lang="zh-CN"><head><meta charset="utf-8"><style>
  body { font-family: sans-serif; color: #25343a; max-width: 640px; margin: 0 auto; padding: 24px; }
  p { line-height: 1.85; margin: 14px 0; }
  h1 { font-size: 30px; line-height: 1.3; color: #173e39; margin: 12px 0; }
  h2 { font-size: 21px; color: #173e39; margin: 32px 0 12px; }
  .eyebrow { color: #25836a; font-size: 12px; letter-spacing: 2px; font-weight: bold; }
  .lead { color: #526c68; font-size: 16px; }
  .card { background-color: #edf6f1; border: 1px solid #c7e2d3; border-radius: 16px; padding: 18px; margin: 20px 0; }
  .tag { display: inline-block; background-color: #d8eee2; color: #23664f; border-radius: 20px; padding: 3px 10px; font-size: 12px; margin-right: 5px; }
  blockquote { border-left: 4px solid #42a47d; background-color: #f3f8f5; padding: 12px 16px; margin: 20px 0; color: #47665b; }
  table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px; }
  th, td { border: 1px solid #d3e4da; padding: 10px; text-align: left; }
  th { background-color: #e4f2e9; color: #245a45; }
  .note { font-size: 13px; color: #71847d; }
</style></head><body><article>
  <p class="eyebrow">FIELD NOTES · 01</p>
  <h1>让一篇文章，<br>从阅读走向体验</h1>
  <p class="lead">一份示例，展示正文、数据和 SVG 互动如何在公众号富文本中相遇。</p>
  <p><span class="tag">内容排版</span><span class="tag">数据表格</span><span class="tag">SVG 互动</span></p>
  <div class="card"><strong>先看重点</strong><p>好的内容不只是一屏文字：它可以用清晰的层级讲故事，用图形解释过程，也可以邀请读者点一下，探索预设的内容。</p></div>
  <h2>01 / 从信息到理解</h2>
  <p>想象你正在介绍一套内容工作流。与其把每个步骤堆成一长段，不如先给读者一张路线图，再展开细节。</p>
  <svg xmlns="http://www.w3.org/2000/svg" width="100%" viewBox="0 0 600 120" style="display:block;max-width:600px"><rect x="0" y="12" width="160" height="92" rx="14" fill="#e5f3eb"/><text x="80" y="50" text-anchor="middle" fill="#276a50" font-size="15">01</text><text x="80" y="78" text-anchor="middle" fill="#173e39" font-size="20">整理内容</text><path d="M175 58 H208 M208 50 L220 58 L208 66 Z" stroke="#69a98b" stroke-width="3" fill="#69a98b"/><rect x="220" y="12" width="160" height="92" rx="14" fill="#d5ede0"/><text x="300" y="50" text-anchor="middle" fill="#276a50" font-size="15">02</text><text x="300" y="78" text-anchor="middle" fill="#173e39" font-size="20">设计表达</text><path d="M395 58 H428 M428 50 L440 58 L428 66 Z" stroke="#69a98b" stroke-width="3" fill="#69a98b"/><rect x="440" y="12" width="160" height="92" rx="14" fill="#276e53"/><text x="520" y="50" text-anchor="middle" fill="#bce6cf" font-size="15">03</text><text x="520" y="78" text-anchor="middle" fill="#fff" font-size="20">分享体验</text></svg>
  <p class="note">示意图：用 SVG 绘制的内容路径。</p>
  <h2>02 / 把信息放在合适的位置</h2>
  <p>同一个主题可以使用不同的表达形式。下面是示例内容，不代表实际统计数据。</p>
  <table><thead><tr><th>表达形式</th><th>适合呈现</th><th>读者收获</th></tr></thead><tbody><tr><td>正文与引用</td><td>背景、观点</td><td>理解来龙去脉</td></tr><tr><td>表格与图解</td><td>对比、流程</td><td>快速看清关系</td></tr><tr><td>SVG 互动</td><td>预设演示</td><td>亲手探索过程</td></tr></tbody></table>
  <blockquote>先让信息容易理解，再让形式为内容服务。</blockquote>
  <h2>03 / 试试这个互动终端</h2>
  <p>先点击输入框，再点击「运行」，观察预设文字逐步出现。这是 SVG 模拟演示，不会输入或提交真实信息。</p>
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 680 380" width="100%" style="display:block;max-width:600px"><rect width="680" height="380" rx="18" fill="#122332"/><text x="30" y="40" fill="#9de5c4" font-size="20">交互终端 · 模拟输入</text><rect x="30" y="65" width="620" height="65" rx="10" fill="#314758"/><text x="45" y="107" fill="#91a5b2" font-size="18">点击这里输入预设指令</text>
<g opacity="0"><set attributeName="opacity" to="1" begin="click" dur="0.01s" fill="freeze"/><rect x="31" y="66" width="618" height="63" rx="9" fill="#314758"/><text x="50" y="107" fill="#fff" font-size="22">生</text><g opacity="0"><set attributeName="opacity" to="1" begin="click+0.3s" dur="0.01s" fill="freeze"/><text x="72" y="107" fill="#fff" font-size="22">成</text><g opacity="0"><set attributeName="opacity" to="1" begin="click+0.6s" dur="0.01s" fill="freeze"/><text x="94" y="107" fill="#fff" font-size="22">排</text><g opacity="0"><set attributeName="opacity" to="1" begin="click+0.9s" dur="0.01s" fill="freeze"/><text x="116" y="107" fill="#fff" font-size="22">版</text><rect x="30" y="65" width="620" height="65" fill="#000" fill-opacity="0" pointer-events="all"/></g></g></g></g>
<rect x="30" y="150" width="150" height="48" rx="9" fill="#5acb9f"/><text x="105" y="181" text-anchor="middle" fill="#14392b" font-size="19">运行 →</text><rect x="30" y="218" width="620" height="135" rx="10" fill="#1f3747"/>
<g opacity="0"><set attributeName="opacity" to="1" begin="click" dur="0.01s" fill="freeze"/><text x="50" y="252" fill="#b3cbd3" font-size="19">› 正在分析内容</text><g opacity="0"><set attributeName="opacity" to="1" begin="click+0.6s" dur="0.01s" fill="freeze"/><text x="50" y="291" fill="#b3cbd3" font-size="19">› 正在生成版式</text><g opacity="0"><set attributeName="opacity" to="1" begin="click+1.2s" dur="0.01s" fill="freeze"/><text x="50" y="330" fill="#79e6ad" font-size="19">✓ 已完成</text><rect x="30" y="150" width="150" height="48" fill="#000" fill-opacity="0" pointer-events="all"/></g></g></g></svg>
  <p class="note">互动效果可能因公众号编辑器和微信版本而异；粘贴后请保存草稿并在手机上预览。</p>
  <h2>把想法带到公众号</h2>
  <p>点击「复制为富文本」，粘贴到公众号编辑器，再检查排版与互动效果。让你的内容既有信息，也有值得停留的瞬间。</p>
</article></body></html>`;
