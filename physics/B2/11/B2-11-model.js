/* B2-11 움직이는 막대·회전 막대의 유도 기전력 — 계산 모형. 브라우저(window.B2_11)와 Node 테스트(tests/B2-11-model.test.cjs)에서 같이 쓴다.
   단위: B (T), 길이·위치 (m), v (m/s), 저항 R (Ω), m (kg), t (s), ω (rad/s), 힘 (N), 에너지 (J). g = 10 m/s² (원고 값).
   부호: 레일 방향 위치 x 와 속도 v 는 오른쪽이 +. 자기장 field = +1 이면 종이면에 들어감(⊗), −1 이면 나옴(⊙).
   레일 회로: ㄷ자 레일의 왼쪽 끝(x = 0)에 저항 R, 막대가 회로의 오른쪽 변. 회로가 감싼 넓이 = L × x.
   회전 막대: 길이 R(원고 기호 그대로)인 막대가 한쪽 끝 O 를 축으로 ω 로 돈다. spin = +1 이면 시계 반대 방향. */
(function (root) {
  'use strict';
  const G = 10;
  const RAD = Math.PI / 180;

  // ── 움직이는 막대 ───────────────────────────────────────
  const emf = (B, L, v) => B * L * v;                                // ε = BLv
  const current = (e, R) => e / R;                                    // I = ε/R
  const force = (B, I, L) => B * I * L;                               // F = BIL
  const dragK = (B, L, R) => (B * B * L * L) / R;                     // 자기력의 크기 = dragK × v (= B²L²v/R)
  const magForce = (B, L, R, v) => -dragK(B, L, R) * v;               // 자기력의 x 성분: 늘 운동 반대
  const flux = (B, L, x) => B * L * x;                                // Φ = B × (회로 넓이 L × x)
  const heatPower = (B, L, R, v) => Math.pow(B * L * v, 2) / R;       // 소비 전력 I²R = (BLv)²/R
  const terminal = (F, B, L, R) => (F * R) / (B * B * L * L);         // 종단 속력 v = FR/(B²L²) (교과 심화)
  const tau = (m, B, L, R) => (m * R) / (B * B * L * L);              // 속력이 바뀌는 시간 척도 m ÷ (B²L²/R)
  const inclineForce = (m, thDeg) => m * G * Math.sin(thDeg * RAD);   // 빗면 아래쪽 중력 성분 mg sinθ

  // 렌츠 법칙. field(+1 ⊗, −1 ⊙), v(오른쪽 +). 막대가 회로의 오른쪽 변이다.
  function lenz(field, v) {
    const d = Math.sign(field * v);        // +1: 들어가는 쪽(⊗) 자속 증가 (= ⊙ 자속 감소), −1: 그 반대, 0: 변화 없음
    return {
      dPhiIn: d,
      inducedIn: -d,                       // 유도 전류가 고리 안에 만드는 자기장 (+1 ⊗, −1 ⊙): 변화를 방해
      ccw: d > 0, cw: d < 0,               // 종이면 앞에서 본 유도 전류 (시계 반대 / 시계)
      rodUp: d > 0,                        // 막대 속 전류가 위쪽
      topPlus: d > 0,                      // 막대 위 끝이 (+) 극 (양전하가 qvB 를 받아 몰리는 쪽)
      forceDir: -Math.sign(v),             // 자기력 방향 (+1 오른쪽): 늘 운동 반대
    };
  }

  // 막대의 운동. p = {mode, B, L, R, m, v, F, v0, th, x0}
  //  'const'  : 손이 일정한 속력 v 로 끈다 (외력 = 자기력과 크기가 같고 방향이 반대)
  //  'force'  : 정지 상태에서 일정한 외력 F 로 끈다 → 종단 속력 FR/(B²L²) 에 다가간다
  //  'push'   : 처음 속력 v0 으로 밀고 놓는다 (외력 0) → 자기력만 받아 느려지다 멈춘다
  //  'incline': 빗면(B 는 빗면에 수직)에서 정지 상태로 놓는다 → 외력 노릇 = mg sinθ
  // 운동 방정식 m dv/dt = F − kv (k = B²L²/R) 의 해: v = vT + (v₀ − vT) e^(−t/τ), τ = m/k
  function extForce(p) {
    if (p.mode === 'force') return p.F;
    if (p.mode === 'incline') return inclineForce(p.m, p.th);
    return 0;
  }
  function state(p, t) {
    const k = dragK(p.B, p.L, p.R), x0 = p.x0 || 0;
    let x, v, a, Fext, K0, W, Q;
    if (p.mode === 'const') {
      v = p.v; x = x0 + v * t; a = 0; Fext = k * v;
      K0 = 0.5 * p.m * v * v; W = Fext * v * t; Q = k * v * v * t;
    } else {
      const F = extForce(p), v0 = p.mode === 'push' ? p.v0 : 0, vT = F / k, T = p.m / k;
      const e1 = Math.exp(-t / T), c = v0 - vT;
      v = vT + c * e1; x = x0 + vT * t + c * T * (1 - e1); Fext = F; a = (F - k * v) / p.m;
      K0 = 0.5 * p.m * v0 * v0; W = F * (x - x0);
      // 저항의 열 = ∫ I²R dt = ∫ k v² dt (닫힌 식)
      Q = k * (vT * vT * t + 2 * vT * c * T * (1 - e1) + c * c * (T / 2) * (1 - e1 * e1));
    }
    const e = emf(p.B, p.L, v), I = current(e, p.R);
    return {t, x, v, a, Fext, Fmag: -k * v, emf: e, I, Phi: flux(p.B, p.L, x),
      K0, K: 0.5 * p.m * v * v, W, Q, Pext: Fext * v, Pheat: I * I * p.R};
  }
  // 레일 [xMin, xMax] 에서 움직이는 시간: 끝에 닿거나, (밀고 놓기) 속력이 처음의 1% 아래로 줄 때까지
  function runEnd(p, xMin, xMax) {
    const k = dragK(p.B, p.L, p.R);
    const tStop = p.mode === 'push' ? (p.m / k) * Math.log(100) : 600;
    const out = (t) => { const x = state(p, t).x; return x >= xMax || x <= xMin; };
    if (!out(tStop)) return {t: tStop, hit: false};
    let lo = 0, hi = tStop;                       // x(t) 는 단조 → 이분법
    for (let i = 0; i < 80; i++) { const mid = (lo + hi) / 2; if (out(mid)) hi = mid; else lo = mid; }
    return {t: lo, hit: true};
  }

  // ── 레일 위 두 막대 ─────────────────────────────────────
  // 왼쪽 P(속도 v1), 오른쪽 Q(속도 v2). 회로 = 두 막대 사이 고리 (전체 저항 R). 고리를 시계 반대로 도는 쪽이 +.
  function twoRods(B, L, R, v1, v2, field = 1) {
    const net = field * B * L * (v2 - v1);       // Q 의 BLv(위쪽이면 +) − P 의 BLv = B × (넓이 변화율)
    const k = dragK(B, L, R);
    return {
      e1: Math.abs(emf(B, L, v1)), e2: Math.abs(emf(B, L, v2)),
      up1: Math.sign(field * v1), up2: Math.sign(field * v2),   // 막대 혼자일 때 막대 속 전류를 위(+1)·아래(−1)로 미는가
      net, emf: Math.abs(net), I: net / R, ccw: net > 0, cw: net < 0,
      dAdt: L * (v2 - v1),
      F1: k * (v2 - v1), F2: -k * (v2 - v1),     // 자기력: 두 막대의 상대 운동을 방해
    };
  }

  // ── 회전 막대 ───────────────────────────────────────────
  const rotEmf = (B, w, R) => 0.5 * B * w * R * R;                       // ε = ½BωR²
  const bandEmf = (B, w, r1, r2) => 0.5 * B * w * (r2 * r2 - r1 * r1);   // 자기장이 r₁~r₂ 띠에만 있을 때
  const speedAt = (w, r) => w * r;                                        // 막대 위 점의 속력 rω
  const avgSpeed = (w, R) => (w * R) / 2;                                 // 평균 속력 Rω/2
  const sector = (R, ang) => 0.5 * R * R * ang;                           // 중심각 ang 인 부채꼴 넓이
  const sweptRate = (w, R) => 0.5 * R * R * w;                            // 쓸린 넓이의 변화율 ½R²ω
  const tipMistake = (B, w, R) => B * R * (w * R);                        // 끝 속력 Rω 를 BLv 에 그대로 넣은 값 (2배, 틀림)
  const rotCenterPlus = (field, spin) => field * spin > 0;                // 축 O 가 (+) 극인가 (⊗ · 시계 반대 → O 가 +)

  const api = {G, RAD, emf, current, force, dragK, magForce, flux, heatPower, terminal, tau, inclineForce, lenz,
    extForce, state, runEnd, twoRods, rotEmf, bandEmf, speedAt, avgSpeed, sector, sweptRate, tipMistake, rotCenterPlus};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.B2_11 = api;
})(typeof window !== 'undefined' ? window : globalThis);
