/* 별까지의 거리 — 연주 시차, 등급과 밝기, 거리 지수, 두 방법 비교에 쓰는 계산 모형.
   브라우저(window.StarDistanceModel)와 Node 테스트(module.exports)에서 함께 쓴다. DOM은 쓰지 않는다.
   수치의 근거: 교과서 『행성우주과학』(천재교과서, 오필석 외) 64~66쪽·84~85쪽,
   수업 활동지 「2-2-1 별까지의 거리 측정」과 PPT(별까지의 거리) 노트. */
(function(root) {
  'use strict';
  const log10 = Math.log10;
  const TAU = 2 * Math.PI;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  // ── 단위 (활동지 1쪽) ──────────────────────────────────────
  const LY_PER_PC = 3.26;           // 1 pc ≈ 3.26 광년 (교과서 64쪽)
  const KM_PER_PC = 3.09e13;        // 1 pc ≈ 3.09 × 10¹³ km
  const AU_PER_PC = 206265;         // 1 pc ≈ 206 265 AU
  const KM_PER_LY = 9.46e12;        // 1 광년 ≈ 9.46 × 10¹² km
  const ARCSEC_PER_RAD = 180 * 3600 / Math.PI; // 206 264.8″
  const pcToLy = r => r * LY_PER_PC;
  const lyToPc = ly => ly / LY_PER_PC;

  // ── 연주 시차 (교과서 64쪽) ────────────────────────────────
  // r[pc] = 1 / p[″]. 연주 시차는 공전 궤도 양 끝(E₁, E₂)에서 본 방향 차이(시차)의 1/2.
  const distanceFromParallax = p => 1 / p;
  const parallaxFromDistance = r => 1 / r;
  const parallaxFromShift = shift => shift / 2;
  // 1 cm 크기의 물체가 p″로 보이려면 몇 km 떨어져야 하나 (1″ ≈ 2 km 떨어진 1 cm)
  const coinDistanceKm = p => 0.01 / (p / ARCSEC_PER_RAD) / 1000;

  // 지구의 위치(AU). 태양이 원점, +y가 별 S 쪽(그림 6처럼 E₁E₂에 수직인 방향).
  // months = 관측 시작 후 개월. 0 = E₁(왼쪽 끝), 3 = 별에서 가장 먼 곳, 6 = E₂(오른쪽 끝), 9 = 별에 가장 가까운 곳.
  // 북쪽에서 내려다보면 지구는 시계 반대 방향으로 돈다.
  function earthPosition(months) {
    const a = Math.PI + TAU * months / 12;
    return {x: Math.cos(a), y: Math.sin(a)};
  }
  // 망원경 시야에서 배경 별에 대한 별 S의 겉보기 위치(″). + = 오른쪽(S₁ 쪽).
  // 공전 면 위의 별은 1년 동안 S₁과 S₂ 사이를 오간다. E₁에서 +p, E₂에서 −p.
  const apparentOffset = (p, months) => -p * earthPosition(months).x;
  // 과장해 그린 위에서 본 그림용: 지구 E에서 별 S(0, D)를 지나 높이 Y(배경 별 띠)에 닿는 점의 x 좌표.
  function sightLineX(E, D, Y) {
    return E.x + (0 - E.x) * (Y - E.y) / (D - E.y);
  }
  // 측정 한계: 지상 망원경은 약 0.01″(약 100 pc)까지(교과서 64쪽, 활동지 1쪽),
  // 우주 망원경 Gaia는 밝은 별이면 수천 pc까지(수업 PPT: 약 5000 pc 막대) — 0.0002″로 둔다.
  const LIMITS = {
    ground: {name: '지상 망원경', p: 0.01},
    gaia: {name: '우주 망원경 Gaia', p: 0.0002}
  };
  const measurable = (p, inst) => p >= LIMITS[inst].p - 1e-12;

  // ── 등급과 밝기 (교과서 65쪽) ──────────────────────────────
  // 5등급 차 = 100배 → 1등급 차 = 100^(1/5) ≈ 2.512배
  const ONE_MAG = 100 ** (1 / 5);
  // m₂ − m₁ = dm 일 때 밝기 비 l₁/l₂ = 100^(dm/5) = 10^(2dm/5)
  const brightnessRatio = dm => 10 ** (0.4 * dm);
  // 포그슨 공식: m₂ − m₁ = −2.5 log (l₂/l₁)
  const pogson = (l1, l2) => -2.5 * log10(l2 / l1);
  // 밝기 비 → 등급 차 (l₁/l₂ = ratio 이면 m₂ − m₁)
  const magDiffFromRatio = ratio => 2.5 * log10(ratio);

  // ── 밝기와 거리 (교과서 65쪽 그림 7) ───────────────────────
  // 같은 광도의 별: 밝기는 거리의 제곱에 반비례 → l₁/l₂ = (d₂/d₁)²
  const inverseSquare = (d1, d2) => (d2 / d1) ** 2;
  // m₂ − m₁ = −2.5 log (l₂/l₁) = −5 log (d₁/d₂)
  const magDiffFromDistance = (d1, d2) => -5 * log10(d1 / d2);

  // ── 절대 등급과 거리 지수 (교과서 65쪽) ─────────────────────
  // m − M = −5 log (10/r) = 5 log r − 5   (r: pc)
  const distanceModulus = r => 5 * log10(r) - 5;
  const distanceFromModulus = mu => 10 ** ((mu + 5) / 5);
  const logDistance = (m, M) => (m - M + 5) / 5;
  const apparentMag = (M, r) => M + distanceModulus(r);
  const absoluteMag = (m, r) => m - distanceModulus(r);
  // 10 pc로 옮겨 가는 도중의 거리: 두 거리 사이를 로그 눈금으로 잇는다 (t = 0 실제 거리, 1 = 10 pc)
  const moveToward10pc = (r, t) => 10 ** ((1 - t) * log10(r) + t);

  // ── 두 별 비교: 식은 하나, 경우는 셋 (활동지 3쪽) ────────────
  // m₁ − m₂ = (M₁ − M₂) + 5 log (r₁/r₂)
  // 겉보기 등급 차 = 광도에서 오는 차 + 거리에서 오는 차
  function twoStars(s1, s2) {
    const m1 = apparentMag(s1.M, s1.r), m2 = apparentMag(s2.M, s2.r);
    return {m1, m2, dm: m1 - m2, dM: s1.M - s2.M, dr: 5 * log10(s1.r / s2.r)};
  }
  // 겉보기 등급이 같을 때: M₂ − M₁ = 5 log (r₁/r₂) → r₂ = r₁ × 10^((M₁ − M₂)/5)
  const distanceForSameApparent = (r1, M1, M2) => r1 * 10 ** ((M1 - M2) / 5);
  // 광도 비 = 같은 거리(10 pc)에서의 밝기 비: L₁/L₂ = 10^(0.4 (M₂ − M₁))
  const luminosityRatio = (M1, M2) => 10 ** (0.4 * (M2 - M1));
  // 광도(태양 = 1). 수업 활동지 2쪽: L/L☉ = 10^((4.8 − M)/2.5), 태양의 절대 등급 +4.8
  const SUN_ABS_MAG = 4.8;
  const luminosityInSuns = M => 10 ** ((SUN_ABS_MAG - M) / 2.5);

  // ── 교과서 66쪽 해 보기: 연주 시차와 거리 지수로 별의 거리 구하기 ──
  // 자료 출처(교과서): Carroll and Ostlie, 2017
  const EXPLORE = [
    {id: 'sirius', name: '시리우스', con: '큰개자리', p: 0.37, pText: '0.37', m: -1.44, M: 1.41},
    {id: 'betelgeuse', name: '베텔게우스', con: '오리온자리', p: 5.95e-3, pText: '5.95 × 10⁻³', m: 0.45, M: -5.14},
    {id: 'rigel', name: '리겔', con: '오리온자리', p: 3.23e-3, pText: '3.23 × 10⁻³', m: 0.18, M: -6.70}
  ];
  // 교사용 교과서 66쪽 여백의 답
  const EXPLORE_ANSWERS = {
    sirius: {parallax: 2.703, modulus: 2.692},
    betelgeuse: {parallax: 168.1, modulus: 131.2},
    rigel: {parallax: 309.6, modulus: 237.7}
  };
  // 연주 시차를 ±sigma″ 잘못 쟀을 때 거리의 범위
  function parallaxRange(p, sigma) {
    return {near: 1 / (p + sigma), far: sigma >= p ? Infinity : 1 / (p - sigma), r: 1 / p};
  }
  // 거리의 상대 오차(대략) = sigma / p
  const relativeError = (p, sigma) => sigma / p;
  // 오늘날 알려진 거리(광년). 수업 PPT 노트: 베텔게우스 약 500~720광년, 리겔 약 860광년.
  // 시리우스 약 8.6광년(히파르코스 연주 시차 0.379″).
  const KNOWN_LY = {sirius: [8.6, 8.6], betelgeuse: [500, 720], rigel: [860, 860]};

  // ── 수업 문항 ───────────────────────────────────────────────
  // Q1: 별 A 0.1″, 별 B 0.4″ (활동지 1쪽)
  const Q1 = {A: 0.1, B: 0.4};
  // Q2: m = 7, M = 2 (활동지 3쪽)
  const Q2 = {m: 7, M: 2};
  // Q4: (가)와 (나)는 거리가 같고, (나)와 (다)는 겉보기 등급이 같다 (활동지 3~4쪽)
  const Q4 = {ga: {m: 5, M: 0}, na: {m: 10}, da: {M: -5}};
  function solveQ4() {
    const rGa = distanceFromModulus(Q4.ga.m - Q4.ga.M);
    const rNa = rGa;                                  // 거리가 같다
    const MNa = absoluteMag(Q4.na.m, rNa);
    const mDa = Q4.na.m;                              // 겉보기 등급이 같다
    const rDa = distanceFromModulus(mDa - Q4.da.M);
    // 보기 ㄱ·ㄴ·ㄷ의 참·거짓
    return {rGa, rNa, MNa, mDa, rDa,
      statements: [
        Math.abs(rGa - 100) < 1e-6,                              // ㄱ. (가)까지의 거리는 100 pc이다.
        Math.abs(luminosityRatio(Q4.ga.M, MNa) - 100) < 1e-6,     // ㄴ. 광도는 (가)가 (나)의 100배이다.
        Math.abs(rDa / rNa - 10) < 1e-6                           // ㄷ. 거리는 (다)가 (나)의 10배이다.
      ]};
  }

  // ── 교과서 단원 마무리 ────────────────────────────────────────
  // 84쪽 4번: 표의 별들 (64~65쪽)
  const REVIEW4 = [
    {id: 'deneb', name: '데네브', m: 1.3, M: -8.7},
    {id: 'spica', name: '스피카', m: 1.0, M: -3.6},
    {id: 'vega', name: '베가(직녀성)', m: 0.0, M: 0.6},
    {id: 'sun', name: '태양', m: -26.7, M: 4.8}
  ];
  // 85쪽 5번: 6개월 간격 사진 두 장. 처음에는 별 A가 배경 별 B의 왼쪽 0.07″, 6개월 뒤에는 오른쪽 0.03″.
  const REVIEW5 = {before: 0.07, after: 0.03};
  const review5Parallax = () => parallaxFromShift(REVIEW5.before + REVIEW5.after);

  // ── 어림표 (활동지 3~4쪽) ─────────────────────────────────────
  const ROUGH_MAG = [[1, '약 2.5배'], [2, '약 6.3배'], [2.5, '10배'], [3, '약 16배'], [4, '약 40배'], [5, '100배'], [10, '10⁴배']];
  const ROUGH_DIST = [[2, '약 1.5등급'], [3, '약 2.4등급'], [4, '약 3등급'], [10, '5등급'], [100, '10등급']];
  const POW10 = [[0.1, 1.3], [0.2, 1.6], [0.3, 2.0], [0.4, 2.5], [0.5, 3.2], [0.6, 4.0], [0.7, 5.0], [0.8, 6.3], [0.9, 7.9]];
  // 10^x 를 어림표로: 정수 부분은 0의 개수, 소수 부분은 표에서 가장 가까운 값(소수 첫째 자리).
  // value = 어림표 값으로 계산, exact = 소수 첫째 자리까지 반올림한 지수로 정확히 계산 (활동지의 2.5 · 126 · 251)
  function roughPow10(x) {
    const k = Math.floor(x + 1e-9), f = x - k;
    let best = [0, 1];
    for (const row of [[0, 1], ...POW10, [1, 10]]) if (Math.abs(row[0] - f) < Math.abs(best[0] - f)) best = row;
    return {k, f: best[0], mant: best[1], value: best[1] * 10 ** k, exact: 10 ** (k + best[0])};
  }

  // ── 별자리 그림용 좌표 (J2000, SIMBAD) ──────────────────────
  // ra: 시 분 초, dec: 도 분 초, v: 겉보기 등급(V)
  const SKY = [
    {id: 'betelgeuse', name: '베텔게우스', ra: [5, 55, 10.3], dec: [7, 24, 25], v: 0.50, color: '#ffb070'},
    {id: 'rigel', name: '리겔', ra: [5, 14, 32.3], dec: [-8, 12, 6], v: 0.13, color: '#bfd4ff'},
    {id: 'bellatrix', ra: [5, 25, 7.9], dec: [6, 20, 59], v: 1.64},
    {id: 'mintaka', ra: [5, 32, 0.4], dec: [-0, 17, 57], decSign: -1, v: 2.23},
    {id: 'alnilam', ra: [5, 36, 12.8], dec: [-1, 12, 7], v: 1.69},
    {id: 'alnitak', ra: [5, 40, 45.5], dec: [-1, 56, 34], v: 1.77},
    {id: 'saiph', ra: [5, 47, 45.4], dec: [-9, 40, 11], v: 2.09},
    {id: 'meissa', ra: [5, 35, 8.3], dec: [9, 56, 3], v: 3.33},
    {id: 'sirius', name: '시리우스', ra: [6, 45, 8.9], dec: [-16, 42, 58], v: -1.46, color: '#e8f0ff'}
  ];
  // 수업 그림(orion.py)과 같은 별자리 선
  const ORION_LINES = [['meissa', 'betelgeuse'], ['meissa', 'bellatrix'], ['betelgeuse', 'alnitak'], ['bellatrix', 'mintaka'],
    ['mintaka', 'alnilam'], ['alnilam', 'alnitak'], ['alnitak', 'saiph'], ['mintaka', 'rigel'], ['saiph', 'rigel']];
  const raDeg = ([h, m, s]) => (h + m / 60 + s / 3600) * 15;
  function decDeg(star) {
    const [d, m, s] = star.dec;
    const sign = star.decSign || (d < 0 ? -1 : 1);
    return sign * (Math.abs(d) + m / 60 + s / 3600);
  }
  // 하늘에 그린 위치(도). 북쪽이 위, 동쪽이 왼쪽(남쪽 하늘을 올려다본 모습).
  function skyOffset(star, ra0, dec0) {
    const dec = decDeg(star);
    return {x: -(raDeg(star.ra) - ra0) * Math.cos(dec * Math.PI / 180), y: dec - dec0};
  }
  // 두 별 사이의 각거리(도)
  function angularSeparation(a, b) {
    const r = Math.PI / 180, d1 = decDeg(a) * r, d2 = decDeg(b) * r, dra = (raDeg(a.ra) - raDeg(b.ra)) * r;
    return Math.acos(clamp(Math.sin(d1) * Math.sin(d2) + Math.cos(d1) * Math.cos(d2) * Math.cos(dra), -1, 1)) / r;
  }
  // 두 별 사이의 실제 거리(pc): 거리 r₁, r₂와 사잇각 θ
  const spaceSeparation = (r1, r2, thetaDeg) =>
    Math.sqrt(r1 * r1 + r2 * r2 - 2 * r1 * r2 * Math.cos(thetaDeg * Math.PI / 180));

  const api = {clamp, TAU, LY_PER_PC, KM_PER_PC, AU_PER_PC, KM_PER_LY, ARCSEC_PER_RAD, pcToLy, lyToPc,
    distanceFromParallax, parallaxFromDistance, parallaxFromShift, coinDistanceKm, earthPosition, apparentOffset, sightLineX,
    LIMITS, measurable, ONE_MAG, brightnessRatio, pogson, magDiffFromRatio, inverseSquare, magDiffFromDistance,
    distanceModulus, distanceFromModulus, logDistance, apparentMag, absoluteMag, moveToward10pc,
    twoStars, distanceForSameApparent, luminosityRatio, SUN_ABS_MAG, luminosityInSuns,
    EXPLORE, EXPLORE_ANSWERS, parallaxRange, relativeError, KNOWN_LY, Q1, Q2, Q4, solveQ4, REVIEW4, REVIEW5, review5Parallax,
    ROUGH_MAG, ROUGH_DIST, POW10, roughPow10, SKY, ORION_LINES, raDeg, decDeg, skyOffset, angularSeparation, spaceSeparation};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.StarDistanceModel = api;
})(typeof window !== 'undefined' ? window : this);
