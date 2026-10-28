/* Celestial navigation model for the phone sextant.
   Low-precision ephemerides (Meeus, Astronomical Algorithms) — good to about
   0.01° for the Sun and stars and 0.05° for the Moon, far better than a phone sensor.
   Usable in the browser (window.SextantModel) and in Node tests. */
(function (root) {
  'use strict';
  const RAD = Math.PI / 180, DEG = 180 / Math.PI;
  const sin = d => Math.sin(d * RAD), cos = d => Math.cos(d * RAD), tan = d => Math.tan(d * RAD);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const asin = x => Math.asin(clamp(x, -1, 1)) * DEG;
  const atan2 = (y, x) => Math.atan2(y, x) * DEG;
  const norm360 = d => ((d % 360) + 360) % 360;
  const norm180 = d => norm360(d + 180) - 180;
  const EARTH_KM = 6371.0;
  const KM_PER_DEG = EARTH_KM * RAD;            // 1° of arc on Earth ≈ 111.2 km
  const DELTA_T = 69;                           // TT − UT (s), 2020년대 값

  // ── 시간 ──────────────────────────────────────────────────
  const jdFromMs = ms => ms / 86400000 + 2440587.5;
  const msFromJd = jd => (jd - 2440587.5) * 86400000;
  const centuriesTT = ms => (jdFromMs(ms + DELTA_T * 1000) - 2451545) / 36525;

  // 장동(간이식): 황경 장동 Δψ, 황도 경사 장동 Δε (도)
  function nutation(T) {
    const om = 125.04452 - 1934.136261 * T, L = 280.4665 + 36000.7698 * T, Lm = 218.3165 + 481267.8813 * T;
    return {
      dpsi: (-17.20 * sin(om) - 1.32 * sin(2 * L) - 0.23 * sin(2 * Lm) + 0.21 * sin(2 * om)) / 3600,
      deps: (9.20 * cos(om) + 0.57 * cos(2 * L) + 0.10 * cos(2 * Lm) - 0.09 * cos(2 * om)) / 3600
    };
  }
  const meanObliquity = T => 23.4392911 - (46.8150 * T + 0.00059 * T * T - 0.001813 * T * T * T) / 3600;

  // 그리니치 평균 항성시 (도), UT 기준
  function gmst(ms) {
    const jd = jdFromMs(ms), d = jd - 2451545, T = d / 36525;
    return norm360(280.46061837 + 360.98564736629 * d + 0.000387933 * T * T - T * T * T / 38710000);
  }
  // 그리니치 시 항성시 (춘분점 장동 보정)
  function gast(ms) {
    const T = centuriesTT(ms), n = nutation(T);
    return norm360(gmst(ms) + n.dpsi * cos(meanObliquity(T) + n.deps));
  }

  function eclToEq(lam, beta, eps) {
    return {
      ra: norm360(atan2(sin(lam) * cos(eps) - tan(beta) * sin(eps), cos(lam))),
      dec: asin(sin(beta) * cos(eps) + cos(beta) * sin(eps) * sin(lam))
    };
  }

  // ── 태양 (Meeus 25장, 저정밀) ──────────────────────────────
  function sunAt(ms) {
    const T = centuriesTT(ms);
    const L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T;
    const M = 357.52911 + 35999.05029 * T - 0.0001537 * T * T;
    const e = 0.016708634 - 0.000042037 * T - 0.0000001267 * T * T;
    const C = (1.914602 - 0.004817 * T - 0.000014 * T * T) * sin(M) + (0.019993 - 0.000101 * T) * sin(2 * M) + 0.000289 * sin(3 * M);
    const nu = M + C, R = 1.000001018 * (1 - e * e) / (1 + e * cos(nu));
    const om = 125.04 - 1934.136 * T;
    const lam = L0 + C - 0.00569 - 0.00478 * sin(om);
    const eps = meanObliquity(T) + 0.00256 * cos(om);
    const eq = eclToEq(lam, 0, eps);
    return {ra: eq.ra, dec: eq.dec, hp: 0.0024428 / R, sd: 0.26666 / R, distAU: R};
  }

  // ── 달 (Meeus 47장, 큰 항만 남긴 급수) ─────────────────────
  // [D, M, M', F, 황경 계수(1e-6°), 거리 계수(1e-3 km)]
  const MOON_LR = [
    [0, 0, 1, 0, 6288774, -20905355], [2, 0, -1, 0, 1274027, -3699111], [2, 0, 0, 0, 658314, -2955968],
    [0, 0, 2, 0, 213618, -569925], [0, 1, 0, 0, -185116, 48888], [0, 0, 0, 2, -114332, -3149],
    [2, 0, -2, 0, 58793, 246158], [2, -1, -1, 0, 57066, -152138], [2, 0, 1, 0, 53322, -170733],
    [2, -1, 0, 0, 45758, -204586], [0, 1, -1, 0, -40923, -129620], [1, 0, 0, 0, -34720, 108743],
    [0, 1, 1, 0, -30383, 104755], [2, 0, 0, -2, 15327, 10321], [0, 0, 1, 2, -12528, 0],
    [0, 0, 1, -2, 10980, 79661], [4, 0, -1, 0, 10675, -34782], [0, 0, 3, 0, 10034, -23210],
    [4, 0, -2, 0, 8548, -21636], [2, 1, -1, 0, -7888, 24208], [2, 1, 0, 0, -6766, 30824],
    [1, 0, -1, 0, -5163, -8379], [1, 1, 0, 0, 4987, -16675], [2, -1, 1, 0, 4036, -12831],
    [2, 0, 2, 0, 3994, -10445], [4, 0, 0, 0, 3861, -11650], [2, 0, -3, 0, 3665, 14403],
    [0, 1, -2, 0, -2689, -7003], [2, 0, -1, 2, -2602, 0], [2, -1, -2, 0, 2390, 10056],
    [1, 0, 1, 0, -2348, 6322], [2, -2, 0, 0, 2236, -9884]
  ];
  // [D, M, M', F, 황위 계수(1e-6°)]
  const MOON_B = [
    [0, 0, 0, 1, 5128122], [0, 0, 1, 1, 280602], [0, 0, 1, -1, 277693], [2, 0, 0, -1, 173237],
    [2, 0, -1, 1, 55413], [2, 0, -1, -1, 46271], [2, 0, 0, 1, 32573], [0, 0, 2, 1, 17198],
    [2, 0, 1, -1, 9266], [0, 0, 2, -1, 8822], [2, -1, 0, -1, 8216], [2, 0, -2, -1, 4324],
    [2, 0, 1, 1, 4200], [2, 1, 0, -1, -3359], [2, -1, -1, 1, 2463], [2, -1, 0, 1, 2211],
    [2, -1, -1, -1, 2065], [0, 1, -1, -1, -1870], [4, 0, -1, -1, 1828], [0, 1, 0, 1, -1794],
    [0, 0, 0, 3, -1749], [0, 1, -1, 1, -1565], [1, 0, 0, 1, -1491], [0, 1, 1, 1, -1475],
    [0, 1, 1, -1, -1410], [0, 1, 0, -1, -1344], [1, 0, 0, -1, -1335]
  ];
  function moonAt(ms) {
    const T = centuriesTT(ms), T2 = T * T, T3 = T2 * T, T4 = T3 * T;
    const Lp = 218.3164477 + 481267.88123421 * T - 0.0015786 * T2 + T3 / 538841 - T4 / 65194000;
    const D = 297.8501921 + 445267.1114034 * T - 0.0018819 * T2 + T3 / 545868 - T4 / 113065000;
    const M = 357.5291092 + 35999.0502909 * T - 0.0001536 * T2 + T3 / 24490000;
    const Mp = 134.9633964 + 477198.8675055 * T + 0.0087414 * T2 + T3 / 69699 - T4 / 14712000;
    const F = 93.2720950 + 483202.0175233 * T - 0.0036539 * T2 - T3 / 3526000 + T4 / 863310000;
    const A1 = 119.75 + 131.849 * T, A2 = 53.09 + 479264.290 * T, A3 = 313.45 + 481266.484 * T;
    const E = 1 - 0.002516 * T - 0.0000074 * T2;
    const ecc = m => (m === 0 ? 1 : Math.abs(m) === 1 ? E : E * E);
    let sl = 0, sr = 0, sb = 0;
    for (const [d, m, mp, f, l, r] of MOON_LR) {
      const arg = d * D + m * M + mp * Mp + f * F, k = ecc(m);
      sl += l * k * sin(arg); sr += r * k * cos(arg);
    }
    for (const [d, m, mp, f, b] of MOON_B) sb += b * ecc(m) * sin(d * D + m * M + mp * Mp + f * F);
    sl += 3958 * sin(A1) + 1962 * sin(Lp - F) + 318 * sin(A2);
    sb += -2235 * sin(Lp) + 382 * sin(A3) + 175 * sin(A1 - F) + 175 * sin(A1 + F) + 127 * sin(Lp - Mp) - 115 * sin(Lp + Mp);
    const n = nutation(T);
    const lam = Lp + sl / 1e6 + n.dpsi, beta = sb / 1e6, dist = 385000.56 + sr / 1000;
    const eq = eclToEq(lam, beta, meanObliquity(T) + n.deps);
    const hp = asin(6378.14 / dist);
    return {ra: eq.ra, dec: eq.dec, hp, sd: 0.2725 * hp, distKm: dist, lon: norm360(lam), lat: beta};
  }

  // ── 별 (J2000 좌표 + 세차) ─────────────────────────────────
  const hms = (h, m, s) => (h + m / 60 + s / 3600) * 15;
  const dms = (d, m, s) => Math.sign(d || 1) * (Math.abs(d) + m / 60 + s / 3600);
  const STARS = [
    {id: 'polaris', name: '북극성', ra: hms(2, 31, 49.09), dec: dms(89, 15, 50.8), mag: 2.0},
    {id: 'sirius', name: '시리우스', ra: hms(6, 45, 8.917), dec: -dms(16, 42, 58.02), mag: -1.46},
    {id: 'vega', name: '베가(직녀성)', ra: hms(18, 36, 56.336), dec: dms(38, 47, 1.28), mag: 0.03},
    {id: 'arcturus', name: '아르크투루스', ra: hms(14, 15, 39.672), dec: dms(19, 10, 56.67), mag: -0.05},
    {id: 'capella', name: '카펠라', ra: hms(5, 16, 41.359), dec: dms(45, 59, 52.77), mag: 0.08},
    {id: 'rigel', name: '리겔', ra: hms(5, 14, 32.272), dec: -dms(8, 12, 5.90), mag: 0.13},
    {id: 'procyon', name: '프로키온', ra: hms(7, 39, 18.119), dec: dms(5, 13, 29.96), mag: 0.34},
    {id: 'betelgeuse', name: '베텔게우스', ra: hms(5, 55, 10.305), dec: dms(7, 24, 25.43), mag: 0.5},
    {id: 'altair', name: '알타이르(견우성)', ra: hms(19, 50, 46.999), dec: dms(8, 52, 5.96), mag: 0.76},
    {id: 'aldebaran', name: '알데바란', ra: hms(4, 35, 55.239), dec: dms(16, 30, 33.49), mag: 0.86},
    {id: 'spica', name: '스피카', ra: hms(13, 25, 11.579), dec: -dms(11, 9, 40.75), mag: 0.97},
    {id: 'antares', name: '안타레스', ra: hms(16, 29, 24.459), dec: -dms(26, 25, 55.21), mag: 1.0},
    {id: 'pollux', name: '폴룩스', ra: hms(7, 45, 18.946), dec: dms(28, 1, 34.32), mag: 1.14},
    {id: 'fomalhaut', name: '포말하우트', ra: hms(22, 57, 39.046), dec: -dms(29, 37, 20.05), mag: 1.16},
    {id: 'deneb', name: '데네브', ra: hms(20, 41, 25.915), dec: dms(45, 16, 49.22), mag: 1.25},
    {id: 'regulus', name: '레굴루스', ra: hms(10, 8, 22.311), dec: dms(11, 58, 1.95), mag: 1.35},
    {id: 'dubhe', name: '두베(북두칠성)', ra: hms(11, 3, 43.67), dec: dms(61, 45, 3.7), mag: 1.8}
  ];

  // J2000 → 날짜의 평균 좌표 (Meeus 21.2 엄밀식)
  function precess(ra0, dec0, T) {
    const zeta = (2306.2181 * T + 0.30188 * T * T + 0.017998 * T * T * T) / 3600;
    const z = (2306.2181 * T + 1.09468 * T * T + 0.018203 * T * T * T) / 3600;
    const th = (2004.3109 * T - 0.42665 * T * T - 0.041833 * T * T * T) / 3600;
    const A = cos(dec0) * sin(ra0 + zeta);
    const B = cos(th) * cos(dec0) * cos(ra0 + zeta) - sin(th) * sin(dec0);
    const C = sin(th) * cos(dec0) * cos(ra0 + zeta) + cos(th) * sin(dec0);
    return {ra: norm360(atan2(A, B) + z), dec: asin(C)};
  }

  const BODIES = [
    {id: 'sun', name: '태양', kind: 'sun'},
    {id: 'moon', name: '달', kind: 'moon'},
    ...STARS.map(s => Object.assign({kind: 'star'}, s))
  ];
  const bodyInfo = id => BODIES.find(b => b.id === id);

  // 천체의 적경·적위와 그리니치 시간각(GHA). GHA 는 서쪽으로 잰다.
  function bodyAt(id, ms) {
    const b = bodyInfo(id);
    if (!b) throw new Error('unknown body ' + id);
    const p = b.kind === 'sun' ? sunAt(ms) : b.kind === 'moon' ? moonAt(ms)
      : Object.assign(precess(b.ra, b.dec, centuriesTT(ms)), {hp: 0, sd: 0});
    return Object.assign({}, p, {id, gha: norm360(gast(ms) - p.ra)});
  }
  // 지리적 위치(GP): 천체가 머리 바로 위에 있는 지점. 경도는 동경 +.
  const groundPoint = pos => ({lat: pos.dec, lon: norm180(-pos.gha)});

  // ── 고도와 방위 ─────────────────────────────────────────────
  // 경도는 동경 +. 방위는 북쪽 0°에서 시계 방향.
  function altAz(gha, dec, lat, lon) {
    const lha = gha + lon;
    const h = asin(sin(lat) * sin(dec) + cos(lat) * cos(dec) * cos(lha));
    const az = norm360(atan2(-cos(dec) * sin(lha), sin(dec) * cos(lat) - cos(dec) * sin(lat) * cos(lha)));
    return {h, az};
  }

  // ── 고도 보정 ───────────────────────────────────────────────
  // 대기차(Bennett): 겉보기 고도 h(°)에서 빼야 할 각, 분(′) 단위
  function refractionArcmin(h) {
    const hh = Math.max(h, -0.9);
    return 1 / tan(hh + 7.31 / (hh + 4.4));
  }
  // 측정 고도 Hs → 관측 고도 Ho (지구 중심에서 본 고도)
  //   ie: 기기 오차(인덱스 오차), hp: 지평 시차 (달은 약 1°)
  function observedAltitude(hs, ie, hp) {
    const ha = hs - (ie || 0);
    const R = refractionArcmin(ha) / 60;
    const P = hp ? asin(sin(hp) * cos(ha - R)) : 0;
    return {ha, refraction: R, parallax: P, ho: ha - R + P};
  }
  // 거꾸로: 지구 중심 고도 → 폰이 보여 줄 겉보기 고도 (연습 문제 만들기용)
  function apparentFromTrue(ho, hp) {
    let ha = ho;
    for (let i = 0; i < 20; i++) {
      const o = observedAltitude(ha, 0, hp);
      ha += ho - o.ho;
    }
    return ha;
  }

  // ── 폰 자세 → 고도 ──────────────────────────────────────────
  // DeviceOrientation 의 β, γ(°)로 뒷면 카메라가 향하는 방향의 고도.
  // 회전 행렬 Rz(α)Rx(β)Ry(γ) 에서 기기 z축의 연직 성분은 cosβ·cosγ, 카메라는 −z 방향을 본다.
  // 화면을 눕히든 세우든(롤) 값이 같다 — 거품 육분의처럼 중력이 수평선 역할을 한다.
  const cameraElevation = (beta, gamma) => asin(-cos(beta) * cos(gamma));
  // 폰 윗모서리(기기 +y축)가 향하는 방향의 고도. 연직 성분은 sinβ.
  const edgeElevation = beta => asin(sin(beta));

  // ── 구면 위의 점과 원 ─────────────────────────────────────
  function vec(lat, lon) { return [cos(lat) * cos(lon), cos(lat) * sin(lon), sin(lat)]; }
  function latLon(v) { return {lat: asin(v[2] / Math.hypot(v[0], v[1], v[2])), lon: atan2(v[1], v[0])}; }
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  function angularDistance(a, b) {
    const dlat = (b.lat - a.lat) * RAD, dlon = (b.lon - a.lon) * RAD;
    const s = Math.sin(dlat / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dlon / 2) ** 2;
    return 2 * Math.asin(Math.min(1, Math.sqrt(s))) * DEG;
  }
  const distanceKm = (a, b) => angularDistance(a, b) * KM_PER_DEG;
  // a 에서 b 로 가는 첫 방위 (북 0°, 시계 방향)
  function bearing(a, b) {
    return norm360(atan2(sin(b.lon - a.lon) * cos(b.lat), cos(a.lat) * sin(b.lat) - sin(a.lat) * cos(b.lat) * cos(b.lon - a.lon)));
  }
  function destination(p, bearing, dist) {
    const lat = asin(sin(p.lat) * cos(dist) + cos(p.lat) * sin(dist) * cos(bearing));
    const lon = p.lon + atan2(sin(bearing) * sin(dist) * cos(p.lat), cos(dist) - sin(p.lat) * sin(lat));
    return {lat, lon: norm180(lon)};
  }
  // 고도가 같은 원(위치선): 중심 GP, 반지름 90° − Ho.
  // 지도에 이어 그릴 수 있도록 경도를 끊지 않고 펴고, refLon 근처로 옮긴다.
  function circlePoints(center, radius, n, refLon) {
    const pts = [];
    let prev = null, shift = 0;
    for (let i = 0; i <= n; i++) {
      const p = destination(center, 360 * i / n, radius);
      if (prev !== null) {
        const d = p.lon + shift - prev;
        if (d > 180) shift -= 360; else if (d < -180) shift += 360;
      }
      prev = p.lon + shift;
      pts.push([p.lat, prev]);
    }
    if (refLon !== undefined && pts.length) {
      let best = 0;
      pts.forEach((p, i) => { if (Math.abs(norm180(p[1] - refLon)) < Math.abs(norm180(pts[best][1] - refLon))) best = i; });
      const k = Math.round((refLon - pts[best][1]) / 360) * 360;
      for (const p of pts) p[1] += k;
    }
    return pts;
  }
  // 두 위치선(원)의 교점. 원이 만나지 않으면 빈 배열.
  function circleIntersections(c1, r1, c2, r2) {
    const g1 = vec(c1.lat, c1.lon), g2 = vec(c2.lat, c2.lon);
    const s1 = cos(r1), s2 = cos(r2), c = dot(g1, g2), den = 1 - c * c;
    if (den < 1e-12) return [];
    const a = (s1 - s2 * c) / den, b = (s2 - s1 * c) / den;
    const x0 = [a * g1[0] + b * g2[0], a * g1[1] + b * g2[1], a * g1[2] + b * g2[2]];
    const n = cross(g1, g2), nn = dot(n, n), t2 = (1 - dot(x0, x0)) / nn;
    if (t2 < 0) return [];
    const t = Math.sqrt(t2);
    return [1, -1].map(sg => latLon([x0[0] + sg * t * n[0], x0[1] + sg * t * n[1], x0[2] + sg * t * n[2]]));
  }

  // ── 위치 구하기 ─────────────────────────────────────────────
  // sights: [{gha, dec, ho}] (도). 같은 자리에서 잰 관측들.
  // 각 관측은 '고도가 같은 원' 하나를 준다. 최소제곱(가우스-뉴턴)으로 원들이 만나는 점을 찾는다.
  // 원 두 개는 두 점에서 만나므로, 추정 위치(ap, 항해의 추측 위치)에 가까운 쪽을 고른다.
  function refine(sights, start, iters) {
    let lat = start.lat, lon = start.lon;
    for (let it = 0; it < (iters || 40); it++) {
      let a11 = 0, a12 = 0, a22 = 0, b1 = 0, b2 = 0;
      for (const s of sights) {
        const {h, az} = altAz(s.gha, s.dec, lat, lon);
        const r = s.ho - h, ca = cos(az), sa = sin(az);
        a11 += ca * ca; a12 += ca * sa; a22 += sa * sa; b1 += ca * r; b2 += sa * r;
      }
      const det = a11 * a22 - a12 * a12;
      let dlat, dx;
      if (det > 1e-9) { dlat = (a22 * b1 - a12 * b2) / det; dx = (a11 * b2 - a12 * b1) / det; }
      else {                                  // 원이 한 방향뿐: 경사 방향으로만 움직인다
        const tr = a11 + a22 || 1; dlat = b1 / tr; dx = b2 / tr;
      }
      const step = Math.hypot(dlat, dx);
      if (step > 10) { dlat *= 10 / step; dx *= 10 / step; }
      lat = clamp(lat + dlat, -89.9, 89.9);
      lon = norm180(lon + dx / Math.max(cos(lat), 0.02));
      if (step < 1e-10) break;
    }
    return {lat, lon};
  }
  function fitStats(sights, p) {
    let a11 = 0, a12 = 0, a22 = 0, ss = 0;
    const residuals = [], azimuths = [];
    for (const s of sights) {
      const {h, az} = altAz(s.gha, s.dec, p.lat, p.lon);
      const ca = cos(az), sa = sin(az);
      a11 += ca * ca; a12 += ca * sa; a22 += sa * sa;
      residuals.push(s.ho - h); azimuths.push(az); ss += (s.ho - h) ** 2;
    }
    const det = a11 * a22 - a12 * a12;
    return {residuals, azimuths, rms: Math.sqrt(ss / sights.length), det,
      gdop: det > 1e-9 ? Math.sqrt((a11 + a22) / det) : Infinity};
  }
  // 두 위치선이 만나는 각 중 가장 큰 것 (90°가 가장 좋고 0°·180°는 평행)
  function bestCrossingAngle(azimuths) {
    let best = 0;
    for (let i = 0; i < azimuths.length; i++) for (let j = i + 1; j < azimuths.length; j++) {
      const d = Math.abs(norm180(azimuths[i] - azimuths[j]));
      best = Math.max(best, Math.min(d, 180 - d));
    }
    return best;
  }
  function solveFix(sights, ap) {
    ap = ap || {lat: 36.5, lon: 127.8};
    if (!sights.length) return {kind: 'none'};
    if (sights.length === 1) {
      const s = sights[0];
      if (Math.abs(s.dec) > 88) {             // 북극성: 고도 ≈ 위도. 경도는 추정 위치에 두고 위도만 맞춘다.
        let lat = s.ho;
        for (let i = 0; i < 30; i++) {
          const {h, az} = altAz(s.gha, s.dec, lat, ap.lon);
          const g = cos(az);
          if (Math.abs(g) < 1e-6) break;
          lat = clamp(lat + (s.ho - h) / g, -89.9, 89.9);
        }
        return {kind: 'latitude', lat, lon: ap.lon};
      }
      return {kind: 'line'};
    }
    const starts = [ap];
    for (let i = 0; i < sights.length; i++) for (let j = i + 1; j < sights.length; j++) {
      const a = sights[i], b = sights[j];
      for (const p of circleIntersections(groundPoint(a), 90 - a.ho, groundPoint(b), 90 - b.ho)) starts.push(p);
    }
    const sols = starts.map(st => { const p = refine(sights, st); return Object.assign(p, fitStats(sights, p)); })
      .filter(s => s.det > 1e-9);
    if (!sols.length) return {kind: 'line', reason: 'parallel'};
    const bestRms = Math.min(...sols.map(s => s.rms));
    // 관측 수가 적으면 두 교점이 똑같이 잘 맞는다 → 추정 위치에 가까운 쪽
    const pick = sols.filter(s => s.rms <= bestRms + 0.05)
      .sort((x, y) => angularDistance(x, ap) - angularDistance(y, ap))[0];
    return Object.assign({kind: 'fix', crossing: bestCrossingAngle(pick.azimuths)}, pick);
  }

  // ── 표기 ───────────────────────────────────────────────────
  function formatAngle(v, pos, neg) {
    const a = Math.abs(v), d = Math.floor(a), m = (a - d) * 60;
    const mm = m.toFixed(1) === '60.0' ? [d + 1, '0.0'] : [d, m.toFixed(1)];
    return `${mm[0]}°${mm[1].padStart(4, '0')}′${v < 0 ? neg : pos}`;
  }
  const formatLat = v => formatAngle(v, 'N', 'S');
  const formatLon = v => formatAngle(norm180(v), 'E', 'W');
  const COMPASS = ['북', '북북동', '북동', '동북동', '동', '동남동', '남동', '남남동', '남', '남남서', '남서', '서남서', '서', '서북서', '북서', '북북서'];
  const compassName = az => COMPASS[Math.round(norm360(az) / 22.5) % 16];

  const api = {
    RAD, DEG, KM_PER_DEG, DELTA_T, STARS, BODIES,
    norm360, norm180, jdFromMs, msFromJd, gmst, gast, nutation, precess,
    sunAt, moonAt, bodyAt, bodyInfo, groundPoint, altAz,
    refractionArcmin, observedAltitude, apparentFromTrue,
    cameraElevation, edgeElevation,
    angularDistance, distanceKm, bearing, destination, circlePoints, circleIntersections,
    solveFix, fitStats, bestCrossingAngle,
    formatLat, formatLon, compassName
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SextantModel = api;
})(typeof window !== 'undefined' ? window : this);
