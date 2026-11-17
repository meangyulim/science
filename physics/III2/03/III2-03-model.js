/* III2-03 광양자설과 광전 방정식 — 계산 모형. 브라우저(window.III2_03)와 Node 테스트(tests/III2-03-model.test.cjs)에서 같이 쓴다.
   에너지는 eV, 전압은 V, 진동수는 Hz. V 는 K 에 대한 P 의 전압: + 면 광전자를 당기고, − 면(역전압) 되돌려 보낸다.
   상수는 원고 값: h = 6.6 × 10⁻³⁴ J·s, c = 3 × 10⁸ m/s, e = 1.6 × 10⁻¹⁹ C. */
(function (root) {
  'use strict';
  const h = 6.6e-34, c = 3e8, e = 1.6e-19;
  const METALS = [
    {id: 'A', name: '금속 A', W: 2.0},
    {id: 'B', name: '금속 B', W: 4.0},
    {id: 'Na', name: '나트륨', W: 2.3},
    {id: 'Zn', name: '아연', W: 4.3},
  ];
  const metal = (id) => METALS.find((m) => m.id === id) || METALS[0];
  const freq = (E) => E * e / h;                     // 광자 에너지 E(eV) → 진동수 f (Hz)
  const photonEV = (f) => h * f / e;                 // E = hf (eV)
  const lambdaNm = (E) => h * c / (E * e) * 1e9;     // 광자 에너지 → 파장 (nm)
  const f0 = (W) => W * e / h;                       // W = hf₀ → 문턱 진동수
  const emits = (E, W) => E >= W - 1e-12;            // hf ≥ W 여야 전자가 나온다
  const kmax = (E, W) => E - W;                      // 광전 방정식 E_k,max = hf − W (음수면 방출 없음)
  const stopV = (E, W) => Math.max(0, E - W);        // eV_s = E_k,max → 정지 전압 V_s (V)
  const kmaxF = (f, W) => photonEV(f) - W;           // E_k,max–f 직선: 기울기 h, 가로 절편 f₀, 세로 절편 −W

  // 광전류–전압 곡선 (I: 세기 상댓값). 역전압이 V_s 이상이면 0, 당기는 쪽으로 갈수록 포화(∝ 세기)
  const ROUND = 0.8;                                 // 곡선이 둥글게 꺾이는 정도 (V)
  function current(V, E, W, I) {
    if (!emits(E, W) || !(I > 0)) return 0;
    const Vs = stopV(E, W);
    if (V <= -Vs + 1e-12) return 0;
    return I * (1 - Math.exp(-(V + Vs) / ROUND));
  }
  // 광전자 하나의 P 쪽 운동 에너지 Ef. 가장 빠른 것이 E_k,max 이고 깊은 곳·비스듬히 나온 전자는 더 작다.
  // Ef = E_k,max − X (X: 평균 ROUND 인 지수 분포) — 이렇게 뽑으면 P 에 닿는 비율이 current() 곡선과 같아진다.
  const sampleEf = (rand, E, W) => kmax(E, W) + ROUND * Math.log(1 - rand());
  const reaches = (Ef, V) => Ef + V > 1e-12;        // P 에 닿으려면 Ef + eV > 0 (역전압이면 전기력이 eV 만큼 일을 빼앗음)
  const turnFrac = (Ef, V) => (V < 0 && !reaches(Ef, V) ? Math.max(0, Ef) / -V : 1);   // 되돌아서는 곳 (K→P 거리 비율)

  const api = {h, c, e, METALS, metal, freq, photonEV, lambdaNm, f0, emits, kmax, stopV, kmaxF, ROUND, current, sampleEf, reaches, turnFrac};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.III2_03 = api;
})(typeof window !== 'undefined' ? window : globalThis);
