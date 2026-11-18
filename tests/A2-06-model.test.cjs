const {test} = require('node:test');
const assert = require('node:assert/strict');
const M = require('../physics/A2/06/A2-06-model.js');
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);
const g = M.G, RAD = Math.PI / 180;

test('A2-06 예제: 1.6 m 실, 0.5 kg 추를 60°에서 놓으면 h = 0.8 m, 최저점 속력 4 m/s, 장력 10 N', () => {
  const l = 1.6, m = 0.5, th0 = 60 * RAD;
  close(M.height(l, th0), 0.8, 1e-12);
  close(M.vMax(g, l, th0), 4, 1e-12);
  close(M.tensionBottom(m, g, l, th0), 10, 1e-12);
  close(m * g + m * 4 ** 2 / l, 10, 1e-12);                                  // T − mg = mv²/l → 5 + 5
  close(M.kMax(m, g, l, th0), 4, 1e-12);                                     // 최대 운동 에너지 mgh = 4 J
  close(M.tensionEnd(m, g, th0), 2.5, 1e-12);                                // 양 끝 mg cos60°
});

test('A2-06 최대 속력은 높이차로만 정해져 질량과 무관하고, 최대 운동 에너지는 질량에 비례한다', () => {
  const l = 1.6, th0 = 15 * RAD;
  const vA = M.vMax(g, l, th0), vB = M.vMax(g, l, th0);                      // 식에 m 이 없다
  close(vA, vB, 1e-15);
  close(M.kMax(1, g, l, th0) / M.kMax(0.5, g, l, th0), 2, 1e-12);            // 질량 2배 → 2배
  close(0.5 * 1 * vA ** 2, M.kMax(1, g, l, th0), 1e-12);                     // ½mv² = mgh
  close(M.vMax(g, l, th0), Math.sqrt(2 * g * M.height(l, th0)), 1e-12);
  // 질량이 같아도 놓는 각이 크면 높이차가 커서 빠르다
  assert.ok(M.vMax(g, l, 90 * RAD) > M.vMax(g, l, 60 * RAD));
});

test('A2-06 장력은 늘 운동 방향에 수직이라 일을 하지 않고, 정확한 운동에서 K + U = E 가 늘 같다', () => {
  for (const [l, m, deg] of [[1.6, 0.5, 60], [1, 2, 20], [2.4, 0.3, 90], [0.5, 1, 5]]) {
    const th0 = deg * RAD, T = M.period(l, g, th0);
    for (const f of [0, 0.03, 0.11, 0.25, 0.37, 0.5, 0.62, 0.75, 0.9]) {
      const s = M.state(f * T, l, g, th0), e = M.energies(m, g, l, th0, s.th);
      close(0.5 * m * s.v ** 2 + e.U, e.E, 1e-9);                               // 속력으로 잰 K + 각으로 잰 U = E
      close(M.tensionPower(m, g, l, th0, s.th, s.w), 0, 1e-9);                 // 장력 · 속도 = 0
    }
  }
});

test('A2-06 끝 → 최저점 T/4, 반대쪽 끝 T/2, 같은 높이까지 올라간다 (θ(T/2) = −θ₀)', () => {
  const l = 1.6, th0 = 60 * RAD, T = M.period(l, g, th0);
  close(M.state(0, l, g, th0).th, th0, 1e-12);
  close(M.state(T / 4, l, g, th0).th, 0, 1e-9);
  close(M.state(T / 2, l, g, th0).th, -th0, 1e-9);
  close(M.state(T, l, g, th0).th, th0, 1e-9);
  close(Math.abs(M.state(T / 4, l, g, th0).v), 4, 1e-9);                      // 최저점 속력 = 예제의 4 m/s
  close(M.state(T / 2, l, g, th0).v, 0, 1e-6);
  assert.equal(M.phase(0, T), 'end'); assert.equal(M.phase(T / 4, T), 'bottom'); assert.equal(M.phase(T / 2, T), 'end');
  assert.equal(M.phase(T / 8, T), 'down'); assert.equal(M.phase(3 * T / 8, T), 'up');
});

