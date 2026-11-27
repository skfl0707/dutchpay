// 화면 전환(홈 / 캘린더 / 더치페이)과 홈 화면. 주소의 # 뒤 값으로 화면을 나눔.
(function () {
  const { el, avatar, won, toast, copyText, Mascot } = UI;
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
    renderSample();
    renderTodos();
  }

  // ----- 처음 체험용 예시 -----
  function renderSample() {
    const card = $('sampleCard');
    const d = window.Dutch.summary();
    if (S.hasSample()) {
      $('sampleH').textContent = '예시로 둘러보는 중이에요';
      $('sampleP').textContent = '[예시] 약속과 정산이 들어 있어요. 다 둘러봤으면 지워 주세요. 내가 만든 약속은 지워지지 않아요.';
      $('sampleBtn').textContent = '예시 지우기';
      $('sampleBtn').dataset.mode = 'remove';
      card.hidden = false;
    } else if (!S.list().length && !d.expenses) {
      $('sampleH').textContent = '처음이세요?';
      $('sampleP').textContent = '예시 약속과 정산을 넣어 두고 기능을 눌러 볼 수 있어요. 언제든 지울 수 있어요.';
      $('sampleBtn').textContent = '예시로 체험해 보기';
      $('sampleBtn').dataset.mode = 'add';
      card.hidden = false;
    } else card.hidden = true;
  }
  $('sampleBtn').addEventListener('click', () => {
    if ($('sampleBtn').dataset.mode === 'add') {
      if (!S.addSample()) return toast('예시를 만들지 못했어요. 저장 공간을 확인해 주세요');
      renderHome();
      toast('예시를 넣었어요. 아래 해야 할 일에서 정산을 이어 해 보세요');
    } else {
      if (!confirm('예시 약속과 정산을 지울까요? 내가 만든 약속은 그대로예요.')) return;
      window.Dutch.clearIfLinked(S.list().filter((x) => x.sample).map((x) => x.id));
      S.removeSamples();
      renderHome();
      toast('예시를 지웠어요');
    }
  });

  // ----- 해야 할 일 / 다가오는 약속 -----
  const when = (a) => S.labelDate(a.date) + (a.time ? ' ' + a.time : '');
  function todoRow(cls, title, sub, buttons) {
    const li = el('li', 'todo' + (cls ? ' ' + cls : ''));
    const info = el('div', 'todo-info');
    info.append(el('strong', '', title), el('small', '', sub));
    li.append(info);
    if (buttons.length) {
      const box = el('div', 'btns');
      buttons.forEach(([label, fn, strong]) => {
        const b = el('button', 'mini' + (strong ? ' strong' : ''), label);
        b.type = 'button';
        b.onclick = fn;
        box.append(b);
      });
      li.append(box);
    }
    return li;
  }
  const openSettle = (id) => { if (window.Dutch.startForPlan(id)) location.hash = '#/dutch'; };

  function renderTodos() {
    const td = S.todos();
    const ul = $('todoList');
    ul.replaceChildren();

    td.unsettled.forEach((x) => ul.append(todoRow('warn', x.appt.title + ' 정산 안 했어요',
      x.ago + '일 전 · ' + S.labelDate(x.appt.date),
      [['정산하기', () => openSettle(x.appt.id), true],
       ['정산 없음', () => { S.update(x.appt.id, { skipSettle: true }); renderHome(); toast('목록에서 뺐어요'); }]])));

    td.pending.forEach((x) => ul.append(todoRow('warn', x.appt.title + ' 송금 ' + x.left + '번 남았어요',
      '송금 완료 표시를 하면 사라져요', [['이어하기', () => openSettle(x.appt.id), true]])));

    // 약속과 연결되지 않은 채 진행 중인 정산
    const d = window.Dutch.summary();
    if (!d.linked && d.expenses && d.left > 0) {
      ul.append(todoRow('warn', '진행 중인 정산에 송금 ' + d.left + '번 남았어요',
        '총 ' + won(d.total), [['열기', () => { location.hash = '#/dutch'; }, true]]));
    }

    td.prep.forEach((x) => ul.append(todoRow('', x.appt.title + ' 준비물 ' + x.got + '/' + x.total,
      (x.days === 0 ? '오늘' : x.days + '일 뒤') + ' · 아직 못 챙긴 게 있어요', [['캘린더', () => { location.hash = '#/calendar'; }]])));

    $('todoEmpty').hidden = ul.children.length > 0;

    const up = $('upList');
    up.replaceChildren();
    td.upcoming.slice(1, 5).forEach((x) => {
      const li = todoRow('', x.appt.title, when(x.appt) + (x.appt.place ? ' · ' + x.appt.place : ''), []);
      li.append(el('span', 'dd', x.days === 0 ? '오늘' : 'D-' + x.days));
      up.append(li);
    });
    $('upEmpty').hidden = up.children.length > 0;
    $('upH').hidden = false;
  }

  // ----- 강아지 친구 보이기/숨기기 -----
  function paintMascotBtn() { $('mascotToggle').textContent = Mascot.isOff() ? '강아지 친구 다시 보기' : '강아지 친구 숨기기'; }
  paintMascotBtn();
  $('mascotToggle').addEventListener('click', () => {
    Mascot.setOff(!Mascot.isOff());
    paintMascotBtn();
    if (!Mascot.isOff()) Mascot.say('happy', '다시 만나서 반가워요!');
  });

  // 강아지를 두 번째로 눌렀을 때 알려 줄 말 (해야 할 일이 있으면 그걸, 없으면 다음 약속)
  Mascot.hint = () => {
    const td = S.todos();
    if (td.unsettled.length) return td.unsettled[0].appt.title + ' 정산을 아직 안 했어요!';
    if (td.pending.length) return td.pending[0].appt.title + ' 송금이 남아 있어요!';
    const next = S.upcoming()[0];
    if (next) { const dd = S.daysUntil(next.date); return dd === 0 ? '오늘 약속이 있어요! 즐거운 시간 보내요!' : next.title + '까지 D-' + dd + '!'; }
    return null;
  };

  // ----- 다크 모드 (처음엔 폰 설정을 따르고, 버튼을 누르면 고른 값을 기억) -----
  function applyTheme(t, remember) {
    document.documentElement.setAttribute('data-theme', t);
    if (remember) { try { localStorage.setItem('dutchpay-theme', t); } catch (e) {} }
    const m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', t === 'dark' ? '#0B1020' : '#101B3B');
    $('themeBtn').setAttribute('aria-label', t === 'dark' ? '라이트 모드로 바꾸기' : '다크 모드로 바꾸기');
  }
  applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light', false);
  $('themeBtn').addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(next, true);
    toast(next === 'dark' ? '다크 모드로 바꿨어요' : '라이트 모드로 바꿨어요');
  });

  // ----- 백업 / 복원 -----
  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  $('bkFile').addEventListener('click', async () => {
    const name = '약속이후_백업_' + S.todayYmd() + '.json';
    const file = new File([S.buildBackup()], name, { type: 'application/json' });
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: name }); return; }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    download(file, name);
    toast('백업 파일을 저장했어요. 저장이 안 되면 "백업 글자 복사"를 써 보세요');
  });
  $('bkCopy').addEventListener('click', async () => {
    toast((await copyText(S.buildBackup())) ? '백업 글자를 복사했어요. 메모장이나 카톡 "나와의 채팅"에 붙여넣어 보관하세요' : '복사하지 못했어요. 백업 파일 저장을 써 주세요');
  });

  function restoreFrom(text) {
    const p = S.parseBackup(text);
    if (!p.ok) return toast(p.error);
    const msg = '약속 ' + p.plans.length + '개, 저장한 정산 ' + p.history.length + '개를 복원할까요?\n지금 이 폰의 약속·정산은 백업 내용으로 바뀌어요.';
    if (!confirm(msg)) return;
    if (!S.applyBackup(p)) return toast('복원하지 못했어요. 저장 공간을 확인해 주세요 (기존 내용은 그대로예요)');
    toast('복원했어요');
    setTimeout(() => location.reload(), 600);
  }
  $('bkPick').addEventListener('change', (ev) => {
    const f = ev.target.files && ev.target.files[0];
    ev.target.value = '';
    if (!f) return;
    if (f.size > 3000000) return toast('파일이 너무 커요');
    const r = new FileReader();
    r.onload = () => restoreFrom(String(r.result));
    r.onerror = () => toast('파일을 읽지 못했어요');
    r.readAsText(f);
  });
  $('bkRestore').addEventListener('click', () => restoreFrom($('bkText').value));

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
