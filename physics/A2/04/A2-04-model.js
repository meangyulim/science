/* A2-04 마찰 구간 문제의 에너지 장부 — 계산 모형. 브라우저(window.A2_04)와 Node 테스트(tests/A2-04-model.test.cjs)에서 같이 쓴다.
   단위 m·kg·s·N·J, g = 10 m/s² (원고 값). 높이 y 는 바닥이 0 (U = mgy).
   마찰력은 크기 f 가 일정하고 늘 운동 반대 방향(운동 마찰력)이다. 멈춘 물체를 붙잡는 최대 정지 마찰력도 f 로 본다.
   마찰 없는 곡면·바닥에서는 역학적 에너지 E = K + U 가 그대로이고, 마찰 구간에서만 지난 거리에 비례해 열 Q 로 바뀐다. */
(function (root) {
  'use strict';
  const G = 10;

  // ── 장부 식 (원고) ──────────────────────────────────────
  const energy0 = (m, h) => m * G * h;                 // 처음 역학적 에너지 (바닥에서 U = 0)
  const passLoss = (f, L) => f * L;                    // 마찰 구간을 한 번 다 지날 때 잃는 에너지 = 생긴 열
  const totalPath = (E0, f) => E0 / f;                 // E₀ = f × s총 → 마찰 구간에서 움직일 수 있는 총거리
  // 가운데 마찰 구간(길이 L)을 왼쪽에서 처음 들어가 왕복할 때: 몇 번째 통과에서, 구간 왼쪽 끝에서 얼마인 곳에 멈추나
  function stopOnZone(E0, f, L) {
    const S = totalPath(E0, f);
    const n = Math.floor(S / L + 1e-9);
    let r = S - n * L;
    if (Math.abs(r) < 1e-9) r = 0;
    const pass = r > 0 ? n + 1 : Math.max(1, n);       // 멈추는 통과 (1, 3, 5… 번째는 왼 → 오)
    const into = r > 0 ? r : Math.min(L, S);           // 그 통과에서 들어간 거리
    const rightward = pass % 2 === 1;
    const x = rightward ? into : L - into;             // 구간 왼쪽 끝에서 잰 정지 위치
    const parts = [];
    for (let k = 1; k < pass; k++) parts.push(L);
    parts.push(into);
    return {S, pass, into, rightward, x, parts, full: pass - 1};
  }
  // k 번 다 지난 뒤 올라가는 높이: h − k·fL/(mg). 홀수 번째 뒤에는 오른쪽, 짝수 번째 뒤에는 왼쪽 곡면
  function riseHeights(m, h, f, L) {
    const out = [], dh = f * L / (m * G);
    for (let k = 1; k < 400; k++) {
      const y = h - k * dh;
      if (y <= 1e-9) break;
      out.push({k, side: k % 2 ? 'R' : 'L', h: y});
    }
    return out;
  }
  const frictionFrom = (m, h1, h2, L) => m * G * (h1 - h2) / L;   // 한 번 통과 전후 높이 → 마찰력
  const speedAt = (m, K) => Math.sqrt(2 * Math.max(0, K) / m);
  const constLoss = (m, dh) => m * G * dh;             // 등속 구간: ΔK = 0 → 손실 = mgΔh
  const constFriction = (m, sinT) => m * G * sinT;     // 빗면 등속 하강: f = mg sinθ
  const lossByLength = (W1, L1, L) => W1 * L / L1;     // 같은 크기의 마찰력 → 손실은 길이에 비례
  // 같은 길 s 를 갔다가 되돌아올 때 한 일. 마찰력은 둘 다 −fs, 방향 고정 힘 F 는 갈 때 ±Fs, 올 때 그 반대
  function roundTrip(F, f, s, along = true) {
    const go = along ? F * s : -F * s;
    return {WFgo: go, WFback: -go, WF: 0, Wfgo: -f * s, Wfback: -f * s, Wf: -2 * f * s, sum: -2 * f * s};
  }
  // 외력 장면: 오른쪽으로 v₀ 로 출발, 방향 고정 외력 F 는 왼쪽, 마찰력 f. 간 거리 s, 되돌아왔을 때 운동 에너지
  function forceTrip(m, v0, F, f) {
    const K0 = 0.5 * m * v0 * v0, s = K0 / (F + f), back = F > f + 1e-12;
    return {K0, s, back, Kback: back ? (F - f) * s : 0, WFgo: -F * s, Wfgo: -f * s};
  }

  // ── 궤도 ─────────────────────────────────────────────────
  // 조각(seg)을 왼쪽부터 늘어놓는다. kind: curve(마찰 없는 곡면) · flat(마찰 없는 바닥) · rough(마찰 구간 바닥) · slope(마찰 구간 빗면, 오른쪽으로 내려감)
  // 곡면: y = y0 + s1·u + k·u², u = x − xb (xb = 아래쪽 끝). side 'L' 이면 위쪽 끝이 왼쪽, 'R' 이면 오른쪽.
  const CW = 1.4, CH = 1.7;                            // 곡면의 가로 폭, 꼭대기 높이 (m)
  function curve(side, xb, y0, s1, k, W) {
    const c = {kind: 'curve', side, xb, y0, s1, k, W, x0: side === 'L' ? xb - W : xb, x1: side === 'L' ? xb : xb + W};
    c.y = (x) => { const u = x - xb; return y0 + s1 * u + k * u * u; };
    c.dy = (x) => s1 + 2 * k * (x - xb);
    c.d2y = () => 2 * k;
    c.top = c.y(side === 'L' ? c.x0 : c.x1);
    c.xAt = (yy) => {                                   // 곡면 위 높이 yy 인 점
      const r = Math.sqrt(Math.max(0, s1 * s1 - 4 * k * (y0 - yy)));
      return xb + (side === 'L' ? -s1 - r : -s1 + r) / (2 * k);
    };
    const A = (p) => (p * Math.sqrt(1 + p * p) + Math.asinh(p)) / (4 * k);
    c.arc = (x) => Math.abs(A(c.dy(x)) - A(s1));      // 아래쪽 끝에서 잰 곡면의 길이
    return c;
  }
  // 가운데 마찰 구간 하나 (예제): 왼쪽 곡면 · 바닥(구간 양옆은 마찰 없음) · 오른쪽 곡면
  function bowl(L, gap = 0.6) {
    const k = CH / (CW * CW), z0 = gap, z1 = gap + L, D = L + 2 * gap;
    const segs = [curve('L', 0, 0, 0, k, CW), {kind: 'flat', x0: 0, x1: z0}, {kind: 'rough', x0: z0, x1: z1, name: '마찰 구간'},
      {kind: 'flat', x0: z1, x1: D}, curve('R', D, 0, 0, k, CW)];
    return {scene: 'bowl', segs, zones: [segs[2]], x0: -CW, x1: D + CW, top: CH, D, L};
  }
  // 등속 빗면 구간 A(길이 LA, 높이차 hA) + 바닥 구간 B(길이 LB). 두 구간의 마찰력은 같은 f
  function slopeTrack(LB, LA = 1, hA = 0.2) {
    const sA = hA / LA, cA = Math.sqrt(1 - sA * sA), tA = sA / cA, a = LA * cA;
    const kL = (CH - hA - tA * CW) / (CW * CW), kR = CH / (CW * CW);
    const b0 = a + 0.45, b1 = b0 + LB, D = b1 + 0.6;
    const segs = [curve('L', 0, hA, -tA, kL, CW), {kind: 'slope', x0: 0, x1: a, yTop: hA, sin: sA, cos: cA, len: LA, name: 'A'},
      {kind: 'flat', x0: a, x1: b0}, {kind: 'rough', x0: b0, x1: b1, name: 'B'}, {kind: 'flat', x0: b1, x1: D}, curve('R', D, 0, 0, kR, CW)];
    return {scene: 'slope', segs, zones: [segs[1], segs[3]], x0: -CW, x1: D + CW, top: CH, D, LA, hA, sA, LB};
  }
  function yAt(track, x) {
    for (const s of track.segs) {
      if (x < s.x0 - 1e-12 || x > s.x1 + 1e-12) continue;
      if (s.kind === 'curve') return s.y(x);
      if (s.kind === 'slope') return s.yTop - (x - s.x0) * s.sin / s.cos;
      return 0;
    }
    return x < track.x0 ? track.segs[0].top : track.segs[track.segs.length - 1].top;
  }
  // 궤도의 기울기(dy/dx)
  function slopeAt(track, x) {
    for (const s of track.segs) {
      if (x < s.x0 - 1e-12 || x > s.x1 + 1e-12) continue;
      if (s.kind === 'curve') return s.dy(x);
      if (s.kind === 'slope') return -s.sin / s.cos;
      return 0;
    }
    return 0;
  }

  // ── 움직임: 조각마다 정확히 풀어 시간표(legs)로 ───────────────
  // 곡면에서는 (x, ẋ) 운동 방정식 ẍ = −y'(y''ẋ² + g)/(1 + y'²) 를 RK4 로 풀어 위치–시간만 얻고,
  // 에너지는 장부(K = E₀ − U − Q)로 정확히 셈한다. 바닥·빗면 구간은 등가속도라 식으로 푼다.
  const DT = 1 / 1000;
  function climb(c, v) {                               // 아래쪽 끝에서 속력 v 로 들어가 되돌기까지(올라가는 반쪽)
    const dir = c.side === 'L' ? -1 : 1, yT = Math.min(c.top, c.y0 + v * v / (2 * G)), xT = c.xAt(yT);
    const acc = (x, xd) => { const p = c.dy(x); return -p * (c.d2y() * xd * xd + G) / (1 + p * p); };
    let x = c.xb, xd = dir * v / Math.sqrt(1 + c.s1 * c.s1), t = 0;
    const X = [x];
    for (let i = 0; i < 60000; i++) {
      const k1x = xd, k1v = acc(x, xd);
      const k2x = xd + 0.5 * DT * k1v, k2v = acc(x + 0.5 * DT * k1x, xd + 0.5 * DT * k1v);
      const k3x = xd + 0.5 * DT * k2v, k3v = acc(x + 0.5 * DT * k2x, xd + 0.5 * DT * k2v);
      const k4x = xd + DT * k3v, k4v = acc(x + DT * k3x, xd + DT * k3v);
      const nx = x + DT / 6 * (k1x + 2 * k2x + 2 * k3x + k4x), nv = xd + DT / 6 * (k1v + 2 * k2v + 2 * k3v + k4v);
      if (nv * dir <= 0) { t += DT * xd / (xd - nv); break; }
      x = nx; xd = nv; t += DT; X.push(x);
    }
    return {c, X, tUp: Math.max(t, 1e-6), xT, yT, sUp: c.arc(xT)};
  }
  function climbX(cl, tau) {
    const n = cl.X.length, tl = (n - 1) * DT;
    if (tau >= cl.tUp) return cl.xT;
    if (tau <= 0) return cl.X[0];
    if (tau >= tl) return cl.X[n - 1] + (cl.xT - cl.X[n - 1]) * (tau - tl) / Math.max(1e-9, cl.tUp - tl);
    const i = Math.floor(tau / DT), fr = tau / DT - i;
    return cl.X[i] + (cl.X[i + 1] - cl.X[i]) * fr;
  }

  // 곡면·구간 궤도(bowl, slopeTrack) 위에서 높이 h 에 놓은 물체
  function simulate(track, m, h, f) {
    const segs = track.segs, E0 = m * G * h, legs = [], turns = [];
    let t = 0, Q = 0, l = 0, pass = 0, stop = null;
    const push = (o) => {
      o.t0 = t; o.t1 = t + o.dur; o.Q0 = Q; o.l0 = l;
      legs.push(o); t = o.t1; l += o.len; if (o.rough) Q += f * o.len;
    };
    // 1) 왼쪽 곡면 높이 h 에서 가만히 놓는다 (올라가는 반쪽을 거꾸로 재생)
    const c0 = segs[0], v0 = Math.sqrt(2 * G * Math.max(0, h - c0.y0)), cl0 = climb(c0, v0);
    push({kind: 'curve', seg: 0, dur: cl0.tUp, len: cl0.sUp, half: true, cl: cl0,
      at: (tau) => { const x = climbX(cl0, cl0.tUp - tau); return {x, y: c0.y(x), sgn: 1, d: cl0.sUp - c0.arc(x)}; }});
    let i = 1, dir = 1, v = v0;
    for (let guard = 0; guard < 1200 && !stop && i >= 0 && i < segs.length; guard++) {
      const s = segs[i];
      if (s.kind === 'flat') {
        const len = s.x1 - s.x0, xin = dir > 0 ? s.x0 : s.x1, dd = dir, vv = v;
        push({kind: 'flat', seg: i, dur: len / v, len, dir, at: (tau) => ({x: xin + dd * vv * tau, y: 0, sgn: dd, d: vv * tau})});
        i += dir;
      } else if (s.kind === 'rough') {
        const len = s.x1 - s.x0, a = f / m, xin = dir > 0 ? s.x0 : s.x1, dd = dir, vv = v;
        pass++;
        const at = (tau) => { const d = vv * tau - 0.5 * a * tau * tau; return {x: xin + dd * d, y: 0, sgn: dd, d}; };
        if (v * v > 2 * a * len + 1e-12) {
          const v2 = Math.sqrt(v * v - 2 * a * len);
          push({kind: 'rough', seg: i, rough: true, dur: (v - v2) / a, len, dir, pass, zone: s.name, at});
          v = v2; i += dir;
        } else {
          const d = Math.min(len, v * v / (2 * a));
          push({kind: 'rough', seg: i, rough: true, dur: v / a, len: d, dir, pass, zone: s.name, at});
          stop = {x: xin + dir * d, y: 0, pass, into: d, zone: s.name, seg: i, dir, fromLeft: dir > 0 ? d : len - d};
        }
      } else if (s.kind === 'slope') {
        const len = s.len, sA = s.sin, cA = s.cos, dd = dir, vv = v;
        const P = (w) => ({x: s.x0 + w * cA, y: s.yTop - w * sA});
        pass++;
        if (dir > 0) {                                 // 내려간다: 운동 방향 가속도 g sinθ − f/m
          const a = G * sA - f / m, disc = v * v + 2 * a * len;
          const at = (tau) => { const d = vv * tau + 0.5 * a * tau * tau; return Object.assign(P(d), {sgn: 1, d}); };
          if (disc > 1e-12) {
            const v2 = Math.sqrt(disc);
            push({kind: 'slope', seg: i, rough: true, dur: Math.abs(a) < 1e-12 ? len / v : (v2 - v) / a, len, dir, pass, zone: s.name, at});
            v = v2; i += 1;
          } else {
            const d = v * v / (-2 * a);
            push({kind: 'slope', seg: i, rough: true, dur: v / -a, len: d, dir, pass, zone: s.name, at});
            stop = Object.assign(P(d), {pass, into: d, zone: s.name, seg: i, dir, w: d});
          }
        } else {                                       // 올라간다: 감속 g sinθ + f/m
          const a = G * sA + f / m;
          const at = (tau) => { const d = vv * tau - 0.5 * a * tau * tau; return Object.assign(P(len - d), {sgn: -1, d}); };
          if (v * v > 2 * a * len + 1e-12) {
            const v2 = Math.sqrt(v * v - 2 * a * len);
            push({kind: 'slope', seg: i, rough: true, dur: (v - v2) / a, len, dir, pass, zone: s.name, at});
            v = v2; i -= 1;
          } else {
            const d = v * v / (2 * a);
            push({kind: 'slope', seg: i, rough: true, dur: v / a, len: d, dir, pass, zone: s.name, at});
            if (m * G * sA <= f + 1e-9) stop = Object.assign(P(len - d), {pass, into: d, zone: s.name, seg: i, dir, w: len - d});
            else {                                     // 정지 마찰력으로 못 버티면 다시 미끄러져 내려온다
              const ad = G * sA - f / m, w0 = len - d, v2 = Math.sqrt(2 * ad * d);
              pass++;
              push({kind: 'slope', seg: i, rough: true, dur: v2 / ad, len: d, dir: 1, pass, zone: s.name,
                at: (tau) => { const dd2 = 0.5 * ad * tau * tau; return Object.assign(P(w0 + dd2), {sgn: 1, d: dd2}); }});
              v = v2; dir = 1; i += 1;
            }
          }
        }
      } else if (s.kind === 'curve') {
        const cl = climb(s, v), into = s.side === 'L' ? -1 : 1, tUp = cl.tUp;
        push({kind: 'curve', seg: i, dur: 2 * tUp, len: 2 * cl.sUp, cl,
          at: (tau) => {
            if (tau <= tUp) { const x = climbX(cl, tau); return {x, y: s.y(x), sgn: into, d: s.arc(x)}; }
            const x = climbX(cl, 2 * tUp - tau); return {x, y: s.y(x), sgn: -into, d: 2 * cl.sUp - s.arc(x)};
          }});
        turns.push({t: t - tUp, x: cl.xT, y: cl.yT, side: s.side, E: m * G * cl.yT});
        dir = -dir; i += dir;
      }
    }
    if (!stop) {                                        // (보호) 너무 길면 끝에서 멈춘 것으로
      const last = legs[legs.length - 1], p = last.at(last.dur);
      stop = {x: p.x, y: p.y, pass, into: 0, zone: '', seg: last.seg, cut: true};
    }
    return {kind: 'track', track, m, h, f, E0, legs, turns, stop, tEnd: t, Qend: Q, lEnd: l};
  }

  // 외력 장면: 마찰 있는 평면에서 오른쪽으로 v₀ 로 출발. 방향 고정 외력 F(왼쪽)가 되돌린다. 출발점에 돌아오면 끝
  function simulateForce(m, v0, F, f) {
    const tr = forceTrip(m, v0, F, f), a1 = (F + f) / m, s = tr.s, t1 = v0 / a1, legs = [];
    legs.push({kind: 'go', t0: 0, t1, dur: t1, dir: 1, at: (tau) => ({x: v0 * tau - 0.5 * a1 * tau * tau, v: v0 - a1 * tau, l: v0 * tau - 0.5 * a1 * tau * tau})});
    let tEnd = t1;
    if (tr.back) {
      const a2 = (F - f) / m, t2 = Math.sqrt(2 * s / a2);
      legs.push({kind: 'back', t0: t1, t1: t1 + t2, dur: t2, dir: -1, at: (tau) => ({x: s - 0.5 * a2 * tau * tau, v: -a2 * tau, l: s + 0.5 * a2 * tau * tau})});
      tEnd += t2;
    }
    return {kind: 'force', m, v0, F, f, s, K0: tr.K0, back: tr.back, Kback: tr.Kback, legs, tEnd};
  }

  function legAt(sim, t) {
    const L = sim.legs;
    if (t <= 0) return 0;
    if (t >= sim.tEnd) return L.length - 1;
    let lo = 0, hi = L.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (L[mid].t0 <= t) lo = mid; else hi = mid - 1; }
    return lo;
  }
  // 시각 t 의 상태: 위치, 운동 방향(sgn: + 오른쪽), 에너지 장부(K, U, Q, E), 지나온 길 l, 마찰 구간에서 간 거리 sf
  function stateAt(sim, t) {
    t = Math.max(0, Math.min(t, sim.tEnd));
    const k = legAt(sim, t), L = sim.legs[k], tau = Math.min(L.dur, t - L.t0);
    if (sim.kind === 'force') {
      const p = L.at(tau), K = 0.5 * sim.m * p.v * p.v, WF = -sim.F * p.x, Wf = -sim.f * p.l;
      return {t, leg: k, kind: L.kind, x: p.x, y: 0, sgn: Math.sign(p.v) || L.dir, v: Math.abs(p.v), K, WF, Wf, l: p.l, sf: p.l, done: t >= sim.tEnd - 1e-9};
    }
    const p = L.at(tau), Q = L.Q0 + (L.rough ? sim.f * p.d : 0), U = sim.m * G * p.y, K = Math.max(0, sim.E0 - U - Q);
    return {t, leg: k, kind: L.kind, x: p.x, y: p.y, sgn: p.sgn, v: speedAt(sim.m, K), K, U, Q, E: K + U,
      Wg: sim.E0 - U, Wf: -Q, l: L.l0 + p.d, sf: Q / sim.f, pass: L.rough ? L.pass : 0, zone: L.rough ? L.zone : '',
      inZone: !!L.rough, done: t >= sim.tEnd - 1e-9};
  }
  // 그래프용 표본: 같은 간격 dt + 조각 경계
  function samples(sim, dt = 1 / 60) {
    const out = [];
    for (const L of sim.legs) {
      const n = Math.max(1, Math.ceil(L.dur / dt));
      for (let j = 0; j < n; j++) out.push(stateAt(sim, L.t0 + L.dur * j / n));
    }
    out.push(stateAt(sim, sim.tEnd));
    return out;
  }

  const api = {G, CW, CH, energy0, passLoss, totalPath, stopOnZone, riseHeights, frictionFrom, speedAt, constLoss, constFriction, lossByLength,
    roundTrip, forceTrip, curve, bowl, slopeTrack, yAt, slopeAt, climb, simulate, simulateForce, legAt, stateAt, samples};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.A2_04 = api;
})(typeof window !== 'undefined' ? window : globalThis);
