/* B2-06 바이어스 전압과 증폭 회로 설계 — 계산 모형. 브라우저(window.B2_06)와 Node 테스트(tests/B2-06-model.test.cjs)에서 같이 쓴다.
   단위: 전압 V, 전류 A, 저항 Ω. 신호는 v = a sin(ph) (ph = ωt, 라디안).

   장면 1 (바이어스 비교, 개념서 그림 ①의 교과서 모형): 이미터를 접지한 n-p-n 회로. 베이스–이미터 전압 v_BE = (바이어스) + (신호).
     E-B 접합이 순방향(v_BE > 0)이면 베이스 전류가 v_BE 에 비례해 흐르고(1 V 에 20 μA로 둔다), 역방향이면 끊긴다.
     문턱 전압은 생각하지 않는다(그림 ①과 같은 단순화). I_C = βI_B, I_E = I_B + I_C, V_C = V_CC − I_C R_C.
     V_C 가 V_B 아래로 내려가면(B-C 가 역방향이 아니게 되면) 증폭 조건이 깨진 것으로 보고 V_C = V_B 에서 자른다.
   장면 2 (전압 분할 바이어스, 그림 ② · 개념서 예제): 교과서 설계처럼 베이스 전류는 분압 계산에서 무시하고 I_C ≈ I_E 로 본다.
     V_B = V_CC·R₂/(R₁ + R₂), V_E = V_B − V_BE, I_E = V_E/R_E ≈ I_C, V_C = V_CC − I_C R_C, I_B = I_C/β.
     입력 신호는 축전기를 거쳐 베이스 전위에 더해진다: v_B = V_B + v.
     v_B ≤ V_BE 이면 전류가 흐르지 않는다. V_C 가 v_B 아래로 내려가면 증폭 조건이 깨진 것으로 보고 V_C = v_B 에서 자른다
     (그동안 I_C 는 더 늘지 못하고, 이미터로 더 나가는 전류는 베이스 전류가 된다). */
