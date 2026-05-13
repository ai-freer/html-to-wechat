// Mode 3 · 口播稿统计分析（X-A 执行层纯函数）
//
// 从 web/script/app.mjs 抽出来的 analyze() 及辅助，去掉 DOM / browser 依赖。
//
// **同步约定**：本文件主体算法（countChars / splitSentences / splitSections /
// mdToPlain）与 web/script/app.mjs 必须保持等价行为。Bug 两处一起改。

/**
 * 主分析函数。输入 markdown，输出统计 + 警告。
 *
 * @param {string} md - markdown 文本（可含 `^## ` 段标题）
 * @returns {{
 *   chars: number,
 *   durationSec: number,
 *   sentenceCount: number,
 *   avgSentenceChars: number,
 *   sections: Array<{ title, durationHint, body, chars, computedDurationSec }>,
 *   warnings: string[]
 * }}
 */
export function analyze(md) {
  const plain = mdToPlain(md);
  const chars = countChars(plain);
  const sentences = splitSentences(plain);
  const sentenceCount = sentences.length;
  const avgSentenceChars = sentenceCount > 0 ? Math.round(chars / sentenceCount) : 0;
  const sections = splitSections(md);
  // 250 字/分钟 → 4 字/秒
  const durationSec = Math.round(chars / 4);

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

export function countChars(plain) {
  return plain.replace(/\s+/g, '').length;
}

export function splitSentences(plain) {
  return plain
    .split(/[。！？；]|[.!?;](?=\s|$)/)
    .map(s => s.trim())
    .filter(Boolean);
}

export function splitSections(md) {
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
  for (const s of sections) {
    s.chars = countChars(mdToPlain(s.body));
    s.computedDurationSec = Math.round(s.chars / 4);
  }
  return sections;
}

export function mdToPlain(md) {
  return md
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    .replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, '$1')
    .replace(/^\s*>\s?/gm, '')
    .replace(/\s+/g, ' ');
}
