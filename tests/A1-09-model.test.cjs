const {test} = require('node:test');
const assert = require('node:assert/strict');
const M = require('../physics/A1/09/A1-09-model.js');
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);
const R3 = Math.sqrt(3);

test('A1-09 예제: 원점에서 B 를 (15, 20) m/s 로 던지는 순간 (6, 8) m 의 A 를 놓으면 0.4 s 뒤 (6, 7.2) m 에서 만난다', () => {
  const m = M.meet([6, 8], [0, 0], [0, 0], [15, 20]);
  assert.ok(m.toward && m.meets);
  close(m.speed, 25); close(m.d0, 10);
  close(m.t, 0.4, 1e-12);
  close(m.point[0], 6, 1e-12); close(m.point[1], 7.2, 1e-12);
  const pB = M.posAt([0, 0], [15, 20], 0.4);                     // B 의 실제 위치도 같다
  close(pB[0], 6, 1e-12); close(pB[1], 7.2, 1e-12);
  close(M.freeDrop(0.4), 0.8, 1e-12);
});

test('A1-09 같은 중력을 받으면 상대 속도는 처음 그대로, 상대 위치는 시간에 대해 직선 (중력 항이 지워진다)', () => {
  const pA = [6, 8], vA = [0, 0], pB = [0, 0], vB = [15, 20];
  for (const t of [0, 0.1, 0.25, 0.4, 0.9]) {
    const u = M.relVelAt(vA, vB, t);
    close(u[0], 15); close(u[1], 20);
    const r = M.relPos(pA, vA, pB, vB, t);
    close(r[0], -6 + 15 * t, 1e-12); close(r[1], -8 + 20 * t, 1e-12);
    // B → A 를 잇는 선은 처음 겨냥선과 늘 평행 (둘 다 ½gt² 만큼 같이 떨어진다)
    close(M.cross(M.sub(M.posAt(pA, vA, t), M.posAt(pB, vB, t)), M.sub(pA, pB)), 0, 1e-9);
  }
});

test('A1-09 방향이 어긋나면 만나지 않고, 최소 거리 = 상대 속도 직선까지의 수직 거리', () => {
  const m = M.meet([6, 8], [0, 0], [0, 0], [20, 15]);
  assert.ok(!m.toward && !m.meets);
  close(m.dMin, M.missDistance(m.r0, m.u), 1e-12);
  close(m.dMin, 2.8, 1e-12);
  close(m.tMin, 0.384, 1e-12);
});

test('A1-09 방향이 맞아도 너무 느리면 만나기 전에 땅에 닿는다', () => {
  const m = M.meet([6, 8], [0, 0], [0, 0], [3, 4]);
  assert.ok(m.toward && !m.meets);
  close(m.t, 2, 1e-12);
  close(m.tGround, 0.8, 1e-12);                                      // 땅에서 던진 B 가 0.8 s 에 먼저 땅에 닿는다
  close(M.groundTime(8, 0), Math.sqrt(1.6), 1e-12);                  // A 는 1.26 s
  assert.ok(M.meet([6, 8], [0, 0], [0, 0], [6, 8]).meets);          // 10 m/s 면 1 s, (6, 3) m 에서 만난다
});

test('A1-09 개념 체크: 30 m 떨어져 8 m/s, 12 m/s 로 마주 던지면 1.5 s, 11.25 m 보다 높아야 땅에 닿기 전에 만난다', () => {
  const h = M.headOn(30, 8, 12);
  close(h.t, 1.5); close(h.drop, 11.25);
  const m = M.meet([0, 11.25], [8, 0], [30, 11.25], [-12, 0]);
  assert.ok(m.toward); close(m.t, 1.5); close(m.point[1], 0, 1e-9);   // 딱 땅에서 만난다
  assert.ok(!M.meet([0, 10], [8, 0], [30, 10], [-12, 0]).meets);
  assert.ok(M.meet([0, 15], [8, 0], [30, 15], [-12, 0]).meets);
});

test('A1-09 서로의 처음 위치를 향해 동시에 던지면 (땅에 닿기 전이라면) 반드시 만난다', () => {
  const pA = [12, 6], pB = [0, 0];
  const vA = M.mul(M.sub(pB, pA), 8 / M.norm(M.sub(pB, pA))), vB = M.mul(M.sub(pA, pB), 12 / M.norm(M.sub(pA, pB)));
  const m = M.meet(pA, vA, pB, vB);
  assert.ok(m.toward && m.meets);
  close(m.t, M.norm(M.sub(pA, pB)) / 20, 1e-12);
});

test('A1-09 빗면 좌표계: α = 30°, 빗면에 수직으로 5√3 m/s → 2 s 뒤 다시 빗면, 1 s 에 가장 멀다 (g 를 쓰면 √3 s 로 틀린다)', () => {
  close(M.gPerp(30), 5 * R3, 1e-12); close(M.gAlong(30), 5, 1e-12);
  close(M.returnTime(5 * R3, 30), 2, 1e-12);
  close(M.farTime(5 * R3, 30), 1, 1e-12);
  close(M.farDist(5 * R3, 30), 75 / (10 * R3), 1e-12);
  close(2 * 5 * R3 / M.G, R3, 1e-12);                                  // 흔한 실수: g cosα 대신 g
  close(M.inclinePos(10, 5 * R3, 30, 2).n, 0, 1e-12);
  close(M.inclineVel(10, 5 * R3, 30, 1).n, 0, 1e-12);                  // T/2 에 속도 ∥ 빗면
});

test('A1-09 빗면 좌표를 지면 좌표로 돌리면 포물선 운동과 같고, 빗면 위 물체와는 빗면 방향 상대 운동이 등속', () => {
  const al = 30, vq = 10, vp = 5 * R3;
  const v0 = M.toWorld(vq, vp, al);
  for (const t of [0.3, 1, 1.7]) {
    const p = M.inclinePos(vq, vp, al, t), w = M.toWorld(p.s, p.n, al), q = M.posAt([0, 0], v0, t);
    close(w[0], q[0], 1e-9); close(w[1], q[1], 1e-9);
    close(p.s, M.slideS(vq, al, t), 1e-12);                            // 같은 v∥ 로 미끄러지는 물체는 늘 공 바로 아래
    close(p.s - M.slideS(4, al, t), (vq - 4) * t, 1e-12);              // v∥ 가 달라도 빗면 방향 상대 운동은 등속
  }
});
