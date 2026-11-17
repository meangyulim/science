const {test} = require('node:test');
const assert = require('node:assert/strict');
const M = require('../physics/III1/01/III1-01-model.js');
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

test('III1-01 예제: 마루 사이 0.4 m, 1초에 5번 진동 → v = 2 m/s, T = 0.2 s', () => {
  close(M.speed(5, 0.4), 2);
  close(M.period(5), 0.2);
});

test('III1-01 한 주기 동안 마루는 정확히 한 파장 이동한다 (v = λ/T)', () => {
  const w = {A: 0.05, f: 5, lambda: 0.4, dir: 1};
  const c0 = M.crests(0, w, 0, 2), c1 = M.crests(M.period(5), w, 0, 2);
  assert.ok(c0.length >= 4);
  // 같은 마루 집합 (한 파장씩 밀려 같은 자리)
  close(c0[0], c1[0]);
  const cq = M.crests(M.period(5) / 4, w, 0, 2);       // 1/4 주기 뒤 λ/4 이동
  close(((cq[0] - c0[0]) % 0.4 + 0.4) % 0.4, 0.1);
  for (const x of c0) close(M.disp(x, 0, w), w.A, 1e-12);
});

test('III1-01 매질 입자는 제자리에서 진동: 한 주기 뒤 같은 변위, 최대 변위 = 진폭', () => {
  const w = {A: 0.03, f: 2, lambda: 1, dir: -1};
  for (const x of [0, 0.13, 0.5]) {
    close(M.disp(x, 0.1, w), M.disp(x, 0.1 + 0.5, w), 1e-12);
    let mx = 0; for (let k = 0; k < 400; k++) mx = Math.max(mx, Math.abs(M.disp(x, k / 400 * 0.5, w)));
    close(mx, 0.03, 1e-4);
  }
});

test('III1-01 종파: 밀한 곳은 변위 0 이면서 양쪽 입자가 모여드는 곳', () => {
  const w = {A: 0.02, f: 1, lambda: 1, dir: 1};
  // 오른쪽 진행, t=0: s = A sin(−2πx) → x = 0 근처에서 ∂s/∂x < 0 → 밀
  close(M.disp(0, 0, w), 0, 1e-12);
  assert.ok(M.density(0, 0, w) > 1);
  assert.ok(M.density(0.5, 0, w) < 1);
});
