// HTML → 公众号富文本 v0.1
// Pipeline: parse → juice (CSS inline) → DOM cleanup → preview → clipboard

import juice from 'https://esm.sh/juice@10';

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
  // 等 load + 一拍 microtask，给 DOMContentLoaded 后还在跑的脚本一点缓冲
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
    // 没有 allow-same-origin → iframe 在 opaque origin 里，无法读主页 DOM/Storage
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

// ---------- pipeline ----------

/**
 * 主管线：HTML 字符串 → 公众号兼容 HTML + 元数据
 */
function process(rawHtml, options = {}) {
  if (!rawHtml.trim()) {
    return { html: '', text: '', stats: null, warnings: [] };
  }

  let inlinedHtml;
  try {
    inlinedHtml = juice(rawHtml, {
      removeStyleTags: true,
      preserveImportant: true,
      applyAttributesTableElements: true,
      applyStyleTags: true,
    });
  } catch (e) {
    return { html: '', text: '', stats: null, error: 'CSS 内联失败：' + e.message, warnings: [] };
  }

  // 解析为 DOM
  const parser = new DOMParser();
  const doc = parser.parseFromString(inlinedHtml, 'text/html');

  const counters = {
    scripts: 0,
    iframes: 0,
    forms: 0,
    inputs: 0,
    links: 0,
    ids: 0,
    images: 0,
    svgImages: 0,
    metas: 0,
    chromeStripped: 0,
    extractedFrom: null, // 'article' | 'main' | null
    layoutNormalized: 0,
  };

  // 1. 删除完全不允许的标签
  const banned = ['script', 'iframe', 'form', 'input', 'link', 'meta', 'noscript'];
  banned.forEach(tag => {
    const els = doc.querySelectorAll(tag);
    els.forEach(el => {
      if (tag === 'script') counters.scripts++;
      else if (tag === 'iframe') counters.iframes++;
      else if (tag === 'form') counters.forms++;
      else if (tag === 'input') counters.inputs++;
      else if (tag === 'link') counters.links++;
      else if (tag === 'meta') counters.metas++;
      el.remove();
    });
  });

  // 2. 删除残留 <style>（juice removeStyleTags 已处理大部分）
  doc.querySelectorAll('style').forEach(el => el.remove());

  // 3. 提取正文 / 剥离页面骨架（导航、页脚、侧边栏等）
  if (options.extractMain !== false && doc.body) {
    // 3a. 优先抓 <article>（多个则取文本最长的）
    let extracted = null;
    const articles = [...doc.querySelectorAll('article')];
    if (articles.length) {
      const best = articles.reduce((a, b) =>
        (b.textContent.length > a.textContent.length ? b : a)
      );
      if (best.textContent.trim().length > 200) extracted = best;
    }
    // 3b. 否则用 <main> / [role="main"]
    if (!extracted) {
      const m = doc.querySelector('main, [role="main"]');
      if (m && m.textContent.trim().length > 200) extracted = m;
    }
    if (extracted) {
      // 抽出来了就完全信任：内部的 <aside>（callout / 引用框）、<nav>（TOC）等都是作者意图的一部分。
      const wrap = doc.createElement('body');
      wrap.appendChild(extracted.cloneNode(true));
      doc.body.replaceWith(wrap);
      counters.extractedFrom = extracted.tagName.toLowerCase();
    } else {
      // 没找到正文容器，按"页面级骨架"的启发式删
      const chromeSelectors = [
        'nav', 'aside',
        '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]',
        '[role="complementary"]', '[role="search"]',
      ];
      chromeSelectors.forEach(sel => {
        doc.querySelectorAll(sel).forEach(el => {
          el.remove();
          counters.chromeStripped++;
        });
      });
      if (doc.body) {
        [...doc.body.children].forEach(el => {
          const tag = el.tagName.toLowerCase();
          if (tag === 'header' || tag === 'footer') {
            el.remove();
            counters.chromeStripped++;
          }
        });
      }
    }
  }

  // 4. 规范化布局：公众号会丢弃 flex/grid/绝对定位 → 我们提前降级，preview 才能反映真实效果
  doc.querySelectorAll('[style]').forEach(el => {
    const before = el.getAttribute('style') || '';
    let after = before;

    // display: flex|grid|inline-flex|inline-grid → block|inline-block
    after = after.replace(
      /display\s*:\s*(inline-)?(flex|grid)\s*(!important)?\s*;?/gi,
      (_m, inline) => {
        counters.layoutNormalized++;
        return `display: ${inline ? 'inline-block' : 'block'};`;
      }
    );
    // position: absolute|fixed|sticky → 删（保留 relative/static）
    after = after.replace(
      /position\s*:\s*(absolute|fixed|sticky)\s*(!important)?\s*;?/gi,
      () => {
        counters.layoutNormalized++;
        return '';
      }
    );

    if (after !== before) {
      const trimmed = after.replace(/;\s*;/g, ';').trim();
      if (trimmed) el.setAttribute('style', trimmed);
      else el.removeAttribute('style');
    }
  });

  // 5. 删除所有元素的 id 属性（公众号会强制剥离）
  doc.querySelectorAll('[id]').forEach(el => {
    counters.ids++;
    el.removeAttribute('id');
  });

  // 5. 统计图片
  doc.querySelectorAll('img').forEach(img => {
    counters.images++;
  });
  doc.querySelectorAll('svg image').forEach(img => {
    counters.svgImages++;
  });

  // 6. 提取 body 内容（公众号粘贴只关心正文）
  const bodyHtml = doc.body ? doc.body.innerHTML : doc.documentElement.innerHTML;
  const cleanedBody = bodyHtml.trim();

  // 7. 纯文本 fallback（用于 text/plain MIME）
  const textVersion = doc.body ? doc.body.textContent.replace(/\s+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim() : '';

  // 8. 警告（按级别排序：ok 在前，warn 在后；隐藏 0 计数）
  const oks = [];
  const warns = [];
  if (counters.extractedFrom) {
    oks.push(`已提取 <${counters.extractedFrom}> 正文`);
  }
  if (counters.chromeStripped > 0) {
    oks.push(`已剥离 ${counters.chromeStripped} 个导航/页脚/侧栏`);
  }
  // 已清理（只列非零项）
  const cleaned = [];
  if (counters.scripts > 0) cleaned.push(`${counters.scripts} script`);
  if (counters.iframes > 0) cleaned.push(`${counters.iframes} iframe`);
  if (counters.forms > 0) cleaned.push(`${counters.forms} form`);
  if (cleaned.length) oks.push(`已清理 ${cleaned.join(' / ')}`);

  if (counters.layoutNormalized > 0) {
    oks.push(`已规范化 ${counters.layoutNormalized} 处布局（flex/grid/绝对定位 → block）`);
  }

  if (counters.images > 0) {
    warns.push(`${counters.images} 张 <img> 需手动换素材库链接`);
  }
  if (counters.svgImages > 0) {
    warns.push(`${counters.svgImages} 个 SVG <image> 需手动换素材库链接`);
  }

  const allWarns = [
    ...oks.map(t => ({ level: 'ok', text: t })),
    ...warns.map(t => ({ level: 'warn', text: t })),
  ];

  return {
    html: cleanedBody,
    text: textVersion,
    stats: {
      bytes: new Blob([cleanedBody]).size,
      chars: cleanedBody.length,
      counters,
    },
    warnings: allWarns,
  };
}

// ---------- UI ----------

function renderPreview(html) {
  // 用 srcdoc 让 iframe 自己当 document，sandbox 已禁 script
  // 外层留浅灰，内层卡片模拟公众号阅读视宽（移动端 ~414px，留点呼吸宽到 480）
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

let editorView = 'source'; // 'source' | 'render'

function renderRawPreview() {
  const raw = editor.value;
  if (!raw.trim()) {
    rawPreview.srcdoc = '<!doctype html><html><head><style>html,body{margin:0;height:100%;background:#fafaf9}body{display:flex;align-items:center;justify-content:center;font-family:-apple-system,sans-serif;color:#a8a29e;font-size:13px}</style></head><body>切回「源码」输入 HTML 后这里会显示原始渲染效果</body></html>';
    return;
  }
  // base target=_blank so any links open in a new tab; sandbox blocks scripts
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

  // pre-render in sandboxed iframe so JS-populated nodes (e.g. badges) are captured
  const { html: rendered, executed } = await preRender(raw);
  if (seq !== runSeq) return; // a newer run started; discard

  const result = process(rendered, { extractMain: optExtractMain.checked });

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

  // surface "scripts were executed" as a top-of-row chip
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
    // 退化：用 execCommand 复制纯 HTML 字符串（不会被识别为富文本）
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
  // 1) try direct
  try {
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return { html: await res.text(), viaProxy: false };
  } catch (directErr) {
    // 2) fall back to corsproxy.io
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
      // 在 warnings 行追加一个提示 chip（run() 内的 renderWarnings 会基于新内容重渲染，
      // 所以这里在下一帧追加）
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
    // base64 → bytes → utf-8 string
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const decoded = new TextDecoder().decode(bytes);
    editor.value = decoded;
    run();
    history.replaceState(null, '', location.pathname); // 清掉超长 URL
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
