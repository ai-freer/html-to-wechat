export function normalizePayload(value) {
  if (!value || !Array.isArray(value.images) || !value.images.length) throw new Error('images 必须是非空数组');
  const images = value.images.map((img, i) => {
    if (!img || typeof img.src !== 'string') throw new Error(`第 ${i + 1} 张图片缺少 src`);
    const url = new URL(img.src);
    if (!['http:', 'https:'].includes(url.protocol)
      && !/^data:image\/(png|jpeg|gif|webp);base64,/i.test(img.src)) throw new Error(`第 ${i + 1} 张图片 URL 不受支持`);
    return { src: img.src, alt: String(img.alt || `第 ${i + 1} 张`).replace(/^\d{1,3}\s*\/\s*/, ''), prompt: String(img.prompt || '') };
  });
  const tags = Array.isArray(value.captionTags) ? value.captionTags : String(value.captionTags || '').split(/\s+/);
  return { title: String(value.title || '图集'), captionTitle: String(value.captionTitle || ''),
    captionText: String(value.captionText || ''), captionTags: tags.map(String).filter(Boolean), images };
}

export function encodePayload(payload) {
  const bytes = new TextEncoder().encode(JSON.stringify(normalizePayload(payload)));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
