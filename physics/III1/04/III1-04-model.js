/* III1-04 굴절과 스넬 법칙 — 계산 모형. 브라우저(window.III1_04)와 Node 테스트(tests/III1-04-model.test.cjs)에서 같이 쓴다.
   각도는 도(°)로 주고받는다. θ 는 진행 방향과 법선 사이 각 (= 파면(마루선)과 경계면 사이 각).
   전반사가 일어나 굴절각이 없으면 NaN. 빛의 속력 c = 3 × 10⁸ m/s (원고 값). */
(function (root) {
  'use strict';
  const C = 3e8;
  const RAD = Math.PI / 180;
  const sinD = (d) => Math.sin(d * RAD);
  const cosD = (d) => Math.cos(d * RAD);
  const asinD = (s) => Math.asin(Math.max(-1, Math.min(1, s))) / RAD;

  const speed = (n) => C / n;                                // v = c/n
  const sinRefr = (n1, n2, th1) => n1 / n2 * sinD(th1);      // sinθ₂ = (n₁/n₂) sinθ₁
  // 굴절각 θ₂ (°): n₁ sinθ₁ = n₂ sinθ₂. sinθ₂ > 1 이면 굴절 광선 없음(전반사) → NaN
  function refract(n1, n2, th1) {
    const s = sinRefr(n1, n2, th1);
    return Math.abs(s) > 1 + 1e-12 ? NaN : asinD(s);
  }
  const relIndex = (n1, n2) => n2 / n1;          // 매질 1에 대한 매질 2의 굴절률 n₂/n₁ = v₁/v₂
  const lambdaRatio = (n1, n2) => n1 / n2;       // λ₂/λ₁ = v₂/v₁ (진동수는 그대로)
  const slope = (n1, n2) => n1 / n2;             // 가로 sinθ₁, 세로 sinθ₂ 그래프의 기울기
  const critical = (n1, n2) => (n1 > n2 ? asinD(n2 / n1) : NaN);
  const indexFrom = (n1, th1, th2) => n1 * sinD(th1) / sinD(th2);   // 두 각을 재서 굴절률 구하기
  const invariant = (n, th) => n * sinD(th);     // n sinθ (경계 양쪽에서 같다)

  // 하위헌스 작도 (그림 ①): 파면 AB 의 A 가 경계에 닿은 뒤 B 가 경계의 D 에 닿기까지 시간 t.
  // 경계 위 길이 AD 가 주어지면 BD = v₁t = AD sinθ₁, AE = v₂t = AD sinθ₂ (빗변 AD 공유)
  function huygens(n1, n2, th1, AD) {
    const th2 = refract(n1, n2, th1);
    const BD = AD * sinD(th1), t = BD / speed(n1);
    return {th2, BD, AE: speed(n2) * t, t};
  }

  // 띠 모양 평행 광선 다발(반폭 h)이 O 에서 경계와 만나는 너비: AD = 2h / cosθ₁, 굴절 뒤 반폭 h₂ = h cosθ₂ / cosθ₁
  const footprint = (h, th1) => 2 * h / cosD(th1);
  const bandAfter = (h, th1, th2) => h * cosD(th2) / cosD(th1);

  const api = {C, RAD, sinD, cosD, asinD, speed, sinRefr, refract, relIndex, lambdaRatio, slope, critical, indexFrom, invariant,
    huygens, footprint, bandAfter};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.III1_04 = api;
})(typeof window !== 'undefined' ? window : globalThis);
