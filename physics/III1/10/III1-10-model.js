/* III1-10 중첩 원리와 마주 진행하는 두 파동 — 계산 모형. 브라우저(window.III1_10)와 Node 테스트(tests/III1-10-model.test.cjs)에서 같이 쓴다.
   단위: 위치 cm, 시간 s, 변위 cm.
   펄스 p = {h 높이(+ 마루, − 골), x0 처음 중심, v 속력, dir +1(→)/−1(←), w 폭}
   사인파 s = {A 진폭, lambda 파장, xc 마디 하나의 위치}, 시간은 주기 단위 τ = t/T */
(function (root) {
  'use strict';
  const TAU = 2 * Math.PI;

  /* ── 펄스의 중첩 ─────────────────────────────────────── */
  // 펄스 모양: 폭 w 안에서 매끄럽게 솟은 혹(꼭대기 1), 폭 밖은 0
  const shape = (u, w) => (Math.abs(u) < w / 2 ? Math.cos(Math.PI * u / w) ** 2 : 0);
  // t 초 뒤 중심: 처음 중심에서 진행 방향으로 v t 만큼 (다른 펄스와 상관없이 — 독립성)
  const center = (p, t) => p.x0 + p.dir * p.v * t;
  const pulseY = (x, t, p) => p.h * shape(x - center(p, t), p.w);
  // 중첩 원리: 같은 위치의 변위를 대수적으로 더한다
  const sumY = (x, t, ps) => ps.reduce((s, p) => s + pulseY(x, t, p), 0);
  // 마주 보고 다가가는 속력 = v1 + v2 → 중심이 만나는 시각
  const meetTime = (d, v1, v2) => d / (v1 + v2);

  // 줄 위 [x0, x1] 에서 합성파의 가장 높은 곳·가장 낮은 곳·크기가 가장 큰 변위(부호 포함)
  function extremes(t, ps, x0, x1, n = 2400) {
    let max = 0, min = 0, xMax = x0, xMin = x0;
    for (let i = 0; i <= n; i++) {
      const x = x0 + (x1 - x0) * i / n, y = sumY(x, t, ps);
      if (y > max) { max = y; xMax = x; }
      if (y < min) { min = y; xMin = x; }
    }
    const big = Math.abs(min) > Math.abs(max) + 1e-12 ? {y: min, x: xMin} : {y: max, x: xMax};
    return {max, min, xMax, xMin, big};
  }
  // 펄스가 점 xP 를 덮고 있는 시간 [도착, 떠남]
  function visit(xP, p) {
    const a = (xP - p.w / 2 - p.x0) / (p.dir * p.v), b = (xP + p.w / 2 - p.x0) / (p.dir * p.v);
    return [Math.min(a, b), Math.max(a, b)];
  }
  // 두 시간 구간이 겹치는 부분 (한 순간만 맞닿거나 안 겹치면 null)
  function common(i1, i2) {
    const a = Math.max(i1[0], i2[0]), b = Math.min(i1[1], i2[1]);
    return b - a > 1e-9 ? [a, b] : null;
  }
  // 마주 오는 두 펄스(같은 폭)의 관계: approach 다가오는 중 · overlap 겹치는 중 · full 완전히 겹침 · apart 지나간 뒤
  function relation(t, pA, pB) {
    const gap = (center(pB, t) - center(pA, t)) * pA.dir;      // A 진행 방향으로 잰 B 중심까지 거리
    const w = (pA.w + pB.w) / 2;
    if (Math.abs(gap) < 1e-6) return 'full';
    if (gap >= w) return 'approach';
    if (gap <= -w) return 'apart';
    return 'overlap';
  }

  /* ── 마주 진행하는 두 사인파 → 정상파 ───────────────── */
  const kk = (s) => TAU / s.lambda;
  const waveR = (x, tau, s) => s.A * Math.sin(kk(s) * (x - s.xc) - TAU * tau);   // → 로 진행
  const waveL = (x, tau, s) => s.A * Math.sin(kk(s) * (x - s.xc) + TAU * tau);   // ← 로 진행
  // 합 = 2A sin k(x − xc) · cos 2πτ : 모양은 제자리, 크기만 오르내린다
  const standing = (x, tau, s) => waveR(x, tau, s) + waveL(x, tau, s);
  const ampAt = (x, s) => 2 * s.A * Math.abs(Math.sin(kk(s) * (x - s.xc)));       // 그 점의 진폭
  function nodes(s, x0, x1) {                                    // 마디: xc + m·λ/2
    const out = [], h = s.lambda / 2;
    for (let m = Math.ceil((x0 - s.xc) / h - 1e-9); s.xc + m * h <= x1 + 1e-9; m++) out.push(s.xc + m * h);
    return out;
  }
  function antinodes(s, x0, x1) {                                // 배: 이웃한 두 마디의 한가운데
    const out = [], h = s.lambda / 2, b = s.xc + s.lambda / 4;
    for (let m = Math.ceil((x0 - b) / h - 1e-9); b + m * h <= x1 + 1e-9; m++) out.push(b + m * h);
    return out;
  }
  // 점의 종류: node 마디 · antinode 배 · between 그 사이
  function kind(x, s, tol = 0.02) {
    const r = ampAt(x, s) / (2 * s.A);
    return r < tol ? 'node' : (r > 1 - tol ? 'antinode' : 'between');
  }

  const api = {TAU, shape, center, pulseY, sumY, meetTime, extremes, visit, common, relation,
    waveR, waveL, standing, ampAt, nodes, antinodes, kind};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.III1_10 = api;
})(typeof window !== 'undefined' ? window : globalThis);
