const {test} = require('node:test');
const assert = require('node:assert/strict');
const M = require('../physics/B1/03/B1-03-model.js');
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);
const closeV = (u, v, eps = 1e-9) => { for (let i = 0; i < 3; i++) close(u[i] || 0, v[i] || 0, eps); };
const R2 = Math.SQRT2, R3 = Math.sqrt(3), R5 = Math.sqrt(5), R6 = Math.sqrt(6);

test('B1-03 예제: +q(−d, 0), −q(d, 0), P(0, d) → 각 기여 E₀, 합 √2 E₀, +x 방향 (y 성분 상쇄)', () => {
  const s = M.solve('ga');
  close(s.parts[0].mag, 1); close(s.parts[1].mag, 1);                      // 같은 거리 √2 d → 세기 모두 E₀
  closeV(s.parts[0].E, [1 / R2, 1 / R2, 0]);                               // +q: (1, 1)/√2 방향 (멀어지는 쪽)
  closeV(s.parts[1].E, [1 / R2, -1 / R2, 0]);                              // −q: (1, −1)/√2 방향 (−q 를 향하는 쪽)
  closeV(s.sum, [R2, 0, 0]);
  close(s.mag, R2);
  close(M.dirDeg(s.sum), 0);                                               // +x 방향
  assert.ok(M.cancels(s.parts, 1) && !M.cancels(s.parts, 0));              // y 성분만 상쇄
  close(s.scalar, 2);                                                      // 세기만 더한 2E₀ 는 틀린 합
  // SI: q = 1 μC, d = 1 m, k = 9 × 10⁹ → E₀ = 4.5 × 10³ N/C, |E| = 4.5√2 × 10³ ≈ 6.4 × 10³ N/C
  const si = M.superpose([{q: 1e-6, at: [-1, 0]}, {q: -1e-6, at: [1, 0]}], [0, 1], M.K);
  close(si.parts[0].mag, 4500, 1e-6);
  close(si.mag, 4500 * R2, 1e-6);
  assert.equal((si.mag / 1e3).toFixed(1), '6.4');
});

test('B1-03 그림 (나): 오른쪽 전하를 +q 로 바꾸면 x 성분이 상쇄되고 +y 방향 √2 E₀ — 부호 하나가 합을 90° 돌린다', () => {
  const a = M.solve('ga'), b = M.solve('na');
  closeV(b.sum, [0, R2, 0]);
  close(M.dirDeg(b.sum), 90);
  assert.ok(M.cancels(b.parts, 0) && !M.cancels(b.parts, 1));
  close(M.dot(a.sum, b.sum), 0);                                           // 두 합은 서로 수직
  close(a.mag, b.mag);
});

test('B1-03 개념 체크: 정사각형 A·B·C 에 +q, D 에 −q → 중심 O 에서 D를 향해 2E₀ (A·C 상쇄)', () => {
  const p = M.PRESETS.sq, s = M.solve('sq');
  close(s.mag, 2);
  const toD = M.unit(M.sub(p.charges[3].at, p.P));
  closeV(M.unit(s.sum), toD);
  assert.deepEqual(M.cancelPairs(s.parts, 0).map(String).includes('0,2'), true);     // x 성분에서 A 와 C 가 서로 지운다
  closeV(M.add(s.parts[0].E, s.parts[2].E), [0, 0, 0]);                    // A + C = 0 (마주 보는 같은 전하)
  closeV(s.parts[1].E, s.parts[3].E);                                     // B(+q) 는 D 쪽으로 밀고, D(−q) 는 D 쪽으로 당긴다
});

