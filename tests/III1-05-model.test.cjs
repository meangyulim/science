const {test} = require('node:test');
const assert = require('node:assert/strict');
const M = require('../physics/III1/05/III1-05-model.js');
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

// 페이지와 같은 그림용 공기층 (소리: 지면~높이 0.5 사이 기온이 고르게 변함)
const sound = (Tg, Tt) => M.layered(Tg, Tt, {shape: 'lin', H: 0.5, K: 0.03, V0: 0.2, Tref: Tg});
const SRC = {x: 0.045, y: 0.03}, EAR = {x: 0.86, zone: 0.08};

test('III1-05 개념 체크(예제): 밤에는 지면 근처가 차가워 소리가 아래로 휘어 멀리까지 잘 들린다', () => {
  // 밤: 지면 6 °C, 위 18 °C → 소리는 지면 쪽이 느리다 → 느린 쪽(아래)으로 휜다
  assert.ok(M.soundSpeed(6) < M.soundSpeed(18));
  assert.equal(M.bendDir(M.soundSpeed(6), M.soundSpeed(18)), 'down');
  const night = M.listenerLevel(sound(6, 18), SRC, EAR);
  assert.ok(night > 1.5, `밤의 상대 세기 ${night}`);              // 기온이 고를 때보다 더 많이 닿는다
  // 낮: 지면 28 °C, 위 16 °C → 위로 휘어 멀리 있는 사람에게는 닿지 않는다(소리 그늘)
  assert.equal(M.bendDir(M.soundSpeed(28), M.soundSpeed(16)), 'up');
  assert.equal(M.listenerLevel(sound(28, 16), SRC, EAR), 0);
});

test('III1-05 소리의 속력은 기온이 높을수록 크다 (331 + 0.6t)', () => {
  close(M.soundSpeed(0), 331);
  close(M.soundSpeed(20), 343);
  assert.ok(M.soundSpeed(30) > M.soundSpeed(10));
});

test('III1-05 경로는 느린 쪽으로 휘고, 속력이 고르면 곧게 간다', () => {
  const D = M.DEG, o = {xmax: 0.3, ymax: 2, ground: 'stop'};       // 땅에 닿기 전까지
  const end = (prof) => { const r = M.trace(prof, 0, 0.2, 0, o); return r.ps[r.ps.length - 1]; };
  assert.ok(end(sound(6, 18)) < -2 * D);                         // 지면이 느림 → 수평으로 낸 경로가 아래로
  assert.ok(end(sound(28, 16)) > 2 * D);                         // 위가 느림 → 위로
  // 기온이 고르면 직진: 경로 위 점이 직선 위에 있다, 듣는 사람에게 닿는 정도도 직진할 때와 같다
  const flat = sound(15, 15), r = M.trace(flat, 0, 0.03, 10 * D, {xmax: 0.86, ymax: 2});
  const c = M.crossX(r, 0.8);
  close(c.y, 0.03 + 0.8 * Math.tan(10 * D), 1e-9);
  assert.equal(M.bendDir(M.soundSpeed(15), M.soundSpeed(15)), 'none');
  close(M.listenerLevel(flat, SRC, EAR), 1);
});

test('III1-05 신기루: 뜨거운 도로는 땅 아래에 거꾸로 선 상, 차가운 바다는 공중에 뜬 상', () => {
  const road = M.layered(50, 25, {shape: 'exp', delta: 0.03, K: 0.012, V0: 0.24, Tref: 25});
  assert.equal(M.bendDir(road.v(0), road.v(0.3)), 'up');           // 지면 근처가 빠름 → 위(느린 쪽)로 휜다
  const eye = {x: 0.07, y: 0.12}, o = {lo: -45, hi: 12, M: 114, ds: 0.003};
  const top = M.mirage(road, {x: 0.86, y: 0.30}, eye, o).best;
  const mid = M.mirage(road, {x: 0.86, y: 0.20}, eye, o).best;
  assert.ok(top.image.y < 0 && mid.image.y < 0);                 // 땅 아래에 보인다
  assert.ok(top.image.y < mid.image.y);                          // 꼭대기가 더 아래 → 거꾸로 선 상
  const sea = M.layered(5, 25, {shape: 'lin', H: 0.4, K: 0.0125, V0: 0.24, Tref: 25});
  assert.equal(M.bendDir(sea.v(0), sea.v(0.4)), 'down');           // 해수면 근처가 느림 → 아래로 휜다
  const eye2 = {x: 0.06, y: 0.08}, o2 = {lo: -12, hi: 45, M: 114, ds: 0.003};
  const mast = M.mirage(sea, {x: 0.84, y: 0.15}, eye2, o2).best, keel = M.mirage(sea, {x: 0.84, y: 0}, eye2, o2).best;
  assert.ok(mast.image.y > 0.15 + 0.1);                          // 실제보다 훨씬 높이(공중에) 보인다
  assert.ok(mast.image.y > keel.image.y);                        // 똑바로 선 상
});

test('III1-05 물속 동전은 얕아 보이고(수직이면 3/4쯤), 물속에서 본 새는 높아 보인다', () => {
  const n = M.N_WATER, D = M.DEG;
  const view = (O, nO, nE, deg, dir) => {
    const E = M.placeEye(O, nO, nE, deg, 1.3, dir);
    const sx = E.x - E.xs, sy = E.y, L = Math.hypot(sx, sy), ux = -sy / L, uy = sx / L, p = 0.002;
    return M.apparent(O, {x: E.x + ux * p, y: E.y + uy * p}, {x: E.x - ux * p, y: E.y - uy * p}, nO, nE);
  };
  const coin = {x: 0, y: -1.2};
  close(-view(coin, n, 1, 0.01, 1).y, M.apparentNormal(1.2, n, 1), 1e-3);    // 1.2 m → 약 0.90 m
  close(M.apparentNormal(1.2, n, 1), 1.2 / 1.33, 1e-12);
  assert.ok(-view(coin, n, 1, 40, 1).y < -view(coin, n, 1, 10, 1).y);        // 비스듬히 볼수록 더 얕다
  const bird = {x: 0, y: 1.0};
  close(view(bird, 1, n, 0.01, -1).y, 1.33, 1e-3);                           // 물속에서 보면 1.33배 높이
  assert.ok(view(bird, 1, n, 20, -1).y > 1.33);
  // 한 경계의 굴절: 물 → 공기는 법선에서 멀어지고, 임계각보다 크면 공기로 못 나온다
  assert.ok(M.snell(n, 1, 30) > 30);
  assert.ok(Number.isNaN(M.snell(n, 1, 60)));
  close(M.snell(1, n, 90), Math.asin(1 / n) / D, 1e-9);
});
