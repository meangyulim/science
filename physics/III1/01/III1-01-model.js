/* III1-01 파동의 기본 요소 — 계산 모형. 브라우저(window.III1_01)와 Node 테스트(tests/III1-01-model.test.cjs)에서 같이 쓴다.
   부호 약속: 파동은 +x(오른쪽)로 진행(dir = +1)하거나 −x(dir = −1). 횡파 변위 y 는 위가 +, 종파 변위 s 는 +x 쪽이 +. */
(function (root) {
  'use strict';
  const TAU = 2 * Math.PI;

  /* III1-01 파동의 기본 요소 */
  const speed = (f, lambda) => f * lambda;          // v = fλ
  const period = (f) => 1 / f;                       // T = 1/f
  // 사인파 변위: t = 0 일 때 x = 0 이 평형점이고 위로 올라가는 중(오른쪽 진행 기준)
  const disp = (x, t, w) => w.A * Math.sin(TAU * (w.f * t - w.dir * x / w.lambda));
  // 매질 한 점의 속도(변위의 시간 변화율)
  const vel = (x, t, w) => w.A * TAU * w.f * Math.cos(TAU * (w.f * t - w.dir * x / w.lambda));
  // t 일 때 마루(최대 변위) 위치들, [x0, x1] 범위
  function crests(t, w, x0, x1) {
    // sin(...) = 1 ⇔ f t − dir x/λ = 1/4 + k → x = dir λ (f t − 1/4 − k)
    const out = [];
    const base = w.dir * w.lambda * (w.f * t - 0.25);
    const kmin = Math.floor((Math.min(x0, x1) - base) / w.lambda) - 1;
    for (let k = kmin; k < kmin + 2 + Math.ceil(Math.abs(x1 - x0) / w.lambda) + 2; k++) {
      const x = base + k * w.lambda;
      if (x >= x0 && x <= x1) out.push(x);
    }
    return out;
  }
  // 종파: 평형 위치 x 의 입자가 s(x,t) 만큼 밀린다. 밀도 비 ρ/ρ0 = 1 / (1 + ∂s/∂x)
  const density = (x, t, w) => {
    const ds = -w.dir * w.A * TAU / w.lambda * Math.cos(TAU * (w.f * t - w.dir * x / w.lambda));
    return 1 / (1 + ds);
  };

  const api = {TAU, speed, period, disp, vel, crests, density};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.III1_01 = api;
})(typeof window !== 'undefined' ? window : globalThis);
