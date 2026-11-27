// 정산 계산 로직 (화면과 분리). 금액은 정수(원)로 입력받습니다.
// 지출마다 반올림하면 오차가 쌓이므로, 정확한 분수(BigInt)로 전부 합산한 뒤
// 마지막에 한 번만 원 단위로 맞춥니다.
(function (root) {
  function gcd(a, b) { return b === 0n ? a : gcd(b, a % b); }
  function lcm(a, b) { return (a / gcd(a, b)) * b; }

  /**
   * @param {string[]} people  참가자 이름
   * @param {{payer:string, amount:number, shares:string[]}[]} expenses
   *        shares: 이 지출을 나눠 내는 사람들 (비어 있으면 전원)
   * @returns {{balances:Object, transfers:{from:string,to:string,amount:number}[], total:number}}
   */
  function settle(people, expenses) {
    const valid = [];
    let total = 0;
    expenses.forEach((e) => {
      const amount = Math.round(e.amount);
      if (!(amount > 0) || !people.includes(e.payer)) return;
      const shares = (e.shares && e.shares.length ? e.shares : people).filter((p) => people.includes(p));
      if (!shares.length) return;
      total += amount;
      valid.push({ payer: e.payer, amount: BigInt(amount), shares });
    });

    // 모든 나누는 인원 수의 최소공배수 L: amount*L/n 이 항상 정수가 됨
    let L = 1n;
    valid.forEach((e) => { L = lcm(L, BigInt(e.shares.length)); });

    const scaled = {};
    people.forEach((p) => (scaled[p] = 0n));
    valid.forEach((e) => {
      scaled[e.payer] += e.amount * L;
      const each = (e.amount * L) / BigInt(e.shares.length);
      e.shares.forEach((p) => { scaled[p] -= each; });
    });

    // 원 단위로 내림 후, 남은 오차(합계를 0으로 맞추는 데 필요한 원)는 소수 부분이 큰 사람 순으로 1원씩 배분
    const rows = people.map((p, idx) => {
      let q = scaled[p] / L;
      if (scaled[p] % L < 0n) q -= 1n;
      return { p, idx, q, rem: scaled[p] - q * L };
    });
    let deficit = -rows.reduce((s, r) => s + r.q, 0n);
    rows.slice().sort((a, b) => (a.rem === b.rem ? a.idx - b.idx : a.rem > b.rem ? -1 : 1))
      .forEach((r) => { if (deficit > 0n) { r.q += 1n; deficit -= 1n; } });

    const balance = {};
    rows.forEach((r) => { balance[r.p] = Number(r.q); });

    // 받을 사람(+)과 보낼 사람(-)을 큰 금액끼리 짝지어 송금 횟수를 줄임
    const cred = [];
    const debt = [];
    people.forEach((p) => {
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

  const won = (n) => n.toLocaleString('ko-KR') + '원';

  // 송금 한 건을 구분하는 이름표 (보냈어요 체크를 기억하는 데 사용)
  function transferKey(t) { return t.from + '>' + t.to + ':' + t.amount; }

  // 아직 안 보낸 송금만 골라냄
  function pendingTransfers(transfers, paid) {
    const p = paid || {};
    return transfers.filter((t) => !p[transferKey(t)]);
  }

  // 지금 송금 목록에 없는 옛 체크 표시는 버림 (금액이 바뀌면 새 송금으로 취급)
  function prunePaid(transfers, paid) {
    const out = {};
    const p = paid || {};
    transfers.forEach((t) => { const k = transferKey(t); if (p[k] === true) out[k] = true; });
    return out;
  }

  // 보내는 사람에게 보낼 송금 요청 문구
  function requestText(t, title) {
    return t.from + '님, ' + (title || '모임') + ' 정산 안내예요.\n'
      + t.to + '님께 ' + won(t.amount) + ' 보내 주세요. 감사합니다.';
  }

  // 메신저로 보낼 정산 결과 문구 (paid: 이미 보낸 송금 표시)
  function formatResult(people, expenses, result, paid) {
    const p = paid || {};
    const lines = ['[더치페이 정산 결과]', '총 ' + won(result.total) + ' / 참가자 ' + people.length + '명', ''];
    if (result.transfers.length) {
      lines.push('보낼 돈');
      result.transfers.forEach((t) =>
        lines.push(t.from + ' → ' + t.to + '  ' + won(t.amount) + (p[transferKey(t)] ? ' (송금 완료)' : '')));
    } else {
      lines.push('주고받을 돈이 없어요.');
    }
    if (expenses.length) {
      lines.push('', '지출 내역');
      expenses.forEach((e) => lines.push('- ' + e.title + ' ' + won(e.amount) + ' (' + e.payer + ' 결제)'));
    }
    return lines.join('\n');
  }

  const api = { settle, formatResult, transferKey, pendingTransfers, prunePaid, requestText };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else Object.assign(root, api);
})(typeof self !== 'undefined' ? self : this);
