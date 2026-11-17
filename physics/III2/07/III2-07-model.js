/* III2-07 물질파 그래프·표 해석과 변환 공식 — 계산 모형. 브라우저(window.III2_07)와 Node 테스트(tests/III2-07-model.test.cjs)에서 같이 쓴다.
   표형 문항처럼 질량은 m 의 배수, 운동 에너지는 E 의 배수(정수 1~9)로 둔다.
   상대 단위: 운동량 p₀ = √(2mE), 파장 λ₀ = h/p₀, 속력 v₀ = √(2E/m) 를 1로 하면
     p = √(m·E_k),  λ = 1/p,  v = √(E_k/m)
   이고 변환 공식 p = h/λ, E_k = p²/2m = pv/2, m = p²/2E_k, v = 2E_k/p 는 각각
     p = 1/λ,  E_k = p²/m = p·v,  m = p²/E_k,  v = E_k/p   가 된다. */
(function (root) {
  'use strict';
  const p = (m, E) => Math.sqrt(m * E);                 // ∝ √(mE_k)
  const lambda = (m, E) => 1 / Math.sqrt(m * E);        // ∝ 1/√(mE_k)
  const v = (m, E) => Math.sqrt(E / m);                 // ∝ √(E_k/m)

  // 변환 공식 (상대 단위)
  const pFromLambda = (lam) => 1 / lam;                 // p = h/λ
  const ekFromPM = (pp, m) => pp * pp / m;              // E_k = p²/2m
  const ekFromPV = (pp, vv) => pp * vv;                 // E_k = pv/2
  const mFromPE = (pp, E) => pp * pp / E;               // m = p²/2E_k
  const vFromEP = (E, pp) => E / pp;                    // v = 2E_k/p
  // 같은 공식의 SI 꼴 (확인용)
  const SI = {
    pFromLambda: (h, lam) => h / lam,
    ekFromPM: (pp, m) => pp * pp / (2 * m),
    ekFromPV: (pp, vv) => pp * vv / 2,
    mFromPE: (pp, E) => pp * pp / (2 * E),
    vFromEP: (E, pp) => 2 * E / pp,
  };

  // 그래프: 축 조합별 점 (가로, 세로)
  const AXES = {
    lp: (m, E) => [p(m, E), lambda(m, E)],              // λ–p : 쌍곡선 하나
    lE: (m, E) => [E, lambda(m, E)],                    // λ–E_k : 질량별 곡선
    pE: (m, E) => [E, p(m, E)],                         // p–E_k : 질량별 곡선
    iv: (m, E) => [v(m, E), 1 / lambda(m, E)],          // 1/λ–v : 기울기 m/h 인 직선
    Ev: (m, E) => [v(m, E), E],                         // E_k–v : 포물선 E_k = ½mv²
    im: (m, E) => [m, 1 / lambda(m, E)],                // 1/λ–m : 원점과 이은 기울기 = v/h
  };
  // 질량 m 인 입자의 곡선 y(x) (1/λ–m 은 점마다 원점을 지나는 직선이라 따로 그린다)
  const CURVE = {
    lp: (m, x) => 1 / x,
    lE: (m, x) => 1 / Math.sqrt(m * x),
    pE: (m, x) => Math.sqrt(m * x),
    iv: (m, x) => m * x,
    Ev: (m, x) => m * x * x,
  };

  // ── 비와 근호 꼴 (표형 문항 답 쓰기) ──────────────────────────
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  function surd(n) {                                    // n = s²·r (r 은 제곱 인수가 없다) → [s, r]
    let s = 1, r = n;
    for (let k = 2; k * k <= r; k++) while (r % (k * k) === 0) { r /= k * k; s *= k; }
    return [s, r];
  }
  const term = ([s, r]) => (r === 1 ? String(s) : (s === 1 ? '' : String(s)) + '√' + r);
  const intRatio = (a, b) => { const g = gcd(a, b); return a / g + ' : ' + b / g; };
  // √a : √b 를 간단히 ('2 : 1', '√2 : 1', '√3 : √2')
  function sqrtRatio(a, b) { const g = gcd(a, b); return term(surd(a / g)) + ' : ' + term(surd(b / g)); }
  // √(a/b) 의 값 ('2', '1/2', '2√2', '1/√3', '√3/2')
  function sqrtFracStr(a, b) {
    const g = gcd(a, b), n = surd(a / g), d = surd(b / g);
    if (d[0] === 1 && d[1] === 1) return term(n);
    const ds = term(d);
    return term(n) + '/' + (d[1] !== 1 && d[0] !== 1 ? '(' + ds + ')' : ds);
  }
  // A, B (질량 mA, mB, 운동 에너지 EA, EB — 정수 배) 의 비교
  function compare(mA, EA, mB, EB) {
    return {
      m: intRatio(mA, mB), E: intRatio(EA, EB),
      p: sqrtRatio(mA * EA, mB * EB),                   // p ∝ √(mE)
      lam: sqrtRatio(mB * EB, mA * EA),                 // λ ∝ 1/√(mE)
      v: sqrtRatio(EA * mB, EB * mA),                   // v ∝ √(E/m)  →  √(E_A m_B) : √(E_B m_A)
      eqP: mA * EA === mB * EB, eqE: EA === EB, eqM: mA === mB, eqV: EA * mB === EB * mA,
    };
  }

  const api = {p, lambda, v, pFromLambda, ekFromPM, ekFromPV, mFromPE, vFromEP, SI, AXES, CURVE,
    gcd, surd, intRatio, sqrtRatio, sqrtFracStr, compare};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.III2_07 = api;
})(typeof window !== 'undefined' ? window : globalThis);
