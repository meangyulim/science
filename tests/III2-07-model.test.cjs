const {test} = require('node:test');
const assert = require('node:assert/strict');
const M = require('../physics/III2/07/III2-07-model.js');
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${a} ≠ ${b}`);

test('III2-07 예제: A(m, 4E)와 B(4m, E) → 운동량 같음, 파장 같음, 속력은 A가 B의 4배', () => {
  close(M.p(1, 4), M.p(4, 1));                            // √(m·4E) = √(4m·E) = 2√(mE)
  close(M.p(1, 4), 2);
  close(M.lambda(1, 4), M.lambda(4, 1));
  close(M.v(1, 4) / M.v(4, 1), 4);
  // 같은 운동량이면 v = 2E_k/p 에서 속력 비 = 운동 에너지 비
  close(M.vFromEP(4, M.p(1, 4)) / M.vFromEP(1, M.p(4, 1)), 4);
  const c = M.compare(1, 4, 4, 1);
  assert.equal(c.p, '1 : 1'); assert.equal(c.lam, '1 : 1'); assert.equal(c.v, '4 : 1');
  assert.equal(c.m, '1 : 4'); assert.equal(c.E, '4 : 1');
  assert.ok(c.eqP && !c.eqE && !c.eqM && !c.eqV);
});

test('III2-07 표형: A(2m, E), B(m, 8E) → A의 파장은 B의 2배 (루트 안의 곱 비교)', () => {
  close(M.lambda(2, 1) / M.lambda(1, 8), 2);
  assert.equal(M.compare(2, 1, 1, 8).lam, '2 : 1');
  assert.equal(M.compare(2, 1, 1, 8).p, '1 : 2');
});

test('III2-07 같은 운동량, E_k 는 X가 Y의 3배 → X의 속력 3배, 질량 1/3배, 파장 같음', () => {
  const pX = M.p(1, 3), pY = M.p(3, 1);
  close(pX, pY);
  close(M.vFromEP(3, pX) / M.vFromEP(1, pY), 3);
  close(M.mFromPE(pX, 3) / M.mFromPE(pY, 1), 1 / 3);
  close(M.mFromPE(pX, 3), 1);                             // m = p²/2E_k 로 질량을 되찾는다
  const c = M.compare(1, 3, 3, 1);
  assert.equal(c.v, '3 : 1'); assert.equal(c.lam, '1 : 1');
});

test('III2-07 변환 공식: 상대 단위와 SI 가 같은 답을 준다', () => {
  const h = 6.6e-34, m0 = 9.1e-31, E0 = 1.6e-17;          // 100 eV 전자를 단위로
  const p0 = Math.sqrt(2 * m0 * E0), v0 = Math.sqrt(2 * E0 / m0);
  for (const [k, e] of [[1, 4], [4, 1], [2, 9], [7, 3]]) {
    const m = k * m0, E = e * E0;
    const p = Math.sqrt(2 * m * E), v = Math.sqrt(2 * E / m), lam = h / p;
    close(M.p(k, e) * p0, p); close(M.v(k, e) * v0, v); close(M.lambda(k, e) * h / p0, lam);
    close(M.SI.pFromLambda(h, lam), p);
    close(M.SI.ekFromPM(p, m), E); close(M.SI.ekFromPV(p, v), E);
    close(M.SI.mFromPE(p, E), m); close(M.SI.vFromEP(E, p), v);
    close(M.ekFromPM(M.p(k, e), k), e); close(M.ekFromPV(M.p(k, e), M.v(k, e)), e);
    close(M.pFromLambda(M.lambda(k, e)), M.p(k, e));
  }
});

test('III2-07 그래프 읽기: 1/λ–v 기울기 = m, λ–p 는 곡선 하나, 같은 p 는 수평선, E_k–v 에서 m = E_k/v²', () => {
  for (const m of [1, 2, 5]) for (const E of [1, 3, 8]) {
    const [v, il] = M.AXES.iv(m, E); close(il / v, m);       // 기울기 m/h (상대 단위에서 m)
    const [pp, lam] = M.AXES.lp(m, E); close(pp * lam, 1);    // λ = h/p: 질량과 무관
    const [vv, EE] = M.AXES.Ev(m, E); close(EE / (vv * vv), m);
    const [mm, il2] = M.AXES.im(m, E); close(il2 / mm, M.v(m, E));  // 원점과 이은 기울기 = v/h
    close(M.CURVE.lE(m, E), M.lambda(m, E)); close(M.CURVE.pE(m, E), M.p(m, E));
  }
  // 같은 p 인 두 점: p–E_k 그래프에서 높이가 같고, E_k 가 작은 쪽이 무겁다
  const a = M.AXES.pE(1, 4), b = M.AXES.pE(4, 1);
  close(a[1], b[1]); assert.ok(b[0] < a[0]);
});

test('III2-07 비 쓰기: 근호 꼴을 간단히', () => {
  assert.equal(M.sqrtRatio(8, 2), '2 : 1');
  assert.equal(M.sqrtRatio(2, 1), '√2 : 1');
  assert.equal(M.sqrtRatio(3, 2), '√3 : √2');
  assert.equal(M.sqrtFracStr(8, 1), '2√2');
  assert.equal(M.sqrtFracStr(1, 4), '1/2');
  assert.equal(M.sqrtFracStr(1, 3), '1/√3');
  assert.equal(M.sqrtFracStr(3, 4), '√3/2');
  assert.equal(M.sqrtFracStr(1, 8), '1/(2√2)');
});
