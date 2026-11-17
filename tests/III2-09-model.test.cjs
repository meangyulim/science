const {test} = require('node:test');
const assert = require('node:assert/strict');
const M = require('../physics/III2/09/III2-09-model.js');
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

test('III2-09 예제: 가속 전압 100 V → 400 V 이면 운동 에너지 4배, 물질파 파장 1/2배, 분해능 향상', () => {
  close(M.kinetic(400) / M.kinetic(100), 4, 1e-12);
  close(M.lambdaRatio(100, 400), 0.5, 1e-12);
  // 원고 상수로 λ = h/√(2meV): 100 V → 약 0.122 nm, 400 V → 약 0.061 nm
  close(M.lambdaV(100), 6.6e-34 / Math.sqrt(2 * 9.1e-31 * 1.6e-19 * 100), 1e-24);
  assert.ok(Math.abs(M.lambdaV(100) - 1.223e-10) < 0.001e-10);
  assert.ok(Math.abs(M.lambdaV(400) - 0.6115e-10) < 0.001e-10);
  // 0.1 nm 떨어진 두 점: 100 V 로는 한 덩어리, 400 V 로는 따로 보인다
  assert.equal(M.resolved(0.1e-9, M.lambdaV(100)), false);
  assert.equal(M.resolved(0.1e-9, M.lambdaV(400)), true);
});

test('III2-09 λ ∝ 1/√V: 전압 4배마다 파장 1/2, 운동 에너지 E_k = eV', () => {
  for (const V of [25, 50, 100, 250]) {
    close(M.lambdaV(4 * V) / M.lambdaV(V), 0.5, 1e-12);
    close(M.lambdaV(2 * V) / M.lambdaV(V), 1 / Math.SQRT2, 1e-12);
    close(M.kinetic(V), 1.6e-19 * V, 1e-30);
  }
  close(M.voltageFor(M.lambdaV(123)), 123, 1e-6);
});

test('III2-09 분해능 모형: 두 점 사이가 파장보다 멀면 따로, 가까우면 하나로 번져 보인다', () => {
  const lam = 5e-10;
  close(M.dipRatio(lam, lam), M.DIP, 2e-4);                // 기준이 꼭 s = λ 에서
  assert.equal(M.resolved(1.05 * lam, lam), true);
  assert.equal(M.resolved(0.95 * lam, lam), false);
  close(M.minDistance(lam), lam);
  // 파장이 짧을수록 더 가까운 두 점까지 구별: 같은 s 에서 골이 더 깊다
  assert.ok(M.dipRatio(lam, lam / 2) < M.dipRatio(lam, lam));
  // 아주 멀면 두 점 사이가 완전히 어둡다
  assert.ok(M.dipRatio(6 * lam, lam) < 0.01);
});

test('III2-09 전자 현미경이 광학 현미경보다 분해능이 좋은 까닭: 물질파 파장이 가시광선보다 수천 배 짧다', () => {
  assert.ok(M.timesShorter(M.VISIBLE[0], 100) > 3000);
  assert.equal(M.resolved(0.1e-9, 550e-9), false);          // 가시광선으로 0.1 nm 두 점은 구별 불가
  // 빛끼리도 파장이 짧은 파란빛이 유리: 500 nm 떨어진 두 점
  assert.equal(M.resolved(500e-9, 450e-9), true);
  assert.equal(M.resolved(500e-9, 650e-9), false);
});

test('III2-09 TEM 시료가 두꺼우면 전자가 느려져 파장이 길어진다 → 흐려진다', () => {
  assert.ok(M.lambdaInSample(400, true) > M.lambdaInSample(400, false));
  close(M.lambdaInSample(400, true) / M.lambdaInSample(400, false), 2, 1e-12);
  assert.equal(M.resolved(0.1e-9, M.lambdaInSample(400, true)), false);
});

test('III2-09 현미경 3분류와 개념 체크(ㄱ, ㄴ, ㄷ 모두 옳음)', () => {
  assert.equal(M.classify(false, false), 'light');
  assert.equal(M.classify(true, false), 'tem');
  assert.equal(M.classify(true, true), 'sem');
  assert.equal(M.SCOPES.tem.lens, '자기렌즈');
  assert.equal(M.SCOPES.light.lens, '유리 렌즈');
  assert.equal(M.correctMarks(), 'ㄱ, ㄴ, ㄷ');
});
