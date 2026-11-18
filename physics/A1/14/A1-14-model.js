/* A1-14 단진동과 단진자 — 계산 모형. 브라우저(window.A1_14)와 Node 테스트(tests/A1-14-model.test.cjs)에서 같이 쓴다.
   SI 단위, 각은 라디안. 예제는 g = π² m/s² 로 둔다(그러면 T = 2√l). 진폭이 작아 단진동한다고 보고
   오른쪽 끝에서 가만히 놓은 순간을 t = 0 으로 한다: x = A cos ωt (A = 진폭, ω = 2π/T). */
(function (root) {
  'use strict';
  const PI2 = Math.PI * Math.PI;

  const period = (l, g) => 2 * Math.PI * Math.sqrt(l / g);          // T = 2π√(l/g): 질량·진폭과 무관
  const omega = (l, g) => Math.sqrt(g / l);                          // ω² = k/m = (mg/l)/m = g/l
  const lengthFor = (T, g) => g * T * T / (4 * PI2);                 // 주기에서 길이로
  const energyPeriod = (l, g) => period(l, g) / 2;                   // K·U 는 한 주기에 두 번씩 최대 → T/2
  const quarter = (l, g) => period(l, g) / 4;                        // 끝 → 최저점
  const t2Slope = (g) => 4 * PI2 / g;                                // T²–l 그래프의 기울기
  const kEff = (m, g, l) => m * g / l;                               // F ≈ −(mg/l)x 의 상수 k
  const restoring = (m, g, th) => -m * g * Math.sin(th);             // 중력의 접선 성분 (정확)
  const restoringLinear = (m, g, l, x) => -(m * g / l) * x;          // 작은 각: sinθ ≈ θ = x/l
  const height = (l, th) => l * (1 - Math.cos(th));                  // 최저점에서 잰 높이
  const vMax = (g, l, th0) => Math.sqrt(2 * g * l * (1 - Math.cos(th0)));   // 최저점 속력 √(2gh)
  const tensionBottom = (m, g, l, th0) => m * g + m * vMax(g, l, th0) ** 2 / l;   // mg + mv²/l (무게보다 크다)
  const tensionEnd = (m, g, th0) => m * g * Math.cos(th0);           // 양 끝: 속력 0 → mg cosθ₀
  const tangentAccEnd = (g, th0) => g * Math.sin(th0);               // 양 끝의 접선 가속도 (최대)
  const freeFallTime = (l, g) => Math.sqrt(2 * l / g);               // 같은 거리 l 을 자유 낙하
  const springPeriod = (m, k) => 2 * Math.PI * Math.sqrt(m / k);     // (교과 심화) 용수철 진자

  // 단진동: 오른쪽 끝에서 놓은 뒤 t 초. x = A cos ωt, v = −Aω sin ωt, a = −ω²x
  function shm(t, A, w) {
    const c = Math.cos(w * t), s = Math.sin(w * t);
    return {x: A * c, v: -A * w * s, a: -w * w * A * c};
  }
  // 등속 원운동(반지름 A, 각속도 ω)하는 점과 그 그림자: 점의 x 성분·속도의 x 성분·구심 가속도의 x 성분이 단진동의 x, v, a
  function circlePoint(t, A, w) {
    const c = Math.cos(w * t), s = Math.sin(w * t);
    return {px: A * c, py: A * s, vx: -A * w * s, vy: A * w * c, ax: -A * w * w * c, ay: -A * w * w * s};
  }
  // 에너지 비율 (역학적 에너지 E = 1): 끝에서 놓았으므로 U = cos²ωt, K = sin²ωt
  function energies(t, w) {
    const c = Math.cos(w * t), s = Math.sin(w * t);
    return {K: s * s, U: c * c};
  }
  // 자리 이름 (T 단위로 본 시각): 'endR' 오른쪽 끝, 'endL' 왼쪽 끝, 'bottom' 최저점, 'between' 사이
  function where(t, T, tol = 0.01) {
    const f = (((t / T) % 1) + 1) % 1, near = (a) => Math.abs(f - a) < tol || Math.abs(f - a - 1) < tol;
    if (near(0)) return 'endR';
    if (near(0.5)) return 'endL';
    if (near(0.25) || near(0.75)) return 'bottom';
    return 'between';
  }

  const api = {PI2, period, omega, lengthFor, energyPeriod, quarter, t2Slope, kEff, restoring, restoringLinear, height, vMax,
    tensionBottom, tensionEnd, tangentAccEnd, freeFallTime, springPeriod, shm, circlePoint, energies, where};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.A1_14 = api;
})(typeof window !== 'undefined' ? window : globalThis);
