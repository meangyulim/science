const {test} = require('node:test');
const assert = require('node:assert/strict');
const M = require('../sims/sunspot/sunspot-model.js');
const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

test('같은 seed 는 반 전체에서 같은 태양', () => {
  assert.deepEqual(M.makeSun(1234), M.makeSun(1234));
  assert.notDeepEqual(M.makeSun(1234).spots, M.makeSun(4321).spots);
});

test('큰 흑점은 두 관측 모두 원반 안쪽에 있고, 서쪽으로 움직인다', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const sun = M.makeSun(seed);
    assert.ok(sun.dt === 3 || sun.dt === 4);
    assert.ok(sun.groups.length >= 4, `seed ${seed}: 무리 ${sun.groups.length}개`);
    const d1 = M.spotsOn(sun, 0), d2 = M.spotsOn(sun, sun.dt);
    for (const g of sun.groups) {
      const L = M.leaderOf(sun.spots, g);
      const a = d1.find(s => s.id === L.id), b = d2.find(s => s.id === L.id);
      assert.ok(a && b, `seed ${seed}: 선행 흑점이 두 날 모두 보여야 함`);
      assert.ok(Math.abs(a.lon) <= 66 && Math.abs(b.lon) <= 66);
      assert.ok(b.x > a.x, '동 → 서로 움직임');
      close(b.y, a.y, 1e-9);                     // 위도를 따라 움직인다
    }
    // 무리끼리는 충분히 떨어져 있다
    for (let i = 0; i < sun.groups.length; i++) for (let j = i + 1; j < sun.groups.length; j++) {
      const A = sun.groups[i], B = sun.groups[j];
      const SM = require('../sims/sun/sun-model.js');
      assert.ok(SM.angDist(A.lat, A.lon0, B.lat, B.lon0) >= 17);
    }
  }
});

test('흑점 무리는 서로 다른 위도 띠에 있어 차등 자전이 드러난다', () => {
  for (let seed = 1; seed <= 100; seed++) {
    const lats = M.makeSun(seed).groups.map(g => Math.abs(g.lat));
    assert.ok(Math.min(...lats) < 11 && Math.max(...lats) > 28, `seed ${seed}: ${lats}`);
  }
});

test('교과서 방법(θ = α + β, θ : Δt = 360° : P)으로 정확한 위치에서 재면 그 위도의 자전 주기가 나온다', () => {
  for (let seed = 1; seed <= 50; seed++) {
    const sun = M.makeSun(seed);
    const d1 = M.spotsOn(sun, 0), d2 = M.spotsOn(sun, sun.dt);
    for (const g of sun.groups) {
      const L = M.leaderOf(sun.spots, g);
      const a = d1.find(s => s.id === L.id), b = d2.find(s => s.id === L.id);
      const m = M.measureRotation(a, b, sun.dt);
      close(m.lat, L.lat, 1e-6);
      close(m.P, M.rotationPeriod(L.lat), 1e-6);
      close(m.theta, M.omegaDeg(L.lat) * sun.dt, 1e-6);
    }
  }
  // 적도 쪽이 고위도보다 빨리 돈다
  assert.ok(M.rotationPeriod(5) < M.rotationPeriod(35));
});

test('조준 기하: 경통이 태양을 향하면 어긋남 0, 오른쪽(서)·위 부호', () => {
  const sun = {az: 170, alt: 30};
  const o = M.tubeOffset(sun, sun);
  close(o.x, 0, 1e-9); close(o.y, 0, 1e-9); close(o.sep, 0, 1e-6);
  // 망원경이 태양보다 동쪽(방위각 작음)을 향하면 태양은 시야의 오른쪽(서)에 있다
  assert.ok(M.tubeOffset({az: 169, alt: 30}, sun).x > 0);
  assert.ok(M.tubeOffset({az: 171, alt: 30}, sun).x < 0);
  // 망원경이 낮으면 태양은 시야의 위쪽에 있다
  assert.ok(M.tubeOffset({az: 170, alt: 29}, sun).y > 0);
  // 작은 각에서는 x ≈ Δaz·cos(고도)
  close(M.tubeOffset({az: 169.5, alt: 30}, sun).x, 0.5 * Math.cos(30 * Math.PI / 180), 0.002);
  // 추적 모터를 끄면 태양은 서쪽(오른쪽)으로 흐른다
  const later = M.sunAt(sun, 5);
  assert.ok(M.tubeOffset(sun, later).x > 0);
});