test('A2-06 운동 에너지는 한 주기에 두 번 최대 → K·U 그래프의 반복 간격은 T/2 (속도 방향은 반대)', () => {
  const l = 1.6, m = 0.5, th0 = 60 * RAD, T = M.period(l, g, th0);
  close(M.energyPeriod(l, g, th0), T / 2, 1e-12);
  for (const t of [0.1, 0.37, 0.8, 1.21]) {
    const a = M.state(t, l, g, th0), b = M.state(t + T / 2, l, g, th0);
    close(M.energies(m, g, l, th0, a.th).K, M.energies(m, g, l, th0, b.th).K, 1e-9);
    close(a.th, -b.th, 1e-9);                                                  // 반 주기 뒤에는 거울 자리
  }
  const v1 = M.state(T / 4, l, g, th0).v, v2 = M.state(3 * T / 4, l, g, th0).v;
  assert.ok(v1 < 0 && v2 > 0);                                                // 갈 때·올 때: 같은 속력, 반대 방향
  close(Math.abs(v1), Math.abs(v2), 1e-9);
});

test('A2-06 주기: 작은 진폭이면 2π√(l/g), 진폭이 크면 조금 길다 (60° 에서 약 7 %)', () => {
  close(M.period(1, g, 0.5 * RAD), M.periodSmall(1, g), 1e-5);
  const T60 = M.period(1.6, g, 60 * RAD), Ts = M.periodSmall(1.6, g);
  assert.ok(T60 > Ts);
  close(T60 / Ts, 1.0732, 1e-4);
  close(T60, 2.697, 1e-3);
  close(M.ellipK(0), Math.PI / 2, 1e-15);
});

test('A2-06 최저점 장력 = mg + mv²/l > mg, 실이 수평(90°)이면 3mg, 접선 방향 힘은 각에 따라 변한다', () => {
  const l = 1.6, m = 0.5;
  for (const deg of [10, 30, 60, 90]) {
    const th0 = deg * RAD;
    assert.ok(M.tensionBottom(m, g, l, th0) > m * g);
    close(M.tensionBottom(m, g, l, th0), m * g * (3 - 2 * Math.cos(th0)), 1e-9);
    close(M.tension(m, g, l, th0, 0), M.tensionBottom(m, g, l, th0), 1e-9);
    close(M.tension(m, g, l, th0, th0), M.tensionEnd(m, g, th0), 1e-9);
  }
  close(M.tensionBottom(m, g, l, 90 * RAD), 15, 1e-9);                        // 개념 확인: 90° → 15 N = 3mg
  close(M.vMax(g, l, 90 * RAD), 4 * Math.SQRT2, 1e-12);                       // 4√2 m/s
  assert.ok(M.tangential(m, g, 60 * RAD) > M.tangential(m, g, 30 * RAD) && M.tangential(m, g, 0) === 0);
});

test('A2-06 유효 중력: g 가 ¼ 이면 같은 각에서 최대 속력 ½배, 최대 운동 에너지 ¼배, 주기·T/2 는 2배', () => {
  const l = 1.6, m = 0.5, th0 = 60 * RAD;
  close(M.vMax(g / 4, l, th0) / M.vMax(g, l, th0), 0.5, 1e-12);
  close(M.kMax(m, g / 4, l, th0) / M.kMax(m, g, l, th0), 0.25, 1e-12);
  close(M.period(l, g / 4, th0) / M.period(l, g, th0), 2, 1e-12);
  close(M.energyPeriod(l, g / 4, th0) / M.energyPeriod(l, g, th0), 2, 1e-12);
});

test('A2-06 개념 체크: 같은 길이·같은 작은 각, 질량 m 과 2m → ㄱ 속력 같다(×), ㄴ 운동 에너지 2배(○), ㄷ T/2 같다(○)', () => {
  const l = 1.6, th0 = 8 * RAD, m = 0.5;
  const speedFromEnergy = (mm) => Math.sqrt(2 * M.kMax(mm, g, l, th0) / mm);   // ½mv² = K_max 를 v 로 푼다
  close(speedFromEnergy(m), speedFromEnergy(2 * m), 1e-12);                     // ㄱ 이 틀린 까닭: 속력 같다
  close(speedFromEnergy(m), M.vMax(g, l, th0), 1e-12);
  close(M.kMax(2 * m, g, l, th0), 2 * M.kMax(m, g, l, th0), 1e-12);            // ㄴ
  // ㄷ: 같은 시각의 운동이 질량과 무관 (상태 함수에 m 이 없다) → K 가 최대인 시각도 같다
  const T = M.period(l, g, th0);
  close(M.energies(2 * m, g, l, th0, M.state(T / 4, l, g, th0).th).K, M.kMax(2 * m, g, l, th0), 1e-12);
  close(M.energies(m, g, l, th0, M.state(T / 4, l, g, th0).th).K, M.kMax(m, g, l, th0), 1e-12);
});
