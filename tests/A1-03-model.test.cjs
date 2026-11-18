const {test} = require('node:test');
const assert = require('node:assert/strict');
const M = require('../physics/A1/03/A1-03-model.js');
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

test('A1-03 예제: 길이 L, 질량 m 막대의 오른쪽 끝에 질량 m 물체 → 왼쪽 끝에서 3L/4', () => {
  close(M.rodCm(1, 1, 1), 0.75, 1e-12);
  close(M.rodCm(4, 2, 2), 3, 1e-12);                                  // L = 4 → 3 = 3L/4
  close(M.cm1([{m: 1, x: 0.5}, {m: 1, x: 1}]), 0.75, 1e-12);          // (m × L/2 + m × L)/(m + m)
  // 그 점을 받치면 균형, 가운데를 받치면 무게중심 쪽(오른쪽)으로 기운다
  assert.equal(M.tipSide(M.rodCm(1, 1, 1), 0.75), 0);
  assert.equal(M.tipSide(M.rodCm(1, 1, 1), 0.5), 1);
  assert.equal(M.tipSide(M.rodCm(1, 1, 1), 0.9), -1);
});

test('A1-03 무게중심은 무거운 쪽에 가깝다 (m₁d₁ = m₂d₂), 물체가 무거울수록 끝으로 다가간다', () => {
  close(M.rodCm(1, 1, 2), 5 / 6, 1e-12);                               // 오른쪽 끝에 2m → 5L/6
  close(M.rodCm(1, 1, 0), 0.5, 1e-12);
  let prev = 0;
  for (const k of [0, 0.5, 1, 2, 3, 10]) { const x = M.rodCm(1, 1, k); assert.ok(x > prev - 1e-12 && x < 1); prev = x; }
  const x = M.rodCm(1, 1, 3);                                          // 막대 중심 쪽 m × (x − 0.5) = 물체 쪽 3m × (1 − x)
  close(1 * (x - 0.5), 3 * (1 - x), 1e-12);
});

test('A1-03 매단 판: 어느 점에 매달아도 매단 점 → 무게중심이 연직 아래, 두 연장선의 교점 = 무게중심', () => {
  const plate = [[-0.55, 0.15], [0.05, 0.55], [0.6, 0.3], [0.45, -0.45], [-0.35, -0.5]];
  const Gc = M.polyCentroid(plate);
  const holes = [[-0.45, 0.13], [0.5, 0.26], [0.36, -0.38]];
  const lines = holes.map((P) => {
    const a = M.hangAngle(P, Gc), d = M.rotate([Gc[0] - P[0], Gc[1] - P[1]], a);
    close(d[0], 0, 1e-12); assert.ok(d[1] < 0);                          // 돌린 뒤 P → G 가 연직 아래
    return {P, d: [Gc[0] - P[0], Gc[1] - P[1]]};                           // 판 위에 그은 연장선 (판 좌표)
  });
  const X = M.intersect(lines[0].P, lines[0].d, lines[1].P, lines[1].d);
  close(X[0], Gc[0], 1e-9); close(X[1], Gc[1], 1e-9);
  const sq = M.polyCentroid([[0, 0], [2, 0], [2, 2], [0, 2]]);         // 정사각형은 가운데
  close(sq[0], 1, 1e-12); close(sq[1], 1, 1e-12);
});

test('A1-03 개념 체크: 밑면 0.4 m, 높이 1.2 m → tan θc = 0.2/0.6 = 1/3 (1/6, 2/3 은 틀린 값)', () => {
  const th = M.tipAngle(0.4, 0.6);
  close(Math.tan(th * M.RAD), 1 / 3, 1e-12);
  assert.equal(M.verdict(0.4, 0.6, th - 0.5), 'restore');
  assert.equal(M.verdict(0.4, 0.6, th + 0.5), 'tip');
  close(M.lever(0.4, 0.6, th), 0, 1e-12);                               // 경계: 무게중심이 모서리 바로 위
});

test('A1-03 연직선이 받침면 안이면 복원, 밖이면 넘어짐 — 무게중심은 θc 에서 가장 높다', () => {
  const b = 0.6, hc = 0.5, th = M.tipAngle(b, hc);
  assert.ok(M.tipAccel(b, hc, 10) < 0);                                 // 되돌아가는 쪽
  assert.ok(M.tipAccel(b, hc, th + 5) > 0);                             // 넘어가는 쪽
  for (const t of [0, 10, 20]) assert.ok(M.cmHeight(b, hc, t + 1) > M.cmHeight(b, hc, t) || t + 1 > th);
  assert.ok(M.cmHeight(b, hc, th) > M.cmHeight(b, hc, th - 3) && M.cmHeight(b, hc, th) > M.cmHeight(b, hc, th + 3));
  close(M.cmHeight(b, hc, th), Math.hypot(b / 2, hc), 1e-12);
});

test('A1-03 낮고 넓을수록 넘어지는 각이 크다, 질량과는 무관', () => {
  assert.ok(M.tipAngle(1.0, 0.25) > M.tipAngle(0.4, 0.6));              // 넓고 낮은 상자 > 좁고 높은 상자
  for (const b of [0.2, 0.4, 0.8]) assert.ok(M.tipAngle(b + 0.1, 0.5) > M.tipAngle(b, 0.5));
  for (const h of [0.2, 0.4, 0.8]) assert.ok(M.tipAngle(0.5, h + 0.1) < M.tipAngle(0.5, h));
  // 판정과 각가속도 식에 질량이 없다: 돌림힘 m g × lever, 관성 m(b² + h²)/3 → 약분
  close(M.tipAccel(0.4, 0.6, 30), -3 * 10 * M.lever(0.4, 0.6, 30) / (0.16 + 1.44), 1e-12);
});

test('A1-03 벽에 기댄 막대(벽 마찰 없음): N₂ = mg, f = N₁ = mg/(2 tan α)', () => {
  const r = M.ladder(2, 60);
  close(r.N2, 20, 1e-12);
  close(r.N1, 20 / (2 * Math.tan(60 * M.RAD)), 1e-12);
  close(r.f, r.N1, 1e-12);
  close(r.N1 * 1 * M.sinD(60), 20 * 0.5 * M.cosD(60), 1e-12);         // 바닥 접촉점 축 돌림힘 평형 (L = 1)
});
