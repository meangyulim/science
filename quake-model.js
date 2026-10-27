/* 캠퍼스 지진 — 진앙을 찾아라. 화면과 분리한 계산 모형.
   브라우저에서는 window.QuakeModel, Node 에서는 require 로 쓴다 (tests/quake-model.test.cjs).

   축소 지구: 파동 속도를 실제의 1/1000 로 줄여 운동장 안에서 PS시가 몇 초~수십 초가 되게 한다.
   그래서 이 모형의 1 m 는 실제 지구의 1 km 와 같다고 보면 된다 (진도 계산도 그렇게 맞췄다). */
(function(root) {
  'use strict';

  const R_EARTH = 6371008.8;
  const rad = d => d * Math.PI / 180;
  const deg = r => r * 180 / Math.PI;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  // ── 좌표: 위도·경도 ↔ 운동장 평면(동쪽 x, 북쪽 y, 단위 m) ─────────────
  // 수백 m 범위라 등장방형 근사로 충분하다 (오차 1 cm 미만).
  function toLocal(o, p) {
    return {x: rad(p.lon - o.lon) * R_EARTH * Math.cos(rad(o.lat)), y: rad(p.lat - o.lat) * R_EARTH};
  }
  function toLatLon(o, q) {
    return {lat: o.lat + deg(q.y / R_EARTH), lon: o.lon + deg(q.x / (R_EARTH * Math.cos(rad(o.lat))))};
  }
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const geoDist = (a, b) => dist(toLocal(a, a), toLocal(a, b));

  // ── 축척과 파동 ─────────────────────────────────────────────
  // k = Vp·Vs / (Vp − Vs). 진원 거리 = k × PS시.
  // 실제 지구의 k 는 약 7~8 km/s — 운동장 하나 축척은 숫자까지 같은 7.5 m/s 로 맞췄다.
  const SCALES = {
    one: {id: 'one', name: '운동장 하나', hint: '관측소끼리 100 m 안팎', vp: 5, vs: 3},
    two: {id: 'two', name: '두 운동장', hint: '관측소끼리 300 m 안팎', vp: 10, vs: 6}
  };
  const scaleOf = id => SCALES[id] || SCALES.one;
  const omori = s => s.vp * s.vs / (s.vp - s.vs);
  function arrivals(epiDist, depth, s) {
    const r = Math.hypot(epiDist, depth || 0);
    return {r, p: r / s.vp, s: r / s.vs, ps: r / s.vs - r / s.vp};
  }
  const distanceFromPS = (ps, s) => ps * omori(s);

  // ── 진도 (수정 메르칼리 진도, 우리나라 기상청이 쓰는 계급) ───────────────
  // 축소 지구에서 1 m = 1 km 로 보고 규모·거리로 진도를 어림한다.
  // 규모 5.0 이면 진원 5 m 에서 Ⅷ, 50 m 에서 Ⅴ, 150 m 에서 Ⅳ 정도가 된다.
  function intensity(r, mag) {
    return clamp(1.5 * mag - 3 * Math.log10(Math.max(r, 3)) + 2.6, 1, 10);
  }
  const ROMAN = ['', 'Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ', 'Ⅵ', 'Ⅶ', 'Ⅷ', 'Ⅸ', 'Ⅹ'];
  const INTENSITY_TEXT = [
    '',
    '지진계에만 기록되고 사람은 느끼지 못한다.',
    '조용히 쉬고 있는 사람, 건물 위층의 소수만 느낀다.',
    '실내, 특히 건물 위층에 있는 사람이 뚜렷하게 느낀다. 정차한 차가 약간 흔들린다.',
    '실내의 많은 사람이 느끼고, 밤에는 잠에서 깨기도 한다. 그릇과 창문이 흔들린다.',
    '거의 모든 사람이 느낀다. 그릇·창문이 깨지기도 하고 불안정한 물체가 넘어진다.',
    '모든 사람이 느낀다. 무거운 가구가 움직이고 벽의 회반죽이 떨어지기도 한다.',
    '일반 건물에 약간의 피해가 생긴다. 잘 지은 건물은 피해가 거의 없다.',
    '일반 건물에 상당한 피해가 생기고 굴뚝·기둥이 무너지기도 한다.',
    '잘 설계된 건물도 상당한 피해를 입고 일부는 무너진다.',
    '대부분의 건물과 구조물이 파괴된다.'
  ];
  const intensityClass = i => clamp(Math.floor(i + 0.5), 1, 10);
  const roman = i => ROMAN[intensityClass(i)];

  // ── 지진 기록(지진파형) 합성 ─────────────────────────────────────
  // 같은 seed 면 언제 어디서 그려도 같은 파형이 나온다. 선생님 기기와 학생 폰이 따로 계산해도 일치한다.
  function rng(seed) {
    let a = (seed >>> 0) || 1;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // 관측소에서의 S파 최대 진폭(기록지 눈금 기준). 가까울수록 크다.
  const amplitudeAt = (r, mag) => clamp(10 ** (0.35 * (mag - 5)) * (12 / Math.max(r, 3)) ** 0.75, 0.04, 3);
  const RATE = 50; // 초당 표본 수

  // 기록이 끝나는 시각: S파 뒤로 여진동(코다)이 잦아들 때까지.
  const recordLength = a => a.s + Math.max(10, 0.5 * (a.s - a.p) + 8);

  function synthesize(a, amp, seed) {
    const R = rng(seed), n = Math.ceil(recordLength(a) * RATE) + 1;
    const out = new Float32Array(n);
    const tone = (lo, hi) => ({f: lo + (hi - lo) * R(), ph: 2 * Math.PI * R(), w: 0.5 + R()});
    const pTones = [tone(5, 9), tone(5, 9), tone(6, 10), tone(4, 7)];
    const sTones = [tone(1.2, 2.4), tone(1.5, 3), tone(2, 3.5), tone(0.8, 1.6)];
    const bg = [tone(0.3, 0.9), tone(1, 3), tone(6, 12)];
    const sum = (tones, t) => tones.reduce((v, k) => v + k.w * Math.sin(2 * Math.PI * k.f * t + k.ph), 0) / tones.length;
    const aP = 0.3 * amp, aS = amp, noise = 0.012;
    let jitter = 0;
    for (let i = 0; i < n; i++) {
      const t = i / RATE;
      jitter = 0.7 * jitter + 0.3 * (R() * 2 - 1);
      let v = noise * (sum(bg, t) * 1.4 + jitter);
      if (t >= a.p) {
        const u = t - a.p;
        // 첫 움직임은 날카롭게, 그 뒤 S파가 올 때까지 서서히 잦아드는 P파 코다
        const env = (1 - Math.exp(-u / 0.06)) * (0.35 + 0.65 * Math.exp(-u / 1.6));
        v += aP * env * (sum(pTones, t) + 0.25 * (R() * 2 - 1));
      }
      if (t >= a.s) {
        const u = t - a.s;
        const env = (1 - Math.exp(-u / 0.12)) * Math.exp(-u / (2.2 + 0.08 * (a.s - a.p)));
        v += aS * env * (sum(sTones, t) * 1.5 + 0.2 * (R() * 2 - 1));
      }
      out[i] = v;
    }
    return out;
  }

  // ── 진앙(진원) 결정 ─────────────────────────────────────────────
  // 여러 관측소의 원 {x, y, r} 에 가장 잘 맞는 점. withDepth 면 깊이 z 도 같이 구한다.
  // 격자로 대충 찾은 뒤 가우스-뉴턴으로 다듬는다.
  function misfit(st, x, y, z) {
    let s = 0;
    for (const c of st) {
      const e = Math.hypot(c.x - x, c.y - y, z) - c.r;
      s += e * e;
    }
    return s;
  }
  // init 을 주면 격자 탐색을 건너뛰고 그 점에서부터 다듬는다 (오차 구름처럼 여러 번 풀 때 빠르게).
  function locate(stations, withDepth, init) {
    const st = stations.filter(c => isFinite(c.x) && isFinite(c.y) && isFinite(c.r) && c.r >= 0);
    if (st.length < 3) return null;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, rMax = 0;
    for (const c of st) {
      x0 = Math.min(x0, c.x); x1 = Math.max(x1, c.x);
      y0 = Math.min(y0, c.y); y1 = Math.max(y1, c.y);
      rMax = Math.max(rMax, c.r);
    }
    const pad = Math.min(rMax, 400);
    x0 -= pad; x1 += pad; y0 -= pad; y1 += pad;
    let best = init ? {x: init.x, y: init.y, z: withDepth ? (init.z || 0) : 0, f: 0} : {x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: 0, f: Infinity};
    const N = init ? -1 : 48;
    const zs = withDepth ? [0, rMax * 0.25, rMax * 0.5, rMax * 0.75] : [0];
    for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) for (const z of zs) {
      const x = x0 + (x1 - x0) * i / N, y = y0 + (y1 - y0) * j / N, f = misfit(st, x, y, z);
      if (f < best.f) best = {x, y, z, f};
    }
    let {x, y, z} = best, lambda = 1e-3;
    for (let it = 0; it < 60; it++) {
      // 정규방정식 JᵀJ δ = −Jᵀe (레벤버그-마쿼트 감쇠)
      const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], g = [0, 0, 0];
      for (const c of st) {
        const dx = x - c.x, dy = y - c.y, d = Math.max(Math.hypot(dx, dy, z), 1e-6);
        const e = d - c.r, J = [dx / d, dy / d, z / d];
        for (let a = 0; a < 3; a++) {
          g[a] += J[a] * e;
          for (let b = 0; b < 3; b++) A[a][b] += J[a] * J[b];
        }
      }
      const dim = withDepth ? 3 : 2;
      const M = [], v = [];
      for (let a = 0; a < dim; a++) {
        M.push(A[a].slice(0, dim));
        M[a][a] *= 1 + lambda;
        M[a][a] += 1e-9;
        v.push(-g[a]);
      }
      const step = solve(M, v);
      if (!step) break;
      const nx = x + step[0], ny = y + step[1], nz = withDepth ? Math.max(0, z + step[2]) : 0;
      const f0 = misfit(st, x, y, z), f1 = misfit(st, nx, ny, nz);
      if (f1 <= f0) {
        x = nx; y = ny; z = nz; lambda = Math.max(lambda / 3, 1e-7);
        if (Math.hypot(...step) < 1e-4) break;
      } else {
        lambda *= 4;
      }
    }
    return {x, y, z, rms: Math.sqrt(misfit(st, x, y, z) / st.length)};
  }
  // 가우스 소거 (2×2, 3×3)
  function solve(M, v) {
    const n = v.length, A = M.map((r, i) => r.concat([v[i]]));
    for (let c = 0; c < n; c++) {
      let p = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
      if (Math.abs(A[p][c]) < 1e-12) return null;
      [A[c], A[p]] = [A[p], A[c]];
      for (let r = 0; r < n; r++) {
        if (r === c) continue;
        const f = A[r][c] / A[c][c];
        for (let k = c; k <= n; k++) A[r][k] -= f * A[c][k];
      }
    }
    return A.map((r, i) => r[n] / A[i][i]);
  }

  // ── 공통현 ────────────────────────────────────────────────────
  // 두 원이 만나는 두 점(공통현의 양 끝). 만나지 않으면 null.
  function chord(c1, c2) {
    const d = dist(c1, c2);
    if (d < 1e-9 || d > c1.r + c2.r || d < Math.abs(c1.r - c2.r)) return null;
    const a = (c1.r * c1.r - c2.r * c2.r + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, c1.r * c1.r - a * a));
    const mx = c1.x + a * (c2.x - c1.x) / d, my = c1.y + a * (c2.y - c1.y) / d;
    const ux = -(c2.y - c1.y) / d, uy = (c2.x - c1.x) / d;
    return [{x: mx + h * ux, y: my + h * uy}, {x: mx - h * ux, y: my - h * uy}];
  }
  // 세 공통현이 만나는 점 = 진앙. 진원 깊이 = √(r² − d²).
  function radicalCenter(c1, c2, c3) {
    const row = (a, b) => [2 * (b.x - a.x), 2 * (b.y - a.y), a.r * a.r - b.r * b.r - a.x * a.x + b.x * b.x - a.y * a.y + b.y * b.y];
    const [a1, b1, k1] = row(c1, c2), [a2, b2, k2] = row(c1, c3);
    const det = a1 * b2 - a2 * b1;
    if (Math.abs(det) < 1e-9) return null;
    const p = {x: (k1 * b2 - k2 * b1) / det, y: (a1 * k2 - a2 * k1) / det};
    const d = dist(p, c1);
    return {x: p.x, y: p.y, depth: d <= c1.r ? Math.sqrt(c1.r * c1.r - d * d) : 0};
  }

  // ── 관측소 배치가 좋은지 ─────────────────────────────────────────
  // 원 세 개가 '한 점'에서 또렷하게 만나려면 관측소가 넓게, 한 줄이 아니게, 서로 떨어져 있어야 한다.
  //   minPair: 가장 가까운 두 관측소, iso: 퍼진 모양(0 = 한 줄, 1 = 고르게 둘러쌈), span: 가장 먼 두 관측소 사이
  function formation(pts) {
    const n = pts.length;
    if (n < 3) return {n, level: 'few'};
    let minPair = {d: Infinity}, span = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const d = dist(pts[i], pts[j]);
      if (d < minPair.d) minPair = {d, a: pts[i], b: pts[j]};
      span = Math.max(span, d);
    }
    const cx = pts.reduce((a, p) => a + p.x, 0) / n, cy = pts.reduce((a, p) => a + p.y, 0) / n;
    let sxx = 0, syy = 0, sxy = 0;
    for (const p of pts) { sxx += (p.x - cx) ** 2; syy += (p.y - cy) ** 2; sxy += (p.x - cx) * (p.y - cy); }
    const tr = sxx + syy, det = sxx * syy - sxy * sxy, disc = Math.sqrt(Math.max(0, tr * tr / 4 - det));
    const l1 = tr / 2 + disc, l2 = tr / 2 - disc, iso = l1 > 0 ? Math.max(0, l2) / l1 : 0;
    const level = minPair.d < 10 ? 'close' : iso < 0.12 ? 'line' : span < 30 ? 'narrow' : 'good';
    return {n, minPair, span, iso, level, center: {x: cx, y: cy}};
  }

  // 볼록 껍질: 모둠원을 잇는 도형을 꼬이지 않게 바깥 둘레 순서로 (단조 사슬)
  function hull(pts) {
    const p = pts.slice().sort((a, b) => a.x - b.x || a.y - b.y);
    if (p.length < 3) return p;
    const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
    const lo = [], up = [];
    for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
    for (const q of p.slice().reverse()) { while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
    return lo.slice(0, -1).concat(up.slice(0, -1));
  }

  // 판독(PS시)과 GPS 가 조금씩 틀릴 때 진앙 추정이 어디까지 흩어지는지: 여러 번 흔들어 풀어 본다.
  // sigma 는 진원 거리 오차의 표준편차(m). 돌려주는 rms 가 작을수록 좋은 배치다.
  // global 이면 매번 운동장 전체를 다시 찾는다: 한 줄로 선 관측소처럼 '거울상' 점이 똑같이 잘 맞으면
  // 추정이 그쪽으로도 튀는 것까지 보여 준다.
  function errorCloud(stations, epi, sigma, random = Math.random, n = 60, global = false) {
    if (stations.length < 3) return null;
    const gauss = () => Math.sqrt(-2 * Math.log(1 - random() * 0.999999)) * Math.cos(2 * Math.PI * random());
    const out = [];
    let ss = 0;
    for (let i = 0; i < n; i++) {
      const c = stations.map(s => ({x: s.x, y: s.y, r: Math.max(0, dist(s, epi) + gauss() * sigma)}));
      const e = locate(c, false, global ? undefined : epi);
      if (!e) continue;
      out.push({x: e.x, y: e.y});
      ss += (e.x - epi.x) ** 2 + (e.y - epi.y) ** 2;
    }
    return {pts: out, rms: out.length ? Math.sqrt(ss / out.length) : Infinity};
  }

  // ── 수업 운영에 쓰는 도구 ───────────────────────────────────────
  // 관측소들이 둘러싼 영역 안쪽에서 진앙을 하나 고른다. 관측소 바로 위는 피한다.
  function randomEpicenter(points, random = Math.random, minGap = 8) {
    if (!points.length) return {x: 0, y: 0};
    let pick = null;
    for (let tries = 0; tries < 80; tries++) {
      const w = points.map(() => -Math.log(1 - random() * 0.999));
      const sw = w.reduce((a, b) => a + b, 0);
      const p = {x: 0, y: 0};
      points.forEach((q, i) => { p.x += q.x * w[i] / sw; p.y += q.y * w[i] / sw; });
      const gap = Math.min(...points.map(q => dist(p, q)));
      if (!pick || gap > pick.gap) pick = {x: p.x, y: p.y, gap};
      if (gap >= minGap) break;
    }
    return {x: pick.x, y: pick.y};
  }

  // 학생들이 읽은 PS시와 실제 진원 거리로 '우리 반의 k' 를 구한다 (원점을 지나는 직선).
  function fitOmori(pairs) {
    const ok = pairs.filter(q => isFinite(q.ps) && isFinite(q.r) && q.ps > 0);
    if (ok.length < 2) return null;
    let sxy = 0, sxx = 0, syy = 0;
    for (const q of ok) { sxy += q.ps * q.r; sxx += q.ps * q.ps; syy += q.r * q.r; }
    const k = sxy / sxx;
    let res = 0, tot = 0;
    const mean = ok.reduce((a, q) => a + q.r, 0) / ok.length;
    for (const q of ok) { res += (q.r - k * q.ps) ** 2; tot += (q.r - mean) ** 2; }
    return {k, r2: tot > 0 ? 1 - res / tot : 1, n: ok.length};
  }

  // GPS 위치 흔들림 줄이기: 정확도(m)를 분산으로 보는 1차 칼만 필터.
  // 걷는 속도(약 1.5 m/s)만큼 이전 추정의 불확실성을 키운 뒤 새 측정과 섞는다.
  function blendFix(prev, fix, walk = 1.5) {
    if (!prev) return {lat: fix.lat, lon: fix.lon, acc: fix.acc, t: fix.t};
    const dt = Math.max(0, (fix.t - prev.t) / 1000);
    const pv = prev.acc * prev.acc + (walk * dt) ** 2, mv = Math.max(fix.acc, 1) ** 2;
    const g = pv / (pv + mv);
    return {
      lat: prev.lat + g * (fix.lat - prev.lat),
      lon: prev.lon + g * (fix.lon - prev.lon),
      acc: Math.sqrt(pv * mv / (pv + mv)),
      t: fix.t
    };
  }

  // 모둠 추정 진앙의 순위: 오차가 작은 순, 같으면 먼저 낸 순.
  function rankGuesses(guesses, epi) {
    return guesses
      .map(g => Object.assign({}, g, {err: dist(g, epi)}))
      .sort((a, b) => a.err - b.err || (a.t || 0) - (b.t || 0));
  }

  const TEAMS = [
    {name: '1모둠', color: '#e5484d'}, {name: '2모둠', color: '#f76b15'},
    {name: '3모둠', color: '#d4a72c'}, {name: '4모둠', color: '#30a46c'},
    {name: '5모둠', color: '#0d9488'}, {name: '6모둠', color: '#0090ff'},
    {name: '7모둠', color: '#8e4ec6'}, {name: '8모둠', color: '#d6409f'}
  ];

  const api = {
    R_EARTH, toLocal, toLatLon, dist, geoDist,
    SCALES, scaleOf, omori, arrivals, distanceFromPS,
    intensity, intensityClass, roman, INTENSITY_TEXT,
    rng, amplitudeAt, RATE, recordLength, synthesize,
    locate, chord, radicalCenter,
    formation, errorCloud, hull,
    randomEpicenter, fitOmori, blendFix, rankGuesses, TEAMS
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.QuakeModel = api;
})(typeof window !== 'undefined' ? window : globalThis);
