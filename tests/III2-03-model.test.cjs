const {test} = require('node:test');
const assert = require('node:assert/strict');
const M = require('../physics/III2/03/III2-03-model.js');
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);
const rng = (seed = 99) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

test('III2-03 예제: W = 2 eV, 광자 5 eV → E_k,max 3 eV, 정지 전압 3 V / 8 eV → 6 eV, 6 V', () => {
  close(M.kmax(5, 2), 3);
  close(M.stopV(5, 2), 3);
  close(M.kmax(8, 2), 6);
  close(M.stopV(8, 2), 6);
  // 광자 에너지는 1.6배인데 최대 운동 에너지는 2배
  close(8 / 5, 1.6); close(M.kmax(8, 2) / M.kmax(5, 2), 2);
  // 정지 전압에서 광전류 0, 그보다 약한 역전압이면 흐른다
  assert.equal(M.current(-3, 5, 2, 1), 0);
  assert.ok(M.current(-2.9, 5, 2, 1) > 0);
});

test('III2-03 E_k,max–f 직선: 기울기 h 는 모든 금속에서 같고(평행), 가로 절편 f₀, 세로 절편 −W', () => {
  const f1 = 0.8e15, f2 = 1.6e15;
  for (const m of M.METALS) {
    const slope = (M.kmaxF(f2, m.W) - M.kmaxF(f1, m.W)) / (f2 - f1);   // eV/Hz
    close(slope * M.e, M.h, 1e-45);                                      // J/Hz = h
    close(M.kmaxF(M.f0(m.W), m.W), 0, 1e-12);
    close(M.kmaxF(0, m.W), -m.W);
  }
  // 금속 A(f₀), B(2f₀): 3f₀(A) 빛이면 A 가 B 의 2배, 1.5f₀(A) 빛은 B 에서 방출 없음
  const A = M.metal('A').W, B = M.metal('B').W;
  close(M.f0(B) / M.f0(A), 2);
  const E3 = M.photonEV(3 * M.f0(A));
  close(M.kmax(E3, A) / M.kmax(E3, B), 2, 1e-12);
  assert.equal(M.emits(M.photonEV(1.5 * M.f0(A)), B), false);
});

test('III2-03 진동수 2배 → 최대 운동 에너지는 2배가 아니라 2E + W', () => {
  for (const [E, W] of [[5, 2], [3, 2.3], [6, 4]]) {
    const K = M.kmax(E, W), K2 = M.kmax(2 * E, W);
    close(K2, 2 * K + W);
    assert.ok(K2 > 2 * K);
  }
  // 예제 금속: 5 eV → 10 eV 이면 3 eV → 8 eV
  close(M.kmax(10, 2), 8);
});

test('III2-03 정지 전압은 세기와 무관, 세기 2배면 광전류만 2배', () => {
  for (const V of [-2.5, -1, 0, 1.5]) close(M.current(V, 5, 2, 1), 2 * M.current(V, 5, 2, 0.5));
  assert.equal(M.current(-M.stopV(5, 2), 5, 2, 0.5), 0);
  assert.equal(M.current(-M.stopV(5, 2), 5, 2, 1), 0);
  assert.equal(M.current(3, 1.5, 2, 1), 0);                   // hf < W 이면 어떤 전압에서도 0
  // 전자를 하나씩 뽑아도 P 에 닿는 비율이 곡선과 같다
  const r = rng(5);
  for (const V of [-2, -1, 0, 1]) {
    let n = 0; const N = 40000;
    for (let k = 0; k < N; k++) if (M.reaches(M.sampleEf(r, 5, 2), V)) n++;
    close(n / N, M.current(V, 5, 2, 1), 0.01);
  }
  // 가장 빠른 전자(E_k,max)는 역전압 V_s 에서 P 에 겨우 닿고 멈춘다
  close(M.turnFrac(3, -3), 1);
  close(M.turnFrac(3, -6), 0.5);
});
