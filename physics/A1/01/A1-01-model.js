/* A1-01 스칼라·벡터와 힘의 합성·분해 — 계산 모형. 브라우저(window.A1_01)와 Node 테스트(tests/A1-01-model.test.cjs)에서 같이 쓴다.
   벡터는 [x, y] (오른쪽 +x, 위쪽 +y). 각도는 도(°). 중력 가속도 g = 10 m/s² (원고 값).
   두 실에 매단 물체: 실 1 은 연직과 a1 (왼쪽 위로), 실 2 는 연직과 a2 (오른쪽 위로) 당긴다. */
(function (root) {
  'use strict';
  const G = 10;
  const RAD = Math.PI / 180;
  const sinD = (d) => Math.sin(d * RAD);
  const cosD = (d) => Math.cos(d * RAD);
  const tanD = (d) => Math.tan(d * RAD);

  // ── 벡터 ────────────────────────────────────────────────
  const vec = (mag, deg) => [mag * cosD(deg), mag * sinD(deg)];          // x축과 deg 를 이루는 크기 mag 인 벡터 → (Aₓ, A_y)
  const add = (...vs) => vs.reduce((s, v) => [s[0] + v[0], s[1] + v[1]], [0, 0]);   // 꼬리–머리로 이어 붙이기 = 성분끼리 더하기
  const neg = (v) => [-v[0], -v[1]];
  const sub = (a, b) => add(a, neg(b));                                  // A − B = A + (−B)
  const mag = (v) => Math.hypot(v[0], v[1]);                             // A = √(Aₓ² + A_y²)
  const dirDeg = (v) => Math.atan2(v[1], v[0]) / RAD;
  const isZero = (v, eps = 1e-9) => Math.abs(v[0]) < eps && Math.abs(v[1]) < eps;
  const balancing = (...vs) => neg(add(...vs));                          // 평형시키는 힘 = −(나머지 힘의 합)
  const numSum = (...vs) => vs.reduce((s, v) => s + mag(v), 0);           // 크기만 숫자로 더한 값 (합력이 아니다)
  // 크기 a, b 인 두 힘 사이 각이 phi 일 때 합력의 크기 (같은 방향 a + b, 반대 방향 |a − b|)
  const resultant = (a, b, phi) => Math.sqrt(Math.max(0, a * a + b * b + 2 * a * b * cosD(phi)));
  // 두 벡터 사이 각 (0~180°)
  function angleBetween(u, v) {
    const m = mag(u) * mag(v);
    if (m < 1e-12) return NaN;
    return Math.acos(Math.max(-1, Math.min(1, (u[0] * v[0] + u[1] * v[1]) / m))) / RAD;
  }

  // ── 두 실에 매단 물체 (질점의 평형: x 성분 합 0, y 성분 합 0) ──
  // 가로: T₁ sin a1 = T₂ sin a2,  세로: T₁ cos a1 + T₂ cos a2 = mg
  function hang(m, a1, a2, g = G) {
    const W = m * g, s = sinD(a1 + a2);
    const T1 = W * sinD(a2) / s, T2 = W * sinD(a1) / s;
    const T1v = [-T1 * sinD(a1), T1 * cosD(a1)], T2v = [T2 * sinD(a2), T2 * cosD(a2)], Wv = [0, -W];
    return {W, T1, T2, T1v, T2v, Wv, hx: T1 * sinD(a1), sum: add(T1v, T2v), net: add(T1v, T2v, Wv)};
  }
  // 두 실이 직각 (a2 = 90° − a1): 세 힘이 빗변 mg 인 직각삼각형 → T₁ = mg cos a1, T₂ = mg sin a1
  const hangRight = (m, a1, g = G) => hang(m, a1, 90 - a1, g);

  // ── 빗면 (경사각 th, 마찰 없음) ─────────────────────────
  // 중력의 빗면 방향 성분 mg sin th (빗면 아래로), 빗면 수직 성분 mg cos th (빗면을 누름) → N = mg cos th
  function incline(m, th, g = G) { const W = m * g; return {W, along: W * sinD(th), perp: W * cosD(th), N: W * cosD(th), net: W * sinD(th)}; }
  // 수평력 F 로 정지: mg(연직), F(수평), N(빗면 수직)이 닫힌 직각삼각형 (N 이 빗변) → F = mg tan th, N = mg / cos th
  function inclineHeld(m, th, g = G) {
    const W = m * g, F = W * tanD(th), N = W / cosD(th);
    return {W, F, N, Wv: [0, -W], Fv: [F, 0], Nv: [-N * sinD(th), N * cosD(th)]};   // 빗면은 오른쪽으로 올라간다
  }

  const api = {G, RAD, sinD, cosD, tanD, vec, add, neg, sub, mag, dirDeg, isZero, balancing, numSum, resultant, angleBetween,
    hang, hangRight, incline, inclineHeld};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.A1_01 = api;
})(typeof window !== 'undefined' ? window : globalThis);
