/* A2-03 보존력·비보존력과 역학적 에너지 변화 — 계산 모형. 브라우저(window.A2_03)와 Node 테스트(tests/A2-03-model.test.cjs)에서 같이 쓴다.
   SI 단위(kg, m, s, N, J). 중력 가속도 g = 10 m/s² (원고 값). 높이 y 는 위 +, 퍼텐셜 에너지 기준은 y = 0.
   핵심: W_보존 = −ΔU 를 일·운동 에너지 정리에 넣으면 W_비보존 = ΔK + ΔU = ΔE (역학적 에너지 변화). */
(function (root) {
  'use strict';
  const G = 10;
  const RAD = Math.PI / 180;
  const kinetic = (m, v) => m * v * v / 2;
  const speedOf = (m, K) => Math.sqrt(Math.max(0, 2 * K / m));

  // ── 경로를 따라 한 일 (꺾은선 경로, 점은 [x, y]) ─────────
  const lengthOf = (pts) => { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return L; };
  // 일정한 힘 벡터(중력 (0, −mg))가 한 일 Σ F·Δr — 더하면 높이차만 남는다
  function workAlong(F, pts) {
    let W = 0;
    for (let i = 1; i < pts.length; i++) W += F[0] * (pts[i][0] - pts[i - 1][0]) + F[1] * (pts[i][1] - pts[i - 1][1]);
    return W;
  }
  const gravityWork = (m, pts, g = G) => workAlong([0, -m * g], pts);
  const frictionWork = (f, pts) => -f * lengthOf(pts);       // 크기 f, 늘 운동 반대 → −f × 경로 길이

  // ── 그림 ①(가): A(0, hA) → B(xB, 0) 로 가는 세 경로 ──────
  // 1: 수직으로 내려간 뒤 옆으로(모서리는 반지름 r 로 둥글게), 2: 빗면(직선), 3: 곡선(dip > 0 이면 B 보다 낮은 곳을 지나 올라온다)
  function pathPoints(kind, o = {}) {
    const hA = o.hA ?? 5, xB = o.xB ?? 6, r = o.r ?? 0.7, dip = o.dip ?? 0, n = o.n ?? 120, pts = [];
    if (kind === 1) {
      const nv = Math.ceil(n * 0.3), na = Math.ceil(n * 0.2), nh = n - nv - na;
      for (let i = 0; i <= nv; i++) pts.push([0, hA - (hA - r) * i / nv]);
      for (let i = 1; i <= na; i++) { const a = Math.PI + Math.PI / 2 * i / na; pts.push([r + r * Math.cos(a), r + r * Math.sin(a)]); }
      for (let i = 1; i <= nh; i++) pts.push([r + (xB - r) * i / nh, 0]);
    } else if (kind === 2) {
      for (let i = 0; i <= n; i++) pts.push([xB * i / n, hA * (1 - i / n)]);
    } else {                                                   // 3차 베지에: A → B, 처짐 dip
      const P = [[0, hA], [0.45 * xB / 6, 0.3 * hA - 2.1 * dip], [0.5 * xB, -1.9 * dip], [xB, 0]];
      for (let i = 0; i <= n; i++) {
        const t = i / n, u = 1 - t;
        pts.push([0, 1].map((k) => u * u * u * P[0][k] + 3 * u * u * t * P[1][k] + 3 * u * t * t * P[2][k] + t * t * t * P[3][k]));
      }
    }
    return pts;
  }
  // 경로 위 이동 거리 s 인 점과 그때까지 중력이 한 일
  function along(pts, s, m = 1, g = G) {
    let acc = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (acc + l >= s || i === pts.length - 1) {
        const u = l > 0 ? Math.max(0, Math.min(1, (s - acc) / l)) : 0, P = [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
        return {x: P[0], y: P[1], tx: l ? (b[0] - a[0]) / l : 1, ty: l ? (b[1] - a[1]) / l : 0, Wg: m * g * (pts[0][1] - P[1])};
      }
      acc += l;
    }
    return null;
  }
  const minY = (pts) => Math.min(...pts.map((p) => p[1]));

  // ── 그림 ②: 빗면(경사각 θ, 높이 h → 바닥)을 내려오는 물체, 처음 속력 v0, 마찰력 크기 f ──
  function slide(m, th, h, v0, f, g = G) {
    const sn = Math.sin(th * RAD), L = h / sn, fEven = m * g * sn, a = g * sn - f / m;
    const stop = a < -1e-12 ? v0 * v0 / (2 * -a) : Infinity;   // 느려지면 멈추는 거리
    return {L, sn, fEven, a, xEnd: Math.min(L, stop), stops: stop < L};
  }
  // 빗면을 따라 x 만큼 내려왔을 때의 장부. 일 장부(W_중력 + W_마찰 = ΔK)와 에너지 장부(W_마찰 = ΔK + ΔU)
  function slideAt(m, th, h, v0, f, x, g = G) {
    const s = slide(m, th, h, v0, f, g), xx = Math.max(0, Math.min(x, s.xEnd)), y = h - xx * s.sn;
    const K0 = kinetic(m, v0), U0 = m * g * h, Wg = m * g * (h - y), Wf = -f * xx, K = K0 + Wg + Wf, U = m * g * y;
    return {x: xx, y, K0, U0, E0: K0 + U0, K, U, E: K + U, Q: -Wf, Wg, Wf, dK: K - K0, dU: U - U0, dE: K + U - K0 - U0, v: speedOf(m, K)};
  }

  // ── 그림 ②(다): 외력(손)으로 높이 h 만큼 끌어올림, 속력 v0 → v1 (등가속도) ──
  function lift(m, h, v0, v1, g = G) {
    const a = (v1 * v1 - v0 * v0) / (2 * h), F = m * (g + a), W = F * h;
    const dU = m * g * h, dK = kinetic(m, v1) - kinetic(m, v0), Wg = -m * g * h;
    return {a, F, W, dU, dK, Wg, double: dK + dU - Wg};          // double: 중력을 일과 ΔU 로 두 번 넣은 (틀린) 값
  }
  function liftAt(m, h, v0, v1, t, g = G) {                     // 시각 t 의 높이·속력
    const L = lift(m, h, v0, v1, g), T = liftTime(h, v0, v1);
    const tt = Math.max(0, Math.min(t, T)), y = v0 * tt + L.a * tt * tt / 2, v = v0 + L.a * tt;
    return {t: tt, y: Math.min(h, y), v, WF: L.F * Math.min(h, y), Wg: -m * g * Math.min(h, y), K: kinetic(m, v), U: m * g * Math.min(h, y)};
  }
  const liftTime = (h, v0, v1) => (v0 + v1 > 1e-9 ? 2 * h / (v0 + v1) : Infinity);

  // ── 그림 ①(나): 바닥(위에서 본) 위 A → B, 곧은 길 d 와 돌아가는 길 d + 2w ──
  const routes = (d, w) => ({short: d, long: d + 2 * w});

  // 판정: 이 상황에서 역학적 에너지는?
  const verdict = (dE) => (dE > 1e-9 ? '증가' : dE < -1e-9 ? '감소' : '보존');

  const api = {G, RAD, kinetic, speedOf, lengthOf, workAlong, gravityWork, frictionWork, pathPoints, along, minY,
    slide, slideAt, lift, liftAt, liftTime, routes, verdict};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.A2_03 = api;
})(typeof window !== 'undefined' ? window : globalThis);
