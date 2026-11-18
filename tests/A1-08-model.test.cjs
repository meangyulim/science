const {test} = require('node:test');
const assert = require('node:assert/strict');
const M = require('../physics/A1/08/A1-08-model.js');
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);
const R3 = Math.sqrt(3);

test('A1-08 예제: 높이 20 m 에서 수평 10 m/s → 2 s, 20 m, 10√5 m/s(약 22.4), tanφ = 2', () => {
  const L = M.landing(20, 10);
  close(L.t, 2); close(L.R, 20);
  close(L.vx, 10); close(L.vy, 20);
  close(L.v, 10 * Math.sqrt(5)); assert.equal(L.v.toFixed(1), '22.4');
  assert.equal(M.surd(L.v2).text, '10√5');
  close(L.tanPhi, 2); close(L.tanAlpha, 1);
  close(L.tanPhi, 2 * L.tanAlpha);                     // tanφ = 2 tanα
});

test('A1-08 수평으로 던진 공과 떨어뜨린 공은 매 순간 같은 높이 → 동시에 떨어진다 (수평 속력과 무관)', () => {
  for (const v0 of [2, 5, 10, 20]) {
    close(M.fallTime(20), 2);                          // 체공 시간은 높이만으로
    for (const t of [0, 0.5, 1, 1.5, 2]) {
      close(M.posH(v0, t).drop, M.dropAt(t));          // 같은 시각 = 같은 높이
      close(M.velH(v0, t).vx, v0);                     // 수평은 등속
      close(M.velH(v0, t).vy, M.G * t);                // 연직은 자유 낙하
    }
  }
  close(M.rangeH(20, 20), 2 * M.rangeH(20, 10));        // 수평 속력은 거리만 바꾼다
  close(M.pathDrop(10, 20), 20);                        // 궤적 y = gx²/2v₀²
});

test('A1-08 비스듬히 20 m/s, 30° → 체공 2 s, 최고점 속력 10√3 m/s (0 아님), 최고 높이 5 m, R = 20√3 m', () => {
  close(M.flightTime(20, 30), 2, 1e-12);
  close(M.topTime(20, 30), 1, 1e-12);
  close(M.topSpeed(20, 30), 10 * R3, 1e-12);
  close(M.speedAt(20, 30, M.topTime(20, 30)), 10 * R3, 1e-9);
  close(M.vel(20, 30, 1).vy, 0, 1e-12);
  close(M.maxHeight(20, 30), 5, 1e-12);
  close(M.range(20, 30), 20 * R3, 1e-9);
  close(M.range(20, 30), M.topSpeed(20, 30) * M.flightTime(20, 30), 1e-9);   // R = 수평 속도 × 체공 시간
  close(M.pos(20, 30, 2).y, 0, 1e-9);
});

test('A1-08 여각 쌍: R 같음, 체공 시간 비 = tanθ, 최고 높이 비 = tan²θ, 높이 합 = v₀²/2g, 45° 에서 R 최대', () => {
  for (const th of [15, 30, 40]) {
    const c = M.complement(th), tan = Math.tan(c * M.RAD);
    close(M.range(20, th), M.range(20, c), 1e-9);
    close(M.flightTime(20, c) / M.flightTime(20, th), tan, 1e-9);
    close(M.maxHeight(20, c) / M.maxHeight(20, th), tan * tan, 1e-9);
    close(M.maxHeight(20, c) + M.maxHeight(20, th), 20 * 20 / (2 * M.G), 1e-9);
  }
  close(M.flightTime(20, 60) / M.flightTime(20, 30), R3, 1e-12);      // 개념 체크: B 는 A 의 √3 배
  close(M.topSpeed(20, 30) / M.topSpeed(20, 60), R3, 1e-12);          // 최고점 속력은 오히려 30° 가 √3 배
  close(M.range(20, 45), M.maxRange(20), 1e-9);
  for (let th = 1; th < 90; th++) assert.ok(M.range(20, th) <= M.range(20, 45) + 1e-9);
});

test('A1-08 수평 투사: 늘 tanφ = 2 tanα, 속도의 연장선은 수평 이동 거리의 절반 지점을 지난다', () => {
  for (const [v0, t] of [[10, 0.5], [10, 1], [10, 2], [7, 1.3], [15, 2.4]]) {
    close(M.tanPhi(v0, t), 2 * M.tanAlpha(v0, t), 1e-12);
    close(M.backPoint(v0, t), M.posH(v0, t).x / 2, 1e-9);
  }
});

test('A1-08 비스듬히 던진 운동의 대칭: 최고점은 체공의 절반, 같은 높이에서 속력이 같다', () => {
  const T = M.flightTime(20, 50), t1 = M.topTime(20, 50);
  close(T, 2 * t1, 1e-12);
  for (const dt of [0.2, 0.6, 1.1]) {
    close(M.pos(20, 50, t1 - dt).y, M.pos(20, 50, t1 + dt).y, 1e-9);
    close(M.speedAt(20, 50, t1 - dt), M.speedAt(20, 50, t1 + dt), 1e-9);
  }
  close(M.pathY(20, 50, M.pos(20, 50, 1.3).x), M.pos(20, 50, 1.3).y, 1e-9);   // 궤적 식과 위치가 맞는다
  assert.equal(M.surd(300).text, '10√3'); assert.equal(M.surd(400).text, '20'); assert.equal(M.surd(2.5), null);
});
