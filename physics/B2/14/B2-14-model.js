/* B2-14 교류 회로와 RLC 공명 — 계산 모형. 브라우저(window.B2_14)와 Node 테스트(tests/B2-14-model.test.cjs)에서 같이 쓴다.
   단위는 SI: f (Hz), R·X·Z (Ω), L (H), C (F), V (V), I (A), q (C), 각 (rad).
   회로 종류 kind: 'R' 저항만, 'L' 코일만, 'C' 축전기만, 'RLC' 세 소자 직렬. 전원 전압의 최댓값 V₀ 는 그대로 두고 진동수만 바꾼다.
   순간값은 전류를 기준으로 쓴다: i = I₀ sin θ (θ = ωt). 코일 전압은 ¼주기 앞서고(cos θ), 축전기 전압은 ¼주기 뒤진다(−cos θ). */
(function (root) {
  'use strict';
  const TAU = 2 * Math.PI;

  const XL = (f, L) => TAU * f * L;                    // 유도 리액턴스 X_L = 2πfL
  const XC = (f, C) => 1 / (TAU * f * C);              // 용량 리액턴스 X_C = 1/(2πfC)  (f > 0)
  const f0 = (L, C) => 1 / (TAU * Math.sqrt(L * C));   // 공명 진동수 f₀ = 1/(2π√(LC)) — X_L = X_C 인 진동수
  const rms = (peak) => peak / Math.SQRT2;             // 실효값 = 최댓값/√2
  const peak = (rmsValue) => rmsValue * Math.SQRT2;    // 최댓값 = 실효값 × √2 (가정용 220 V → 약 311 V)
  const f0Ratio = (kL, kC) => 1 / Math.sqrt(kL * kC);  // L 을 kL 배, C 를 kC 배 하면 f₀ 는 1/√(kL kC) 배

  // 회로에 있는 소자만의 방해 정도 (없는 소자는 0)
  function parts(kind, f, R, L, C) {
    const has = (x) => kind === x || kind === 'RLC';
    return {R: has('R') ? R : 0, XL: has('L') ? XL(f, L) : 0, XC: has('C') ? XC(f, C) : 0};
  }
  // 전체 방해 정도(임피던스, 심화) Z = √(R² + (X_L − X_C)²)
  function impedance(kind, f, R, L, C) {
    const p = parts(kind, f, R, L, C);
    return Math.hypot(p.R, p.XL - p.XC);
  }
  // 전류의 최댓값 I₀ = V₀/Z
  const current = (kind, f, V0, R, L, C) => V0 / impedance(kind, f, R, L, C);
  // 전원 전압이 전류보다 앞서는 위상 φ (rad): +90° 코일만, −90° 축전기만, 0 저항만·공명
  function phase(kind, f, R, L, C) {
    const p = parts(kind, f, R, L, C);
    return Math.atan2(p.XL - p.XC, p.R);
  }
  // 한 진동수에서 회로 전체: 각 소자 전압의 최댓값, 위상, 각진동수, 축전기 전하의 최댓값
  function state(kind, f, V0, R, L, C) {
    const p = parts(kind, f, R, L, C), Z = Math.hypot(p.R, p.XL - p.XC), I0 = V0 / Z, w = TAU * f;
    return {kind, f, V0, R: p.R, XL: p.XL, XC: p.XC, Z, I0, VR: I0 * p.R, VL: I0 * p.XL, VC: I0 * p.XC,
      phi: Math.atan2(p.XL - p.XC, p.R), w, T: 1 / f, q0: I0 / w};
  }
  // θ = ωt 일 때의 순간값. q 는 전류가 먼저 들어가는 극판의 전하 (= 도선의 한 단면을 지나간 전하)
  function instant(s, th) {
    const sn = Math.sin(th), cs = Math.cos(th);
    const i = s.I0 * sn, vR = s.VR * sn, vL = s.VL * cs, vC = -s.VC * cs;
    return {i, vR, vL, vC, v: vR + vL + vC, q: -s.q0 * cs};
  }
  // 전원 전압 v = V₀ sin(θ + φ) (키르히호프: v = v_R + v_L + v_C 와 같아야 한다)
  const sourceV = (s, th) => s.V0 * Math.sin(th + s.phi);
  // 전류가 최대인 때를 기준으로 전압이 최대가 되는 때 (주기 단위). −¼ = ¼주기 앞섬, +¼ = ¼주기 뒤짐
  const peakShift = (phi) => -phi / TAU;

  // 진동수–전류 그래프 모양으로 소자 판별: 수평 = 저항, 줄어듦 = 코일, 늘어남(원점 지나는 직선) = 축전기, 봉우리 = RLC 직렬
  function classify(fs, Is, eps = 1e-9) {
    let up = 0, down = 0;
    for (let k = 1; k < Is.length; k++) {
      const d = (Is[k] - Is[k - 1]) / Math.max(Math.abs(Is[k]), Math.abs(Is[k - 1]), 1e-300);
      if (d > eps) up++; else if (d < -eps) down++;
    }
    let shape;
    if (!up && !down) shape = 'flat';
    else if (up && !down) shape = 'up';
    else if (down && !up) shape = 'down';
    else {
      let m = 0;
      Is.forEach((v, k) => { if (v > Is[m]) m = k; });
      shape = m > 0 && m < Is.length - 1 ? 'peak' : 'mixed';
    }
    const linear = shape === 'up' && fs.every((f, k) => Math.abs(Is[k] / f - Is[0] / fs[0]) <= 1e-9 * Is[0] / fs[0]);
    const element = {flat: '저항', down: '코일', up: '축전기', peak: 'RLC 직렬', mixed: '?'}[shape];
    return {shape, element, linear};
  }

  const api = {TAU, XL, XC, f0, rms, peak, f0Ratio, parts, impedance, current, phase, state, instant, sourceV, peakShift, classify};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.B2_14 = api;
})(typeof window !== 'undefined' ? window : globalThis);
