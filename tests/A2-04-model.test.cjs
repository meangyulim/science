const {test} = require('node:test');
const assert = require('node:assert/strict');
const M = require('../physics/A2/04/A2-04-model.js');
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

test('A2-04 예제: 1 kg, 높이 1 m, 마찰 구간 2 m·2 N → 구간 왼쪽 끝에서 1 m(가운데)에서 멈춘다', () => {
  const E0 = M.energy0(1, 1);
  close(E0, 10);                                   // 처음 역학적 에너지 mgh = 10 J
  close(M.passLoss(2, 2), 4);                      // 한 번 통과 손실 fL = 4 J
  close(M.totalPath(E0, 2), 5);                    // 총 이동 거리 10 J ÷ 2 N = 5 m
  const s = M.stopOnZone(E0, 2, 2);
  assert.equal(s.pass, 3);                         // 5 m = 2 + 2 + 1 → 세 번째 통과
  assert.deepEqual(s.parts, [2, 2, 1]);
  assert.equal(s.rightward, true);                 // 세 번째는 왼 → 오
  close(s.x, 1);                                   // 왼쪽 끝에서 1 m = 구간 가운데
  const hs = M.riseHeights(1, 1, 2, 2);            // 통과할 때마다 4 J 씩: 0.6 m(오른쪽) → 0.2 m(왼쪽)
  assert.equal(hs.length, 2);
  close(hs[0].h, 0.6); assert.equal(hs[0].side, 'R');
  close(hs[1].h, 0.2); assert.equal(hs[1].side, 'L');
});

test('A2-04 예제를 궤도 위에서 움직여도 같은 곳에서 멈추고, 매 순간 K + U + 열 = 10 J', () => {
  const tr = M.bowl(2), sim = M.simulate(tr, 1, 1, 2);
  const z0 = tr.zones[0].x0;
  assert.equal(sim.stop.pass, 3);
  close(sim.stop.x - z0, 1, 1e-9);                 // 마찰 구간 왼쪽 끝에서 1 m
  close(sim.Qend, 10, 1e-9);                       // 처음 에너지가 모두 열로
  close(sim.turns[0].y, 0.6, 1e-12);               // 오른쪽 곡면 0.6 m
  close(sim.turns[1].y, 0.2, 1e-12);               // 왼쪽 곡면 0.2 m
  for (const st of M.samples(sim, 1 / 30)) {
    close(st.K + st.U + st.Q, 10, 1e-9);           // 에너지 장부
    close(st.Q, 2 * st.sf, 1e-9);                  // 열 = 마찰력 × 마찰 구간에서 간 거리
    assert.ok(st.K >= 0 && st.Q >= 0 && st.Q <= 10 + 1e-9);
  }
  // 곡면 위의 위치는 운동 방정식으로 푼 것: 그 높이에서의 속력과 에너지 장부가 맞는지 (곡면은 마찰 없음)
  const leg = sim.legs.find((L) => L.kind === 'curve' && !L.half);
  const a = M.stateAt(sim, leg.t0 + leg.dur * 0.3), b = M.stateAt(sim, leg.t0 + leg.dur * 0.31);
  const ds = Math.hypot(b.x - a.x, b.y - a.y) / (b.t - a.t);
  close(ds, (a.v + b.v) / 2, 2e-3);
});

test('A2-04 역학적 에너지는 마찰 구간에서만, 지난 거리에 비례해 준다 (곡면·마찰 없는 바닥에서는 그대로)', () => {
  const sim = M.simulate(M.bowl(2), 1, 1, 2), ss = M.samples(sim, 1 / 120);
  for (let i = 1; i < ss.length; i++) {
    const p = ss[i - 1], q = ss[i], dE = q.E - p.E;
    if (p.leg === q.leg && !sim.legs[q.leg].rough) close(dE, 0, 1e-9);
    if (p.leg === q.leg && sim.legs[q.leg].rough) close(dE, -2 * Math.abs(q.x - p.x), 1e-9);   // ΔE = −f|Δx|
    assert.ok(dE <= 1e-9);                         // 되돌아올 때도 줄기만 한다
  }
});

