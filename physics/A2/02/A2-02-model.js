/* A2-02 일·운동 에너지 정리 — 계산 모형. 브라우저(window.A2_02)와 Node 테스트(tests/A2-02-model.test.cjs)에서 같이 쓴다.
   SI 단위(kg, m, s, N, J). 중력 가속도 g = 10 m/s² (원고 값).
   수평면 장면 p = {m, v0, F, f, sF}: 운동 방향으로 미는 힘 F 는 0 ~ sF 구간에서만, 마찰력 f 는 늘 운동 반대, 수직항력·중력은 이동에 수직. */
(function (root) {
  'use strict';
  const G = 10;
  const kinetic = (m, v) => m * v * v / 2;
  const speedOf = (m, K) => Math.sqrt(Math.max(0, 2 * K / m));

  // ── 일 장부: 힘마다 한 일을 부호 붙여 더한 합 = ΔK ─────────
  // x = 처음 자리에서 지금까지 간 거리 (멈춘 뒤로는 늘지 않는다)
  function ledger(p, x) {
    const WF = p.F * Math.min(x, p.sF), Wf = -p.f * x, sum = WF + Wf;
    const K0 = kinetic(p.m, p.v0), K = K0 + sum;
    return {WF, Wf, WN: 0, Wg: 0, sum, K0, K, dK: sum, v: speedOf(p.m, K)};
  }
  // 운동 에너지가 0 이 되어 멈추는 거리 (멈추지 않으면 Infinity). 힘이 작용하는 동안과 그 뒤를 나눠 본다
  function stopAt(p) {
    const K0 = kinetic(p.m, p.v0);
    if (K0 <= 1e-12 && p.F <= p.f) return 0;                       // 처음에 멈춰 있고 미는 힘이 마찰력을 못 넘음
    if (p.F < p.f) { const x = K0 / (p.f - p.F); if (x <= p.sF) return x; }
    if (p.f <= 0) return Infinity;
    return Math.max(p.sF, (K0 + p.F * p.sF) / p.f);                // 미는 힘이 끝난 뒤 마찰력만으로 멈춤
  }
  const accel = (p, x) => ((x < p.sF ? p.F : 0) - p.f) / p.m;       // 움직이는 동안의 가속도 (알짜힘 / m)
  const netForce = (p, x) => (x < p.sF ? p.F : 0) - p.f;
  // 처음 x 만큼 가는 동안 걸린 시간 (구간마다 등가속도). 멈추면 멈춘 시각에서 더 늘지 않는다
  function timeTo(p, x) {
    const piece = (v0, a, dx) => (Math.abs(a) < 1e-12 ? dx / v0 : (-v0 + Math.sqrt(Math.max(0, v0 * v0 + 2 * a * dx))) / a);
    const xs = Math.min(x, stopAt(p));
    const x1 = Math.min(xs, p.sF), a1 = accel(p, 0);
    let t = x1 > 0 ? piece(p.v0, a1, x1) : 0;
    if (xs > p.sF) { const v1 = ledger(p, p.sF).v; t += piece(v1, -p.f / p.m, xs - p.sF); }
    return t;
  }

  // 시각 t 의 위치와 속도 (구간마다 등가속도, 멈추면 그 자리). timeTo 의 거꿀
  function posAt(p, t) {
    const xs = stopAt(p), a1 = accel(p, 0);
    const go = (x0, v0, a, tt, xmax) => {               // 등가속도로 tt 동안 (멈추면 그 자리)
      const tStop = a < 0 ? v0 / -a : Infinity, u = Math.min(tt, tStop);
      return {x: Math.min(xmax, x0 + v0 * u + a * u * u / 2), v: Math.max(0, v0 + a * u)};
    };
    if (p.sF > 0) {
      const t1 = timeTo(p, Math.min(p.sF, xs));
      if (t <= t1 || xs <= p.sF) { const r = go(0, p.v0, a1, Math.min(t, t1), Math.min(p.sF, xs)); return r.x >= xs - 1e-12 ? {x: xs, v: 0} : r; }
      const v1 = ledger(p, p.sF).v, r = go(p.sF, v1, -p.f / p.m, t - t1, xs);
      return r.x >= xs - 1e-12 ? {x: xs, v: 0} : r;
    }
    const r = go(0, p.v0, -p.f / p.m, t, xs);
    return r.x >= xs - 1e-12 ? {x: xs, v: 0} : r;
  }

  // ── 같은 높이, 길이가 다른 마찰 없는 빗면 ──────────────────
  // 알짜힘 = mg sinθ = mgh/L → 알짜힘 × 길이 = mgh (같다). 바닥 속력 √(2gh), 걸린 시간 = 길이/평균 속력 ∝ L
  function ramp(m, h, L, g = G) {
    const sn = h / L, Fnet = m * g * sn, a = g * sn, v = Math.sqrt(2 * g * h), t = Math.sqrt(2 * L / a);
    return {sn, Fnet, a, v, t, W: Fnet * L};
  }

  // ── 2차원: 알짜힘(중력)에 수직인 속도 성분은 그대로 ────────
  // 수평으로 v0x, 연직 위로 v0y 로 던진 물체(중력만): t 초 뒤의 속도·내려간 높이·운동 에너지
  function throwAt(m, v0x, v0y, t, g = G) {
    const vx = v0x, vy = v0y - g * t, drop = -(v0y * t - g * t * t / 2);
    return {vx, vy, drop, K: kinetic(m, Math.hypot(vx, vy)), K0: kinetic(m, Math.hypot(v0x, v0y)), Wg: m * g * drop};
  }

  // 합의 부호 → 속력 변화
  const verdict = (sum) => (sum > 1e-9 ? '빨라진다' : sum < -1e-9 ? '느려진다' : '처음과 같은 속력');

  const api = {G, kinetic, speedOf, ledger, stopAt, accel, netForce, timeTo, posAt, ramp, throwAt, verdict};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.A2_02 = api;
})(typeof window !== 'undefined' ? window : globalThis);