test('흑점 찍기 판정: 가까운 흑점만, 손가락 최소 거리', () => {
  const sun = M.makeSun(77), spots = M.spotsOn(sun, 0);
  const s = spots[0];
  assert.equal(M.hitTest(spots, s.x, s.y, 0.05).spot.id, s.id);
  assert.equal(M.hitTest(spots, s.x + 0.04, s.y, 0.05).spot.id, s.id);
  assert.equal(M.hitTest([s], s.x + 0.3, s.y, 0.05), null);
});

test('학생마다: 먼지는 흑점과 떨어져 있고, 따라갈 흑점 둘은 서로 다른 무리', () => {
  const sun = M.makeSun(2026);
  for (let i = 0; i < 40; i++) {
    const p = M.personal('student' + i, sun);
    assert.equal(p.dust.length, 3);
    assert.ok(Math.abs(p.fStart - p.f0) > 0.2);
    assert.equal(p.track.length, 2);
    const g = p.track.map(id => sun.spots.find(s => s.id === id).g);
    assert.notEqual(g[0], g[1]);
    assert.ok(M.tubeOffset(p.aim0, sun.sky[0]).sep > 20);
  }
  assert.deepEqual(M.personal('abc', sun), M.personal('abc', sun));
});

test('찍은 자리 줄이기/되살리기', () => {
  const marks = [{x: 0.1234, y: -0.5, k: 3}, {x: -0.9, y: 0.01, k: 'd'}, {x: 0, y: 0, k: 'e'}];
  const back = M.decodeMarks(M.encodeMarks(marks));
  assert.equal(back.length, 3);
  close(back[0].x, 0.123, 1e-9); assert.equal(back[0].k, 3); assert.equal(back[1].k, 'd');
  assert.deepEqual(M.decodeMarks(''), []);
});

test('점수', () => {
  assert.equal(M.aimScore(3), 300); assert.equal(M.aimScore(100), 100);
  assert.equal(M.focusScore(0), 200); assert.equal(M.focusScore(M.FOCUS_TOL), 100);
  assert.equal(M.rotScore(25, 25), 400); assert.equal(M.rotScore(40, 25), 0);
  assert.equal(M.flareScore(0), 300); assert.equal(M.flareScore(60), 60);
  assert.equal(M.comboBonus(1), 0); assert.equal(M.comboBonus(3), 30); assert.equal(M.comboBonus(20), 75);
  const sum = M.rotationSummary([{lat: 5, P: 25}, {lat: -8, P: 26}, {lat: 30, P: 29}, {lat: 2, P: NaN}]);
  assert.equal(sum.n, 3); close(sum.low, 25.5); close(sum.high, 29);
});

test('같은 무리 안의 흑점은 겹치지 않는다 (따로 찍을 수 있게)', () => {
  const SM = require('../sims/sun/sun-model.js');
  for (let seed = 1; seed <= 300; seed++) {
    const sun = M.makeSun(seed);
    for (const g of sun.groups) {
      const ss = sun.spots.filter(s => s.g === g.id);
      for (let i = 0; i < ss.length; i++) for (let j = i + 1; j < ss.length; j++) {
        assert.ok(SM.angDist(ss[i].lat, ss[i].lon0, ss[j].lat, ss[j].lon0) >= 2.6, `seed ${seed} 무리 ${g.id}`);
      }
    }
  }
});
