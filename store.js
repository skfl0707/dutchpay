// 약속(캘린더) 데이터 저장소. 화면과 분리되어 있고, 기기 안(localStorage)에만 저장합니다.
(function (root) {
  const KEY = 'dutchpay-cal-v1';
  const WD = ['일', '월', '화', '수', '목', '금', '토'];
  const pad = (n) => String(n).padStart(2, '0');
  const fmt = (y, m, d) => y + '-' + pad(m + 1) + '-' + pad(d); // m: 0~11

  function todayYmd() {
    const t = new Date();
    return fmt(t.getFullYear(), t.getMonth(), t.getDate());
  }
  function validYmd(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const [y, m, d] = s.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
  }
  function labelDate(s) {
    const [y, m, d] = s.split('-').map(Number);
    return m + '월 ' + d + '일 (' + WD[new Date(y, m - 1, d).getDay()] + ')';
  }
  function daysUntil(s) {
    const [y, m, d] = s.split('-').map(Number);
    const t = new Date();
    const a = new Date(y, m - 1, d);
    const b = new Date(t.getFullYear(), t.getMonth(), t.getDate());
    return Math.round((a - b) / 86400000);
  }

  // ----- 입력 정리 (저장 전, 공유 링크로 받을 때 모두 사용) -----
  const cleanText = (s, max) => (typeof s === 'string' ? s.trim().slice(0, max) : '');
  function cleanPeople(arr) {
    if (!Array.isArray(arr)) return [];
    const out = [];
    arr.forEach((p) => {
      const n = cleanText(p, 10);
      if (n && !out.includes(n) && out.length < 20) out.push(n);
    });
    return out;
  }
  function cleanSettlement(s) {
    if (!s || !Array.isArray(s.people) || !Array.isArray(s.expenses)) return undefined;
    const expenses = s.expenses
      .map((e) => ({
        id: Number.isFinite(e && e.id) ? e.id : Date.now(),
        title: cleanText(e && e.title, 20) || '지출',
        payer: cleanText(e && e.payer, 10),
        amount: Number(e && e.amount),
        shares: cleanPeople(e && e.shares),
      }))
      .filter((e) => e.payer && Number.isFinite(e.amount) && e.amount > 0 && e.shares.length);
    return { people: cleanPeople(s.people), expenses, paid: cleanPaid(s.paid) };
  }
  // 송금 완료 표시: { "보내는사람>받는사람:금액": true }
  function cleanPaid(p) {
    const out = {};
    if (p && typeof p === 'object' && !Array.isArray(p)) {
      Object.keys(p).slice(0, 200).forEach((k) => {
        if (p[k] === true && k.length <= 60 && /^.+>.+:\d+$/.test(k)) out[k] = true;
      });
    }
    return out;
  }
  // 준비물: [{ t: '우산', d: false }]
  function cleanItems(arr) {
    if (!Array.isArray(arr)) return [];
    const out = [];
    arr.forEach((x) => {
      const t = cleanText(x && x.t, 20);
      if (t && !out.some((o) => o.t === t) && out.length < 20) out.push({ t, d: !!(x && x.d) });
    });
    return out;
  }
  const KINDS = ['meal', 'drink', 'cafe'];
  function cleanAppt(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const title = cleanText(raw.title, 30);
    if (!title || !validYmd(raw.date)) return null;
    const a = {
      id: Number.isFinite(raw.id) ? raw.id : Date.now(),
      title,
      date: raw.date,
      time: typeof raw.time === 'string' && /^\d{2}:\d{2}$/.test(raw.time) ? raw.time : '',
      place: cleanText(raw.place, 30),
      people: cleanPeople(raw.people),
      memo: cleanText(raw.memo, 200),
      items: cleanItems(raw.items),
    };
    const s = cleanSettlement(raw.settlement);
    if (s) a.settlement = s;
    if (KINDS.includes(raw.kind)) a.kind = raw.kind; // 모임 종류(식사/술/카페), 없으면 약속 이름으로 추측
    if (raw.sample === true) a.sample = true; // 처음 체험용 예시 데이터
    if (raw.skipSettle === true) a.skipSettle = true; // "정산 없음"으로 표시한 약속
    return a;
  }
  const sortKey = (a) => a.date + ' ' + (a.time || '99:99');
  const byTime = (a, b) => (sortKey(a) < sortKey(b) ? -1 : sortKey(a) > sortKey(b) ? 1 : a.id - b.id);

  // ----- 저장 -----
  let items = load();
  function load() {
    try {
      const a = JSON.parse(root.localStorage.getItem(KEY));
      if (Array.isArray(a)) return a.map(cleanAppt).filter(Boolean);
    } catch (e) {}
    return [];
  }
  function persist() {
    try { root.localStorage.setItem(KEY, JSON.stringify(items)); return true; } catch (e) { return false; }
  }
  const uniqueId = () => { let id = Date.now(); while (items.some((x) => x.id === id)) id++; return id; };

  function list() { return items.slice().sort(byTime); }
  function get(id) { return items.find((x) => x.id === id) || null; }
  function byDate(ymd) { return list().filter((x) => x.date === ymd); }
  function upcoming() { const t = todayYmd(); return list().filter((x) => x.date >= t); }
  function add(fields) {
    const a = cleanAppt({ ...fields, id: uniqueId() });
    if (!a) return null;
    items.push(a);
    return persist() ? a : (items.pop(), null);
  }
  function update(id, fields) {
    const i = items.findIndex((x) => x.id === id);
    if (i < 0) return null;
    const a = cleanAppt({ ...items[i], ...fields, id });
    if (!a) return null;
    items[i] = a;
    persist();
    return a;
  }
  function remove(id) { items = items.filter((x) => x.id !== id); persist(); }
  function setSettlement(id, s) {
    const a = get(id);
    if (!a) return;
    const c = cleanSettlement(s);
    if (c) a.settlement = c; else delete a.settlement;
    persist();
  }

  // ----- 공유 링크 (서버 없이, 약속 내용을 링크 안에 담음) -----
  function toB64(str) {
    let bin = '';
    new TextEncoder().encode(str).forEach((b) => (bin += String.fromCharCode(b)));
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function fromB64(code) {
    let b = code.replace(/-/g, '+').replace(/_/g, '/');
    while (b.length % 4) b += '=';
    return new TextDecoder().decode(Uint8Array.from(atob(b), (c) => c.charCodeAt(0)));
  }
  function encodeShare(a) {
    // 준비물은 이름만 보냄 (체크 표시는 각자의 것)
    return toB64(JSON.stringify({
      v: 1, t: a.title, d: a.date, h: a.time || '', p: a.place || '', w: a.people || [],
      m: a.memo || '', i: (a.items || []).map((x) => x.t), k: a.kind || '',
    }));
  }
  function decodeShare(code) {
    try {
      if (typeof code !== 'string' || !code || code.length > 6000) return null;
      const o = JSON.parse(fromB64(code));
      if (!o || o.v !== 1) return null;
      const items = Array.isArray(o.i) ? o.i.map((t) => ({ t, d: false })) : [];
      return cleanAppt({ title: o.t, date: o.d, time: o.h, place: o.p, people: o.w, memo: o.m, items, kind: o.k }); // id는 받는 쪽에서 새로 만듦
    } catch (e) { return null; }
  }

  // ----- 홈 "해야 할 일" 계산 -----
  function dayDiff(fromYmd, toYmd) { // toYmd - fromYmd (일)
    const p = (s) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
    return Math.round((p(toYmd) - p(fromYmd)) / 86400000);
  }
  function todos(today) {
    const t = today || todayYmd();
    const settleApi = typeof root.settle === 'function' ? root : require('./settle.js');
    const out = { unsettled: [], pending: [], prep: [], upcoming: [] };
    list().forEach((a) => {
      const d = dayDiff(t, a.date);
      const s = a.settlement;
      const hasSettle = !!(s && s.expenses.length);
      if (d < 0 && d >= -30 && !hasSettle && !a.skipSettle) out.unsettled.push({ appt: a, ago: -d });
      if (hasSettle) {
        const r = settleApi.settle(s.people, s.expenses);
        const left = settleApi.pendingTransfers(r.transfers, s.paid).length;
        if (left > 0) out.pending.push({ appt: a, left });
      }
      if (d >= 0 && d <= 7 && a.items.length) {
        const got = a.items.filter((x) => x.d).length;
        if (got < a.items.length) out.prep.push({ appt: a, got, total: a.items.length, days: d });
      }
      if (d >= 0) out.upcoming.push({ appt: a, days: d });
    });
    out.unsettled.sort((x, y) => x.ago - y.ago); // 최근 것부터
    return out;
  }

  // ----- 자주 만나는 친구 (정산할 때 눌러서 추가) -----
  const FR_KEY = 'dutchpay-friends-v1';
  function cleanFriends(arr) {
    if (!Array.isArray(arr)) return [];
    const out = [];
    arr.forEach((p) => {
      const n = cleanText(p, 10);
      if (n && !out.includes(n) && out.length < 30) out.push(n);
    });
    return out;
  }
  function friends() { return cleanFriends(readJson(FR_KEY)); }
  function saveFriends(list) {
    const c = cleanFriends(list);
    try { root.localStorage.setItem(FR_KEY, JSON.stringify(c)); return c; } catch (e) { return null; }
  }
  function addFriends(names) { const cur = friends(); return saveFriends(cur.concat(cleanFriends(names).filter((n) => !cur.includes(n)))); }
  function removeFriend(name) { return saveFriends(friends().filter((n) => n !== name)); }

  // ----- 한 줄 입력("내일 저녁 7시 강남역에서 민수랑 술 약속")을 약속 칸으로 나누기 -----
  // AI가 아니라 정해진 규칙으로 읽음. 못 읽은 칸은 비워 두고 사용자가 확인·수정함.
  function addDays(ymd, n) {
    const [y, m, d] = ymd.split('-').map(Number);
    const dt = new Date(y, m - 1, d + n);
    return fmt(dt.getFullYear(), dt.getMonth(), dt.getDate());
  }
  function weekdayOf(ymd) { const [y, m, d] = ymd.split('-').map(Number); return new Date(y, m - 1, d).getDay(); }
  function mkYmd(y, m, d) { const s = fmt(y, m - 1, d); return validYmd(s) ? s : ''; } // m: 1~12
  const WD_IDX = { 일: 0, 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6 };
  function detectKind(t) {
    if (/술|호프|맥주|소주|막걸리|와인|위스키|칵테일|포차|이자카야|회식|2차|뒤풀이|펍/.test(t)) return 'drink';
    if (/카페|커피|디저트|케이크/.test(t)) return 'cafe';
    if (/식사|밥|점심|저녁|맛집|브런치|고기|파스타|치킨|국밥|삼겹살/.test(t)) return 'meal';
    return '';
  }
  const GENERIC_PEOPLE = ['친구', '가족', '동료', '다같이', '같이', '혼자', '우리', '모두', '다들'];

  function parseQuick(input, today) {
    const t0 = today || todayYmd();
    let rest = ' ' + String(input || '').trim().slice(0, 200) + ' ';
    const out = { date: '', time: '', place: '', people: [], kind: '', title: '' };
    const found = { date: false, time: false, place: false, people: false };
    // 끝의 부탁 말투 제거
    rest = rest.replace(/\s*(해\s*줘|해\s*주세요)\s*$/, ' ');
    rest = rest.replace(/\s*(잡아|추가해|추가|만들어|넣어|등록해|등록|예약해|예약)\s*(줘|주세요|줄래|줘요|봐)?[.!?~\s]*$/, ' ');
    out.kind = detectKind(rest);

    const take = (re) => {
      const m = re.exec(rest);
      if (m) rest = rest.slice(0, m.index) + ' ' + rest.slice(m.index + m[0].length);
      return m;
    };

    // --- 날짜 ---
    let m;
    const mondayShift = (weekdayOf(t0) + 6) % 7;
    if ((m = take(/(오늘|내일|모레|글피)(?:에|은|는)?(?=\s|$)/))) {
      out.date = addDays(t0, { 오늘: 0, 내일: 1, 모레: 2, 글피: 3 }[m[1]]);
    } else if ((m = take(/(\d{1,2})\s*(일|주)\s*(?:뒤|후)(?:에)?(?=\s|$)/))) {
      out.date = addDays(t0, Number(m[1]) * (m[2] === '주' ? 7 : 1));
    } else if ((m = take(/(이번\s*주|다음\s*주|담\s*주|다다음\s*주)?\s*(월|화|수|목|금|토|일)요일(?:에|은|는)?(?=\s|$)/))) {
      const idx = WD_IDX[m[2]];
      if (m[1]) {
        const w = m[1].replace(/\s/g, '');
        const base = addDays(t0, -mondayShift + (w === '이번주' ? 0 : w === '다다음주' ? 14 : 7));
        out.date = addDays(base, (idx + 6) % 7);
      } else {
        out.date = addDays(t0, ((idx - weekdayOf(t0) + 7) % 7) || 7); // 오늘 이후 가장 가까운 그 요일
      }
    } else if ((m = take(/(다음\s*주|담\s*주)(?:에|은|는)?(?=\s|$)/))) {
      out.date = addDays(t0, 7);
    } else if ((m = take(/(\d{1,2})\s*월\s*(\d{1,2})\s*일(?:에|은|는)?(?=\s|$)/)) || (m = take(/(?:^|\s)(\d{1,2})\s*[\/.]\s*(\d{1,2})(?:에)?(?=\s|$)/))) {
      const y0 = Number(t0.slice(0, 4));
      out.date = mkYmd(y0, Number(m[1]), Number(m[2]));
      if (out.date && out.date < t0) out.date = mkYmd(y0 + 1, Number(m[1]), Number(m[2]));
    } else if ((m = take(/(?:^|\s)(\d{1,2})\s*일(?:에|은|는)?(?=\s|$)/))) {
      const [y0, mo0] = t0.split('-').map(Number);
      out.date = mkYmd(y0, mo0, Number(m[1]));
      if (!out.date || out.date < t0) {
        const nx = new Date(y0, mo0, 1); // 다음 달 1일
        out.date = mkYmd(nx.getFullYear(), nx.getMonth() + 1, Number(m[1]));
      }
    }
    found.date = !!out.date;

    // --- 시간 ---
    const hhmm = (h, mi, pre, rawH) => {
      if (mi > 59 || h > 24) return '';
      if (pre === '오후' || pre === '저녁') { if (h < 12) h += 12; }
      else if (pre === '밤') { h = h === 12 ? 0 : h < 12 ? h + 12 : h; }
      else if (pre === '점심') { if (h >= 1 && h <= 6) h += 12; }
      else if (pre === '오전' || pre === '아침' || pre === '새벽') { if (h === 12) h = 0; }
      else if (h >= 1 && h <= 8 && !/^0/.test(rawH)) h += 12; // 앞말이 없으면 1~8시는 오후로 봄
      if (h >= 24) h = 0;
      return String(h).padStart(2, '0') + ':' + String(mi).padStart(2, '0');
    };
    if ((m = take(/(오전|오후|아침|점심|저녁|밤|새벽)?\s*(\d{1,2}):(\d{2})(?:에|부터)?(?=\s|$)/))) {
      out.time = hhmm(Number(m[2]), Number(m[3]), m[1], m[2]);
    } else if ((m = take(/(오전|오후|아침|점심|저녁|밤|새벽)?\s*(\d{1,2})\s*시\s*(?:(반)|(\d{1,2})\s*분)?(?:에|부터)?(?=\s|$)/))) {
      out.time = hhmm(Number(m[2]), m[3] ? 30 : Number(m[4] || 0), m[1], m[2]);
    }
    found.time = !!out.time;

    // --- 사람 / 장소 / 제목 ---
    const tokens = rest.split(/[\s,]+/).filter(Boolean);
    const used = tokens.map(() => false);
    tokens.forEach((tok, i) => {
      const pm = /^([가-힣A-Za-z]{2,6}?)(이랑|랑|하고|와|과)$/.exec(tok);
      if (!pm) return;
      used[i] = true;
      const name = pm[1];
      if (GENERIC_PEOPLE.includes(name) || name.endsWith('들')) return;
      if (!out.people.includes(name)) out.people.push(name);
    });
    let pi = tokens.findIndex((t, i) => !used[i] && /.{2,}에서$/.test(t));
    if (pi < 0) pi = tokens.findIndex((t, i) => !used[i] && /.{2,}에$/.test(t));
    if (pi >= 0) {
      const parts = [tokens[pi].replace(/(에서|에)$/, '')];
      used[pi] = true;
      let i = pi;
      while (i > 0 && !used[i - 1] && /^(\d+번|\d+층|출구|입구|근처|앞|뒤|옆|사거리|카페|식당|술집|호프|포차|공원|영화관|레스토랑|극장)$/.test(parts[0])) {
        parts.unshift(tokens[i - 1]);
        i--;
        used[i] = true;
      }
      out.place = cleanText(parts.join(' '), 30);
    }
    found.place = !!out.place;
    if (out.people.length) { out.people.unshift('나'); found.people = true; }

    const STOP = /^(같이|함께|우리|좀|그냥|에|은|는|을|를)$/;
    out.title = cleanText(tokens.filter((t, i) => !used[i] && !STOP.test(t)).join(' '), 30);
    if (!out.title) out.title = out.kind === 'drink' ? '술 약속' : out.kind === 'cafe' ? '카페 모임' : out.kind === 'meal' ? '식사 약속' : '약속';

    const any = found.date || found.time || found.place || found.people;
    return { ok: any, fields: out, found, error: any ? '' : '날짜·시간·장소를 찾지 못했어요' };
  }

  // ----- 처음 체험용 예시 데이터 -----
  function shiftDay(n) { const d = new Date(); d.setDate(d.getDate() + n); return fmt(d.getFullYear(), d.getMonth(), d.getDate()); }
  function hasSample() { return items.some((x) => x.sample); }
  function addSample() {
    const ppl = ['나', '민수', '지연', '하늘'];
    const past = add({ title: '[예시] 동창 모임', date: shiftDay(-2), time: '19:00', place: '강남역 2번 출구', people: ppl,
      memo: '예시 데이터예요. 마음껏 눌러 보고, 다 해 봤으면 홈에서 지울 수 있어요.', sample: true });
    if (!past) return false;
    setSettlement(past.id, { people: ppl, paid: {}, expenses: [
      { id: 1, title: '저녁 식사', payer: '나', amount: 100000, shares: ppl },
      { id: 2, title: '카페', payer: '민수', amount: 20000, shares: ['민수', '지연', '하늘'] },
    ] });
    add({ title: '[예시] 주말 소풍', date: shiftDay(3), place: '한강 공원', people: ppl, sample: true,
      items: [{ t: '돗자리', d: true }, { t: '도시락', d: false }, { t: '보조배터리', d: false }] });
    return true;
  }
  function removeSamples() {
    const n = items.filter((x) => x.sample).length;
    items = items.filter((x) => !x.sample);
    persist();
    return n;
  }

  // ----- 백업 / 복원 (파일 또는 글자). 읽을 때는 반드시 정리 함수로 검증 -----
  const CUR_KEY = 'dutchpay-v1';
  const HIS_KEY = 'dutchpay-history-v1';
  function cleanHistory(h) {
    if (!Array.isArray(h)) return [];
    return h.slice(0, 30).map((r) => {
      const s = cleanSettlement(r);
      if (!s || !s.expenses.length) return null;
      return {
        id: Number.isFinite(r.id) ? r.id : Date.now(),
        name: cleanText(r.name, 20) || '정산',
        savedAt: Number.isFinite(r.savedAt) ? r.savedAt : Date.now(),
        people: s.people, expenses: s.expenses, paid: s.paid,
      };
    }).filter(Boolean);
  }
  function readJson(key) { try { return JSON.parse(root.localStorage.getItem(key)); } catch (e) { return null; } }
  function buildBackup() {
    return JSON.stringify({
      app: 'yaksok-ihu', v: 1, savedAt: Date.now(),
      plans: items, current: readJson(CUR_KEY), history: readJson(HIS_KEY) || [], friends: friends(),
    });
  }
  // 글자 → { ok, plans, current, history } 또는 { ok:false, error }
  function parseBackup(text) {
    try {
      if (typeof text !== 'string' || !text.trim()) return { ok: false, error: '백업 내용이 비어 있어요' };
      if (text.length > 3000000) return { ok: false, error: '파일이 너무 커요' };
      const o = JSON.parse(text);
      if (!o || o.app !== 'yaksok-ihu' || o.v !== 1) return { ok: false, error: '이 앱의 백업 파일이 아니에요' };
      const seen = {};
      const plans = (Array.isArray(o.plans) ? o.plans : []).slice(0, 500).map(cleanAppt).filter((a) => a && !seen[a.id] && (seen[a.id] = true));
      const c = o.current && typeof o.current === 'object' ? o.current : {};
      const cs = cleanSettlement(c) || { people: [], expenses: [], paid: {} };
      const current = { people: cs.people, expenses: cs.expenses, paid: cs.paid };
      if (Number.isFinite(c.planId) && plans.some((a) => a.id === c.planId)) current.planId = c.planId;
      return { ok: true, plans, current, history: cleanHistory(o.history), friends: cleanFriends(o.friends) };
    } catch (e) { return { ok: false, error: '백업 파일을 읽지 못했어요' }; }
  }
  function applyBackup(p) {
    if (!p || !p.ok) return false;
    const prev = [items, root.localStorage.getItem(CUR_KEY), root.localStorage.getItem(HIS_KEY), root.localStorage.getItem(FR_KEY)];
    try {
      items = p.plans.slice();
      if (!persist()) throw new Error('save');
      root.localStorage.setItem(CUR_KEY, JSON.stringify(p.current));
      root.localStorage.setItem(HIS_KEY, JSON.stringify(p.history));
      root.localStorage.setItem(FR_KEY, JSON.stringify(p.friends || []));
      return true;
    } catch (e) { // 저장 공간 부족 등: 원래대로 되돌림
      items = prev[0];
      try {
        persist();
        if (prev[1] !== null) root.localStorage.setItem(CUR_KEY, prev[1]);
        if (prev[2] !== null) root.localStorage.setItem(HIS_KEY, prev[2]);
        if (prev[3] !== null) root.localStorage.setItem(FR_KEY, prev[3]);
      } catch (e2) {}
      return false;
    }
  }

  // 입력창의 "우산, 돗자리" 글을 준비물 목록으로 (이미 체크한 항목은 체크 유지)
  function parseItems(text, prev) {
    const done = {};
    (prev || []).forEach((x) => { if (x.d) done[x.t] = true; });
    const names = String(text || '').split(/[,，\n]/).map((s) => s.trim()).filter(Boolean);
    return cleanItems(names.map((t) => ({ t: t.slice(0, 20), d: !!done[t.slice(0, 20)] })));
  }

  // 약속 이름으로 모임 종류 추측: 술 / 카페 / 식사
  function guessKind(title) {
    const t = String(title || '');
    if (/술|호프|맥주|소주|막걸리|와인|위스키|칵테일|포차|이자카야|회식|2차|뒤풀이|펍/.test(t)) return 'drink';
    if (/카페|커피|디저트|브런치|케이크|빵/.test(t)) return 'cafe';
    return 'meal';
  }
  const KIND_WORD = { meal: '맛집', drink: '술집', cafe: '카페' };
  // 장소 주변 가게를 지도 앱에서 검색하는 링크 (앱이 직접 추천하지 않고, 지도 앱의 순위·후기를 그대로 사용)
  function nearbyLinks(place, kind) {
    const base = cleanText(place, 30).replace(/\s*\d+번\s*출구/g, '').trim();
    if (!base || !KIND_WORD[kind]) return null;
    const e = encodeURIComponent(base + ' ' + KIND_WORD[kind]);
    return { word: KIND_WORD[kind], naver: 'https://map.naver.com/p/search/' + e, kakao: 'https://map.kakao.com/link/search/' + e };
  }

  // 지도 앱 검색 링크 (API 없이 주소만 사용)
  function mapLinks(place) {
    const q = cleanText(place, 30);
    if (!q) return null;
    const e = encodeURIComponent(q);
    return { naver: 'https://map.naver.com/p/search/' + e, kakao: 'https://map.kakao.com/link/search/' + e };
  }

  const api = {
    parseQuick, detectKind,
    friends, addFriends, removeFriend, hasSample, addSample, removeSamples,
    parseItems, mapLinks, guessKind, nearbyLinks, todos, dayDiff, buildBackup, parseBackup, applyBackup,
    fmt, todayYmd, validYmd, labelDate, daysUntil,
    list, get, byDate, upcoming, add, update, remove, setSettlement,
    encodeShare, decodeShare, cleanAppt,
    _reset: () => { items = []; },
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CalStore = api;
})(typeof self !== 'undefined' ? self : globalThis);
