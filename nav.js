// 화면 전환(홈 / 캘린더 / 더치페이)과 홈 화면. 주소의 # 뒤 값으로 화면을 나눔.
(function () {
  const { el, avatar, won } = UI;
  const S = CalStore;
  const $ = (id) => document.getElementById(id);

  const TITLES = { home: '약속 이후', cal: '캘린더', dutch: '더치페이' };

  function renderHome() {
    const next = S.upcoming();
    const card = $('nextCard');
    card.replaceChildren();
    if (next.length) {
      const a = next[0];
      const dd = S.daysUntil(a.date);
      card.append(el('p', 'hero-dd', dd === 0 ? '오늘' : 'D-' + dd));
      card.append(el('h2', 'hero-title', a.title));
      card.append(el('p', 'hero-meta', S.labelDate(a.date) + (a.time ? ' ' + a.time : '') + (a.place ? ' · ' + a.place : '')));
      if (a.people.length) {
        const row = el('div', 'faces');
        a.people.slice(0, 6).forEach((p) => row.append(avatar(p, true)));
        row.append(el('span', 'faces-n', a.people.slice(0, 3).join(', ') + (a.people.length > 3 ? ' 외 ' + (a.people.length - 3) + '명' : '')));
        card.append(row);
      }
    } else {
      card.append(el('h2', 'hero-title', '다가오는 약속이 없어요'));
      card.append(el('p', 'hero-meta', '캘린더에서 친구와의 약속을 잡아 보세요. 만난 뒤에는 바로 정산도 할 수 있어요.'));
    }

    $('tileCal').textContent = next.length ? '다가오는 약속 ' + next.length + '개' : '약속 잡고 친구에게 공유';
    const d = window.Dutch.summary();
    $('tileDutch').textContent = d.expenses ? '정산 중 · 총 ' + won(d.total) : '모임 비용 나누기';
  }

  function route() {
    const parts = location.hash.replace(/^#\/?/, '').split('/');
    const seg = parts[0];
    const view = seg === 'dutch' ? 'dutch' : seg === 'calendar' || seg === 'join' ? 'cal' : 'home';

    ['home', 'dutch', 'cal'].forEach((v) => { $('view-' + v).hidden = v !== view; });
    $('back').hidden = view === 'home';
    $('top').classList.toggle('sub', view !== 'home');
    $('reset').hidden = view !== 'dutch';
    $('appTitle').textContent = TITLES[view];
    document.title = view === 'home' ? '약속 이후' : TITLES[view] + ' · 약속 이후';

    if (view === 'home') renderHome();
    else if (view === 'dutch') window.Dutch.refresh();
    else window.Cal.render(seg === 'join' ? parts.slice(1).join('/') : null);
    window.scrollTo(0, 0);
  }

  window.addEventListener('hashchange', route);
  route();
})();
