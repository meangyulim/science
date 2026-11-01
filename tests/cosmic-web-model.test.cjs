const {test} = require('node:test');
const assert = require('node:assert/strict');
const M = require('../sims/cosmic-web/cosmic-web-model.js');
const close = (a, b, eps = 1e-9, msg) => assert.ok(Math.abs(a - b) <= eps, msg || `${a} ≠ ${b}`);

test('FFT: known transforms and round trip (1D and 2D)', () => {
  const n = 16, re = new Float64Array(n), im = new Float64Array(n);
  for (let i = 0; i < n; i++) re[i] = Math.cos(2 * Math.PI * 3 * i / n);
  M.fft(re, im, false);
  for (let k = 0; k < n; k++) {
    close(re[k], k === 3 || k === n - 3 ? n / 2 : 0, 1e-9, `cos mode, bin ${k}: ${re[k]}`);
    close(im[k], 0, 1e-9);
  }
  // 델타 함수 → 모든 성분이 1
  re.fill(0); im.fill(0); re[0] = 1;
  M.fft(re, im, false);
  for (let k = 0; k < n; k++) { close(re[k], 1); close(im[k], 0); }
  // 무작위 복소수: 정방향 → 역방향 ÷ n = 처음 값
  const r = M.rng(5), a = new Float64Array(64), b = new Float64Array(64);
  for (let i = 0; i < 64; i++) { a[i] = r() - 0.5; b[i] = r() - 0.5; }
  const a0 = Float64Array.from(a), b0 = Float64Array.from(b);
  M.fft(a, b, false); M.fft(a, b, true);
  for (let i = 0; i < 64; i++) { close(a[i] / 64, a0[i], 1e-12); close(b[i] / 64, b0[i], 1e-12); }
  const N = 32, x = new Float64Array(N * N), y = new Float64Array(N * N);
  for (let i = 0; i < N * N; i++) x[i] = r();
  const x0 = Float64Array.from(x);
  M.fft2(x, y, N, false); M.fft2(x, y, N, true);
  for (let i = 0; i < N * N; i++) { close(x[i] / (N * N), x0[i], 1e-12); close(y[i] / (N * N), 0, 1e-12); }
  assert.throws(() => M.makeFFT(12));
});

test('Poisson solver: a single Fourier mode gives the exact potential and an attracting force', () => {
  const N = 32, om = 0.3, eps = 0.01, m = 3, solver = M.makeSolver(N);
  const delta = new Float64Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) delta[j * N + i] = eps * Math.cos(2 * Math.PI * m * i / N);
  // 이산 라플라시안의 고유값 k² = 4N² sin²(πm/N)
  const k2 = 4 * N * N * Math.sin(Math.PI * m / N) ** 2;
  const phi = solver.potential(delta, om, new Float64Array(N * N));
  for (let i = 0; i < N; i++) close(phi[5 * N + i], -1.5 * om * eps * Math.cos(2 * Math.PI * m * i / N) / k2, 1e-12);
  // 이산 라플라시안을 직접 적용하면 원래 (3/2) Ωm δ 가 나와야 한다
  for (let i = 0; i < N; i++) {
    const lap = (phi[5 * N + (i + 1) % N] + phi[5 * N + (i + N - 1) % N] + phi[4 * N + i] + phi[6 * N + i] - 4 * phi[5 * N + i]) * N * N;
    close(lap, 1.5 * om * delta[5 * N + i], 1e-12);
  }
  const fx = new Float64Array(N * N), fy = new Float64Array(N * N);
  solver.forces(delta, om, fx, fy);
  const kd = N * Math.sin(2 * Math.PI * m / N);
  for (let i = 0; i < N; i++) {
    close(fx[7 * N + i], -1.5 * om * eps * kd / k2 * Math.sin(2 * Math.PI * m * i / N), 1e-12);
    close(fy[7 * N + i], 0, 1e-12);
  }
  // 밀도가 가장 높은 곳(x = 0) 바로 오른쪽의 힘은 왼쪽(봉우리 쪽)을 향한다
  assert.ok(fx[1] < 0 && fx[N - 1] > 0);
});

