// Markdown HTML is untrusted, including content delivered in URL fragments.
// Build an inert template, then retain only presentation tags and safe URLs.
const ALLOWED = new Set('p br hr h1 h2 h3 h4 h5 h6 ul ol li blockquote pre code strong b em i del s a img table thead tbody tr th td span'.split(' '));
const DROP = new Set('script style iframe object embed svg math template form input button textarea select link meta base'.split(' '));

function safeUrl(value, image, base) {
  try {
    const url = new URL(value, base);
    if (['http:', 'https:'].includes(url.protocol)) return true;
    if (!image && ['mailto:', 'tel:'].includes(url.protocol)) return true;
    return image && /^data:image\/(?:png|jpeg|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(value);
  } catch { return false; }
}

export function sanitizePreview(html, doc = document) {
  const template = doc.createElement('template');
  template.innerHTML = html;
  for (const el of [...template.content.querySelectorAll('*')]) {
    const tag = el.localName;
    if (DROP.has(tag)) { el.remove(); continue; }
    if (!ALLOWED.has(tag)) { el.replaceWith(...el.childNodes); continue; }
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase();
      const keep = ['title', 'alt'].includes(name)
        || (name === 'data-section-meta' && tag === 'h2')
        || (name === 'class' && tag === 'span' && attr.value === 'scene-comment')
        || (name === 'href' && tag === 'a' && safeUrl(attr.value, false, doc.baseURI))
        || (name === 'src' && tag === 'img' && safeUrl(attr.value, true, doc.baseURI));
      if (!keep) el.removeAttribute(attr.name);
    }
    if (tag === 'a') el.setAttribute('rel', 'noopener noreferrer');
  }
  return template.content;
}
