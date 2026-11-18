/* III1-11 물결파·소리의 간섭: 경로차 조건 — 계산 모형. 브라우저(window.III1_11)와 Node 테스트(tests/III1-11-model.test.cjs)에서 같이 쓴다.
   두 점파원 S₁(−d/2, 0), S₂(+d/2, 0): 같은 진동수·같은 진폭 A. opposite = true 면 S₂ 가 반 주기 어긋남(반대 위상).
   한 파원에서 거리 r 인 곳의 변위 = A sin 2π(τ − r/λ) (τ = t/T). 경로차 Δ = |r₁ − r₂|. */
(function (root) {
  'use strict';
  const TAU = 2 * Math.PI;

  const r1 = (x, y, d) => Math.hypot(x + d / 2, y);          // S₁ 까지 거리
  const r2 = (x, y, d) => Math.hypot(x - d / 2, y);          // S₂ 까지 거리
  const pathDiff = (a, b, lambda) => Math.abs(a - b) / lambda; // 경로차 (파장 단위)

  // 판정: con 보강 · des 상쇄 · mid 그 사이. 같은 위상: 정수배 → 보강, 반정수배 → 상쇄. 반대 위상이면 뒤바뀜
  function judge(dl, opposite, tol = 0.04) {
    const fr = ((dl % 1) + 1) % 1;
    if (Math.min(fr, 1 - fr) < tol) return opposite ? 'des' : 'con';
    if (Math.abs(fr - 0.5) < tol) return opposite ? 'con' : 'des';
    return 'mid';
  }
  // 두 파동이 만난 점의 진폭 (한 파동 진폭의 몇 배, 0~2)
  const ampFactor = (dl, opposite) => Math.abs(2 * Math.cos(Math.PI * dl + (opposite ? Math.PI / 2 : 0)));
  // 한 파원에서 온 파동의 변위 (phase0 = 0 또는 π)
  const wave = (r, lambda, tau, phase0 = 0) => Math.sin(TAU * (tau - r / lambda) + phase0);
  // 점의 수면 높이 = 두 파동의 합 (A = 1)
  const height = (a, b, lambda, tau, opposite) => wave(a, lambda, tau) + wave(b, lambda, tau, opposite ? Math.PI : 0);

  // 선분 S₁S₂ 위(양 끝 제외)의 보강점·상쇄점: 중점에서 잰 거리 s 의 목록.
  // 중점에서 s 만큼 가면 한쪽은 s 멀어지고 다른 쪽은 s 가까워져 경로차 = 2|s| → 같은 종류 점은 λ/2 간격
  function segmentPoints(d, lambda, opposite) {
    const h = d / 2 - 1e-9, step = lambda / 2;
    const row = (off) => {
      const out = [];
      for (let m = Math.ceil((-h - off) / step); off + m * step < h; m++) out.push(off + m * step);
      return out;
    };
    const a = row(0), b = row(lambda / 4);                 // a: 경로차 정수배, b: 반정수배
    return opposite ? {con: b, des: a} : {con: a, des: b};
  }
  // 보강선·마디선이 되는 경로차 값들 (0 ≤ Δ < d, Δ = d 는 파원 바깥 직선이라 뺀다)
  function lineDiffs(d, lambda, opposite) {
    const ints = [], halves = [];
    for (let m = 0; m * lambda < d - 1e-9; m++) ints.push(m * lambda);
    for (let m = 0; (m + 0.5) * lambda < d - 1e-9; m++) halves.push((m + 0.5) * lambda);
    return opposite ? {con: halves, des: ints} : {con: ints, des: halves};
  }
  // r₁ − r₂ = D (부호 있음) 인 쌍곡선 위, 높이 y 인 점의 x
  function xOnLine(D, d, y) {
    const a = Math.abs(D) / 2, c = d / 2;
    if (a < 1e-12) return 0;
    if (a >= c) return NaN;
    const b2 = c * c - a * a;
    return Math.sign(D) * a * Math.sqrt(1 + y * y / b2);
  }

  /* 소리 */
  const lambdaOf = (v, f) => v / f;
  // 소리 세기 (상대값 0~4 = 진폭²)
  const loudness = (dl, opposite) => ampFactor(dl, opposite) ** 2;
  // 앞쪽 선(파원 선에서 L 떨어진 선)을 따라 걸을 때, 중앙에서 처음 상쇄되는 곳까지 거리
  // (반대 위상이면 중앙(Δ = 0)이 이미 조용하므로, 중앙 다음으로 조용한 곳 Δ = λ 까지의 거리)
  function firstQuiet(d, L, lambda, opposite) {
    const target = opposite ? lambda : lambda / 2;          // 같은 위상: Δ = λ/2, 반대 위상: Δ = λ
    if (target >= d) return NaN;
    let lo = 0, hi = 1e3;
    for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; (r1(m, L, d) - r2(m, L, d) < target ? (lo = m) : (hi = m)); }
    return (lo + hi) / 2;
  }

  const api = {TAU, r1, r2, pathDiff, judge, ampFactor, wave, height, segmentPoints, lineDiffs, xOnLine, lambdaOf, loudness, firstQuiet};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.III1_11 = api;
})(typeof window !== 'undefined' ? window : globalThis);
