// 캘린더 화면: 월간 달력, 약속 추가/수정/삭제, 링크로 공유, 약속에서 정산 시작
(function () {
  const { el, avatar, toast, copyText, won } = UI;
  const S = CalStore;
  const $ = (id) => document.getElementById(id);

  const t0 = S.todayYmd().split('-').map(Number);
  const view = { y: t0[0], m: t0[1] - 1, sel: S.todayYmd() };
  let editId = null;
  let pendingJoin = null; // 친구가 보낸 약속 (아직 추가 전)

  // ----- 월간 달력 -----
  function renderMonth() {
    $('calTitle').textContent = view.y + '년 ' + (view.m + 1) + '월';
    const grid = $('calGrid');
    grid.replaceChildren();
    ['일', '월', '화', '수', '목', '금', '토'].forEach((w, i) =>
      grid.append(el('div', 'wd' + (i === 0 ? ' sun' : i === 6 ? ' sat' : ''), w)));

    const first = new Date(view.y, view.m, 1).getDay();
    const days = new Date(view.y, view.m + 1, 0).getDate();
    const counts = {};
    S.list().forEach((a) => { counts[a.date] = (counts[a.date] || 0) + 1; });
    const today = S.todayYmd();

    for (let i = 0; i < first; i++) grid.append(el('div', 'blank'));
    for (let d = 1; d <= days; d++) {
      const ymd = S.fmt(view.y, view.m, d);
      const dow = (first + d - 1) % 7;
      const b = el('button', 'day' + (ymd === today ? ' today' : '') + (ymd === view.sel ? ' sel' : '') + (dow === 0 ? ' sun' : dow === 6 ? ' sat' : ''));
      b.type = 'button';
      b.append(el('span', 'n', String(d)));
      if (counts[ymd]) b.append(el('i', 'dot'));
      b.setAttribute('aria-label', (view.m + 1) + '월 ' + d + '일' + (counts[ymd] ? ', 약속 ' + counts[ymd] + '개' : ''));
      b.setAttribute('aria-pressed', ymd === view.sel ? 'true' : 'false');
      b.onclick = () => { view.sel = ymd; closeForm(); renderMonth(); renderDay(); };
      grid.append(b);
    }
  }

  function moveMonth(delta) {
    const d = new Date(view.y, view.m + delta, 1);
    view.y = d.getFullYear();
    view.m = d.getMonth();
    const prefix = view.y + '-' + String(view.m + 1).padStart(2, '0');
    if (!view.sel.startsWith(prefix)) {
      const today = S.todayYmd();
      view.sel = today.startsWith(prefix) ? today : prefix + '-01';
    }
    closeForm();
    renderMonth();
    renderDay();
  }
  $('calPrev').onclick = () => moveMonth(-1);
  $('calNext').onclick = () => moveMonth(1);
  $('calToday').onclick = () => {
    view.y = t0[0]; view.m = t0[1] - 1; view.sel = S.todayYmd();
    closeForm(); renderMonth(); renderDay();
  };

  // ----- 선택한 날의 약속 -----
  function renderDay() {
    $('dayTitle').textContent = S.labelDate(view.sel);
    const ul = $('dayList');
    ul.replaceChildren();
    const items = S.byDate(view.sel);
    items.forEach((a) => ul.append(apptItem(a)));
    $('dayEmpty').hidden = items.length > 0;
    $('addAppt').hidden = !$('formCard').hidden;
  }

  function apptItem(a) {
    const li = el('li', 'appt');
    const head = el('div', 'appt-head');
    head.append(el('strong', '', a.title));
    const meta = [a.time, a.place].filter(Boolean).join(' · ');
    if (meta) head.append(el('small', '', meta));
    li.append(head);

    if (a.people.length) {
      const row = el('div', 'faces');
      a.people.slice(0, 6).forEach((p) => row.append(avatar(p, true)));
      row.append(el('span', 'faces-n', a.people.slice(0, 3).join(', ') + (a.people.length > 3 ? ' 외 ' + (a.people.length - 3) + '명' : '')));
      li.append(row);
    }

    if (a.memo) li.append(el('p', 'memo', a.memo));

    // 준비물: 눌러서 챙겼는지 체크
    if (a.items.length) {
      const got = a.items.filter((x) => x.d).length;
      const box = el('div', 'items');
      box.append(el('small', 'items-head', '준비물 ' + got + '/' + a.items.length + (got === a.items.length ? ' · 다 챙겼어요' : '')));
      const row = el('div', 'item-chips');
      a.items.forEach((x) => {
        const b = el('button', 'ichip' + (x.d ? ' on' : ''), (x.d ? '✓ ' : '') + x.t);
        b.type = 'button';
        b.setAttribute('aria-pressed', x.d ? 'true' : 'false');
        b.onclick = () => {
          S.update(a.id, { items: a.items.map((y) => (y.t === x.t ? { t: y.t, d: !y.d } : y)) });
          renderDay();
        };
        row.append(b);
      });
      box.append(row);
      li.append(box);
    }

    // 지도: 앱 안에서 지도를 만들지 않고 네이버지도/카카오맵 검색 링크로 연결
    const maps = S.mapLinks(a.place);
    if (maps) {
      const row = el('div', 'maps');
      [['네이버지도', maps.naver], ['카카오맵', maps.kakao]].forEach(([label, href]) => {
        const link = el('a', 'maplink', label + '에서 장소 보기');
        link.href = href; link.target = '_blank'; link.rel = 'noopener noreferrer';
        row.append(link);
      });
      li.append(row);
    }

    // 주변 찾기: 약속 장소 근처의 맛집/술집/카페를 지도 앱 검색으로 연결
    if (a.place) {
      const now = a.kind || S.guessKind(a.title);
      const row = el('div', 'nearby');
      row.append(el('small', 'items-head', a.place + ' 주변 찾기'));
      const chips = el('div', 'item-chips');
      [['meal', '맛집'], ['drink', '술집'], ['cafe', '카페']].forEach(([k, label]) => {
        const n = S.nearbyLinks(a.place, k);
        if (!n) return;
        const link = el('a', 'ichip near' + (k === now ? ' on' : ''), (k === now ? '추천 · ' : '') + label);
        link.href = n.naver; link.target = '_blank'; link.rel = 'noopener noreferrer';
        link.setAttribute('aria-label', a.place + ' 주변 ' + label + ' 네이버지도에서 검색');
        chips.append(link);
      });
      row.append(chips);
      li.append(row);
    }

    if (a.settlement && a.settlement.expenses.length) {
      const r = settle(a.settlement.people, a.settlement.expenses);
      li.append(el('p', 'done-line', '정산 기록 있음 · 총 ' + won(r.total) + ' · 송금 ' + r.transfers.length + '번'));
    }

    const btns = el('div', 'appt-btns');
    const settleBtn = el('button', 'mini strong', a.settlement && a.settlement.expenses.length ? '정산 이어하기' : '정산하기');
    settleBtn.type = 'button';
    settleBtn.onclick = () => { if (window.Dutch.startForPlan(a.id)) location.hash = '#/dutch'; };
    const shareBtn = el('button', 'mini', '공유');
    shareBtn.type = 'button';
    shareBtn.onclick = () => share(a);
    const editBtn = el('button', 'mini', '수정');
    editBtn.type = 'button';
    editBtn.onclick = () => openForm(a);
    const delBtn = el('button', 'mini danger', '삭제');
    delBtn.type = 'button';
    delBtn.onclick = () => {
      const extra = a.settlement && a.settlement.expenses.length ? '\n연결된 정산 기록도 함께 사라져요.' : '';
      if (!confirm('"' + a.title + '" 약속을 삭제할까요?' + extra)) return;
      S.remove(a.id);
      renderMonth(); renderDay();
      toast('약속을 삭제했어요');
    };
    btns.append(settleBtn, shareBtn, editBtn, delBtn);
    li.append(btns);
    return li;
  }

  // ----- 약속 추가 / 수정 -----
  function openForm(a) {
    editId = a ? a.id : null;
    $('formTitle').textContent = a ? '약속 수정' : '약속 추가';
    $('apTitle').value = a ? a.title : '';
    $('apDate').value = a ? a.date : view.sel;
    $('apTime').value = a ? a.time : '';
    $('apPlace').value = a ? a.place : '';
    $('apPeople').value = a ? a.people.join(', ') : '';
    $('apItems').value = a ? a.items.map((x) => x.t).join(', ') : '';
    $('apMemo').value = a ? a.memo : '';
    $('apKind').value = a && a.kind ? a.kind : '';
    $('formCard').hidden = false;
    $('addAppt').hidden = true;
    $('formCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => $('apTitle').focus({ preventScroll: true }), 300);
  }
  function closeForm() {
    editId = null;
    $('formCard').hidden = true;
    $('addAppt').hidden = false;
  }
  $('addAppt').onclick = () => openForm(null);
  $('apCancel').onclick = () => { closeForm(); };

  $('apptForm').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const title = $('apTitle').value.trim();
    const date = $('apDate').value;
    if (!title) return toast('약속 이름을 입력해 주세요');
    if (!S.validYmd(date)) return toast('날짜를 선택해 주세요');
    const fields = {
      title, date,
      time: $('apTime').value,
      place: $('apPlace').value.trim(),
      people: $('apPeople').value.split(/[,，]/).map((s) => s.trim()).filter(Boolean),
      memo: $('apMemo').value.trim(),
      kind: $('apKind').value,
      items: S.parseItems($('apItems').value, editId && S.get(editId) ? S.get(editId).items : []),
    };
    const saved = editId ? S.update(editId, fields) : S.add(fields);
    if (!saved) return toast('저장하지 못했어요. 입력한 내용을 확인해 주세요');
    const [y, m] = date.split('-').map(Number);
    view.y = y; view.m = m - 1; view.sel = date;
    const wasEdit = !!editId;
    closeForm();
    renderMonth(); renderDay();
    toast(wasEdit ? '약속을 수정했어요' : '약속을 추가했어요');
    if (!wasEdit) UI.Mascot.say('happy', '약속 잡았다! 신난다!');
  });

  // ----- 공유 (링크에 약속 내용을 담아 보냄) -----
  async function share(a) {
    const url = location.href.split('#')[0] + '#/join/' + S.encodeShare(a);
    const lines = ['[약속] ' + a.title, S.labelDate(a.date) + (a.time ? ' ' + a.time : '')];
    if (a.place) lines.push('장소: ' + a.place);
    if (a.people.length) lines.push('함께: ' + a.people.join(', '));
    if (a.items.length) lines.push('준비물: ' + a.items.map((x) => x.t).join(', '));
    if (a.memo) lines.push('메모: ' + a.memo);
    lines.push('', '아래 링크를 열면 내 캘린더에 추가할 수 있어요.', url);
    const text = lines.join('\n');
    if (navigator.share) {
      try { await navigator.share({ title: a.title, text }); return; } catch (e) {
        if (e && e.name === 'AbortError') return;
      }
    }
    toast((await copyText(text)) ? '약속 링크를 복사했어요. 친구에게 붙여넣어 보내세요' : '복사하지 못했어요');
  }

  // ----- 친구가 보낸 약속 받기 -----
  function renderJoin() {
    const card = $('joinCard');
    card.replaceChildren();
    card.hidden = !pendingJoin;
    if (!pendingJoin) return;
    const a = pendingJoin;
    card.append(el('h2', '', '친구가 보낸 약속'));
    card.append(el('strong', 'join-title', a.title));
    card.append(el('p', 'join-meta', S.labelDate(a.date) + (a.time ? ' ' + a.time : '') + (a.place ? ' · ' + a.place : '')));
    if (a.people.length) {
      const row = el('div', 'faces');
      a.people.slice(0, 6).forEach((p) => row.append(avatar(p, true)));
      row.append(el('span', 'faces-n', a.people.join(', ')));
      card.append(row);
    }
    if (a.items.length) card.append(el('p', 'join-meta', '준비물: ' + a.items.map((x) => x.t).join(', ')));
    if (a.memo) card.append(el('p', 'memo', a.memo));
    const add =el('button', 'btn big', '내 캘린더에 추가');
    add.type = 'button';
    add.onclick = () => {
      const dup = S.list().some((x) => x.title === a.title && x.date === a.date && x.time === a.time);
      if (dup) { toast('이미 추가한 약속이에요'); }
      else if (!S.add(a)) { return toast('저장하지 못했어요'); }
      else { toast('내 캘린더에 추가했어요'); UI.Mascot.say('happy', '새 약속이 생겼어요!'); }
      const [y, m] = a.date.split('-').map(Number);
      view.y = y; view.m = m - 1; view.sel = a.date;
      pendingJoin = null;
      location.hash = '#/calendar';
    };
    const no = el('button', 'link center', '추가하지 않고 닫기');
    no.type = 'button';
    no.onclick = () => { pendingJoin = null; location.hash = '#/calendar'; };
    card.append(add, no);
  }

  // nav.js에서 화면이 열릴 때마다 호출. joinCode가 있으면 친구가 보낸 링크로 들어온 것
  window.Cal = {
    render(joinCode) {
      if (joinCode) {
        const a = S.decodeShare(joinCode);
        if (a) {
          pendingJoin = a;
        } else {
          pendingJoin = null;
          toast('열 수 없는 링크예요. 친구에게 다시 받아 보세요');
          location.replace('#/calendar');
          return;
        }
      } else {
        pendingJoin = null; // 보낸 약속을 추가하지 않고 다른 화면으로 갔다 오면 안내 카드는 사라짐
      }
      renderJoin();
      renderMonth();
      renderDay();
    },
  };
})();
