const {test} = require('node:test');
const assert = require('node:assert/strict');
const M = require('../physics/A2/03/A2-03-model.js');
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

test('A2-03 예제: 2 kg 이 빗면을 일정한 속력으로 높이 3 m 내려옴 → 마찰력의 일 −60 J, 역학적 에너지 60 J 감소', () => {
  const m = 2, th = 30, h = 3, v0 = 2, s = M.slide(m, th, h, v0, 0);
  const f = s.fEven;                                        // 등속 = 마찰력 mg sinθ = 10 N
  close(f, 10, 1e-9);
  const e = M.slideAt(m, th, h, v0, f, M.slide(m, th, h, v0, f).L);
  close(e.dK, 0, 1e-9);                                     // 등속 → ΔK = 0
  close(e.dU, -60, 1e-9);                                   // ΔU = −mgh
  close(e.Wf, -60, 1e-9);                                   // 마찰력의 일 = ΔK + ΔU
  close(e.dE, -60, 1e-9); close(e.Q, 60, 1e-9);             // 60 J 이 열로
  assert.equal(M.verdict(e.dE), '감소');
});

test('A2-03 비보존력의 일 = ΔK + ΔU (어떤 마찰력, 어떤 자리에서도). 마찰이 없으면 보존', () => {
  for (const f of [0, 2, 4, 7.5, 10, 12]) {
    for (const x of [0.5, 2, 4, 6]) {
      const e = M.slideAt(2, 30, 3, 2, f, x);
      close(e.Wf, e.dK + e.dU, 1e-9);                       // 에너지 장부 (중력은 ΔU 로만)
      close(e.Wg + e.Wf, e.dK, 1e-9);                       // 일 장부 (중력은 일로만)
      close(e.E + e.Q, e.E0, 1e-9);                         // 잃은 역학적 에너지 = 열
    }
  }
  const free = M.slideAt(2, 30, 3, 2, 0, 6);
  close(free.dE, 0, 1e-9); close(free.v, 8, 1e-9); assert.equal(M.verdict(free.dE), '보존');
  const half = M.slideAt(2, 30, 3, 2, 4, 6);                // 마찰력 4 N: 24 J 이 열, 바닥 K = 4 + 60 − 24 = 40 J
  close(half.Wf, -24, 1e-9); close(half.K, 40, 1e-9);
});

test('A2-03 중력이 한 일은 경로와 무관: 세 경로 모두 mgh, 닫힌 경로에서는 0', () => {
  const m = 1, hA = 5;
  const Ws = [1, 2, 3].map((k) => M.gravityWork(m, M.pathPoints(k, {hA})));
  for (const W of Ws) close(W, m * 10 * hA, 1e-9);
  const deep = M.pathPoints(3, {hA, dip: 1.2});             // B 보다 낮은 곳을 지나도 같다
  assert.ok(M.minY(deep) < -0.5);
  close(M.gravityWork(m, deep), 50, 1e-9);
  const Ls = [1, 2, 3].map((k) => M.lengthOf(M.pathPoints(k, {hA})));
  assert.ok(new Set(Ls.map((L) => L.toFixed(2))).size === 3);   // 길이는 모두 다르다
  const loop = M.pathPoints(2, {hA}).concat(M.pathPoints(1, {hA}).reverse());
  close(M.gravityWork(m, loop), 0, 1e-9);
  // 경로 위 어디서나 그때까지의 중력의 일 = mg × 내려간 높이
  const p3 = M.pathPoints(3, {hA, dip: 0.8});
  for (const s of [1, 3, 5]) { const q = M.along(p3, s, m); close(q.Wg, m * 10 * (hA - q.y), 1e-9); }
});

test('A2-03 마찰력의 일은 경로 길이에 비례: 같은 A → B 라도 돌아가면 더 많이 잃는다, 닫힌 경로에서도 0 이 아니다', () => {
  const f = 5, R = M.routes(4, 1.5);
  close(R.short, 4, 1e-12); close(R.long, 7, 1e-12);
  close(M.frictionWork(f, [[0, 0], [4, 0]]), -20, 1e-12);
  close(M.frictionWork(f, [[0, 0], [0, 1.5], [4, 1.5], [4, 0]]), -35, 1e-12);
  assert.ok(M.frictionWork(f, [[0, 0], [4, 0], [0, 0]]) < 0);   // 갔다 오면 −40 J
});

test('A2-03 개념 체크: 1 kg 을 높이 2 m 들어 올리며 0 → 4 m/s → 손의 일 28 J (중력을 두 번 세면 48 J)', () => {
  const L = M.lift(1, 2, 0, 4);
  close(L.dU, 20, 1e-12); close(L.dK, 8, 1e-12); close(L.W, 28, 1e-12);
  close(L.W, L.dK + L.dU, 1e-12);                           // 외력의 일 = 역학적 에너지 증가
  close(L.W + L.Wg, L.dK, 1e-12);                           // 일 장부로 보아도 같다
  close(L.double, 48, 1e-12); assert.ok(L.double !== L.W);
  const c = M.lift(1, 2, 2, 2);                             // 등속으로 끌어올리면 외력의 일 = ΔU
  close(c.W, c.dU, 1e-12); close(c.F, 10, 1e-12);
  const T = M.liftTime(2, 0, 4), end = M.liftAt(1, 2, 0, 4, T);
  close(T, 1, 1e-12); close(end.y, 2, 1e-12); close(end.v, 4, 1e-12); close(end.WF, 28, 1e-12);
});