test('B1-03 개념 체크: A(−3d, 0), B(3d, 0) 의 +Q, P(0, 4d) → +y 1.6E₀ (세기 합 2E₀ 는 틀린 답)', () => {
  const s = M.solve('t345');
  s.parts.forEach((p) => { close(p.r, 5); close(p.mag, 1); });             // 거리 5d → 세기 E₀
  closeV(s.parts[0].E, [0.6, 0.8, 0]); closeV(s.parts[1].E, [-0.6, 0.8, 0]);
  closeV(s.sum, [0, 1.6, 0]);
  assert.ok(M.cancels(s.parts, 0));
  close(s.scalar, 2);
  assert.ok(s.mag < s.scalar);
});

test('B1-03 3차원: 거리가 모두 √5 d 인 네 전하 → x·y 는 대칭 쌍으로 상쇄, z 만 남아 4E₀/√5. D 를 −q 로 바꾸면 2E₀', () => {
  const s = M.solve('py');
  s.parts.forEach((p) => { close(p.r, R5); close(p.mag, 1); });            // 세기는 전하량에 비례, 방향만 다르다
  closeV(s.sum, [0, 0, 4 / R5]);
  assert.ok(M.cancels(s.parts, 0) && M.cancels(s.parts, 1) && !M.cancels(s.parts, 2));
  const d = M.solve('pyD');
  close(d.mag, 2);
  closeV(d.sum, [0, -4 / R5, 2 / R5]);
  closeV(M.unit(d.sum), M.unit([0, -2, 1]));
  assert.ok(M.cancels(d.parts, 0) && !M.cancels(d.parts, 1));              // A·C 쌍은 여전히 지워지고 B·D 쌍은 안 지워진다
  assert.deepEqual(M.cancelPairs(d.parts, 0), [[0, 2]]);                   // x: A·C
  assert.deepEqual(M.cancelPairs(d.parts, 2), [[1, 3]]);                   // z: 거울 쌍 B·D 끼리만 지워진다 (A·C 의 z 는 남는다)
  closeV(M.add(d.parts[1].E, d.parts[3].E), [0, -4 / R5, 0]);              // B·D 를 먼저 더하면 −y 만 남는다
});

test('B1-03 3차원: 정육면체 꼭짓점 P 와 이웃한 세 꼭짓점의 +q → 세 축 방향 E₀ 의 합 √3 E₀ (대각선 방향), 정사면체 꼭대기 √6 E₀', () => {
  const c = M.solve('cube');
  closeV(c.sum, [1, 1, 1]);
  close(c.mag, R3);
  const p = M.PRESETS.cube, neg = M.superposeU(p.charges.map((x, i) => (i === 2 ? Object.assign({}, x, {q: -1}) : x)), p.P, p.q0, p.r0);
  closeV(neg.sum, [1, 1, -1]); close(neg.mag, R3);                          // 하나를 −q 로: 세기 그대로, 그 성분만 뒤집힌다
  const t = M.solve('tet');
  t.parts.forEach((x) => close(x.r, 2 * R3));
  closeV(t.sum, [0, 0, R6]);
  assert.ok(M.cancels(t.parts, 0) && M.cancels(t.parts, 1));               // 120° 간격의 수평 성분 셋이 지워진다
});

test('B1-03 도전: A(3d, 0) +27q, B(0, 4d) +64q → O 에서 5kq/d², (−3, −4) 방향. C(3d, 4d) 에 −125q 를 놓으면 0', () => {
  const s = M.solve('chal');
  closeV(s.parts[0].E, [-3, 0, 0]); closeV(s.parts[1].E, [0, -4, 0]);
  closeV(s.sum, [-3, -4, 0]); close(s.mag, 5);
  close(M.nullingCharge(s.sum, [3, 4], [0, 0]), -125, 1e-9);
  close(M.solve('chalC').mag, 0, 1e-12);
});

