/* III2-06 물질파(드브로이 파) — 계산 모형. 브라우저(window.III2_06)와 Node 테스트(tests/III2-06-model.test.cjs)에서 같이 쓴다.
   단위는 SI(m, kg, J, s). 원고 값: h = 6.6 × 10⁻³⁴ J·s, 1 eV = 1.6 × 10⁻¹⁹ J, 전자 질량 9.1 × 10⁻³¹ kg, 양성자 = 전자의 1840배.
   λ = h/p = h/(mv) = h/√(2mE_k) — 상대론 효과가 작은 범위(전자 10 keV 이하)만 다룬다. */
(function (root) {
  'use strict';
  const H = 6.6e-34;               // 플랑크 상수 (J·s)
  const EV = 1.6e-19;              // 1 eV (J)
  const ME = 9.1e-31;              // 전자 질량 (kg)
  const MP = 1840 * ME;            // 양성자 질량 ≈ 1.67 × 10⁻²⁷ kg
  const MA = 4 * MP;               // 알파 입자(양성자 2 + 중성자 2) ≈ 양성자의 4배

  // 고를 수 있는 입자. range = 운동 에너지 슬라이더 범위(J), def = 처음 값(J)
  const PARTICLES = {
    e: {name: '전자', sym: 'e⁻', m: ME, micro: true, range: [0.1 * EV, 1e4 * EV], def: 25 * EV},
    p: {name: '양성자', sym: 'p⁺', m: MP, micro: true, range: [0.01 * EV, 1e7 * EV], def: 100 * EV},
    a: {name: '알파 입자', sym: 'α', m: MA, micro: true, range: [0.01 * EV, 1e7 * EV], def: 5e6 * EV},
    ball: {name: '야구공', sym: '', m: 0.145, micro: false, range: [1, 1000], def: 120},
  };

  const momentum = (m, Ek) => Math.sqrt(2 * m * Ek);          // p = √(2mE_k)
  const wavelength = (m, Ek) => H / momentum(m, Ek);          // λ = h/√(2mE_k)
  const lambdaFromP = (p) => H / p;                           // λ = h/p
  const lambdaFromMV = (m, v) => H / (m * v);                 // λ = h/(mv)
  const speed = (m, Ek) => Math.sqrt(2 * Ek / m);             // E_k = ½mv²
  const ekFromP = (m, p) => p * p / (2 * m);                  // E_k = p²/2m
  const ekFromV = (m, v) => 0.5 * m * v * v;

  // B 를 A 와 같은 양으로 맞출 때 B 의 운동 에너지: 'Ek' 같은 운동 에너지, 'p' 같은 운동량, 'v' 같은 속력
  function matchEk(mA, EA, mB, keep) {
    if (keep === 'Ek') return EA;
    if (keep === 'p') return EA * mA / mB;                    // 2m·E_k 가 같다
    if (keep === 'v') return EA * mB / mA;                    // E_k/m 가 같다
    return null;
  }
  // λ_B / λ_A = √(m_A E_A / (m_B E_B))   (곱이 일정: 2mE_kλ² = h²)
  const lambdaRatio = (mA, EA, mB, EB) => Math.sqrt((mA * EA) / (mB * EB));

  // 파장의 크기 판정 (원자 지름 ≈ 10⁻¹⁰ m, 원자핵 ≈ 10⁻¹⁵~10⁻¹⁴ m)
  const ATOM = 1e-10, NUCLEUS = 1e-14;
  function scaleOf(lam) {
    if (lam > 1e-9) return 'wide';       // 1 nm 보다 길다: 원자 여러 개
    if (lam >= 1e-11) return 'atom';     // 원자 크기 정도 → 결정에서 회절(파동성)이 잘 드러난다
    if (lam >= 1e-13) return 'sub';      // 원자보다 훨씬 짧다
    if (lam >= 1e-16) return 'nucleus';  // 원자핵 크기 정도
    return 'none';                       // 너무 짧아 관측할 수 없다
  }

  const api = {H, EV, ME, MP, MA, ATOM, NUCLEUS, PARTICLES, momentum, wavelength, lambdaFromP, lambdaFromMV, speed,
    ekFromP, ekFromV, matchEk, lambdaRatio, scaleOf};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.III2_06 = api;
})(typeof window !== 'undefined' ? window : globalThis);
