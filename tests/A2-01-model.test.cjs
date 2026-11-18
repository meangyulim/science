const {test} = require('node:test');
const assert = require('node:assert/strict');
const M = require('../physics/A2/01/A2-01-model.js');
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

test('A2-01 예제: 0~2 m 10 N, 2~4 m 10 → 0 N, 4~6 m −5 N → 0~6 m 동안 한 일 20 J', () => {
  const segs = M.exampleSegs(10, -5);
  close(M.areaTo(segs, 6), 20, 1e-12);
  assert.deepEqual(M.examplePieces(10, -5).map((p) => p.W), [20, 10, -10]);   // 20 + 10 − 10
  const p = M.parts(segs);
  close(p.pos, 30, 1e-12); close(p.neg, 10, 1e-12); close(p.net, 20, 1e-12);
  // 지나는 동안의 일: 2 m 20 J, 4 m 30 J(최대), 그 뒤 음의 넓이만큼 줄어든다
  close(M.areaTo(segs, 2), 20, 1e-12); close(M.areaTo(segs, 3), 27.5, 1e-12); close(M.areaTo(segs, 4), 30, 1e-12); close(M.areaTo(segs, 5), 25, 1e-12);
  close(M.forceAt(segs, 3), 5, 1e-12); close(M.forceAt(segs, 4), -5, 1e-12);   // 4 m 에서 힘이 −5 N 으로 뛴다
});

test('A2-01 W = Fs cosθ: 20 N, 60°, 5 m → 50 J (sin 을 쓰면 50√3 J 로 틀린다)', () => {
  close(M.work(20, 5, 60), 50, 1e-9);
  close(M.along(20, 60), 10, 1e-9);
  close(M.perp(20, 60) * 5, 50 * Math.sqrt(3), 1e-9);
  assert.ok(Math.abs(M.perp(20, 60) * 5 - M.work(20, 5, 60)) > 30);
  close(M.work(20, 5, 0), 100, 1e-12);                      // 이동 방향으로 밀면 Fs
});

test('A2-01 이동과 수직인 힘은 일 0, 90° 를 넘으면 음의 일 (부호는 힘과 이동 방향의 비교로만 정한다)', () => {
  assert.equal(M.work(20, 5, 90), 0);
  assert.equal(M.sign(90), 0); assert.equal(M.kind(90), '일 0');
  assert.equal(M.sign(30), 1); assert.equal(M.sign(150), -1); assert.equal(M.sign(180), -1);
  close(M.work(20, 5, 120), -M.work(20, 5, 60), 1e-9);    // 대칭: 120° 는 60° 의 반대 부호
  close(M.work(7, 3, 180), -21, 1e-12);                     // 마찰력처럼 정반대면 −fs
  // 등속 원운동: 구심력(중심 쪽)과 속도(접선)의 스칼라곱은 어디서나 0 → 일 0
  for (const a of [0, 0.4, 1.3, 2.9, 4.4]) assert.equal(M.dot(-Math.cos(a), -Math.sin(a), -Math.sin(a), Math.cos(a)), 0);
});

test('A2-01 빗면 왕복: 마찰력은 올라갈 때도 내려올 때도 음의 일, 중력은 − 뒤 + 로 합 0, 수직항력은 0', () => {
  const m = 1, f = 2, d = 4, T = M.slopeTrip(m, 0.6, 0.8, f, d);
  close(T.v0, 8, 1e-12); close(T.up.g, -24, 1e-12); close(T.down.g, 24, 1e-12);
  close(T.up.f, -8, 1e-12); close(T.down.f, -8, 1e-12);
  assert.equal(T.up.N, 0); assert.equal(T.down.N, 0);
  const end = M.tripWorks(m, 0.6, f, d, 2 * d);
  close(end.g, 0, 1e-12); close(end.f, -16, 1e-12);
  close(T.K0 - T.K1, 2 * f * d, 1e-9);                      // 마찰력이 뺏은 만큼 느려져 돌아온다 (32 J → 16 J)
  close(T.v1, 4 * Math.SQRT2, 1e-12);
  const ang = M.tripAngles(37);
  close(M.work(10, 4, ang.up.g), -10 * 4 * Math.sin(37 * Math.PI / 180), 1e-9);   // 중력: 올라갈 때 cos 127° < 0
  assert.equal(M.sign(ang.down.g), 1); assert.equal(M.sign(ang.up.f), -1); assert.equal(M.sign(ang.down.f), -1);
  for (const L of [0.5, 2, 4, 6, 7.9]) { const t = M.tripTime(T, L); close(M.tripAt(T, t).L, L, 1e-9); }
});

test('A2-01 용수철 k = 200 N/m 를 0.1 m → 0.3 m 늘인 일 = 사다리꼴 넓이 8 J (½k(0.2)² = 4 J 는 틀림)', () => {
  close(M.springWork(200, 0.1, 0.3), 8, 1e-12);
  close(M.areaTo(M.springSegs(200, 0.1, 0.3), 0.3), 8, 1e-12);
  close((20 + 60) / 2 * 0.2, 8, 1e-12);
  assert.ok(Math.abs(M.elasticPE(200, 0.2) - 8) > 3);
  close(M.elasticPE(200, 0.3), 9, 1e-12);                   // 삼각형 넓이 ½kx²
});

test('A2-01 띠 F × Δs 를 잘게 쪼개 더할수록 F–s 그래프 아래 넓이(20 J)에 다가간다', () => {
  const segs = M.exampleSegs(10, -5), err = (ds) => Math.abs(M.riemann(segs, 0, 6, ds).sum - 20);
  close(M.riemann(segs, 0, 6, 1).sum, 25, 1e-9);
  close(M.riemann(segs, 0, 6, 0.5).sum, 22.5, 1e-9);
  close(M.riemann(segs, 0, 6, 0.1).sum, 20.5, 1e-9);
  assert.ok(err(0.01) < err(0.1) && err(0.1) < err(0.5) && err(0.5) < err(1));
});

test('A2-01 중력이 한 일은 내려간 높이 × mg, 일률 P = Fv (교과 심화)', () => {
  close(M.gravityWork(2, 3), 60, 1e-12);
  close(M.power(5, 2), 10, 1e-12);
});
