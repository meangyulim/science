/* B2-13 상호 유도·자체 유도와 변압기, 그 이용 — 계산 모형. 브라우저(window.B2_13)와 Node 테스트(tests/B2-13-model.test.cjs)에서 같이 쓴다.
   원고 기호: 상호 유도 ε₂ = −M ΔI₁/Δt, 자체 유도 ε = −L ΔI/Δt, 변압기 V₁/V₂ = N₁/N₂ = I₂/I₁, 송전 손실 P손실 = (P/V)²R.
   단위: A, V, Ω, H, s, W. 2차 전류의 부호는 「1차와 같은 방향 = +」(렌츠: 1차 전류가 늘면 −, 줄면 +). */
(function (root) {
  'use strict';

  // ── 상호 유도 · 자체 유도 ───────────────────────────────
  const mutualEmf = (M, dI1) => -M * dI1;          // ε₂ = −M ΔI₁/Δt
  const selfEmf = (L, dI) => -L * dI;              // ε = −L ΔI/Δt
  const henry = (emf, rate) => Math.abs(emf / rate);   // 1 H = 1 A/s 로 변할 때 1 V
  // 렌츠 법칙: 1차 전류(자속)가 늘면 2차는 반대 방향, 줄면 같은 방향, 그대로면 전류 없음
  function direction(dI1, eps = 1e-9) { return dI1 > eps ? 'opposite' : dI1 < -eps ? 'same' : 'none'; }

  // 그림 ① 의 1차 전류: 0~1 s 증가(+2 A/s) → 1~3 s 일정(2 A) → 3~5 s 감소(−1 A/s) → 5~6 s 0. 6 s 마다 되풀이
  const RAMP = [
    {t0: 0, t1: 1, I0: 0, k: 2, name: '증가'},
    {t0: 1, t1: 3, I0: 2, k: 0, name: '일정'},
    {t0: 3, t1: 5, I0: 2, k: -1, name: '감소'},
    {t0: 5, t1: 6, I0: 0, k: 0, name: '0'},
  ];
  const RAMP_T = 6;
  function ramp(t) {
    const u = ((t % RAMP_T) + RAMP_T) % RAMP_T;
    let i = RAMP.findIndex((q) => u < q.t1);
    if (i < 0) i = RAMP.length - 1;
    const q = RAMP[i];
    return {I: q.I0 + q.k * (u - q.t0), dI: q.k, seg: i, u};
  }

  // 코일이 있는 회로(RL): 전류가 지금 값 Is 에서 목표 Ia 로 서서히 다가간다. τ = L/R, dt = 바뀐 뒤 지난 시간
  function rl(Is, Ia, tau, dt) {
    if (!(dt > 0)) return {I: Is, dI: dt === 0 ? -(Is - Ia) / tau : 0};
    const e = Math.exp(-dt / tau);
    return {I: Ia + (Is - Ia) * e, dI: -(Is - Ia) / tau * e};
  }
  // 교류: I = I₀ sin(2πt/T), ΔI/Δt = I₀(2π/T) cos(2πt/T)
  function ac(I0, T, t) {
    const w = 2 * Math.PI / T;
    return {I: I0 * Math.sin(w * t), dI: I0 * w * Math.cos(w * t)};
  }

  // 자체 유도 실험: 전지 E, 같은 저항 R 의 두 갈래 (전구 A + 코일 L, 전구 B + 저항).
  //  닫음: B 는 바로 E/R, A 는 0 → E/R 로 서서히 (코일의 역기전력 ε = −L ΔI_A/Δt).
  //  엶: 전지가 빠지고 코일 전류가 A → B 로 이어진 고리(저항 2R)를 돌며 줄어든다 (B 의 전류는 거꾸로).
  function branches(E, R, L, closed, Is, dt) {
    if (closed) {
      const a = rl(Is, E / R, L / R, dt);
      return {IA: a.I, dIA: a.dI, IB: E / R, emf: selfEmf(L, a.dI), Ibat: a.I + E / R};
    }
    const a = rl(Is, 0, L / (2 * R), dt);
    return {IA: a.I, dIA: a.dI, IB: -a.I, emf: selfEmf(L, a.dI), Ibat: 0};
  }

  // ── 변압기 (이상적: 에너지 손실 없음) ────────────────────
  // V₂ = V₁N₂/N₁, I₂ = V₂/R, V₁I₁ = V₂I₂ → I₁ = I₂N₂/N₁. 1회 감은 도선마다 전압 = ΔΦ/Δt = V/N (두 코일 같음)
  function transformer(V1, N1, N2, R) {
    const V2 = V1 * N2 / N1, I2 = V2 / R, P2 = V2 * I2, I1 = P2 / V1;
    return {V2, I2, I1, P1: V1 * I1, P2, perTurn: V1 / N1, perTurn2: V2 / N2};
  }
  const wrongI1 = (I2, N1, N2) => I2 * N1 / N2;   // 자주 하는 실수: 전류도 감은 수에 비례한다고 보면
  // 직류는 자속을 바꾸지 못한다 → 2차 전압 0
  const dcV2 = () => 0;

  // ── 송전 ───────────────────────────────────────────────
  // 같은 전력 P 를 송전 전압 V 로 보낼 때: I = P/V, P손실 = I²R = (P/V)²R, 송전선 양 끝 전압 = IR
  function transmission(P, V, R) {
    const I = P / V, loss = I * I * R;
    return {I, loss, delivered: P - loss, frac: loss / P, drop: I * R, wrong: V * V / R};
  }
  const lossRatio = (Vfrom, Vto) => (Vfrom / Vto) ** 2;   // Vfrom → Vto 로 바꾸면 손실은 몇 배

  const api = {mutualEmf, selfEmf, henry, direction, RAMP, RAMP_T, ramp, rl, ac, branches,
    transformer, wrongI1, dcV2, transmission, lossRatio};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.B2_13 = api;
})(typeof window !== 'undefined' ? window : globalThis);
