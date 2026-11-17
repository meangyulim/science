/* III1-06 여러 매질의 굴절과 물결파 굴절 — 계산 모형. 브라우저(window.III1_06)와 Node 테스트(tests/III1-06-model.test.cjs)에서 같이 쓴다.
   각도는 도(°). θ 는 진행 방향과 법선 사이 각 = 마루선(파면)과 경계면 사이 각. 굴절이 없으면(전반사) NaN. */
(function (root) {
  'use strict';
  const RAD = Math.PI / 180;
  const sinD = (d) => Math.sin(d * RAD);
  const cosD = (d) => Math.cos(d * RAD);
  const asinD = (s) => Math.asin(Math.max(-1, Math.min(1, s))) / RAD;
  const refr = (s) => (Math.abs(s) > 1 + 1e-12 ? NaN : asinD(s));

  /* 물결파: sinθ₁ : sinθ₂ = λ₁ : λ₂ = v₁ : v₂. k = v₂/v₁ (= λ₂/λ₁, 진동수 같음) */
  const wave = (th1, lam1, k) => ({th2: refr(k * sinD(th1)), lam2: lam1 * k});
  const lam2From = (lam1, th1, th2) => lam1 * sinD(th2) / sinD(th1);       // 두 각으로 굴절된 파장
  const ratioFrom = (th1, th2) => sinD(th2) / sinD(th1);                   // v₂/v₁
  const period = (lam, v) => lam / v;                                      // T = λ/v (두 영역에서 같다)
  // 마루선 방향과 경계면 사이 각: 진행 방향 u = (sinθ, cosθ) 에 수직인 마루선 p = (cosθ, −sinθ) 과 경계 (1, 0) 사이 각
  const crestBoundaryAngle = (th) => Math.abs(Math.atan2(-sinD(th), cosD(th))) / RAD;

  /* 평행한 층: n sinθ 가 모든 층에서 같다. ns = [n₀, n₁, …], th0 = 첫 매질의 각 → 각 층의 각 (전반사 뒤로는 NaN) */
  function layers(ns, th0) {
    const K = ns[0] * sinD(th0), out = [];
    let dead = false;
    for (const n of ns) { const t = dead ? NaN : refr(K / n); if (Number.isNaN(t)) dead = true; out.push(t); }
    return out;
  }
  const invariant = (n, th) => n * sinD(th);
  // 각이 작은 순 = 굴절률 큰 순 (n sinθ 가 같으므로)
  const rankByAngle = (names, angles) => names.map((nm, i) => [nm, angles[i]]).sort((a, b) => a[1] - b[1]).map((x) => x[0]);
  // 바깥 매질이 같은 평행 층(두께 ds)을 지난 빛: 처음 직선에서 수직으로 밀린 거리
  function shift(ns, th0, ds) {
    const th = layers(ns, th0);
    let dx = 0;
    ds.forEach((d, i) => { dx += d * (Math.tan(th0 * RAD) - Math.tan(th[i + 1] * RAD)); });
    return dx * cosD(th0);
  }

  /* sin r – sin i 그래프: sin r = (n₁/n₂) sin i. 기울기 > 1 이면 sin r = 1 에서 끝나고 그 sin i 가 임계각의 사인 */
  function sinLine(n1, n2) {
    const k = n1 / n2;
    return {slope: k, endSinI: k > 1 ? 1 / k : 1, endSinR: Math.min(1, k), critical: k > 1 ? asinD(1 / k) : NaN};
  }
  const criticalSin = (slope) => (slope > 1 ? 1 / slope : NaN);

  const api = {RAD, sinD, cosD, asinD, wave, lam2From, ratioFrom, period, crestBoundaryAngle, layers, invariant, rankByAngle, shift, sinLine, criticalSin};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.III1_06 = api;
})(typeof window !== 'undefined' ? window : globalThis);
