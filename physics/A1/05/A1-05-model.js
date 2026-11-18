/* A1-05 위치·변위·속도·가속도 벡터 — 계산 모형. 브라우저(window.A1_05)와 Node 테스트(tests/A1-05-model.test.cjs)에서 같이 쓴다.
   운동 하나 = 시간 t(s)의 함수 pos(t)·vel(t)·acc(t) [m, m/s, m/s²] 와 지나간 거리 dist(t) [m, t = 0 부터]. 벡터는 [x, y].
   원 궤도는 반지름 R = 2 m, 중심 (0, 0). 왼쪽 끝 (−2, 0)에서 출발해 위쪽으로(시계 방향) 돈다. g = 10 m/s² (원고 값). */
(function (root) {
  'use strict';
  const PI = Math.PI, R = 2, G = 10;
  const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
  const mul = (a, k) => [a[0] * k, a[1] * k];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
  const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
  const len = (a) => Math.hypot(a[0], a[1]);
  const angle = (a, b) => {                       // 두 벡터 사이 각 (°). 한쪽이 0 이면 NaN
    const la = len(a), lb = len(b);
    if (la < 1e-12 || lb < 1e-12) return NaN;
    return Math.acos(Math.max(-1, Math.min(1, dot(a, b) / (la * lb)))) * 180 / PI;
  };

  // 원 궤도 위 운동: 지나간 호의 길이 s(t), 속력 v(t) = s'(t), 접선 가속도 at(t) = s''(t)
  //   θ = π − s/R, 위치 = R(cos θ, sin θ), 진행 방향(접선) = (sin θ, −cos θ), 중심 쪽 = −위치/R
  function onCircle(s, v, at, T, name) {
    const th = (t) => PI - s(t) / R;
    return {
      name, T, R,
      pos: (t) => [R * Math.cos(th(t)), R * Math.sin(th(t))],
      vel: (t) => mul([Math.sin(th(t)), -Math.cos(th(t))], v(t)),
      acc: (t) => add(mul([Math.sin(th(t)), -Math.cos(th(t))], at(t)), mul([-Math.cos(th(t)), -Math.sin(th(t))], v(t) * v(t) / R)),
      dist: s,
    };
  }
  const V0 = PI / 2;                              // 반 바퀴(πR = 2π m)를 4 s → 속력 π/2 m/s
  const K = (2 * PI - 2) / 8;                     // 빨라짐·느려짐: 4 s 동안 반 바퀴, 속력 0.5 ↔ 0.5 + 4K m/s
  const VB = 0.5 + 4 * K;

  // 정사각형 ABCD (한 변 3 m, A = (0, 0) → B = (3, 0) → C = (3, 3) → D = (0, 3) → A), 속력 1.5 m/s
  const SQ = [[0, 0], [3, 0], [3, 3], [0, 3]], SQV = 1.5, SIDE = 3;
  function sqAt(t) {
    const s = ((SQV * t) % (4 * SIDE) + 4 * SIDE) % (4 * SIDE), i = Math.min(3, Math.floor(s / SIDE)), f = s / SIDE - i;
    const a = SQ[i], b = SQ[(i + 1) % 4];
    return {pos: add(a, mul(sub(b, a), f)), dir: mul(sub(b, a), 1 / SIDE)};
  }

  const PRESETS = {
    circ: onCircle((t) => V0 * t, () => V0, () => 0, 8, '원 · 일정한 속력'),
    fast: onCircle((t) => 0.5 * t + K * t * t / 2, (t) => 0.5 + K * t, () => K, 4, '원 · 빨라짐'),
    slow: onCircle((t) => VB * t - K * t * t / 2, (t) => VB - K * t, () => -K, 4, '원 · 느려짐'),
    square: {name: '정사각형 둘레', T: 8, pos: (t) => sqAt(t).pos, vel: (t) => mul(sqAt(t).dir, SQV), acc: () => [0, 0], dist: (t) => SQV * t},
    throw: {name: '위로 던진 공', T: 2, pos: (t) => [0, 10 * t - G * t * t / 2], vel: (t) => [0, 10 - G * t], acc: () => [0, -G],
      dist: (t) => (t <= 1 ? 10 * t - 5 * t * t : 5 + 5 * (t - 1) * (t - 1))},
  };

  // 구간 [t1, t2] 의 변위·이동 거리·평균
  const disp = (m, t1, t2) => sub(m.pos(t2), m.pos(t1));                       // Δr = r₂ − r₁
  const distance = (m, t1, t2) => m.dist(t2) - m.dist(t1);                     // 경로 길이
  const avgVel = (m, t1, t2) => mul(disp(m, t1, t2), 1 / (t2 - t1));           // 평균 속도 = Δr/Δt
  const avgSpeed = (m, t1, t2) => distance(m, t1, t2) / (t2 - t1);             // 평균 속력 = 거리/시간
  const dV = (m, t1, t2) => sub(m.vel(t2), m.vel(t1));                         // Δv = v₂ − v₁
  const avgAcc = (m, t1, t2) => mul(dV(m, t1, t2), 1 / (t2 - t1));             // 평균 가속도 = Δv/Δt
  // 할선(P→Q)과 P 의 접선(순간 속도) 사이 각 (°)
  const chordAngle = (m, t, dt) => angle(disp(m, t, t + dt), m.vel(t));

  // 가속도를 속도에 나란한 성분 a∥(부호 있음: + 빨라짐, − 느려짐)과 수직 성분 a⊥(크기, 방향만 바꿈)으로 나눈다
  function parts(m, t) {
    const v = m.vel(t), a = m.acc(t), sp = len(v);
    if (sp < 1e-9) return {v, a, speed: 0, par: NaN, perp: NaN, ang: NaN, kind: 'rest'};
    const u = mul(v, 1 / sp), par = dot(a, u), perp = Math.abs(cross(u, a));
    const kind = len(a) < 1e-12 ? 'none' : Math.abs(par) < 1e-9 ? 'turn' : par > 0 ? 'faster' : 'slower';
    return {v, a, speed: sp, par, perp, ang: angle(v, a), kind, u};
  }

  const api = {PI, R, G, V0, K, VB, add, sub, mul, dot, cross, len, angle, PRESETS, disp, distance, avgVel, avgSpeed, dV, avgAcc, chordAngle, parts};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.A1_05 = api;
})(typeof window !== 'undefined' ? window : globalThis);
