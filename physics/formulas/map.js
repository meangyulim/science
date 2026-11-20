/* 공식 지도 — 화면. 데이터 ../data/formulas.json, 그래프 계산 formulas-graph.js(FormulaGraph), 수식 KaTeX.
   지도: 끌어서 이동, 휠·두 손가락으로 확대·축소, 확대 단계(lod0~3)에 따라 과목·대단원 → 단원 → 공식 이름 → 공식 카드가 펼쳐진다.
   공식을 누르면 자세히 패널(좁은 화면은 아래 시트)에 출발점 설명 또는 유도 과정을 한 줄씩 펼친다.
   주소: #f=<공식 id>&v=<가운데 x>,<가운데 y>,<배율>  (지금 보는 곳을 그대로 남긴다) */
(function () {
  'use strict';
  const FG = window.FormulaGraph;
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const pad = n => String(n).padStart(2, '0');
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const narrow = matchMedia('(max-width: 760px)');

  const map = $('map'), world = $('world'), cardsEl = $('cards'), regionsEl = $('regions'), edgeSvg = $('edges'), edgeG = $('edgeG');
  const panel = $('panel'), panelIn = $('panelIn'), qIn = $('q'), results = $('results');
  const ROLE = {basis: '출발점', derived: '유도', applied: '응용'};
  const LOD = [0.065, 0.26, 0.5];          // 이 배율보다 작으면 lod0 / lod1 / lod2, 크면 lod3
  const K_MAX = 2.4;

  let D = null, IX = null, L = null, colorOfUnit = new Map(), concepts = new Map(), built = new Set();
  const cardOf = new Map(), edgeEls = [], unitEls = new Map(), bigEls = new Map(), subjEls = new Map();
  const view = {x: 0, y: 0, k: 1};       // 화면 = 세계 × k + (x, y)
  let kMin = 0.05, cur = null, panelMode = null, lod = -1;
  const reveal = new Map();               // 공식마다 펼친 줄 수

  const tex = (t, display) => {
    try { return katex.renderToString(t, {throwOnError: false, displayMode: !!display, strict: 'ignore', output: 'html'}); }
    catch (e) { return esc(t); }
  };
  const nodeColor = n => colorOfUnit.get(n.unit) || 1;
  const unitName = code => (IX.unitOf.get(code) || {}).name || code;
  const kindName = k => (D.kinds && D.kinds[k]) || k;
  const roleText = n => n.role === 'basis' ? `출발점 · ${n.basis.type}` : ROLE[n.role];

  // ───────── 카드 만들기 · 재기 · 배치 ─────────
  function buildCards() {
    const frag = document.createDocumentFragment();
    for (const n of D.nodes) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `fm-card ${n.role} c${nodeColor(n)}`;
      b.dataset.id = n.id;
      b.setAttribute('aria-label', `${n.name} (${roleText(n)})`);
      b.innerHTML = `<span class="b"><i></i>${esc(roleText(n))}</span><span class="n">${esc(n.name)}</span><span class="t">${tex(n.tex)}</span>`;
      b.style.width = 'max-content';
      frag.appendChild(b);
      cardOf.set(n.id, b);
    }
    cardsEl.appendChild(frag);
  }

  const size = new Map();
  function measure() {
    // 1) 수식·이름의 자연 폭 → 카드 폭(190~400). 수식이 넘치면 글자를 줄인다
    const widths = [];
    for (const [id, el] of cardOf) {
      el.style.width = 'max-content';
      const t = el.querySelector('.t'), k = t.firstElementChild;
      t.style.fontSize = '';
      widths.push([id, el, t, k ? k.offsetWidth : 0, el.querySelector('.n').offsetWidth]);
    }
    for (const [, el, t, tw, nw] of widths) {
      const w = clamp(Math.max(tw, Math.min(nw, 250)) + 30, 190, 400);
      el.style.width = w + 'px';
      if (tw > w - 30) t.style.fontSize = (16 * (w - 30) / tw).toFixed(2) + 'px';
    }
    for (const [id, el] of widths) size.set(id, {w: el.offsetWidth, h: el.offsetHeight});
  }

  function place() {
    L = FG.layout(D, id => size.get(id));
    for (const [id, el] of cardOf) {
      const p = L.nodes[id];
      el.style.left = p.x + 'px'; el.style.top = p.y + 'px';
    }
    edgeSvg.setAttribute('width', L.bounds.w); edgeSvg.setAttribute('height', L.bounds.h);
    edgeEls.forEach(({e, el}) => el.setAttribute('d', FG.edgePath(L.nodes[e.from], L.nodes[e.to])));
    for (const [code, el] of unitEls) { const u = L.units[code]; Object.assign(el.style, {left: u.x + 'px', top: u.y + 'px', width: u.w + 'px', height: u.h + 'px'}); }
    for (const [id, el] of bigEls) { const b = L.bigs[id]; Object.assign(el.style, {left: b.x + 'px', top: b.y + 'px', width: b.w + 'px', height: b.h + 'px'}); }
    for (const [id, el] of subjEls) { const s = L.subjects[id]; Object.assign(el.style, {left: (s.x + 10) + 'px', top: (s.y + FG.G.subjTop - 104) + 'px'}); }
    const fit = fitScale(L.bounds, 0);
    kMin = Math.min(0.08, fit * 0.85);
  }

  function buildRegions() {
    let h = '';
    for (const s of D.subjects) h += `<div class="fm-subj-lab" data-subj="${s.id}">${esc(s.name)}</div>`;
    for (const b of D.bigUnits) {
      h += `<div class="fm-big c${b.color}" data-big="${b.id}"><div class="fm-big-lab"><b>${b.roman}</b><span>${esc(b.name)}</span></div></div>`;
    }
    for (const u of D.units) {
      const n = D.nodes.filter(x => x.unit === u.code).length, c = IX.bigOf.get(u.big).color;
      h += `<div class="fm-unit c${c}${n ? '' : ' empty'}" data-unit="${u.code}"><div class="fm-unit-lab"><b>${esc(u.name)}</b><small>${u.code}${n ? ` · 공식 ${n}` : ''}</small></div>${n ? '' : '<span class="fm-soon">공식 준비 중</span>'}</div>`;
    }
    regionsEl.innerHTML = h;
    regionsEl.querySelectorAll('[data-unit]').forEach(el => unitEls.set(el.dataset.unit, el));
    regionsEl.querySelectorAll('[data-big]').forEach(el => bigEls.set(el.dataset.big, el));
    regionsEl.querySelectorAll('[data-subj]').forEach(el => subjEls.set(el.dataset.subj, el));
  }

  function buildEdges() {
    const ns = 'http://www.w3.org/2000/svg', frag = document.createDocumentFragment();
    for (const e of D.edges) {
      const el = document.createElementNS(ns, 'path');
      frag.appendChild(el);
      edgeEls.push({e, el});
    }
    edgeG.appendChild(frag);
  }

  // ───────── 보기(이동·확대) ─────────
  function mapRect() { return map.getBoundingClientRect(); }
  /** 패널에 가리지 않는 지도 영역(지도 좌표) */
  function visibleArea() {
    const r = mapRect();
    let x = 0, y = 0, w = r.width, h = r.height;
    if (!panel.hidden) {
      const p = panel.getBoundingClientRect();
      if (narrow.matches) h = Math.max(120, p.top - r.top);
      else w = Math.max(200, p.left - r.left);
    }
    return {x, y, w, h};
  }
  function fitScale(b, padPx) {
    const a = visibleArea();
    return Math.min((a.w - 2 * padPx) / b.w, (a.h - 2 * padPx) / b.h);
  }
  function viewFor(b, padPx, kCap, top) {
    const a = visibleArea();
    const k = clamp(Math.min(fitScale(b, padPx), kCap || K_MAX), kMin, K_MAX);
    const y = top && b.h * k < a.h - 2 * padPx ? a.y + padPx + 40 - b.y * k : a.y + a.h / 2 - (b.y + b.h / 2) * k;
    return {k, x: a.x + a.w / 2 - (b.x + b.w / 2) * k, y};
  }
  /** 단원으로: 상자가 화면보다 크면 맨 위(출발점 줄)부터 읽을 수 있는 배율로 */
  function zoomUnit(code, ms) {
    const u = L.units[code], a = visibleArea();
    const k = clamp(Math.min((a.w - 32) / u.w, (a.h - 32) / u.h), 0.42, 0.9);
    const x = u.w * k <= a.w - 32 ? a.x + a.w / 2 - (u.x + u.w / 2) * k : a.x + 16 - u.x * k;
    const y = u.h * k <= a.h - 32 ? a.y + a.h / 2 - (u.y + u.h / 2) * k : a.y + 48 - u.y * k;
    flyTo({k, x, y}, ms);
  }

  let raf = 0;
  function apply() {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      world.style.transform = `translate(${view.x}px,${view.y}px) scale(${view.k})`;
      const nl = view.k < LOD[0] ? 0 : view.k < LOD[1] ? 1 : view.k < LOD[2] ? 2 : 3;
      if (nl !== lod) { map.classList.remove('lod' + lod); lod = nl; map.classList.add('lod' + lod); }
      scaleLabels();
      whereSoon();
      hashSoon();
    });
  }
  // 멀리서도 이름을 읽을 수 있게 영역 이름은 배율을 거슬러 키운다
  function scaleLabels() {
    const k = view.k;
    const su = lod < 2 ? Math.max(1, 0.5 / k) : Math.max(1, 0.62 / k), sb = Math.max(1, 0.26 / k), ss = Math.max(1, 0.34 / k);
    for (const [code, el] of unitEls) {
      const lab = el.firstElementChild, u = L.units[code];
      lab.style.transform = lod < 2 ? `translate(-50%,-50%) scale(${su})` : `scale(${su})`;
      lab.style.maxWidth = Math.max(120, (lod < 2 ? u.w + 160 : u.w - 56) / su) + 'px';
    }
    for (const [id, el] of bigEls) {
      const lab = el.firstElementChild;
      lab.style.transform = `scale(${sb})`;
    }
    for (const [, el] of subjEls) el.style.transform = `scale(${ss})`;
  }
  function zoomAt(f, sx, sy) {
    const k = clamp(view.k * f, kMin, K_MAX);
    const r = k / view.k;
    view.x = sx - (sx - view.x) * r; view.y = sy - (sy - view.y) * r; view.k = k;
    apply();
  }
  let anim = 0;
  function flyTo(t, ms) {
    cancelAnimationFrame(anim);
    if (reduce || ms === 0) { Object.assign(view, t); apply(); return; }
    const a = visibleArea();
    const cx = a.x + a.w / 2, cy = a.y + a.h / 2;
    const w0 = {x: (cx - view.x) / view.k, y: (cy - view.y) / view.k, k: view.k};
    const w1 = {x: (cx - t.x) / t.k, y: (cy - t.y) / t.k, k: t.k};
    const t0 = performance.now(), dur = ms || 520;
    const step = now => {
      const p = Math.min(1, (now - t0) / dur), e = p < .5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      const k = Math.exp(Math.log(w0.k) + (Math.log(w1.k) - Math.log(w0.k)) * e);
      const wx = w0.x + (w1.x - w0.x) * e, wy = w0.y + (w1.y - w0.y) * e;
      view.k = k; view.x = cx - wx * k; view.y = cy - wy * k;
      apply();
      if (p < 1) anim = requestAnimationFrame(step);
    };
    anim = requestAnimationFrame(step);
  }
  const stopFly = () => cancelAnimationFrame(anim);
  function focusNode(id, ms) {
    const p = L.nodes[id];
    if (!p) return;
    const a = visibleArea();
    const k = clamp(Math.max(view.k, Math.min(1.05, (a.w - 40) / p.w)), 0.62, 1.15);
    const b = {x: p.x + p.w / 2, y: p.y + p.h / 2};
    flyTo({k, x: a.x + a.w / 2 - b.x * k, y: a.y + a.h / 2 - b.y * k}, ms);
  }
  function fitBox(b, ms, cap) { flyTo(viewFor(b, 24, cap), ms); }
  /** 처음 보기: 공식이 있는 대단원이 든 과목 줄 전체 */
  function overviewBox() {
    const subj = new Set(D.nodes.map(n => IX.bigOf.get(IX.unitOf.get(n.unit).big).subject));
    let x0 = Infinity, x1 = -Infinity;
    for (const s of subj) { const b = L.subjects[s]; x0 = Math.min(x0, b.x); x1 = Math.max(x1, b.x + b.w); }
    if (!isFinite(x0)) return L.bounds;
    return {x: x0, y: 0, w: x1 - x0, h: L.bounds.h};
  }

  // 끌기 · 두 손가락 · 휠
  const pts = new Map();
  let drag = null, pinch = null, moved = false, hintGone = false;
  const goneHint = () => { if (!hintGone) { hintGone = true; $('hint').classList.add('gone'); } };
  map.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.target.closest('.fm-zoom,.fm-legend')) return;
    stopFly();
    pts.set(e.pointerId, {x: e.clientX, y: e.clientY});
    moved = false;
    if (pts.size === 1) drag = {x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, id: e.pointerId};
    else if (pts.size === 2) {
      const [p, q] = [...pts.values()];
      pinch = {d: Math.hypot(p.x - q.x, p.y - q.y), k: view.k, mx: (p.x + q.x) / 2, my: (p.y + q.y) / 2, vx: view.x, vy: view.y};
      drag = null;
    }
  });
  map.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, {x: e.clientX, y: e.clientY});
    const r = mapRect();
    if (pinch && pts.size >= 2) {
      const [p, q] = [...pts.values()];
      const d = Math.hypot(p.x - q.x, p.y - q.y), mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2;
      const k = clamp(pinch.k * d / pinch.d, kMin, K_MAX), f = k / pinch.k;
      const ox = pinch.mx - r.left, oy = pinch.my - r.top;
      view.k = k;
      view.x = ox - (ox - pinch.vx) * f + (mx - pinch.mx);
      view.y = oy - (oy - pinch.vy) * f + (my - pinch.my);
      moved = true; goneHint(); apply();
    } else if (drag && e.pointerId === drag.id) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!moved && Math.hypot(dx, dy) < 6) return;
      if (!moved) { moved = true; map.classList.add('drag'); try { map.setPointerCapture(e.pointerId); } catch (_) {} goneHint(); }
      view.x = drag.vx + dx; view.y = drag.vy + dy;
      apply();
    }
  });
  const up = e => {
    pts.delete(e.pointerId);
    if (pts.size < 2) pinch = null;
    if (pts.size === 1 && !pinch) { const [[pid, p]] = [...pts.entries()]; drag = {x: p.x, y: p.y, vx: view.x, vy: view.y, id: pid}; }
    if (!pts.size) { drag = null; map.classList.remove('drag'); }
  };
  map.addEventListener('pointerup', up);
  map.addEventListener('pointercancel', up);
  map.addEventListener('wheel', e => {
    e.preventDefault();
    stopFly(); goneHint();
    const r = mapRect();
    let dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1);
    zoomAt(Math.exp(-dy * (e.ctrlKey ? 0.012 : 0.0018)), e.clientX - r.left, e.clientY - r.top);
  }, {passive: false});
  map.addEventListener('dblclick', e => {
    if (e.target.closest('.fm-card,.fm-zoom')) return;
    const r = mapRect();
    zoomAt(1.8, e.clientX - r.left, e.clientY - r.top);
  });
  // 누르기: 끌지 않았을 때만
  map.addEventListener('click', e => {
    if (moved) { moved = false; return; }
    const c = e.target.closest('.fm-card');
    if (c) { select(c.dataset.id, {fly: true, push: true, soft: true}); return; }
    if (e.target.closest('.fm-zoom,.fm-legend')) return;
    const u = e.target.closest('.fm-unit');
    if (u && view.k < LOD[2]) { zoomUnit(u.dataset.unit, 600); return; }
    const b = e.target.closest('.fm-big');
    if (b && view.k < LOD[1]) { fitBox(L.bigs[b.dataset.big], 600); return; }
    if (cur) deselect(true);
  });
  // 마우스를 올리면 그 공식에 닿은 선을 진하게
  let hovId = null;
  map.addEventListener('pointerover', e => {
    if (e.pointerType !== 'mouse' || drag && moved) return;
    const c = e.target.closest('.fm-card'), id = c ? c.dataset.id : null;
    if (id === hovId) return;
    hovId = id;
    for (const {e: ed, el} of edgeEls) el.classList.toggle('h', !!id && (ed.from === id || ed.to === id));
  });
  map.addEventListener('keydown', e => {
    const a = visibleArea();
    const step = 90;
    const keys = {ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step]};
    if (keys[e.key] && !e.target.closest('.fm-card')) { view.x += keys[e.key][0]; view.y += keys[e.key][1]; apply(); e.preventDefault(); }
    else if (e.key === '+' || e.key === '=') { zoomAt(1.25, a.w / 2, a.h / 2); e.preventDefault(); }
    else if (e.key === '-' || e.key === '_') { zoomAt(0.8, a.w / 2, a.h / 2); e.preventDefault(); }
    else if (e.key === '0') { fitBox(L.bounds, 500); e.preventDefault(); }
  });
  $('zin').addEventListener('click', () => { const a = visibleArea(); zoomAt(1.4, a.w / 2, a.h / 2); });
  $('zout').addEventListener('click', () => { const a = visibleArea(); zoomAt(1 / 1.4, a.w / 2, a.h / 2); });
  $('zfit').addEventListener('click', () => fitBox(L.bounds, 600));

  // 지금 위치: 화면 가운데가 들어 있는 과목 › 대단원 › 단원
  let whereT = 0;
  function whereSoon() { clearTimeout(whereT); whereT = setTimeout(where, 120); }
  function where() {
    const a = visibleArea();
    const wx = (a.x + a.w / 2 - view.x) / view.k, wy = (a.y + a.h / 2 - view.y) / view.k;
    const inside = b => wx >= b.x && wx <= b.x + b.w && wy >= b.y && wy <= b.y + b.h;
    let h = '';
    const big = D.bigUnits.find(b => inside(L.bigs[b.id]));
    const subj = D.subjects.find(s => inside(L.subjects[s.id]));
    if (subj) h += `<span>${esc(subj.name)}</span>`;
    if (big) {
      h += `<span class="c${big.color} u">${big.roman}. ${esc(big.name)}</span>`;
      const u = D.units.find(x => x.big === big.id && inside(L.units[x.code]));
      if (u && view.k >= LOD[1]) h += `<span class="c${big.color} u">${esc(u.name)}</span>`;
    }
    $('where').innerHTML = h;
  }

  // ───────── 고르기 ─────────
  function select(id, o) {
    o = o || {};
    if (!IX.byId.has(id)) return;
    cur = id;
    const anc = FG.ancestors(IX, id), kids = new Set(IX.outE.get(id).map(e => e.to));
    const chain = new Set(anc); chain.add(id);
    for (const [nid, el] of cardOf) {
      el.classList.toggle('on', chain.has(nid) || kids.has(nid));
      el.classList.toggle('cur', nid === id);
      el.classList.toggle('anc', anc.has(nid));
      el.classList.toggle('kid', kids.has(nid));
    }
    for (const {e, el} of edgeEls) {
      el.classList.toggle('in', chain.has(e.to) && anc.has(e.from));
      el.classList.toggle('out', e.from === id);
    }
    map.classList.add('has-sel');
    showNode(id);
    if (o.push) pushHash();
    if (o.fly) {
      const p = L.nodes[id], a = visibleArea();
      const sx = p.x * view.k + view.x, sy = p.y * view.k + view.y;
      const inView = sx >= a.x + 10 && sy >= a.y + 10 && sx + p.w * view.k <= a.x + a.w - 10 && sy + p.h * view.k <= a.y + a.h - 10;
      if (!(o.soft && inView && view.k >= 0.55)) focusNode(id, o.ms);
    }
  }
  function deselect(push) {
    cur = null;
    map.classList.remove('has-sel');
    for (const [, el] of cardOf) el.classList.remove('on', 'cur', 'anc', 'kid');
    for (const {el} of edgeEls) el.classList.remove('in', 'out');
    closePanel();
    if (push) pushHash();
  }

  // ───────── 자세히 패널 ─────────
  function openPanel(mode) {
    panelMode = mode;
    panel.hidden = false;
    document.body.classList.add('panel-open');
    $('outlineBtn').setAttribute('aria-expanded', String(mode === 'outline'));
    panelIn.scrollTop = 0;
  }
  function closePanel() {
    panel.hidden = true; panelMode = null;
    panel.classList.remove('full');
    document.body.classList.remove('panel-open');
    $('outlineBtn').setAttribute('aria-expanded', 'false');
  }
  const closeBtn = '<button type="button" class="p-close" data-close aria-label="닫기"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg></button>';
  function chip(id, extra, cls) {
    const n = IX.byId.get(id);
    if (!n) return '';
    return `<button type="button" class="fm-chip ${n.role} ${cls || ''}" data-go="${esc(id)}" title="${esc(n.name)} — 지도에서 보기"><i></i><span class="nm">${esc(n.name)}</span>${extra ? `<small>${esc(extra)}</small>` : ''}</button>`;
  }
  function crumb(n) {
    const u = IX.unitOf.get(n.unit), b = IX.bigOf.get(u.big), s = IX.subjOf.get(b.subject);
    return `<div class="p-crumb"><span>${esc(s.name)}</span><span aria-hidden="true">›</span><button type="button" data-fit-big="${b.id}">${b.roman}. ${esc(b.name)}</button><span aria-hidden="true">›</span><button type="button" data-fit-unit="${u.code}">${esc(u.name)}</button></div>`;
  }
  function stepHtml(n, st, i) {
    const uses = (st.uses || []).map(u => {
      const e = IX.inE.get(n.id).find(x => x.from === u);
      return chip(u, e ? kindName(e.kind) : '', 'up');
    }).join('');
    const last = i === n.steps.length - 1;
    return `<li class="${last ? 'done' : ''}">${st.tex ? `<div class="s-tex">${tex(st.tex, true)}</div>` : ''}<p class="s-say">${esc(st.say)}</p>${uses ? `<div class="s-uses">${uses}</div>` : ''}</li>`;
  }
  function stepsBlock(n) {
    const total = n.steps.length, k = Math.min(reveal.get(n.id) || 1, total);
    let h = `<ol class="p-steps" id="steps">${n.steps.slice(0, k).map((s, i) => stepHtml(n, s, i)).join('')}</ol><div class="p-more">`;
    if (k < total) h += `<button type="button" class="btn go" data-next>다음 줄 펼치기 <span class="num">(${k}/${total})</span></button><button type="button" class="btn" data-all>모두 펼치기</button>`;
    else if (total > 1) h += `<button type="button" class="btn" data-reset>처음부터 한 줄씩</button>`;
    return h + '</div>';
  }
  function showNode(id) {
    const n = IX.byId.get(id);
    const color = nodeColor(n);
    let h = `<div class="p-top c${color}">${crumb(n)}${closeBtn}</div>`;
    h += `<span class="p-role ${n.role}">${esc(roleText(n))}</span><h2>${esc(n.name)}</h2>`;
    h += `<div class="p-tex">${tex(n.tex, true)}</div>`;
    if (n.forms && n.forms.length) h += `<div class="p-forms">다른 꼴 ${n.forms.map(f => `<span class="f">${tex(f)}</span>`).join('')}</div>`;
    if (n.role === 'basis') {
      h += `<h3>출발점 <small>유도하지 않고 정하거나 실험으로 확인한 것</small></h3><div class="p-basis"><div><b>무엇을 정한 것인지</b>${esc(n.basis.what)}</div><div><b>무엇으로 확인하는지</b>${esc(n.basis.check)}</div></div>`;
    } else {
      h += `<h3>유도 과정 <small>${n.steps.length}줄 · 칩을 누르면 그 공식으로</small></h3><div id="stepsWrap">${stepsBlock(n)}</div>`;
      const roots = [...FG.ancestors(IX, id)].filter(a => IX.byId.get(a).role === 'basis');
      if (roots.length) h += `<h3>뿌리가 되는 출발점 <small>${roots.length}개</small></h3><div class="p-chips">${roots.map(r => chip(r, '', 'up')).join('')}</div>`;
    }
    if (n.calc && n.calc.length) h += `<details class="p-calc"><summary>참고: 미적분으로 보면</summary>${n.calc.map(s => `<div class="s-tex">${tex(s.tex, true)}</div><p>${esc(s.say)}</p>`).join('')}</details>`;
    if (n.note) h += `<p class="p-note">${esc(n.note)}</p>`;
    const outs = IX.outE.get(id);
    if (outs.length) h += `<h3>이 공식에서 이어지는 것 <small>${outs.length}개</small></h3><div class="p-chips">${outs.map(e => chip(e.to, kindName(e.kind), 'down')).join('')}</div>`;
    if (n.concepts && n.concepts.length) {
      h += `<h3>관련 개념 실험</h3><ul class="p-concepts">${n.concepts.map(cid => {
        const c = concepts.get(cid), name = c ? c.concept.split(':')[0] : cid;
        return built.has(cid) && c
          ? `<li><a href="../${c.unit_code}/${pad(c.no)}/"><b>${cid}</b><span>${esc(name)}</span><em>실험 열기 →</em></a></li>`
          : `<li><span class="c"><b>${cid}</b><span>${esc(name)}</span><em>준비 중</em></span></li>`;
      }).join('')}</ul>`;
    }
    panelIn.innerHTML = h;
    openPanel('node');
  }
  function showOutline() {
    let h = `<div class="p-top"><div class="p-crumb">목차 · 과목 › 대단원 › 단원 › 공식</div>${closeBtn}</div>`;
    for (const s of D.subjects) {
      h += `<section class="o-subj"><h2>${esc(s.name)}</h2>`;
      for (const b of D.bigUnits.filter(x => x.subject === s.id)) {
        h += `<div class="o-big c${b.color}"><h3><b>${b.roman}.</b> ${esc(b.name)}</h3>`;
        for (const u of D.units.filter(x => x.big === b.id)) {
          const ns = D.nodes.filter(x => x.unit === u.code);
          if (!ns.length) { h += `<details class="o-unit empty"><summary>${esc(u.name)}<small>준비 중</small></summary></details>`; continue; }
          const open = cur && IX.byId.get(cur).unit === u.code;
          h += `<details class="o-unit"${open ? ' open' : ''}><summary>${esc(u.name)}<small>공식 ${ns.length}</small><span class="go" data-fit-unit="${u.code}" role="button" tabindex="0">지도에서</span></summary><div class="o-list">`;
          for (const r of ['basis', 'derived', 'applied']) {
            const rs = ns.filter(x => x.role === r);
            if (rs.length) h += `<div><h4>${r === 'basis' ? '출발점 (정의·법칙)' : ROLE[r]}</h4><div class="p-chips">${rs.map(x => chip(x.id)).join('')}</div></div>`;
          }
          h += '</div></details>';
        }
        h += '</div>';
      }
      h += '</section>';
    }
    panelIn.innerHTML = h;
    openPanel('outline');
  }
  panelIn.addEventListener('click', e => {
    const t = e.target;
    const go = t.closest('[data-go]');
    if (go) { select(go.dataset.go, {fly: true, push: true}); if (narrow.matches) panel.classList.remove('full'); return; }
    if (t.closest('[data-close]')) { if (panelMode === 'node') deselect(true); else closePanel(); return; }
    const fu = t.closest('[data-fit-unit]');
    if (fu) { e.preventDefault(); zoomUnit(fu.dataset.fitUnit, 600); if (narrow.matches) panel.classList.remove('full'); return; }
    const fb = t.closest('[data-fit-big]');
    if (fb) { fitBox(L.bigs[fb.dataset.fitBig], 600); return; }
    if (!cur) return;
    const n = IX.byId.get(cur);
    if (t.closest('[data-next]')) { reveal.set(cur, (reveal.get(cur) || 1) + 1); redrawSteps(n, true); }
    else if (t.closest('[data-all]')) { reveal.set(cur, n.steps.length); redrawSteps(n, false); }
    else if (t.closest('[data-reset]')) { reveal.set(cur, 1); redrawSteps(n, false); }
  });
  function redrawSteps(n, scroll) {
    $('stepsWrap').innerHTML = stepsBlock(n);
    if (scroll) {
      const li = $('steps').lastElementChild;
      if (li) li.scrollIntoView({block: 'nearest', behavior: reduce ? 'auto' : 'smooth'});
      const nx = panelIn.querySelector('[data-next]');
      if (nx) nx.focus({preventScroll: true});
    }
  }
  $('outlineBtn').addEventListener('click', () => {
    if (panelMode === 'outline') { if (cur) showNode(cur); else closePanel(); }
    else showOutline();
  });

  // 시트 손잡이(좁은 화면): 위로 끌면 크게, 아래로 끌면 작게·닫기
  (function grip() {
    const g = $('grip');
    let y0 = null;
    g.addEventListener('pointerdown', e => { y0 = e.clientY; g.setPointerCapture(e.pointerId); });
    g.addEventListener('pointerup', e => {
      if (y0 === null) return;
      const dy = e.clientY - y0; y0 = null;
      if (Math.abs(dy) < 6) panel.classList.toggle('full');
      else if (dy < -30) panel.classList.add('full');
      else if (dy > 40) { if (panel.classList.contains('full')) panel.classList.remove('full'); else if (panelMode === 'node') deselect(true); else closePanel(); }
    });
  })();

  // ───────── 찾기 ─────────
  let hits = [], hitI = -1;
  function showResults() {
    const q = qIn.value.trim();
    hits = q ? FG.search(D, q, 12) : [];
    hitI = hits.length ? 0 : -1;
    if (!q) { results.hidden = true; qIn.setAttribute('aria-expanded', 'false'); return; }
    results.innerHTML = hits.length ? hits.map((id, i) => {
      const n = IX.byId.get(id);
      return `<li role="option" id="r${i}" data-id="${esc(id)}" aria-selected="${i === hitI}"><span class="r-name">${esc(n.name)}</span><span class="r-unit">${esc(unitName(n.unit))}</span><span class="r-tex">${tex(n.tex)}</span></li>`;
    }).join('') : '<li class="r-none">찾는 공식이 없어요. 다른 낱말로 찾아보세요.</li>';
    results.hidden = false;
    qIn.setAttribute('aria-expanded', 'true');
    if (hitI >= 0) qIn.setAttribute('aria-activedescendant', 'r' + hitI); else qIn.removeAttribute('aria-activedescendant');
  }
  function mark() {
    results.querySelectorAll('li[data-id]').forEach((li, i) => li.setAttribute('aria-selected', String(i === hitI)));
    if (hitI >= 0) { qIn.setAttribute('aria-activedescendant', 'r' + hitI); const li = $('r' + hitI); if (li) li.scrollIntoView({block: 'nearest'}); }
  }
  function choose(id) {
    results.hidden = true; qIn.setAttribute('aria-expanded', 'false');
    if (narrow.matches) qIn.blur();
    select(id, {fly: true, push: true});
  }
  qIn.addEventListener('input', showResults);
  qIn.addEventListener('focus', () => { if (qIn.value.trim()) showResults(); });
  qIn.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' && hits.length) { hitI = (hitI + 1) % hits.length; mark(); e.preventDefault(); }
    else if (e.key === 'ArrowUp' && hits.length) { hitI = (hitI - 1 + hits.length) % hits.length; mark(); e.preventDefault(); }
    else if (e.key === 'Enter' && hitI >= 0) { choose(hits[hitI]); e.preventDefault(); }
    else if (e.key === 'Escape') { results.hidden = true; qIn.setAttribute('aria-expanded', 'false'); }
  });
  results.addEventListener('pointerdown', e => e.preventDefault());   // 입력칸 초점 유지
  results.addEventListener('click', e => { const li = e.target.closest('li[data-id]'); if (li) choose(li.dataset.id); });
  document.addEventListener('click', e => { if (!e.target.closest('.fm-search')) { results.hidden = true; qIn.setAttribute('aria-expanded', 'false'); } });
  document.addEventListener('keydown', e => {
    if (e.key === '/' && document.activeElement !== qIn && !e.ctrlKey && !e.metaKey) { qIn.focus(); qIn.select(); e.preventDefault(); }
    else if (e.key === 'Escape' && document.activeElement !== qIn && !panel.hidden) { if (panelMode === 'node') deselect(true); else closePanel(); }
  });

  // ───────── 테마 ─────────
  $('themeBtn').addEventListener('click', () => {
    const dark = document.documentElement.dataset.theme ? document.documentElement.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    const t = dark ? 'light' : 'dark';
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem('formulas.theme', t); } catch (e) {}
  });

  // ───────── 주소 ─────────
  function readHash() {
    const p = new URLSearchParams(location.hash.slice(1));
    const v = (p.get('v') || '').split(',').map(Number);
    return {f: p.get('f'), v: v.length === 3 && v.every(isFinite) && v[2] > 0 ? v : null};
  }
  function hashStr() {
    const a = visibleArea();
    const cx = (a.x + a.w / 2 - view.x) / view.k, cy = (a.y + a.h / 2 - view.y) / view.k;
    const s = (cur ? `f=${encodeURIComponent(cur)}&` : '') + `v=${Math.round(cx)},${Math.round(cy)},${view.k.toFixed(3)}`;
    return '#' + s;
  }
  let hashT = 0;
  function hashSoon() { clearTimeout(hashT); hashT = setTimeout(() => { try { history.replaceState(history.state, '', hashStr()); } catch (e) {} }, 350); }
  function pushHash() { clearTimeout(hashT); try { history.pushState({f: cur}, '', hashStr()); } catch (e) {} }
  function viewFromHash(v) {
    const a = visibleArea(), k = clamp(v[2], kMin, K_MAX);
    return {k, x: a.x + a.w / 2 - v[0] * k, y: a.y + a.h / 2 - v[1] * k};
  }
  window.addEventListener('popstate', () => {
    const h = readHash();
    if (h.f && IX.byId.has(h.f)) select(h.f, {fly: !h.v, push: false});
    else if (cur) deselect(false);
    if (h.v) flyTo(viewFromHash(h.v), 400);
  });

  let resizeT = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => { kMin = Math.min(0.08, fitScale(L.bounds, 0) * 0.85); apply(); }, 150);
  });

  // ───────── 시작 ─────────
  async function start() {
    const [d, c, b] = await Promise.all([
      fetch('../data/formulas.json').then(r => r.json()),
      fetch('../data/physics_concepts.json').then(r => r.json()).catch(() => ({concepts: []})),
      fetch('../data/built.json').then(r => r.json()).catch(() => ({built: []})),
    ]);
    D = d; IX = FG.index(D);
    for (const u of D.units) colorOfUnit.set(u.code, IX.bigOf.get(u.big).color);
    for (const x of c.concepts || []) concepts.set(x.id, x);
    built = new Set(b.built || []);
    buildRegions(); buildEdges(); buildCards();
    void cardsEl.offsetWidth;
    try { await document.fonts.ready; } catch (e) {}
    measure(); place();
    $('loading').remove();
    const h = readHash();
    if (h.f && IX.byId.has(h.f)) {
      select(h.f, {fly: !h.v, push: false, ms: 0});
      if (h.v) flyTo(viewFromHash(h.v), 0);
    } else if (h.v) flyTo(viewFromHash(h.v), 0);
    else flyTo(viewFor(overviewBox(), 16, 0, true), 0);
    apply();
    setTimeout(goneHint, 7000);
    // 글꼴이 늦게 오면 다시 잰다
    if (document.fonts && document.fonts.addEventListener) {
      let t = 0;
      document.fonts.addEventListener('loadingdone', () => { clearTimeout(t); t = setTimeout(() => { measure(); place(); apply(); }, 120); });
    }
    window.__fm = {view, select, focusNode, fitBox, L: () => L, D, IX};   // 확인용
  }
  start().catch(err => { console.error(err); $('loading').textContent = '공식 지도를 불러오지 못했어요. 새로고침해 주세요.'; });
})();
