const {test} = require('node:test');
const assert = require('node:assert/strict');
const M = require('../physics/III1/10/III1-10-model.js');
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

// 개념서 예제: 폭이 같은 +3 cm, +1 cm 펄스가 1 cm/s 로 마주 진행, 처음 중심 사이 10 cm (페이지와 같게 줄 0~20 cm, 가운데 10 cm 에서 만남)
const A = {h: 3, x0: 5, v: 1, dir: 1, w: 4};
const B = {h: 1, x0: 15, v: 1, dir: -1, w: 4};

test('III1-10 예제: 5 s 에 완전히 겹치고 최대 변위 4 cm, 지나간 뒤 3 cm·1 cm', () => {
  const tm = M.meetTime(10, 1, 1);
  close(tm, 5);
  assert.equal(M.relation(tm, A, B), 'full');
  const e = M.extremes(tm, [A, B], 0, 20);
  close(e.max, 4, 1e-6);
  close(e.xMax, 10, 0.02);
  // 지나간 뒤 (t = 10 s): A 는 15 cm, B 는 5 cm 에 원래 높이 그대로
  const after = 10;
  assert.equal(M.relation(after, A, B), 'apart');
  close(M.extremes(after, [A, B], 10, 20).max, 3, 1e-6);
  close(M.extremes(after, [A, B], 0, 10).max, 1, 1e-6);
});

test('III1-10 독립성: 겹쳤다 지나간 뒤의 합성파는 각 펄스를 v·t 만큼 옮긴 모양과 같다', () => {
  for (const t of [9, 10]) {
    for (let x = 0; x <= 20; x += 0.25) {
      const moved = 3 * M.shape(x - (5 + t), 4) + 1 * M.shape(x - (15 - t), 4);
      close(M.sumY(x, t, [A, B]), moved, 1e-12);
    }
  }
  // 처음 모양과 비교: A 의 모양은 10 cm 옮겨졌을 뿐 같다
  for (let u = -3; u <= 3; u += 0.5) close(M.pulseY(15 + u, 10, A), M.pulseY(5 + u, 0, A), 1e-12);
});

test('III1-10 개념 체크: +2 cm 와 −3 cm 가 완전히 겹치면 −1 cm, 지나간 뒤 B 는 −3 cm 그대로', () => {
  const a = {...A, h: 2}, b = {...B, h: -3};
  const e = M.extremes(5, [a, b], 0, 20);
  close(e.big.y, -1, 1e-6);
  close(M.extremes(10, [a, b], 0, 10).min, -3, 1e-6);
  close(M.extremes(10, [a, b], 10, 20).max, 2, 1e-6);
});

test('III1-10 시간표: 만나는 곳에서 2 cm 왼쪽(x = 8 cm)에는 A 가 1~5 s, B 가 5~9 s 에 머물러 겹치지 않는다', () => {
  const ia = M.visit(8, A), ib = M.visit(8, B);
  close(ia[0], 1); close(ia[1], 5); close(ib[0], 5); close(ib[1], 9);
  assert.equal(M.common(ia, ib), null);
  // 가운데(10 cm)에서는 둘 다 3~7 s 에 머물러 그동안만 더해진다
  const c = M.common(M.visit(10, A), M.visit(10, B));
  close(c[0], 3); close(c[1], 7);
});

test('III1-10 정상파: 이웃한 마디 사이 λ/2, 마디는 늘 0, 배는 ±2A 사이를 진동하며 0 도 지난다', () => {
  const s = {A: 1, lambda: 8, xc: 12};
  const ns = M.nodes(s, 0, 24);
  assert.deepEqual(ns.map((x) => +x.toFixed(9)), [0, 4, 8, 12, 16, 20, 24]);
  for (let i = 1; i < ns.length; i++) close(ns[i] - ns[i - 1], s.lambda / 2);
  for (const x of ns) for (let tau = 0; tau < 1; tau += 0.05) close(M.standing(x, tau, s), 0, 1e-12);
  const an = M.antinodes(s, 0, 24);
  close(an[0], 2); close(an[1] - an[0], 4);
  close(M.ampAt(an[2], s), 2 * s.A);
  assert.equal(M.kind(an[2], s), 'antinode'); assert.equal(M.kind(ns[3], s), 'node');
  close(Math.abs(M.standing(an[2], 0, s)), 2, 1e-12);   // 변위의 크기가 2A 인 순간 (x = 10 cm 는 −2A, 14 cm 는 +2A)
  close(M.standing(an[2], 0, s), -M.standing(an[3], 0, s), 1e-12);   // 이웃한 배는 늘 반대쪽
  close(M.standing(an[2], 0.25, s), 0, 1e-12);       // 같은 배가 ¼ 주기 뒤에는 변위 0
  // ¼ 주기에는 두 파동이 모든 곳에서 반대 변위 → 줄 전체가 평평
  for (let x = 0; x <= 24; x += 0.5) close(M.waveR(x, 0.25, s) + M.waveL(x, 0.25, s), 0, 1e-12);
  // 배와 이웃한 마디 사이 = λ/4
  close(an[0] - ns[0], s.lambda / 4);
});
