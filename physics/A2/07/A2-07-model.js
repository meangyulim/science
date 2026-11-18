/* A2-07 일-에너지와 운동학·포물선의 결합 — 계산 모형. 브라우저(window.A2_07)와 Node 테스트(tests/A2-07-model.test.cjs)에서 같이 쓴다.
   SI 단위, g = 10 m/s² (원고 값). 높이는 바닥을 0 으로 잰다.
   장면 1 (빗면 → 포물선): 경사각 α(sinα = 0.8, cosα = 0.6)인 빗면(길이 10 m, 높이 8 m)의 가운데 5 m(빗면을 따라 2.5 ~ 7.5 m)만
     마찰 구간(마찰력 f), 꼭대기는 매끄럽게 이어진 평평한 면(1 m, 마찰 없음)이고 그 끝 q(x = 7 m, 높이 8 m)에서 수평으로 이탈한다.
     착지면은 x = 12.6 m에서 시작해 오른쪽으로 올라가는 경사면(tanφ) 또는 바닥.
     기본값(1 kg, 처음 속력 16 m/s, f = 6 N, tanφ = 1/2): 빗면 장부 128 J = 80 J(높이) + 30 J(마찰) + 18 J → 이탈 속력 6 m/s,
     1.2 s 뒤 경사면에 수직으로 떨어진다 → 포물선 동안 중력이 한 일 72 J (개념서 예제).
   장면 2 (진자 → 끊김): 길이 l 인 실을 연직선과 θ₀ 에서 놓아 최저점(바닥에서 H)에서 실이 끊긴다 → 수평 투사. */
