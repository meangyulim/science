/* 태양 관측소 — 계산 모형 (화면 코드 없음).
   브라우저에서는 window.SunModel, Node 시험(tests/sun-model.test.cjs)에서는 module.exports.
   교과서: 천재교과서 『행성우주과학』 Ⅱ-01 태양의 광구와 대기 관측 (56~63쪽). */
(function(root) {
  'use strict';
  const D2R = Math.PI / 180, R2D = 180 / Math.PI;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const smoothstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

  // ── 교과서 56~63쪽(과 수업 활동지)에 나오는 값 ─────────────────────
  const BOOK = {
    photosphereT: 5800,                 // 광구 약 5800 K (56쪽)
    spotT: [4000, 5000],                // 흑점 4000~5000 K (56쪽)
    umbraT: 4000, penumbraT: 5000,      // 암부·반암부(활동지) — 흑점 온도 범위의 양 끝으로 단순화
    spotSizeKm: [3000, 100000],         // 지름 수천 km ~ 10만 km 이상 (56쪽)
    granuleKm: 1000,                    // 쌀알 무늬 평균 지름 약 1000 km (57쪽)
    granuleLifeMin: [3, 4],             // 수명 3~4분 (57쪽)
    chromosphereKm: 10000,              // 채층 높이 약 10000 km (61쪽)
    chromosphereT: [4500, 50000],       // 4500 K ~ 수만 K (61쪽)
    prominenceT: [5000, 50000],         // 홍염 5000~50000 K (61쪽 오개념 해결)
    coronaT: [1e6, 5e6],                // 수백만 K (62쪽) — 그리기용 범위
    equatorPeriod: 25,                  // 적도 약 25일 (61쪽)
    highLatPeriod: 30,                  // 고위도 30일 이상 (61쪽)
    cycleYears: 11,                     // 약 11년 (57쪽)
    maxLat: [20, 30],                   // 극대기에 흑점이 많은 위도 20°~30° (56쪽 그림 설명)
    minLat: 10,                         // 극소기에는 10° 이내 (56쪽 그림 설명)
    spotFreeLat: 50,                    // 50° 이상에서는 흑점이 거의 없다 (56쪽 그림 설명)
    textbookRows: {                     // 60쪽 표 (B의 시간 간격은 표에 '96'으로 인쇄 — 96시간 = 4일)
      A: {dt: 3, Rp: 8.15, x: 1.60, y: 3.85, sx: 0.20, sy: 0.47, aRad: 0.20, bRad: 0.49, alpha: 11.33, beta: 28.20, theta: 39.53, P: 27.32},
      B: {dt: 4, Rp: 14.62, x: 5.12, y: 8.32, sx: 0.35, sy: 0.57, aRad: 0.36, bRad: 0.61, alpha: 20.51, beta: 34.70, theta: 55.21, P: 26.08, printedDt: 96}
    },
    checkQ3: {dt: 4, theta: 50, P: 28.8}  // 63쪽 확인 문제 3
  };

  // ── 주연 감광 ─────────────────────────────────────────────
  // 원반 중심에서 r(태양 반지름 = 1)만큼 떨어진 곳의 밝기(가운데 = 1). 선형 주연 감광, 가시광선 u ≈ 0.6.
  function limbDarkening(r, u = 0.6) {
    if (r >= 1) return 0;
    const mu = Math.sqrt(1 - r * r);
    return 1 - u * (1 - mu);
  }

  // 같은 파장에서 온도 T인 기체와 기준 온도의 밝기 비. 흑점을 알맞은 어둡기로 그리려고 쓰는 계산이며
  // (흑체 복사), 화면에서 법칙으로 소개하지 않는다.
  const C2 = 1.438777e-2; // m·K
  function relBrightness(T, lambdaNm = 617.3, Tref = BOOK.photosphereT) {
    const l = lambdaNm * 1e-9;
    return Math.expm1(C2 / (l * Tref)) / Math.expm1(C2 / (l * T));
  }

  // ── 차등 자전 ─────────────────────────────────────────────
  // 자전 각속도(°/일). Snodgrass & Ulrich (1990)의 식으로, 지구 공전 효과를 뺀(보정한) 값이다.
  // 적도 약 24.5일(교과서: 약 25일), 위도 60°에서 30일을 넘는다.
  const DIFF = {A: 14.71, B: -2.39, C: -1.78};
  function omegaDeg(latDeg) {
    const s2 = Math.sin(latDeg * D2R) ** 2;
    return DIFF.A + DIFF.B * s2 + DIFF.C * s2 * s2;
  }
  const rotationPeriod = latDeg => 360 / omegaDeg(latDeg);
  function latitudeForPeriod(P) {
    // rotationPeriod 는 0°~90°에서 단조 증가 → 이분법
    let lo = 0, hi = 90;
    if (P <= rotationPeriod(0)) return 0;
    if (P >= rotationPeriod(90)) return 90;
    for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (rotationPeriod(m) < P) lo = m; else hi = m; }
    return (lo + hi) / 2;
  }

  // ── 원반 위의 위치 ───────────────────────────────────────────
  // 교과서 그림처럼 태양의 자전축이 화면과 나란하다고(위가 북쪽) 둔다.
  // lat: 위도(북 +), lon: 중앙 경선에서 잰 경도(서쪽 +). 반지름 1인 원반 좌표: x 서쪽(오른쪽) +, y 북쪽(위) +, z 관측자 쪽 +.
  function project(latDeg, lonDeg) {
    const c = Math.cos(latDeg * D2R);
    return {x: c * Math.sin(lonDeg * D2R), y: Math.sin(latDeg * D2R), z: c * Math.cos(lonDeg * D2R)};
  }
  function unproject(x, y) {
    const r2 = x * x + y * y;
    if (r2 > 1) return null;
    const z = Math.sqrt(1 - r2);
    return {lat: Math.asin(clamp(y, -1, 1)) * R2D, lon: Math.atan2(x, z) * R2D, mu: z};
  }
  // 흑점은 동쪽(왼쪽)에서 서쪽(오른쪽)으로 움직인다: Δt 일 뒤 경도 = 처음 경도 + ω·Δt
  const lonAfter = (lat, lon0, dt) => lon0 + omegaDeg(lat) * dt;

  // ── 교과서 60쪽: R′, x, y 로 자전 주기 구하기 ───────────────────────
  // x: 처음 위치에서 중앙 경선까지, y: 나중 위치에서 중앙 경선까지의 거리(cm).
  // 두 위치가 중앙 경선의 양쪽에 있으면 θ = α + β(교과서), 같은 쪽에 있으면 θ = |β − α|.
  const periodFromAngle = (theta, dt) => 360 / theta * dt;   // θ : Δt = 360° : P
  function rotationRow(dt, Rp, x, y, sameSide = false) {
    const sx = x / Rp, sy = y / Rp;
    const aRad = Math.asin(clamp(sx, -1, 1)), bRad = Math.asin(clamp(sy, -1, 1));
    const alpha = aRad * R2D, beta = bRad * R2D;
    const theta = sameSide ? Math.abs(beta - alpha) : alpha + beta;
    return {dt, Rp, x, y, sx, sy, aRad, bRad, alpha, beta, theta, P: theta > 0 ? periodFromAngle(theta, dt) : Infinity, sameSide};
  }
  // 투명 용지의 두 표시(원반 중심 기준, cm; 서쪽·북쪽 +)에서 R′, x, y 를 잰다. R: 사진 속 태양의 반지름(cm).
  function measureMarks(p1, p2, R) {
    const yLat = (p1.y + p2.y) / 2;
    const Rp = Math.sqrt(Math.max(0, R * R - yLat * yLat));
    const backwards = p2.x < p1.x;                        // 서→동으로 움직였다면 같은 흑점이 아니다
    const sameSide = (p1.x > 0 && p2.x > 0) || (p1.x < 0 && p2.x < 0);
    return {Rp, x: Math.abs(p1.x), y: Math.abs(p2.x), latDeg: Math.asin(clamp(yLat / R, -1, 1)) * R2D,
            dy: Math.abs(p1.y - p2.y), sameSide, backwards, side1: p1.x < 0 ? 'east' : 'west', side2: p2.x < 0 ? 'east' : 'west'};
  }

  // ── 같은 seed 는 같은 자료 ─────────────────────────────────────
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // 두 위치 사이의 각거리(°)
  function angDist(lat1, lon1, lat2, lon2) {
    const a = project(lat1, lon1), b = project(lat2, lon2);
    return Math.acos(clamp(a.x * b.x + a.y * b.y + a.z * b.z, -1, 1)) * R2D;
  }

  // ── 연습용 흑점 사진 한 쌍 ────────────────────────────────────
  // 흑점 4~5개(위도 40° 이내, 서로 5° 이상 떨어짐). 첫 흑점은 반드시 중앙 경선을 지나 교과서와 같은 θ = α + β 경우가 된다.
  // 두 사진 모두에서 경도 70° 안에 있어 재기 쉽다.
  const LIMB_LIMIT = 70;
  function practiceSet(seed) {
    const r = rng(seed);
    const dt = 3 + Math.floor(r() * 4);            // 3~6일
    // 저위도부터 고위도까지 고르게: 위도 띠 네 개에서 하나씩(순서는 섞음) + 아무 띠에서 하나
    const bands = [[3, 10], [11, 19], [20, 29], [30, 38]];
    for (let i = bands.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [bands[i], bands[j]] = [bands[j], bands[i]]; }
    bands.push([3, 38]);
    const lats = [];
    bands.forEach(([a, b]) => {
      for (let k = 0; k < 200; k++) {
        const lat = +((r() < 0.5 ? -1 : 1) * (a + r() * (b - a))).toFixed(1);
        if (lats.every(l => Math.abs(l - lat) >= 5)) { lats.push(lat); break; }
      }
    });
    const spots = [];
    lats.forEach((lat, i) => {
      const move = omegaDeg(lat) * dt;
      for (let k = 0; k < 200; k++) {
        let lon0;
        if (i === 0) lon0 = -move + 12 + r() * (move - 24);           // 중앙 경선을 지남
        else lon0 = -LIMB_LIMIT + r() * (2 * LIMB_LIMIT - move);
        const lon1 = lon0 + move;
        if (lon1 > LIMB_LIMIT || lon0 < -LIMB_LIMIT) continue;
        const clash = spots.some(s => angDist(s.lat, s.lon0, lat, lon0) < 9 || angDist(s.lat, s.lon1, lat, lon1) < 9);
        if (clash) continue;
        const umbra = 0.55 + r() * 0.7;                              // 암부 반지름(°)
        spots.push({id: i, lat, lon0: +lon0.toFixed(2), lon1: +(lon1).toFixed(2), umbra, penumbra: umbra * (2 + r() * 0.6),
                    shape: [r(), r(), r(), r()], P: rotationPeriod(lat), move});
        break;
      }
    });
    return {seed, dt, R: 10, spots};
  }
  // 교과서 예시(60쪽)를 그림으로 옮길 때: R′, x, y 는 표의 값 그대로, 태양 반지름 R 과 위도는 그림을 위해 정한 값
  function textbookExample(key) {
    const row = BOOK.textbookRows[key];
    const lat = key === 'A' ? -14 : 20;              // 교과서에 나오지 않음(그림용)
    const R = row.Rp / Math.cos(lat * D2R);
    const lon0 = -Math.asin(row.x / row.Rp) * R2D, lon1 = Math.asin(row.y / row.Rp) * R2D;
    return {key, dt: row.dt, R, lat, row,
            spots: [{id: 0, lat, lon0, lon1, umbra: 1.1, penumbra: 2.5, shape: [0.3, 0.6, 0.2, 0.8], book: true}]};
  }

  // ── 흑점 수 (SILSO) ─────────────────────────────────────────
  // 13개월 이동 평균(SILSO 방식: 양 끝 달은 절반 무게) — 교과서 그림 1의 '이동 평균'
  function smooth13(v) {
    const out = new Array(v.length).fill(null);
    for (let i = 6; i < v.length - 6; i++) {
      let s = v[i - 6] + v[i + 6];
      for (let k = -5; k <= 5; k++) s += 2 * v[i + k];
      out[i] = s / 24;
    }
    return out;
  }
  // 앞뒤 half 개월 안에서 가장 큰(작은) 값인 곳. 자료 양 끝에서 minSide 개월 안쪽은 아직 확정되지 않았으므로 뺀다.
  function localExtrema(s, half = 30, minSide = 12) {
    const max = [], min = [];
    let first = -1, last = -1;
    s.forEach((v, i) => { if (v !== null) { if (first < 0) first = i; last = i; } });
    for (let i = first + minSide; i <= last - minSide; i++) {
      if (s[i] === null) continue;
      let isMax = true, isMin = true;
      for (let k = Math.max(first, i - half); k <= Math.min(last, i + half); k++) {
        if (s[k] === null || k === i) continue;
        if (s[k] > s[i] || (s[k] === s[i] && k < i)) isMax = false;
        if (s[k] < s[i] || (s[k] === s[i] && k < i)) isMin = false;
      }
      if (isMax) max.push(i);
      if (isMin) min.push(i);
    }
    return {max, min};
  }
  const monthToYear = (i, start = [1950, 1]) => start[0] + (start[1] - 1 + i + 0.5) / 12;
  const yearToMonth = (y, start = [1950, 1]) => (y - start[0]) * 12 - (start[1] - 1) - 0.5;

  // ── 나비 도표 (위도 띠 50개, sin 위도 간격 0.04, 남 → 북) ───────────────
  function decodeButterfly(str, bins = 50) {
    return str.split(',').map((s, j) => {
      const col = new Uint8Array(bins);
      let k = 0;
      for (const ch of s) {
        const c = ch.charCodeAt(0);
        if (c >= 97 && c <= 122) k += c - 96;
        else col[k++] = c - 48;
      }
      if (k !== bins) throw new Error(`나비 도표 ${j}번째 열의 길이 ${k}`);
      return col;
    });
  }
  // 캐링턴 자전 번호 → 연(소수). 자전 시작 시각(율리우스일) ≈ 2398140.227 + 27.2752316 × 번호
  const crToYear = cr => 2000 + (2398140.227 + 27.2752316 * cr - 2451545.0) / 365.25;
  const binSin = (k, bins = 50) => -1 + (k + 0.5) * 2 / bins;
  const binLatitude = (k, bins = 50) => Math.asin(binSin(k, bins)) * R2D;
  // 단계(0~6)를 대표 면적으로 되돌린 무게 (단계 하한 0, 5, 20, 40, 100, 400의 중간쯤)
  const LEVEL_WEIGHT = [0, 2.5, 12, 30, 70, 250, 600];
  function columnStats(col) {
    const bins = col.length;
    let tot = 0, n = 0, s = 0, nN = 0, sN = 0, nS = 0, sS = 0, high = 0;
    for (let k = 0; k < bins; k++) {
      const w = LEVEL_WEIGHT[col[k]];
      if (!w) continue;
      const lat = binLatitude(k, bins);
      tot += w; n += w; s += w * Math.abs(lat);
      if (lat > 0) { nN += w; sN += w * lat; } else { nS += w; sS += w * lat; }
      if (Math.abs(lat) >= BOOK.spotFreeLat) high += w;
    }
    return {total: tot, meanAbsLat: n ? s / n : null, north: nN ? sN / nN : null, south: nS ? sS / nS : null, highFrac: tot ? high / tot : 0};
  }
  // 여러 열을 합친 위도 분포에서, 흑점 면적의 가운데 80%가 들어가는 |위도| 범위
  function latitudeBand(cols) {
    const bins = cols[0].length, half = bins / 2, acc = new Array(half).fill(0);
    cols.forEach(col => { for (let k = 0; k < bins; k++) { const j = k < half ? half - 1 - k : k - half; acc[j] += LEVEL_WEIGHT[col[k]]; } });
    const tot = acc.reduce((a, b) => a + b, 0);
    if (!tot) return null;
    let c = 0, lo = null, hi = null;
    for (let j = 0; j < half; j++) {
      c += acc[j];
      if (lo === null && c >= 0.1 * tot) lo = binLatitude(half + j, bins);
      if (hi === null && c >= 0.9 * tot) hi = binLatitude(half + j, bins);
    }
    return [lo, hi];
  }

  // ── 파장과 층 (62쪽 그림 5, 61~62쪽 본문) ─────────────────────────
  const WAVELENGTHS = [
    {id: 'vis', nm: 617.3, band: '가시광선', shows: '광구, 흑점'},
    {id: 'uv304', nm: 30.4, band: '자외선', shows: '채층, 플레어'},
    {id: 'uv193', nm: 19.3, band: '자외선', shows: '코로나, 플레어'},
    {id: 'x94', nm: 9.4, band: 'X선', shows: '고에너지 영역'}
  ];
  const LAYERS = [
    {id: 'spot', name: '흑점', T: BOOK.spotT, label: '4000~5000 K', wl: 'vis'},
    {id: 'photo', name: '광구', T: [5600, 6000], label: '약 5800 K', wl: 'vis'},
    {id: 'chromo', name: '채층', T: BOOK.chromosphereT, label: '4500 K ~ 수만 K', wl: 'uv304'},
    {id: 'prom', name: '홍염', T: BOOK.prominenceT, label: '5000~50000 K', wl: 'uv304'},
    {id: 'corona', name: '코로나', T: BOOK.coronaT, label: '수백만 K', wl: 'uv193'},
    {id: 'flare', name: '플레어', T: [6e6, 3e7], label: '코로나보다 뜨겁다', wl: 'x94'}
  ];

  // 흑점 수(13개월 이동 평균) → 0~1 활동 정도 (그림의 코로나 크기·오로라 세기)
  const activity = sn => clamp(sn / 200, 0, 1);

  // ── 쌀알 무늬 하나의 일생 ─────────────────────────────────────
  // 나이 비율 f = 나이/수명 → 0(없음)~1(가장 뚜렷). 생겨나 커지고 수명이 끝날 무렵 흐려진다.
  const granuleVigor = f => (f < 0 || f > 1) ? 0 : smoothstep(0, 0.22, f) * (1 - smoothstep(0.72, 1, f));

  const api = {D2R, R2D, clamp, smoothstep, BOOK, limbDarkening, relBrightness, DIFF, omegaDeg, rotationPeriod, latitudeForPeriod,
    project, unproject, lonAfter, periodFromAngle, rotationRow, measureMarks, rng, angDist, LIMB_LIMIT, practiceSet, textbookExample,
    smooth13, localExtrema, monthToYear, yearToMonth, decodeButterfly, crToYear, binSin, binLatitude, LEVEL_WEIGHT, columnStats,
    latitudeBand, WAVELENGTHS, LAYERS, activity, granuleVigor};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SunModel = api;
})(typeof window !== 'undefined' ? window : this);
