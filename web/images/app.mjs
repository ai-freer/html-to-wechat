// Mode 2 app 态 · fragment 解析 + 拖排序 + 单图重生 + zip 打包
//
// 触发条件：
//   - URL hash `#app=<base64-utf8-json>` 含完整图集 payload（agent 投递）
//   - 无 payload 时展示示例图集，并启用相同的预览、排序与下载工具
//
// payload schema：
//   {
//     "title": "上下文管理九层塔",
//     "captionText": "🧱 大上下文窗口...",
//     "captionTags": "#AIAgent #LLM ...",
//     "images": [
//       { "src": "data:image/png;base64,..." | "https://...", "alt": "封面", "prompt": "..." },
//       ...
//     ]
//   }
//
// 见 docs/02-html-to-images.md §5 fragment 协议（待补 v0.2 章节）

import JSZip from 'https://esm.sh/jszip@3.10.1';
import { normalizePayload, encodePayload } from './payload.mjs';

let currentPayload = null;

const url = new URL(window.location.href);
const hash = window.location.hash || '';
const fragMatch = /^#app=([A-Za-z0-9+/=_-]+)$/.exec(hash);
const isAppMode = hash.startsWith('#app=') || url.searchParams.get('app') === 'true';

{
  document.body.dataset.mode = isAppMode ? 'app' : 'demo';

  let payload = null;
  if (hash.startsWith('#app=') && !fragMatch) {
    document.querySelector('.subpage-hero .lede').textContent = '图集链接无效：缺少或损坏的 payload。请让 Agent 重新生成链接。';
    throw new Error('invalid app fragment');
  }
  if (fragMatch) {
    try {
      const b64 = fragMatch[1].replace(/-/g, '+').replace(/_/g, '/');
      const json = decodeURIComponent(escape(atob(b64)));
      payload = normalizePayload(JSON.parse(json));
    } catch (e) {
      console.error('[mode-2 app] fragment 解析失败:', e);
      document.querySelector('.subpage-hero .lede').textContent = `图集链接无效：${e.message}。请让 Agent 重新生成链接。`;
      throw e;
    }
  }

  initAppMode(payload);
  window.addEventListener('hashchange', () => { if (location.hash.startsWith('#app=')) location.reload(); });
}

// ===========================================================================
// 主流程
// ===========================================================================

function initAppMode(payload) {
  currentPayload = payload;
  // 1) 替换 hero 文案为 app-mode 提示
  const lede = document.querySelector('.subpage-hero .lede');
  if (lede && (payload || isAppMode)) {
    lede.innerHTML = payload
      ? `app 态 · agent 已投递 <b>${payload.images?.length || 0}</b> 张图。可拖拽排序、单图重生（复制 prompt 粘给 agent）、一键打包 zip。`
      : `app 态预览（无 fragment payload）。拖排序 / zip 下载用 demo 图演示，单图重生需要真实 fragment 才有 prompt。`;
  }

  // 2) 如果有 payload，用其 images 替换静态 gallery 内容
  if (payload?.images?.length) {
    rebuildGallery(payload.images);
  }
  if (payload?.title) {
    document.querySelector('.subpage-hero h1').textContent = payload.title;
    document.title = `${payload.title} · HTML-to-WeChat 图集 app`;
  }
  if (payload && Object.hasOwn(payload, 'captionText')) {
    const body = document.querySelector('.caption-body');
    if (body) body.textContent = payload.captionText;
  }
  if (payload && Object.hasOwn(payload, 'captionTags')) {
    const tags = document.querySelector('.caption-tags');
    if (tags) tags.textContent = payload.captionTags.join(' ');
  }

  if (payload) {
    document.querySelector('#gallery h2').textContent = payload.title || '图集';
    document.querySelector('#gallery .section-head p')?.replaceChildren(document.createTextNode('Agent 生成图集 · 请核对文字、顺序和图片内容。'));
    document.querySelector('.gallery-hint').textContent = `共 ${payload.images.length} 张 · 可拖排 · 点击单图放大`;
    document.querySelector('.caption-sample h3').textContent = payload.captionTitle || payload.title || '配套文案';
  }
  if (!payload) document.querySelector('.gallery-hint').textContent = '示例图集 · 可拖拽排序 · 点击单图放大；重做请求不含原始提示词';
  // Page anchors must not replace the fragment carrying the delivered content.
  document.querySelectorAll('a[href="#gallery"], a[href="#how"]').forEach(a => {
    a.addEventListener('click', e => { e.preventDefault(); document.querySelector(a.getAttribute('href'))?.scrollIntoView(); });
  });

  // 3) 改造 gallery：drag 排序 + 每图加重生按钮
  enhanceGallery();

  // 4) caption 区域加"复制全文"按钮
  enhanceCaption();

  // 5) 加全局工具栏：zip 下载 + 复制 fragment
  injectToolbar(payload);
}

