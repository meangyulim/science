const {test} = require('node:test');
const assert = require('node:assert/strict');
const M = require('../physics/I1/I1-model.js');
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

test('1 예제: 0 → +6 m (3 s) → +2 m (1 s) — 평균 속도 +0.5 m/s, 평균 속력 2.5 m/s', () => {
  const r = M.trip(0, [{x: 6, dt: 3}, {x: 2, dt: 1}]);
  close(r.disp, 2); close(r.dist, 10); close(r.vAvg, 0.5); close(r.sAvg, 2.5);
  assert.equal(r.turns, 1);
  close(M.tripPos(0, [{x: 6, dt: 3}, {x: 2, dt: 1}], 3.5), 4);
});

test('2 예제: v₀ = +4, a = −3, 2 s — 속도 −2, 변위 +2, 이동 거리 10/3', () => {
  const r = M.uniform(4, -3, 2);
  close(r.v, -2); close(r.x, 2); close(r.dist, 10 / 3); close(r.tTurn, 4 / 3);
});

test('3 분류: 알짜힘과 속도의 각', () => {
  assert.equal(M.classify(0, 0).kind, '등속 직선 운동');
  assert.equal(M.classify(0, 1).speed, '증가');
  assert.equal(M.classify(180, 1).speed, '감소');
  assert.equal(M.classify(90, 1).speed, '일정');
  assert.equal(M.classify(90, 1).dir, true);
  assert.equal(M.classify(45, 1).speed, '증가');
  assert.equal(M.classify(135, 1).speed, '감소');
});

test('4 예제: 처음 1 s 동안 1 m → 세 번째 1 s 동안 5 m, 3 s 때 6 m/s', () => {
  const a = M.accelFromFirst(1, 1);
  close(a, 2);
  close(M.nthInterval(0, a, 3, 1), 5);
  close(M.uniform(0, a, 3).v, 6);
  // Δs = aT²
  close(M.nthInterval(0, a, 3, 1) - M.nthInterval(0, a, 2, 1), a * 1 * 1);
});

test('5 예제: 빗면 a = −2, A 4 m/s, 1 s 뒤 B 6 m/s — 간격 3 m, 0.75 s 뒤 만남', () => {
  const r = M.chase(4, 6, -2, 1);
  close(r.gap, 3); close(r.vAnow, 2); close(r.closing, 4); close(r.tMeet, 0.75);
});

test('6 관성: 가속하는 차 안의 추 기울기 tan θ = a/g', () => {
  close(M.tiltDeg(0), 0); close(M.tiltDeg(10), 45);
});

test('7 예제: 50 kg, 내려가며 매초 2 m/s 씩 느려짐 → 600 N', () => {
  const a = M.elevatorAccel('down', 'slowdown', 2);
  close(a, 2);
  close(M.scaleReading(50, a), 600);
  close(M.scaleReading(50, M.elevatorAccel('up', 'steady', 0)), 500);
  close(M.scaleReading(50, M.elevatorAccel('down', 'speedup', 2)), 400);
});

test('8 예제: 무게 30 N, 줄로 10 N → 저울 20 N', () => {
  close(M.scaleWithString(30, 10), 20);
  close(M.scaleWithString(30, 40), 0);
});

test('9 예제: 3 kg 수레 + 1 kg 추 → 2.5 m/s², 7.5 N', () => {
  const r = M.table(3, 1);
  close(r.a, 2.5); close(r.T, 7.5);
  const w = M.atwood(3, 1);
  close(w.a, 5); close(w.T, 15);
  close(M.push(12, 1, 3).contact, 3);
});

test('10 예제: X 2 kg, Y 3 kg — T = 12 N, 끊긴 뒤 X 0, Y 10, M|Δa| = 12', () => {
  const r = M.cut(2, 3);
  close(r.before.a, 6); close(r.before.T, 12);
  close(r.after.aX, 0); close(r.after.aY, 10);
  close(r.MdX, 12); close(r.MdY, 12);
});

test('11 예제: 0.5 kg, +8 → −6 m/s, 0.02 s — 충격량 7 N·s 왼쪽, 평균 힘 350 N 왼쪽', () => {
  const r = M.impulse(0.5, 8, -6, 0.02);
  close(r.I, -7); close(r.F, -350);
});

test('12 예제: 60 kg, 10 m/s 정지 — 0.05 s 12000 N, 0.3 s 2000 N', () => {
  close(M.avgForce(60, 10, 0.05), 12000); close(M.avgForce(60, 10, 0.3), 2000);
});

test('13 예제: 2 kg 3 m/s + 1 kg −1 m/s 한 덩어리 → 5/3 m/s, A 충격량 −8/3', () => {
  close(M.merge(2, 3, 1, -1), 5 / 3);
  const r = M.collide(2, 3, 1, -1, 0);
  close(r.v1, 5 / 3); close(r.v2, 5 / 3); close(r.impulseOn1, -8 / 3);
  close(r.pBefore, r.pAfter);
});

test('14 충돌 종류: 운동량은 늘 보존, 운동 에너지는 탄성에서만', () => {
  const el = M.collide(1, 4, 1, 0, 1);
  close(el.v1, 0); close(el.v2, 4);                    // 질량이 같으면 속도 교환
  close(el.keBefore, el.keAfter);
  const el2 = M.collide(3, 2, 1, -2, 1);
  close(el2.v2 - el2.v1, -(-2 - 2));                   // 접근 속력 = 멀어지는 속력
  for (const e of [0, 0.5]) {
    const r = M.collide(3, 2, 1, -2, e);
    close(r.pBefore, r.pAfter);
    assert.ok(r.keAfter < r.keBefore);
  }
});
