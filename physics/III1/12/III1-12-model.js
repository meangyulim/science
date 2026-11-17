/* III1-12 빛의 간섭과 간섭의 이용 — 계산 모형. 브라우저(window.III1_12)와 Node 테스트(tests/III1-12-model.test.cjs)에서 같이 쓴다.
   정성 개념이라 화면에는 식을 쓰지 않고, 판정(보강·상쇄)·밝기·색만 이 모형으로 계산한다.
   이중 슬릿: 슬릿 S₁(0, +d/2), S₂(0, −d/2), 스크린 위의 점 (L, y). 경로차 Δ = r₂ − r₁ (위쪽이 +).
   얇은 막: 위 매질 n1 | 막 n2 (두께 t) | 아래 매질 n3. ① 윗면 반사, ② 막 속을 왕복한 뒤 아랫면 반사. */
(function (root) {
  'use strict';
  const TAU = 2 * Math.PI;

  /* ── 이중 슬릿 ─────────────────────────────────────── */
  const slitR = (y, d, L) => [Math.hypot(L, y - d / 2), Math.hypot(L, y + d / 2)];
  const slitDiff = (y, d, L) => { const [a, b] = slitR(y, d, L); return b - a; };
  // 판정: con 보강(밝음) · des 상쇄(어두움) · mid 그 사이 — 경로차를 파장 단위로
  function judge(dl, tol = 0.04) {
    const fr = ((Math.abs(dl) % 1) + 1) % 1;
    if (Math.min(fr, 1 - fr) < tol) return 'con';
    if (Math.abs(fr - 0.5) < tol) return 'des';
    return 'mid';
  }
  const brightness = (dl) => Math.cos(Math.PI * dl) ** 2;             // 두 빛이 겹친 상대 밝기 0~1
  const wave = (r, lambda, tau) => Math.sin(TAU * (tau - r / lambda));  // 한 슬릿에서 온 빛의 진동
  // 경로차가 D(부호 있음)인 스크린 위치 y (경로차는 y 에 대해 늘어나기만 하므로 이분법)
  function yOfDiff(D, d, L) {
    if (Math.abs(D) >= d) return NaN;
    let lo = -1e7, hi = 1e7;
    for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; (slitDiff(m, d, L) < D ? (lo = m) : (hi = m)); }
    return (lo + hi) / 2;
  }

  /* ── 얇은 막 ───────────────────────────────────────── */
  const refl = (na, nb) => (na - nb) / (na + nb);    // 진폭 반사 계수(음수면 반사할 때 반 파장 뒤집힘)
  // ② 가 ① 보다 늦은 위상(라디안): 막 속 왕복 거리 + 두 반사의 뒤집힘 차이
  function filmDelta(t, lambda, n1, n2, n3, theta = 0) {
    const st = Math.sin(theta) * n1 / n2, ct = Math.sqrt(1 - st * st);
    const flip = (refl(n1, n2) < 0) !== (refl(n2, n3) < 0) ? Math.PI : 0;
    return TAU * 2 * n2 * t * ct / lambda + flip;
  }
  // 두 반사광의 위상 관계: con 같은 위상(보강) · des 반대 위상(상쇄) · mid
  function phaseJudge(delta, tol = 0.06) {
    const fr = ((delta / TAU) % 1 + 1) % 1;
    if (Math.min(fr, 1 - fr) < tol) return 'con';
    if (Math.abs(fr - 0.5) < tol) return 'des';
    return 'mid';
  }
  const twoBeam = (delta) => (1 + Math.cos(delta)) / 2;      // 세기가 같은 두 반사광이 겹친 밝기 0~1
  // 실제 반사율(수직 입사, 막 안의 여러 번 반사까지)
  function reflectance(t, lambda, n1, n2, n3) {
    const a = refl(n1, n2), b = refl(n2, n3), c = Math.cos(4 * Math.PI * n2 * t / lambda);
    return (a * a + b * b + 2 * a * b * c) / (1 + a * a * b * b + 2 * a * b * c);
  }

  /* ── 색 (가시광선의 실제 색) ──────────────────────────── */
  // CIE 1931 등색 함수의 근사 (Wyman·Sloan·Shirley 2013)
  const gs = (x, mu, s1, s2) => { const u = (x - mu) / (x < mu ? s1 : s2); return Math.exp(-0.5 * u * u); };
  const cmf = (l) => [
    1.056 * gs(l, 599.8, 37.9, 31.0) + 0.362 * gs(l, 442.0, 16.0, 26.7) - 0.065 * gs(l, 501.1, 20.4, 26.2),
    0.821 * gs(l, 568.8, 46.9, 40.5) + 0.286 * gs(l, 530.9, 16.3, 31.1),
    1.217 * gs(l, 437.0, 11.8, 36.0) + 0.681 * gs(l, 459.0, 26.0, 13.8)];
  const xyz2lin = ([X, Y, Z]) => [3.2406 * X - 1.5372 * Y - 0.4986 * Z, -0.9689 * X + 1.8758 * Y + 0.0415 * Z, 0.0557 * X - 0.2040 * Y + 1.0570 * Z];
  const gamma = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
  const WL = []; for (let l = 380; l <= 730; l += 5) WL.push(l);
  const CMF = WL.map(cmf);
  const WHITE = xyz2lin(CMF.reduce((s, c) => s.map((v, i) => v + c[i]), [0, 0, 0]));
  // 파장마다의 반사 세기 R(λ)(0~1)를 눈에 보이는 색 [r, g, b](0~255)로. 모든 파장에서 1 이면 흰색
  function spectrumRGB(R) {
    const s = [0, 0, 0];
    WL.forEach((l, i) => { const r = R(l), c = CMF[i]; s[0] += c[0] * r; s[1] += c[1] * r; s[2] += c[2] * r; });
    const lin = xyz2lin(s).map((v, i) => Math.max(0, v / WHITE[i]));
    const mx = Math.max(...lin), k = mx > 1 ? 1 / mx : 1;              // 넘치면 색조를 지키며 줄인다
    return lin.map((v) => Math.round(255 * gamma(v * k)));
  }
  // 단색광의 색 [r, g, b]
  function waveRGB(l) {
    const lin = xyz2lin(cmf(l)).map((v) => Math.max(0, v)), mx = Math.max(...lin) || 1;
    return lin.map((v) => Math.round(255 * gamma(v / mx)));
  }

  /* ── 간섭의 이용 ───────────────────────────────────── */
  const USES = [
    {id: 'noise', name: '소음 제거 헤드폰', kind: 'des'},
    {id: 'coat', name: '무반사 코팅', kind: 'des'},
    {id: 'inst', name: '악기', kind: 'con'},
    {id: 'stone', name: '초음파 결석 파쇄', kind: 'con'},
    {id: 'ink', name: '색 변환 잉크', kind: 'con'}];
  const useKind = (id) => (USES.find((u) => u.id === id) || {}).kind;
  // 소음 제거: 마이크로 받은 소음과 반대 위상의 소리 → 귀에서 합
  const noise = (t) => 0.6 * Math.sin(TAU * 1.0 * t) + 0.35 * Math.sin(TAU * 2.3 * t + 0.7) + 0.2 * Math.sin(TAU * 3.7 * t + 1.9);
  const antiNoise = (t) => -noise(t);
  // 초음파 결석 파쇄: 여러 발생 장치(srcs)에서 같은 시각에 낸 펄스(폭 w)가 점 p 에 도착해 겹친 세기의 최댓값
  function pulsePeak(srcs, p, v = 1, w = 0.05) {
    const ts = srcs.map((s) => Math.hypot(p[0] - s[0], p[1] - s[1]) / v);
    let best = 0;
    for (const t0 of ts) { let s = 0; for (const t of ts) s += Math.exp(-(((t0 - t) / w) ** 2)); best = Math.max(best, s); }
    return best;
  }

  const api = {TAU, slitR, slitDiff, judge, brightness, wave, yOfDiff, refl, filmDelta, phaseJudge, twoBeam, reflectance,
    cmf, spectrumRGB, waveRGB, USES, useKind, noise, antiNoise, pulsePeak};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.III1_12 = api;
})(typeof window !== 'undefined' ? window : globalThis);
