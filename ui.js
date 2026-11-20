// 화면 공통 도우미 (캘린더·홈에서 사용)
window.UI = (function () {
  const won = (n) => n.toLocaleString('ko-KR') + '원';

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text; // 항상 textContent: 친구가 보낸 글에 코드가 있어도 실행되지 않음
    return e;
  }

  // 이름마다 항상 같은 색 (6색 중 하나)
  function avatar(name, small) {
    let h = 0;
    for (const ch of name) h = (h * 31 + ch.codePointAt(0)) % 997;
    const a = el('span', 'av c' + (h % 6) + (small ? ' s' : ''), Array.from(name)[0] || '?');
    a.setAttribute('aria-hidden', 'true');
    return a;
  }

  function toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast.t);
    toast.t = setTimeout(() => t.classList.remove('show'), 2200);
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;font-size:16px';
      document.body.append(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (err) {}
      ta.remove();
      return ok;
    }
  }

  return { won, el, avatar, toast, copyText };
})();