(function (root) {
  'use strict';
  const K1 = 20e-6;            // 장면 1: 순방향 1 V 에 베이스 전류 20 μA (비례한다고 둔 교과서 모형)
  const S1 = {Vcc: 12, Rc: 2e3, beta: 100, bias: 1.0, amp: 0.1, flip: false};
  const EX = {Vcc: 12, R1: 40e3, R2: 10e3, Vbe: 0.7, Re: 1.7e3, Rc: 5e3, beta: 100, amp: 0.1};   // 개념서 예제
  const sig = (amp, ph) => amp * Math.sin(ph);

  // ── 장면 1: 바이어스 전지 + 신호 (교과서 모형) ─────────────
  function scene1(p, v) {
    const vbe = (p.flip ? -p.bias : p.bias) + v;
    const fwd = vbe > 0;                                     // E-B 접합: p형 베이스가 n형 이미터보다 높으면 순방향
    const IB = fwd ? K1 * vbe : 0;
    let IC = p.beta * IB, VC = p.Vcc - IC * p.Rc, clip = false;
    if (fwd && VC < vbe) { clip = true; VC = vbe; IC = Math.max(0, (p.Vcc - vbe) / p.Rc); }
    return {vB: vbe, vE: 0, vbe, on: fwd, fwd, IB, IC, IE: IB + IC, VC, clip, active: fwd && !clip};
  }

  // ── 장면 2: 전압 분할 바이어스 (교과서 설계) ───────────────
  const divider = (Vcc, R1, R2) => Vcc * R2 / (R1 + R2);   // V_B = V_CC·R₂/(R₁ + R₂)
  const rcFor = (Vcc, VC, IC) => (Vcc - VC) / IC;           // R_C = (V_CC − V_C)/I_C
  const reFor = (VE, IE) => VE / IE;                         // R_E = V_E/I_E
  // 직류 동작점 (신호 없음)
  function design(p) {
    const VB = divider(p.Vcc, p.R1, p.R2), on = VB > p.Vbe;
    const VE = on ? VB - p.Vbe : 0, IE = VE / p.Re, IC = IE;            // I_C ≈ I_E (베이스 전류 무시)
    const VC = p.Vcc - IC * p.Rc, IB = IC / p.beta;
    return {VB, VE, IE, IC, IB, VC, VCE: VC - VE, VBE: on ? p.Vbe : VB, Idiv: p.Vcc / (p.R1 + p.R2), on,
      ok: on && VC > VB && VB > VE};                                    // n-p-n 증폭 조건 V_C > V_B > V_E
  }
  // 신호 v 가 더해진 순간
  function scene2(p, v) {
    const VB0 = divider(p.Vcc, p.R1, p.R2), vB = VB0 + v;
    const IR1 = (p.Vcc - vB) / p.R1, IR2 = vB / p.R2;                  // 분압 저항의 전류 (베이스 전류는 무시할 만큼 작다)
    if (vB <= p.Vbe) return {vB, vE: 0, vbe: vB, on: false, fwd: vB > 0, IB: 0, IC: 0, IE: 0, VC: p.Vcc, clip: false, active: false, IR1, IR2};
    const vE = vB - p.Vbe, IE = vE / p.Re;
    let IC = IE, VC = p.Vcc - IC * p.Rc, IB = IC / p.beta, clip = false;
    if (VC < vB) { clip = true; VC = vB; IC = Math.max(0, (p.Vcc - vB) / p.Rc); IB = IC / p.beta + (IE - IC); }
    return {vB, vE, vbe: p.Vbe, on: true, fwd: true, IB, IC, IE, VC, clip, active: !clip, IR1, IR2};
  }

  const at = (scene, p, ph) => (scene === 1 ? scene1(p, sig(p.amp, ph)) : scene2(p, sig(p.amp, ph)));

  // 한 주기 표본: 범위, 전류가 흐르는 시간 비율, 잘리는 시간 비율, 출력(직류 성분을 뺀 V_C)과 그 진폭
  function cycle(scene, p, n = 720) {
    const S = [], M = [];
    for (let i = 0; i < n; i++) {
      const ph = 2 * Math.PI * i / n, pm = 2 * Math.PI * (i + 0.5) / n;   // i/n 은 sin = ±1 을 지나고(극값), 칸 가운데는 sin = 0 을 피한다(시간 비율)
      S.push(Object.assign({ph, v: sig(p.amp, ph)}, at(scene, p, ph)));
      M.push(at(scene, p, pm));
    }
    const keys = ['vB', 'vE', 'IB', 'IC', 'IE', 'VC'], lo = {}, hi = {};
    keys.forEach((k) => { lo[k] = Math.min(...S.map((s) => s[k])); hi[k] = Math.max(...S.map((s) => s[k])); });
    const meanVC = M.reduce((a, s) => a + s.VC, 0) / n;
    S.forEach((s) => { s.out = s.VC - meanVC; });                      // 출력 축전기: 직류 성분은 막고 변하는 성분만 보낸다
    const outLo = Math.min(...S.map((s) => s.out)), outHi = Math.max(...S.map((s) => s.out));
    const fracOn = M.filter((s) => s.IC > 1e-12).length / n, fracClip = M.filter((s) => s.clip).length / n;
    const fracFwd = M.filter((s) => s.fwd).length / n;
    const meanIB = M.reduce((a, s) => a + s.IB, 0) / n;               // 입력 축전기로는 직류가 못 지나간다 → 입력 전류 = 베이스 쪽 전류의 변하는 부분
    return {S, lo, hi, meanVC, meanIB, outLo, outHi, outAmp: (outHi - outLo) / 2, fracOn, fracClip, fracFwd,
      gain: p.amp > 0 ? (outHi - outLo) / (2 * p.amp) : 0};
  }

  const api = {K1, S1, EX, sig, scene1, divider, rcFor, reFor, design, scene2, at, cycle};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.B2_06 = api;
})(typeof window !== 'undefined' ? window : globalThis);
