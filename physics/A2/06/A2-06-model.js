/* A2-06 단진자의 역학적 에너지 — 계산 모형. 브라우저(window.A2_06)와 Node 테스트(tests/A2-06-model.test.cjs)에서 같이 쓴다.
   SI 단위, 각은 라디안. g = 10 m/s² (원고 값). θ 는 연직선과 실 사이 각이고, 추를 놓은 쪽을 + 로 둔다.
   공기 저항이 없으면 일을 하는 힘은 중력뿐이다(장력은 늘 운동 방향에 수직) → K + U = E 일정.
   U 는 최저점을 기준(0)으로 잰다: U = mgl(1 − cosθ), E = mgl(1 − cosθ₀) = mgh.
   예제의 60° 처럼 진폭이 커도 맞게, 추의 운동은 근사 없이 정확한 해(야코비 타원 함수)로 계산한다.
   진폭이 작으면 주기는 2π√(l/g) 로 가고, 진폭이 크면 그보다 조금 길다. */
(function (root) {
  'use strict';
  const G = 10;
  const RAD = Math.PI / 180;

  const height = (l, th) => l * (1 - Math.cos(th));                          // 최저점에서 잰 높이 h = l(1 − cosθ)
  const vMax = (g, l, th0) => Math.sqrt(2 * g * height(l, th0));              // ½mv² = mgh 에서 m 이 약분 → 질량과 무관
  const kMax = (m, g, l, th0) => m * g * height(l, th0);                      // 최대 운동 에너지 = mgh → 질량에 비례
  const speedAt = (g, l, th0, th) => Math.sqrt(Math.max(0, 2 * g * l * (Math.cos(th) - Math.cos(th0))));   // 각 θ 에서의 속력
  function energies(m, g, l, th0, th) {
    const E = m * g * height(l, th0), U = m * g * height(l, th);
    return {K: Math.max(0, E - U), U, E};
  }
  // 장력: 실 방향 T − mg cosθ = mv²/l → T = mg cosθ + mv²/l = mg(3cosθ − 2cosθ₀)
  const tension = (m, g, l, th0, th) => m * g * Math.cos(th) + m * speedAt(g, l, th0, th) ** 2 / l;
  const tensionBottom = (m, g, l, th0) => m * g + m * vMax(g, l, th0) ** 2 / l;   // 최저점: mg + mv²/l (늘 무게보다 크다)
  const tensionEnd = (m, g, th0) => m * g * Math.cos(th0);                    // 양 끝: v = 0 → mg cosθ₀
  const tangential = (m, g, th) => m * g * Math.sin(th);                      // 접선 방향 알짜힘: 각에 따라 변한다 → 등가속도 운동이 아니다
  const periodSmall = (l, g) => 2 * Math.PI * Math.sqrt(l / g);               // 작은 각의 주기 (단진동 단원)

  // 제1종 완전 타원 적분 K(k): 산술·기하 평균
  function ellipK(k) {
    let a = 1, b = Math.sqrt(1 - k * k);
    for (let i = 0; i < 40 && Math.abs(a - b) > 1e-15; i++) { const a1 = (a + b) / 2; b = Math.sqrt(a * b); a = a1; }
    return Math.PI / (2 * a);
  }
  const period = (l, g, th0) => 4 * Math.sqrt(l / g) * ellipK(Math.sin(th0 / 2));   // 정확한 주기
  const energyPeriod = (l, g, th0) => period(l, g, th0) / 2;                   // K·U 는 한 주기에 두 번씩 최대 → T/2

  // 야코비 타원 함수 sn, cn, dn (모듈러스 k, 0 ≤ k < 1): 산술·기하 평균을 쓰는 표준 방법 (Abramowitz–Stegun 16.4)
  function jacobi(u, k) {
    const m = k * k;
    if (m < 1e-14) return {sn: Math.sin(u), cn: Math.cos(u), dn: 1};
    const a = [1], c = [Math.sqrt(m)];
    let b = Math.sqrt(1 - m), n = 0;
    while (Math.abs(c[n]) > 1e-15 && n < 30) {
      const an = (a[n] + b) / 2;
      c.push((a[n] - b) / 2); b = Math.sqrt(a[n] * b); a.push(an); n++;
    }
    let phi = Math.pow(2, n) * a[n] * u;
    for (let j = n; j > 0; j--) phi = (phi + Math.asin(Math.max(-1, Math.min(1, c[j] / a[j] * Math.sin(phi))))) / 2;
    const sn = Math.sin(phi), cn = Math.cos(phi);
    return {sn, cn, dn: Math.sqrt(1 - m * sn * sn)};
  }
  // 끝(θ = θ₀)에서 가만히 놓은 뒤 t 초: sin(θ/2) = k·cd(ω₀t), k = sin(θ₀/2), ω₀ = √(g/l).
  // 각속도 w = dθ/dt 는 에너지 보존 식으로 (반 주기마다 부호가 바뀐다). v = l·w (접선 방향, θ 가 커지는 쪽이 +)
  function state(t, l, g, th0) {
    if (th0 <= 0) return {th: 0, w: 0, v: 0};
    const k = Math.sin(th0 / 2), w0 = Math.sqrt(g / l), j = jacobi(w0 * t, k);
    const th = 2 * Math.asin(Math.max(-1, Math.min(1, k * j.cn / j.dn)));
    const s = Math.abs(j.sn) < 1e-13 ? 0 : -Math.sign(j.sn);
    const w = s * Math.sqrt(Math.max(0, 2 * (g / l) * (Math.cos(th) - Math.cos(th0))));
    return {th, w, v: l * w};
  }
  // 한 주기 안의 자리: 'end' 끝(v = 0), 'bottom' 최저점, 'down' 최저점 쪽으로(U → K), 'up' 끝 쪽으로(K → U)
  function phase(t, T, tol = 0.012) {
    const f = (((t / T) % 1) + 1) % 1, near = (x) => Math.abs(f - x) < tol || Math.abs(f - x - 1) < tol;
    if (near(0) || near(0.5)) return 'end';
    if (near(0.25) || near(0.75)) return 'bottom';
    return (f < 0.25 || (f > 0.5 && f < 0.75)) ? 'down' : 'up';
  }
  // 장력이 하는 일률 = 장력 · 속도 = 0 (실 방향과 접선 방향은 수직): 확인용으로 두 방향의 내적을 돌려준다
  function tensionPower(m, g, l, th0, th, w) {
    const Tn = tension(m, g, l, th0, th);
    const toPivot = [-Math.sin(th), Math.cos(th)];        // 추에서 받침점 쪽 (받침점 기준 추 위치 = (l sinθ, −l cosθ))
    const vel = [l * w * Math.cos(th), l * w * Math.sin(th)];
    return Tn * (toPivot[0] * vel[0] + toPivot[1] * vel[1]);
  }

  const api = {G, RAD, height, vMax, kMax, speedAt, energies, tension, tensionBottom, tensionEnd, tangential, periodSmall,
    ellipK, period, energyPeriod, jacobi, state, phase, tensionPower};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.A2_06 = api;
})(typeof window !== 'undefined' ? window : globalThis);
