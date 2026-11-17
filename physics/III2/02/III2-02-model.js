/* III2-02 광전 효과의 실험 사실과 파동설의 한계 — 계산 모형. 브라우저(window.III2_02)와 Node 테스트(tests/III2-02-model.test.cjs)에서 같이 쓴다.
   빛 하나 = {id, r: 진동수 f/f₀, I: 세기 0~1(단위 시간당 광자 수에 비례), on}. 금속의 일함수 W 는 eV.
   상수는 원고 값: h = 6.6 × 10⁻³⁴ J·s, c = 3 × 10⁸ m/s, e = 1.6 × 10⁻¹⁹ C. */
(function (root) {
  'use strict';
  const h = 6.6e-34, c = 3e8, e = 1.6e-19;
  const METALS = {Na: {name: '나트륨', W: 2.3}, Zn: {name: '아연', W: 4.3}};
  const f0 = (W) => W * e / h;                          // 문턱 진동수 f₀ = W/h (Hz)
  const lambdaNm = (r, W) => c / (r * f0(W)) * 1e9;      // 그 빛의 파장 (nm)
  const photonEV = (r, W) => r * W;                      // 광자 1개의 에너지 hf = (f/f₀)·hf₀ = (f/f₀)·W (eV)
  const emits = (r) => r >= 1 - 1e-12;                   // 방출 여부: 진동수가 문턱 이상인가 (세기와 무관)
  const kmax = (r, W) => (emits(r) ? W * (r - 1) : 0);   // 광전자의 최대 운동 에너지 hf − W (eV), 세기와 무관

  // 빛 하나의 결과: 광전자 수(단위 시간당)는 세기에 비례, 최대 운동 에너지는 진동수가 정한다
  function one(L, W) {
    const ok = L.on !== false && L.I > 0 && emits(L.r);
    return {emits: ok, kmax: ok ? kmax(L.r, W) : 0, rate: ok ? L.I : 0};
  }
  // 여러 빛을 함께: 빛마다 따로 판정 → 광전자 수는 문턱을 넘는 빛들의 합, 최대 운동 에너지는 그중 가장 큰 진동수가 정한다
  function combine(lights, W) {
    let rate = 0, k = 0;
    const by = [];
    for (const L of lights) {
      const o = one(L, W);
      if (!o.emits) continue;
      rate += o.rate; k = Math.max(k, o.kmax); by.push(L.id);
    }
    return {emits: by.length > 0, rate, kmax: k, by};
  }

  // 파동설의 예측(실제와 다름): 세기 = 에너지가 들어오는 빠르기. 전자 하나에 에너지가 계속 쌓여 W 가 되면 나온다.
  const WAVE_K = 1;                                       // 세기 1 일 때 전자 하나에 1초마다 쌓인다고 가정한 에너지 (eV) — 비교용
  function waveTheory(lights, W) {
    const P = lights.reduce((s, L) => s + (L.on !== false ? Math.max(0, L.I) : 0), 0);
    if (!(P > 0)) return {emits: false, delay: Infinity, kRel: 0};
    return {emits: true, delay: W / (WAVE_K * P), kRel: P};   // 진동수와 상관없이 언젠가 나오고, 약하면 늦게, 세면 더 빠른 전자
  }
  const waveStored = (P, t) => WAVE_K * P * t;           // 파동설: t 초 동안 쌓인 에너지 (eV)

  // 검전기: 전하 q (처음 (−)대전 = −1, 중성 = 0). 광전자 하나가 빠질 때마다 + 쪽으로.
  // (+)가 커지면 튀어나온 전자를 다시 끌어당겨 Q_CAP 근처에서 더 늘지 않는다.
  const SCOPE_RATE = 0.22, Q_CAP = 0.45;
  function scopeCharge(q0, L, t) {
    if (!(L.I > 0) || !emits(L.r)) return q0;
    return Math.min(Math.max(q0, Q_CAP), q0 + SCOPE_RATE * L.I * t);
  }
  const leafAngle = (q) => 5 + 33 * Math.min(1, Math.abs(q));   // 금속박이 벌어진 각 (도) — 전하량이 클수록 크다

  const api = {h, c, e, METALS, f0, lambdaNm, photonEV, emits, kmax, one, combine, WAVE_K, waveTheory, waveStored,
    SCOPE_RATE, Q_CAP, scopeCharge, leafAngle};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.III2_02 = api;
})(typeof window !== 'undefined' ? window : globalThis);
