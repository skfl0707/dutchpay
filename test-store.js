// 실행: node test-store.js
const assert = require('assert');
const mem = {};
global.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); } };
const S = require('./store.js');

// 날짜 도우미
assert.strictEqual(S.validYmd('2026-11-20'), true);
assert.strictEqual(S.validYmd('2026-02-30'), false);
assert.strictEqual(S.validYmd('abc'), false);
assert.strictEqual(S.labelDate('2026-11-20'), '11월 20일 (금)');
assert.strictEqual(S.daysUntil(S.todayYmd()), 0);
console.log('OK  날짜');

// 추가/조회/정렬/수정/삭제
const a = S.add({ title: '동창회', date: '2026-12-05', time: '18:30', place: '강남역', people: ['나', '민수', '지연', '민수'] });
const b = S.add({ title: '점심', date: '2026-12-05', time: '12:00', people: [] });
const c = S.add({ title: '번개', date: '2026-12-01' });
assert.deepStrictEqual(a.people, ['나', '민수', '지연'], '중복 이름 제거');
assert.deepStrictEqual(S.list().map((x) => x.title), ['번개', '점심', '동창회'], '날짜·시간순');
assert.strictEqual(S.byDate('2026-12-05').length, 2);
assert.strictEqual(S.add({ title: '', date: '2026-12-05' }), null, '이름 없으면 거부');
assert.strictEqual(S.add({ title: 'x', date: '2026-13-40' }), null, '잘못된 날짜 거부');
S.update(a.id, { title: '동창회 2차', time: '' });
assert.strictEqual(S.get(a.id).title, '동창회 2차');
assert.strictEqual(S.get(a.id).time, '');
S.remove(c.id);
assert.strictEqual(S.list().length, 2);
console.log('OK  추가/정렬/수정/삭제');

// 정산 연결 저장
S.setSettlement(a.id, { people: ['나', '민수'], expenses: [{ id: 1, title: '식비', payer: '나', amount: 30000, shares: ['나', '민수'] }, { id: 2, payer: '', amount: 5, shares: ['나'] }] });
assert.strictEqual(S.get(a.id).settlement.expenses.length, 1, '잘못된 지출은 걸러짐');
console.log('OK  정산 연결');

// 송금 완료 표시 저장·정리
S.setSettlement(a.id, { people: ['나', '민수'], expenses: [{ id: 1, title: '식비', payer: '나', amount: 30000, shares: ['나', '민수'] }],
  paid: { '민수>나:15000': true, '이상한값': true, 'a>b:1': 'yes' } });
assert.deepStrictEqual(S.get(a.id).settlement.paid, { '민수>나:15000': true }, '올바른 체크만 남음');
console.log('OK  송금 완료 표시');

// 새로고침 후 복원
const saved = JSON.parse(mem['dutchpay-cal-v1']);
assert.strictEqual(saved.length, 2);

// 공유 링크: 한글 왕복, 위조/깨진 링크 방어
const code = S.encodeShare(S.get(a.id));
assert.ok(/^[A-Za-z0-9_-]+$/.test(code), 'URL에 안전한 문자');
const d = S.decodeShare(code);
assert.deepStrictEqual([d.title, d.date, d.place, d.people], ['동창회 2차', '2026-12-05', '강남역', ['나', '민수', '지연']]);
assert.strictEqual(d.settlement, undefined, '정산 내역은 공유하지 않음');
assert.strictEqual(S.decodeShare('깨진링크'), null);
assert.strictEqual(S.decodeShare('aGVsbG8'), null);
assert.strictEqual(S.decodeShare('A'.repeat(5000)), null);
const evil = Buffer.from(JSON.stringify({ v: 1, t: '<img src=x onerror=alert(1)>', d: '2026-12-05', w: ['<b>'] })).toString('base64url');
assert.strictEqual(S.decodeShare(evil).title, '<img src=x onerror=alert(1)>', '문자열로만 보관 (화면에서는 textContent로만 표시)');
console.log('OK  공유 링크 (링크 길이 ' + code.length + '자)');
console.log('저장소 테스트 통과');
