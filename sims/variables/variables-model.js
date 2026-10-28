/* Teaching models for variable stars, standard candles and cosmic expansion.
   Usable in the browser (window.VariableModel) and in Node validation. */
(function(root) {
  'use strict';
  const TAU = 2 * Math.PI;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const log10 = Math.log10;

  // ── 등급과 거리 ──────────────────────────────────────────────
  // 거리 지수 m − M = 5 log r − 5 (r 의 단위: pc)
  const modulus = r => 5 * log10(r) - 5;
  const distanceFromModulus = mu => 10 ** ((mu + 5) / 5);
  // 등급이 dm 만큼 클(어두울) 때의 밝기 비. 5등급 차이 = 100배.
  const brightnessRatio = dm => 10 ** (-0.4 * dm);
  const PC_TO_LY = 3.2616;

  // ── 주기-광도 관계 ─────────────────────────────────────────
  // 수업 그래프(활동지 12쪽, 슬라이드 15쪽)의 눈금에 맞춘 값이다.
  // 주기 10일에서 종족 Ⅰ −4등급, 종족 Ⅱ −2등급, RR형은 주기와 관계없이 +0.5등급.
  const PL = {
    pop1: {name: '종족 Ⅰ 세페이드', zero: -1.6, slope: -2.4},
    pop2: {name: '종족 Ⅱ 세페이드', zero: 0.4, slope: -2.4},
    rr:   {name: 'RR형 변광성', flat: 0.5}
  };
  function absMag(kind, period) {
    const c = PL[kind];
    return c.flat !== undefined ? c.flat : c.zero + c.slope * log10(period);
  }

  // ── 맥동 변광성의 광도 곡선 모양 ─────────────────────────────
  // 밝기 b(φ): 0 = 가장 어두움, 1 = 가장 밝음. rise 는 한 주기 중 밝아지는 데 쓰는 비율.
  // 빠르게 밝아지고 천천히 어두워지는 비대칭 모양이며, 이음매에서 기울기가 0 이라 매끄럽다.
  // 최대는 φ = rise, 최소는 φ = 0 에 온다.
  function pulseShape(phase, rise) {
    const p = ((phase % 1) + 1) % 1;
    return p < rise ? 0.5 - 0.5 * Math.cos(Math.PI * p / rise)
                    : 0.5 + 0.5 * Math.cos(Math.PI * (p - rise) / (1 - rise));
  }
  // tMax: 극대가 오는 시각 하나. 이 시각에서 period 간격으로 극대가 반복된다.
  function pulsatorMag(t, s) {
    const phase = (t - s.tMax) / s.period + s.rise;
    return s.mMin - (s.mMin - s.mMax) * pulseShape(phase, s.rise);
  }
  function maxima(s, from, to) {
    const out = [];
    let k = Math.ceil((from - s.tMax) / s.period);
    for (let t = s.tMax + k * s.period; t <= to; t = s.tMax + (++k) * s.period) out.push(t);
    return out;
  }

  // ── 폭발 변광성 ──────────────────────────────────────────
  // 신성: 1~2일 만에 급격히 밝아지고, 최대 뒤 며칠 안에 빠르게 어두워진다.
  function novaMag(t, s) {
    if (t < 0) return s.quiet;
    if (t < s.rise) {
      const x = t / s.rise, k = x * x * (3 - 2 * x);
      return s.quiet + (s.peak - s.quiet) * k;
    }
    const d = t - s.rise;
    return s.peak + 3 * (1 - Math.exp(-d / 5)) + 0.035 * d;
  }
  // Ia형 초신성: 폭발 전에는 검출 한계보다 훨씬 어둡다. 약 18일에 걸쳐 밝아지고 최대 밝기를 오래 유지한다.
  function supernovaMag(t, s) {
    if (t <= 0) return s.quiet;
    if (t < s.rise) {
      const x = t / s.rise, f = x * x * Math.exp(1 - x * x);
      return Math.min(s.quiet, s.peak - 2.5 * log10(f));
    }
    const d = t - s.rise;
    return s.peak + 2.6 * (1 - Math.exp(-d / 20)) + 0.015 * d;
  }

  // ── 관측 자료 흉내 (같은 seed 는 같은 자료) ─────────────────────
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

  // 광도 곡선 읽기 실험실의 다섯 종류. 값은 활동지 12·13쪽 그래프에 맞췄다.
  const TYPES = {
    rr:     {name: 'RR형 변광성', group: 'pulse', period: 0.57, mMax: 7.5, mMin: 8.5, rise: 0.16, noise: 0.03, unit: '일'},
    cepheid:{name: '세페이드 변광성', group: 'pulse', period: 10, mMax: 4.0, mMin: 4.9, rise: 0.3, noise: 0.03, unit: '일'},
    mira:   {name: '장주기 변광성', group: 'pulse', period: 330, mMax: 3, mMin: 9, rise: 0.45, noise: 0.12, unit: '일'},
    nova:   {name: '신성', group: 'burst', quiet: 14, peak: 3, rise: 1.5, noise: 0.06, from: -12, to: 120, unit: '일'},
    sn:     {name: 'Ia형 초신성', group: 'burst', quiet: 35, peak: 14, rise: 18, noise: 0.05, from: -25, to: 220, limit: 19.5, unit: '일'}
  };
  // 무작위 '정체 숨긴 별'. 종류마다 표의 범위 안에서 주기와 변화 폭을 고른다.
  function randomStar(kind, seed) {
    const r = rng(seed), base = TYPES[kind], s = {...base, kind};
    const pick = (lo, hi) => lo + (hi - lo) * r();
    if (kind === 'rr') { s.period = pick(0.35, 0.85); s.mMax = pick(7, 13); s.mMin = s.mMax + pick(0.5, 1.0); }
    if (kind === 'cepheid') { s.period = 10 ** pick(0.4, 1.7); s.mMax = pick(4, 10); s.mMin = s.mMax + pick(0.4, 1.6); }
    if (kind === 'mira') { s.period = pick(180, 480); s.mMax = pick(3, 7); s.mMin = s.mMax + pick(3, 6); }
    if (kind === 'nova') { s.peak = pick(2, 6); s.quiet = s.peak + pick(8, 13); }
    if (kind === 'sn') { s.peak = pick(12, 15); }
    return s;
  }
  function domain(s) {
    if (s.group === 'burst') return [s.from, s.to];
    return [0, s.period * 3.3];
  }
  function starMag(s, t) {
    if (s.group === 'pulse') return pulsatorMag(t, s);
    return s.kind === 'sn' ? supernovaMag(t, s) : novaMag(t, s);
  }
  function withPhase(s) {
    // 첫 극대가 창 안쪽 0.35주기 쯤에 오게 해 두 극대 사이를 재기 쉽게 한다.
    return s.group === 'pulse' && s.tMax === undefined ? {...s, tMax: 0.35 * s.period} : s;
  }
  // 관측일: 밤마다 고르게 찍히지 않고, 흐린 날이 이어지는 빈틈이 생긴다.
  function observe(star, seed, count = 150) {
    const s = withPhase(star), r = rng(seed), [a, b] = domain(s), pts = [];
    const gaps = [0, 1, 2].map(() => a + (b - a) * r());
    const gapW = (b - a) * 0.05;
    for (let i = 0; i < count * 1.4 && pts.length < count; i++) {
      const t = a + (b - a) * r();
      if (gaps.some(g => Math.abs(t - g) < gapW / 2)) continue;
      let m = starMag(s, t) + s.noise * gauss(r);
      const hidden = s.limit !== undefined && m > s.limit;
      pts.push({t, m: hidden ? s.limit : m, hidden});
    }
    // 폭발이 일어난 직후는 촘촘히 관측한다(실제로도 발견되면 관측이 몰린다).
    if (s.group === 'burst') {
      for (let i = 0; i < 25; i++) {
        const t = s.rise * 2.2 * r();
        const m = starMag(s, t) + s.noise * gauss(r);
        const hidden = s.limit !== undefined && m > s.limit;
        pts.push({t, m: hidden ? s.limit : m, hidden});
      }
    }
    return pts.sort((p, q) => p.t - q.t);
  }

  // ── 맥동의 원리: L = 4πR²σT⁴ ───────────────────────────────
  // 위상 0 = 온도가 가장 높은 순간. lag 는 반지름이 가장 커지는 위상(주기 비율).
  const SIGMA_SUN = {R: 44, T: 6000}; // 세페이드(케페우스자리 δ)를 닮은 평균값
  function pulsation(phase, p) {
    const r = 1 + p.dR * Math.cos(TAU * (phase - p.lag));
    const temp = 1 + p.dT * Math.cos(TAU * phase);
    const rFactor = r * r, tFactor = temp ** 4, lum = rFactor * tFactor;
    // 반지름이 변하는 빠르기(+ 팽창, − 수축)
    const velocity = -p.dR * Math.sin(TAU * (phase - p.lag));
    return {r, temp, rFactor, tFactor, lum, dMag: -2.5 * log10(lum), velocity};
  }
  function pulsationExtrema(p, n = 2000) {
    const best = {r: [0, -Infinity], temp: [0, -Infinity], lum: [0, -Infinity], minLum: [0, Infinity]};
    for (let i = 0; i < n; i++) {
      const ph = i / n, s = pulsation(ph, p);
      if (s.r > best.r[1]) best.r = [ph, s.r];
      if (s.temp > best.temp[1]) best.temp = [ph, s.temp];
      if (s.lum > best.lum[1]) best.lum = [ph, s.lum];
      if (s.lum < best.minLum[1]) best.minLum = [ph, s.lum];
    }
    return {rMax: best.r[0], tMax: best.temp[0], lMax: best.lum[0], lMin: best.minLum[0],
            lumRange: best.lum[1] / best.minLum[1], magRange: 2.5 * log10(best.lum[1] / best.minLum[1])};
  }
  // 위상 차이를 −0.5 ~ 0.5 주기로
  const phaseGap = (a, b) => ((a - b + 1.5) % 1) - 0.5;
  // 표면 온도에 따른 별의 색(흑체 색을 단순화한 근사, Tanner Helland 식)
  function starColor(T) {
    const t = T / 100;
    let r, g, b;
    if (t <= 66) { r = 255; g = 99.47 * Math.log(t) - 161.12; }
    else { r = 329.7 * (t - 60) ** -0.1332; g = 288.12 * (t - 60) ** -0.0755; }
    if (t >= 66) b = 255; else if (t <= 19) b = 0; else b = 138.52 * Math.log(t - 10) - 305.04;
    const c = v => Math.round(clamp(v, 0, 255));
    return `rgb(${c(r)},${c(g)},${c(b)})`;
  }

  // ── 우주 팽창 ────────────────────────────────────────────
  const C_KMS = 299792.458, H0 = 68; // km/s/Mpc
  const MODELS = {
    decel: {name: '감속 팽창 우주', om: 1, ol: 0},
    coast: {name: '등속 팽창 우주', om: 0, ol: 0},
    accel: {name: '가속 팽창 우주', om: 0.3, ol: 0.7}
  };
  // 활동지 5쪽(슬라이드 37쪽) Ia형 초신성 관측 자료: [적색 편이, 거리 지수]
  const SN_DATA = [
    [0.054, 36.95], [0.039, 36.33], [0.078, 37.68], [0.165, 39.42], [0.130, 38.86],
    [0.116, 38.70], [0.206, 40.03], [0.267, 40.52], [0.213, 39.99], [0.304, 41.04],
    [0.331, 41.07], [0.357, 41.45], [0.430, 42.20], [0.440, 42.01], [0.415, 41.87],
    [0.557, 42.58], [0.582, 42.70], [0.504, 42.37], [0.610, 42.90], [0.688, 43.07],
    [0.780, 43.61], [0.735, 43.10], [0.860, 43.94], [0.975, 44.27], [1.030, 44.25],
    [1.124, 44.58], [1.230, 44.94], [1.300, 44.87], [1.370, 45.03], [1.390, 44.84]
  ];
  const E = (z, om, ol) => Math.sqrt(om * (1 + z) ** 3 + (1 - om - ol) * (1 + z) ** 2 + ol);
  // 광도 거리 (Mpc). 곡률이 있는 등속(텅 빈) 우주까지 다룬다.
  function lumDistance(z, om, ol, n = 200) {
    if (z <= 0) return 0;
    let s = 0;
    for (let i = 0; i < n; i++) s += 1 / E((i + 0.5) * z / n, om, ol);
    s *= z / n;
    const ok = 1 - om - ol;
    const dc = Math.abs(ok) < 1e-9 ? s : ok > 0 ? Math.sinh(Math.sqrt(ok) * s) / Math.sqrt(ok)
                                               : Math.sin(Math.sqrt(-ok) * s) / Math.sqrt(-ok);
    return (1 + z) * (C_KMS / H0) * dc;
  }
  const distModulus = (z, om, ol) => 5 * log10(lumDistance(z, om, ol)) + 25;
  function fitStats(om, ol) {
    const res = SN_DATA.map(([z, mu]) => mu - distModulus(z, om, ol));
    const mean = res.reduce((a, b) => a + b, 0) / res.length;
    const rms = Math.sqrt(res.reduce((a, b) => a + b * b, 0) / res.length);
    return {mean, rms};
  }
  // 대폭발에서 크기 a 가 될 때까지 걸린 시간 (억 년)
  const HUBBLE_TIME = 9777.8 / H0; // 억 년 (1/H0)
  function timeAt(a1, om, ol, n = 600) {
    // t = ∫ da / (a H)  — a = u² 로 바꿔 a → 0 근처의 뾰족함을 없앤다.
    let s = 0;
    const u1 = Math.sqrt(a1);
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) * u1 / n, a = u * u;
      s += 2 * u / (a * E(1 / a - 1, om, ol));
    }
    return s * u1 / n * HUBBLE_TIME;
  }
  // 감속 → 가속으로 바뀌는 크기 (평탄 우주에서 감속 계수 q = 0 인 곳)
  const accelerationStart = (om, ol) => ol > 0 ? (om / (2 * ol)) ** (1 / 3) : null;
  function expansionHistory(om, ol, aEnd = 1.45, n = 90) {
    const now = timeAt(1, om, ol), pts = [];
    for (let i = 1; i <= n; i++) {
      const a = aEnd * (i / n) ** 1.6;
      pts.push({a, t: timeAt(a, om, ol)});
    }
    const aAcc = accelerationStart(om, ol);
    const tAcc = aAcc && aAcc < 1 ? timeAt(aAcc, om, ol) : null;
    return {age: now, pts, aAcc, tAcc, lookback: tAcc === null ? null : now - tAcc};
  }

  const api = {TAU, clamp, modulus, distanceFromModulus, brightnessRatio, PC_TO_LY, PL, absMag,
    pulseShape, pulsatorMag, maxima, novaMag, supernovaMag, rng, TYPES, randomStar, domain, starMag,
    withPhase, observe, SIGMA_SUN, pulsation, pulsationExtrema, phaseGap, starColor,
    H0, MODELS, SN_DATA, lumDistance, distModulus, fitStats, timeAt, accelerationStart, expansionHistory};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.VariableModel = api;
})(typeof window !== 'undefined' ? window : this);
