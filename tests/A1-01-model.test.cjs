const {test} = require('node:test');
const assert = require('node:assert/strict');
const M = require('../physics/A1/01/A1-01-model.js');
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);
const R3 = Math.sqrt(3);

test('A1-01 예제: 2 kg, 실 1 연직과 30°, 실 2 연직과 60° (직각) → T₁ = 10√3 ≈ 17.3 N, T₂ = 10 N', () => {
  const h = M.hangRight(2, 30);
  close(h.W, 20);
  close(h.T1, 10 * R3, 1e-9);
  close(h.T2, 10, 1e-9);
  assert.equal(h.T1.toFixed(1), '17.3');
  close(h.T1 * h.T1 + h.T2 * h.T2, 400, 1e-9);                 // 검산: T₁² + T₂² = (mg)²
  assert.ok(h.T1 > h.T2);                                        // 연직에 가까운 실이 더 큰 힘
  close(M.hang(2, 30, 60).T1, h.T1, 1e-12);                     // 일반식(성분 평형)과 같은 값
});

test('A1-01 평형: 세 힘을 꼬리–머리로 이으면 닫힌다 (x칸 합 0, y칸 합 0), 숫자 합은 mg 보다 크다', () => {
  for (const [a1, a2] of [[30, 60], [10, 80], [45, 45], [60, 60], [20, 50], [65, 5]]) {
    const h = M.hang(2, a1, a2);
    assert.ok(M.isZero(h.net, 1e-9), `${a1}, ${a2}`);
    close(M.mag(h.sum), h.W, 1e-9);                              // 화살표 합 |T₁ + T₂| = mg (연직 위)
    close(M.dirDeg(h.sum), 90, 1e-9);
    close(h.T1v[0] + h.T2v[0], 0, 1e-9);                         // 가로 성분은 서로 지운다
    assert.ok(h.T1 + h.T2 >= h.W - 1e-9);                        // 숫자 합 ≥ 무게
  }
  close(M.hangRight(2, 30).T1 + M.hangRight(2, 30).T2, 10 * R3 + 10, 1e-9);   // 27.3 N
});

test('A1-01 직각인 두 실: 연직에 가까운 실일수록 장력이 크다 (45°에서 같다)', () => {
  for (let a = 5; a < 45; a += 5) assert.ok(M.hangRight(1, a).T1 > M.hangRight(1, a).T2);
  close(M.hangRight(1, 45).T1, M.hangRight(1, 45).T2, 1e-12);
  for (let a = 5; a < 85; a += 5) assert.ok(M.hangRight(1, a + 5).T1 < M.hangRight(1, a).T1);
  // 대칭으로 연직과 60°씩: 2T cos 60° = mg → T = mg, 더 눕히면 mg 보다 크다
  close(M.hang(2, 60, 60).T1, 20, 1e-9);
  assert.ok(M.hang(2, 65, 65).T1 > 20);
});

test('A1-01 두 힘의 합성: 동쪽 3 N + 북쪽 4 N = 5 N (7 N 아님), 각이 벌어질수록 합력이 작다', () => {
  const R = M.add([3, 0], [0, 4]);
  close(M.mag(R), 5, 1e-12);
  close(M.numSum([3, 0], [0, 4]), 7, 1e-12);
  close(M.resultant(3, 4, 90), 5, 1e-12);
  close(M.resultant(3, 4, 0), 7, 1e-12);
  close(M.resultant(3, 4, 180), 1, 1e-12);
  for (let p = 0; p < 180; p += 10) assert.ok(M.resultant(3, 4, p + 10) < M.resultant(3, 4, p));
  // 평행사변형법 = 삼각형법 = 성분별 덧셈, 순서를 바꿔도 같다
  const A = M.vec(3, 20), B = M.vec(4, 110);
  close(M.mag(M.add(A, B)), M.resultant(3, 4, M.angleBetween(A, B)), 1e-9);
  assert.deepEqual(M.add(A, B).map((v) => +v.toFixed(12)), M.add(B, A).map((v) => +v.toFixed(12)));
  // 차: A − B = A + (−B) 는 꼬리를 모았을 때 B 의 머리에서 A 의 머리로 가는 화살표
  const D = M.sub(A, B);
  close(D[0], A[0] - B[0], 1e-12); close(D[1], A[1] - B[1], 1e-12);
});

test('A1-01 성분 분해: Aₓ = A cos θ, A_y = A sin θ, A = √(Aₓ² + A_y²)', () => {
  const v = M.vec(10, 30);
  close(v[0], 5 * R3, 1e-12); close(v[1], 5, 1e-12);
  close(M.mag(v), 10, 1e-12); close(M.dirDeg(v), 30, 1e-9);
  const w = M.vec(5, Math.atan2(3, 4) / M.RAD);
  close(w[0], 4, 1e-12); close(w[1], 3, 1e-12);
});

test('A1-01 개념 체크: 모눈 F₁ = (3, 1), F₂ = (−1, 2) 를 평형시키는 F₃ = (−2, −3)', () => {
  const F3 = M.balancing([3, 1], [-1, 2]);
  assert.deepEqual(F3, [-2, -3]);
  assert.ok(M.isZero(M.add([3, 1], [-1, 2], F3)));
  assert.ok(!M.isZero(M.add([3, 1], [-1, 2], [2, 3])));          // (2, 3) 은 합력 자체 → 평형이 아니다
});

test('A1-01 빗면: 중력은 mg sin θ 와 mg cos θ 로 나뉘고, 수평력으로 붙잡으면 F = mg tan θ, N = mg/cos θ (N 이 가장 크다)', () => {
  const a = M.incline(2, 30);
  close(a.along, 10, 1e-9); close(a.perp, 10 * R3, 1e-9);
  close(a.along ** 2 + a.perp ** 2, 400, 1e-9);
  for (const th of [10, 20, 30, 40, 50]) {
    const h = M.inclineHeld(2, th);
    assert.ok(M.isZero(M.add(h.Wv, h.Fv, h.Nv), 1e-9));            // 세 힘이 닫힌 삼각형
    close(h.F, 20 * M.tanD(th), 1e-9); close(h.N, 20 / M.cosD(th), 1e-9);
    assert.ok(h.N > h.W && h.N > h.F);                              // 빗변 N 이 가장 크다
    assert.ok(h.N > M.incline(2, th).N);                            // mg cos θ 보다 크다 (ㄱ 은 틀림)
  }
});