test('CIC mass assignment conserves mass and a lattice gives exactly uniform density', () => {
  const r = M.rng(9), n = 1000, x = new Float64Array(n), y = new Float64Array(n);
  for (let i = 0; i < n; i++) { x[i] = r(); y[i] = r(); }
  x[0] = 0.999999999; y[0] = 0;                       // 경계를 넘는 입자도 주기 경계로 감싼다
  const g = M.depositCIC(x, y, n, 32, new Float64Array(32 * 32));
  close(g.reduce((s, v) => s + v, 0), n, 1e-9);
  const d = M.densityGrid(x, y, n, 16);
  close(d.reduce((s, v) => s + v, 0) / d.length, 1, 1e-12);
  // 격자점 위의 입자 → 모든 칸 밀도 1
  const N = 16, lx = new Float64Array(N * N), ly = new Float64Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { lx[j * N + i] = i / N; ly[j * N + i] = j / N; }
  const u = M.densityGrid(lx, ly, N * N, N);
  assert.ok(u.every(v => Math.abs(v - 1) < 1e-12));
});

test('zero initial density difference: matter stays perfectly uniform for 140억 년', () => {
  const sim = M.createSim({N: 32, seed: 3, model: 'accel', amp: 0});
  const x0 = Float64Array.from(sim.x);
  sim.advanceTo(1);
  const s = M.densityStats(sim.density(32));
  assert.ok(s.rms < 1e-10, `rms ${s.rms}`);
  assert.ok(sim.x.every((v, i) => Math.abs(v - x0[i]) < 1e-12));
  const run = M.createRun({N: 32, seed: 3, model: 'flat', amp: 0});
  while (!run.advance());
  assert.ok(run.stats.every(st => st.rms < 1e-10));
});

test('positive initial density difference grows with time (and faster for a larger start)', () => {
  const rmsAt = (amp, as) => {
    const sim = M.createSim({N: 64, seed: 7, model: 'accel', amp});
    return as.map(a => { sim.advanceTo(a); return M.densityStats(sim.density(32)).rms; });
  };
  const as = [0.02, 0.1, 0.3, 0.6, 1];
  const one = rmsAt(1, as), two = rmsAt(2, as);
  for (let i = 1; i < as.length; i++) assert.ok(one[i] > one[i - 1], `rms ${one}`);
  assert.ok(one[0] < 0.1 && one[4] > 1, `미세한 차이(${one[0]}) → 큰 차이(${one[4]})`);
  // 처음 두 배 → 선형 시기에는 계속 거의 두 배
  close(two[0] / one[0], 2, 0.05);
  assert.ok(two[4] > one[4]);
  // 선형 시기에는 성장 인자 D(a)를 따른다
  const c = M.cosmology('accel');
  close(one[1] / one[0], c.D(0.1) / c.D(0.02), 0.6);
});

test('expansion histories (Friedmann): a(now) = 1, monotonic, and the three models in the expected order', () => {
  const ages = {};
  for (const key of ['accel', 'open', 'flat']) {
    const c = M.cosmology(key);
    close(c.E(1), 1, 1e-12);
    close(c.aAt(c.ageNow), 1, 1e-6);
    close(c.age(c.aAt(60)), 60, 1e-6);
    let prev = 0;
    for (let t = 1; t <= c.ageNow; t += 1) { const a = c.aAt(t); assert.ok(a > prev, `${key} a(t) monotonic at ${t}`); prev = a; }
    const curve = M.expansionCurve(key);
    assert.ok(curve.every((p, i) => i === 0 || (p.t > curve[i - 1].t && p.a > curve[i - 1].a)));
    close(curve[curve.length - 1].a, 1, 1e-12);
    close(c.D(0.001) / 0.001, 1, 0.01);                       // 이른 시기 D ≈ a
    ages[key] = c.ageNow;
  }
  // 우주 나이: 가속 팽창 > 열린 > 물질만 있는 평탄한 우주
  assert.ok(ages.accel > ages.open && ages.open > ages.flat);
  assert.ok(ages.accel > 130 && ages.accel < 145, `age ${ages.accel}`);   // 약 139억 년
  close(ages.flat, 2 / 3 * M.HUBBLE_TIME, 0.05);                         // 물질만: 2/(3H0)
  // 교과서 119쪽 날개: 나이 60억 년 ↔ 적색 편이 약 1, 크기 약 0.5
  close(M.cosmology('accel').aAt(60), 0.5, 0.03);
  // 같은 나이(50억 년)라면 물질만 있는 우주가 가장 크다
  const a50 = k => M.cosmology(k).aAt(50);
  assert.ok(a50('flat') > a50('open') && a50('open') > a50('accel'));
  // 구조 성장(성장 인자): 물질만 > 가속 팽창 > 열린
  const D = k => M.cosmology(k).D(1);
  close(D('flat'), 1, 1e-5);
  close(D('accel'), 0.779, 0.005);
  close(D('open'), 0.457, 0.005);
  close(M.cosmology('flat').f(0.5), 1, 1e-5);
});

