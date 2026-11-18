/* A2-01 일의 정의와 F-s 그래프 — 계산 모형. 브라우저(window.A2_01)와 Node 테스트(tests/A2-01-model.test.cjs)에서 같이 쓴다.
   SI 단위(N, m, J), 각은 도(°). 중력 가속도 g = 10 m/s² (원고 값).
   θ 는 힘과 이동 방향 사이 각이다. 힘–위치 그래프는 구간 {s0, s1, F0, F1} 의 목록으로 나타낸다(구간 안에서 F 는 F0 → F1 직선). */
(function (root) {
  'use strict';
  const G = 10;
  const RAD = Math.PI / 180;
  const tiny = (v) => (Math.abs(v) < 1e-12 ? 0 : v);           // cos 90° 같은 부동소수 찌꺼기를 0 으로
  const cosD = (d) => tiny(Math.cos(d * RAD));
  const sinD = (d) => tiny(Math.sin(d * RAD));

  // ── 일정한 힘: W = Fs cosθ ─────────────────────────────
  const work = (F, s, th) => F * s * cosD(th);
  const along = (F, th) => F * cosD(th);          // 이동 방향 성분 F cosθ: 일을 하는 성분
  const perp = (F, th) => F * sinD(th);           // 이동에 수직인 성분 F sinθ: 일 0
  const sign = (th) => { const c = cosD(th); return c > 0 ? 1 : c < 0 ? -1 : 0; };   // 일의 부호
  const kind = (th) => (sign(th) > 0 ? '양(+)의 일' : sign(th) < 0 ? '음(−)의 일' : '일 0');
  const dot = (ax, ay, bx, by) => tiny(ax * bx + ay * by);   // 힘·변위의 스칼라곱 (같은 뜻: F s cosθ)

  // ── 변하는 힘: F–s 그래프 아래 넓이 ────────────────────
  const seg = (s0, s1, F0, F1) => ({s0, s1, F0, F1});
  const lerp = (g, s) => g.F0 + (g.F1 - g.F0) * (s - g.s0) / (g.s1 - g.s0);
  // 위치 s 에서의 힘. 구간 경계(힘이 뛰는 곳)에서는 다음 구간 값
  function forceAt(segs, s) {
    for (let i = 0; i < segs.length; i++) {
      const g = segs[i];
      if (s < g.s1 || i === segs.length - 1) return lerp(g, Math.max(g.s0, Math.min(g.s1, s)));
    }
    return 0;
  }
  // 처음부터 s 까지 넓이(음의 넓이는 빼기) = 이 힘이 한 일
  function areaTo(segs, s) {
    let W = 0;
    for (const g of segs) {
      if (s <= g.s0) break;
      const b = Math.min(s, g.s1);
      W += (g.F0 + lerp(g, b)) / 2 * (b - g.s0);
    }
    return W;
  }
  // 양의 넓이·음의 넓이(둘 다 크기) — 그래프가 가로축을 지나는 구간은 0 인 곳에서 나눈다
  function parts(segs, s = Infinity) {
    let pos = 0, neg = 0;
    for (const g of segs) {
      if (s <= g.s0) break;
      const b = Math.min(s, g.s1), f0 = g.F0, f1 = lerp(g, b), w = b - g.s0;
      if (f0 >= 0 && f1 >= 0) pos += (f0 + f1) / 2 * w;
      else if (f0 <= 0 && f1 <= 0) neg -= (f0 + f1) / 2 * w;
      else {
        const z = w * f0 / (f0 - f1);              // 처음 끝에서 0 이 되는 곳까지
        if (f0 > 0) { pos += f0 * z / 2; neg -= f1 * (w - z) / 2; } else { neg -= f0 * z / 2; pos += f1 * (w - z) / 2; }
      }
    }
    return {pos, neg, net: pos - neg};
  }
  // 개념서 예제: 0~2 m F₁(10 N), 2~4 m F₁ → 0 일정하게 감소, 4~6 m F₃(−5 N)
  const exampleSegs = (F1 = 10, F3 = -5) => [seg(0, 2, F1, F1), seg(2, 4, F1, 0), seg(4, 6, F3, F3)];
  // 예제를 도형으로 나눈 넓이: 직사각형 · 삼각형 · (음의) 직사각형
  const examplePieces = (F1 = 10, F3 = -5) => [
    {from: 0, to: 2, shape: '직사각형', W: F1 * 2},
    {from: 2, to: 4, shape: '삼각형', W: F1 * 2 / 2},
    {from: 4, to: 6, shape: '직사각형', W: F3 * 2},
  ];
  // 띠로 쪼개 더하기: 폭 Δs 인 띠의 높이 = 띠 왼쪽 끝의 힘. Δs → 0 이면 넓이에 다가간다
  function riemann(segs, a, b, ds) {
    const n = Math.max(1, Math.round((b - a) / ds)), w = (b - a) / n, strips = [];
    let sum = 0;
    for (let i = 0; i < n; i++) { const s = Math.round((a + i * w) * 1e9) / 1e9, F = forceAt(segs, s); strips.push({s, w, F}); sum += F * w; }
    return {sum, strips, n};
  }

  // ── 용수철: F = kx (직선) → 넓이 ½kx² ──────────────────
  const springForce = (k, x) => k * x;
  const elasticPE = (k, x) => k * x * x / 2;                          // 삼각형 넓이 = 탄성 퍼텐셜 에너지
  const springWork = (k, x1, x2) => elasticPE(k, x2) - elasticPE(k, x1);   // x₁ → x₂ 천천히 늘인 외력의 일 = 사다리꼴 넓이
  const springSegs = (k, x1, x2) => [seg(x1, x2, k * x1, k * x2)];

  // ── 거친 빗면을 올라갔다 되돌아오는 상자 ────────────────
  // 질량 m, 빗면 sin·cos (37° 면 0.6·0.8), 마찰력 크기 f(늘 운동 반대), 빗면을 따라 d 만큼 올라갔다 내려온다.
  // 이동 거리 L: 0 ~ d 올라감, d ~ 2d 내려옴. 중력은 방향이 고정된 힘, 마찰력은 늘 운동 반대, 수직항력은 늘 90°.
  function slopeTrip(m, sn, cs, f, d, g = G) {
    const h = d * sn, aUp = g * sn + f / m, aDn = g * sn - f / m;
    const v0 = Math.sqrt(2 * aUp * d), v1 = aDn > 0 ? Math.sqrt(2 * aDn * d) : 0;
    return {h, aUp, aDn, v0, v1, tUp: v0 / aUp, tDn: aDn > 0 ? Math.sqrt(2 * d / aDn) : Infinity,
      up: {g: -m * g * h, N: 0, f: -f * d}, down: {g: m * g * h, N: 0, f: -f * d},
      K0: m * v0 * v0 / 2, K1: m * v1 * v1 / 2, N: m * g * cs};
  }
  function tripWorks(m, sn, f, d, L, g = G) {           // 이동 거리 L 까지 힘마다 한 일
    const up = Math.max(0, Math.min(L, d)), dn = Math.max(0, Math.min(L - d, d));
    return {g: -m * g * sn * up + m * g * sn * dn, N: 0, f: -f * (up + dn)};
  }
  // 힘과 이동 방향 사이 각 (빗면 경사각 a°): 올라갈 때 중력은 90° + a, 내려올 때 90° − a
  const tripAngles = (a) => ({up: {g: 90 + a, N: 90, f: 180}, down: {g: 90 - a, N: 90, f: 180}});
  // 시각 t 의 이동 거리 (올라가며 느려지고, 꼭대기에서 멈췄다가 내려오며 빨라진다)
  function tripAt(T, t) {
    const d = T.v0 * T.tUp / 2;
    if (t <= T.tUp) return {L: T.v0 * t - T.aUp * t * t / 2, v: T.v0 - T.aUp * t, dir: 1};
    const u = Math.min(t - T.tUp, T.tDn);
    return {L: d + T.aDn * u * u / 2, v: T.aDn * u, dir: -1};
  }
  function tripTime(T, L) {                             // 이동 거리 L 에 이르는 시각
    const d = T.v0 * T.tUp / 2;
    if (L <= d) return (T.v0 - Math.sqrt(Math.max(0, T.v0 * T.v0 - 2 * T.aUp * L))) / T.aUp;
    return T.tUp + Math.sqrt(2 * Math.min(L - d, d) / T.aDn);
  }

  // ── 상자의 실제 운동 (변하는 힘 · 비스듬한 힘 장면) ─────
  // 마찰 없는 바닥에서 질량 m, 처음 속력 v0 으로 움직이던 상자가 이동 방향 성분이 segs(F–s 그래프)인 힘 하나만 받는다.
  // 수직항력·중력(과 힘의 수직 성분)은 이동과 수직이라 속력을 바꾸지 않으므로, 위치 s 에서 운동 에너지는
  // K(s) = ½mv0² + (0~s 넓이) 이고 속력은 v(s) = √(2K/m). 시각은 t(s) = ∫ ds / v (멈추지 않는 범위, 늘 K > 0 에서 쓴다).
  const kinAt = (segs, m, v0, s) => m * v0 * v0 / 2 + areaTo(segs, s);
  const speedAt = (segs, m, v0, s) => { const K = kinAt(segs, m, v0, s); return K > 0 ? Math.sqrt(2 * K / m) : 0; };
  function minKin(segs, m, v0, sEnd, n = 600) {         // 0 ~ sEnd 에서 가장 작은 운동 에너지 (0 보다 커야 끝까지 간다)
    let k = Infinity;
    for (let i = 0; i <= n; i++) k = Math.min(k, kinAt(segs, m, v0, i * sEnd / n));
    return k;
  }
  function motion(segs, m, v0, sEnd, n = 600) {          // 위치 → 시각 표 (1/v 를 사다리꼴로 더한다)
    const ds = sEnd / n, ts = [0];
    let prev = 1 / Math.max(1e-9, speedAt(segs, m, v0, 0));
    for (let i = 1; i <= n; i++) {
      const inv = 1 / Math.max(1e-9, speedAt(segs, m, v0, i * ds));
      ts.push(ts[i - 1] + ds * (prev + inv) / 2); prev = inv;
    }
    return {m, v0, sEnd, n, ds, ts, T: ts[n]};
  }
  function posAt(mo, t) {                                // 시각 t 의 위치
    if (t <= 0) return 0;
    if (t >= mo.T) return mo.sEnd;
    let lo = 0, hi = mo.n;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (mo.ts[mid] <= t) lo = mid; else hi = mid; }
    return (lo + (t - mo.ts[lo]) / (mo.ts[hi] - mo.ts[lo])) * mo.ds;
  }
  function timeAt(mo, s) {                               // 위치 s 에 이르는 시각
    if (s <= 0) return 0;
    if (s >= mo.sEnd) return mo.T;
    const x = s / mo.ds, i = Math.min(mo.n - 1, Math.floor(x));
    return mo.ts[i] + (x - i) * (mo.ts[i + 1] - mo.ts[i]);
  }

  // ── 그 밖 ───────────────────────────────────────────────
  const gravityWork = (m, drop, g = G) => m * g * drop;    // 내려간 높이 × mg (경로 무관, = −ΔEp)
  const power = (F, v) => F * v;                           // (교과 심화) 일정한 속력으로 끌 때 P = Fv

  const api = {G, RAD, cosD, sinD, work, along, perp, sign, kind, dot, seg, forceAt, areaTo, parts, exampleSegs, examplePieces,
    riemann, springForce, elasticPE, springWork, springSegs, slopeTrip, tripWorks, tripAngles, tripAt, tripTime,
    kinAt, speedAt, minKin, motion, posAt, timeAt, gravityWork, power};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.A2_01 = api;
})(typeof window !== 'undefined' ? window : globalThis);
