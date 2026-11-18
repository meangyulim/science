/* A1-06 평면 위 등가속도 운동 — 계산 모형. 브라우저(window.A1_06)와 Node 테스트(tests/A1-06-model.test.cjs)에서 같이 쓴다.
   운동 p = {r0, v0, a, T}: 처음 위치 r0 (m), 처음 속도 v0 (m/s), 일정한 가속도 a (m/s²), P → Q 걸린 시간 T (s). 벡터는 [x, y].
   r(t) = r0 + v0 t + ½ a t², v(t) = v0 + a t. x, y 성분은 서로 간섭하지 않고 각자 등가속도 직선 운동을 한다(공통 변수는 t 뿐). */
(function (root) {
  'use strict';
  const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
  const mul = (a, k) => [a[0] * k, a[1] * k];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
  const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
  const len = (a) => Math.hypot(a[0], a[1]);

  const pos = (p, t) => [p.r0[0] + p.v0[0] * t + p.a[0] * t * t / 2, p.r0[1] + p.v0[1] * t + p.a[1] * t * t / 2];
  const vel = (p, t) => add(p.v0, mul(p.a, t));

  // 두 지점의 속도와 걸린 시간만으로: 가속도 = Δv/Δt, 변위 = (처음 + 나중)/2 × 시간 (성분마다. 가속도가 들어 있지 않다)
  const accFrom = (vP, vQ, dt) => mul(sub(vQ, vP), 1 / dt);
  const dispFrom = (vP, vQ, dt) => mul(add(vP, vQ), dt / 2);
  // 성분 i(0 = x, 1 = y)의 꼭짓점: 그 성분 속도가 0 인 시각 (그 성분 가속도가 0 이면 NaN)
  const vertexTime = (p, i) => (Math.abs(p.a[i]) < 1e-12 ? NaN : -p.v0[i] / p.a[i]);
  // 같은 시간 간격 dt 마다 성분 i 가 간 거리 (n 개)
  function gaps(p, i, dt, n, t0 = 0) {
    const out = [];
    for (let k = 0; k < n; k++) out.push(pos(p, t0 + (k + 1) * dt)[i] - pos(p, t0 + k * dt)[i]);
    return out;
  }
  // 가속도 방향 축(â)과 그에 수직인 축(n̂)으로 본 좌표: w(수직, t 의 1차식) · u(가속도 방향, t 의 2차식)
  function frame(p) { const L = len(p.a), ah = mul(p.a, 1 / L); return {ah, nh: [ah[1], -ah[0]]}; }
  function wu(p, t) { const f = frame(p), r = sub(pos(p, t), p.r0); return [dot(r, f.nh), dot(r, f.ah)]; }
  const straight = (p) => len(p.a) < 1e-12 || Math.abs(cross(p.v0, p.a)) < 1e-9;     // 처음 속도가 가속도와 나란하면 직선
  // 경로가 접선에서 벗어나는 쪽: r(t + h) − r(t) − v(t) h = ½ a h² → 늘 가속도 쪽으로 휜다
  const bend = (p, t, h) => sub(sub(pos(p, t + h), pos(p, t)), mul(vel(p, t), h));

  // 근호 꼴로 크기 쓰기: √8 → '2√2' (정수의 제곱근일 때만)
  function surd(v) {
    const n = Math.round(v * v);
    if (Math.abs(v * v - n) > 1e-9 || n === 0) return null;
    let s = 1;
    for (let k = Math.floor(Math.sqrt(n)); k >= 2; k--) if (n % (k * k) === 0) { s = k; break; }
    const r = n / (s * s);
    return r === 1 ? String(s) : (s === 1 ? '' : s) + '√' + r;
  }

  const PRESETS = {
    ex: {r0: [0, 0], v0: [4, 0], a: [-2, 2], T: 2},      // 개념서 예제: P (4, 0) m/s → 2 s 뒤 Q (0, 4) m/s
    perp: {r0: [0, 0], v0: [2, 0], a: [0, -2], T: 2},    // 그림 1: 처음 속도 ⟂ 가속도 → x 같은 간격, y 1 : 3 : 5 : 7
    qz: {r0: [0, 0], v0: [3, 4], a: [0, -3], T: 2},      // 개념 체크: (3, 4) → (3, −2), 변위 (6, 2)
    para: {r0: [0, 0], v0: [1, 1], a: [1, 1], T: 2},     // 처음 속도 ∥ 가속도 → 직선
  };

  const api = {add, sub, mul, dot, cross, len, pos, vel, accFrom, dispFrom, vertexTime, gaps, frame, wu, straight, bend, surd, PRESETS};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.A1_06 = api;
})(typeof window !== 'undefined' ? window : globalThis);
