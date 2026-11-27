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
// 홈 해야 할 일
{
  S._reset();
  const T = '2026-12-01';
  const mk = (title, date, extra) => S.add({ title, date, ...extra });
  const old1 = mk('지난 모임', '2026-11-28');           // 정산 안 함 → 알림
  const old2 = mk('옛날 모임', '2026-09-01');           // 30일 넘음 → 제외
  const old3 = mk('정산 없음 모임', '2026-11-25');
  S.update(old3.id, { skipSettle: true });
  const old4 = mk('정산 중 모임', '2026-11-20', { people: ['나', '민수'] });
  S.setSettlement(old4.id, { people: ['나', '민수'], expenses: [{ id: 1, title: '식비', payer: '나', amount: 30000, shares: ['나', '민수'] }] });
  const soon = mk('소풍', '2026-12-03', { items: [{ t: '돗자리', d: true }, { t: '우산', d: false }] });
  mk('먼 약속', '2026-12-25', { items: [{ t: '선물', d: false }] });
  const td = S.todos(T);
  assert.deepStrictEqual(td.unsettled.map((x) => x.appt.title), ['지난 모임', '정산 중 모임'].filter((n) => n === '지난 모임'), '정산 기록 없는 최근 약속만');
  assert.strictEqual(td.unsettled[0].ago, 3);
  assert.deepStrictEqual(td.pending.map((x) => [x.appt.title, x.left]), [['정산 중 모임', 1]]);
  assert.deepStrictEqual(td.prep.map((x) => [x.appt.title, x.got, x.total, x.days]), [['소풍', 1, 2, 2]], '7일 안, 미완료만');
  assert.deepStrictEqual(td.upcoming.map((x) => x.appt.title), ['소풍', '먼 약속']);
  // 송금을 모두 체크하면 남은 송금 목록에서 빠짐
  S.setSettlement(old4.id, { people: ['나', '민수'], expenses: S.get(old4.id).settlement.expenses, paid: { '민수>나:15000': true } });
  assert.strictEqual(S.todos(T).pending.length, 0);
  assert.strictEqual(S.dayDiff('2026-12-31', '2027-01-02'), 2);
  console.log('OK  홈 해야 할 일');

  // 백업 → 지우고 → 복원
  mem['dutchpay-v1'] = JSON.stringify({ people: ['나', '민수'], expenses: [{ id: 1, title: '식비', payer: '나', amount: 30000, shares: ['나', '민수'] }], paid: {}, planId: old4.id });
  mem['dutchpay-history-v1'] = JSON.stringify([{ id: 5, name: '11월 모임', savedAt: 1700000000000, people: ['나', '민수'], expenses: [{ id: 1, title: '식비', payer: '나', amount: 30000, shares: ['나', '민수'] }] }]);
  const text = S.buildBackup();
  const before = S.list().length;
  S._reset();
  delete mem['dutchpay-v1']; delete mem['dutchpay-history-v1'];
  const p = S.parseBackup(text);
  assert.ok(p.ok);
  assert.strictEqual(p.plans.length, before);
  assert.strictEqual(p.current.planId, old4.id, '연결된 약속 유지');
  assert.strictEqual(p.history.length, 1);
  assert.ok(S.applyBackup(p));
  assert.strictEqual(S.list().length, before);
  assert.strictEqual(JSON.parse(mem['dutchpay-history-v1'])[0].name, '11월 모임');
  assert.strictEqual(S.get(old3.id).skipSettle, true, '정산 없음 표시 유지');

  // 이상한/위험한 백업은 거절하거나 정리됨
  assert.strictEqual(S.parseBackup('').ok, false);
  assert.strictEqual(S.parseBackup('not json').ok, false);
  assert.strictEqual(S.parseBackup('{"app":"other","v":1}').ok, false);
  assert.strictEqual(S.parseBackup('x'.repeat(3000001)).ok, false);
  const evil = S.parseBackup(JSON.stringify({ app: 'yaksok-ihu', v: 1,
    plans: [{ id: 1, title: '<img onerror=x>', date: '2026-12-01' }, { id: 1, title: '중복 id', date: '2026-12-01' }, { title: '', date: 'bad' }, null, 7],
    current: { planId: 999, people: 'x', expenses: 'y' }, history: 'zzz' }));
  assert.ok(evil.ok);
  assert.strictEqual(evil.plans.length, 1, '깨진 항목·중복 id 제거');
  assert.strictEqual(evil.current.planId, undefined, '없는 약속 연결은 버림');
  assert.deepStrictEqual(evil.history, []);
  console.log('OK  백업·복원');
  S._reset();
  delete mem['dutchpay-v1']; delete mem['dutchpay-history-v1'];
}

