/* 별의 공간 운동 — 계산 모형 (교과서 66~71쪽, 수업 활동지 2-2-2).
   브라우저에서는 window.StarMotionModel, Node(테스트)에서는 module.exports. DOM은 쓰지 않는다. */
(function (root) {
  'use strict';
  const DEG = Math.PI / 180;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const round = (v, d = 0) => Math.round(v * 10 ** d) / 10 ** d;

  // ── 고유 운동과 접선 속도 (교과서 67쪽) ─────────────────────────────
  // ① 거리 1 pc에서 각 1″ = 길이 1 AU (파섹의 정의) → μ[″/년] × r[pc] = 1년 동안 간 거리[AU]
  // ② 1 AU/년 = 1.496 × 10⁸ km ÷ 3.156 × 10⁷ s ≈ 4.74 km/s
  const AU_KM = 1.496e8, YEAR_S = 3.156e7;
  const auPerYear = (au = AU_KM, yr = YEAR_S) => au / yr;
  const K = 4.74;                                  // 교과서: Vt ≒ 4.74μr [km/s]
  const travelAU = (mu, r) => mu * r;              // 1년 동안 간 거리 (AU)
  const tangentialVelocity = (mu, r) => K * mu * r;
  const properMotion = (vt, r) => vt / (K * r);
  const PC_LY = 3.26;                              // 1 pc ≈ 3.26광년
  const MOON_ARCSEC = 1800;                        // 보름달 지름 약 0.5° = 1800″

  // ── 사진 속 별의 자리 (고유 운동) ──────────────────────────────────
  // 자료의 기준 시각(2016.0)에서 고유 운동만큼 곧게 옮긴다. x: 동쪽 +, y: 북쪽 + (단위 ″)
  // 해마다 같은 달에 찍은 사진끼리 비교하므로 연주 시차에 의한 흔들림은 넣지 않는다.
  const yearOf = (year, month = 7) => year + (month - 0.5) / 12;
  function fieldStar(row) {
    return {x: row[0], y: row[1], pmx: row[2], pmy: row[3], g: row[4], bprp: row[5]};
  }
  function positionAt(star, year, epoch = 2016) {
    const dt = year - epoch;
    return {x: star.x + star.pmx / 1000 * dt, y: star.y + star.pmy / 1000 * dt};
  }
  // 바너드별: 2016.0년 자리를 원점으로 둔다.
  function barnardAt(B, year) {
    return positionAt({x: 0, y: 0, pmx: B.pmra, pmy: B.pmdec}, year, B.epoch);
  }
  const totalProperMotion = (pmra, pmdec) => Math.hypot(pmra, pmdec) / 1000;   // ″/년
  const separation = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
  const properMotionFromPhotos = (sep, years) => sep / years;
  // 별의 색지수(bp − rp)로 고른 그림 색과 등급에 따른 점 크기 (사진처럼 보이게 하는 표현)
  function starColor(bprp) {
    const stops = [[0.2, [190, 214, 255]], [0.8, [250, 250, 255]], [1.4, [255, 236, 200]], [2.0, [255, 205, 150]], [2.8, [255, 160, 105]]];
    const b = clamp(bprp, stops[0][0], stops[stops.length - 1][0]);
    let i = 0;
    while (i < stops.length - 2 && b > stops[i + 1][0]) i++;
    const [b0, c0] = stops[i], [b1, c1] = stops[i + 1], f = (b - b0) / (b1 - b0);
    return `rgb(${c0.map((c, k) => Math.round(c + (c1[k] - c) * f)).join(',')})`;
  }
  const dotRadius = g => clamp(0.95 + 0.5 * (18.6 - g), 0.95, 7.6);

  // ── 시선 속도 (교과서 68쪽) ───────────────────────────────────────
  // Vr / c = (λ − λ₀) / λ₀ → Vr = c × (λ − λ₀) / λ₀.  λ₀: 정지 상태의 파장(기출: 기준 파장), λ: 관측 파장
  const C_KMS = 3e5;                               // 활동지·교과서 풀이의 빛의 속도 3 × 10⁵ km/s
  const radialVelocity = (lam, lam0, c = C_KMS) => c * (lam - lam0) / lam0;
  const observedWavelength = (vr, lam0, c = C_KMS) => lam0 * (1 + vr / c);
  // + 멀어짐(적색 편이), − 다가옴(청색 편이)
  const shiftOf = (vr, eps = 1e-9) => vr > eps ? 'red' : vr < -eps ? 'blue' : 'none';
  // 흡수선 하나의 모양 (가우스 꼴로 단순화한 그림)
  const lineProfile = (lam, center, depth = 0.62, width = 0.035) => 1 - depth * Math.exp(-(((lam - center) / width) ** 2));
  // 그림 띠에 그릴 흡수선 자리 (nm): 수소·나트륨·마그네슘·철 등 실제 별빛에 나타나는 선
  const SPECTRUM_LINES = [410.2, 434.0, 438.4, 486.1, 517.3, 527.0, 589.3, 656.3];

  // ── 공간 속도 (교과서 68쪽) ───────────────────────────────────────
  const spaceVelocity = (vt, vr) => Math.hypot(vt, vr);
  // θ: 시선 방향(관측자 → 별, 그 연장)과 공간 운동 방향 사이의 각. tan θ = Vt / Vr (0° ~ 180°)
  const thetaDeg = (vt, vr) => Math.atan2(vt, vr) / DEG;
  // 관측자(태양)를 원점으로 한 평면에서 별의 자리 (sx, sy)와 공간 속도 (vx, vy)를 두 성분으로 나눈다.
  function decompose(sx, sy, vx, vy) {
    const d = Math.hypot(sx, sy), ux = sx / d, uy = sy / d;
    const vr = vx * ux + vy * uy;                  // 시선 속도 (+ 멀어짐)
    const rx = vr * ux, ry = vr * uy;              // 시선 속도 화살표
    const tx = vx - rx, ty = vy - ry;              // 접선 속도 화살표 = 공간 속도 − 시선 속도
    const vt = Math.hypot(tx, ty);
    return {ux, uy, vr, vt, v: Math.hypot(vx, vy), rx, ry, tx, ty, theta: thetaDeg(vt, vr)};
  }
  // 공간 속도 방향으로 곧게 간다면 태양에 가장 가까워질 때의 거리(pc)와 걸리는 시간(년)
  const PC_PER_KMS_YEAR = 1 / 977792;             // 1 km/s로 1년 가면 약 1.02 × 10⁻⁶ pc
  function closestApproach(r, vt, vr) {
    const v = Math.hypot(vt, vr);
    if (vr >= 0 || v === 0) return {rMin: r, years: 0};
    return {rMin: r * vt / v, years: r * (-vr) / (v * v) / PC_PER_KMS_YEAR};
  }

  // ── 3차원 벡터 ───────────────────────────────────────────────
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = a => Math.hypot(a[0], a[1], a[2]);
  const unit = a => mul(a, 1 / norm(a));

  // ── 북두칠성: 위치·고유 운동·연주 시차·시선 속도로 3차원 운동 (수업 dipper_data.py와 같은 방법) ──
  // 적도 좌표계: x축 춘분점, z축 천구 북극. 위치 pc, 속도 pc/년.
  const KMS_TO_PC_PER_YEAR = PC_PER_KMS_YEAR;
  function starState(ra, dec, pmra, pmdec, plx, rv) {
    const a = ra * DEG, d = dec * DEG, r = 1000 / plx;
    const u = [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)];
    const e = [-Math.sin(a), Math.cos(a), 0];
    const n = [-Math.sin(d) * Math.cos(a), -Math.sin(d) * Math.sin(a), Math.cos(d)];
    const kv = 4.74047 * r / 1000;                 // 고유 운동 1 mas/년 → 접선 속도 (km/s)
    const v = add(add(mul(e, pmra * kv), mul(n, pmdec * kv)), mul(u, rv));
    return {P: mul(u, r), V: mul(v, KMS_TO_PC_PER_YEAR), r, vt: Math.hypot(pmra, pmdec) * kv, vr: rv};
  }
  const dipperStates = rows => rows.map(s => starState(s[3], s[4], s[5], s[6], s[7], s[8]));
  const stateAt = (s, t) => add(s.P, mul(s.V, t));
  // 하늘 그림의 기준: 세 축 E(동), N(북), c(시선). c는 점들의 평균 방향.
  function skyFrame(points) {
    const c = unit(points.reduce((m, p) => add(m, unit(p)), [0, 0, 0]));
    const ra0 = Math.atan2(c[1], c[0]), de0 = Math.asin(c[2]);
    return {
      c, ra0: ra0 / DEG, de0: de0 / DEG,
      E: [-Math.sin(ra0), Math.cos(ra0), 0],
      N: [-Math.sin(de0) * Math.cos(ra0), -Math.sin(de0) * Math.sin(ra0), Math.cos(de0)]
    };
  }
  // 지구에서 본 하늘(접평면 투영). x: 서쪽 + (동쪽이 왼쪽), y: 북쪽 +. 단위는 중심 근처의 각(°).
  function gnomonic(P, f) {
    const u = unit(P), w = dot(u, f.c);
    return [-dot(u, f.E) / w / DEG, dot(u, f.N) / w / DEG];
  }
  // 시간 t(년)일 때 일곱 별을 지구에서 본 자리. frame은 지금(t = 0) 기준으로 고정한다.
  function dipperSky(states, t, frame) {
    const f = frame || skyFrame(states.map(s => s.P));
    return states.map(s => gnomonic(stateAt(s, t), f));
  }
  // 두 시각 사이 하늘에서 움직인 양 (°) — 화살표용
  function skyMotion(states, t0, t1, frame) {
    const a = dipperSky(states, t0, frame), b = dipperSky(states, t1, frame);
    return a.map((p, i) => [b[i][0] - p[0], b[i][1] - p[1]]);
  }
  const angleBetween2D = (a, b) => Math.acos(clamp((a[0] * b[0] + a[1] * b[1]) / (Math.hypot(...a) * Math.hypot(...b)), -1, 1)) / DEG;

  // ── 교과서 70쪽 표: 거리와 입체 보기 ─────────────────────────────────
  const distancePc = (x, y, z) => Math.hypot(x, y, z);
  const pcToLy = pc => pc * PC_LY;
  // 입체 보기 카메라. 기준점(target, 없으면 무리의 중심)을 가운데 두고 돈다.
  // yaw = pitch = 0이면 카메라가 지구(원점)에 있어 지구에서 본 하늘과 똑같이 보인다.
  // 지구 자리에서 벗어날수록 멀리 물러나(dolly) 3차원 계산기처럼 거의 평행하게 내려다본다.
  function viewFrame(points, target) {
    const C = target || mul(points.reduce((m, p) => add(m, p), [0, 0, 0]), 1 / points.length);
    const f = skyFrame([C]);
    return {C, R0: norm(C), c: f.c, E: f.E, N: f.N, W: mul(f.E, -1)};
  }
  const ease = x => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);
  function camera(yaw, pitch, vf, dolly = 5) {
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    const b3 = mul(vf.c, -1), b1 = vf.W, b2 = vf.N;      // b3: 기준점 → 지구 방향
    const e = add(mul(add(mul(b3, cy), mul(b1, sy)), cp), mul(b2, sp));
    const off = Math.acos(clamp(cp * cy, -1, 1));
    const R = vf.R0 * (1 + dolly * ease(off / (45 * DEG)));
    const pos = add(vf.C, mul(e, R));
    const fwd = mul(e, -1);
    const right = add(mul(b3, -sy), mul(b1, cy));
    const up = cross(right, fwd);
    return {pos, fwd, right, up, R, off: off / DEG};
  }
  // 카메라 화면 좌표 (접평면, 단위 없음: 1 = 45°). depth ≤ 0이면 카메라 뒤.
  function viewProject(P, cam) {
    const q = sub(P, cam.pos), depth = dot(q, cam.fwd);
    return {x: dot(q, cam.right) / depth, y: dot(q, cam.up) / depth, depth};
  }

  // ── 기출형 연습: 공간 속도·접선 속도 화살표로 시선 속도 화살표 고르기 ──
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
  // 화면 좌표(y 아래 +)로 만든다. 태양 → 별 방향 u, 접선 방향 t.
  function makeQuiz(seed) {
    const r = rng(seed);
    const phi = (20 + 320 * r()) * DEG;                  // 별이 있는 방향
    const ux = Math.cos(phi), uy = -Math.sin(phi);
    const side = r() < 0.5 ? 1 : -1;
    const tx = -uy * side, ty = ux * side;
    const vr = (r() < 0.5 ? -1 : 1) * (45 + 45 * r());   // 시선 속도 (+ 멀어짐)
    const vt = 55 + 45 * r();                            // 접선 속도
    const V = [vr * ux + vt * tx, vr * uy + vt * ty], Vt = [vt * tx, vt * ty], Vr = [vr * ux, vr * uy];
    const opts = [
      {kind: 'right', vec: Vr},
      {kind: 'flip', vec: [-Vr[0], -Vr[1]]},
      {kind: 'tangent', vec: [Math.abs(vr) * tx * -1, Math.abs(vr) * ty * -1]},
      {kind: 'space', vec: V.slice()}
    ];
    for (let i = opts.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [opts[i], opts[j]] = [opts[j], opts[i]]; }
    return {phi: phi / DEG, u: [ux, uy], t: [tx, ty], vr, vt, V, Vt, Vr, options: opts, answer: opts.findIndex(o => o.kind === 'right')};
  }

  const api = {
    DEG, clamp, round, AU_KM, YEAR_S, auPerYear, K, travelAU, tangentialVelocity, properMotion, PC_LY, MOON_ARCSEC,
    yearOf, fieldStar, positionAt, barnardAt, totalProperMotion, separation, properMotionFromPhotos, starColor, dotRadius,
    C_KMS, radialVelocity, observedWavelength, shiftOf, lineProfile, SPECTRUM_LINES,
    spaceVelocity, thetaDeg, decompose, closestApproach, PC_PER_KMS_YEAR,
    add, sub, mul, dot, cross, norm, unit,
    starState, dipperStates, stateAt, skyFrame, gnomonic, dipperSky, skyMotion, angleBetween2D,
    distancePc, pcToLy, viewFrame, camera, viewProject, rng, makeQuiz
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.StarMotionModel = api;
})(typeof window !== 'undefined' ? window : this);
