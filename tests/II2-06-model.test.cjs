const {test} = require('node:test');
const assert = require('node:assert/strict');
const M = require('../physics/II2/06/II2-06-model.js');
const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

test('θ = 0°: 노트 그림 (가) — 왼쪽 변 a ⊙ 위로, 오른쪽 변 b ⊗ 아래로, 시계 방향', () => {
  const s = M.state(0);
  assert.equal(s.a, 1); assert.equal(s.b, -1);
  assert.equal(s.forceA, 1);                 // a 는 위로
  assert.equal(s.plusSeg, 'B');              // 오른쪽(+) 브러시에 닿은 조각은 B
  close(s.torque, 1);                        // 시계 방향, 최대
  const p = M.sidePos(0, 1);
  close(p.a[0], -1); close(p.b[0], 1);
});

test('θ = 180°: 노트 그림 (나) — 자리가 바뀐 뒤에도 왼쪽 변(b)은 ⊙, 같은 방향으로 회전', () => {
  const s = M.state(180);
  const p = M.sidePos(180, 1);
  assert.ok(p.b[0] < 0 && p.a[0] > 0);       // b 가 왼쪽
  assert.equal(s.b, 1); assert.equal(s.a, -1);
  assert.equal(s.plusSeg, 'A');              // 정류자가 전류를 뒤집음
  close(s.torque, 1);
});

test('90°·270°: 정류자 틈이 브러시에 걸려 전류와 돌림힘이 0', () => {
  for (const t of [90, 270, 85, 275]) {
    const s = M.state(t);
    assert.equal(s.flowing, false, `${t}°`); assert.equal(s.torque, 0);
  }
  assert.equal(M.state(80).flowing, true);
});

test('정류자가 있으면 돌림힘은 한 바퀴 내내 시계 방향(|cos θ|), 없으면 cos θ', () => {
  for (let t = 0; t < 360; t += 5) {
    const s = M.state(t);
    assert.ok(s.torque >= 0, `${t}°`);
    if (s.flowing) close(s.torque, Math.abs(Math.cos(t * M.DEG)));
    close(M.state(t, {commutator: false}).torque, Math.cos(t * M.DEG));
  }
  // 정류자 없이: 반 바퀴 뒤에는 반대 방향 돌림힘
  assert.ok(M.state(150, {commutator: false}).torque < 0);
  assert.equal(M.state(150, {commutator: false}).a, 1);   // 변 a 전류는 그대로 ⊙
});

test('전지나 자석을 뒤집으면 반시계, 둘 다 뒤집으면 다시 시계 방향', () => {
  for (const t of [0, 30, 150, 200, 330]) {
    assert.ok(M.state(t, {battery: -1}).torque < 0);
    assert.ok(M.state(t, {field: -1}).torque < 0);
    assert.ok(M.state(t, {battery: -1, field: -1}).torque > 0);
  }
  // 전지를 뒤집으면 θ = 0° 에서 변 a 는 ⊗, (+)가 된 왼쪽 브러시에는 조각 A 가 닿는다
  const s = M.state(0, {battery: -1});
  assert.equal(s.a, -1); assert.equal(s.plusSeg, 'A');
});

test('회전 운동: 정류자가 있으면 한 방향으로 계속 돌고, 없으면 90° 근처에서 멈춘다', () => {
  let s = {theta: 0, omega: 0};
  for (let i = 0; i < 1200; i++) s = M.step(s, 1 / 60, 1);
  const wT = M.terminalOmega(1);
  assert.ok(s.omega > 0.8 * wT && s.omega < 1.2 * wT, `${s.omega} vs ${wT}`);
  close(wT, 3.9 * (2 / Math.PI) / M.DEG, 2);  // 평균 돌림힘 = (2/π)·BIA (틈 때문에 조금 작다)

  let f = {theta: 0, omega: 0};
  let max = 0;
  for (let i = 0; i < 3000; i++) { f = M.step(f, 1 / 60, 1, {commutator: false}); max = Math.max(max, f.theta); }
  close(f.theta, 90, 0.5); close(f.omega, 0, 0.5);
  assert.ok(max > 120);                       // 처음엔 90° 를 지나쳤다가 되돌아온다

  // 전지를 뒤집으면 반대로 돈다
  let r = {theta: 0, omega: 0};
  for (let i = 0; i < 600; i++) r = M.step(r, 1 / 60, 1, {battery: -1});
  assert.ok(r.omega < 0);
});

test('전류 경로 글: (+) → 브러시 → 정류자 → 코일 → 정류자 → 브러시 → (−)', () => {
  const p = M.pathSteps(0).map(x => x.text);
  assert.deepEqual(p, ['전지 (+)', '오른쪽 브러시', '정류자 B', '변 b ⊗', '변 a ⊙', '정류자 A', '왼쪽 브러시', '전지 (−)']);
  const q = M.pathSteps(180).map(x => x.text);
  assert.deepEqual(q.slice(2, 6), ['정류자 A', '변 a ⊗', '변 b ⊙', '정류자 B']);
  assert.equal(M.pathSteps(90), null);
  assert.equal(M.pathSteps(0, {commutator: false})[2].text, '고리 B');
});
