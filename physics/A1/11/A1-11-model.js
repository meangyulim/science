/* A1-11 여러 가지 구심력 — 계산 모형. 브라우저(window.A1_11)와 Node 테스트(tests/A1-11-model.test.cjs)에서 같이 쓴다.
   구심력은 새로운 힘이 아니라 실제 힘들(장력·중력·수직항력·마찰력·만유인력)의 '중심 방향 성분의 합'이고, 그 합 = mv²/r = mrω².
   단위: m, s, kg, N. 각은 도(°). g = 10 m/s² (원고 값). */
(function (root) {
  'use strict';
  const G = 10;
  const RAD = Math.PI / 180;
  const TAU = 2 * Math.PI;
  const sinD = (d) => Math.sin(d * RAD), cosD = (d) => Math.cos(d * RAD), tanD = (d) => Math.tan(d * RAD);

  // ── 원뿔 진자: 실 길이 l, 연직과 θ. T cosθ = mg (연직 평형), T sinθ = mrω² (수평 = 구심력)
  // r = l sinθ, h = l cosθ → ω² = g/h, 주기 = 2π√(h/g), 장력 = mg/cosθ = mlω²
  function conical(l, th, g = G) {
    const h = l * cosD(th), r = l * sinD(th), w = Math.sqrt(g / h);
    return {h, r, w, period: TAU / w, v: r * w,
      tension: 1 / cosD(th),            // 장력 ÷ mg
      fc: tanD(th),                     // 합력(구심력) ÷ mg = T sinθ ÷ mg
      tensionMl: l * w * w / g};        // mlω² ÷ mg (= 1/cosθ 와 같아야 한다)
  }
  const periodH = (h, g = G) => TAU * Math.sqrt(h / g);

  // ── 원형 도로 (반지름 r, 바깥쪽이 높게 θ 기울어짐). 수평(중심 쪽): N sinθ + f cosθ = mv²/r, 연직: N cosθ − f sinθ = mg
  // f > 0 이면 마찰력이 빗면 아래(안쪽)로, f < 0 이면 빗면 위(바깥쪽)로. θ = 0 이면 마찰력 혼자 구심력
  function road(m, v, r, th, g = G) {
    const ac = v * v / r, c = cosD(th), s = sinD(th);
    return {ac, fc: m * ac, N: m * (g * c + ac * s), f: m * (ac * c - g * s), design: Math.sqrt(g * r * tanD(th))};
  }
  // 정지 마찰력으로 버틸 수 있는가: |f| ≤ μN. 넘으면 out(바깥으로 미끄러짐) 또는 in(안쪽으로)
  function roadSlip(m, v, r, th, mu, g = G) {
    const q = road(m, v, r, th, g), lim = mu * q.N;
    return {ok: Math.abs(q.f) <= lim + 1e-9, dir: q.f > lim + 1e-9 ? 'out' : q.f < -lim - 1e-9 ? 'in' : null, lim, ...q};
  }
  const bankSpeed = (r, th, g = G) => Math.sqrt(g * r * tanD(th));      // tanθ = v²/(gr): 질량이 없다
  const flatMaxSpeed = (r, mu, g = G) => Math.sqrt(mu * g * r);         // 평평한 도로: mv²/r ≤ μmg

  // ── 연직 원 (실 길이 r, 바닥 속력 v0). φ 는 바닥에서 잰 각. 속력은 역학적 에너지 보존:
  // v² = v0² − 2gr(1 − cosφ). 중심 방향: T − mg cosφ = mv²/r → T = m(v²/r + g cosφ)
  const speedSq = (v0, r, phi, g = G) => v0 * v0 - 2 * g * r * (1 - Math.cos(phi));
  const tension = (m, v0, r, phi, g = G) => m * (speedSq(v0, r, phi, g) / r + g * Math.cos(phi));
  const topTension = (m, vTop, r, g = G) => m * (vTop * vTop / r - g);       // 꼭대기: T + mg = mv²/r
  const bottomTension = (m, vBot, r, g = G) => m * (vBot * vBot / r + g);    // 바닥: T − mg = mv²/r
  const topSpeedFromBottom = (v0, r, g = G) => Math.sqrt(Math.max(0, v0 * v0 - 4 * g * r));
  const bottomSpeedFromTop = (vt, r, g = G) => Math.sqrt(vt * vt + 4 * g * r);
  const minTopSpeed = (r, g = G) => Math.sqrt(g * r);                         // 꼭대기 T ≥ 0 ⇔ v² ≥ gr
  // 실이 느슨해지는 각(바닥에서): T = 0 → cosφ = (2g − v0²/r)/(3g). 2gr < v0² < 5gr 일 때만 (아니면 null)
  function slackAngle(v0, r, g = G) {
    const q = v0 * v0 / r;
    if (q >= 5 * g || q <= 2 * g) return null;
    return Math.acos((2 * g - q) / (3 * g));
  }

  // ── 인공위성: 만유인력 GMm/r² = mv²/r, GM = gR² (지표 중력 가속도 g, 지구 반지름 R)
  const RE = 6.4e6;
  function satellite(rR, g = G, R = RE) {
    const r = rR * R, gr = g / (rR * rR), v = Math.sqrt(g * R * R / r);
    return {r, gHere: gr, v, period: TAU * r / v};
  }
  // 힘과 속도의 내적 (일률). 구심력은 속도에 수직 → 0 → 운동 에너지 일정
  const power = (F, v) => F[0] * v[0] + F[1] * v[1];

  // ── 실로 차례로 이은 두 물체 (안쪽 m1 이 r1, 바깥 m2 가 r2, 같은 ω). 바깥부터: T2 = m2 r2 ω², T1 − T2 = m1 r1 ω²
  function chain(m1, r1, m2, r2, w) {
    const T2 = m2 * r2 * w * w;
    return {T2, T1: T2 + m1 * r1 * w * w};
  }
  // 구멍 지난 실에 매단 추 M: 장력 Mg = 구심력 m r ω² → 주기 2π√(mr/(Mg))
  const holePeriod = (m, r, M, g = G) => TAU * Math.sqrt(m * r / (M * g));

  const api = {G, RAD, TAU, sinD, cosD, tanD, conical, periodH, road, roadSlip, bankSpeed, flatMaxSpeed,
    speedSq, tension, topTension, bottomTension, topSpeedFromBottom, bottomSpeedFromTop, minTopSpeed, slackAngle,
    RE, satellite, power, chain, holePeriod};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.A1_11 = api;
})(typeof window !== 'undefined' ? window : globalThis);
