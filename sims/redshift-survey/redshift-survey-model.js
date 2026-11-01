/* 은하 적색 편이 탐사 — 계산 모형 (교과서 114~117쪽, 121쪽 확인 문제 3)
   브라우저에서는 window.RedshiftSurveyModel, Node 시험에서는 module.exports. DOM 을 쓰지 않는다.
   수업(03-4)과 같은 값: c = 3 × 10⁵ km/s, H = 70 km/s/Mpc, 1 Mpc ≈ 326만 광년. */
(function (root) {
  'use strict';
  const C = 3e5;              // 빛의 속도 (km/s)
  const H = 70;               // 허블 상수 (km/s/Mpc) — 교과서 121쪽 확인 문제 3
  const LY_PER_MPC = 3.26e6;  // 1 pc ≈ 3.26광년 → 1 Mpc ≈ 326만 광년
  const DEG = Math.PI / 180;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const roundTo = (v, d) => { const k = 10 ** d; return Math.round(v * k) / k + 0; };

  // ── ① 파장 → ② 적색 편이 → ③ 후퇴 속도 → ④ 거리 ─────────────────────
  // 4차시의 시선 속도 식 v/c = (λ − λ₀)/λ₀ 에서 오른쪽 부분을 적색 편이 z 라고 부른다.
  const redshift = (lambda, lambda0) => (lambda - lambda0) / lambda0;
  const observedWavelength = (lambda0, z) => lambda0 * (1 + z);
  const velocityFromZ = z => C * z;              // v = c × z
  const zFromVelocity = v => v / C;
  const distanceFromVelocity = v => v / H;       // v = H × d → d = v ÷ H
  const distanceFromZ = z => C * z / H;
  const zFromDistance = d => H * d / C;
  const lightYears = mpc => mpc * LY_PER_MPC;

  // 손으로 푸는 순서와 같은 반올림: 읽은 파장 → z(소수 넷째 자리) → v → d
  function measureSteps(lambda0, lambda, lambdaDigits) {
    const ld = lambdaDigits === undefined ? 1 : lambdaDigits;
    const lam = roundTo(lambda, ld);
    const dl = roundTo(lam - lambda0, ld);
    const z = roundTo(dl / lambda0, 4);
    const v = Math.round(C * z);
    const d = v / H;
    return {lambda0, lambda: lam, dl, z, v, d, ly: lightYears(d), approaching: v < 0};
  }

  // ── 표준 분광선 (기준 파장, nm) ───────────────────────────────────
  const LINES = [
    {id: 'K', name: 'Ca Ⅱ K', element: '칼슘', rest: 393.4},
    {id: 'H', name: 'Ca Ⅱ H', element: '칼슘', rest: 396.8},
    {id: 'Hb', name: 'Hβ', element: '수소', rest: 486.1},
    {id: 'O3', name: '[O Ⅲ]', element: '산소', rest: 500.7},
    {id: 'Mg', name: 'Mg', element: '마그네슘', rest: 517.5},
    {id: 'Na', name: 'Na', element: '나트륨', rest: 589.3},
    {id: 'Ha', name: 'Hα', element: '수소', rest: 656.3}
  ];
  const lineById = id => LINES.find(l => l.id === id);
  // 은하 종류에 따른 모의 스펙트럼. amp < 0 이면 흡수선(깊이), > 0 이면 방출선(높이).
  // 붉은 은하: 늙은 별이 많아 흡수선이 뚜렷하다. 푸른 은하: 별이 생기는 가스가 많아 방출선이 뚜렷하다.
  const SPECTRA = {
    red: {kind: 'red', label: '흡수선', continuum: 'red', marked: ['K', 'H', 'Mg', 'Na'],
      lines: [['K', -0.52, 1.1], ['H', -0.46, 1.1], ['Hb', -0.08, 1.0], ['Mg', -0.3, 1.5], ['Na', -0.26, 1.2], ['Ha', -0.08, 1.0]]},
    blue: {kind: 'blue', label: '방출선', continuum: 'blue', marked: ['Hb', 'O3', 'Ha'],
      lines: [['K', -0.13, 1.1], ['H', -0.1, 1.1], ['Hb', 0.55, 0.8], ['O3', 0.85, 0.8], ['Ha', 1.45, 0.9]]}
  };
  // 문제용 스펙트럼: 기준 파장 하나만 있는 흡수선 (학습지 Q2: 500 nm, 안드로메다은하: Hα 656.3 nm)
  function singleLineSpectrum(rest, name, sigma) {
    return {kind: 'single', label: '흡수선', continuum: 'flat', marked: ['X'], lines: [['X', -0.62, sigma || 0.9]], custom: {id: 'X', name: name || '흡수선', element: '', rest}};
  }
  const specLine = (spec, id) => (spec.custom && spec.custom.id === id ? spec.custom : lineById(id));
  function continuum(l, kind) {
    if (kind === 'red') {
      const brk = 0.42 + 0.58 / (1 + Math.exp(-(l - 400) / 4));          // 400 nm 근처에서 밝기가 뚝 떨어짐
      return brk * (0.86 + 0.24 * clamp((l - 400) / 300, 0, 1.3));
    }
    if (kind === 'blue') return (1.02 - 0.26 * clamp((l - 370) / 400, 0, 1.2)) * (0.9 + 0.1 / (1 + Math.exp(-(l - 400) / 5)));
    return 0.82;
  }
  // 정지한 광원에서 잰 상대 세기(기준 스펙트럼)
  function restFlux(l, spec) {
    const base = continuum(l, spec.continuum);
    let f = base;
    for (const [id, amp, sigma] of spec.lines) {
      const g = Math.exp(-0.5 * ((l - specLine(spec, id).rest) / sigma) ** 2);
      if (amp < 0) f *= 1 + amp * g; else f += amp * g * 0.6;
    }
    return f;
  }
  // 적색 편이 z 로 멀어지는 은하에서 관측한 세기: 모든 파장이 (1 + z) 배로 늘어난다.
  const observedFlux = (lambda, z, spec) => restFlux(lambda / (1 + z), spec);
  // 끌어 놓은 표시가 가까운 선(관측 파장 기준 tol nm 안)에 자석처럼 붙는다.
  function snapToLine(lambda, z, spec, tol) {
    let best = null;
    for (const id of spec.marked) {
      const at = observedWavelength(specLine(spec, id).rest, z), gap = Math.abs(at - lambda);
      if (gap <= tol && (!best || gap < best.gap)) best = {id, lambda: at, gap};
    }
    return best;
  }

  // ── 쐐기 지도 ─────────────────────────────────────────────────
  // 꼭짓점 = 우리은하. 적경이 클수록 왼쪽(하늘을 올려다볼 때처럼), 꼭짓점에서 멀수록 적색 편이(거리)가 크다.
  function wedgeXY(ra, r, raMid) {
    const t = (90 + ra - raMid) * DEG;
    return {x: r * Math.cos(t), y: r * Math.sin(t)};
  }
  function wedgePolar(x, y, raMid) {
    return {ra: Math.atan2(y, x) / DEG - 90 + raMid, r: Math.hypot(x, y)};
  }
  // 두 은하 사이의 거리 (Mpc): 같은 쐐기 평면 위에서
  function separationMpc(ra1, z1, ra2, z2) {
    const a = wedgeXY(ra1, distanceFromZ(z1), 180), b = wedgeXY(ra2, distanceFromZ(z2), 180);
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  // ── 자료 풀기 (redshift-survey-data.js 의 정수 배열) ──────────────────
  function decodeSurvey(raw) {
    const n = raw.n, ra = new Float64Array(n), dec = new Float64Array(n), z = new Float64Array(n);
    const gr = raw.gr ? new Float64Array(n) : null;
    let acc = 0;
    for (let i = 0; i < n; i++) {
      acc += raw.ra[i];
      ra[i] = raw.raOrigin + acc / raw.raScale;
      dec[i] = raw.dec[i] / raw.decScale;
      z[i] = raw.z[i] / raw.zScale;
      if (gr) gr[i] = raw.gr[i] / raw.grScale;
    }
    return {id: raw.id, name: raw.name, fullName: raw.fullName, n, ra, dec, z, gr,
      raMin: raw.raMin, raMax: raw.raMax, decMin: raw.decMin, decMax: raw.decMax, zMax: raw.zMax, featured: raw.featured || []};
  }
  // 붉은 은하(늙은 별이 많은 은하): 같은 은하라도 멀수록 g − r 이 커 보이므로 기준을 적색 편이에 따라 올린다.
  const redLimit = z => 0.68 + 2.3 * z;
  const isRed = (gr, z) => gr > redLimit(z);

  // 같은 seed 는 같은 순서 (적색 편이를 재는 순서 흉내)
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
  function measurementOrder(n, seed) {
    const order = new Uint32Array(n), r = rng(seed);
    for (let i = 0; i < n; i++) order[i] = i;
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = order[i]; order[i] = order[j]; order[j] = t; }
    return order;
  }
  function ranksOf(order) {
    const rank = new Uint32Array(order.length);
    for (let k = 0; k < order.length; k++) rank[order[k]] = k;
    return rank;
  }
  // 적색 편이 분포 (몇 개씩 있는지)
  function zHistogram(survey, z0, z1, bins) {
    const h = new Array(bins).fill(0), w = (z1 - z0) / bins;
    for (let i = 0; i < survey.n; i++) { const b = Math.floor((survey.z[i] - z0) / w); if (b >= 0 && b < bins) h[b]++; }
    return h;
  }

  // ── 수업 결과 슬라이드(28번)의 표시: _제작소스/fig/maps.py 와 같은 값 (적경 °, 적색 편이) ──
  const LESSON_MARKS = {
    wall: [[209, 0.087], [200, 0.083], [190, 0.082], [180, 0.080], [172, 0.077], [165, 0.075], [160, 0.074]],
    wallHalfWidth: 0.0068,
    clusters: [[170.5, 0.073], [153.5, 0.046], [200.0, 0.109], [150.5, 0.088]],
    clusterRadius: 0.0046,
    filaments: [[[205, 0.0478], [193, 0.0478], [181, 0.0478]], [[163, 0.066], [156, 0.0637], [149, 0.062], [142, 0.060]]],
    voids: [[186, 0.058, 0.0075], [176.5, 0.091, 0.0055], [212.5, 0.066, 0.0055]]
  };
  // 은하 장성 띠의 가운데 적색 편이 (적경에 따라 선형 보간)
  function wallCenterZ(ra) {
    const w = LESSON_MARKS.wall;
    if (ra >= w[0][0]) return w[0][1];
    for (let i = 1; i < w.length; i++) {
      if (ra >= w[i][0]) { const [a0, z0] = w[i], [a1, z1] = w[i - 1]; return z0 + (z1 - z0) * (ra - a0) / (a1 - a0); }
    }
    return w[w.length - 1][1];
  }

  // ── 쐐기 지도 위 원 안의 은하 (탐구 1: 은하단, 탐구 2: 보이드) ───────────────
  // 반지름 radius 는 쐐기 평면에서 적색 편이 단위 (수업 지도와 같다). accept(i) 로 셀 은하를 고를 수 있다(예: 이미 잰 은하만).
  function circleStats(survey, ra0, z0, radius, accept) {
    const c = wedgeXY(ra0, z0, 180), r2 = radius * radius;
    let n = 0, red = 0, zs = 0, zz = 0, zMin = Infinity, zMax = -Infinity;
    for (let i = 0; i < survey.n; i++) {
      const z = survey.z[i];
      if (Math.abs(z - z0) > radius || (accept && !accept(i))) continue;
      const p = wedgeXY(survey.ra[i], z, 180);
      if ((p.x - c.x) ** 2 + (p.y - c.y) ** 2 > r2) continue;
      n++; zs += z; zz += z * z;
      if (z < zMin) zMin = z; if (z > zMax) zMax = z;
      if (survey.gr && isRed(survey.gr[i], z)) red++;
    }
    const mean = n ? zs / n : z0;
    return {n, red, zMean: mean, zStd: n > 1 ? Math.sqrt(Math.max(0, zz / n - mean * mean)) : 0, zMin, zMax};
  }
  // 분석 영역(적색 편이 zMin~zMax)의 평균 은하 수 (쐐기 평면의 넓이 1 Mpc² 당)
  function meanSurfaceDensity(survey, zMin, zMax) {
    let n = 0;
    for (let i = 0; i < survey.n; i++) if (survey.z[i] >= zMin && survey.z[i] <= zMax) n++;
    const d0 = distanceFromZ(zMin), d1 = distanceFromZ(zMax);
    const area = 0.5 * (survey.raMax - survey.raMin) * DEG * (d1 * d1 - d0 * d0);
    return n / area;
  }

  // ── 밀도와 부피: 같은 크기의 칸으로 나누어 은하 세기 ────────────────────────
  // 적색 편이 0.1 까지는 '멀수록 띠가 두꺼워지는 효과'와 '먼 곳의 어두운 은하가 빠지는 효과'가 거의 비겨
  // 쐐기 평면 위 점의 밀도를 그대로 비교할 수 있다(자료로 확인: 30 Mpc 구간마다 평균 밀도가 크게 변하지 않음).
  const DENSITY_REGION = {zMin: 0.005, zMax: 0.1};
  function densityCells(survey, size, opts) {
    const o = Object.assign({zMin: DENSITY_REGION.zMin, zMax: DENSITY_REGION.zMax, minFrac: 0.7, sub: 6}, opts || {});
    const dMin = distanceFromZ(o.zMin), dMax = distanceFromZ(o.zMax);
    const half = Math.max(Math.abs(survey.raMin - 180), Math.abs(survey.raMax - 180));
    const nx = Math.ceil(dMax * Math.sin(half * DEG) / size) + 1, ny = Math.ceil(dMax / size);
    const inside = (x, y) => {
      const r = Math.hypot(x, y);
      if (r < dMin || r > dMax) return false;
      const ra = Math.atan2(y, x) / DEG - 90 + 180;
      return ra >= survey.raMin && ra <= survey.raMax;
    };
    const map = new Map(), cells = [];
    for (let j = 0; j < ny; j++) for (let i = -nx; i < nx; i++) {
      let inn = 0;
      for (let a = 0; a < o.sub; a++) for (let b = 0; b < o.sub; b++)
        if (inside((i + (a + 0.5) / o.sub) * size, (j + (b + 0.5) / o.sub) * size)) inn++;
      const frac = inn / (o.sub * o.sub);
      if (frac >= o.minFrac) { const c = {i, j, x0: i * size, y0: j * size, size, frac, n: 0, expected: 0, rho: 0}; map.set(i + ',' + j, c); cells.push(c); }
    }
    for (let k = 0; k < survey.n; k++) {
      const z = survey.z[k];
      if (z < o.zMin || z > o.zMax) continue;
      const p = wedgeXY(survey.ra[k], distanceFromZ(z), 180);
      if (!inside(p.x, p.y)) continue;
      const c = map.get(Math.floor(p.x / size) + ',' + Math.floor(p.y / size));
      if (c) c.n++;
    }
    let area = 0, total = 0;
    for (const c of cells) { area += c.frac * size * size; total += c.n; }
    const sigma = area ? total / area : 0;   // 칸들 전체의 평균 = '우주 평균'
    for (const c of cells) { c.expected = sigma * c.frac * size * size; c.rho = c.expected ? c.n / c.expected : 0; }
    return {size, cells, sigma, total, area, zMin: o.zMin, zMax: o.zMax};
  }
  const DENSITY_EDGES = [0, 0.25, 0.5, 1, 2, 4, Infinity];
  // 밀도 구간마다 부피(칸 넓이)와 은하 수가 차지하는 비율
  function densityShares(grid, edges) {
    const e = edges || DENSITY_EDGES, bins = [];
    for (let k = 0; k < e.length - 1; k++) bins.push({lo: e[k], hi: e[k + 1], vol: 0, gal: 0, cells: 0});
    let W = 0, N = 0;
    for (const c of grid.cells) {
      W += c.frac; N += c.n;
      const b = bins.find(q => c.rho >= q.lo && c.rho < q.hi);
      b.vol += c.frac; b.gal += c.n; b.cells++;
    }
    for (const b of bins) { b.vol = W ? b.vol / W : 0; b.gal = N ? b.gal / N : 0; }
    return bins;
  }
  function shareWhere(grid, test) {
    let w = 0, n = 0, W = 0, N = 0;
    for (const c of grid.cells) { W += c.frac; N += c.n; if (test(c.rho)) { w += c.frac; n += c.n; } }
    return {vol: W ? w / W : 0, gal: N ? n / N : 0};
  }
  // 부피로 가중한 분위수 (q = 0.1 → 칸 부피의 10 % 가 이 값보다 성기다)
  function weightedQuantile(grid, q) {
    const list = grid.cells.map(c => [c.rho, c.frac]).sort((a, b) => a[0] - b[0]);
    const W = list.reduce((s, x) => s + x[1], 0);
    let acc = 0;
    for (const [rho, w] of list) { acc += w; if (acc >= q * W) return rho; }
    return list.length ? list[list.length - 1][0] : 0;
  }
  // 칸 크기를 키우면 밀도가 평균(1) 가까이 모인다 — 교과서 117쪽: 약 70 Mpc보다 큰 규모에서는 통계적으로 비슷
  function spreadBySize(survey, sizes, opts) {
    return sizes.map(size => {
      const g = densityCells(survey, size, opts);
      const rhos = g.cells.map(c => c.rho);
      const W = g.cells.reduce((s, c) => s + c.frac, 0);
      const mean = g.cells.reduce((s, c) => s + c.frac * c.rho, 0) / W;
      const sd = Math.sqrt(g.cells.reduce((s, c) => s + c.frac * (c.rho - mean) ** 2, 0) / W);
      return {size, cells: g.cells.length, p10: weightedQuantile(g, 0.1), p50: weightedQuantile(g, 0.5), p90: weightedQuantile(g, 0.9),
        min: Math.min(...rhos), max: Math.max(...rhos), sd, near: shareWhere(g, r => r >= 0.5 && r < 1.5).vol};
    });
  }

  // ── 은하들의 집단 (교과서 114~115쪽, 수업 5~9번 슬라이드) ─────────────────────
  const GROUP_FACTS = {
    milkyWay: {diameterLy: 1e5},
    localGroup: {diameterMpc: 3, smallGalaxies: 80, m31Mpc: 0.77},
    cluster: {sizeMpc: 10, members: '수백~수천', virgoCount: 2000, virgoDistanceMpc: 16},
    supercluster: {laniakeaMpc: 160, laniakeaCount: 1e5, laniakeaYear: 2014},
    wall: {z: 0.07, lengthMpc: 400, lengthLy: 14e8}
  };
  // 우주가 a 배로 팽창할 때: 자체 중력으로 묶인 은하군·은하단은 크기가 그대로,
  // 강하게 묶여 있지 않은 초은하단은 팽창을 따라 커진다(교과서 115쪽). 그림은 이 규칙만 따르는 단순한 모형이다.
  function expansionScene(seed) {
    const r = rng(seed || 7), systems = [];
    // [이름, 종류, 중심(초은하단 중심 기준, 단위 Mpc), 반지름 Mpc, 은하 수]
    const plan = [['국부 은하군', 'group', [-46, -22], 1.6, 7], ['은하단 A', 'cluster', [12, 14], 5, 34],
      ['은하단 B', 'cluster', [44, -26], 4.2, 26], ['은하군', 'group', [-14, 34], 1.5, 6], ['은하군', 'group', [30, 42], 1.4, 5]];
    for (const [name, kind, c, rad, count] of plan) {
      const members = [];
      for (let k = 0; k < count; k++) {
        const rr = rad * (k === 0 ? 0 : 0.25 + 0.75 * Math.sqrt(r()));
        members.push({r: rr, phase: r() * 2 * Math.PI, speed: (0.6 + 0.8 * r()) * (r() < 0.5 ? -1 : 1) / Math.max(0.6, Math.sqrt(rr || 1)), big: k === 0});
      }
      systems.push({name, kind, cx: c[0], cy: c[1], radius: rad, members});
    }
    const field = [];
    for (let k = 0; k < 26; k++) {
      const t = r(), a = systems[Math.floor(r() * systems.length)], b = systems[Math.floor(r() * systems.length)];
      field.push({x: a.cx + (b.cx - a.cx) * t + (r() - 0.5) * 12, y: a.cy + (b.cy - a.cy) * t + (r() - 0.5) * 12});
    }
    return {systems, field};
  }
  // 묶인 계의 중심은 팽창을 따라 멀어지지만, 그 안의 은하들은 같은 반지름으로 돈다.
  function scenePositions(scene, a, t) {
    const out = [];
    for (const s of scene.systems) {
      const cx = s.cx * a, cy = s.cy * a;
      for (const m of s.members) out.push({x: cx + m.r * Math.cos(m.phase + m.speed * t), y: cy + m.r * Math.sin(m.phase + m.speed * t), system: s, big: m.big});
    }
    for (const f of scene.field) out.push({x: f.x * a, y: f.y * a, system: null});
    return out;
  }
  function extent(points) {
    let best = 0;
    for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++)
      best = Math.max(best, Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y));
    return best;
  }

  // ── 글자로 바꾸기 ────────────────────────────────────────────
  function sig(v, n) {
    const p = +(+v).toPrecision(n || 2);
    return Math.abs(p) >= 1000 ? Math.round(p).toLocaleString('ko-KR') : String(p);
  }
  // 1 Mpc ≈ 326만 광년으로 바꿔 '약 9.8억 광년'처럼
  function lyText(mpc) {
    const ly = Math.abs(lightYears(mpc));
    if (ly >= 1e8) return `약 ${sig(ly / 1e8, 2)}억 광년`;
    if (ly >= 1e4) return `약 ${sig(ly / 1e4, 2)}만 광년`;
    return `약 ${sig(ly, 2)}광년`;
  }
  // 음수는 수학 기호 − 로
  function num(v, d) {
    const s = Math.abs(v).toFixed(d === undefined ? 2 : d);
    return (v < 0 && +s !== 0 ? '−' : '') + s;
  }

  const api = {C, H, LY_PER_MPC, clamp, roundTo, redshift, observedWavelength, velocityFromZ, zFromVelocity,
    distanceFromVelocity, distanceFromZ, zFromDistance, lightYears, measureSteps,
    LINES, lineById, SPECTRA, singleLineSpectrum, specLine, continuum, restFlux, observedFlux, snapToLine,
    wedgeXY, wedgePolar, separationMpc, decodeSurvey, redLimit, isRed, rng, measurementOrder, ranksOf, zHistogram,
    LESSON_MARKS, wallCenterZ, circleStats, meanSurfaceDensity,
    DENSITY_REGION, densityCells, DENSITY_EDGES, densityShares, shareWhere, weightedQuantile, spreadBySize,
    GROUP_FACTS, expansionScene, scenePositions, extent, sig, lyText, num};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RedshiftSurveyModel = api;
})(typeof window !== 'undefined' ? window : this);
