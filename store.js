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
    return { people: cleanPeople(s.people), expenses };
  }
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
    };
    const s = cleanSettlement(raw.settlement);
    if (s) a.settlement = s;
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
    return toB64(JSON.stringify({ v: 1, t: a.title, d: a.date, h: a.time || '', p: a.place || '', w: a.people || [] }));
  }
  function decodeShare(code) {
    try {
      if (typeof code !== 'string' || !code || code.length > 3000) return null;
      const o = JSON.parse(fromB64(code));
      if (!o || o.v !== 1) return null;
      return cleanAppt({ title: o.t, date: o.d, time: o.h, place: o.p, people: o.w }); // id는 받는 쪽에서 새로 만듦
    } catch (e) { return null; }
  }

  const api = {
    fmt, todayYmd, validYmd, labelDate, daysUntil,
    list, get, byDate, upcoming, add, update, remove, setSettlement,
    encodeShare, decodeShare, cleanAppt,
    _reset: () => { items = []; },
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CalStore = api;
})(typeof self !== 'undefined' ? self : globalThis);
