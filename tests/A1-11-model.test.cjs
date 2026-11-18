const {test} = require('node:test');
const assert = require('node:assert/strict');
const M = require('../physics/A1/11/A1-11-model.js');
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

test('A1-11 예제: 실 1 m, 연직과 60° 원뿔 진자 → h = 0.5 m, 주기 2π√0.05 ≈ 1.4 s, 장력 = 무게의 2배', () => {
  const c = M.conical(1, 60);
  close(c.h, 0.5, 1e-12);
  close(c.period, 2 * Math.PI * Math.sqrt(0.05), 1e-12);
  assert.equal(c.period.toFixed(1), '1.4');
  assert.equal((2 * 3.14 * Math.sqrt(0.05)).toFixed(1), '1.4');     // π ≈ 3.14 로 계산해도
  close(c.tension, 2, 1e-12);
  close(c.tensionMl, c.tension, 1e-12);                              // 장력 = mlω²
  close(c.fc, Math.sqrt(3), 1e-12);                                  // 합력 = mg tanθ
});

test('A1-11 원뿔 진자: 장력의 연직 성분 = mg, 수평 성분 = mrω² (구심력), 주기는 h 로만 정해진다', () => {
  for (const [l, th] of [[1, 60], [0.8, 30], [1.5, 45]]) {
    const c = M.conical(l, th);
    close(c.tension * M.cosD(th), 1, 1e-12);                         // T cosθ ÷ mg = 1
    close(c.tension * M.sinD(th) * M.G, c.r * c.w * c.w, 1e-9);      // T sinθ = m r ω² (m = 1)
    close(c.period, M.periodH(c.h), 1e-12);
  }
  // 같은 h 면 l, θ 가 달라도 주기가 같다
  const a = M.conical(1, 60), b = M.conical(0.5 / M.cosD(40), 40);
  close(a.h, b.h, 1e-12); close(a.period, b.period, 1e-12);
  // 실 길이가 같으면 θ 가 클수록 주기가 짧다 (OX: '길다'는 틀림)
  const ps = [10, 30, 45, 60, 75].map((t) => M.conical(1, t).period);
  for (let i = 1; i < ps.length; i++) assert.ok(ps[i] < ps[i - 1]);
});

test('A1-11 기울어진 도로: tanθ = v²/(gr) 이면 마찰 없이 돈다. 이 속력은 질량과 무관하다', () => {
  close(M.bankSpeed(40, 45), 20, 1e-9);
  const a = M.road(1000, 20, 40, 45), b = M.road(2000, 20, 40, 45);
  close(a.f, 0, 1e-9); close(b.f, 0, 1e-9);
  close(a.N * M.sinD(45), a.fc, 1e-9);                               // 수직항력의 수평 성분 = 구심력
  close(a.N * M.cosD(45), 1000 * M.G, 1e-9);                         // 연직 성분 = mg
  close(b.design, a.design, 1e-12);
  // 더 빠르면 마찰력이 안쪽(+), 더 느리면 바깥쪽(−)으로 필요하다
  assert.ok(M.road(1000, 25, 40, 45).f > 0);
  assert.ok(M.road(1000, 15, 40, 45).f < 0);
});

test('A1-11 평평한 도로: 정지 마찰력이 혼자 구심력. mv²/r > μmg 이면 바깥으로 미끄러진다', () => {
  const q = M.road(1000, 15, 40, 0);
  close(q.f, 1000 * 225 / 40, 1e-9); close(q.N, 1000 * M.G, 1e-9);
  assert.equal(M.roadSlip(1000, 15, 40, 0, 0.6).ok, true);
  const s = M.roadSlip(1000, 20, 40, 0, 0.6);
  assert.equal(s.ok, false); assert.equal(s.dir, 'out');
  close(M.flatMaxSpeed(40, 0.6), Math.sqrt(240), 1e-12);
});

test('A1-11 개념 체크: 실 0.4 m, 꼭대기 속력 4 m/s → T + mg = mv²/r 에서 장력 = 3mg (5mg 는 바닥 식을 쓴 오답)', () => {
  const m = 1;
  close(M.topTension(m, 4, 0.4) / (m * M.G), 3, 1e-12);
  close((m * 16 / 0.4 + m * M.G) / (m * M.G), 5, 1e-12);            // 바닥 식을 꼭대기에 잘못 쓴 값
  // 에너지 보존과 같은 결과: 바닥 속력 √32 에서 출발
  const v0 = M.bottomSpeedFromTop(4, 0.4);
  close(v0 * v0, 32, 1e-9);
  close(M.tension(m, v0, 0.4, Math.PI) / (m * M.G), 3, 1e-9);
  close(M.tension(m, v0, 0.4, 0) / (m * M.G), 9, 1e-9);
});

test('A1-11 연직 원: 바닥과 꼭대기의 장력 차는 늘 6mg, 꼭대기 v² < gr 이면 실이 느슨해진다', () => {
  for (const [v0, r] of [[6, 0.5], [8, 1], [5, 0.4]]) {
    if (v0 * v0 < 5 * M.G * r) continue;
    close(M.tension(1, v0, r, 0) - M.tension(1, v0, r, Math.PI), 6 * M.G, 1e-9);
  }
  close(M.minTopSpeed(0.4), 2, 1e-12);
  assert.equal(M.slackAngle(Math.sqrt(5 * M.G * 0.4), 0.4), null);   // 딱 한 바퀴: 꼭대기에서 T = 0
  const v0 = 4, r = 0.4, ph = M.slackAngle(v0, r);                   // 2gr = 8 < 16 < 20 = 5gr
  assert.ok(ph > Math.PI / 2 && ph < Math.PI);
  close(M.tension(1, v0, r, ph), 0, 1e-9);
  assert.equal(M.slackAngle(2, 0.4), null);                           // v0² ≤ 2gr: 진자처럼 왔다 갔다
});

test('A1-11 인공위성: 만유인력이 구심력, 지표 가까이 v = √(gR) = 8 × 10³ m/s. 구심력은 일을 하지 않는다', () => {
  const s = M.satellite(1);
  close(s.v, 8000, 1e-6);
  assert.equal((s.period / 60).toFixed(0), '84');
  const s2 = M.satellite(4);
  close(s2.v, 4000, 1e-6); close(s2.gHere, M.G / 16, 1e-12);
  close(M.power([0, -3], [5, 0]), 0, 1e-12);                          // 힘 ⟂ 속도 → 일률 0
});

test('A1-11 실로 이은 두 물체(r, 2r, 같은 ω): 바깥 T₂ = 2mrω², 안쪽 T₁ = 3mrω². 구멍 지난 실: Mg = mr(2π/T)²', () => {
  const c = M.chain(1, 1, 1, 2, 3);
  close(c.T2, 2 * 9, 1e-12); close(c.T1, 3 * 9, 1e-12);
  const T = M.holePeriod(0.1, 0.5, 0.4);
  close(0.4 * M.G, 0.1 * 0.5 * (2 * Math.PI / T) ** 2, 1e-9);
});