(function (root) {
  'use strict';
  const G = 10;
  const RAMP = {sin: 0.8, cos: 0.6, L: 10, H: 8, b0: 2.5, b1: 7.5, plat: 1, qx: 7, foot: 12.6};

  // ── 빗면 구간: 일-에너지 정리 ½mv₁² − mgH − f·d = ½mv_q² ──────────
  function ledger(m, v1, f, R = RAMP) {
    const K1 = 0.5 * m * v1 * v1, dU = m * G * R.H, loss = f * (R.b1 - R.b0), Kq = K1 - dU - loss;
    return {K1, dU, loss, Kq, vq: Kq > 0 ? Math.sqrt(2 * Kq / m) : 0, reach: Kq >= -1e-12};
  }
  // 거꾸로: 이탈 속력을 알면 마찰 구간의 손실과 마찰력
  const lossFor = (m, v1, vq, R = RAMP) => 0.5 * m * v1 * v1 - m * G * R.H - 0.5 * m * vq * vq;
  const frictionFor = (m, v1, vq, R = RAMP) => lossFor(m, v1, vq, R) / (R.b1 - R.b0);

  // 빗면 위 1차원 운동 (s = 빗면을 따라 잰 거리, 위가 +). 가속도가 일정한 조각들로 나눈다.
  // 마찰 구간에서는 마찰력이 늘 운동 반대 방향 → 올라갈 때 −g sinα − f/m, 내려올 때 −g sinα + f/m.
  // 끝: 'top' 꼭대기 도달, 'stuck' 마찰 구간에서 멈춰 그대로 (f ≥ mg sinα), 'back' 되돌아 바닥까지 내려옴
  function hit(s0, v0, a, sb) {                      // s0 + v0τ + ½aτ² = sb 인 가장 이른 τ > 0
    const d = sb - s0;
    if (Math.abs(a) < 1e-12) return v0 !== 0 && d / v0 > 1e-12 ? d / v0 : Infinity;
    const disc = v0 * v0 + 2 * a * d;
    if (disc < 0) return Infinity;
    const r = Math.sqrt(disc), c = [(-v0 - r) / a, (-v0 + r) / a].filter((x) => x > 1e-12);
    return c.length ? Math.min(...c) : Infinity;
  }
  function rampRun(m, v1, f, R = RAMP) {
    const gs = G * R.sin, fa = f / m, E = 1e-9, B = [0, R.b0, R.b1, R.L];
    const band = (s, dir) => (dir > 0 ? s >= R.b0 - E && s < R.b1 - E : s > R.b0 + E && s <= R.b1 + E);
    const pieces = [];
    let s = 0, v = v1, t = 0, end = null;
    for (let n = 0; n < 60 && !end; n++) {
      let dir = Math.sign(v);
      if (dir === 0) {                                  // 멈춘 순간: 아래로 미끄러질 수 있나
        if (band(s, -1) && fa >= gs - 1e-12) { end = 'stuck'; break; }
        dir = -1;
      }
      const inB = band(s, dir), a = -gs - (inB ? fa * dir : 0);
      const nb = dir > 0 ? B.find((b) => b > s + E) : [...B].reverse().find((b) => b < s - E);
      const tb = hit(s, v, a, nb), ts = a * v < 0 ? -v / a : Infinity, dt = Math.min(tb, ts);
      const p = {t0: t, s0: s, v0: v, a, band: inB, t1: t + dt};
      pieces.push(p);
      t += dt;
      if (ts < tb - 1e-9) { s = s + v * dt + 0.5 * a * dt * dt; v = 0; }
      else {                                            // 경계에 닿음 (꼭대기에 딱 멈추는 경우도 꼭대기로 친다)
        v = v + a * dt; s = nb;
        if (dir > 0 ? v < 0 : v > 0) v = 0;
        if (nb >= R.L - E && dir > 0) end = 'top';
        else if (nb <= E && dir < 0) end = 'back';
      }
    }
    return {pieces, end: end || 'stuck', tEnd: t, sEnd: s, vEnd: v};
  }
  // 빗면 운동의 t 초 상태 (마지막 조각 뒤에는 끝 상태 그대로)
  function rampAt(run, t) {
    const ps = run.pieces;
    if (!ps.length) return {s: 0, v: 0, band: false};
    let p = ps[ps.length - 1];
    for (const q of ps) if (t <= q.t1 + 1e-12) { p = q; break; }
    const tau = Math.max(0, Math.min(t, p.t1) - p.t0);
    return {s: p.s0 + p.v0 * tau + 0.5 * p.a * tau * tau, v: p.v0 + p.a * tau, band: p.band};
  }
  // t 초까지 마찰 구간에서 지나간 길이 (오르내림 모두) → 열 = f × 길이
  function bandPath(run, t) {
    let d = 0;
    for (const p of run.pieces) {
      if (p.t0 >= t) break;
      if (!p.band) continue;
      const tau = Math.min(t, p.t1) - p.t0;
      d += Math.abs(p.v0 * tau + 0.5 * p.a * tau * tau);
    }
    return d;
  }

  // ── 포물선 구간: 수평 등속 + 연직 등가속도 ──────────────────
  // q 에서 수평 속력 vq 로 이탈. tanPhi > 0 이면 x = foot 에서 시작하는 경사면, 0 이면 바닥에 떨어진다
  function flight(vq, tanPhi, R = RAMP) {
    const a = G / 2, tg = Math.sqrt(R.H / a), xg = R.qx + vq * tg;
    let t = tg, on = 'ground';
    if (tanPhi > 0 && xg > R.foot + 1e-12) {           // (G/2)t² + vq·tanφ·t − (H + (foot − qx)tanφ) = 0
      const b = vq * tanPhi, c = -(R.H + (R.foot - R.qx) * tanPhi);
      t = (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a); on = 'slope';
    }
    const vx = vq, vy = -G * t, speed = Math.hypot(vx, vy);
    let angle;                                         // 속도와 착지면 사이 각 (라디안, 90° 면 면에 수직)
    if (on === 'slope') { const ph = Math.atan(tanPhi); angle = Math.acos(Math.min(1, Math.abs(vx * Math.cos(ph) + vy * Math.sin(ph)) / speed)); }
    else angle = Math.atan2(-vy, vx);
    return {t, x: R.qx + vq * t, y: R.H - a * t * t, vx, vy, speed, on, angle, perp: on === 'slope' && Math.abs(vx / -vy - tanPhi) < 1e-9};
  }
  const perpVy = (vx, tanPhi) => vx / tanPhi;                       // 면에 수직 도달: v_x/|v_y| = tanφ → |v_y| = v_x/tanφ
  const dvFromTime = (t) => G * t;                                   // 시간 조건 → Δv (연직: Δv_y = gt)
  const timeFromVy = (vy) => Math.abs(vy) / G;
  const gravityWork = (m, vy0, vy) => 0.5 * m * (vy * vy - vy0 * vy0);   // 포물선 동안 중력의 일 = 연직 성분 운동 에너지 변화
  const vqFromLanding = (vL, drop) => Math.sqrt(Math.max(0, vL * vL - 2 * G * drop));   // 착지 속력이 주어지면 에너지 보존

  // ── 장면 2: 진자 → 최저점에서 실이 끊김 → 수평 투사 ─────────────
  const swingSpeed = (l, th0, g = G) => Math.sqrt(2 * g * l * (1 - Math.cos(th0)));   // 최저점 속력 (에너지)
  const swingTension = (m, l, th0, g = G) => m * g + m * swingSpeed(l, th0, g) ** 2 / l;   // T − mg = mv²/l
  function breakFlight(v, Hb) { const t = Math.sqrt(2 * Hb / G); return {t, x: v * t, vy: G * t, speed: Math.hypot(v, G * t)}; }
  // 진자의 정확한 운동 (진폭이 커도): sin(θ/2) = k·cd(ω₀t), k = sin(θ₀/2). 끝 → 최저점이 T/4
  function ellipK(k) {
    let a = 1, b = Math.sqrt(1 - k * k);
    for (let i = 0; i < 40 && Math.abs(a - b) > 1e-15; i++) { const a1 = (a + b) / 2; b = Math.sqrt(a * b); a = a1; }
    return Math.PI / (2 * a);
  }
  function jacobi(u, k) {
    const m = k * k;
    if (m < 1e-14) return {sn: Math.sin(u), cn: Math.cos(u), dn: 1};
    const a = [1], c = [Math.sqrt(m)];
    let b = Math.sqrt(1 - m), n = 0;
    while (Math.abs(c[n]) > 1e-15 && n < 30) { const an = (a[n] + b) / 2; c.push((a[n] - b) / 2); b = Math.sqrt(a[n] * b); a.push(an); n++; }
    let phi = Math.pow(2, n) * a[n] * u;
    for (let j = n; j > 0; j--) phi = (phi + Math.asin(Math.max(-1, Math.min(1, c[j] / a[j] * Math.sin(phi))))) / 2;
    const sn = Math.sin(phi);
    return {sn, cn: Math.cos(phi), dn: Math.sqrt(1 - m * sn * sn)};
  }
  const quarter = (l, th0, g = G) => Math.sqrt(l / g) * ellipK(Math.sin(th0 / 2));     // 끝 → 최저점 (T/4)
  function swingAt(t, l, th0, g = G) {                // 놓은 뒤 t 초 (0 ≤ t ≤ T/4): 각 θ(놓은 쪽 +), 각속도 w, 속력
    const k = Math.sin(th0 / 2), j = jacobi(Math.sqrt(g / l) * t, k);
    const th = 2 * Math.asin(Math.max(-1, Math.min(1, k * j.cn / j.dn)));
    const w = -Math.sqrt(Math.max(0, 2 * (g / l) * (Math.cos(th) - Math.cos(th0))));
    return {th, w, v: Math.abs(l * w)};
  }

  const api = {G, RAMP, ledger, lossFor, frictionFor, hit, rampRun, rampAt, bandPath, flight, perpVy, dvFromTime, timeFromVy, gravityWork,
    vqFromLanding, swingSpeed, swingTension, breakFlight, ellipK, jacobi, quarter, swingAt};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.A2_07 = api;
})(typeof window !== 'undefined' ? window : globalThis);
