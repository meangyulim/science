const {test} = require('node:test');
const assert = require('node:assert/strict');
const M = require('../physics/A1/06/A1-06-model.js');
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);
const vclose = (a, b, eps = 1e-9) => { close(a[0], b[0], eps); close(a[1], b[1], eps); };
const {ex: EX, perp: PERP, qz: QZ, para: PARA} = M.PRESETS;

test('A1-06 예제: P (4, 0) m/s → 2 s 뒤 Q (0, 4) m/s 이면 가속도 (−2, 2) m/s² (크기 2√2), 변위 (4, 4) m', () => {
  const a = M.accFrom([4, 0], [0, 4], 2);
  vclose(a, [-2, 2]); close(M.len(a), 2 * Math.SQRT2); assert.equal(M.surd(M.len(a)), '2√2');
  vclose(M.dispFrom([4, 0], [0, 4], 2), [4, 4]);                 // 평균 속도 (2, 2) × 2 s — 가속도를 쓰지 않는다
  vclose(M.pos(EX, 2), [4, 4]); vclose(M.vel(EX, 2), [0, 4]);      // 같은 가속도로 실제로 움직여도 같다
  close(M.vertexTime(EX, 1), 0); close(M.vertexTime(EX, 0), 2);    // P 는 y 성분의, Q 는 x 성분의 꼭짓점
});

test('A1-06 개념 체크: (3, 4) m/s → 2 s 뒤 (3, −2) m/s 이면 변위 (6, 2) m, 가속도 (0, −3) m/s²', () => {
  vclose(M.dispFrom([3, 4], [3, -2], 2), [6, 2]);
  vclose(M.accFrom([3, 4], [3, -2], 2), [0, -3]);
  vclose(M.pos(QZ, 2), [6, 2]); vclose(M.vel(QZ, 2), [3, -2]);
  assert.notDeepEqual(M.mul([3, 4], 2), [6, 2]);                    // 처음 속도만 쓴 (6, 8) 은 틀린 답
});

test('A1-06 x, y 성분은 따로 등가속도: 같은 시간 간격의 이동 거리 — 가속도 없는 쪽은 같은 간격, 처음 속도 성분이 0 인 쪽은 1 : 3 : 5 : 7', () => {
  M.gaps(PERP, 0, 0.5, 4).forEach((g) => close(g, 1));             // x: 등속
  const gy = M.gaps(PERP, 1, 0.5, 4).map((g) => g / M.gaps(PERP, 1, 0.5, 4)[0]);
  [1, 3, 5, 7].forEach((r, i) => close(gy[i], r));                 // y: 1 : 3 : 5 : 7
  const ey = M.gaps(EX, 1, 0.5, 4), exs = M.gaps(EX, 0, 0.5, 4);
  [1, 3, 5, 7].forEach((r, i) => close(ey[i] / ey[0], r));         // 예제 y: P 가 꼭짓점 → 1 : 3 : 5 : 7
  [7, 5, 3, 1].forEach((r, i) => close(exs[i] / exs[3], r));       // 예제 x: Q 가 꼭짓점 → 7 : 5 : 3 : 1
  // 한 성분의 운동은 다른 성분의 값과 무관하다
  const other = {...EX, v0: [4, 9], a: [-2, -5]};
  for (const t of [0.3, 1, 1.7]) close(M.pos(other, t)[0], M.pos(EX, t)[0]);
});

test('A1-06 같은 시간 동안의 속도 변화 Δv = aΔt 는 늘 같은 벡터 → 속도 벡터의 머리는 한 직선 위를 일정하게 움직인다', () => {
  for (const p of [EX, PERP, QZ]) {
    const dt = 0.4, d0 = M.sub(M.vel(p, dt), M.vel(p, 0));
    for (let t = 0; t < 2; t += 0.25) vclose(M.sub(M.vel(p, t + dt), M.vel(p, t)), d0, 1e-12);
    vclose(d0, M.mul(p.a, dt), 1e-12);
    close(M.cross(M.sub(M.vel(p, 1.3), M.vel(p, 0)), p.a), 0, 1e-12);   // 가속도 방향과 나란
  }
});

test('A1-06 경로는 가속도 쪽으로 휘는 포물선: 가속도 축에서 본 위치는 수직 축 위치의 2차식, 처음 속도 ∥ 가속도면 직선', () => {
  for (const p of [EX, PERP, QZ]) {
    const ts = [0, 0.6, 1.1, 1.9];
    const [w0, u0] = M.wu(p, ts[0]), [w1, u1] = M.wu(p, ts[1]), [w2, u2] = M.wu(p, ts[2]), [w3, u3] = M.wu(p, ts[3]);
    // u = α w² + β w + γ 를 앞의 세 점으로 정하면 네 번째 점도 맞는다 (포물선)
    const A = [[w0 * w0, w0, 1], [w1 * w1, w1, 1], [w2 * w2, w2, 1]], b = [u0, u1, u2];
    const det = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
    const D = det(A), sol = [0, 1, 2].map((j) => det(A.map((row, i) => row.map((v, k) => (k === j ? b[i] : v)))) / D);
    close(sol[0] * w3 * w3 + sol[1] * w3 + sol[2], u3, 1e-9);
    assert.ok(sol[0] > 0);                                           // 가속도 쪽(+u)으로 오목
    const dw = [0.5, 1, 1.5].map((t) => M.wu(p, t)[0] - M.wu(p, t - 0.5)[0]);
    close(dw[0], dw[1]); close(dw[1], dw[2]);                        // 수직 축으로는 등속
    for (const t of [0.2, 1, 1.6]) assert.ok(M.dot(M.bend(p, t, 0.3), p.a) > 0);
  }
  assert.ok(M.straight(PARA) && !M.straight(EX));
  for (const t of [0.5, 1, 2]) close(M.cross(M.sub(M.pos(PARA, t), PARA.r0), PARA.a), 0, 1e-12);
});

test('A1-06 v_y = 0 인 순간이 대칭축: 앞뒤로 같은 시간이면 높이와 v_y 크기가 같다', () => {
  const tv = M.vertexTime(QZ, 1); close(tv, 4 / 3);
  for (const tau of [0.2, 0.5, 4 / 3]) {
    close(M.pos(QZ, tv - tau)[1], M.pos(QZ, tv + tau)[1], 1e-12);
    close(Math.abs(M.vel(QZ, tv - tau)[1]), Math.abs(M.vel(QZ, tv + tau)[1]), 1e-12);
  }
  close(M.vel(QZ, tv)[1], 0); close(M.vel(QZ, tv)[0], 3);            // 꼭짓점에서도 x 속도는 그대로
});
