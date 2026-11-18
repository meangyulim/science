/* A1-12 케플러 법칙 — 계산 모형. 브라우저(window.A1_12)와 Node 테스트(tests/A1-12-model.test.cjs)에서 같이 쓴다.
   단위: 거리 AU, 시간 년. 태양 둘레에서는 T² = a³ (지구: a = 1 AU, T = 1년 → 비례 상수 k = 1 년²/AU³).
   태양은 원점(초점 F), 근일점은 +x 쪽. 다른 초점 F′ 는 (−2ae, 0). r₁ = 근일점 거리, r₂ = 원일점 거리 */
(function (root) {
  'use strict';
  const TAU = 2 * Math.PI;
  const semiMajor = (r1, r2) => (r1 + r2) / 2;                 // r₁ + r₂ = 2a
  const ecc = (r1, r2) => (r2 - r1) / (r2 + r1);
  const semiMinor = (r1, r2) => Math.sqrt(r1 * r2);            // b² = a² − c² = r₁r₂
  const period = (a, k = 1) => Math.sqrt(a * a * a / k);       // T² = ka³
  const periodRatio = (aRatio) => Math.pow(aRatio, 1.5);       // T 비 = a 비의 3/2 제곱
  const speedRatio = (r1, r2) => r2 / r1;                      // r₁v₁ = r₂v₂ → v₁/v₂ = r₂/r₁
  const accelRatio = (r1, r2) => (r2 / r1) * (r2 / r1);        // 가속도 ∝ 1/r² (근일점 ÷ 원일점)

  // 케플러 방정식 E − e sinE = M (뉴턴법)
  function eccAnomaly(Mm, e) {
    let E = e < 0.8 ? Mm : Math.PI;
    for (let i = 0; i < 30; i++) { const d = (E - e * Math.sin(E) - Mm) / (1 - e * Math.cos(E)); E -= d; if (Math.abs(d) < 1e-13) break; }
    return E;
  }
  // 시각 t(년) 의 위치. 근일점에서 출발, 시계 반대 방향
  function posAt(t, r1, r2) {
    const a = semiMajor(r1, r2), e = ecc(r1, r2), b = semiMinor(r1, r2), T = period(a);
    const Mm = TAU * (((t / T) % 1) + 1) % TAU, E = eccAnomaly(Mm, e);
    const x = a * (Math.cos(E) - e), y = b * Math.sin(E);
    return {x, y, r: Math.hypot(x, y), E, a, b, e, T};
  }
  // 속력 (AU/년). 태양의 GM = 4π² AU³/년² (궤도 에너지 보존에서 나온 값, 화면에는 식을 쓰지 않는다)
  const speedAt = (r, a) => TAU * Math.sqrt(2 / r - 1 / a);
  const KMS = 1.495978707e8 / 3.15576e7;                         // 1 AU/년 = 4.74 km/s
  // 면적 속도 πab/T 와 쓸고 간 넓이 (같은 궤도 안에서 넓이 비 = 시간 비)
  const arealRate = (r1, r2) => Math.PI * semiMajor(r1, r2) * semiMinor(r1, r2) / period(semiMajor(r1, r2));
  const sweptArea = (dt, r1, r2) => arealRate(r1, r2) * dt;
  function polyArea(pts) {                                        // 다각형 넓이 (신발끈 공식)
    let s = 0;
    for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; s += p[0] * q[1] - q[0] * p[1]; }
    return Math.abs(s) / 2;
  }
  // t1 ~ t2 동안 태양과 행성을 잇는 선분이 쓸고 간 넓이 (수치 적분)
  function sweptNumeric(t1, t2, r1, r2, n = 2000) {
    const pts = [[0, 0]];
    for (let i = 0; i <= n; i++) { const p = posAt(t1 + (t2 - t1) * i / n, r1, r2); pts.push([p.x, p.y]); }
    return polyArea(pts);
  }
  const focusSum = (x, y, r1, r2) => Math.hypot(x, y) + Math.hypot(x + 2 * semiMajor(r1, r2) * ecc(r1, r2), y);   // PF + PF′

  // 태양계 행성 (긴반지름 AU, 공전 주기 년)
  const PLANETS = [['수성', 0.387, 0.241], ['금성', 0.723, 0.615], ['지구', 1, 1], ['화성', 1.524, 1.881], ['목성', 5.203, 11.86], ['토성', 9.537, 29.46]];
  function logSlope(list = PLANETS) {                            // log T – log a 직선의 기울기 (최소 제곱)
    const xs = list.map((p) => Math.log10(p[1])), ys = list.map((p) => Math.log10(p[2])), n = xs.length;
    const mx = xs.reduce((s, v) => s + v, 0) / n, my = ys.reduce((s, v) => s + v, 0) / n;
    let sxy = 0, sxx = 0;
    for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; }
    return sxy / sxx;
  }
  // T 를 a³ 의 제곱근 꼴로: a³ 이 정수면 k√m (예: 8 → 2√2, 27 → 3√3, 64 → 8)
  function radical(n) {
    if (Math.abs(n - Math.round(n)) > 1e-9 || n <= 0 || n > 100000) return null;
    n = Math.round(n);
    let k = 1, m = n;
    for (let f = 2; f * f <= m; f++) while (m % (f * f) === 0) { m /= f * f; k *= f; }
    return {k, m};
  }

  const api = {TAU, semiMajor, ecc, semiMinor, period, periodRatio, speedRatio, accelRatio, eccAnomaly, posAt, speedAt, KMS,
    arealRate, sweptArea, polyArea, sweptNumeric, focusSum, PLANETS, logSlope, radical};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.A1_12 = api;
})(typeof window !== 'undefined' ? window : globalThis);
