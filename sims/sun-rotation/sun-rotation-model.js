/* 흑점은 동→서, 자전은 서→동? — 계산 모형 (화면 코드 없음).
   브라우저에서는 window.SunRotationModel, Node 시험(tests/sun-rotation-model.test.cjs)에서는 module.exports.

   좌표(3D 화면과 같다)
   - 태양 중심이 원점, 태양의 자전축(북극)이 +y, 지구는 +z 쪽에 있다.
   - 북극 위(+y)에서 내려다보면(+z 가 화면 아래) +z → +x → −z 로 도는 것이 시계 반대 방향이다.
     이것이 '서에서 동으로 자전'(지구와 같은 방향)이다.
   - 경도 lon 은 지구 쪽(+z)에서 +x 쪽으로 잰 각(도). 실제 자전(sense = +1)에서는 날마다 늘어난다.
   - 크기와 거리는 실제와 다르다(태양 반지름 4, 지구 반지름 1.5, 거리 18). 지구는 공전하지 않고,
     관측자는 매일 같은 시각(한낮)에 태양을 본다. 지구 자전축은 12월 무렵처럼 북극이 태양 반대쪽으로 기울었다. */
(function(root) {
  'use strict';
  const D2R = Math.PI / 180, R2D = 180 / Math.PI;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  const SCENE = {
    sunR: 4, earthR: 1.5, dist: 18,
    tilt: 23.44,          // 지구 자전축의 기울기(°)
    period: 27,           // 지구에서 본 태양의 자전 주기(일) — 모든 위도가 같은 빠르기로 돈다고 단순화
    eyeH: 0.36            // 관측자의 눈높이(화면 단위)
  };
  const SITES = {
    seoul: {name: '서울', lat: 37.5, hemi: '북반구'},
    sydney: {name: '시드니', lat: -33.9, hemi: '남반구'}
  };

  // ── 벡터 ───────────────────────────────────────────────
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const len = a => Math.hypot(a[0], a[1], a[2]);
  const norm = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const NORTH = [0, 1, 0];

  // ── 지구와 관측자 ─────────────────────────────────────────
  const earthCenter = () => [0, 0, SCENE.dist];
  // 지구 자전축(북극 쪽): 북극이 태양 반대쪽(+z)으로 기울어 있다
  const earthAxis = () => [0, Math.cos(SCENE.tilt * D2R), Math.sin(SCENE.tilt * D2R)];

  // 그 지역이 한낮(태양이 남중)일 때, 지구 표면의 관측자 자리와 지평면의 동서남북
  function observer(site = 'seoul') {
    const s = SITES[site] || SITES.seoul, lat = s.lat * D2R;
    const n = earthAxis(), c = earthCenter();
    const toSun = norm(sub([0, 0, 0], c));
    const m = norm(sub(toSun, scale(n, dot(toSun, n))));          // 적도면 위에서 태양 쪽
    const up = norm(add(scale(m, Math.cos(lat)), scale(n, Math.sin(lat))));
    const feet = add(c, scale(up, SCENE.earthR));
    const east = norm(cross(n, up));                                // 지구가 관측자를 데려가는 쪽
    const north = cross(up, east);
    const eye = add(feet, scale(up, SCENE.eyeH));
    const sunDir = norm(sub([0, 0, 0], eye));                       // 눈에서 태양 중심 쪽
    const facing = norm(sub(sunDir, scale(up, dot(sunDir, up))));   // 태양을 보려고 바라보는 지평선 쪽
    const altitude = Math.asin(clamp(dot(sunDir, up), -1, 1)) * R2D;
    // 태양을 바라본 화면: 위 = 천정 쪽, 오른쪽 = 바라보는 쪽 × 위
    const screenUp = norm(sub(up, scale(sunDir, dot(up, sunDir))));
    const screenRight = cross(sunDir, screenUp);
    return {
      site, name: s.name, hemi: s.hemi, lat: s.lat, up, feet, eye, east, north,
      west: scale(east, -1), south: scale(north, -1), sunDir, facing, altitude, screenUp, screenRight,
      facingName: dot(facing, north) > 0 ? '북' : '남',
      eastOnScreen: dot(east, screenRight) > 0 ? 'right' : 'left',
      sunNorthOnScreen: dot(NORTH, screenUp) > 0 ? 'up' : 'down'
    };
  }

  // ── 태양의 자전과 흑점 ─────────────────────────────────────
  // sense = +1: 서→동(실제, 북극 위에서 보면 시계 반대), −1: 동→서(만약에)
  const spinDeg = (days, sense = 1) => sense * 360 * days / SCENE.period;
  const wrap180 = a => { const x = ((a + 180) % 360 + 360) % 360 - 180; return x === -180 ? 180 : x; };
  const lonNow = (lon0, days, sense = 1) => wrap180(lon0 + spinDeg(days, sense));
  function surfacePoint(lat, lon, r = SCENE.sunR) {
    const b = lat * D2R, l = lon * D2R;
    return [r * Math.cos(b) * Math.sin(l), r * Math.sin(b), r * Math.cos(b) * Math.cos(l)];
  }
  const spotPosition = (lat, lon0, days, sense = 1, r = SCENE.sunR) => surfacePoint(lat, lon0 + spinDeg(days, sense), r);
  // 표면의 점이 움직이는 방향(단위 벡터) = 자전축 × 위치
  const surfaceVelocity = (p, sense = 1) => norm(cross([0, sense, 0], p));
  // 태양 자신의 동쪽: 지구본처럼 북극을 위로 두고 바깥에서 볼 때 오른쪽(= 북극 × 위치). 자전 방향과 상관없이 북극으로 정한다.
  const sunEastAt = p => norm(cross(NORTH, p));
  // 관측자 쪽을 바라보는 태양 표면의 점(원반의 한가운데)
  const subObserverPoint = (site = 'seoul') => scale(norm(observer(site).eye), SCENE.sunR);

  // 관측자가 본 원반 위의 위치: 태양의 겉보기 반지름 = 1, x 화면 오른쪽 +, y 화면 위 +
  function diskPosition(p, site = 'seoul') {
    const o = observer(site), d = sub(p, o.eye), f = dot(d, o.sunDir);
    const rr = Math.tan(Math.asin(SCENE.sunR / len(o.eye)));
    return {x: dot(d, o.screenRight) / f / rr, y: dot(d, o.screenUp) / f / rr, visible: dot(p, sub(o.eye, p)) > 0};
  }

  // 흑점이 움직이는 방향을 하늘의 동서와 화면의 좌우로
  function skyMotion(site = 'seoul', sense = 1) {
    const o = observer(site), v = surfaceVelocity(subObserverPoint(site), sense);
    const towardWest = dot(v, o.west) > 0, toRight = dot(v, o.screenRight) > 0;
    return {
      from: towardWest ? '동' : '서', to: towardWest ? '서' : '동',
      screen: toRight ? 'left-to-right' : 'right-to-left',
      sunOwn: dot(v, sunEastAt(subObserverPoint(site))) > 0 ? '서→동' : '동→서'
    };
  }

  // 흑점이 원반의 어디쯤 있나 (하늘의 동서로). lon 은 지구 쪽에서 잰 경도, 동쪽 = −x = lon < 0
  function diskZone(lon) {
    const l = wrap180(lon);
    if (Math.abs(l) > 90) return {key: 'far', text: '태양 뒤쪽 (안 보임)'};
    if (l < -60) return {key: 'east-limb', text: '동쪽 가장자리'};
    if (l < -20) return {key: 'east', text: '원반의 동쪽'};
    if (l <= 20) return {key: 'center', text: '원반 가운데'};
    if (l <= 60) return {key: 'west', text: '원반의 서쪽'};
    return {key: 'west-limb', text: '서쪽 가장자리'};
  }
  // 동쪽 가장자리에서 서쪽 가장자리까지 건너는 데 걸리는 날 (보이는 반쪽 = 180°)
  const crossingDays = () => SCENE.period / 2;

  const api = {D2R, R2D, clamp, SCENE, SITES, add, sub, scale, dot, cross, len, norm, NORTH,
    earthCenter, earthAxis, observer, spinDeg, wrap180, lonNow, surfacePoint, spotPosition, surfaceVelocity,
    sunEastAt, subObserverPoint, diskPosition, skyMotion, diskZone, crossingDays};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SunRotationModel = api;
})(typeof window !== 'undefined' ? window : this);