// 친구 목록 / 예시 데이터
{
  S._reset();
  delete mem['dutchpay-friends-v1'];
  assert.deepStrictEqual(S.friends(), []);
  S.addFriends(['민수', '지연', '민수', ' ', '하늘']);
  assert.deepStrictEqual(S.friends(), ['민수', '지연', '하늘'], '중복·빈 이름 제거');
  S.addFriends(['지연', '태경']);
  assert.deepStrictEqual(S.friends(), ['민수', '지연', '하늘', '태경']);
  S.removeFriend('지연');
  assert.deepStrictEqual(S.friends(), ['민수', '하늘', '태경']);
  assert.strictEqual(S.addFriends(Array.from({ length: 50 }, (_, i) => '친구' + i)).length, 30, '30명까지');
  // 백업에 포함
  const text = S.buildBackup();
  delete mem['dutchpay-friends-v1'];
  const p = S.parseBackup(text);
  assert.strictEqual(p.friends.length, 30);
  assert.ok(S.applyBackup(p));
  assert.strictEqual(S.friends().length, 30);
  assert.deepStrictEqual(S.parseBackup(JSON.stringify({ app: 'yaksok-ihu', v: 1, friends: 'x' })).friends, []);
  console.log('OK  친구 목록');

  S._reset();
  assert.strictEqual(S.hasSample(), false);
  assert.ok(S.addSample());
  assert.strictEqual(S.hasSample(), true);
  assert.strictEqual(S.list().length, 2);
  const td = S.todos();
  assert.strictEqual(td.pending.length, 1, '예시 정산은 송금이 남아 있음');
  assert.strictEqual(td.upcoming.length, 1);
  const real = S.add({ title: '진짜 약속', date: '2026-12-20' });
  assert.strictEqual(S.removeSamples(), 2);
  assert.deepStrictEqual(S.list().map((x) => x.title), ['진짜 약속'], '내 약속은 남음');
  console.log('OK  예시 데이터');
}

// 주변 맛집·술집·카페 검색 링크
{
  assert.strictEqual(S.guessKind('금요일 술 약속'), 'drink');
  assert.strictEqual(S.guessKind('팀 회식'), 'drink');
  assert.strictEqual(S.guessKind('커피 한잔'), 'cafe');
  assert.strictEqual(S.guessKind('카페 스터디'), 'cafe');
  assert.strictEqual(S.guessKind('동창 모임'), 'meal');
  assert.strictEqual(S.guessKind(''), 'meal');
  const n = S.nearbyLinks('강남역 2번 출구', 'drink');
  assert.strictEqual(n.word, '술집');
  assert.strictEqual(n.naver, 'https://map.naver.com/p/search/' + encodeURIComponent('강남역 술집'), '출구 번호는 검색어에서 뺌');
  assert.strictEqual(n.kakao, 'https://map.kakao.com/link/search/' + encodeURIComponent('강남역 술집'));
  assert.strictEqual(S.nearbyLinks('', 'meal'), null);
  assert.strictEqual(S.nearbyLinks('홍대입구', 'bad'), null);
  const x = S.add({ title: '술 약속', date: '2026-12-12', place: '홍대입구', kind: 'drink' });
  assert.strictEqual(S.get(x.id).kind, 'drink');
  assert.strictEqual(S.cleanAppt({ title: 'a', date: '2026-12-12', kind: '<b>' }).kind, undefined, '이상한 값은 버림');
  assert.strictEqual(S.decodeShare(S.encodeShare(S.get(x.id))).kind, 'drink', '공유 링크에도 종류 포함');
  console.log('OK  주변 검색 링크');
}

console.log('저장소 테스트 통과');
