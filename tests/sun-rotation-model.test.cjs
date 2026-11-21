const {test} = require('node:test');
const assert = require('node:assert/strict');
const M = require('../sims/sun-rotation/sun-rotation-model.js');
const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

// 북극 위(+y)에서 내려다본 화면: 오른쪽 = +x, 위 = −z (지구가 화면 아래)
const topView = p => [p[0], -p[2]];
// 위에서 본 화면에서 r(중심에서 본 위치)에 있는 점이 v 로 움직이면 시계 반대(+) / 시계(−)
const ccw = (r, v) => { const a = topView(r), b = topView(v); return a[0] * b[1] - a[1] * b[0]; };

test('북극 위에서 보면 태양도 지구도 시계 반대 방향으로 돈다 (서→동 자전)', () => {
  for (let lon = -180; lon < 180; lon += 30) {
    const p = M.surfacePoint(0, lon);
    assert.ok(ccw(p, M.surfaceVelocity(p, +1)) > 0, `태양 경도 ${lon}°`);
    assert.ok(ccw(p, M.surfaceVelocity(p, -1)) < 0, '만약에(동→서)는 시계 방향');
  }
  // 날이 지나면 흑점의 위치각이 시계 반대 방향으로 늘어난다
  const ang = d => { const [x, y] = topView(M.spotPosition(15, -80, d)); return Math.atan2(y, x); };
  assert.ok(ang(1) > ang(0));
  // 지구: 관측자를 데려가는 쪽(동쪽)도 시계 반대 방향
  ['seoul', 'sydney'].forEach(site => {
    const o = M.observer(site);
    assert.ok(ccw(M.sub(o.feet, M.earthCenter()), o.east) > 0, site);
  });
});

test('서울의 관측자는 한낮에 남쪽을 보고, 왼쪽이 동쪽 · 시드니는 북쪽을 보고, 오른쪽이 동쪽', () => {
  const s = M.observer('seoul'), y = M.observer('sydney');
  assert.equal(s.facingName, '남');
  assert.equal(s.eastOnScreen, 'left');
  assert.equal(s.sunNorthOnScreen, 'up');
  assert.equal(y.facingName, '북');
  assert.equal(y.eastOnScreen, 'right');
  assert.equal(y.sunNorthOnScreen, 'down');
  // 12월 무렵 한낮: 서울은 해가 낮고(실제 약 29°, 가까이 그린 태양이라 조금 다름), 시드니는 거의 머리 위
  assert.ok(s.altitude > 20 && s.altitude < 35, `서울 고도 ${s.altitude}`);
  assert.ok(y.altitude > 70, `시드니 고도 ${y.altitude}`);
  // 지평면의 동서남북은 서로 수직인 단위 벡터
  [s, y].forEach(o => {
    close(M.dot(o.east, o.north), 0); close(M.dot(o.east, o.up), 0); close(M.dot(o.north, o.up), 0);
    close(M.len(o.east), 1); close(M.len(o.north), 1);
  });
});

test('같은 쪽, 다른 이름: 태양 자신의 동쪽은 관측자에게 서쪽', () => {
  ['seoul', 'sydney'].forEach(site => {
    const o = M.observer(site), p = M.subObserverPoint(site);
    close(M.dot(M.sunEastAt(p), o.west), 1, 1e-3);
    // 마주 보는 면은 서로 반대로 움직인다: 태양의 앞면 ↔ 지구가 관측자를 데려가는 쪽
    assert.ok(M.dot(M.surfaceVelocity(p, +1), o.east) < -0.99, site);
  });
});

test('흑점의 이동: 실제 자전이면 어디서 보든 하늘의 동→서, 반대로 돈다면 서→동', () => {
  assert.deepEqual(M.skyMotion('seoul', +1), {from: '동', to: '서', screen: 'left-to-right', sunOwn: '서→동'});
  assert.deepEqual(M.skyMotion('sydney', +1), {from: '동', to: '서', screen: 'right-to-left', sunOwn: '서→동'});
  assert.deepEqual(M.skyMotion('seoul', -1), {from: '서', to: '동', screen: 'right-to-left', sunOwn: '동→서'});
  assert.deepEqual(M.skyMotion('sydney', -1), {from: '서', to: '동', screen: 'left-to-right', sunOwn: '동→서'});
});

test('서울에서 본 원반: 동쪽(왼쪽) 가장자리에서 나타나 약 2주 뒤 서쪽(오른쪽) 가장자리로', () => {
  const P = M.SCENE.period, at = d => M.diskPosition(M.spotPosition(0, -90, d), 'seoul');
  assert.ok(at(0).x < -0.95);
  assert.ok(Math.abs(at(P / 4).x) < 0.05 && at(P / 4).visible);
  assert.ok(at(P / 2).x > 0.95);
  assert.ok(!at(P * 0.6).visible, '서쪽 가장자리를 넘으면 뒤쪽');
  close(M.crossingDays(), 13.5);
  assert.ok(M.crossingDays() > 12 && M.crossingDays() < 16, '약 2주');
  // 북반구 흑점은 원반의 위쪽(서울) / 아래쪽(시드니)
  assert.ok(M.diskPosition(M.surfacePoint(20, 0), 'seoul').y > 0);
  assert.ok(M.diskPosition(M.surfacePoint(20, 0), 'sydney').y < 0);
});

test('확인 문제: 동쪽 가장자리에 나타난 흑점의 1주일 뒤 · 원반의 자리 이름', () => {
  assert.equal(M.diskZone(M.lonNow(-90, 7)).key, 'center');
  assert.equal(M.diskZone(M.lonNow(-90, 1)).key, 'east-limb');
  assert.equal(M.diskZone(M.lonNow(-90, 13)).key, 'west-limb');
  assert.equal(M.diskZone(M.lonNow(-90, 15)).key, 'far');
  assert.equal(M.diskZone(-40).key, 'east');
  assert.equal(M.diskZone(40).key, 'west');
  close(M.wrap180(190), -170); close(M.wrap180(-180), 180); close(M.wrap180(540), 180);
});
