/* 별의 공간 운동 — 네 실험이 같은 모형(star-motion-model.js)과 자료(star-motion-data.js)를 쓴다. */
(() => {
  'use strict';
  const M = window.StarMotionModel, D = window.StarMotionData, $ = id => document.getElementById(id);
  const NS = 'http://www.w3.org/2000/svg';

  // ── 작은 도구들 ─────────────────────────────────────────────
  function el(tag, attrs, parent, text) {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs || {}) if (attrs[k] !== undefined && attrs[k] !== null) n.setAttribute(k, attrs[k]);
    if (text !== undefined) n.textContent = text;
    if (parent) parent.appendChild(n);
    return n;
  }
  const clear = n => { while (n.firstChild) n.removeChild(n.firstChild); };
  // 음수는 수학 기호 −로. −0.0 같은 표기는 피한다.
  function num(v, d = 1) {
    const s = Math.abs(v).toFixed(d);
    return (v < 0 && +s !== 0 ? '−' : '') + s;
  }
  function sgn(v, d = 1) {
    const s = Math.abs(v).toFixed(d);
    return +s === 0 ? s : (v < 0 ? '−' : '+') + s;
  }
  const grp = v => Math.round(v).toLocaleString('ko-KR');
  // 소수점 아래 끝의 0은 지운다 (0.50 → 0.5, 10.0 → 10)
  function trim(v, d = 2) {
    const s = String(+Math.abs(v).toFixed(d));
    return (v < 0 && +s !== 0 ? '−' : '') + s;
  }
  const small = () => window.innerWidth < 640;
  const mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const reduced = () => !!(mq && mq.matches);
  function svgPoint(svg, evt) {
    const pt = svg.createSVGPoint();
    pt.x = evt.clientX; pt.y = evt.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  }
  function setPressed(container, attr, value) {
    container.querySelectorAll(`[${attr}]`).forEach(b => b.setAttribute('aria-pressed', String(b.getAttribute(attr) === value)));
  }
  const frac = (a, b) => `<span class="frac"><span>${a}</span><span>${b}</span></span>`;
  const V = s => `<span class="var">V<sub>${s}</sub></span>`;
  const it = s => `<span class="var">${s}</span>`;
  // SVG 글자: [문자열, {i: 기울임, sub: 아래첨자, b: 굵게, fill}] 조각을 이어 붙인다.
  function rich(parent, attrs, parts) {
    const t = el('text', attrs, parent);
    let down = false;
    for (const p of parts) {
      const [str, o] = Array.isArray(p) ? [p[0], p[1] || {}] : [p, {}];
      const a = {};
      if (o.i) a['font-style'] = 'italic';
      if (o.b) a['font-weight'] = 800;
      if (o.fill) a.fill = o.fill;
      if (o.sub) { a['font-size'] = '72%'; if (!down) { a.dy = '0.3em'; down = true; } }
      else if (down) { a.dy = '-0.3em'; down = false; }
      el('tspan', a, t, str);
    }
    return t;
  }
  // 화살표 (선 + 삼각형 머리)
  function arrow(parent, x1, y1, x2, y2, color, w = 4, o = {}) {
    const g = el('g', {opacity: o.opacity}, parent);
    const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy);
    if (L < 1) return g;
    const ux = dx / L, uy = dy / L, hl = Math.min(o.head || 7 + w * 1.7, L * 0.65), hw = hl * 0.58;
    const bx = x2 - ux * hl, by = y2 - uy * hl;
    el('line', {x1, y1, x2: bx + ux, y2: by + uy, stroke: color, 'stroke-width': w, 'stroke-linecap': 'round', 'stroke-dasharray': o.dash}, g);
    el('path', {d: `M${x2.toFixed(1)} ${y2.toFixed(1)}L${(bx - uy * hw).toFixed(1)} ${(by + ux * hw).toFixed(1)}L${(bx + uy * hw).toFixed(1)} ${(by - ux * hw).toFixed(1)}Z`, fill: color}, g);
    return g;
  }
  // 이름표 자리 고르기: 별 둘레의 여러 자리(가깝게 → 멀게) 중 다른 이름표·별과 겹치지 않는 곳.
  // 멀리 놓인 이름표에는 가는 지시선을 긋는다(lab.lead).
  function placeLabels(items, Wd, Hd, taken = []) {
    const placed = taken.slice();
    const hit = (a, q) => !(a.x1 < q.x0 || a.x0 > q.x1 || a.y1 < q.y0 || a.y0 > q.y1);
    const dots = items.map(o => ({x0: o.x - o.r - 1, y0: o.y - o.r - 1, x1: o.x + o.r + 1, y1: o.y + o.r + 1}));
    items.forEach((o, idx) => {
      const w = o.text.length * o.fs * 0.98, h = o.fs * 1.12;
      const cands = (o.pref || []).map(c => [...c, 0]);
      [0, 1, 2].forEach(k => {
        const g = o.r + 4 + k * h * 0.95;
        cands.push([g, -g * 0.35, 'start', k], [-g, -g * 0.35, 'end', k], [g, g * 0.35 + h * 0.62, 'start', k], [-g, g * 0.35 + h * 0.62, 'end', k],
          [0, -g - 1, 'middle', k], [0, g + h * 0.78, 'middle', k]);
      });
      let best = null;
      for (const [dx, dy, anc, k] of cands) {
        const x0 = anc === 'start' ? o.x + dx : anc === 'end' ? o.x + dx - w : o.x + dx - w / 2, y0 = o.y + dy - h * 0.8;
        const box = {x0, y0, x1: x0 + w, y1: y0 + h};
        const bad = box.x0 < 2 || box.x1 > Wd - 2 || box.y0 < 2 || box.y1 > Hd - 2 ||
          placed.some(q => hit(box, q)) || dots.some((d, j) => j !== idx && hit(box, d));
        if (!bad) { best = {dx, dy, anc, box, lead: k > 0}; break; }
        if (!best) best = {dx, dy, anc, box, lead: false};
      }
      placed.push(best.box);
      o.lab = best;
    });
  }
  // 이름표 그리기 (지시선 포함)
  function drawLabels(parent, items, attrsOf) {
    items.forEach(o => {
      const L = o.lab;
      if (L.lead) {
        const tx = L.anc === 'start' ? L.box.x0 : L.anc === 'end' ? L.box.x1 : (L.box.x0 + L.box.x1) / 2;
        const ty = Math.max(L.box.y0, Math.min(L.box.y1, o.y));
        const d = Math.hypot(tx - o.x, ty - o.y) || 1;
        el('line', {x1: o.x + (tx - o.x) / d * (o.r + 2), y1: o.y + (ty - o.y) / d * (o.r + 2), x2: tx, y2: ty, stroke: '#8fa6bd', 'stroke-width': 1, opacity: 0.8}, parent);
      }
      el('text', Object.assign({x: o.x + L.dx, y: o.y + L.dy, 'text-anchor': L.anc}, attrsOf(o)), parent, o.text);
    });
  }
  // 손잡이 끌기. hit(p)가 손잡이 이름을 돌려주면 그 손잡이를 끈다. 빈 곳을 누르면 페이지가 스크롤된다.
  function dragHandles(svg, hit, move, end) {
    let act = null;
    svg.addEventListener('pointerdown', e => {
      if (e.button > 0) return;
      const p = svgPoint(svg, e), h = hit(p);
      if (h === null || h === undefined) return;
      act = {h, id: e.pointerId};
      try { svg.setPointerCapture(e.pointerId); } catch (_) {}
      e.preventDefault();
      move(h, p, 'start');
    });
    svg.addEventListener('pointermove', e => { if (act && e.pointerId === act.id) move(act.h, svgPoint(svg, e), 'move'); });
    const stop = e => { if (act && e.pointerId === act.id) { const h = act.h; act = null; if (end) end(h); } };
    svg.addEventListener('pointerup', stop);
    svg.addEventListener('pointercancel', stop);
    // iOS 사파리: 손잡이를 잡았을 때만 스크롤을 막는다.
    svg.addEventListener('touchstart', e => {
      if (e.touches.length !== 1) return;
      const h = hit(svgPoint(svg, e.touches[0]));
      if (h !== null && h !== undefined) e.preventDefault();
    }, {passive: false});
  }
  // 그래프 위를 누르고 끄는 동작 (가로로 끌기). 세로 스크롤은 브라우저에 맡긴다.
  function onDrag(svg, handler) {
    let active = false;
    svg.addEventListener('pointerdown', e => {
      if (e.button > 0) return;
      active = true;
      try { svg.setPointerCapture(e.pointerId); } catch (_) {}
      handler(svgPoint(svg, e), 'start');
    });
    svg.addEventListener('pointermove', e => { if (active) handler(svgPoint(svg, e), 'move'); });
    const end = () => { if (active) { active = false; handler(null, 'end'); } };
    svg.addEventListener('pointerup', end);
    svg.addEventListener('pointercancel', end);
  }
  function lin(d0, d1, r0, r1) {
    const f = v => r0 + (v - d0) * (r1 - r0) / (d1 - d0);
    f.inv = p => d0 + (p - r0) * (d1 - d0) / (r1 - r0);
    return f;
  }
  const smooth = (x, a, b) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

  // ── 애니메이션: 필요할 때만 돌고, 화면이 숨으면 멈춘다 ─────────────────
  const anims = new Set();
  let rafId = null, lastT = null;
  function loop(now) {
    rafId = null;
    if (document.hidden) { lastT = null; return; }
    const dt = lastT === null ? 0 : Math.min(0.1, (now - lastT) / 1000);
    lastT = now;
    for (const f of [...anims]) if (f(dt, now) === false) anims.delete(f);
    if (anims.size) rafId = requestAnimationFrame(loop); else lastT = null;
  }
  function animate(f) { anims.add(f); if (rafId === null) rafId = requestAnimationFrame(loop); }
  const stopAnim = f => anims.delete(f);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && anims.size && rafId === null) { lastT = null; rafId = requestAnimationFrame(loop); }
  });

  // ── 실험 전환 ─────────────────────────────────────────────
  const stations = {};
  let current = null;
  const ALIAS = {proper: 's1', radial: 's2', space: 's3', dipper: 's4', '1': 's1', '2': 's2', '3': 's3', '4': 's4'};
  function show(name) {
    name = ALIAS[name] || name;
    if (!stations[name]) name = 's1';
    if (current && current !== name && stations[current].leave) stations[current].leave();
    current = name;
    setPressed(document.querySelector('.stations'), 'data-station', name);
    document.querySelectorAll('.station').forEach(s => { s.hidden = s.id !== 'station-' + name; });
    stations[name].render();
    if (stations[name].enter) stations[name].enter();
    try { history.replaceState(null, '', '#' + name); } catch (_) {}
  }
  document.querySelectorAll('.stations button').forEach(b => b.addEventListener('click', () => {
    show(b.dataset.station);
    document.querySelector('.stations').scrollIntoView({block: 'nearest'});
  }));

  // ═══════════════ 01 고유 운동과 접선 속도 ═══════════════
  stations.s1 = (() => {
    const B = D.barnard, field = D.field.map(M.fieldStar);
    const svg = $('s1-field'), geo = $('s1-geo');
    const W = 640, H = 480, SPAN = 360, k = W / SPAN;          // 사진 가로 6′ = 360″
    const st = {seq: 'textbook', view: 'single', idx: 0, playing: false, a: null, b: null, snapA: null, snapB: null,
      calc: 'measured', r: 1.83, measured: null, measuredFrom: null};
    const seq = () => D.sequences[st.seq];
    const tOf = y => M.yearOf(y, seq().month);
    let center = {x: 0, y: 0};
    const X = x => W / 2 - (x - center.x) * k;                 // 동쪽(+x)이 왼쪽
    const Y = y => H / 2 - (y - center.y) * k;                 // 북쪽(+y)이 위
    const skyOf = p => ({x: center.x - (p.x - W / 2) / k, y: center.y - (p.y - H / 2) / k});
    const posOf = year => M.barnardAt(B, tOf(year));

    function setSequence(name) {
      st.seq = name; st.idx = 0; st.snapA = st.snapB = null;
      const ys = seq().years, p0 = posOf(ys[0]), p1 = posOf(ys[ys.length - 1]);
      center = {x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2};
      // 자는 처음에 사진 아래쪽에 가로로 놓아 둔다.
      st.a = {x: center.x + 62, y: center.y - 100};
      st.b = {x: center.x - 62, y: center.y - 100};
      buildYears();
    }
    function buildYears() {
      const box = $('s1-years');
      box.innerHTML = '';
      seq().years.forEach((y, i) => {
        const b = document.createElement('button');
        b.type = 'button'; b.dataset.i = i; b.textContent = y;
        b.setAttribute('aria-label', `${y}년 사진`);
        b.addEventListener('click', () => { setPlaying(false); st.view = 'single'; st.idx = i; render(); });
        box.appendChild(b);
      });
    }
    // 자석처럼 붙을 자리: 보이는 사진의 바너드별
    function targets() {
      const ys = seq().years;
      const list = st.view === 'single' ? [ys[st.idx]] : ys;
      return list.map(y => ({year: y, p: posOf(y)}));
    }
    function snap(sky) {
      const tol = small() ? 15 : 9;     // ″
      let best = null;
      for (const t of targets()) {
        const d = M.separation(sky, t.p);
        if (d < tol && (!best || d < best.d)) best = {d, ...t};
      }
      return best;
    }
    const handleR = () => small() ? 44 : 26;
    dragHandles(svg, p => {
      const da = Math.hypot(p.x - X(st.a.x), p.y - Y(st.a.y)), db = Math.hypot(p.x - X(st.b.x), p.y - Y(st.b.y));
      if (Math.min(da, db) > handleR()) return null;
      return da <= db ? 'a' : 'b';
    }, (h, p) => {
      const sky = skyOf({x: Math.max(8, Math.min(W - 8, p.x)), y: Math.max(8, Math.min(H - 8, p.y))});
      const s = snap(sky);
      st[h] = s ? {...s.p} : sky;
      st[h === 'a' ? 'snapA' : 'snapB'] = s ? s.year : null;
      drawDynamic(); readouts();
    });

    // ── 사진 그리기: 별(자주 안 바뀜)과 바너드별·자(자주 바뀜)를 나눠 그린다 ──
    let gStars, gDyn, starsKey = '';
    function drawStars() {
      const year = st.view === 'single' ? seq().years[st.idx] : seq().years[Math.floor(seq().years.length / 2)];
      const key = st.seq + year + small();
      if (key === starsKey && gStars && gStars.parentNode) return;
      starsKey = key;
      clear(svg);
      const defs = el('defs', {}, svg);
      const g1 = el('radialGradient', {id: 's1-glow'}, defs);
      el('stop', {offset: '0%', 'stop-color': '#ffffff', 'stop-opacity': 0.55}, g1);
      el('stop', {offset: '100%', 'stop-color': '#ffffff', 'stop-opacity': 0}, g1);
      const g2 = el('radialGradient', {id: 's1-bglow'}, defs);
      el('stop', {offset: '0%', 'stop-color': '#ffb070', 'stop-opacity': 0.75}, g2);
      el('stop', {offset: '100%', 'stop-color': '#ff8a40', 'stop-opacity': 0}, g2);
      gStars = el('g', {}, svg);
      const t = tOf(year), grow = small() ? 1.25 : 1;
      for (const s of field) {
        const p = M.positionAt(s, t), x = X(p.x), y = Y(p.y);
        if (x < -10 || x > W + 10 || y < -10 || y > H + 10) continue;
        const r = M.dotRadius(s.g) * grow;
        if (s.g < 13) el('circle', {cx: x.toFixed(1), cy: y.toFixed(1), r: (r * 2.6).toFixed(1), fill: 'url(#s1-glow)'}, gStars);
        el('circle', {cx: x.toFixed(1), cy: y.toFixed(1), r: r.toFixed(2), fill: M.starColor(s.bprp), opacity: s.g > 17.5 ? 0.7 : 1}, gStars);
      }
      gDyn = el('g', {}, svg);
    }
    function drawDynamic() {
      clear(gDyn);
      const sm = small(), ys = seq().years, fs = sm ? 22 : 13;
      // 바너드별
      const shown = st.view === 'single' ? [ys[st.idx]] : ys;
      shown.forEach((y, i) => {
        const p = posOf(y), x = X(p.x), yy = Y(p.y);
        el('circle', {cx: x, cy: yy, r: sm ? 20 : 15, fill: 'url(#s1-bglow)'}, gDyn);
        el('circle', {cx: x, cy: yy, r: sm ? 8.5 : 6.5, fill: '#ffa66b', stroke: '#ffd9b8', 'stroke-width': 1}, gDyn);
        if (st.view === 'overlay') {
          const first = i === 0, last = i === shown.length - 1;
          if (sm && !first && !last && shown.length > 5) return;
          el('line', {x1: x + 14, x2: x + 34, y1: yy, y2: yy, stroke: first || last ? '#ffb27a' : '#7d93a8', 'stroke-width': 2}, gDyn);
          el('text', {x: x + 40, y: yy + fs * 0.36, 'font-size': fs, 'font-weight': first || last ? 800 : 600, fill: first || last ? '#ffc597' : '#a9bccc'}, gDyn, String(y));
        }
      });
      // 이름표 (처음 사진에서만)
      if (st.view === 'single') {
        const p = posOf(ys[st.idx]);
        const lx = X(p.x) - 22, ly = Y(p.y) - 24;
        el('text', {x: lx, y: ly, 'text-anchor': 'end', 'font-size': fs, 'font-weight': 700, fill: '#ffd9b8', class: 'halo-dark'}, gDyn, '바너드별');
        el('line', {x1: lx + 3, y1: ly + 4, x2: X(p.x) - 8, y2: Y(p.y) - 7, stroke: '#ffd9b8', 'stroke-width': 1.2}, gDyn);
      }
      // 연도 꼬리표 (교과서 사진처럼 왼쪽 위)
      const tag = st.view === 'single'
        ? (st.seq === 'textbook' ? `${ys[st.idx]}.${seq().month}.` : `${ys[st.idx]}년`)
        : (st.seq === 'textbook' ? `${ys[0]}.7. ~ ${ys[ys.length - 1]}.7. 겹침` : `${ys[0]}~${ys[ys.length - 1]}년 겹침`);
      el('text', {x: 16, y: sm ? 36 : 28, 'font-size': sm ? 26 : 17, 'font-weight': 800, fill: '#ffffff', class: 'halo-dark'}, gDyn, tag);
      // 방위
      const cx = W - (sm ? 54 : 40), cy = sm ? 62 : 48, L = sm ? 30 : 22;
      arrow(gDyn, cx, cy, cx, cy - L, '#cfe0f0', 2, {head: 7});
      arrow(gDyn, cx, cy, cx - L, cy, '#cfe0f0', 2, {head: 7});
      el('text', {x: cx, y: cy - L - 6, 'text-anchor': 'middle', 'font-size': sm ? 20 : 12, fill: '#cfe0f0', 'font-weight': 700}, gDyn, '북');
      el('text', {x: cx - L - 6, y: cy + 5, 'text-anchor': 'end', 'font-size': sm ? 20 : 12, fill: '#cfe0f0', 'font-weight': 700}, gDyn, '동');
      // 축척 막대
      const bar = seq().bar, bl = bar * k, bx = 20, by = H - (sm ? 22 : 18);
      el('rect', {x: bx - 8, y: by - (sm ? 40 : 30), width: bl + 16, height: sm ? 50 : 38, rx: 6, fill: '#04070c', opacity: 0.75}, gDyn);
      el('path', {d: `M${bx} ${by - 8}V${by}H${bx + bl}V${by - 8}`, stroke: '#ffffff', 'stroke-width': 2.5, fill: 'none'}, gDyn);
      el('text', {x: bx + bl / 2, y: by - (sm ? 16 : 13), 'text-anchor': 'middle', 'font-size': sm ? 20 : 13, 'font-weight': 800, fill: '#ffffff'}, gDyn, bar === 60 ? '1′ (60″)' : '2′ (120″)');
      // 자
      const ax = X(st.a.x), ay = Y(st.a.y), bxx = X(st.b.x), byy = Y(st.b.y);
      el('line', {x1: ax, y1: ay, x2: bxx, y2: byy, stroke: '#ffffff', 'stroke-width': sm ? 3.5 : 2.5, opacity: 0.9}, gDyn);
      const len = M.separation(st.a, st.b);
      if (len > 6) {
        const mx = (ax + bxx) / 2, my = (ay + byy) / 2, dx = bxx - ax, dy = byy - ay, L2 = Math.hypot(dx, dy) || 1;
        let nx = -dy / L2, ny = dx / L2;
        if (nx > 0) { nx = -nx; ny = -ny; }                     // 연도 꼬리표가 오른쪽에 있으니 길이는 왼쪽에
        el('text', {x: mx + nx * (sm ? 30 : 20), y: my + ny * (sm ? 30 : 20) + 5, 'text-anchor': nx < -0.3 ? 'end' : 'middle', 'font-size': sm ? 21 : 13, 'font-weight': 800, fill: '#8ff0ff', class: 'halo-dark'}, gDyn, `${num(len, 1)}″`);
      }
      const rl = Math.hypot(bxx - ax, byy - ay);
      [['A', ax, ay, st.snapA, -1], ['B', bxx, byy, st.snapB, 1]].forEach(([n, x, y, on, sgnDir]) => {
        const c = on !== null ? '#3fd6f0' : '#ffffff';
        el('circle', {cx: x, cy: y, r: sm ? 16 : 11, fill: 'none', stroke: c, 'stroke-width': sm ? 3.5 : 2.5}, gDyn);
        el('circle', {cx: x, cy: y, r: handleR(), fill: '#ffffff', 'fill-opacity': 0.001, class: 'handle'}, gDyn);
        // 이름은 자의 바깥쪽 끝에 (자가 짧으면 위에)
        const ux = rl > 12 ? (bxx - ax) / rl * sgnDir : 0, uy = rl > 12 ? (byy - ay) / rl * sgnDir : -1, g = sm ? 30 : 21;
        el('text', {x: x + ux * g, y: y + uy * g + (sm ? 7 : 5), 'text-anchor': 'middle', 'font-size': sm ? 21 : 13, 'font-weight': 800, fill: c, class: 'halo-dark'}, gDyn, n);
      });
    }

    function measurement() {
      const len = M.separation(st.a, st.b);
      if (st.snapA === null || st.snapB === null || st.snapA === st.snapB) return {len, ok: false};
      const dt = Math.abs(st.snapB - st.snapA);
      const mu = M.round(M.properMotionFromPhotos(len, dt), 1);
      return {len, ok: true, dt, mu, from: Math.min(st.snapA, st.snapB), to: Math.max(st.snapA, st.snapB)};
    }
    function readouts() {
      const m = measurement(), bar = seq().bar;
      $('s1-len').textContent = `${num(m.len, 1)}″ (막대의 ${num(m.len / bar, 2)}배)`;
      $('s1-dt').textContent = m.ok ? `${m.dt}년 (${m.from}→${m.to})` : '—';
      $('s1-mu').textContent = m.ok ? `${num(m.mu, 1)}″/년` : '—';
      if (m.ok) { st.measured = m.mu; st.measuredFrom = m; }
      let txt;
      if (m.ok) {
        txt = `${m.from}년부터 ${m.to}년까지 ${m.dt}년 동안 <b>${num(m.len, 1)}″</b>(축척 막대의 ${num(m.len / bar, 2)}배) 움직였으므로 고유 운동 μ = ${num(m.len, 1)}″ ÷ ${m.dt}년 ≈ <b>${num(m.mu, 1)}″/년</b>입니다. 교과서 값은 10.3″/년입니다. 이 빠르기로 보름달 지름(약 1800″)만큼 가려면 약 ${Math.round(M.MOON_ARCSEC / m.mu)}년이 걸립니다. 고유 운동이 가장 큰 바너드별도 이 정도라서, 고유 운동은 수십 년 간격으로 관측해야 잴 수 있습니다.`;
      } else if (st.snapA !== null && st.snapA === st.snapB) {
        txt = '자의 두 끝이 같은 해의 바너드별에 붙었습니다. 한쪽 끝은 다른 해의 바너드별로 옮겨 보세요.';
      } else if (st.snapA !== null || st.snapB !== null) {
        txt = '한쪽 끝을 맞췄습니다. 다른 해의 사진으로 넘긴 뒤(또는 <b>모두 겹쳐 보기</b>) 나머지 끝을 그 해의 바너드별에 맞추세요.';
      } else {
        txt = `사진을 한 장씩 넘겨 보세요. 주변 별들은 제자리인데 <b>바너드별만 해마다 북쪽(위)으로</b> 조금씩 움직입니다. 주변 별들도 실제로는 움직이지만 대부분 1년에 0.01″도 안 되어 사진에서는 제자리로 보입니다. 자의 양 끝(A·B)을 서로 다른 해의 바너드별에 맞추면 고유 운동을 잴 수 있습니다.`;
      }
      $('s1-insight').innerHTML = txt;
      if (st.calc === 'measured') renderCalc();
    }

    function render() {
      setPressed($('s1-seq'), 'data-seq', st.seq);
      setPressed($('s1-view'), 'data-view', st.view);
      $('s1-years').querySelectorAll('button').forEach((b, i) => b.setAttribute('aria-pressed', String(st.view === 'single' && i === st.idx)));
      drawStars();
      drawDynamic();
      readouts();
      renderCalc();
    }

    // 넘겨 보기 (깜빡이 비교)
    let acc = 0;
    function step(dt) {
      if (current !== 's1' || !st.playing) return false;
      acc += dt;
      const every = reduced() ? 1.4 : 0.8;
      if (acc >= every) { acc = 0; st.idx = (st.idx + 1) % seq().years.length; render(); }
      return true;
    }
    function setPlaying(v) {
      st.playing = v;
      $('s1-play').textContent = v ? '❚❚ 멈춤' : '▶ 넘겨 보기';
      $('s1-play').setAttribute('aria-pressed', String(v));
      if (v) { acc = 0; animate(step); } else stopAnim(step);
    }
    $('s1-play').addEventListener('click', () => {
      if (!st.playing) { st.view = 'single'; render(); }
      setPlaying(!st.playing);
    });
    document.querySelectorAll('#s1-seq [data-seq]').forEach(b => b.addEventListener('click', () => { setPlaying(false); setSequence(b.dataset.seq); starsKey = ''; render(); }));
    document.querySelectorAll('#s1-view [data-view]').forEach(b => b.addEventListener('click', () => { setPlaying(false); st.view = b.dataset.view; render(); }));
    $('s1-fit').addEventListener('click', () => {
      const ys = seq().years;
      setPlaying(false);
      st.view = 'overlay';
      st.a = {...posOf(ys[0])}; st.snapA = ys[0];
      st.b = {...posOf(ys[ys.length - 1])}; st.snapB = ys[ys.length - 1];
      render();
    });

    // ── ② 각에서 속도로 ──
    function base() {
      if (st.calc === 'q1') return {mu: 0.5, r: 10, lo: 2, hi: 40, step: 0.5, name: '활동지 Q1의 별'};
      if (st.calc === 'textbook') return {mu: 10.3, r: 1.83, lo: 0.5, hi: 8, step: 0.01, name: '바너드별'};
      return {mu: st.measured || 10.3, r: 1.83, lo: 0.5, hi: 8, step: 0.01, name: '바너드별', guess: !st.measured};
    }
    const muText = mu => trim(mu, mu < 10 ? 2 : 1);
    function renderCalc() {
      const b = base(), vt = M.round(M.tangentialVelocity(b.mu, b.r), 1);
      const r = st.r, same = Math.abs(r - b.r) < 1e-6;
      const mu = same ? b.mu : M.properMotion(vt, r);
      const sl = $('s1-r');
      sl.min = b.lo; sl.max = b.hi; sl.step = b.step;
      sl.value = r;
      $('s1-r-out').textContent = `${trim(r, 2)} pc${same ? '' : ` (원래의 ${trim(r / b.r, 2)}배)`}`;
      setPressed($('s1-calc'), 'data-calc', st.calc);
      const muS = same ? trim(b.mu, 2) : muText(mu), rS = trim(r, 2);
      const au = M.travelAU(same ? b.mu : mu, r);
      $('s1-derive').innerHTML = `
        <div class="drow"><div class="k">① 1년 동안 간 거리 — 거리 1 pc에서 각 1″ = 길이 1 AU (파섹의 정의)</div>
          <div class="eq">${V('t')} × 1년 ≈ ${it('μr')} = ${muS} × ${rS} ≈ <b>${num(au, 1)} AU</b></div></div>
        <div class="drow"><div class="k">② 단위 바꾸기 — 1 AU ≈ 1.496 × 10⁸ km, 1년 ≈ 3.156 × 10⁷ s</div>
          <div class="eq">1 AU/년 = ${frac('1.496 × 10⁸ km', '3.156 × 10⁷ s')} ≈ <b>4.74 km/s</b></div></div>
        <div class="drow final"><div class="k">③ 접선 속도 (μ : ″/년, r : pc)</div>
          <div class="eq">${V('t')} ≈ 4.74${it('μr')} = 4.74 × ${muS} × ${rS} ≈ <b>${num(same ? M.tangentialVelocity(b.mu, r) : vt, 1)} km/s</b></div></div>`;
      let txt;
      if (same) {
        txt = st.calc === 'q1'
          ? `활동지 Q1: 거리 10 pc, 고유 운동 0.5″/년인 별의 접선 속도는 4.74 × 0.5 × 10 ≈ <b>23.7 km/s</b>입니다. 거리를 20 pc로 옮겨 보세요. 접선 속도가 같으면 고유 운동은 얼마가 될까요?`
          : `${b.guess ? '아직 사진에서 재지 않아 교과서 값 10.3″/년을 썼습니다. ' : ''}바너드별(r = 1.83 pc)은 시선에 수직인 방향으로 초속 약 <b>${Math.round(vt)} km</b>로 움직입니다. 고유 운동은 각일 뿐이라 거리를 알아야 실제 빠르기를 구할 수 있습니다.`;
      } else {
        const ratio = r / b.r;
        txt = `같은 접선 속도(${num(vt, 1)} km/s)로 움직여도 거리가 ${trim(ratio, 2)}배면 고유 운동은 ${trim(1 / ratio, 2)}배인 <b>${muText(mu)}″/년</b>이 됩니다. 접선 속도가 같다면 <b>가까운 별일수록 고유 운동이 크게</b> 나타납니다. 그래서 고유 운동이 큰 별은 대부분 가까운 별입니다.`;
      }
      $('s1-calc-insight').innerHTML = txt;
      drawGeo(b, r, mu);
    }
    function drawGeo(b, r, mu) {
      clear(geo);
      const sm = small(), fs = sm ? 19 : 13;
      const sx = 74, sy = 246, L = 30 + 190 * (r - b.lo) / (b.hi - b.lo), A = 74;  // 화살표 길이는 고정(접선 속도 그대로)
      const tx = sx, ty = sy - L;
      // 천구
      el('path', {d: `M${sx - 50} ${sy - 236}Q${sx + 160} ${sy - 290} ${sx + 330} ${sy - 150}`, stroke: '#c9d3da', 'stroke-width': 1.5, 'stroke-dasharray': '6 6', fill: 'none'}, geo);
      el('text', {x: 410, y: sy - 136, 'text-anchor': 'end', 'font-size': fs, fill: '#9aa9b5', 'font-weight': 700}, geo, '천구');
      // 시선 방향과 1년 뒤의 시선
      el('line', {x1: sx, y1: sy, x2: sx, y2: 10, stroke: '#14283a', 'stroke-width': 1.3}, geo);
      const ang = Math.atan2(A, L), far = 270;
      el('line', {x1: sx, y1: sy, x2: sx + far * Math.sin(ang), y2: sy - far * Math.cos(ang), stroke: '#14283a', 'stroke-width': 1.3}, geo);
      el('text', {x: sx + 8, y: 22, 'font-size': fs - 1, fill: '#5f7282', 'font-weight': 700}, geo, '시선 방향');
      // 각 μ
      const ra = Math.min(48, L * 0.55);
      el('path', {d: `M${sx} ${sy - ra}A${ra} ${ra} 0 0 1 ${sx + ra * Math.sin(ang)} ${sy - ra * Math.cos(ang)}`, stroke: '#c2410c', 'stroke-width': 2.5, fill: 'none'}, geo);
      el('text', {x: sx + (ra + 10) * Math.sin(ang / 2), y: sy - (ra + 10) * Math.cos(ang / 2) + 4, 'font-size': fs + 2, 'font-weight': 800, fill: '#c2410c', 'font-style': 'italic'}, geo, 'μ');
      // 거리 r
      rich(geo, {x: sx - 10, y: sy - L / 2 + 5, 'text-anchor': 'end', 'font-size': fs, 'font-weight': 800}, [['r', {i: 1}]]);
      // 별: 지금 → 1년 뒤
      arrow(geo, tx, ty, tx + A, ty, '#e8962a', 4);
      el('path', {d: `M${tx} ${ty + 10}h10v-10`, stroke: '#c2410c', 'stroke-width': 1.5, fill: 'none'}, geo);
      el('circle', {cx: tx, cy: ty, r: 6, fill: '#f6d7a8', stroke: '#e8962a', 'stroke-width': 1.5}, geo);
      el('circle', {cx: tx + A, cy: ty, r: 6, fill: '#f2a33a'}, geo);
      rich(geo, {x: tx + A / 2, y: ty - 12, 'text-anchor': 'middle', 'font-size': fs, 'font-weight': 800, fill: '#a85a00'}, [['V', {i: 1}], ['t', {i: 1, sub: 1}], [' × 1년']]);
      el('text', {x: tx + A + 12, y: ty + 5, 'font-size': fs - 1, 'font-weight': 700}, geo, '1년 뒤');
      // 태양
      el('circle', {cx: sx, cy: sy, r: 10, fill: '#f6c343', stroke: '#e6a93c', 'stroke-width': 2}, geo);
      el('text', {x: sx + 16, y: sy + 5, 'font-size': fs, 'font-weight': 800}, geo, '태양');
      // 오른쪽 값
      const vx = sm ? 236 : 250;
      el('text', {x: vx, y: 196, 'font-size': fs - 1, fill: '#5f7282', 'font-weight': 700}, geo, '하늘에서 보이는 고유 운동');
      el('text', {x: vx, y: 226, 'font-size': sm ? 30 : 24, 'font-weight': 800, fill: '#c2410c'}, geo, `${muText(mu)}″/년`);
      el('text', {x: vx, y: 250, 'font-size': fs - 2, fill: '#9aa9b5'}, geo, '(그림의 각은 과장해 그림)');
    }
    document.querySelectorAll('#s1-calc [data-calc]').forEach(b => b.addEventListener('click', () => { st.calc = b.dataset.calc; st.r = base().r; renderCalc(); }));
    $('s1-r').addEventListener('input', e => {
      const b = base();
      let r = +e.target.value;
      if (Math.abs(r - b.r) < (b.hi - b.lo) * 0.012) r = b.r;      // 원래 거리 근처에서는 붙는다
      st.r = r; renderCalc();
    });

    setSequence('textbook');
    return {render, leave: () => setPlaying(false)};
  })();

  // ═══════════════ 02 시선 속도 ═══════════════
  stations.s2 = (() => {
    const MODES = {
      free: {lam0: 500.0, lo: 499.4, hi: 500.6, name: '이 별', ref: '정지 상태의 흡수선 (기준)'},
      qa: {lam0: 500.0, lam: 500.5, lo: 499.4, hi: 500.6, name: '별 A', ref: '정지 상태의 흡수선 (기준)'},
      qb: {lam0: 500.0, lam: 499.8, lo: 499.4, hi: 500.6, name: '별 B', ref: '정지 상태의 흡수선 (기준)'},
      barnard: {lam0: 612.22, lam: 612.00, lo: 611.6, hi: 612.6, name: '바너드별', ref: '정지 상태의 흡수선 (태양)'}
    };
    const st = {mode: 'free', vr: -120, cursor: 500, read: true, phase: 0.35};
    const scene = $('s2-scene'), strip = $('s2-strip'), zoom = $('s2-zoom');
    const mode = () => MODES[st.mode];
    const lamObs = () => st.mode === 'free' ? M.observedWavelength(st.vr, 500) : mode().lam;
    const trueVr = () => M.radialVelocity(lamObs(), mode().lam0);
    const col = vr => vr < -1e-9 ? '#3d6fe0' : vr > 1e-9 ? '#c2410c' : '#14283a';

    document.querySelectorAll('#s2-modes [data-mode]').forEach(b => b.addEventListener('click', () => {
      st.mode = b.dataset.mode;
      if (st.mode === 'free') { st.read = true; st.cursor = lamObs(); }
      else { st.read = false; st.cursor = mode().lam0 + (mode().hi - mode().lam0) * 0.55; }
      render();
    }));
    $('s2-vr').addEventListener('input', e => { st.vr = +e.target.value; st.cursor = lamObs(); render(); });

    // ── 확대 그래프 ──
    const zb = {l: 64, r: 620, t: 26, b: 236};
    let xs = lin(499.4, 500.6, zb.l, zb.r);
    onDrag(zoom, p => {
      if (!p || p.x < zb.l - 16 || p.x > zb.r + 16) return;
      let lam = xs.inv(Math.max(zb.l, Math.min(zb.r, p.x)));
      if (st.mode === 'free') {            // 자유 실험: 흡수선을 끌면 시선 속도가 바뀐다
        const vr = Math.max(-300, Math.min(300, Math.round(M.radialVelocity(lam, 500) / 30) * 30));
        if (vr !== st.vr) { st.vr = vr; render(); }
        return;
      }
      const tol = Math.abs(xs.inv(zb.l + (small() ? 26 : 14)) - xs.inv(zb.l)), obs = lamObs();
      if (Math.abs(lam - obs) < tol) { lam = obs; st.read = true; } else st.read = false;
      st.cursor = lam;
      renderZoom(); renderFormula(); renderScene();
    });
    function renderZoom() {
      clear(zoom);
      const sm = small(), md = mode();
      zoom.setAttribute('viewBox', `0 0 640 ${sm ? 400 : 300}`);
      zb.b = sm ? 312 : 236; zb.l = sm ? 92 : 64; zb.t = sm ? 40 : 26; zb.r = sm ? 596 : 620;
      xs = lin(md.lo, md.hi, zb.l, zb.r);
      const ys = lin(0, 1.12, zb.b, zb.t);
      const g = el('g', {class: 'axis'}, zoom);
      for (let i = 0; i <= 24; i++) {
        const lam = md.lo + i * 0.05, x = xs(lam), major = i % 2 === 0;
        el('line', {x1: x, x2: x, y1: zb.t, y2: zb.b, stroke: major ? '#e1e7ea' : '#f1f4f5', 'stroke-width': 1}, g);
        if (i % 4 === 0) el('text', {x, y: zb.b + (sm ? 28 : 18), 'text-anchor': 'middle', class: 'tick'}, g, lam.toFixed(1));
      }
      [0, 0.5, 1].forEach(v => {
        el('line', {x1: zb.l, x2: zb.r, y1: ys(v), y2: ys(v), class: 'grid-line'}, g);
        el('text', {x: zb.l - 8, y: ys(v) + 4, 'text-anchor': 'end', class: 'tick'}, g, v.toFixed(1));
      });
      el('line', {x1: zb.l, x2: zb.l, y1: zb.t, y2: zb.b, 'stroke-width': 1.2}, g);
      el('line', {x1: zb.l, x2: zb.r, y1: zb.b, y2: zb.b, 'stroke-width': 1.2}, g);
      el('text', {x: (zb.l + zb.r) / 2, y: zb.b + (sm ? 58 : 40), 'text-anchor': 'middle', class: 'axis-label'}, g, '파장 (nm)');
      el('text', {x: 16, y: (zb.t + zb.b) / 2, transform: `rotate(-90 16 ${(zb.t + zb.b) / 2})`, 'text-anchor': 'middle', class: 'axis-label'}, g, '빛의 세기');
      const curve = (c, attrs) => {
        const pts = [];
        for (let i = 0; i <= 300; i++) { const lam = md.lo + (md.hi - md.lo) * i / 300; pts.push(`${xs(lam).toFixed(1)},${ys(M.lineProfile(lam, c)).toFixed(1)}`); }
        el('polyline', Object.assign({points: pts.join(' '), fill: 'none'}, attrs), zoom);
      };
      const obs = lamObs(), vr = trueVr();
      curve(md.lam0, {stroke: '#7d8b96', 'stroke-width': 2.5, 'stroke-dasharray': '9 6'});
      curve(obs, {stroke: col(vr), 'stroke-width': 3.2});
      // 기준 파장 표시
      const x0 = xs(md.lam0);
      el('line', {x1: x0, x2: x0, y1: ys(0.38), y2: zb.b, stroke: '#7d8b96', 'stroke-width': 1, 'stroke-dasharray': '3 3'}, zoom);
      rich(zoom, {x: x0 + (obs < md.lam0 ? 6 : -6), y: zb.b - 8, 'text-anchor': obs < md.lam0 ? 'start' : 'end', class: 'annot halo', fill: '#5f7282'}, [['λ', {i: 1}], ['0', {sub: 1}]]);
      // 범례
      $('s2-legend').innerHTML = `<span><i class="dash" style="border-top-color:#7d8b96"></i>${md.ref}</span><span style="color:${col(vr)};font-weight:700"><i style="border-top-color:${col(vr)}"></i>${md.name}의 흡수선 (관측)</span>`;
      // 커서
      const cx = xs(st.cursor), on = st.read;
      const c = on ? '#0b7f9a' : '#14283a';
      el('line', {x1: cx, x2: cx, y1: zb.t - 6, y2: zb.b, stroke: c, 'stroke-width': sm ? 3 : 2}, zoom);
      const tag = `λ = ${st.cursor.toFixed(2)} nm`, tw = (sm ? 15 : 9.2) * tag.length;
      const tx = Math.max(zb.l, Math.min(zb.r - tw, cx - tw / 2));
      el('rect', {x: tx, y: zb.t - (sm ? 36 : 24), width: tw, height: sm ? 30 : 20, rx: 6, fill: c}, zoom);
      el('text', {x: tx + tw / 2, y: zb.t - (sm ? 15 : 9.5), 'text-anchor': 'middle', 'font-size': sm ? 19 : 12, 'font-weight': 800, fill: '#fff'}, zoom, tag);
      $('s2-l0').textContent = `${md.lam0.toFixed(2)} nm`;
      $('s2-l').textContent = `${st.cursor.toFixed(2)} nm${on ? '' : ' (흡수선 밖)'}`;
      $('s2-vr-read').textContent = on ? `${st.mode === 'barnard' ? '≈ ' : ''}${sgn(M.radialVelocity(st.cursor, md.lam0), 0)} km/s` : '?';
      $('s2-zoom-tip').textContent = st.mode === 'free' ? '그래프를 끌면 흡수선이 움직입니다' : '그래프를 누르거나 끌어 관측 파장 읽기 (흡수선 가운데에 붙음)';
    }

    // ── 스펙트럼 띠 (이동 폭 20배 과장) ──
    const EX = 20;
    function renderStrip() {
      clear(strip);
      const sm = small(), fs = sm ? 21 : 12;
      strip.setAttribute('viewBox', `0 0 640 ${sm ? 236 : 176}`);
      const x = lin(400, 700, 16, 624);
      const defs = el('defs', {}, strip), gr = el('linearGradient', {id: 's2-rainbow', x1: 0, x2: 1}, defs);
      [[0, '#5B2C9F'], [0.15, '#3D4BE0'], [0.32, '#2FA3E0'], [0.47, '#3CC36A'], [0.62, '#E9E33C'], [0.78, '#F29A2E'], [1, '#D32F2F']]
        .forEach(([o, c]) => el('stop', {offset: o, 'stop-color': c}, gr));
      const vr = trueVr();
      const rows = [{y: sm ? 30 : 20, label: '기준 스펙트럼 (정지 상태)', shift: 0},
                    {y: sm ? 112 : 86, label: `${mode().name}의 스펙트럼`, shift: vr}];
      const h = sm ? 44 : 38;
      rows.forEach((r, i) => {
        el('text', {x: 16, y: r.y - 6, 'font-size': fs, 'font-weight': 700, fill: i ? col(vr) : '#5f7282'}, strip, r.label);
        el('rect', {x: 16, y: r.y, width: 608, height: h, rx: 4, fill: 'url(#s2-rainbow)'}, strip);
        M.SPECTRUM_LINES.forEach(l => {
          const lx = x(l * (1 + EX * r.shift / M.C_KMS));
          if (lx > 17 && lx < 623) el('rect', {x: (lx - 2.2).toFixed(1), y: r.y, width: 4.4, height: h, fill: '#0b0f1a'}, strip);
        });
      });
      // 기준 자리 점선과 이동 화살표
      const y1 = rows[0].y, y2 = rows[1].y + h;
      M.SPECTRUM_LINES.forEach(l => {
        const x0 = x(l), x1 = x(l * (1 + EX * vr / M.C_KMS));
        el('line', {x1: x0, x2: x0, y1, y2, stroke: '#ffffff', 'stroke-width': 1.2, 'stroke-dasharray': '4 4', opacity: 0.8}, strip);
        if (Math.abs(x1 - x0) > 4) arrow(strip, x0, y2 + 9, x1, y2 + 9, col(vr), 2.5, {head: 7});
      });
      const ty = sm ? 228 : 170;
      el('text', {x: 16, y: ty, 'font-size': fs - 1, fill: '#5f7282'}, strip, '← 파장이 짧다 (파란색 쪽)');
      el('text', {x: 624, y: ty, 'text-anchor': 'end', 'font-size': fs - 1, fill: '#5f7282'}, strip, '파장이 길다 (붉은색 쪽) →');
    }

    // ── 도플러 장면 ──
    function renderScene() {
      clear(scene);
      const sm = small(), md = mode();
      scene.setAttribute('viewBox', `0 0 640 ${sm ? 300 : 250}`);
      const Hh = sm ? 300 : 250, cy = Hh / 2 + (sm ? 6 : 4), ox = 46, sx = 400;
      const known = st.mode === 'free' || st.read;
      const vr = known ? trueVr() : 0;
      const beta = Math.max(-0.5, Math.min(0.5, vr / 300 * 0.42));
      const lam = 36, ph = st.phase;
      const g = el('g', {}, scene);
      if (known) {
        for (let kk = 0; kk < 9; kk++) {
          const rad = (kk + ph) * lam, ccx = sx - beta * rad;
          el('circle', {cx: ccx.toFixed(1), cy, r: rad.toFixed(1), fill: 'none', stroke: '#cfe0f0', 'stroke-width': 1.6, opacity: (0.55 - kk * 0.05).toFixed(2)}, g);
        }
        // 관측자 쪽으로 오는 빛
        const lamL = lam * (1 + beta), pts = [], x0 = sx - 18, x1 = ox + 18;
        for (let x = x1; x <= x0; x += 2) {
          const s = (x0 - x) / lamL + ph;
          pts.push(`${x.toFixed(1)},${(cy + 9 * Math.sin(2 * Math.PI * s)).toFixed(1)}`);
        }
        const wc = beta < -0.005 ? '#7fa6ff' : beta > 0.005 ? '#ff8a66' : '#f4e7a1';
        el('polyline', {points: pts.join(' '), fill: 'none', stroke: wc, 'stroke-width': 3}, scene);
      } else {
        el('text', {x: sx, y: cy - 60, 'text-anchor': 'middle', 'font-size': sm ? 21 : 14, 'font-weight': 700, fill: '#ffe08a'}, scene, '이 별은 다가올까, 멀어질까?');
        el('text', {x: sx, y: cy + 74, 'text-anchor': 'middle', 'font-size': sm ? 19 : 12.5, fill: '#cfe0f0'}, scene, '흡수선 확대 그래프에서 관측 파장을 읽어 보세요');
      }
      // 별
      el('circle', {cx: sx, cy, r: 26, fill: '#ffcf73', opacity: 0.18}, scene);
      el('circle', {cx: sx, cy, r: 13, fill: '#ffd27a', stroke: '#fff3c8', 'stroke-width': 2}, scene);
      el('text', {x: sx, y: cy + (sm ? 48 : 40), 'text-anchor': 'middle', 'font-size': sm ? 20 : 13, 'font-weight': 700}, scene, md.name === '이 별' ? '별' : md.name);
      if (known && Math.abs(vr) > 1e-6) {
        const L = Math.min(150, 20 + Math.abs(vr) * 0.42), dir = vr < 0 ? -1 : 1;
        arrow(scene, sx + dir * 18, cy - 34, sx + dir * (18 + L), cy - 34, '#ffffff', 4);
        rich(scene, {x: sx + dir * (18 + L / 2), y: cy - 46, 'text-anchor': 'middle', 'font-size': sm ? 20 : 13, 'font-weight': 800, fill: '#ffffff'},
          [['V', {i: 1}], ['r', {i: 1, sub: 1}], [` = ${sgn(vr, 0)} km/s`]]);
      }
      // 관측자
      el('circle', {cx: ox, cy, r: 11, fill: '#3d6fe0', stroke: '#bcd0ff', 'stroke-width': 2}, scene);
      el('text', {x: ox, y: cy + (sm ? 42 : 34), 'text-anchor': 'middle', 'font-size': sm ? 20 : 13, 'font-weight': 700}, scene, '관측자');
      if (known && Math.abs(beta) > 0.005) {
        const near = vr < 0, fs = sm ? 19 : 12.5;
        el('text', {x: 18, y: 26, 'font-size': fs, 'font-weight': 800, fill: near ? '#9fbcff' : '#ffab8f'}, scene, near ? '관측자 쪽 파장이 짧아진다 → 청색 편이' : '관측자 쪽 파장이 길어진다 → 적색 편이');
      }
      $('s2-motion').textContent = !known ? '관측 파장을 읽기 전' : Math.abs(vr) < 1e-6 ? '시선 방향으로는 움직이지 않음' : vr < 0 ? '관측자에게 다가오는 중 ←' : '관측자에게서 멀어지는 중 →';
    }

    function renderFormula() {
      const md = mode(), on = st.read;
      const top = `<span class="line big">${frac(V('r'), it('c'))} = ${frac(`${it('λ')} − ${it('λ')}₀`, `${it('λ')}₀`)} &nbsp;➜&nbsp; ${V('r')} = ${it('c')} × ${frac(`${it('λ')} − ${it('λ')}₀`, `${it('λ')}₀`)}</span>`;
      let body;
      if (!on) {
        body = `<span class="line">${V('r')} = 3 × 10⁵ × ${frac(`${it('λ')} − ${md.lam0.toFixed(2)}`, md.lam0.toFixed(2))} = ?</span><span class="line wait">그래프에서 관측 파장 λ를 읽으면 계산됩니다.</span>`;
      } else {
        const lam = st.cursor, vr = M.radialVelocity(lam, md.lam0), cls = vr < 0 ? 'near' : vr > 0 ? 'far' : '';
        const exact = Math.abs(vr - Math.round(vr)) < 1e-6;
        const res = exact ? `<b class="result ${cls}">${sgn(vr, 0)} km/s</b>` : `${sgn(vr, 1)} ≈ <b class="result ${cls}">${sgn(vr, 0)} km/s</b>`;
        const rel = Math.abs(vr) < 1e-6 ? `${it('λ')} = ${it('λ')}₀ → ${V('r')} = 0 → <b>편이 없음</b>` :
          vr > 0 ? `${it('λ')} &gt; ${it('λ')}₀ → ${V('r')} &gt; 0 → <b class="far">멀어진다 (적색 편이)</b>` : `${it('λ')} &lt; ${it('λ')}₀ → ${V('r')} &lt; 0 → <b class="near">다가온다 (청색 편이)</b>`;
        body = `<span class="line">${V('r')} = 3 × 10⁵ × ${frac(`${lam.toFixed(2)} − ${md.lam0.toFixed(2)}`, md.lam0.toFixed(2))} = ${res}</span><span class="line">${rel}</span>`;
      }
      $('s2-formula').innerHTML = top + body;
      let txt;
      if (!on) txt = `점선은 정지 상태의 흡수선 파장 λ₀(기출의 「기준 파장」), 실선은 ${md.name}에서 관측한 흡수선입니다. 흡수선 가운데(가장 어두운 곳)에 커서를 맞춰 관측 파장 λ를 읽어 보세요.`;
      else {
        const vr = M.radialVelocity(st.cursor, md.lam0);
        if (st.mode === 'free') {
          txt = Math.abs(vr) < 1e-6
            ? '시선 방향으로 움직이지 않으면 흡수선이 밀리지 않습니다. 이런 별도 시선에 수직인 방향(접선 방향)으로는 움직이고 있을 수 있습니다.'
            : `별이 초속 ${Math.abs(Math.round(vr))} km로 ${vr < 0 ? '다가오고' : '멀어지고'} 있어 흡수선이 파장이 ${vr < 0 ? '짧은 쪽(<b class="near">청색 편이</b>)' : '긴 쪽(<b class="far">적색 편이</b>)'}으로 밀렸습니다. 흡수선이 많이 밀릴수록 시선 속도가 큽니다.`;
          txt += ' 시선 속도는 <b>별까지의 거리를 몰라도</b> 스펙트럼만으로 구할 수 있습니다.';
        } else if (st.mode === 'barnard') {
          txt = `흡수선이 파장이 짧은 쪽으로 밀렸습니다 → <b class="near">청색 편이</b> → 바너드별은 태양 쪽으로 <b>다가옵니다</b>. 그래프에서 읽은 값(≈ ${sgn(vr, 0)} km/s)은 교과서 69쪽 표의 시선 속도 −110.5 km/s와 거의 같습니다. 눈금으로 읽은 값이라 조금 다릅니다.`;
        } else {
          txt = vr > 0
            ? `관측 파장이 기준 파장보다 깁니다(λ &gt; λ₀). <b class="far">적색 편이</b>가 나타난 ${md.name}는 초속 ${Math.round(vr)} km로 멀어집니다.`
            : `관측 파장이 기준 파장보다 짧습니다(λ &lt; λ₀). <b class="near">청색 편이</b>가 나타난 ${md.name}는 초속 ${Math.abs(Math.round(vr))} km로 다가옵니다.`;
          txt += ' 부호가 곧 방향입니다: ＋ 멀어짐, − 다가옴.';
        }
      }
      $('s2-insight').innerHTML = txt;
    }

    function render() {
      setPressed($('s2-modes'), 'data-mode', st.mode);
      $('s2-control').hidden = st.mode !== 'free';
      $('s2-vr').value = st.vr;
      $('s2-vr-out').textContent = `${sgn(st.vr, 0)} km/s`;
      if (st.mode === 'free') { st.cursor = lamObs(); st.read = true; }
      renderScene(); renderStrip(); renderZoom(); renderFormula();
    }
    function tick(dt) {
      if (current !== 's2' || reduced()) return false;
      st.phase = (st.phase + dt / 1.1) % 1;
      renderScene();
      return true;
    }
    return {render, enter: () => { if (!reduced()) animate(tick); }, leave: () => stopAnim(tick)};
  })();

  // ═══════════════ 03 공간 속도 ═══════════════
  stations.s3 = (() => {
    const COL = {v: '#14283a', vt: '#e8962a', vtT: '#a85a00', near: '#3d6fe0', far: '#c2410c'};
    $('s3-legend').innerHTML = `<span><i style="border-top-color:${COL.v}"></i>공간 속도 V</span><span><i style="border-top-color:${COL.vt}"></i>접선 속도 V<sub>t</sub></span>` +
      `<span><i style="border-top-color:${COL.near}"></i>시선 속도 (다가옴)</span><span><i style="border-top-color:${COL.far}"></i>시선 속도 (멀어짐)</span>`;
    const plane = $('s3-plane');
    // 네 별의 자리 (활동지 그림처럼 오른쪽·왼쪽·위·왼쪽 아래). 휴대폰에서는 조금 안쪽으로.
    const FOUR = () => { const R = small() ? 140 : 200; return [{x: R, y: 0}, {x: -R, y: 0}, {x: 0, y: -0.8 * R}, {x: -0.6 * R, y: 0.6 * R}]; };
    const st = {mode: 'one', star: {x: 130, y: -35}, v: {x: 55, y: -85}, v4: {x: 100, y: 0}};
    let sun = {x: 320, y: 220};
    const stars = () => st.mode === 'one' ? [st.star] : FOUR();
    const vel = () => st.mode === 'one' ? st.v : st.v4;
    const hr = () => small() ? 40 : 24;

    dragHandles(plane, p => {
      const v = vel();
      let best = null, bd = hr();
      stars().forEach((s, i) => {
        const tx = sun.x + s.x + v.x, ty = sun.y + s.y + v.y;
        const d = Math.hypot(p.x - tx, p.y - ty);
        if (d < bd) { bd = d; best = 'tip' + i; }
      });
      if (best) return best;
      if (st.mode === 'one') {
        const d = Math.hypot(p.x - sun.x - st.star.x, p.y - sun.y - st.star.y);
        if (d < hr()) return 'star';
      }
      return null;
    }, (h, p) => {
      if (h === 'star') {
        let x = Math.max(-sun.x + 20, Math.min(planeW() - sun.x - 20, p.x - sun.x)), y = Math.max(-sun.y + 20, Math.min(planeH() - sun.y - 20, p.y - sun.y));
        const d = Math.hypot(x, y);
        if (d < 60) { x = x / (d || 1) * 60; y = y / (d || 1) * 60; }
        st.star = {x, y};
      } else {
        const i = +h.slice(3), s = stars()[i];
        let vx = p.x - sun.x - s.x, vy = p.y - sun.y - s.y;
        const L = Math.hypot(vx, vy);
        if (L > 170) { vx *= 170 / L; vy *= 170 / L; }
        // 시선 방향과 나란하거나 수직일 때 살짝 붙는다(시선 속도 0, 접선 속도 0을 만들기 쉽게)
        const d = Math.hypot(s.x, s.y), ux = s.x / d, uy = s.y / d, vr = vx * ux + vy * uy, vt = -vx * uy + vy * ux;
        if (Math.abs(vr) < 5) { vx -= vr * ux; vy -= vr * uy; }
        else if (Math.abs(vt) < 5) { vx += vt * uy; vy -= vt * ux; }
        // 화살표 끝이 그림 밖으로 나가지 않게 (네 별 모두)
        let k = 1;
        for (const q of stars()) {
          const bx = sun.x + q.x, by = sun.y + q.y;
          if (bx + vx * k > planeW() - 8) k = Math.min(k, (planeW() - 8 - bx) / vx);
          if (bx + vx * k < 8) k = Math.min(k, (8 - bx) / vx);
          if (by + vy * k > planeH() - 8) k = Math.min(k, (planeH() - 8 - by) / vy);
          if (by + vy * k < 8) k = Math.min(k, (8 - by) / vy);
        }
        k = Math.max(0, k); vx *= k; vy *= k;
        if (st.mode === 'one') st.v = {x: vx, y: vy}; else st.v4 = {x: vx, y: vy};
      }
      renderPlane();
    });
    const planeH = () => small() ? 480 : 440, planeW = () => small() ? 520 : 640;
    document.querySelectorAll('#s3-mode [data-mode]').forEach(b => b.addEventListener('click', () => { st.mode = b.dataset.mode; renderPlane(); }));

    function renderPlane() {
      clear(plane);
      setPressed($('s3-mode'), 'data-mode', st.mode);
      const sm = small(), Hh = planeH(), Ww = planeW(), fs = sm ? 19 : 13;
      plane.setAttribute('viewBox', `0 0 ${Ww} ${Hh}`);
      sun = {x: Ww / 2, y: Hh / 2};
      const G = 40, g = el('g', {}, plane);
      for (let x = sun.x % G; x <= Ww; x += G) el('line', {x1: x, x2: x, y1: 0, y2: Hh, stroke: Math.abs(x - sun.x) < 1 ? '#d5dde2' : '#eef2f4', 'stroke-width': 1}, g);
      for (let y = sun.y % G; y <= Hh; y += G) el('line', {x1: 0, x2: Ww, y1: y, y2: y, stroke: Math.abs(y - sun.y) < 1 ? '#d5dde2' : '#eef2f4', 'stroke-width': 1}, g);
      el('text', {x: Ww - 8, y: Hh - 10, 'text-anchor': 'end', 'font-size': sm ? 14 : 11, fill: '#8a9aa6'}, plane, sm ? '화살표: 모눈 1칸 = 40 km/s' : '위에서 내려다본 한 평면 · 화살표는 모눈 1칸 = 40 km/s');
      const v = vel(), res = [];
      stars().forEach((s, i) => {
        const x = sun.x + s.x, y = sun.y + s.y, d = M.decompose(s.x, s.y, v.x, v.y);
        res.push(d);
        // 시선 방향 (태양과 별을 잇는 선)
        el('line', {x1: sun.x, y1: sun.y, x2: x + d.ux * 80, y2: y + d.uy * 80, stroke: '#9aa9b5', 'stroke-width': 1.6, 'stroke-dasharray': '7 6'}, plane);
        if (st.mode === 'one') {
          // 태양과 별 사이 선을 따라 '시선 방향'이라고 눕혀 쓴다
          let ang = Math.atan2(d.uy, d.ux) * 180 / Math.PI;
          if (ang > 90) ang -= 180; else if (ang < -90) ang += 180;
          // 시선 속도 화살표와 겹치지 않게: 다가오면(화살표가 태양 쪽) 별 바깥쪽 연장선에, 멀어지면 태양 쪽에
          const nx = Math.sin(ang * Math.PI / 180), ny = -Math.cos(ang * Math.PI / 180);
          const along = d.vr < 0 ? 1 + 62 / Math.hypot(s.x, s.y) : 0.42;
          const mx = sun.x + s.x * along + nx * 9, my = sun.y + s.y * along + ny * 9;
          el('text', {x: mx, y: my, transform: `rotate(${ang.toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)})`, 'text-anchor': 'middle', 'font-size': sm ? 15 : 12, fill: '#7d8b96', 'font-weight': 700, class: 'halo'}, plane, '시선 방향');
        }
        // 평행사변형 보조선
        if (d.vt > 2 && Math.abs(d.vr) > 2) {
          el('path', {d: `M${x + d.tx} ${y + d.ty}L${x + v.x} ${y + v.y}L${x + d.rx} ${y + d.ry}`, stroke: '#a7b4bf', 'stroke-width': 1.4, 'stroke-dasharray': '5 5', fill: 'none'}, plane);
          // 직각 표시
          const q = 10, ax = d.ux * q, ay = d.uy * q, bx = d.tx / d.vt * q, by = d.ty / d.vt * q;
          const sr = Math.sign(d.vr);
          el('path', {d: `M${x + ax * sr} ${y + ay * sr}L${x + ax * sr + bx} ${y + ay * sr + by}L${x + bx} ${y + by}`, stroke: '#7d8b96', 'stroke-width': 1.2, fill: 'none'}, plane);
        }
        const w = sm ? 5.5 : 4.5;
        arrow(plane, x, y, x + v.x, y + v.y, COL.v, w + 2.5, {head: 9 + w * 2.2});
        if (d.vt > 1.5) arrow(plane, x, y, x + d.tx, y + d.ty, COL.vt, w);
        if (Math.abs(d.vr) > 1.5) arrow(plane, x, y, x + d.rx, y + d.ry, d.vr < 0 ? COL.near : COL.far, w);
        // θ (한 별일 때만)
        if (st.mode === 'one' && d.v > 20) {
          const r = 30, a0 = Math.atan2(d.uy, d.ux), a1 = Math.atan2(v.y, v.x);
          let da = a1 - a0; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
          const ex = x + r * Math.cos(a0 + da), ey = y + r * Math.sin(a0 + da);
          el('path', {d: `M${x + r * Math.cos(a0)} ${y + r * Math.sin(a0)}A${r} ${r} 0 0 ${da > 0 ? 1 : 0} ${ex} ${ey}`, stroke: '#0b7f9a', 'stroke-width': 2, fill: 'none'}, plane);
          const am = a0 + da / 2;
          el('text', {x: x + (r + 13) * Math.cos(am), y: y + (r + 13) * Math.sin(am) + 5, 'text-anchor': 'middle', 'font-size': fs + 1, 'font-weight': 800, fill: '#0b7f9a', 'font-style': 'italic', class: 'halo'}, plane, 'θ');
        }
        // 별과 손잡이
        el('circle', {cx: x, cy: y, r: sm ? 10 : 7.5, fill: '#f2a33a', stroke: '#fff', 'stroke-width': 2}, plane);
        if (st.mode === 'one') el('circle', {cx: x, cy: y, r: sm ? 18 : 13, fill: 'none', stroke: '#f2a33a', 'stroke-width': 1.5, 'stroke-dasharray': '3 3'}, plane);
        const tx = x + v.x, ty = y + v.y;
        el('circle', {cx: tx, cy: ty, r: sm ? 13 : 9, fill: '#fff', 'fill-opacity': 0.85, stroke: '#0b7f9a', 'stroke-width': 2.2, class: 'handle'}, plane);
        // 화살표 이름
        const tag = (dx, dy, len, parts, color) => {
          if (len < 14) return;
          const ux = dx / len, uy = dy / len;
          rich(plane, {x: x + dx + ux * 18, y: y + dy + uy * 18 + 5, 'text-anchor': ux < -0.35 ? 'end' : ux > 0.35 ? 'start' : 'middle', 'font-size': fs, 'font-weight': 800, fill: color, class: 'halo'}, parts);
        };
        if (st.mode === 'one') {
          tag(v.x, v.y, d.v, [['V', {i: 1}]], COL.v);
          tag(d.tx, d.ty, d.vt, [['V', {i: 1}], ['t', {i: 1, sub: 1}]], COL.vtT);
          tag(d.rx, d.ry, Math.abs(d.vr), [['V', {i: 1}], ['r', {i: 1, sub: 1}]], d.vr < 0 ? COL.near : COL.far);
        } else {
          const word = Math.abs(d.vr) < 3 ? '시선 속도 0 · 편이 없음' : d.vt < 3 ? (d.vr < 0 ? '다가옴 · 청색 편이' : '멀어짐 · 적색 편이') : (d.vr < 0 ? '다가오며 옆으로' : '멀어지며 옆으로');
          const c = Math.abs(d.vr) < 3 ? COL.vtT : d.vr < 0 ? COL.near : COL.far;
          el('text', {x, y: y + (i === 2 ? -24 : 32) * (sm ? 1.15 : 1), 'text-anchor': 'middle', 'font-size': sm ? 15 : 12.5, 'font-weight': 800, fill: c, class: 'halo'}, plane, word);
        }
      });
      // 태양
      el('circle', {cx: sun.x, cy: sun.y, r: sm ? 17 : 13, fill: '#f6c343', stroke: '#e6a93c', 'stroke-width': 2}, plane);
      el('text', {x: sun.x, y: sun.y + (sm ? 42 : 32), 'text-anchor': 'middle', 'font-size': fs, 'font-weight': 800, class: 'halo'}, plane, '태양');
      // 읽은 값
      const ro = $('s3-readout');
      ro.hidden = st.mode !== 'one';
      if (st.mode === 'one') {
        const d = res[0], k = 1;
        $('s3-vr').innerHTML = `${sgn(d.vr * k, 0)} km/s <small class="micro">${Math.abs(d.vr) < 1 ? '편이 없음' : d.vr < 0 ? '다가옴 · 청색 편이' : '멀어짐 · 적색 편이'}</small>`;
        $('s3-vt').textContent = `${num(d.vt, 0)} km/s`;
        $('s3-v').textContent = `${num(d.v, 0)} km/s`;
        $('s3-th').textContent = `${num(d.theta, 0)}°`;
        let txt = `시선 방향(태양과 별을 잇는 선)과 공간 속도가 이루는 각은 θ = ${num(d.theta, 0)}°(tan θ = ${frac(V('t'), V('r'))})이고, 공간 속도는 ${it('V')} = <span class="sqrt">√<span>${V('t')}² + ${V('r')}²</span></span> = ${num(d.v, 0)} km/s입니다. `;
        if (Math.abs(d.vr) < 1) txt += '공간 속도가 시선 방향에 수직이라 <b>시선 속도가 0</b>입니다. 스펙트럼에 편이가 없고 하늘에서만 움직입니다.';
        else if (d.vt < 1) txt += '공간 속도가 시선 방향과 나란해 <b>접선 속도가 0</b>입니다. 고유 운동이 0이라 하늘에서는 제자리이고, 스펙트럼으로만 움직임을 알 수 있습니다.';
        else txt += `공간 속도 화살표에서 접선 속도 화살표를 빼면 시선 속도 화살표가 남습니다. 이 화살표가 태양 ${d.vr < 0 ? '쪽' : '반대쪽'}을 향하므로 ${d.vr < 0 ? '<b class="near">다가옵니다</b> (청색 편이, V<sub>r</sub> &lt; 0, θ &gt; 90°)' : '<b class="far">멀어집니다</b> (적색 편이, V<sub>r</sub> &gt; 0, θ &lt; 90°)'}.`;
        $('s3-insight').innerHTML = txt;
        $('s3-plane-tip').textContent = '별과 화살표 끝(○)을 끌어 보세요';
      } else {
        const sp = num(Math.hypot(v.x, v.y), 0);
        $('s3-insight').innerHTML = `네 별의 공간 속도는 방향도 빠르기(${sp} km/s)도 모두 같습니다. 그런데 시선 방향은 관측자와 별을 잇는 선이라 별마다 다릅니다. 그래서 <b>같은 운동도 별의 위치에 따라 시선 속도와 접선 속도가 다르게</b> 나뉩니다. 시선 속도 화살표가 태양 쪽이면 다가오고(청색 편이), 반대쪽이면 멀어집니다(적색 편이).`;
        $('s3-plane-tip').textContent = '화살표 끝(○) 하나를 끌면 네 별이 함께 바뀝니다';
      }
    }

    // ── 기출형 연습 ──
    const quiz = $('s3-quiz'), opts = $('s3-opts');
    const qz = {seed: 13, q: null, picked: null, score: [0, 0]};
    let fit = {s: 1, ox: 0, oy: 0};
    function newQuiz(first) {
      if (!first) qz.seed = Math.floor(Math.random() * 1e9) + 1;
      qz.q = M.makeQuiz(qz.seed); qz.picked = null;
      renderQuiz();
    }
    // 태양을 원점에 두고 별·화살표 끝이 모두 들어오도록 크기와 자리를 맞춘다.
    function quizGeom() {
      const q = qz.q, D0 = 125, sx = q.u[0] * D0, sy = q.u[1] * D0;
      const pts = [[0, 0], [sx, sy], [sx + q.V[0], sy + q.V[1]], [sx + q.Vt[0], sy + q.Vt[1]], [sx + q.Vr[0], sy + q.Vr[1]]];
      const xs0 = pts.map(p => p[0]), ys0 = pts.map(p => p[1]);
      const x0 = Math.min(...xs0), x1 = Math.max(...xs0), y0 = Math.min(...ys0), y1 = Math.max(...ys0);
      const s = Math.min((420 - 150) / Math.max(1, x1 - x0), (300 - 100) / Math.max(1, y1 - y0), 1.35);
      fit = {s, ox: 210 - (x0 + x1) / 2 * s, oy: 150 - (y0 + y1) / 2 * s};
      return {star: {x: fit.ox + sx * s, y: fit.oy + sy * s}, sunP: {x: fit.ox, y: fit.oy}};
    }
    function renderQuiz() {
      clear(quiz);
      const q = qz.q, {star, sunP} = quizGeom(), sm = small(), fs = sm ? 20 : 13, done = qz.picked !== null;
      el('line', {x1: sunP.x - q.u[0] * 30, y1: sunP.y - q.u[1] * 30, x2: star.x + q.u[0] * 400, y2: star.y + q.u[1] * 400, stroke: '#9aa9b5', 'stroke-width': 1.6, 'stroke-dasharray': '7 6'}, quiz);
      el('circle', {cx: sunP.x, cy: sunP.y, r: 12, fill: '#f6c343', stroke: '#e6a93c', 'stroke-width': 2}, quiz);
      el('text', {x: sunP.x - q.u[0] * 26, y: sunP.y - q.u[1] * 26 + 5 + (Math.abs(q.u[0]) > 0.7 ? 22 : 0), 'text-anchor': 'middle', 'font-size': fs, 'font-weight': 800, class: 'halo'}, quiz, '태양');
      const P = vec => ({x: star.x + vec[0] * fit.s, y: star.y + vec[1] * fit.s});
      if (done) {
        const a = P(q.Vt), b = P(q.V), c2 = P(q.Vr);
        el('path', {d: `M${a.x} ${a.y}L${b.x} ${b.y}L${c2.x} ${c2.y}`, stroke: '#a7b4bf', 'stroke-width': 1.4, 'stroke-dasharray': '5 5', fill: 'none'}, quiz);
      }
      const w = sm ? 5.5 : 4.5;
      const t = P(q.Vt), v = P(q.V);
      arrow(quiz, star.x, star.y, t.x, t.y, COL.vt, w);
      arrow(quiz, star.x, star.y, v.x, v.y, COL.v, w - 0.5);
      if (done) {
        const r = P(q.Vr);
        arrow(quiz, star.x, star.y, r.x, r.y, q.vr < 0 ? COL.near : COL.far, w);
        const nx = -q.t[0], ny = -q.t[1], mx = (star.x + r.x) / 2 + nx * 22, my = (star.y + r.y) / 2 + ny * 22;
        el('text', {x: mx, y: my + 5, 'text-anchor': nx < -0.3 ? 'end' : nx > 0.3 ? 'start' : 'middle', 'font-size': fs, 'font-weight': 800, fill: q.vr < 0 ? COL.near : COL.far, class: 'halo'}, quiz, q.vr < 0 ? '시선 속도 (다가옴)' : '시선 속도 (멀어짐)');
      }
      const lab = (pt, text, color) => {
        const L = Math.hypot(pt.x - star.x, pt.y - star.y), ux = (pt.x - star.x) / L, uy = (pt.y - star.y) / L;
        el('text', {x: pt.x + ux * 14, y: pt.y + uy * 14 + 5, 'text-anchor': ux < -0.3 ? 'end' : ux > 0.3 ? 'start' : 'middle', 'font-size': fs, 'font-weight': 800, fill: color, class: 'halo'}, quiz, text);
      };
      lab(v, '공간 속도', COL.v); lab(t, '접선 속도', COL.vtT);
      el('circle', {cx: star.x, cy: star.y, r: 7.5, fill: '#f2a33a', stroke: '#fff', 'stroke-width': 2}, quiz);
      // 보기
      opts.innerHTML = '';
      q.options.forEach((o, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.setAttribute('aria-label', `보기 ${i + 1}`);
        const s = document.createElementNS(NS, 'svg');
        s.setAttribute('viewBox', '0 0 120 96'); s.setAttribute('aria-hidden', 'true');
        const cx = 60, cy = 48;
        el('line', {x1: cx - q.u[0] * 60, y1: cy - q.u[1] * 60, x2: cx + q.u[0] * 60, y2: cy + q.u[1] * 60, stroke: '#b7c3cc', 'stroke-width': 1.5, 'stroke-dasharray': '5 4'}, s);
        const k = 40 / Math.max(...q.options.map(oo => Math.hypot(oo.vec[0], oo.vec[1]))), color = done && i === q.answer ? (q.vr < 0 ? COL.near : COL.far) : '#3b4b59';
        arrow(s, cx, cy, cx + o.vec[0] * k, cy + o.vec[1] * k, color, 3.5, {head: 9});
        el('circle', {cx, cy, r: 4.5, fill: '#f2a33a'}, s);
        b.appendChild(s);
        const sp = document.createElement('span');
        sp.textContent = '①②③④'[i];
        b.appendChild(sp);
        if (done) {
          b.disabled = true;
          if (i === q.answer) b.classList.add('ok');
          else if (i === qz.picked) b.classList.add('no');
        }
        b.addEventListener('click', () => pick(i));
        opts.appendChild(b);
      });
      $('s3-score').textContent = qz.score[1] ? `맞힌 수 ${qz.score[0]} / ${qz.score[1]}` : '';
      const fb = $('s3-feedback');
      fb.hidden = !done;
      if (done) {
        const ok = qz.picked === q.answer, kind = q.options[qz.picked].kind;
        const why = {
          flip: '방향이 반대예요. 접선 속도 화살표 끝에서 공간 속도 화살표 끝으로 가는 방향이 시선 속도입니다.',
          tangent: '시선 속도 화살표는 시선 방향(태양과 별을 잇는 선) 위에 있어야 합니다.',
          space: '그건 공간 속도와 같은 방향이에요. 공간 속도에서 접선 속도를 빼야 시선 속도가 남습니다.'
        };
        fb.className = 'feedback ' + (ok ? 'ok' : 'no');
        fb.innerHTML = `<b>${ok ? '정답!' : '아쉬워요.'}</b> ${ok ? '' : why[kind] + ' '}공간 속도 화살표 − 접선 속도 화살표 = 시선 속도 화살표(점선 평행사변형). 이 화살표는 시선 방향 위에 있고 태양 ${q.vr < 0 ? '쪽을 향하므로 <b>다가옵니다</b> (청색 편이, 시선 속도 −)' : '반대쪽을 향하므로 <b>멀어집니다</b> (적색 편이, 시선 속도 +)'}.`;
      }
    }
    function pick(i) {
      if (qz.picked !== null) return;
      qz.picked = i; qz.score[1]++;
      if (i === qz.q.answer) qz.score[0]++;
      renderQuiz();
    }
    $('s3-next').addEventListener('click', () => newQuiz(false));

    // ── 바너드별 (해 보기) ──
    const PRE = {textbook: {r: 1.83, mu: 10.3, vr: -110.5}, worksheet: {r: 1.83, mu: 10.4, vr: -108}};
    const bs = {preset: 'textbook', q3: false, q3shown: false};
    const inR = $('s3-r'), inMu = $('s3-mu'), inVr = $('s3-vr-in');
    function loadPreset(name) {
      bs.preset = name;
      if (name === 'q3') { bs.q3 = true; bs.q3shown = false; }
      else { bs.q3 = false; const p = PRE[name]; inR.value = p.r; inMu.value = p.mu; inVr.value = p.vr; }
      renderBarnard();
    }
    document.querySelectorAll('#s3-presets [data-preset]').forEach(b => b.addEventListener('click', () => loadPreset(b.dataset.preset)));
    [inR, inMu, inVr].forEach(inp => inp.addEventListener('input', () => { bs.preset = 'custom'; renderBarnard(); }));
    $('s3-q3-show').addEventListener('click', () => { bs.q3shown = !bs.q3shown; renderBarnard(); });
    const val = (inp, def) => { const v = parseFloat(String(inp.value).replace('−', '-')); return Number.isFinite(v) ? v : def; };

    function renderBarnard() {
      setPressed($('s3-presets'), 'data-preset', bs.preset);
      $('s3-one').hidden = bs.q3; $('s3-q3').hidden = !bs.q3;
      if (bs.q3) return renderQ3();
      const r = Math.max(0.01, val(inR, 1.83)), mu = Math.max(0, val(inMu, 10.3)), vr = val(inVr, -110.5);
      const vt = M.round(M.tangentialVelocity(mu, r), 1), V2 = M.spaceVelocity(vt, vr), th = M.thetaDeg(vt, vr);
      const cls = vr < 0 ? 'near' : vr > 0 ? 'far' : '';
      const vrS = `${sgn(vr, Math.abs(vr % 1) > 1e-9 ? 1 : 0)}`;
      $('s3-steps').innerHTML = `
        <div class="s"><div class="k">① 접선 속도</div><div class="w">${V('t')} = 4.74${it('μr')} = 4.74 × ${trim(mu, 2)} × ${trim(r, 2)}</div><div class="v">≈ ${num(vt, 1)} km/s</div></div>
        <div class="s"><div class="k">② 시선 속도 (스펙트럼)</div><div class="w">${V('r')} = ${vrS} km/s</div><div class="v ${cls}">${Math.abs(vr) < 1e-9 ? '편이 없음' : vr < 0 ? '음수 → 다가옴 (청색 편이)' : '양수 → 멀어짐 (적색 편이)'}</div></div>
        <div class="s final"><div class="k">③ 공간 속도</div><div class="w">${it('V')} = <span class="sqrt">√<span>${V('t')}² + ${V('r')}²</span></span> = <span class="sqrt">√<span>${num(vt, 1)}² + (${vrS})²</span></span></div><div class="v">≈ ${num(V2, 1)} km/s</div></div>
        <div class="s"><div class="k">④ 방향 (시선 방향과 이루는 각)</div><div class="w">tan θ = ${frac(V('t'), V('r'))} = ${frac(num(vt, 1), vrS)}</div><div class="v">θ ≈ ${num(th, 0)}°</div></div>`;
      drawTri(vt, vr, th);
      const ca = M.closestApproach(r, vt, vr);
      let txt;
      if (bs.preset === 'textbook') txt = `교과서 69쪽 답과 같습니다: ${V('t')} ≈ 89.3 km/s, ${it('V')} ≈ 142.1 km/s. `;
      else if (bs.preset === 'worksheet') txt = `활동지에서 사진·스펙트럼으로 잰 값(μ ≈ 10.4″/년, ${V('r')} ≈ −108 km/s)으로 구하면 ${V('t')} ≈ 90 km/s, ${it('V')} ≈ 141 km/s입니다. 교과서 값(89.3 km/s, 142.1 km/s)과 거의 같습니다. `;
      else txt = `${V('t')} ≈ ${num(vt, 1)} km/s, ${it('V')} ≈ ${num(V2, 1)} km/s. `;
      if (vr < 0 && vt > 0) txt += `이 별은 태양을 향해 곧장 오지 않고 비껴갑니다. 이대로 곧게 움직인다면 약 ${grp(Math.round(ca.years / 100) * 100)}년 뒤 태양에서 약 ${num(ca.rMin, 2)} pc(${num(M.pcToLy(ca.rMin), 2)}광년)까지 다가왔다가 멀어집니다.`;
      else if (vr < 0) txt += '접선 속도가 0이라 태양을 향해 곧장 다가옵니다.';
      else if (vr > 0) txt += '시선 속도가 양수라 태양에서 멀어지고 있습니다(적색 편이).';
      else txt += '시선 속도가 0이라 지금은 태양과의 거리가 변하지 않고, 하늘에서만 움직입니다.';
      const vd = $('s3-verdict');
      vd.className = 'verdict' + (bs.preset === 'custom' ? ' plain' : '');
      vd.innerHTML = txt;
    }
    function drawTri(vt, vr, th) {
      const svg = $('s3-tri');
      clear(svg);
      const sm = small(), fs = sm ? 19 : 13;
      // 다가오면 화살표가 태양 쪽(왼쪽)으로, 멀어지면 오른쪽으로 뻗으므로 별의 자리를 바꾼다.
      const sy = 205, sx = vr > 0 ? 120 : 262, s = Math.min(3, 150 / Math.max(Math.abs(vr), vt, 1));
      el('line', {x1: 14, y1: sy, x2: 352, y2: sy, stroke: '#9aa9b5', 'stroke-width': 1.5, 'stroke-dasharray': '7 6'}, svg);
      el('circle', {cx: 22, cy: sy, r: 11, fill: '#f6c343', stroke: '#e6a93c', 'stroke-width': 2}, svg);
      el('text', {x: 22, y: sy + 30, 'text-anchor': 'middle', 'font-size': fs, 'font-weight': 800}, svg, '태양');
      const rx = sx + vr * s, ty = sy - vt * s, lr = Math.abs(vr) * s, lt = vt * s;
      if (lt > 1 && lr > 1) el('path', {d: `M${sx} ${ty}L${rx} ${ty}L${rx} ${sy}`, stroke: '#a7b4bf', 'stroke-width': 1.3, 'stroke-dasharray': '5 5', fill: 'none'}, svg);
      if (lt > 1) arrow(svg, sx, sy, sx, ty, COL.vt, 4.5);
      if (lr > 1) arrow(svg, sx, sy, rx, sy, vr < 0 ? COL.near : COL.far, 4.5);
      arrow(svg, sx, sy, rx, ty, COL.v, 4);
      // θ: 시선 방향(태양 → 별, 오른쪽)에서 공간 속도까지
      const R = 26, a = th * Math.PI / 180;
      if (Math.hypot(vt, vr) > 0.5) {
        el('path', {d: `M${sx + R} ${sy}A${R} ${R} 0 0 0 ${sx + R * Math.cos(a)} ${sy - R * Math.sin(a)}`, stroke: '#0b7f9a', 'stroke-width': 2, fill: 'none'}, svg);
        // 이름표 각: 호의 가운데. 화살표(0°·90°·180°)와 겹치면 비켜 놓는다.
        let la = th / 2;
        if (la < 14) la = th + 16;
        else if (Math.abs(la - 90) < 14) la += la < 90 ? -14 : 14;
        const lr2 = R + 13, lx = sx + lr2 * Math.cos(la * Math.PI / 180), ly = sy - lr2 * Math.sin(la * Math.PI / 180);
        el('text', {x: lx, y: ly + 5, 'text-anchor': 'middle', 'font-size': fs, 'font-weight': 800, fill: '#0b7f9a', 'font-style': 'italic', class: 'halo'}, svg, 'θ');
      }
      // 이름표: 짧은 화살표에는 달지 않는다(값은 왼쪽 계산 카드에 있다)
      const side = vr > 0 ? -1 : 1;              // 접선 속도 이름표는 공간 속도 반대쪽에
      if (lt > 22) rich(svg, {x: sx + side * 10, y: (sy + ty) / 2 + 5, 'text-anchor': side > 0 ? 'start' : 'end', 'font-size': fs, 'font-weight': 800, fill: COL.vtT, class: 'halo'}, [['V', {i: 1}], ['t', {i: 1, sub: 1}], [` ${num(vt, 1)}`]]);
      if (lr > 30) rich(svg, {x: (sx + rx) / 2, y: sy + 26, 'text-anchor': 'middle', 'font-size': fs, 'font-weight': 800, fill: vr < 0 ? COL.near : COL.far, class: 'halo'}, [['V', {i: 1}], ['r', {i: 1, sub: 1}], [` ${sgn(vr, 1)}`]]);
      if (lt > 22 && lr > 22) rich(svg, {x: (sx + rx) / 2 + (vr < 0 ? -8 : 8), y: (sy + ty) / 2 - 8, 'text-anchor': vr < 0 ? 'end' : 'start', 'font-size': fs, 'font-weight': 800, fill: COL.v, class: 'halo'}, [['V', {i: 1}], [` ${num(Math.hypot(vt, vr), 1)}`]]);
      else rich(svg, {x: rx + (vr < 0 ? -6 : 6), y: ty - 10, 'text-anchor': vr < 0 ? 'end' : 'start', 'font-size': fs, 'font-weight': 800, fill: COL.v, class: 'halo'}, [['V', {i: 1}], [` ${num(Math.hypot(vt, vr), 1)}`]]);
      el('circle', {cx: sx, cy: sy, r: 7, fill: '#ffa66b', stroke: '#fff', 'stroke-width': 2}, svg);
      el('text', {x: sx - side * 10, y: sy + 26, 'text-anchor': side > 0 ? 'end' : 'start', 'font-size': fs - 1, 'font-weight': 700, fill: '#5f7282', class: 'halo'}, svg, '별');
      el('text', {x: 14, y: 20, 'font-size': fs - 3, fill: '#7d8b96'}, svg, '단위 km/s · 점선은 태양과 별을 잇는 시선 방향');
    }
    function renderQ3() {
      const rows = [['A', 10, 1.0, 30, '1.0'], ['B', 20, 0.5, -40, '0.5'], ['C', 5, 0, 45, '0']];
      const show = bs.q3shown;
      const cell = (v, extra = '') => `<td class="${show ? '' : 'hide'} ${extra}">${show ? v : '　'}</td>`;
      $('s3-q3-table').innerHTML = `<tr><th>별</th><th>거리 (pc)</th><th>고유 운동 (″/년)</th><th>시선 속도 (km/s)</th><th>접선 속도 (km/s)</th><th>공간 속도 (km/s)</th></tr>` +
        rows.map(([n, r, mu, vr, muS]) => {
          const vt = M.tangentialVelocity(mu, r), V2 = M.spaceVelocity(vt, vr);
          return `<tr><td><b>${n}</b></td><td>${r}</td><td>${muS}</td><td>${sgn(vr, 0)}</td>${cell(`${num(vt, 1)}`)}${cell(`<b>${num(V2, 1)}</b>`)}</tr>`;
        }).join('');
      const items = [
        ['ㄱ. A와 B의 접선 속도는 같다.', true, 'A : 4.74 × 1.0 × 10 = 47.4, B : 4.74 × 0.5 × 20 = 47.4 → 둘 다 47.4 km/s'],
        ['ㄴ. 공간 속도는 C가 가장 크다.', false, '공간 속도는 접선 속도보다 작을 수 없으므로 A, B는 47.4 km/s 이상. C는 고유 운동이 0이라 공간 속도 = 45 km/s → C가 가장 작다'],
        ['ㄷ. B의 스펙트럼에는 청색 편이가 나타난다.', true, '시선 속도가 음수(−) → 다가온다 → 청색 편이']
      ];
      $('s3-bogi').innerHTML = items.map(([t, ok, why]) => `<li class="${show ? (ok ? 'o' : 'x') : ''}">${show ? `<span class="mark">${ok ? '○' : '×'}</span>` : ''}${t}${show ? `<span class="ans">${why}</span>` : ''}</li>`).join('') +
        (show ? '<li class="o"><b>정답 ㄱ, ㄷ</b><span class="ans">함정 주의: 시선 속도가 가장 큰 별(C)이 공간 속도는 가장 작습니다.</span></li>' : '');
      $('s3-q3-show').textContent = show ? '풀이 숨기기' : '풀이 보기';
    }

    function render() { renderPlane(); if (!qz.q) newQuiz(true); else renderQuiz(); renderBarnard(); }
    return {render};
  })();

  // ═══════════════ 04 별자리의 변화 ═══════════════
  stations.s4 = (() => {
    const S = M.dipperStates(D.dipper), F = M.skyFrame(S.map(s => s.P));
    const NAMES = D.dipper.map(s => s[0]), FAR = new Set([0, 6]);
    const st = {t: 0, playing: false, arrows: true, trails: false, ghost: true, yaw: -35, pitch: 35, spin: false, tween: null};
    const sky = $('s4-sky'), sp = $('s4-3d');
    // 지금 하늘 자리와 ±20만 년 자취
    const TRAIL = S.map((s, i) => { const pts = []; for (let t = -2e5; t <= 2e5; t += 1e4) pts.push(M.dipperSky(S, t, F)[i]); return pts; });
    const LAB = [[0, -14, 'middle'], [14, 18, 'start'], [0, 24, 'middle'], [0, -13, 'middle'], [0, -13, 'middle'], [0, -13, 'middle'], [0, 24, 'middle']];
    function tLabel(t) {
      const a = Math.abs(t);
      if (a < 500) return '현재';
      const man = Math.floor(a / 10000), cheon = Math.round((a % 10000) / 1000);
      const parts = [];
      if (man) parts.push(`${man}만`);
      if (cheon) parts.push(`${cheon}천`);
      return `${parts.join(' ')} 년 ${t < 0 ? '전' : '후'}`;
    }
    function renderSky() {
      clear(sky);
      const sm = small();
      const Wd = sm ? 640 : 900, Hd = sm ? 380 : 400;
      sky.setAttribute('viewBox', `0 0 ${Wd} ${Hd}`);
      const x0 = -21.5, x1 = 20.8, y0 = -9.6, y1 = 8.6, pad = sm ? 24 : 34;
      const sc = Math.min((Wd - 2 * pad) / (x1 - x0), (Hd - 2 * pad - (sm ? 40 : 20)) / (y1 - y0));
      const cx = Wd / 2 - (x0 + x1) / 2 * sc, cy = Hd / 2 + (sm ? 16 : 10) + (y0 + y1) / 2 * sc;
      const X = x => cx + x * sc, Y = y => cy - y * sc;
      const fs = sm ? 21 : 13;
      // 방위와 각 축척
      const ax = Wd - (sm ? 50 : 44), ay = sm ? 60 : 50, L = sm ? 28 : 22;
      arrow(sky, ax, ay, ax, ay - L, '#cfe0f0', 2, {head: 7});
      arrow(sky, ax, ay, ax - L, ay, '#cfe0f0', 2, {head: 7});
      el('text', {x: ax, y: ay - L - 6, 'text-anchor': 'middle', 'font-size': sm ? 19 : 12, fill: '#cfe0f0', 'font-weight': 700}, sky, '북');
      el('text', {x: ax - L - 6, y: ay + 5, 'text-anchor': 'end', 'font-size': sm ? 19 : 12, fill: '#cfe0f0', 'font-weight': 700}, sky, '동');
      const bl = 5 * sc, bx = Wd - pad - bl, by = Hd - (sm ? 16 : 14);
      el('path', {d: `M${bx} ${by - 6}V${by}H${bx + bl}V${by - 6}`, stroke: '#9fb3c6', 'stroke-width': 2, fill: 'none'}, sky);
      el('text', {x: bx + bl / 2, y: by - 10, 'text-anchor': 'middle', 'font-size': sm ? 18 : 11, fill: '#9fb3c6'}, sky, '5°');
      // 자취
      if (st.trails) TRAIL.forEach((pts, i) => {
        el('polyline', {points: pts.map(p => `${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join(' '), fill: 'none', stroke: FAR.has(i) ? '#8fb0f0' : '#f2c37a', 'stroke-width': 1.5, opacity: 0.45, 'stroke-dasharray': '2 4'}, sky);
      });
      const now = M.dipperSky(S, 0, F), cur = M.dipperSky(S, st.t, F);
      const linePts = pts => D.dipperLines.map(i => `${X(pts[i][0]).toFixed(1)},${Y(pts[i][1]).toFixed(1)}`).join(' ');
      // 현재 모양 겹치기
      if (st.ghost && Math.abs(st.t) >= 500) {
        el('polyline', {points: linePts(now), fill: 'none', stroke: '#7f96ad', 'stroke-width': 1.5, 'stroke-dasharray': '6 5', opacity: 0.8}, sky);
        now.forEach(p => el('circle', {cx: X(p[0]), cy: Y(p[1]), r: sm ? 5 : 4, fill: 'none', stroke: '#7f96ad', 'stroke-width': 1.5}, sky));
      }
      el('polyline', {points: linePts(cur), fill: 'none', stroke: '#9cc3e6', 'stroke-width': sm ? 3 : 2.4, 'stroke-linejoin': 'round'}, sky);
      // 움직이는 방향 (앞으로 5만 년)
      if (st.arrows) {
        const nxt = M.dipperSky(S, st.t + 5e4, F);
        cur.forEach((p, i) => arrow(sky, X(p[0]), Y(p[1]), X(nxt[i][0]), Y(nxt[i][1]), FAR.has(i) ? '#8fb0f0' : '#f2a33a', sm ? 3.5 : 3, {head: sm ? 12 : 10}));
      }
      const legend = [];
      if (st.arrows) legend.push(['#f2a33a', '', '가운데 다섯 별의 움직임', '#e8d3b0'], ['#8fb0f0', '', '두베 · 알카이드의 움직임', '#c3d3f2']);
      if (st.ghost && Math.abs(st.t) >= 500) legend.push(['#7f96ad', '6 5', '현재 모양', '#9fb3c6']);
      const labs = [];
      cur.forEach((p, i) => {
        const x = X(p[0]), y = Y(p[1]), r = sm ? 7.5 : 6;
        el('circle', {cx: x, cy: y, r: r * 2, fill: '#ffffff', opacity: 0.12}, sky);
        el('circle', {cx: x, cy: y, r, fill: i === 0 ? '#ffe2a8' : '#ffffff'}, sky);
        const [dx, dy, anc] = LAB[i], k = sm ? 1.4 : 1;
        labs.push({x, y, r, text: NAMES[i], fs, i, pref: [[dx * k, dy * k, anc]]});
      });
      placeLabels(labs, Wd, Hd, [{x0: 0, y0: 0, x1: sm ? 250 : 210, y1: (sm ? 72 : 58) + legend.length * (sm ? 26 : 18)}]);
      drawLabels(sky, labs, o => ({'font-size': fs, 'font-weight': 700, fill: FAR.has(o.i) ? '#b9cdf6' : '#f1f5f9', class: 'halo-dark'}));
      el('text', {x: pad - 8, y: sm ? 40 : 34, 'font-size': sm ? 30 : 24, 'font-weight': 800, fill: Math.abs(st.t) < 500 ? '#ffffff' : '#ffc97a'}, sky, tLabel(st.t));
      legend.forEach(([c, dash, text, tc], k) => {
        const ly = (sm ? 72 : 58) + k * (sm ? 26 : 18), lx = pad - 6;
        el('line', {x1: lx, x2: lx + 22, y1: ly, y2: ly, stroke: c, 'stroke-width': 3, 'stroke-dasharray': dash || null}, sky);
        el('text', {x: lx + 30, y: ly + 5, 'font-size': sm ? 18 : 11.5, fill: tc}, sky, text);
      });
      $('s4-t').value = st.t;
      $('s4-t-out').textContent = tLabel(st.t);
      setPressed($('s4-jumps'), 'data-t', String(Math.abs(st.t) < 500 ? 0 : st.t));
      let txt;
      if (Math.abs(st.t) < 500) {
        txt = '지금의 국자 모양입니다. 북두칠성의 별들은 초속 10~25 km로 움직이지만(접선 속도) 매우 멀리 있어 고유 운동은 1년에 약 0.1″뿐입니다. 시간 막대를 움직이거나 <b>▶ 재생</b>을 눌러 보세요.';
      } else {
        txt = `<b>${tLabel(st.t)}</b>의 북두칠성은 지금과 다른 모양${st.t > 0 ? '이 됩니다' : '이었습니다'}. 자료를 보면 가운데 다섯 별(메라크·페크다·메그레즈·알리오즈·미자르)은 거의 같은 방향으로 움직이지만, <b>두베와 알카이드</b>는 반대쪽으로 움직여 국자 모양이 ${st.t > 0 ? '벌어집니다' : '달랐습니다'}.`;
      }
      txt += ' 별자리의 별들은 시선 방향이 비슷할 뿐, 별마다 고유 운동의 방향과 크기가 달라 오랜 시간이 지나면 별자리의 모양이 변합니다.';
      $('s4-insight').innerHTML = txt;
    }
    const tInput = $('s4-t');
    tInput.addEventListener('input', () => { setPlaying(false); let t = +tInput.value; if (Math.abs(t) < 2500) t = 0; st.t = t; renderSky(); });
    document.querySelectorAll('#s4-jumps [data-t]').forEach(b => b.addEventListener('click', () => { setPlaying(false); st.t = +b.dataset.t; renderSky(); }));
    $('s4-arrows').addEventListener('change', e => { st.arrows = e.target.checked; renderSky(); });
    $('s4-trails').addEventListener('change', e => { st.trails = e.target.checked; renderSky(); });
    $('s4-ghost').addEventListener('change', e => { st.ghost = e.target.checked; renderSky(); });
    let acc = 0;
    function play(dt) {
      if (current !== 's4' || !st.playing) return false;
      if (reduced()) { acc += dt; if (acc < 0.45) return true; acc = 0; st.t = Math.min(2e5, st.t + 1e4); }
      else st.t = Math.min(2e5, st.t + dt * 4e4);
      st.t = Math.round(st.t / 1000) * 1000;
      renderSky();
      if (st.t >= 2e5) { setPlaying(false); return false; }
      return true;
    }
    function setPlaying(v) {
      st.playing = v;
      $('s4-play').textContent = v ? '❚❚ 멈춤' : '▶ 재생';
      $('s4-play').setAttribute('aria-pressed', String(v));
      if (v) { if (st.t >= 2e5) st.t = -2e5; acc = 0; animate(play); } else stopAnim(play);
    }
    $('s4-play').addEventListener('click', () => setPlaying(!st.playing));

    // ── 입체 보기 (교과서 70쪽 표) ──
    const P = D.tb70.map(r => [r[2], r[3], r[4]]), TBN = D.tb70.map(r => r[1]);
    const TB_FAR = new Set([0, 6]), TB_LINES = [0, 1, 2, 3, 4, 5, 6, 3];
    // 상자 틀: x −20~0, y −10~5, z 0~35 pc. 상자 가운데를 기준으로 돈다.
    const BOX = [[-20, 0], [-10, 5], [0, 35]];
    const VF = M.viewFrame(P, BOX.map(r => (r[0] + r[1]) / 2)), DEG = M.DEG;
    const CORNERS = [];
    for (const x of BOX[0]) for (const y of BOX[1]) for (const z of BOX[2]) CORNERS.push([x, y, z]);
    const VIEWS = {earth: [0, 0], side: [90, 0], top: [0, 89]};
    const LY = P.map(p => M.pcToLy(M.distancePc(...p)));
    function render3d() {
      clear(sp);
      const sm = small(), Wd = 480, Hd = sm ? 460 : 400, fs = sm ? 21 : 12.5;
      sp.setAttribute('viewBox', `0 0 ${Wd} ${Hd}`);
      const cam = M.camera(st.yaw * DEG, st.pitch * DEG, VF);
      // 화면 크기 맞추기: 지구 자리에서는 별들만, 멀어질수록 상자와 지구까지 들어오게
      const off = cam.off, w = smooth(off, 6, 40);
      const ext = (pts, minD) => Math.max(...pts.map(p => M.viewProject(p, cam)).filter(q => q.depth > minD).map(q => Math.max(Math.abs(q.x), Math.abs(q.y) * Wd / Hd)), 0.01);
      const half = Math.max(ext(P, 0.6) * 1.2, w > 0 ? w * ext([...CORNERS, [0, 0, 0]], 10) * 1.1 : 0);
      const S2 = (Wd / 2 - 18) / half, cx = Wd / 2, cy = Hd / 2 + 6;
      const pr = p => { const q = M.viewProject(p, cam); return {x: cx + q.x * S2, y: cy - q.y * S2, d: q.depth}; };
      const near = 0.6;
      const seg = (a, b, attrs) => {
        const qa = M.viewProject(a, cam), qb = M.viewProject(b, cam);
        if (qa.depth < near && qb.depth < near) return;
        let A = a, Bp = b;
        if (qa.depth < near) { const t = (near - qa.depth) / (qb.depth - qa.depth); A = M.add(a, M.mul(M.sub(b, a), t)); }
        if (qb.depth < near) { const t = (near - qb.depth) / (qa.depth - qb.depth); Bp = M.add(b, M.mul(M.sub(a, b), t)); }
        const p1 = pr(A), p2 = pr(Bp);
        el('line', Object.assign({x1: p1.x.toFixed(1), y1: p1.y.toFixed(1), x2: p2.x.toFixed(1), y2: p2.y.toFixed(1)}, attrs), sp);
      };
      const inView = q => q.d > near && q.x > 8 && q.x < Wd - 8 && q.y > 8 && q.y < Hd - 8;
      const fade = smooth(off, 4, 22), op = fade.toFixed(2);
      const taken = [];
      // 3차원 계산기처럼 상자 틀과 눈금 (지구 = 원점, 단위 pc)
      if (fade > 0.02) {
        const X0 = -20, X1 = 0, Y0 = -10, Y1 = 5, Z0 = 0, Z1 = 35;
        const box = {stroke: '#4d6884', 'stroke-width': 1.1, opacity: op};
        [[Y0, Z0], [Y1, Z0], [Y0, Z1], [Y1, Z1]].forEach(([y, z]) => seg([X0, y, z], [X1, y, z], box));
        [[X0, Z0], [X1, Z0], [X0, Z1], [X1, Z1]].forEach(([x, z]) => seg([x, Y0, z], [x, Y1, z], box));
        [[X0, Y0], [X1, Y0], [X0, Y1], [X1, Y1]].forEach(([x, y]) => seg([x, y, Z0], [x, y, Z1], box));
        const tick = (p, text) => {
          const q = pr(p);
          if (!inView(q)) return;
          el('circle', {cx: q.x, cy: q.y, r: 2, fill: '#7f9ab4', opacity: op}, sp);
          el('text', {x: q.x + 4, y: q.y + 13, 'font-size': fs - 2, fill: '#8fa9c2', opacity: op}, sp, text);
        };
        [-20, -10].forEach(x => tick([x, Y0, Z0], num(x, 0)));
        tick([X1, Y1, Z0], '5');
        [10, 20, 30].forEach(z => tick([X1, Y0, z], String(z)));
        [[[X0 - 3, Y0, Z0], 'x'], [[X1, Y1 + 3, Z0], 'y'], [[X1, Y0, Z1 + 3], 'z']].forEach(([p, n]) => {
          const q = pr(p);
          if (inView(q)) el('text', {x: q.x, y: q.y + 5, 'text-anchor': 'middle', 'font-size': fs + 1, 'font-weight': 800, fill: '#a9c1d8', 'font-style': 'italic', opacity: op}, sp, n);
        });
        // 지구에서 별로 가는 시선 방향
        P.forEach(p => seg([0, 0, 0], p, {stroke: '#6d89a6', 'stroke-width': 1.2, 'stroke-dasharray': '4 5', opacity: (0.9 * fade).toFixed(2)}));
      }
      // 국자 선
      for (let i = 0; i < TB_LINES.length - 1; i++) seg(P[TB_LINES[i]], P[TB_LINES[i + 1]], {stroke: '#9cc3e6', 'stroke-width': 2, opacity: 0.85});
      // 지구
      const qe = M.viewProject([0, 0, 0], cam);
      function edgeMark(dx, dy) {
        const L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
        const k = Math.min((Wd / 2 - 26) / Math.abs(ux || 1e-9), (Hd / 2 - 26) / Math.abs(uy || 1e-9));
        const ex = cx + ux * k, ey = cy + uy * k;
        arrow(sp, ex - ux * 26, ey - uy * 26, ex, ey, '#7fa6ff', 3, {head: 9});
        el('text', {x: ex - ux * 34, y: ey - uy * 34 + 5, 'text-anchor': ux > 0.3 ? 'end' : ux < -0.3 ? 'start' : 'middle', 'font-size': fs, 'font-weight': 800, fill: '#bcd0ff', class: 'halo-dark'}, sp, '지구 쪽');
      }
      if (off < 1.5) {
        el('text', {x: 14, y: Hd - 14, 'font-size': fs, 'font-weight': 800, fill: '#ffe08a'}, sp, '카메라가 지구에 있습니다 — 지구에서 본 모습');
      } else if (qe.depth > near) {
        const e = pr([0, 0, 0]);
        if (e.x > 12 && e.x < Wd - 12 && e.y > 12 && e.y < Hd - 12) {
          el('circle', {cx: e.x, cy: e.y, r: sm ? 9 : 7, fill: '#3d6fe0', stroke: '#bcd0ff', 'stroke-width': 2}, sp);
          el('text', {x: e.x + 12, y: e.y + 5, 'font-size': fs, 'font-weight': 800, fill: '#bcd0ff', class: 'halo-dark'}, sp, '지구');
          taken.push({x0: e.x + 10, y0: e.y - fs, x1: e.x + 12 + fs * 2.1, y1: e.y + 8});
        } else edgeMark(e.x - cx, e.y - cy);
      } else edgeMark(-qe.x, qe.y);
      // 별 (먼 것부터 그리고, 이름은 겹치지 않게)
      const proj = P.map((p, i) => ({i, ...pr(p)})).filter(o => o.d > near).sort((a, b) => b.d - a.d);
      const items = [];
      proj.forEach(o => {
        const r = Math.max(3.5, Math.min(9, 7 * 28 / o.d)) * (sm ? 1.25 : 1), far = TB_FAR.has(o.i);
        el('circle', {cx: o.x, cy: o.y, r: r * 2, fill: '#ffffff', opacity: 0.1}, sp);
        el('circle', {cx: o.x, cy: o.y, r, fill: far ? '#ffc97a' : '#ffffff', stroke: '#0b1624', 'stroke-width': 1}, sp);
        items.push({x: o.x, y: o.y, r, text: TBN[o.i], fs, far, d: o.d});
      });
      const byNear = items.slice().sort((a, b) => a.d - b.d);
      placeLabels(byNear, Wd, Hd, taken);
      drawLabels(sp, byNear, o => ({'font-size': fs, 'font-weight': 700, fill: o.far ? '#ffd9a0' : '#e8eef4', class: 'halo-dark'}));
      // 버튼 상태와 해설
      const at = (y, p) => Math.abs(st.yaw - y) < 1 && Math.abs(st.pitch - p) < 1;
      document.querySelectorAll('#s4-views [data-view]').forEach(b => b.setAttribute('aria-pressed', String(at(...VIEWS[b.dataset.view]))));
      $('s4-spin').setAttribute('aria-pressed', String(st.spin));
      $('s4-3d-insight').innerHTML = off < 1.5
        ? '지구에서 보면 일곱 별이 천구에 투영되어 <b>국자 모양</b>으로 보입니다. 지구에서 별로 가는 시선 방향 선이 모두 점으로 겹쳐서, 별마다 거리가 다르다는 것은 보이지 않습니다.'
        : `지구가 아닌 곳에서 보면 국자 모양이 무너집니다. 지구에서 이어진 점선(시선 방향)의 길이를 비교해 보세요. <b>두베(약 ${Math.round(LY[6])}광년)와 알카이드(약 ${Math.round(LY[0])}광년)</b>는 나머지 다섯 별(약 ${Math.round(Math.min(...LY.slice(1, 6)))}~${Math.round(Math.max(...LY.slice(1, 6)))}광년)보다 훨씬 멀리 있습니다.`;
    }
    // 끌어서 돌리기 (가로: 좌우 회전, 세로: 위아래 회전)
    let drag = null;
    sp.addEventListener('pointerdown', e => {
      if (e.button > 0) return;
      drag = {x: e.clientX, y: e.clientY, yaw: st.yaw, pitch: st.pitch, id: e.pointerId};
      try { sp.setPointerCapture(e.pointerId); } catch (_) {}
      stopTween(); setSpin(false);
      sp.classList.add('dragging');
    });
    sp.addEventListener('pointermove', e => {
      if (!drag || e.pointerId !== drag.id) return;
      const k = 300 / Math.max(240, sp.getBoundingClientRect().width);
      st.yaw = ((drag.yaw - (e.clientX - drag.x) * 0.5 * k) % 360 + 540) % 360 - 180;
      st.pitch = Math.max(-89, Math.min(89, drag.pitch + (e.clientY - drag.y) * 0.5 * k));
      render3d();
    });
    const endDrag = () => { drag = null; sp.classList.remove('dragging'); };
    sp.addEventListener('pointerup', endDrag);
    sp.addEventListener('pointercancel', endDrag);
    sp.setAttribute('tabindex', '0');
    sp.addEventListener('keydown', e => {
      const d = {ArrowLeft: [-10, 0], ArrowRight: [10, 0], ArrowUp: [0, 10], ArrowDown: [0, -10]}[e.key];
      if (!d) return;
      e.preventDefault(); stopTween(); setSpin(false);
      st.yaw = ((st.yaw + d[0]) % 360 + 540) % 360 - 180;
      st.pitch = Math.max(-89, Math.min(89, st.pitch + d[1]));
      render3d();
    });
    function tweenTo(y, p) {
      stopTween(); setSpin(false);
      let dy = ((y - st.yaw) % 360 + 540) % 360 - 180;
      if (reduced()) { st.yaw = y; st.pitch = p; render3d(); return; }
      const y0 = st.yaw, p0 = st.pitch, dur = 0.9;
      let tt = 0;
      st.tween = dt => {
        if (current !== 's4') return false;
        tt = Math.min(dur, tt + dt);
        const e = smooth(tt, 0, dur);
        st.yaw = y0 + dy * e; st.pitch = p0 + (p - p0) * e;
        if (tt >= dur) { st.yaw = y; st.pitch = p; render3d(); st.tween = null; return false; }
        render3d();
        return true;
      };
      animate(st.tween);
    }
    function stopTween() { if (st.tween) { stopAnim(st.tween); st.tween = null; } }
    function spin(dt) {
      if (current !== 's4' || !st.spin) return false;
      st.yaw = ((st.yaw + dt * 24) % 360 + 540) % 360 - 180;
      render3d();
      return true;
    }
    function setSpin(v) {
      st.spin = v;
      $('s4-spin').setAttribute('aria-pressed', String(v));
      $('s4-spin').textContent = v ? '❚❚ 멈춤' : '↻ 돌려 보기';
      if (v) { stopTween(); if (reduced()) { st.spin = false; st.yaw = ((st.yaw + 45) % 360 + 540) % 360 - 180; $('s4-spin').textContent = '↻ 돌려 보기'; render3d(); } else animate(spin); }
      else stopAnim(spin);
    }
    document.querySelectorAll('#s4-views [data-view]').forEach(b => b.addEventListener('click', () => tweenTo(...VIEWS[b.dataset.view])));
    $('s4-spin').addEventListener('click', () => setSpin(!st.spin));

    // ── 거리 표와 막대 ──
    function renderDist() {
      $('s4-table').innerHTML = '<tr><th>별</th><th>x (pc)</th><th>y (pc)</th><th>z (pc)</th><th>거리 r (pc)</th><th>광년</th></tr>' +
        D.tb70.map((r, i) => `<tr class="${TB_FAR.has(i) ? 'far' : ''}"><td>${r[0]}</td><td>${num(r[2], 2)}</td><td>${num(r[3], 2)}</td><td>${num(r[4], 2)}</td><td>${num(M.distancePc(r[2], r[3], r[4]), 1)}</td><td>${Math.round(LY[i])}</td></tr>`).join('');
      const svg = $('s4-bars');
      clear(svg);
      const sm = small(), fs = sm ? 20 : 12.5, Hd = sm ? 380 : 250;
      svg.setAttribute('viewBox', `0 0 520 ${Hd}`);
      const l = sm ? 116 : 84, r = 500, t = 12, rowH = (Hd - t - (sm ? 56 : 40)) / P.length;
      const x = lin(0, 130, l, r);
      const g = el('g', {class: 'axis'}, svg);
      [0, 20, 40, 60, 80, 100, 120].forEach(v => {
        el('line', {x1: x(v), x2: x(v), y1: t, y2: t + rowH * P.length, class: 'grid-line'}, g);
        el('text', {x: x(v), y: t + rowH * P.length + (sm ? 24 : 16), 'text-anchor': 'middle', class: 'tick'}, g, String(v));
      });
      el('text', {x: (l + r) / 2, y: t + rowH * P.length + (sm ? 50 : 34), 'text-anchor': 'middle', class: 'axis-label'}, g, '지구로부터의 거리 (광년)');
      D.tb70.forEach((row, i) => {
        const y = t + rowH * i + rowH * 0.18, h = rowH * 0.64, far = TB_FAR.has(i);
        el('rect', {x: l, y, width: x(LY[i]) - l, height: h, rx: 4, fill: far ? '#e8962a' : '#7fb5c8'}, svg);
        el('text', {x: l - 8, y: y + h / 2 + fs * 0.36, 'text-anchor': 'end', 'font-size': fs, 'font-weight': 700, fill: far ? '#a85a00' : '#14283a'}, svg, row[1]);
        el('text', {x: x(LY[i]) + 6, y: y + h / 2 + fs * 0.36, 'font-size': fs, 'font-weight': 800, fill: far ? '#a85a00' : '#14283a'}, svg, `${Math.round(LY[i])}`);
      });
      const g70 = D.tb70ly;
      $('s4-dist-note').innerHTML = `거리 r = √(x² + y² + z²), 1 pc ≈ 3.26광년으로 계산했습니다. 교과서 지도서의 답(알카이드 ${g70['알카이드']}, 미자르 ${g70['미자르']}, 알리오즈 ${g70['알리오즈']}, 메그레즈 ${g70['메그레즈']}, 페크다 ${g70['페크다']}, 메라크 ${g70['메라크']}, 두베 ${g70['두베']}광년)과는 자료에 따라 몇 광년씩 다를 수 있습니다. 두베와 알카이드만 유난히 멀다는 점은 같습니다.`;
    }

    function render() { renderSky(); render3d(); renderDist(); }
    return {render, leave: () => { setPlaying(false); setSpin(false); stopTween(); }};
  })();

  show((location.hash || '').slice(1) || 's1');
  let resizeTimer;
  window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => stations[current].render(), 150); });
  window.addEventListener('hashchange', () => { const h = location.hash.slice(1); if (h && (ALIAS[h] || h) !== current) show(h); });
})();
