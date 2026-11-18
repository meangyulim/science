/* A1-04 한계 조건과 연결된 강체 — 계산 모형. 브라우저(window.A1_04)와 Node 테스트(tests/A1-04-model.test.cjs)에서 같이 쓴다.
   수평 막대(길이 Lb, 무게 W, 무게중심 = 가운데)가 받침점 A(a), B(b) (a < b) 위에 놓여 있고, 무게 w 인 물체를 왼쪽 끝에서 x 인 곳에 둔다.
   실(선택): 막대의 s 지점과 바닥에 놓인 물체(무게 M = Mg)를 연직인 실로 잇는다. 실은 당기기만 하므로 0 ≤ T ≤ M.
   받침점은 밀기만 하므로 N ≥ 0. 두 받침점이 모두 닿아 있다고 보고 계산한 값(NA0, NB0)이 음수이면 그 상태는 존재하지 않는다(이미 넘어감).
   길이·힘의 단위는 부르는 쪽이 정한다(예제: 길이 L, 힘 W). */
(function (root) {
  'use strict';
  const EPS = 1e-9;
  const center = (p) => p.Lb / 2;

  // 두 받침점이 모두 닿아 있고 실의 장력이 T 일 때의 수직항력
  //   B 축 돌림힘: N_A (b − a) = W (b − c) + w (b − x) + T (b − s)
  //   A 축 돌림힘: N_B (b − a) = W (c − a) + w (x − a) + T (s − a)
  function supports(p, x, T = 0) {
    const c = center(p), d = p.b - p.a, s = p.s == null ? 0 : p.s;
    return {
      NA: (p.W * (p.b - c) + p.w * (p.b - x) + T * (p.b - s)) / d,
      NB: (p.W * (c - p.a) + p.w * (x - p.a) + T * (s - p.a)) / d,
    };
  }
  const hasRope = (p) => p.M != null && p.M > 0 && p.s != null;

  // 실제로 일어나는 상태. 실은 처음에 느슨하지 않을 만큼만 팽팽하다(장력 0)고 본다:
  //   1) 두 받침점이 다 닿고 T = 0 으로 평형이면 그대로 (state 'ok')
  //   2) N_A 가 음수가 되려 하면(B 를 축으로 돌려 함) A 가 막 떨어지고 실이 버틴다: N_A = 0, T = (B 축 돌림힘) — T ≤ M 이면 평형 ('rope')
  //   3) 그래도 모자라면(T > M: 바닥 물체가 들림) B 를 축으로 넘어간다 ('tipB'). 실이 없으면 바로 'tipB'
  //   4) N_B 가 음수가 되려 하면 같은 방식으로 A 를 축으로 ('tipA'). 실이 A 의 오른쪽에 있을 때만 실이 버틴다
  function forces(p, x) {
    const z = supports(p, x, 0), out = {NA0: z.NA, NB0: z.NB, NA: z.NA, NB: z.NB, T: 0, state: 'ok', T0: 0};
    const s = p.s == null ? 0 : p.s, d = p.b - p.a;
    if (z.NA < -EPS) {
      const T = hasRope(p) && s < p.b ? -z.NA * d / (p.b - s) : Infinity;   // N_A = 0 이 되게 하는 장력
      out.T0 = T;
      if (T <= p.M + EPS) Object.assign(out, {NA: 0, T, NB: p.W + p.w + T, state: 'rope'});
      else Object.assign(out, {state: 'tipB'});
    } else if (z.NB < -EPS) {
      const T = hasRope(p) && s > p.a ? -z.NB * d / (s - p.a) : Infinity;
      out.T0 = T;
      if (T <= p.M + EPS) Object.assign(out, {NB: 0, T, NA: p.W + p.w + T, state: 'rope'});
      else Object.assign(out, {state: 'tipA'});
    }
    return out;
  }
  const standing = (p, x) => { const st = forces(p, x).state; return st === 'ok' || st === 'rope'; };

  // 경계 위치 (막대 밖이면 막대 끝으로 자르지 않은 값)
  //   N_A = 0 (B 가 축): w (x − b) = W (b − c) [+ M (b − s)]  → 최대 x
  //   N_B = 0 (A 가 축): w (a − x) = W (c − a)                  → 최소 x  (실이 A 왼쪽에 있으면 도와주지 못함)
  function xMaxSupport(p) { return p.b + p.W * (p.b - center(p)) / p.w; }          // T = 0 일 때 N_A = 0 이 되는 곳
  function xMax(p) {
    const s = p.s == null ? 0 : p.s;
    return xMaxSupport(p) + (hasRope(p) && s < p.b ? p.M * (p.b - s) / p.w : 0);   // T = M (바닥 물체가 들리기 직전)
  }
  function xMin(p) {
    const s = p.s == null ? 0 : p.s;
    return p.a - p.W * (center(p) - p.a) / p.w - (hasRope(p) && s > p.a ? p.M * (s - p.a) / p.w : 0);
  }
  // 넘어지지 않는 범위 (막대 위로 자름)
  const range = (p) => [Math.max(0, xMin(p)), Math.min(p.Lb, xMax(p))];

  // 한 줄 판정: 전체 무게중심 x_cm 이 받침점 사이(받침면 위)에 있으면 두 수직항력이 모두 0 이상이다 (실이 없을 때)
  const xcm = (p, x) => (p.W * center(p) + p.w * x) / (p.W + p.w);

  // 돌림힘 장부: 축 B 에서 A 를 누르는 돌림힘(keep)과 들어 올리는 돌림힘(lift). N_A (b − a) = keep − lift
  function torqueB(p, x, T = 0) {
    const c = center(p), s = p.s == null ? 0 : p.s;
    const keep = p.W * Math.max(0, p.b - c) + p.w * Math.max(0, p.b - x) + T * Math.max(0, p.b - s);
    const lift = p.W * Math.max(0, c - p.b) + p.w * Math.max(0, x - p.b) + T * Math.max(0, s - p.b);
    return {keep, lift, arm: p.b - p.a, N: (keep - lift) / (p.b - p.a)};
  }
  function torqueA(p, x, T = 0) {
    const c = center(p), s = p.s == null ? 0 : p.s;
    const keep = p.W * Math.max(0, c - p.a) + p.w * Math.max(0, x - p.a) + T * Math.max(0, s - p.a);
    const lift = p.W * Math.max(0, p.a - c) + p.w * Math.max(0, p.a - x) + T * Math.max(0, p.a - s);
    return {keep, lift, arm: p.b - p.a, N: (keep - lift) / (p.b - p.a)};
  }

  // 개념서 예제·개념 체크·도전 문제의 상황
  const PRESETS = {
    ex: {Lb: 6, a: 2, b: 4, W: 1, w: 1},                          // 길이 6L, 무게 W, A = 2L, B = 4L, w = W → L ≤ x ≤ 5L
    plank: {Lb: 4, a: 0, b: 3, W: 200, w: 400},                   // 4 m · 20 kg 판자, A = 왼쪽 끝, B = 3 m, 40 kg 사람 → 최대 3.5 m
    rope: {Lb: 8, a: 2, b: 5, W: 200, w: 500, s: 0, M: 150},      // 8 m · 20 kg 판자, 왼쪽 끝에 15 kg 바닥 물체 → 1.2 m ≤ x ≤ 6.9 m
  };

  const api = {center, supports, forces, standing, xMaxSupport, xMax, xMin, range, xcm, torqueA, torqueB, PRESETS};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.A1_04 = api;
})(typeof window !== 'undefined' ? window : globalThis);
