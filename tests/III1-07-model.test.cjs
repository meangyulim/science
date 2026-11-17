const {test} = require('node:test');
const assert = require('node:assert/strict');
const M = require('../physics/III1/07/III1-07-model.js');
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

test('III1-07 예제: 굴절률 2 → 공기, 입사각 45° → 임계각 30°, 전반사가 일어난다', () => {
  close(M.criticalAngle(2, 1), 30, 1e-9);                 // sinθc = 1/2
  assert.equal(M.isTIR(2, 1, 45), true);                   // 45° > 30°
  assert.ok(Number.isNaN(M.refractionAngle(2, 1, 45)));    // 굴절할 각이 없다
  assert.equal(M.reflectance(2, 1, 45), 1);                // 모두 반사
  assert.equal(M.regime(2, 1, 45), 'tir');
});

test('III1-07 굴절률이 클수록 임계각이 작다: A(1.5) > B(2.0) > C(2.4)', () => {
  const a = M.criticalAngle(1.5, 1), b = M.criticalAngle(2, 1), c = M.criticalAngle(2.4, 1);
  close(a, 41.81, 0.01); close(b, 30, 1e-9); close(c, 24.62, 0.01);
  assert.ok(a > b && b > c);
  close(M.criticalAngle(2.42, 1), 24.4, 0.05);             // 다이아몬드 약 24°
  // 같은 입사각 35°: A 는 굴절, B·C 는 전반사 (임계각이 작을수록 전반사가 잘 일어난다)
  assert.equal(M.isTIR(1.5, 1, 35), false);
  assert.equal(M.isTIR(2, 1, 35), true);
  assert.equal(M.isTIR(2.4, 1, 35), true);
});

test('III1-07 굴절률 작은 쪽 → 큰 쪽이면 어떤 입사각에서도 전반사가 없다', () => {
  assert.ok(Number.isNaN(M.criticalAngle(1, 1.5)));
  for (let d = 0; d < 90; d += 0.5) {
    assert.equal(M.isTIR(1, 1.5, d), false);
    const r = M.refractionAngle(1, 1.5, d);
    assert.ok(r <= d + 1e-12 && r < 41.82);                 // 법선 쪽으로 꺾이고, 굴절각은 반대 방향 임계각을 넘지 못한다
    assert.ok(M.reflectance(1, 1.5, d) < 1);
  }
});

test('III1-07 입사각이 임계각에 이르면 굴절각 90°, 반사광은 점점 강해지다가 전반사에서 100 %', () => {
  close(M.refractionAngle(2, 1, 30), 90, 1e-6);
  assert.equal(M.regime(2, 1, 30), 'critical');
  assert.equal(M.regime(2, 1, 20), 'refract');
  close(M.reflectance(1.5, 1, 0), (0.5 / 2.5) ** 2, 1e-12); // 수직 입사 4 %
  let prev = -1;
  for (let d = 0; d <= 41.8; d += 0.2) { const R = M.reflectance(1.5, 1, d); assert.ok(R >= prev - 1e-12); prev = R; }
  assert.ok(M.reflectance(1.5, 1, 41.5) > 0.5);            // 임계각 가까이에서 크게 강해진다
  for (const d of [42, 60, 89]) assert.equal(M.reflectance(1.5, 1, d), 1);
});

test('III1-07 반원 매질 n = √2: 임계각 45° → 입사각 50°에서 전반사, 40°에서는 굴절', () => {
  close(M.criticalAngle(Math.SQRT2, 1), 45, 1e-9);
  assert.equal(M.isTIR(Math.SQRT2, 1, 50), true);
  assert.equal(M.isTIR(Math.SQRT2, 1, 40), false);
  close(M.refractionAngle(Math.SQRT2, 1, 45), 90, 1e-6);    // 45° 는 굴절각 90° 인 경계 상황
});

test('III1-07 광섬유: 끝면 입사각이 작을수록 경계면 입사각(90° − r)이 커서 전반사에 유리', () => {
  const a = M.fiber(10, 1.5, 1.2), b = M.fiber(30, 1.5, 1.2), c = M.fiber(75, 1.5, 1.2);
  assert.ok(a.boundary > b.boundary && b.boundary > c.boundary);
  close(b.r, Math.asin(0.5 / 1.5) * 180 / Math.PI, 1e-9);   // sin30° = 1.5 sin r
  close(b.boundary, 90 - b.r, 1e-12);
  close(b.thetaC, 53.13, 0.01);
  assert.equal(b.tir, true);                               // 70.5° > 53.1°
  assert.equal(c.tir, false);                              // 새어 나감
  close(M.maxEntry(1.5, 1.2), Math.asin(0.9) * 180 / Math.PI, 1e-9);   // 약 64.2°
  assert.equal(M.fiberLeft(30, 1.5, 1.2, 10), 1);
  assert.ok(M.fiberLeft(75, 1.5, 1.2, 10) < 0.2);
  // 클래딩 굴절률이 코어보다 크거나 같으면 어떤 각에서도 갇히지 않는다
  for (const i of [0, 10, 40]) assert.equal(M.fiber(i, 1.5, 1.6).tir, false);
  assert.equal(M.maxEntry(1.5, 1.6), 0);
});

test('III1-07 광통신: 발신기(LED·레이저)는 전기 → 빛, 수신기(광 다이오드)는 빛 → 전기', () => {
  assert.match(M.deviceFor('전기 신호', '빛 신호'), /발광 다이오드|레이저/);
  assert.equal(M.deviceFor('빛 신호', '전기 신호'), '광 다이오드');
  assert.ok(!/발광/.test(M.deviceFor('빛 신호', '전기 신호')));   // 받는 쪽은 발광 다이오드가 아니다
  assert.deepEqual(M.CHAIN.map((c) => c.to), ['전기 신호', '빛 신호', '빛 신호', '전기 신호', '소리·영상']);
  const xs = M.bounces(20, 1, 10);                          // 지그재그: 반사점 간격 2a/tanr
  close(xs[1] - xs[0], 2 / Math.tan(20 * M.DEG), 1e-12);
});
