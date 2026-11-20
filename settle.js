// 정산 계산 로직 (화면과 분리). 금액은 모두 정수(원)로 다룹니다.
(function (root) {
  /**
   * @param {string[]} people  참가자 이름
   * @param {{payer:string, amount:number, shares:string[]}[]} expenses
   *        shares: 이 지출을 나눠 내는 사람들 (비어 있으면 전원)
   * @returns {{balances:Object, transfers:{from:string,to:string,amount:number}[], total:number}}
   */
  function settle(people, expenses) {
    const balance = {};
    people.forEach((p) => (balance[p] = 0));
    let total = 0;

    expenses.forEach((e) => {
      const amount = Math.round(e.amount);
      if (!(amount > 0) || !(e.payer in balance)) return;
      const shares = (e.shares && e.shares.length ? e.shares : people).filter((p) => p in balance);
      if (!shares.length) return;
      total += amount;
      balance[e.payer] += amount;
      const base = Math.floor(amount / shares.length);
      let rest = amount - base * shares.length; // 1원 단위 나머지는 앞사람부터 1원씩 더 부담
      shares.forEach((p) => {
        balance[p] -= base + (rest > 0 ? 1 : 0);
        if (rest > 0) rest--;
      });
    });

    // 받을 사람(+)과 보낼 사람(-)을 큰 금액끼리 짝지어 송금 횟수를 줄임
    const cred = [];
    const debt = [];
    Object.keys(balance).forEach((p) => {
      if (balance[p] > 0) cred.push({ p, v: balance[p] });
      else if (balance[p] < 0) debt.push({ p, v: -balance[p] });
    });
    cred.sort((a, b) => b.v - a.v);
    debt.sort((a, b) => b.v - a.v);

    const transfers = [];
    let i = 0, j = 0;
    while (i < cred.length && j < debt.length) {
      const m = Math.min(cred[i].v, debt[j].v);
      transfers.push({ from: debt[j].p, to: cred[i].p, amount: m });
      cred[i].v -= m;
      debt[j].v -= m;
      if (cred[i].v === 0) i++;
      if (debt[j].v === 0) j++;
    }
    return { balances: balance, transfers, total };
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = { settle };
  else root.settle = settle;
})(typeof self !== 'undefined' ? self : this);
