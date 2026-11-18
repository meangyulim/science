const {test} = require('node:test');
const assert = require('node:assert/strict');
const M = require('../physics/A1/15/A1-15-model.js');
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

test('A1-15 예제: 50 kg, (가) 위로 출발하며 2 m/s² 가속 → 600 N, (나) 위로 가다 2 m/s² 감속 → 400 N', () => {
  close(M.normal(50, M.accelOf('upAcc', 2)), 600);
  close(M.normal(50, M.accelOf('upDec', 2)), 400);
  assert.equal(M.apparent('upAcc', 2), 'heavier');
  assert.equal(M.apparent('upDec', 2), 'lighter');
});

test('A1-15 두 관찰자: 밖에서는 N − mg = ma(합력), 안에서는 관성력 −ma 를 더해 합 0 — 같은 N 이 나온다', () => {
  for (const [m, ay] of [[50, 2], [50, -2], [70, 3.5], [40, 0]]) {
    const v = M.elevatorViews(m, ay);
    close(v.net, m * ay);              // 관성계: 실제 힘의 합력 = ma
    close(v.sumIn, 0);                 // 가속 좌표계: 관성력까지 더하면 평형
    close(v.Fi, -m * ay);              // 관성력은 가속도 반대쪽
  }
});

test('A1-15 눈금은 속도가 아니라 가속도 방향이 정한다 (내려가며 감속 = 무거워짐, 등속 = mg, 자유 낙하 = 0)', () => {
  assert.equal(M.apparent('downDec', 2), 'heavier');
  assert.equal(M.apparent('downAcc', 2), 'lighter');
  assert.equal(M.apparent('upConst', 2), 'same');
  assert.equal(M.apparent('downConst', 2), 'same');
  assert.equal(M.apparent('free', 2), 'weightless');
  close(M.normal(50, M.accelOf('downDec', 2)), 600);
  close(M.normal(50, M.accelOf('upConst', 2)), 500);
  close(M.normal(50, M.accelOf('free', 0)), 0);
  // 한 번 운행: v–t 기울기(가속도)가 + 인 구간에서만 N > mg
  const tr = M.trip(2, 6);
  for (const s of tr.segs) {
    const N = M.normal(50, s.ay);
    assert.equal(N > 500, s.ay > 0, s.key);
    assert.equal(M.accelOf(s.key, 2), s.ay, s.key);
  }
  close(M.tripAt(tr, tr.segs[3].t1).y, 6, 1e-9);                       // 위로 감속이 끝나면 꼭대기
  close(M.tripAt(tr, tr.T - 1e-9).y, 0, 1e-6);                          // 한 바퀴 돌면 제자리
  const run = M.phaseRun('upDec', 2, 6);
  close(run.v(run.T), 0, 1e-12); close(run.y(run.T), 6, 1e-9);
});

test('A1-15 개념 체크: 추가 뒤로 기울어 tan θ = 0.75 → 버스 가속도 앞쪽 7.5 m/s² (sin θ = 0.6 을 쓰면 6 이 되는 함정)', () => {
  close(M.accelFromTan(0.75), 7.5);
  close(Math.tan(M.tiltDeg(7.5) * M.RAD), 0.75, 1e-12);
  const sin = Math.sin(M.tiltDeg(7.5) * M.RAD);
  close(sin, 0.6, 1e-12);
  close(M.G * sin, 6, 1e-12);                                            // 틀린 값
});

test('A1-15 버스 속 추: 밖은 장력 + 중력 = ma(앞), 안은 관성력까지 평형, T = m√(g² + a²)', () => {
  const f = M.bobForces(2, 7.5);
  close(f.net[0], 2 * 7.5, 1e-9); close(f.net[1], 0, 1e-9);
  close(f.sumIn[0], 0, 1e-9); close(f.sumIn[1], 0, 1e-9);
  close(f.T, 2 * 12.5, 1e-9);
  close(M.gEff(7.5, 0).mag, 12.5, 1e-12);
  assert.ok(M.gEff(7.5, 0).v[0] < 0);                                     // g − a 는 뒤쪽 아래 → 실이 뒤로 기운다
});

test('A1-15 개념 체크 ㄱㄴㄷ (엘리베이터) → ㄱ, ㄴ', () => {
  const g = M.G;
  const a = M.apparent('downDec', 3) === 'heavier';                      // ㄱ 내려가며 감속 → 눈금이 크다 (옳음)
  const b = M.gEff(0, M.accelOf('free', 0)).mag < 1e-12;                 // ㄴ 자유 낙하 → 유효 중력 0 → 놓은 공이 떠 있다 (옳음)
  const c = M.period(1, M.gEff(0, -g / 3).mag) < M.period(1, g);           // ㄷ 아래로 g/3 가속 → 주기가 짧다? (틀림)
  assert.deepEqual([a, b, c], [true, true, false]);
  close(M.period(1, M.gEff(0, -g / 3).mag) / M.period(1, g), Math.sqrt(1.5), 1e-12);   // 오히려 √1.5 배 길다
});

test('A1-15 g − a 세상: 수평 g 가속 → g_eff = √2 g, 주기 × 2^(−1/4). 트럭(a = 7.5) 천장 1.8 m 에서 놓은 공 → 0.6 s, 뒤로 1.35 m', () => {
  close(M.gEff(10, 0).mag, 10 * Math.SQRT2, 1e-12);
  close(M.period(1, M.gEff(10, 0).mag) / M.period(1, 10), Math.pow(2, -0.25), 1e-12);
  const d = M.dropInCar(1.8, 7.5);
  close(d.t, 0.6, 1e-12); close(d.back, 1.35, 1e-12);
  close(M.period(0.5, M.gEff(7.5, 0).mag), 0.4 * Math.PI, 1e-12);       // 길이 0.5 m 진자 주기 0.4π
  // 밖에서 본 같은 공은 포물선: 놓을 때 버스 속도 v0, 버스는 그동안 v0 t + ½at² 를 가므로 버스에 대해 뒤로 ½at²
  const v0 = 4, [x] = M.dropOutside(1.8, v0, d.t);
  close((v0 * d.t + 0.5 * 7.5 * d.t * d.t) - x, 1.35, 1e-12);
});

test('A1-15 회전 우주선: r = 40 m, ω = 0.5 rad/s → rω² = 10 m/s² (= g). 놓은 공은 관성계에서 직선, 발밑보다 뒤에 떨어진다', () => {
  close(M.artificialG(40, 0.5), 10, 1e-12);
  close(M.omegaFor(40), 0.5, 1e-12);
  close(M.centrifugal(60, 40, 0.5), 600, 1e-9);
  const R = 1, r0 = 0.8, w = 0.5, d = M.stationDrop(R, r0, w);
  close(Math.hypot(...d.land.out), R, 1e-9);                             // 바닥에 닿는다
  const p0 = d.at(0).out, p1 = d.at(d.t / 2).out, p2 = d.land.out;        // 세 점이 한 직선 위 (등속 직선 운동)
  close((p1[0] - p0[0]) * (p2[1] - p0[1]) - (p1[1] - p0[1]) * (p2[0] - p0[0]), 0, 1e-9);
  close(Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) / (d.t / 2), w * r0, 1e-9);   // 속력 = 놓는 순간의 ωr0
  assert.ok(d.lag > 0);                                                   // 바닥이 공보다 빨리 돌아 발 뒤쪽에 떨어진다
});
