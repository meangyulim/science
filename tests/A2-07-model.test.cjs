const {test} = require('node:test');
const assert = require('node:assert/strict');
const M = require('../physics/A2/07/A2-07-model.js');
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);
const R = M.RAMP, g = M.G;

test('A2-07 예제: 6 m/s 수평 이탈, tanφ = 1/2 경사면에 수직 도달 → |v_y| = 12 m/s, 포물선 동안 중력이 한 일 72 J', () => {
  const vx = 6, vy = M.perpVy(vx, 0.5);
  close(vy, 12, 1e-12);                                         // v_x/|v_y| = tanφ
  close(M.gravityWork(1, 0, vy), 72, 1e-12);                    // ½m(v_y² − 0)
  close(M.timeFromVy(vy), 1.2, 1e-12);                          // 공중 1.2 s
});

test('A2-07 무대 기본값: 빗면 장부 128 = 80 + 30 + 18 → 이탈 6 m/s, 1.2 s 뒤 (14.2 m, 0.8 m)에서 경사면에 수직, 중력의 일 72 J', () => {
  const L = M.ledger(1, 16, 6);
  close(L.K1, 128, 1e-12); close(L.dU, 80, 1e-12); close(L.loss, 30, 1e-12); close(L.Kq, 18, 1e-12); close(L.vq, 6, 1e-12);
  const F = M.flight(L.vq, 0.5);
  assert.equal(F.on, 'slope'); assert.ok(F.perp);
  close(F.t, 1.2, 1e-12); close(F.x, 14.2, 1e-12); close(F.y, 0.8, 1e-12);
  close(F.vy, -12, 1e-12); close(F.angle, Math.PI / 2, 1e-9);   // 속도 ⟂ 경사면
  close(F.speed, 6 * Math.sqrt(5), 1e-12);
  close(M.gravityWork(1, 0, F.vy), 72, 1e-12);
  close(1 * g * (R.H - F.y), 72, 1e-12);                        // = mg × 떨어진 높이 (중력의 일을 둘 중 하나로만)
});

test('A2-07 빗면 운동(조각별 등가속도)도 장부와 같다: 꼭대기 속력 6 m/s, 늘 K + U + 열 = 처음 운동 에너지', () => {
  const m = 1, v1 = 16, f = 6, run = M.rampRun(m, v1, f);
  assert.equal(run.end, 'top');
  close(run.vEnd, 6, 1e-9);
  close(run.tEnd, 0.92973, 1e-4);                               // 1/6 + 0.427 + 0.340 s
  for (let k = 0; k <= 20; k++) {
    const t = run.tEnd * k / 20, st = M.rampAt(run, t);
    const K = 0.5 * m * st.v ** 2, U = m * g * st.s * R.sin, Q = f * M.bandPath(run, t);
    close(K + U + Q, 128, 1e-9);
  }
  close(f * M.bandPath(run, run.tEnd), 30, 1e-9);               // 마찰 구간 5 m 를 한 번 지남
  // 마찰 구간에서는 감속이 커진다 (−g sinα − f/m = −14, 밖에서는 −8)
  assert.deepEqual(run.pieces.map((p) => Math.round(p.a)), [-8, -14, -8]);
});

test('A2-07 포물선 동안 중력의 일 = 연직 성분 운동 에너지 변화 = 전체 운동 에너지 변화 = mg × 떨어진 높이 (수평 성분은 그대로)', () => {
  for (const [vq, tp] of [[6, 0.5], [3, 0.5], [9, 0.75], [4, 1], [7, 0]]) {
    const F = M.flight(vq, tp), m = 2;
    const dK = 0.5 * m * (F.vx ** 2 + F.vy ** 2) - 0.5 * m * vq ** 2;
    close(M.gravityWork(m, 0, F.vy), dK, 1e-9);
    close(dK, m * g * (R.H - F.y), 1e-9);
    assert.equal(F.vx, vq);                                     // 수평 속도 그대로
    close(M.dvFromTime(F.t), -F.vy, 1e-12);                     // 시간 조건 → Δv_y = gt
  }
});

