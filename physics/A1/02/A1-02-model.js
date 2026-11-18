/* A1-02 돌림힘과 강체의 평형 — 계산 모형. 브라우저(window.A1_02)와 Node 테스트(tests/A1-02-model.test.cjs)에서 같이 쓴다.
   각도는 도(°). 돌림힘은 시계 반대 방향을 + 로 센다(오른쪽 +x, 위쪽 +y). 막대 위 위치는 m, 힘은 N.
   θ 는 축–작용점을 잇는 선(r)과 힘 사이 각. */
(function (root) {
  'use strict';
  const RAD = Math.PI / 180;
  const sinD = (d) => Math.sin(d * RAD);
  const cosD = (d) => Math.cos(d * RAD);

  // ── 돌림힘을 보는 세 관점 ───────────────────────────────
  const torque = (r, F, th) => r * F * sinD(th);              // τ = rF sinθ
  const arm = (r, th) => r * Math.abs(sinD(th));               // 팔 길이 d = 축에서 작용선까지 수직 거리 = r sinθ
  const perp = (F, th) => F * sinD(th);                        // r 에 수직인 성분 → 돌림힘을 만든다
  const para = (F, th) => F * cosD(th);                        // r 방향 성분 → 작용선이 축을 지나 돌림힘 0

  // ── 연직 힘을 받는 막대 ─────────────────────────────────
  // 힘 f = {F (위 +), x}. 축 x0 에 대한 돌림힘 τ = F (x − x0) (시계 반대 +)
  const tauOf = (f, x0) => f.F * (f.x - x0);
  const netTorque = (forces, x0) => forces.reduce((s, f) => s + tauOf(f, x0), 0);
  const netForce = (forces) => forces.reduce((s, f) => s + f.F, 0);
  // 축 x0 에 대한 장부: 시계 방향(cw)과 시계 반대 방향(ccw) 돌림힘의 크기
  function ledger(forces, x0) {
    const cw = [], ccw = [];
    for (const f of forces) {
      const t = tauOf(f, x0), row = Object.assign({}, f, {arm: Math.abs(f.x - x0), tau: Math.abs(t)});
      if (t > 1e-12) ccw.push(row); else if (t < -1e-12) cw.push(row);
    }
    const sum = (a) => a.reduce((s, r) => s + r.tau, 0);
    return {cw, ccw, sumCW: sum(cw), sumCCW: sum(ccw)};
  }
  // 두 받침(또는 연직 실) A (xA), B (xB) 가 떠받치는 강체. 아래로 누르는 무게 loads = [{w, x}]
  // A 축 돌림힘 평형: N_B (xB − xA) = Σ w (x − xA) → N_B, 힘 평형: N_A = Σw − N_B
  function supports(loads, xA, xB) {
    const total = loads.reduce((s, l) => s + l.w, 0);
    const NB = loads.reduce((s, l) => s + l.w * (l.x - xA), 0) / (xB - xA);
    const NA = total - NB;
    return {NA, NB, total, ok: NA >= -1e-9 && NB >= -1e-9};   // 받침은 밀기만, 실은 당기기만 → 음수면 그 배치는 불가능 (넘어진다)
  }
  // 예제 막대: 무게 W (중심 xW), 물체 w (위치 x), 받침 A = 0, B = 4
  const plank = (W, xW, w, x, xA = 0, xB = 4) => supports([{w: W, x: xW}, {w, x}], xA, xB);
  // 막대에 걸린 네 힘 (위 +)
  const plankForces = (W, xW, w, x, xA, xB, NA, NB) => [
    {name: 'NA', F: NA, x: xA}, {name: 'NB', F: NB, x: xB}, {name: 'W', F: -W, x: xW}, {name: 'w', F: -w, x}];
  // B 바깥 x 에 둔 물체가 막대를 넘어뜨리지 않는 최대 무게: N_A = 0 → W (xB − xW) = w (x − xB)
  const maxLoadOutside = (W, xW, x, xB) => W * (xB - xW) / (x - xB);

  // ── 축바퀴: 같은 축을 도는 반지름 r₁, r₂ 바퀴 ──────────────
  // 돌림힘 평형 T₁ r₁ = T₂ r₂, 실이 움직인 거리 s₁ : s₂ = r₁ : r₂ → 일 T₁ s₁ = T₂ s₂
  const wheelForce = (T1, r1, r2) => T1 * r1 / r2;
  const wheelPull = (s1, r1, r2) => s1 * r2 / r1;

  // ── 문 (위에서 본 회전): 같은 시간 t 동안 열린 각 φ = ½ (τ/I) t² ∝ τ ──
  const swing = (tau, I, t) => 0.5 * tau / I * t * t;

  const api = {RAD, sinD, cosD, torque, arm, perp, para, tauOf, netTorque, netForce, ledger, supports, plank, plankForces, maxLoadOutside,
    wheelForce, wheelPull, swing};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.A1_02 = api;
})(typeof window !== 'undefined' ? window : globalThis);