// ===========================================================================
// 重建 gallery from payload.images
// ===========================================================================

function rebuildGallery(images) {
  const gallery = document.querySelector('.gallery');
  if (!gallery) return;
  gallery.innerHTML = '';
  images.forEach((img, i) => {
    const item = document.createElement('a');
    item.className = 'gallery-item';
    item.dataset.idx = String(i + 1).padStart(2, '0');
    item.href = img.src;
    item.setAttribute('role', 'listitem');
    item.draggable = true;
    if (img.prompt) item.dataset.prompt = img.prompt;

    const num = document.createElement('span');
    num.className = 'gallery-num';
    const rawAlt = img.alt || `第 ${i + 1} 张`;
    const altNoPrefix = rawAlt.replace(/^\d{1,3}\s*\/\s*/, '');
    num.textContent = `${item.dataset.idx} / ${altNoPrefix}`;
    item.appendChild(num);

    const imgEl = document.createElement('img');
    imgEl.src = img.src;
    imgEl.alt = img.alt || `第 ${i + 1} 张`;
    imgEl.loading = 'lazy';
    item.appendChild(imgEl);

    gallery.appendChild(item);
  });
}

// ===========================================================================
// drag 排序 + 单图重生按钮
// ===========================================================================

function enhanceGallery() {
  const gallery = document.querySelector('.gallery');
  if (!gallery) return;
  let dragged = null;

  gallery.querySelectorAll('.gallery-item').forEach((item, idx) => {
    item.draggable = true;
    item.classList.add('app-mode-item');

    // 加重生按钮
    if (!item.querySelector('.regen-btn')) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'regen-btn';
      btn.textContent = '↻ 重生';
      btn.title = '复制 prompt 给 agent 让它重新生成这张图';
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        handleRegen(item, idx);
      });
      item.appendChild(btn);
    }

    item.addEventListener('dragstart', () => {
      dragged = item;
      item.classList.add('dragging');
    });
    item.addEventListener('dragend', () => {
      if (dragged) dragged.classList.remove('dragging');
      dragged = null;
      renumber();
    });
    item.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (!dragged || dragged === item) return;
      const rect = item.getBoundingClientRect();
      const after = (e.clientX - rect.left) > rect.width / 2;
      item.parentNode.insertBefore(dragged, after ? item.nextSibling : item);
    });
  });
}

function renumber() {
  document.querySelectorAll('.gallery .gallery-item').forEach((item, i) => {
    const idx = String(i + 1).padStart(2, '0');
    item.dataset.idx = idx;
    const num = item.querySelector('.gallery-num');
    if (num) {
      const after = num.textContent.split('/').slice(1).join('/').trim();
      num.textContent = `${idx} / ${after || '图集'}`;
    }
  });
  persistOrder();
}

function persistOrder() {
  const images = [...document.querySelectorAll('.gallery-item')].map(item => ({
    src: item.href, alt: item.querySelector('img').alt, prompt: item.dataset.prompt || '',
  }));
  currentPayload = { ...(currentPayload || { title: document.querySelector('h1').textContent, captionText: document.querySelector('.caption-body')?.textContent || '', captionTags: (document.querySelector('.caption-tags')?.textContent || '').split(/\s+/).filter(Boolean) }), images };
  const next = new URL(location.href);
  next.hash = `app=${encodePayload(currentPayload)}`;
  history.replaceState(null, '', next);
}

async function handleRegen(item, idx) {
  const prompt = item.dataset.prompt;
  const rawAlt = item.querySelector('img')?.alt || `第 ${idx + 1} 张`;
  const alt = rawAlt.replace(/^\d{1,3}\s*\/\s*/, '');
  const message = prompt
    ? `重做第 ${item.dataset.idx} 张「${alt}」。原始 prompt：\n\n${prompt}\n\n请使用当前宿主或用户指定的生图工具，保持原图比例、同组风格和文字内容；局部问题优先修改原图，核对结果后更新 fragment payload。`
    : `重做第 ${item.dataset.idx} 张「${alt}」。这张图没有原始 prompt，请基于上下文使用当前宿主或用户指定的生图工具，保持原图比例、同组风格和文字内容；核对结果后更新 fragment payload。`;
  try {
    await navigator.clipboard.writeText(message);
    flashToast(`已复制 prompt → 粘到 agent 终端让它重做第 ${item.dataset.idx} 张`);
  } catch {
    // 兼容降级：弹窗显示
    alert(message);
  }
}

