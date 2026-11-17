/* III2-01 빛의 이중성 — 계산 모형. 브라우저(window.III2_01)와 Node 테스트(tests/III2-01-model.test.cjs)에서 같이 쓴다.
   현상 분류(빛의 파동성·입자성, 물질의 파동성), 이중 슬릿 세기와 광자 하나씩 찍기, 콤프턴 산란, 광전 효과 판정.
   상수는 원고 값: h = 6.6 × 10⁻³⁴ J·s, c = 3 × 10⁸ m/s, e = 1.6 × 10⁻¹⁹ C. */
(function (root) {
  'use strict';
  const h = 6.6e-34, c = 3e8, e = 1.6e-19, me = 9.1e-31;
  const LC = h / (me * c);              // h/(mc) ≈ 2.42 × 10⁻¹² m — 콤프턴 산란 계산에만 쓴다(화면에 식은 쓰지 않음)

  // ── 현상 분류 ────────────────────────────────────────────
  // kind: 'wave' 파동성 | 'particle' 입자성,  of: 'light' 빛 | 'matter' 물질(전자)
  const PHENOMENA = [
    {id: 'interference', name: '간섭', kind: 'wave', of: 'light', why: '밝고 어두운 무늬는 보강·상쇄 — 파동만 가능하다.'},
    {id: 'diffraction', name: '회절', kind: 'wave', of: 'light', why: '좁은 틈을 지나 뒤쪽으로 퍼지는 것은 파동의 성질이다.'},
    {id: 'refraction', name: '굴절', kind: 'wave', of: 'light', why: '매질마다 속력이 달라 꺾인다 — 파동으로 설명한다.'},
    {id: 'slit', name: '이중 슬릿 무늬', kind: 'wave', of: 'light', why: '두 틈을 지난 빛의 간섭무늬 — 파동성.'},
    {id: 'photo', name: '광전 효과', kind: 'particle', of: 'light', why: '전자 하나가 광자 하나(hf)를 통째로 흡수 — 입자성.'},
    {id: 'compton', name: '콤프턴 산란', kind: 'particle', of: 'light', why: 'X선 광자가 전자와 충돌해 에너지를 잃고 파장이 길어진다 — 입자성.'},
    {id: 'film', name: '사진 건판에 상이 기록됨', kind: 'particle', of: 'light', why: '광자가 감광 입자와 하나씩 반응한다 — 입자성.'},
    {id: 'edif', name: '전자선 회절', kind: 'wave', of: 'matter', why: '빛이 아니라 전자(물질)의 파동성이다. 입자성으로 고르면 함정!'},
  ];
  const find = (key) => PHENOMENA.find((p) => p.id === key || p.name === key) || null;
  const classify = (key) => { const p = find(key); return p ? p.kind : null; };
  const lightParticle = (key) => { const p = find(key); return !!p && p.kind === 'particle' && p.of === 'light'; };
  // 개념 체크(예제): 빛의 입자성을 보여 주는 현상으로만 짝지은 것은?
  const EX_OPTIONS = [['간섭', '회절'], ['광전 효과', '콤프턴 산란'], ['굴절', '광전 효과'], ['이중 슬릿 무늬', '콤프턴 산란'], ['전자선 회절', '광전 효과']];
  const pickParticlePair = (opts = EX_OPTIONS) => opts.findIndex((o) => o.every(lightParticle));

  // ── 이중 슬릿 (작은 각 근사) ─────────────────────────────
  // o = {lambda 파장, d 슬릿 사이, a 슬릿 폭, L 화면까지 거리, single: 한쪽 슬릿을 막음}, y = 화면 위 위치 (같은 길이 단위)
  function slitIntensity(y, o) {
    const s = y / o.L;                                           // sinθ ≈ y/L
    const beta = Math.PI * o.a * s / o.lambda;
    const env = Math.abs(beta) < 1e-12 ? 1 : (Math.sin(beta) / beta) ** 2;      // 슬릿 하나의 회절
    return o.single ? env : Math.cos(Math.PI * o.d * s / o.lambda) ** 2 * env;  // 두 슬릿의 간섭
  }
  const fringeGap = (o) => o.lambda * o.L / o.d;                 // 이웃한 밝은 무늬 사이 Δx = Lλ/d
  // 광자 하나가 화면에 찍히는 자리: 그 자리의 세기에 비례하는 확률로 뽑는다 (rand: 0~1 난수 함수)
  function sampleScreen(rand, o, ymax) {
    for (let k = 0; k < 5000; k++) {
      const y = (2 * rand() - 1) * ymax;
      if (rand() < slitIntensity(y, o)) return y;
    }
    return 0;
  }

  // ── 콤프턴 산란 ──────────────────────────────────────────
  // 정지한 전자에 파장 lambda(m) 인 X선 광자가 부딪혀 thDeg 만큼 꺾일 때
  function compton(lambda, thDeg) {
    const th = thDeg * Math.PI / 180;
    const lam2 = lambda + LC * (1 - Math.cos(th));              // 산란된 광자의 파장 (더 길다)
    const E1 = h * c / lambda, E2 = h * c / lam2;               // 광자 에너지 hf, hf′ (J)
    const t = Math.tan(th / 2);
    // 전자가 튀어 나가는 각 (입사 방향에서 광자와 반대쪽으로)
    const phi = th < 1e-9 ? Math.PI / 2 : Math.atan2(1, (1 + LC / lambda) * t);
    return {lam2, dLam: lam2 - lambda, ratio: lam2 / lambda, E1, E2, Ke: E1 - E2, phiDeg: phi * 180 / Math.PI};
  }

  // ── 광전 효과 ────────────────────────────────────────────
  const photonEV = (nm) => h * c / (nm * 1e-9) / e;              // 광자 1개의 에너지 (eV)
  const emits = (nm, W) => photonEV(nm) >= W;                     // 광자 1개의 에너지가 일함수 이상이면 방출 (세기와 무관)

  const api = {h, c, e, me, LC, PHENOMENA, find, classify, lightParticle, EX_OPTIONS, pickParticlePair,
    slitIntensity, fringeGap, sampleScreen, compton, photonEV, emits};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.III2_01 = api;
})(typeof window !== 'undefined' ? window : globalThis);
