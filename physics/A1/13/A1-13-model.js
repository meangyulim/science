/* A1-13 만유인력·중력 가속도·인공위성·탈출 속력 — 계산 모형. 브라우저(window.A1_13)와 Node 테스트(tests/A1-13-model.test.cjs)에서 같이 쓴다.
   SI 단위. 지구 값은 원고 값: G = 6.67 × 10⁻¹¹ N·m²/kg², M = 6.0 × 10²⁴ kg, R = 6.4 × 10⁶ m → v₁ ≈ 7.9 km/s, v₂ ≈ 11.2 km/s.
   뉴턴의 대포는 발사점(중심 거리 r₀)에서 수평으로 쏜 경우만 다룬다: q = v²/v₁² 로 궤도가 정해진다. */
(function (root) {
  'use strict';
  const G = 6.67e-11, M_E = 6.0e24, R_E = 6.4e6;

  const gAt = (M, r) => G * M / (r * r);                       // 중력 가속도 (위성 질량과 무관)
  const force = (M, m, r) => G * M * m / (r * r);              // 만유인력 (위성 질량에 비례)
  const vCirc = (M, r) => Math.sqrt(G * M / r);                // 원 궤도 속력: GMm/r² = mv²/r
  const period = (M, r) => 2 * Math.PI * Math.sqrt(r * r * r / (G * M));   // T = 2π√(r³/GM)
  const vEsc = (M, R) => Math.sqrt(2 * G * M / R);             // 탈출 속력 (발사체 질량·방향과 무관)
  const potential = (M, m, r) => -G * M * m / r;               // U = −GMm/r (무한히 먼 곳 = 0)
  const kinCirc = (M, m, r) => G * M * m / (2 * r);            // 원 궤도 K = GMm/2r
  const eCirc = (M, m, r) => -G * M * m / (2 * r);             // 원 궤도 E = −GMm/2r (|E| = K, U = 2E)
  const energy = (M, m, r, v) => 0.5 * m * v * v - G * M * m / r;
  const rForPeriod = (M, T) => Math.cbrt(G * M * T * T / (4 * Math.PI * Math.PI));   // 정지 궤도 등
  const gSurfaceDensity = (rho, R) => 4 / 3 * Math.PI * rho * G * R;                  // g = (4/3)πρGR

  // 같은 중심 천체를 도는 두 원 궤도 위성 A, B 의 비 (A/B). k = r_B/r_A
  function ratios(rA, rB) {
    const k = rB / rA;
    return {k, v: Math.sqrt(k), T: Math.pow(k, -1.5), a: k * k, E: k};   // E_A/E_B = k (둘 다 음수 → k > 1 이면 B 가 크다)
  }

  // ── 뉴턴의 대포: 발사점 r₀ 에서 수평으로 v 로 쏜다. q = (v/v₁)², v₁ = √(GM/r₀) ──
  const qOf = (v, M, r0) => v * v * r0 / (G * M);
  // 궤도 모양 r(φ)/r₀ = q / (1 + (q − 1) cos φ)  (φ = 발사점에서 돈 각)
  const conic = (q, phi) => q / (1 + (q - 1) * Math.cos(phi));
  // 가까운 점·먼 점 (r₀ 단위). q ≥ 2 이면 먼 점 없음(Infinity)
  function apsides(q) {
    if (q >= 2) return {near: 1, far: Infinity};
    const o = q / (2 - q);
    return q < 1 ? {near: o, far: 1} : {near: 1, far: o};
  }
  const semiMajor = (q) => (q < 2 ? 1 / (2 - q) : Infinity);      // 긴반지름 a/r₀ = 1/(2 − q)
  const periodRatio = (q) => Math.pow(semiMajor(q), 1.5);         // 타원 주기 / 원 궤도 주기 (케플러 3법칙)
  // 분류: 'fall' 땅에 떨어짐 | 'circle' 원 궤도 | 'ellipse' 타원 궤도 | 'escape' 돌아오지 않음.
  // ground = 땅(지면)의 중심 거리 / r₀ (그림은 산을 과장해 땅을 조금 낮게 그린다), tol = 원으로 볼 v/v₁ 차이
  function classify(q, ground = 1, tol = 0.006) {
    if (q >= 2 - 1e-12) return 'escape';
    if (Math.abs(Math.sqrt(q) - 1) <= tol) return 'circle';
    if (q > 1) return 'ellipse';
    return apsides(q).near <= ground ? 'fall' : 'ellipse';
  }
  // 수치 적분(RK4)으로 궤적. 단위: r₀ = 1, GM = 1 → v₁ = 1, 원 궤도 주기 2π. 발사점 (0, 1), 처음 속도 (√q, 0) (오른쪽).
  // 끝: 땅(r ≤ ground) · 한 바퀴(돈 각 ≥ 2π) · 멀리(r ≥ rMax) · 시간 tMax. 점은 dt 마다 {x, y, vx, vy, t}.
  function trajectory(q, o = {}) {
    const ground = o.ground ?? 1, rMax = o.rMax ?? 8, dt = o.dt ?? (2 * Math.PI / 1440), tMax = o.tMax ?? 12 * Math.PI;
    let x = 0, y = 1, vx = Math.sqrt(q), vy = 0, t = 0, turned = 0, prevA = Math.atan2(y, x);
    const pts = [{x, y, vx, vy, t}];
    const acc = (px, py) => { const r3 = Math.pow(px * px + py * py, 1.5); return [-px / r3, -py / r3]; };
    let end = 'time';
    while (t < tMax) {
      const [a1x, a1y] = acc(x, y);
      const k2x = x + vx * dt / 2, k2y = y + vy * dt / 2, w2x = vx + a1x * dt / 2, w2y = vy + a1y * dt / 2;
      const [a2x, a2y] = acc(k2x, k2y);
      const k3x = x + w2x * dt / 2, k3y = y + w2y * dt / 2, w3x = vx + a2x * dt / 2, w3y = vy + a2y * dt / 2;
      const [a3x, a3y] = acc(k3x, k3y);
      const k4x = x + w3x * dt, k4y = y + w3y * dt, w4x = vx + a3x * dt, w4y = vy + a3y * dt;
      const [a4x, a4y] = acc(k4x, k4y);
      const nx = x + dt / 6 * (vx + 2 * w2x + 2 * w3x + w4x), ny = y + dt / 6 * (vy + 2 * w2y + 2 * w3y + w4y);
      vx += dt / 6 * (a1x + 2 * a2x + 2 * a3x + a4x); vy += dt / 6 * (a1y + 2 * a2y + 2 * a3y + a4y);
      x = nx; y = ny; t += dt;
      const ang = Math.atan2(y, x); let d = ang - prevA;
      if (d > Math.PI) d -= 2 * Math.PI; else if (d < -Math.PI) d += 2 * Math.PI;
      turned -= d; prevA = ang;                                   // 시계 방향(오른쪽으로 쏨)으로 돈 각
      const r = Math.hypot(x, y);
      if (r <= ground) {                                          // 땅에 닿은 점을 직선 보간으로 맞춘다
        const p = pts[pts.length - 1], rp = Math.hypot(p.x, p.y), u = (rp - ground) / Math.max(1e-12, rp - r);
        pts.push({x: p.x + (x - p.x) * u, y: p.y + (y - p.y) * u, vx, vy, t: p.t + dt * u}); end = 'ground'; break;
      }
      pts.push({x, y, vx, vy, t});
      if (turned >= 2 * Math.PI) { end = 'orbit'; break; }
      if (r >= rMax) { end = 'far'; break; }
    }
    return {pts, end, turned, dt};
  }
  // 궤적에서 시각 t 의 점(보간). t 가 끝을 넘으면 마지막 점
  function at(traj, t) {
    const p = traj.pts, n = p.length;
    if (t <= 0) return p[0];
    const i = Math.min(n - 2, Math.floor(t / traj.dt));
    if (i >= n - 2 && t >= p[n - 1].t) return p[n - 1];
    const a = p[i], b = p[i + 1], u = Math.max(0, Math.min(1, (t - a.t) / Math.max(1e-12, b.t - a.t)));
    return {x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, vx: a.vx + (b.vx - a.vx) * u, vy: a.vy + (b.vy - a.vy) * u, t};
  }

  const api = {G, M_E, R_E, gAt, force, vCirc, period, vEsc, potential, kinCirc, eCirc, energy, rForPeriod, gSurfaceDensity,
    ratios, qOf, conic, apsides, semiMajor, periodRatio, classify, trajectory, at};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.A1_13 = api;
})(typeof window !== 'undefined' ? window : globalThis);
