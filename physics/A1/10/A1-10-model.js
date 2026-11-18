/* A1-10 등속 원운동의 기술: 주기·각속도·구심 가속도 — 계산 모형.
   브라우저(window.A1_10)와 Node 테스트(tests/A1-10-model.test.cjs)에서 같이 쓴다.
   단위: m, s, rad. 각 φ 는 x 축(오른쪽)에서 시계 반대 방향(+), 위쪽이 +y 인 좌표.
   원고 식: T = 2πr/v = 2π/ω = 1/f, v = rω, a = v²/r = rω² = 4π²r/T² */
(function (root) {
  'use strict';
  const TAU = 2 * Math.PI;
  const RAD = Math.PI / 180;

  const omega = (T) => TAU / T;                       // ω = 2π/T
  const freq = (T) => 1 / T;                          // f = 1/T
  const speed = (r, T) => r * omega(T);               // v = rω = 2πr/T
  const accel = (r, T) => r * omega(T) ** 2;          // a = rω² = 4π²r/T²
  const accelV = (v, r) => v * v / r;                 // a = v²/r
  const periodRV = (r, v) => TAU * r / v;             // T = 2πr/v
  const circumference = (r) => TAU * r;

  // 시각 t 의 위치·속도·가속도 (φ₀ 에서 시계 반대 방향으로 출발)
  const angleAt = (T, t, phi0 = 0) => phi0 + omega(T) * t;
  function state(r, T, t, phi0 = 0) {
    const w = omega(T), p = phi0 + w * t, c = Math.cos(p), s = Math.sin(p);
    return {phi: p, x: r * c, y: r * s, vx: -r * w * s, vy: r * w * c, ax: -r * w * w * c, ay: -r * w * w * s};
  }

  // 짧은 시간 동안 속도가 Δθ 돌 때: v₁(φ₁ 에서의 속도), v₂(φ₁ + Δθ), Δv = v₂ − v₁
  // 크기 |Δv| = 2v sin(Δθ/2) ≈ vΔθ. 방향 = 두 위치의 가운데(φ₁ + Δθ/2)에서 원의 중심 쪽(φ + π)
  function deltaV(v, phi1, dth) {
    const t1 = phi1 + Math.PI / 2, t2 = phi1 + dth + Math.PI / 2;
    const v1 = [v * Math.cos(t1), v * Math.sin(t1)], v2 = [v * Math.cos(t2), v * Math.sin(t2)];
    const dv = [v2[0] - v1[0], v2[1] - v1[1]];
    return {v1, v2, dv, mag: Math.hypot(dv[0], dv[1]), dir: Math.atan2(dv[1], dv[0]), approx: v * dth};
  }
  const chord = (v, dth) => 2 * v * Math.sin(dth / 2);           // |Δv| (이등변삼각형의 밑변)
  // 평균 가속도 |Δv|/Δt (Δt = Δθ/ω): Δθ → 0 이면 a = vω 로 다가간다
  const avgAccel = (r, T, dth) => chord(speed(r, T), dth) / (dth / omega(T));

  // 같은 축으로 함께 도는 두 점 (반지름 rA, rB): T, ω 같음 → v ∝ r, a ∝ r
  function sameAxis(rA, rB, T) {
    const w = omega(T);
    return {T, w, TA: T, TB: T, wA: w, wB: w, vA: rA * w, vB: rB * w, aA: rA * w * w, aB: rB * w * w};
  }
  // 벨트로 이은 두 바퀴 (미끄러지지 않음): 가장자리 속력 같음 → ω ∝ 1/r, a = v²/r ∝ 1/r
  function belt(rA, rB, TA) {
    const wA = omega(TA), v = rA * wA, wB = v / rB;
    return {v, vA: v, vB: v, wA, wB, TA, TB: TAU / wB, aA: v * v / rA, aB: v * v / rB};
  }

  // 궤도를 벗어나는 순간의 속도 방향(접선). 반지름이 연직선과 θ 이면 속도는 수평과 θ
  // 아래쪽 반원에서 시계 반대 방향으로 돌던 물체: 반지름 방향 φ = −90° + θ → 속도 방향 φ + 90° = θ (수평 위로 θ)
  const tangentDir = (phi) => phi + Math.PI / 2;
  function releaseAngle(thetaFromVertical) {
    const phi = -Math.PI / 2 + thetaFromVertical, d = tangentDir(phi);
    return Math.atan2(Math.sin(d), Math.cos(d));              // 수평과 이루는 각 (rad)
  }

  // 성분 그래프: x = r cos ωt, vₓ = −rω sin ωt, aₓ = −rω² cos ωt (진폭 r, rω, rω²)
  const comps = (r, T, t) => { const s = state(r, T, t); return {x: s.x, vx: s.vx, ax: s.ax}; };

  const api = {TAU, RAD, omega, freq, speed, accel, accelV, periodRV, circumference, angleAt, state, deltaV, chord, avgAccel,
    sameAxis, belt, tangentDir, releaseAngle, comps};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.A1_10 = api;
})(typeof window !== 'undefined' ? window : globalThis);
