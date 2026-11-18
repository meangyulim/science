/* A2-09 일과 열의 전환·내부 에너지·열역학 제1법칙 — 계산 모형. 브라우저(window.A2_09)와 Node 테스트(tests/A2-09-model.test.cjs)에서 같이 쓴다.
   부호: Q = 기체가 흡수한 열(방출이면 −), W = 기체가 외부에 한 일(팽창 +, 압축 −), ΔU = 내부 에너지 변화. Q = ΔU + W.
   압력 P 는 Pa, 부피 V 는 m³, 에너지는 J. 무대의 기체는 헬륨 같은 단원자 이상 기체로 계산한다(U = 3/2·PV, 화면에는 쓰지 않는다).
   그래서 원고 예제(500 J 흡수, 1 × 10⁵ Pa, ΔV = 2 × 10⁻³ m³ → W = 200 J, ΔU = 300 J)가 그대로 맞는다. */
(function (root) {
  'use strict';
  const GAM = 5 / 3;
  const work = (P, dV) => P * dV;                 // 압력이 일정할 때 W = PΔV
  const dU = (Q, W) => Q - W;                     // 제1법칙 Q = ΔU + W → ΔU = Q − W
  const heat = (dUv, W) => dUv + W;               // Q = ΔU + W
  const U = (P, V) => 1.5 * P * V;                // 단원자 이상 기체의 내부 에너지 (온도에만 의존: PV ∝ T)

  // 과정별 결과 (처음 상태 P1, V1)
  function isobaric(P, V1, Q) { const dV = Q / (2.5 * P); return {dV, V2: V1 + dV, P2: P, W: P * dV, dU: 1.5 * P * dV, Q}; }
  function isochoric(P1, V, Q) { const dP = Q / (1.5 * V); return {dV: 0, V2: V, P2: P1 + dP, W: 0, dU: Q, Q}; }
  function adiabatic(P1, V1, V2) { const P2 = P1 * Math.pow(V1 / V2, GAM), d = U(P2, V2) - U(P1, V1); return {dV: V2 - V1, V2, P2, W: -d, dU: d, Q: 0}; }
  // 단열 과정에서 기체가 한 일 W 를 정하면 나중 부피: W = U₁(1 − (V₁/V₂)^(2/3))
  function adiabaticV2(P1, V1, W) { const r = 1 - W / U(P1, V1); return V1 / Math.pow(r, 1.5); }
  // 압축되며 열을 내보내는 과정 (개념 체크): Q, W, ΔU 가 함께 고르게 바뀌는 경로(폴리트로픽 PVⁿ = 일정).
  // U(s) = U₁ + s·ΔU, W(s) = s·W 가 되도록 V(s) = V₁(1 + sΔU/U₁)^(1.5W/ΔU) (ΔU = 0 이면 V₁·e^(1.5Ws/U₁), 등온)
  function polyPath(P1, V1, W, d, s = 1) {
    const U1 = U(P1, V1), V = Math.abs(d) < 1e-9 ? V1 * Math.exp(1.5 * W * s / U1) : V1 * Math.pow(1 + s * d / U1, 1.5 * W / d);
    return {V, P: (U1 + s * d) / (1.5 * V), W: s * W, dU: s * d, Q: s * (d + W)};
  }
  // 처음 → 나중 상태를 s(0~1) 로 잇는 경로 위의 상태
  function at(proc, o, s) {
    const {P1, V1} = o;
    if (proc === 'iso') { const r = isobaric(P1, V1, o.Q), V = V1 + s * r.dV; return {P: P1, V, W: P1 * (V - V1), dU: U(P1, V) - U(P1, V1), Q: s * o.Q}; }
    if (proc === 'isoV') { const r = isochoric(P1, V1, o.Q), P = P1 + s * (r.P2 - P1); return {P, V: V1, W: 0, dU: U(P, V1) - U(P1, V1), Q: s * o.Q}; }
    if (proc === 'adc' || proc === 'ade') { const V = V1 + s * (o.V2 - V1), P = P1 * Math.pow(V1 / V, GAM), d = U(P, V) - U(P1, V1); return {P, V, W: -d, dU: d, Q: 0}; }
    const r = polyPath(P1, V1, o.W, o.dU, s);         // 압축 + 열 방출
    return {P: r.P, V: r.V, W: r.W, dU: r.dU, Q: r.Q};
  }
  const temp = (P, V, P1, V1, T1) => T1 * (P * V) / (P1 * V1);   // PV ∝ T (이상 기체)

  // P–V 경로 아래 넓이(부호 포함, 사다리꼴): path = [[V, P], …]. 부피가 줄어드는 쪽이면 −
  function area(path) { let a = 0; for (let i = 1; i < path.length; i++) a += (path[i][1] + path[i - 1][1]) / 2 * (path[i][0] - path[i - 1][0]); return a; }
  const sgn = (x, eps = 1e-6) => (x > eps ? '+' : x < -eps ? '−' : '0');
  const signs = (Q, W, d) => ({Q: sgn(Q), W: sgn(W), dU: sgn(d)});
  const tempWord = (d, eps = 1e-6) => (d > eps ? '상승' : d < -eps ? '하강' : '그대로');

  const api = {GAM, work, dU, heat, U, isobaric, isochoric, adiabatic, adiabaticV2, polyPath, at, temp, area, sgn, signs, tempWord};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.A2_09 = api;
})(typeof window !== 'undefined' ? window : globalThis);
