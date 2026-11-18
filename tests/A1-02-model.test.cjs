const {test} = require('node:test');
const assert = require('node:assert/strict');
const M = require('../physics/A1/02/A1-02-model.js');
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

test('A1-02 예제: W = 20 N (A 에서 2 m), w = 10 N (3.6 m), B 는 4 m → N_A = 11 N, N_B = 19 N', () => {
  const r = M.plank(20, 2, 10, 3.6, 0, 4);
  close(r.NB, 19, 1e-9);
  close(r.NA, 11, 1e-9);
  close(r.NA + r.NB, 30, 1e-9);                                  // 연직 힘 평형
  // A 축: 시계 반대 N_B × 4 = 시계 20 × 2 + 10 × 3.6 = 76
  const F = M.plankForces(20, 2, 10, 3.6, 0, 4, r.NA, r.NB), L = M.ledger(F, 0);
  close(L.sumCCW, 76, 1e-9); close(L.sumCW, 76, 1e-9);
  // 검산 B 축: N_A × 4 = 20 × 2 + 10 × 0.4 = 44
  const LB = M.ledger(F, 4);
  close(LB.sumCCW, 44, 1e-9); close(LB.sumCW, 44, 1e-9);
  assert.equal(L.ccw.length, 1); assert.equal(L.ccw[0].name, 'NB');   // A 축이면 N_A 는 팔 길이 0 → 식에서 사라진다
});

test('A1-02 힘 평형이 성립하면 어느 점을 축으로 잡아도 돌림힘 합이 0 (시계 = 시계 반대)', () => {
  const r = M.plank(20, 2, 10, 3.6, 0, 4), F = M.plankForces(20, 2, 10, 3.6, 0, 4, r.NA, r.NB);
  close(M.netForce(F), 0, 1e-9);
  for (const x0 of [-3, 0, 1, 2, 3.6, 4, 7.5]) {
    close(M.netTorque(F, x0), 0, 1e-9);
    const L = M.ledger(F, x0); close(L.sumCW, L.sumCCW, 1e-9);
  }
  // 힘 평형이 깨지면 축에 따라 돌림힘 합이 달라진다 (Σ(x − x0)F = Σ x F − x0 ΣF)
  const bad = [{F: 15, x: 0}, {F: 15, x: 4}, {F: -20, x: 2}, {F: -10, x: 3.6}];
  assert.ok(Math.abs(M.netTorque(bad, 0) - M.netTorque(bad, 4)) < 1e-9);   // ΣF = 0 이면 같고
  const bad2 = [{F: 10, x: 0}, {F: 10, x: 4}, {F: -20, x: 2}, {F: -10, x: 3.6}];
  assert.ok(Math.abs(M.netTorque(bad2, 0) - M.netTorque(bad2, 4)) > 1);    // ΣF ≠ 0 이면 다르다
});

test('A1-02 돌림힘의 세 관점은 같은 값: rF sinθ = F × (팔 길이) = r × (수직 성분), 나란한 성분은 0', () => {
  for (const [r, F, th] of [[0.5, 40, 30], [0.9, 20, 90], [1, 12, 135], [0.3, 25, 60]]) {
    close(M.torque(r, F, th), F * M.arm(r, th), 1e-9);
    close(M.torque(r, F, th), r * M.perp(F, th), 1e-9);
    close(M.perp(F, th) ** 2 + M.para(F, th) ** 2, F * F, 1e-9);
  }
  close(M.torque(0.9, 20, 0), 0, 1e-12);                             // 문면에 나란히 밀면 안 돈다
  close(M.torque(0.9, 20, 180), 0, 1e-9);
  // 같은 힘이면 축에서 멀수록, 수직에 가까울수록 크다
  assert.ok(M.torque(0.9, 20, 90) > M.torque(0.2, 20, 90));
  assert.ok(M.torque(0.9, 20, 90) > M.torque(0.9, 20, 30));
});

test('A1-02 개념 체크: r = 0.5 m, F = 40 N, 30° → τ = 10 N·m (cos 을 쓰면 10√3)', () => {
  close(M.torque(0.5, 40, 30), 10, 1e-9);
  close(0.5 * 40 * M.cosD(30), 10 * Math.sqrt(3), 1e-9);
});

test('A1-02 개념 체크: 길이 3 m, 60 N 막대를 양 끝 실로, 30 N 을 A 에서 1 m → T_B = 40 N, T_A = 50 N', () => {
  const r = M.supports([{w: 60, x: 1.5}, {w: 30, x: 1}], 0, 3);
  close(r.NB, 40, 1e-9); close(r.NA, 50, 1e-9);
});

test('A1-02 물체를 B 쪽으로 옮길수록 N_B 가 커지고, B 밖으로 너무 멀리·무겁게 두면 N_A < 0 (넘어짐)', () => {
  let prev = -Infinity;
  for (let x = -1; x <= 5; x += 0.5) { const r = M.plank(20, 2, 10, x); assert.ok(r.NB > prev); prev = r.NB; }
  close(M.maxLoadOutside(20, 2, 5, 4), 40, 1e-9);                    // B 밖 1 m 끝: 40 N 까지
  close(M.plank(20, 2, 40, 5).NA, 0, 1e-9);
  const tip = M.plank(20, 2, 60, 5);
  close(tip.NA, -5, 1e-9); assert.equal(tip.ok, false);
  assert.equal(M.plank(20, 2, 30, 5).ok, true);
});

test('A1-02 축바퀴: 반지름 r, 3r → T₁ = 3T₂, 실은 3배 당기고 일은 같다', () => {
  close(M.wheelForce(30, 1, 3), 10, 1e-12);
  close(M.wheelPull(0.2, 1, 3), 0.6, 1e-12);
  close(30 * 0.2, M.wheelForce(30, 1, 3) * M.wheelPull(0.2, 1, 3), 1e-12);
  close(M.swing(18, 2, 1) / M.swing(4.5, 2, 1), 4, 1e-12);          // 같은 시간 동안 열린 각 ∝ 돌림힘
});
