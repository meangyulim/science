/* 성단 C-M도 실험실 — 계산 모형 (DOM 없음).
   브라우저에서는 window.ClusterCmdModel, Node 검사에서는 module.exports.
   실제 자료는 cluster-cmd-data.js(ClusterCmdData)에서 받는다. */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory(require('./cluster-cmd-data.js'));
  else root.ClusterCmdModel = factory(root.ClusterCmdData);
})(typeof window !== 'undefined' ? window : this, function (DATA) {
  'use strict';
  const log10 = Math.log10;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  // 정렬된 xs 위에서 선형 보간. 범위 밖은 끝 구간을 그대로 늘린다(extend) 또는 끝값에 고정(clamp).
  function interp(xs, ys, x, extend) {
    const n = xs.length;
    if (x <= xs[0]) return extend ? ys[0] + (x - xs[0]) * (ys[1] - ys[0]) / (xs[1] - xs[0]) : ys[0];
    if (x >= xs[n - 1]) return extend ? ys[n - 1] + (x - xs[n - 1]) * (ys[n - 1] - ys[n - 2]) / (xs[n - 1] - xs[n - 2]) : ys[n - 1];
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (xs[mid] <= x) lo = mid; else hi = mid; }
    return ys[lo] + (x - xs[lo]) * (ys[hi] - ys[lo]) / (xs[hi] - xs[lo]);
  }
  function median(a) {
    if (!a.length) return NaN;
    const s = a.slice().sort((p, q) => p - q), m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  // ── 등급과 거리 (3차시 「별까지의 거리」 복습) ─────────────────────
  // 거리 지수 m − M = 5 log r − 5  →  r = 10^((m − M + 5) / 5)  (r 의 단위: pc)
  const modulus = r => 5 * log10(r) - 5;
  const distanceFromModulus = mu => 10 ** ((mu + 5) / 5);
  const logDistance = mu => (mu + 5) / 5;
  // 등급이 dm 만큼 작은(밝은) 별은 광도가 10^(0.4 dm) 배. 5등급 = 100배.
  const lumRatio = dm => 10 ** (0.4 * dm);
  // 색지수 B − V 와 B 등급: B = V + (B − V)
  const colourIndex = (B, V) => B - V;
  const bFromV = (V, bv) => V + bv;

  // ── 표준 주계열 (Pecaut & Mamajek 2013, Mamajek 표 v2022.04.16) ────────
  const MS = DATA.ms.map(([spt, teff, bv, mv]) => ({spt, teff, bv, mv}));
  const MS_BV = MS.map(r => r.bv), MS_MV = MS.map(r => r.mv), MS_T = MS.map(r => r.teff);
  const msMag = bv => interp(MS_BV, MS_MV, bv, true);         // 색지수 → 주계열성의 절대 등급
  const msColour = mv => interp(MS_MV, MS_BV, mv, false);     // 절대 등급 → 주계열성의 색지수
  const msTeff = bv => interp(MS_BV, MS_T, bv, false);        // 그림용(스펙트럼 모양)으로만 쓴다
  const MS_RANGE = {bv: [MS_BV[0], MS_BV[MS_BV.length - 1]], mv: [MS_MV[0], MS_MV[MS_MV.length - 1]]};

  // ── 전향점과 나이 ────────────────────────────────────────────
  // 교과서 96쪽 탐구하기 1 그림의 나이 눈금: 전향점의 절대 등급 M_V → 성단의 나이(년).
  // 「전향점의 위치에서 수평 방향 오른쪽으로 선을 그어 세로 좌표를 읽는다」(교과서 탐구 활동 유의점).
  const AGE_SCALE = [[-6, 2.0e6], [-4, 6.5e6], [-2, 2.8e7], [0, 1.6e8], [2, 1.9e9], [4, 7.1e9], [6, 2.9e10]];
  const AS_MV = AGE_SCALE.map(a => a[0]), AS_LOG = AGE_SCALE.map(a => log10(a[1]));
  // 눈금 사이는 로그로 보간한다. 이 모형에서는 별 하나가 주계열에 머무는 시간도 이 눈금으로 정한다
  // (그 별이 전향점이 되는 나이 = 그 별이 주계열을 떠나는 나이).
  const ageAtMv = mv => 10 ** interp(AS_MV, AS_LOG, mv, true);
  const mvAtAge = t => interp(AS_LOG, AS_MV, log10(t), true);
  function turnoff(t) {
    const mv = mvAtAge(t);
    return {mv, bv: msColour(mv)};
  }
  const ageForTurnoffColour = bv => ageAtMv(msMag(bv));

  // 주계열에 도착하기 전 수축하는 시간(그림용 어림값, 교과서 밖이라 화면에 숫자로 쓰지 않는다).
  // 질량이 작은(어두운) 원시별일수록 오래 걸린다(교과서 96쪽). 교과서 그림 4처럼 '매우 젊은 성단'에서만
  // 수축 중인 별이 보이도록, 실제보다 짧게 잡아 약 2천만 년 안에 모두 주계열에 도착하게 했다.
  const PRE_MS = [[-3.5, 1e4], [-0.9, 8e4], [0.3, 3e5], [1.0, 7e5], [2.7, 2.2e6], [4.8, 6e6], [9.6, 1.8e7]];
  const PM_MV = PRE_MS.map(a => a[0]), PM_LOG = PRE_MS.map(a => log10(a[1]));
  const preMSTime = mv => 10 ** interp(PM_MV, PM_LOG, mv, true);

  // ── 무작위 수 (같은 seed 는 같은 결과) ────────────────────────────
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
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
  }

  // ── 교육용 모형 성단 ──────────────────────────────────────────
  // 같은 성운에서 같은 때 태어난 별 n개. 보기 쉽도록 절대 등급이 고르게 퍼지게 골랐다
  // (실제 성단에는 가볍고 어두운 별이 훨씬 많다).
  const MODEL_MV = [-3.4, 9.3];
  const GIANT_SPAN = 0.5;   // 거성 단계의 길이 = 주계열 시간 × 0.5 (보기 쉽게 늘림)
  function makeCluster(n = 360, seed = 7) {
    const r = rng(seed), stars = [];
    for (let i = 0; i < n; i++) {
      const mv0 = MODEL_MV[0] + (MODEL_MV[1] - MODEL_MV[0]) * (i + r()) / n;
      stars.push({
        mv0, bv0: msColour(mv0),
        dm: 0.1 * gauss(r), dc: 0.015 * gauss(r),       // 주계열의 폭
        j1: gauss(r), j2: gauss(r),                     // 거성·수축 중인 별의 흩어짐
        life: ageAtMv(mv0), pre: preMSTime(mv0)
      });
    }
    return stars;
  }
  // 꺾은선 위의 위치. segs = 각 구간에 머무는 시간 비율(합 1)
  function along(pts, segs, s) {
    let acc = 0;
    for (let k = 0; k < segs.length; k++) {
      if (s <= acc + segs[k] || k === segs.length - 1) {
        const f = clamp((s - acc) / segs[k], 0, 1), a = pts[k], b = pts[k + 1];
        return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
      }
      acc += segs[k];
    }
    return pts[pts.length - 1];
  }
  // 주계열을 떠난 뒤 거성이 되어 가는 길 (교과서 96쪽 그림 4의 모양을 따른 모식)
  function giantPath(c0, m0, s) {
    if (m0 <= -1.5) // 무거운 별: 밝기는 비슷하게, 오른쪽(붉은 초거성)으로 빠르게 건너간다
      return along([[c0, m0], [c0 + 0.3, m0 - 0.3], [1.62, m0 - 0.9], [1.68, m0 - 1.1]], [0.08, 0.12, 0.8], s);
    if (m0 <= 1.5)  // 중간 질량
      return along([[c0, m0], [c0 + 0.35, m0 - 0.2], [1.02, m0 - 0.8], [1.2, m0 - 1.7]], [0.12, 0.33, 0.55], s);
    // 가벼운 별: 오른쪽으로 옮겨 간 뒤(준거성) 위로 올라간다(적색 거성 가지)
    const c1 = Math.max(0.9, c0 + 0.12);
    return along([[c0, m0], [c1, m0 - 0.4], [c1 + 0.1, m0 - 1.7], [1.45, m0 - 4.6]], [0.28, 0.4, 0.32], s);
  }
  // 나이 t(년)에서 별 하나의 상태
  function starAt(s, t) {
    const c0 = s.bv0 + s.dc, m0 = s.mv0 + s.dm;
    if (t < s.pre) {           // 아직 수축 중: 주계열보다 오른쪽 위
      const k = Math.sqrt(1 - t / s.pre);
      return {phase: 'pre', bv: c0 + 0.16 * k + 0.02 * s.j1, mv: m0 - 2.5 * k + 0.2 * s.j2 * k};
    }
    if (t < s.life) return {phase: 'ms', bv: c0, mv: m0};
    const g = (t - s.life) / (GIANT_SPAN * s.life);
    if (g < 1) {
      const [bv, mv] = giantPath(s.bv0, s.mv0, g);
      return {phase: 'giant', bv: bv + 0.03 * s.j1, mv: mv + 0.15 * s.j2};
    }
    return {phase: 'done', bv: c0, mv: m0};
  }
  function census(stars, t) {
    const c = {pre: 0, ms: 0, giant: 0, done: 0};
    for (const s of stars) c[starAt(s, t).phase]++;
    c.total = stars.length;
    c.msFraction = c.ms / c.total;
    c.left = c.giant + c.done;   // 주계열을 떠난 별
    return c;
  }
  // 모형 성단에서 가장 밝은 별보다 전향점이 더 밝으면 아직 전향점이 없다.
  const hasTurnoff = t => mvAtAge(t) >= MODEL_MV[0];
  // 교과서 그림 4처럼 네 장면 (나이: 년)
  const SNAPSHOTS = [
    {key: 'v-young', name: '매우 젊은 성단', age: 2e6},
    {key: 'young', name: '젊은 성단', age: 5e7},
    {key: 'old', name: '늙은 성단', age: 2e9},
    {key: 'v-old', name: '매우 늙은 성단', age: 1.2e10}
  ];
  const AGE_RANGE = [1e6, 1.3e10];

  // ── 실제 성단 자료 ──────────────────────────────────────────
  function unpack(flat) {
    const out = [];
    for (let i = 0; i < flat.length; i += 2) out.push({V: flat[i], bv: flat[i + 1]});
    return out;
  }
  const M45 = unpack(DATA.m45), M3 = unpack(DATA.m3);
  DATA.pleiades.forEach(([i, name, x, y]) => Object.assign(M45[i], {name, sx: x, sy: y}));
  // 연습용 가상의 성단: 표준 주계열을 정확히 5등급 내리고 흩어짐을 준 별들 (거리 지수 5 → 100 pc)
  function practiceCluster(seed = 4, n = 170, mu = 5) {
    const r = rng(seed), out = [];
    while (out.length < n) {
      const bv = 1.4 * r();
      out.push({V: msMag(bv) + mu + 0.22 * gauss(r), bv: bv + 0.025 * gauss(r)});
    }
    return out;
  }
  const PRACTICE = practiceCluster();
  // 주계열 맞추기에 쓰는 주계열성(성단마다 고정). M3는 전향점 아래 주계열만.
  const FIT_SELECT = {
    practice: s => true,
    m45: s => s.bv >= -0.15 && s.bv <= 1.5,
    m3: s => s.V >= 19.3 && s.bv >= 0.4 && s.bv <= 1.0
  };
  // 거리 지수를 dm 으로 놓았을 때, 선보다 위(밝음)·아래(어두움)에 있는 주계열성
  function fitStats(stars, dm, select) {
    const res = [];
    for (const s of stars) if (select(s)) res.push(s.V - (msMag(s.bv) + dm));
    const above = res.filter(v => v < 0).length;
    return {n: res.length, median: median(res), above: above / res.length, below: 1 - above / res.length};
  }
  // 선이 주계열성 분포의 한가운데를 지나는 거리 지수
  function bestModulus(stars, select) {
    const est = [];
    for (const s of stars) if (select(s)) est.push(s.V - msMag(s.bv));
    return median(est);
  }

  // 성단 전체 빛의 색지수 (보이는 별들의 빛을 모두 더한 B − V)
  function integratedColour(stars) {
    let fb = 0, fv = 0;
    for (const s of stars) { fv += 10 ** (-0.4 * s.V); fb += 10 ** (-0.4 * (s.V + s.bv)); }
    return fv > 0 ? -2.5 * log10(fb / fv) : NaN;
  }

  // ── 색 ───────────────────────────────────────────────────
  function ramp(stops, x) {
    if (x <= stops[0][0]) return stops[0][1];
    for (let i = 1; i < stops.length; i++) {
      if (x <= stops[i][0]) {
        const [a, ca] = stops[i - 1], [b, cb] = stops[i], t = (x - a) / (b - a);
        return ca.map((v, k) => Math.round(v + (cb[k] - v) * t));
      }
    }
    return stops[stops.length - 1][1];
  }
  // 어두운 하늘에 그리는 별빛 색 (수업 그림 figs_cmd.py 와 같은 눈금)
  const SKY_STOPS = [[-0.3, [155, 176, 255]], [0.0, [202, 216, 255]], [0.4, [248, 247, 255]], [0.65, [255, 244, 222]],
    [1.0, [255, 214, 160]], [1.4, [255, 180, 110]], [2.0, [255, 140, 70]]];
  // 흰 그래프 위의 점 색 (푸름 → 노랑 → 붉음)
  const CHART_STOPS = [[-0.3, [42, 86, 198]], [0.0, [64, 128, 222]], [0.3, [120, 150, 150]], [0.55, [196, 152, 36]],
    [0.9, [224, 116, 40]], [1.4, [196, 66, 12]], [2.0, [150, 40, 10]]];
  const skyRGB = bv => ramp(SKY_STOPS, bv);
  const chartRGB = bv => ramp(CHART_STOPS, bv);
  const rgbCss = (c, a) => a === undefined ? `rgb(${c[0]},${c[1]},${c[2]})` : `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  // 색지수로 부르는 별의 색 (교과서 95쪽: 10000 K 백색 = 0, 청색 (−), 황색·적색 (+))
  function colourName(bv) {
    if (bv < -0.15) return '청색';
    if (bv < -0.02) return '청백색';
    if (bv < 0.3) return '백색';
    if (bv < 0.58) return '황백색';
    if (bv < 0.85) return '황색';
    if (bv < 1.4) return '주황색';
    return '적색';
  }
  function tempWord(bv) {
    if (bv < -0.005) return '10000 K보다 뜨겁다';
    if (bv <= 0.005) return '약 10000 K';
    return '10000 K보다 차갑다';
  }

  // ── 필터와 별빛 (그림용 모형) ─────────────────────────────────
  // 별빛 세기의 모양(파장 nm). 교과서 95쪽 그림 2처럼 뜨거울수록 짧은 파장 쪽이 세다.
  function spectrum(lam, T) {
    const x = 1.438777e7 / (lam * T);
    return 1 / (lam ** 5 * (Math.exp(x) - 1));
  }
  // 필터 투과율(교과서 95쪽 「U, B, V 필터의 빛 투과율」 모양을 흉내 낸 곡선)
  const FILTERS = {U: {c: 365, w: 30, peak: 0.7}, B: {c: 440, w: 42, peak: 0.95}, V: {c: 548, w: 40, peak: 0.88}};
  const filterT = (f, lam) => FILTERS[f].peak * Math.exp(-0.5 * ((lam - FILTERS[f].c) / FILTERS[f].w) ** 2);
  // B 와 V 로 들어온 빛의 비(색지수 0 인 별에서 1). B − V = −2.5 log(B 빛 / V 빛)
  const bOverV = bv => 10 ** (-0.4 * bv);

  // ── 글자 ────────────────────────────────────────────────
  // 유효 숫자 n 자리
  const sig = (v, n = 3) => +v.toPrecision(n);
  // 거리: 유효 숫자 세 자리 (126 pc, 17400 pc, 10400 pc)
  function formatPc(r) { return `${sig(r, 3)} pc`; }
  // 나이: 유효 숫자 두 자리, 만·억 단위 (1억 3천만 년, 71억 년, 200만 년)
  function formatAge(t) {
    const v = sig(t, 2);
    if (v >= 1e8) {
      const eok = Math.floor(v / 1e8 + 1e-9), rest = Math.round((v - eok * 1e8) / 1e7);
      return rest ? `${eok}억 ${rest}천만 년` : `${eok}억 년`;
    }
    return `${Math.round(v / 1e4)}만 년`;
  }

  // ── 문항 (수업 학습지·PPT와 같은 문장) ────────────────────────────
  // Q1: (가)·(나) 사진으로 성단 구별 — 주제마다 옳은 문장과 틀린 문장이 있다. g = {glob, open}
  const Q1_TOPICS = [
    {t: g => [`(${g.glob})는 구상 성단이다.`, true, '별이 공 모양으로 빽빽하게 모여 있습니다.'],
     f: g => [`(${g.open})는 구상 성단이다.`, false, `(${g.open})는 별이 엉성하게 흩어진 산개 성단입니다.`]},
    {t: g => [`(${g.open})와 같은 성단은 우리은하의 원반에 주로 분포한다.`, true, '산개 성단은 원반에, 구상 성단은 헤일로에 주로 분포합니다.'],
     f: g => [`(${g.glob})와 같은 성단은 우리은하의 원반에 주로 분포한다.`, false, '구상 성단은 우리은하의 헤일로에 주로 분포합니다.']},
    {t: g => [`(${g.glob})에는 주계열성과 거성이 함께 있다.`, true, '구상 성단에는 질량이 태양보다 작은 주계열성과 거성이 주로 있습니다.'],
     f: g => [`(${g.glob})를 이루는 별들은 모두 거성이다.`, false, '구상 성단에는 거성뿐 아니라 질량이 태양보다 작은 주계열성도 많습니다.']},
    {t: g => [`(${g.glob})를 이루는 별들의 나이는 100억 년 이상이다.`, true, '구상 성단의 별들은 100억 년 넘게 산 늙은 별입니다.'],
     f: g => [`(${g.open})를 이루는 별들은 (${g.glob})를 이루는 별들보다 나이가 많다.`, false, '산개 성단의 별들이 더 젊습니다.']},
    {t: g => [`(${g.open})는 수백~수천 개의 별로 이루어져 있다.`, true, '산개 성단은 별 수백~수천 개, 구상 성단은 수만~수십만 개입니다.'],
     f: g => [`(${g.glob})는 수백 개의 별로 이루어져 있다.`, false, '구상 성단은 별 수만~수십만 개가 모여 있습니다.']},
    {t: g => [`(${g.open})의 별들은 (${g.glob})의 별들보다 무거운 원소가 많다.`, true, '산개 성단(종족 Ⅰ)은 이전 세대 별이 내뿜은 무거운 원소가 많은 성간 물질에서 생겼습니다.'],
     f: g => [`(${g.glob})의 별들은 (${g.open})의 별들보다 무거운 원소가 많다.`, false, '구상 성단의 종족 Ⅱ 별은 무거운 원소가 상대적으로 적습니다.']},
    {t: g => [`(${g.open})는 전체적으로 푸른색을 띤다.`, true, '질량이 큰 청색 별이 질량이 작은 적색 별보다 매우 밝기 때문입니다.'],
     f: g => [`(${g.glob})는 전체적으로 푸른색을 띤다.`, false, '구상 성단은 가장 밝은 별이 붉은 거성이라 전체적으로 붉은색을 띱니다.']}
  ];
  // 수업 Q1과 같은 문항(가 = 구상 M13, 나 = 산개 M45): ㄱ ○, ㄴ ○, ㄷ ×
  function q1Lesson() {
    const g = {glob: '가', open: '나'};
    return {g, items: [Q1_TOPICS[0].t(g), Q1_TOPICS[1].t(g), Q1_TOPICS[2].f(g)]};
  }
  function q1Random(seed) {
    const r = rng(seed);
    const g = r() < 0.5 ? {glob: '가', open: '나'} : {glob: '나', open: '가'};
    const rest = [1, 2, 3, 4, 5, 6];
    for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
    const items = [0, rest[0], rest[1]].map(k => (r() < 0.5 ? Q1_TOPICS[k].t : Q1_TOPICS[k].f)(g));
    return {g, items};
  }
  // Q2: 실제 C-M도 (가) M45, (나) M3. ㉠ 15등급 거성, ㉡ 20등급 주계열성, ㉢ V 9.5 · 색지수 0.5
  const Q2 = {
    marks: {a: {V: 15, bv: 0.88}, b: {V: 20, bv: 0.5}, c: {V: 9.5, bv: 0.5}},
    items: [
      ['(가)는 산개 성단이다.', true, '(가)에는 색지수가 (−)인 밝은 청색 주계열성이 있습니다.'],
      ['광도는 ㉠이 ㉡의 100배이다.', true, '같은 성단의 별은 거리가 같아 겉보기 등급 차(20 − 15 = 5)가 곧 절대 등급 차입니다. 5등급 차 = 100배.'],
      ['㉢의 B 등급은 9.0이다.', false, 'B = V + (B − V) = 9.5 + 0.5 = 10.0입니다.']
    ]
  };
  // Q3: 산개 성단 A, B, C 전향점의 색지수
  const Q3 = {
    clusters: [{id: 'A', bv: -0.2}, {id: 'B', bv: 0.1}, {id: 'C', bv: 0.4}],
    items: [
      ['나이가 가장 많은 성단은 C이다.', true, '전향점의 색지수가 가장 크다 → 전향점이 가장 오른쪽 아래 → 가장 늙었습니다.'],
      ['전향점에 있는 별의 표면 온도는 A가 B보다 낮다.', false, 'A의 색지수가 더 작다 → 더 푸르다 → 표면 온도가 높습니다.'],
      ['주계열성이 차지하는 비율은 A가 C보다 크다.', true, '젊은 A는 아직 주계열을 떠난 별이 적습니다.']
    ]
  };
  // Q4: 색지수 0.5인 주계열성 — 표준 +4, 성단 A +9, 성단 B +14
  const Q4 = {
    std: 4, a: 9, b: 14,
    items: [
      ['성단 A의 거리 지수는 5이다.', true, 'm − M = 9 − 4 = 5 (→ 100 pc)'],
      ['성단 B까지의 거리는 1000 pc이다.', true, 'm − M = 14 − 4 = 10 → A보다 거리 지수가 5 크다 → 거리는 A의 10배 = 1000 pc'],
      ['성단 B에 있는 색지수 0.5인 거성의 겉보기 등급은 14이다.', false, '거성은 색지수가 같은 주계열성보다 훨씬 밝습니다 → 14보다 작습니다. 주계열 맞추기는 주계열성끼리 비교합니다.']
    ]
  };
  // 태양: 겉보기 등급 −26.7 (교과서 별의 등급 표), 색지수 +0.65 (지도서)
  const SUN = {name: '태양', V: -26.7, bv: 0.65};
  // 교과서 97쪽 탐구하기 2와 정리하기, 96쪽 탐구하기 1의 값
  const TEXTBOOK = {
    m45: {mu: 5.5, r: 126, actual: 136, age: '1억 3천만 년', turnoff: -0.12, ageRead: 1.3e8},
    m3: {mu: 16.2, r: 17400, actual: 10400, age: '약 110억 년'},
    m67: {turnoff: 0.43, ageRead: 7.1e9, actualAge: '30억~50억 년'}
  };

  return {clamp, interp, median, modulus, distanceFromModulus, logDistance, lumRatio, colourIndex, bFromV,
    MS, MS_RANGE, msMag, msColour, msTeff, AGE_SCALE, ageAtMv, mvAtAge, turnoff, ageForTurnoffColour, preMSTime,
    rng, gauss, MODEL_MV, GIANT_SPAN, makeCluster, giantPath, starAt, census, hasTurnoff, SNAPSHOTS, AGE_RANGE,
    M45, M3, PRACTICE, practiceCluster, FIT_SELECT, fitStats, bestModulus, integratedColour,
    skyRGB, chartRGB, rgbCss, colourName, tempWord, spectrum, FILTERS, filterT, bOverV,
    sig, formatPc, formatAge, Q1_TOPICS, q1Lesson, q1Random, Q2, Q3, Q4, SUN, TEXTBOOK, NAMED: DATA.named};
});
