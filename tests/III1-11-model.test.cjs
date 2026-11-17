const {test} = require('node:test');
const assert = require('node:assert/strict');
const M = require('../physics/III1/11/III1-11-model.js');
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

test('III1-11 예제: 같은 위상, S₁S₂ = 2λ → 선분 위(양 끝 제외) 상쇄 지점 4개', () => {
  const lambda = 2, d = 4;                                   // 페이지 기본값: λ = 2 cm, d = 4 cm
  const p = M.segmentPoints(d, lambda, false);
  assert.equal(p.des.length, 4);
  assert.deepEqual(p.des.map((s) => +(s / lambda).toFixed(9)), [-0.75, -0.25, 0.25, 0.75]);   // 중점에서 ±λ/4, ±3λ/4
  assert.equal(p.con.length, 3);                             // 중점과 ±λ/2 는 보강
  // 각 상쇄점의 경로차는 반파장의 홀수배
  for (const s of p.des) assert.equal(M.judge(M.pathDiff(M.r1(s, 0, d), M.r2(s, 0, d), lambda), false), 'des');
});

test('III1-11 개념 체크: 반대 위상, S₁S₂ = 3λ → 상쇄 지점 5개 (중점이 상쇄)', () => {
  const p = M.segmentPoints(3, 1, true);
  assert.equal(p.des.length, 5);
  assert.deepEqual(p.des.map((s) => +s.toFixed(9)), [-1, -0.5, 0, 0.5, 1]);
  assert.equal(M.judge(0, true), 'des');
  // 같은 위상 조건을 그대로 쓰면 뒤바뀐다
  assert.equal(M.segmentPoints(3, 1, false).con.length, 5);
});

test('III1-11 경로차 조건: 정수배 보강, 반정수배 상쇄 — 반대 위상이면 뒤바뀜', () => {
  assert.equal(M.judge(1, false), 'con'); assert.equal(M.judge(2, false), 'con');
  assert.equal(M.judge(0.5, false), 'des'); assert.equal(M.judge(1.5, false), 'des');
  assert.equal(M.judge(1, true), 'des'); assert.equal(M.judge(0.5, true), 'con');
  assert.equal(M.judge(0.25, false), 'mid');
  close(M.ampFactor(1, false), 2); close(M.ampFactor(0.5, false), 0, 1e-12); close(M.ampFactor(0, true), 0, 1e-12);
  // 쌍곡선 위의 점은 정말 그 경로차를 가진다
  const d = 4, x = M.xOnLine(2, d, 5.81);
  close(M.r1(x, 5.81, d) - M.r2(x, 5.81, d), 2, 1e-9);
});

test('III1-11 보강 지점은 진폭 2A 로 진동하며 0 도 지나고, 상쇄 지점은 늘 정지', () => {
  const lambda = 2;
  // 보강: r₁ = 8, r₂ = 6 (경로차 λ)
  let mx = 0, crossed = false, prev = M.height(8, 6, lambda, 0, false);
  for (let k = 1; k <= 400; k++) {
    const h = M.height(8, 6, lambda, k / 400, false);
    mx = Math.max(mx, Math.abs(h)); if (Math.sign(h) !== Math.sign(prev)) crossed = true; prev = h;
  }
  close(mx, 2, 1e-3); assert.ok(crossed);
  // 상쇄: 경로차 λ/2
  for (let k = 0; k <= 40; k++) close(M.height(7, 6, lambda, k / 40, false), 0, 1e-12);
});

test('III1-11 소리: 스피커 간격 3 m, P 는 S₁ 앞 4 m → 경로차 1 m. 170·510 Hz 작게, 340 Hz 크게', () => {
  const d = 3, x = -1.5, y = 4, v = 340;
  const a = M.r1(x, y, d), b = M.r2(x, y, d);
  close(a, 4); close(b, 5);
  assert.equal(M.judge(M.pathDiff(a, b, M.lambdaOf(v, 170)), false), 'des');
  assert.equal(M.judge(M.pathDiff(a, b, M.lambdaOf(v, 340)), false), 'con');
  assert.equal(M.judge(M.pathDiff(a, b, M.lambdaOf(v, 510)), false), 'des');
  // 진동수를 높이면 파장이 짧아져 첫 번째로 작게 들리는 곳이 중앙에 가까워진다
  assert.ok(M.firstQuiet(d, y, M.lambdaOf(v, 340), false) < M.firstQuiet(d, y, M.lambdaOf(v, 170), false));
});
