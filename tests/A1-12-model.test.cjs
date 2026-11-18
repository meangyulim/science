const {test} = require('node:test');
const assert = require('node:assert/strict');
const M = require('../physics/A1/12/A1-12-model.js');
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

test('A1-12 예제: 근일점 1 AU, 원일점 3 AU → a = 2 AU, T = 2√2 ≈ 2.8년, 근일점 속력 = 원일점의 3배', () => {
  close(M.semiMajor(1, 3), 2);
  close(M.period(2), 2 * Math.SQRT2, 1e-12);
  assert.equal(M.period(2).toFixed(1), '2.8');
  close(M.speedRatio(1, 3), 3);
  close(M.speedAt(1, 2) / M.speedAt(3, 2), 3, 1e-12);          // 실제 궤도 속력으로 확인
  assert.deepEqual(M.radical(8), {k: 2, m: 2});
});

test('A1-12 1법칙: 타원 위 모든 점에서 두 초점까지 거리의 합 = 2a, 근일점·원일점 거리 = r₁, r₂', () => {
  for (const [r1, r2] of [[1, 3], [0.5, 4], [2, 2]]) {
    const a = M.semiMajor(r1, r2), T = M.period(a);
    for (let i = 0; i < 24; i++) { const p = M.posAt(T * i / 24, r1, r2); close(M.focusSum(p.x, p.y, r1, r2), 2 * a, 1e-9); }
    close(M.posAt(0, r1, r2).r, r1, 1e-12);
    close(M.posAt(T / 2, r1, r2).r, r2, 1e-9);
  }
});

test('A1-12 2법칙: 같은 시간 동안 쓸고 간 넓이가 같다 (넓이 비 = 시간 비), r₁v₁ = r₂v₂', () => {
  const r1 = 1, r2 = 3, T = M.period(M.semiMajor(r1, r2)), want = M.sweptArea(T / 12, r1, r2);
  for (let k = 0; k < 12; k++) {
    const s = M.sweptNumeric(T * k / 12, T * (k + 1) / 12, r1, r2);
    assert.ok(Math.abs(s - want) / want < 1e-4, `${k}: ${s} vs ${want}`);
  }
  close(M.sweptArea(T, r1, r2), Math.PI * 2 * Math.sqrt(3), 1e-12);   // 한 바퀴 = 타원 넓이 πab
  const a = M.semiMajor(r1, r2);
  close(r1 * M.speedAt(r1, a), r2 * M.speedAt(r2, a), 1e-9);
});

test('A1-12 원일점 → 근일점 구간에서 속력이 커진다. 가속도는 근일점에서 (r₂/r₁)²배 크다', () => {
  const r1 = 1, r2 = 3, a = 2, T = M.period(a);
  let prev = 0;
  for (let i = 0; i <= 40; i++) {                                  // T/2(원일점) → T(근일점)
    const p = M.posAt(T / 2 + (T / 2) * i / 40 - 1e-9 * (i === 40), r1, r2), v = M.speedAt(p.r, a);
    assert.ok(v >= prev - 1e-9); prev = v;
  }
  close(M.accelRatio(1, 3), 9);
});

test('A1-12 3법칙: T² ∝ a³. 긴반지름 4배 → 주기 8배, 행성 자료의 log T–log a 기울기 = 3/2', () => {
  close(M.periodRatio(4), 8, 1e-12);
  close(M.period(4) / M.period(1), 8, 1e-12);
  assert.ok(Math.abs(M.logSlope() - 1.5) < 0.005);
  for (const [, a, T] of M.PLANETS) assert.ok(Math.abs(T * T / (a * a * a) - 1) < 0.01);
  // 주기는 긴반지름만으로 정해진다: 납작한 정도가 달라도 a 가 같으면 같은 주기
  close(M.period(M.semiMajor(1, 3)), M.period(M.semiMajor(2, 2)), 1e-12);
});

test('A1-12 도전: 원 궤도 3r 위성 A 와 근지점 r·원지점 5r 위성 B → 주기 같음, B 속력 비 5, 근지점 가속도는 A 의 9배', () => {
  close(M.semiMajor(1, 5), 3);
  close(M.period(M.semiMajor(1, 5)), M.period(3), 1e-12);
  close(M.speedRatio(1, 5), 5);
  close((3 / 1) ** 2, 9);
  close(M.radical(27).k, 3); close(M.radical(27).m, 3);
  assert.deepEqual(M.radical(64), {k: 8, m: 1});
});
