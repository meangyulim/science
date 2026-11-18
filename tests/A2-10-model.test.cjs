const {test} = require('node:test');
const assert = require('node:assert/strict');
const M = require('../physics/A2/10/A2-10-model.js');
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

test('A2-10 예제: 2 kg 추를 2.1 m 에서 등속으로 10번 → W = 420 J, 물 0.5 kg 의 ΔT = 0.2 K (kcal 로도 0.2 K)', () => {
  const W = M.workDrops(10, 2, 2.1);
  close(W, 420, 1e-9);
  close(M.dTof(W, 4200, 0.5), 0.2, 1e-12);
  close(M.toKcal(W), 0.1, 1e-12);                          // Q = 420 ÷ 4200 = 0.1 kcal
  close(M.dTkcal(W, M.cKcal(4200), 0.5), 0.2, 1e-12);      // 0.1 ÷ (1 × 0.5)
  close(M.cKcal(4200), 1, 1e-12);                          // 물의 비열 1 kcal/(kg·K)
});

test('A2-10 개념 체크: 50 N 으로 42 m 당기면 2100 J → 물 0.5 kg 이 1 K (무게 50 N 인 추가 2.1 m 씩 20번 떨어진 것과 같다)', () => {
  const W = M.workPull(50, 42);
  close(W, 2100);
  close(M.dTof(W, 4200, 0.5), 1);
  close(M.workDrops(20, 5, 2.1), W, 1e-9);
  close(M.dTof(W, 4200, 0.5) / 4.2, 0.238, 0.001);         // 흔한 실수: 4.2 로 한 번 더 나눔 (약 0.24 K)
  close(M.dTof(W, 4200, 0.5) * 4.2, 4.2, 1e-12);           // 흔한 실수: 4.2 를 곱함
  close(M.workPullVT(50, 2, 21), 2100);                    // W = Fvt 도 같은 일
});

test('A2-10 ΔT–W 그래프: 원점을 지나는 직선, 기울기 1/(cm). 질량이 같으면 기울기 2배인 액체의 비열은 ½ (1 : 2)', () => {
  for (const W of [0, 105, 420, 2100]) close(M.dTof(W, 4200, 0.5), W * M.slope(4200, 0.5), 1e-12);
  close(M.slope(2100, 0.5) / M.slope(4200, 0.5), 2, 1e-12);
  const cA = 1 / (2 * M.slope(4200, 0.5) * 0.5), cB = 4200;     // A 의 기울기가 B 의 2배
  close(cA / cB, 0.5, 1e-12);
  close(M.dTof(420, 4200, 1), 0.1, 1e-12);                      // 물을 2배로 → ΔT 반
});

test('A2-10 도전: 5 kg, 2.2 m, 21번, 바닥 직전 2 m/s → 한 번에 100 J, 2100 J, 물 0.5 kg 이 1 K (등속이면 1.1 K). 액체 Y 2.5 K → 비열 1680', () => {
  close(M.heatPerDrop(5, 2.2, 2), 100, 1e-9);
  const W = 21 * M.heatPerDrop(5, 2.2, 2);
  close(W, 2100, 1e-9);
  close(M.dTof(W, 4200, 0.5), 1, 1e-12);
  close(M.dTof(M.workDrops(21, 5, 2.2), 4200, 0.5), 1.1, 1e-12);
  close(W / (0.5 * 2.5), 1680, 1e-9);
});

test('A2-10 낙하 한 번 안에서: 퍼텐셜 감소 = 물로 간 일 + 추의 운동 에너지. 등속이면 전부 열, 가속이면 ½Mv² 만큼 모자란다', () => {
  for (const p of [0, 0.25, 0.5, 0.8, 1]) {
    const s = M.dropAt(2, 2.1, p, 'steady', 0);
    close(s.pe, s.q, 1e-12); close(s.k, 0);
    const a = M.dropAt(5, 2.2, p, 'accel', 2);
    close(a.pe, a.q + a.k, 1e-9);
    close(a.k, 0.5 * 5 * a.v * a.v, 1e-9);
  }
  const end = M.dropAt(5, 2.2, 1, 'accel', 2);
  close(end.q, M.heatPerDrop(5, 2.2, 2), 1e-9); close(end.pe, 110, 1e-9); close(end.k, 10, 1e-9);
  close(M.dropAt(2, 2.1, 1, 'steady').q, 42, 1e-12);
});

test('A2-10 단위: 1 cal ≈ 4.2 J, J = 4.2 × 10³ J/kcal. ΔT 는 N, M, h 에 비례하고 액체 질량에 반비례', () => {
  close(M.calToJ(1), 4.2); close(M.calToJ(1000), M.JQ);
  const base = M.dTof(M.workDrops(10, 2, 2.1), 4200, 0.5);
  close(M.dTof(M.workDrops(20, 2, 2.1), 4200, 0.5), 2 * base, 1e-12);
  close(M.dTof(M.workDrops(10, 4, 2.1), 4200, 0.5), 2 * base, 1e-12);
  close(M.dTof(M.workDrops(10, 2, 4.2), 4200, 0.5), 2 * base, 1e-12);
  close(M.dTof(M.workDrops(10, 2, 2.1), 4200, 1), base / 2, 1e-12);
});
