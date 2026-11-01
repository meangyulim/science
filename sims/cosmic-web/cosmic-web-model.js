/* 우주거대구조 모의실험 — 교육용 2차원 입자-격자(PM) 중력 모형.
   브라우저(window.CosmicWebModel)와 Node 테스트에서 함께 쓴다. DOM은 쓰지 않는다.

   단위: 상자 한 변 = 1 (공변 좌표, 현재 기준 140 Mpc), 시간 = 1/H0, 시간 변수는 우주의 크기 a (현재 = 1).
   입자의 운동량 p = a² dx/dt 를 쓰면
     dx/da = p / (a³ E),   dp/da = −∇φ / (a² E),   ∇²φ = (3/2) Ωm δ,
     E(a) = H(a)/H0 = √(Ωm a⁻³ + Ωk a⁻² + ΩΛ)   (프리드만 방정식, Ωk = 1 − Ωm − ΩΛ)
   δ = 밀도/평균 밀도 − 1. 2차원에서도 선형 성장(성장 인자 D)은 3차원과 같은 식을 따른다. */
(function (root) {
  'use strict';
  const TAU = 2 * Math.PI;

  // ── 우주 모형 (교과서 그림 28) ──────────────────────────────────
  const H0 = 68;                       // km/s/Mpc — 변광성 실험실과 같은 값
  const HUBBLE_TIME = 9777.8 / H0;     // 1/H0 를 억 년으로
  const BOX_MPC = 140;                 // 교과서 그림 27: 상자 = 현재 기준 140 Mpc
  const A_START = 0.01;                // 계산 시작: 우주의 크기가 현재의 1 % (적색 편이 99)
  const H_LITTLE = H0 / 100;
  const MODELS = {
    accel: {key: 'accel', tag: '가', name: '평탄한 가속 팽창 우주', om: 0.3, ol: 0.7},
    open:  {key: 'open',  tag: '나', name: '열린 우주',             om: 0.3, ol: 0},
    flat:  {key: 'flat',  tag: '다', name: '평탄한 우주',           om: 1.0, ol: 0}
  };

  const cosCache = {};
  // 모형 하나의 팽창 역사: 나이 t(a), 크기 a(t), 성장 인자 D(a), 성장률 f(a), 킥·드리프트 적분
  function cosmology(model) {
    const m = typeof model === 'string' ? MODELS[model] : model;
    const key = m.om + '/' + m.ol;
    if (cosCache[key]) return cosCache[key];
    const om = m.om, ol = m.ol, ok = 1 - om - ol;
    const E = a => Math.sqrt(om / (a * a * a) + ok / (a * a) + ol);
    // u = √a 로 바꾸면 a → 0 근처에서도 피적분 함수가 매끄럽다.
    //   t = ∫ 2u² du / √(Ωm + Ωk u² + ΩΛ u⁶),   I = ∫ da/(aE)³ = ∫ 2u⁴ du / (Ωm + Ωk u² + ΩΛ u⁶)^1.5
    const gt = u => { const s = om + ok * u * u + ol * u ** 6; return 2 * u * u / Math.sqrt(s); };
    const gi = u => { const s = om + ok * u * u + ol * u ** 6; return 2 * u ** 4 / (s * Math.sqrt(s)); };
    const n = 3000, uMax = Math.sqrt(1.2), h = uMax / n;
    const T = new Float64Array(n + 1), I = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) {
      const u0 = i * h, u1 = u0 + h, um = u0 + h / 2;
      T[i + 1] = T[i] + h / 6 * (gt(u0) + 4 * gt(um) + gt(u1));
      I[i + 1] = I[i] + h / 6 * (gi(u0) + 4 * gi(um) + gi(u1));
    }
    function interp(tab, a) {
      const u = Math.sqrt(Math.max(0, a)) / h, i = Math.min(n - 1, Math.floor(u)), w = u - i;
      return tab[i] * (1 - w) + tab[i + 1] * w;
    }
    const tH = a => interp(T, a);                 // 1/H0 단위
    const age = a => tH(a) * HUBBLE_TIME;          // 억 년
    function aAt(ageYr) {
      const t = ageYr / HUBBLE_TIME;
      if (t <= 0) return 0;
      let lo = 0, hi = n;
      if (t >= T[n]) return uMax * uMax;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (T[mid] < t) lo = mid; else hi = mid; }
      const u = (lo + (t - T[lo]) / (T[hi] - T[lo])) * h;
      return u * u;
    }
    // 성장 인자: D(a) = (5Ωm/2) E(a) ∫₀ᵃ da′/(a′E)³ — 이른 시기에 D ≈ a 가 되도록 맞춘 값
    const D = a => 2.5 * om * E(a) * Math.max(interp(I, a), 1e-300);
    function f(a) {
      const e2 = om / (a * a * a) + ok / (a * a) + ol;
      return (-3 * om / (a * a * a) - 2 * ok / (a * a)) / (2 * e2) + 1 / (a * a * e2 * Math.sqrt(e2) * interp(I, a));
    }
    // 시간 적분: 킥 ∫da/(a²E), 드리프트 ∫da/(a³E) — 심프슨 8칸
    function simpson(g, a1, a2) {
      const k = 8, d = (a2 - a1) / k;
      let s = g(a1) + g(a2);
      for (let i = 1; i < k; i++) s += (i & 1 ? 4 : 2) * g(a1 + i * d);
      return s * d / 3;
    }
    const kick = (a1, a2) => simpson(a => 1 / (a * a * E(a)), a1, a2);
    const drift = (a1, a2) => simpson(a => 1 / (a * a * a * E(a)), a1, a2);
    const c = {model: m, om, ol, ok, E, age, aAt, D, f, kick, drift, ageNow: age(1)};
    cosCache[key] = c;
    return c;
  }
  // 그래프용: 대폭발부터 현재(a = 1)까지의 크기 변화
  function expansionCurve(model, n = 120) {
    const c = cosmology(model), pts = [{t: 0, a: 0}];
    for (let i = 1; i <= n; i++) { const a = (i / n) ** 1.5; pts.push({t: c.age(a), a}); }
    return pts;
  }

  // ── 고속 푸리에 변환 (기수 2, 제자리 계산) ───────────────────────
  // 정방향 X_k = Σ x_j e^(−2πi jk/n), 역방향 x_j = Σ X_k e^(+2πi jk/n) (1/n 을 곱하지 않음)
  const fftCache = {};
  function makeFFT(n) {
    if (fftCache[n]) return fftCache[n];
    const bits = Math.round(Math.log2(n));
    if (n < 2 || (1 << bits) !== n) throw new Error('FFT 크기는 2의 거듭제곱이어야 합니다: ' + n);
    const rev = new Uint32Array(n);
    for (let i = 0; i < n; i++) {
      let r = 0;
      for (let b = 0, v = i; b < bits; b++, v >>= 1) r = (r << 1) | (v & 1);
      rev[i] = r;
    }
    const cs = new Float64Array(n / 2), sn = new Float64Array(n / 2);
    for (let i = 0; i < n / 2; i++) { cs[i] = Math.cos(TAU * i / n); sn[i] = Math.sin(TAU * i / n); }
    // off, stride: 2차원 배열의 한 행(stride 1) 또는 한 열(stride n)
    function transform(re, im, inverse, off = 0, stride = 1) {
      for (let i = 0; i < n; i++) {
        const j = rev[i];
        if (j > i) {
          const p = off + i * stride, q = off + j * stride;
          let t = re[p]; re[p] = re[q]; re[q] = t;
          t = im[p]; im[p] = im[q]; im[q] = t;
        }
      }
      const sg = inverse ? -1 : 1;
      for (let size = 2; size <= n; size <<= 1) {
        const half = size >> 1, step = n / size;
        for (let i = 0; i < n; i += size) {
          for (let j = 0, k = 0; j < half; j++, k += step) {
            const p = off + (i + j) * stride, q = p + half * stride;
            const c = cs[k], s = sg * sn[k];
            const xr = re[q], xi = im[q];
            const tr = xr * c + xi * s, ti = xi * c - xr * s;
            re[q] = re[p] - tr; im[q] = im[p] - ti;
            re[p] += tr; im[p] += ti;
          }
        }
      }
    }
    const api = {n, transform};
    // 2차원 (행 우선 n×n): 모든 행, 그다음 모든 열
    api.transform2 = (re, im, inverse) => {
      for (let r = 0; r < n; r++) transform(re, im, inverse, r * n, 1);
      for (let c = 0; c < n; c++) transform(re, im, inverse, c, n);
    };
    fftCache[n] = api;
    return api;
  }
  const fft = (re, im, inverse) => makeFFT(re.length).transform(re, im, inverse);
  const fft2 = (re, im, n, inverse) => makeFFT(n).transform2(re, im, inverse);

  // ── 난수 (같은 seed → 같은 결과) ────────────────────────────────
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
  function hash3(a, b, c) {
    let h = Math.imul(a | 0, 0x9E3779B1) ^ Math.imul(b | 0, 0x85EBCA77) ^ Math.imul(c | 0, 0xC2B2AE3D);
    h = Math.imul(h ^ (h >>> 16), 0x7FEB352D);
    h = Math.imul(h ^ (h >>> 15), 0x846CA68B);
    return (h ^ (h >>> 16)) >>> 0;
  }
  // 파수 (mx, my) 하나마다 정해진 가우스 난수 두 개 — 격자 크기(입자 수)가 달라도 큰 무늬는 같다.
  function modeGauss(seed, mx, my) {
    const r = rng(hash3(seed, mx + 4096, my + 4096));
    let u = r();
    while (u === 0) u = r();
    const rad = Math.sqrt(-2 * Math.log(u)), th = TAU * r();
    return [rad * Math.cos(th), rad * Math.sin(th)];
  }

  // ── 초기 밀도 요동의 무늬 (파워 스펙트럼) ────────────────────────
  // 차가운 물질 우주의 전달 함수(BBKS). 물질이 많을수록(Ωm h² 가 클수록) 작은 규모의 요동이 상대적으로 크다.
  function transfer(q) {
    if (q < 1e-9) return 1;
    const x = 2.34 * q;
    return Math.log(1 + x) / x * Math.pow(1 + 3.89 * q + (16.1 * q) ** 2 + (5.46 * q) ** 3 + (6.71 * q) ** 4, -0.25);
  }
  // 2차원 교육용 스펙트럼: 규모마다의 요동 세기(k² P)가 3차원 우주(k³ P)와 같은 모양이 되도록 P₂(k) ∝ k² T²
  const SMOOTH_MPC = 8 / H_LITTLE;         // 정규화 기준 규모 (약 12 Mpc)
  function spectrumShape(kMpc, om, kCut) {
    const t = transfer(kMpc / (om * H_LITTLE * H_LITTLE));
    const c = kMpc / kCut;
    return kMpc * kMpc * t * t * Math.exp(-c * c);
  }
  // 초기 요동의 세기. 세 우주 모두 '시작할 때 작은 규모(matchR)의 밀도 차이'가 같다.
  // 가·나는 물질의 양이 같아 초기 우주가 똑같다(같은 무늬, 같은 세기). 다는 물질이 많아 작은 무늬가 더 많은
  // 스펙트럼으로 시작하므로, 같은 작은 규모 세기에서는 큰 규모의 요동이 가·나보다 약하다.
  // sigma: 가 우주의 선형 밀도장을 '이른 시기처럼 D = a 로 자란다'고 보고 a = 1 까지 늘였을 때의 SMOOTH_MPC 규모 표준 편차.
  //   0.7 → 가 우주의 현재 선형 σ ≈ 0.55. 그림 27처럼 10억 년에는 흐린 그물, 현재는 뚜렷한 그물과 보이드가 된다.
  // matchR = 1.2 Mpc 에서 맞추면 다 우주의 큰 규모 요동은 현재 가의 약 0.6배가 된다
  //   (그림 28의 실제 모의실험도 물질만 있는 우주를 σ8 ≈ 0.5, 가속 팽창 우주를 ≈ 0.9 로 맞췄다).
  const IC = {sigma: 0.7, matchR: 1.2, refN: 128};
  function modelSpec(model, N) {
    const m = typeof model === 'string' ? MODELS[model] : model;
    return {om: m.om, kCut: 0.6 * Math.PI * N / BOX_MPC};
  }
  // 상자의 파수(기준 격자 refN)로 더한 σ_R — 입자 수(격자 크기)와 상관없이 같은 값
  const sigCache = {};
  function sigmaR(om, R) {
    const key = om + '/' + R + '/' + IC.refN;
    if (sigCache[key] !== undefined) return sigCache[key];
    const h = IC.refN / 2, kCut = 0.6 * Math.PI * IC.refN / BOX_MPC;
    let s = 0;
    for (let my = -h + 1; my < h; my++) for (let mx = -h + 1; mx < h; mx++) {
      if (!mx && !my) continue;
      const k = TAU * Math.hypot(mx, my) / BOX_MPC;
      s += spectrumShape(k, om, kCut) * Math.exp(-k * k * R * R);
    }
    return (sigCache[key] = Math.sqrt(s));
  }
  // 스펙트럼 모양에 곱할 세기: 작은 규모(matchR)의 표준 편차가 가 우주와 같아지게
  function normFactor(N, spec) {
    const target = IC.sigma * sigmaR(0.3, IC.matchR) / sigmaR(0.3, SMOOTH_MPC);
    return target / sigmaR(spec.om, IC.matchR);
  }
  // 선형 밀도장(D = 1 기준)의 푸리에 계수 c_k 와 변위장 ψ (δ = −∇·ψ)
  function initialField(N, seed, spec, amp) {
    const n2 = N * N, cre = new Float64Array(n2), cim = new Float64Array(n2);
    const A = normFactor(N, spec) * amp, h = N / 2;
    if (amp !== 0) {
      for (let j = 0; j < N; j++) {
        const my = j <= h ? j : j - N;
        for (let i = 0; i < N; i++) {
          const mx = i <= h ? i : i - N;
          if ((!mx && !my) || Math.abs(mx) === h || Math.abs(my) === h) continue;
          const canon = my > 0 || (my === 0 && mx > 0);
          const g = canon ? modeGauss(seed, mx, my) : modeGauss(seed, -mx, -my);
          const k = TAU * Math.hypot(mx, my) / BOX_MPC;
          const s = A * Math.sqrt(spectrumShape(k, spec.om, spec.kCut) / 2);
          cre[j * N + i] = s * g[0];
          cim[j * N + i] = (canon ? s : -s) * g[1];
        }
      }
    }
    // Ψ_k = ψx_k + i ψy_k = c_k (i kx − ky)/k²  (k 는 상자 단위 2π m)
    const re = new Float64Array(n2), im = new Float64Array(n2);
    for (let j = 0; j < N; j++) {
      const my = j <= h ? j : j - N;
      for (let i = 0; i < N; i++) {
        const mx = i <= h ? i : i - N, idx = j * N + i;
        if (!mx && !my) continue;
        const kx = TAU * mx, ky = TAU * my, k2 = kx * kx + ky * ky;
        const a = cre[idx], b = cim[idx];
        // (a + ib)(−ky + i kx) / k²
        re[idx] = (-a * ky - b * kx) / k2;
        im[idx] = (a * kx - b * ky) / k2;
      }
    }
    fft2(re, im, N, true);
    return {psiX: re, psiY: im, cre, cim};
  }

  // ── 질량 배정(CIC)과 중력 ──────────────────────────────────────
  // 입자 하나를 둘레 네 격자점에 거리에 따라 나눠 준다. out 에는 '격자 한 칸에 든 입자 수'가 더해진다.
  function depositCIC(x, y, count, M, out) {
    out.fill(0);
    const mask = M - 1;
    for (let p = 0; p < count; p++) {
      const gx = x[p] * M, gy = y[p] * M;
      let i = Math.floor(gx), j = Math.floor(gy);
      const dx = gx - i, dy = gy - j;
      i &= mask; j &= mask;
      const i1 = (i + 1) & mask, j1 = (j + 1) & mask;
      out[j * M + i] += (1 - dx) * (1 - dy);
      out[j * M + i1] += dx * (1 - dy);
      out[j1 * M + i] += (1 - dx) * dy;
      out[j1 * M + i1] += dx * dy;
    }
    return out;
  }
  // 격자의 상대 밀도(평균 = 1). M 은 2의 거듭제곱.
  function densityGrid(x, y, count, M, out) {
    out = out || new Float64Array(M * M);
    depositCIC(x, y, count, M, out);
    const k = M * M / count;
    for (let i = 0; i < out.length; i++) out[i] *= k;
    return out;
  }
  // 푸아송 방정식 ∇²φ = (3/2) Ωm δ 를 격자에서 풀고 힘 −∇φ 를 돌려준다(이산 라플라시안과 중심 차분의 푸리에 꼴).
  function makeSolver(N) {
    const n2 = N * N, re = new Float64Array(n2), im = new Float64Array(n2), F = makeFFT(N);
    const green = new Float64Array(n2), kdx = new Float64Array(N);
    for (let i = 0; i < N; i++) kdx[i] = N * Math.sin(TAU * i / N);   // 중심 차분의 기호
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const s = Math.sin(Math.PI * i / N) ** 2 + Math.sin(Math.PI * j / N) ** 2;
      green[j * N + i] = s > 0 ? 1 / (4 * N * N * s) / n2 : 0;      // 1/k_eff² 와 1/N² 정규화
    }
    // delta: 격자의 δ. 결과 fx, fy 에 격자점의 힘(상자 단위, 계수 3Ωm/2 포함)
    function forces(delta, om, fx, fy) {
      re.set(delta); im.fill(0);
      F.transform2(re, im, false);
      const c = 1.5 * om;
      for (let j = 0; j < N; j++) {
        const ky = kdx[j];
        for (let i = 0; i < N; i++) {
          const idx = j * N + i, g = c * green[idx], kx = kdx[i];
          const a = re[idx] * g, b = im[idx] * g;
          // G = Fx + iFy = (3Ωm/2) δ_k / k² × (−ky + i kx)
          re[idx] = -a * ky - b * kx;
          im[idx] = a * kx - b * ky;
        }
      }
      F.transform2(re, im, true);
      fx.set(re); fy.set(im);
    }
    // 단일 모드 시험용: 퍼텐셜 φ 자체
    function potential(delta, om, out) {
      re.set(delta); im.fill(0);
      F.transform2(re, im, false);
      for (let i = 0; i < n2; i++) { re[i] *= -1.5 * om * green[i]; im[i] *= -1.5 * om * green[i]; }
      F.transform2(re, im, true);
      out.set(re);
      return out;
    }
    return {N, forces, potential};
  }
  // 격자의 값을 입자 위치로 보간(CIC, 배정과 같은 가중치 → 자기 자신을 끌어당기지 않는다)
  function interpCIC(x, y, count, M, gx, gy, outX, outY) {
    const mask = M - 1;
    for (let p = 0; p < count; p++) {
      const ux = x[p] * M, uy = y[p] * M;
      let i = Math.floor(ux), j = Math.floor(uy);
      const dx = ux - i, dy = uy - j;
      i &= mask; j &= mask;
      const i1 = (i + 1) & mask, j1 = (j + 1) & mask;
      const w00 = (1 - dx) * (1 - dy), w10 = dx * (1 - dy), w01 = (1 - dx) * dy, w11 = dx * dy;
      const a = j * M + i, b = j * M + i1, c = j1 * M + i, d = j1 * M + i1;
      outX[p] = gx[a] * w00 + gx[b] * w10 + gx[c] * w01 + gx[d] * w11;
      outY[p] = gy[a] * w00 + gy[b] * w10 + gy[c] * w01 + gy[d] * w11;
    }
  }

  // ── 모의실험 ────────────────────────────────────────────────
  // opts: N(한 변 입자 수 = 격자 수, 2의 거듭제곱), seed, model, amp(초기 밀도 차이 배율), aStart
  function createSim(opts) {
    const N = opts.N || 128, seed = opts.seed === undefined ? 7 : opts.seed;
    const modelKey = opts.model || 'accel', amp = opts.amp === undefined ? 1 : opts.amp;
    const cos = cosmology(modelKey), om = cos.om;
    const np = N * N, aStart = opts.aStart || A_START;
    const spec = opts.spec || modelSpec(modelKey, N);
    const x = new Float64Array(np), y = new Float64Array(np), px = new Float64Array(np), py = new Float64Array(np);
    const ax = new Float64Array(np), ay = new Float64Array(np);
    const rho = new Float64Array(np), gx = new Float64Array(np), gy = new Float64Array(np);
    const solver = makeSolver(N);
    const ic = initialField(N, seed, spec, amp);
    const D = cos.D(aStart), vel = aStart * aStart * cos.E(aStart) * cos.f(aStart) * D;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const p = j * N + i, sx = ic.psiX[p], sy = ic.psiY[p];
      x[p] = wrap(i / N + D * sx); y[p] = wrap(j / N + D * sy);
      px[p] = vel * sx; py[p] = vel * sy;
    }
    const sim = {N, np, seed, model: modelKey, amp, spec, cos, x, y, px, py, a: aStart, aStart, steps: 0};
    function accel() {
      depositCIC(x, y, np, N, rho);
      for (let i = 0; i < np; i++) rho[i] -= 1;                       // 평균 1 → δ
      solver.forces(rho, om, gx, gy);
      interpCIC(x, y, np, N, gx, gy, ax, ay);
    }
    accel();
    // 킥-드리프트-킥(도약 개구리) 한 걸음: a → a1
    sim.step = function (a1) {
      const a0 = sim.a, ah = Math.sqrt(a0 * a1);
      const k1 = cos.kick(a0, ah), dr = cos.drift(a0, a1), k2 = cos.kick(ah, a1);
      for (let p = 0; p < np; p++) {
        px[p] += ax[p] * k1; py[p] += ay[p] * k1;
        x[p] = wrap(x[p] + px[p] * dr); y[p] = wrap(y[p] + py[p] * dr);
      }
      accel();
      for (let p = 0; p < np; p++) { px[p] += ax[p] * k2; py[p] += ay[p] * k2; }
      sim.a = a1; sim.steps++;
    };
    // 다음 걸음의 크기: ln a 로 dln 이하, a 로 da 이하
    sim.nextA = function (target, dln = STEP.dln, da = STEP.da) {
      const a = sim.a;
      return Math.min(target, a * Math.exp(dln), a + da);
    };
    sim.advanceTo = function (target, dln, da) {
      while (sim.a < target - 1e-12) sim.step(sim.nextA(target, dln, da));
    };
    sim.density = (M, out) => densityGrid(x, y, np, M, out);
    return sim;
  }
  const STEP = {dln: 0.08, da: 0.025};
  function wrap(v) { v -= Math.floor(v); return v >= 1 ? 0 : v; }

  // ── 밀도 통계 ───────────────────────────────────────────────
  // 상대 밀도 격자의 표준 편차(평균과의 차이), 최댓값, 최솟값
  function densityStats(grid) {
    let s = 0, mx = -Infinity, mn = Infinity;
    for (let i = 0; i < grid.length; i++) {
      const d = grid[i] - 1;
      s += d * d;
      if (grid[i] > mx) mx = grid[i];
      if (grid[i] < mn) mn = grid[i];
    }
    return {rms: Math.sqrt(s / grid.length), max: mx, min: mn};
  }
  // 주기 경계에서 가우스 흐리기(가로·세로 따로), sigma 는 칸 단위
  function smoothGrid(grid, M, sigma) {
    const r = Math.max(1, Math.ceil(3 * sigma)), w = [];
    let tot = 0;
    for (let d = -r; d <= r; d++) { const v = Math.exp(-d * d / (2 * sigma * sigma)); w.push(v); tot += v; }
    for (let i = 0; i < w.length; i++) w[i] /= tot;
    const tmp = new Float64Array(M * M), out = new Float64Array(M * M), mask = M - 1;
    for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) {
      let s = 0;
      for (let d = -r; d <= r; d++) s += w[d + r] * grid[j * M + ((i + d) & mask)];
      tmp[j * M + i] = s;
    }
    for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) {
      let s = 0;
      for (let d = -r; d <= r; d++) s += w[d + r] * tmp[((j + d) & mask) * M + i];
      out[j * M + i] = s;
    }
    return out;
  }

  // ── 은하단 · 필라멘트 · 보이드 나누기 ─────────────────────────────
  // 흐린 상대 밀도 ρ(평균 = 1)로 칸을 나눈다: 보이드 = 우주 평균보다 밀도가 낮은 곳(ρ < 1),
  // 은하단 = ρ ≥ clusterMin 인 봉우리와 그 둘레(ρ ≥ clusterEdge), 나머지(평균 이상) = 필라멘트.
  const CLASS = {void: 0, filament: 1, cluster: 2};
  const THRESH = {voidMax: 1.0, clusterMin: 6, clusterEdge: 3, smooth: 1.0};
  function classify(raw, M, opt) {
    const o = Object.assign({}, THRESH, opt || {});
    const rho = smoothGrid(raw, M, o.smooth), n = M * M, mask = M - 1;
    const cls = new Uint8Array(n);
    for (let i = 0; i < n; i++) cls[i] = rho[i] < o.voidMax ? CLASS.void : CLASS.filament;
    // 은하단: 문턱보다 높은 봉우리(둘레 8칸보다 큼). 가까운 봉우리는 하나로 합친다.
    const peaks = [];
    for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) {
      const v = rho[j * M + i];
      if (v < o.clusterMin) continue;
      let top = true;
      for (let dj = -1; dj <= 1 && top; dj++) for (let di = -1; di <= 1; di++) {
        if ((di || dj) && rho[((j + dj) & mask) * M + ((i + di) & mask)] > v) { top = false; break; }
      }
      if (top) peaks.push({i, j, peak: v});
    }
    peaks.sort((p, q) => q.peak - p.peak);
    const clusters = [], merge = 3;
    for (const p of peaks) {
      if (clusters.some(c => torusDist(c.i, c.j, p.i, p.j, M) < merge)) continue;
      clusters.push(p);
    }
    // 은하단 영역: 봉우리 둘레 반지름 3칸 안에서 ρ ≥ clusterEdge 인 칸
    for (const c of clusters) {
      let cells = 0;
      for (let dj = -3; dj <= 3; dj++) for (let di = -3; di <= 3; di++) {
        if (di * di + dj * dj > 9) continue;
        const idx = ((c.j + dj) & mask) * M + ((c.i + di) & mask);
        if (rho[idx] >= o.clusterEdge) { cls[idx] = CLASS.cluster; cells++; }
      }
      c.x = (c.i + 0.5) / M; c.y = (c.j + 0.5) / M;
      c.r = Math.max(1, Math.sqrt(cells / Math.PI)) / M;
    }
    // 넓이(2차원에서는 넓이 = 부피)·물질 비율과 평균 밀도 (흐리기 전 격자의 밀도로 센다)
    const area = [0, 0, 0], mass = [0, 0, 0];
    for (let i = 0; i < n; i++) { area[cls[i]]++; mass[cls[i]] += raw[i]; }
    const total = mass[0] + mass[1] + mass[2];
    const meanDensity = area.map((a, k) => a ? mass[k] / a : 0);
    return {
      M, rho, cls, clusters,
      areaFrac: area.map(a => a / n), massFrac: mass.map(m => m / total), meanDensity,
      voids: voidSize(rho, M, true).circles
    };
  }
  // 보이드 크기 재기(모형 비교용). 밀도가 낮은 쪽 60 % 넓이 안, 그리고 평균의 80 % 미만인 곳을 '빈 곳'으로 보고
  // 겹치지 않는 가장 큰 원들을 그린다 — 보이드가 얼마나 비었는지와 상관없이 '그물 눈의 크기'를 잰다.
  // 고르게 퍼진 이른 시기에는 평균의 80 % 미만인 곳이 거의 없어 원이 생기지 않는다.
  // emptyFrac: 밀도가 평균의 절반도 안 되는 곳의 넓이 비율(보이드가 얼마나 비었나).
  const VOID = {pct: 0.6, cap: 0.8, minCells: 2.5, empty: 0.5};
  function voidSize(rho, M, smoothed) {
    if (!smoothed) rho = smoothGrid(rho, M, THRESH.smooth);
    const n = M * M, sorted = Float64Array.from(rho).sort();
    const thr = Math.min(sorted[Math.floor(VOID.pct * n)], VOID.cap);
    const cls = new Uint8Array(n);
    let empty = 0;
    for (let i = 0; i < n; i++) {
      cls[i] = rho[i] < thr ? CLASS.void : CLASS.filament;
      if (rho[i] < VOID.empty) empty++;
    }
    const circles = voidCircles(cls, M, VOID.minCells);
    const d = circles.slice(0, 5).map(v => 2 * v.r * BOX_MPC);
    return {threshold: thr, circles, emptyFrac: empty / n,
      top5: d.length ? d.reduce((s, v) => s + v, 0) / d.length : 0,
      largest: d.length ? d[0] : 0, count: circles.length};
  }
  function torusDist(i1, j1, i2, j2, M) {
    let dx = Math.abs(i1 - i2), dy = Math.abs(j1 - j2);
    if (dx > M / 2) dx = M - dx;
    if (dy > M / 2) dy = M - dy;
    return Math.hypot(dx, dy);
  }
  // 보이드 칸마다 가장 가까운 보이드 아닌 칸까지의 거리(칸 단위)
  function voidDistance(cls, M) {
    const n = M * M, dist = new Float64Array(n), mask = M - 1;
    for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) {
      const idx = j * M + i;
      if (cls[idx] !== CLASS.void) { dist[idx] = 0; continue; }
      let best = Infinity;
      for (let r = 1; r < M / 2 && r <= best; r++) {
        for (let dj = -r; dj <= r; dj++) {
          const edge = Math.abs(dj) === r;
          for (let di = -r; di <= r; di += edge ? 1 : 2 * r) {
            if (cls[((j + dj) & mask) * M + ((i + di) & mask)] !== CLASS.void) {
              const d = Math.hypot(di, dj);
              if (d < best) best = d;
            }
          }
        }
      }
      dist[idx] = best === Infinity ? M / 2 : best;
    }
    return dist;
  }
  // 가장 큰 빈 원부터 겹치지 않게 고른다(수업 지도의 '보이드 = 파란 원'). 반지름은 상자 단위.
  function voidCircles(cls, M, minCells) {
    const dist = voidDistance(cls, M), order = [];
    for (let i = 0; i < dist.length; i++) if (dist[i] >= minCells) order.push(i);
    order.sort((p, q) => dist[q] - dist[p]);
    const out = [];
    for (const idx of order) {
      const i = idx % M, j = (idx / M) | 0, r = dist[idx] - 0.5;
      if (out.some(c => torusDist(c.i, c.j, i, j, M) < c.rc + r)) continue;
      out.push({i, j, rc: r, x: (i + 0.5) / M, y: (j + 0.5) / M, r: r / M});
      if (out.length >= 40) break;
    }
    return out;
  }
  // ── 기록하며 돌리기 ──────────────────────────────────────────
  // 우주 나이 frameStep 억 년마다 입자 위치를 16비트로 저장한다(되감기·비교용). advance() 한 번 = 한 걸음.
  const AGE_MARKS = [10, 30, 60];          // 억 년 (교과서 그림 27) + 현재
  const STAT_M = 32, PEAK_M = 64;          // 밀도 차이(약 4 Mpc 칸)와 최댓값(약 2 Mpc 칸)을 재는 격자
  function frameAges(cos, aStart, step) {
    const ages = [cos.age(aStart)];
    for (let t = step; t < cos.ageNow - step * 0.2; t += step) ages.push(t);
    ages.push(cos.ageNow);
    return ages;
  }
  function createRun(opts) {
    const sim = createSim(opts), cos = sim.cos;
    const ages = frameAges(cos, sim.aStart, opts.frameStep || 2);
    const targets = ages.map(t => cos.aAt(t));
    targets[0] = sim.aStart; targets[targets.length - 1] = 1;
    // 걸음 수 미리 세기(진행률 표시용)
    let total = 0;
    for (let k = 1, a = sim.aStart; k < targets.length; k++) {
      while (a < targets[k] - 1e-12) { a = Math.min(targets[k], a * Math.exp(STEP.dln), a + STEP.da); total++; }
    }
    const g32 = new Float64Array(STAT_M * STAT_M), g64 = new Float64Array(PEAK_M * PEAK_M);
    const run = {sim, N: sim.N, np: sim.np, model: sim.model, amp: sim.amp, seed: sim.seed, cos, ages, targets,
      frames: [], stats: [], totalSteps: total, done: false};
    function capture() {
      const f = new Uint16Array(2 * sim.np), x = sim.x, y = sim.y;
      for (let p = 0; p < sim.np; p++) { f[2 * p] = (x[p] * 65536) & 0xffff; f[2 * p + 1] = (y[p] * 65536) & 0xffff; }
      run.frames.push(f);
      const s1 = densityStats(densityGrid(x, y, sim.np, STAT_M, g32)), s2 = densityStats(densityGrid(x, y, sim.np, PEAK_M, g64));
      run.stats.push({age: ages[run.frames.length - 1], a: sim.a, rms: s1.rms, max: s2.max, min: s2.min});
      if (run.frames.length === ages.length) run.done = true;
    }
    capture();
    run.advance = function () {
      if (run.done) return true;
      const target = targets[run.frames.length];
      sim.step(sim.nextA(target));
      if (sim.a >= target - 1e-12) { sim.a = target; capture(); }
      return run.done;
    };
    run.progress = () => run.done ? 1 : Math.min(0.99, sim.steps / Math.max(1, total));
    run.lastAge = () => ages[run.frames.length - 1];
    // 우주 나이 age 에서의 입자 위치(앞뒤 기록 사이를 직선으로 잇는다). 아직 계산하지 않은 시점이면 마지막 기록.
    run.positionsAt = function (age, outX, outY) {
      const n = run.frames.length - 1;
      let i = 0;
      if (age >= ages[n]) i = n;
      else while (i < n && ages[i + 1] <= age) i++;
      const f0 = run.frames[i];
      if (i >= n || age <= ages[i]) {
        for (let p = 0; p < sim.np; p++) { outX[p] = f0[2 * p] / 65536; outY[p] = f0[2 * p + 1] / 65536; }
        return i;
      }
      const f1 = run.frames[i + 1], w = (age - ages[i]) / (ages[i + 1] - ages[i]);
      for (let p = 0; p < sim.np; p++) {
        const x0 = f0[2 * p] / 65536, y0 = f0[2 * p + 1] / 65536;
        let dx = f1[2 * p] / 65536 - x0, dy = f1[2 * p + 1] / 65536 - y0;
        if (dx > 0.5) dx -= 1; else if (dx < -0.5) dx += 1;
        if (dy > 0.5) dy -= 1; else if (dy < -0.5) dy += 1;
        let xx = x0 + w * dx, yy = y0 + w * dy;
        if (xx < 0) xx += 1; else if (xx >= 1) xx -= 1;
        if (yy < 0) yy += 1; else if (yy >= 1) yy -= 1;
        outX[p] = xx; outY[p] = yy;
      }
      return w < 0.5 ? i : i + 1;
    };
    // 기록 사이의 통계를 직선으로 보간
    run.statsAt = function (age) {
      const s = run.stats, n = s.length - 1;
      if (age <= s[0].age) return s[0];
      if (age >= s[n].age) return s[n];
      let i = 0;
      while (i < n && s[i + 1].age <= age) i++;
      const w = (age - s[i].age) / (s[i + 1].age - s[i].age), lerp = k => s[i][k] + w * (s[i + 1][k] - s[i][k]);
      return {age, a: lerp('a'), rms: lerp('rms'), max: lerp('max'), min: lerp('min')};
    };
    run.frameDensity = function (k, M, out) {
      const f = run.frames[k], xs = new Float64Array(sim.np), ys = new Float64Array(sim.np);
      for (let p = 0; p < sim.np; p++) { xs[p] = f[2 * p] / 65536; ys[p] = f[2 * p + 1] / 65536; }
      return densityGrid(xs, ys, sim.np, M, out);
    };
    return run;
  }

  const api = {TAU, H0, HUBBLE_TIME, BOX_MPC, A_START, MODELS, AGE_MARKS, IC, STEP, CLASS, THRESH, VOID, STAT_M, PEAK_M,
    cosmology, expansionCurve, makeFFT, fft, fft2, rng, hash3, modeGauss, transfer, spectrumShape, modelSpec,
    sigmaR, normFactor, initialField, depositCIC, densityGrid, makeSolver, interpCIC, createSim, wrap,
    densityStats, smoothGrid, classify, voidSize, voidDistance, voidCircles, torusDist, frameAges, createRun};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CosmicWebModel = api;
})(typeof window !== 'undefined' ? window : this);