test('B1-03 중첩 원리: 합성 전기장 = 각 전하 전기장의 벡터 합, 전하량에 비례(선형)', () => {
  const cs = [{q: 2, at: [0.5, -1.2, 0.3]}, {q: -3, at: [-1.4, 0.7, -0.2]}, {q: 1.5, at: [2.1, 1.9, 1]}, {q: -0.5, at: [-0.3, -2, 0.8]}];
  const P = [0.4, 0.9, -0.6];
  const s = M.superpose(cs, P);
  closeV(s.sum, M.add(...cs.map((c) => M.field(c.q, c.at, P))));
  closeV(M.superpose(cs.map((c) => ({q: 2 * c.q, at: c.at})), P).sum, M.scale(s.sum, 2));
  closeV(M.superpose(cs.map((c) => ({q: -c.q, at: c.at})), P).sum, M.scale(s.sum, -1));
  for (const p of s.parts) {                                               // 성분 공식 Eₓ = kqΔx/r³
    for (let ax = 0; ax < 3; ax++) close(p.E[ax], M.comp(p.q, p.d[ax], p.r), 1e-12);
    close(p.mag, M.strength(p.q, p.r), 1e-12);
  }
  assert.ok(s.mag <= s.scalar + 1e-12);                                    // |합| ≤ 세기의 합
  const same = M.superpose([{q: 1, at: [-1, 0]}, {q: 3, at: [-2, 0]}], [1, 0]);   // 모두 같은 방향일 때만 같다
  close(same.mag, same.scalar, 1e-12);
});

test('B1-03 세기는 거리 제곱에 반비례: 2배 → ¼, 대각선 √2 배 → ½ (1/√2 아님)', () => {
  const E1 = M.strength(1, 1);
  close(M.strength(1, 2) / E1, 1 / 4);
  close(M.strength(1, R2) / E1, 1 / 2);
  assert.ok(Math.abs(M.strength(1, R2) / E1 - 1 / R2) > 0.2);
  close(M.strength(-3, 1), 3);                                             // 세기는 |q|
});

test('B1-03 방향은 부호로: 양전하는 멀어지는 쪽, 음전하는 향하는 쪽. tan θ = E_y/Eₓ', () => {
  assert.equal(M.sense(1, [0, 0], [1, 2]), 'away');
  assert.equal(M.sense(-2, [0, 0], [1, 2]), 'toward');
  closeV(M.unit(M.field(-1, [3, 1], [0, 0])), M.unit([3, 1]));            // 음전하: 관찰점에서 전하 쪽
  const E = M.superpose([{q: 1, at: [0, 0]}, {q: 2, at: [3, -1]}], [1, 2]).sum;
  close(Math.tan(M.dirDeg(E) * M.RAD), M.tanTheta(E), 1e-9);
  assert.ok(Number.isNaN(M.field(1, [1, 1], [1, 1])[0]));                 // 전하 자리에서는 정의되지 않는다
});

test('B1-03 전·후 비교: 한 전하만 옮기면 합의 차는 그 전하 기여의 차 (고정 전하 기여는 지워진다)', () => {
  const cs = [{q: 1, at: [-1, 0]}, {q: -1, at: [1, 0]}, {q: 2, at: [0, -2]}];
  const r = M.moveDiff(cs, 1, [2, 1], [0, 1]);
  closeV(r.diff, r.moved, 1e-12);
});

test('B1-03 3차원 보기: 위에서 보면 (x, y), 옆에서 보면 (x, z) — 돌려도 길이는 그대로', () => {
  const p = [1.3, -0.7, 2.2];
  const top = M.project(p, 0, 90), side = M.project(p, 0, 0);
  close(top.x, 1.3); close(top.y, -0.7, 1e-12);
  close(side.x, 1.3); close(side.y, 2.2);
  for (const [a, b] of [[-28, 24], [40, 10], [-120, 70]]) {
    const q = M.project(p, a, b);
    close(q.x * q.x + q.y * q.y + q.depth * q.depth, M.dot(p, p), 1e-12);
  }
  assert.ok(M.project([0, 5, 0], -28, 24).depth < 0);                       // +y 는 화면 안쪽(멀리)
});
