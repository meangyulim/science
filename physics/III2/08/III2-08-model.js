/* III2-08 입자의 파동성 증거 — 계산 모형. 브라우저(window.III2_08)와 Node 테스트(tests/III2-08-model.test.cjs)에서 같이 쓴다.
   상수는 원고 값: h = 6.6 × 10⁻³⁴ J·s, 전자 질량 m = 9.1 × 10⁻³¹ kg, 기본 전하량 e = 1.6 × 10⁻¹⁹ C.
   각도 약속: 데이비슨·거머 실험의 검출기 각도 θ 는 입사 전자선(결정 표면에 수직)과 튀어나온 전자선 사이 각. */
(function (root) {
  'use strict';
  const h = 6.6e-34, m = 9.1e-31, e = 1.6e-19;
  const DEG = Math.PI / 180, TAU = 2 * Math.PI;

  // 전압 V 로 가속한 전자: E_k = eV, p = √(2meV), λ = h/p
  const momentum = (V) => Math.sqrt(2 * m * e * V);
  const lambdaV = (V) => h / momentum(V);

  /* ── ① 데이비슨·거머 ─────────────────────────────────────
     니켈 결정을 '표면 원자 줄(간격 d) × 원자층(간격 c)'의 단면 격자로 단순화한다.
     d, c 는 원고 값(54 V 전자 → 50°에서 최대)에 맞춘 값: d ≈ 0.217 nm, c ≈ 0.203 nm (실제 니켈 0.215 nm, 0.203 nm). */
  const DG_V = 54, DG_PEAK = 50;
  const DG_D = lambdaV(DG_V) / Math.sin(DG_PEAK * DEG);
  const DG_C = 2 * lambdaV(DG_V) / (1 + Math.cos(DG_PEAK * DEG));
  // 이웃한 표면 원자에서 θ 방향으로 튀어나온 두 물질파의 경로차, 그리고 그 경로차가 파장의 몇 배인지
  const pathDiff = (thetaDeg) => DG_D * Math.sin(thetaDeg * DEG);
  const pathRatio = (thetaDeg, V = DG_V) => pathDiff(thetaDeg) / lambdaV(V);
  // 비추어진 표면 원자들(가우스 가중)과 깊이 3층(아래층일수록 약함)에서 튀어나온 파동의 합
  const DG_N = 9, DG_SIG = 1.5, DG_LAYERS = [1, 0.75, 0.55];
  const DG_W = Array.from({length: DG_N}, (_, i) => Math.exp(-(((i - (DG_N - 1) / 2) ** 2) / (2 * DG_SIG * DG_SIG))));
  const sumW = DG_W.reduce((a, b) => a + b, 0), sumU = DG_LAYERS.reduce((a, b) => a + b, 0);
  function dgInterference(thetaDeg, V = DG_V) {
    const k = TAU / lambdaV(V), t = thetaDeg * DEG;
    let sr = 0, si = 0, lr = 0, li = 0;
    DG_W.forEach((w, i) => { const ph = -k * (i - (DG_N - 1) / 2) * DG_D * Math.sin(t); sr += w * Math.cos(ph); si += w * Math.sin(ph); });
    DG_LAYERS.forEach((u, j) => { const ph = k * j * DG_C * (1 + Math.cos(t)); lr += u * Math.cos(ph); li += u * Math.sin(ph); });
    return ((sr * sr + si * si) / (sumW * sumW)) * ((lr * lr + li * li) / (sumU * sumU));   // 0~1
  }
  // 검출기에 들어오는 전자 수(상대값): 결정 표면에서 고르게 흩어지는 몫 + 보강 간섭 몫. 54 V 에서 50° 값이 1.
  const dgBackground = (thetaDeg) => 0.2 + 0.35 * Math.cos(thetaDeg * DEG) ** 2;
  const DG_P = 1 - dgBackground(DG_PEAK);
  const dgCount = (thetaDeg, V = DG_V) => dgBackground(thetaDeg) + DG_P * dgInterference(thetaDeg, V);
  // 0°~90° 에서 전자 수가 가장 많은 각도 (0.1° 간격)
  function dgPeakAngle(V = DG_V, from = 15, to = 90) {
    let best = from, bv = -1;
    for (let a = from; a <= to + 1e-9; a += 0.1) { const v = dgCount(a, V); if (v > bv) { bv = v; best = a; } }
    return Math.round(best * 10) / 10;
  }

  /* ── ② 전자 이중 슬릿 (광전자를 가속 전압 V 로 가속) ─────────
     화면 위치 u 는 '기준 전압 V₀ 일 때의 무늬 간격' 단위. 전압이 k배면 파장 1/√k 배 → 무늬 간격 1/√k 배.
     슬릿 폭 = 슬릿 간격의 1/4 (봉우리 일곱 개 정도가 밝게 보인다). */
  const SLIT_A = 0.25;
  const fringeScale = (k) => 1 / Math.sqrt(k);                 // λ/λ₀ = 무늬 간격/기준 간격
  const sinc = (x) => (Math.abs(x) < 1e-9 ? 1 : Math.sin(x) / x);
  function slitWave(u, k = 1) {                                // 파동으로 예상한 도착 확률(상대, 최대 1)
    const r = fringeScale(k);
    return Math.cos(Math.PI * u / r) ** 2 * sinc(Math.PI * SLIT_A * u / r) ** 2;
  }
  // 입자로만 행동한다면: 두 슬릿 뒤에 슬릿 모양 그대로 두 줄 (전압과 무관)
  const PART_U = 1.85, PART_W = 0.42;
  function slitParticle(u) {
    const band = (c) => { const x = Math.abs(u - c) / PART_W; return x < 1 ? 1 : Math.exp(-(((x - 1) * 3.2) ** 2)); };
    return Math.min(1, band(-PART_U) + band(PART_U));
  }
  // 분포 f 에서 하나 뽑기 (거절 표집). rnd 는 0~1 난수 함수
  function sample(f, lo, hi, rnd, fmax = 1) {
    for (let n = 0; n < 2000; n++) { const u = lo + (hi - lo) * rnd(); if (rnd() * fmax <= f(u)) return u; }
    return (lo + hi) / 2;
  }
  // 함수의 국소 최댓값(봉우리) 개수 — 간섭무늬의 밝은 줄 수 세기
  function countPeaks(f, lo, hi, n = 4000, minH = 0.02) {
    let c = 0, prev = f(lo), cur = f(lo + (hi - lo) / n);
    for (let i = 2; i <= n; i++) {
      const next = f(lo + (hi - lo) * i / n);
      if (cur > prev && cur >= next && cur > minH) c++;
      prev = cur; cur = next;
    }
    return c;
  }

  /* ── ③ 톰슨 실험 (얇은 금속박 회절) ──────────────────────
     금속박 = 방향이 제각각인 작은 결정 알갱이들 → 보강 방향이 원뿔을 이루어 화면에 동심원.
     작은 각에서 고리 반지름 ∝ 파장 × √(N), N = 3, 4, 8, 11 (면심 입방 결정). 파장이 같으면 X선이든 전자든 같은 고리. */
  const RING_N = [3, 4, 8, 11], RING_I = [1, 0.55, 0.42, 0.45];
  const ringRadii = (lam, scale = 1) => RING_N.map((n) => scale * lam * Math.sqrt(n));
  function ringProfile(r, lam, scale = 1, width = 0.035) {    // 반지름 r 에서의 밝기(상대): 가운데 밝은 점(꺾이지 않고 지난 몫) + 고리들
    const rr = ringRadii(lam, scale), w = width * rr[rr.length - 1];
    let v = 12 * Math.exp(-(r * r) / (2 * w * w));
    rr.forEach((ri, i) => { v += RING_I[i] * Math.exp(-(((r - ri) ** 2) / (2 * w * w))); });
    return v;
  }

  /* ── ④ 바람개비: 전자선이 날개를 밀어 돌린다 ───────────────
     전자 하나가 날개에 주는 운동량 ≈ p (멈추면 p, 되튀면 더 큼). 회전 속도 ω: dω/dt = a·(초당 전자 수) − bω */
  const wheelOmega = (t, rate, a = 0.02, b = 0.35, w0 = 0) => {
    const wInf = a * rate / b;
    return wInf + (w0 - wInf) * Math.exp(-b * t);
  };
  // 위쪽 날개(축보다 위)를 +x 방향으로 밀면 위쪽이 +x 로 움직이는 방향(시계 방향)으로 돈다: 토크 부호
  const torqueSign = (hitAboveAxle, beamDir = 1) => (hitAboveAxle ? 1 : -1) * beamDir;   // +1 = 시계 방향

  /* ── 증거 분류 (개념 체크) ─────────────────────────────── */
  const EVIDENCE = {
    dg: {name: '데이비슨·거머', obs: '니켈 결정, 54 V 전자, 약 50°에서 전자 수 최대', nature: 'wave', why: '보강 간섭'},
    slit: {name: '전자 이중 슬릿', obs: '하나씩 보내도 쌓이면 간섭무늬', nature: 'wave', why: '간섭'},
    thomson: {name: '톰슨', obs: '금속박을 지난 전자선의 동심원 무늬 = X선 무늬', nature: 'wave', why: '회절'},
    wheel: {name: '바람개비', obs: '전자선을 맞은 바람개비가 회전', nature: 'particle', why: '운동량'},
  };
  const natureOf = (key) => EVIDENCE[key].nature;
  // 개념 체크 진술: 실험 key 와 진술이 주장한 성질
  const STATEMENTS = [
    {mark: 'ㄱ', exp: 'dg', claims: 'wave'},
    {mark: 'ㄴ', exp: 'thomson', claims: 'wave'},
    {mark: 'ㄷ', exp: 'wheel', claims: 'wave'},
  ];
  const judge = (st) => natureOf(st.exp) === st.claims;
  const correctMarks = (list = STATEMENTS) => list.filter(judge).map((s) => s.mark).join(', ');

  const api = {h, m, e, DEG, momentum, lambdaV,
    DG_V, DG_PEAK, DG_D, DG_C, DG_N, DG_SIG, DG_W, DG_LAYERS, pathDiff, pathRatio, dgInterference, dgBackground, dgCount, dgPeakAngle,
    SLIT_A, fringeScale, slitWave, slitParticle, PART_U, PART_W, sample, countPeaks,
    RING_N, RING_I, ringRadii, ringProfile,
    wheelOmega, torqueSign,
    EVIDENCE, natureOf, STATEMENTS, judge, correctMarks};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.III2_08 = api;
})(typeof window !== 'undefined' ? window : globalThis);
