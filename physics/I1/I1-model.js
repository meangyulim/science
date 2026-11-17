/* 물리학Ⅰ Ⅰ-1 힘과 운동 — 14개 개념 시뮬레이션의 계산 모형.
   브라우저(window.I1Model)와 Node 테스트(tests/I1-model.test.cjs)에서 같이 쓴다.
   부호 약속: 직선 운동은 한쪽을 + 로 정한다. 연직 방향은 위가 +. g 는 예제처럼 10 m/s² 를 기본으로 쓴다. */
(function (root) {
  'use strict';
  const G = 10;

  /* 1. 위치·변위·속도 — 직선 위 왕복.
     x0 에서 출발해 legs = [{x, dt}, ...] 순서로 각 지점까지 등속으로 간다. */
  function trip(x0, legs) {
    let x = x0, dist = 0, time = 0, turns = 0, lastDir = 0;
    for (const L of legs) {
      const d = L.x - x;
      const dir = Math.sign(d);
      if (dir && lastDir && dir !== lastDir) turns++;
      if (dir) lastDir = dir;
      dist += Math.abs(d); time += L.dt; x = L.x;
    }
    const disp = x - x0;
    return {disp, dist, time, vAvg: disp / time, sAvg: dist / time, turns};
  }
  // trip 의 t 초 때 위치 (각 구간은 등속)
  function tripPos(x0, legs, t) {
    let x = x0, t0 = 0;
    for (const L of legs) {
      if (t <= t0 + L.dt) return x + (L.x - x) * (t - t0) / L.dt;
      t0 += L.dt; x = L.x;
    }
    return x;
  }

  /* 2·4. 등가속도 직선 운동. 이동 거리는 방향이 바뀌는 순간(v = 0)을 나눠서 더한다. */
  function uniform(v0, a, t) {
    const pos = (s) => v0 * s + 0.5 * a * s * s;
    const v = v0 + a * t, x = pos(t);
    let dist = Math.abs(x), tTurn = null;
    if (a !== 0) {
      const tt = -v0 / a;
      if (tt > 0 && tt < t) { tTurn = tt; dist = Math.abs(pos(tt)) + Math.abs(x - pos(tt)); }
    }
    return {v, x, dist, tTurn};
  }
  // 처음 속도 v0 으로 출발해 처음 T 초 동안 s1 을 갔다면 s1 = v0 T + ½aT² → a = 2(s1 − v0 T) / T²
  const accelFromFirst = (s1, T, v0 = 0) => 2 * (s1 - v0 * T) / (T * T);
  // n 번째 T 초 동안(시각 (n−1)T ~ nT) 간 변위 (방향 전환이 없을 때)
  const nthInterval = (v0, a, n, T) => v0 * T + 0.5 * a * T * T * (2 * n - 1);

  /* 3. 알짜힘과 속도 사이의 각(°)으로 운동을 분류한다. */
  function classify(angleDeg, F) {
    if (!F) return {kind: '등속 직선 운동', speed: '일정', dir: false};
    const c = Math.cos(angleDeg * Math.PI / 180);
    const along = Math.abs(c) > 0.999, perp = Math.abs(c) < 1e-3;
    if (along) return {kind: '등가속도 직선 운동', speed: c > 0 ? '증가' : '감소', dir: false};
    if (perp) return {kind: '등속 원운동 (속력 일정, 방향만 변함)', speed: '일정', dir: true};
    return {kind: '속력과 방향이 모두 변하는 운동', speed: c > 0 ? '증가' : '감소', dir: true};
  }

  /* 5. 같은 가속도 a 로 움직이는 A, B. A 가 기준점 P 를 vA 로 지나고 delay 초 뒤 B 가 P 를 vB 로 지난다.
     B 가 P 를 지나는 순간 둘의 간격과, 그 뒤 만날 때까지 걸리는 시간. */
  function chase(vA, vB, a, delay) {
    const gap = vA * delay + 0.5 * a * delay * delay;    // 그 순간 A 의 위치 = 간격
    const vAnow = vA + a * delay;
    const closing = vB - vAnow;                           // 가속도가 같아 상대 속도는 일정
    return {gap, vAnow, closing, tMeet: closing > 0 ? gap / closing : null};
  }

  /* 6. 가속하는 차 안에 매달린 추가 기울어지는 각: tan θ = a / g (θ 는 가속 반대쪽으로). */
  const tiltDeg = (a, g = G) => Math.atan2(a, g) * 180 / Math.PI;

  /* 7. 승강기 안 저울 눈금 N = m(g + a), a 는 위가 +.
     motion: 운동 방향 'up'|'down', change: 'speedup'|'slowdown'|'steady', rate: 매초 속력 변화. */
  function elevatorAccel(motion, change, rate) {
    if (change === 'steady' || !rate) return 0;
    const dir = motion === 'up' ? 1 : -1;
    return change === 'speedup' ? dir * rate : -dir * rate;
  }
  const scaleReading = (m, a, g = G) => Math.max(0, m * (g + a));

  /* 8. 저울 위 물체를 위에서 줄로 당길 때: 물체는 평형 → N = W − T (뜨면 0). */
  const scaleWithString = (W, T) => Math.max(0, W - T);

  /* 9. 연결된 물체.
     table: 마찰 없는 수평면 위 M 이 도르래 너머 매달린 m 과 연결.
     atwood: 도르래 양쪽에 m1, m2 (m1 쪽이 내려가는 방향을 + 로). */
  function table(M, m, g = G) {
    const a = m * g / (M + m);
    return {a, T: M * a};
  }
  function atwood(m1, m2, g = G) {
    return {a: (m1 - m2) * g / (m1 + m2), T: 2 * m1 * m2 * g / (m1 + m2)};
  }
  // 수평면에서 F 로 미는 두 물체: 앞 물체가 받는 힘 = (밀려가는 쪽 질량) × a
  function push(F, mFront, mBack) {
    const a = F / (mFront + mBack);
    return {a, contact: mFront * a};
  }

  /* 10. 실이 끊길 때 (수평면 위 X 와 매달린 Y). */
  function cut(MX, MY, g = G) {
    const before = table(MX, MY, g);
    const after = {aX: 0, aY: g};
    const dX = Math.abs(after.aX - before.a), dY = Math.abs(after.aY - before.a);
    return {before, after, dX, dY, MdX: MX * dX, MdY: MY * dY};
  }

  /* 11. 충격량. 속도는 부호 있는 값(오른쪽 +). */
  function impulse(m, v0, v, dt) {
    const I = m * (v - v0);
    return {p0: m * v0, p: m * v, I, F: I / dt};
  }

  /* 12. 같은 운동량 변화를 Δt 동안 → 평균 힘 크기. */
  const avgForce = (m, dv, dt) => m * Math.abs(dv) / dt;

  /* 13·14. 1차원 충돌. e = 1 탄성, 0 < e < 1 비탄성, e = 0 완전 비탄성(한 덩어리). */
  function collide(m1, v1, m2, v2, e) {
    const M = m1 + m2;
    const u1 = ((m1 - e * m2) * v1 + (1 + e) * m2 * v2) / M;
    const u2 = ((m2 - e * m1) * v2 + (1 + e) * m1 * v1) / M;
    const ke = (m, v) => 0.5 * m * v * v;
    return {
      v1: u1, v2: u2,
      pBefore: m1 * v1 + m2 * v2, pAfter: m1 * u1 + m2 * u2,
      keBefore: ke(m1, v1) + ke(m2, v2), keAfter: ke(m1, u1) + ke(m2, u2),
      impulseOn1: m1 * (u1 - v1),
    };
  }
  const merge = (m1, v1, m2, v2) => (m1 * v1 + m2 * v2) / (m1 + m2);

  const api = {G, trip, tripPos, uniform, accelFromFirst, nthInterval, classify, chase, tiltDeg,
    elevatorAccel, scaleReading, scaleWithString, table, atwood, push, cut, impulse, avgForce, collide, merge};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.I1Model = api;
})(typeof window !== 'undefined' ? window : globalThis);
