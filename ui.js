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


  // ----- 강아지 친구: 화면 오른쪽 아래에서 빼꼼 보다가, 약속을 잡으면 신나하고 정산이 끝나면 엄지를 들어 줌 -----
  const Mascot = (function () {
    const SVG = `<svg viewBox="-2 0 106 112" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
<g class="dog">
<path class="tail" d="M70 94 Q92 86 88 64" fill="none" stroke="#D9985A" stroke-width="8" stroke-linecap="round"/>
<ellipse cx="50" cy="90" rx="25" ry="19" fill="#F0C48F"/>
<ellipse cx="50" cy="94" rx="14" ry="13" fill="#FFF3E0"/>
<g data-s="idle happy sad"><ellipse cx="37" cy="106" rx="9" ry="5.5" fill="#FFF3E0"/><ellipse cx="63" cy="106" rx="9" ry="5.5" fill="#FFF3E0"/></g>
<g data-s="thumb"><ellipse cx="37" cy="106" rx="9" ry="5.5" fill="#FFF3E0"/></g>
<path class="ear-l" d="M27 28 Q10 34 14 60 Q27 58 33 42 Z" fill="#C98445"/>
<path class="ear-r" d="M73 28 Q90 34 86 60 Q73 58 67 42 Z" fill="#C98445"/>
<circle cx="50" cy="46" r="27" fill="#F0C48F"/>
<ellipse cx="50" cy="57" rx="15" ry="11" fill="#FFF3E0"/>
<circle cx="33" cy="55" r="4.5" fill="#FFB4A2" opacity=".55"/><circle cx="67" cy="55" r="4.5" fill="#FFB4A2" opacity=".55"/>
<g class="eyes" data-s="idle"><circle cx="39" cy="43" r="3.6" fill="#2B2B33"/><circle cx="61" cy="43" r="3.6" fill="#2B2B33"/><circle cx="40.2" cy="41.8" r="1.2" fill="#fff"/><circle cx="62.2" cy="41.8" r="1.2" fill="#fff"/></g>
<g data-s="happy thumb"><path d="M34.5 45 Q39 37.5 43.5 45" fill="none" stroke="#2B2B33" stroke-width="2.8" stroke-linecap="round"/><path d="M56.5 45 Q61 37.5 65.5 45" fill="none" stroke="#2B2B33" stroke-width="2.8" stroke-linecap="round"/></g>
<g data-s="sad"><circle cx="39" cy="44" r="4.2" fill="#2B2B33"/><circle cx="61" cy="44" r="4.2" fill="#2B2B33"/><circle cx="40.6" cy="42.4" r="1.7" fill="#fff"/><circle cx="62.6" cy="42.4" r="1.7" fill="#fff"/><path d="M32 38.5 L44 34.5 M68 38.5 L56 34.5" fill="none" stroke="#8A5A2B" stroke-width="2.4" stroke-linecap="round"/><path class="tear" d="M35 49 Q32.2 54 35 56.5 Q37.8 54 35 49 Z" fill="#7CC4FF"/></g>
<ellipse cx="50" cy="52" rx="5" ry="3.7" fill="#3B2A22"/>
<g data-s="idle thumb"><path d="M50 55.5 V59 M43.5 58.5 Q50 64.5 56.5 58.5" fill="none" stroke="#3B2A22" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></g>
<g data-s="sad"><path d="M50 55.5 V58.5 M43.5 64 Q50 56.5 56.5 64" fill="none" stroke="#3B2A22" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></g>
<g data-s="happy"><path d="M42.5 58 Q50 74 57.5 58 Z" fill="#7A2E35" stroke="#3B2A22" stroke-width="1.6" stroke-linejoin="round"/><ellipse cx="50" cy="66.5" rx="4.6" ry="3.2" fill="#FF8FA3"/></g>
<g data-s="thumb"><path d="M64 88 Q82 90 84 80" fill="none" stroke="#F0C48F" stroke-width="10" stroke-linecap="round"/><ellipse cx="82.5" cy="60.5" rx="4.6" ry="8.5" transform="rotate(-10 82.5 60.5)" fill="#FFF3E0" stroke="#D9985A" stroke-width="1.1"/><ellipse cx="87" cy="74" rx="12" ry="10" fill="#FFF3E0" stroke="#D9985A" stroke-width="1.1"/><path d="M82 69.5 Q88 68 97 70 M81.5 74 Q88 72.5 98 74.5 M82.5 78.5 Q88 77.5 96 79" fill="none" stroke="#D9985A" stroke-width="1.1" stroke-linecap="round"/></g>
</g>
<g class="fx" data-s="happy"><text class="f1" x="14" y="26" font-size="13" fill="#FF6B8A">♥</text><text class="f2" x="78" y="20" font-size="11" fill="#FF8FA3">♥</text><text class="f3" x="48" y="10" font-size="12" fill="#FF6B8A">♥</text></g>
<g class="fx" data-s="thumb"><text class="f1" x="12" y="26" font-size="13" fill="#FFC83D">★</text><text class="f2" x="86" y="30" font-size="11" fill="#FFC83D">★</text><text class="f3" x="46" y="9" font-size="12" fill="#FFB020">★</text></g>
<g class="fx rain" data-s="sad"><path class="f1" d="M14 18 Q11.5 23 14 25.5 Q16.5 23 14 18 Z" fill="#7CC4FF"/><path class="f2" d="M84 14 Q81.5 19 84 21.5 Q86.5 19 84 14 Z" fill="#7CC4FF"/><path class="f3" d="M50 6 Q47.5 11 50 13.5 Q52.5 11 50 6 Z" fill="#9AD3FF"/></g>
</svg>`;
    let root, bubble, timer;
    let off = false;
    try { off = localStorage.getItem('dutchpay-mascot') === 'off'; } catch (e) {}

    function build() {
      root = document.createElement('div');
      root.className = 'mascot';
      root.dataset.state = 'idle';
      root.setAttribute('aria-hidden', 'true');
      root.innerHTML = SVG; // 앱 안에 고정된 그림 (사용자 입력 아님)
      bubble = document.createElement('div');
      bubble.className = 'mascot-bubble';
      bubble.setAttribute('aria-hidden', 'true'); // 같은 내용을 알림창(toast)이 읽어 줌
      document.body.append(root, bubble);
      root.hidden = off;
    }
    function rest() {
      root.dataset.state = 'idle';
      root.classList.remove('up');
      bubble.classList.remove('show');
    }
    // state: 'happy'(신남) | 'thumb'(엄지 척) | 'sad'(슬픔)
    function say(state, text, ms) {
      if (off || !root) return;
      clearTimeout(timer);
      root.dataset.state = 'idle';
      void root.offsetWidth; // 같은 동작을 연달아 해도 다시 움직이게
      root.dataset.state = state;
      root.classList.add('up');
      bubble.textContent = text; // 항상 textContent
      bubble.classList.add('show');
      timer = setTimeout(rest, ms || 3400);
    }
    function setOff(v) {
      off = !!v;
      try { localStorage.setItem('dutchpay-mascot', off ? 'off' : 'on'); } catch (e) {}
      if (root) { rest(); root.hidden = off; }
    }
    build();
    return { say, setOff, isOff: () => off };
  })();

  return { won, el, avatar, toast, copyText, Mascot };
})();
