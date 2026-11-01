/* 별까지의 거리 — 네 실험이 같은 모형(star-distance-model.js)을 쓴다. */
(() => {
  'use strict';
  const M = window.StarDistanceModel, $ = id => document.getElementById(id);
  const NS = 'http://www.w3.org/2000/svg';
  const reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  // ── 작은 도구들 ─────────────────────────────────────────────
  function el(tag, attrs, parent, text) {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs || {}) if (attrs[k] !== undefined && attrs[k] !== null) n.setAttribute(k, attrs[k]);
    if (text !== undefined) n.textContent = text;
    if (parent) parent.appendChild(n);
    return n;
  }
  const clear = n => { while (n.firstChild) n.removeChild(n.firstChild); };
  const setA = (n, attrs) => { for (const k in attrs) n.setAttribute(k, attrs[k]); return n; };
  function lin(d0, d1, r0, r1) {
    const f = v => r0 + (v - d0) * (r1 - r0) / (d1 - d0);
    f.inv = p => d0 + (p - r0) * (d1 - d0) / (r1 - r0);
    return f;
  }
  function logScale(v0, v1, r0, r1) {
    const a = Math.log10(v0), b = Math.log10(v1);
    const f = v => r0 + (Math.log10(v) - a) * (r1 - r0) / (b - a);
    f.inv = p => 10 ** (a + (p - r0) * (b - a) / (r1 - r0));
    return f;
  }
  // 음수는 수학 기호 −로. −0.00 같은 표기는 피한다.
  function num(v, d = 2) {
    const s = Math.abs(v).toFixed(d);
    return (v < 0 && +s !== 0 ? '−' : '') + s;
  }
  // 유효 숫자 n자리. 2.5, 20, 0.05처럼 딱 떨어지는 값은 뒤의 0을 붙이지 않는다.
  function fmtNum(v, n = 3) {
    if (!isFinite(v)) return '∞';
    const a = Math.abs(v);
    let s;
    if (a >= 10 ** n) s = Math.round(a).toLocaleString('ko-KR');
    else {
      s = a.toPrecision(n);
      for (let k = 1; k < n; k++) {
        const t = +a.toPrecision(k);
        if (Math.abs(t - a) <= 1e-9 * Math.max(a, 1e-12)) { s = String(t); break; }
      }
      if (s.includes('e')) s = String(+s);
    }
    return (v < 0 && a > 0 ? '−' : '') + s;
  }
  const fmtP = p => `${fmtNum(p, 3)}″`;
  const fmtPc = (r, n = 3) => `${fmtNum(r, n)} pc`;
  function fmtLy(r) {
    const ly = M.pcToLy(r);
    return `약 ${ly < 10 ? num(ly, 1) : Math.round(ly).toLocaleString('ko-KR')}광년`;
  }
  const mag = v => num(v, Math.abs(v * 10 - Math.round(v * 10)) < 1e-9 ? (Math.abs(v - Math.round(v)) < 1e-9 ? 0 : 1) : 2);
  const magP = v => (v < 0 ? `(${mag(v)})` : mag(v));   // 빼기 뒤의 음수는 괄호로
  // 교과서 표의 별 값은 교과서와 같은 자릿수로 (dg: 소수 자리 수)
  const sv = (s, v) => num(v, s.dg === undefined ? 2 : s.dg);
  const svP = (s, v) => (v < 0 ? `(${sv(s, v)})` : sv(s, v));
  const fr = (n, d) => `<span class="frac"><span>${n}</span><span>${d}</span></span>`;
  const pw = (b, e) => `${b}<sup>${e}</sup>`;
  const par = (x, sq) => `<span class="paren">(</span>${x}<span class="paren">)</span>${sq ? `<sup class="sq">${sq}</sup>` : ''}`;
  const small = () => window.innerWidth < 640;
  // 받침이 있으면 a(을·이·은), 없으면 b(를·가·는)
  function josa(word, a, b) {
    const c = word.charCodeAt(word.length - 1);
    return word + (c >= 0xAC00 && c <= 0xD7A3 && (c - 0xAC00) % 28 ? a : b);
  }
  function svgPoint(svg, evt) {
    const pt = svg.createSVGPoint();
    pt.x = evt.clientX; pt.y = evt.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  }
  // 누르고 끄는 동작. target이 눌림을 받고, 좌표는 svg 기준. 세로 스크롤은 CSS touch-action에 맡긴다.
  function onDrag(target, svg, handler) {
    let active = null;
    target.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      active = e.pointerId;
      try { target.setPointerCapture(e.pointerId); } catch (_) {}
      handler(svgPoint(svg, e), 'start');
    });
    target.addEventListener('pointermove', e => { if (active === e.pointerId) handler(svgPoint(svg, e), 'move'); });
    const end = e => { if (active === e.pointerId) { active = null; handler(null, 'end'); } };
    target.addEventListener('pointerup', end);
    target.addEventListener('pointercancel', end);
  }
  function setPressed(container, attr, value) {
    container.querySelectorAll(`[${attr}]`).forEach(b => b.setAttribute('aria-pressed', String(b.getAttribute(attr) === String(value))));
  }
  // SVG 안의 세로 분수 (분자 위, 분모 아래). fs = 글자 크기(viewBox 단위)
  function svgFrac(parent, x, y, n, d, o) {
    const fill = o.fill || '#14283a', fs = o.fs || 12;
    const g = el('g', {}, parent);
    el('text', {x, y: y - 0.3 * fs, 'text-anchor': 'middle', class: o.cls, fill}, g, n);
    el('text', {x, y: y + 1.05 * fs, 'text-anchor': 'middle', class: o.cls, fill}, g, d);
    const w = Math.max(String(n).length, String(d).length) * fs * 0.62 + 6;
    el('line', {x1: x - w / 2, x2: x + w / 2, y1: y, y2: y, stroke: fill, 'stroke-width': 1.4}, g);
    return g;
  }
  // 간단한 난수(같은 seed는 같은 배경 별)
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function glowGrad(defs, id, color) {
    const g = el('radialGradient', {id}, defs);
    el('stop', {offset: '0%', 'stop-color': '#fff', 'stop-opacity': 0.95}, g);
    el('stop', {offset: '35%', 'stop-color': color, 'stop-opacity': 0.75}, g);
    el('stop', {offset: '100%', 'stop-color': color, 'stop-opacity': 0}, g);
  }
  const ease = t => t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
  // 짧은 움직임: 줄임 모드면 바로 끝낸다
  function tween(ms, step, done) {
    if (reduceMotion) { step(1); if (done) done(); return () => {}; }
    let t0 = null, stop = false;
    const f = now => {
      if (stop) return;
      if (t0 === null) t0 = now;
      const t = Math.min(1, (now - t0) / ms);
      step(ease(t));
      if (t < 1) requestAnimationFrame(f); else if (done) done();
    };
    requestAnimationFrame(f);
    return () => { stop = true; };
  }

  // ── 실험 전환 ─────────────────────────────────────────────
  const stations = {};
  const NAMES = {parallax: 's1', magnitude: 's2', modulus: 's3', compare: 's4'};
  let current = 's1';
  function show(name) {
    name = NAMES[name] || name;
    if (!stations[name]) name = 's1';
    current = name;
    setPressed(document.querySelector('.stations'), 'data-station', name);
    document.querySelectorAll('.station').forEach(s => { s.hidden = s.id !== 'station-' + name; });
    stations[name].render();
    try { history.replaceState(null, '', '#' + name); } catch (_) {}
  }
  document.querySelectorAll('.stations button').forEach(b => b.addEventListener('click', () => {
    show(b.dataset.station);
    document.querySelector('.stations').scrollIntoView({block: 'nearest'});
  }));

  // ═══════════════ 01 연주 시차 ═══════════════
  stations.s1 = (() => {
    const top = $('px-top'), scope = $('px-scope'), ruler = $('px-ruler');
    const PRESETS = [
      {id: 'pc', name: '1 pc', tag: '연주 시차 1″', p: 1, zoom: 1},
      {id: 'proxima', name: '프록시마 센타우리', tag: '0.77″', p: 0.77, zoom: 1},
      {id: 'sirius', name: '시리우스', tag: '0.37″', p: 0.37, zoom: 1},
      {id: 'bessel', name: '백조자리 61', tag: '베셀 1838', p: 0.314, zoom: 1},
      {id: 'limit', name: '100 pc 떨어진 별', tag: '0.01″', p: 0.01, zoom: 100},
      {id: 'q1', name: 'Q1 별 A와 B', tag: '활동지', mode: 'q1', zoom: 1},
      {id: 'review5', name: '6개월 간격 사진 두 장', tag: '교과서 85쪽', mode: 'review5', p: M.review5Parallax(), zoom: 10}
    ];
    const STORY = {
      pc: `연주 시차가 1″인 별까지의 거리가 바로 <b>1 pc(파섹)</b>입니다. 1 pc ≈ 3.26광년 ≈ 3.09 × 10¹³ km ≈ 206 265 AU. 실제로 이렇게 가까운 별은 없습니다 — 가장 가까운 프록시마 센타우리도 0.77″입니다.`,
      proxima: `프록시마 센타우리는 태양 다음으로 가까운 별입니다. 그런데도 연주 시차는 <b>0.77″</b>로 1″보다 작습니다(교과서 64쪽). → 1.30 pc, 약 4.2광년.`,
      sirius: `밤하늘에서 가장 밝은 별 시리우스(큰개자리)의 연주 시차는 0.37″입니다(교과서 66쪽 해 보기). 04에서 거리 지수로 구한 값과 비교해 봅니다.`,
      bessel: `<b>1838년 베셀</b>이 백조자리 61의 연주 시차(0.314″)를 처음으로 쟀습니다 → 약 10광년(오늘날 측정값은 11.4광년). 별까지의 거리를 처음 잰 순간이자, 지구가 공전한다는 직접 증거였습니다. 티코 브라헤는 1580년대의 정밀한 관측으로도 연주 시차를 찾지 못했습니다.`,
      limit: `100 pc 떨어진 별의 연주 시차는 <b>0.01″</b>입니다. 1 cm를 약 206 km 떨어진 곳에서 보는 각이에요. 이보다 먼 별은 연주 시차가 너무 작아 지상에서 재기 어렵습니다(교과서 64쪽).`
    };
    const st = {p: 0.77, months: 0, playing: !reduceMotion, zoom: 1, inst: 'ground', mode: 'free', preset: 'proxima'};

    // 위에서 본 그림의 배치(과장한 그림)
    const CX = 260, SY = 366, R = 82, BG_Y = 41, D0 = 100, D1 = 300, RMIN = 1, RMAX = 1e4;
    const Dpx = r => D0 + (D1 - D0) * Math.log10(M.clamp(r, RMIN, RMAX) / RMIN) / Math.log10(RMAX / RMIN);
    const rFromD = d => RMIN * 10 ** ((d - D0) / (D1 - D0) * Math.log10(RMAX / RMIN));

    // ── 프리셋 칩 ──
    const chips = $('px-presets');
    PRESETS.forEach(pr => {
      const b = document.createElement('button');
      b.type = 'button'; b.dataset.preset = pr.id;
      b.innerHTML = `${pr.name}<span class="tag">${pr.tag}</span>`;
      b.addEventListener('click', () => {
        st.preset = pr.id; st.mode = pr.mode || 'free';
        if (pr.p) st.p = pr.p;
        st.zoom = pr.zoom || 1;
        if (pr.id === 'limit' && st.inst !== 'ground') st.inst = 'ground';
        if (st.mode === 'review5') { st.months = 6; }
        render();
      });
      chips.appendChild(b);
    });
    document.querySelectorAll('#px-zoom [data-zoom]').forEach(b => b.addEventListener('click', () => { st.zoom = +b.dataset.zoom; render(); }));
    document.querySelectorAll('#px-inst [data-inst]').forEach(b => b.addEventListener('click', () => { st.inst = b.dataset.inst; render(); }));
    $('px-month').addEventListener('input', e => { st.months = +e.target.value; setPlaying(false); frame(); });
    $('px-play').addEventListener('click', () => setPlaying(!st.playing));
    $('px-r-in').addEventListener('input', e => {
      st.p = 1 / 10 ** +e.target.value;
      st.mode = 'free'; st.preset = matchPreset();
      render();
    });
    function setPlaying(v) {
      st.playing = v;
      $('px-play').textContent = v ? '❚❚ 멈춤' : '▶ 1년 돌리기';
      if (v) ensureLoop();
    }

    // ── 위에서 본 그림: 고정 요소 ──
    const defs = el('defs', {}, top);
    const sunG = el('radialGradient', {id: 'px-sun'}, defs);
    el('stop', {offset: '0%', 'stop-color': '#fff4d6'}, sunG);
    el('stop', {offset: '60%', 'stop-color': '#f2a33a'}, sunG);
    el('stop', {offset: '100%', 'stop-color': '#f2a33a', 'stop-opacity': 0}, sunG);
    glowGrad(defs, 'px-glow-s', '#f2a33a');
    glowGrad(defs, 'px-glow-a', '#7fd6ea');
    glowGrad(defs, 'px-glow-b', '#ffb070');
    const rnd = rng(7);
    const bgStars = el('g', {}, top);
    for (let i = 0; i < 70; i++) el('circle', {cx: (8 + 504 * rnd()).toFixed(1), cy: (BG_Y - 18 + 36 * rnd()).toFixed(1), r: (0.8 + 1.6 * rnd()).toFixed(1), fill: '#b8c4d2', opacity: (0.35 + 0.5 * rnd()).toFixed(2)}, bgStars);
    el('text', {x: 10, y: 15, class: 'lbl', fill: '#a9bccb'}, top, '멀리 있는 배경 별');
    el('circle', {cx: CX, cy: SY, r: R, fill: 'none', stroke: '#5d7890', 'stroke-width': 1.5, 'stroke-dasharray': '5 6'}, top);
    el('circle', {cx: CX, cy: SY, r: 22, fill: 'url(#px-sun)'}, top);
    el('circle', {cx: CX, cy: SY, r: 9, fill: '#ffd36b'}, top);
    el('text', {x: CX + 15, y: SY + 22, class: 'lbl'}, top, '태양');
    // 지구–태양 거리 1 AU (반지름)
    el('line', {x1: CX - R + 8, x2: CX - 12, y1: SY, y2: SY, stroke: '#dfe9f1', 'stroke-width': 1.2, opacity: 0.55}, top);
    el('text', {x: CX - R / 2 - 4, y: SY - 7, 'text-anchor': 'middle', class: 'tick', fill: '#dfe9f1'}, top, '1 AU');
    [[CX - R, 'E₁', 'end', -14], [CX + R, 'E₂ (6개월 뒤)', 'start', 14]].forEach(([x, t, a, dx]) => {
      el('circle', {cx: x, cy: SY, r: 7, fill: 'none', stroke: '#8fb3ff', 'stroke-width': 1.8}, top);
      el('text', {x: x + dx, y: SY + 5, 'text-anchor': a, class: 'lbl-b', fill: '#8fb3ff'}, top, t);
    });

    // ── 위에서 본 그림: 움직이는 요소 ──
    const dyn = el('g', {}, top);
    function makeSet(color, glowId) {
      const g = el('g', {}, dyn);
      const o = {
        g,
        e1: el('line', {stroke: color, 'stroke-width': 1.6, 'stroke-dasharray': '6 5', opacity: 0.7}, g),
        e2: el('line', {stroke: color, 'stroke-width': 1.6, 'stroke-dasharray': '6 5', opacity: 0.7}, g),
        cur: el('line', {stroke: '#ffffff', 'stroke-width': 2, opacity: 0.85}, g),
        s1: el('circle', {r: 7, fill: '#0f2235', stroke: color, 'stroke-width': 2.4}, g),
        s2: el('circle', {r: 7, fill: '#0f2235', stroke: color, 'stroke-width': 2.4}, g),
        s1l: el('text', {class: 'lbl-b', fill: color}, g, 'S₁'),
        s2l: el('text', {class: 'lbl-b', fill: color, 'text-anchor': 'end'}, g, 'S₂'),
        hitM: el('circle', {r: 4, fill: '#fff'}, g),
        rLine: el('line', {stroke: '#dfe9f1', 'stroke-width': 1.3, 'stroke-dasharray': '3 5', opacity: 0.8}, g),
        rLab: el('text', {class: 'lbl', 'font-style': 'italic'}, g, 'r'),
        arc: el('path', {fill: 'none', stroke: color, 'stroke-width': 2.4}, g),
        pLab: el('text', {class: 'lbl-b', fill: color, 'font-style': 'italic', 'text-anchor': 'middle'}, g, 'p'),
        glow: el('circle', {r: 19, fill: `url(#${glowId})`}, g),
        body: el('circle', {r: 6.5, fill: color, stroke: '#fff', 'stroke-width': 1.2}, g),
        name: el('text', {class: 'lbl-b'}, g, '별 S')
      };
      o.update = (D, E, label, showR) => {
        const S = {x: CX, y: SY - D};
        const hit = P => P.x + (S.x - P.x) * (BG_Y - P.y) / (S.y - P.y);
        const E1 = {x: CX - R, y: SY}, E2 = {x: CX + R, y: SY};
        const h1 = hit(E1), h2 = hit(E2), hc = hit(E);
        setA(o.e1, {x1: E1.x, y1: E1.y, x2: h1, y2: BG_Y});
        setA(o.e2, {x1: E2.x, y1: E2.y, x2: h2, y2: BG_Y});
        setA(o.cur, {x1: E.x, y1: E.y, x2: hc, y2: BG_Y});
        setA(o.s1, {cx: h1, cy: BG_Y}); setA(o.s2, {cx: h2, cy: BG_Y});
        setA(o.s1l, {x: h1 + 11, y: BG_Y + 23}); setA(o.s2l, {x: h2 - 11, y: BG_Y + 23});
        setA(o.hitM, {cx: hc, cy: BG_Y});
        o.rLine.style.display = o.rLab.style.display = showR ? '' : 'none';
        setA(o.rLine, {x1: CX, y1: S.y + 9, x2: CX, y2: SY - 24});
        setA(o.rLab, {x: CX + 7, y: (S.y + SY) / 2 + 4});
        // 연주 시차 p: 별에서 태양 쪽과 E₁ 쪽 사이의 각
        const a1 = Math.PI / 2, a2 = Math.atan2(E1.y - S.y, E1.x - S.x), rr = 30;
        setA(o.arc, {d: `M${(S.x + rr * Math.cos(a1)).toFixed(1)} ${(S.y + rr * Math.sin(a1)).toFixed(1)}A${rr} ${rr} 0 0 1 ${(S.x + rr * Math.cos(a2)).toFixed(1)} ${(S.y + rr * Math.sin(a2)).toFixed(1)}`});
        const am = (a1 + a2) / 2;
        setA(o.pLab, {x: (S.x + 48 * Math.cos(am) - 6).toFixed(1), y: (S.y + 48 * Math.sin(am) + 5).toFixed(1)});
        setA(o.glow, {cx: S.x, cy: S.y}); setA(o.body, {cx: S.x, cy: S.y});
        setA(o.name, {x: S.x + 13, y: S.y - 9});
        o.name.textContent = label;
        return S;
      };
      return o;
    }
    const setMain = makeSet('#f2a33a', 'px-glow-s');
    const setB = makeSet('#ffb070', 'px-glow-b');
    const earth = el('circle', {r: 8, fill: '#3d6fe0', stroke: '#fff', 'stroke-width': 1.5}, dyn);
    const earthLab = el('text', {class: 'lbl-b', fill: '#8fb3ff', 'text-anchor': 'middle'}, dyn, '지구');
    const handle = el('circle', {r: 28, fill: '#fff', 'fill-opacity': 0, class: 'drag-handle'}, top);
    el('title', {}, handle, '별 S를 위아래로 끌어 거리를 바꾸기');
    onDrag(handle, top, (pt, phase) => {
      if (phase === 'end' || !pt) return;
      const D = M.clamp(SY - pt.y, D0, D1);
      st.p = 1 / rFromD(D);
      st.mode = 'free'; st.preset = matchPreset();
      render();
    });
    function matchPreset() {
      const hitP = PRESETS.find(pr => !pr.mode && Math.abs(Math.log10(pr.p / st.p)) < 0.012);
      if (hitP) { st.p = hitP.p; return hitP.id; }
      return null;
    }

    function earthAt(months) {
      const e = M.earthPosition(months);
      return {x: CX + R * e.x, y: SY - R * e.y};
    }
    function stars() {
      if (st.mode === 'q1') return [{p: M.Q1.A, label: '별 A', color: '#7fd6ea', glow: 'px-glow-a'}, {p: M.Q1.B, label: '별 B', color: '#ffb070', glow: 'px-glow-b'}];
      return [{p: st.p, label: st.mode === 'review5' ? '별 A' : '별 S', color: '#f2a33a', glow: 'px-glow-s'}];
    }
    function drawTop() {
      const E = earthAt(st.months), ss = stars();
      const colorSet = (set, s) => {
        [set.e1, set.e2].forEach(n => n.setAttribute('stroke', s.color));
        [set.s1, set.s2].forEach(n => n.setAttribute('stroke', s.color));
        [set.s1l, set.s2l, set.pLab].forEach(n => n.setAttribute('fill', s.color));
        set.body.setAttribute('fill', s.color); set.glow.setAttribute('fill', `url(#${s.glow})`);
      };
      colorSet(setMain, ss[0]);
      const S = setMain.update(Dpx(1 / ss[0].p), E, ss[0].label, ss.length === 1);
      setB.g.style.display = ss.length > 1 ? '' : 'none';
      if (ss.length > 1) { colorSet(setB, ss[1]); setB.update(Dpx(1 / ss[1].p), E, ss[1].label, false); }
      setA(earth, {cx: E.x.toFixed(1), cy: E.y.toFixed(1)});
      const ox = (E.x - CX) / R, oy = (E.y - SY) / R;
      // E₁·E₂ 근처에서는 글자가 겹치지 않게 지구 아래에 쓴다
      if (Math.abs(oy) < 0.5) setA(earthLab, {x: E.x.toFixed(1), y: (E.y + 27).toFixed(1)});
      else setA(earthLab, {x: (E.x + ox * 22).toFixed(1), y: (E.y + oy * 22 + 5).toFixed(1)});
      setA(handle, {cx: S.x, cy: S.y});
      handle.style.display = st.mode === 'q1' ? 'none' : '';
    }

    // ── 망원경 시야 ──
    const F = {l: 14, r: 506, t: 14, b: 206, cx: 260, cy: 110};
    const bgSky = [];
    (() => {
      const r2 = rng(21);
      [1, 0.1, 0.01].forEach(L => {
        for (let i = 0; i < 26; i++) {
          const y = (r2() * 2 - 1) * 0.42 * L;
          if (Math.abs(y) < 0.07 * L) continue;
          bgSky.push({x: (r2() * 2 - 1) * 1.08 * L, y, L, b: r2()});
        }
      });
    })();
    let scopeDots = [];
    function drawScope() {
      clear(scope);
      scopeDots = [];
      const defsS = el('defs', {}, scope);
      glowGrad(defsS, 'sc-glow-s', '#f2a33a'); glowGrad(defsS, 'sc-glow-a', '#7fd6ea'); glowGrad(defsS, 'sc-glow-b', '#ffb070');
      if (st.mode === 'review5') return drawReview5();
      const half = 1 / st.zoom, k = (F.r - F.cx - 14) / half; // px / ″
      el('rect', {x: F.l, y: F.t, width: F.r - F.l, height: F.b - F.t, rx: 12, fill: '#08131f', stroke: '#35526d'}, scope);
      bgSky.forEach(s => {
        if (s.L < half * 0.99) return;     // 이 배율보다 더 작은 눈금의 별은 그리지 않는다
        const x = F.cx + s.x * k, y = F.cy + s.y * k;
        if (x < F.l + 6 || x > F.r - 6 || y < F.t + 6 || y > F.b - 6) return;
        el('circle', {cx: x.toFixed(1), cy: y.toFixed(1), r: (1 + 1.8 * s.b).toFixed(1), fill: '#c9d6e4', opacity: (0.35 + 0.5 * s.b).toFixed(2)}, scope);
      });
      // 측정 한계: 흔들림(±p)이 이 띠 안에 들어가면 재기 어렵다
      const lim = M.LIMITS[st.inst].p, lw = lim * k;
      if (lw >= 0.6) {
        el('rect', {x: (F.cx - lw).toFixed(1), y: F.t + 1, width: (2 * lw).toFixed(1), height: F.b - F.t - 2, fill: '#ff8a8a', opacity: 0.13}, scope);
        if (lw > 3) [-1, 1].forEach(sg => el('line', {x1: F.cx + sg * lw, x2: F.cx + sg * lw, y1: F.t + 1, y2: F.b - 1, stroke: '#ff9d9d', 'stroke-dasharray': '4 4', opacity: 0.6}, scope));
        const txt = `${st.inst === 'ground' ? '지상' : 'Gaia'} 관측 한계 (p = ${fmtNum(lim)}″)`;
        el('text', {x: lw > 120 ? F.cx : F.cx + lw + 6, y: F.t + 18, 'text-anchor': lw > 120 ? 'middle' : 'start', class: 'tick halo', fill: '#ffb3b3'}, scope, txt);
      }
      const ss = stars(), rows = ss.length > 1 ? [F.cy - 34, F.cy + 40] : [F.cy + 8];
      let tiny = false;
      ss.forEach((s, i) => {
        const y = rows[i], a = s.p * k;
        if (a < 3) tiny = true;
        // 한 해 동안의 자리(매달)
        for (let mo = 0; mo < 12; mo++) el('circle', {cx: (F.cx + M.apparentOffset(s.p, mo) * k).toFixed(1), cy: y, r: 2.4, fill: s.color, opacity: 0.35}, scope);
        if (a >= 1) el('line', {x1: F.cx - a, x2: F.cx + a, y1: y, y2: y, stroke: s.color, 'stroke-width': 1.5, opacity: 0.4}, scope);
        [[a, 'S₁', 'E₁일 때'], [-a, 'S₂', 'E₂일 때']].forEach(([dx, t, cap]) => {
          el('circle', {cx: F.cx + dx, cy: y, r: 7, fill: 'none', stroke: s.color, 'stroke-width': 2}, scope);
          if (ss.length === 1 && a >= 14) {
            // 시야 가장자리에 가까우면 글자를 안쪽으로
            const out = Math.abs(dx) < 170, sgn = dx > 0 ? 1 : -1, dir = out ? sgn : -sgn;
            const anchor = dir > 0 ? 'start' : 'end';
            el('text', {x: F.cx + dx + dir * 11, y: y - 10, 'text-anchor': anchor, class: 'lbl-b', fill: s.color}, scope, t);
            el('text', {x: F.cx + dx + dir * 11, y: y + 22, 'text-anchor': anchor, class: 'tick'}, scope, cap);
          }
        });
        if (a >= 18) {
          const yb = y - (ss.length > 1 ? 22 : 34);
          el('path', {d: `M${F.cx - a} ${yb + 5}V${yb}H${F.cx + a}V${yb + 5}`, stroke: '#dfe9f1', fill: 'none', 'stroke-width': 1.3}, scope);
          el('text', {x: F.cx, y: yb - 6, 'text-anchor': 'middle', class: 'tick halo', fill: '#dfe9f1'}, scope, ss.length > 1 ? `${s.label.replace('별 ', '')}: 시차 ${fmtNum(2 * s.p)}″` : `시차 = 2p = ${fmtNum(2 * s.p)}″`);
          if (ss.length === 1) {
            const yp = y + 36;
            el('path', {d: `M${F.cx} ${yp - 5}V${yp}H${F.cx + a}V${yp - 5}`, stroke: s.color, fill: 'none', 'stroke-width': 1.3}, scope);
            el('text', {x: F.cx + a / 2, y: yp + 16, 'text-anchor': 'middle', class: 'tick halo', fill: s.color}, scope, `p = ${fmtNum(s.p)}″`);
          }
        }
        if (ss.length > 1) el('text', {x: F.l + 10, y: y + 5, class: 'lbl-b', fill: s.color}, scope, s.label);
        const glow = el('circle', {r: 13, fill: `url(#${s.glow.replace('px-', 'sc-')})`, cy: y}, scope);
        const dot = el('circle', {r: 4.5, fill: '#fff', cy: y}, scope);
        scopeDots.push({glow, dot, p: s.p});
      });
      // 눈금 막대
      const sv = 0.5 / st.zoom, sl = sv * k, sy = 232;
      el('path', {d: `M${F.l + 4} ${sy - 5}V${sy}H${F.l + 4 + sl}V${sy - 5}`, stroke: '#a9bccb', fill: 'none', 'stroke-width': 1.5}, scope);
      el('text', {x: F.l + 10 + sl, y: sy + 4, class: 'tick'}, scope, `${fmtNum(sv)}″`);
      el('text', {x: F.r, y: sy + 4, 'text-anchor': 'end', class: 'tick'}, scope, `시야 폭 ${fmtNum(2 * half)}″ (×${st.zoom})`);
      $('px-scope-note').innerHTML = tiny
        ? '흔들림이 너무 작아 이 배율에서는 거의 보이지 않습니다. <b>배율을 높여</b> 보세요.'
        : (ss.length > 1 ? '연주 시차가 4배인 별 B가 4배 크게 흔들립니다.' : '배경 별은 아주 멀어서 거의 움직이지 않고, 가까운 별 S만 1년 동안 S₁과 S₂ 사이를 오갑니다.');
      moveScope();
    }
    function drawReview5() {
      // 교과서 85쪽 단원 마무리 5번: 6개월 간격 사진 두 장
      const k = 900, B = 0.02, frames = [{x0: 14, name: '처음 (지구 E₂)', a: -M.REVIEW5.before + B}, {x0: 270, name: '6개월 후 (지구 E₁)', a: B + M.REVIEW5.after}];
      const rr = rng(5);
      frames.forEach((f, i) => {
        const w = 236, cx = f.x0 + w / 2 - 10, cy = 112;
        el('rect', {x: f.x0, y: 30, width: w, height: 168, rx: 10, fill: '#08131f', stroke: '#35526d'}, scope);
        for (let j = 0; j < 16; j++) el('circle', {cx: (f.x0 + 8 + (w - 16) * rr()).toFixed(1), cy: (38 + 152 * rr()).toFixed(1), r: (0.8 + 1.2 * rr()).toFixed(1), fill: '#c9d6e4', opacity: 0.45}, scope);
        el('text', {x: f.x0 + w / 2, y: 20, 'text-anchor': 'middle', class: 'lbl-b'}, scope, f.name);
        const xa = cx + f.a * k, xb = cx + B * k;
        el('circle', {cx: xb, cy, r: 4, fill: '#dfe9f1'}, scope);
        el('circle', {cx: xa, cy, r: 12, fill: 'url(#sc-glow-s)'}, scope);
        el('circle', {cx: xa, cy, r: 4.5, fill: '#fff'}, scope);
        el('text', {x: xa, y: cy + 30, 'text-anchor': 'middle', class: 'lbl-b', fill: '#f2a33a'}, scope, 'A');
        el('text', {x: xb, y: cy + 30, 'text-anchor': 'middle', class: 'lbl-b'}, scope, 'B');
        const y = cy - 28, l = Math.min(xa, xb), r = Math.max(xa, xb);
        el('path', {d: `M${l} ${y + 6}V${y}H${r}V${y + 6}`, stroke: '#ffd36b', fill: 'none', 'stroke-width': 1.5}, scope);
        el('text', {x: (l + r) / 2, y: y - 7, 'text-anchor': 'middle', class: 'lbl-b', fill: '#ffd36b'}, scope, `${fmtNum(i ? M.REVIEW5.after : M.REVIEW5.before)}″`);
      });
      el('text', {x: 260, y: 118, 'text-anchor': 'middle', class: 'lbl-b', fill: '#a9bccb'}, scope, '→');
      el('text', {x: 14, y: 232, class: 'tick'}, scope, 'B: 멀리 있는 배경 별 · A: 거리를 구할 별');
      el('text', {x: 506, y: 232, 'text-anchor': 'end', class: 'tick'}, scope, '교과서 85쪽 단원 마무리 5번');
      $('px-scope-note').innerHTML = `6개월 사이 A는 B의 왼쪽 0.07″에서 오른쪽 0.03″로 옮겨 갔습니다. 옮겨 간 각(시차)은 0.07″ + 0.03″ = <b>0.10″</b>입니다.`;
    }
    function moveScope() {
      if (st.mode === 'review5') return;
      const k = (F.r - F.cx - 14) * st.zoom;
      scopeDots.forEach(d => {
        const x = (F.cx + M.apparentOffset(d.p, st.months) * k).toFixed(1);
        d.glow.setAttribute('cx', x); d.dot.setAttribute('cx', x);
      });
    }

    // ── 거리 자 ──
    let rx;
    const rbox = {l: 46, r: 612};
    onDrag(ruler, ruler, (pt, phase) => {
      if (phase === 'end' || !pt || !rx) return;
      const r = M.clamp(rx.inv(M.clamp(pt.x, rbox.l, rbox.r)), RMIN, RMAX);
      st.p = 1 / r;
      st.mode = 'free'; st.preset = matchPreset();
      render();
    });
    function drawRuler() {
      clear(ruler);
      const tall = small();
      ruler.setAttribute('viewBox', `0 0 640 ${tall ? 250 : 168}`);
      rx = logScale(RMIN, RMAX, rbox.l, rbox.r);
      const yA = tall ? 132 : 98, bar1 = tall ? 26 : 22, bar2 = tall ? 70 : 52, bh = tall ? 16 : 12;
      const defsR = el('defs', {}, ruler);
      const fade = el('linearGradient', {id: 'px-fade', x1: 0, x2: 1}, defsR);
      el('stop', {offset: '0%', 'stop-color': '#3d6fe0'}, fade);
      el('stop', {offset: '80%', 'stop-color': '#3d6fe0'}, fade);
      el('stop', {offset: '100%', 'stop-color': '#3d6fe0', 'stop-opacity': 0.1}, fade);
      const g1 = st.inst === 'ground';
      el('rect', {x: rx(1), y: bar1, width: rx(100) - rx(1), height: bh, rx: bh / 2, fill: '#f2a33a', opacity: g1 ? 1 : 0.3}, ruler);
      el('text', {x: rx(100) + 8, y: bar1 + bh - 1, class: 'annot', fill: '#a85a00', opacity: g1 ? 1 : 0.5}, ruler, tall ? '지상 약 100 pc까지' : '지상 망원경 — 약 100 pc(0.01″)까지');
      el('rect', {x: rx(1), y: bar2, width: rx(5000) - rx(1), height: bh, rx: bh / 2, fill: 'url(#px-fade)', opacity: g1 ? 0.3 : 1}, ruler);
      el('text', {x: rx(1) + 10, y: tall ? bar2 + bh + 22 : bar2 + bh - 1.5, class: 'annot', fill: tall || g1 ? '#2b55b8' : '#fff', opacity: g1 ? 0.75 : 1}, ruler, tall ? 'Gaia(밝은 별) 수천 pc까지' : '우주 망원경 Gaia — 밝은 별은 수천 pc까지');
      const ax = el('g', {class: 'axis'}, ruler);
      el('line', {x1: rbox.l, x2: rbox.r, y1: yA, y2: yA, 'stroke-width': 1.4}, ax);
      for (let dec = 0; dec < 4; dec++) for (let m = 2; m <= 9; m++) {
        const x = rx(10 ** dec * m);
        el('line', {x1: x, x2: x, y1: yA, y2: yA + 5}, ax);
      }
      [[1, '1 pc', '1″'], [10, '10 pc', '0.1″'], [100, '100 pc', '0.01″'], [1000, '1000 pc', '0.001″'], [1e4, '10⁴ pc', '0.0001″']].forEach(([r, a, b]) => {
        const x = rx(r), anchor = r === 1 ? 'start' : r === 1e4 ? 'end' : 'middle';
        el('line', {x1: x, x2: x, y1: yA - 6, y2: yA + 8, 'stroke-width': 1.4}, ax);
        el('text', {x: r === 1 ? x - 4 : x, y: yA + (tall ? 30 : 22), 'text-anchor': anchor, class: 'tick', fill: '#14283a', 'font-weight': 700}, ax, a);
        el('text', {x: r === 1 ? x - 4 : x, y: yA + (tall ? 56 : 39), 'text-anchor': anchor, class: 'tick'}, ax, b);
      });
      el('text', {x: rbox.l - 6, y: yA + (tall ? 30 : 22), 'text-anchor': 'end', class: 'tick'}, ruler, tall ? '' : 'r');
      el('text', {x: rbox.l - 6, y: yA + (tall ? 56 : 39), 'text-anchor': 'end', class: 'tick'}, ruler, tall ? '' : 'p');
      // 별 표시
      const ss = stars();
      ss.forEach(s => {
        const x = rx(1 / s.p), ok = M.measurable(s.p, st.inst);
        el('line', {x1: x, x2: x, y1: 10, y2: yA, stroke: '#14283a', 'stroke-width': 1.3, 'stroke-dasharray': '3 4', opacity: 0.6}, ruler);
        el('circle', {cx: x, cy: yA, r: tall ? 13 : 10, fill: ok ? s.color : '#c4ced6', stroke: '#14283a', 'stroke-width': 1.5}, ruler);
        el('text', {x, y: yA + (tall ? 6 : 4.5), 'text-anchor': 'middle', 'font-size': tall ? 15 : 11, 'font-weight': 800, fill: '#14283a'}, ruler, ss.length > 1 ? s.label.slice(-1) : (st.mode === 'review5' ? 'A' : 'S'));
      });
    }

    function render() {
      setPressed(chips, 'data-preset', st.preset || '');
      setPressed($('px-zoom'), 'data-zoom', st.zoom);
      setPressed($('px-inst'), 'data-inst', st.inst);
      drawTop(); drawScope(); drawRuler();
      monthText();
      const ss = stars();
      const p = ss[0].p, r = 1 / p;
      if (st.mode === 'q1') {
        $('px-p').innerHTML = `A ${fmtP(M.Q1.A)} · B ${fmtP(M.Q1.B)}`;
        $('px-r').innerHTML = `A ${fmtPc(10)} · B ${fmtPc(2.5)}`;
        $('px-ly').textContent = `A ${fmtLy(10)} · B ${fmtLy(2.5)}`;
        $('px-coin').textContent = `A 약 ${fmtNum(M.coinDistanceKm(M.Q1.A), 2)} km · B 약 ${fmtNum(M.coinDistanceKm(M.Q1.B), 2)} km`;
      } else {
        $('px-p').textContent = fmtP(p);
        $('px-r').textContent = fmtPc(r);
        $('px-ly').textContent = fmtLy(r);
        const km = M.coinDistanceKm(p);
        $('px-coin').textContent = `약 ${km < 10 ? num(km, 1) : Math.round(km).toLocaleString('ko-KR')} km`;
      }
      // 식
      let f = `<div class="row"><span class="big">r = ${fr('1', 'p')}</span><span class="note">r : 별까지의 거리(pc) &nbsp; p : 연주 시차(″) &nbsp;·&nbsp; 연주 시차 p = 시차의 ${fr('1', '2')} (기선을 1 AU로 맞추려고 절반을 씁니다)</span></div>`;
      if (st.mode === 'q1') {
        f += `<div class="row now">A : r = ${fr('1', '0.1')} = <b>10 pc</b> &nbsp;&nbsp; B : r = ${fr('1', '0.4')} = <b>2.5 pc</b></div>`;
      } else if (st.mode === 'review5') {
        f += `<div class="row now">시차 = 0.07″ + 0.03″ = 0.10″ → p = 0.10″ × ${fr('1', '2')} = 0.05″ → r = ${fr('1', '0.05')} = <b>20 pc</b></div>`;
      } else {
        f += `<div class="row now">r = ${fr('1', fmtNum(p))} = <b>${fmtPc(r)}</b> &nbsp;(${fmtLy(r)})</div>`;
      }
      $('px-formula').innerHTML = f;
      $('px-insight').innerHTML = insight(p, r);
      $('px-r-in').value = M.clamp(Math.log10(r), 0, 4);
      $('px-r-out').textContent = st.mode === 'q1' ? 'A 10 pc · B 2.5 pc' : fmtPc(r);
      ensureLoop();
    }
    function insight(p, r) {
      if (st.mode === 'q1') return `<b>Q1.</b> 별 A의 연주 시차는 0.1″, 별 B는 0.4″입니다. A는 ${fr('1', '0.1')} = 10 pc, B는 ${fr('1', '0.4')} = 2.5 pc → <b>연주 시차가 큰 B가 더 가깝습니다.</b> 망원경에서 B가 A보다 4배 크게 흔들리는 것을 확인해 보세요.`;
      if (st.mode === 'review5') return `<b>교과서 85쪽 단원 마무리 5번.</b> 사진 두 장은 6개월 간격(공전 궤도 양 끝)에서 찍었습니다. 배경 별 B에 대해 A가 옮겨 간 각 0.10″가 시차이고, 그 절반 <b>0.05″가 연주 시차</b>입니다 → r = ${fr('1', '0.05')} = <b>20 pc</b>.`;
      let s = STORY[st.preset] || `연주 시차 ${fmtP(p)} → 거리 ${fmtPc(r)}. <b>별이 멀수록 연주 시차가 작아집니다</b>(거리 10배 → 연주 시차 ${fr('1', '10')}).`;
      if (!M.measurable(p, 'gaia')) {
        s += ` <b>지상 망원경은 물론 Gaia로도 연주 시차를 재기 어려운 거리입니다.</b> 이렇게 먼 별은 별의 밝기(거리 지수)로 거리를 구합니다 → 02·03에서.`;
      } else if (!M.measurable(p, 'ground')) {
        s += st.inst === 'ground'
          ? ` <b>연주 시차가 0.01″보다 작아 지상 망원경으로는 재기 어렵습니다.</b> ‘우주 망원경 Gaia’를 골라 보세요.`
          : ` 지상에서는 어렵지만, 우주 망원경 Gaia는 밝은 별이면 수천 pc까지 연주 시차를 잽니다(Gaia DR3: 약 14.7억 개 천체).`;
      }
      return s;
    }
    function monthText() {
      const m = st.months % 12, mm = Math.round(m);
      let t = `${Math.abs(m - mm) < 0.06 ? mm : num(m, 1)}개월`;
      if (Math.abs(m) < 0.06 || Math.abs(m - 12) < 0.06) t += ' · E₁';
      else if (Math.abs(m - 6) < 0.06) t += ' · E₂ (6개월 뒤)';
      $('px-month-out').textContent = t;
      $('px-month').value = st.months;
    }
    function frame() { drawTop(); moveScope(); monthText(); }

    // 재생 중이고 이 실험이 보일 때만 돈다. 멈추면 프레임 요청도 멈춰 CPU를 쓰지 않는다.
    let last = null, looping = false;
    const active = () => current === 's1' && st.playing && !document.hidden;
    function tick(now) {
      if (!active()) { looping = false; last = null; return; }
      if (last !== null) { st.months = (st.months + (now - last) / 8000 * 12) % 12; frame(); }
      last = now;
      requestAnimationFrame(tick);
    }
    function ensureLoop() {
      if (looping || !active()) return;
      looping = true; last = null;
      requestAnimationFrame(tick);
    }
    document.addEventListener('visibilitychange', ensureLoop);
    setPlaying(st.playing);
    return {render};
  })();

  // ═══════════════ 02 별의 밝기와 등급 ═══════════════
  stations.s2 = (() => {
    const st = {m1: 1, m2: 6, d: 2, magPreset: '1to6', invPreset: 'd2'};
    const lad = $('mag-ladder'), inv = $('inv-scene');
    const LO = -2, HI = 7;
    const REAL = [{name: '시리우스', m: -1.44, row: 0, dg: 2}, {name: '베가', m: 0.0, row: 1, dg: 1}, {name: '북극성', m: 1.98, row: 0, dg: 2}, {name: '맨눈 한계', m: 6, row: 1, dg: 0}];
    const MAG_PRESETS = [
      {id: '1to6', name: '1등급과 6등급', m1: 1, m2: 6},
      {id: 'one', name: '1등급 차', m1: 1, m2: 2},
      {id: 'ten', name: '2.5등급 차', m1: 1, m2: 3.5},
      {id: 'sirius', name: '시리우스와 북극성', m1: -1.44, m2: 1.98},
      {id: 'betel', name: '베텔게우스 대감광 (2020)', m1: 0.5, m2: 1.6}
    ];
    const INV_PRESETS = [{id: 'd2', name: '거리 2배', d: 2}, {id: 'd3', name: '거리 3배', d: 3}, {id: 'd10', name: '거리 10배', d: 10}];
    const SNAPS = [-1.44, 0, 1.98, 6];

    function presetChips(box, list, key, apply) {
      list.forEach(p => {
        const b = document.createElement('button');
        b.type = 'button'; b.dataset.p = p.id; b.textContent = p.name;
        b.addEventListener('click', () => { apply(p); st[key] = p.id; render(); });
        box.appendChild(b);
      });
    }
    presetChips($('mag-presets'), MAG_PRESETS, 'magPreset', p => { st.m1 = p.m1; st.m2 = p.m2; });
    presetChips($('inv-presets'), INV_PRESETS, 'invPreset', p => { st.d = p.d; });
    const matchMag = () => (MAG_PRESETS.find(p => Math.abs(p.m1 - st.m1) < 1e-9 && Math.abs(p.m2 - st.m2) < 1e-9) || {}).id || null;
    ['m1', 'm2'].forEach(k => $(`mag-${k}-in`).addEventListener('input', e => { st[k] = +e.target.value; st.magPreset = matchMag(); renderMag(); }));
    $('inv-d-in').addEventListener('input', e => { st.d = +e.target.value; st.invPreset = (INV_PRESETS.find(p => p.d === st.d) || {}).id || null; renderInv(); });

    // ① 등급 사다리
    let xs, grab = null, lbox;
    onDrag(lad, lad, (pt, phase) => {
      if (phase === 'end') { grab = null; return; }
      if (!xs) return;
      let m = xs.inv(M.clamp(pt.x, lbox.l, lbox.r));
      if (phase === 'start') grab = Math.abs(m - st.m1) <= Math.abs(m - st.m2) ? 'm1' : 'm2';
      const sn = SNAPS.find(s => Math.abs(s - m) < 0.09);
      m = sn !== undefined ? sn : Math.round(m * 10) / 10;
      st[grab] = M.clamp(m, LO, HI);
      st.magPreset = matchMag();
      renderMag();
    });
    const starR = m => 3 + (HI - m) * 2.1;
    function drawLadder() {
      clear(lad);
      const tall = small();
      lad.setAttribute('viewBox', `0 0 640 ${tall ? 410 : 300}`);
      lbox = {l: 40, r: 604};
      xs = lin(LO - 0.35, HI + 0.35, lbox.l, lbox.r);
      const yAx = tall ? 196 : 146, yInt = yAx + (tall ? 46 : 36), yH = yAx + (tall ? 92 : 72), yBar = yAx + (tall ? 140 : 106);
      const defs = el('defs', {}, lad);
      glowGrad(defs, 'mg-amber', '#f2a33a'); glowGrad(defs, 'mg-1', '#0b7f9a'); glowGrad(defs, 'mg-2', '#c2581c');
      el('text', {x: 20, y: tall ? 24 : 18, class: 'annot', fill: '#5f7282'}, lad, '← 밝다');
      el('text', {x: 620, y: tall ? 24 : 18, 'text-anchor': 'end', class: 'annot', fill: '#5f7282'}, lad, '어둡다 →');
      // 실제 별
      REAL.forEach(s => {
        const x = xs(s.m), y = (tall ? 58 : 44) + s.row * (tall ? 30 : 22);
        el('text', {x, y, 'text-anchor': 'middle', class: 'tick'}, lad, `${s.name} ${sv(s, s.m)}`);
        el('line', {x1: x, x2: x, y1: y + 5, y2: yAx - 26, stroke: '#c4ced6', 'stroke-dasharray': '2 3'}, lad);
      });
      // 정수 등급의 별 (흐리게)
      for (let m = LO; m <= HI; m++) {
        const x = xs(m), r = starR(m);
        el('circle', {cx: x, cy: yAx, r: r * 1.8, fill: 'url(#mg-amber)', opacity: 0.35}, lad);
        el('circle', {cx: x, cy: yAx, r: r * 0.55, fill: '#f2a33a', opacity: 0.45}, lad);
        el('text', {x, y: yInt, 'text-anchor': 'middle', class: 'tick', fill: '#14283a', 'font-weight': 700}, lad, num(m, 0));
      }
      el('line', {x1: lbox.l, x2: lbox.r, y1: yAx, y2: yAx, stroke: '#c4ced6', 'stroke-width': 1.5}, lad);
      el('text', {x: 6, y: yInt, class: 'tick'}, lad, '등급');
      // 1등급씩 ×2.5
      const a = Math.min(st.m1, st.m2), b = Math.max(st.m1, st.m2), n = Math.floor(b - a + 1e-9);
      const hop = (m0, m1, label) => {
        const x0 = xs(m0), x1 = xs(m1), h = Math.min(30, 10 + (x1 - x0) * 0.35), yy = yAx - 26;
        el('path', {d: `M${x0} ${yy}Q${(x0 + x1) / 2} ${yy - 2 * h} ${x1} ${yy}`, fill: 'none', stroke: '#3d6fe0', 'stroke-width': 2}, lad);
        el('path', {d: `M${x1 - 6} ${yy - 6}L${x1} ${yy}L${x1 - 7} ${yy + 1}`, fill: 'none', stroke: '#3d6fe0', 'stroke-width': 2}, lad);
        if (x1 - x0 > 26) el('text', {x: (x0 + x1) / 2, y: yy - h - 4, 'text-anchor': 'middle', class: 'tick halo', fill: '#2b55b8', 'font-weight': 700}, lad, label);
      };
      for (let i = 0; i < n; i++) hop(a + i, a + i + 1, '×2.5');
      const rem = b - a - n;
      if (rem > 0.05) hop(a + n, b, `×${num(10 ** (0.4 * rem), 1)}`);
      // 두 별
      const ratio = M.brightnessRatio(b - a);
      [['m1', '별 1', 'mg-1', '#0b7f9a'], ['m2', '별 2', 'mg-2', '#c2581c']].forEach(([k, name, gid, col]) => {
        const x = xs(st[k]), r = starR(st[k]);
        el('circle', {cx: x, cy: yAx, r: r * 1.6, fill: `url(#${gid})`}, lad);
        el('circle', {cx: x, cy: yAx, r: Math.max(3, r * 0.5), fill: col, stroke: '#fff', 'stroke-width': 1.5}, lad);
      });
      // 손잡이 (겹치면 옆으로 비켜 그린다)
      let x1 = xs(st.m1), x2 = xs(st.m2);
      const hw = tall ? 64 : 44, hh = tall ? 36 : 28;
      let hx1 = x1, hx2 = x2;
      if (Math.abs(x1 - x2) < 2 * hw + 6) {
        const mid = (x1 + x2) / 2, sgn = x1 <= x2 ? -1 : 1;
        hx1 = mid + sgn * (hw + 3); hx2 = mid - sgn * (hw + 3);
      }
      [[x1, hx1, '별 1', '#0b7f9a', st.m1], [x2, hx2, '별 2', '#c2581c', st.m2]].forEach(([x, hx, t, col, m]) => {
        hx = M.clamp(hx, hw + 2, 638 - hw);
        el('path', {d: `M${x} ${yAx + 10}L${x} ${yH - hh / 2 - 6}L${hx} ${yH - hh / 2}`, stroke: col, 'stroke-width': 1.5, fill: 'none'}, lad);
        el('rect', {x: hx - hw, y: yH - hh / 2, width: 2 * hw, height: hh, rx: hh / 2, fill: col}, lad);
        el('text', {x: hx, y: yH + (tall ? 7 : 5), 'text-anchor': 'middle', class: 'annot', fill: '#fff'}, lad, `${t} · ${mag(m)}등급`);
      });
      // 밝기 막대(직선 눈금): 밝은 별 = 1
      const l1 = 10 ** (-0.4 * st.m1), l2 = 10 ** (-0.4 * st.m2), lm = Math.max(l1, l2);
      const bx = tall ? 120 : 86, bw = tall ? 380 : 420, bh = tall ? 18 : 13;
      [[l1, '별 1', '#0b7f9a', 0], [l2, '별 2', '#c2581c', 1]].forEach(([l, t, col, i]) => {
        const y = yBar + i * (bh + (tall ? 16 : 10));
        el('text', {x: bx - 10, y: y + bh - 2, 'text-anchor': 'end', class: 'tick'}, lad, `${t} 밝기`);
        el('rect', {x: bx, y, width: bw, height: bh, rx: 4, fill: '#f1f4f6'}, lad);
        el('rect', {x: bx, y, width: Math.max(2, bw * l / lm), height: bh, rx: 4, fill: col}, lad);
        const rel = l / lm;
        el('text', {x: bx + bw + 8, y: y + bh - 2, class: 'tick', fill: '#14283a', 'font-weight': 700}, lad, rel > 0.999 ? '1' : `${fmtNum(1 / rel, 3)}분의 1`);
      });
      return ratio;
    }
    function renderMag() {
      setPressed($('mag-presets'), 'data-p', st.magPreset || '');
      const ratio = drawLadder();
      const dm = st.m2 - st.m1, a = Math.abs(dm);
      ['m1', 'm2'].forEach(k => { $(`mag-${k}-in`).value = st[k]; $(`mag-${k}-out`).textContent = `${mag(st[k])}등급`; });
      $('mag-m1').textContent = `${mag(st.m1)}등급`;
      $('mag-m2').textContent = `${mag(st.m2)}등급`;
      $('mag-dm').textContent = `${num(dm, 2)}`;
      $('mag-ratio').textContent = a < 0.005 ? '같다' : `${ratio >= 10 ? fmtNum(ratio, 3) : num(ratio, 2)}배`;
      const e = num(2 * dm / 5, 2), q = a < 0.005 ? '1' : fmtNum(10 ** (0.4 * dm), 3);
      $('mag-formula').innerHTML = `
        <div class="row"><span class="k">(가)</span>5등급 차 = 밝기 100배 → 1등급 차 = ${pw('100', fr('1', '5'))} ≈ 2.512배</div>
        <div class="row"><span class="k">(나)</span>등급 차가 m₂ − m₁이면 &nbsp; ${fr('l₁', 'l₂')} = ${pw('100', fr('m₂ − m₁', '5'))} = ${pw('10', fr('2(m₂ − m₁)', '5'))}</div>
        <div class="row key"><span class="k">(다)</span>양변에 log를 취하면 &nbsp;<b>m₂ − m₁ = −2.5 log ${fr('l₂', 'l₁')}</b> <span class="note">← 포그슨 공식 (= 2.5 log ${fr('l₁', 'l₂')})</span></div>
        <div class="row now">지금: m₂ − m₁ = ${num(dm, 2)} → ${fr('l₁', 'l₂')} = ${pw('10', fr(`2 × ${magP(+num(dm, 2))}`, '5'))} = ${pw('10', e)} ≈ <b>${q}</b></div>`;
      let ins;
      if (a < 0.005) ins = '두 별의 등급이 같으면 밝기도 같습니다.';
      else {
        const br = st.m1 < st.m2 ? '별 1' : '별 2', fa = st.m1 < st.m2 ? '별 2' : '별 1';
        ins = `등급이 ${num(a, 2)} 작은 <b>${br === '별 1' ? '별 1이' : '별 2가'} ${fa}보다 ${ratio >= 10 ? fmtNum(ratio, 3) : num(ratio, 2)}배 밝습니다.</b> 등급은 숫자가 작을수록 밝고, 1등급마다 약 2.5배씩 차이 납니다.`;
        if (st.magPreset === '1to6') ins = '1등급 별은 6등급 별보다 <b>100배</b> 밝습니다(교과서 65쪽). 2.512를 다섯 번 곱하면 100이 됩니다.';
        if (st.magPreset === 'ten') ins = '<b>2.5등급 차 = 정확히 10배</b>입니다(10<sup>0.4 × 2.5</sup> = 10). 5등급 차 = 100배를 반으로 나눈 셈입니다.';
        if (st.magPreset === 'betel') ins = '2020년 2월 베텔게우스는 평소(약 0.5등급)보다 1.1등급 어두운 약 1.6등급이 되었습니다 → 밝기는 10<sup>0.44</sup> ≈ <b>2.8배 어두워졌습니다.</b> 별이 내뿜은 가스가 식어 생긴 먼지 구름이 별빛을 가렸기 때문으로 밝혀졌습니다.';
        if (st.magPreset === 'sirius') ins = `시리우스(${mag(-1.44)}등급)는 북극성(약 2등급)보다 ${num(1.98 + 1.44, 2)}등급 작아 <b>약 ${Math.round(M.brightnessRatio(3.42))}배 밝게</b> 보입니다. 등급이 음수인 별도 있습니다.`;
      }
      $('mag-insight').innerHTML = ins;
      markRough();
    }

    // ② 밝기와 거리
    let ux, ibox;
    onDrag(inv, inv, (pt, phase) => {
      if (phase === 'end' || !pt || !ux) return;
      let d = M.clamp((pt.x - ibox.sx) / ux, 1, 10);
      d = Math.abs(d - Math.round(d)) < 0.14 ? Math.round(d) : Math.round(d * 10) / 10;
      st.d = d;
      st.invPreset = (INV_PRESETS.find(p => p.d === d) || {}).id || null;
      renderInv();
    });
    function screenPts(d, cy, h0, sx) {
      const side = 2 * h0 * d, w = side * 0.36, x = sx + ux * d;
      return [[x - w / 2, cy - side / 2 + w * 0.25], [x + w / 2, cy - side / 2 - w * 0.25], [x + w / 2, cy + side / 2 - w * 0.25], [x - w / 2, cy + side / 2 + w * 0.25]];
    }
    function drawInv() {
      clear(inv);
      const tall = small();
      // 맨 위 줄 = 밝기, 아래 줄 = 넓이, 맨 아래 = 거리 눈금. 줄이 고정되어 글자가 그림과 겹치지 않는다.
      const H = tall ? 460 : 380, rowL = tall ? 34 : 26, rowA = H - (tall ? 72 : 52), yAx = H - (tall ? 44 : 32);
      inv.setAttribute('viewBox', `0 0 640 ${H}`);
      const cy = tall ? 214 : 178, h0 = tall ? 12.5 : 11, sx = 54;
      ux = 53; ibox = {sx};
      const defs = el('defs', {}, inv);
      glowGrad(defs, 'iv-star', '#f2a33a');
      const d = st.d, P = screenPts(d, cy, h0, sx);
      // 빛살
      P.forEach(([x, y]) => el('line', {x1: sx, y1: cy, x2: x, y2: y, stroke: '#f2a33a', 'stroke-width': 1.5, 'stroke-dasharray': '6 5', opacity: 0.8}, inv));
      const drawScreen = (pts, dd, fillOp, strong) => {
        el('polygon', {points: pts.map(p => p.map(v => v.toFixed(1)).join(',')).join(' '), fill: '#f2a33a', 'fill-opacity': fillOp, stroke: '#a85a00', 'stroke-width': strong ? 2.5 : 1.5}, inv);
        const n = Math.ceil(dd - 1e-9);
        for (let i = 1; i < n; i++) {
          const f = i / dd;
          const a = [pts[0][0] + (pts[1][0] - pts[0][0]) * f, pts[0][1] + (pts[1][1] - pts[0][1]) * f], b = [pts[3][0] + (pts[2][0] - pts[3][0]) * f, pts[3][1] + (pts[2][1] - pts[3][1]) * f];
          el('line', {x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: '#a85a00', 'stroke-width': 1}, inv);
          const c = [pts[0][0] + (pts[3][0] - pts[0][0]) * f, pts[0][1] + (pts[3][1] - pts[0][1]) * f], e = [pts[1][0] + (pts[2][0] - pts[1][0]) * f, pts[1][1] + (pts[2][1] - pts[1][1]) * f];
          el('line', {x1: c[0], y1: c[1], x2: e[0], y2: e[1], stroke: '#a85a00', 'stroke-width': 1}, inv);
        }
      };
      // 교과서 그림 7처럼 거리 1배·2배·3배 스크린을 늘 흐리게 두고, 끌어 옮기는 스크린은 진하게
      const GHOSTS = [1, 2, 3];
      GHOSTS.forEach(g => { if (Math.abs(g - d) > 0.02) drawScreen(screenPts(g, cy, h0, sx), g, 0.85 / (g * g), false); });
      drawScreen(P, d, Math.max(0.05, 0.9 / (d * d)), true);
      el('circle', {cx: sx, cy, r: 26, fill: 'url(#iv-star)'}, inv);
      el('circle', {cx: sx, cy, r: 7, fill: '#f2a33a'}, inv);
      el('text', {x: sx, y: cy + (tall ? 48 : 42), 'text-anchor': 'middle', class: 'lbl-b'}, inv, '별');
      // 줄 이름
      const fs = tall ? 20 : 12;
      el('text', {x: 6, y: rowL + 0.35 * fs, class: 'annot', fill: '#a85a00'}, inv, '밝기');
      el('text', {x: 6, y: rowA + 0.35 * fs, class: 'annot', fill: '#5f7282'}, inv, '넓이');
      const xd = sx + ux * d;
      // 흐린 스크린의 값 (지금 스크린과 가까우면 생략)
      GHOSTS.forEach(g => {
        if (Math.abs(g - d) < 0.65) return;
        const x = sx + ux * g;
        if (g === 1) el('text', {x, y: rowL + 0.35 * fs, 'text-anchor': 'middle', class: 'annot', fill: '#c98a3d'}, inv, '1');
        else svgFrac(inv, x, rowL, '1', String(g * g), {cls: 'annot', fill: '#c98a3d', fs});
        el('text', {x, y: rowA + 0.35 * fs, 'text-anchor': 'middle', class: 'annot', fill: '#9aa9b5'}, inv, `${g * g}배`);
      });
      // 지금 스크린
      if (d > 1.0001) svgFrac(inv, xd, rowL, '1', fmtNum(d * d, 3), {cls: 'annot', fill: '#a85a00', fs});
      else el('text', {x: xd, y: rowL + 0.35 * fs, 'text-anchor': 'middle', class: 'annot', fill: '#a85a00'}, inv, '1');
      el('text', {x: Math.min(xd, 610), y: rowA + 0.35 * fs, 'text-anchor': 'middle', class: 'annot', fill: '#14283a'}, inv, `${fmtNum(d * d, 3)}배`);
      // 거리 눈금
      const ax = el('g', {class: 'axis'}, inv);
      el('line', {x1: sx, x2: sx + ux * 10.4, y1: yAx, y2: yAx, 'stroke-width': 1.3}, ax);
      for (let k = 1; k <= 10; k++) {
        const x = sx + ux * k;
        el('line', {x1: x, x2: x, y1: yAx - 4, y2: yAx + 4, 'stroke-width': 1.3}, ax);
        if (!tall || [1, 2, 3, 5, 10].includes(k)) el('text', {x, y: yAx + (tall ? 28 : 18), 'text-anchor': 'middle', class: 'tick'}, ax, `${k}배`);
      }
      el('text', {x: 6, y: yAx + (tall ? 28 : 18), class: 'tick'}, ax, '거리');
      el('circle', {cx: xd, cy: yAx, r: tall ? 7 : 5, fill: '#14283a', stroke: '#fff', 'stroke-width': 1.5}, inv);
    }
    function renderInv() {
      setPressed($('inv-presets'), 'data-p', st.invPreset || '');
      drawInv();
      const d = st.d, dm = M.magDiffFromDistance(1, d);
      $('inv-d-in').value = d; $('inv-d-out').textContent = `${fmtNum(d)}배`;
      $('inv-d').textContent = `${fmtNum(d)}배`;
      $('inv-area').textContent = `${fmtNum(d * d, 3)}배`;
      $('inv-l').innerHTML = d <= 1.0001 ? '1' : fr('1', fmtNum(d * d, 3));
      $('inv-dm').textContent = `${num(dm, 2)}등급`;
      $('inv-formula').innerHTML = `
        <div class="row"><span class="k">(가)</span>밝기는 거리의 제곱에 반비례 &nbsp; → &nbsp; ${fr('l₁', 'l₂')} = ${par(fr('d₂', 'd₁'), '2')}</div>
        <div class="row key"><span class="k">(나)</span>①의 포그슨 공식에 넣으면 &nbsp;m₂ − m₁ = −2.5 log ${fr('l₂', 'l₁')} = −2.5 log ${par(fr('d₁', 'd₂'), '2')} = <b>−5 log ${fr('d₁', 'd₂')}</b> <span class="note">(= 5 log ${fr('d₂', 'd₁')})</span></div>
        <div class="row now">지금: ${fr('d₂', 'd₁')} = ${fmtNum(d)} → ${fr('l₁', 'l₂')} = ${fmtNum(d * d, 3)} → m₂ − m₁ = 5 log ${fmtNum(d)} = <b>${num(dm, 2)}</b></div>`;
      let ins;
      if (d <= 1.0001) ins = '스크린을 오른쪽으로 끌어 별에서 멀어지게 해 보세요.';
      else if (Math.abs(d - 10) < 1e-9) ins = `거리가 10배 멀어지면 같은 빛이 100배 넓이로 퍼져 밝기는 ${fr('1', '100')} → <b>5등급 어두워집니다.</b> 그래서 거리 10배 = 5등급입니다.`;
      else ins = `거리가 ${fmtNum(d)}배가 되면 같은 빛이 <b>${fmtNum(d * d, 3)}배 넓이</b>로 퍼져서 밝기는 ${fr('1', fmtNum(d * d, 3))}이 됩니다 → <b>${num(dm, 2)}등급 어두워집니다.</b>`;
      $('inv-insight').innerHTML = ins;
      markRough();
    }

    // 어림표
    const rough = $('rough');
    rough.innerHTML = `
      <div class="rough-col"><h4>등급 차 → 밝기 비 <small>1등급마다 약 2.5배씩 곱한다</small></h4><div class="rough-rows" id="rough-mag"></div></div>
      <div class="rough-col"><h4>거리 비 → 등급 차 <small>광도가 같은 두 별: 등급 차 = 5 log (거리 비)</small></h4><div class="rough-rows" id="rough-dist"></div>
      <p class="rough-log">log 2 ≈ 0.3 &nbsp;&nbsp; log 3 ≈ 0.48 &nbsp;&nbsp; log 5 ≈ 0.7 <span>예) 거리 2배 → 5 × 0.3 = 1.5등급</span></p></div>`;
    M.ROUGH_MAG.forEach(([dm, t]) => {
      const b = document.createElement(dm <= 9 ? 'button' : 'div');
      b.className = 'rough-row'; b.dataset.dm = dm;
      b.innerHTML = `<span>${dm}등급</span><b>${t}</b>`;
      if (dm <= 9) { b.type = 'button'; b.addEventListener('click', () => { st.m1 = 1; st.m2 = 1 + dm; if (st.m2 > HI) { st.m1 = HI - dm; st.m2 = HI; } st.magPreset = null; renderMag(); }); }
      else b.title = '10등급 = 5등급 + 5등급 → 100 × 100';
      $('rough-mag').appendChild(b);
    });
    M.ROUGH_DIST.forEach(([k, t]) => {
      const b = document.createElement(k <= 10 ? 'button' : 'div');
      b.className = 'rough-row'; b.dataset.k = k;
      b.innerHTML = `<span>${k}배</span><b>${t}</b>`;
      if (k <= 10) { b.type = 'button'; b.addEventListener('click', () => { st.d = k; st.invPreset = (INV_PRESETS.find(p => p.d === k) || {}).id || null; renderInv(); }); }
      $('rough-dist').appendChild(b);
    });
    function markRough() {
      const dm = Math.abs(st.m2 - st.m1);
      rough.querySelectorAll('[data-dm]').forEach(b => b.classList.toggle('on', Math.abs(+b.dataset.dm - dm) < 0.05));
      rough.querySelectorAll('[data-k]').forEach(b => b.classList.toggle('on', Math.abs(+b.dataset.k - st.d) < 0.05));
    }
    function render() { renderMag(); renderInv(); }
    return {render};
  })();

  // ═══════════════ 03 절대 등급과 거리 지수 ═══════════════
  stations.s3 = (() => {
    // 교과서의 별: 66쪽 해 보기 + 84쪽 단원 마무리 4번
    const LINEUP = [
      {id: 'sun', name: '태양', m: -26.7, M: 4.8, dg: 1, src: '교과서 84쪽'},
      {id: 'sirius', name: '시리우스', m: -1.44, M: 1.41, dg: 2, src: '교과서 66쪽'},
      {id: 'vega', name: '베가', m: 0.0, M: 0.6, dg: 1, src: '교과서 84쪽'},
      {id: 'spica', name: '스피카', m: 1.0, M: -3.6, dg: 1, src: '교과서 84쪽'},
      {id: 'betelgeuse', name: '베텔게우스', m: 0.45, M: -5.14, dg: 2, src: '교과서 66쪽'},
      {id: 'rigel', name: '리겔', m: 0.18, M: -6.70, dg: 2, src: '교과서 66쪽'},
      {id: 'deneb', name: '데네브', m: 1.3, M: -8.7, dg: 1, src: '교과서 84쪽'}
    ];
    LINEUP.forEach(s => { s.r = M.distanceFromModulus(s.m - s.M); });
    const Q2STAR = {id: 'q2', name: 'Q2의 별', dg: 0, m: M.Q2.m, M: M.Q2.M, r: M.distanceFromModulus(M.Q2.m - M.Q2.M), src: '활동지 Q2'};
    const st = {t: 0, sel: 'rigel', q2: false, rWhat: null, kase: 'dist', playing: false,
      cv: {dist: {r: 100, M1: 0, M2: 5}, lum: {M: 2, r1: 10, r2: 100}, app: {m: 10, M1: 5, M2: 0}},
      quizQ4: [null, null, null], quizQ4Done: false, quizR4: null};
    const lineup = $('lineup'), chart = $('mod-chart');
    const cur = () => st.q2 ? Q2STAR : LINEUP.find(s => s.id === st.sel);
    const curR = () => st.rWhat !== null ? st.rWhat : cur().r;

    // 별 고르기 칩
    const starChips = $('mod-stars');
    LINEUP.forEach(s => {
      const b = document.createElement('button');
      b.type = 'button'; b.dataset.star = s.id; b.textContent = s.name;
      b.addEventListener('click', () => select(s.id));
      starChips.appendChild(b);
    });
    function select(id) { st.sel = id; st.q2 = false; st.rWhat = null; render(); }
    $('mod-q2').addEventListener('click', () => { st.q2 = !st.q2; st.rWhat = null; render(); });
    $('mod-reset').addEventListener('click', () => { st.rWhat = null; render(); });
    $('mod-r').addEventListener('input', e => { st.rWhat = 10 ** +e.target.value; renderModulus(); renderLineup(); });

    // ③ 10 pc로 옮기기
    $('lineup-t').addEventListener('input', e => { st.t = +e.target.value; stopPlay(); renderLineup(); });
    let cancelPlay = null;
    function stopPlay() { if (cancelPlay) cancelPlay(); cancelPlay = null; $('lineup-play').textContent = st.t > 0.5 ? '↺ 제자리로' : '▶ 모두 10 pc로'; }
    $('lineup-play').addEventListener('click', () => {
      const from = st.t, to = st.t > 0.5 ? 0 : 1;
      if (cancelPlay) cancelPlay();
      cancelPlay = tween(2200, k => { st.t = from + (to - from) * k; renderLineup(); }, () => { cancelPlay = null; stopPlay(); });
    });
    const glowR = m => m < -9 ? 21 : M.clamp(3 + (7 - m) * 1.1, 3, 20);
    function renderLineup() {
      clear(lineup);
      const tall = small();
      const rowH = tall ? 54 : 40, top0 = tall ? 62 : 48, nameW = tall ? 112 : 92;
      const H = top0 + rowH * LINEUP.length + (tall ? 110 : 76);
      lineup.setAttribute('viewBox', `0 0 640 ${H}`);
      const sunX = nameW + (tall ? 30 : 28), xl = sunX + (tall ? 50 : 42), xr = 600;
      const xs = logScale(1, 1000, xl, xr);
      const xOf = (s, d) => s.id === 'sun' && d < 1 ? sunX + (xs(10) - sunX) * (Math.log10(d) - Math.log10(s.r)) / (1 - Math.log10(s.r)) : xs(d);
      const yAx = top0 + rowH * LINEUP.length - rowH / 2 + (tall ? 30 : 22);
      const defs = el('defs', {}, lineup);
      glowGrad(defs, 'lu-glow', '#ffe3a8'); glowGrad(defs, 'lu-blue', '#bfd4ff');
      // 10 pc 선
      const x10 = xs(10);
      el('line', {x1: x10, x2: x10, y1: tall ? 30 : 24, y2: yAx, stroke: '#7fd6ea', 'stroke-width': 1.6, 'stroke-dasharray': '5 5'}, lineup);
      el('text', {x: x10, y: tall ? 22 : 16, 'text-anchor': 'middle', class: 'annot', fill: '#7fd6ea'}, lineup, '10 pc — 절대 등급을 정하는 거리');
      const t = st.t;
      LINEUP.forEach((s, i) => {
        const y = top0 + i * rowH, on = !st.q2 && s.id === st.sel;
        const row = el('g', {style: 'cursor:pointer'}, lineup);
        el('rect', {x: 0, y: y - rowH / 2, width: 640, height: rowH, fill: on ? '#7fd6ea' : '#fff', opacity: on ? 0.13 : 0}, row);
        el('text', {x: 10, y: y + 5, class: 'lbl-b', fill: on ? '#7fd6ea' : '#dfe9f1'}, row, s.name);
        el('line', {x1: s.id === 'sun' ? sunX : xl, x2: xr, y1: y, y2: y, stroke: '#35526d', 'stroke-width': 1}, row);
        const d = s.id === 'sun' ? 10 ** ((1 - t) * Math.log10(s.r) + t) : M.moveToward10pc(s.r, t), m = M.apparentMag(s.M, d);
        const x = xOf(s, d), x0 = xOf(s, s.r);
        // 10 pc 자리(목표)
        if (t < 0.97) {
          el('circle', {cx: x10, cy: y, r: glowR(s.M) * 0.55 + 2, fill: 'none', stroke: '#7fd6ea', 'stroke-width': 1.3, 'stroke-dasharray': '3 3', opacity: 0.8}, row);
          if (Math.abs(x - x10) > 16) {
            const dir = x10 > x ? 1 : -1;
            el('path', {d: `M${x + dir * (glowR(m) * 0.6 + 6)} ${y}H${x10 - dir * 12}M${x10 - dir * 18} ${y - 4}L${x10 - dir * 12} ${y}L${x10 - dir * 18} ${y + 4}`, stroke: '#7fd6ea', 'stroke-width': 1.2, fill: 'none', opacity: 0.55}, row);
          }
        }
        if (t > 0.02 && Math.abs(x - x0) > 6) el('circle', {cx: x0, cy: y, r: 3, fill: '#a9bccb', opacity: 0.6}, row);
        const R = glowR(m);
        if (s.id === 'sun' && m < -9) for (let k = 0; k < 8; k++) {
          const a = k * Math.PI / 4;
          el('line', {x1: x + Math.cos(a) * (R * 0.7), y1: y + Math.sin(a) * (R * 0.7), x2: x + Math.cos(a) * (R * 1.05), y2: y + Math.sin(a) * (R * 1.05), stroke: '#ffe3a8', 'stroke-width': 2, opacity: 0.8}, row);
        }
        el('circle', {cx: x, cy: y, r: R, fill: `url(#${s.id === 'rigel' || s.id === 'spica' ? 'lu-blue' : 'lu-glow'})`}, row);
        el('circle', {cx: x, cy: y, r: Math.max(2.4, R * 0.32), fill: '#fff'}, row);
        const lab = t < 0.02 ? `m = ${sv(s, s.m)}` : t > 0.98 ? `M = ${sv(s, s.M)}` : `${num(m, 1)}등급`;
        const right = x < xr - (tall ? 150 : 110);
        el('text', {x: right ? x + R * 0.6 + 8 : x - R * 0.6 - 8, y: y - (tall ? 8 : 6), 'text-anchor': right ? 'start' : 'end', class: 'lbl halo', fill: '#ffe3a8', 'font-weight': 700}, row, lab);
        row.addEventListener('click', () => select(s.id));
      });
      // 거리 눈금
      const ax = el('g', {class: 'axis'}, lineup);
      el('line', {x1: xl, x2: xr, y1: yAx, y2: yAx, 'stroke-width': 1.3}, ax);
      el('line', {x1: sunX - 10, x2: xl - 16, y1: yAx, y2: yAx, 'stroke-width': 1.3}, ax);
      el('text', {x: (sunX + xl) / 2 - 6, y: yAx + 5, 'text-anchor': 'middle', class: 'tick'}, lineup, '≈');
      for (let dec = 0; dec < 3; dec++) for (let k = 2; k <= 9; k++) { const x = xs(10 ** dec * k); el('line', {x1: x, x2: x, y1: yAx, y2: yAx + 4}, ax); }
      [[1, '1 pc'], [10, '10 pc'], [100, '100 pc'], [1000, '1000 pc']].forEach(([v, l]) => {
        const x = xs(v);
        el('line', {x1: x, x2: x, y1: yAx - 5, y2: yAx + 7, 'stroke-width': 1.3}, ax);
        el('text', {x, y: yAx + (tall ? 30 : 21), 'text-anchor': 'middle', class: 'tick'}, ax, l);
      });
      el('text', {x: sunX, y: yAx + (tall ? 30 : 21), 'text-anchor': 'middle', class: 'tick'}, ax, '1 AU');
      el('text', {x: (xl + xr) / 2, y: yAx + (tall ? 64 : 44), 'text-anchor': 'middle', class: 'axis-label', fill: '#a9bccb'}, lineup, '지구로부터의 거리 (로그 눈금)');
      $('lineup-t-out').textContent = t < 0.005 ? '실제 거리' : t > 0.995 ? '모두 10 pc' : `${Math.round(t * 100)}%`;
      $('lineup-t').value = t;
      let ins;
      if (t < 0.02) ins = '지구에서는 태양 다음으로 <b>시리우스(−1.44등급)</b>가 가장 밝게 보입니다. 그런데 이 밝기(겉보기 등급 m)는 별의 광도와 거리가 함께 정한 것이라, 실제로 밝은 별인지 가까워서 밝은지 알 수 없습니다.';
      else if (t > 0.98) ins = `모두 10 pc에 놓으면 <b>데네브(M = −8.7)가 가장 밝고</b>, 태양(M = 4.8)은 맨눈으로 겨우 보이는 별이 됩니다. 리겔은 시리우스보다 절대 등급이 8.11 작아 <b>약 1800배 밝습니다</b>(${pw('10', fr('8.11', '2.5'))} ≈ 1750). 이렇게 같은 거리에서 비교한 등급이 절대 등급입니다.`;
      else ins = '10 pc보다 먼 별은 다가오면서 밝아지고(등급이 작아짐), 10 pc보다 가까운 별은 멀어지면서 어두워집니다(등급이 커짐). <b>10 pc에 닿았을 때의 등급이 절대 등급 M</b>입니다.';
      $('lineup-insight').innerHTML = ins;
    }

    // ④ 거리 지수
    let cx, cbox;
    onDrag(chart, chart, (pt, phase) => {
      if (phase === 'end' || !pt || !cx) return;
      st.rWhat = M.clamp(cx.inv(M.clamp(pt.x, cbox.l, cbox.r)), 1, 1e4);
      renderModulus(); renderLineup();
    });
    function renderModulus() {
      const s = cur(), r = curR(), what = st.rWhat !== null, real = s.r;
      setPressed(starChips, 'data-star', st.q2 ? '' : st.sel);
      $('mod-q2').setAttribute('aria-pressed', String(st.q2));
      const m = what ? M.apparentMag(s.M, r) : s.m, mu = m - s.M;
      $('mod-r').value = M.clamp(Math.log10(r), 0, 4);
      $('mod-r-out').textContent = r < 1 ? `${fmtNum(r, 2)} pc (1 AU)` : fmtPc(r);
      $('mod-reset').disabled = !what;
      // 유도
      const lr = (s.m - s.M + 5) / 5;
      let d = `
        <div class="row"><span class="k">②</span>m₂ − m₁ = 5 log ${fr('d₂', 'd₁')} 에 &nbsp;<span class="note">실제 자리 d₂ = r, m₂ = m &nbsp;·&nbsp; 10 pc로 옮긴 자리 d₁ = 10 pc, m₁ = M</span></div>
        <div class="row key"><span class="k">④</span>m − M = 5 log ${fr('r', '10')} = <b>5 log r − 5</b> <span class="note">← 거리 지수 (교과서: −5 log ${fr('10', 'r')} = −5 + 5 log r)</span></div>`;
      if (st.q2) d += `
        <div class="row now"><b>Q2.</b> m = 7, M = 2인 별 &nbsp; (1) m − M = 7 − 2 = <b>5</b> &nbsp; (2) 5 = 5 log r − 5 → log r = 2 → r = <b>100 pc</b> &nbsp; (3) 10 pc로 옮기면 m = M = <b>2등급</b></div>`;
      else if (what) d += `
        <div class="row now">${s.name}(M = ${sv(s, s.M)})${josa(s.name, '을', '를').slice(s.name.length)} r = ${fmtPc(r)}에 놓으면 &nbsp; m = M + 5 log r − 5 = ${sv(s, s.M)} + 5 log ${fmtNum(r)} − 5 = <b>${num(m, 2)}등급</b></div>`;
      else d += `
        <div class="row now">${s.name}: m − M = ${sv(s, s.m)} − ${svP(s, s.M)} = ${sv(s, s.m - s.M)} → log r = ${fr(`${sv(s, s.m - s.M)} + 5`, '5')} = ${num(lr, 3)} → r = ${pw('10', num(lr, 3))} ≈ <b>${s.id === 'sun' ? '0.000005 pc (약 1 AU)' : fmtPc(real)}</b></div>`;
      $('mod-derive').innerHTML = d;
      // 그래프
      clear(chart);
      const tall = small();
      chart.setAttribute('viewBox', `0 0 640 ${tall ? 400 : 290}`);
      cbox = {l: tall ? 96 : 64, r: 620, t: 18, b: tall ? 316 : 232};
      cx = logScale(1, 1e4, cbox.l, cbox.r);
      const ys = lin(-5, 15, cbox.b, cbox.t);
      el('rect', {x: cx(1), y: cbox.t, width: cx(10) - cx(1), height: cbox.b - cbox.t, fill: '#3d6fe0', opacity: 0.07}, chart);
      el('rect', {x: cx(10), y: cbox.t, width: cx(1e4) - cx(10), height: cbox.b - cbox.t, fill: '#f2a33a', opacity: 0.08}, chart);
      const g = el('g', {class: 'axis'}, chart);
      [-5, 0, 5, 10, 15].forEach(v => {
        el('line', {x1: cbox.l, x2: cbox.r, y1: ys(v), y2: ys(v), class: 'grid-line'}, g);
        el('text', {x: cbox.l - 8, y: ys(v) + 4, 'text-anchor': 'end', class: 'tick'}, g, num(v, 0));
      });
      [1, 10, 100, 1000, 1e4].forEach(v => {
        el('line', {x1: cx(v), x2: cx(v), y1: cbox.t, y2: cbox.b, class: 'grid-line'}, g);
        el('text', {x: cx(v), y: cbox.b + (tall ? 28 : 18), 'text-anchor': 'middle', class: 'tick'}, g, v === 1e4 ? '10⁴' : String(v));
      });
      el('line', {x1: cbox.l, x2: cbox.l, y1: cbox.t, y2: cbox.b, 'stroke-width': 1.2}, g);
      el('line', {x1: cbox.l, x2: cbox.r, y1: cbox.b, y2: cbox.b, 'stroke-width': 1.2}, g);
      el('text', {x: (cbox.l + cbox.r) / 2, y: cbox.b + (tall ? 58 : 40), 'text-anchor': 'middle', class: 'axis-label'}, g, '별까지의 거리 r (pc) — 로그 눈금');
      el('text', {x: 16, y: (cbox.t + cbox.b) / 2, transform: `rotate(-90 16 ${(cbox.t + cbox.b) / 2})`, 'text-anchor': 'middle', class: 'axis-label'}, g, '거리 지수 m − M');
      const lh = tall ? 24 : 16;
      el('text', {x: cx(1) + 8, y: cbox.t + 18, class: 'annot', fill: '#2b55b8'}, chart, '10 pc보다 가깝다');
      el('text', {x: cx(1) + 8, y: cbox.t + 18 + lh, class: 'annot', fill: '#2b55b8'}, chart, 'm − M < 0');
      el('text', {x: cbox.r - 8, y: cbox.b - 12 - lh, 'text-anchor': 'end', class: 'annot', fill: '#a85a00'}, chart, '10 pc보다 멀다');
      el('text', {x: cbox.r - 8, y: cbox.b - 12, 'text-anchor': 'end', class: 'annot', fill: '#a85a00'}, chart, 'm − M > 0');
      el('line', {x1: cx(1), y1: ys(-5), x2: cx(1e4), y2: ys(15), stroke: '#14283a', 'stroke-width': 2.4}, chart);
      [[1, -5], [10, 0], [100, 5], [1000, 10]].forEach(([rv, v]) => el('circle', {cx: cx(rv), cy: ys(v), r: 4, fill: '#fff', stroke: '#14283a', 'stroke-width': 2}, chart));
      if (r >= 1) {
        const x = cx(r), y = ys(mu);
        el('path', {d: `M${x} ${cbox.b}V${y}H${cbox.l}`, stroke: '#c2581c', 'stroke-width': 1.8, 'stroke-dasharray': '5 4', fill: 'none'}, chart);
        el('circle', {cx: x, cy: y, r: tall ? 10 : 7, fill: '#e6a93c', stroke: '#fff', 'stroke-width': 2}, chart);
        const right = x < cbox.r - 230;
        el('text', {x: right ? x + 12 : x - 12, y: y - 12, 'text-anchor': right ? 'start' : 'end', class: 'annot halo', fill: '#c2581c'}, chart, `${s.name}: r = ${fmtPc(r)}, m − M = ${num(mu, 2)}`);
      } else {
        el('text', {x: cbox.l + 10, y: cbox.b - 34, class: 'annot halo', fill: '#c2581c'}, chart, `태양은 1 AU(약 0.000005 pc) — 그래프 밖 (m − M = ${num(mu, 1)})`);
      }
      // 작은 표
      const cols = [[1, -5], [10, 0], [100, 5], [1000, 10]];
      const onCol = cols.findIndex(([rv]) => Math.abs(Math.log10(r / rv)) < 0.02);
      $('mod-table').innerHTML = `<tr><th>거리 r</th>${cols.map(([rv], i) => `<td class="${i === onCol ? 'on' : ''}">${rv} pc</td>`).join('')}</tr>
        <tr><th>m − M</th>${cols.map(([, v], i) => `<td class="${i === onCol ? 'on' : ''}">${num(v, 0)}</td>`).join('')}</tr>`;
      let ins;
      if (st.q2) ins = '거리 지수가 5이면 100 pc입니다. 같은 별을 10 pc로 옮기면 겉보기 등급이 절대 등급(2등급)과 같아집니다.';
      else if (what) ins = `${josa(s.name, '을', '를')} ${fmtPc(r)}에 놓으면 ${num(m, 2)}등급으로 보입니다(실제로는 ${s.id === 'sun' ? '1 AU' : fmtPc(real)}에서 ${sv(s, s.m)}등급). <b>거리가 10배 멀어질 때마다 거리 지수는 5씩 커집니다.</b>`;
      else ins = `<b>거리 지수 m − M이 클수록 먼 별입니다.</b> 10 pc에 있는 별은 m − M = 0, 10 pc보다 가까우면 음수, 멀면 양수입니다. 그래프를 좌우로 끌면 이 별을 다른 거리에 놓아 볼 수 있습니다.`;
      $('mod-insight').innerHTML = ins;
    }

    // ⑤ 두 별 비교
    $('case-eq').innerHTML = `m₁ − m₂ = (M₁ − M₂) + 5 log ${par(fr('r₁', 'r₂'))}<span class="sub">겉보기 등급 차 = 광도에서 오는 차 + 거리에서 오는 차 &nbsp;·&nbsp; 두 별의 거리 지수 식을 빼면 나옵니다</span>`;
    document.querySelectorAll('#case-tabs [data-case]').forEach(b => b.addEventListener('click', () => { st.kase = b.dataset.case; renderCase(true); }));
    const CASES = {
      dist: {tag: '① 거리가 같다', f: 'm₁ − m₂ = M₁ − M₂', t: '겉보기 등급 차가 곧 광도 차입니다.', ex: '예) 한 성단 속의 별들',
        sliders: [['r', '두 별까지의 거리 r (같음)', 0, 4, 'log'], ['M2', '별 2의 절대 등급 M₂', -8, 10, 'lin']]},
      lum: {tag: '② 광도가 같다', f: `m₁ − m₂ = 5 log ${par(fr('r₁', 'r₂'))}`, t: '더 어두워 보이는 별이 더 멉니다.', ex: '거리 10배 → 5등급',
        sliders: [['M', '두 별의 절대 등급 M (같음)', -8, 10, 'lin'], ['r2', '별 2까지의 거리 r₂', 0, 4, 'log']]},
      app: {tag: '③ 겉보기 등급이 같다', f: `M₂ − M₁ = 5 log ${par(fr('r₁', 'r₂'))}`, t: '광도가 큰 별이 더 멉니다.', ex: '광도 100배 → 거리 10배',
        sliders: [['M2', '별 2의 절대 등급 M₂', -5, 8, 'lin']]}
    };
    function pair() {
      const c = st.cv;
      if (st.kase === 'dist') return [{M: c.dist.M1, r: c.dist.r}, {M: c.dist.M2, r: c.dist.r}];
      if (st.kase === 'lum') return [{M: c.lum.M, r: c.lum.r1}, {M: c.lum.M, r: c.lum.r2}];
      const r1 = M.distanceFromModulus(c.app.m - c.app.M1);
      return [{M: c.app.M1, r: r1}, {M: c.app.M2, r: M.distanceForSameApparent(r1, c.app.M1, c.app.M2)}];
    }
    function renderCase(rebuild) {
      setPressed($('case-tabs'), 'data-case', st.kase);
      const body = $('case-body');
      if (st.kase === 'quiz') { renderQuiz(body); return; }
      const C = CASES[st.kase];
      if (rebuild || !body.querySelector('#case-svg')) {
        body.className = 'case-body';
        body.innerHTML = `<div><svg id="case-svg" class="chart" viewBox="0 0 640 200" role="img" aria-label="두 별의 거리와 등급"></svg><div class="decomp" id="case-decomp"></div><div class="sliders pad" id="case-sliders"></div></div>
          <div class="case-side"><div class="case-card"><span class="tag">${C.tag}</span><div class="f">${C.f}</div><div class="t">${C.t}</div><div class="ex">${C.ex}</div></div><p class="insight flat" id="case-insight"></p><p class="micro">기출에서는 ‘거리가 같은 두 별’, ‘겉보기 등급이 같은 두 별’이 자주 나옵니다. 먼저 무엇이 같은지 찾으세요.</p></div>`;
        const box = $('case-sliders');
        C.sliders.forEach(([key, label, lo, hi, kind]) => {
          const lab = document.createElement('label');
          const v = st.cv[st.kase][key];
          lab.innerHTML = `<span>${label} <output></output></span><input type="range" min="${lo}" max="${hi}" step="${kind === 'log' ? 0.01 : 0.1}" value="${kind === 'log' ? Math.log10(v) : v}">`;
          lab.querySelector('input').addEventListener('input', e => {
            const x = +e.target.value;
            st.cv[st.kase][key] = kind === 'log' ? +(10 ** x).toPrecision(3) : Math.round(x * 10) / 10;
            renderCase(false);
          });
          lab.dataset.key = key; lab.dataset.kind = kind;
          box.appendChild(lab);
        });
      }
      $('case-sliders').querySelectorAll('label').forEach(lab => {
        const v = st.cv[st.kase][lab.dataset.key];
        lab.querySelector('output').textContent = lab.dataset.kind === 'log' ? fmtPc(v) : mag(v);
      });
      const [a, b] = pair(), t = M.twoStars(a, b);
      // 그림
      const svg = $('case-svg'), tall = small();
      clear(svg);
      svg.setAttribute('viewBox', `0 0 640 ${tall ? 300 : 200}`);
      const xs = logScale(1, 1e5, tall ? 40 : 30, 610), yAx = tall ? 236 : 160, rows = tall ? [56, 146] : [42, 104];
      const defs = el('defs', {}, svg);
      glowGrad(defs, 'cs-1', '#0b7f9a'); glowGrad(defs, 'cs-2', '#c2581c');
      const ax = el('g', {class: 'axis'}, svg);
      el('line', {x1: xs(1), x2: xs(1e5), y1: yAx, y2: yAx, 'stroke-width': 1.3}, ax);
      [1, 10, 100, 1000, 1e4, 1e5].forEach(v => {
        el('line', {x1: xs(v), x2: xs(v), y1: yAx - 5, y2: yAx + 5, 'stroke-width': 1.3}, ax);
        el('text', {x: xs(v), y: yAx + (tall ? 28 : 18), 'text-anchor': 'middle', class: 'tick'}, ax, v >= 1e4 ? (v === 1e4 ? '10⁴' : '10⁵') : `${v}`);
      });
      el('text', {x: 610, y: yAx + (tall ? 58 : 36), 'text-anchor': 'end', class: 'tick'}, svg, '지구로부터의 거리 (pc, 로그 눈금)');
      [[a, t.m1, '별 1', 'cs-1', '#0b7f9a'], [b, t.m2, '별 2', 'cs-2', '#c2581c']].forEach(([s, m, name, gid, col], i) => {
        const y = rows[i], x = xs(M.clamp(s.r, 1, 1e5)), R = M.clamp(4 + (16 - m) * 0.9, 4, 22);
        el('line', {x1: xs(1), x2: x, y1: y, y2: y, stroke: col, 'stroke-width': 1, 'stroke-dasharray': '2 4', opacity: 0.5}, svg);
        el('line', {x1: x, x2: x, y1: y + R * 0.5, y2: yAx, stroke: col, 'stroke-width': 1, 'stroke-dasharray': '2 4', opacity: 0.5}, svg);
        el('circle', {cx: x, cy: y, r: R, fill: `url(#${gid})`}, svg);
        el('circle', {cx: x, cy: y, r: Math.max(3, R * 0.3), fill: col}, svg);
        const right = x < 380;
        el('text', {x: right ? x + R * 0.6 + 8 : x - R * 0.6 - 8, y: y - 4, 'text-anchor': right ? 'start' : 'end', class: 'annot halo', fill: col}, svg, `${name}  m = ${num(m, 1)}, M = ${num(s.M, 1)}`);
        el('text', {x: right ? x + R * 0.6 + 8 : x - R * 0.6 - 8, y: y + (tall ? 20 : 14), 'text-anchor': right ? 'start' : 'end', class: 'tick halo'}, svg, `r = ${fmtPc(s.r)}`);
      });
      const z = v => Math.abs(v) < 0.005;
      $('case-decomp').innerHTML = `
        <div class="box"><span class="k">겉보기 등급 차 m₁ − m₂</span><span class="v">${num(t.dm, 2)}</span></div><span class="op">=</span>
        <div class="box lumbox ${z(t.dM) ? 'zero' : ''}"><span class="k">광도에서 오는 차 M₁ − M₂</span><span class="v">${num(t.dM, 2)}</span></div><span class="op">+</span>
        <div class="box distbox ${z(t.dr) ? 'zero' : ''}"><span class="k">거리에서 오는 차 5 log ${fr('r₁', 'r₂')}</span><span class="v">${num(t.dr, 2)}</span></div>`;
      const L = M.luminosityRatio(a.M, b.M), rr = b.r / a.r;
      const lumTxt = z(t.dM) ? '광도가 같습니다' : L >= 1 ? `별 1의 광도가 별 2의 ${fmtNum(L, 3)}배` : `별 2의 광도가 별 1의 ${fmtNum(1 / L, 3)}배`;
      let ins;
      if (st.kase === 'dist') ins = `두 별이 같은 거리(${fmtPc(a.r)})에 있으니 거리에서 오는 차는 0입니다. 겉보기 등급 차 ${num(t.dm, 1)} = 절대 등급 차 → <b>${lumTxt}</b>입니다.`;
      else if (st.kase === 'lum') ins = `광도가 같으니 등급 차는 모두 거리에서 옵니다. 별 2가 별 1보다 ${fmtNum(rr, 3)}배 ${rr >= 1 ? '멀어' : '가까워'} <b>${num(Math.abs(t.dm), 2)}등급 ${rr >= 1 ? '어둡게' : '밝게'}</b> 보입니다.`;
      else ins = `두 별의 겉보기 등급이 ${num(st.cv.app.m, 0)}등급으로 같습니다. ${lumTxt}이고, 그래서 거리는 별 2가 별 1의 <b>${fmtNum(rr, 3)}배</b>입니다(광도 비 = 거리 비의 제곱).`;
      $('case-insight').innerHTML = ins;
    }
    function renderQuiz(body) {
      body.className = 'case-body quiz-mode';
      const q = M.solveQ4(), done = st.quizQ4Done;
      const blank = (v, show) => show ? `<span class="blank">( ${v} )</span>` : '(&nbsp;&nbsp;&nbsp;&nbsp;)';
      const stm = ['(가)까지의 거리는 100 pc이다.', '광도는 (가)가 (나)의 100배이다.', '거리는 (다)가 (나)의 10배이다.'];
      const why = ['(가) m − M = 5 → r = 100 pc', '(나)도 100 pc → M = +5. (가)와 절대 등급 5 차이 → 광도 100배', '(다) m = +10, m − M = 15 → r = 10⁴ pc → (나)의 100배'];
      const k = ['ㄱ', 'ㄴ', 'ㄷ'];
      const allAnswered = st.quizQ4.every(v => v !== null);
      const correct = st.quizQ4.every((v, i) => v === q.statements[i]);
      const r4 = st.quizR4;
      const choices = ['지구에서 데네브까지의 거리는 1000 pc이다.', '스피카는 베가보다 지구로부터 먼 곳에 있다.', '베가의 거리 지수는 0보다 작다.', '같은 거리에 있을 때 가장 밝은 별은 태양이다.', '태양을 제외하고 연주 시차가 가장 큰 별은 베가이다.'];
      body.innerHTML = `
        <div>
          <p class="qtitle">Q4. 세 별, 무엇이 같은가?<span class="src">수업 활동지 · 기출형</span></p>
          <p class="qstem">(가)와 (나)는 지구로부터의 <b>거리가 같고</b>, (나)와 (다)는 <b>겉보기 등급이 같다</b>.</p>
          <table class="quiz-table"><tr><th>별</th><th>겉보기 등급</th><th>절대 등급</th><th>거리(pc)</th></tr>
            <tr><td><b>(가)</b></td><td>+5</td><td>0</td><td>${blank(100, done)}</td></tr>
            <tr><td><b>(나)</b></td><td>+10</td><td>${blank('+5', done)}</td><td>${blank(100, done)}</td></tr>
            <tr><td><b>(다)</b></td><td>${blank('+10', done)}</td><td>−5</td><td>${blank('10⁴', done)}</td></tr></table>
          <div class="ox-list">${stm.map((s, i) => `<div class="ox-row"><span class="stmt"><b>${k[i]}.</b> ${s}</span>
            <button type="button" data-ox="${i}" data-v="1" aria-pressed="${st.quizQ4[i] === true}">○</button><button type="button" data-ox="${i}" data-v="0" aria-pressed="${st.quizQ4[i] === false}">×</button></div>`).join('')}</div>
          <div class="btn-row"><button type="button" class="primary" id="q4-check" ${allAnswered ? '' : 'disabled'}>채점하기</button><button type="button" id="q4-reset">다시 풀기</button></div>
          ${done ? `<div class="feedback ${correct ? 'ok' : 'no'}"><b>${correct ? '정답입니다! 옳은 것은 ㄱ, ㄴ' : '다시 살펴보세요. 정답은 ㄱ, ㄴ'}</b>${why.map((w, i) => `<span class="sol">${k[i]} ${q.statements[i] ? '○' : '×'} &nbsp;${w}</span>`).join('')}</div>` : ''}
        </div>
        <div>
          <p class="qtitle">이 별들에 대한 설명으로 옳지 않은 것은?<span class="src">교과서 84쪽 단원 마무리 4번</span></p>
          <table class="quiz-table"><tr><th>별</th><th>겉보기 등급</th><th>절대 등급</th></tr>
            ${M.REVIEW4.map(s => `<tr><td><b>${s.name}</b></td><td>${num(s.m, 1)}</td><td>${num(s.M, 1)}</td></tr>`).join('')}</table>
          <div class="choice-list">${choices.map((c, i) => `<button type="button" data-ch="${i}" aria-pressed="${r4 === i}" class="${r4 === null ? '' : i === 3 ? 'right' : r4 === i ? 'wrong' : ''}">${'①②③④⑤'[i]} ${c}</button>`).join('')}</div>
          ${r4 === null ? '' : `<div class="feedback ${r4 === 3 ? 'ok' : 'no'}"><b>${r4 === 3 ? '정답입니다! ④' : '아쉬워요. 정답은 ④'}</b>
            <span class="sol">같은 거리(10 pc)에 있을 때 가장 밝은 별은 절대 등급이 가장 작은 <b>데네브(−8.7)</b>입니다. 태양(4.8)이 아닙니다.</span>
            <span class="sol">① 1.3 − (−8.7) = 10 → 1000 pc &nbsp; ② 스피카 m − M = 4.6(약 83 pc) &gt; 베가 −0.6(약 7.6 pc) &nbsp; ③ 베가 0.0 − 0.6 = −0.6 &lt; 0 &nbsp; ⑤ 가장 가까운 베가의 연주 시차가 가장 큽니다.</span></div>`}
        </div>`;
      body.querySelectorAll('[data-ox]').forEach(b => b.addEventListener('click', () => { st.quizQ4[+b.dataset.ox] = b.dataset.v === '1'; st.quizQ4Done = false; renderQuiz(body); }));
      const chk = body.querySelector('#q4-check');
      chk.addEventListener('click', () => { st.quizQ4Done = true; renderQuiz(body); });
      body.querySelector('#q4-reset').addEventListener('click', () => { st.quizQ4 = [null, null, null]; st.quizQ4Done = false; renderQuiz(body); });
      body.querySelectorAll('[data-ch]').forEach(b => b.addEventListener('click', () => { st.quizR4 = +b.dataset.ch; renderQuiz(body); }));
    }

    function render() { renderLineup(); renderModulus(); renderCase(true); stopPlay(); }
    return {render};
  })();

  // ═══════════════ 04 두 방법 비교하기 ═══════════════
  stations.s4 = (() => {
    const STARS = M.EXPLORE.map(s => Object.assign({}, s, {
      rp: M.distanceFromParallax(s.p), rm: M.distanceFromModulus(s.m - s.M), ans: M.EXPLORE_ANSWERS[s.id],
      color: s.id === 'sirius' ? '#5b7fd6' : s.id === 'betelgeuse' ? '#e07b39' : '#4a86c8',
      known: M.KNOWN_LY[s.id].map(M.lyToPc)
    }));
    const st = {solved: {}, typed: {}, sigma: 0.001, known: false, view: 'sky', method: 'parallax', u: 0, mv: 1, prevMethod: 'parallax', evalOpen: {}, q3: false, q4: false};
    const key = (id, k) => `${id}:${k}`;
    const isSolved = (id, k) => !!st.solved[key(id, k)];

    // 1 계산 카드
    const cards = $('ex-cards');
    function solution(s, k) {
      if (k === 'parallax') return `r = ${fr('1', 'p')} = ${fr('1', s.pText.includes('×') ? s.p.toFixed(5).replace(/0+$/, '') : s.pText)} = <b>${s.ans.parallax} pc</b>`;
      const mu = s.m - s.M, lr = (mu + 5) / 5, rough = M.roughPow10(lr);
      return `m − M = ${sv(s, s.m)} − ${svP(s, s.M)} = ${num(mu, 2)}<br>${num(mu, 2)} = 5 log r − 5 → log r = ${fr(`${num(mu, 2)} + 5`, '5')} = ${num(lr, 3)}<br>r = ${pw('10', num(lr, 3))} ≈ <b>${s.ans.modulus} pc</b><br><span class="micro">어림: ${pw('10', num(rough.k + rough.f, 1))} ${rough.k ? `= ${pw('10', rough.k)} × ${pw('10', num(rough.f, 1))}` : ''} ≈ ${fmtNum(rough.value, 3)} pc (10ˣ 어림표)</span>`;
    }
    function buildCards() {
      cards.innerHTML = STARS.map(s => `
        <div class="ex-card" data-star="${s.id}">
          <h4><i style="background:${s.color}"></i>${s.name} <small>${s.con}</small></h4>
          <div class="ex-data"><div><span>연주 시차 (″)</span><b>${s.pText}</b></div><div><span>겉보기 등급 m</span><b>${sv(s, s.m)}</b></div><div><span>절대 등급 M</span><b>${sv(s, s.M)}</b></div></div>
          ${['parallax', 'modulus'].map(k => `
          <div class="ans" data-k="${k}">
            <span class="lab ${k === 'parallax' ? 'par' : 'mod'}">${k === 'parallax' ? '① 연주 시차로 구한 거리' : '② 거리 지수로 구한 거리'}</span>
            <div class="ans-row"><input type="text" inputmode="decimal" autocomplete="off" aria-label="${s.name} ${k === 'parallax' ? '연주 시차로' : '거리 지수로'} 구한 거리(pc)" placeholder="?"><span class="unit">pc</span><button type="button" class="check-btn">확인</button></div>
            <div class="fb" aria-live="polite"></div>
            <details><summary>풀이 보기</summary><div class="sol">${solution(s, k)}</div></details>
          </div>`).join('')}
        </div>`).join('');
      cards.querySelectorAll('.ex-card').forEach(card => {
        const s = STARS.find(x => x.id === card.dataset.star);
        card.querySelectorAll('.ans').forEach(box => {
          const k = box.dataset.k, inp = box.querySelector('input'), fb = box.querySelector('.fb');
          const check = () => {
            const v = parseFloat(inp.value.replace(/,/g, '').replace(/[^\d.\-]/g, ''));
            const target = k === 'parallax' ? s.ans.parallax : s.ans.modulus;
            if (!isFinite(v)) { fb.className = 'fb'; fb.textContent = ''; return; }
            st.typed[key(s.id, k)] = inp.value;
            if (Math.abs(v / target - 1) <= 0.1) {
              st.solved[key(s.id, k)] = true;
              fb.className = 'fb ok'; fb.textContent = `✓ 좋아요! 교과서 답 ${target} pc`;
            } else {
              fb.className = 'fb no';
              fb.textContent = k === 'parallax' ? '✗ 다시 계산해 보세요. r = 1 ÷ 연주 시차' : '✗ 다시 계산해 보세요. 먼저 m − M을 구합니다.';
            }
            renderChart(); renderSky(); renderEval();
          };
          box.querySelector('.check-btn').addEventListener('click', check);
          inp.addEventListener('keydown', e => { if (e.key === 'Enter') check(); });
          box.querySelector('details').addEventListener('toggle', e => {
            if (e.target.open) { st.solved[key(s.id, k)] = true; renderChart(); renderSky(); renderEval(); }
          });
        });
      });
    }
    $('ex-pow10').innerHTML = `<b>10ˣ 어림표</b>${M.POW10.map(([x, v]) => `<span>10<sup>${x}</sup> ≈ ${num(v, 1)}</span>`).join('')}<span class="micro">예) 10<sup>2.4</sup> = 100 × 10<sup>0.4</sup> ≈ 250</span>`;
    $('ex-reveal-all').addEventListener('click', () => {
      cards.querySelectorAll('details').forEach(d => { d.open = true; });
      STARS.forEach(s => { st.solved[key(s.id, 'parallax')] = st.solved[key(s.id, 'modulus')] = true; });
      render();
    });
    $('ex-reset').addEventListener('click', () => {
      st.solved = {}; st.typed = {}; st.sigma = 0.001; st.known = false; st.view = 'sky'; st.u = 0; st.method = 'parallax'; st.evalOpen = {}; st.q3 = st.q4 = false;
      $('ex-known').checked = false; $('ex-sigma').value = 0.001;
      buildCards(); render();
    });
    $('ex-known').addEventListener('change', e => { st.known = e.target.checked; renderChart(); });
    $('ex-sigma').addEventListener('input', e => { st.sigma = +e.target.value; renderChart(); });

    // 2 로그 거리 눈금
    $('ex-legend').innerHTML = `<span><i class="dot" style="background:var(--par)"></i>연주 시차로 구한 거리 (가로 막대 = 연주 시차 오차에 따른 범위)</span><span><i class="dia" style="background:var(--mod)"></i>거리 지수로 구한 거리</span><span><i class="band" style="background:var(--known)"></i>오늘날 알려진 거리</span>`;
    function renderChart() {
      const svg = $('ex-axis'), tall = small();
      clear(svg);
      svg.setAttribute('viewBox', `0 0 640 ${tall ? 420 : 284}`);
      const box = {l: tall ? 150 : 104, r: tall ? 596 : 616, t: tall ? 44 : 34, b: tall ? 340 : 230};
      const xs = logScale(1, 1000, box.l, box.r);
      const g = el('g', {class: 'axis'}, svg);
      [1, 10, 100, 1000].forEach(v => {
        el('line', {x1: xs(v), x2: xs(v), y1: box.t - 10, y2: box.b, class: 'grid-line'}, g);
        el('text', {x: xs(v), y: box.b + (tall ? 28 : 18), 'text-anchor': 'middle', class: 'tick'}, g, `${v} pc`);
      });
      for (let dec = 0; dec < 3; dec++) for (let k = 2; k <= 9; k++) el('line', {x1: xs(10 ** dec * k), x2: xs(10 ** dec * k), y1: box.b, y2: box.b + 4}, g);
      el('line', {x1: box.l, x2: box.r, y1: box.b, y2: box.b, 'stroke-width': 1.2}, g);
      el('text', {x: (box.l + box.r) / 2, y: box.b + (tall ? 60 : 42), 'text-anchor': 'middle', class: 'axis-label'}, g, '지구로부터의 거리 (로그 눈금)');
      // 지상 관측 한계
      el('line', {x1: xs(100), x2: xs(100), y1: box.t - 18, y2: box.b, stroke: '#c2581c', 'stroke-width': 1.5, 'stroke-dasharray': '6 4'}, svg);
      el('text', {x: tall ? xs(100) - 6 : xs(100) + 6, y: box.t - 10, 'text-anchor': tall ? 'end' : 'start', class: 'tick', fill: '#c2581c'}, svg, '지상 관측 한계 약 100 pc');
      const rowY = i => box.t + 36 + i * ((box.b - box.t - 76) / 2);
      STARS.forEach((s, i) => {
        const y = rowY(i);
        el('text', {x: box.l - 12, y: y + 5, 'text-anchor': 'end', class: 'lbl-b', fill: s.color}, svg, s.name);
        el('line', {x1: box.l, x2: box.r, y1: y, y2: y, stroke: '#edf1f3'}, svg);
        if (st.known) {
          const [a, b] = s.known;
          if (b / a > 1.01) el('rect', {x: xs(a), y: y - 13, width: xs(b) - xs(a), height: 26, rx: 6, fill: '#8a5cc2', opacity: 0.22}, svg);
          else el('rect', {x: xs(a) - 3, y: y - 13, width: 6, height: 26, rx: 3, fill: '#8a5cc2', opacity: 0.55}, svg);
        }
        const sp = isSolved(s.id, 'parallax'), sm = isSolved(s.id, 'modulus');
        if (sp) {
          const rg = M.parallaxRange(s.p, st.sigma), xa = xs(M.clamp(rg.near, 1, 1000)), xb = xs(M.clamp(rg.far, 1, 1000));
          if (st.sigma > 0) {
            el('line', {x1: xa, x2: xb, y1: y, y2: y, stroke: '#c2581c', 'stroke-width': 3, 'stroke-linecap': 'round', opacity: 0.55}, svg);
            [xa, xb].forEach(x => el('line', {x1: x, x2: x, y1: y - 7, y2: y + 7, stroke: '#c2581c', 'stroke-width': 2}, svg));
            if (rg.far > 1000) el('text', {x: box.r - 2, y: y - 9, 'text-anchor': 'end', class: 'tick', fill: '#c2581c'}, svg, '→ 더 멀리');
          }
          el('circle', {cx: xs(s.rp), cy: y, r: tall ? 9 : 7, fill: '#c2581c', stroke: '#fff', 'stroke-width': 2}, svg);
          el('text', {x: xs(s.rp), y: y - (tall ? 16 : 12), 'text-anchor': 'middle', class: 'tick halo', fill: '#c2581c', 'font-weight': 700}, svg, `${s.ans.parallax}`);
        }
        if (sm) {
          const x = xs(s.rm), d = tall ? 9 : 7;
          el('path', {d: `M${x} ${y - d}L${x + d} ${y}L${x} ${y + d}L${x - d} ${y}Z`, fill: '#3d6fe0', stroke: '#fff', 'stroke-width': 2}, svg);
          el('text', {x, y: y + (tall ? 28 : 22), 'text-anchor': 'middle', class: 'tick halo', fill: '#2b55b8', 'font-weight': 700}, svg, `${s.ans.modulus}`);
        }
        if (!sp && !sm) el('text', {x: xs(1.4), y: y + 5, class: 'tick halo', fill: '#9aa9b5'}, svg, tall ? '계산하면 점이 찍힙니다' : '1에서 거리를 구하면 여기에 점이 찍힙니다');
      });
      $('ex-sigma-out').textContent = `${fmtNum(st.sigma, 2)}″`;
      // 오차 표
      const knownCol = s => { const [a, b] = M.KNOWN_LY[s.id]; return a === b ? `약 ${a}광년` : `약 ${a}~${b}광년`; };
      $('ex-errtable').innerHTML = `<tr><th>별</th><th>연주 시차로 구한 거리</th><th>±${fmtNum(st.sigma, 2)}″ 잘못 재면</th><th>흔들림</th>${st.known ? '<th>알려진 거리</th>' : ''}</tr>` + STARS.map(s => {
        const kc = st.known ? `<td>${knownCol(s)}</td>` : '';
        if (!isSolved(s.id, 'parallax')) return `<tr><td>${s.name}</td><td colspan="3" class="micro">① 연주 시차로 거리를 먼저 구해 보세요.</td>${kc}</tr>`;
        const rg = M.parallaxRange(s.p, st.sigma), e = M.relativeError(s.p, st.sigma);
        return `<tr><td>${s.name}</td><td class="big">${s.ans.parallax} pc</td><td>${st.sigma ? `${fmtPc(rg.near)} ~ ${isFinite(rg.far) ? fmtPc(rg.far) : '∞'}` : '—'}</td><td class="big">${st.sigma ? `±${e < 0.01 ? num(e * 100, 1) : Math.round(e * 100)}%` : '0%'}</td>${kc}</tr>`;
      }).join('');
      // Q3
      $('ex-q3').innerHTML = `<p class="q">3. 연주 시차와 거리 지수로 구한 별의 거리가 다르다면, 그 까닭은 무엇일까요?</p>
        <button type="button" aria-expanded="${st.q3}" id="ex-q3-btn">${st.q3 ? '답 숨기기' : '토의한 뒤 답 보기'}</button>
        ${st.q3 ? `<div class="a">연주 시차는 거리가 먼 별일수록 작은데, 지구로부터 100 pc 이상 떨어진 별들의 연주 시차는 너무 작기 때문에 측정하기 어렵고 측정값이 정확하지 않기 때문입니다(교사용 교과서 66쪽).
          <span class="more">더 생각해 보기 — 거리 지수로 구하려면 절대 등급 M을 정확히 알아야 합니다. 별빛이 오는 길의 성간 티끌도 겉보기 등급에 영향을 주는데(성간 소광), 이것은 Ⅲ단원에서 배웁니다.</span></div>` : ''}`;
      $('ex-q3-btn').addEventListener('click', () => { st.q3 = !st.q3; renderChart(); });
      // 통찰
      const solvedP = STARS.filter(s => isSolved(s.id, 'parallax'));
      let ins;
      if (!solvedP.length) ins = '① 연주 시차로, ② 거리 지수로 세 별의 거리를 구하면 그래프에 점이 찍힙니다. 시리우스부터 시작해 보세요.';
      else if (st.sigma === 0) ins = '오차가 0이면 연주 시차로 구한 거리는 한 점입니다. 실제 측정에는 언제나 오차가 있습니다. 막대를 움직여 보세요.';
      else {
        const parts = solvedP.map(s => { const e = M.relativeError(s.p, st.sigma); return `${s.name} 약 ±${e < 0.01 ? num(e * 100, 1) : Math.round(e * 100)}%`; }).join(', ');
        ins = `연주 시차를 ±${fmtNum(st.sigma, 2)}″만 잘못 재도 거리의 흔들림은 ${parts}입니다. <b>같은 측정 오차라도 연주 시차가 작은(먼) 별일수록 거리에 크게 반영됩니다.</b> 그래서 100 pc가 넘는 베텔게우스와 리겔은 두 방법의 값이 벌어집니다.`;
      }
      $('ex-insight').innerHTML = ins;
    }

    // 3 오리온자리: 하늘 ↔ 옆에서
    document.querySelectorAll('#ex-view [data-view]').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
    document.querySelectorAll('#ex-method [data-method]').forEach(b => b.addEventListener('click', () => {
      if (b.dataset.method === st.method) return;
      st.prevMethod = st.method; st.method = b.dataset.method;
      if (stopMv) stopMv();
      stopMv = tween(700, k => { st.mv = k; renderSky(); }, () => { stopMv = null; });
    }));
    let stopU = null, stopMv = null;
    function setView(v) {
      st.view = v;
      setPressed($('ex-view'), 'data-view', v);
      const from = st.u, to = v === 'side' ? 1 : 0;
      if (stopU) stopU();
      stopU = tween(1000, k => { st.u = from + (to - from) * k; renderSky(); }, () => { stopU = null; });
    }
    const SKYBY = Object.fromEntries(M.SKY.map(s => [s.id, s]));
    const RA0 = 90, DEC0 = -3.4, DREF = (M.decDeg(SKYBY.betelgeuse) + M.decDeg(SKYBY.rigel)) / 2;
    const distOf = (id, method) => {
      const s = STARS.find(x => x.id === id);
      if (method === 'parallax') return s.rp;
      if (method === 'modulus') return s.rm;
      return Math.sqrt(s.known[0] * s.known[1]);
    };
    const bgRnd = rng(11), skyBg = Array.from({length: 120}, () => [bgRnd(), bgRnd(), bgRnd()]);
    function renderSky() {
      const svg = $('ex-sky'), tall = small();
      clear(svg);
      const W = 640, H = tall ? 540 : 400;
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      setPressed($('ex-method'), 'data-method', st.method);
      const u = st.u, defs = el('defs', {}, svg);
      M.SKY.forEach(s => glowGrad(defs, `sk-${s.id}`, s.color || '#dce6ff'));
      skyBg.forEach(([a, b, c]) => el('circle', {cx: (a * W).toFixed(1), cy: (b * H).toFixed(1), r: (0.6 + c).toFixed(1), fill: '#8a93a6', opacity: (0.25 + 0.4 * c).toFixed(2)}, svg));
      // 하늘 자리
      const k = tall ? 16 : 12.5, scx = W / 2, scy = H / 2 + 2;
      const skyPos = s => { const o = M.skyOffset(s, RA0, DEC0); return {x: scx + o.x * k, y: scy - o.y * k}; };
      // 옆에서 본 자리: 거리 축은 가로, 남북(적위) 방향은 세로 — 같은 축척
      const ex = tall ? 36 : 40, ey = tall ? H / 2 - 30 : H / 2 - 10, sc = (W - ex - 40) / 340;
      const sideAt = (s, d) => {
        const dd = (M.decDeg(s) - DREF) * Math.PI / 180;
        return {x: ex + d * Math.cos(dd) * sc, y: ey - d * Math.sin(dd) * sc};
      };
      const dNow = id => {
        const a = distOf(id, st.prevMethod), b = distOf(id, st.method);
        return a + (b - a) * st.mv;
      };
      const posOf = s => {
        const p = skyPos(s);
        if (!['betelgeuse', 'rigel', 'sirius'].includes(s.id) || u === 0) return p;
        const q = sideAt(s, dNow(s.id));
        return {x: p.x + (q.x - p.x) * u, y: p.y + (q.y - p.y) * u};
      };
      // 별자리 선
      const lines = el('g', {opacity: (1 - u).toFixed(2)}, svg);
      M.ORION_LINES.forEach(([a, b]) => {
        const p = skyPos(SKYBY[a]), q = skyPos(SKYBY[b]);
        el('line', {x1: p.x, y1: p.y, x2: q.x, y2: q.y, stroke: '#4a5670', 'stroke-width': 2, 'stroke-dasharray': '2 7', 'stroke-linecap': 'round'}, lines);
      });
      if (u < 0.5) {
        const o = el('g', {opacity: (1 - 2 * u).toFixed(2)}, svg);
        const belt = skyPos(SKYBY.alnilam), sir = skyPos(SKYBY.sirius);
        el('text', {x: belt.x + 26, y: belt.y + 40, class: 'tick', fill: '#a9bccb'}, o, '오리온자리');
        el('text', {x: sir.x - 30, y: sir.y + 5, 'text-anchor': 'end', class: 'tick', fill: '#a9bccb'}, o, '큰개자리');
        el('text', {x: 14, y: tall ? 26 : 20, class: 'tick', fill: '#a9bccb'}, o, '북쪽이 위, 동쪽이 왼쪽 · 실제 좌표(J2000)');
      }
      // 옆에서 보기 요소
      if (u > 0) {
        const o = el('g', {opacity: u.toFixed(2)}, svg);
        const ax = el('g', {class: 'axis'}, o), ya = H - (tall ? 78 : 56);
        el('line', {x1: ex, x2: ex + 340 * sc, y1: ya, y2: ya, 'stroke-width': 1.3}, ax);
        [0, 100, 200, 300].forEach(v => {
          el('line', {x1: ex + v * sc, x2: ex + v * sc, y1: ya - 5, y2: ya + 5, 'stroke-width': 1.3}, ax);
          el('text', {x: ex + v * sc, y: ya + (tall ? 28 : 19), 'text-anchor': 'middle', class: 'tick'}, ax, `${v} pc`);
        });
        el('text', {x: ex + 340 * sc, y: ya - 10, 'text-anchor': 'end', class: 'tick'}, o, '지구로부터의 거리 →');
        el('circle', {cx: ex, cy: ey, r: 8, fill: '#3d6fe0', stroke: '#fff', 'stroke-width': 1.5}, o);
        el('text', {x: ex, y: ey + (tall ? 34 : 26), 'text-anchor': 'middle', class: 'lbl-b', fill: '#8fb3ff'}, o, '지구');
        ['betelgeuse', 'rigel'].forEach(id => {
          const s = SKYBY[id], far = sideAt(s, 345);
          el('line', {x1: ex, y1: ey, x2: far.x, y2: far.y, stroke: s.color, 'stroke-width': 1.2, 'stroke-dasharray': '4 6', opacity: 0.55}, o);
        });
        if (st.method === 'known' && st.mv > 0.99) {
          const s = SKYBY.betelgeuse, kn = STARS[1].known, a = sideAt(s, kn[0]), b = sideAt(s, kn[1]);
          el('line', {x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: '#ffb070', 'stroke-width': 9, 'stroke-linecap': 'round', opacity: 0.35}, o);
        }
        el('text', {x: 14, y: H - 14, class: 'tick', fill: '#a9bccb'}, o, tall ? '옆에서 본 모습 · 다른 별은 거리 자료가 없어 뺌' : '옆에서 본 모습 (거리와 남북 방향을 같은 축척으로) · 다른 별들은 교과서에 거리가 없어 뺐습니다');
      }
      // 별
      M.SKY.forEach(s => {
        const main = ['betelgeuse', 'rigel', 'sirius'].includes(s.id);
        const op = main ? 1 : 1 - u;
        if (op <= 0.01) return;
        const p = posOf(s), r = Math.max(2.5, (tall ? 15 : 12) - 3.6 * s.v);
        const g = el('g', {opacity: op.toFixed(2)}, svg);
        el('circle', {cx: p.x, cy: p.y, r: r * (2.4 - 0.9 * u), fill: `url(#sk-${s.id})`}, g);
        el('circle', {cx: p.x, cy: p.y, r: Math.max(2.2, r * 0.42), fill: s.color || '#dce6ff'}, g);
        if (s.name) {
          let lab = s.name;
          if (u > 0.5) {
            const d = dNow(s.id), star = STARS.find(x => x.id === s.id);
            lab = st.method === 'known' && s.id === 'betelgeuse' ? `${s.name} 약 ${Math.round(star.known[0])}~${Math.round(star.known[1])} pc`
              : `${s.name} ${fmtPc(d)}`;
          }
          const sir = s.id === 'sirius' && u > 0.5;
          // 오른쪽으로 넘치면 별의 왼쪽에 쓴다
          const est = lab.length * (tall ? 21 : 14) * 0.62, off = sir ? 14 : r * 0.9 + 6;
          const left = !sir && p.x + off + est > W - 6;
          el('text', {x: left ? p.x - off : p.x + off, y: sir ? p.y - 20 : left ? p.y - 14 : p.y + 5, 'text-anchor': left ? 'end' : 'start', class: 'lbl-b halo', fill: s.color}, svg, lab);
        }
      });
      if (u > 0) {
        const o = el('g', {opacity: u.toFixed(2)}, svg);
        el('circle', {cx: ex, cy: ey, r: 8, fill: '#3d6fe0', stroke: '#fff', 'stroke-width': 1.5}, o);
      }
      // 두 별 사이 거리 표시
      const sep = M.angularSeparation(SKYBY.betelgeuse, SKYBY.rigel);
      const dB = distOf('betelgeuse', st.method), dR = distOf('rigel', st.method), gap = M.spaceSeparation(dB, dR, sep);
      if (u > 0.98) {
        const pb = sideAt(SKYBY.betelgeuse, dB), pr = sideAt(SKYBY.rigel, dR);
        el('line', {x1: pb.x, y1: pb.y, x2: pr.x, y2: pr.y, stroke: '#ffd36b', 'stroke-width': 1.6, 'stroke-dasharray': '3 4'}, svg);
        el('text', {x: (pb.x + pr.x) / 2 + 10, y: (pb.y + pr.y) / 2 + 4, class: 'annot halo', fill: '#ffd36b'}, svg, `두 별 사이 약 ${Math.round(gap / 10) * 10} pc`);
      }
      // 토의 4
      $('ex-q4').innerHTML = `<p class="q">4. 하나의 별자리를 이루는 별들이 지구로부터 같은 거리에 있을까요?</p>
        <button type="button" aria-expanded="${st.q4}" id="ex-q4-btn">${st.q4 ? '답 숨기기' : '토의한 뒤 답 보기'}</button>
        ${st.q4 ? `<div class="a">아닙니다. 오리온자리의 베텔게우스와 리겔 사이는 <b>100 pc 이상</b> 떨어져 있습니다. 오늘날 알려진 거리는 베텔게우스 약 500~720광년(측정 방법마다 다름), 리겔 약 860광년입니다. 별자리의 별들은 하늘에서 비슷한 방향에 보일 뿐, 서로 다른 거리에 있습니다.</div>` : ''}`;
      $('ex-q4-btn').addEventListener('click', () => { st.q4 = !st.q4; renderSky(); });
      const mName = {parallax: '연주 시차로 구하면', modulus: '거리 지수로 구하면', known: '오늘날 알려진 거리로는'}[st.method];
      $('ex-sky-insight').innerHTML = u < 0.5
        ? `하늘에서는 베텔게우스와 리겔이 약 ${Math.round(sep)}° 떨어진 한 그림(오리온자리) 속에 있고, 시리우스도 비슷한 밝기로 보입니다. ‘옆에서 보기’를 눌러 거리를 펼쳐 보세요.`
        : `${mName} 베텔게우스 ${st.method === 'known' ? '약 153~221 pc' : fmtPc(dB)}, 리겔 ${fmtPc(dR)} — <b>두 별 사이는 약 ${Math.round(gap / 10) * 10} pc</b>입니다. 비슷한 밝기로 보이는 시리우스는 ${fmtPc(distOf('sirius', st.method))}로, 베텔게우스보다도 약 ${Math.round(dB / distOf('sirius', st.method))}배 가깝습니다. <b>같은 별자리의 별이라도 같은 거리에 있지 않습니다.</b>`;
    }

    // 4 평가
    const EVAL = [
      ['무엇을 재나', '연주 시차 p — 각도를 직접 잰다', '겉보기 등급 m과 절대 등급 M'],
      ['쓰는 식', `r = ${fr('1', 'p')}`, 'm − M = 5 log r − 5'],
      ['잘 맞는 별', '가까운 별 (지상 관측 약 100 pc 이내, Gaia는 밝은 별 수천 pc)', '먼 별 (절대 등급을 알 때)'],
      ['한계', '멀수록 연주 시차가 작아 같은 오차가 거리에 크게 반영된다', '절대 등급을 알아야 쓸 수 있다']
    ];
    $('ex-eval-all').addEventListener('click', () => {
      const all = EVAL.every((_, i) => st.evalOpen[`${i}p`] && st.evalOpen[`${i}m`]);
      EVAL.forEach((_, i) => { st.evalOpen[`${i}p`] = st.evalOpen[`${i}m`] = !all; });
      renderEval();
    });
    function renderEval() {
      const t = $('ex-eval');
      t.innerHTML = `<thead><tr><th></th><th class="par">① 연주 시차</th><th class="mod">② 거리 지수</th></tr></thead><tbody>` +
        EVAL.map((row, i) => `<tr><th>${row[0]}</th>${[['p', 1, 'par'], ['m', 2, 'mod']].map(([k, j, c]) => {
          const open = !!st.evalOpen[`${i}${k}`];
          return `<td><button type="button" class="${c}" data-ev="${i}${k}" aria-expanded="${open}"><span class="ev-k">${k === 'p' ? '① 연주 시차' : '② 거리 지수'}</span>${open ? row[j] : '<span class="qm">? 토의한 뒤 누르기</span>'}</button></td>`;
        }).join('')}</tr>`).join('') + '</tbody>';
      t.querySelectorAll('[data-ev]').forEach(b => b.addEventListener('click', () => { st.evalOpen[b.dataset.ev] = !st.evalOpen[b.dataset.ev]; renderEval(); }));
      $('ex-eval-all').textContent = EVAL.every((_, i) => st.evalOpen[`${i}p`] && st.evalOpen[`${i}m`]) ? '모두 숨기기' : '모두 보기';
      const pct = s => Math.abs(s.ans.parallax / s.ans.modulus - 1) * 100;
      const done = STARS.every(s => isSolved(s.id, 'parallax') && isSolved(s.id, 'modulus'));
      $('ex-eval-insight').innerHTML = done
        ? `<b>평가.</b> 가까운 시리우스는 두 방법의 값이 거의 같습니다(차이 ${num(pct(STARS[0]), 1)}%). 100 pc가 넘는 베텔게우스와 리겔은 ${Math.round(pct(STARS[1]))}%, ${Math.round(pct(STARS[2]))}%나 차이 납니다. 연주 시차는 각도를 직접 재므로 <b>가까운 별</b>에 가장 믿을 만하고, 연주 시차가 너무 작은 <b>먼 별</b>은 절대 등급을 알 때 거리 지수로 잽니다. 두 방법은 서로를 확인해 주는 자입니다.`
        : '세 별의 거리를 두 방법으로 모두 구하면, 두 방법의 차이를 숫자로 비교한 평가가 여기에 나타납니다.';
    }

    function render() { renderChart(); renderSky(); renderEval(); }
    buildCards();
    return {render};
  })();

  // ── 시작 ──
  function fromHash() { return (location.hash || '').slice(1); }
  show(fromHash() || 's1');
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => stations[current].render(), 150);
  });
  window.addEventListener('hashchange', () => { const h = fromHash(); if (h && (NAMES[h] || h) !== current) show(h); });
})();
