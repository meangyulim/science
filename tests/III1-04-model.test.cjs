const {test} = require('node:test');
const assert = require('node:assert/strict');
const M = require('../physics/III1/04/III1-04-model.js');
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);
const R3 = Math.sqrt(3), R2 = Math.SQRT2;

test('III1-04 예제: 공기 → 굴절률 √3, 입사각 60° → 굴절각 30°, 유리 속 v = √3 × 10⁸ ≈ 1.7 × 10⁸ m/s', () => {
  close(M.refract(1, R3, 60), 30, 1e-9);
  close(M.speed(R3), R3 * 1e8, 1e-3);
  assert.equal((M.speed(R3) / 1e8).toFixed(1), '1.7');
});

test('III1-04 개념 체크: 45° → 30° 로 꺾이면 n = √2, v ≈ 2.1 × 10⁸ m/s', () => {
  close(M.indexFrom(1, 45, 30), R2, 1e-12);
  assert.equal((M.speed(M.indexFrom(1, 45, 30)) / 1e8).toFixed(1), '2.1');
});

test('III1-04 sinθ₁/sinθ₂ = v₁/v₂ = λ₁/λ₂ = n₂/n₁ 는 입사각과 무관하게 일정 (그래프는 원점 지나는 직선)', () => {
  for (const [n1, n2] of [[1, 1.33], [1, 1.5], [1.33, 2.42]]) {
    for (const th of [10, 25, 40, 60, 80]) {
      const th2 = M.refract(n1, n2, th);
      close(M.sinD(th) / M.sinD(th2), n2 / n1, 1e-12);
      close(M.sinD(th2) / M.sinD(th), M.slope(n1, n2), 1e-12);          // 기울기 = n₁/n₂
      close(M.sinD(th) / M.sinD(th2), M.speed(n1) / M.speed(n2), 1e-9);
      close(M.lambdaRatio(n1, n2), M.sinD(th2) / M.sinD(th), 1e-12);     // λ₂/λ₁ = sinθ₂/sinθ₁
      close(M.invariant(n1, th), M.invariant(n2, th2), 1e-12);           // n sinθ 같음
    }
  }
});

test('III1-04 굴절률이 클수록 더 크게 꺾인다: 60° → √3 에서 30°, 1.5 에서 약 35°', () => {
  close(M.refract(1, 1.5, 60), 35.26, 0.01);
  const angs = [1.33, 1.5, R3, 2.42].map((n) => M.refract(1, n, 60));
  for (let i = 1; i < angs.length; i++) assert.ok(angs[i] < angs[i - 1]);
});

test('III1-04 각이 작은 쪽 = 느린 쪽, 수직 입사는 꺾이지 않아도 속력·파장은 바뀐다, 경로는 거꾸로도 성립', () => {
  const th2 = M.refract(1, 1.5, 50);
  assert.ok(th2 < 50 && M.speed(1.5) < M.speed(1));
  close(M.refract(1, 1.5, 0), 0, 1e-12);
  assert.ok(M.lambdaRatio(1, 1.5) < 1);
  close(M.refract(1.5, 1, th2), 50, 1e-9);                                  // 가역성
});

test('III1-04 굴절률이 큰 쪽 → 작은 쪽이고 임계각보다 크면 굴절 광선이 없다', () => {
  close(M.critical(1.5, 1), Math.asin(1 / 1.5) * 180 / Math.PI, 1e-9);
  assert.ok(Number.isNaN(M.refract(1.5, 1, 45)));
  assert.ok(!Number.isNaN(M.refract(1.5, 1, 40)));
  assert.ok(Number.isNaN(M.critical(1, 1.5)));
});

test('III1-04 하위헌스 작도: BD = v₁t, AE = v₂t, BD/AE = v₁/v₂, sinθ = (같은 시간에 간 거리)/AD', () => {
  const AD = 2, h = M.huygens(1, R3, 60, AD);
  close(h.th2, 30, 1e-9);
  close(h.BD, AD * M.sinD(60), 1e-12);
  close(h.AE, AD * M.sinD(30), 1e-9);
  close(h.BD / h.AE, M.speed(1) / M.speed(R3), 1e-9);
  close(M.footprint(0.5, 60), 2, 1e-12);
  close(M.bandAfter(0.5, 60, 30), 0.5 * M.cosD(30) / M.cosD(60), 1e-12);
});

test('III1-04 빨간빛보다 굴절률이 큰 보라색 빛은 더 많이 꺾이고 유리 속에서 더 느리다', () => {
  const nRed = 1.51, nVio = 1.53;
  assert.ok(M.refract(1, nVio, 50) < M.refract(1, nRed, 50));
  assert.ok(M.speed(nVio) < M.speed(nRed));
});
