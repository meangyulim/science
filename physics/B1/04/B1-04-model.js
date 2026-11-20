/* B1-04 전기력선과 전기장이 0인 점 — 계산 모형. 브라우저(window.B1_04)와 Node 테스트(tests/B1-04-model.test.cjs)에서 같이 쓴다.
   단위: 전하량은 q 의 배수, 거리는 d 의 배수 → 전기장은 kq/d² 의 배수. 쿨롱 상수 k = 9 × 10⁹ N·m²/C²(원고 값)는
   모든 항에 똑같이 곱해지므로 모형 안에서는 1 로 계산한다.
   전하 c = {q, x, y}. 점전하의 전기장 E = kq/r², 양전하는 밖으로·음전하는 안으로. 여러 전하는 벡터로 더한다(중첩).
   좌표는 수학 좌표(y 위쪽 +). 화면 좌표로 바꾸는 것은 페이지가 한다. */
(function (root) {
  'use strict';
  const K = 9e9;
  const TAU = 2 * Math.PI;
  const live = (cs) => cs.filter((c) => c && c.q);

  // ── 전기장 ──────────────────────────────────────────────
  // 한 전하가 (x, y) 에 만드는 전기장 [Ex, Ey] = kq (r − rᵢ)/|r − rᵢ|³
  function part(c, x, y) {
    const dx = x - c.x, dy = y - c.y, r2 = dx * dx + dy * dy;
    if (!(r2 > 0)) return [NaN, NaN];
    const k = c.q / (r2 * Math.sqrt(r2));
    return [k * dx, k * dy];
  }
  // 중첩: E = E₁ + E₂ + … (벡터 합)
  function field(cs, x, y) {
    let ex = 0, ey = 0;
    for (const c of cs) { if (!c || !c.q) continue; const e = part(c, x, y); ex += e[0]; ey += e[1]; }
    return [ex, ey];
  }
  const parts = (cs, x, y) => cs.map((c) => (c && c.q ? part(c, x, y) : [0, 0]));
  const mag = (v) => Math.hypot(v[0], v[1]);
  const strength = (q, r) => Math.abs(q) / (r * r);                  // 세기 kq/r²
  const exOnAxis = (cs, x) => field(cs, x, 0)[0];                     // x 축 위 Eₓ (전하가 모두 x 축 위에 있으면 E_y = 0)
  // 전위 kq/r 의 합 — 「E = 0 인 점 ≠ 전위 0 인 점」 확인용(테스트). 화면에는 이 식을 쓰지 않는다
  const potential = (cs, x, y) => live(cs).reduce((s, c) => s + c.q / Math.hypot(x - c.x, y - c.y), 0);

  // ── x 축 위 두 전하: E = 0 인 점 ─────────────────────────
  const ratio = (q1, q2) => Math.sqrt(Math.abs(q1) / Math.abs(q2));  // kq₁/r₁² = kq₂/r₂² → r₁/r₂ = √(q₁/q₂)
  // 무한히 먼 곳을 빼고 E = 0 인 점의 x. 없으면 null
  function zeroOnAxis(q1, x1, q2, x2) {
    if (!q1 || !q2 || x1 === x2) return null;
    const a = Math.sqrt(Math.abs(q1)), b = Math.sqrt(Math.abs(q2));
    if (q1 * q2 > 0) return x1 + (x2 - x1) * a / (a + b);            // 같은 부호: 사이 (r₁ + r₂ = 거리)
    if (Math.abs(a - b) < 1e-12) return null;                          // 크기가 같은 다른 부호: 없음
    return x1 + (x2 - x1) * a / (a - b);                               // 다른 부호: 작은 전하 바깥 (|r₁ − r₂| = 거리)
  }
  function classify(q1, q2) {
    if (!q1 || !q2) return 'single';
    if (q1 * q2 > 0) return 'same';
    return Math.abs(Math.abs(q1) - Math.abs(q2)) < 1e-12 ? 'opposite-equal' : 'opposite';
  }
  // 판정 묶음: 어디(사이·바깥·없음), r₁, r₂, 작은 전하(1·2·0 = 같음)
  function zeroInfo(q1, x1, q2, x2) {
    const kind = classify(q1, q2), x = zeroOnAxis(q1, x1, q2, x2);
    const o = {kind, same: kind === 'same', D: Math.abs(x2 - x1), x, ratio: kind === 'single' ? NaN : ratio(q1, q2),
      smaller: Math.abs(q1) < Math.abs(q2) ? 1 : Math.abs(q2) < Math.abs(q1) ? 2 : 0};
    if (x == null) { o.where = kind === 'single' ? 'single' : 'none'; return o; }
    o.r1 = Math.abs(x - x1); o.r2 = Math.abs(x - x2);
    o.where = kind === 'same' ? 'between' : 'outside';
    return o;
  }
  // 세 구역(왼쪽 바깥 · 사이 · 오른쪽 바깥): 두 기여의 x 방향(+1 오른쪽, −1 왼쪽)과 크기, E = 0 이 그 구역에 있는지
  function zones(q1, x1, q2, x2) {
    const lo = Math.min(x1, x2), hi = Math.max(x1, x2), z = zeroOnAxis(q1, x1, q2, x2);
    const at = (name, xs, has) => {
      const d1 = Math.sign(q1) * Math.sign(xs - x1), d2 = Math.sign(q2) * Math.sign(xs - x2);
      const e1 = strength(q1, xs - x1), e2 = strength(q2, xs - x2);
      return {name, x: xs, d1, d2, e1, e2, opposite: d1 * d2 < 0, zero: has ? z : null, bigger: Math.abs(e1 - e2) < 1e-12 ? 0 : e1 > e2 ? 1 : 2};
    };
    const inL = z != null && z < lo, inM = z != null && z > lo && z < hi, inR = z != null && z > hi;
    return [at('left', inL ? z : lo - 1, inL), at('mid', inM ? z : (lo + hi) / 2, inM), at('right', inR ? z : hi + 1, inR)];
  }

  // ── 전기력선 ────────────────────────────────────────────
  const lineCount = (q, n) => Math.round(Math.abs(q) * n);           // 선 수 ∝ 전하량 크기 (q 하나에 n 개)
  // 양전하 P 에서 나온 선 가운데 음전하 N 으로 들어가는 선은 P 둘레의 원뿔(반각 θc) 안에서 나온다.
  // 입체각 비 (1 − cos θc)/2 = (N 으로 가는 몫) = min(1, |q_N|/|q_P|)
  const coneAngle = (frac) => Math.acos(Math.max(-1, Math.min(1, 1 - 2 * frac)));

  // 선을 시작할 방향. 두 전하면 축을 기준으로 정확히: 같은 부호는 고르게(축에서 반 칸 어긋나게),
  // 다른 부호는 「이어지는 선」 원뿔과 나머지에 선 수를 전하량대로 나눠 각각 고르게 → 이어지는 선의 수가 정확히 n × (작은 전하량)
  // 셋 이상이면 고르게(다른 전하들이 그 자리에 만드는 전기장 방향 기준). 음전하는 멀리서 들어오는 선만 거꾸로 그린다
  function seeds(cs, n) {
    const L = cs.map((c, i) => (c && c.q ? {q: c.q, x: c.x, y: c.y, i} : null)).filter(Boolean);
    const out = [];
    const even = (i, ax, m, sg, from, span) => { for (let k = 0; k < m; k++) out.push({i, ang: ax + from + (k + 0.5) * span / m, sg, skipIfCharge: sg < 0}); };
    if (L.length === 2 && L[0].q * L[1].q < 0) {
      for (const [P, Q] of [[L[0], L[1]], [L[1], L[0]]]) {
        const ax = Math.atan2(Q.y - P.y, Q.x - P.x), N = lineCount(P.q, n);
        const th = coneAngle(Math.min(1, Math.abs(Q.q) / Math.abs(P.q))), m = Math.round(n * Math.min(Math.abs(P.q), Math.abs(Q.q)));
        if (P.q > 0) even(P.i, ax, m, 1, -th, 2 * th);                     // 이어지는 선 (P → Q)
        even(P.i, ax, N - m, Math.sign(P.q), th, TAU - 2 * th);              // 멀리 가는 선(양전하) · 멀리서 오는 선(음전하)
      }
      return out;
    }
    // 셋 이상이 모두 x 축 위에 있으면: 선마다 Ψ = Σqcosθ 가 일정하므로, 모든 전하에 같은 Ψ 눈금(간격 4/n, 반 칸 어긋남)을 쓴다.
    // 전하 i 둘레에서 Ψ = qᵢcosθ + Sᵢ (Sᵢ = Σ qⱼ·부호(xᵢ − xⱼ)) 가 [Sᵢ − |qᵢ|, Sᵢ + |qᵢ|] 를 한 번씩 지나므로
    // 위·아래 반평면에 n|qᵢ|/2 개씩, 곧 어느 전하든 선이 정확히 n|q| 개 (들어오는 선 = 다른 전하에서 온 선 + 멀리서 온 선)
    if (L.length >= 3 && L.every((c) => Math.abs(c.y) < 1e-12)) {
      const dl = 4 / n;
      for (const c of L) {
        let Si = 0;
        for (const o of L) if (o !== c) Si += o.q * Math.sign(c.x - o.x);
        const lo = Si - Math.abs(c.q), hi = Si + Math.abs(c.q), sg = Math.sign(c.q);
        for (let k = Math.ceil(lo / dl - 0.5); (k + 0.5) * dl < hi; k++) {
          const P = (k + 0.5) * dl;
          if (P <= lo) continue;
          const th = Math.acos(Math.max(-1, Math.min(1, (P - Si) / c.q)));
          out.push({i: c.i, ang: th, sg, skipIfCharge: sg < 0}, {i: c.i, ang: -th, sg, skipIfCharge: sg < 0});
        }
      }
      return out;
    }
    for (const c of L) {
      const others = L.filter((o) => o !== c), e = field(others, c.x, c.y);
      const ax = others.length && mag(e) > 0 ? Math.atan2(e[1], e[0]) : 0;
      even(c.i, ax, lineCount(c.q, n), Math.sign(c.q), 0, TAU);
    }
    return out;
  }

  // 한 점에서 전기력선 따라가기 (RK4). sg = +1: E 방향(양전하 → 음전하), −1: 반대 방향.
  // 걸음은 가장 가까운 전하까지 거리의 5% (가까울수록 잘게), 방향이 크게 꺾이면 반으로 줄인다.
  // 끝: 들어가는 전하에 닿음 'charge'(at = 전하 번호) · 멀리 감 'inf' · E = 0 인 점에서 멈춤 'null'
  // 'inf' 는 돌아올 수 없을 때만: 알짜 전하가 바깥으로 미는 쪽이고(sg·ΣQ > 0), 알짜 전하의 전기장이 나머지보다 센 거리
  // (R > 4·Dmax·Σ|q|/|ΣQ| + 3) 밖에서 바깥으로 가는 중. 알짜 전하가 0 이면(쌍극자) 아주 멀리 돌아오는 선도 끝까지 따라간다
  function trace(cs, x, y, sg, o = {}) {
    const L = live(cs);
    const rHit = o.rHit || 0.05, maxN = o.maxN || 12000, hk = o.hk || 0.05, hNear = o.hNear || 0.08;
    let cx = 0, cy = 0, Qt = 0, S = 0;
    for (const c of L) { cx += c.x; cy += c.y; Qt += c.q; S += Math.abs(c.q); }
    if (L.length) { cx /= L.length; cy /= L.length; }
    let Dmax = 0;
    for (const c of L) Dmax = Math.max(Dmax, Math.hypot(c.x - cx, c.y - cy));
    const out = sg * Qt > 1e-12, Rsafe = out ? Math.max(o.view || 14, 4 * Dmax * S / Math.abs(Qt) + 3) : Infinity, far = o.far || 4000;
    const pts = [[x, y]];
    const dir = (px, py) => { const e = field(L, px, py), m = Math.hypot(e[0], e[1]); return m > 0 && isFinite(m) ? [sg * e[0] / m, sg * e[1] / m] : null; };
    let prev = null, len = 0;
    for (let n = 0; n < maxN; n++) {
      let dmin = Infinity, near = -1;
      for (let j = 0; j < cs.length; j++) { const c = cs[j]; if (!c || !c.q) continue; const d = Math.hypot(x - c.x, y - c.y); if (d < dmin) { dmin = d; near = j; } }
      if (near >= 0 && cs[near].q * sg < 0 && dmin < rHit) { len += dmin; pts.push([cs[near].x, cs[near].y]); return {pts, end: 'charge', at: near, len}; }
      const R = Math.hypot(x - cx, y - cy);
      const k1 = dir(x, y);
      if (!k1 || (prev && k1[0] * prev[0] + k1[1] * prev[1] < 0)) return {pts, end: 'null', len};
      if (R > far || (R > Rsafe && k1[0] * (x - cx) + k1[1] * (y - cy) > 0)) return {pts, end: 'inf', len};
      let h = Math.max(0.002, Math.min(hk * dmin, R < 16 ? hNear : 0.02 * R)), nx = x, ny = y;
      for (let tries = 0; tries < 8; tries++) {
        const k2 = dir(x + k1[0] * h / 2, y + k1[1] * h / 2), k3 = k2 && dir(x + k2[0] * h / 2, y + k2[1] * h / 2), k4 = k3 && dir(x + k3[0] * h, y + k3[1] * h);
        if (!k4) return {pts, end: 'null', len};
        if (k1[0] * k4[0] + k1[1] * k4[1] < 0.985 && tries < 7) { h /= 2; continue; }   // 크게 꺾이는 곳(E = 0 인 점 근처)은 잘게
        nx = x + h * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]) / 6; ny = y + h * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]) / 6;
        break;
      }
      len += Math.hypot(nx - x, ny - y); x = nx; y = ny; prev = k1; pts.push([x, y]);
    }
    return {pts, end: 'stop', len};
  }

  // 모든 전기력선: 선마다 pts(나오는 쪽 → 들어가는 쪽, E 방향), from·to(전하 번호 또는 'inf'·'null'·'stop')
  // tally[i] = {out, in, to: {목적지: 개수}, from: {출발지: 개수}} — 그림에서 선을 세는 것과 같다
  function fieldLines(cs, n, o = {}) {
    const r0 = o.r0 || 0.06, lines = [], tally = cs.map(() => ({out: 0, in: 0, to: {}, from: {}}));
    for (const s of seeds(cs, n)) {
      const c = cs[s.i], t = trace(cs, c.x + r0 * Math.cos(s.ang), c.y + r0 * Math.sin(s.ang), s.sg, o);
      if (s.skipIfCharge && t.end === 'charge') continue;      // 양전하에서 나온 선으로 이미 그렸다
      const pts = [[c.x, c.y], ...t.pts], end = t.end === 'charge' ? t.at : t.end;
      const ln = s.sg > 0 ? {pts, from: s.i, to: end, ang: s.ang, len: t.len + r0} : {pts: pts.reverse(), from: end, to: s.i, ang: s.ang, len: t.len + r0};
      lines.push(ln);
      if (typeof ln.from === 'number') { const T = tally[ln.from]; T.out++; T.to[ln.to] = (T.to[ln.to] || 0) + 1; }
      if (typeof ln.to === 'number') { const T = tally[ln.to]; T.in++; T.from[ln.from] = (T.from[ln.from] || 0) + 1; }
    }
    return {lines, tally};
  }
  // (x, y) 를 지나는 전기력선: 뒤로(나온 곳까지) + 앞으로(들어갈 곳까지). at = pts 에서 (x, y) 의 번호
  function lineThrough(cs, x, y, o = {}) {
    const f = trace(cs, x, y, 1, o), b = trace(cs, x, y, -1, o);
    const pts = b.pts.slice(1).reverse().concat(f.pts);
    return {pts, at: b.pts.length - 1, from: b.end === 'charge' ? b.at : b.end, to: f.end === 'charge' ? f.at : f.end};
  }
  // 축 대칭(전하가 모두 x 축 위)일 때 전기력선을 따라 일정한 값 Ψ = Σ qᵢ cos θᵢ (θᵢ: 전하 i 에서 본 x 축과의 각) — 테스트용
  const psi = (cs, x, y) => live(cs).reduce((s, c) => s + c.q * (x - c.x) / Math.hypot(x - c.x, y - c.y), 0);

  // ── E = 0 인 점 (수치) ───────────────────────────────────
  // 뉴턴법: E(x, y) = 0. 한 번에 0.5d 넘게 움직이지 않게
  function newton(cs, x, y) {
    const L = live(cs);
    if (L.length < 2) return null;
    const qmax = Math.max(...L.map((c) => Math.abs(c.q)));
    for (let it = 0; it < 80; it++) {
      let ex = 0, ey = 0, a = 0, b = 0, d = 0;
      for (const c of L) {
        const dx = x - c.x, dy = y - c.y, r2 = dx * dx + dy * dy, r = Math.sqrt(r2), r3 = r2 * r, r5 = r3 * r2;
        if (!(r > 1e-9)) return null;
        ex += c.q * dx / r3; ey += c.q * dy / r3;
        a += c.q * (1 / r3 - 3 * dx * dx / r5); b += c.q * (-3 * dx * dy / r5); d += c.q * (1 / r3 - 3 * dy * dy / r5);
      }
      const det = a * d - b * b;
      if (!(Math.abs(det) > 1e-300)) return null;
      let sx = -(d * ex - b * ey) / det, sy = -(-b * ex + a * ey) / det;
      const st = Math.hypot(sx, sy);
      if (st > 0.5) { sx *= 0.5 / st; sy *= 0.5 / st; }
      x += sx; y += sy;
      if (st < 1e-13) break;
    }
    return mag(field(L, x, y)) < 1e-9 * qmax ? [x, y] : null;
  }
  // 상자 box = {x0, x1, y0, y1} 안에서: 격자에서 |E| 가 이웃보다 작은 곳 → 뉴턴법 → 같은 점은 하나로
  function zeros(cs, box, o = {}) {
    const L = live(cs);
    if (L.length < 2) return [];
    const nx = o.nx || 72, ny = o.ny || Math.max(10, Math.round(nx * (box.y1 - box.y0) / (box.x1 - box.x0)));
    const P = (i, j) => [box.x0 + (box.x1 - box.x0) * i / nx, box.y0 + (box.y1 - box.y0) * j / ny];
    const g = [];
    for (let j = 0; j <= ny; j++) {
      const row = [];
      for (let i = 0; i <= nx; i++) { const [x, y] = P(i, j); row.push(L.some((c) => Math.hypot(x - c.x, y - c.y) < 0.25) ? Infinity : mag(field(L, x, y))); }
      g.push(row);
    }
    const out = [];
    for (let j = 1; j < ny; j++) for (let i = 1; i < nx; i++) {
      const v = g[j][i];
      if (!(v < Infinity)) continue;
      let isMin = true;
      for (let dj = -1; dj <= 1 && isMin; dj++) for (let di = -1; di <= 1; di++) if ((di || dj) && g[j + dj][i + di] < v) { isMin = false; break; }
      if (!isMin) continue;
      const z = newton(L, ...P(i, j));
      if (!z || z[0] < box.x0 || z[0] > box.x1 || z[1] < box.y0 || z[1] > box.y1) continue;
      if (L.some((c) => Math.hypot(z[0] - c.x, z[1] - c.y) < 0.05)) continue;
      if (!out.some((p) => Math.hypot(p[0] - z[0], p[1] - z[1]) < 1e-4)) out.push(z);
    }
    return out;
  }

  const api = {K, part, field, parts, mag, strength, exOnAxis, potential, ratio, zeroOnAxis, classify, zeroInfo, zones,
    lineCount, coneAngle, seeds, trace, fieldLines, lineThrough, psi, newton, zeros};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.B1_04 = api;
})(typeof window !== 'undefined' ? window : globalThis);