test('A2-07 이탈 속도가 다음 구간의 초기 조건: 이탈 속력이 다르면 착지 자리와 각이 달라진다 (수직 도달은 6 m/s 일 때만)', () => {
  const a = M.flight(6, 0.5), b = M.flight(8, 0.5), c = M.flight(4, 0.5);
  assert.ok(a.perp && !b.perp && !c.perp);
  assert.ok(b.x > a.x && a.x > c.x);
  assert.ok(b.angle < a.angle && c.angle < a.angle);            // 빠르면 덜 기울어 닿는다
  const low = M.flight(2, 0.5);                                 // 너무 느리면 경사면 앞 바닥에 떨어진다
  assert.equal(low.on, 'ground'); close(low.y, 0, 1e-12);
});

test('A2-07 거꾸로 풀기: 수직 도달 → 이탈 6 m/s → 마찰 손실 30 J, 마찰력 6 N / 착지 속력이 주어지면 에너지 보존으로 이탈 속력', () => {
  close(M.lossFor(1, 16, 6), 30, 1e-12);
  close(M.frictionFor(1, 16, 6), 6, 1e-12);
  close(M.vqFromLanding(14, 8), 6, 1e-12);                      // ½v_q² + 10 × 8 = ½ × 14²
  const F = M.flight(6, 0);                                     // 바닥에 떨어지면 착지 속력 14 m/s
  assert.equal(F.on, 'ground'); close(F.speed, 14, 1e-12);
});

test('A2-07 개념 체크: 0.8 m 실을 수평에서 놓아 최저점(바닥 위 1.25 m)에서 끊기면 4 m/s, 0.5 s, 수평 거리 2 m; 끊기기 직전 장력 3mg', () => {
  const v = M.swingSpeed(0.8, Math.PI / 2);
  close(v, 4, 1e-12);
  const F = M.breakFlight(v, 1.25);
  close(F.t, 0.5, 1e-12); close(F.x, 2, 1e-12); close(F.vy, 5, 1e-12);
  close(M.swingTension(0.5, 0.8, Math.PI / 2), 15, 1e-12);      // mg + mv²/l = 5 + 10
  // 정확한 진자 운동: T/4 에 최저점(θ = 0), 그때 속력 = 에너지로 구한 4 m/s
  const tq = M.quarter(0.8, Math.PI / 2), s = M.swingAt(tq, 0.8, Math.PI / 2);
  close(s.th, 0, 1e-9); close(s.v, 4, 1e-9);
  for (const f of [0.2, 0.5, 0.8]) {                             // 내려오는 동안 ½mv² = mg × 내려온 높이
    const q = M.swingAt(f * tq, 0.8, Math.PI / 2);
    close(0.5 * q.v ** 2, g * 0.8 * Math.cos(q.th), 1e-9);
  }
});

test('A2-07 꼭대기에 못 가면: 마찰 구간에서 멈추거나(f ≥ mg sinα) 되돌아 내려오며 내려올 때도 열이 생긴다', () => {
  const back = M.rampRun(1, 12, 6);
  assert.equal(back.end, 'back');
  const up = (72 - 20) / 14, heat = 6 * M.bandPath(back, back.tEnd);
  close(heat, 2 * 6 * up, 1e-9);                                // 올라갈 때와 내려올 때 같은 길이만큼
  close(0.5 * back.vEnd ** 2 + heat, 72, 1e-9);                 // 바닥으로 돌아왔을 때: K + 열 = 처음 K
  const stuck = M.rampRun(1, 12, 10);                           // f/m = 10 ≥ g sinα = 8 → 멈춘 채로
  assert.equal(stuck.end, 'stuck');
  close(stuck.sEnd, 2.5 + 52 / 18, 1e-9);
  const top0 = M.rampRun(1, 15, 6.5);                           // 장부가 꼭 0: 꼭대기에 딱 멈춘다
  assert.equal(top0.end, 'top'); close(top0.vEnd, 0, 1e-6);
  assert.ok(!M.ledger(1, 15, 7).reach && M.ledger(1, 15, 6.5).reach);
});
