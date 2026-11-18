const {test} = require('node:test');
const assert = require('node:assert/strict');
const M = require('../physics/A1/10/A1-10-model.js');
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);
const PI = Math.PI;

test('A1-10 예제: r = 2 m, T = 2 s → ω = π rad/s, v = 2π m/s ≈ 6.3 m/s, a = 2π² m/s² ≈ 19.7 m/s²', () => {
  close(M.omega(2), PI);
  close(M.speed(2, 2), 2 * PI);
  close(M.accel(2, 2), 2 * PI * PI);
  assert.equal(M.speed(2, 2).toFixed(1), '6.3');
  assert.equal(M.accel(2, 2).toFixed(1), '19.7');
  close(M.accelV(M.speed(2, 2), 2), M.accel(2, 2));          // v²/r = rω² 로 확인
  close(4 * PI * PI * 2 / (2 * 2), M.accel(2, 2));          // 4π²r/T²
  close(M.freq(2), 0.5);
  close(M.periodRV(2, 2 * PI), 2);
});

test('A1-10 개념 체크: r = 0.5 m, T = π s → ω = 2 rad/s, v = 1 m/s, a = 2 m/s²', () => {
  close(M.omega(PI), 2);
  close(M.speed(0.5, PI), 1);
  close(M.accel(0.5, PI), 2);
});

test('A1-10 Δv 는 두 순간 가운데 자리에서 원의 중심을 향하고, |Δv| = 2v sin(Δθ/2) → vΔθ', () => {
  const v = 2 * PI;
  for (const phi of [0, 0.7, 2, -2.5]) {
    for (const dthDeg of [60, 30, 10, 1]) {
      const dth = dthDeg * M.RAD, d = M.deltaV(v, phi, dth);
      const toCenter = phi + dth / 2 + PI;                     // 가운데 위치에서 중심을 보는 방향
      close(Math.cos(d.dir - toCenter), 1, 1e-12);
      close(d.mag, M.chord(v, dth), 1e-12);
      close(Math.hypot(...d.v1), v, 1e-12); close(Math.hypot(...d.v2), v, 1e-12);   // 속력은 그대로
    }
  }
  // Δθ 가 작을수록 |Δv| ≈ vΔθ, 평균 가속도 |Δv|/Δt → a = vω = v²/r
  const r = 2, T = 2, a = M.accel(r, T);
  const errs = [60, 30, 10, 1].map((g) => Math.abs(M.avgAccel(r, T, g * M.RAD) - a) / a);
  for (let i = 1; i < errs.length; i++) assert.ok(errs[i] < errs[i - 1]);
  assert.ok(errs[3] < 1e-4);
  close(M.chord(v, 1e-6) / (v * 1e-6), 1, 1e-9);
  close(M.speed(r, T) * M.omega(T), a);                        // a = vω
});

test('A1-10 속도는 접선(위치에 수직), 가속도는 중심(위치와 반대)이고 속도에 수직', () => {
  for (const t of [0, 0.3, 1.1, 1.75]) {
    const s = M.state(2, 2, t, 0.4);
    close(s.x * s.vx + s.y * s.vy, 0, 1e-9);                   // r ⟂ v
    close(s.vx * s.ax + s.vy * s.ay, 0, 1e-9);                 // a ⟂ v → 속력 일정
    const k = Math.hypot(s.ax, s.ay) / Math.hypot(s.x, s.y);
    close(s.ax, -k * s.x, 1e-9); close(s.ay, -k * s.y, 1e-9);  // a = −ω² r (중심 쪽)
    close(k, M.omega(2) ** 2, 1e-12);
  }
});

test('A1-10 같은 축은 ω 가 같아 v ∝ r, a ∝ r. 벨트는 가장자리 v 가 같아 ω ∝ 1/r', () => {
  const s = M.sameAxis(2, 4, 2);
  close(s.wA, s.wB); close(s.vB / s.vA, 2); close(s.aB / s.aA, 2);
  const b = M.belt(2, 4, 2);
  close(b.vA, b.vB); close(b.wA / b.wB, 2); close(b.TB, 4); close(b.aA / b.aB, 2);
  // 개념 체크: 반지름 10 cm, 30 cm. 작은 바퀴가 1초에 3바퀴 → 큰 바퀴 주기 1 s (1/3 s 는 같은 축으로 본 오답)
  const q = M.belt(0.1, 0.3, 1 / 3);
  close(q.TB, 1, 1e-12);
  close(q.wB, 2 * PI, 1e-12);
});

test('A1-10 성분은 사인 곡선: x 가 최대일 때 vₓ = 0, aₓ 크기는 최대. 성분의 주기 = 운동 주기', () => {
  const r = 2, T = 2;
  const c0 = M.comps(r, T, 0);
  close(c0.x, r); close(c0.vx, 0); close(c0.ax, -M.accel(r, T));
  const c1 = M.comps(r, T, T / 4);
  close(c1.x, 0, 1e-12); close(Math.abs(c1.vx), M.speed(r, T), 1e-12);
  const cT = M.comps(r, T, T);
  close(cT.x, c0.x, 1e-12); close(cT.vx, c0.vx, 1e-9);
});

test('A1-10 궤도를 벗어나면 접선 방향: 반지름이 연직과 θ 이면 속도는 수평과 θ', () => {
  for (const deg of [10, 30, 45, 60]) close(M.releaseAngle(deg * M.RAD), deg * M.RAD, 1e-12);
  close(Math.cos(M.tangentDir(1.2) - 1.2), 0, 1e-12);
});
