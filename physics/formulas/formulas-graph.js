/* 공식 지도 — 그래프 계산(순수 함수). 화면(map.js)과 테스트(tests/formulas-*.test.cjs)가 같이 쓴다.
   데이터: physics/data/formulas.json (nodes · edges · units · bigUnits · subjects · fieldGroups · fields)
   배치 두 가지
     layout()      단원별: 과목 = 세로 줄(물리학 Ⅰ 왼쪽, Ⅱ 오른쪽) → 대단원 = 가로 띠(같은 번호끼리 같은 높이) → 단원 = 상자(나란히)
                   → 상자 안에서 유도 깊이대로 줄(맨 위 = 출발점, 아래로 갈수록 유도·응용)
     fieldLayout() 분야별: 분야 = 세로 레인(묶음끼리 붙여서, 선 길이가 가장 짧은 순서) → 레인 안 위에서 아래로 출발점 띠 · 유도 · 응용 */
(function (root) {
  'use strict';

  const G = {
    cardGapX: 26, rowGapY: 66, maxRowW: 1180,
    unitPadTop: 84, unitPadX: 34, unitPadBottom: 40, unitGap: 70, emptyUnit: {w: 900, h: 320},
    bigPadTop: 150, bigPadX: 40, bigPadBottom: 44, bigGap: 150,
    subjTop: 170, subjGap: 260,
  };

  /** 찾아보기 표: id → 노드, 들어오는·나가는 간선 */
  function index(data) {
    const byId = new Map(), inE = new Map(), outE = new Map();
    for (const n of data.nodes) { byId.set(n.id, n); inE.set(n.id, []); outE.set(n.id, []); }
    for (const e of data.edges) {
      if (inE.has(e.to)) inE.get(e.to).push(e);
      if (outE.has(e.from)) outE.get(e.from).push(e);
    }
    const unitOf = new Map(data.units.map(u => [u.code, u]));
    const bigOf = new Map(data.bigUnits.map(b => [b.id, b]));
    const subjOf = new Map(data.subjects.map(s => [s.id, s]));
    return {byId, inE, outE, unitOf, bigOf, subjOf};
  }

  /** 순환 찾기: 있으면 순환을 이루는 id 배열, 없으면 null */
  function findCycle(data) {
    const ix = index(data), state = new Map(), stack = [];
    let found = null;
    const visit = id => {
      if (found) return;
      state.set(id, 1); stack.push(id);
      for (const e of ix.outE.get(id) || []) {
        const s = state.get(e.to);
        if (s === 1) { found = stack.slice(stack.indexOf(e.to)).concat(e.to); return; }
        if (!s) visit(e.to);
        if (found) return;
      }
      stack.pop(); state.set(id, 2);
    };
    for (const n of data.nodes) if (!state.get(n.id)) visit(n.id);
    return found;
  }

  /** 위로 거슬러 올라간 모든 조상(출발점까지), 아래로 내려간 모든 자손 */
  function ancestors(ix, id) {
    const seen = new Set(), q = [id];
    while (q.length) for (const e of ix.inE.get(q.shift()) || []) if (!seen.has(e.from)) { seen.add(e.from); q.push(e.from); }
    return seen;
  }
  function descendants(ix, id) {
    const seen = new Set(), q = [id];
    while (q.length) for (const e of ix.outE.get(q.shift()) || []) if (!seen.has(e.to)) { seen.add(e.to); q.push(e.to); }
    return seen;
  }

  /** 출발점에서 이 공식까지 가장 긴 유도 사슬의 길이 (출발점 = 0) */
  function depths(data) {
    const ix = index(data), d = new Map();
    const get = id => {
      if (d.has(id)) return d.get(id);
      d.set(id, 0);
      let v = 0;
      for (const e of ix.inE.get(id)) v = Math.max(v, get(e.from) + 1);
      d.set(id, v);
      return v;
    };
    for (const n of data.nodes) get(n.id);
    return d;
  }

  /** 단원 안의 줄 번호: 출발점은 0줄, 나머지는 같은 단원 안 부모보다 한 줄 아래(최소 1줄) */
  function unitRows(data) {
    const ix = index(data), r = new Map();
    const get = id => {
      if (r.has(id)) return r.get(id);
      const n = ix.byId.get(id);
      r.set(id, 0);
      let v = n.role === 'basis' ? 0 : 1;
      for (const e of ix.inE.get(id)) {
        const p = ix.byId.get(e.from);
        if (p && p.unit === n.unit) v = Math.max(v, get(e.from) + 1);
      }
      r.set(id, v);
      return v;
    };
    for (const n of data.nodes) get(n.id);
    return r;
  }

  /**
   * 배치. size(id) → {w, h} (카드 크기, 화면에서 잰 값).
   * 돌려주는 것: nodes{id:{x,y,w,h}}, units{code:{x,y,w,h,empty}}, bigs{id:{x,y,w,h}}, subjects{id:{x,y,w,h}}, bounds{x,y,w,h}
   */
  function layout(data, size, opt) {
    const o = Object.assign({}, G, opt || {});
    const ix = index(data), rows = unitRows(data);
    const pos = {}, units = {}, bigs = {}, subjects = {};
    const order = new Map(data.nodes.map((n, i) => [n.id, i]));

    // 1) 단원 상자 안 배치 (상자 왼쪽 위 = 0,0)
    const unitBox = {};
    for (const u of data.units) {
      const ns = data.nodes.filter(n => n.unit === u.code);
      if (!ns.length) { unitBox[u.code] = {w: o.emptyUnit.w, h: o.emptyUnit.h, empty: true, local: {}}; continue; }
      const byRow = new Map();
      for (const n of ns) { const k = rows.get(n.id); if (!byRow.has(k)) byRow.set(k, []); byRow.get(k).push(n.id); }
      const keys = [...byRow.keys()].sort((a, b) => a - b);
      const local = {};
      let y = o.unitPadTop, maxW = 0;
      const lines = [];
      for (const k of keys) {
        let ids = byRow.get(k);
        // 같은 단원 안의 부모 가운데 x 로 정렬(교차 줄이기). 부모가 없으면 데이터 순서
        const key = id => {
          const xs = ix.inE.get(id).map(e => local[e.from]).filter(Boolean).map(p => p.x + p.w / 2);
          return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
        };
        if (k > 0) {
          const withKey = ids.map(id => ({id, k: key(id), i: order.get(id)}));
          const known = withKey.filter(a => a.k !== null).sort((a, b) => a.k - b.k);
          const unknown = withKey.filter(a => a.k === null).sort((a, b) => a.i - b.i);
          ids = known.map(a => a.id).concat(unknown.map(a => a.id));
        }
        // 너무 길면 줄을 나눈다
        let cur = [], curW = 0;
        const flush = () => { if (cur.length) { lines.push({ids: cur, w: curW, y}); const h = Math.max(...cur.map(id => size(id).h)); cur.forEach(id => { local[id] = {x: 0, y, w: size(id).w, h: size(id).h}; }); y += h + o.rowGapY; maxW = Math.max(maxW, curW); cur = []; curW = 0; } };
        for (const id of ids) {
          const w = size(id).w, add = (cur.length ? o.cardGapX : 0) + w;
          if (cur.length && curW + add > o.maxRowW) flush();
          curW += (cur.length ? o.cardGapX : 0) + w; cur.push(id);
        }
        flush();
      }
      const W = Math.max(maxW + 2 * o.unitPadX, 300);
      for (const ln of lines) {
        let x = (W - ln.w) / 2;
        for (const id of ln.ids) { local[id].x = x; x += local[id].w + o.cardGapX; }
      }
      unitBox[u.code] = {w: W, h: y - o.rowGapY + o.unitPadBottom, empty: false, local};
    }

    // 2) 대단원 띠: 단원 상자를 나란히
    const bigBox = {};
    for (const b of data.bigUnits) {
      const us = data.units.filter(u => u.big === b.id);
      let x = o.bigPadX, h = 0;
      const at = {};
      for (const u of us) { at[u.code] = x; x += unitBox[u.code].w + o.unitGap; h = Math.max(h, unitBox[u.code].h); }
      bigBox[b.id] = {w: x - o.unitGap + o.bigPadX, h: o.bigPadTop + h + o.bigPadBottom, at, us};
    }

    // 3) 과목 = 세로 줄, 같은 번호의 대단원은 같은 높이에서 시작
    const bySubj = data.subjects.map(s => data.bigUnits.filter(b => b.subject === s.id));
    const nRows = Math.max(...bySubj.map(a => a.length));
    const rowY = [], rowH = [];
    let yy = o.subjTop;
    for (let r = 0; r < nRows; r++) {
      rowY[r] = yy;
      rowH[r] = Math.max(...bySubj.map(a => a[r] ? bigBox[a[r].id].h : 0));
      yy += rowH[r] + o.bigGap;
    }
    let sx = 0;
    data.subjects.forEach((s, si) => {
      const bs = bySubj[si], colW = Math.max(...bs.map(b => bigBox[b.id].w));
      bs.forEach((b, r) => {
        const bb = bigBox[b.id], bx = sx, by = rowY[r];
        bigs[b.id] = {x: bx, y: by, w: colW, h: rowH[r]};
        const shift = (colW - bb.w) / 2;
        for (const u of bb.us) {
          const ub = unitBox[u.code], ux = bx + shift + bb.at[u.code], uy = by + o.bigPadTop;
          units[u.code] = {x: ux, y: uy, w: ub.w, h: rowH[r] - o.bigPadTop - o.bigPadBottom, empty: ub.empty};
          for (const id in ub.local) { const p = ub.local[id]; pos[id] = {x: ux + p.x, y: uy + p.y, w: p.w, h: p.h}; }
        }
      });
      subjects[s.id] = {x: sx, y: 0, w: colW, h: yy - o.bigGap};
      sx += colW + o.subjGap;
    });
    const bounds = {x: 0, y: 0, w: sx - o.subjGap, h: yy - o.bigGap};
    return {nodes: pos, units, bigs, subjects, bounds};
  }

  // ───────── 분야별 보기 ─────────
  // 분야 = 세로 줄(레인). 모든 레인은 같은 간격의 가로줄(격자)을 나눠 쓴다.
  //  · 맨 위 띠 = 출발점(정의·법칙). 모든 레인이 같은 높이에서 시작한다.
  //  · 그 아래 = 유도, 그 아래 = 응용. 공식은 부모보다 반드시 아래 줄, 그 안에서는 될 수 있는 대로 위로 당겨 촘촘하게.
  //  · 레인 폭은 지도 가로세로 비가 aspect 쯤 되도록, 레인 순서는 분야 사이 선 길이의 합이 가장 짧도록(묶음끼리는 붙여서) 고른다.
  //  · 한 줄 안에서는 부모·자식의 가운데로 끌어당겨(무게중심 + PAVA) 선이 곧게 내려가게 한다.
  const GF = {
    cardGapX: 26, lineGap: 70, basisGap: 46, secPad: 22,
    lanePadX: 26, laneHead: 150, lanePadBottom: 48, laneGap: 54,
    labelTop: 190, groupPadX: 36, groupPadTop: 44, groupPadBottom: 40, groupGap: 150,
    aspect: 1.9, minPerLine: 1, maxPerLine: 6, basisLines: 3, extraLines: 30, sweeps: 4, flow: 400,
  };

  /** 응용 깊이: 응용 공식끼리 이어진 사슬에서 몇 번째인지(1부터) */
  function appliedDepths(data, ix) {
    const d = new Map();
    const get = id => {
      if (d.has(id)) return d.get(id);
      d.set(id, 1);
      let v = 1;
      for (const e of ix.inE.get(id)) if (ix.byId.get(e.from).role === 'applied') v = Math.max(v, get(e.from) + 1);
      d.set(id, v);
      return v;
    };
    for (const n of data.nodes) if (n.role === 'applied') get(n.id);
    return d;
  }

  /** 분야 사이 선 개수: w[i][j] = 양쪽 합, d[i][j] = i(부모) → j(자식) 방향만 (fields 순서의 번호) */
  function fieldWeights(data) {
    const at = new Map(data.fields.map((f, i) => [f.id, i])), fOf = new Map(data.nodes.map(n => [n.id, n.field]));
    const w = data.fields.map(() => data.fields.map(() => 0)), d = data.fields.map(() => data.fields.map(() => 0));
    for (const e of data.edges) {
      const a = at.get(fOf.get(e.from)), b = at.get(fOf.get(e.to));
      if (a === undefined || b === undefined || a === b) continue;
      w[a][b]++; w[b][a]++; d[a][b]++;
    }
    return {w, d};
  }

  /**
   * 레인 순서의 값 = 분야 사이 선마다 (두 레인 가운데 사이 거리) + 오른쪽 부모 → 왼쪽 자식으로 거꾸로 가는 선마다 flow.
   * widths·gapAt(i, j) 는 fields 순서 번호로
   */
  function orderCost(order, widths, W, gapAt, flow) {
    const cx = [];
    let x = 0;
    order.forEach((i, p) => { if (p) x += gapAt(order[p - 1], i); cx[i] = x + widths[i] / 2; x += widths[i]; });
    let s = 0;
    for (let a = 0; a < order.length; a++) for (let b = a + 1; b < order.length; b++) {
      const i = order[a], j = order[b];
      s += W.w[i][j] * Math.abs(cx[i] - cx[j]) + (flow || 0) * W.d[j][i];
    }
    return s;
  }

  /**
   * 레인 순서: orderCost 가 가장 작은 순서(정확한 답, 부분집합 동적 계획법). 같은 묶음(group)의 분야는 붙여 놓는다.
   * 선 길이만 보면 뒤집어도 값이 같으므로, 부모 분야가 왼쪽에 오도록(왼쪽 → 오른쪽으로 읽히게) flow 를 더한다.
   */
  function laneOrder(data, widths, gapIn, gapOut, flow) {
    const n = data.fields.length, W = fieldWeights(data), w = W.w, d = W.d;
    const gi = new Map(data.fieldGroups.map((g, i) => [g.id, i]));
    const grp = data.fields.map(f => gi.get(f.group));
    const G = data.fieldGroups.length;
    const maskOfG = new Array(G).fill(0);
    grp.forEach((g, i) => { maskOfG[g] |= 1 << i; });
    const full = (1 << n) - 1;
    const INF = Infinity;
    const cost = new Float64Array((full + 1) * (G + 1)).fill(INF), from = new Int32Array((full + 1) * (G + 1)).fill(-1);
    const at = (S, g) => S * (G + 1) + g;     // g = 마지막 묶음, G = 아직 없음
    cost[at(0, G)] = 0;
    for (let S = 0; S <= full; S++) {
      let cut = -1;
      for (let last = 0; last <= G; last++) {
        const c0 = cost[at(S, last)];
        if (c0 === INF) continue;
        if (cut < 0) {   // S 와 나머지 사이를 건너는 선 수
          cut = 0;
          for (let i = 0; i < n; i++) if (S >> i & 1) for (let j = 0; j < n; j++) if (!(S >> j & 1)) cut += w[i][j];
        }
        for (let v = 0; v < n; v++) {
          if (S >> v & 1) continue;
          const g = grp[v];
          if (last !== G && g !== last && ((S & maskOfG[last]) !== maskOfG[last] || (S & maskOfG[g]))) continue;
          let toV = 0, back = 0;
          for (let i = 0; i < n; i++) if (S >> i & 1) { toV += w[i][v]; back += d[v][i]; }
          const gap = last === G ? 0 : g === last ? gapIn : gapOut;
          const c = c0 + widths[v] * (cut - toV) + gap * cut + (flow || 0) * back;
          const k = at(S | 1 << v, g);
          if (c < cost[k] - 1e-9) { cost[k] = c; from[k] = at(S, last) * n + v; }
        }
      }
    }
    let best = -1;
    for (let g = 0; g < G; g++) if (best < 0 || cost[at(full, g)] < cost[best] - 1e-9) best = at(full, g);
    const ord = [];
    for (let k = best; from[k] >= 0;) { const v = from[k] % n; ord.push(v); k = (from[k] - v) / n; }
    ord.reverse();
    const rev = ord.slice().reverse();
    for (let i = 0; i < n; i++) if (ord[i] !== rev[i]) return ord[i] < rev[i] ? ord : rev;
    return ord;
  }

  /** 한 줄 안 자리: 순서를 지키고 겹치지 않으면서 목표 x 에 가장 가깝게(PAVA). ids 는 정렬된 순서 */
  function placeRow(ids, wOf, target, x0, x1, gap) {
    const pts = [];
    let off = 0;
    for (const id of ids) { const w = wOf(id); pts.push({id, off, t: target(id) - w / 2 - off}); off += w + gap; }
    const total = off - gap, lo = x0, hi = x1 - total;
    const blocks = [];
    for (let i = 0; i < pts.length; i++) {
      blocks.push({s: pts[i].t, n: 1, i0: i});
      while (blocks.length > 1) {
        const b = blocks[blocks.length - 1], a = blocks[blocks.length - 2];
        if (a.s / a.n <= b.s / b.n) break;
        a.s += b.s; a.n += b.n; blocks.pop();
      }
    }
    const out = new Map();
    for (let bi = 0; bi < blocks.length; bi++) {
      const b = blocks[bi], end = bi + 1 < blocks.length ? blocks[bi + 1].i0 : pts.length;
      let y = b.s / b.n;
      y = hi < lo ? (lo + hi) / 2 : Math.max(lo, Math.min(hi, y));
      for (let i = b.i0; i < end; i++) out.set(pts[i].id, y + pts[i].off);
    }
    return out;
  }

  /**
   * 분야별 배치. size(id) → {w, h}.
   * 돌려주는 것: nodes{id:{x,y,w,h}}, lanes{분야 id:{x,y,w,h,group,basis,derived,applied}}, groups{묶음 id:{x,y,w,h}},
   *            order[분야 id], line{id: 줄 번호}, B(출발점 띠의 줄 수), lines(전체 줄 수), pitch, bounds
   */
  function fieldLayout(data, size, opt) {
    const o = Object.assign({}, GF, opt || {});
    const ix = index(data), dep = depths(data), ad = appliedDepths(data, ix);
    const fields = data.fields, fi = new Map(fields.map((f, i) => [f.id, i]));
    const ord0 = new Map(data.nodes.map((n, i) => [n.id, i]));
    const sz = new Map(data.nodes.map(n => [n.id, size(n.id)]));
    const hMax = Math.max(...data.nodes.map(n => sz.get(n.id).h));
    const pitch = hMax + o.lineGap;
    const members = fields.map(f => data.nodes.filter(n => n.field === f.id).map(n => n.id));
    const tier = {basis: 0, derived: 1, applied: 2};
    // 놓는 차례 = 부모가 언제나 먼저: 출발점 → 유도(깊이 순) → 응용(응용 깊이 순)
    const seq = data.nodes.map(n => n.id).sort((a, b) => {
      const A = ix.byId.get(a), Bn = ix.byId.get(b);
      return tier[A.role] - tier[Bn.role] || (ad.get(a) || 0) - (ad.get(b) || 0) || dep.get(a) - dep.get(b) || ord0.get(a) - ord0.get(b);
    });

    // 1) 줄 나누기: 레인 안쪽 폭(cap)이 정해지면, 차례대로 「부모보다 아래 줄 가운데 자리가 남는 첫 줄」에 놓는다
    function pack(cap) {
      const used = fields.map(() => []), line = new Map(), lastD = fields.map(() => -1);
      let B = 0, lines = 0;
      for (const id of seq) {
        const n = ix.byId.get(id), f = fi.get(n.field), w = sz.get(id).w, u = used[f];
        let k = 0;
        if (n.role !== 'basis') {
          k = B;
          for (const e of ix.inE.get(id)) k = Math.max(k, line.get(e.from) + 1);
          if (n.role === 'applied') k = Math.max(k, lastD[f] + 1);
        }
        while (u[k] && u[k] + o.cardGapX + w > cap[f]) k++;
        u[k] = (u[k] ? u[k] + o.cardGapX : 0) + w;
        line.set(id, k);
        if (n.role === 'basis') B = Math.max(B, k + 1);
        else if (n.role === 'derived') lastD[f] = Math.max(lastD[f], k);
        lines = Math.max(lines, k + 1);
      }
      return {line, B, lines};
    }

    // 2) 레인 폭 고르기: 한 줄에 카드 k 장(가장 넓은 것부터 k 장이 들어가는 폭)씩 후보
    const cand = members.map(ids => {
      const ws = ids.map(id => sz.get(id).w).sort((a, b) => b - a), arr = [];
      let s = 0;
      for (let k = 1; k <= Math.min(ws.length, o.maxPerLine); k++) { s += ws[k - 1] + (k > 1 ? o.cardGapX : 0); arr.push(s); }
      return arr.length ? arr : [300];
    });
    // 레인 하나는 한 줄에 적어도 minPerLine 장, 출발점은 basisLines 줄 안에 들어가게
    const kMin = members.map((ids, f) => {
      const nb = ids.filter(id => ix.byId.get(id).role === 'basis').length;
      return Math.min(cand[f].length, Math.max(o.minPerLine, Math.ceil(nb / o.basisLines))) - 1;
    });
    const ki = cand.map(c => c.length - 1);
    const capOf = () => ki.map((k, f) => cand[f][k]);
    const nG = new Set(fields.map(f => f.group)).size;
    const widthOf = () => {
      let W = 0;
      ki.forEach((k, f) => { W += cand[f][k] + 2 * o.lanePadX; });
      return W + (fields.length - nG) * o.laneGap + (nG - 1) * o.groupGap + nG * 2 * o.groupPadX;
    };
    const heightOf = r => o.labelTop + o.groupPadTop + o.laneHead + r.lines * pitch - o.lineGap + o.basisGap + o.lanePadBottom + o.groupPadBottom;
    let res = pack(capOf());
    let best = null;
    for (let Lc = res.lines; Lc <= res.lines + o.extraLines; Lc++) {
      for (let changed = true; changed;) {
        changed = false;
        const byW = fields.map((f, i) => i).sort((a, b) => cand[b][ki[b]] - cand[a][ki[a]] || a - b);
        for (const f of byW) {
          if (ki[f] <= kMin[f]) continue;
          ki[f]--;
          const r = pack(capOf());
          if (r.lines <= Lc) { res = r; changed = true; } else ki[f]++;
        }
      }
      const ratio = widthOf() / heightOf(res), score = Math.abs(Math.log(ratio / o.aspect));
      if (!best || score < best.score - 1e-9) best = {score, ki: ki.slice(), res};
      if (ratio < o.aspect) break;
    }
    best.ki.forEach((k, f) => { ki[f] = k; });
    res = best.res;
    const cap = capOf();

    // 3) 레인 순서와 x 자리
    const laneW = cap.map(c => c + 2 * o.lanePadX);
    const order = o.order ? o.order.map(id => fi.get(id)) : laneOrder(data, laneW, o.laneGap, o.groupGap + 2 * o.groupPadX, o.flow);
    const lanes = {}, groups = {};
    const top = o.labelTop + o.groupPadTop, lineY = k => top + o.laneHead + k * pitch + (k >= res.B ? o.basisGap : 0);
    const laneH = o.laneHead + res.lines * pitch - o.lineGap + o.basisGap + o.lanePadBottom;
    let x = 0, prevG = null;
    for (const f of order) {
      const F = fields[f];
      if (prevG !== F.group) {
        if (prevG !== null) { groups[prevG].w = x - groups[prevG].x + o.groupPadX; x += o.groupPadX + o.groupGap; }
        groups[F.group] = {x, y: o.labelTop, w: 0, h: o.groupPadTop + laneH + o.groupPadBottom};
        x += o.groupPadX; prevG = F.group;
      } else x += o.laneGap;
      lanes[F.id] = {x, y: top, w: laneW[f], h: laneH, group: F.group};
      x += laneW[f];
    }
    groups[prevG].w = x - groups[prevG].x + o.groupPadX;

    // 4) 한 줄 안 순서와 자리: 부모(내려가며)·자식(올라가며) 가운데로 끌어당기기를 되풀이
    const rows = [];          // {f, k, ids}
    const byLine = new Map();
    for (const n of data.nodes) {
      const key = n.field + '|' + res.line.get(n.id);
      if (!byLine.has(key)) { const r = {f: n.field, k: res.line.get(n.id), ids: []}; byLine.set(key, r); rows.push(r); }
      byLine.get(key).ids.push(n.id);
    }
    rows.sort((a, b) => a.k - b.k || fi.get(a.f) - fi.get(b.f));
    const X = new Map(), wOf = id => sz.get(id).w, cxOf = id => X.get(id) + wOf(id) / 2;
    const span = r => { const L = lanes[r.f]; return [L.x + o.lanePadX, L.x + L.w - o.lanePadX]; };
    for (const r of rows) {      // 처음: 데이터 순서로 가운데 정렬
      const [x0, x1] = span(r);
      let tw = -o.cardGapX;
      for (const id of r.ids) tw += wOf(id) + o.cardGapX;
      let xx = (x0 + x1 - tw) / 2;
      for (const id of r.ids) { X.set(id, xx); xx += wOf(id) + o.cardGapX; }
    }
    const mean = (id, up, down) => {
      let s = 0, c = 0;
      if (up) for (const e of ix.inE.get(id)) { s += cxOf(e.from); c++; }
      if (down) for (const e of ix.outE.get(id)) { s += cxOf(e.to); c++; }
      return c ? s / c : cxOf(id);
    };
    const sweep = (list, up, down) => {
      for (const r of list) {
        const t = new Map(r.ids.map(id => [id, mean(id, up, down)]));
        r.ids.sort((a, b) => t.get(a) - t.get(b) || X.get(a) - X.get(b) || ord0.get(a) - ord0.get(b));
        const [x0, x1] = span(r);
        const p = placeRow(r.ids, wOf, id => t.get(id), x0, x1, o.cardGapX);
        for (const [id, v] of p) X.set(id, v);
      }
    };
    const rev = rows.slice().reverse();
    for (let s = 0; s < o.sweeps; s++) { sweep(rows, true, false); sweep(rev, false, true); }
    sweep(rows, true, true);

    // 5) 좌표와 레인 안 칸(출발점·유도·응용)
    const pos = {};
    for (const n of data.nodes) {
      const s = sz.get(n.id), k = res.line.get(n.id);
      pos[n.id] = {x: X.get(n.id), y: lineY(k) + (hMax - s.h) / 2, w: s.w, h: s.h};
    }
    const yTop = lineY(0) - o.secPad, yBasisEnd = lineY(res.B - 1) + hMax + o.secPad, yEnd = top + laneH;
    for (const F of fields) {
      const L = lanes[F.id], ks = {basis: [], derived: [], applied: []};
      for (const id of members[fi.get(F.id)]) ks[ix.byId.get(id).role].push(res.line.get(id));
      L.basis = {y: yTop, h: yBasisEnd - yTop};
      const aTop = ks.applied.length ? lineY(Math.min(...ks.applied)) - o.lineGap / 2 : null;
      L.derived = ks.derived.length ? {y: yBasisEnd, h: (aTop !== null ? aTop : yEnd) - yBasisEnd} : null;
      L.applied = aTop !== null ? {y: aTop, h: yEnd - aTop} : null;
      L.counts = {basis: ks.basis.length, derived: ks.derived.length, applied: ks.applied.length};
    }
    const bounds = {x: 0, y: 0, w: groups[prevG].x + groups[prevG].w, h: top + laneH + o.groupPadBottom};
    const line = {};
    for (const [id, k] of res.line) line[id] = k;
    return {nodes: pos, lanes, groups, order: order.map(i => fields[i].id), line, B: res.B, lines: res.lines, pitch, bounds};
  }

  /** 간선 곡선: 부모 아래 가운데 → 자식 위 가운데. 자식이 위나 옆에 있으면 옆으로 돌아 들어간다 */
  function edgePath(a, b) {
    const ax = a.x + a.w / 2, ay = a.y + a.h, bx = b.x + b.w / 2, by = b.y;
    if (by > ay + 8) {
      const c = Math.max(28, (by - ay) * 0.5);
      return `M${r1(ax)},${r1(ay)} C${r1(ax)},${r1(ay + c)} ${r1(bx)},${r1(by - c)} ${r1(bx)},${r1(by)}`;
    }
    const right = bx >= ax;
    const sx = right ? a.x + a.w : a.x, sy = a.y + a.h / 2;
    const c = Math.max(90, Math.abs(bx - sx) * 0.35);
    return `M${r1(sx)},${r1(sy)} C${r1(sx + (right ? c : -c))},${r1(sy)} ${r1(bx)},${r1(by - c)} ${r1(bx)},${r1(by)}`;
  }
  const r1 = v => Math.round(v * 10) / 10;

  /** 찾기: 이름·찾기 낱말·단원·분야·개념 ID·수식 글자. 점수 높은 순 */
  const norm = s => String(s || '').toLowerCase().replace(/[\s·,:()\-–—_{}^\\]/g, '');
  function texWords(t) { return String(t || '').replace(/\\(text|mathrm)\{([^}]*)\}/g, ' $2 ').replace(/\\[a-zA-Z]+/g, ' '); }
  function search(data, q, limit) {
    const k = norm(q);
    if (!k) return [];
    const ix = index(data), out = [], fOf = new Map((data.fields || []).map(f => [f.id, f]));
    for (const n of data.nodes) {
      const u = ix.unitOf.get(n.unit) || {}, f = fOf.get(n.field) || {};
      let s = 0;
      const name = norm(n.name);
      if (name === k) s = 100; else if (name.startsWith(k)) s = 80; else if (name.includes(k)) s = 60;
      if (!s && (n.keys || []).some(w => norm(w).includes(k))) s = 50;
      if (!s && norm(texWords(n.tex)).includes(k)) s = 35;
      if (!s && (n.concepts || []).some(c => norm(c) === k)) s = 30;
      if (!s && (norm(u.name).includes(k) || norm(f.name).includes(k))) s = 20;
      if (!s && norm(n.id).includes(k)) s = 15;
      if (s) out.push({id: n.id, score: s + (n.role === 'basis' ? 2 : n.role === 'derived' ? 1 : 0)});
    }
    out.sort((a, b) => b.score - a.score);
    return out.slice(0, limit || 12).map(a => a.id);
  }

  /** 모든 LaTeX (테스트용): [위치, tex] */
  function allTex(data) {
    const out = [];
    for (const n of data.nodes) {
      out.push([n.id, n.tex]);
      (n.steps || []).forEach((s, i) => { if (s.tex) out.push([`${n.id} 단계 ${i + 1}`, s.tex]); });
      (n.forms || []).forEach((f, i) => out.push([`${n.id} 다른 꼴 ${i + 1}`, f]));
      (n.calc || []).forEach((s, i) => out.push([`${n.id} 참고 ${i + 1}`, s.tex]));
    }
    return out;
  }

  const api = {G, GF, index, findCycle, ancestors, descendants, depths, unitRows, layout, edgePath, search, allTex, norm,
    appliedDepths, fieldWeights, orderCost, laneOrder, placeRow, fieldLayout};
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FormulaGraph = api;
})(typeof self !== 'undefined' ? self : this);
