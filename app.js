// 더치페이 정산기 - 화면 로직
(function () {
  const KEY = 'dutchpay-v1';
  let state = load();
  let seenPeople = new Set(state.people); // 새로 추가된 항목만 움직이게 하려고 기억
  let seenExp = new Set(state.expenses.map((e) => e.id));
  let animate = true;
  let editId = null; // 수정 중인 지출 id
  let expandDone = false; // 송금이 모두 끝난 뒤 자세히 보기를 눌렀는지

  const $ = (id) => document.getElementById(id);
  const won = (n) => n.toLocaleString('ko-KR') + '원';

  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (s && Array.isArray(s.people) && Array.isArray(s.expenses)) return s;
    } catch (e) {}
    return { people: [], expenses: [], paid: {} };
  }
  function save() {
    // 약속과 연결된 정산이면 그 약속에도 함께 저장
    if (state.planId && window.CalStore) {
      if (CalStore.get(state.planId)) CalStore.setSettlement(state.planId, { people: state.people, expenses: state.expenses, paid: state.paid });
      else delete state.planId; // 연결된 약속이 삭제됨
    }
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
  }
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast.t);
    toast.t = setTimeout(() => t.classList.remove('show'), 2200);
  }
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  // 이름마다 항상 같은 색 (이름 글자 합으로 6색 중 선택)
  function avatar(name, small) {
    let h = 0;
    for (const ch of name) h = (h * 31 + ch.codePointAt(0)) % 997;
    const a = el('span', 'av c' + (h % 6) + (small ? ' s' : ''), Array.from(name)[0] || '?');
    a.setAttribute('aria-hidden', 'true');
    return a;
  }

  // ----- 자주 만나는 친구 -----
  function addPerson(name) {
    if (state.people.includes(name)) return toast('이미 추가된 이름이에요');
    if (state.people.length >= 20) return toast('참가자는 20명까지 추가할 수 있어요');
    state.people.push(name);
    update();
  }
  function renderFriends() {
    const fr = window.CalStore ? CalStore.friends() : [];
    const ul = $('friendList');
    ul.replaceChildren();
    fr.forEach((n) => {
      const added = state.people.includes(n);
      const li = el('li', 'chip friend' + (added ? ' added' : ''));
      const b = el('button', 'fbtn');
      b.type = 'button';
      b.append(avatar(n, true), el('span', '', n + (added ? ' ✓' : '')));
      b.setAttribute('aria-label', n + (added ? ' (이미 추가됨)' : ' 추가'));
      b.onclick = () => addPerson(n);
      const x = el('button', 'x', '×');
      x.type = 'button';
      x.setAttribute('aria-label', n + ' 친구 목록에서 삭제');
      x.onclick = () => {
        if (!confirm('"' + n + '"을(를) 친구 목록에서 지울까요?\n(이미 추가된 참가자는 그대로예요)')) return;
        CalStore.removeFriend(n);
        renderFriends();
      };
      li.append(b, x);
      ul.append(li);
    });
    $('friendBox').hidden = fr.length === 0;
    $('friendSave').hidden = !state.people.some((p) => !fr.includes(p));
  }
  $('friendSave').addEventListener('click', () => {
    if (!CalStore.addFriends(state.people)) return toast('저장하지 못했어요. 저장 공간을 확인해 주세요');
    renderFriends();
    toast('친구 목록에 저장했어요. 다음 정산에서 눌러서 추가할 수 있어요');
  });

  // ----- 참가자 -----
  $('personForm').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const name = $('personName').value.trim();
    if (!name) return toast('이름을 입력해 주세요');
    if (state.people.includes(name)) return toast('이미 추가된 이름이에요');
    if (state.people.length >= 20) return toast('참가자는 20명까지 추가할 수 있어요');
    state.people.push(name);
    $('personName').value = '';
    $('personName').focus();
    update();
  });

  function removePerson(name) {
    const used = state.expenses.some((e) => e.payer === name || e.shares.includes(name));
    if (used && !confirm(name + '님이 포함된 지출도 함께 정리됩니다. 삭제할까요?')) return;
    state.people = state.people.filter((p) => p !== name);
    state.expenses = state.expenses
      .filter((e) => e.payer !== name)
      .map((e) => ({ ...e, shares: e.shares.filter((p) => p !== name) }))
      .filter((e) => e.shares.length > 0);
    update();
  }

  // ----- 지출 -----
  $('expAmount').addEventListener('input', (ev) => {
    const digits = ev.target.value.replace(/[^0-9]/g, '').slice(0, 10);
    ev.target.value = digits ? Number(digits).toLocaleString('ko-KR') : '';
  });

  $('expenseForm').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const amount = Number($('expAmount').value.replace(/[^0-9]/g, ''));
    const payer = $('expPayer').value;
    const shares = Array.from(document.querySelectorAll('#expShares input:checked')).map((c) => c.value);
    if (state.people.length < 2) return toast('먼저 2명 이상 추가해 주세요');
    if (!amount) return toast('금액을 입력해 주세요');
    if (!shares.length) return toast('함께 나눌 사람을 1명 이상 선택해 주세요');
    const typed = $('expTitle').value.trim();
    const idx = editId ? state.expenses.findIndex((e) => e.id === editId) : -1;
    if (idx >= 0) {
      const old = state.expenses[idx];
      state.expenses[idx] = { ...old, title: typed || old.title, payer, amount, shares };
      endEdit();
      update();
      return toast('지출을 수정했어요');
    }
    state.expenses.push({
      id: Date.now(),
      title: typed || '지출 ' + (state.expenses.length + 1),
      payer, amount, shares,
    });
    $('expTitle').value = '';
    $('expAmount').value = '';
    update();
    toast('지출을 추가했어요');
  });

  // 지출 수정: 위 입력칸에 내용을 채워 넣고, 완료하면 같은 자리에 반영
  function startEdit(e) {
    editId = e.id;
    $('expTitle').value = e.title;
    $('expAmount').value = e.amount.toLocaleString('ko-KR');
    $('expPayer').value = e.payer;
    document.querySelectorAll('#expShares input').forEach((c) => { c.checked = e.shares.includes(c.value); });
    $('expSubmit').textContent = '수정 완료';
    $('expCancel').hidden = false;
    $('expenseForm').classList.add('editing');
    render();
    $('expenseForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
    toast('위 입력칸에서 고친 뒤 "수정 완료"를 눌러 주세요');
  }
  function endEdit() {
    editId = null;
    $('expTitle').value = '';
    $('expAmount').value = '';
    $('expSubmit').textContent = '지출 추가';
    $('expCancel').hidden = true;
    $('expenseForm').classList.remove('editing');
    $('expShares').replaceChildren(); // 나눌 사람 선택을 처음 상태(전원)로
  }
  $('expCancel').addEventListener('click', () => { endEdit(); render(); toast('수정을 취소했어요'); });

  function removeExpense(id) {
    if (editId === id) endEdit();
    state.expenses = state.expenses.filter((e) => e.id !== id);
    update();
  }

  // ----- 화면 갱신 -----
  function renderPlan() {
    const a = state.planId && window.CalStore ? CalStore.get(state.planId) : null;
    if (state.planId && !a) delete state.planId;
    $('planBanner').hidden = !a;
    if (a) {
      $('planTitle').textContent = a.title + ' 정산 중';
      $('planSub').textContent = CalStore.labelDate(a.date) + (a.place ? ' · ' + a.place : '') + ' · 입력하면 약속에 자동 저장돼요';
    }
  }
  $('planUnlink').addEventListener('click', () => {
    delete state.planId;
    update();
    toast('약속과 연결을 해제했어요');
  });

  function render() {
    renderPlan();
    const names = state.people;
    if (editId && !state.expenses.some((e) => e.id === editId)) endEdit(); // 수정하던 지출이 사라진 경우

    // 참가자 칩
    const ul = $('people');
    ul.replaceChildren();
    names.forEach((n) => {
      const li = el('li', 'chip' + (seenPeople.has(n) ? '' : ' new'));
      li.append(avatar(n), el('span', '', n));
      const x = el('button', 'x', '×');
      x.type = 'button';
      x.setAttribute('aria-label', n + ' 삭제');
      x.onclick = () => removePerson(n);
      li.append(x);
      ul.append(li);
    });
    seenPeople = new Set(names);
    renderFriends();
    $('peopleHint').hidden = names.length >= 2;
    $('expenseCard').classList.toggle('disabled', names.length < 2);

    // 결제자 선택 (선택 유지)
    const sel = $('expPayer');
    const prevPayer = sel.value;
    sel.replaceChildren();
    names.forEach((n) => { const o = el('option', '', n); o.value = n; sel.append(o); });
    if (names.includes(prevPayer)) sel.value = prevPayer;

    // 함께 나눌 사람: 새 사람은 기본 선택, 기존 사람은 선택 유지
    const prevAll = new Set(Array.from(document.querySelectorAll('#expShares input')).map((c) => c.value));
    const prevChecked = new Set(Array.from(document.querySelectorAll('#expShares input:checked')).map((c) => c.value));
    const box = $('expShares');
    box.replaceChildren();
    names.forEach((n) => {
      const lab = el('label', 'check');
      const c = document.createElement('input');
      c.type = 'checkbox'; c.value = n;
      c.checked = !prevAll.has(n) || prevChecked.has(n);
      lab.append(c, avatar(n, true), el('span', '', n));
      box.append(lab);
    });

    // 지출 목록
    const exUl = $('expenses');
    exUl.replaceChildren();
    state.expenses.forEach((e) => {
      const li = el('li', 'item' + (seenExp.has(e.id) ? '' : ' new') + (editId === e.id ? ' editing' : ''));
      const info = el('div', 'info');
      info.append(el('strong', '', e.title + ' · ' + won(e.amount)));
      const who = e.shares.length === names.length ? '전원' : e.shares.join(', ');
      info.append(el('small', '', e.payer + ' 결제 · ' + who + ' (1인 약 ' + won(Math.round(e.amount / e.shares.length)) + ')'));
      const del = el('button', 'x', '×');
      del.type = 'button';
      del.setAttribute('aria-label', e.title + ' 삭제');
      del.onclick = () => removeExpense(e.id);
      const edit = el('button', 'mini', '수정');
      edit.type = 'button';
      edit.setAttribute('aria-label', e.title + ' 수정');
      edit.onclick = () => startEdit(e);
      const btns = el('div', 'btns');
      btns.append(edit, del);
      li.append(info, btns);
      exUl.append(li);
    });
    seenExp = new Set(state.expenses.map((e) => e.id));
    $('expEmpty').hidden = state.expenses.length > 0 || names.length < 2;

    // 정산 결과
    const r = settle(names, state.expenses);
    const hasExp = state.expenses.length > 0;
    $('resultBody').hidden = !hasExp;
    $('resultEmpty').hidden = hasExp;
    const total = $('total');
    total.replaceChildren(document.createTextNode('총 ' + won(r.total) + ' 중 '));
    if (r.transfers.length) {
      const b = el('b', '', r.transfers.length + '번');
      total.append(b, document.createTextNode(' 송금하면 끝나요'));
    } else {
      total.append(document.createTextNode('모두 정산이 끝났어요'));
    }
    const tl = $('transfers');
    tl.replaceChildren();
    if (hasExp && !r.transfers.length) {
      const li = el('li', 'allset');
      li.append(el('strong', '', '주고받을 돈이 없어요'), el('span', '', '낸 금액과 쓴 금액이 서로 같아요.'));
      tl.append(li);
    }
    const paid = state.paid || {};
    const left = pendingTransfers(r.transfers, paid).length;
    if (r.transfers.length) {
      total.replaceChildren(document.createTextNode('총 ' + won(r.total) + ' 중 '));
      if (left === 0) total.append(el('b', '', '모든 송금이 끝났어요'));
      else {
        total.append(el('b', '', left + '번'), document.createTextNode(' 송금하면 끝나요'));
        if (left < r.transfers.length) total.append(document.createTextNode(' (' + (r.transfers.length - left) + '번 완료)'));
      }
    }
    // 송금이 모두 끝나면 결과 목록을 접어서 "정산 완료"만 보여 줌 (자세히 보기로 다시 펼침)
    const allDone = r.transfers.length > 0 && left === 0;
    if (!allDone) expandDone = false;
    const folded = allDone && !expandDone;
    $('doneBox').hidden = !allDone;
    $('doneToggle').textContent = expandDone ? '접기' : '자세히 보기';
    $('doneToggle').setAttribute('aria-expanded', expandDone ? 'true' : 'false');
    $('transfers').hidden = folded;
    $('actions').hidden = folded;
    const still = !animate; // 체크를 눌렀을 때는 목록이 다시 움직이지 않게
    animate = true;
    r.transfers.forEach((t) => {
      const done = !!paid[transferKey(t)];
      const li = el('li', 't' + (done ? ' done' : '') + (still ? ' still' : ''));
      const who = el('div', 'who');
      who.append(avatar(t.from, true), el('span', '', t.from), el('span', 'arrow', '→'), avatar(t.to, true), el('span', '', t.to));
      const amt = el('div', 'amt', t.amount.toLocaleString('ko-KR'));
      amt.append(el('small', '', '원'));
      const acts = el('div', 'tact');
      const chk = el('button', 'tbtn' + (done ? ' on' : ''), done ? '✓ 송금 완료' : '송금했어요');
      chk.type = 'button';
      chk.setAttribute('aria-pressed', done ? 'true' : 'false');
      chk.setAttribute('aria-label', t.from + '님이 ' + t.to + '님께 보낸 송금 ' + (done ? '완료 취소' : '완료로 표시'));
      chk.onclick = () => {
        const wasDone = isAllDone();
        state.paid = { ...(state.paid || {}) };
        if (done) delete state.paid[transferKey(t)]; else state.paid[transferKey(t)] = true;
        animate = false;
        update();
        if (!wasDone && isAllDone()) UI.Mascot.say('thumb', '정산 끝! 정말 잘했어요!', 4200);
      };
      const ask = el('button', 'tbtn', '요청 문구 복사');
      ask.type = 'button';
      ask.setAttribute('aria-label', t.from + '님께 보낼 송금 요청 문구 복사');
      ask.onclick = async () => {
        const ok = await copyText(requestText(t, planTitle()));
        toast(ok ? t.from + '님께 보낼 문구를 복사했어요' : '복사하지 못했어요. 다시 눌러 주세요');
      };
      acts.append(chk, ask);
      li.append(who, amt, acts);
      tl.append(li);
    });
  }

  $('doneToggle').addEventListener('click', () => {
    expandDone = !expandDone;
    animate = false;
    render();
  });

  // 송금이 모두 끝났는지 (보낼 돈이 하나라도 있고 전부 완료)
  function isAllDone() {
    const tr = settle(state.people, state.expenses).transfers;
    return tr.length > 0 && pendingTransfers(tr, state.paid).length === 0;
  }

  // 약속과 연결된 정산이면 약속 이름을 문구에 사용
  function planTitle() {
    const a = state.planId && window.CalStore ? CalStore.get(state.planId) : null;
    return a ? a.title : '';
  }

  // ----- 결과 복사 / 공유 -----
  function resultText() {
    return formatResult(state.people, state.expenses, settle(state.people, state.expenses), state.paid);
  }

  // ----- 결과 이미지 저장 -----
  const PALETTE = [['#FFE3E3', '#B42323'], ['#FFEBD1', '#A35A00'], ['#FFF6BF', '#7A6500'], ['#D9F5E5', '#14774A'], ['#DCEBFF', '#1B5BB8'], ['#EBDEFF', '#5B2DB0']];
  const FONT = '"Pretendard","Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif';

  function drawResultImage() {
    const r = settle(state.people, state.expenses);
    const paid = state.paid || {};
    const W = 1080, PAD = 64, S = 2; // 가로 1080, 선명하게 2배로 그림
    const exps = state.expenses.slice(0, 10);
    const rowsH = Math.max(r.transfers.length, 1) * 130;
    const H = 330 + rowsH + 120 + exps.length * 60 + (state.expenses.length > 10 ? 50 : 0) + 110;
    const c = document.createElement('canvas');
    c.width = W * S; c.height = H * S;
    const g = c.getContext('2d');
    g.scale(S, S);
    const rr = (x, y, w, h, rad) => { g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, rad) : g.rect(x, y, w, h); };
    const fit = (txt, maxW) => { // 너무 긴 글은 ...으로 줄임
      if (g.measureText(txt).width <= maxW) return txt;
      let s = Array.from(txt);
      while (s.length > 1 && g.measureText(s.join('') + '…').width > maxW) s.pop();
      return s.join('') + '…';
    };
    const face = (name, x, y, rad) => {
      let h = 0;
      for (const ch of name) h = (h * 31 + ch.codePointAt(0)) % 997;
      const p = PALETTE[h % 6];
      g.fillStyle = p[0]; g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
      g.fillStyle = p[1]; g.font = '800 ' + Math.round(rad * 1.0) + 'px ' + FONT;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(Array.from(name)[0] || '?', x, y + 2);
    };

    g.fillStyle = '#101B3B'; g.fillRect(0, 0, W, H);
    g.textBaseline = 'alphabetic'; g.textAlign = 'left';
    const title = planTitle();
    g.fillStyle = '#5BE3B0'; g.font = '800 34px ' + FONT;
    g.fillText('더치페이 정산 결과', PAD, 110);
    if (title) { g.fillStyle = '#A9B6D8'; g.font = '600 30px ' + FONT; g.fillText(fit(title, W - PAD * 2), PAD, 160); }
    g.fillStyle = '#fff'; g.font = '800 72px ' + FONT;
    g.fillText(won(r.total), PAD, 250);
    g.fillStyle = '#A9B6D8'; g.font = '600 30px ' + FONT;
    g.fillText('총 지출 · 참가자 ' + state.people.length + '명', PAD, 296);

    let y = 330;
    if (!r.transfers.length) {
      g.fillStyle = '#5BE3B0'; g.font = '800 40px ' + FONT;
      g.fillText('주고받을 돈이 없어요', PAD, y + 80);
    }
    r.transfers.forEach((t) => {
      const done = !!paid[transferKey(t)];
      g.globalAlpha = done ? 0.5 : 1;
      g.fillStyle = 'rgba(255,255,255,.07)'; rr(PAD, y, W - PAD * 2, 110, 24); g.fill();
      face(t.from, PAD + 52, y + 55, 28);
      g.textAlign = 'left'; g.textBaseline = 'alphabetic';
      g.fillStyle = '#fff'; g.font = '700 32px ' + FONT;
      g.fillText(fit(t.from, 150), PAD + 96, y + 66);
      g.fillStyle = '#7F8FB8'; g.fillText('→', PAD + 270, y + 66);
      face(t.to, PAD + 350, y + 55, 28);
      g.textAlign = 'left'; g.textBaseline = 'alphabetic';
      g.fillStyle = '#fff'; g.font = '700 32px ' + FONT;
      g.fillText(fit(t.to, 150), PAD + 394, y + 66);
      g.textAlign = 'right'; g.fillStyle = '#5BE3B0'; g.font = '800 40px ' + FONT;
      g.fillText(won(t.amount), W - PAD - 28, done ? y + 52 : y + 68);
      if (done) { g.fillStyle = '#fff'; g.font = '700 24px ' + FONT; g.fillText('✓ 송금 완료', W - PAD - 28, y + 88); }
      g.globalAlpha = 1;
      y += 130;
    });

    y += 20;
    if (exps.length) {
      g.textAlign = 'left'; g.fillStyle = '#A9B6D8'; g.font = '700 28px ' + FONT;
      g.fillText('지출 내역', PAD, y + 20);
      y += 60;
      exps.forEach((e) => {
        g.textAlign = 'left'; g.fillStyle = '#fff'; g.font = '600 30px ' + FONT;
        g.fillText(fit(e.title + ' (' + e.payer + ')', 620), PAD, y + 20);
        g.textAlign = 'right'; g.fillText(won(e.amount), W - PAD, y + 20);
        y += 60;
      });
      if (state.expenses.length > 10) {
        g.textAlign = 'left'; g.fillStyle = '#A9B6D8'; g.font = '600 26px ' + FONT;
        g.fillText('외 ' + (state.expenses.length - 10) + '건', PAD, y + 14);
        y += 50;
      }
    }
    g.textAlign = 'left'; g.fillStyle = '#5E6C93'; g.font = '600 24px ' + FONT;
    g.fillText('약속지기 · ' + new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }), PAD, H - 50);
    return c;
  }

  // 이미지를 클립보드에 복사 (카톡 등에서 붙여넣기). 지원하지 않는 기기는 저장을 안내
  $('imgCopyBtn').addEventListener('click', async () => {
    if (!state.expenses.length) return toast('먼저 지출을 추가해 주세요');
    if (!(navigator.clipboard && navigator.clipboard.write && window.ClipboardItem)) {
      return toast('이 기기는 이미지 복사를 지원하지 않아요. "이미지 저장"을 이용해 주세요');
    }
    try {
      // 눌린 직후에 약속(Promise)으로 넘겨야 아이폰에서도 허용돼요
      const blobPromise = new Promise((res, rej) => {
        try { drawResultImage().toBlob((b) => (b ? res(b) : rej(new Error('blob'))), 'image/png'); } catch (e) { rej(e); }
      });
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blobPromise })]);
      toast('이미지를 복사했어요. 채팅창에서 붙여넣어 보세요');
    } catch (e) {
      toast('이미지를 복사하지 못했어요. "이미지 저장"으로 사진첩에 저장해 보내 주세요');
    }
  });

  $('imgBtn').addEventListener('click', async () => {
    if (!state.expenses.length) return toast('먼저 지출을 추가해 주세요');
    // 어떤 폰에서도 되는 방법: 이미지를 화면에 크게 보여 주고 "길게 눌러 저장"
    let dataUrl;
    try { dataUrl = drawResultImage().toDataURL('image/png'); } catch (e) { dataUrl = null; }
    if (!dataUrl) return toast('이미지를 만들지 못했어요. 결과 복사를 이용해 주세요');
    $('imgPreview').src = dataUrl;
    $('imgModal').hidden = false;
    document.body.style.overflow = 'hidden';
    $('imgClose').focus();
  });

  function closeImg() {
    $('imgModal').hidden = true;
    $('imgPreview').removeAttribute('src');
    document.body.style.overflow = '';
  }
  $('imgClose').addEventListener('click', closeImg);
  $('imgModal').addEventListener('click', (ev) => { if (ev.target === $('imgModal')) closeImg(); });
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && !$('imgModal').hidden) closeImg(); });

  // 공유 시트로 보내기 (지원하는 폰에서만 버튼 표시)
  $('imgShare').addEventListener('click', async () => {
    try {
      const blob = await (await fetch($('imgPreview').src)).blob();
      const file = new File([blob], '정산결과.png', { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: '더치페이 정산 결과' });
      } else toast('이 폰에서는 공유를 쓸 수 없어요. 이미지를 길게 눌러 저장해 주세요');
    } catch (e) {
      if (!(e && e.name === 'AbortError')) toast('공유하지 못했어요. 이미지를 길게 눌러 저장해 주세요');
    }
  });

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      // 구형 브라우저용 대체 방법
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

  $('copyBtn').addEventListener('click', async () => {
    if (!state.expenses.length) return toast('먼저 지출을 추가해 주세요');
    toast((await copyText(resultText())) ? '결과를 복사했어요' : '복사하지 못했어요. 화면을 길게 눌러 직접 복사해 주세요');
  });

  if (navigator.share) {
    $('shareBtn').hidden = false;
    $('shareBtn').addEventListener('click', async () => {
      if (!state.expenses.length) return toast('먼저 지출을 추가해 주세요');
      try {
        await navigator.share({ title: '더치페이 정산 결과', text: resultText() });
      } catch (e) {
        if (e && e.name === 'AbortError') return; // 사용자가 직접 닫음
        toast((await copyText(resultText())) ? '공유하지 못해 결과를 복사했어요' : '공유하지 못했어요');
      }
    });
  }

  // ----- 정산 기록 (저장 / 불러오기 / 삭제) -----
  const HKEY = 'dutchpay-history-v1';
  const MAX_HISTORY = 30;
  let history = loadHistory();

  function loadHistory() {
    try {
      const h = JSON.parse(localStorage.getItem(HKEY));
      if (Array.isArray(h)) return h.filter((r) => r && Array.isArray(r.people) && Array.isArray(r.expenses));
    } catch (e) {}
    return [];
  }
  function saveHistory() {
    try { localStorage.setItem(HKEY, JSON.stringify(history)); return true; } catch (e) { return false; }
  }
  const dateLabel = (ms) => new Date(ms).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });

  $('saveForm').addEventListener('submit', (ev) => {
    ev.preventDefault();
    if (!state.expenses.length) return toast('저장할 지출이 없어요. 먼저 지출을 추가해 주세요');
    if (history.length >= MAX_HISTORY) return toast('기록은 ' + MAX_HISTORY + '개까지 저장할 수 있어요. 오래된 기록을 삭제해 주세요');
    const now = Date.now();
    const name = $('saveName').value.trim() || dateLabel(now) + ' 정산';
    history.unshift({
      id: now, name, savedAt: now,
      people: state.people.slice(),
      expenses: state.expenses.map((e) => ({ ...e, shares: e.shares.slice() })),
      paid: { ...(state.paid || {}) },
    });
    if (!saveHistory()) { history.shift(); return toast('저장하지 못했어요. 브라우저 저장 공간을 확인해 주세요'); }
    $('saveName').value = '';
    renderHistory();
    toast('"' + name + '" 기록을 저장했어요');
  });

  function loadRecord(r) {
    const hasData = state.people.length || state.expenses.length;
    if (hasData && !confirm('지금 입력한 내용이 사라져요. "' + r.name + '" 기록을 불러올까요?\n(필요하면 먼저 저장해 두세요)')) return;
    state = {
      people: r.people.slice(),
      expenses: r.expenses.map((e) => ({ ...e, shares: e.shares.slice() })),
      paid: { ...(r.paid || {}) },
    };
    seenPeople = new Set(state.people);
    seenExp = new Set(state.expenses.map((e) => e.id));
    $('expShares').replaceChildren(); // 나눌 사람 선택을 처음 상태(전원)로
    update();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    toast('"' + r.name + '" 기록을 불러왔어요');
  }

  function deleteRecord(r) {
    if (!confirm('"' + r.name + '" 기록을 삭제할까요?')) return;
    history = history.filter((x) => x.id !== r.id);
    saveHistory();
    renderHistory();
    toast('기록을 삭제했어요');
  }

  function renderHistory() {
    const ul = $('history');
    ul.replaceChildren();
    history.forEach((r) => {
      const li = el('li', 'item');
      const info = el('div', 'info');
      const total = settle(r.people, r.expenses).total;
      info.append(el('strong', '', r.name), el('small', '', dateLabel(r.savedAt) + ' · ' + r.people.length + '명 · 총 ' + won(total)));
      const btns = el('div', 'btns');
      const open = el('button', 'mini', '불러오기');
      open.type = 'button';
      open.setAttribute('aria-label', r.name + ' 불러오기');
      open.onclick = () => loadRecord(r);
      const del = el('button', 'x', '×');
      del.type = 'button';
      del.setAttribute('aria-label', r.name + ' 삭제');
      del.onclick = () => deleteRecord(r);
      btns.append(open, del);
      li.append(info, btns);
      ul.append(li);
    });
    $('historyEmpty').hidden = history.length > 0;
  }

  function update() {
    // 지출이 바뀌어 없어진 송금의 옛 체크 표시를 정리
    state.paid = prunePaid(settle(state.people, state.expenses).transfers, state.paid);
    save();
    render();
  }

  $('reset').addEventListener('click', () => {
    if (!state.people.length && !state.expenses.length) return toast('지울 내용이 없어요');
    if (confirm('입력한 내용을 모두 지울까요?')) {
      state = { people: [], expenses: [], paid: {} };
      update();
    }
  });

  render();
  renderHistory();

  // 캘린더·홈 화면에서 사용하는 연결 지점
  window.Dutch = {
    refresh() { render(); renderHistory(); },
    // 약속에서 정산 시작: 그 약속의 참가자·지출을 불러옴 (이미 정산한 적이 있으면 이어서)
    startForPlan(id) {
      const a = CalStore.get(id);
      if (!a) return false;
      const hasData = state.people.length || state.expenses.length;
      if (hasData && state.planId !== id && !confirm('지금 입력한 정산 내용이 사라져요. "' + a.title + '" 약속의 정산을 시작할까요?\n(필요하면 먼저 "저장한 정산"에 저장해 두세요)')) return false;
      const s = a.settlement;
      state = s
        ? { people: s.people.slice(), expenses: s.expenses.map((e) => ({ ...e, shares: e.shares.slice() })), paid: { ...(s.paid || {}) } }
        : { people: a.people.slice(), expenses: [] };
      state.planId = id;
      seenPeople = new Set(state.people);
      seenExp = new Set(state.expenses.map((e) => e.id));
      $('expShares').replaceChildren();
      update();
      return true;
    },
    // 예시 데이터를 지울 때: 그 약속과 연결된 정산 화면도 함께 비움
    clearIfLinked(ids) {
      if (state.planId && ids.includes(state.planId)) {
        state = { people: [], expenses: [], paid: {} };
        seenPeople = new Set(); seenExp = new Set();
        $('expShares').replaceChildren();
        update();
      }
    },
    summary() {
      const r = settle(state.people, state.expenses);
      return {
        people: state.people.length, expenses: state.expenses.length, total: r.total, transfers: r.transfers.length,
        left: pendingTransfers(r.transfers, state.paid).length, linked: !!state.planId,
      };
    },
  };

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
})();
