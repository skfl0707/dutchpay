// 실행: node test-settle.js
const assert = require('assert');
const { settle } = require('./settle.js');

function check(name, people, expenses, expectedTransfers) {
  const r = settle(people, expenses);
  const sum = Object.values(r.balances).reduce((a, b) => a + b, 0);
  assert.strictEqual(sum, 0, name + ': 잔액 합계가 0이어야 함');
  const moved = r.transfers.reduce((a, t) => a + t.amount, 0);
  const owed = Object.values(r.balances).filter((v) => v > 0).reduce((a, b) => a + b, 0);
  assert.strictEqual(moved, owed, name + ': 송금 총액 불일치');
  if (expectedTransfers !== undefined) assert.strictEqual(r.transfers.length, expectedTransfers, name + ': 송금 횟수');
  console.log('OK ', name, JSON.stringify(r.transfers));
}

const P = ['민수', '지연', '하늘'];
check('한 명이 전액 결제', P, [{ payer: '민수', amount: 30000, shares: [] }], 2);
check('1원 나머지 (10000/3)', P, [{ payer: '민수', amount: 10000, shares: [] }], 2);
// 캡처에서 발견된 버그: 결제자가 바뀌어도 1원짜리 송금이 생기면 안 됨
{
  const exps = [
    { payer: '이태경', amount: 100000, shares: [] },
    { payer: '강정수', amount: 200000, shares: [] },
  ];
  const r = settle(['이태경', '강정수', '이윤혁'], exps);
  assert.deepStrictEqual(r.transfers, [{ from: '이윤혁', to: '강정수', amount: 100000 }]); // 총 30만원/3명 = 정확히 10만원씩
  const r2 = settle(['이윤혁', '강정수', '이태경'], exps); // 순서가 바뀌어도 같은 결과
  assert.deepStrictEqual(r2.transfers, r.transfers);
  console.log('OK  결제자 바뀜 / 순서 무관', JSON.stringify(r.transfers));
}
check('서로 상쇄', P, [
  { payer: '민수', amount: 30000, shares: [] },
  { payer: '지연', amount: 30000, shares: [] },
  { payer: '하늘', amount: 30000, shares: [] },
], 0);
check('일부만 참여', P, [{ payer: '민수', amount: 20000, shares: ['민수', '지연'] }], 1);
check('4명 체인 정리', ['A', 'B', 'C', 'D'], [
  { payer: 'A', amount: 40000, shares: [] },
  { payer: 'B', amount: 20000, shares: [] },
], undefined);
check('잘못된 입력 무시', P, [{ payer: '없는사람', amount: 5000, shares: [] }, { payer: '민수', amount: -10, shares: [] }], 0);
// 무작위 검증: 어떤 입력이든 잔액 합계 0, 각자 정확한 몫과 1원 이내 차이, 송금 횟수는 (인원-1) 이하
{
  const names = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
  let seed = 12345;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  for (let t = 0; t < 3000; t++) {
    const n = 2 + rnd(6);
    const ppl = names.slice(0, n);
    const exps = [];
    for (let k = 0, m = 1 + rnd(6); k < m; k++) {
      const shares = ppl.filter(() => rnd(3) > 0);
      exps.push({ payer: ppl[rnd(n)], amount: 1 + rnd(500000), shares });
    }
    const r = settle(ppl, exps);
    assert.strictEqual(Object.values(r.balances).reduce((a, b) => a + b, 0), 0, '합계 0');
    assert.ok(r.transfers.length <= n - 1, '송금 횟수');
    // 정확한 몫과 1원 이내
    const exact = {}; ppl.forEach((p) => (exact[p] = 0));
    exps.forEach((e) => {
      const sh = e.shares.length ? e.shares : ppl;
      exact[e.payer] += e.amount; sh.forEach((p) => (exact[p] -= e.amount / sh.length));
    });
    ppl.forEach((p) => assert.ok(Math.abs(r.balances[p] - exact[p]) < 1, '1원 이내'));
  }
  console.log('OK  무작위 3000건 검증');
}
// 공유 문구
{
  const { formatResult } = require('./settle.js');
  const ppl = ['이태경', '강정수', '이윤혁'];
  const exps = [
    { id: 1, title: '저녁 식사', payer: '이태경', amount: 100000, shares: [] },
    { id: 2, title: '카페', payer: '강정수', amount: 200000, shares: [] },
  ];
  const text = formatResult(ppl, exps, settle(ppl, exps));
  assert.ok(text.includes('총 300,000원 / 참가자 3명'));
  assert.ok(text.includes('이윤혁 → 강정수  100,000원'));
  assert.ok(text.includes('- 카페 200,000원 (강정수 결제)'));
  assert.ok(formatResult(ppl, [], settle(ppl, [])).includes('주고받을 돈이 없어요'));
  console.log('OK  공유 문구\n' + text);
}
// 송금 완료 체크 / 요청 문구
{
  const { transferKey, pendingTransfers, prunePaid, requestText, formatResult } = require('./settle.js');
  const ppl = ['이태경', '강정수', '이윤혁'];
  const exps = [
    { id: 1, title: '저녁 식사', payer: '이태경', amount: 100000, shares: [] },
    { id: 2, title: '카페', payer: '강정수', amount: 200000, shares: [] },
  ];
  const r = settle(ppl, exps);
  const t = r.transfers[0];
  assert.strictEqual(transferKey(t), '이윤혁>강정수:100000');
  assert.strictEqual(pendingTransfers(r.transfers, {}).length, 1);
  assert.strictEqual(pendingTransfers(r.transfers, undefined).length, 1);
  const paid = { [transferKey(t)]: true };
  assert.strictEqual(pendingTransfers(r.transfers, paid).length, 0);
  assert.deepStrictEqual(prunePaid(r.transfers, paid), paid);
  // 금액이 바뀌면 옛 체크는 사라지고 새 송금은 미완료
  const r2 = settle(ppl, [...exps, { id: 3, title: '간식', payer: '이태경', amount: 30000, shares: [] }]);
  assert.deepStrictEqual(prunePaid(r2.transfers, paid), {});
  assert.strictEqual(pendingTransfers(r2.transfers, prunePaid(r2.transfers, paid)).length, r2.transfers.length);
  assert.deepStrictEqual(prunePaid(r.transfers, { [transferKey(t)]: 'yes', x: true }), {}, 'true 만 인정');
  assert.strictEqual(requestText(t, '동창 모임'), '이윤혁님, 동창 모임 정산 안내예요.\n강정수님께 100,000원 보내 주세요. 감사합니다.');
  assert.ok(requestText(t).includes('모임 정산 안내'));
  assert.ok(formatResult(ppl, exps, r, paid).includes('100,000원 (송금 완료)'));
  assert.ok(!formatResult(ppl, exps, r).includes('송금 완료'));
  console.log('OK  송금 체크 / 요청 문구');
}
console.log('모든 테스트 통과');
