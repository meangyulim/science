/* A1-07 중력장에서의 직선 운동 — 계산 모형. 브라우저(window.A1_07)와 Node 테스트(tests/A1-07-model.test.cjs)에서 같이 쓴다.
   g = 10 m/s² (원고 값), 공기 저항 없음.
   위로 던짐: 위를 (+)로. v = v₀ − gt, y = v₀t − ½gt² (가속도 −g).
   떨어뜨림·아래로 던짐: 아래를 (+)로. v = v₀ + gt, 낙하 거리 = v₀t + ½gt². */
(function (root) {
  'use strict';
  const G = 10;

  // ── 위로 던짐 (위 +) ──
  const vUp = (v0, t, g = G) => v0 - g * t;
  const yUp = (v0, t, g = G) => v0 * t - 0.5 * g * t * t;
  const topTime = (v0, g = G) => v0 / g;                 // t₁ = v₀/g
  const flightTime = (v0, g = G) => 2 * v0 / g;          // t₂ = 2v₀/g (올라간 시간 + 내려온 시간)
  const maxHeight = (v0, g = G) => v0 * v0 / (2 * g);    // H = v₀²/2g
  const v0FromFlight = (T, g = G) => g * T / 2;          // 체공 시간에서 처음 속력
  // 높이 y 를 지나는 두 시각 (올라갈 때, 내려올 때). 합은 늘 2t₁ (최고점 기준 대칭)
  function timesAtHeight(v0, y, g = G) {
    const d = v0 * v0 - 2 * g * y;
    if (d < -1e-12) return [];
    const r = Math.sqrt(Math.max(0, d));
    return [(v0 - r) / g, (v0 + r) / g];
  }
  const speedAtHeight = (v0, y, g = G) => Math.sqrt(Math.max(0, v0 * v0 - 2 * g * y));   // v² = v₀² − 2gy
  const mirrorTime = (v0, t, g = G) => 2 * topTime(v0, g) - t;                              // 같은 높이의 짝 시각
  // v–t 그래프 넓이: 0~t 사이 위쪽 넓이(+), 아래쪽 넓이(−), 합(= 지금 높이)
  function areas(v0, t, g = G) {
    const t1 = topTime(v0, g), a = Math.min(t, t1);
    const pos = yUp(v0, a, g);
    const neg = t > t1 ? yUp(v0, t, g) - maxHeight(v0, g) : 0;
    return {pos, neg, net: pos + neg};
  }

  // ── 떨어뜨림·아래로 던짐 (아래 +) ──
  const vDown = (v0, t, g = G) => v0 + g * t;
  const fallDist = (v0, t, g = G) => v0 * t + 0.5 * g * t * t;
  const fallTime = (h, v0 = 0, g = G) => (-v0 + Math.sqrt(v0 * v0 + 2 * g * h)) / g;
  const vFromHeight = (h, g = G) => Math.sqrt(2 * g * h);                                   // v² = 2gh
  // 같은 시간 간격 T 마다 떨어진 거리 (n 구간)
  const intervals = (n, T = 1, v0 = 0, g = G) => Array.from({length: n}, (_, k) => fallDist(v0, (k + 1) * T, g) - fallDist(v0, k * T, g));
  const ratios = (arr) => arr.map((d) => d / arr[0]);
  const stepDiff = (T = 1, g = G) => g * T * T;          // 이웃한 구간 거리 차 = gT² (처음 속도와 무관)

  // ── 질량과 가속도: 무거우면 중력도 크고 관성(질량)도 크다 → a = mg/m = g ──
  const weight = (m, g = G) => m * g;
  const accelOf = (m, g = G) => weight(m, g) / m;

  const api = {G, vUp, yUp, topTime, flightTime, maxHeight, v0FromFlight, timesAtHeight, speedAtHeight, mirrorTime, areas,
    vDown, fallDist, fallTime, vFromHeight, intervals, ratios, stepDiff, weight, accelOf};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.A1_07 = api;
})(typeof window !== 'undefined' ? window : globalThis);
