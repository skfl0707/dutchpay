// 더치페이 정산기 - 화면 로직
(function () {
  const KEY = 'dutchpay-v1';
  let state = load();
  let seenPeople = new Set(state.people); // 새로 추가된 항목만 움직이게 하려고 기억
  let seenExp = new Set(state.expenses.map((e) => e.id));

  const $ = (id) => document.getElementById(id);
  const won = (n) => n.toLocaleString('ko-KR') + '원';

  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (s && Array.isArray(s.people) && Array.isArray(s.expenses)) return s;
    } catch (e) {}
    return { people: [], expenses: [] };
  }
  function save() {
    // 약속과 연결된 정산이면 그 약속에도 함께 저장
    if (state.planId && window.CalStore) {
      if (CalStore.get(state.planId)) CalStore.setSettlement(state.planId, { people: state.people, expenses: state.expenses });
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
    state.expenses.push({
      id: Date.now(),
      title: $('expTitle').value.trim() || '지출 ' + (state.expenses.length + 1),
      payer, amount, shares,
    });
    $('expTitle').value = '';
    $('expAmount').value = '';
    update();
    toast('지출을 추가했어요');
  });

  function removeExpense(id) {
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
      const li = el('li', 'item' + (seenExp.has(e.id) ? '' : ' new'));
      const info = el('div', 'info');
      info.append(el('strong', '', e.title + ' · ' + won(e.amount)));
      const who = e.shares.length === names.length ? '전원' : e.shares.join(', ');
      info.append(el('small', '', e.payer + ' 결제 · ' + who + ' (1인 약 ' + won(Math.round(e.amount / e.shares.length)) + ')'));
      const del = el('button', 'x', '×');
      del.type = 'button';
      del.setAttribute('aria-label', e.title + ' 삭제');
      del.onclick = () => removeExpense(e.id);
      li.append(info, del);
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
    r.transfers.forEach((t) => {
      const li = el('li', 't');
      const who = el('div', 'who');
      who.append(avatar(t.from, true), el('span', '', t.from), el('span', 'arrow', '→'), avatar(t.to, true), el('span', '', t.to));
      const amt = el('div', 'amt', t.amount.toLocaleString('ko-KR'));
      amt.append(el('small', '', '원'));
      li.append(who, amt);
      tl.append(li);
    });
  }

  // ----- 결과 복사 / 공유 -----
  function resultText() {
    return formatResult(state.people, state.expenses, settle(state.people, state.expenses));
  }

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

  function update() { save(); render(); }

  $('reset').addEventListener('click', () => {
    if (!state.people.length && !state.expenses.length) return toast('지울 내용이 없어요');
    if (confirm('입력한 내용을 모두 지울까요?')) {
      state = { people: [], expenses: [] };
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
        ? { people: s.people.slice(), expenses: s.expenses.map((e) => ({ ...e, shares: e.shares.slice() })) }
        : { people: a.people.slice(), expenses: [] };
      state.planId = id;
      seenPeople = new Set(state.people);
      seenExp = new Set(state.expenses.map((e) => e.id));
      $('expShares').replaceChildren();
      update();
      return true;
    },
    summary() {
      const r = settle(state.people, state.expenses);
      return { people: state.people.length, expenses: state.expenses.length, total: r.total, transfers: r.transfers.length };
    },
  };

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
})();
