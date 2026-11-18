/* A2-10 열의 일당량 (줄의 실험) — 계산 모형. 브라우저(window.A2_10)와 Node 테스트(tests/A2-10-model.test.cjs)에서 같이 쓴다.
   g = 10 m/s², 열의 일당량 J = 4.2 × 10³ J/kcal (1 cal ≈ 4.2 J), 물의 비열 4200 J/(kg·K) = 1 kcal/(kg·K) (원고 값).
   등속 낙하이면 추가 잃은 퍼텐셜 에너지 Mgh 가 모두 날개를 거쳐 물의 열이 된다: NMgh = cmΔT (= J·c'mΔT, c' 는 kcal 단위). */
(function (root) {
  'use strict';
  const G = 10, JQ = 4.2e3;
  const LIQ = {water: {name: '물', c: 4200}, x: {name: '액체 X', c: 2100}};    // 액체 X: 비열이 물의 ½
  const workDrops = (N, M, h, g = G) => N * M * g * h;        // 등속 낙하 N 번: W = NMgh
  const workPull = (F, s) => F * s;                           // 일정한 힘으로 당기기: W = Fs
  const workPullVT = (F, v, t) => F * v * t;                  // 일정한 속력으로 시간 t: W = Fvt
  const dTof = (W, c, m) => W / (c * m);                      // W = cmΔT (c 는 J/(kg·K))
  const toKcal = (W) => W / JQ;                               // Q(kcal) = W/J
  const cKcal = (c) => c / JQ;                                // J/(kg·K) → kcal/(kg·K)
  const dTkcal = (W, ck, m) => toKcal(W) / (ck * m);          // kcal 로 푼 ΔT (같은 값)
  const calToJ = (cal) => 4.2 * cal;
  const slope = (c, m) => 1 / (c * m);                        // ΔT–W 그래프의 기울기 (K/J)
  // 한 번 낙하에서 물로 가는 일. 바닥 직전 속력이 v 이면 그 운동 에너지 ½Mv² 는 열이 되지 않는다(바닥 충돌로 사라짐)
  const heatPerDrop = (M, h, v = 0, g = G) => M * g * h - 0.5 * M * v * v;
  // 낙하 한 번 안에서 시간 비율 p(0~1)일 때: 떨어진 거리 d, 속력 v, 퍼텐셜 감소, 물로 간 일, 추의 운동 에너지
  // 등속(steady): d = hp. 가속(바닥 직전 vEnd): 정지에서 등가속, d = hp², a = vEnd²/(2h), 줄의 장력 M(g − a) 가 날개에 일을 한다
  function dropAt(M, h, p, mode, vEnd, g = G) {
    p = Math.max(0, Math.min(1, p));
    if (mode !== 'accel') { const d = h * p; return {d, pe: M * g * d, q: M * g * d, k: 0}; }
    const a = vEnd * vEnd / (2 * h), d = h * p * p;
    return {d, v: vEnd * p, pe: M * g * d, q: M * (g - a) * d, k: M * a * d};
  }

  const api = {G, JQ, LIQ, workDrops, workPull, workPullVT, dTof, toKcal, cKcal, dTkcal, calToJ, slope, heatPerDrop, dropAt};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.A2_10 = api;
})(typeof window !== 'undefined' ? window : globalThis);
