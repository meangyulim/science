/* A2-05 포물선 운동의 역학적 에너지 — 계산 모형. 브라우저(window.A2_05)와 Node 테스트(tests/A2-05-model.test.cjs)에서 같이 쓴다.
   단위 m·kg·s·J, g = 10 m/s² (원고 값). 수평면의 한 점(높이 0)에서 던진다. 각은 도(°). 공기 저항은 무시한다.
   중력만 일을 하므로 E = K + U 가 일정하다. v² = vₓ² + v_y² 이므로 운동 에너지도 수평 몫 Kₓ = ½mvₓ² 와 연직 몫 K_y = ½mv_y² 로 나뉘고,
   vₓ 가 바뀌지 않으니 Kₓ 는 그대로, U 와 주고받는 것은 K_y 뿐이다. */
(function (root) {
  'use strict';
  const G = 10, RAD = Math.PI / 180;
  const sinD = (d) => Math.sin(d * RAD), cosD = (d) => Math.cos(d * RAD), tanD = (d) => Math.tan(d * RAD);
  const comps = (v0, th) => ({vx: v0 * cosD(th), vy: v0 * sinD(th)});
  const K0 = (m, v0) => 0.5 * m * v0 * v0;                         // 처음 운동 에너지 = 역학적 에너지 (U₀ = 0)
  const Kx = (m, v0, th) => 0.5 * m * (v0 * cosD(th)) ** 2;        // 수평 몫: 끝까지 그대로 = 최고점의 운동 에너지
  const Ky0 = (m, v0, th) => 0.5 * m * (v0 * sinD(th)) ** 2;       // 처음 연직 몫: 최고점에서 모두 U 가 된다
  const topK = Kx;
  const maxHeight = (v0, th) => (v0 * sinD(th)) ** 2 / (2 * G);
  const heightFromKy = (m, Ky) => Ky / (m * G);                    // mgH = K_y0
  const flightTime = (v0, th) => 2 * v0 * sinD(th) / G;
  const topTime = (v0, th) => v0 * sinD(th) / G;
  const range = (v0, th) => v0 * v0 * sinD(2 * th) / G;
  // 시각 t 의 위치·속도·에너지 장부
  function state(m, v0, th, t) {
    const vx = v0 * cosD(th), vy = v0 * sinD(th) - G * t;
    const x = vx * t, y = v0 * sinD(th) * t - 0.5 * G * t * t;
    const kx = 0.5 * m * vx * vx, ky = 0.5 * m * vy * vy, U = m * G * y;
    return {t, x, y, vx, vy, v: Math.hypot(vx, vy), Kx: kx, Ky: ky, K: kx + ky, U, E: kx + ky + U, phi: Math.atan2(vy, vx) / RAD};
  }
  // 높이 y 에서의 나눔 (올라갈 때·내려올 때 같다): K_y = K_y0 − mgy
  function atHeight(m, v0, th, y) {
    const kx = Kx(m, v0, th), U = m * G * y;
    return {Kx: kx, Ky: Ky0(m, v0, th) - U, U, E: K0(m, v0)};
  }
  const ratioKyKx = (phi) => tanD(phi) ** 2;                        // 운동 방향이 수평과 φ → K_y/Kₓ = tan²φ
  const tAtPhi = (v0, th, phi) => (v0 * sinD(th) - v0 * cosD(th) * tanD(phi)) / G;   // 운동 방향이 φ(위 +)인 시각
  const launchK = (m, Ktop, H) => Ktop + m * G * H;                 // 처음 운동 에너지 = 최고점 K + mgH
  const split = (K, th) => ({Kx: K * cosD(th) ** 2, Ky: K * sinD(th) ** 2});   // 같은 속력이면 각이 나눔을 정한다

  const api = {G, RAD, sinD, cosD, tanD, comps, K0, Kx, Ky0, topK, maxHeight, heightFromKy, flightTime, topTime, range, state, atHeight,
    ratioKyKx, tAtPhi, launchK, split};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.A2_05 = api;
})(typeof window !== 'undefined' ? window : globalThis);
