/* III1-09 전자기파의 이용 — 판정·분류 모형. 브라우저(window.III1_09)와 Node 테스트(tests/III1-09-model.test.cjs)에서 같이 쓴다.
   용도 → 영역 분류, 진동수 순서, 그리고 각 장면이 보여 주는 성질(투과, 회절, 왕복 시간, 형광 등)의 간단한 계산. */
(function (root) {
  'use strict';
  const C = 3e8;            // 진공에서 빛의 속력 (m/s)
  const H = 6.6e-34;        // 플랑크 상수 (J·s)

  // 진동수가 큰 것부터. lam = 대략적인 파장 범위(m), rep = 대표 파장(m)
  const REGIONS = [
    {id: 'gamma', name: '감마선', lam: [0, 1e-11], rep: 1e-12, prop: '원자핵에서 나옴 · 에너지·투과력 최대',
      uses: ['암 치료', '식품·의료 기구 멸균', '비파괴 검사']},
    {id: 'xray', name: 'X선', lam: [1e-11, 1e-8], rep: 1e-10, prop: '투과력이 강함',
      uses: ['X선 사진·CT', '공항 수하물 검색', '물질 내부 구조 조사']},
    {id: 'uv', name: '자외선', lam: [1e-8, 4e-7], rep: 2.5e-7, prop: 'DNA 변형(살균) · 형광 작용',
      uses: ['살균 소독기', '위조지폐 감별', '비타민 D 합성']},
    {id: 'vis', name: '가시광선', lam: [4e-7, 7e-7], rep: 5.5e-7, prop: '눈에 보임',
      uses: ['조명', '광학 기기', '광통신']},
    {id: 'ir', name: '적외선', lam: [7e-7, 1e-3], rep: 1e-5, prop: '열작용(열선)',
      uses: ['열화상 카메라', '적외선 체온계', '야간 투시경', '리모컨', '물리 치료기']},
    {id: 'mw', name: '마이크로파', lam: [1e-3, 1], rep: 0.12, prop: '물 분자를 흔듦 · 통신',
      uses: ['전자레인지', '휴대 전화', '와이파이·블루투스', '레이더', '위성 통신']},
    {id: 'radio', name: '라디오파', lam: [1, Infinity], rep: 300, prop: '파장이 길어 회절이 잘 됨',
      uses: ['라디오·TV 방송', '무선 통신']},
  ];
  const byId = (id) => REGIONS.find((r) => r.id === id);

  // 용도 → 영역 ('none' = 전자기파가 아님)
  const USES = [
    {use: '암 치료', region: 'gamma', why: '원자핵에서 나오는 감마선은 에너지와 투과력이 가장 커서 암세포를 파괴한다.'},
    {use: '식품·의료 기구 멸균', region: 'gamma', why: '감마선이 포장 속까지 뚫고 들어가 세균을 죽인다.'},
    {use: '공항 수하물 검색', region: 'xray', why: 'X선은 투과력이 강해 가방 속 물체의 그림자를 찍는다.'},
    {use: '뼈 사진·CT', region: 'xray', why: '뼈가 X선을 많이 흡수해 사진에 하얗게 나타난다.'},
    {use: '살균 소독기', region: 'uv', why: '자외선이 세균의 DNA·RNA를 변형시켜 번식하지 못하게 한다.'},
    {use: '위조지폐 감별', region: 'uv', why: '지폐의 형광 물질이 자외선을 흡수하고 가시광선을 낸다.'},
    {use: '조명·광학 기기', region: 'vis', why: '눈이 감지하는 빛이 가시광선이다.'},
    {use: '열화상 카메라', region: 'ir', why: '물체가 온도에 따라 내는 적외선을 감지한다(열작용).'},
    {use: '적외선 체온계', region: 'ir', why: '몸에서 나오는 적외선의 세기로 체온을 잰다.'},
    {use: '리모컨', region: 'ir', why: '눈에 보이지 않는 적외선 신호를 TV의 센서가 받는다.'},
    {use: '야간 투시경', region: 'ir', why: '어둠 속에서도 따뜻한 물체가 내는 적외선을 본다.'},
    {use: '전자레인지', region: 'mw', why: '약 2.45 GHz 마이크로파의 전기장이 물 분자를 흔들어 음식을 데운다.'},
    {use: '와이파이·블루투스', region: 'mw', why: 'EBS는 마이크로파로 분류한다(마이크로파 + 라디오파 = 전파).'},
    {use: '레이더', region: 'mw', why: '마이크로파를 쏘고 반사되어 돌아온 시간으로 거리를 잰다.'},
    {use: '휴대 전화', region: 'mw', why: '휴대 전화 통신은 마이크로파를 쓴다.'},
    {use: '라디오·TV 방송', region: 'radio', why: '라디오파는 파장이 길어 회절이 잘 되므로 산이나 건물 뒤까지 전달된다.', alias: ['라디오 방송', 'TV 방송']},
    {use: '초음파 검사', region: 'none', why: '초음파는 매질이 필요한 음파(역학적 파동)라 전자기파가 아니다.'},
  ];
  const findUse = (name) => USES.find((u) => u.use === name || (u.alias || []).includes(name));
  const regionOf = (name) => { const u = findUse(name); return u ? u.region : null; };
  const checkPair = (name, regionId) => regionOf(name) === regionId;
  // 보기 [용도, 영역] 목록 중 바르게 짝지은 것의 번호(0부터)
  const correctChoices = (pairs) => pairs.map((p, i) => (checkPair(p[0], p[1]) ? i : -1)).filter((i) => i >= 0);

  // 진동수 순서 (감마 > X > 자외 > 가시 > 적외 > 마이크로 > 라디오)
  const rank = (id) => REGIONS.findIndex((r) => r.id === id);
  const orderByFrequency = (ids) => ids.slice().sort((a, b) => rank(a) - rank(b));
  const isRadioWave = (id) => id === 'mw' || id === 'radio';          // '전파' = 마이크로파 + 라디오파

  const freq = (lambda) => C / lambda;
  const wavelength = (f) => C / f;
  const photonEnergy = (lambda) => H * C / lambda;

  // ── 장면 모형 ─────────────────────────────────────────
  // X선 투과: 남는 비율 = e^(−μL). μ 는 그림용 상대값(1/cm): 밀도가 큰 물질일수록 크다
  const MU = {cloth: 0.08, plastic: 0.25, water: 0.35, tissue: 0.3, bone: 1.6, metal: 6};
  const transmit = (material, cm) => Math.exp(-MU[material] * cm);
  // 감마선 치료: 빔 N 개가 한 점(암세포)에 모이면 그 점은 빔 하나가 지나는 곳의 N 배를 받는다
  const focusDoseRatio = (n) => n;
  // 자외선 살균: 쪼인 양에 따라 살아남는 비율 (지수 감소)
  const survival = (dose, d0 = 1) => Math.exp(-dose / d0);
  // 형광: 자외선(흡수) → 더 긴 파장의 가시광선(방출)
  const fluorescence = (absorbNm) => ({absorb: absorbNm, emit: Math.max(absorbNm + 100, 450)});
  // 적외선: 물체가 내는 적외선의 상대 세기 (절대 온도의 4제곱에 비례, 계산에만 사용)
  const irPower = (celsius) => Math.pow((celsius + 273) / 310, 4);
  // 전자레인지: 2.45 GHz → 파장
  const OVEN_F = 2.45e9;
  // 물 분자(극성)의 방향: 전기장을 따라 돈다 (그림용: 최대각 θm)
  const dipoleAngle = (phase, thetaMax = 1.1) => thetaMax * Math.sin(phase);
  // 레이더: 반사되어 돌아오는 데 걸린 시간 t → 거리 = c t / 2
  const radarDistance = (t) => C * t / 2;
  // 회절: 틈(장애물) 크기 a 에 대해 퍼지는 정도 sinθ ≈ λ/a (1 이상이면 크게 휘어 들어감)
  const spread = (lambda, a) => Math.min(1, lambda / a);
  // 초음파: 매질이 없으면 전달되지 않는다
  const ultrasoundSpeed = (medium) => (medium === 'vacuum' ? 0 : medium === 'water' ? 1500 : 340);

  const api = {C, H, REGIONS, USES, byId, findUse, regionOf, checkPair, correctChoices, orderByFrequency, isRadioWave,
    freq, wavelength, photonEnergy, MU, transmit, focusDoseRatio, survival, fluorescence, irPower, OVEN_F, dipoleAngle,
    radarDistance, spread, ultrasoundSpeed};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.III1_09 = api;
})(typeof window !== 'undefined' ? window : globalThis);
