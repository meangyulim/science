/* II2-06 자기장 속 전류가 받는 힘과 전동기 — 직류 전동기 계산 모형.
   브라우저(window.II2_06, 예전 이름 window.DCMotorModel)와 Node 테스트에서 같이 쓴다.

   좌표 (정면 = 정류자 쪽에서 축을 바라본 방향)
     x: 오른쪽, y: 위, z: 보는 사람 쪽(⊙)
     자기장 B 는 N → S. 기본은 N 이 왼쪽이라 +x 방향.
   θ: 코일이 θ = 0°(코일면이 자기장과 나란함, 변 a 가 왼쪽)에서 '시계 방향'으로 돈 각.
     변 a 위치 = (−r cos θ, r sin θ), 변 b 는 그 반대편.
   정류자: 반쪽 고리 A(변 a 와 연결)·B(변 b 와 연결). 브러시는 왼쪽·오른쪽에 고정.
     기본 전지는 오른쪽 브러시가 (+).
   코일 속 경로: A → 변 a(앞→뒤) → 뒤쪽 짧은 변 → 변 b(뒤→앞) → B. */
(function(root) {
  'use strict';
  const DEG = Math.PI / 180;
  const TAU = 2 * Math.PI;
  const GAP_DEG = 7;              // 정류자 틈의 반폭: 90°·270° 앞뒤 7° 동안 브러시가 틈에 걸린다

  const wrap360 = d => ((d % 360) + 360) % 360;

  // 정류자 틈이 브러시에 걸려 회로가 끊긴 각인가 (90°, 270° 근처)
  function inGap(thetaDeg) {
    const t = wrap360(thetaDeg);
    return Math.abs(t - 90) < GAP_DEG || Math.abs(t - 270) < GAP_DEG;
  }

  /* 회로 상태.
     opt.commutator: true(정류자) / false(통짜 고리 2개 = 슬립 링)
     opt.battery: +1(오른쪽 브러시가 +) / −1(전지를 뒤집음)
     opt.field:   +1(N 왼쪽, B 는 +x) / −1(자석을 뒤집음)
     돌려주는 값
       flowing: 전류가 흐르는가
       coil:    코일 경로(A → a → b → B)를 따라 흐르면 +1, 반대면 −1, 끊기면 0
       plusSeg: (+) 브러시에 닿은 정류자 조각 'A' | 'B' (끊기면 null)
       a, b:    각 변의 전류. +1 = ⊙(앞으로 나옴), −1 = ⊗(뒤로 들어감), 0 = 없음
       forceA:  변 a 가 받는 힘의 y 성분 부호 (+1 위, −1 아래)
       torque:  시계 방향 돌림힘 / (BIA). 정류자가 있으면 |cos θ| 꼴 */
  function state(thetaDeg, opt) {
    const o = Object.assign({commutator: true, battery: 1, field: 1}, opt || {});
    const c = Math.cos(thetaDeg * DEG);
    let coil;
    if (o.commutator) {
      if (inGap(thetaDeg)) coil = 0;
      // 조각 A 의 가운데는 변 a 와 같은 쪽: cos θ < 0 이면 A 가 오른쪽 브러시에 닿는다
      else coil = (c < 0 ? 1 : -1) * o.battery;
    } else {
      coil = -o.battery;           // 슬립 링: 고리 A 는 늘 왼쪽 브러시, B 는 오른쪽 브러시
    }
    const off = coil === 0;
    const a = off ? 0 : -coil;     // 경로 A → a 는 변 a 를 앞→뒤(⊗)로 지나간다
    const b = off ? 0 : coil;
    const forceA = off ? 0 : a * o.field;        // F = I L × B, (ẑ × x̂ = ŷ)
    const torque = off ? 0 : a * o.field * c;    // 시계 방향 = 2 r cos θ · F_a,y
    let plusSeg = null;
    if (coil !== 0) plusSeg = coil > 0 ? 'A' : 'B';
    return {flowing: coil !== 0, coil, plusSeg, a, b, forceA, torque};
  }

  // 변 a, b 의 위치 (반지름 r 단위)
  function sidePos(thetaDeg, r) {
    const t = thetaDeg * DEG, R = r || 1;
    return {a: [-R * Math.cos(t), R * Math.sin(t)], b: [R * Math.cos(t), -R * Math.sin(t)]};
  }

  /* 회전 운동. J θ'' = k I τ(θ) − c θ'
     θ 는 시계 방향 각(라디안 아님, 도). 반 바퀴마다 돌림힘이 0 이 되는 맥동이 있다. */
  const DYN = {J: 1.5, c: 1.0, k: 3.9};

  function step(s, dt, I, opt) {
    // s = {theta (도), omega (도/초)}
    const sub = Math.max(1, Math.ceil(dt / 0.004));
    const h = dt / sub;
    let th = s.theta, w = s.omega * DEG;
    for (let i = 0; i < sub; i++) {
      const tq = DYN.k * I * state(th, opt).torque;
      const acc = (tq - DYN.c * w) / DYN.J;
      w += acc * h;
      th += w * h / DEG;
    }
    return {theta: wrap360(th), omega: w / DEG};
  }

  // 정류자가 있을 때 한 바퀴 평균 돌림힘으로 정해지는 끝 속도 (도/초)
  function terminalOmega(I, opt) {
    const o = Object.assign({commutator: true, battery: 1, field: 1}, opt || {});
    let sum = 0; const N = 3600;
    for (let i = 0; i < N; i++) sum += state((i + 0.5) * 360 / N, o).torque;
    return DYN.k * I * (sum / N) / DYN.c / DEG;
  }

  // 화면에 적을 전류 경로 (전지 + 에서 − 까지)
  function pathSteps(thetaDeg, opt) {
    const o = Object.assign({commutator: true, battery: 1, field: 1}, opt || {});
    const s = state(thetaDeg, o);
    if (!s.flowing) return null;
    const plusSide = o.battery > 0 ? '오른쪽' : '왼쪽';
    const minusSide = o.battery > 0 ? '왼쪽' : '오른쪽';
    const sym = v => (v > 0 ? '⊙' : '⊗');
    const first = s.coil > 0 ? 'a' : 'b', second = first === 'a' ? 'b' : 'a';
    const inSeg = s.coil > 0 ? 'A' : 'B', outSeg = inSeg === 'A' ? 'B' : 'A';
    const part = o.commutator ? '정류자' : '고리';
    return [
      {key: 'plus', text: '전지 (+)'},
      {key: 'brush+', text: `${plusSide} 브러시`},
      {key: 'seg-in', text: `${part} ${inSeg}`},
      {key: 'side-' + first, text: `변 ${first} ${sym(s[first])}`},
      {key: 'side-' + second, text: `변 ${second} ${sym(s[second])}`},
      {key: 'seg-out', text: `${part} ${outSeg}`},
      {key: 'brush-', text: `${minusSide} 브러시`},
      {key: 'minus', text: '전지 (−)'}
    ];
  }

  const api = {DEG, TAU, GAP_DEG, wrap360, inGap, state, sidePos, DYN, step, terminalOmega, pathSteps};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.II2_06 = api; root.DCMotorModel = api; }
})(typeof window !== 'undefined' ? window : this);
