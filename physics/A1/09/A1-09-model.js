/* A1-09 상대 운동과 빗면 좌표계 — 계산 모형. 브라우저(window.A1_09)와 Node 테스트(tests/A1-09-model.test.cjs)에서 같이 쓴다.
   g = 10 m/s² (원고 값), 공기 저항 없음. 벡터는 [x, y] (위 +), 각도는 도(°).
   X 에서 본 Y 의 상대 위치·속도는 Y − X. 두 물체가 같은 중력을 받으면 상대 가속도가 0 이라 상대 운동은 등속 직선 운동이다. */
(function (root) {
  'use strict';
  const G = 10;
  const RAD = Math.PI / 180;
  const sinD = (d) => Math.sin(d * RAD);
  const cosD = (d) => Math.cos(d * RAD);
  const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
  const mul = (a, k) => [a[0] * k, a[1] * k];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
  const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
  const norm = (a) => Math.hypot(a[0], a[1]);

  // ── 중력장 속 운동 (지면 좌표계) ──
  const posAt = (p0, v0, t, g = G) => [p0[0] + v0[0] * t, p0[1] + v0[1] * t - 0.5 * g * t * t];
  const velAt = (v0, t, g = G) => [v0[0], v0[1] - g * t];
  const freeDrop = (t, g = G) => 0.5 * g * t * t;                 // 중력이 없을 때의 길에서 아래로 처진 거리
  // X 에서 본 Y (중력 항 −½gt² 이 양쪽에서 지워져 처음 상대 위치 + 처음 상대 속도 × t 만 남는다)
  const relPos = (pX0, vX0, pY0, vY0, t, g = G) => sub(posAt(pY0, vY0, t, g), posAt(pX0, vX0, t, g));
  const relVelAt = (vX0, vY0, t, g = G) => sub(velAt(vY0, t, g), velAt(vX0, t, g));
  // 땅(y = 0)에 닿는 시각
  const groundTime = (y0, vy0, g = G) => (vy0 + Math.sqrt(Math.max(0, vy0 * vy0 + 2 * g * y0))) / g;
  // 상대 속도 직선까지의 수직 거리 (최소 거리)
  const missDistance = (r0, u) => Math.abs(cross(r0, u)) / norm(u);

  // 만남 판정: A 에서 본 B. r0 = B 의 처음 상대 위치(pB0 − pA0), u = 상대 속도(vB0 − vA0)
  function meet(pA0, vA0, pB0, vB0, g = G) {
    const r0 = sub(pB0, pA0), u = sub(vB0, vA0), d0 = norm(r0), su = norm(u);
    let tMin = su > 1e-12 ? -dot(r0, u) / (su * su) : 0;
    if (tMin < 0) tMin = 0;
    const dMin = norm(add(r0, mul(u, tMin)));
    const toward = su > 1e-12 && d0 > 1e-12 && Math.abs(cross(r0, u)) <= 1e-9 * d0 * su && dot(r0, u) < 0;
    const t = toward ? d0 / su : NaN;
    const point = toward ? posAt(pA0, vA0, t, g) : null;
    // 땅에 먼저 닿는가 (둘 중 먼저 닿는 시각과 견준다)
    const tg = Math.min(groundTime(pA0[1], vA0[1], g), groundTime(pB0[1], vB0[1], g));
    const before = toward && t <= tg + 1e-9;
    return {r0, u, d0, speed: su, toward, t, point, tMin, dMin, tGround: tg, meets: before};
  }
  // 같은 높이에서 마주 보고 수평으로 던진 두 공 (개념 체크): 만나는 시간과 그동안 떨어진 거리
  function headOn(d, vA, vB, g = G) { const t = d / (vA + vB); return {t, drop: freeDrop(t, g)}; }

  // ── 빗면 좌표계 (경사각 α) ── e∥ = (cosα, sinα) 빗면 위쪽, e⊥ = (−sinα, cosα) 빗면 수직 바깥쪽
  const gAlong = (al, g = G) => g * sinD(al);                     // 빗면 방향 (아래쪽으로) 크기
  const gPerp = (al, g = G) => g * cosD(al);                      // 빗면 수직 (빗면 쪽으로) 크기
  const returnTime = (vp, al, g = G) => 2 * vp / gPerp(al, g);     // 다시 빗면에 닿는 시간 T = 2v⊥/(g cosα)
  const farTime = (vp, al, g = G) => vp / gPerp(al, g);            // 빗면에서 가장 먼 순간 (T/2)
  const farDist = (vp, al, g = G) => vp * vp / (2 * gPerp(al, g)); // 그때 빗면까지 거리
  // 빗면 좌표 (s: 빗면 방향, n: 빗면 수직)
  const inclinePos = (vq, vp, al, t, g = G) => ({s: vq * t - 0.5 * gAlong(al, g) * t * t, n: vp * t - 0.5 * gPerp(al, g) * t * t});
  const inclineVel = (vq, vp, al, t, g = G) => ({s: vq - gAlong(al, g) * t, n: vp - gPerp(al, g) * t});
  const toWorld = (s, n, al) => [s * cosD(al) - n * sinD(al), s * sinD(al) + n * cosD(al)];
  // 빗면 위를 마찰 없이 미끄러지는 물체 (빗면 방향 가속도 g sinα 로 공과 같다)
  const slideS = (vq, al, t, g = G) => vq * t - 0.5 * gAlong(al, g) * t * t;

  const api = {G, RAD, sinD, cosD, add, sub, mul, dot, cross, norm, posAt, velAt, freeDrop, relPos, relVelAt, groundTime, missDistance, meet, headOn,
    gAlong, gPerp, returnTime, farTime, farDist, inclinePos, inclineVel, toWorld, slideS};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.A1_09 = api;
})(typeof window !== 'undefined' ? window : globalThis);
