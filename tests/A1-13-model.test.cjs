const {test} = require('node:test');
const assert = require('node:assert/strict');
const M = require('../physics/A1/13/A1-13-model.js');
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);
const {M_E, R_E} = M;

test('A1-13 예제: 같은 행성의 원 궤도 위성 A(r), B(4r) → 속력 2 : 1, 주기 1 : 8, 가속도 16 : 1, 역학적 에너지는 B 가 크다', () => {
  const r = 7e6, x = M.ratios(r, 4 * r);
  close(x.v, 2); close(x.T, 1 / 8); close(x.a, 16);
  // 실제 식으로도 같은 비
  close(M.vCirc(M_E, r) / M.vCirc(M_E, 4 * r), 2, 1e-12);
  close(M.period(M_E, r) / M.period(M_E, 4 * r), 1 / 8, 1e-12);
  close(M.gAt(M_E, r) / M.gAt(M_E, 4 * r), 16, 1e-12);
  const m = 100, EA = M.eCirc(M_E, m, r), EB = M.eCirc(M_E, m, 4 * r);
  assert.ok(EA < 0 && EB < 0 && EB > EA);               // 둘 다 속박, B 가 0 에 가깝다
  close(EA / EB, 4, 1e-12);                             // −GMm/2r : −GMm/8r
});

test('A1-13 지구 값: 지표 원 궤도 속력 ≈ 7.9 km/s, 탈출 속력 ≈ 11.2 km/s = √2 배, 표면 g ≈ 9.8 m/s²', () => {
  assert.equal((M.vCirc(M_E, R_E) / 1000).toFixed(1), '7.9');
  assert.equal((M.vEsc(M_E, R_E) / 1000).toFixed(1), '11.2');
  close(M.vEsc(M_E, R_E) / M.vCirc(M_E, R_E), Math.SQRT2, 1e-12);
  assert.equal(M.gAt(M_E, R_E).toFixed(1), '9.8');
  // 정지 궤도(주기 하루): 궤도 반지름 약 42000 km
  const r = M.rForPeriod(M_E, 86400);
  assert.ok(r > 4.1e7 && r < 4.3e7);
});

test('A1-13 천체 밖 중력 가속도는 거리 제곱에 반비례: 2R 에서 1/4, 3R 에서 1/9. 밀도가 같으면 큰 천체의 g 가 크다', () => {
  const g0 = M.gAt(M_E, R_E);
  close(M.gAt(M_E, 2 * R_E) / g0, 1 / 4, 1e-12);
  close(M.gAt(M_E, 3 * R_E) / g0, 1 / 9, 1e-12);
  close(M.gSurfaceDensity(5500, 2 * R_E) / M.gSurfaceDensity(5500, R_E), 2, 1e-12);
});

test('A1-13 중력은 위성 질량에 비례하지만 가속도·속력·주기는 위성 질량과 무관', () => {
  const r = 2 * R_E;
  close(M.force(M_E, 2000, r) / M.force(M_E, 1000, r), 2, 1e-12);
  close(M.force(M_E, 2000, r) / 2000, M.force(M_E, 1000, r) / 1000, 1e-12);   // a = F/m 같음
  close(M.force(M_E, 1000, r) / 1000, M.gAt(M_E, r), 1e-12);
});

test('A1-13 개념 체크: 높이 R(궤도 반지름 2R) 위성 → 가속도 g/4, 속력은 지표를 스치는 위성의 1/√2 배', () => {
  const g = M.gAt(M_E, R_E);
  close(M.gAt(M_E, 2 * R_E), g / 4, 1e-12);
  close(M.vCirc(M_E, 2 * R_E) / M.vCirc(M_E, R_E), 1 / Math.SQRT2, 1e-12);
});

test('A1-13 개념 체크: 질량 2M, 반지름 8R 행성의 탈출 속력은 v/2 (발사체 질량과 무관)', () => {
  close(M.vEsc(2 * M_E, 8 * R_E) / M.vEsc(M_E, R_E), 0.5, 1e-12);
  for (const m of [1, 10, 1000]) close(M.energy(M_E, m, R_E, M.vEsc(M_E, R_E)) / m, 0, 1e-6);   // E = 0 이 되는 속력은 m 과 무관
});

test('A1-13 원 궤도 에너지: K = GMm/2r, U = −GMm/r, E = −GMm/2r → |E| = K, U = 2E, 높은 궤도일수록 E 는 크고 속력은 작다', () => {
  const m = 500, r = 3 * R_E, K = M.kinCirc(M_E, m, r), U = M.potential(M_E, m, r), E = M.eCirc(M_E, m, r);
  close(K, 0.5 * m * M.vCirc(M_E, r) ** 2, 1e-3);
  close(K + U, E, 1e-3); close(-E, K, 1e-3); close(U, 2 * E, 1e-3);
  assert.ok(M.eCirc(M_E, m, 2 * r) > E && M.vCirc(M_E, 2 * r) < M.vCirc(M_E, r));
});

test('A1-13 뉴턴의 대포: 수평 발사 속력에 따라 낙하 → 원 → 타원 → 탈출', () => {
  const v1 = M.vCirc(M_E, R_E), q = (v) => M.qOf(v, M_E, R_E), ground = 0.95;
  close(q(v1), 1, 1e-12);
  assert.equal(M.classify(q(5000), ground), 'fall');
  assert.equal(M.classify(q(7800), ground), 'fall');
  assert.equal(M.classify(q(7900), ground), 'circle');
  assert.equal(M.classify(q(9000), ground), 'ellipse');
  assert.equal(M.classify(q(11100), ground), 'ellipse');
  assert.equal(M.classify(q(11200), ground), 'escape');
  assert.equal(M.classify(q(M.vEsc(M_E, R_E)), ground), 'escape');
  // 타원: 발사점이 가까운 점, 긴반지름 1/(2 − q), 주기는 a^(3/2) 배
  const qq = q(9000), ap = M.apsides(qq);
  close(ap.near, 1); close((ap.near + ap.far) / 2, M.semiMajor(qq), 1e-12);
  close(M.conic(qq, Math.PI), ap.far, 1e-12);
});

test('A1-13 수치 궤적: q = 1 은 반지름이 그대로인 원(한 바퀴 2π), q < 1 은 땅에 닿고, q ≥ 2 는 멀어진다', () => {
  const c = M.trajectory(1, {ground: 0.95});
  assert.equal(c.end, 'orbit');
  for (const p of c.pts) close(Math.hypot(p.x, p.y), 1, 1e-6);
  close(c.pts[c.pts.length - 1].t, 2 * Math.PI, 0.01);
  const f = M.trajectory(0.4, {ground: 0.95});
  assert.equal(f.end, 'ground');
  close(Math.hypot(f.pts[f.pts.length - 1].x, f.pts[f.pts.length - 1].y), 0.95, 1e-3);
  const e = M.trajectory(1.3, {ground: 0.95});
  assert.equal(e.end, 'orbit');
  const far = Math.max(...e.pts.map((p) => Math.hypot(p.x, p.y)));
  close(far, M.apsides(1.3).far, 1e-3);                                    // 수치 궤적의 먼 점 = 식
  close(e.pts[e.pts.length - 1].t / (2 * Math.PI), M.periodRatio(1.3), 0.01);   // 케플러 3법칙
  const x = M.trajectory(2.05, {ground: 0.95, rMax: 6});
  assert.equal(x.end, 'far');
});
