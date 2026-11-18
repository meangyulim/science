/* A1-03 무게중심과 구조물의 안정성 — 계산 모형. 브라우저(window.A1_03)와 Node 테스트(tests/A1-03-model.test.cjs)에서 같이 쓴다.
   각도는 도(°). 위치는 [x, y] (오른쪽 +x, 위쪽 +y). 중력 가속도 g = 10 m/s² (원고 값). */
(function (root) {
  'use strict';
  const G = 10;
  const RAD = Math.PI / 180;
  const sinD = (d) => Math.sin(d * RAD);
  const cosD = (d) => Math.cos(d * RAD);

  // ── 무게중심 = 질량으로 가중 평균한 위치 ─────────────────
  const cm1 = (items) => items.reduce((s, it) => s + it.m * it.x, 0) / items.reduce((s, it) => s + it.m, 0);   // items = [{m, x}]
  const cm2 = (items) => { const M = items.reduce((s, it) => s + it.m, 0); return [items.reduce((s, it) => s + it.m * it.x, 0) / M, items.reduce((s, it) => s + it.m * it.y, 0) / M]; };
  // 균일한 막대 (길이 L, 질량 m, 자기 무게중심 L/2) + 작은 물체 (질량 M, 위치 p): 왼쪽 끝에서 x_cm
  const rodCm = (L, m, M, p = L) => cm1([{m, x: L / 2}, {m: M, x: p}]);
  // 받침점 xf 에 놓으면 무게중심 쪽으로 기운다: +1 오른쪽(시계 방향), −1 왼쪽, 0 균형
  const tipSide = (xcm, xf, eps = 1e-9) => (xcm > xf + eps ? 1 : xcm < xf - eps ? -1 : 0);
  // 균일한 판 (다각형)의 무게중심 = 넓이 중심
  function polyCentroid(pts) {
    let A = 0, cx = 0, cy = 0;
    for (let i = 0; i < pts.length; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length], c = x0 * y1 - x1 * y0;
      A += c; cx += (x0 + x1) * c; cy += (y0 + y1) * c;
    }
    A /= 2;
    return [cx / (6 * A), cy / (6 * A)];
  }
  // 판 위의 점 P 에 매달면, 판을 rad 만큼 (시계 반대 +) 돌린 자세에서 멈춘다: P → G 가 연직 아래를 향한다
  function hangAngle(P, Gc) {
    const d = [Gc[0] - P[0], Gc[1] - P[1]];
    return -Math.PI / 2 - Math.atan2(d[1], d[0]);
  }
  const rotate = (v, a) => [v[0] * Math.cos(a) - v[1] * Math.sin(a), v[0] * Math.sin(a) + v[1] * Math.cos(a)];
  // 두 직선 (점 P, 방향 d) 의 교점
  function intersect(P1, d1, P2, d2) {
    const den = d1[0] * d2[1] - d1[1] * d2[0];
    if (Math.abs(den) < 1e-12) return null;
    const t = ((P2[0] - P1[0]) * d2[1] - (P2[1] - P1[1]) * d2[0]) / den;
    return [P1[0] + d1[0] * t, P1[1] + d1[1] * t];
  }

  // ── 바닥 위 상자 (폭 b, 무게중심 높이 hc) 를 한 모서리로 θ 기울일 때 ──
  // 무게중심의 연직선과 축(모서리) 사이 수평 거리. + 면 받침면 쪽(복원), − 면 바깥(넘어짐)
  const lever = (b, hc, th) => (b / 2) * cosD(th) - hc * sinD(th);
  // 넘어지기 시작하는 각: tan θc = (b/2) / hc  (질량과 무관)
  const tipAngle = (b, hc) => Math.atan2(b / 2, hc) / RAD;
  function verdict(b, hc, th, eps = 1e-9) { const l = lever(b, hc, th); return l > eps ? 'restore' : l < -eps ? 'tip' : 'edge'; }
  // 기울기 θ 에서 무게중심의 높이 (축 기준): 기울일수록 올라가다 θc 에서 가장 높다
  const cmHeight = (b, hc, th) => hc * cosD(th) + (b / 2) * sinD(th);
  // 모서리를 축으로 한 회전: θ'' = −m g · lever / I,  I = m(b² + h²)/3 (균일한 직육면체, h = 2hc) → 질량이 약분된다
  const tipAccel = (b, hc, th, g = G) => -3 * g * lever(b, hc, th) / (b * b + 4 * hc * hc);   // rad/s²

  // ── 벽에 기댄 막대 (벽 마찰 없음): 길이 L, 질량 m, 바닥과 각 α ──
  // 수평: f = N₁, 연직: N₂ = mg, 바닥 접촉점 축: N₁ L sinα = mg (L/2) cosα
  function ladder(m, alpha, g = G) { const W = m * g, N1 = W / (2 * Math.tan(alpha * RAD)); return {N1, N2: W, f: N1}; }

  const api = {G, RAD, sinD, cosD, cm1, cm2, rodCm, tipSide, polyCentroid, hangAngle, rotate, intersect, lever, tipAngle, verdict, cmHeight, tipAccel, ladder};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.A1_03 = api;
})(typeof window !== 'undefined' ? window : globalThis);
