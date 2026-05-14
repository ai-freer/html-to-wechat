// Mode 2 app 态 · fragment 解析 + 拖排序 + 单图重生 + zip 打包
//
// 触发条件：
//   - URL hash `#app=<base64-utf8-json>` 含完整图集 payload（agent 投递）
//   - 或 query `?app=true` 仅打开 app 态壳子（无 payload，沿用静态 demo 图集做交互演示）
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

const url = new URL(window.location.href);
const hash = window.location.hash || '';
const fragMatch = /#app=([A-Za-z0-9+/=_-]+)/.exec(hash);
const isAppMode = !!fragMatch || url.searchParams.get('app') === 'true';

if (isAppMode) {
  document.body.dataset.mode = 'app';

  let payload = null;
  if (fragMatch) {
    try {
      const b64 = fragMatch[1].replace(/-/g, '+').replace(/_/g, '/');
      const json = decodeURIComponent(escape(atob(b64)));
      payload = JSON.parse(json);
    } catch (e) {
      console.error('[mode-2 app] fragment 解析失败:', e);
      payload = null;
    }
  }

  initAppMode(payload);
}

// ===========================================================================
// 主流程
// ===========================================================================

function initAppMode(payload) {
  // 1) 替换 hero 文案为 app-mode 提示
  const lede = document.querySelector('.subpage-hero .lede');
  if (lede) {
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
  if (payload?.captionText) {
    const body = document.querySelector('.caption-body');
    if (body) body.textContent = payload.captionText;
  }
  if (payload?.captionTags) {
    const tags = document.querySelector('.caption-tags');
    if (tags) tags.textContent = payload.captionTags;
  }

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
}

async function handleRegen(item, idx) {
  const prompt = item.dataset.prompt;
  const rawAlt = item.querySelector('img')?.alt || `第 ${idx + 1} 张`;
  const alt = rawAlt.replace(/^\d{1,3}\s*\/\s*/, '');
  const message = prompt
    ? `重做第 ${item.dataset.idx} 张「${alt}」。原始 prompt：\n\n${prompt}\n\n请直接调用 gpt-image-2 生成新图（保持同样 1024x1536 比例 / 风格），然后 update fragment payload。`
    : `重做第 ${item.dataset.idx} 张「${alt}」。这张图没有原始 prompt，请基于上下文重新构思 + 用 gpt-image-2 出图。`;
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

  bar.querySelector('.tb-zip').addEventListener('click', async () => {
    await downloadZip(payload);
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
      const blob = await fetch(img.src).then(r => r.blob());
      zip.file(fname, blob);
    } catch (e) {
      console.warn('zip skip:', fname, e.message);
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