// ===========================================================================
// caption 复制
// ===========================================================================

function enhanceCaption() {
  const sample = document.querySelector('.caption-sample');
  if (!sample) return;
  if (sample.querySelector('.caption-copy')) return;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'caption-copy';
  btn.textContent = '📋 复制文案 + 标签';
  btn.addEventListener('click', async () => {
    const text = (sample.querySelector('.caption-body')?.textContent || '') + '\n\n' +
                 (sample.querySelector('.caption-tags')?.textContent || '');
    try {
      await navigator.clipboard.writeText(text.trim());
      flashToast('已复制完整文案 + 标签');
    } catch {
      alert(text);
    }
  });
  sample.appendChild(btn);
}

// ===========================================================================
// 工具栏（zip 下载 / 复制 fragment）
// ===========================================================================

function injectToolbar(payload) {
  if (document.querySelector('.app-toolbar')) return;
  const main = document.querySelector('main.subpage');
  if (!main) return;

  const bar = document.createElement('div');
  bar.className = 'app-toolbar';
  bar.innerHTML = `
    <button type="button" class="tb-zip">📦 下载 zip（图集 + 文案）</button>
    <button type="button" class="tb-copy-frag">🔗 复制 app 链接（fragment）</button>
    <span class="tb-hint">app 态状态自动持久在 URL hash 里 · 可直接收藏</span>
  `;
  // 插到 gallery section 之后
  const gallerySection = document.querySelector('#gallery');
  gallerySection?.parentNode.insertBefore(bar, gallerySection.nextSibling);

  bar.querySelector('.tb-zip').addEventListener('click', async e => {
    e.currentTarget.disabled = true;
    try { await downloadZip(payload); }
    catch (error) { flashToast(`打包失败：${error.message}`); }
    finally { bar.querySelector('.tb-zip').disabled = false; }
  });
  bar.querySelector('.tb-copy-frag').addEventListener('click', async () => {
    await copyFragmentUrl();
  });
}

async function downloadZip(payload) {
  const items = [...document.querySelectorAll('.gallery .gallery-item')];
  if (!items.length) {
    flashToast('没有图集可打包');
    return;
  }
  flashToast(`正在打包 ${items.length} 张图...`);
  const zip = new JSZip();

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const img = item.querySelector('img');
    if (!img) continue;
    const idx = String(i + 1).padStart(2, '0');
    const rawAlt = img.alt || `第 ${i + 1} 张`;
    const alt = rawAlt.replace(/^\d{1,3}\s*\/\s*/, '');
    const safeAlt = alt.replace(/[^\w一-龥-]/g, '_').slice(0, 40);
    const fname = `${idx}-${safeAlt}.png`;
    try {
      const response = await fetch(item.href);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      if (!/^image\/(png|jpeg|gif|webp)(?:;|$)/i.test(blob.type)) throw new Error('响应不是支持的图片');
      const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' }[blob.type.split(';')[0].toLowerCase()];
      zip.file(fname.replace(/\.png$/, '.' + ext), blob);
    } catch (e) {
      console.warn('zip failed:', fname, e.message);
      flashToast(`打包失败：第 ${i + 1} 张图片不可下载（${e.message}）。未生成不完整 ZIP。`);
      return;
    }
  }

  // caption.txt
  const cap = document.querySelector('.caption-body')?.textContent || '';
  const tags = document.querySelector('.caption-tags')?.textContent || '';
  zip.file('caption.txt', (cap + '\n\n' + tags).trim());

  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(payload?.title || 'html-to-images-app').replace(/[^\w一-龥-]/g, '_')}.zip`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
  flashToast('zip 已下载');
}

async function copyFragmentUrl() {
  persistOrder();
  try {
    await navigator.clipboard.writeText(window.location.href);
    flashToast('已复制 app URL（含 fragment）');
  } catch {
    alert(window.location.href);
  }
}

// ===========================================================================
// Toast
// ===========================================================================

function flashToast(text) {
  let t = document.querySelector('.app-toast');
  if (!t) {
    t = document.createElement('div');
    t.className = 'app-toast';
    document.body.appendChild(t);
  }
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 2200);
}
