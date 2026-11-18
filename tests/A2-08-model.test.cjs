const {test} = require('node:test');
const assert = require('node:assert/strict');
const M = require('../physics/A2/08/A2-08-model.js');
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

test('A2-08 예제: 80 °C 금속 2 kg(420)을 20 °C 물 0.2 kg(4200)에 넣으면 열평형 온도 50 °C', () => {
  close(M.heatCap(420, 2), 840);
  close(M.heatCap(4200, 0.2), 840);
  close(M.equilibrium(420, 2, 80, 4200, 0.2, 20), 50);
  // 잃은 열 = 얻은 열 = 840 × 30 = 25 200 J
  close(M.lost(420, 2, 80, 50), 25200, 1e-6);
  close(M.gained(4200, 0.2, 20, 50), 25200, 1e-6);
  // 열용량이 같으면 온도 변화도 같다 → 산술 평균과 같아진다
  close(M.dTratio(840, 840), 1);
  close(M.mean(80, 20), 50);
});

test('A2-08 개념 체크: 80 °C 물 1 kg + 20 °C 물 3 kg → 35 °C (50 °C 는 질량을 무시한 산술 평균)', () => {
  const T = M.equilibrium(4200, 1, 80, 4200, 3, 20);
  close(T, 35);
  close(80 - T, 45); close(T - 20, 15);                       // 뜨거운 물 45 K, 찬물 15 K
  close(M.dTratio(M.heatCap(4200, 1), M.heatCap(4200, 3)), 3); // ΔT_A : ΔT_B = C_B : C_A = 3 : 1
  assert.notEqual(T, M.mean(80, 20));
});

test('A2-08 그림 ②: 같은 8400 J → 물 1 kg 2 K, 철 1 kg 약 18.7 K, 물 2 kg 1 K (ΔT ∝ 1/(cm))', () => {
  close(M.dTof(8400, 4200, 1), 2);
  close(M.dTof(8400, 450, 1), 18.67, 0.01);
  close(M.dTof(8400, 4200, 2), 1);
  close(M.heat(4200, 1, 2), 8400);
});

test('A2-08 어느 순간에나 A 가 잃은 열 = B 가 얻은 열, 두 온도는 엇갈리지 않고 열평형 온도로 다가간다', () => {
  const cases = [[420, 2, 80, 4200, 0.2, 20], [4200, 1, 80, 4200, 3, 20], [450, 1, 15, 4200, 0.5, 90], [4200, 2, 60, 420, 0.3, 10]];
  for (const [c1, m1, T1, c2, m2, T2] of cases) {
    const Teq = M.equilibrium(c1, m1, T1, c2, m2, T2);
    assert.ok(Teq > Math.min(T1, T2) && Teq < Math.max(T1, T2));   // 처음 두 온도 사이
    let prev = M.temps(c1, m1, T1, c2, m2, T2, 0, 2.5);
    close(prev.TA, T1); close(prev.TB, T2);
    for (let t = 0.5; t <= 20; t += 0.5) {
      const s = M.temps(c1, m1, T1, c2, m2, T2, t, 2.5);
      close(M.lost(c1, m1, T1, s.TA), M.gained(c2, m2, T2, s.TB), 1e-6);
      assert.equal(M.flow(s.TA, s.TB), M.flow(T1, T2));             // 열은 늘 높은 온도 → 낮은 온도
      assert.ok(Math.abs(s.TA - s.TB) < Math.abs(prev.TA - prev.TB)); // 온도 차가 줄어든다
      prev = s;
    }
    assert.ok(M.isEq(prev.TA, prev.TB));
    close(prev.TA, Teq, 0.05);
  }
});

test('A2-08 열평형 온도는 열용량이 큰 물체의 처음 온도에 더 가깝다 (물 0.4 kg 이면 40 °C)', () => {
  close(M.equilibrium(420, 2, 80, 4200, 0.4, 20), 40);
  for (const mB of [0.1, 0.2, 0.4, 1, 2]) {
    const T = M.equilibrium(420, 2, 80, 4200, mB, 20), CA = 840, CB = 4200 * mB;
    assert.equal(CB > CA, Math.abs(T - 20) < Math.abs(80 - T));
  }
});

test('A2-08 비열은 물질의 성질(질량과 무관), 열용량은 물체의 성질(질량에 비례). 열평형에서 같아지는 것은 온도', () => {
  for (const m of [0.5, 1, 2, 3]) close(M.specific(M.heatCap(4200, m), m), 4200);
  close(M.heatCap(4200, 2) / M.heatCap(4200, 1), 2);
  const s = M.temps(4200, 1, 80, 4200, 3, 20, 50, 2.5);
  assert.ok(M.isEq(s.TA, s.TB));
  assert.notEqual(M.heatCap(4200, 1), M.heatCap(4200, 3));
  assert.equal(M.flow(50, 50), 0);
});

test('A2-08 온도 = 입자의 평균 운동 에너지: 80 °C 와 20 °C 의 비는 절대 온도 비 353 : 293', () => {
  close(M.keRatio(80, 20), 353 / 293);
  assert.ok(M.keRatio(80, 20) > 1 && M.keRatio(80, 20) < 1.25);
});
