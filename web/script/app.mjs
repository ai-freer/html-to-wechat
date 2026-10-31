// Mode 3 · 口播稿预览页 · UI 层（极简）
//
// 输入路径：
//   - URL fragment：#payload=<base64-md>（agent 跑完 Skill 后跳本页时用）
//   - 上传 .md 文件
//   - 粘贴文本框
//   - 「载入示例」按钮
//
// 输出路径：
//   - marked 渲染预览
//   - 字数/时长/段落/句子/平均句长 元信息
//   - 复制纯文本 / 下载 .md / 下载 .txt
//
// 见 docs/03-html-to-script.md §4。

import { marked } from 'https://esm.sh/marked@13?bundle';
import { analyze, mdToPlain } from './analyze.mjs';
import { sanitizePreview } from './preview.mjs';

// ===== marked 配置 =====
marked.setOptions({
  gfm: true,
  breaks: true,        // 单 \n 直接换行（口播稿"一句一行"语义）
  headerIds: false,
});

// ===== DOM 引用 =====
const $ = (id) => document.getElementById(id);
const refs = {
  src: $('src'),
  preview: $('preview'),
  body: document.body,
  chars: $('m-chars'),
  duration: $('m-duration'),
  sections: $('m-sections'),
  sentences: $('m-sentences'),
  avg: $('m-avg'),
  warnings: $('m-warnings'),
  btnSample: $('btn-sample'),
  btnClear: $('btn-clear'),
  btnCopy: $('btn-copy'),
  btnMd: $('btn-download-md'),
  btnTxt: $('btn-download-txt'),
  fileInput: $('file-input'),
};

// ===== 示例口播稿（取自 docs/03 §例子）=====
const SAMPLE = `# L6 会话生存层

## 引入 · 痛点 (12s)

咱们聊聊 L6——会话生存层。

很多人以为，只要模型窗口够大，就不用管上下文了。

但你跑一个长任务三天后，最早那几句关键约定，已经被截断丢掉了。

## OpenClaw 怎么解决 (18s)

OpenClaw 是怎么解决的？

它有一个东西叫 Lossless Context Engine。实时摄入每一条消息，用 DAG、摘要、分层压缩，组装下一轮的上下文。

简单说：长对话不丢东西。

## 收尾 · 一句话记忆点 (8s)

记住一件事就够了——

会话生存，靠的不是窗口够大，是组装够聪明。
`;

// ===== 主流程 =====
async function init() {
  // 1. 解析 fragment 优先
  const fromFragment = parseFragment();
  if (fromFragment) {
    refs.src.value = fromFragment;
    rerender();
  }

  // An already-open preview must also accept the next Agent result link.
  window.addEventListener('hashchange', () => {
    const next = parseFragment();
    if (next !== null) {
      refs.src.value = next;
      rerender();
    }
  });

  // 2. 绑事件
  refs.src.addEventListener('input', rerender);
  refs.btnSample.addEventListener('click', () => {
    refs.src.value = SAMPLE;
    rerender();
  });
  refs.btnClear.addEventListener('click', () => {
    refs.src.value = '';
    rerender();
  });
  refs.btnCopy.addEventListener('click', onCopy);
  refs.btnMd.addEventListener('click', () => downloadAs('script.md', refs.src.value));
  refs.btnTxt.addEventListener('click', () => downloadAs('script.txt', mdToPlain(refs.src.value)));
  refs.fileInput.addEventListener('change', onFile);

  // 3. 首屏元信息
  rerender();
}

function rerender() {
  const md = refs.src.value || '';
  const stats = analyze(md);

  // 渲染预览（带段落时长注释）
  let html = '';
  if (md.trim()) {
    html = marked.parse(md);
    // 给 h2 加 data-section-meta（用对应 section 的字数 / 时长）
    html = annotateSectionMeta(html, stats.sections);
    // 把 <!-- scene: xxx --> 注释展开为视觉提示
    html = expandSceneComments(html);
    refs.body.dataset.state = 'has-content';
  } else {
    html = '<div class="empty">空。粘贴 markdown / 上传 .md / 点击 [载入示例] 试试。</div>';
    refs.body.dataset.state = 'empty';
  }
  refs.preview.replaceChildren(sanitizePreview(html, document));

  // 更新元信息
  refs.chars.textContent = stats.chars;
  refs.duration.textContent = formatDuration(stats.durationSec);
  refs.sections.textContent = stats.sections.length;
  refs.sentences.textContent = stats.sentenceCount;
  refs.avg.textContent = stats.avgSentenceChars;
  refs.warnings.textContent = stats.warnings.join(' · ');

  // 启用 / 禁用按钮
  const hasContent = md.trim().length > 0;
  refs.btnCopy.disabled = !hasContent;
  refs.btnMd.disabled = !hasContent;
  refs.btnTxt.disabled = !hasContent;
}

function annotateSectionMeta(html, sections) {
  // 给每个 <h2>...</h2> 加 data-section-meta 属性
  let sectionIndex = 0;
  return html.replace(/<h2(\s[^>]*)?>([^<]+)<\/h2>/g, (_, attrs, inner) => {
    const title = inner.trim();
    const sec = sections[sectionIndex++];
    if (!sec) return `<h2${attrs || ''}>${inner}</h2>`;
    const hint = sec.durationHint ? `${sec.durationHint}s` : `~${sec.computedDurationSec}s`;
    const meta = `${sec.chars} 字 · ${hint}`;
    return `<h2 data-section-meta="${escapeAttr(meta)}">${inner}</h2>`;
  });
}

function expandSceneComments(html) {
  // <!-- scene: 城市夜景 + 霓虹灯 --> → <span class="scene-comment">🎬 城市夜景 + 霓虹灯</span>
  return html.replace(/<!--\s*scene:\s*([\s\S]*?)\s*-->/gi,
    (_, content) => `<span class="scene-comment">🎬 ${escapeHtml(content.trim())}</span>`);
}

// ===== 时长格式化 =====
function formatDuration(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ===== I/O =====
function parseFragment() {
  const hash = location.hash || '';
  const m = hash.match(/payload=([^&]+)/);
  if (!m) return null;
  try {
    const decoded = atob(decodeURIComponent(m[1]));
    // 处理 UTF-8（atob 给的是字节流，要 escape + decode）
    const utf8 = decodeURIComponent(decoded.split('').map(c =>
      '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
    return utf8;
  } catch (e) {
    console.warn('parseFragment failed:', e);
    return null;
  }
}

async function onFile(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  refs.src.value = await file.text();
  rerender();
  // 复位 input 让同名文件能再次选
  e.target.value = '';
}

async function onCopy() {
  try {
    await navigator.clipboard.writeText(mdToPlain(refs.src.value));
    flashBtn(refs.btnCopy, '已复制 ✓');
  } catch (e) {
    flashBtn(refs.btnCopy, '复制失败');
    console.error(e);
  }
}

function flashBtn(btn, msg) {
  const old = btn.textContent;
  btn.textContent = msg;
  setTimeout(() => { btn.textContent = old; }, 1500);
}

function downloadAs(filename, content) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escapeAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

// ===== 启动 =====
init().catch(e => {
  console.error('init failed:', e);
  refs.preview.innerHTML = `<div class="empty">初始化失败：${escapeHtml(e.message)}</div>`;
});
