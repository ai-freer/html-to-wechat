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
  refs.preview.innerHTML = html;

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

// ===== 分析 =====
function analyze(md) {
  // 去除 markdown 后的纯文本（用于字数 / 句数统计）
  const plain = mdToPlain(md);
  const chars = countChars(plain);
  const sentences = splitSentences(plain);
  const sentenceCount = sentences.length;
  const avgSentenceChars = sentenceCount > 0 ? Math.round(chars / sentenceCount) : 0;

  // 段落：按 `^## ` 切（一级标题 # 视为整篇标题，不算段落）
  const sections = splitSections(md);

  // 时长：250 字/分钟 → 4 字/秒
  const durationSec = Math.round(chars / 4);

  // 警告
  const warnings = [];
  if (sentenceCount > 0 && avgSentenceChars > 35) {
    warnings.push(`平均句长 ${avgSentenceChars} 字，偏长（建议 ≤ 30 字）`);
  }
  const longSentences = sentences.filter(s => s.length > 50).length;
  if (longSentences > 0) {
    warnings.push(`${longSentences} 句超 50 字`);
  }
  if (sections.length === 0 && chars > 200) {
    warnings.push(`无 ## 段落切分（>200 字建议切段）`);
  }

  return { chars, durationSec, sections, sentenceCount, avgSentenceChars, warnings };
}

function countChars(plain) {
  // 中文字符 + 英文 word 都按 1 计；空白和标点不算
  // 简化：去空白后字符数
  return plain.replace(/\s+/g, '').length;
}

function splitSentences(plain) {
  // 中文句末标点：。！？；
  // 英文：. ! ? ; （后跟空格或行尾）
  return plain
    .split(/[。！？；]|[.!?;](?=\s|$)/)
    .map(s => s.trim())
    .filter(Boolean);
}

function splitSections(md) {
  const lines = md.split('\n');
  const sections = [];
  let cur = null;
  for (const line of lines) {
    const m = line.match(/^##\s+(.+?)(?:\s+\((\d+(?:\.\d+)?)\s*s?\))?\s*$/i);
    if (m) {
      if (cur) sections.push(cur);
      cur = {
        title: m[1].trim(),
        durationHint: m[2] ? parseFloat(m[2]) : null,
        body: '',
      };
    } else if (cur && !line.match(/^#\s/)) {
      cur.body += line + '\n';
    }
  }
  if (cur) sections.push(cur);

  // 为每个 section 算字数 + 时长
  for (const s of sections) {
    s.chars = countChars(mdToPlain(s.body));
    s.computedDurationSec = Math.round(s.chars / 4);
  }
  return sections;
}

function mdToPlain(md) {
  return md
    .replace(/<!--[\s\S]*?-->/g, ' ')           // 移除 HTML 注释（含 scene: 标记）
    .replace(/```[\s\S]*?```/g, ' ')             // 移除代码块
    .replace(/`([^`]+)`/g, '$1')                 // 内联代码 → 纯文本
    .replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')       // 图片
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')     // 链接 → 文字
    .replace(/^#{1,6}\s+/gm, '')                  // 标题 #
    .replace(/^[-*+]\s+/gm, '')                   // 列表
    .replace(/^\d+\.\s+/gm, '')                   // 有序列表
    .replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, '$1') // 加粗 / 斜体
    .replace(/^\s*>\s?/gm, '')                    // 引用
    .replace(/\s+/g, ' ');
}

function annotateSectionMeta(html, sections) {
  // 给每个 <h2>...</h2> 加 data-section-meta 属性
  const titles = new Map(sections.map(s => [s.title, s]));
  return html.replace(/<h2(\s[^>]*)?>([^<]+)<\/h2>/g, (_, attrs, inner) => {
    const title = inner.trim();
    const sec = titles.get(title);
    if (!sec) return `<h2${attrs || ''}>${inner}</h2>`;
    const hint = sec.durationHint ? `${sec.durationHint}s` : `~${sec.computedDurationSec}s`;
    const meta = `${sec.chars} 字 · ${hint}`;
    return `<h2 data-section-meta="${escapeAttr(meta)}">${inner}</h2>`;
  });
}

function expandSceneComments(html) {
  // <!-- scene: 城市夜景 + 霓虹灯 --> → <span class="scene-comment">🎬 城市夜景 + 霓虹灯</span>
  return html.replace(/&lt;!--\s*scene:\s*([^-]+?)\s*--&gt;/gi,
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
