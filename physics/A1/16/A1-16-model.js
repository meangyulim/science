/* A1-16 등가 원리·일반 상대성 이론·블랙홀 — 계산 모형과 판정 함수. 브라우저(window.A1_16)와 Node 테스트(tests/A1-16-model.test.cjs)에서 같이 쓴다.
   g = 10 m/s², c = 3 × 10⁸ m/s, G = 6.67 × 10⁻¹¹ N·m²/kg², 태양 질량 2 × 10³⁰ kg (원고 값). 위를 + 로 잡는다.
   화면의 빛은 아주 느리게(c' m/s) 그려 휘는 정도를 크게 과장한다. 휘는 방향과 비례 관계만 실제와 같다. */
(function (root) {
  'use strict';
  const g = 10, c = 3e8, GN = 6.67e-11, MSUN = 2e30;

  // ── 등가 원리 ───────────────────────────────────────────
  // 우주선 안에서 느끼는 유효 중력(아래 방향 크기) = 그 자리의 중력 gField + 우주선 가속도 aShip (위 +)
  // 지표에 정지 (g, 0) → g, 빈 우주에서 위로 g 가속 (0, g) → g, 자유 낙하 (g, −g) → 0, 빈 우주에 떠 있음 (0, 0) → 0
  const gEff = (gField, aShip) => gField + aShip;
  const SHIPS = {
    ground: {name: '지표에 정지', gField: g, aShip: 0},
    rocket: {name: '빈 우주에서 위로 g 가속', gField: 0, aShip: g},
    fall: {name: '지구로 자유 낙하', gField: g, aShip: -g},
    float: {name: '빈 우주에 떠 있음', gField: 0, aShip: 0},
  };
  // 안에서 하는 실험(공·빛)으로 두 우주선을 구별할 수 있는가: 유효 중력이 같으면 구별할 수 없다
  const indistinguishable = (A, B) => Math.abs(gEff(A.gField, A.aShip) - gEff(B.gField, B.aShip)) < 1e-9;
  // 수평으로 던진 공 (처음 속력 u, 높이 h): t 초 뒤 [x, y]. 질량과 상관없다 (관성 질량 = 중력 질량)
  const ballAt = (u, h, ge, t) => [u * t, h - 0.5 * ge * t * t];
  const fallTime = (h, ge) => (ge > 1e-12 ? Math.sqrt(2 * h / ge) : Infinity);
  // 수평으로 쏜 빛 (화면 속력 c'): 폭 L 을 건너는 동안 떨어지는 거리 = ½ g_eff (L/c')². 실제 빛이면 c' = c
  const lightDrop = (L, cp, ge) => 0.5 * ge * (L / cp) * (L / cp);
  // 우주선이 가속도 a 로 가속하면 안에서 본 빛은 가속도 반대쪽(관성력 방향)으로 휜다. 중력장에서는 질량 쪽(아래)으로
  const bendDir = (aShip) => (aShip > 1e-12 ? 'down' : aShip < -1e-12 ? 'up' : 'none');
  // 밖(관성 좌표계)에서 본 같은 빛: 곧게 간다. 그동안 우주선이 ½at² 올라가므로 벽에는 그만큼 아래에 닿는다
  const shipRise = (a, t) => 0.5 * a * t * t;

  // ── 중력 렌즈 (점 질량 렌즈, 각은 기준 아인슈타인 반지름 θ_E0 단위) ──
  const einsteinR = (M) => Math.sqrt(Math.max(0, M));        // 렌즈 질량 M (기준 = 1) → 고리 반지름 ∝ √M
  // 광원 방향 β 에 대해 상의 방향 θ± = (β ± √(β² + 4θ_E²))/2 — 하나는 광원 쪽 바깥, 하나는 반대쪽 안
  function lensImages(beta, thE) {
    const d = Math.sqrt(beta * beta + 4 * thE * thE);
    return {plus: (beta + d) / 2, minus: (beta - d) / 2};
  }
  // 상의 모양 판정: 광원(반지름 rho)이 렌즈 바로 뒤에 겹치면 고리, 아니면 상 2개 (어두운 쪽 상이 렌즈에 가려지면 1개)
  function lensKind(beta, thE, rho, hideR = 0) {
    if (thE <= 1e-12) return 'none';
    if (Math.abs(beta) < rho) return 'ring';
    const im = lensImages(Math.abs(beta), thE);
    return Math.abs(im.minus) < hideR ? 'one' : 'two';
  }
  // 빛이 휘는 각 ∝ M / b (질량이 클수록, 가까이 지날수록 많이 휜다). 태양 가장자리를 스치는 별빛은 약 1.75″
  const deflection = (M, b) => M / b;
  const SUN_LIMB_ARCSEC = 1.75;
  const MERCURY = {observed: 574, newton: 531};               // 100년에 근일점 이동 (″)
  const mercuryExcess = () => MERCURY.observed - MERCURY.newton;

  // ── 별의 최후와 블랙홀 ─────────────────────────────────
  // 핵융합을 마친 별 중심부의 질량(태양 질량 단위) → 백색 왜성(약 1.4 이하) · 중성자별 · 블랙홀(약 3 초과)
  const WD_LIMIT = 1.4, NS_LIMIT = 3;
  const remnant = (Ms) => (Ms <= WD_LIMIT ? 'wd' : Ms <= NS_LIMIT ? 'ns' : 'bh');
  const REMNANT = {wd: '백색 왜성', ns: '중성자별', bh: '블랙홀'};
  const escapeSpeed = (M, R) => Math.sqrt(2 * GN * M / R);    // √(2GM/R)
  const horizonR = (M) => 2 * GN * M / (c * c);               // 탈출 속력 = c 인 반지름 (사건의 지평선)
  const canLightEscape = (M, R) => escapeSpeed(M, R) < c;
  // 남은 천체의 대략적인 반지름 (m): 백색 왜성 ≈ 지구 크기, 중성자별 ≈ 12 km, 블랙홀 = 사건의 지평선
  const remnantRadius = (Ms) => { const k = remnant(Ms); return k === 'wd' ? 7e6 * Math.cbrt(0.6 / Ms) : k === 'ns' ? 1.2e4 : horizonR(Ms * MSUN); };

  // ── 중력 시간 지연: 중력이 강한(시공간이 많이 휜) 곳일수록 시계가 느리다 ──
  // 정지한 시계가 가는 빠르기 (멀리 있는 시계 = 1): √(1 − r_s/r). 사건의 지평선(r = r_s)에서 0 → 밖에서 보면 멈춘 듯
  const clockRate = (r, rs) => (r > rs ? Math.sqrt(1 - rs / r) : 0);
  // 지구 둘레(약한 중력): 1 + Φ/c², Φ = −GM/r. 지표 < 탑 꼭대기 < GPS 위성 (중력 효과만)
  const EARTH = {M: 6e24, R: 6.4e6};
  const earthRate = (r) => 1 - GN * EARTH.M / (r * c * c);

  const api = {g, c, GN, MSUN, gEff, SHIPS, indistinguishable, ballAt, fallTime, lightDrop, bendDir, shipRise,
    einsteinR, lensImages, lensKind, deflection, SUN_LIMB_ARCSEC, MERCURY, mercuryExcess,
    WD_LIMIT, NS_LIMIT, remnant, REMNANT, escapeSpeed, horizonR, canLightEscape, remnantRadius, clockRate, EARTH, earthRate};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.A1_16 = api;
})(typeof window !== 'undefined' ? window : globalThis);
