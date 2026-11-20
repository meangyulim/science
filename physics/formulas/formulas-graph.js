/* 공식 지도 — 그래프 계산(순수 함수). 화면(map.js)과 테스트(tests/formulas-*.test.cjs)가 같이 쓴다.
   데이터: physics/data/formulas.json (nodes · edges · units · bigUnits · subjects)
   배치: 과목 = 세로 줄(물리학 Ⅰ 왼쪽, Ⅱ 오른쪽) → 대단원 = 가로 띠(같은 번호끼리 같은 높이) → 단원 = 상자(나란히)
         → 상자 안에서 유도 깊이대로 줄(맨 위 = 출발점, 아래로 갈수록 유도·응용) */
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

  /** 찾기: 이름·찾기 낱말·단원·개념 ID·수식 글자. 점수 높은 순 */
  const norm = s => String(s || '').toLowerCase().replace(/[\s·,:()\-–—_{}^\\]/g, '');
  function texWords(t) { return String(t || '').replace(/\\(text|mathrm)\{([^}]*)\}/g, ' $2 ').replace(/\\[a-zA-Z]+/g, ' '); }
  function search(data, q, limit) {
    const k = norm(q);
    if (!k) return [];
    const ix = index(data), out = [];
    for (const n of data.nodes) {
      const u = ix.unitOf.get(n.unit) || {};
      let s = 0;
      const name = norm(n.name);
      if (name === k) s = 100; else if (name.startsWith(k)) s = 80; else if (name.includes(k)) s = 60;
      if (!s && (n.keys || []).some(w => norm(w).includes(k))) s = 50;
      if (!s && norm(texWords(n.tex)).includes(k)) s = 35;
      if (!s && (n.concepts || []).some(c => norm(c) === k)) s = 30;
      if (!s && norm(u.name).includes(k)) s = 20;
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

  const api = {G, index, findCycle, ancestors, descendants, depths, unitRows, layout, edgePath, search, allTex, norm};
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FormulaGraph = api;
})(typeof self !== 'undefined' ? self : this);