test('same seed → same universe; the large-scale pattern does not depend on the particle number', () => {
  const a = M.createRun({N: 32, seed: 11, model: 'open'}), b = M.createRun({N: 32, seed: 11, model: 'open'});
  for (let i = 0; i < 20; i++) { a.advance(); b.advance(); }
  assert.deepEqual(Array.from(a.frames[a.frames.length - 1]), Array.from(b.frames[b.frames.length - 1]));
  const c = M.createSim({N: 32, seed: 12, model: 'open'});
  assert.ok(c.x.some((v, i) => v !== M.createSim({N: 32, seed: 11, model: 'open'}).x[i]));
  // 같은 파수의 초기 요동은 격자 크기(입자 수)와 상관없이 같다
  const spec64 = M.modelSpec('accel', 64), spec128 = M.modelSpec('accel', 128);
  const f64 = M.initialField(64, 7, spec64, 1), f128 = M.initialField(128, 7, spec128, 1);
  for (const [mx, my] of [[1, 0], [2, 3], [-4, 1], [5, -2]]) {
    const i64 = ((my + 64) % 64) * 64 + ((mx + 64) % 64), i128 = ((my + 128) % 128) * 128 + ((mx + 128) % 128);
    const k = 2 * Math.PI * Math.hypot(mx, my) / M.BOX_MPC;
    const w = Math.exp(-((k / spec64.kCut) ** 2) / 2 + ((k / spec128.kCut) ** 2) / 2);   // 잘라내는 정도만 다르다
    close(f64.cre[i64], f128.cre[i128] * w, 1e-12);
    close(f64.cim[i64], f128.cim[i128] * w, 1e-12);
  }
});

test('present-day structure: densest clusters, voids fill most of the area (2024 수능 지Ⅱ 6)', () => {
  const run = M.createRun({N: 128, seed: 7, model: 'accel'});
  while (!run.advance());
  const g = run.frameDensity(run.frames.length - 1, 64, new Float64Array(64 * 64));
  const cl = M.classify(g, 64);
  const [v, f, c] = cl.meanDensity;
  assert.ok(c > f && f > 1 && 1 > v, `밀도 은하단 ${c} > 필라멘트 ${f} > 평균 1 > 보이드 ${v}`);
  assert.ok(cl.areaFrac[0] > 0.6, `보이드 넓이 ${cl.areaFrac[0]}`);
  assert.ok(cl.massFrac[0] < cl.areaFrac[0] / 2, '보이드는 넓지만 물질은 적다');
  assert.ok(cl.areaFrac[2] < 0.1 && cl.massFrac[2] > 0.2, '은하단은 좁은 곳에 물질이 몰려 있다');
  assert.ok(cl.clusters.length >= 4 && cl.voids.length >= 5);
  close(cl.areaFrac.reduce((s, x) => s + x, 0), 1, 1e-12);
  close(cl.massFrac.reduce((s, x) => s + x, 0), 1, 1e-12);
});

test('model comparison follows textbook 그림 28 (same seed, 16k particles)', () => {
  const now = {};
  for (const key of ['accel', 'open', 'flat']) {
    const run = M.createRun({N: 128, seed: 7, model: key});
    while (!run.advance());
    const g = run.frameDensity(run.frames.length - 1, 64, new Float64Array(64 * 64));
    now[key] = M.voidSize(g, 64);
    now[key].rms = run.stats[run.stats.length - 1].rms;
  }
  // 가: 큰 보이드 / 나: 비슷한 무늬지만 보이드가 느리게 비워짐 / 다: 물질이 풍부해 보이드가 작다
  assert.ok(now.accel.top5 > now.open.top5 && now.open.top5 > now.flat.top5,
    `보이드 지름 가 ${now.accel.top5} 나 ${now.open.top5} 다 ${now.flat.top5}`);
  assert.ok(now.open.emptyFrac < now.accel.emptyFrac - 0.1, `텅 빈 넓이 나 ${now.open.emptyFrac} < 가 ${now.accel.emptyFrac}`);
  assert.ok(now.open.rms < now.accel.rms, '나 우주는 구조가 덜 자랐다');
});
