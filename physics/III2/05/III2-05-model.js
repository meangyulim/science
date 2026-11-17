/* III2-05 영상 정보의 기록: 전하 결합 소자(CCD) — 계산 모형. 브라우저(window.III2_05)와 Node 테스트(tests/III2-05-model.test.cjs)에서 같이 쓴다.
   약속: 빛의 세기는 상댓값(0~2). 세기 1 인 빛은 화소 하나에 1초에 K 개의 광자를 보내고, 필터를 통과한 광자 하나가 전자 하나를 만든다(그림용 단위).
   한 화소의 전자 수 = K × (필터를 통과한 빛의 세기 합) × 노출 시간 — 진동수와는 관계없다(띠 간격만 넘으면). */
(function (root) {
  'use strict';
  const K = 4;                                       // 세기 1, 1초 → 전자 4개
  const COLORS = ['R', 'G', 'B'];
  const NAME = {R: '빨강', G: '초록', B: '파랑'};
  const NM = {R: 650, G: 530, B: 450};               // 대표 파장 (nm)

  // 필터: 'R'·'G'·'B' 는 그 색만 통과, null 이면(필터 없음) 모두 통과
  const passes = (filter, color) => !filter || filter === color;
  // 화소 하나에 쌓이는 전자 수
  const electrons = (light, T, filter) => K * T * COLORS.reduce((s, c) => s + (passes(filter, c) ? (light[c] || 0) : 0), 0);
  // 필터 색마다 화소의 전자 수
  const counts = (light, T, filtersOn = true) => ({
    R: electrons(light, T, filtersOn ? 'R' : null), G: electrons(light, T, filtersOn ? 'G' : null), B: electrons(light, T, filtersOn ? 'B' : null)});
  // 전자가 생긴 화소의 필터 색 = 입사광에 든 색
  const detect = (c) => COLORS.filter((k) => c[k] > 0);
  // 필터 배열: 줄마다 한 칸씩 엇갈림 → 어느 줄에나 빨강·초록·파랑이 있다
  const filterAt = (row, col) => COLORS[((col + row) % 3 + 3) % 3];

  // 광자 도착: 화소 하나에 초당 rate 개가 (j + phase)/rate 시각에 도착할 때 [t0, t0 + T) 동안 도착하는 수
  const arrivals = (rate, t0, T, phase) => (rate > 0 ? Math.ceil(rate * (t0 + T) - phase - 1e-9) - Math.ceil(rate * t0 - phase - 1e-9) : 0);

  // 3상 CCD: 화소 하나에 전극 3개. 전압 패턴(1 = (+), 0 = 0 V)을 6단계로 바꾸면 전자 묶음이 한 화소(전극 3칸) 옮겨진다.
  //   ① (+,0,0) 첫 전극 아래 모임 → ② (+,+,0) 두 전극 아래로 퍼짐 → ③ (0,+,0) 둘째 전극 아래로 이동 → …
  const PHASES = [[1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 1, 1], [0, 0, 1], [1, 0, 1]];
  const volt = (e, step) => PHASES[((step % 6) + 6) % 6][((e % 3) + 3) % 3];      // 전극 e 의 전압 (출력 전극 = 3N 번, 0번 전극과 같은 박자)
  // 처음 전극 e0 아래에 있던 전자 묶음이 step 단계 뒤 차지하는 전극들 (전압이 (+)이고 서로 이어진 전극)
  function span(e0, step) {
    const c = e0 + step / 2;
    return Number.isInteger(c) ? [c, c] : [Math.floor(c), Math.ceil(c)];
  }
  const readStep = (p, N) => 6 * (N - p);            // 화소 p 의 묶음이 출력(전극 3N)에 닿는 단계
  const readOrder = (N) => Array.from({length: N}, (_, k) => N - 1 - k);   // 출력에 가까운 화소부터 읽힌다

  // 전하량 → 디지털 값 (0~255). 그림에서는 전자 16개 = 255
  const NREF = 16;
  const digital = (n) => Math.round(255 * Math.min(1, n / NREF));
  const reconstruct = (c) => ({r: digital(c.R), g: digital(c.G), b: digital(c.B)});

  const api = {K, COLORS, NAME, NM, passes, electrons, counts, detect, filterAt, arrivals, PHASES, volt, span, readStep, readOrder, NREF, digital, reconstruct};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.III2_05 = api;
})(typeof window !== 'undefined' ? window : globalThis);
