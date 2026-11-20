/* B1-03 전기장의 벡터 중첩 (2·3차원) — 계산 모형. 브라우저(window.B1_03)와 Node 테스트(tests/B1-03-model.test.cjs)에서 같이 쓴다.
   점은 [x, y] 또는 [x, y, z] (오른쪽 +x, 위쪽 +y, 3차원은 z 가 위). 안에서는 모두 3차원 [x, y, z] 로 계산한다.
   점전하 q 가 점 P 에 만드는 전기장: E = kq·(P − 전하)/r³ (세기 kq/r², 양전하는 멀어지는 쪽, 음전하는 향하는 쪽).
   k = 9 × 10⁹ N·m²/C² (원고 값). k = 1, 길이 단위 d, 전하 단위 q 로 두면 값의 단위는 kq/d² 이다.
   예제·문항은 「한 전하가 P 에 만드는 세기」 E₀ = k q₀ / r₀² 를 단위로 쓴다(값 ÷ (q₀/r₀²)). */
(function (root) {
  'use strict';
  const K = 9e9;
  const RAD = Math.PI / 180;

  // ── 벡터 (3차원) ────────────────────────────────────────
  const v3 = (p) => [p[0], p[1], p.length > 2 ? p[2] : 0];
  const add = (...vs) => vs.reduce((s, v) => [s[0] + v[0], s[1] + v[1], s[2] + (v[2] || 0)], [0, 0, 0]);   // 꼬리–머리로 잇기 = 성분끼리 더하기
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], (a[2] || 0) - (b[2] || 0)];
  const scale = (v, k) => [v[0] * k, v[1] * k, (v[2] || 0) * k];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + (a[2] || 0) * (b[2] || 0);
  const norm = (v) => Math.hypot(v[0], v[1], v[2] || 0);
  const unit = (v) => { const L = norm(v); return L > 0 ? scale(v, 1 / L) : [0, 0, 0]; };
  const dist = (a, b) => norm(sub(a, b));

  // ── 점전하 하나의 전기장 ────────────────────────────────
  const strength = (q, r, k = 1) => k * Math.abs(q) / (r * r);          // E = k|q|/r²  (거리 제곱에 반비례)
  const comp = (q, delta, r, k = 1) => k * q * delta / (r * r * r);     // Eₓ = kqΔx/r³ (Δx = 관찰점 x − 전하 x, q 의 부호 그대로)
  // 점전하 q (자리 at) 가 점 P 에 만드는 전기장 [Eₓ, E_y, E_z]. 전하 자리에서는 정의되지 않는다(NaN)
  function field(q, at, P, k = 1) {
    const d = sub(v3(P), v3(at)), r = norm(d);
    if (r < 1e-12) return [NaN, NaN, NaN];
    return scale(d, k * q / (r * r * r));
  }
  // 방향 판정: 양전하의 E 는 전하에서 멀어지고('away'), 음전하의 E 는 전하를 향한다('toward')
  function sense(q, at, P) {
    const s = dot(field(q, at, P), sub(v3(P), v3(at)));
    return s > 0 ? 'away' : s < 0 ? 'toward' : 'none';
  }

  // ── 중첩: 각 전하의 기여를 따로 구해 벡터로 더한다 ─────
  // charges = [{q, at}, …] → {parts: [{q, at, d, r, E, mag, u}], sum, mag, scalar (세기만 더한 값)}
  function superpose(charges, P, k = 1) {
    const parts = charges.map((c) => {
      const at = v3(c.at), d = sub(v3(P), at), r = norm(d), E = field(c.q, at, P, k);
      return {q: c.q, at, d, r, E, mag: norm(E), u: unit(d)};
    });
    const sum = add(...parts.map((p) => p.E));
    return {parts, sum, mag: norm(sum), scalar: parts.reduce((s, p) => s + p.mag, 0)};
  }
  // 단위 E₀ = k q₀/r₀² 로 나타낸 중첩 (k 는 지워진다)
  function superposeU(charges, P, q0 = 1, r0 = 1) {
    const s = superpose(charges, P, 1), f = r0 * r0 / q0;
    s.parts.forEach((p) => { p.E = scale(p.E, f); p.mag *= f; });
    s.sum = scale(s.sum, f); s.mag *= f; s.scalar *= f;
    return s;
  }
  const dirDeg = (E) => Math.atan2(E[1], E[0]) / RAD;                    // x축에서 잰 방향 각 (tan θ = E_y/Eₓ)
  const tanTheta = (E) => E[1] / E[0];
  // 한 축(0 = x, 1 = y, 2 = z)의 열 합이 0 인데 0 이 아닌 항이 있으면 '대칭으로 상쇄'
  function cancels(parts, axis, eps = 1e-9) {
    const vals = parts.map((p) => p.E[axis]), big = Math.max(0, ...vals.map(Math.abs));
    return big > eps && Math.abs(vals.reduce((a, b) => a + b, 0)) < eps * Math.max(1, big);
  }
  // 화살표 전체가 서로 지우는 쌍 (E_i + E_j = 0: 크기가 같고 방향이 반대) → [[i, j], …]
  function vecPairs(parts, eps = 1e-9) {
    const used = new Set(), out = [];
    parts.forEach((p, i) => {
      if (used.has(i) || p.mag < eps || !isFinite(p.mag)) return;
      for (let j = i + 1; j < parts.length; j++) {
        if (used.has(j)) continue;
        if (norm(add(p.E, parts[j].E)) < eps * Math.max(1, p.mag)) { used.add(i); used.add(j); out.push([i, j]); break; }
      }
    });
    return out;
  }
  // 한 축에서 서로 지우는 쌍 (크기가 같고 부호가 반대인 성분) → [[i, j], …].
  // 화살표 전체가 지워지는 쌍 → 거울에 비친 쌍(성분 크기가 모두 같다) → 나머지 순서로 고른다
  function cancelPairs(parts, axis, eps = 1e-9) {
    const used = new Set(), out = [];
    for (const [i, j] of vecPairs(parts, eps)) {
      if (Math.abs(parts[i].E[axis]) < eps) continue;
      used.add(i); used.add(j); out.push([i, j]);
    }
    const mirror = (a, b) => [0, 1, 2].every((k) => Math.abs(Math.abs(a.E[k]) - Math.abs(b.E[k])) < eps * Math.max(1, a.mag));
    for (const strict of [true, false]) {
      parts.forEach((p, i) => {
        if (used.has(i) || Math.abs(p.E[axis]) < eps) return;
        for (let j = i + 1; j < parts.length; j++) {
          if (used.has(j) || (strict && !mirror(p, parts[j]))) continue;
          if (Math.abs(p.E[axis] + parts[j].E[axis]) < eps * Math.max(1, Math.abs(p.E[axis]))) { used.add(i); used.add(j); out.push([i, j]); break; }
        }
      });
    }
    return out;
  }
  // 전·후 비교: 전하 i 하나만 옮기면 합의 차 = 그 전하 기여의 차 (움직이지 않은 전하의 기여는 지워진다)
  function moveDiff(charges, i, newAt, P, k = 1) {
    const after = charges.map((c, j) => (j === i ? Object.assign({}, c, {at: newAt}) : c));
    const b = superpose(charges, P, k), a = superpose(after, P, k);
    return {before: b.sum, after: a.sum, diff: sub(a.sum, b.sum), moved: sub(field(charges[i].q, newAt, P, k), field(charges[i].q, charges[i].at, P, k))};
  }
  // 합성 전기장을 0 으로 만드는 전하량: 점 at 에 놓을 전하 q 가 P 에 −E 를 만들어야 한다 (E 가 at–P 직선 위에 있을 때만)
  function nullingCharge(E, at, P, k = 1) {
    const d = sub(v3(P), v3(at)), r = norm(d), u = unit(d), Em = norm(E);
    if (Em < 1e-12) return 0;
    const c = dot(scale(E, -1), u) / Em;                                   // −E 가 (P − at) 방향과 나란한가
    if (Math.abs(Math.abs(c) - 1) > 1e-9) return NaN;
    return c * Em * r * r / k;                                            // kq/r² = |E| , 부호는 방향으로
  }

  // ── 3차원 보기: 사선(정사영) 투영 ───────────────────────
  // yaw: z축 둘레로 돌린 각, pitch: 내려다보는 각 (90° = 위에서, 0° = 옆에서 xz 평면). → {x: 화면 오른쪽, y: 화면 위쪽, depth: 보는 사람 쪽 +}
  function project(p, yawDeg = -28, pitchDeg = 24) {
    const q = v3(p), a = yawDeg * RAD, b = pitchDeg * RAD;
    const x1 = q[0] * Math.cos(a) - q[1] * Math.sin(a), y1 = q[0] * Math.sin(a) + q[1] * Math.cos(a);
    return {x: x1, y: q[2] * Math.cos(b) + y1 * Math.sin(b), depth: q[2] * Math.sin(b) - y1 * Math.cos(b)};
  }

  // ── 예제·문항 배치 (화면의 기본값과 같은 값; 길이 단위 d, 전하 단위 q) ──
  const R2 = Math.SQRT2, R3 = Math.sqrt(3), R5 = Math.sqrt(5);
  const PRESETS = {
    // 개념서 예제 = 그림 (가): +q(−d, 0), −q(d, 0), P(0, d). 각 전하가 P 에 만드는 세기 E₀ = kq/(√2 d)²
    ga: {dim: 2, charges: [{id: 'A', q: 1, at: [-1, 0]}, {id: 'B', q: -1, at: [1, 0]}], P: [0, 1], q0: 1, r0: R2},
    // 그림 (나): 오른쪽 전하를 +q 로
    na: {dim: 2, charges: [{id: 'A', q: 1, at: [-1, 0]}, {id: 'B', q: 1, at: [1, 0]}], P: [0, 1], q0: 1, r0: R2},
    // 개념 체크 1: 정사각형 ABCD (꼭짓점 (±2d, ±2d)) 의 A, B, C 에 +q, D 에 −q, 중심 O. 한 전하가 O 에 만드는 세기 E₀ = kq/(2√2 d)²
    sq: {dim: 2, charges: [{id: 'A', q: 1, at: [-2, 2]}, {id: 'B', q: 1, at: [2, 2]}, {id: 'C', q: 1, at: [2, -2]}, {id: 'D', q: -1, at: [-2, -2]}], P: [0, 0], q0: 1, r0: 2 * R2},
    // 개념 체크 2: A(−3d, 0), B(3d, 0) 에 +Q, P(0, 4d). 거리 5d, E₀ = kQ/(5d)²
    t345: {dim: 2, charges: [{id: 'A', q: 1, at: [-3, 0]}, {id: 'B', q: 1, at: [3, 0]}], P: [0, 4], q0: 1, r0: 5},
    // 도전 문제: A(3d, 0) +27q, B(0, 4d) +64q, 원점 O. 단위 kq/d² (q₀ = 1, r₀ = 1). C(3d, 4d) 에 −125q 를 더하면 0
    chal: {dim: 2, charges: [{id: 'A', q: 27, at: [3, 0]}, {id: 'B', q: 64, at: [0, 4]}], P: [0, 0], q0: 1, r0: 1},
    chalC: {dim: 2, charges: [{id: 'A', q: 27, at: [3, 0]}, {id: 'B', q: 64, at: [0, 4]}, {id: 'C', q: -125, at: [3, 4]}], P: [0, 0], q0: 1, r0: 1},
    // 3차원: xy 평면의 (±2d, 0, 0), (0, ±2d, 0) 에 네 전하, z축 위 P(0, 0, d). 거리 모두 √5 d, E₀ = kq/(√5 d)²
    py: {dim: 3, charges: [{id: 'A', q: 1, at: [2, 0, 0]}, {id: 'B', q: 1, at: [0, 2, 0]}, {id: 'C', q: 1, at: [-2, 0, 0]}, {id: 'D', q: 1, at: [0, -2, 0]}], P: [0, 0, 1], q0: 1, r0: R5},
    pyD: {dim: 3, charges: [{id: 'A', q: 1, at: [2, 0, 0]}, {id: 'B', q: 1, at: [0, 2, 0]}, {id: 'C', q: 1, at: [-2, 0, 0]}, {id: 'D', q: -1, at: [0, -2, 0]}], P: [0, 0, 1], q0: 1, r0: R5},
    // 3차원: 한 변 2d 인 정육면체의 꼭짓점 P(2d, 2d, 2d) 와 이웃한 세 꼭짓점에 +q. 거리 2d, E₀ = kq/(2d)²
    cube: {dim: 3, charges: [{id: 'A', q: 1, at: [0, 2, 2]}, {id: 'B', q: 1, at: [2, 0, 2]}, {id: 'C', q: 1, at: [2, 2, 0]}], P: [2, 2, 2], q0: 1, r0: 2},
    // 3차원: 정삼각형(외접원 반지름 2d) 세 꼭짓점의 +q 와 정사면체 꼭대기 P(0, 0, 2√2 d). 거리 모두 2√3 d
    tet: {dim: 3, charges: [{id: 'A', q: 1, at: [2, 0, 0]}, {id: 'B', q: 1, at: [-1, R3, 0]}, {id: 'C', q: 1, at: [-1, -R3, 0]}], P: [0, 0, 2 * R2], q0: 1, r0: 2 * R3},
  };
  const solve = (key) => { const p = PRESETS[key]; return superposeU(p.charges, p.P, p.q0, p.r0); };

  const api = {K, RAD, v3, add, sub, scale, dot, norm, unit, dist, strength, comp, field, sense, superpose, superposeU, dirDeg, tanTheta,
    cancels, vecPairs, cancelPairs, moveDiff, nullingCharge, project, PRESETS, solve};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.B1_03 = api;
})(typeof window !== 'undefined' ? window : globalThis);
