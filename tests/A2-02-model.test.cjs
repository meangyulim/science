const {test} = require('node:test');
const assert = require('node:assert/strict');
const M = require('../physics/A2/02/A2-02-model.js');
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);
const EX = {m: 2, v0: 1, F: 12, f: 4, sF: 3};

test('A2-02 예제: 2 kg, 1 m/s, 운동 방향 12 N, 마찰력 4 N, 3 m → 일 장부 +36 − 12 = 24 J, 나중 속력 5 m/s', () => {
  const L = M.ledger(EX, 3);
  close(L.WF, 36, 1e-12); close(L.Wf, -12, 1e-12); assert.equal(L.WN, 0); assert.equal(L.Wg, 0);
  close(L.sum, 24, 1e-12); close(L.K0, 1, 1e-12); close(L.K, 25, 1e-12);
  close(L.v, 5, 1e-12);
  close(M.timeTo(EX, 3), 1, 1e-12);                      // 3 = 1·t + ½·4·t² → t = 1 s, v = 1 + 4·1 = 5 (운동학과 같은 답)
  assert.ok(M.stopAt(EX) > 3);                             // 3 m 안에서는 멈추지 않는다 (힘이 끝난 뒤 마찰력만이면 9.25 m)
  close(M.stopAt(EX), 9.25, 1e-12);
});

test('A2-02 일·운동 에너지 정리: 어느 자리에서나 힘마다 한 일의 합 = 운동 에너지 변화 = 알짜힘 × 거리', () => {
  for (const p of [EX, {m: 3, v0: 2, F: 5, f: 2, sF: 4}, {m: 1, v0: 0, F: 9, f: 3, sF: 2}]) {
    for (const x of [0.5, 1, 1.7, 2]) {
      const L = M.ledger(p, x);
      close(L.K - L.K0, L.WF + L.Wf + L.WN + L.Wg, 1e-12);
      if (x <= p.sF) close(L.sum, (p.F - p.f) * x, 1e-12);
      // 운동학으로 구한 속력과 같다: v² = v0² + 2ax
      if (x <= p.sF) close(L.v, Math.sqrt(p.v0 * p.v0 + 2 * M.accel(p, 0) * x), 1e-9);
    }
  }
});

test('A2-02 합이 양이면 빨라지고, 음이면 느려지고, 0이면 처음과 같은 속력 (중간에는 달라질 수 있다)', () => {
  assert.equal(M.verdict(M.ledger(EX, 3).sum), '빨라진다');
  assert.equal(M.verdict(M.ledger({...EX, F: 2}, 0.2).sum), '느려진다');
  close(M.ledger({...EX, F: 4}, 3).v, 1, 1e-12);          // F = f: 등속
  const p = {m: 2, v0: 1, F: 8, f: 4, sF: 1.5};            // 앞 절반만 미는 힘 8 N
  const end = M.ledger(p, 3), mid = M.ledger(p, 1.5);
  close(end.sum, 0, 1e-12); close(end.v, 1, 1e-12); assert.equal(M.verdict(end.sum), '처음과 같은 속력');
  assert.ok(mid.v > 2.6);                                  // 중간에는 √7 ≈ 2.65 m/s 까지 빨라졌다
});

test('A2-02 개념 체크: 4 kg, 6 m/s, 마찰력 8 N 만 → 9 m 가서 멈춘다 (½ 을 빼먹으면 18 m)', () => {
  const p = {m: 4, v0: 6, F: 0, f: 8, sF: 0};
  close(M.stopAt(p), 9, 1e-12);
  close(M.ledger(p, 9).K, 0, 1e-12);
  close(-8 * 9, 0 - M.kinetic(4, 6), 1e-12);
  assert.ok(Math.abs(M.stopAt(p) - 18) > 1);
  close(M.stopAt({m: 2, v0: 1, F: 0, f: 4, sF: 3}), 0.25, 1e-12);
});

test('A2-02 같은 높이 1.8 m 의 마찰 없는 빗면: 바닥 속력 6 m/s 로 같고, 알짜힘 ∝ 1/길이, 시간 ∝ 길이', () => {
  const A = M.ramp(1, 1.8, 3), B = M.ramp(1, 1.8, 6), C = M.ramp(1, 1.8, 9);
  close(A.v, 6, 1e-12); close(B.v, 6, 1e-12); close(C.v, 6, 1e-12);
  close(A.Fnet, 6, 1e-12); close(B.Fnet, 3, 1e-12); close(C.Fnet, 2, 1e-12);
  close(A.W, 18, 1e-12); close(B.W, 18, 1e-12); close(C.W, 18, 1e-12);       // 알짜힘 × 길이 = mgh
  close(A.t, 1, 1e-12); close(B.t, 2, 1e-12); close(C.t, 3, 1e-12);
  close(C.a / A.a, 1 / 3, 1e-12);                                            // 길이 3배 → 가속도 1/3, 시간 3배
});

test('A2-02 곡선 경로(2차원)에서도 성립: 중력이 한 일 mg × 내려간 높이 = 운동 에너지 변화, 수평 성분은 그대로', () => {
  for (const [vx, vy, t] of [[4, 0, 0.7], [3, 4, 1.2], [6, 2, 0.3]]) {
    const s = M.throwAt(2, vx, vy, t);
    close(s.K - s.K0, s.Wg, 1e-9);
    assert.equal(s.vx, vx);
  }
});

test('A2-02 시각 → 위치: 예제는 1 s 에 3 m, 속력 5 m/s. 마찰력만이면 3 s 에 9 m 에서 멈춘다 (timeTo 의 거꿀)', () => {
  const r = M.posAt(EX, 1);
  close(r.x, 3, 1e-9); close(r.v, 5, 1e-9);
  const q = {m: 4, v0: 6, F: 0, f: 8, sF: 0};
  close(M.posAt(q, 3).x, 9, 1e-9); close(M.posAt(q, 5).x, 9, 1e-9); close(M.posAt(q, 5).v, 0, 1e-12);
  const z = {m: 2, v0: 1, F: 8, f: 4, sF: 1.5};
  for (const x of [0.4, 1.2, 1.5, 2.2, 3]) close(M.posAt(z, M.timeTo(z, x)).x, x, 1e-9);
});
