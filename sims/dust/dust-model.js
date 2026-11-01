/* 성간 티끌 실험실의 계산 모형 (DOM 없음).
   브라우저에서는 window.DustModel, Node 검증에서는 module.exports.
   교과서: 천재교과서 『행성우주과학』 Ⅲ-02 성간 소광과 성간 티끌의 특징 (102~107쪽). */
(function(root) {
  'use strict';
  const log10 = Math.log10;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  // ── 등급과 거리 (3차시 별까지의 거리 복습) ─────────────────────────
  // 거리 지수 m − M = 5 log r − 5 (r의 단위: pc)
  const modulus = r => 5 * log10(r) - 5;
  const distanceFromModulus = mu => 10 ** ((mu + 5) / 5);
  // 등급이 dm만큼 커질(어두워질) 때 남는 밝기의 비. 5등급 = 100분의 1.
  const brightnessRatio = dm => 10 ** (-0.4 * dm);
  const PC_TO_LY = 3.2616;

  // ── 파장에 따른 소광량 (교과서 105쪽 그림 13) ──────────────────────
  // Cardelli, Clayton & Mathis (1989, ApJ 345, 245)의 식. 우리은하 평균 R_V = 3.1.
  // 돌려주는 값은 A(λ)/A(V): V 필터(0.55 μm)의 소광량을 1로 둔 상댓값.
  // 수업 그림(fig/figs32.py의 curve.png)과 같은 식이다.
  const RV = 3.1;
  function ccm(lambdaUm, Rv = RV) {
    const x = 1 / lambdaUm;               // 파수 (1/μm)
    let a, b;
    if (x < 1.1) { a = 0.574 * x ** 1.61; b = -0.527 * x ** 1.61; }
    else if (x < 3.3) {
      const y = x - 1.82;
      a = 1 + 0.17699 * y - 0.50447 * y ** 2 - 0.02427 * y ** 3 + 0.72085 * y ** 4 + 0.01979 * y ** 5 - 0.77530 * y ** 6 + 0.32999 * y ** 7;
      b = 1.41338 * y + 2.28305 * y ** 2 + 1.07233 * y ** 3 - 5.38434 * y ** 4 - 0.62251 * y ** 5 + 5.30260 * y ** 6 - 2.09002 * y ** 7;
    } else if (x < 8) {
      let fa = 0, fb = 0;
      if (x >= 5.9) {
        fa = -0.04473 * (x - 5.9) ** 2 - 0.009779 * (x - 5.9) ** 3;
        fb = 0.2130 * (x - 5.9) ** 2 + 0.1207 * (x - 5.9) ** 3;
      }
      a = 1.752 - 0.316 * x - 0.104 / ((x - 4.67) ** 2 + 0.341) + fa;
      b = -3.090 + 1.825 * x + 1.206 / ((x - 4.62) ** 2 + 0.263) + fb;
    } else {
      const y = Math.min(x, 10) - 8;
      a = -1.073 - 0.628 * y + 0.137 * y ** 2 - 0.070 * y ** 3;
      b = 13.670 + 4.257 * y - 0.420 * y ** 2 + 0.374 * y ** 3;
    }
    return a + b / Rv;
  }
  // 필터(띠)의 대표 파장 (μm). B = 파란빛, V = 노란빛(초록~노랑), K = 근적외선.
  const BANDS = {U: 0.365, B: 0.44, V: 0.55, R: 0.64, I: 0.79, J: 1.25, H: 1.65, K: 2.2};
  const bandRatio = band => ccm(BANDS[band]);
  // V 등급 소광량이 Av일 때 파장 λ의 소광 등급
  const extinctionAt = (lambdaUm, Av) => Av * ccm(lambdaUm);
  // 소광 등급만큼 어두워진 뒤 남는 빛의 비율
  const transmission = (lambdaUm, Av) => brightnessRatio(extinctionAt(lambdaUm, Av));
  // 지구 대기의 산란(노을·파란 하늘 비유용). 짧은 파장일수록 훨씬 많이 산란된다(파장의 4제곱에 반비례).
  // tauV: V(0.55 μm)에서의 등급 감소량
  const airExtinction = (lambdaUm, tauV) => tauV * (BANDS.V / lambdaUm) ** 4;

  // ── 색초과와 소광 등급 (교과서 106쪽) ───────────────────────────────
  // 우리은하에서 성간 소광에 의한 V 등급의 증가량(소광 등급 A_V)은 색초과의 약 3배.
  // 수업 문항(Q3·Q4)과 교과서 124쪽 10번은 A_V = 3E로 계산하므로 여기서도 3을 쓴다.
  const AV_PER_E = 3;
  const colorExcess = (bvObs, bvInt) => bvObs - bvInt;
  const avFromE = E => AV_PER_E * E;
  const eFromAv = Av => Av / AV_PER_E;
  // 티끌이 없을 때의 V 등급 V0과 고유 색지수 bv0을 가진 별이 소광 등급 Av만큼의 티끌을 지난 뒤
  // A_B = A_V + E (B 등급이 V 등급보다 색초과만큼 더 커진다)
  function redden(star, Av) {
    const E = eFromAv(Av), AB = Av + E;
    const B0 = star.V0 + star.bv0;
    return {V0: star.V0, B0, bv0: star.bv0, Av, AB, E,
            V: star.V0 + Av, B: B0 + AB, bv: star.bv0 + E};
  }

  // ── 소광을 넣은 거리 지수 (교과서 105쪽, 지도서 188쪽) ───────────────
  // ① m₀ − M = 5 log r − 5  ② m = m₀ + A  ③ m − A − M = 5 log r − 5
  // 소광을 무시하면 m − M = 5 log r′ − 5 → 5 log(r′/r) = A → r′/r = 10^(A/5)
  function distances(m, M, A) {
    const muObs = m - M, mu0 = m - A - M;
    return {muObs, mu0, m0: m - A, rTrue: distanceFromModulus(mu0), rNaive: distanceFromModulus(muObs), factor: 10 ** (A / 5)};
  }
  const overestimate = A => 10 ** (A / 5);
  // 거리 착각 비 r′/r로부터 그만큼을 만드는 소광 등급
  const extinctionForRatio = ratio => 5 * log10(ratio);

  // ── 별빛의 색 (표시용) ─────────────────────────────────────────────
  // 색지수 B − V → 화면 색. 수업 그림(06 성단과 C-M도 figs_cmd.py starcol)과 같은 눈금에
  // 성간 적색화로 생기는 큰 색지수(2~3)를 이어 붙였다.
  const BV_STOPS = [[-0.3, [155, 176, 255]], [0.0, [202, 216, 255]], [0.4, [248, 247, 255]], [0.65, [255, 244, 222]],
                    [1.0, [255, 214, 160]], [1.4, [255, 180, 110]], [2.0, [255, 140, 70]], [3.0, [236, 88, 46]]];
  function bvColor(bv) {
    if (bv <= BV_STOPS[0][0]) return BV_STOPS[0][1].slice();
    for (let i = 1; i < BV_STOPS.length; i++) {
      const [b1, c1] = BV_STOPS[i];
      if (bv <= b1) {
        const [b0, c0] = BV_STOPS[i - 1], t = (bv - b0) / (b1 - b0);
        return c0.map((c, k) => Math.round(c + (c1[k] - c) * t));
      }
    }
    return BV_STOPS[BV_STOPS.length - 1][1].slice();
  }
  const rgb = c => `rgb(${c[0]},${c[1]},${c[2]})`;

  // ── 01 성운 만들기 ────────────────────────────────────────────────
  // 위에서 내려다본 배치. x: 왼쪽~오른쪽(0~100), z: 관측자로부터의 거리(0~100, 클수록 멀다).
  // 배경 별은 모든 구름보다 멀리(z > 100) 있다.
  const REACH = 24;                       // 별빛·자외선이 강하게 닿는 거리
  const HALF = {dust: 13, gas: 15};       // 하늘에서 구름이 차지하는 반폭
  const dist2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  // front가 back보다 관측자에 가깝고, 하늘에서 겹쳐 보이는가
  const covers = (front, back, half) => back.z > front.z && Math.abs(front.x - back.x) < half;
  function nebulaScene(s) {
    const dStarGas = dist2(s.star, s.gas), dStarDust = dist2(s.star, s.dust);
    const gasLit = s.star.hot && dStarGas < REACH;            // 자외선 → 수소 이온화 → 방출 성운
    const gasNear = dStarGas < REACH;
    const dustLit = dStarDust < REACH;                         // 별빛 산란 → 반사 성운
    const behind = [];
    if (s.background) behind.push('stars');
    if (gasLit && covers(s.dust, s.gas, HALF.dust + HALF.gas * 0.6)) behind.push('gas');
    if (covers(s.dust, s.star, HALF.dust)) behind.push('star');
    const starHidden = covers(s.dust, s.star, HALF.dust * 0.75);
    const dust = dustLit ? 'reflection' : behind.length ? 'dark' : 'invisible';
    const gas = gasLit ? 'emission' : 'invisible';
    return {gas, dust, gasLit, gasNear, dustLit, dustAlsoDark: dustLit && behind.length > 0,
            behind, starHidden, dStarGas, dStarDust,
            gasState: gasLit ? 'HII' : 'HI', dustState: 'molecular'};
  }
  // 「○○ 성운 만들기」 단추의 배치. dark는 말머리 성운처럼 빛나는 방출 성운 앞에 티끌 구름을 둔다.
  const NEBULA_PRESETS = {
    dark: {star: {x: 76, z: 72, hot: true}, gas: {x: 60, z: 78}, dust: {x: 44, z: 38}},
    refl: {star: {x: 42, z: 56, hot: false}, gas: {x: 14, z: 84}, dust: {x: 58, z: 62}},
    emis: {star: {x: 50, z: 62, hot: true}, gas: {x: 50, z: 66}, dust: {x: 86, z: 24}}
  };
  // 수업 슬라이드 6·7쪽의 세 가지 상태
  const ISM_STATES = {
    molecular: {name: '분자 구름', temp: '약 10 K', T: 10},
    HI: {name: '중성수소(HⅠ) 영역', temp: '약 100 K', T: 100},
    HII: {name: '전리수소(HⅡ) 영역', temp: '약 1만 K', T: 10000}
  };
  // 성간 물질의 질량 구성 (교과서 102·104쪽)
  const ISM_MASS = {hydrogen: 74, helium: 24, dust: 1};

  // ── 02 암흑 성운 모형 (교과서 104쪽 해 보기, 바너드 68) ──────────────
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
  // 시야: 가로 1, 세로 0.75. 구름 가운데와 모양(둥근 몸통 + 왼쪽 아래로 뻗은 꼬리)은 바너드 68을 닮게 했다.
  const FIELD = {w: 1, h: 0.75, cx: 0.52, cy: 0.35};
  const LOBES = [{x: 0.52, y: 0.35, s: 0.15, w: 1}, {x: 0.375, y: 0.49, s: 0.08, w: 0.85}];
  // 티끌의 양(가운데 = 1, 바깥 = 0). 가장자리가 비교적 또렷한 모양.
  function cloudShape(x, y) {
    let keep = 1;
    for (const L of LOBES) {
      const r = Math.hypot(x - L.x, y - L.y) / L.s;
      keep *= 1 - L.w * Math.exp(-0.5 * r ** 4);
    }
    return 1 - keep;
  }
  const LIMIT = 21;                  // 이보다 어두우면(등급이 크면) 영상에 찍히지 않는다
  const M_BRIGHT = 11, M_FAINT = 23, LF_SLOPE = 0.32;   // 어두운 별일수록 많다(1등급마다 약 2배)
  function makeField(seed = 68, n = 10000) {
    const r = rng(seed), out = [];
    const span = 10 ** (LF_SLOPE * (M_FAINT - M_BRIGHT)) - 1;
    for (let i = 0; i < n; i++) {
      const x = r(), y = r() * FIELD.h, u = r();
      const m0 = M_BRIGHT + log10(1 + u * span) / LF_SLOPE;
      const bv0 = 0.2 + 1.1 * r() * r() + 0.25 * r();
      out.push({x, y, m0, bv0, shape: cloudShape(x, y)});
    }
    return out;
  }
  // 띠(band)별 소광 등급: 가시광선은 V, 적외선은 K(2.2 μm)
  const bandFactor = band => band === 'ir' ? bandRatio('K') : 1;
  // A0: 구름 가운데의 V 소광 등급
  function seeStar(star, A0, band) {
    const Av = A0 * star.shape, A = Av * bandFactor(band);
    const m = star.m0 + A;
    return {Av, A, m, visible: m < LIMIT, bv: star.bv0 + eFromAv(Av), wouldSee: star.m0 < LIMIT};
  }
  const inCircle = (s, c) => Math.hypot(s.x - c.x, s.y - c.y) < c.r;
  // 가운데 원과, 같은 넓이의 바깥 원
  const PROBES = {inner: {x: 0.52, y: 0.35, r: 0.1}, outer: {x: 0.13, y: 0.14, r: 0.1}};
  function countIn(field, A0, band, circle) {
    let n = 0, hidden = 0;
    for (const s of field) if (inCircle(s, circle)) {
      const v = seeStar(s, A0, band);
      if (v.visible) n++; else if (v.wouldSee) hidden++;
    }
    return {visible: n, hidden};
  }
  // 구름 가운데에서 바깥으로 고리마다, 같은 넓이당 보이는 별의 수
  function radialProfile(field, A0, band, rings = 6, rMax = 0.33) {
    const out = [];
    for (let i = 0; i < rings; i++) {
      const r1 = rMax * i / rings, r2 = rMax * (i + 1) / rings;
      let n = 0;
      for (const s of field) {
        const d = Math.hypot(s.x - FIELD.cx, s.y - FIELD.cy);
        if (d >= r1 && d < r2 && seeStar(s, A0, band).visible) n++;
      }
      out.push({r1, r2, n, density: n / (Math.PI * (r2 * r2 - r1 * r1))});
    }
    return out;
  }
  // 티끌 때문에 가시광선에서는 사라졌지만 적외선에서는 보이는 별
  function onlyInIR(field, A0) {
    let n = 0;
    for (const s of field) if (!seeStar(s, A0, 'vis').visible && seeStar(s, A0, 'ir').visible) n++;
    return n;
  }

  // ── 03 별빛 알갱이가 티끌을 지날 때 ─────────────────────────────────
  // 파란빛(짧은 파장)과 붉은빛(긴 파장)이 티끌 층을 그대로 통과할 확률
  const LIGHT = {blue: 0.44, red: 0.65};
  function passProbability(color, Av, medium = 'space') {
    const lam = LIGHT[color];
    const A = medium === 'air' ? airExtinction(lam, Av) : extinctionAt(lam, Av);
    return brightnessRatio(A);
  }

  // ── 04 성단의 C-M도 이동 (교과서 124쪽 10번) ─────────────────────────
  // 성단의 별들은 거리가 같으므로 모두 같은 양만큼 옮겨진다: 색지수 +E, 겉보기 등급 +3E
  const shiftCMD = (pts, E) => pts.map(([bv, V]) => [bv + E, V + avFromE(E)]);

  // ── 수업·교과서 예제 (테스트로 값을 고정) ───────────────────────────
  const EXAMPLES = {
    // 수업 Q2: 겉보기 등급 12, 절대 등급 2, 소광 등급 5 → 1000 pc로 착각, 실제 100 pc, 10배
    q2: {m: 12, M: 2, A: 5},
    // 수업 Q3: 10000 K 주계열성(고유 색지수 0), B 12.6, V 12.1, M_V 0.6 → E 0.5, A_V 1.5, 1000 pc
    q3: {B: 12.6, V: 12.1, bv0: 0, M: 0.6},
    // 수업 Q4: ⓐ 원반 밖 방향, ⓑ 원반 방향. 실제 거리 같음, M_V +1.0
    q4: {a: {bvObs: 0.4, bv0: 0.2, M: 1.0}, b: {bvObs: 1.2, bv0: 0.2, M: 1.0, V: 14.0}},
    // 06 성단과 C-M도 해 보기 ②: 주계열 맞추기로 구한 M3 거리 17400 pc, 실제 10400 pc (교과서 97쪽)
    m3: {fitted: 17400, actual: 10400, E: 0.01}
  };

  const api = {clamp, modulus, distanceFromModulus, brightnessRatio, PC_TO_LY,
    RV, ccm, BANDS, bandRatio, extinctionAt, transmission, airExtinction,
    AV_PER_E, colorExcess, avFromE, eFromAv, redden,
    distances, overestimate, extinctionForRatio, bvColor, rgb,
    REACH, HALF, nebulaScene, NEBULA_PRESETS, ISM_STATES, ISM_MASS,
    rng, FIELD, LOBES, cloudShape, LIMIT, makeField, bandFactor, seeStar, PROBES, countIn, radialProfile, onlyInIR,
    LIGHT, passProbability, shiftCMD, EXAMPLES};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DustModel = api;
})(typeof window !== 'undefined' ? window : this);
