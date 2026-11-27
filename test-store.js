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

// 준비물·메모·지도 링크
{
  const items = S.parseItems('우산, 돗자리，우산, , 보조배터리\n물티슈', [{ t: '돗자리', d: true }]);
  assert.deepStrictEqual(items.map((x) => x.t), ['우산', '돗자리', '보조배터리', '물티슈'], '중복·빈 칸 제거');
  assert.strictEqual(items.find((x) => x.t === '돗자리').d, true, '체크 유지');
  assert.strictEqual(S.parseItems('a,'.repeat(40)).length, 1, 'a 중복');
  assert.strictEqual(S.parseItems(Array.from({ length: 40 }, (_, i) => 'x' + i).join(',')).length, 20, '20개까지');
  const b = S.add({ title: '소풍', date: '2026-12-10', place: '한강 공원 & 카페', memo: '비 오면 취소', items });
  assert.strictEqual(S.get(b.id).items.length, 4);
  S.update(b.id, { items: S.get(b.id).items.map((x) => ({ ...x, d: x.t === '우산' })) });
  assert.strictEqual(S.get(b.id).items.find((x) => x.t === '우산').d, true);
  const m = S.mapLinks('한강 공원 & 카페');
  assert.strictEqual(m.naver, 'https://map.naver.com/p/search/' + encodeURIComponent('한강 공원 & 카페'));
  assert.ok(!m.kakao.includes(' ') && !m.kakao.includes('&'), '주소에 안전한 글자만');
  assert.strictEqual(S.mapLinks('  '), null);
  const back = S.decodeShare(S.encodeShare(S.get(b.id)));
  assert.strictEqual(back.memo, '비 오면 취소');
  assert.deepStrictEqual(back.items.map((x) => x.t), ['우산', '돗자리', '보조배터리', '물티슈']);
  assert.ok(back.items.every((x) => x.d === false), '체크 표시는 공유하지 않음');
  // 최대치로 채워도 공유 링크가 받아들여짐
  const big = { title: '가'.repeat(30), date: '2026-12-10', place: '나'.repeat(30), memo: '다'.repeat(200),
    people: Array.from({ length: 20 }, (_, i) => '라'.repeat(9) + i % 10), items: Array.from({ length: 20 }, (_, i) => '마'.repeat(18) + (i % 10) + 'x'.repeat(0) + String.fromCharCode(97 + i)).map((t) => ({ t: t.slice(0, 20), d: false })) };
  const bc = S.encodeShare(S.cleanAppt(big));
  assert.ok(S.decodeShare(bc), '최대 크기도 열림 (길이 ' + bc.length + ')');
  S.remove(b.id);
  console.log('OK  준비물·메모·지도 링크');
}

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
