import * as cheerio from 'cheerio';

// Current DocxXML callouts accept text/list blocks, not resource blocks.
// Lift unsupported child blocks to adjacent siblings without discarding them.
export function normalizeNativeXml(xml) {
  const $ = cheerio.load(xml, { xmlMode: true, decodeEntities: false }, false);
  const warnings = [];
  $('callout').toArray().reverse().forEach(node => {
    const callout = $(node);
    callout.find('h1,h2,h3,h4,h5,h6,h7,h8,h9').each((_, h) => {
      $(h).replaceWith(`<p><b>${$(h).html() || ''}</b></p>`);
      warnings.push('callout 内标题降为加粗段落，以符合当前 XML 合约');
    });
    const allowed = new Set('p ol ul checkbox a b em del u code span br'.split(' '));
    const children = [...node.children];
    const output = [];
    let segment = [];
    const flush = () => {
      if (segment.some(c => c.type !== 'text' || c.data.trim())) {
        const clone = callout.clone().empty();
        for (const c of segment) clone.append($(c).clone());
        output.push(clone);
      }
      segment = [];
    };
    // Descendant resources inside p/li must be lifted too; unwrap their block
    // wrappers first so no invalid resource remains hidden in a text block.
    for (const child of children) {
      const nested = child.type === 'tag' ? $(child).find('img,table,pre,hr,grid,whiteboard,html5-block,callout') : $();
      if (nested.length) throw new Error('callout 的文本/列表子块内含资源块；请在 plan 中将资源移到相邻原生块后重试');
      if (child.type === 'tag' && !allowed.has(child.name)) {
        flush(); output.push($(child).clone());
        warnings.push(`callout 内 <${child.name}> 移至相邻块，保留原顺序`);
      } else segment.push(child);
    }
    flush();
    if (output.length) callout.replaceWith(output.map(part => $.xml(part)).join('')); else callout.remove();
  });
  return { docxxml: $.xml(), warnings };
}
