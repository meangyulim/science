/* III1-07 전반사, 광섬유와 광통신 — 계산 모형. 브라우저(window.III1_07)와 Node 테스트(tests/III1-07-model.test.cjs)에서 같이 쓴다.
   각은 모두 '도'이고 법선과의 각이다. n1 = 빛이 지금 있는 매질, n2 = 나가려는 매질. */
(function (root) {
  'use strict';
  const DEG = Math.PI / 180;

  /* 임계각: n1 sinθc = n2 sin90° → sinθc = n2/n1. 굴절률 큰 쪽 → 작은 쪽(n1 > n2)일 때만 있다 */
  const criticalAngle = (n1, n2) => (n1 > n2 ? Math.asin(n2 / n1) / DEG : NaN);

  /* 굴절각: n1 sinθ1 = n2 sinθ2. 굴절할 각이 없으면(전반사) NaN */
  function refractionAngle(n1, n2, deg) {
    const s = n1 * Math.sin(deg * DEG) / n2;
    if (s > 1 + 1e-12) return NaN;
    return Math.asin(Math.min(1, s)) / DEG;
  }

  /* 전반사 두 조건: (굴절률 큰 → 작은 쪽) 그리고 (입사각 > 임계각) */
  const isTIR = (n1, n2, deg) => n1 > n2 && deg > criticalAngle(n1, n2) + 1e-9;

  /* 반사되는 빛의 세기 비율 (편광하지 않은 빛). 교과 밖 식(프레넬)이라 화면에는 쓰지 않고 밝기 계산에만 쓴다 */
  function reflectance(n1, n2, deg) {
    const t1 = deg * DEG, s2 = n1 * Math.sin(t1) / n2;
    if (s2 >= 1) return 1;
    const c1 = Math.cos(t1), c2 = Math.sqrt(1 - s2 * s2);
    const rs = (n1 * c1 - n2 * c2) / (n1 * c1 + n2 * c2), rp = (n1 * c2 - n2 * c1) / (n1 * c2 + n2 * c1);
    return (rs * rs + rp * rp) / 2;
  }

  /* 상태: 'refract'(굴절 + 약한 반사) | 'critical'(굴절각 90°) | 'tir'(전반사) */
  function regime(n1, n2, deg, tol = 0.3) {
    if (!(n1 > n2)) return 'refract';
    const tc = criticalAngle(n1, n2);
    if (Math.abs(deg - tc) <= tol) return 'critical';
    return deg < tc ? 'refract' : 'tir';
  }

  /* 광섬유: 끝면 입사각 i(바깥 nOut) → 코어 속 굴절각 r → 코어-클래딩 경계면 입사각 90° − r */
  function fiber(i, nCore, nClad, nOut = 1) {
    const r = Math.asin(nOut * Math.sin(i * DEG) / nCore) / DEG;
    const boundary = 90 - r, thetaC = criticalAngle(nCore, nClad);
    return {r, boundary, thetaC, tir: nCore > nClad && boundary > thetaC + 1e-9};
  }
  /* 빛이 갇히는(전반사하는) 끝면 입사각의 한계: sin i = √(n코어² − n클래딩²) / n바깥 (1 이상이면 모든 각) */
  function maxEntry(nCore, nClad, nOut = 1) {
    if (!(nCore > nClad)) return 0;
    const s = Math.sqrt(nCore * nCore - nClad * nClad) / nOut;
    return s >= 1 ? 90 : Math.asin(s) / DEG;
  }
  /* 경계에서 N번 부딪힌 뒤 코어에 남는 빛의 비율 (전반사면 1) */
  function fiberLeft(i, nCore, nClad, bounces, nOut = 1) {
    const f = fiber(i, nCore, nClad, nOut);
    if (f.tir) return 1;
    return Math.pow(reflectance(nCore, nClad, f.boundary), bounces);
  }
  /* 코어 안 지그재그: 반지름 a, 길이 L, 끝면 중심에서 굴절각 r 로 출발 → 경계에 닿는 점들의 x */
  function bounces(r, a, L) {
    const out = [], t = Math.tan(r * DEG);
    if (t <= 0) return out;
    for (let x = a / t; x <= L; x += 2 * a / t) out.push(x);
    return out;
  }

  /* 광통신: 정보가 바뀌어 가는 차례와 장치 */
  const CHAIN = [
    {from: '소리·영상', to: '전기 신호', device: '마이크·카메라'},
    {from: '전기 신호', to: '빛 신호', device: '발광 다이오드(LED)·레이저', part: '발신기'},
    {from: '빛 신호', to: '빛 신호', device: '광섬유(전반사로 전송)'},
    {from: '빛 신호', to: '전기 신호', device: '광 다이오드', part: '수신기'},
    {from: '전기 신호', to: '소리·영상', device: '스피커·화면'},
  ];
  const deviceFor = (from, to) => { const c = CHAIN.find((s) => s.from === from && s.to === to); return c ? c.device : null; };

  const api = {DEG, criticalAngle, refractionAngle, isTIR, reflectance, regime, fiber, maxEntry, fiberLeft, bounces, CHAIN, deviceFor};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.III1_07 = api;
})(typeof window !== 'undefined' ? window : globalThis);
