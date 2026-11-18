/* A2-08 온도·열·비열·열용량·열평형 — 계산 모형. 브라우저(window.A2_08)와 Node 테스트(tests/A2-08-model.test.cjs)에서 같이 쓴다.
   온도는 °C 로 주고받는다(온도 변화 ΔT 는 K 와 °C 가 같다). 비열 c 는 J/(kg·K), 질량 m 은 kg, 열량 Q 는 J.
   원고 값: 물의 비열 4200 J/(kg·K), 예제의 금속 420 J/(kg·K), 그림 ②의 철 450 J/(kg·K). */
(function (root) {
  'use strict';
  const MAT = {
    metal: {name: '금속', c: 420, rho: 7.8, solid: true},     // 예제의 금속
    iron: {name: '철', c: 450, rho: 7.9, solid: true},         // 그림 ②
    water: {name: '물', c: 4200, rho: 1, solid: false},
  };
  const heatCap = (c, m) => c * m;                 // 열용량 C = cm (J/K): 물체 전체를 1 K 올리는 열량
  const specific = (C, m) => C / m;                // 비열 c = C/m: 물질 1 kg 을 1 K 올리는 열량 (질량과 무관)
  const heat = (c, m, dT) => c * m * dT;           // Q = cmΔT = CΔT
  const dTof = (Q, c, m) => Q / (c * m);           // 같은 열량 → ΔT = Q/(cm) ∝ 1/C

  // 열평형 온도: c₁m₁(T₁ − T) = c₂m₂(T − T₂) → T = (C₁T₁ + C₂T₂)/(C₁ + C₂)
  function equilibrium(c1, m1, T1, c2, m2, T2) {
    const C1 = heatCap(c1, m1), C2 = heatCap(c2, m2);
    return (C1 * T1 + C2 * T2) / (C1 + C2);
  }
  // 두 물체를 붙인 뒤 시간 t 의 온도. 열이 흐르는 빠르기는 온도 차에 비례한다고 보아, 온도 차가 지수적으로 줄어든다.
  // tau 는 화면용 시간 상수(실제 시간이 아니다). 어느 순간에나 C₁(T₁ − T_A) = C₂(T_B − T₂) (잃은 열 = 얻은 열)
  function temps(c1, m1, T1, c2, m2, T2, t, tau) {
    const T = equilibrium(c1, m1, T1, c2, m2, T2), f = Math.exp(-Math.max(0, t) / tau);
    return {TA: T + (T1 - T) * f, TB: T + (T2 - T) * f, T, f};
  }
  // 지금까지 A 가 잃은 열(= B 가 얻은 열). A 가 뜨거우면 +
  const lost = (c1, m1, T1, TA) => heatCap(c1, m1) * (T1 - TA);
  const gained = (c2, m2, T2, TB) => heatCap(c2, m2) * (TB - T2);
  // 열의 흐름 방향: +1 이면 A → B, −1 이면 B → A, 0 이면 흐르지 않는다(열평형)
  const flow = (TA, TB, eps = 1e-9) => (TA - TB > eps ? 1 : TB - TA > eps ? -1 : 0);
  const isEq = (TA, TB, eps = 0.05) => Math.abs(TA - TB) < eps;
  // 온도 변화의 크기 비 ΔT_A : ΔT_B = C_B : C_A (열용량의 역비)
  const dTratio = (C1, C2) => C2 / C1;
  // 평균 운동 에너지의 비 = 절대 온도의 비 (°C → K)
  const keRatio = (Ta, Tb) => (Ta + 273) / (Tb + 273);
  // 산술 평균(흔한 실수): 열용량이 같을 때만 열평형 온도와 같다
  const mean = (T1, T2) => (T1 + T2) / 2;

  const api = {MAT, heatCap, specific, heat, dTof, equilibrium, temps, lost, gained, flow, isEq, dTratio, keRatio, mean};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.A2_08 = api;
})(typeof window !== 'undefined' ? window : globalThis);
