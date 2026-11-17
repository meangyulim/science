/* III1-02 파동 그래프 두 가지와 진행 방향 판단 — 계산 모형. 브라우저(window.III1_02)와 Node 테스트(tests/III1-02-model.test.cjs)에서 같이 쓴다.
   파동 w = {A, lambda, T, dir, xc}: 진폭 A, 파장 λ, 주기 T, 진행 방향 dir(+1 = +x 오른쪽, −1 = −x 왼쪽), t = 0 일 때 마루 하나가 x = xc 에 있다.
   y 는 위가 +. 길이 단위는 자유(페이지에서는 cm), 시간은 s. */
(function (root) {
  'use strict';
  const TAU = 2 * Math.PI;

  const speed = (lambda, T) => lambda / T;                 // v = λ/T (y-x 에서 λ, y-t 에서 T)
  const wavelength = (v, T) => v * T;                      // 같은 매질(v 일정)이면 λ ∝ T
  // 위상: 마루에서 0. 시간이 흐르면 마루가 dir 쪽으로 v t 만큼 옮겨 간다
  const phase = (x, t, w) => TAU * ((x - w.xc) / w.lambda - w.dir * t / w.T);
  const disp = (x, t, w) => w.A * Math.cos(phase(x, t, w));                          // y(x, t)
  const vel = (x, t, w) => w.A * TAU / w.T * w.dir * Math.sin(phase(x, t, w));       // ∂y/∂t = y-t 그래프의 기울기
  const slope = (x, t, w) => -w.A * TAU / w.lambda * Math.sin(phase(x, t, w));       // ∂y/∂x = y-x 그래프의 기울기
  // 파형을 진행 방향으로 d 만큼 민 모양 (= d/v 뒤의 실제 모양)
  const pushed = (x, t, w, d) => disp(x - w.dir * d, t, w);
  const sign = (v, eps = 1e-9) => (v > eps ? 1 : v < -eps ? -1 : 0);
  // 그 순간 매질 한 점의 운동: +1 위로, −1 아래로, 0 순간 정지(마루·골)
  const motion = (x, t, w) => sign(vel(x, t, w) / (w.A * TAU / w.T));
  // 거꾸로 쓰기: y-x 기울기 부호와 그 점의 운동(위 +1 / 아래 −1)으로 진행 방향을 정한다. 마루·골(기울기 0)에서는 정할 수 없다(0)
  const dirFrom = (slopeSign, moveSign) => (slopeSign === 0 || moveSign === 0 ? 0 : -slopeSign * moveSign);
  // 마루 앞쪽(진행 방향 쪽 반 파장)은 올라가고 뒤쪽은 내려간다: 마루로부터 dir 쪽으로 잰 거리 s (−λ/2 < s < λ/2) 로 판정
  //   (+1 = 앞쪽 → 올라감, −1 = 뒤쪽 → 내려감, 0 = 마루·골 위 → 순간 정지)
  const sideOfCrest = (s, lambda) => {
    const u = ((s / lambda) % 1 + 1.5) % 1 - 0.5;          // −0.5 ≤ u < 0.5 (마루 0, 골 ±0.5)
    if (Math.abs(u) < 1e-9 || Math.abs(Math.abs(u) - 0.5) < 1e-9) return 0;
    return u > 0 ? 1 : -1;
  };

  // t 일 때 마루(최대 변위) 위치들, [x0, x1] 범위
  function crests(t, w, x0, x1) {
    const base = w.xc + w.dir * speed(w.lambda, w.T) * t;
    const out = [];
    const k0 = Math.ceil((x0 - base) / w.lambda - 1e-9), k1 = Math.floor((x1 - base) / w.lambda + 1e-9);
    for (let k = k0; k <= k1; k++) out.push(base + k * w.lambda);
    return out;
  }
  const troughs = (t, w, x0, x1) => crests(t, Object.assign({}, w, {xc: w.xc + w.lambda / 2}), x0, x1);

  // 두 시점의 파형: 같은 마루로 보이는 이동 거리 d, 시간 간격 dt. 실제 이동은 d + nλ (n = 0, 1, 2, …) 일 수 있다
  const realShift = (d, lambda, n = 0) => d + n * lambda;
  const speedFromShift = (d, dt, lambda, n = 0) => realShift(d, lambda, n) / dt;
  // 한 위치를 지나가는 마루 수 = 시간 ÷ 주기 = 진행 거리 ÷ 파장
  const crestsPassing = (dt, T) => dt / T;

  const api = {TAU, speed, wavelength, phase, disp, vel, slope, pushed, sign, motion, dirFrom, sideOfCrest, crests, troughs,
    realShift, speedFromShift, crestsPassing};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.III1_02 = api;
})(typeof window !== 'undefined' ? window : globalThis);
