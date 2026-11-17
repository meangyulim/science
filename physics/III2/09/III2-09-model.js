/* III2-09 전자 현미경 — 계산 모형. 브라우저(window.III2_09)와 Node 테스트(tests/III2-09-model.test.cjs)에서 같이 쓴다.
   상수는 원고 값: h = 6.6 × 10⁻³⁴ J·s, 전자 질량 m = 9.1 × 10⁻³¹ kg, 기본 전하량 e = 1.6 × 10⁻¹⁹ C. 길이는 m 단위. */
(function (root) {
  'use strict';
  const h = 6.6e-34, m = 9.1e-31, e = 1.6e-19;

  // 정지한 전자를 전압 V 로 가속: 전기력이 한 일 eV = 운동 에너지 → p = √(2meV), λ = h/√(2meV)
  const kinetic = (V) => e * V;                       // J
  const momentum = (V) => Math.sqrt(2 * m * e * V);   // kg·m/s
  const speed = (V) => momentum(V) / m;               // m/s
  const lambdaV = (V) => h / momentum(V);             // m
  const lambdaRatio = (V1, V2) => lambdaV(V2) / lambdaV(V1);     // = √(V1/V2)
  // 파장이 λ 가 되는 가속 전압 (역산)
  const voltageFor = (lam) => (h * h) / (2 * m * e * lam * lam);

  /* 분해능 (단순화 모형): 점 하나의 상은 파장 정도 폭으로 번진다 → 가우스 번짐 σ = K·λ (반높이 폭 ≈ 0.89λ).
     두 점 사이가 s 일 때 두 봉우리 사이 골이 봉우리의 81% 이하로 꺼지면 '따로 보인다'.
     K 는 이 기준이 꼭 s = λ 에서 맞도록 고른 값 → 구별할 수 있는 가장 가까운 두 점 사이 ≈ λ. */
  const DIP = 0.81, K = 0.37916643;
  const psf = (x, lam) => Math.exp(-(x * x) / (2 * (K * lam) * (K * lam)));
  const twoPoint = (x, s, lam) => psf(x - s / 2, lam) + psf(x + s / 2, lam);
  // 가운데(두 점 사이) 밝기 ÷ 가장 밝은 곳 밝기
  function dipRatio(s, lam) {
    let mx = 0;
    const n = 600, x1 = s / 2 + 3 * K * lam;
    for (let i = 0; i <= n; i++) mx = Math.max(mx, twoPoint(x1 * i / n, s, lam));
    return twoPoint(0, s, lam) / mx;
  }
  const resolved = (s, lam) => dipRatio(s, lam) <= DIP + 1e-9;
  const minDistance = (lam) => lam;                   // 이 모형에서 구별되는 가장 가까운 거리

  // 투과 전자 현미경: 시료가 두꺼우면 지나는 동안 전자가 느려진다 → 파장이 길어져 흐려진다
  // (그림용 과장: 운동 에너지가 1/4 로 줄어 파장 2배)
  const THICK_LOSS = 0.25;
  const lambdaInSample = (V, thick) => lambdaV(thick ? V * THICK_LOSS : V);

  // 가시광선 파장 범위와 비교
  const VISIBLE = [400e-9, 700e-9];
  const timesShorter = (lamLight, V) => lamLight / lambdaV(V);

  /* 현미경 세 가지 (원고 표) — 화면의 표와 구조 그림이 같이 쓴다 */
  const SCOPES = {
    light: {name: '광학 현미경', wave: '가시광선', lens: '유리 렌즈', view: '눈', image: '시료의 확대 상', note: '살아 있는 시료 관찰 가능, 배율 한계 약 2000배', electron: false, image3D: false},
    tem: {name: '투과 전자 현미경 (TEM)', wave: '전자의 물질파', lens: '자기렌즈', view: '형광 스크린', image: '얇은 시료 내부의 평면 상', note: '진공, 시료를 아주 얇게, 배율 가장 높음', electron: true, image3D: false},
    sem: {name: '주사 전자 현미경 (SEM)', wave: '전자의 물질파', lens: '자기렌즈', view: '검출기 → 모니터', image: '표면의 입체 상', note: '진공, 도체 코팅 필요, 배율은 TEM보다 낮음', electron: true, image3D: true},
  };
  // 현미경 3분류: 전자선을 쓰는가? → 입체 표면인가?
  const classify = (usesElectron, surface3D) => (!usesElectron ? 'light' : surface3D ? 'sem' : 'tem');
  // 개념 체크 ㄱㄴㄷ
  const STATEMENTS = [
    {mark: 'ㄱ', text: 'TEM은 매우 얇은 시료를 투과한 전자로 상을 만든다', ok: SCOPES.tem.image.includes('얇은')},
    {mark: 'ㄴ', text: 'SEM으로 생물 시료를 볼 때는 도체로 얇게 코팅한다', ok: SCOPES.sem.note.includes('도체 코팅')},
    {mark: 'ㄷ', text: '전자 현미경은 자기장으로 전자의 경로를 휘게 하는 자기렌즈를 쓴다', ok: SCOPES.tem.lens === '자기렌즈' && SCOPES.sem.lens === '자기렌즈'},
  ];
  const correctMarks = () => STATEMENTS.filter((s) => s.ok).map((s) => s.mark).join(', ');

  const api = {h, m, e, kinetic, momentum, speed, lambdaV, lambdaRatio, voltageFor,
    DIP, K, psf, twoPoint, dipRatio, resolved, minDistance, THICK_LOSS, lambdaInSample, VISIBLE, timesShorter,
    SCOPES, classify, STATEMENTS, correctMarks};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.III2_09 = api;
})(typeof window !== 'undefined' ? window : globalThis);
