const {test} = require('node:test');
const assert = require('node:assert/strict');
const M = require('../physics/A1/04/A1-04-model.js');
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);
const {ex: EX, plank: PLANK, rope: ROPE} = M.PRESETS;

test('A1-04 예제: 길이 6L·무게 W 막대, A = 2L, B = 4L, w = W → 넘어지지 않는 범위 L ≤ x ≤ 5L', () => {
  close(M.xMax(EX), 5);                     // N_A = 0, B 축: w(x − 4L) = W × L
  close(M.xMin(EX), 1);                     // N_B = 0, A 축: w(2L − x) = W × L
  assert.deepEqual(M.range(EX), [1, 5]);
  const atMax = M.forces(EX, 5), atMin = M.forces(EX, 1);
  close(atMax.NA, 0); close(atMax.NB, 2);   // 최대 위치: A 의 힘 0, B 가 전부(2W)
  close(atMin.NB, 0); close(atMin.NA, 2);
  assert.equal(atMax.state, 'ok'); assert.equal(atMin.state, 'ok');
  const mid = M.forces(EX, 3); close(mid.NA, 1); close(mid.NB, 1);
});

test('A1-04 받침점의 힘은 x 의 1차식(직선)이고 합은 W + w 로 일정: B 쪽으로 갈수록 N_A 는 줄고 N_B 는 는다', () => {
  for (const w of [0.5, 1, 2]) {
    const p = {...EX, w};
    const xs = [0, 0.7, 1.4, 2.1, 2.8, 3.5, 4.2, 4.9, 5.6];
    const ns = xs.map((x) => M.supports(p, x));
    for (let i = 2; i < xs.length; i++) {
      close(ns[i].NA - 2 * ns[i - 1].NA + ns[i - 2].NA, 0, 1e-12);   // 2차 차분 0 → 직선
      close(ns[i].NB - 2 * ns[i - 1].NB + ns[i - 2].NB, 0, 1e-12);
    }
    ns.forEach((n) => close(n.NA + n.NB, p.W + p.w, 1e-12));
    for (let i = 1; i < xs.length; i++) { assert.ok(ns[i].NA < ns[i - 1].NA); assert.ok(ns[i].NB > ns[i - 1].NB); }
  }
});

test('A1-04 계산한 N_A 가 음수 = 존재할 수 없는 상태(이미 B 를 축으로 넘어감) ⇔ 전체 무게중심이 받침점 사이를 벗어남', () => {
  const z = M.forces(EX, 5.5);
  assert.ok(z.NA0 < 0); assert.equal(z.state, 'tipB');
  assert.equal(M.forces(EX, 0.5).state, 'tipA');
  for (const w of [0.5, 1, 2, 3]) {
    const p = {...EX, w};
    for (let x = 0; x <= 6 + 1e-9; x += 0.25) {
      const n = M.supports(p, x), inside = M.xcm(p, x) >= p.a - 1e-12 && M.xcm(p, x) <= p.b + 1e-12;
      assert.equal(n.NA >= -1e-12 && n.NB >= -1e-12, inside, `w=${w} x=${x}`);
      assert.equal(M.standing(p, x), inside);
    }
  }
  close(M.xcm(EX, 5), 4); close(M.xcm(EX, 1), 2);   // 경계에서 전체 무게중심이 정확히 B, A 위
});

test('A1-04 무거운 물체일수록 범위가 좁아지고, 가벼우면 막대 어디에 두어도 된다', () => {
  assert.deepEqual(M.range({...EX, w: 2}), [1.5, 4.5]);
  assert.deepEqual(M.range({...EX, w: 0.5}), [0, 6]);
  const r1 = M.range(EX), r3 = M.range({...EX, w: 3});
  assert.ok(r3[1] - r3[0] < r1[1] - r1[0]);
});

test('A1-04 개념 체크: 4 m·20 kg 판자(A = 왼쪽 끝, B = 3 m) 위 40 kg 사람의 최대 거리 3.5 m, 끝(4 m)은 N_A < 0 이라 불가능', () => {
  close(M.xMax(PLANK), 3.5);
  const at = M.forces(PLANK, 3.5); close(at.NA, 0); close(at.NB, 600);
  const torque = M.torqueB(PLANK, 3.5); close(torque.keep, torque.lift);   // 400 × 0.5 = 200 × 1
  const end = M.forces(PLANK, 4);
  assert.ok(end.NA0 < 0); assert.equal(end.state, 'tipB');
  assert.deepEqual(M.range(PLANK), [0, 3.5]);
});

test('A1-04 도전: 실로 바닥 물체(150 N)와 이은 8 m 판자 → 1.2 m ≤ x ≤ 6.9 m, 실의 장력은 0 ≤ T ≤ Mg', () => {
  close(M.xMin(ROPE), 1.2); close(M.xMax(ROPE), 6.9); close(M.xMaxSupport(ROPE), 5.4);
  const r = M.range(ROPE); close(r[0], 1.2); close(r[1], 6.9);
  const top = M.forces(ROPE, 6.9);                  // 경계: N_A = 0, T = Mg (바닥 물체가 들리기 직전)
  assert.equal(top.state, 'rope'); close(top.NA, 0); close(top.T, 150); close(top.NB, 850);
  const low = M.forces(ROPE, 1.2); close(low.NB, 0); close(low.T, 0);   // 반대쪽 경계: 실은 느슨(T = 0)
  for (let x = 1.2; x <= 6.9 + 1e-9; x += 0.1) {
    const f = M.forces(ROPE, x);
    assert.ok(f.T >= -1e-9 && f.T <= 150 + 1e-9 && f.NA >= -1e-9 && f.NB >= -1e-9, `x=${x}`);
    close(f.NA + f.NB, 200 + 500 + f.T, 1e-9);     // 연직 힘 평형
  }
  assert.equal(M.forces(ROPE, 5).T, 0);              // 5.4 m 전까지는 A 가 닿아 있고 실은 장력 0
  assert.equal(M.forces(ROPE, 7.2).state, 'tipB');   // T 가 Mg 를 넘어야 하면 물체가 들려 넘어간다
  assert.equal(M.forces(ROPE, 1).state, 'tipA');     // 실은 밀 수 없어 왼쪽 경계를 돕지 못한다
});
