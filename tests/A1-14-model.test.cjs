const {test} = require('node:test');
const assert = require('node:assert/strict');
const M = require('../physics/A1/14/A1-14-model.js');
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);
const g = M.PI2, RAD = Math.PI / 180;

test('A1-14 예제: 길이 1 m, g = π² → 주기 2 s, 길이 4 m → 4 s, 운동 에너지 최대 간격 1 s', () => {
  close(M.period(1, g), 2, 1e-12);
  close(M.period(4, g), 4, 1e-12);
  close(M.energyPeriod(1, g), 1, 1e-12);
});

test('A1-14 주기는 질량과 무관: 복원력 상수 k = mg/l 도 관성 m 도 질량에 비례해 ω² = k/m = g/l', () => {
  for (const m of [0.5, 1, 2, 5]) close(M.kEff(m, g, 1) / m, M.omega(1, g) ** 2, 1e-12);
  close(M.restoring(2, g, 0.2) / 2, M.restoring(1, g, 0.2), 1e-12);    // 복원력은 2배, 가속도는 같다
  // 진폭과도 무관: 같은 l, g 이면 진폭이 달라도 같은 시각에 같은 위상 (x/A 가 같다)
  const w = M.omega(1, g);
  for (const t of [0.3, 0.9, 1.7]) close(M.shm(t, 0.05, w).x / 0.05, M.shm(t, 0.2, w).x / 0.2, 1e-12);
});

test('A1-14 작은 각에서 복원력은 변위에 비례 (F ≈ −(mg/l)x), 큰 각에서는 어긋난다', () => {
  const m = 1, l = 1;
  for (const deg of [2, 5, 10]) {
    const th = deg * RAD, ex = M.restoring(m, g, th), lin = M.restoringLinear(m, g, l, l * th);
    assert.ok(Math.abs(ex - lin) / Math.abs(lin) < 0.01);
  }
  const th = 40 * RAD;
  assert.ok(Math.abs(M.restoring(m, g, th) - M.restoringLinear(m, g, l, l * th)) / Math.abs(M.restoringLinear(m, g, l, l * th)) > 0.05);
});

test('A1-14 양 끝: 속력 0·가속도 최대, 최저점: 속력 최대·가속도 0, 끝 → 최저점 T/4', () => {
  const l = 1, w = M.omega(l, g), A = 0.25, T = M.period(l, g);
  const e = M.shm(0, A, w), b = M.shm(T / 4, A, w), e2 = M.shm(T / 2, A, w);
  close(e.v, 0, 1e-12); close(Math.abs(e.a), w * w * A, 1e-12);
  close(b.x, 0, 1e-12); close(Math.abs(b.v), A * w, 1e-12); close(b.a, 0, 1e-12);
  close(e2.x, -A, 1e-12); close(e2.v, 0, 1e-12);
  assert.equal(M.where(0, T), 'endR'); assert.equal(M.where(T / 4, T), 'bottom'); assert.equal(M.where(T / 2, T), 'endL');
  close(M.quarter(l, g), T / 4, 1e-12);
});

test('A1-14 등속 원운동의 그림자 = 단진동: 점의 x 성분, 속도·가속도의 x 성분이 같다', () => {
  const A = 0.3, w = M.omega(2, g);
  for (const t of [0, 0.2, 0.77, 1.3, 2.9]) {
    const p = M.circlePoint(t, A, w), s = M.shm(t, A, w);
    close(p.px, s.x, 1e-12); close(p.vx, s.v, 1e-12); close(p.ax, s.a, 1e-12);
    close(Math.hypot(p.vx, p.vy), A * w, 1e-12);                       // 원운동의 속력은 일정
  }
});

test('A1-14 에너지: K + U 일정, 운동 에너지는 한 주기에 두 번 최대 → 에너지–시간 그래프의 주기 T/2', () => {
  const l = 1, w = M.omega(l, g), T = M.period(l, g);
  for (const t of [0, 0.1, 0.5, 1.2, 1.9]) { const e = M.energies(t, w); close(e.K + e.U, 1, 1e-12); }
  close(M.energies(T / 4, w).K, 1, 1e-12); close(M.energies(3 * T / 4, w).K, 1, 1e-12);
  close(M.energies(0, w).K, 0, 1e-12); close(M.energies(T / 2, w).K, 0, 1e-12);
  for (const t of [0.13, 0.4, 0.88]) close(M.energies(t, w).K, M.energies(t + T / 2, w).K, 1e-12);
});

test('A1-14 개념 체크: K 가 0.5 s 마다 최대 → T = 1 s (l = 0.25 m), g 가 1/4 인 행성에서 T = 2 s', () => {
  const T = 2 * 0.5, l = M.lengthFor(T, g);
  close(l, 0.25, 1e-12);
  close(M.period(l, g / 4), 2, 1e-12);
});

test('A1-14 개념 체크: 끝의 접선 가속도 최대 g sinθ₀, 최저점 장력 mg + mv²/l > mg, 질량 2배여도 주기 같다', () => {
  const m = 1, l = 1, th0 = 15 * RAD;
  close(M.tangentAccEnd(g, th0), g * Math.sin(th0), 1e-12);
  assert.ok(M.tensionBottom(m, g, l, th0) > m * g);
  close(M.tensionBottom(m, g, l, th0), m * g * (3 - 2 * Math.cos(th0)), 1e-9);
  assert.ok(M.tensionEnd(m, g, th0) < m * g);
  close(2 * Math.PI / Math.sqrt(M.kEff(2 * m, g, l) / (2 * m)), M.period(l, g), 1e-12);   // 질량 2배: k 도 2배 → 주기 그대로
});

test('A1-14 같은 각으로 놓으면 최대 속력 ∝ √l, T²–l 은 원점 지나는 직선(기울기 4π²/g), T/4 는 자유 낙하 시간보다 길다', () => {
  const th0 = 10 * RAD;
  close(M.vMax(g, 4, th0) / M.vMax(g, 1, th0), 2, 1e-12);
  close(M.vMax(g, 1, th0), Math.sqrt(2 * g * M.height(1, th0)), 1e-12);
  for (const l of [0.25, 1, 2.25, 4]) close(M.period(l, g) ** 2 / l, M.t2Slope(g), 1e-12);
  close(M.t2Slope(g), 4, 1e-12);
  for (const l of [0.5, 1, 3]) assert.ok(M.quarter(l, g) > M.freeFallTime(l, g));
  close(M.springPeriod(1, g), 2, 1e-12);                                // (심화) m = 1 kg, k = π² N/m 이면 2 s
});