test('A2-04 왕복: 마찰력의 일은 갈 때도 올 때도 −fs, 방향 고정 힘은 되돌아오면 부호가 바뀌어 합 0', () => {
  const r = M.roundTrip(3, 2, 1.6, true);
  close(r.WFgo, 4.8); close(r.WFback, -4.8); close(r.WF, 0);
  close(r.Wfgo, -3.2); close(r.Wfback, -3.2); close(r.Wf, -6.4);
  close(r.sum, -2 * 2 * 1.6);                      // 개념 체크: 합 = −2fs
  // 외력 장면: 1 kg, 4 m/s, F = 3 N(왼쪽 고정), f = 2 N → 1.6 m 가서 되돌아오면 K = (F − f)s = 1.6 J = K₀ − 2fs
  const sim = M.simulateForce(1, 4, 3, 2);
  close(sim.s, 1.6, 1e-12);
  const far = M.stateAt(sim, sim.legs[0].t1), end = M.stateAt(sim, sim.tEnd);
  close(far.WF, -4.8, 1e-9); close(far.Wf, -3.2, 1e-9); close(far.K, 0, 1e-9);
  close(end.x, 0, 1e-9); close(end.WF, 0, 1e-9); close(end.Wf, -6.4, 1e-9); close(end.K, 1.6, 1e-9);
  for (let t = 0; t <= sim.tEnd; t += 0.05) { const st = M.stateAt(sim, t); close(st.K, 8 + st.WF + st.Wf, 1e-9); }   // ΔK = 일의 합
  assert.equal(M.simulateForce(1, 4, 1.5, 2).back, false);   // F ≤ f 이면 정지 마찰력이 붙잡는다
  // 곡면의 중력(방향 고정)도 같은 높이로 돌아오면 일의 합이 0
  const bs = M.simulate(M.bowl(2), 1, 1, 2), cur = bs.legs.find((L) => L.kind === 'curve' && !L.half);
  close(M.stateAt(bs, cur.t0).Wg, M.stateAt(bs, cur.t1).Wg, 1e-9);
});

test('A2-04 개념 체크: 2 kg, 0.8 m → 한 번 지나 0.5 m(구간 1 m) 이면 마찰력 6 N, 도전: 10 N·3 m/s·A에서 0.7 m', () => {
  close(M.frictionFrom(2, 0.8, 0.5, 1), 6, 1e-9);
  assert.notEqual(Math.round(M.frictionFrom(2, 0.8, 0, 1)), 6);   // 16 N 은 처음 퍼텐셜을 한 번에 다 잃는다고 본 값
  const sim = M.simulate(M.bowl(1), 2, 0.8, 6);
  close(sim.turns[0].y, 0.5, 1e-12);
  // 도전 문제: 2 kg, 1.25 m, AB = 1.6 m, 처음 지난 뒤 0.45 m
  const f = M.frictionFrom(2, 1.25, 0.45, 1.6);
  close(f, 10, 1e-9);
  close(M.speedAt(2, M.energy0(2, 0.45)), 3, 1e-12);
  const s = M.stopOnZone(M.energy0(2, 1.25), f, 1.6);
  assert.equal(s.pass, 2); assert.equal(s.rightward, false);
  close(s.x, 0.7, 1e-9); close(s.into, 0.9, 1e-9);
  const sim2 = M.simulate(M.bowl(1.6), 2, 1.25, 10);
  close(sim2.stop.x - sim2.track.zones[0].x0, 0.7, 1e-9);
});

test('A2-04 등속 구간: 손실 = mgΔh 로 손실 단위가 정해지고, 같은 마찰력인 바닥 구간은 길이 비로', () => {
  const tr = M.slopeTrack(1.5), m = 1, f = M.constFriction(m, tr.sA);   // 빗면 sinθ = 0.2 → f = 2 N
  close(f, 2, 1e-12);
  const W = M.constLoss(m, tr.hA);                 // 빗면 구간 A 손실 = mgΔh = 2 J = f × L_A
  close(W, 2, 1e-12); close(W, f * tr.LA, 1e-12);
  close(M.lossByLength(W, tr.LA, tr.LB), 3, 1e-12);   // 바닥 구간 B (1.5 m) → 3 J
  const sim = M.simulate(tr, m, 1, f);
  const a = sim.legs.find((L) => L.kind === 'slope');
  const p = M.stateAt(sim, a.t0), q = M.stateAt(sim, a.t0 + a.dur * 0.5), r = M.stateAt(sim, a.t1);
  close(p.K, q.K, 1e-9); close(p.K, r.K, 1e-9);    // 빗면 구간을 내려가는 동안 등속: K 그대로
  close(r.Q - p.Q, 2, 1e-9); close(p.U - r.U, 2, 1e-9);   // 줄어든 퍼텐셜 에너지가 모두 열로
  close(sim.turns[0].y, 0.5, 1e-12);               // (10 − 2 − 3) J → 오른쪽 곡면 0.5 m
  close(sim.stop.y, 0.1, 1e-9);                     // B 를 되돌아 지나 빗면을 0.5 m 오르다 멈춘다 (정지 마찰력으로 그대로)
  close(sim.Qend, 9, 1e-9);
  for (const st of M.samples(sim, 1 / 30)) close(st.K + st.U + st.Q, 10, 1e-9);
});
