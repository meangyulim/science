const {test} = require('node:test');
const assert = require('node:assert/strict');
const M = require('../physics/III1/06/III1-06-model.js');
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);
const R3 = Math.sqrt(3);

test('III1-06 예제: 깊은 곳 60°, λ₁ = 2√3 cm → 얕은 곳 굴절각 30° 이면 λ₂ = 2 cm', () => {
  close(M.lam2From(2 * R3, 60, 30), 2, 1e-12);
  const k = M.ratioFrom(60, 30);
  close(k, 1 / R3, 1e-12);                                  // 얕은 곳 속력도 1/√3 배
  const w = M.wave(60, 2 * R3, k);
  close(w.th2, 30, 1e-9);
  close(w.lam2, 2, 1e-12);
});

test('III1-06 물결파: 얕은 곳은 느리고 파장이 짧고 각이 작다, 진동수(주기)는 두 곳에서 같다', () => {
  const lam1 = 3, v1 = 15, k = 0.6, w = M.wave(40, lam1, k);
  assert.ok(w.lam2 < lam1 && w.th2 < 40);
  close(M.period(lam1, v1), M.period(w.lam2, v1 * k), 1e-12);
  close(M.sinD(40) / M.sinD(w.th2), lam1 / w.lam2, 1e-12);   // sinθ₁ : sinθ₂ = λ₁ : λ₂
});

test('III1-06 마루선과 경계면 사이 각 = 진행 방향과 법선 사이 각 (여각이 아니다)', () => {
  for (const th of [10, 30, 60, 75]) {
    close(M.crestBoundaryAngle(th), th, 1e-9);
    assert.ok(Math.abs(M.crestBoundaryAngle(th) - (90 - th)) > 1e-6 || th === 45);
  }
});

test('III1-06 평행한 층: n sinθ 가 모든 층에서 같다 (그림: 1.0 → 1.5 → 1.2, 55° → 33° → 43°, 0.82)', () => {
  const ns = [1, 1.5, 1.2], th = M.layers(ns, 55);
  assert.equal(Math.round(th[1]), 33); assert.equal(Math.round(th[2]), 43);
  ns.forEach((n, i) => close(M.invariant(n, th[i]), M.invariant(1, 55), 1e-12));
  assert.equal(M.invariant(1, 55).toFixed(2), '0.82');
});

test('III1-06 같은 바깥 매질로 나오면 처음 방향과 평행 — 중간 층과 무관, 옆으로만 밀린다', () => {
  for (const mid of [[1.5, 1.2, 1.8], [1.33, 2.42, 1.5]]) {
    const th = M.layers([1, ...mid, 1], 50);
    close(th[th.length - 1], 50, 1e-9);
    assert.ok(M.shift([1, ...mid, 1], 50, [1, 1, 1]) > 0);
  }
  close(M.shift([1, 1, 1, 1, 1], 50, [1, 1, 1]), 0, 1e-12);
});

test('III1-06 개념 체크: 각이 A 50°, B 35°, C 42° 이면 굴절률은 B > C > A', () => {
  assert.deepEqual(M.rankByAngle(['A', 'B', 'C'], [50, 35, 42]), ['B', 'C', 'A']);
  // 같은 n sinθ 로 만든 층에서 확인
  const K = 1.2 * M.sinD(50), ns = [1, 1.2, K / M.sinD(35), K / M.sinD(42)];
  const th = M.layers(ns, M.asinD(K));
  close(th[1], 50, 1e-9); close(th[2], 35, 1e-9); close(th[3], 42, 1e-9);
  assert.ok(ns[2] > ns[3] && ns[3] > ns[1]);
});

test('III1-06 sin r – sin i 직선: 기울기 1.25 이면 sin r = 1 에서 끝나고 임계각의 사인 = 0.8', () => {
  const L = M.sinLine(1.25, 1);
  close(L.slope, 1.25); close(L.endSinI, 0.8, 1e-12); close(M.sinD(L.critical), 0.8, 1e-12);
  close(M.criticalSin(1.25), 0.8, 1e-12);
  assert.ok(Number.isNaN(M.wave(60, 2, 1.25).th2));          // 얕은 → 깊은, 끝점보다 큰 입사각: 굴절파 없음
  assert.ok(M.wave(50, 2, 1.25).th2 > 50);                    // 기울기 > 1: 굴절각 > 입사각
  const G = M.sinLine(1, 1.5);                                // 기울기 < 1: 끝점(임계각) 없음
  assert.ok(Number.isNaN(G.critical) && G.endSinI === 1);
});
