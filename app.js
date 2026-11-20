// 더치페이 정산기 - 화면 로직
(function () {
  const KEY = 'dutchpay-v1';
  let state = load();

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
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
  }
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast.t);
    toast.t = setTimeout(() => t.classList.remove('show'), 2000);
  }
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  // ----- 참가자 -----
  $('personForm').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const name = $('personName').value.trim();
    if (!name) return;
    if (state.people.includes(name)) return toast('이미 있는 이름이에요');
    if (state.people.length >= 20) return toast('최대 20명까지 가능해요');
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
    if (!shares.length) return toast('함께 나눌 사람을 선택해 주세요');
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
  function render() {
    const names = state.people;

    const ul = $('people');
    ul.replaceChildren();
    names.forEach((n) => {
      const li = el('li', 'chip');
      li.append(el('span', '', n));
      const x = el('button', 'x', '×');
      x.type = 'button';
      x.setAttribute('aria-label', n + ' 삭제');
      x.onclick = () => removePerson(n);
      li.append(x);
      ul.append(li);
    });
    $('peopleHint').hidden = names.length >= 2;
    $('expenseCard').classList.toggle('disabled', names.length < 2);

    // 결제자 선택 (선택 유지)
    const prevPayer = $('expPayer').value;
    const sel = $('expPayer');
    sel.replaceChildren();
    names.forEach((n) => { const o = el('option', '', n); o.value = n; sel.append(o); });
    if (names.includes(prevPayer)) sel.value = prevPayer;

    // 나눌 사람: 기본은 전원 선택
    const prevAll = new Set(Array.from(document.querySelectorAll('#expShares input')).map((c) => c.value));
    const prevChecked = new Set(Array.from(document.querySelectorAll('#expShares input:checked')).map((c) => c.value));
    const box = $('expShares');
    box.replaceChildren();
    names.forEach((n) => {
      const lab = el('label', 'check');
      const c = document.createElement('input');
      c.type = 'checkbox'; c.value = n;
      c.checked = !prevAll.has(n) || prevChecked.has(n); // 새 사람은 기본 체크, 기존 사람은 선택 유지
      lab.append(c, el('span', '', n));
      box.append(lab);
    });

    // 지출 목록
    const exUl = $('expenses');
    exUl.replaceChildren();
    state.expenses.forEach((e) => {
      const li = el('li', 'item');
      const info = el('div', 'info');
      info.append(el('strong', '', e.title + ' · ' + won(e.amount)));
      const who = e.shares.length === names.length ? '전원' : e.shares.join(', ');
      info.append(el('small', '', e.payer + ' 결제 / ' + who + ' (1인 약 ' + won(Math.round(e.amount / e.shares.length)) + ')'));
      const del = el('button', 'x', '×');
      del.type = 'button';
      del.setAttribute('aria-label', '지출 삭제');
      del.onclick = () => removeExpense(e.id);
      li.append(info, del);
      exUl.append(li);
    });

    // 결과
    const r = settle(names, state.expenses);
    const card = $('resultCard');
    card.hidden = state.expenses.length === 0;
    $('total').textContent = '총 ' + won(r.total) + ' / 송금 ' + r.transfers.length + '번이면 끝!';
    const tl = $('transfers');
    tl.replaceChildren();
    if (!r.transfers.length) {
      tl.append(el('li', 'item done', '정산할 금액이 없어요 🎉'));
    }
    r.transfers.forEach((t) => {
      const li = el('li', 'item transfer');
      li.append(el('span', '', t.from + ' → ' + t.to), el('strong', '', won(t.amount)));
      tl.append(li);
    });
  }

  function update() { save(); render(); }

  $('reset').addEventListener('click', () => {
    if (!state.people.length && !state.expenses.length) return;
    if (confirm('입력한 내용을 모두 지울까요?')) {
      state = { people: [], expenses: [] };
      update();
    }
  });

  render();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
})();
