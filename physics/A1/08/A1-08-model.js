/* A1-08 포물선 운동 — 계산 모형. 브라우저(window.A1_08)와 Node 테스트(tests/A1-08-model.test.cjs)에서 같이 쓴다.
   g = 10 m/s² (원고 값), 공기 저항 없음. 각도는 도(°).
   수평 투사: 높이 h 에서 수평으로 v₀. 수평 x = v₀t (등속), 낙하 거리 ½gt² (자유 낙하와 같다).
   비스듬히 던짐: 원점에서 속력 v₀, 각 θ. 위를 (+)로. x = v₀cosθ t, y = v₀sinθ t − ½gt². */
(function (root) {
  'use strict';
  const G = 10;
  const RAD = Math.PI / 180;
  const sinD = (d) => Math.sin(d * RAD);
  const cosD = (d) => Math.cos(d * RAD);

  // ── 수평 투사 (낙하 거리·연직 속도는 아래 +) ──
  const fallTime = (h, g = G) => Math.sqrt(2 * h / g);                 // 체공 시간: 높이만으로 정해진다
  const rangeH = (h, v0, g = G) => v0 * fallTime(h, g);                // 수평 도달 거리 = v₀√(2h/g)
  const posH = (v0, t, g = G) => ({x: v0 * t, drop: 0.5 * g * t * t});
  const velH = (v0, t, g = G) => ({vx: v0, vy: g * t});
  const dropAt = (t, g = G) => 0.5 * g * t * t;                        // 떨어뜨린 공이 떨어진 거리 (같은 시각이면 같다)
  const pathDrop = (v0, x, g = G) => g * x * x / (2 * v0 * v0);        // 궤적 y = gx²/(2v₀²)
  const tanAlpha = (v0, t, g = G) => g * t / (2 * v0);                 // 위치 방향: (½gt²)/(v₀t)
  const tanPhi = (v0, t, g = G) => g * t / v0;                         // 속도 방향: gt/v₀ = 2 tanα
  // 속도를 뒤로 늘인 선이 출발 높이의 수평선과 만나는 곳 (수평 이동 거리의 절반)
  function backPoint(v0, t, g = G) {
    const p = posH(v0, t, g), v = velH(v0, t, g);
    return p.x - p.drop * v.vx / v.vy;
  }
  function landing(h, v0, g = G) {
    const t = fallTime(h, g), R = v0 * t, vy = g * t, v = Math.hypot(v0, vy);
    return {t, R, vx: v0, vy, v, v2: v0 * v0 + vy * vy, tanPhi: vy / v0, tanAlpha: h / R, phi: Math.atan2(vy, v0) / RAD, alpha: Math.atan2(h, R) / RAD};
  }

  // ── 비스듬히 던짐 (위 +) ──
  const comps = (v0, th) => ({vx: v0 * cosD(th), vy: v0 * sinD(th)});
  const pos = (v0, th, t, g = G) => ({x: v0 * cosD(th) * t, y: v0 * sinD(th) * t - 0.5 * g * t * t});
  const vel = (v0, th, t, g = G) => ({vx: v0 * cosD(th), vy: v0 * sinD(th) - g * t});
  const speedAt = (v0, th, t, g = G) => { const v = vel(v0, th, t, g); return Math.hypot(v.vx, v.vy); };
  const topTime = (v0, th, g = G) => v0 * sinD(th) / g;
  const flightTime = (v0, th, g = G) => 2 * v0 * sinD(th) / g;
  const maxHeight = (v0, th, g = G) => (v0 * sinD(th)) ** 2 / (2 * g);
  const range = (v0, th, g = G) => v0 * v0 * sinD(2 * th) / g;
  const topSpeed = (v0, th) => v0 * cosD(th);                          // 최고점에서 남는 속력 (≠ 0)
  const pathY = (v0, th, x, g = G) => x * Math.tan(th * RAD) - g * x * x / (2 * v0 * v0 * cosD(th) ** 2);
  const complement = (th) => 90 - th;
  const maxRange = (v0, g = G) => v0 * v0 / g;                         // θ = 45°

  // 근호 꼴: 정수 n 이면 √n = a√b (b 는 제곱 인수 없음). 정수가 아니면 null
  function surd(n) {
    const r = Math.round(n);
    if (Math.abs(n - r) > 1e-9 || r < 0) return null;
    let a = 1, b = r;
    for (let k = Math.floor(Math.sqrt(r)); k >= 2; k--) if (r % (k * k) === 0) { a = k; b = r / (k * k); break; }
    return {a, b, text: b === 1 ? String(a) : (a === 1 ? '' : a) + '√' + b};
  }

  const api = {G, RAD, sinD, cosD, fallTime, rangeH, posH, velH, dropAt, pathDrop, tanAlpha, tanPhi, backPoint, landing,
    comps, pos, vel, speedAt, topTime, flightTime, maxHeight, range, topSpeed, pathY, complement, maxRange, surd};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.A1_08 = api;
})(typeof window !== 'undefined' ? window : globalThis);
