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
console.log('모든 테스트 통과');
