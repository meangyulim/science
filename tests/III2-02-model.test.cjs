const {test} = require('node:test');
const assert = require('node:assert/strict');
const M = require('../physics/III2/02/III2-02-model.js');
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);
const W = M.METALS.Na.W;

test('III2-02 예제: 0.8f₀ 빛 A(매우 세게) 방출 없음, 1.2f₀ 빛 B(약하게) 방출, 함께 비추면 B에 의한 광전자만', () => {
  const A = {id: 'A', r: 0.8, I: 1}, B = {id: 'B', r: 1.2, I: 0.15};
  assert.equal(M.one(A, W).emits, false);
  assert.equal(M.one(B, W).emits, true);
  const both = M.combine([A, B], W);
  assert.deepEqual(both.by, ['B']);
  close(both.rate, M.one(B, W).rate);                 // 광전자 수 = B 의 몫만
  close(both.kmax, M.kmax(1.2, W));                    // 최대 운동 에너지도 B 가 정함
  close(both.kmax, 0.46, 1e-12);                       // hf − W = 1.2 × 2.3 − 2.3 eV
  // 파동설로 보면 A 는 세니까 곧 나와야 한다 → 실제와 모순
  assert.ok(M.waveTheory([A], W).emits && isFinite(M.waveTheory([A], W).delay));
});

test('III2-02 세기는 광전자 수만, 진동수는 방출 여부와 최대 운동 에너지를 정한다', () => {
  const L1 = {r: 1.4, I: 0.3}, L2 = {r: 1.4, I: 0.6};
  close(M.one(L2, W).rate, 2 * M.one(L1, W).rate);     // 세기 2배 → 광전자 수 2배
  close(M.one(L2, W).kmax, M.one(L1, W).kmax);         // 최대 운동 에너지는 그대로
  assert.ok(M.kmax(1.8, W) > M.kmax(1.4, W));           // 진동수가 클수록 크다
  // 문턱 미만은 아무리 세도 0, 문턱 이상은 아무리 약해도 방출
  assert.equal(M.one({r: 0.99, I: 1}, W).emits, false);
  assert.equal(M.one({r: 1.01, I: 0.01}, W).emits, true);
  // 파동설 예측: 세기만 키우면 더 빨리·더 센 전자 (실제와 다름)
  assert.ok(M.waveTheory([{I: 0.6}], W).delay < M.waveTheory([{I: 0.3}], W).delay);
  // 파장: 나트륨 문턱 f₀ 는 약 5.6 × 10¹⁴ Hz (초록빛 538 nm 부근)
  close(M.f0(W) / 1e14, 5.5758, 1e-3);
  assert.ok(M.lambdaNm(0.8, W) > 620 && M.lambdaNm(1.2, W) < 460);   // A 는 빨강, B 는 파랑
});

test('III2-02 빛마다 독립 판정: 문턱 미만 두 빛을 함께 비춰도 방출 없음', () => {
  const both = M.combine([{id: 'A', r: 0.7, I: 1}, {id: 'B', r: 0.9, I: 1}], W);
  assert.equal(both.emits, false);
  assert.equal(both.rate, 0);
  // 둘 다 문턱을 넘으면 광전자 수는 합, 최대 운동 에너지는 큰 진동수 쪽
  const two = M.combine([{id: 'A', r: 1.5, I: 0.2}, {id: 'C', r: 2, I: 0.2}], W);
  close(two.rate, 0.4);
  close(two.kmax, M.kmax(2, W));
});

test('III2-02 아연판 검전기: 가시광선은 그대로, 자외선은 (−)를 줄여 금속박이 오므라들고 중성이면 (+)로 벌어진다', () => {
  const Zn = M.METALS.Zn.W;
  const vis = {r: 0.5, I: 1}, uvW = {r: 1.2, I: 0.25}, uvS = {r: 1.2, I: 1};
  assert.equal(M.scopeCharge(-1, vis, 30), -1);                     // 아무리 세게·오래 비춰도 변화 없음
  const qW = M.scopeCharge(-1, uvW, 5), qS = M.scopeCharge(-1, uvS, 5);
  assert.ok(qW > -1 && qS > qW);                                     // 자외선은 약해도 줄고, 세면 더 빨리
  assert.ok(M.leafAngle(qS) < M.leafAngle(qW) && M.leafAngle(qW) < M.leafAngle(-1));
  const qN = M.scopeCharge(0, uvW, 10);
  assert.ok(qN > 0 && M.leafAngle(qN) > M.leafAngle(0));            // 중성 → (+) 대전 → 벌어짐
  assert.ok(M.scopeCharge(0, uvS, 1000) <= M.Q_CAP + 1e-12);
  assert.ok(M.lambdaNm(1.2, Zn) < 380 && M.lambdaNm(0.5, Zn) > 400); // 자외선 / 가시광선
});
