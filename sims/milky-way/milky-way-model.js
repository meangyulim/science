/* 우리은하 지도 — 계산 모형. 화면(DOM)은 쓰지 않는다.
   브라우저에서는 window.MilkyWayModel, Node(테스트)에서는 module.exports. */
(function (root) {
  'use strict';
  const D2R = Math.PI / 180, R2D = 180 / Math.PI, TAU = 2 * Math.PI, log10 = Math.log10;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  // ── 단위 ──────────────────────────────────────────────────
  const PC_TO_LY = 3.2616;            // 1 pc ≈ 3.26광년
  const AU_IN_PC = 1 / 206265;        // 1 pc = 206265 AU
  const KM_PER_AU = 1.496e8;

  // ── 태양에서 은하 중심까지 (kpc) ──────────────────────────────
  // 교과서 100쪽 탐구 2의 답 약 8 kpc, 수업 슬라이드·지도서 8.5 kpc, 최신 측정 약 8.2 kpc
  const R0 = {textbook: 8, lesson: 8.5, modern: 8.2};

  // ── 등급과 거리 ───────────────────────────────────────────────
  // 거리 지수 m − M = 5 log r − 5 (r 의 단위: pc)
  const modulus = r => 5 * log10(r) - 5;
  const distanceFromModulus = mu => 10 ** ((mu + 5) / 5);
  const apparentMag = (M, r) => M + modulus(r);
  const parallaxArcsec = r => 1 / r;           // r(pc) = 1 / p(″)

  // ── 주기-광도 관계 ────────────────────────────────────────────
  // sims/variables/variables-model.js 의 PL 과 같은 값이다(수업 그래프: 활동지 12쪽·슬라이드 15쪽).
  // 주기 10일에서 종족 Ⅰ −4등급, 종족 Ⅱ −2등급, RR형은 주기와 관계없이 +0.5등급.
  // 두 실험실이 같은 그래프를 쓰도록 값을 바꿀 때는 두 파일을 함께 고친다.
  const PL = {
    pop1: {name: '종족 Ⅰ 세페이드', zero: -1.6, slope: -2.4},
    pop2: {name: '종족 Ⅱ 세페이드', zero: 0.4, slope: -2.4},
    rr:   {name: 'RR형 변광성', flat: 0.5}
  };
  function absMag(kind, period) {
    const c = PL[kind];
    return c.flat !== undefined ? c.flat : c.zero + c.slope * log10(period);
  }

  // ── 탐구 1: 오메가 센타우리의 종족 Ⅱ 세페이드 (교과서 99쪽) ─────────────
  // 교사용 교과서 99쪽 풀이: 최소 → 다음 최소 29일, 최대 밝기 10.43, 최소 밝기 11.46,
  // 평균 10.95, log 29 = 1.46, 그림 6의 종족 Ⅱ 관계에서 M_V = −2.35, 거리 ≒ 4600 pc.
  const OMEGA_GUIDE = {P: 29, logP: 1.46, mBright: 10.43, mFaint: 11.46, mMean: 10.95, M: -2.35, r: 4600, tA: 3.5, tB: 32.5};
  // 평균 겉보기 등급 = (가장 밝을 때 + 가장 어두울 때) ÷ 2. 교과서처럼 0.01등급에서 반올림한다(10.945 → 10.95).
  const meanMag = (a, b) => Math.round((Math.round(a * 100) + Math.round(b * 100)) / 2 + 1e-9) / 100;
  // 표의 자료를 점으로. corrected 이면 오타로 보이는 52.6일 값을 고쳐 쓴다.
  function omegaPoints(omega, corrected) {
    return omega.table.map(([t, m]) => {
      const typo = Math.abs(t - omega.typo.t) < 1e-9;
      return {t, m: typo && corrected ? omega.typo.corrected : m, printed: m, typo};
    });
  }
  // 정답 판정: 손으로 읽은 값이니 범위로 본다.
  // 거리는 교과서 풀이(그림 6에서 M = −2.35 → 약 4.6 kpc)와 이 실험실의 수업 그래프(M ≈ −3.1 → 약 6.5 kpc)를 모두 맞는 답으로 본다.
  const OMEGA_OK = {P: [27, 31], m: [10.85, 11.05], M: [-3.4, -2.2], r: [4000, 7200]};
  function checkOmega(a) {
    const inR = (v, [lo, hi]) => v >= lo && v <= hi;
    const res = {
      pOk: inR(a.P, OMEGA_OK.P), mOk: inR(a.m, OMEGA_OK.m), popOk: a.pop === 'pop2',
      MOk: inR(a.M, OMEGA_OK.M), rOk: inR(a.r, OMEGA_OK.r)
    };
    res.ok = res.pOk && res.mOk && res.popOk && res.MOk && res.rOk;
    return res;
  }
  // 계산 순서: P → M (주기-광도 관계) → m − M → r
  function omegaSolve(P, m, pop, Moverride) {
    const M = Moverride !== undefined ? Moverride : absMag(pop, P);
    const mu = m - M, logr = (mu + 5) / 5;
    return {P, logP: log10(P), M, m, mu, logr, r: 10 ** logr};
  }

  // ── 매끄러운 광도 곡선 (푸리에 급수 맞추기) ──────────────────────────
  // m(t) = a0 + Σ [a_k cos(2πkt/P) + b_k sin(2πkt/P)], 주기 P 도 오차가 가장 작아지는 값으로 찾는다.
  function solveLinear(A, b) {
    const n = b.length, M = A.map((row, i) => [...row, b[i]]);
    for (let c = 0; c < n; c++) {
      let p = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      [M[c], M[p]] = [M[p], M[c]];
      for (let r = 0; r < n; r++) {
        if (r === c) continue;
        const f = M[r][c] / M[c][c];
        for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
      }
    }
    return M.map((row, i) => row[n] / row[i]);
  }
  function fitPeriodic(points, P, H) {
    const basis = t => {
      const v = [1];
      for (let h = 1; h <= H; h++) v.push(Math.cos(TAU * h * t / P), Math.sin(TAU * h * t / P));
      return v;
    };
    const n = 1 + 2 * H, A = Array.from({length: n}, () => new Array(n).fill(0)), b = new Array(n).fill(0);
    for (const p of points) {
      const v = basis(p.t);
      for (let i = 0; i < n; i++) { b[i] += v[i] * p.m; for (let j = 0; j < n; j++) A[i][j] += v[i] * v[j]; }
    }
    const c = solveLinear(A, b);
    const f = t => basis(t).reduce((s, v, i) => s + v * c[i], 0);
    let ss = 0;
    for (const p of points) ss += (f(p.t) - p.m) ** 2;
    return {P, H, c, f, rms: Math.sqrt(ss / points.length)};
  }
  function fitLightCurve(points, opt = {}) {
    const {pMin = 25, pMax = 33, step = 0.01, harmonics = 4} = opt;
    let best = null;
    for (let P = pMin; P <= pMax + 1e-9; P += step) {
      const fit = fitPeriodic(points, P, harmonics);
      if (!best || fit.rms < best.rms) best = fit;
    }
    return best;
  }
  // 곡선의 극대(가장 밝음 = 등급 최소)와 극소(가장 어두움 = 등급 최대)
  function curveExtrema(f, t0, t1, dt = 0.01) {
    const bright = [], faint = [];
    let prev = f(t0 - dt), cur = f(t0);
    for (let t = t0 + dt; t <= t1 + 1e-9; t += dt) {
      const next = f(t);
      if (cur < prev && cur <= next) bright.push({t: t - dt, m: cur});
      if (cur > prev && cur >= next) faint.push({t: t - dt, m: cur});
      prev = cur; cur = next;
    }
    return {bright, faint};
  }
  // 두 커서 사이 시간으로 잰 주기
  const periodBetween = (a, b) => Math.abs(b - a);

  // ── 구상 성단 (탐구 2) ─────────────────────────────────────────
  const clustersFrom = data => data.clusters.map(([id, alt, l, b, r, x, y, z]) => ({id, alt, l, b, r, x, y, z}));
  const dist3 = (p, c) => Math.hypot(p.x - c[0], p.y - c[1], p.z - c[2]);
  function meanPos(cs) {
    const n = cs.length || 1;
    return [cs.reduce((s, c) => s + c.x, 0) / n, cs.reduce((s, c) => s + c.y, 0) / n, cs.reduce((s, c) => s + c.z, 0) / n];
  }
  // 성단이 밀집된 곳의 중심: 지금 중심에서 R 안에 든 성단만 평균 내기를 되풀이한다.
  // 멀리 떨어진 몇 개(최대 125 kpc)가 단순 평균을 끌어당기는 것을 막는다.
  function denseCentre(cs, R = 20, start) {
    let c = start ? start.slice() : meanPos(cs), sel = cs;
    for (let i = 0; i < 100; i++) {
      sel = cs.filter(p => dist3(p, c) <= R);
      const c2 = meanPos(sel);
      const moved = Math.hypot(c2[0] - c[0], c2[1] - c[1], c2[2] - c[2]);
      c = c2;
      if (moved < 1e-9) break;
    }
    return {centre: c, n: sel.length, dist: Math.hypot(c[0], c[1], c[2])};
  }
  const countWithin = (cs, c, R) => cs.filter(p => dist3(p, c) <= R).length;
  // 하늘에서 은하 중심 쪽 반구(X > 0, 곧 은경 −90°~90°)와 반대쪽
  function hemisphere(cs) {
    const toward = cs.filter(p => p.x > 0).length;
    return {toward, away: cs.length - toward};
  }
  // 은하 중심의 가까운 쪽과 먼 쪽에 있는 성단 수 (중심에서 X 방향 ±lim, 옆으로 lim 안)
  function sideCounts(cs, r0 = R0.modern, lim = 8) {
    let near = 0, far = 0;
    for (const p of cs) {
      if (Math.hypot(p.y, p.z) >= lim) continue;
      const dx = p.x - r0;
      if (dx < 0 && dx > -lim) near++;
      else if (dx > 0 && dx < lim) far++;
    }
    return {near, far};
  }
  // 분포의 중심이 태양에 오도록 옮긴다(“태양이 중심이라면?”)
  const shiftedBy = (cs, c) => cs.map(p => ({...p, x: p.x - c[0], y: p.y - c[1], z: p.z - c[2]}));

  // ── 좌표 ─────────────────────────────────────────────────────
  function xyzFromLB(l, b, d) {
    const cl = Math.cos(l * D2R), sl = Math.sin(l * D2R), cb = Math.cos(b * D2R), sb = Math.sin(b * D2R);
    return [d * cb * cl, d * cb * sl, d * sb];
  }
  function lbFromXYZ(x, y, z) {
    let l = Math.atan2(y, x) * R2D;
    if (l < 0) l += 360;
    return {l, b: Math.atan2(z, Math.hypot(x, y)) * R2D, d: Math.hypot(x, y, z)};
  }
  // 하늘 전체 지도(해머 도법). 은경 0°(은하 중심)가 가운데, 은경이 커지면 왼쪽으로 간다(천문 지도 관례).
  // 결과: x ∈ [−2√2, 2√2], y ∈ [−√2, √2]
  function hammer(l, b) {
    let L = ((l + 180) % 360 + 360) % 360 - 180;           // −180 ~ 180
    const lr = L * D2R / 2, br = b * D2R;
    const z = Math.sqrt(1 + Math.cos(br) * Math.cos(lr));
    return {x: -2 * Math.SQRT2 * Math.cos(br) * Math.sin(lr) / z, y: Math.SQRT2 * Math.sin(br) / z};
  }

  // ── 3차원 보기 (정사영) ─────────────────────────────────────────
  // az: Z축 둘레 방위각, el: 은하면 위로 올려 본 각(라디안). 화면 오른쪽 = right, 위 = up, toward = 대상에서 카메라 쪽.
  // az = −90°, el = 0 이면 옆에서(X 오른쪽, Z 위), el = 90° 이면 위에서(X 오른쪽, Y 위) 본다.
  function cameraBasis(az, el) {
    const ca = Math.cos(az), sa = Math.sin(az), ce = Math.cos(el), se = Math.sin(el);
    return {right: [-sa, ca, 0], up: [-se * ca, -se * sa, ce], toward: [ce * ca, ce * sa, se]};
  }
  function project(p, basis, target = [0, 0, 0]) {
    const d0 = p[0] - target[0], d1 = p[1] - target[1], d2 = p[2] - target[2];
    const {right: r, up: u, toward: w} = basis;
    return {x: d0 * r[0] + d1 * r[1] + d2 * r[2], y: d0 * u[0] + d1 * u[1] + d2 * u[2], depth: d0 * w[0] + d1 * w[1] + d2 * w[2]};
  }

  // ── 우리은하 모형 (개념용 점 구름) ──────────────────────────────────
  // 은하 중심 좌표: 중심이 원점, x_g = X − R0 (태양은 x_g = −R0, 방위각 φ = 180°).
  // 은하는 북은극에서 볼 때 시계 방향으로 돈다. 나선팔은 돌아가는 방향의 뒤로 감긴다(끌리는 팔)
  // → φ 가 커질수록 반지름이 커지는 로그 나선 R = Rs·exp(k(φ − 180°)).
  // Rs 는 태양–은하 중심 선(φ = 180°)과 만나는 반지름. 이름은 교과서 그림 5를 따랐고, 모양은 개념도 수준이다.
  const ARMS = [
    {id: 'sct', name: '방패-센타우루스자리 팔', Rs: 5.0, pitch: 12.5, from: 153, to: 470, n: 1000, width: 0.45},
    {id: 'sgr', name: '용골-궁수자리 팔', Rs: 6.7, pitch: 12.5, from: 70, to: 400, n: 760, width: 0.4},
    {id: 'per', name: '페르세우스자리 팔', Rs: 10.0, pitch: 12.5, from: -27, to: 300, n: 1000, width: 0.45},
    {id: 'nor', name: '직각자자리 팔', Rs: 3.4, pitch: 12.5, from: 240, to: 560, n: 760, width: 0.4, outerFrom: 420, outerName: '외곽 팔'},
    {id: 'ori', name: '오리온-백조자리 팔', Rs: 8.25, pitch: 11, from: 150, to: 215, n: 240, width: 0.25},
    {id: 'k3n', name: '3킬로파섹 팔', Rs: 3.3, pitch: 3, from: 95, to: 215, n: 150, width: 0.2},
    {id: 'k3f', name: '3킬로파섹 팔', Rs: 3.6, pitch: 3, from: 275, to: 395, n: 150, width: 0.2, ref: 360}
  ];
  const BAR = {angle: 153, half: 4.0};          // 막대: 가까운 끝이 은경 (+) 쪽(태양에서 보아 Y > 0)
  function armRadius(arm, phiDeg) {
    const ref = arm.ref !== undefined ? arm.ref : 180;
    return arm.Rs * Math.exp(Math.tan(arm.pitch * D2R) * (phiDeg - ref) * D2R);
  }
  function armXYZ(arm, phiDeg, r0 = R0.modern) {
    const R = armRadius(arm, phiDeg);
    return [R * Math.cos(phiDeg * D2R) + r0, R * Math.sin(phiDeg * D2R), 0];
  }
  // 반지름 R 에서 태양–은하 중심 선(φ = 180°)을 지나는 팔: 태양에서 X = r0 − R 인 곳
  function armCrossings(arm, r0 = R0.modern) {
    const out = [];
    for (let phi = 180 - 720; phi <= 180 + 720; phi += 360) {
      if (phi < arm.from || phi > arm.to) continue;
      out.push({phi, R: armRadius(arm, phi), X: r0 - armRadius(arm, phi)});
    }
    return out;
  }

  // 같은 seed 는 같은 결과(관측 자료 흉내가 아닌 모형 그림용)
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
  function gauss(rand) {
    let u = 0;
    while (u === 0) u = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * rand());
  }

  // 점의 종류
  const KIND = {ARM: 0, DISK: 1, BULGE: 2, HALO: 3, STREAM: 4, OPEN: 5, NEBULA: 6, MAGELLAN: 7};
  // 결과: points = [[X, Y, Z, kind], …] (태양 중심 좌표, kpc)
  function generateGalaxy(seed = 7, r0 = R0.modern, satellites = []) {
    const rand = rng(seed), g = () => gauss(rand), pts = [];
    const add = (xg, yg, z, kind) => pts.push([xg + r0, yg, z, kind]);
    // 1) 나선팔: 젊은 별, 산개 성단, 방출 성운
    for (const arm of ARMS) {
      for (let i = 0; i < arm.n; i++) {
        const phi = arm.from + (arm.to - arm.from) * rand();
        const R = armRadius(arm, phi) + g() * arm.width * (0.7 + 0.03 * armRadius(arm, phi));
        if (R > 16) continue;
        const ph = phi * D2R + g() * 0.015;
        add(R * Math.cos(ph), R * Math.sin(ph), g() * 0.09, KIND.ARM);
      }
    }
    for (let i = 0; i < 75; i++) {                 // 산개 성단: 나선팔 근처의 얇은 원반 안
      const arm = ARMS[Math.floor(rand() * 5)];
      const phi = arm.from + (arm.to - arm.from) * rand(), R = armRadius(arm, phi) + g() * 0.5;
      if (R > 15 || R < 3) { i--; continue; }
      add(R * Math.cos(phi * D2R), R * Math.sin(phi * D2R), g() * 0.05, KIND.OPEN);
    }
    for (let i = 0; i < 50; i++) {                 // 방출 성운: 나선팔을 따라
      const arm = ARMS[Math.floor(rand() * 5)];
      const phi = arm.from + (arm.to - arm.from) * rand(), R = armRadius(arm, phi) + g() * 0.25;
      if (R > 14 || R < 3) { i--; continue; }
      add(R * Math.cos(phi * D2R), R * Math.sin(phi * D2R), g() * 0.04, KIND.NEBULA);
    }
    // 2) 원반 전체의 별(지수 원반, 지름 약 30 kpc)
    for (let i = 0; i < 1900; i++) {
      const R = -3 * Math.log(rand() * rand() + 1e-12);
      if (R < 1.5 || R > 15.5) { i--; continue; }
      const ph = TAU * rand();
      add(R * Math.cos(ph), R * Math.sin(ph), g() * 0.16, KIND.DISK);
    }
    // 3) 팽대부: 둥근 중심부 + 막대
    const cb = Math.cos(BAR.angle * D2R), sb = Math.sin(BAR.angle * D2R);
    for (let i = 0; i < 1500; i++) {
      const a = g() * BAR.half * 0.42, w = g() * 0.55, z = g() * 0.45;
      add(a * cb - w * sb, a * sb + w * cb, z, KIND.BULGE);
    }
    for (let i = 0; i < 700; i++) add(g() * 0.75, g() * 0.75, g() * 0.6, KIND.BULGE);
    // 4) 헤일로의 늙은 별: 바깥으로 갈수록 드물다
    for (let i = 0; i < 650; i++) {
      const r = Math.exp(Math.log(2) + rand() * (Math.log(45) - Math.log(2)));
      const u = 2 * rand() - 1, ph = TAU * rand(), s = Math.sqrt(1 - u * u);
      add(r * s * Math.cos(ph), r * s * Math.sin(ph), r * u * 0.85, KIND.HALO);
    }
    // 5) 궁수자리 별 흐름(그림 5): 원반에 거의 수직인 면을 도는 별의 띠(개념용)
    const tilt = 14 * D2R;
    for (let i = 0; i < 320; i++) {
      const th = (0.15 + 0.75 * rand()) * TAU, rr = 30 + 12 * Math.cos(th - 1.0) + g() * 1.6;
      const u = rr * Math.cos(th), v = rr * Math.sin(th);
      add(u, v * Math.sin(tilt) + g() * 1.2, v * Math.cos(tilt), KIND.STREAM);
    }
    // 6) 대·소마젤란은하 (실제 방향과 거리)
    for (const s of satellites) {
      const c = xyzFromLB(s.l, s.b, s.d), n = s.id === 'lmc' ? 420 : 220;
      for (let i = 0; i < n; i++) {
        const a = g() * s.size * 0.42, b = g() * s.size * 0.24, z = g() * s.size * 0.12;
        pts.push([c[0] + a * 0.8 + z * 0.3, c[1] + b + a * 0.25, c[2] + z + a * 0.35, KIND.MAGELLAN]);
      }
    }
    return pts;
  }

  // ── 거리 재는 여러 방법 (교과서 그림 7) ────────────────────────────
  // 범위(pc)는 대략적인 값이다. 관측 기술이 좋아지면 늘어난다(교사용 심화 학습서 그림 6-2와 맞춤).
  const METHODS = [
    {id: 'radar', name: '레이더 이용', short: '레이더', min: 1.2e-8, max: 5e-5, span: '달 ~ 토성 (약 10 AU)',
      measure: '전파를 쏘아 천체에 반사되어 돌아오는 데 걸린 시간',
      relies: '빛(전파)의 빠르기. 왕복한 거리의 절반이 천체까지의 거리',
      range: '태양계 안 (금성·화성 같은 행성)', error: '아주 작다',
      pro: '가장 정확하다', con: '전파가 반사되어 돌아와야 해서 태양계 밖에는 쓸 수 없다'},
    {id: 'parallax', name: '연주 시차', short: '연주 시차', min: 1, max: 6000, groundMax: 100,
      measure: '6개월 간격으로 본 별의 방향 차이의 절반(연주 시차 p)',
      relies: '지구 공전 궤도(1 AU)를 이용한 기하학. 별의 성질은 가정하지 않는다',
      range: '지상 망원경은 약 100 pc(0.01″)까지, 가이아 위성은 수 kpc까지', error: '가까운 별은 1% 안팎, 멀수록 커진다',
      pro: '별에 대한 가정이 거의 없어 다른 방법의 기준이 된다', con: '먼 별은 연주 시차가 너무 작아 잴 수 없다'},
    {id: 'msfit', name: '주계열 맞추기', short: '주계열', min: 30, max: 5e4,
      measure: '성단 별들의 겉보기 등급과 색지수(C-M도)',
      relies: '표준 주계열성의 절대 등급. 겹치도록 옮긴 등급 차 = 거리 지수 m − M',
      range: '우리은하 안의 성단', error: '10% 안팎 (성간 소광·종족 차이를 보정해야 한다)',
      pro: '성단의 별 여러 개를 한꺼번에 써서 믿을 만하다', con: '별 하나하나의 색과 등급을 재야 해서 먼 은하에는 쓰기 어렵다'},
    {id: 'cepheid', name: '세페이드 변광성', short: '세페이드', min: 300, max: 4e7,
      measure: '변광 주기 P와 평균 겉보기 등급 m',
      relies: '주기-광도 관계 (변광성의 종족을 알아야 한다)',
      range: '우리은하 ~ 가까운 외부 은하', error: '5~10% (종족을 잘못 고르면 약 2.5배)',
      pro: '매우 밝아서 연주 시차나 주계열 맞추기보다 먼 거리를 잴 수 있다',
      con: '변광성의 종류(종족)를 명확히 알지 못하면 거리 오차가 크다'},
    {id: 'rr', name: 'RR형 변광성', short: 'RR형', min: 200, max: 1e6,
      measure: '평균 겉보기 등급 m',
      relies: '주기와 관계없이 절대 등급이 약 +0.5로 거의 일정하다',
      range: '우리은하의 구상 성단 ~ 가까운 은하', error: '10% 안팎',
      pro: '구상 성단에 많아서 섀플리가 우리은하 지도를 그리는 데 썼다', con: '세페이드보다 어두워서 먼 은하에는 쓸 수 없다'},
    {id: 'sn1a', name: 'Ia형 초신성', short: 'Ia형', min: 3e6, max: 4e9,
      measure: '가장 밝을 때의 겉보기 등급 m',
      relies: '가장 밝을 때의 절대 등급이 약 −19로 거의 일정하다(표준 광원)',
      range: '먼 외부 은하 (수십억 광년)', error: '5~10%',
      pro: '매우 밝아서 아주 먼 은하까지 잴 수 있다', con: '언제 어디서 터질지 몰라 우연히 발견되어야 한다'},
    {id: 'hubble', name: '허블-르메트르 법칙', short: '허블', min: 1e7, max: 1e10,
      measure: '은하 스펙트럼의 적색 편이',
      relies: '멀리 있는 은하일수록 빠르게 멀어진다는 관계',
      range: '아주 먼 은하와 은하단', error: '10% 안팎',
      pro: '가장 먼 은하까지 잴 수 있다', con: '가까운 은하는 은하 자체의 운동 때문에 쓰기 어렵다'}
  ];
  // 거리(pc). 오메가 센타우리·M3는 Harris(2010) 목록, 은하 중심은 최신 측정값.
  const OBJECTS = [
    {id: 'venus', name: '금성', sub: '가장 가까울 때 약 0.28 AU', r: 0.28 * AU_IN_PC, used: ['radar']},
    {id: 'proxima', name: '프록시마 센타우리', sub: '태양 다음으로 가까운 별 · 연주 시차 0.77″', r: 1.30, used: ['parallax']},
    {id: 'sirius', name: '시리우스', sub: '밤하늘에서 가장 밝은 별', r: 2.64, used: ['parallax']},
    {id: 'pleiades', name: '플레이아데스 성단', sub: '산개 성단 M45 (교과서 95쪽)', r: 136, used: ['parallax', 'msfit']},
    {id: 'omega', name: '오메가 센타우리', sub: '구상 성단 (탐구 1)', r: 5200, used: ['cepheid', 'rr', 'msfit']},
    {id: 'gc', name: '우리은하 중심', sub: '궁수자리 방향 (탐구 2)', r: 8200, used: ['rr', 'cepheid']},
    {id: 'm3', name: 'M3', sub: '구상 성단 (교과서 95쪽)', r: 10200, used: ['rr', 'msfit']},
    {id: 'lmc', name: '대마젤란은하', sub: '우리은하 가까이의 작은 은하', r: 50000, used: ['cepheid', 'rr']},
    {id: 'smc', name: '소마젤란은하', sub: '리비트가 세페이드를 연구한 은하', r: 62000, used: ['cepheid', 'rr']},
    {id: 'm31', name: '안드로메다은하', sub: '1923년 허블이 세페이드로 거리를 잼', r: 770e3, used: ['cepheid']},
    {id: 'virgo', name: '처녀자리 은하단', sub: '가까운 은하단', r: 16.5e6, used: ['cepheid', 'sn1a', 'hubble']},
    {id: 'sloan', name: '슬론 장성', sub: '은하들이 이룬 거대한 벽(우주 거대 구조)', r: 310e6, used: ['hubble']}
  ];
  const reachable = r => METHODS.filter(m => r >= m.min && r <= m.max).map(m => m.id);

  // ── 글자로 나타내기 ────────────────────────────────────────────
  // 음수는 수학 기호 −로
  function num(v, d = 2) {
    const s = Math.abs(v).toFixed(d);
    return (v < 0 && +s !== 0 ? '−' : '') + s;
  }
  // 유효 숫자 n개 (지수 표기 없이)
  const sig = (v, n = 2) => String(Number(Number(v).toPrecision(n)));
  // 광년: 2만 7천 광년처럼 읽기 쉬운 단위로
  function lyText(pc) {
    const ly = pc * PC_TO_LY;
    if (ly >= 1e8) return `약 ${sig(ly / 1e8)}억 광년`;
    if (ly >= 1e4) return `약 ${sig(ly / 1e4)}만 광년`;
    if (ly >= 1) return `약 ${sig(ly)}광년`;
    const minutes = ly * 365.25 * 24 * 60;
    return `약 ${sig(minutes)}광분`;
  }
  function pcText(pc, n = 3) {
    if (pc < 0.01) return `${sig(pc / AU_IN_PC, n)} AU`;
    if (pc < 1000) return `${sig(pc, n)} pc`;
    if (pc < 1e6) return `${sig(pc / 1e3, n)} kpc`;
    return `${sig(pc / 1e6, n)} Mpc`;
  }

  const api = {D2R, R2D, TAU, clamp, PC_TO_LY, AU_IN_PC, KM_PER_AU, R0,
    modulus, distanceFromModulus, apparentMag, parallaxArcsec, PL, absMag,
    OMEGA_GUIDE, OMEGA_OK, meanMag, omegaPoints, checkOmega, omegaSolve,
    solveLinear, fitPeriodic, fitLightCurve, curveExtrema, periodBetween,
    clustersFrom, meanPos, denseCentre, countWithin, hemisphere, sideCounts, shiftedBy,
    xyzFromLB, lbFromXYZ, hammer, cameraBasis, project,
    ARMS, BAR, armRadius, armXYZ, armCrossings, rng, gauss, KIND, generateGalaxy,
    METHODS, OBJECTS, reachable, num, sig, lyText, pcText};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MilkyWayModel = api;
})(typeof window !== 'undefined' ? window : this);
