const status = document.querySelector('#copy-status');
let timer;
function revealFragment() {
  const id = location.hash.slice(1);
  const target = document.getElementById(id);
  if (target?.tagName === 'DETAILS') {
    target.open = true;
    target.scrollIntoView({ block: 'start' });
  }
}
window.addEventListener('hashchange', revealFragment);
revealFragment();
document.addEventListener('click', async (event) => {
  const link = event.target.closest('a[href^="#"]');
  if (link && link.hash === location.hash) revealFragment();
  const button = event.target.closest('button[data-copy]');
  if (!button) return;
  const source = document.getElementById(button.dataset.copy);
  if (!source) return;
  clearTimeout(timer);
  try {
    await navigator.clipboard.writeText(source.textContent.trim());
    status.textContent = '已复制，可粘贴使用';
  } catch {
    // Preserve a usable manual route when clipboard permission is unavailable.
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(source);
    selection.removeAllRanges();
    selection.addRange(range);
    status.textContent = '自动复制不可用，已选中文本，请手动复制';
  }
  timer = setTimeout(() => { status.textContent = ''; }, 5000);
});
