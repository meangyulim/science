/* III1-03 매질이 바뀔 때: 진동수 불변, 속력과 파장 변화 — 계산 모형. 브라우저(window.III1_03)와 Node 테스트(tests/III1-03-model.test.cjs)에서 같이 쓴다.
   두 매질 m = {xb, l1, l2}: 파원(x = 0)에서 +x 로 진행, x < xb 는 매질 1(파장 l1), x > xb 는 매질 2(파장 l2).
   n = 파원이 지금까지 진동한 횟수(= f t). 마루(소리면 밀) ⇔ n − (파원에서 그 위치까지의 파장 수) 가 정수. */
(function (root) {
  'use strict';
  const TAU = 2 * Math.PI;

  const speed = (f, lambda) => f * lambda;          // v = fλ
  const wavelength = (v, f) => v / f;               // λ = v/f
  const period = (f) => 1 / f;                      // T = 1/f
  // 경계를 넘을 때: 진동수(주기)는 파원이 정해 그대로, 속력은 매질이 정하고 파장이 따라 바뀐다
  function cross(f, v1, v2) {
    const l1 = v1 / f, l2 = v2 / f;
    return {f1: f, f2: f, T1: 1 / f, T2: 1 / f, v1, v2, l1, l2, ratioV: v1 / v2, ratioL: l1 / l2};
  }
  // 파원에서 x 까지 몇 파장인가 (경계에서 이어진다)
  const waves = (x, m) => (x <= m.xb ? x / m.l1 : m.xb / m.l1 + (x - m.xb) / m.l2);
  // 거꾸로: 파장 수 X 인 곳의 위치
  const waveX = (X, m) => (X <= m.xb / m.l1 ? X * m.l1 : m.xb + (X - m.xb / m.l1) * m.l2);
  const localLambda = (x, m) => (x <= m.xb ? m.l1 : m.l2);
  // 변위 (마루에서 +A). 소리(종파)는 변위 s = A sin, 밀은 같은 위상 자리(마루 자리)
  const disp = (n, x, m, A = 1) => A * Math.cos(TAU * (n - waves(x, m)));
  // [x0, x1] 의 마루 위치들 (파원이 n 번 진동한 순간)
  function crests(n, m, x0, x1) {
    const out = [], X0 = waves(Math.max(0, x0), m), X1 = waves(x1, m);
    // n − X = k (정수) → X = n − k
    for (let k = Math.ceil(n - X1 - 1e-9); k <= Math.floor(n - X0 + 1e-9); k++) out.push(waveX(n - k, m));
    return out.sort((a, b) => a - b);
  }
  // 측정선 x 를 시간 [t0, t1) 동안 지나간 마루 수 (파원 진동수 f 일정): 어느 매질에 있든 f(t1 − t0) 개 (정수배 구간이면 정확히)
  const ceil = (v) => Math.ceil(v - 1e-9);
  const passed = (x, t0, t1, f, m) => ceil(f * t1 - waves(x, m)) - ceil(f * t0 - waves(x, m));
  // 그 구간에 마루가 지나간 시각들
  function passTimes(x, t0, t1, f, m) {
    const X = waves(x, m), out = [];
    for (let k = ceil(f * t0 - X); (k + X) / f < t1 - 1e-12; k++) out.push((k + X) / f);
    return out;
  }
  // 파원을 떠난 지 t 인 마루의 위치 (매질 1 에서는 v1, 매질 2 에서는 v2 로)
  const crestAt = (t, f, m) => waveX(f * t, m);
  // 경계에 닿기까지 걸린 시간과, 한 파장을 가는 데 걸리는 시간(어느 매질이든 T)
  const timeToBoundary = (f, m) => m.xb / (f * m.l1);
  const timePerWavelength = (f, m, side) => (side === 1 ? m.l1 : m.l2) / speed(f, side === 1 ? m.l1 : m.l2);

  // 개념서 그림 ③ 소리의 속력 (m/s)
  const SOUND = [
    {name: '공기 (0 °C)', v: 331},
    {name: '공기 (20 °C)', v: 343},
    {name: '헬륨', v: 970},
    {name: '물', v: 1500},
    {name: '철', v: 5100},
  ];

  const api = {TAU, speed, wavelength, period, cross, waves, waveX, localLambda, disp, crests, passed, passTimes, crestAt,
    timeToBoundary, timePerWavelength, SOUND};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.III1_03 = api;
})(typeof window !== 'undefined' ? window : globalThis);
