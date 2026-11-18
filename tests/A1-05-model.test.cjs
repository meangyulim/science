const {test} = require('node:test');
const assert = require('node:assert/strict');
const M = require('../physics/A1/05/A1-05-model.js');
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);
const {circ, fast, slow, square, throw: up} = M.PRESETS;

test('A1-05 예제: 반지름 2 m 원 궤도 반 바퀴를 4 s → 이동 거리 2π m, 변위 4 m, 평균 속력 π/2 ≈ 1.57 m/s, 평균 속도 1 m/s', () => {
  close(M.distance(circ, 0, 4), 2 * Math.PI);
  close(M.len(M.disp(circ, 0, 4)), 4);
  close(M.avgSpeed(circ, 0, 4), Math.PI / 2);
  assert.equal(M.avgSpeed(circ, 0, 4).toFixed(2), '1.57');
  const v = M.avgVel(circ, 0, 4);
  close(M.len(v), 1); close(v[0], 1); close(v[1], 0);          // 방향: 출발점(−2, 0) → 도착점(2, 0)
});

test('A1-05 한 바퀴 돌아 제자리에 오면 평균 속도는 0, 평균 속력은 그대로', () => {
  close(M.len(M.disp(circ, 0, 8)), 0, 1e-12);
  close(M.len(M.avgVel(circ, 0, 8)), 0, 1e-12);
  close(M.avgSpeed(circ, 0, 8), Math.PI / 2);
  close(M.distance(up, 0, 2), 10); close(M.len(M.disp(up, 0, 2)), 0, 1e-12);   // 위로 던진 공이 제자리로: 거리 10 m, 변위 0
});

test('A1-05 개념 체크: 한 변 3 m 정사각형을 A → B → C → D 로 6 s → 평균 속력 1.5 m/s, 평균 속도 0.5 m/s', () => {
  close(M.distance(square, 0, 6), 9);
  close(M.len(M.disp(square, 0, 6)), 3);
  close(M.avgSpeed(square, 0, 6), 1.5);
  close(M.len(M.avgVel(square, 0, 6)), 0.5);
});

test('A1-05 이동 거리 ≥ 변위의 크기 → 평균 속력 ≥ 평균 속도의 크기 (곧게 한 방향으로 갈 때만 같다)', () => {
  for (const m of [circ, fast, slow, square, up]) {
    for (let t1 = 0; t1 < m.T; t1 += m.T / 7) {
      for (const dt of [0.1, 0.5, 1, 2, 3.3]) {
        if (t1 + dt > m.T) continue;
        assert.ok(M.distance(m, t1, t1 + dt) >= M.len(M.disp(m, t1, t1 + dt)) - 1e-9);
        assert.ok(M.avgSpeed(m, t1, t1 + dt) >= M.len(M.avgVel(m, t1, t1 + dt)) - 1e-9);
      }
    }
  }
  close(M.distance(up, 0, 1), M.len(M.disp(up, 0, 1)));              // 올라가기만 하는 동안은 같다
  close(M.distance(square, 0, 2), M.len(M.disp(square, 0, 2)));      // 한 변을 곧게 가는 동안도 같다
});

test('A1-05 Δt → 0 이면 할선(평균 속도 방향)이 접선으로, |평균 속도|가 순간 속력으로 다가간다', () => {
  for (const [m, t] of [[circ, 0], [circ, 2.5], [fast, 1], [slow, 3]]) {
    const angs = [2, 1, 0.5, 0.1, 0.01].map((dt) => M.chordAngle(m, t, dt));
    for (let i = 1; i < angs.length; i++) assert.ok(angs[i] < angs[i - 1]);
    assert.ok(angs[angs.length - 1] < 0.3);
    close(M.len(M.avgVel(m, t, t + 1e-4)), M.len(m.vel(t)), 1e-3);
  }
  close(M.chordAngle(circ, 0, 4), 90);       // 반 바퀴의 할선은 처음 속도와 수직
  close(M.chordAngle(circ, 0, 2), 45);       // 원에서는 할선–접선 각 = 돈 각의 절반
});

test('A1-05 가속도 방향 = Δv 방향: 일정한 속력의 원운동은 중심 쪽(a ⟂ v), 빨라지면 예각, 느려지면 둔각, 수직 성분은 늘 오목한 쪽', () => {
  for (let t = 0; t < 8; t += 0.7) {
    const p = M.parts(circ, t);
    close(p.par, 0, 1e-9); close(p.ang, 90, 1e-6); assert.equal(p.kind, 'turn');
    close(p.perp, M.V0 * M.V0 / M.R, 1e-9);
    const a = circ.acc(t), r = circ.pos(t);
    close(M.dot(a, r) / (M.len(a) * M.len(r)), -1, 1e-9);                      // 중심 쪽
    const dv = M.dV(circ, t, t + 1e-3);
    close(M.angle(dv, a), 0, 0.1);                                             // 짧은 시간의 Δv 는 가속도와 같은 방향
  }
  const dv4 = M.dV(circ, 0, 4);
  close(dv4[0], 0, 1e-12); close(dv4[1], -Math.PI, 1e-12);                     // (0, 1.57) → (0, −1.57): Δv = (0, −π)
  for (const t of [0.5, 2, 3.5]) {
    const f = M.parts(fast, t), s = M.parts(slow, t);
    assert.ok(f.par > 0 && f.ang < 90); assert.equal(f.kind, 'faster');
    assert.ok(s.par < 0 && s.ang > 90); assert.equal(s.kind, 'slower');
    for (const m of [fast, slow]) {                                            // 수직 성분은 중심(오목한 쪽)을 향한다
      const pp = M.parts(m, t), aPerp = M.sub(pp.a, M.mul(pp.u, pp.par));
      assert.ok(M.dot(aPerp, M.mul(m.pos(t), -1)) > 0);
    }
  }
});

test('A1-05 가속도는 속도와 무관: 위로 던진 공은 최고점에서 속도 0 인데 가속도는 g (아래)', () => {
  const top = M.parts(up, 1);
  close(top.speed, 0); assert.equal(top.kind, 'rest');
  assert.deepEqual(up.acc(1), [0, -10]);
  assert.equal(M.parts(up, 0.5).kind, 'slower'); close(M.parts(up, 0.5).ang, 180);   // 올라갈 때: 속도와 반대
  assert.equal(M.parts(up, 1.5).kind, 'faster'); close(M.parts(up, 1.5).ang, 0);     // 내려올 때: 같은 방향
});
