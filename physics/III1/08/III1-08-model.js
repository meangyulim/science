/* III1-08 전자기파의 본질과 스펙트럼 — 계산 모형. 브라우저(window.III1_08)와 Node 테스트(tests/III1-08-model.test.cjs)에서 같이 쓴다.
   입체 그림의 좌표 약속: x = 진행 방향, y = 전기장 E 의 진동 방향(위 +), z = 자기장 B 의 진동 방향(보는 쪽 +).
   E 가 +y 일 때 B 는 +z 이고, E × B 는 +x(진행 방향)를 향한다. */
(function (root) {
  'use strict';
  const TAU = 2 * Math.PI;
  const C = 3e8;            // 진공에서 빛의 속력 (m/s) — 원고 값
  const H = 6.6e-34;        // 플랑크 상수 (J·s) — 원고 값
  const V_SOUND = 340;      // 공기 중 소리의 속력 (m/s)

  // 7영역: 파장 경계(m). 개념서 스펙트럼 그림의 대략적인 경계(감마선과 X선은 실제로 겹치며 '나오는 곳'으로 구분한다)
  const REGIONS = [
    {id: 'gamma', name: '감마선', short: '감마', lo: 0, hi: 1e-11},
    {id: 'xray', name: 'X선', short: 'X선', lo: 1e-11, hi: 1e-8},
    {id: 'uv', name: '자외선', short: '자외', lo: 1e-8, hi: 4e-7},
    {id: 'vis', name: '가시광선', short: '가시', lo: 4e-7, hi: 7e-7},
    {id: 'ir', name: '적외선', short: '적외', lo: 7e-7, hi: 1e-3},
    {id: 'mw', name: '마이크로파', short: '마이크로', lo: 1e-3, hi: 1},
    {id: 'radio', name: '라디오파', short: '라디오', lo: 1, hi: Infinity},
  ];

  const freq = (lambda) => C / lambda;               // f = c/λ
  const wavelength = (f) => C / f;                   // λ = c/f
  const period = (lambda) => lambda / C;             // T = 1/f = λ/c
  const photonEnergy = (lambda) => H * C / lambda;   // E = hf = hc/λ
  // 가시광선은 양 끝(400 nm 보라, 700 nm 빨강)을 포함한다
  const region = (lambda) => (lambda >= 4e-7 && lambda <= 7e-7 ? REGIONS[3]
    : REGIONS.find((r) => lambda >= r.lo && lambda < r.hi) || REGIONS[REGIONS.length - 1]);

  // 진공에서의 속력. 전자기파는 진동수와 관계없이 c. 소리·초음파(역학적 파동)는 매질이 없으면 전달되지 않는다(0).
  function speed(kind, medium = 'vacuum') {
    if (kind === 'em') return C;
    return medium === 'vacuum' ? 0 : V_SOUND;
  }
  const isEM = (kind) => kind === 'em';

  // 진동수가 큰 것부터 (= 파장이 짧은 것부터)
  const byFrequency = (lams) => lams.slice().sort((a, b) => freq(b) - freq(a));
  // 영역 이름 → 진동수 순서 (감마 > X > 자외 > 가시 > 적외 > 마이크로 > 라디오)
  const regionRank = (id) => REGIONS.findIndex((r) => r.id === id);
  const orderByFrequency = (ids) => ids.slice().sort((a, b) => regionRank(a) - regionRank(b));

  // 입체 그림의 장: E ∥ y, B ∥ z, 같은 위상. w = {f, lambda, E0}. 진공이면 B0 = E0 / c.
  function fields(x, t, w) {
    const s = Math.sin(TAU * (w.f * t - x / w.lambda));
    return {E: [0, w.E0 * s, 0], B: [0, 0, w.E0 / C * s]};
  }
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  // t 일 때 E 의 마루(최대) 위치: f t − x/λ = 1/4 + k
  function crests(t, w, x0, x1) {
    const out = [], base = w.lambda * (w.f * t - 0.25);
    const k0 = Math.ceil((base - x1) / w.lambda), k1 = Math.floor((base - x0) / w.lambda);
    for (let k = k1; k >= k0; k--) out.push(base - k * w.lambda);
    return out;
  }

  // 가시광선의 색: 파장(nm) → [r, g, b] (0~255, Bruton 근사). 380~780 nm 밖이면 null
  function visibleRGB(nm) {
    if (!(nm >= 380 && nm <= 780)) return null;
    let r = 0, g = 0, b = 0;
    if (nm < 440) { r = (440 - nm) / 60; b = 1; }
    else if (nm < 490) { g = (nm - 440) / 50; b = 1; }
    else if (nm < 510) { g = 1; b = (510 - nm) / 20; }
    else if (nm < 580) { r = (nm - 510) / 70; g = 1; }
    else if (nm < 645) { r = 1; g = (645 - nm) / 65; }
    else r = 1;
    let k = 1;
    if (nm > 700) k = 0.35 + 0.65 * (780 - nm) / 80; else if (nm < 420) k = 0.35 + 0.65 * (nm - 380) / 40;
    const c = (v) => Math.round(255 * Math.pow(v * k, 0.8));
    return [c(r), c(g), c(b)];
  }
  function colorName(nm) {
    if (nm < 380 || nm > 780) return '';
    if (nm < 450) return '보라';
    if (nm < 495) return '파랑';
    if (nm < 570) return '초록';
    if (nm < 590) return '노랑';
    if (nm < 620) return '주황';
    return '빨강';
  }

  // 길이에 맞는 단위: 6e-7 → {v: 0.6, u: 'μm'}, 0.12 → {v: 12, u: 'cm'}
  const UNITS = [[1e3, 'km'], [1, 'm'], [1e-2, 'cm'], [1e-3, 'mm'], [1e-7, 'μm', 1e-6], [1e-10, 'nm', 1e-9], [1e-13, 'pm', 1e-12], [0, 'fm', 1e-15]];
  function lengthUnit(m) {
    for (const [min, u, s] of UNITS) if (m >= min) return {v: m / (s || min), u};
    return {v: m / 1e-15, u: 'fm'};
  }
  // 유효 숫자 2개로 맞추기 (슬라이더 값 정리용)
  const snap2 = (v) => parseFloat(v.toPrecision(2));

  // 크기 비교 물체 (대표 크기, m)
  const OBJECTS = [
    {id: 'nucleus', name: '원자핵', size: 1e-14},
    {id: 'atom', name: '원자', size: 1e-10},
    {id: 'virus', name: '바이러스', size: 1e-7},
    {id: 'bacteria', name: '세균', size: 1e-6},
    {id: 'cell', name: '세포', size: 1e-5},
    {id: 'hair', name: '머리카락 굵기', size: 1e-4},
    {id: 'ant', name: '개미', size: 5e-3},
    {id: 'phone', name: '스마트폰', size: 0.15},
    {id: 'human', name: '사람', size: 1.7},
    {id: 'building', name: '건물', size: 30},
    {id: 'mountain', name: '산', size: 1000},
  ];
  // 파장과 크기가 가장 비슷한 물체 (로그 차이가 가장 작은 것)
  function nearestObject(lambda) {
    let best = OBJECTS[0], d = Infinity;
    for (const o of OBJECTS) { const e = Math.abs(Math.log10(o.size / lambda)); if (e < d) { d = e; best = o; } }
    return best;
  }

  const api = {TAU, C, H, V_SOUND, REGIONS, OBJECTS, freq, wavelength, period, photonEnergy, region, speed, isEM,
    byFrequency, orderByFrequency, fields, dot, cross, crests, visibleRGB, colorName, lengthUnit, snap2, nearestObject};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.III1_08 = api;
})(typeof window !== 'undefined' ? window : globalThis);
