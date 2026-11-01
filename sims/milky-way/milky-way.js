/* 우리은하 지도 — 네 실험이 같은 모형(milky-way-model.js)과 자료(milky-way-data.js)를 쓴다. */
(() => {
  'use strict';
  const M = window.MilkyWayModel, DATA = window.MilkyWayData, $ = id => document.getElementById(id);
  const NS = 'http://www.w3.org/2000/svg';
  const num = M.num, sig = M.sig;
  const reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const FONT = '"Pretendard","Apple SD Gothic Neo","Malgun Gothic",system-ui,sans-serif';

  // ── 작은 도구들 ─────────────────────────────────────────────
  function el(tag, attrs, parent, text) {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs || {}) if (attrs[k] !== undefined && attrs[k] !== null) n.setAttribute(k, attrs[k]);
    if (text !== undefined) n.textContent = text;
    if (parent) parent.appendChild(n);
    return n;
  }
  const clear = n => { while (n.firstChild) n.removeChild(n.firstChild); };
  function lin(d0, d1, r0, r1) {
    const f = v => r0 + (v - d0) * (r1 - r0) / (d1 - d0);
    f.inv = p => d0 + (p - r0) * (d1 - d0) / (r1 - r0);
    f.d = [d0, d1];
    return f;
  }
  const small = () => window.innerWidth < 640;
  const pathOf = pts => pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('');
  function svgPoint(svg, evt) {
    const pt = svg.createSVGPoint();
    pt.x = evt.clientX; pt.y = evt.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  }
  function setPressed(container, attr, value) {
    container.querySelectorAll(`[${attr}]`).forEach(b => b.setAttribute('aria-pressed', String(b.getAttribute(attr) === value)));
  }
  // 아래첨자가 있는 SVG 글자: ['겉보기 등급 m', ['V', 'sub'], ' (위 = 밝음)']
  function richText(t, parts) {
    if (typeof parts === 'string') { t.textContent = parts; return t; }
    let shifted = false;
    parts.forEach(p => {
      const [text, kind] = Array.isArray(p) ? p : [p, ''];
      const span = el('tspan', {}, t, text);
      if (kind === 'sub') { span.setAttribute('dy', '4'); span.setAttribute('font-size', '72%'); shifted = true; }
      else if (shifted) { span.setAttribute('dy', '-4'); shifted = false; }
    });
    return t;
  }
  // 분수는 분자를 위, 분모를 아래에 쌓아 쓴다.
  const frac = (a, b) => `<span class="frac"><span>${a}</span><span>${b}</span></span>`;
  const SUP = {'0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻'};
  const sup = n => String(n).split('').map(c => SUP[c] || c).join('');
  const pct = (a, b) => Math.round(100 * a / b);
  // 좌표축과 격자. box = {l, r, t, b}
  function frame(svg, box, xs, ys, o) {
    const g = el('g', {class: 'axis'}, svg);
    (o.yTicks || []).forEach(t => {
      const y = ys(t.v);
      el('line', {x1: box.l, x2: box.r, y1: y, y2: y, class: 'grid-line'}, g);
      el('text', {x: box.l - 8, y: y + 4, 'text-anchor': 'end', class: 'tick'}, g, t.label);
    });
    (o.xTicks || []).forEach(t => {
      const x = xs(t.v);
      el('line', {x1: x, x2: x, y1: box.t, y2: box.b, class: 'grid-line'}, g);
      el('text', {x, y: box.b + (small() ? 26 : 18), 'text-anchor': 'middle', class: 'tick'}, g, t.label);
    });
    el('line', {x1: box.l, x2: box.l, y1: box.t, y2: box.b, 'stroke-width': 1.2}, g);
    el('line', {x1: box.l, x2: box.r, y1: box.b, y2: box.b, 'stroke-width': 1.2}, g);
    if (o.xLabel) el('text', {x: (box.l + box.r) / 2, y: box.b + (small() ? 54 : 38), 'text-anchor': 'middle', class: 'axis-label'}, g, o.xLabel);
    if (o.yLabel) {
      const t = el('text', {x: 16, y: (box.t + box.b) / 2, transform: `rotate(-90 16 ${(box.t + box.b) / 2})`, 'text-anchor': 'middle', class: 'axis-label'}, g);
      richText(t, o.yLabel);
    }
    return g;
  }
  // 누르기·끌기. 세로 스크롤은 브라우저에 맡긴다(touch-action: pan-y) — 손가락으로는 '누르기'와 '옆으로 끌기'만 온다.
  // 끌다가 브라우저가 스크롤로 가져가면 cancel 이 온다.
  function pointer(target, h) {
    let s = null;
    target.addEventListener('pointerdown', e => {
      if (e.button > 0) return;
      s = {id: e.pointerId, x0: e.clientX, y0: e.clientY, moved: false, mouse: e.pointerType === 'mouse'};
      try { target.setPointerCapture(e.pointerId); } catch (_) {}
      if (h.down) h.down(e, s);
    });
    target.addEventListener('pointermove', e => {
      if (!s || e.pointerId !== s.id) return;
      if (!s.moved && Math.hypot(e.clientX - s.x0, e.clientY - s.y0) > 6) s.moved = true;
      if (s.moved && h.move) h.move(e, s, e.clientX - s.x0, e.clientY - s.y0);
    });
    const end = (e, cancelled) => {
      if (!s || e.pointerId !== s.id) return;
      const was = s;
      s = null;
      if (cancelled) { if (h.cancel) h.cancel(e, was); }
      else if (!was.moved) { if (h.tap) h.tap(e, was); }
      else if (h.up) h.up(e, was);
    };
    target.addEventListener('pointerup', e => end(e, false));
    target.addEventListener('pointercancel', e => end(e, true));
  }
  // 부드러운 화면 전환(움직임 줄이기 설정이면 바로 바꾼다)
  function tween(from, to, ms, step, done) {
    if (reduced) { step(to); if (done) done(); return () => {}; }
    const t0 = performance.now(), keys = Object.keys(to);
    let alive = true;
    const tick = now => {
      if (!alive) return;
      const u = Math.min(1, (now - t0) / ms), e = u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
      const v = {};
      for (const k of keys) v[k] = from[k] + (to[k] - from[k]) * e;
      step(v);
      if (u < 1) requestAnimationFrame(tick); else if (done) done();
    };
    requestAnimationFrame(tick);
    return () => { alive = false; };
  }
  const wrapAngle = a => Math.atan2(Math.sin(a), Math.cos(a));
  const D2R = M.D2R;

  // ── 실험 전환 ─────────────────────────────────────────────
  const stations = {};
  const ALIAS = {structure: 's1', omega: 's2', centre: 's3', center: 's3', ladder: 's4', 1: 's1', 2: 's2', 3: 's3', 4: 's4'};
  let current = 's1';
  function show(name) {
    name = ALIAS[name] || name;
    if (!stations[name]) name = 's1';
    current = name;
    setPressed(document.querySelector('.stations'), 'data-station', name);
    document.querySelectorAll('.station').forEach(s => { s.hidden = s.id !== 'station-' + name; });
    stations[name].render();
    if (stations[name].wake) stations[name].wake();
    try { history.replaceState(null, '', '#' + name); } catch (_) {}
  }
  document.querySelectorAll('.stations button').forEach(b => b.addEventListener('click', () => {
    show(b.dataset.station);
    document.querySelector('.stations').scrollIntoView({block: 'nearest'});
  }));

  const clusters = M.clustersFrom(DATA);
  const KOR = {
    'NGC 5139': '오메가 센타우리', 'NGC 104': '큰부리새자리 47', 'NGC 5272': 'M3 (사냥개자리)', 'NGC 6205': 'M13 (헤르쿨레스자리)',
    'NGC 6093': 'M80 (전갈자리)', 'NGC 6121': 'M4 (전갈자리)', 'NGC 6656': 'M22 (궁수자리)', 'NGC 7078': 'M15 (페가수스자리)',
    'NGC 6341': 'M92 (헤르쿨레스자리)', 'NGC 5904': 'M5 (뱀자리)', 'NGC 7089': 'M2 (물병자리)', 'NGC 6254': 'M10 (뱀주인자리)'
  };
  const clusterName = c => KOR[c.id] ? `${KOR[c.id]} · ${c.id}` : (c.alt ? `${c.id} (${c.alt})` : c.id);
  const omegaC = clusters.find(c => c.id === 'NGC 5139');

  // ═══════════════ 01 우리은하의 구조 ═══════════════
  stations.s1 = (() => {
    const canvas = $('s1-canvas'), ctx = canvas.getContext('2d');
    const K = M.KIND, GCX = M.R0.modern;
    const sats = DATA.satellites.map(s => ({...s, p: M.xyzFromLB(s.l, s.b, s.d)}));
    // 점 구름: 종류별로 묶어 한 번에 그린다
    const groups = {};
    for (const p of M.generateGalaxy(7, GCX, DATA.satellites)) (groups[p[3]] = groups[p[3]] || []).push(p);
    const packs = Object.keys(groups).map(k => {
      const arr = groups[k], xyz = new Float32Array(arr.length * 3);
      arr.forEach((p, i) => { xyz[i * 3] = p[0]; xyz[i * 3 + 1] = p[1]; xyz[i * 3 + 2] = p[2]; });
      return {kind: +k, n: arr.length, xyz, raw: arr};
    });
    const STYLE = {
      [K.DISK]: ['255,236,205', 0.30, 1.2], [K.ARM]: ['168,204,255', 0.55, 1.3], [K.BULGE]: ['255,198,112', 0.55, 1.4],
      [K.HALO]: ['255,214,170', 0.30, 1.2], [K.STREAM]: ['196,176,255', 0.42, 1.2], [K.MAGELLAN]: ['210,224,255', 0.55, 1.3],
      [K.OPEN]: ['110,190,255', 0.95, 2.4], [K.NEBULA]: ['255,105,155', 0.9, 2.2]
    };
    const ORDER = [K.DISK, K.HALO, K.STREAM, K.MAGELLAN, K.ARM, K.BULGE, K.NEBULA, K.OPEN];
    const gcFar = clusters.filter(c => Math.abs(c.z) >= 1).length;
    // 나선팔 이름표 자리 (은하 중심 좌표의 방위각)
    const ARM_LABELS = [['ori', 205], ['per', 150], ['sgr', 222], ['sct', 252], ['nor', 300], ['nor', 470, '외곽 팔'], ['k3n', 140]]
      .map(([id, phi, name]) => { const a = M.ARMS.find(x => x.id === id); return {name: name || a.name, p: M.armXYZ(a, phi, GCX)}; });

    const VIEWS = {oblique: {az: -100 * D2R, el: 22 * D2R}, top: {az: -90 * D2R, el: 90 * D2R}, side: {az: -90 * D2R, el: 0}};
    const ZOOMS = [9, 13, 17, 26, 40, 75];
    const st = {az: VIEWS.oblique.az, el: VIEWS.oblique.el, zoom: 17, view: 'oblique', unit: 'pc', measure: false, sel: null, pick: null, spin: false};
    let stopTween = () => {}, W = 0, H = 0, dpr = 1, raf = 0, lastT = 0, proj = null;

    const COMPS = [
      {id: 'bulge', name: '팽대부', sw: '#f0b553', kinds: [K.BULGE], zoom: 14},
      {id: 'disk', name: '원반 · 나선팔', sw: '#9cc4ff', kinds: [K.ARM, K.DISK, K.OPEN, K.NEBULA], zoom: 17},
      {id: 'halo', name: '헤일로', sw: '#b9a8e8', kinds: [K.HALO, K.STREAM], gc: true, zoom: 45},
      {id: 'gc', name: '구상 성단', sw: '#ffa630', kinds: [], gc: true, zoom: 45},
      {id: 'oc', name: '산개 성단', sw: '#3d9bff', kinds: [K.OPEN], zoom: 17},
      {id: 'sun', name: '태양계', sw: '#ffd84a', kinds: null, zoom: 17},
      {id: 'mc', name: '대·소마젤란은하', sw: '#bccbe8', kinds: [K.MAGELLAN], zoom: 75},
      {id: 'compare', name: '산개 성단과 구상 성단 비교', sw: 'linear-gradient(90deg,#3d9bff 50%,#ffa630 50%)', kinds: [K.OPEN], gc: true, zoom: 32, wide: true, view: 'side'}
    ];
    const compList = $('s1-comps');
    COMPS.forEach(c => {
      const b = document.createElement('button');
      b.type = 'button'; b.dataset.comp = c.id; b.setAttribute('aria-pressed', 'false');
      if (c.wide) b.className = 'wide';
      b.innerHTML = `<span class="sw" style="background:${c.sw}"></span>${c.name}`;
      b.addEventListener('click', () => select(st.sel === c.id ? null : c.id));
      compList.appendChild(b);
    });
    function select(id) {
      st.sel = id; st.pick = null;
      const c = COMPS.find(x => x.id === id);
      if (c) {
        const to = {zoom: c.zoom};
        if (c.view) Object.assign(to, VIEWS[c.view]);
        goTo(to, c.view || null);
      }
      render();
    }
    function goTo(to, viewName) {
      stopTween();
      st.spin = false; syncSpin();
      if (viewName !== undefined) st.view = viewName;
      const from = {az: st.az, el: st.el, zoom: st.zoom};
      const target = {az: to.az !== undefined ? from.az + wrapAngle(to.az - from.az) : from.az, el: to.el !== undefined ? to.el : from.el, zoom: to.zoom !== undefined ? to.zoom : from.zoom};
      stopTween = tween(from, target, 650, v => { st.az = v.az; st.el = v.el; st.zoom = v.zoom; syncControls(); draw(); });
    }
    document.querySelectorAll('#s1-views [data-view]').forEach(b => b.addEventListener('click', () => {
      st.view = b.dataset.view; goTo(VIEWS[b.dataset.view], b.dataset.view); render();
    }));
    document.querySelectorAll('#s1-unit [data-unit]').forEach(b => b.addEventListener('click', () => { st.unit = b.dataset.unit; render(); }));
    $('s1-measure').addEventListener('change', e => { st.measure = e.target.checked; render(); });
    $('s1-zoom-in').addEventListener('click', () => zoomStep(-1));
    $('s1-zoom-out').addEventListener('click', () => zoomStep(1));
    function zoomStep(d) {
      let i = ZOOMS.findIndex(z => z >= st.zoom - 0.01);
      if (i < 0) i = ZOOMS.length - 1;
      i = Math.max(0, Math.min(ZOOMS.length - 1, i + d));
      goTo({zoom: ZOOMS[i]});
    }
    $('s1-spin').addEventListener('click', () => { st.spin = !st.spin; syncSpin(); wake(); });
    function syncSpin() { $('s1-spin').setAttribute('aria-pressed', String(st.spin)); $('s1-spin').textContent = st.spin ? '❚❚ 돌리기 멈춤' : '⟳ 천천히 돌리기'; }
    $('s1-tilt').addEventListener('input', e => { stopTween(); st.el = +e.target.value * D2R; st.view = null; st.spin = false; syncSpin(); syncControls(); draw(); });
    function syncControls() {
      $('s1-tilt').value = Math.round(st.el / D2R);
      $('s1-tilt-out').textContent = st.el > 80 * D2R ? '위에서' : st.el < 8 * D2R ? '옆에서' : `${Math.round(st.el / D2R)}°`;
      setPressed($('s1-views'), 'data-view', st.view || '');
    }

    // 끌어서 돌리기, 눌러서 고르기
    pointer(canvas, {
      down: (e, s) => { s.az0 = st.az; s.el0 = st.el; },
      move: (e, s, dx, dy) => {
        stopTween();
        st.spin = false; syncSpin();
        st.az = s.az0 - dx * 0.008;
        if (s.mouse) st.el = Math.max(0, Math.min(Math.PI / 2, s.el0 + dy * 0.008));
        st.view = null; syncControls(); draw();
      },
      tap: e => { const r = canvas.getBoundingClientRect(); pickAt(e.clientX - r.left, e.clientY - r.top); }
    });
    canvas.addEventListener('keydown', e => {
      const k = e.key;
      if (k === 'ArrowLeft' || k === 'ArrowRight') { st.az += (k === 'ArrowLeft' ? 1 : -1) * 10 * D2R; }
      else if (k === 'ArrowUp' || k === 'ArrowDown') { st.el = Math.max(0, Math.min(Math.PI / 2, st.el + (k === 'ArrowUp' ? 1 : -1) * 6 * D2R)); }
      else if (k === '+' || k === '=') { zoomStep(-1); e.preventDefault(); return; }
      else if (k === '-') { zoomStep(1); e.preventDefault(); return; }
      else return;
      e.preventDefault(); stopTween(); st.spin = false; syncSpin(); st.view = null; syncControls(); draw();
    });

    function size() {
      const w = canvas.clientWidth || 600, h = Math.round(w * (small() ? 1 : 0.62));
      canvas.style.height = h + 'px';
      dpr = Math.min(2, window.devicePixelRatio || 1);
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
      W = w; H = h;
    }
    // 화면 좌표: kpc → 픽셀
    function camera() {
      const B = M.cameraBasis(st.az, st.el), s = Math.min(W, H) / 2 / st.zoom * 0.94, cx = W / 2, cy = H / 2;
      const r = B.right, u = B.up, T = [GCX, 0, 0];
      const P = (x, y, z) => {
        const dx = x - T[0], dy = y - T[1], dz = z - T[2];
        return [cx + s * (dx * r[0] + dy * r[1]), cy - s * (dx * u[0] + dy * u[1] + dz * u[2])];
      };
      return {B, s, cx, cy, P};
    }
    const dual = (kpc, lyFixed) => {
      const ly = lyFixed || M.lyText(kpc * 1000);
      return st.unit === 'ly' ? `${ly} <small>(약 ${sig(kpc)} kpc)</small>` : `약 ${sig(kpc)} kpc <small>(${ly})</small>`;
    };
    function label(text, x, y, o = {}) {
      const fs = (o.size || 12) * (small() ? 1.05 : 1);
      ctx.font = `${o.weight || 700} ${fs}px ${FONT}`;
      ctx.textAlign = o.align || 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 3.5; ctx.strokeStyle = 'rgba(8,20,34,0.85)'; ctx.lineJoin = 'round';
      ctx.strokeText(text, x, y);
      ctx.fillStyle = o.color || '#dfe9f1'; ctx.fillText(text, x, y);
    }
    function dimFor(kind) {
      const c = COMPS.find(x => x.id === st.sel);
      if (!c || c.kinds === null) return 1;
      return c.kinds.includes(kind) ? 1 : 0.13;
    }
    function draw() {
      if (current !== 's1') return;
      size();
      const cam = camera(), {P, s} = cam;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const sel = COMPS.find(x => x.id === st.sel);
      // 헤일로의 희미한 빛
      const [gx, gy] = P(GCX, 0, 0);
      const haloR = 38 * s;
      const hg = ctx.createRadialGradient(gx, gy, 0, gx, gy, haloR);
      const hs = st.sel === 'halo' ? 1.8 : 1;
      hg.addColorStop(0, `rgba(150,170,225,${0.16 * hs})`); hg.addColorStop(0.55, `rgba(120,140,200,${0.07 * hs})`); hg.addColorStop(1, 'rgba(120,140,200,0)');
      ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(gx, gy, haloR, 0, Math.PI * 2); ctx.fill();
      // 원반의 희미한 면
      const se = Math.abs(Math.sin(st.el));
      ctx.globalAlpha = 0.10 * dimFor(K.DISK);
      ctx.fillStyle = '#cfe0ff'; ctx.beginPath(); ctx.ellipse(gx, gy, 15 * s, Math.max(1, 15 * s * se), 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      // 점 구름
      ctx.globalCompositeOperation = 'lighter';
      const r = cam.B.right, u = cam.B.up, k = Math.max(0.8, Math.min(1.6, 22 / st.zoom * 0.9 + 0.3));
      for (const kind of ORDER) {
        const pack = packs.find(p => p.kind === kind);
        if (!pack) continue;
        const [rgb, a, sz] = STYLE[kind], d = dimFor(kind);
        ctx.fillStyle = `rgb(${rgb})`; ctx.globalAlpha = a * d;
        const big = kind === K.OPEN && (st.sel === 'oc' || st.sel === 'compare') ? 1.5 : 1;
        const h = big * sz * (kind === K.OPEN || kind === K.NEBULA ? 1 : k) / 2, xyz = pack.xyz;
        for (let i = 0; i < pack.n; i++) {
          const dx = xyz[i * 3] - GCX, dy = xyz[i * 3 + 1], dz = xyz[i * 3 + 2];
          const sx = cam.cx + s * (dx * r[0] + dy * r[1]), sy = cam.cy - s * (dx * u[0] + dy * u[1] + dz * u[2]);
          if (sx < -4 || sx > W + 4 || sy < -4 || sy > H + 4) continue;
          ctx.fillRect(sx - h, sy - h, 2 * h, 2 * h);
        }
      }
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      // 구상 성단(실제 위치)
      const gcOn = !sel || sel.gc || sel.kinds === null;
      proj = {gc: [], P};
      ctx.fillStyle = '#ffa630';
      ctx.globalAlpha = gcOn ? 0.95 : 0.18;
      const gr = (sel && sel.gc ? 2.6 : 2.0) * (small() ? 1.15 : 1);
      for (const c of clusters) {
        const [x, y] = P(c.x, c.y, c.z);
        proj.gc.push([x, y, c]);
        ctx.beginPath(); ctx.arc(x, y, gr, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      // 크기 재기
      if (st.measure) drawMeasure(cam, se);
      // 이름표
      const [sx0, sy0] = P(0, 0, 0);
      ctx.strokeStyle = '#ffe066'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(sx0, sy0, 6.5, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#ffe066'; ctx.beginPath(); ctx.arc(sx0, sy0, 2.6, 0, Math.PI * 2); ctx.fill();
      label('태양계', sx0, sy0 - 16, {color: '#ffe58a', size: 13});
      if (!sel || sel.id === 'bulge' || sel.id === 'sun') label(sel && sel.id === 'bulge' ? '팽대부 (은하 중심)' : '팽대부', gx, gy - Math.max(16, 3.2 * s * (0.4 + 0.6 * Math.cos(st.el))) , {color: '#ffd59a', size: 13});
      if (sel && sel.id === 'disk') ARM_LABELS.forEach(a => { const [x, y] = P(...a.p); label(a.name, x, y, {color: '#bcd7ff', size: 11, weight: 700}); });
      if (sel && (sel.id === 'halo')) {
        const [hx, hy] = P(GCX + 26, 0, 30);
        label('헤일로', gx, gy - haloR * 0.72, {color: '#d4c8ff', size: 14});
        label('궁수자리 별 흐름', hx, hy, {color: '#c9b8ff', size: 11});
      }
      if (sel && (sel.id === 'gc' || sel.id === 'compare' || sel.id === 'halo')) {
        const [ox, oy] = P(omegaC.x, omegaC.y, omegaC.z);
        label('오메가 센타우리', ox + 6, oy + 14, {color: '#ffc77a', size: 11, align: 'left'});
      }
      if (sel && sel.id === 'compare') {
        label('산개 성단(파랑): 얇은 원반 안', 14, 44, {color: '#8ccaff', size: 13, align: 'left'});
        label('구상 성단(주황): 원반 위아래로 공 모양', 14, 22, {color: '#ffc77a', size: 13, align: 'left'});
      }
      sats.forEach(m => {
        const [x, y] = P(...m.p);
        if (x < -40 || x > W + 40 || y < -20 || y > H + 20) return;
        label(m.name, x, y + 4 * k + 14, {color: '#dfe7ff', size: 11, weight: 600});
      });
      // 고른 천체 표시
      if (st.pick) {
        const [x, y] = st.pick.xyz ? P(...st.pick.xyz) : [0, 0];
        ctx.strokeStyle = '#7fd6ea'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.stroke();
      }
      // 화면 안 길이의 기준 막대
      scaleBar(s);
      // 오프스크린 마젤란은하 안내
      if (sats.some(m => { const [x, y] = P(...m.p); return y > H + 20 || x < -40 || x > W + 40; }) && st.sel === 'mc') label('↓ 더 넓게 보면 보입니다', W / 2, H - 14, {size: 11});
    }
    function drawMeasure(cam, se) {
      const {P, B} = cam;
      // 원반 지름: 화면과 나란한 방향(right)으로
      const r = B.right, L = 15;
      const a = P(GCX - L * r[0], -L * r[1], 0), b = P(GCX + L * r[0], L * r[1], 0);
      const off = 15 * cam.s * se + 18;
      ctx.strokeStyle = '#9fe3f0'; ctx.lineWidth = 1.6; ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(a[0], a[1] + off); ctx.lineTo(b[0], b[1] + off);
      ctx.moveTo(a[0], a[1] + off - 6); ctx.lineTo(a[0], a[1] + off + 6); ctx.moveTo(b[0], b[1] + off - 6); ctx.lineTo(b[0], b[1] + off + 6); ctx.stroke();
      label(st.unit === 'ly' ? '원반 지름 약 10만 광년' : '원반 지름 약 30 kpc', (a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + off + 13, {color: '#9fe3f0', size: 12});
      // 태양 – 은하 중심
      const s0 = P(0, 0, 0), g0 = P(GCX, 0, 0);
      ctx.setLineDash([5, 4]); ctx.strokeStyle = '#ffe58a';
      ctx.beginPath(); ctx.moveTo(s0[0], s0[1]); ctx.lineTo(g0[0], g0[1]); ctx.stroke(); ctx.setLineDash([]);
      label(st.unit === 'ly' ? '약 2.6만 광년' : '약 8 kpc', (s0[0] + g0[0]) / 2, (s0[1] + g0[1]) / 2 + 14, {color: '#ffe58a', size: 12});
      // 헤일로: 구상 성단 분포 반지름 약 54 kpc (탐구 2)
      if (st.sel === 'halo' || st.sel === 'gc') {
        ctx.setLineDash([6, 5]); ctx.strokeStyle = 'rgba(200,185,255,0.9)';
        ctx.beginPath(); ctx.arc(g0[0], g0[1], 54 * cam.s, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
        const R54 = 54 * cam.s, lx = Math.min(W - 8, g0[0] + R54 * 0.71 - 6), ly = Math.max(16, g0[1] - R54 * 0.71 + 18);
        label(st.unit === 'ly' ? '구상 성단이 퍼진 반지름 약 18만 광년' : '구상 성단이 퍼진 반지름 약 54 kpc', lx, ly, {color: '#d4c8ff', size: 12, align: 'right'});
      }
    }
    function scaleBar(s) {
      const pcOpts = [[1, '1 kpc'], [2, '2 kpc'], [5, '5 kpc'], [10, '10 kpc'], [20, '20 kpc'], [50, '50 kpc']];
      const lyOpts = [[1e4, '1만 광년'], [2e4, '2만 광년'], [5e4, '5만 광년'], [1e5, '10만 광년'], [2e5, '20만 광년']].map(([ly, t]) => [ly / M.PC_TO_LY / 1000, t]);
      const opts = st.unit === 'ly' ? lyOpts : pcOpts;
      let pick = opts[0];
      for (const o of opts) if (o[0] * s <= Math.min(160, W * 0.3)) pick = o;
      const len = pick[0] * s, x = 16, y = H - 18;
      ctx.strokeStyle = '#dfe9f1'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + len, y); ctx.moveTo(x, y - 5); ctx.lineTo(x, y + 5); ctx.moveTo(x + len, y - 5); ctx.lineTo(x + len, y + 5); ctx.stroke();
      label(pick[1], x + len / 2, y - 12, {size: 12});
    }
    function pickAt(x, y) {
      if (!proj) return;
      const P = proj.P, cand = [];
      const push = (d, item) => { if (d < 20) cand.push([d, item]); };
      for (const [px, py, c] of proj.gc) push(Math.hypot(px - x, py - y), {type: 'gc', c, xyz: [c.x, c.y, c.z]});
      const [sx, sy] = P(0, 0, 0); push(Math.hypot(sx - x, sy - y) - 4, {type: 'sun', xyz: [0, 0, 0]});
      sats.forEach(m => { const [mx, my] = P(...m.p); push(Math.hypot(mx - x, my - y) - 6, {type: 'mc', m, xyz: m.p}); });
      const [gx, gy] = P(GCX, 0, 0); push(Math.hypot(gx - x, gy - y) - 6, {type: 'bulge', xyz: [GCX, 0, 0]});
      for (const pack of packs) {
        if (pack.kind !== K.OPEN && pack.kind !== K.NEBULA) continue;
        if (dimFor(pack.kind) < 1) continue;
        for (const p of pack.raw) { const [px, py] = P(p[0], p[1], p[2]); push(Math.hypot(px - x, py - y) + 2, {type: pack.kind === K.OPEN ? 'oc' : 'neb', xyz: p.slice(0, 3)}); }
      }
      cand.sort((a, b) => a[0] - b[0]);
      if (!cand.length) { st.pick = null; render(); return; }
      const it = cand[0][1];
      if (it.type === 'sun') { st.sel = 'sun'; st.pick = null; }
      else if (it.type === 'bulge') { st.sel = 'bulge'; st.pick = null; }
      else if (it.type === 'mc') { st.sel = 'mc'; st.pick = it; }
      else st.pick = it;
      render();
    }

    const PAGE = (t) => `<p class="page-ref">${t}</p>`;
    function infoHTML() {
      const p = st.pick;
      if (p && p.type === 'gc') {
        const c = p.c, rgc = Math.hypot(c.x - GCX, c.y, c.z);
        return `<h4>구상 성단 · ${clusterName(c)}</h4>
          <dl class="facts"><dt>태양에서</dt><dd>${dual(c.r)}</dd>
          <dt>은하 중심에서</dt><dd>약 ${sig(rgc)} kpc</dd>
          <dt>은하면에서</dt><dd>${num(Math.abs(c.z), 1)} kpc ${c.z >= 0 ? '위(북쪽)' : '아래(남쪽)'}</dd>
          <dt>하늘의 방향</dt><dd>은경 ${num(c.l, 0)}°, 은위 ${num(c.b, 0)}°</dd></dl>
          ${c.id === 'NGC 5139' ? '<p class="desc">교과서 99쪽 탐구 1에서 세페이드 변광성으로 거리를 잰 성단입니다.</p><button type="button" class="compact" id="s1-go2">02에서 이 성단까지의 거리 재 보기 →</button>' : ''}
          ${PAGE('위치: Harris(2010) 구상 성단 목록')}`;
      }
      if (p && p.type === 'oc') return `<h4>산개 성단 (개념용 점)</h4><p class="desc">젊은 별이 엉성하게 모인 성단입니다. 원반의 나선팔 근처, 은하면 가까이에 있습니다. 이 점들은 산개 성단이 어디에 있는지 보여 주는 그림입니다.</p>`;
      if (p && p.type === 'neb') return `<h4>방출 성운 (개념용 점)</h4><p class="desc">젊고 뜨거운 별 둘레의 기체가 스스로 빛을 내는 곳입니다. 별이 태어나는 나선팔을 따라 붉게 빛납니다.</p>`;
      switch (st.sel) {
        case 'bulge': return `<h4>팽대부</h4><p class="desc">은하 중심부가 공처럼 부푼 부분입니다. 나이가 많은 종족 Ⅱ 별이 많아 붉은빛을 띠고, 가운데에 막대 모양 구조가 있습니다. 그래서 우리은하를 <b>막대 나선 은하</b>라고 합니다.</p>
          <dl class="facts"><dt>위치</dt><dd>은하 중심 (태양계에서 궁수자리 방향)</dd><dt>별</dt><dd>늙은 종족 Ⅱ 별</dd><dt>태양계에서</dt><dd>${dual(8, '약 2.6만 광년')}</dd></dl>${PAGE('교과서 94·98쪽')}`;
        case 'disk': return `<h4>원반 · 나선팔</h4><p class="desc">나선팔을 가진 납작한 부분입니다. 젊은 종족 Ⅰ 별과 성간 물질(기체와 티끌)이 많고, 젊은 별이 모인 산개 성단(파랑)과 붉게 빛나는 방출 성운(분홍)이 나선팔을 따라 있습니다.</p>
          <dl class="facts"><dt>지름</dt><dd>${dual(30, '약 10만 광년')}</dd><dt>별</dt><dd>젊은 종족 Ⅰ 별</dd><dt>태양계</dt><dd>원반 안, 오리온-백조자리 팔</dd></dl><p class="micro">나선팔 이름은 교과서 그림 5를 따랐고, 모양은 개념도입니다.</p>${PAGE('교과서 94·98쪽 그림 5')}`;
        case 'halo': return `<h4>헤일로</h4><p class="desc">팽대부와 원반을 둥글게 감싼 넓은 영역입니다. 늙은 종족 Ⅱ 별과 구상 성단이 공 모양으로 퍼져 있고, 성간 물질은 거의 없습니다. 작은 은하가 찢겨 길게 늘어난 별의 흐름(궁수자리 별 흐름)도 있습니다.</p>
          <dl class="facts"><dt>모양</dt><dd>공 모양 (구형)</dd><dt>구상 성단이 퍼진 반지름</dt><dd>${dual(54)} <small>탐구 2</small></dd><dt>별</dt><dd>늙은 종족 Ⅱ 별</dd></dl>${PAGE('교과서 98·100쪽')}`;
        case 'gc': return `<h4>구상 성단</h4><p class="desc">늙은 종족 Ⅱ 별 수만~수십만 개가 공 모양으로 빽빽하게 모인 성단입니다. 나이는 100억 년 이상이고, 질량이 작은 주계열성과 거성이 많아 전체적으로 붉게 보입니다.</p>
          <dl class="facts"><dt>주로 있는 곳</dt><dd>헤일로</dd><dt>이 모형</dt><dd>${clusters.length}개 <small>실제 관측 위치</small></dd><dt>은하면에서 1 kpc 넘게</dt><dd>${gcFar}개 (${pct(gcFar, clusters.length)}%)</dd></dl><p class="micro">주황색 점을 누르면 그 성단의 이름과 거리가 나옵니다.</p>${PAGE('교과서 94·98쪽 · 위치: Harris(2010) 목록')}`;
        case 'oc': return `<h4>산개 성단</h4><p class="desc">젊은 별 수백~수천 개가 엉성하게 모인 성단입니다. 앞 세대 별이 남긴 무거운 원소가 많은 성간 물질에서 태어났고, 밝고 푸른 별이 빛을 주도해 전체적으로 푸르게 보입니다.</p>
          <dl class="facts"><dt>주로 있는 곳</dt><dd>원반 (나선팔 근처)</dd><dt>예</dt><dd>플레이아데스 성단 <small>약 136 pc</small></dd><dt>나이</dt><dd>젊다</dd></dl><p class="micro">파란 점은 산개 성단이 있는 곳을 보여 주기 위한 개념용입니다.</p>${PAGE('교과서 94쪽')}`;
        case 'sun': return `<h4>태양계</h4><p class="desc">태양계는 원반 안, 오리온-백조자리 팔에 있습니다. 은하 중심에서 꽤 떨어져 있어 우리은하의 중심이 아닙니다. 원반 안에서 원반을 바라보기 때문에 밤하늘의 은하수가 띠 모양으로 보이고, 은하 중심이 있는 궁수자리 쪽이 가장 두껍고 밝습니다.</p>
          <dl class="facts"><dt>은하 중심까지</dt><dd>${dual(8, '약 2.6만 광년')} <small>탐구 2</small></dd><dt>최신 측정</dt><dd>약 8.2 kpc <small>수업 슬라이드·지도서 8.5 kpc</small></dd></dl>${PAGE('교과서 98·100쪽')}`;
        case 'mc': return `<h4>대·소마젤란은하</h4><p class="desc">우리은하 가까이에 있는 작은 은하 두 개로, 남반구 밤하늘에서 맨눈으로 보입니다. 리비트는 소마젤란은하의 세페이드 변광성으로 주기-광도 관계를 발견했습니다. 한 은하 속 별들은 거리가 거의 같아서 겉보기 밝기의 차이가 곧 실제 밝기의 차이였기 때문입니다.</p>
          <dl class="facts"><dt>대마젤란은하</dt><dd>${dual(50, '약 16만 광년')}</dd><dt>소마젤란은하</dt><dd>${dual(62, '약 20만 광년')}</dd></dl>${PAGE('교과서 98쪽 그림 5 · 거리: Pietrzyński 2019, Graczyk 2020')}`;
        case 'compare': return `<h4>산개 성단과 구상 성단</h4>
          <table class="ref-table"><tr><th></th><th>산개 성단</th><th>구상 성단</th></tr>
          <tr><td>있는 곳</td><td class="oc">원반 (나선팔)</td><td class="gc">헤일로</td></tr>
          <tr><td>별의 수</td><td>수백~수천 개</td><td>수만~수십만 개</td></tr>
          <tr><td>모양</td><td>엉성하게 모임</td><td>공 모양으로 빽빽함</td></tr>
          <tr><td>나이</td><td>젊다</td><td>100억 년 이상</td></tr>
          <tr><td>별의 종족</td><td>종족 Ⅰ</td><td>종족 Ⅱ</td></tr>
          <tr><td>무거운 원소</td><td>많다</td><td>적다</td></tr>
          <tr><td>전체 색</td><td>푸른색</td><td>붉은색</td></tr></table>${PAGE('교과서 94쪽')}`;
        default: return `<h4>우리은하 한눈에 보기</h4><p class="desc">가운데의 부푼 <b>팽대부</b>, 나선팔을 가진 납작한 <b>원반</b>, 이 둘을 둥글게 감싼 <b>헤일로</b>로 되어 있습니다. 헤일로에는 구상 성단 수백 개가 은하 둘레를 돌고 있습니다.</p>
          <dl class="facts"><dt>원반의 지름</dt><dd>${dual(30, '약 10만 광년')}</dd><dt>태양계</dt><dd>원반 안, 중심에서 ${st.unit === 'ly' ? '약 2.6만 광년' : '약 8 kpc'}</dd><dt>구상 성단</dt><dd>${clusters.length}개 <small>실제 위치 (Harris 목록)</small></dd></dl>${PAGE('교과서 98쪽 그림 5')}`;
      }
    }
    function insight() {
      const side = st.el < 12 * D2R, top = st.el > 75 * D2R;
      switch (st.sel) {
        case 'bulge': return '팽대부는 은하의 중심에 있어서 태양계에서 보면 <b>궁수자리 방향</b>입니다. 그래서 은하수는 궁수자리 쪽이 가장 두껍고 밝게 보입니다.';
        case 'disk': return '태양계는 원반 <b>안</b>에 있어서 우리는 원반을 안에서 봅니다. 밤하늘에 띠처럼 보이는 <b>은하수</b>가 바로 우리가 안에서 바라본 원반의 모습입니다.';
        case 'halo': return '헤일로는 원반보다 훨씬 넓습니다. 구상 성단이 퍼진 범위(반지름 <b>약 54 kpc</b>, 탐구 2)는 별이 밝게 보이는 원반의 지름(<b>약 30 kpc</b>)과 다른 크기이니 두 숫자를 섞지 마세요. 크기 재기를 켜 보세요.';
        case 'gc': return `구상 성단 ${clusters.length}개 중 <b>${gcFar}개(${pct(gcFar, clusters.length)}%)</b>가 은하면에서 1 kpc 넘게 떨어져 있습니다. 구상 성단은 원반이 아니라 <b>헤일로</b>에 공 모양으로 퍼져 있고, 그 분포의 중심은 태양이 아니라 은하 중심 쪽에 있습니다.`;
        case 'oc': return '산개 성단은 얇은 원반 안, 나선팔 근처에 있습니다. <b>옆에서</b> 보면 모두 은하면에 붙어 있어요. ‘산개 성단과 구상 성단 비교’를 눌러 보세요.';
        case 'compare': return '옆에서 보면 차이가 분명합니다. <b>산개 성단</b>(파랑)은 얇은 <b>원반</b> 안에, <b>구상 성단</b>(주황)은 원반 위아래 <b>헤일로</b>에 공 모양으로 퍼져 있습니다.';
        case 'sun': return `태양계에서 은하 중심까지 약 8 kpc, 빛으로도 <b>약 2만 6천 년</b>이 걸립니다. 우리은하의 중심은 태양이 아니라 궁수자리 방향에 있습니다(섀플리, 1918).`;
        case 'mc': return '대·소마젤란은하는 원반의 아래쪽(남쪽), 약 <b>50~60 kpc</b> 떨어진 곳에 있는 다른 은하입니다. 우리은하 원반의 지름(약 30 kpc)보다 훨씬 멉니다.';
        default: return side ? '옆에서 보면 원반은 지름(약 30 kpc)에 비해 <b>아주 얇고</b>, 팽대부는 가운데가 부풀어 있으며, 구상 성단(주황 점)은 원반 위아래로 퍼져 있습니다.'
          : top ? '위에서 보면 막대 모양의 팽대부 둘레를 나선팔이 감고 있습니다. 태양계는 중심에서 약 8 kpc 떨어진 <b>오리온-백조자리 팔</b>에 있습니다.'
          : '우리은하는 <b>팽대부</b>, <b>원반</b>, <b>헤일로</b>로 되어 있고, 태양계는 원반 안에서 중심으로부터 <b>약 8 kpc</b> 떨어져 있습니다. 구성 요소를 하나씩 눌러 보세요.';
      }
    }
    function render() {
      setPressed(compList, 'data-comp', st.sel || '');
      setPressed($('s1-unit'), 'data-unit', st.unit);
      syncControls(); syncSpin();
      $('s1-info').innerHTML = infoHTML();
      const go = $('s1-go2');
      if (go) go.addEventListener('click', () => { show('s2'); document.querySelector('.stations').scrollIntoView({block: 'nearest'}); });
      $('s1-insight').innerHTML = insight();
      draw();
      wake();
    }
    // 천천히 돌리기: 이 실험이 보일 때만, 탭이 숨으면 멈춘다
    function loop(t) {
      raf = 0;
      if (current !== 's1' || document.hidden || !st.spin) { lastT = 0; return; }
      const dt = lastT ? Math.min(0.1, (t - lastT) / 1000) : 0;
      lastT = t;
      st.az -= dt * 0.12;
      st.view = null;
      draw();
      raf = requestAnimationFrame(loop);
    }
    function wake() { if (!raf && st.spin && current === 's1' && !document.hidden) raf = requestAnimationFrame(loop); }
    document.addEventListener('visibilitychange', wake);
    return {render, wake, draw};
  })();

  // ═══════════════ 02 구상 성단까지의 거리 ═══════════════
  stations.s2 = (() => {
    const G = M.OMEGA_GUIDE, typo = DATA.omega.typo;
    const fit = M.fitLightCurve(M.omegaPoints(DATA.omega, true));           // 튀는 점은 고쳐서 곡선을 맞춘다
    const ext = M.curveExtrema(fit.f, 0, 60);
    const curvePath = [];
    const st = {mode: 'period', a: 14, b: 47, l1: 10.62, l2: 11.26, snapA: false, snapB: false, pop: 'pop2', plotted: new Set([...Array(30).keys()]),
      last: null, corrected: true, curve: true, guide: false, checked: false};
    const lc = $('s2-lc'), pl = $('s2-pl');
    const box = {l: 70, r: 622, t: 34, b: 268}, pbox = {l: 64, r: 622, t: 16, b: 270};
    let xs = lin(0, 60, box.l, box.r), ys = lin(10.2, 11.7, box.t, box.b);
    const pts = () => M.omegaPoints(DATA.omega, st.corrected);
    const allPlotted = () => st.plotted.size === 30;
    const curveOn = () => st.curve && allPlotted();

    // 모드
    document.querySelectorAll('#s2-mode [data-mode]').forEach(b => b.addEventListener('click', () => { st.mode = b.dataset.mode; render(); }));
    document.querySelectorAll('#s2-pop [data-pop]').forEach(b => b.addEventListener('click', () => { st.pop = b.dataset.pop; st.guide = false; st.checked = false; render(); }));
    $('s2-curve').addEventListener('change', e => { st.curve = e.target.checked; render(); });
    $('s2-guide').addEventListener('click', () => {
      st.guide = !st.guide; st.checked = false;
      if (st.guide) {
        st.a = G.tA; st.b = G.tB; st.l1 = G.mBright; st.l2 = G.mFaint; st.snapA = st.snapB = true;
        st.pop = 'pop2'; st.corrected = true; st.plotted = new Set([...Array(30).keys()]); st.last = null; st.curve = true; $('s2-curve').checked = true;
      }
      render();
    });
    $('s2-check').addEventListener('click', () => { st.checked = true; render(); $('s2-verdict').scrollIntoView({block: 'nearest', behavior: reduced ? 'auto' : 'smooth'}); });
    // 점 찍기
    $('s2-next').addEventListener('click', () => {
      if (allPlotted()) st.plotted.clear();
      for (let i = 0; i < 30; i++) if (!st.plotted.has(i)) { st.plotted.add(i); st.last = i; break; }
      st.guide = false; render();
    });
    $('s2-all').addEventListener('click', () => { st.plotted = new Set([...Array(30).keys()]); st.last = null; render(); });
    $('s2-clear').addEventListener('click', () => { st.plotted.clear(); st.last = null; st.guide = false; st.checked = false; render(); });

    // 표 (교과서처럼 세 묶음 × 10줄)
    const table = $('s2-table');
    function buildTable() {
      let html = '<thead><tr>' + '<th scope="col"><span>시간[일]</span><span>m<sub>V</sub></span></th>'.repeat(3) + '</tr></thead><tbody>';
      for (let r = 0; r < 10; r++) {
        html += '<tr>';
        for (let c = 0; c < 3; c++) {
          const i = c * 10 + r, [t, m] = DATA.omega.table[i], isTypo = Math.abs(t - typo.t) < 1e-9;
          html += `<td><button type="button" data-i="${i}" class="${isTypo ? 'typo' : ''}" aria-label="${t}일 ${m}등급${isTypo ? ' (오타로 보이는 값)' : ''}"><span>${t.toFixed(1)}</span><span>${m.toFixed(2)}${isTypo ? '*' : ''}</span></button></td>`;
        }
        html += '</tr>';
      }
      table.innerHTML = html + '</tbody>';
      table.querySelectorAll('[data-i]').forEach(b => b.addEventListener('click', () => {
        const i = +b.dataset.i;
        if (st.plotted.has(i)) { st.plotted.delete(i); if (st.last === i) st.last = null; } else { st.plotted.add(i); st.last = i; }
        st.guide = false; render();
      }));
    }
    buildTable();
    function renderTypo() {
      $('s2-typo').innerHTML = `<span>* 52.6일의 값은 표에 <b>11.88</b>로 인쇄되어 있지만, 교사용 교과서의 그래프에는 <b>10.88</b> 근처에 찍혀 있습니다. 앞뒤 값(10.73, 11.06)과 비교해도 오타로 보입니다.${st.corrected ? '' : ' 매끄러운 곡선은 이 점을 빼고 그렸습니다.'}</span>
        <div class="segmented" role="group" aria-label="52.6일 값"><button type="button" data-typo="fix" aria-pressed="${st.corrected}">10.88로 고쳐 찍기</button><button type="button" data-typo="raw" aria-pressed="${!st.corrected}">표의 값 11.88 그대로</button></div>`;
      $('s2-typo').querySelectorAll('[data-typo]').forEach(b => b.addEventListener('click', () => { st.corrected = b.dataset.typo === 'fix'; st.checked = false; render(); }));
    }

    // 광도 곡선 위 누르기
    function snapTime(t) {
      const cand = pts().filter((p, i) => st.plotted.has(i)).map(p => p.t);
      if (curveOn()) ext.bright.concat(ext.faint).forEach(e => cand.push(e.t));
      let best = null;
      for (const c of cand) if (Math.abs(c - t) < 0.9 && (best === null || Math.abs(c - t) < Math.abs(best - t))) best = c;
      return best;
    }
    function moveTime(p, start) {
      const t = xs.inv(Math.max(box.l, Math.min(box.r, p.x)));
      if (start || !st.grab) st.grab = Math.abs(t - st.a) <= Math.abs(t - st.b) ? 'a' : 'b';
      const s = snapTime(t);
      st[st.grab] = s !== null ? s : Math.round(t * 10) / 10;
      st[st.grab === 'a' ? 'snapA' : 'snapB'] = s !== null;
    }
    function moveMag(p, viaTap) {
      // 누른 곳에서 가까운 점의 등급으로 가까운 가로선을 옮긴다
      const vis = pts().filter((q, i) => st.plotted.has(i));
      let best = null, bd = 1e9;
      for (const q of vis) { const d = Math.hypot(xs(q.t) - p.x, ys(q.m) - p.y); if (d < bd) { bd = d; best = q; } }
      let m = ys.inv(Math.max(box.t, Math.min(box.b, p.y)));
      if (best && (viaTap ? bd < 40 : Math.abs(ys(best.m) - p.y) < 8)) m = best.m;
      else m = Math.round(m * 100) / 100;
      if (viaTap || !st.grabM) st.grabM = Math.abs(m - st.l1) <= Math.abs(m - st.l2) ? 'l1' : 'l2';
      st[st.grabM] = m;
    }
    pointer(lc, {
      down: () => { st.grab = null; st.grabM = null; },
      move: (e, s) => {
        const p = svgPoint(lc, e);
        if (st.mode === 'period') moveTime(p, !st.grab); else if (s.mouse) moveMag(p, false); else return;
        st.guide = false; st.checked = false; render();
      },
      tap: e => {
        const p = svgPoint(lc, e);
        if (p.x < box.l - 12 || p.x > box.r + 12) return;
        if (st.mode === 'period') moveTime(p, true); else moveMag(p, true);
        st.guide = false; st.checked = false; render();
      }
    });

    function drawLC() {
      clear(lc);
      const tall = small();
      lc.setAttribute('viewBox', `0 0 640 ${tall ? 460 : 330}`);
      box.b = tall ? 372 : 268; box.l = tall ? 100 : 70; box.r = tall ? 512 : 552;
      const bottom = st.corrected ? 11.7 : 12.0;
      xs = lin(0, 60, box.l, box.r); ys = lin(10.2, bottom, box.t, box.b);
      const yT = []; for (let v = 10.2; v <= bottom + 1e-9; v += 0.2) yT.push({v: +v.toFixed(1), label: v.toFixed(1)});
      frame(lc, box, xs, ys, {xTicks: [0, 10, 20, 30, 40, 50, 60].map(v => ({v, label: String(v)})), yTicks: yT, xLabel: '시간 (일)', yLabel: tall ? ['겉보기 등급 m', ['V', 'sub']] : ['겉보기 등급 m', ['V', 'sub'], ' (위 = 밝음)']});
      // 매끄러운 곡선 (교사용 교과서의 빨간 곡선처럼)
      if (curveOn()) {
        if (!curvePath.length) for (let i = 0; i <= 600; i++) { const t = 60 * i / 600; curvePath.push([t, fit.f(t)]); }
        el('path', {d: pathOf(curvePath.map(([t, m]) => [xs(t), ys(m)])), fill: 'none', stroke: '#d0342c', 'stroke-width': 2.4, opacity: 0.85}, lc);
      }
      // 가장 밝을 때·가장 어두울 때·평균
      const mB = Math.min(st.l1, st.l2), mF = Math.max(st.l1, st.l2), mMean = M.meanMag(mB, mF);
      [mB, mF].forEach(m => el('line', {x1: box.l, x2: box.r, y1: ys(m), y2: ys(m), stroke: '#2b5fa8', 'stroke-width': st.mode === 'mag' ? 2.4 : 1.6}, lc));
      el('line', {x1: box.l, x2: box.r, y1: ys(mMean), y2: ys(mMean), stroke: '#c2581c', 'stroke-width': 1.6, 'stroke-dasharray': '6 4'}, lc);
      // 가로선 이름표는 그래프 오른쪽 바깥에 — 점·곡선·커서와 겹치지 않게, 서로 가까우면 벌려 놓는다
      const gap = tall ? 24 : 15, tags = [[mB, `밝음 ${mB.toFixed(2)}`, '#2b5fa8'], [mMean, `평균 ${mMean.toFixed(2)}`, '#c2581c'], [mF, `어두움 ${mF.toFixed(2)}`, '#2b5fa8']].map(([m, t, c]) => ({y: ys(m) + 4, t, c}));
      for (let i = 1; i < 3; i++) if (tags[i].y - tags[i - 1].y < gap) tags[i].y = tags[i - 1].y + gap;
      tags.forEach(tg => el('text', {x: box.r + 6, y: tg.y, class: 'annot', fill: tg.c}, lc, tg.t));
      // 점
      const k = tall ? 1.5 : 1;
      pts().forEach((p, i) => {
        if (!st.plotted.has(i)) return;
        const x = xs(p.t), y = ys(p.m);
        if (p.typo) {
          el('circle', {cx: x, cy: y, r: 8 * k, fill: 'none', stroke: '#c2581c', 'stroke-width': 1.6, 'stroke-dasharray': st.corrected ? '3 3' : ''}, lc);
          el('text', {x: x + (st.corrected ? 0 : -10 * k), y: y + (st.corrected ? 22 * k : 4), 'text-anchor': st.corrected ? 'middle' : 'end', class: 'tick halo', fill: '#c2581c'}, lc, st.corrected ? '고친 값' : '11.88?');
        }
        if (i === st.last) el('circle', {cx: x, cy: y, r: 9 * k, fill: 'none', stroke: '#e6a93c', 'stroke-width': 2.5}, lc);
        el('circle', {cx: x, cy: y, r: 3.6 * k, fill: '#14283a'}, lc);
      });
      if (!st.plotted.size) el('text', {x: (box.l + box.r) / 2, y: (box.t + box.b) / 2, 'text-anchor': 'middle', class: 'annot', fill: '#5f7282'}, lc, '오른쪽 표의 ▶ 한 점씩 찍기 또는 모두 찍기를 눌러 보세요');
      // 시간 커서 A·B와 주기 화살표
      const g = el('g', {}, lc), xa = xs(st.a), xb = xs(st.b);
      el('rect', {x: Math.min(xa, xb), y: box.t, width: Math.abs(xb - xa), height: box.b - box.t, fill: '#14283a', opacity: st.mode === 'period' ? 0.06 : 0.03}, g);
      [['A', xa, st.snapA], ['B', xb, st.snapB]].forEach(([n, x, on]) => {
        const c = on ? '#0b7f9a' : '#14283a';
        el('line', {x1: x, x2: x, y1: box.t - 4, y2: box.b, stroke: c, 'stroke-width': 2 * k, opacity: st.mode === 'period' ? 1 : 0.55}, g);
        el('rect', {x: x - 11 * k, y: box.t - 4 - 20 * k, width: 22 * k, height: 19 * k, rx: 5, fill: c}, g);
        el('text', {x, y: box.t - 4 - 6 * k, 'text-anchor': 'middle', fill: '#fff', 'font-size': 12 * k, 'font-weight': 800}, g, n);
      });
      const l = Math.min(xa, xb), r = Math.max(xa, xb), yArr = box.b - 14 * k;
      if (r - l > 40) {
        el('path', {d: `M${l + 3} ${yArr}H${r - 3}M${l + 9} ${yArr - 5}L${l + 3} ${yArr}L${l + 9} ${yArr + 5}M${r - 9} ${yArr - 5}L${r - 3} ${yArr}L${r - 9} ${yArr + 5}`, stroke: '#18794e', fill: 'none', 'stroke-width': 1.8}, g);
        el('text', {x: (l + r) / 2, y: yArr - 7, 'text-anchor': 'middle', class: 'annot halo', fill: '#18794e'}, g, `${num(Math.abs(st.b - st.a), 1)}일`);
      }
      return {mB, mF, mMean};
    }

    function drawPL(P, Mabs) {
      clear(pl);
      const tall = small();
      pl.setAttribute('viewBox', `0 0 640 ${tall ? 420 : 330}`);
      pbox.l = tall ? 96 : 64; pbox.b = tall ? 340 : 270;
      const xs2 = lin(-1, 2.15, pbox.l, pbox.r), ys2 = lin(1.5, -8, pbox.b, pbox.t);
      frame(pl, pbox, xs2, ys2, {xTicks: [-1, -0.5, 0, 0.5, 1, 1.5, 2].map(v => ({v, label: Number.isInteger(v) ? num(v, 0) : num(v, 1)})),
        yTicks: [1, 0, -2, -4, -6, -8].map(v => ({v, label: num(v, 0)})), xLabel: 'log 주기[일]', yLabel: tall ? '절대 등급 M' : '절대 등급 M (위 = 밝음)'});
      [[0, '1일'], [1, '10일'], [2, '100일']].forEach(([v, t]) => el('text', {x: xs2(v) + (v === 2 ? -4 : 4), y: pbox.b - 6, 'text-anchor': v === 2 ? 'end' : 'start', class: 'tick', fill: '#9aa9b5'}, pl, t));
      const lines = [{k: 'pop1', color: 'var(--pop1)', from: 0, to: 2, dash: ''}, {k: 'pop2', color: 'var(--pop2)', from: 0, to: 2, dash: '8 5'}, {k: 'rr', color: 'var(--rr)', from: -0.5, to: 0, dash: ''}];
      lines.forEach(L => {
        const on = L.k === st.pop;
        const a = [xs2(L.from), ys2(M.absMag(L.k, 10 ** L.from))], b = [xs2(L.to), ys2(M.absMag(L.k, 10 ** L.to))];
        el('path', {d: pathOf([a, b]), stroke: L.color, 'stroke-width': on ? 4.5 : 2.5, 'stroke-dasharray': L.dash, opacity: on ? 1 : 0.35, fill: 'none', 'stroke-linecap': 'round'}, pl);
        const at = L.k === 'rr' ? -0.55 : L.k === 'pop1' ? 0.12 : 0.95;
        const lx = xs2(at), ly = ys2(M.absMag(L.k, 10 ** at));
        const ang = L.k === 'rr' ? 0 : Math.atan2(ys2(M.absMag(L.k, 10)) - ys2(M.absMag(L.k, 1)), xs2(1) - xs2(0)) * 180 / Math.PI;
        el('text', {x: lx, y: ly + (L.k === 'pop2' ? 22 : L.k === 'rr' ? -10 : -10), transform: `rotate(${ang.toFixed(1)} ${lx} ${ly})`, class: 'annot halo', fill: L.color, opacity: on ? 1 : 0.55}, pl, M.PL[L.k].name);
      });
      const lp = Math.log10(P);
      if (lp > -1 && lp < 2.15) {
        const lineM = M.absMag(st.pop, P), x = xs2(lp), y = ys2(lineM);
        el('path', {d: `M${x} ${pbox.b}V${y}H${pbox.l}`, stroke: '#c2581c', 'stroke-width': 2, 'stroke-dasharray': '5 4', fill: 'none'}, pl);
        el('circle', {cx: x, cy: y, r: 7, fill: '#e6a93c', stroke: '#fff', 'stroke-width': 2}, pl);
        el('text', {x: x - 10, y: y - 12, 'text-anchor': 'end', class: 'annot halo', fill: '#c2581c'}, pl, `M ≈ ${num(lineM, 2)}`);
        const right = x > (pbox.l + pbox.r) / 2;
        el('text', {x: x + (right ? -6 : 6), y: pbox.b - 24, 'text-anchor': right ? 'end' : 'start', class: 'tick halo', fill: '#c2581c'}, pl, `log ${num(P, 1)} = ${num(lp, 2)}`);
        if (st.guide) {
          const gy = ys2(G.M), gx = xs2(G.logP);
          el('line', {x1: pbox.l, x2: gx, y1: gy, y2: gy, stroke: '#5f7282', 'stroke-dasharray': '3 4', 'stroke-width': 1.6}, pl);
          el('rect', {x: gx - 6, y: gy - 6, width: 12, height: 12, fill: '#fff', stroke: '#5f7282', 'stroke-width': 2.4, transform: `rotate(45 ${gx} ${gy})`}, pl);
          el('text', {x: pbox.r - 6, y: pbox.b - 50, 'text-anchor': 'end', class: 'annot halo', fill: '#5f7282'}, pl, `◇ 교과서 그림 6에서 읽은 값 ${num(G.M, 2)}`);
        }
      }
      return Mabs;
    }

    function render() {
      setPressed($('s2-mode'), 'data-mode', st.mode);
      setPressed($('s2-pop'), 'data-pop', st.pop);
      $('s2-guide').setAttribute('aria-pressed', String(st.guide));
      $('s2-count').textContent = `찍은 점 ${st.plotted.size} / 30`;
      table.querySelectorAll('[data-i]').forEach(b => {
        const i = +b.dataset.i;
        b.setAttribute('aria-pressed', String(st.plotted.has(i)));
        b.classList.toggle('last', i === st.last);
      });
      $('s2-curve').disabled = !allPlotted();
      $('s2-curve-label').classList.toggle('disabled', !allPlotted());
      renderTypo();
      const {mB, mF, mMean} = drawLC();
      const P = Math.abs(st.b - st.a);
      const Mabs = st.guide ? G.M : M.absMag(st.pop, P);
      const sol = M.omegaSolve(P, mMean, st.pop, Mabs);
      drawPL(P, Mabs);
      $('s2-P').textContent = `${num(P, 1)}일`;
      $('s2-mb').textContent = mB.toFixed(2);
      $('s2-mf').textContent = mF.toFixed(2);
      $('s2-m').textContent = mMean.toFixed(2);
      $('s2-lc-note').innerHTML = `<span class="formula">평균 겉보기 등급 m = ${frac('가장 밝을 때 + 가장 어두울 때', '2')} = ${frac(`${mB.toFixed(2)} + ${mF.toFixed(2)}`, '2')} = <b>${mMean.toFixed(2)}</b></span><br>교과서 탐구처럼 최대·최소 밝기의 등급을 평균해 어림합니다. 주기는 극소에서 다음 극소까지(또는 극대에서 다음 극대까지)의 시간입니다.`;
      // 계산 단계
      const rr = st.pop === 'rr' && P > 1.05;
      const muTxt = num(sol.mu, 2), lr = num(sol.logr, 2);
      $('s2-steps').innerHTML = `
        <div class="s"><div class="k">① 변광 주기 P</div><div class="v">${num(P, 1)}일</div><div class="w">log P = log ${num(P, 1)} = ${num(Math.log10(P), 2)}</div></div>
        <div class="s ${rr ? 'warn' : ''}"><div class="k">② 절대 등급 M (${st.guide ? '교과서 그림 6' : M.PL[st.pop].name})</div><div class="v">${num(Mabs, 2)}</div><div class="w">${rr ? 'RR형의 주기는 1일보다 짧습니다. 이 별에 RR형 관계를 써도 될까요?' : st.guide ? `교과서 그림 6에서 읽은 값 · 수업 그래프로는 ${num(M.absMag('pop2', G.P), 2)}` : '주기-광도 관계 그래프에서 읽은 값'}</div></div>
        <div class="s"><div class="k">③ 거리 지수 m − M</div><div class="v">${muTxt}</div><div class="w">${mMean.toFixed(2)} − (${num(Mabs, 2)}) = ${muTxt}</div></div>
        <div class="s final span2"><div class="k">④ 거리 r</div><div class="v">약 ${sig(sol.r)} pc</div><div class="w formula">m − M = 5 log r − 5<br>log r = ${frac('m − M + 5', '5')} = ${frac(`${muTxt} + 5`, '5')} = ${lr}<br>r = 10<sup>${lr}</sup> pc ≈ ${M.pcText(sol.r)} · ${M.lyText(sol.r)}</div></div>`;
      // 판정
      const v = $('s2-verdict'), res = M.checkOmega({P, m: mMean, pop: st.pop, M: Mabs, r: sol.r});
      v.hidden = !st.checked;
      if (st.checked) {
        let msg;
        if (res.ok) {
          msg = `<b>잘 구했어요!</b> 내 답은 약 ${sig(sol.r)} pc(${M.pcText(sol.r)})입니다.<br>교사용 교과서는 그림 6의 종족 Ⅱ 관계선에서 M<sub>V</sub> = −2.35를 읽어 <b>약 4600 pc</b>를 얻었습니다. 이 실험실의 수업 그래프(주기 10일에서 종족 Ⅱ가 −2등급)로 읽으면 M ≈ −3.1이 되어 <b>약 6500 pc</b>가 나옵니다. 관계선의 수치는 자료마다 조금씩 달라서 두 답 모두 맞는 풀이입니다.`;
        } else {
          const why = [];
          if (!res.pOk) why.push(`주기가 ${num(P, 1)}일입니다. 주기는 이웃한 두 극소(또는 두 극대) 사이의 시간이에요. 극소와 극대 사이를 재면 주기의 일부만 잰 것입니다.`);
          if (!res.mOk) why.push(`평균 겉보기 등급이 ${mMean.toFixed(2)}입니다. 가장 밝을 때(약 10.43)와 가장 어두울 때(약 11.46)의 중간값을 써야 합니다.${mF > 11.8 ? ' 52.6일의 11.88은 오타로 보이는 값이라 가장 어두운 값으로 쓰면 안 됩니다.' : ''}`);
          if (!res.popOk) why.push(st.pop === 'pop1' ? '오메가 센타우리는 늙은 별이 모인 구상 성단이라 이 세페이드는 <b>종족 Ⅱ</b>입니다. 종족 Ⅰ 관계를 쓰면 같은 주기에서 2등급 밝게 잡혀 거리가 약 2.5배 멀게 나옵니다.' : 'RR형 변광성은 주기가 하루 이내인 별입니다. 주기가 29일쯤인 이 별에는 쓸 수 없어요. 교과서 탐구에서 종족 Ⅱ 세페이드라고 했습니다.');
          msg = `<b>다시 살펴보세요.</b> 내 답 약 ${sig(sol.r)} pc<br>${why.join('<br>')}`;
        }
        v.className = 'verdict ' + (res.ok ? 'ok' : 'no');
        v.innerHTML = msg + `<span class="story">오늘날 측정한 오메가 센타우리까지의 거리는 약 ${omegaC.r} kpc(${M.lyText(omegaC.r * 1000)}, Harris 목록)입니다. 성단의 지름(약 150광년)은 거리(약 1.7만 광년)의 1% 정도로 작아서, 변광성까지의 거리를 성단까지의 거리로 보아도 됩니다(교과서 정리하기 1).</span>`;
      }
      // 핵심
      const pOk = P >= 27 && P <= 31, mOk = mMean >= 10.85 && mMean <= 11.05;
      let ins;
      if (!pOk) ins = '먼저 <b>주기</b>를 재 보세요. 커서 A·B를 이웃한 두 극소(가장 어두운 곳)나 두 극대(가장 밝은 곳)에 놓으면 그 사이 시간이 변광 주기입니다.';
      else if (!mOk) ins = `주기는 약 <b>${num(P, 1)}일</b>입니다. 이제 <b>밝기 재기</b>로 바꾸고 가장 밝은 점과 가장 어두운 점을 눌러 평균 겉보기 등급을 구해 보세요.`;
      else ins = `주기 <b>${num(P, 1)}일</b> → ${st.guide ? '교과서 그림 6' : M.PL[st.pop].name + ' 관계'}에서 <b>M ≈ ${num(Mabs, 2)}</b> → m − M = ${muTxt} → 거리 <b>약 ${sig(sol.r)} pc</b>(${M.lyText(sol.r)}). 변광성이 성단 안에 있으니 이것이 곧 오메가 센타우리까지의 거리입니다.${st.pop === 'pop2' ? ' 종족을 잘못 골라 종족 Ⅰ 관계를 쓰면 2등급 밝게 잡혀 거리가 약 2.5배 멀어집니다.' : ''}`;
      $('s2-insight').innerHTML = ins;
      $('s2-hint').textContent = st.mode === 'period'
        ? '그래프를 누르거나 옆으로 끌면 가까운 커서(A·B)가 움직입니다. 점이나 곡선의 극소·극대 근처에 놓으면 자석처럼 붙고 청록색으로 바뀝니다.'
        : '그래프에서 가장 밝은 점(위쪽)과 가장 어두운 점(아래쪽)을 차례로 눌러 보세요. 누른 곳에서 가까운 가로선이 그 점의 등급으로 옮겨집니다.';
    }
    return {render};
  })();

  // ═══════════════ 03 은하의 중심 찾기 ═══════════════
  stations.s3 = (() => {
    const svg = $('s3-plot'), sky = $('s3-sky');
    const dense = M.denseCentre(clusters, 20), sides = M.sideCounts(clusters, M.R0.modern, 8);
    const hemi = M.hemisphere(clusters), shifted = M.shiftedBy(clusters, dense.centre), hemiS = M.hemisphere(shifted);
    const VIEW3D = {az: -125 * D2R, el: 24 * D2R};
    const st = {view: '3d', az: VIEW3D.az, el: VIEW3D.el, half: 60, marker: null, R: 30, reveal: false, guide: false, ifSun: false};
    let stopTween = () => {}, flash = '';
    const C = 320, S2 = {l: 74, r: 616, t: 22, b: 564};

    document.querySelectorAll('#s3-views [data-view]').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
    document.querySelectorAll('#s3-zoom [data-zoom]').forEach(b => b.addEventListener('click', () => { st.half = +b.dataset.zoom; render(); }));
    $('s3-R').addEventListener('input', e => { st.R = +e.target.value; st.guide = false; render(); });
    $('s3-reveal').addEventListener('click', () => { st.reveal = !st.reveal; render(); });
    $('s3-ifsun').addEventListener('click', () => { st.ifSun = !st.ifSun; render(); });
    $('s3-guide').addEventListener('click', () => {
      st.guide = !st.guide;
      if (st.guide) { st.marker = [M.R0.textbook, 0, 0]; st.R = 54; if (st.view === '3d') setView('xy'); }
      render();
    });
    function setView(v) {
      stopTween();
      if (v === '3d') { st.view = '3d'; render(); return; }
      const to = v === 'xy' ? {az: -90 * D2R, el: 90 * D2R} : {az: -90 * D2R, el: 0};
      if (st.view === '3d' && !reduced) {
        const from = {az: st.az, el: st.el};
        to.az = from.az + wrapAngle(to.az - from.az);
        stopTween = tween(from, to, 600, x => { st.az = x.az; st.el = x.el; draw(); }, () => { st.view = v; st.az = VIEW3D.az; st.el = VIEW3D.el; render(); });
      } else { st.view = v; render(); }
    }

    // 좌표 변환
    const axes = () => st.view === 'xy' ? ['x', 'y'] : ['x', 'z'];
    const IDX = {x: 0, y: 1, z: 2};
    function map2D() {
      const xs = lin(-st.half, st.half, S2.l, S2.r), ys = lin(-st.half, st.half, S2.b, S2.t);
      return {xs, ys};
    }
    function map3D() {
      const B = M.cameraBasis(st.az, st.el), s = 250 / (st.half * 1.32);
      return {B, s, P: p => { const q = M.project(p, B); return [C + s * q.x, 312 - s * q.y, q.depth]; }};
    }

    // 누르기: 평면 보기에서는 × 놓기, 3차원에서는 돌리기
    let restore = null;
    pointer(svg, {
      down: (e, s) => { s.az0 = st.az; s.el0 = st.el; restore = st.marker ? st.marker.slice() : null; },
      move: (e, s, dx, dy) => {
        if (st.view === '3d') {
          stopTween();
          st.az = s.az0 - dx * 0.009;
          if (s.mouse) st.el = Math.max(-0.1, Math.min(Math.PI / 2, s.el0 + dy * 0.009));
          draw();
        } else { place(svgPoint(svg, e)); }
      },
      tap: e => {
        if (st.view === '3d') { flash = '3차원 보기에서는 끌어서 돌립니다. ×는 XY 평면이나 XZ 평면에서 놓을 수 있어요.'; render(); return; }
        place(svgPoint(svg, e));
      },
      cancel: () => { if (st.view !== '3d') { st.marker = restore; render(); } }
    });
    function place(p) {
      const {xs, ys} = map2D(), [ha, va] = axes();
      const h = Math.max(-st.half, Math.min(st.half, xs.inv(p.x))), v = Math.max(-st.half, Math.min(st.half, ys.inv(p.y)));
      const m = st.marker ? st.marker.slice() : [0, 0, 0];
      m[IDX[ha]] = Math.round(h * 10) / 10; m[IDX[va]] = Math.round(v * 10) / 10;
      st.marker = m; st.guide = false; flash = '';
      render();
    }
    svg.addEventListener('keydown', e => {
      const k = e.key, step = st.half > 30 ? 1 : 0.5;
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(k)) return;
      e.preventDefault();
      if (st.view === '3d') {
        if (k === 'ArrowLeft' || k === 'ArrowRight') st.az += (k === 'ArrowLeft' ? 1 : -1) * 10 * D2R;
        else st.el = Math.max(0, Math.min(Math.PI / 2, st.el + (k === 'ArrowUp' ? 1 : -1) * 6 * D2R));
        draw(); return;
      }
      const [ha, va] = axes(), m = st.marker ? st.marker.slice() : [0, 0, 0];
      if (k === 'ArrowLeft') m[IDX[ha]] -= step; if (k === 'ArrowRight') m[IDX[ha]] += step;
      if (k === 'ArrowUp') m[IDX[va]] += step; if (k === 'ArrowDown') m[IDX[va]] -= step;
      st.marker = m.map(v => Math.round(v * 10) / 10); st.guide = false; render();
    });

    function cross(g, x, y, size, color, w) {
      el('path', {d: `M${x - size} ${y - size}L${x + size} ${y + size}M${x - size} ${y + size}L${x + size} ${y - size}`, stroke: color, 'stroke-width': w, 'stroke-linecap': 'round'}, g);
    }
    function draw() {
      if (current !== 's3') return;
      clear(svg);
      const k = small() ? 1.5 : 1;
      const animating = st.view === '3d' || st.el !== VIEW3D.el;
      if (st.view === '3d' || (animating && st.view !== 'xy' && st.view !== 'xz')) draw3D(k); else draw2D(k);
    }
    function draw2D(k) {
      const {xs, ys} = map2D(), [ha, va] = axes(), half = st.half, step = half > 30 ? 20 : 10;
      const tv = []; for (let v = Math.ceil(-half / step) * step; v <= half + 1e-9; v += step) tv.push(v);
      frame(svg, S2, xs, ys, {xTicks: tv.map(v => ({v, label: num(v, 0)})), yTicks: tv.map(v => ({v, label: num(v, 0)})),
        xLabel: 'X (kpc) → 은하 중심 방향', yLabel: va === 'y' ? 'Y (kpc) · 은하 회전 방향' : 'Z (kpc) · 북은극 방향'});
      el('line', {x1: xs(0), x2: xs(0), y1: S2.t, y2: S2.b, stroke: '#b7c3cc', 'stroke-width': 1.2}, svg);
      el('line', {x1: S2.l, x2: S2.r, y1: ys(0), y2: ys(0), stroke: '#b7c3cc', 'stroke-width': 1.2}, svg);
      const g = el('g', {}, svg);
      // 교과서 풀이: 8 kpc 초록 점선, 54 kpc 파란 점선 원, 빨간 ×
      if (st.guide) {
        const gx = xs(8), gy = ys(0);
        el('line', {x1: gx, x2: gx, y1: S2.t, y2: S2.b, stroke: '#18a058', 'stroke-width': 2, 'stroke-dasharray': '7 5'}, g);
        el('text', {x: gx + 6, y: S2.b - 10, class: 'annot halo', fill: '#18794e'}, g, '8 kpc');
        const rr = (xs(54) - xs(0));
        el('circle', {cx: gx, cy: gy, r: rr, fill: 'none', stroke: '#2b6fd6', 'stroke-width': 1.8, 'stroke-dasharray': '6 5'}, g);
        el('text', {x: gx + rr * 0.55, y: gy + rr * 0.55 + 18, class: 'annot halo', fill: '#2b6fd6'}, g, '54 kpc');
      }
      // 구상 성단
      let out = 0;
      clusters.forEach(c => {
        const h = c[ha], v = c[va];
        if (Math.abs(h) > half || Math.abs(v) > half) {
          out++;
          const x = Math.max(S2.l + 4, Math.min(S2.r - 4, xs(h))), y = Math.max(S2.t + 4, Math.min(S2.b - 4, ys(v)));
          el('circle', {cx: x, cy: y, r: 2.4 * k, fill: 'none', stroke: '#9aa9b5', 'stroke-width': 1.2}, g);
          return;
        }
        el('circle', {cx: xs(h), cy: ys(v), r: 3.3 * k, fill: '#1e3a5f', opacity: 0.85}, g);
      });
      // 오메가 센타우리 (탐구 1)
      if (Math.abs(omegaC[ha]) <= half && Math.abs(omegaC[va]) <= half) {
        const ox = xs(omegaC[ha]), oy = ys(omegaC[va]);
        el('circle', {cx: ox, cy: oy, r: 7 * k, fill: 'none', stroke: '#e6a93c', 'stroke-width': 2}, g);
      }
      // 정답 공개: 밀집된 곳의 중심과 오늘날의 은하 중심
      if (st.reveal) {
        const dx = xs(dense.centre[IDX[ha]]), dy = ys(dense.centre[IDX[va]]);
        el('path', {d: `M${dx - 11 * k} ${dy}H${dx + 11 * k}M${dx} ${dy - 11 * k}V${dy + 11 * k}`, stroke: '#0b7f9a', 'stroke-width': 3.2, 'stroke-linecap': 'round'}, g);
        const mx = xs(M.R0.modern), my = ys(0);
        el('rect', {x: mx - 5 * k, y: my - 5 * k, width: 10 * k, height: 10 * k, fill: '#14283a', transform: `rotate(45 ${mx} ${my})`}, g);
      }
      if (st.guide) cross(g, xs(8), ys(0), 9 * k, '#d0342c', 3.4);
      // 태양
      el('circle', {cx: xs(0), cy: ys(0), r: 5.5 * k, fill: '#d0342c', stroke: '#fff', 'stroke-width': 1.5}, g);
      el('text', {x: xs(0) - 8, y: ys(0) - 9 * k, 'text-anchor': 'end', class: 'annot halo', fill: '#d0342c'}, g, '태양');
      // 학생의 × 와 구
      if (st.marker && !st.guide) {
        const x = xs(st.marker[IDX[ha]]), y = ys(st.marker[IDX[va]]);
        el('circle', {cx: x, cy: y, r: Math.abs(xs(st.R) - xs(0)), fill: 'rgba(194,88,28,0.05)', stroke: '#c2581c', 'stroke-width': 1.6, 'stroke-dasharray': '5 5'}, g);
        cross(g, x, y, 10 * k, '#fff', 7);
        cross(g, x, y, 10 * k, '#c2581c', 3.6);
        el('line', {x1: xs(0), y1: ys(0), x2: x, y2: y, stroke: '#c2581c', 'stroke-width': 1.4, 'stroke-dasharray': '3 4'}, g);
      }
      if (out) el('text', {x: S2.r - 4, y: S2.b - 8, 'text-anchor': 'end', class: 'tick halo'}, g, `○ 그래프 밖 ${out}개 (가장자리에 표시)`);
      legend(k);
      $('s3-plot-title').textContent = va === 'y' ? 'XY 평면에 나타낸 구상 성단 (위에서 봄)' : 'XZ 평면에 나타낸 구상 성단 (옆에서 봄)';
    }
    // 범례: 가까이 붙은 표시들의 이름표가 겹치지 않도록 왼쪽 위에 모아 쓴다
    function legend(k) {
      const items = [['sun', '태양 (원점)']];
      if (st.guide) items.push(['guide', '교과서 풀이의 중심 (8 kpc)']);
      else if (st.marker) items.push(['mk', '내가 고른 중심']);
      if (st.reveal) items.push(['dense', `밀집된 곳의 중심 (${num(dense.dist, 1)} kpc)`], ['modern', `오늘날 측정한 은하 중심 (${M.R0.modern} kpc)`]);
      items.push(['omega', '오메가 센타우리 (탐구 1)']);
      const fsz = small() ? 22 : 13, lh = small() ? 32 : 21, x0 = (st.view === '3d' ? 14 : S2.l + 8), y0 = (st.view === '3d' ? 14 : S2.t + 8);
      const tw = t => [...t].reduce((w, ch) => w + (/[가-힣]/.test(ch) ? fsz : fsz * 0.6), 0);
      const w = Math.max(...items.map(([, t]) => tw(t))) + 30 * k + 12, g = el('g', {}, svg);
      el('rect', {x: x0, y: y0, width: w, height: items.length * lh + 10, rx: 8, fill: '#fff', opacity: 0.9, stroke: '#dbe3e6'}, g);
      items.forEach(([kind, text], i) => {
        const cx = x0 + 14 * k, cy = y0 + 5 + lh * (i + 0.5);
        if (kind === 'sun') el('circle', {cx, cy, r: 5 * k, fill: '#d0342c'}, g);
        if (kind === 'mk') cross(g, cx, cy, 6 * k, '#c2581c', 3);
        if (kind === 'guide') cross(g, cx, cy, 6 * k, '#d0342c', 3);
        if (kind === 'dense') el('path', {d: `M${cx - 7 * k} ${cy}H${cx + 7 * k}M${cx} ${cy - 7 * k}V${cy + 7 * k}`, stroke: '#0b7f9a', 'stroke-width': 3, 'stroke-linecap': 'round'}, g);
        if (kind === 'modern') el('rect', {x: cx - 4.5 * k, y: cy - 4.5 * k, width: 9 * k, height: 9 * k, fill: '#14283a', transform: `rotate(45 ${cx} ${cy})`}, g);
        if (kind === 'omega') el('circle', {cx, cy, r: 5.5 * k, fill: 'none', stroke: '#e6a93c', 'stroke-width': 2}, g);
        el('text', {x: cx + 14 * k, y: cy + 4 * k, class: 'small-annot'}, g, text);
      });
    }
    function draw3D(k) {
      const {P, s} = map3D(), half = st.half, g = el('g', {}, svg);
      // 은하면(XY 평면) 격자
      for (let v = -half; v <= half + 1e-9; v += half > 30 ? 20 : 10) {
        const a = P([v, -half, 0]), b = P([v, half, 0]), c = P([-half, v, 0]), d = P([half, v, 0]);
        el('line', {x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: '#e3e9ed', 'stroke-width': 1}, g);
        el('line', {x1: c[0], y1: c[1], x2: d[0], y2: d[1], stroke: '#e3e9ed', 'stroke-width': 1}, g);
      }
      // 축
      [[[-half, 0, 0], [half, 0, 0], 'X → 은하 중심'], [[0, -half, 0], [0, half, 0], 'Y'], [[0, 0, -half], [0, 0, half], 'Z (북)']].forEach(([a, b, t]) => {
        const A = P(a), Bp = P(b);
        el('line', {x1: A[0], y1: A[1], x2: Bp[0], y2: Bp[1], stroke: '#8a9aa6', 'stroke-width': 1.4}, g);
        el('text', {x: Bp[0] + (Bp[0] >= C ? 6 : -6), y: Bp[1] - 6, 'text-anchor': Bp[0] >= C ? 'start' : 'end', class: 'annot halo', fill: '#5f7282'}, g, t);
      });
      // 눈금 몇 개
      [half / 2, half].forEach(v => { const q = P([v, 0, 0]); el('text', {x: q[0], y: q[1] + 16 * k, 'text-anchor': 'middle', class: 'tick halo'}, g, `${v}`); });
      // 성단 (뒤에서 앞으로)
      const pts = clusters.map(c => [P([c.x, c.y, c.z]), c]).sort((a, b) => a[0][2] - b[0][2]);
      const dmax = half * 1.4;
      pts.forEach(([q, c]) => {
        const near = Math.max(0, Math.min(1, (q[2] + dmax) / (2 * dmax)));
        el('circle', {cx: q[0], cy: q[1], r: (2.4 + 1.6 * near) * k, fill: '#1e3a5f', opacity: 0.45 + 0.5 * near}, g);
        if (c === omegaC) el('circle', {cx: q[0], cy: q[1], r: 7 * k, fill: 'none', stroke: '#e6a93c', 'stroke-width': 2}, g);
      });
      if (st.reveal) {
        const q = P(dense.centre);
        el('path', {d: `M${q[0] - 10} ${q[1]}H${q[0] + 10}M${q[0]} ${q[1] - 10}V${q[1] + 10}`, stroke: '#0b7f9a', 'stroke-width': 3.2, 'stroke-linecap': 'round'}, g);
      }
      // 태양
      const sp = P([0, 0, 0]);
      el('circle', {cx: sp[0], cy: sp[1], r: 5.5 * k, fill: '#d0342c', stroke: '#fff', 'stroke-width': 1.5}, g);
      el('text', {x: sp[0] - 8, y: sp[1] - 9, 'text-anchor': 'end', class: 'annot halo', fill: '#d0342c'}, g, '태양');
      // × 와 구
      const mk = st.guide ? [8, 0, 0] : st.marker;
      if (mk) {
        const q = P(mk), base = P([mk[0], mk[1], 0]), R = st.R * s;
        el('line', {x1: q[0], y1: q[1], x2: base[0], y2: base[1], stroke: '#c2581c', 'stroke-dasharray': '3 3'}, g);
        el('circle', {cx: q[0], cy: q[1], r: R, fill: 'rgba(194,88,28,0.04)', stroke: '#c2581c', 'stroke-width': 1.4, 'stroke-dasharray': '5 5'}, g);
        el('ellipse', {cx: q[0], cy: q[1], rx: R, ry: Math.max(1, R * Math.abs(Math.sin(st.el))), fill: 'none', stroke: '#c2581c', 'stroke-width': 1, opacity: 0.5}, g);
        cross(g, q[0], q[1], 9 * k, '#fff', 7); cross(g, q[0], q[1], 9 * k, st.guide ? '#d0342c' : '#c2581c', 3.4);
      }
      legend(k);
      $('s3-plot-title').textContent = '구상 성단의 3차원 분포 (끌어서 돌리기)';
    }

    // 하늘 전체 지도 (해머 도법, 은경 0° = 은하 중심이 가운데)
    function drawSky() {
      clear(sky);
      const cx = 320, cy = 172, ax = 296 / (2 * Math.SQRT2), ay = 148 / Math.SQRT2;
      const H = (l, b) => { const h = M.hammer(l, b); return [cx + ax * h.x, cy - ay * h.y]; };
      const outline = []; for (let b = -90; b <= 90; b += 3) outline.push(H(-179.999, b)); for (let b = 90; b >= -90; b -= 3) outline.push(H(179.999, b));
      el('path', {d: pathOf(outline) + 'Z', fill: '#f7fafb', stroke: '#9aa9b5', 'stroke-width': 1.2}, sky);
      // 은하 중심 쪽 반구(은경 −90° ~ 90°)
      const front = []; for (let b = -90; b <= 90; b += 3) front.push(H(90, b)); for (let b = 90; b >= -90; b -= 3) front.push(H(-90, b));
      el('path', {d: pathOf(front) + 'Z', fill: st.ifSun ? '#f1f4f6' : '#e3f3f7', stroke: '#9fd3df', 'stroke-width': 1}, sky);
      // 은하수(은하면) 띠와 경위선
      const band = []; for (let l = -180; l <= 180; l += 4) band.push(H(l, 0));
      el('path', {d: pathOf(band), stroke: '#c9d7e8', 'stroke-width': 9, fill: 'none', opacity: 0.8}, sky);
      [-60, -30, 30, 60].forEach(b => { const p = []; for (let l = -180; l <= 180; l += 6) p.push(H(l, b)); el('path', {d: pathOf(p), stroke: '#e1e7eb', fill: 'none'}, sky); });
      [-90, 90].forEach(l => { const p = []; for (let b = -90; b <= 90; b += 4) p.push(H(l, b)); el('path', {d: pathOf(p), stroke: '#c5d3dc', fill: 'none'}, sky); });
      const list = st.ifSun ? shifted.map(p => M.lbFromXYZ(p.x, p.y, p.z)) : clusters.map(c => ({l: c.l, b: c.b}));
      const k = small() ? 1.5 : 1;
      list.forEach(p => { const [x, y] = H(p.l, p.b); el('circle', {cx: x, cy: y, r: 3 * k, fill: '#1e3a5f', opacity: 0.8}, sky); });
      const [gx, gy] = H(0, 0);
      el('text', {x: gx, y: cy + ay * 1.0 + 26, 'text-anchor': 'middle', class: 'annot', fill: '#0b7f9a'}, sky, st.ifSun ? '앞쪽 반구' : '은하 중심 쪽 (궁수자리)');
      el('text', {x: cx - ax * 2 * Math.SQRT2 + 4, y: cy + 4, class: 'tick halo'}, sky, '반대쪽');
      el('text', {x: cx + ax * 2 * Math.SQRT2 - 4, y: cy + 4, 'text-anchor': 'end', class: 'tick halo'}, sky, '반대쪽');
      if (!st.ifSun) { const [x9, y9] = H(90, 0); el('text', {x: x9, y: y9 - 10, 'text-anchor': 'middle', class: 'tick halo'}, sky, '은경 90°'); const [x2, y2] = H(270, 0); el('text', {x: x2, y: y2 - 10, 'text-anchor': 'middle', class: 'tick halo'}, sky, '은경 270°'); }
      el('circle', {cx: gx, cy: gy, r: 4, fill: 'none', stroke: '#0b7f9a', 'stroke-width': 2}, sky);
      const h = st.ifSun ? hemiS : hemi, n = clusters.length;
      $('s3-sky-insight').innerHTML = st.ifSun
        ? `성단 무리의 중심이 태양에 있다면, 구상 성단은 하늘의 앞쪽 반구에 ${h.toward}개(${pct(h.toward, n)}%), 뒤쪽에 ${h.away}개(${pct(h.away, n)}%)로 <b>모든 방향에 고르게</b> 보였을 것입니다.`
        : `구상 성단 ${n}개 중 <b>${h.toward}개(${pct(h.toward, n)}%)</b>가 은하 중심 쪽 반구(가운데 색칠한 곳)에 몰려 있고, 반대쪽에는 ${h.away}개뿐입니다. 태양이 분포의 중심이 아니라는 증거입니다(섀플리).`;
      $('s3-ifsun').setAttribute('aria-pressed', String(st.ifSun));
    }

    function render() {
      setPressed($('s3-views'), 'data-view', st.view);
      setPressed($('s3-zoom'), 'data-zoom', String(st.half));
      $('s3-guide').setAttribute('aria-pressed', String(st.guide));
      $('s3-reveal').setAttribute('aria-pressed', String(st.reveal));
      $('s3-reveal').textContent = st.reveal ? '계산한 중심 숨기기' : '밀집된 곳의 중심 계산하기';
      $('s3-R').value = st.R;
      $('s3-R-out').textContent = `${st.R} kpc`;
      draw();
      const mk = st.guide ? [8, 0, 0] : st.marker;
      if (mk) {
        const d = Math.hypot(...mk), n = M.countWithin(clusters, mk, st.R);
        $('s3-pos').textContent = `(${mk.map(v => num(v, 1)).join(', ')})`;
        $('s3-dist').textContent = `${num(d, 1)} kpc · ${M.lyText(d * 1000)}`;
        $('s3-in').textContent = `${n} / ${clusters.length}개 (${pct(n, clusters.length)}%)`;
      } else { $('s3-pos').textContent = '—'; $('s3-dist').textContent = '—'; $('s3-in').textContent = '—'; }
      // 정답 확인
      const ans = $('s3-answer');
      if (st.reveal) {
        const c = dense.centre, my = mk ? Math.hypot(...mk) : null;
        ans.className = 'answer info-box';
        ans.innerHTML = `<b>밀집된 곳의 중심</b>: (${c.map(v => num(v, 1)).join(', ')}) kpc → 태양에서 <b>약 ${num(dense.dist, 1)} kpc</b><br>
          <span class="mini">중심 근처 20 kpc 안의 성단 ${dense.n}개의 평균 위치를 되풀이해 구했습니다. 멀리 떨어진 몇 개까지 157개를 모두 평균하면 ${num(Math.hypot(...M.meanPos(clusters)), 1)} kpc로 태양 쪽에 끌려옵니다.</span><br>
          교과서 답 <b>약 8 kpc</b> · 오늘날 측정값 <b>약 8.2 kpc</b> (${M.lyText(8200)})${my !== null && !st.guide ? `<br>내 ×는 태양에서 ${num(my, 1)} kpc입니다.` : ''}<br>
          <span class="mini">은하 중심 너머(먼 쪽)에서는 성단이 덜 발견됩니다(가까운 쪽 ${sides.near}개, 먼 쪽 ${sides.far}개). 원반의 성간 티끌에 가려졌기 때문으로, 그래서 분포의 중심이 실제보다 조금 태양 쪽으로 나옵니다.</span>`;
      } else { ans.className = 'answer'; ans.innerHTML = ''; }
      drawSky();
      // 핵심
      let ins;
      if (st.guide) ins = '교사용 교과서 풀이: 구상 성단이 모인 곳의 중심을 빨간 ×로 표시하면 태양에서 <b>약 8 kpc</b>입니다. 성단 대부분이 들어가는 원의 반지름은 <b>약 54 kpc</b>로, 이 범위(헤일로)가 우리은하의 크기입니다.';
      else if (!mk) ins = '빨간 점(태양)은 성단 무리의 한가운데가 아니라 <b>한쪽에 치우쳐</b> 있습니다. XY 평면이나 XZ 평면으로 바꾸고, 성단이 가장 많이 모인 곳의 중심을 눌러 ×를 놓아 보세요.';
      else {
        const d = Math.hypot(...mk), n = M.countWithin(clusters, mk, st.R), p = pct(n, clusters.length);
        ins = `×는 태양에서 <b>${num(d, 1)} kpc</b>(${M.lyText(d * 1000)}) 떨어져 있습니다. 반지름 ${st.R} kpc 구 안에 구상 성단 <b>${n}개(${p}%)</b>가 들어갑니다.` +
          (p >= 94 ? ' 성단 대부분을 담는 이 구의 크기가 곧 <b>헤일로, 우리은하의 크기</b>입니다(교과서 답: 반지름 약 54 kpc).' : ' 구의 반지름을 늘려 성단 대부분이 들어가게 해 보세요.');
      }
      $('s3-insight').innerHTML = ins;
      $('s3-hint').textContent = flash || (st.view === '3d'
        ? '3차원 보기에서는 옆으로 끌어 돌립니다(마우스로는 위아래로 끌어 기울일 수도 있어요). 원반 안의 별은 성간 티끌에 가려 멀리까지 보이지 않지만, 구상 성단은 대부분 원반 밖 헤일로에 있어 멀리 있어도 보입니다 — 그래서 구상 성단으로 은하의 지도를 그릴 수 있었습니다(→ ‘성간 소광과 성간 티끌’).'
        : '그래프를 누르면 그 자리에 ×가 놓입니다(마우스로는 끌어서 옮길 수 있어요). XY 평면에서 X·Y를, XZ 평면에서 X·Z를 정합니다. 키보드 화살표로도 옮길 수 있습니다.');
    }
    return {render};
  })();

  // ═══════════════ 04 거리 재는 여러 방법 ═══════════════
  stations.s4 = (() => {
    const COLORS = {radar: '#8a96a3', parallax: '#1e3a5f', msfit: '#3f7fc0', cepheid: '#c2581c', rr: '#d79a1f', sn1a: '#b42318', hubble: '#18794e'};
    const st = {unit: 'pc', obj: 'omega', method: 'cepheid', lr: Math.log10(5200)};
    const svg = $('s4-ladder');
    const L0 = -6.4, L1 = 10.3;             // log10(pc) 범위
    let box = {l: 150, r: 936, t: 20, b: 420}, xs = lin(L0, L1, box.l, box.r), rowY = [];
    const objChips = $('s4-objects');
    M.OBJECTS.forEach(o => {
      const b = document.createElement('button');
      b.type = 'button'; b.dataset.obj = o.id; b.textContent = o.name;
      b.addEventListener('click', () => { st.obj = o.id; st.lr = Math.log10(o.r); render(); });
      objChips.appendChild(b);
    });
    const mChips = $('s4-methods');
    M.METHODS.forEach(m => {
      const b = document.createElement('button');
      b.type = 'button'; b.dataset.method = m.id; b.textContent = m.name; b.style.borderLeftColor = COLORS[m.id];
      b.addEventListener('click', () => { st.method = m.id; render(); });
      mChips.appendChild(b);
    });
    document.querySelectorAll('#s4-unit [data-unit]').forEach(b => b.addEventListener('click', () => { st.unit = b.dataset.unit; render(); }));
    // 거리 커서: 누르거나 옆으로 끌면 움직이고, 천체 가까이 오면 붙는다
    function moveCursor(p) {
      if (p.x < box.l - 20 || p.x > box.r + 20) return;
      // 방법 막대를 누르면 그 방법을 고른다
      const row = rowY.findIndex(r => Math.abs(p.y - r.y) < r.h / 2 + 2 && Math.max(box.l, xs(Math.log10(r.m.min))) - 6 <= p.x && p.x <= Math.min(box.r, xs(Math.log10(r.m.max))) + 6);
      let lr = Math.max(L0, Math.min(L1, xs.inv(p.x)));
      let best = null;
      for (const o of M.OBJECTS) { const d = Math.abs(xs(Math.log10(o.r)) - p.x); if (d < 12 && (!best || d < best[0])) best = [d, o]; }
      if (best) { st.obj = best[1].id; lr = Math.log10(best[1].r); } else st.obj = null;
      st.lr = lr;
      return row;
    }
    pointer(svg, {
      move: e => { moveCursor(svgPoint(svg, e)); render(); },
      tap: e => { const p = svgPoint(svg, e), row = moveCursor(p); if (row >= 0 && p.y > (rowY[0] ? rowY[0].y - 30 : 0)) st.method = rowY[row].m.id; render(); }
    });
    const powLabel = e => `10${sup(e)}`;
    const span = m => m.span || `${dist(m.min)} ~ ${dist(m.max)}`;
    const dist = pc => st.unit === 'ly' ? M.lyText(pc) : M.pcText(pc);

    function draw() {
      clear(svg);
      const tall = small(), wide = svg.clientWidth >= 860 && !tall;
      const W = wide ? 960 : 640, rh = tall ? 46 : 34, objH = tall ? 86 : 150;
      box = {l: tall ? 150 : (wide ? 150 : 128), r: W - 18, t: tall ? 70 : (wide ? 70 : 54), b: 0};
      const top = box.t + objH, n = M.METHODS.length;
      box.b = top + n * rh + 10;
      const Hh = box.b + (tall ? 70 : 50);
      svg.setAttribute('viewBox', `0 0 ${W} ${Hh}`);
      xs = lin(L0, L1, box.l, box.r);
      const lyShift = Math.log10(M.PC_TO_LY);
      // 격자와 아래 눈금
      const g = el('g', {class: 'axis'}, svg);
      const tickEs = st.unit === 'ly' ? [-4, -2, 0, 2, 4, 6, 8, 10] : [-6, -4, -2, 0, 2, 4, 6, 8, 10];
      tickEs.forEach(e => {
        const x = xs(st.unit === 'ly' ? e - lyShift : e);
        if (x < box.l - 1 || x > box.r + 1) return;
        el('line', {x1: x, x2: x, y1: box.t, y2: box.b, class: 'grid-line'}, g);
        el('text', {x, y: box.b + (tall ? 28 : 18), 'text-anchor': 'middle', class: 'tick'}, g, powLabel(e));
      });
      el('line', {x1: box.l, x2: box.r, y1: box.b, y2: box.b, 'stroke-width': 1.2}, g);
      el('text', {x: (box.l + box.r) / 2, y: box.b + (tall ? 58 : 38), 'text-anchor': 'middle', class: 'axis-label'}, g, st.unit === 'ly' ? '거리 (광년, 로그 눈금)' : '거리 (pc, 로그 눈금)');
      // 교과서 그림 7의 거리 규모(광년)
      if (wide) [['태양계', -4], ['가까운 별', 2], ['은하수', 5], ['가까운 은하', 7], ['은하단', 10]].forEach(([t, e]) => {
        const x = xs(e - lyShift), anchor = x > box.r - 30 ? 'end' : 'middle', tx = Math.min(x, box.r);
        el('text', {x: tx, y: 14, 'text-anchor': anchor, class: 'small-annot', fill: '#6b7c88'}, svg, t);
        el('text', {x: tx, y: 30, 'text-anchor': anchor, class: 'tick', fill: '#9aa9b5'}, svg, `(${powLabel(e)} 광년)`);
        el('line', {x1: x, x2: x, y1: 36, y2: box.t - 30, stroke: '#d5dde2', 'stroke-dasharray': '2 3'}, svg);
      });
      // 천체 트랙: 이름표가 겹치지 않게 여러 줄에 나눠 단다
      const trackY = box.t + objH / 2 + 2;
      el('text', {x: 8, y: trackY + 4, class: 'axis-label'}, svg, '천체');
      el('line', {x1: box.l, x2: box.r, y1: trackY, y2: trackY, stroke: '#e3e9ed', 'stroke-width': 2}, svg);
      const fs = tall ? 18 : 11, textW = (t, f) => [...t].reduce((w, ch) => w + (/[가-힣]/.test(ch) ? f : f * 0.62), 0);
      const rowsY = tall ? [trackY - 16, trackY + 32] : [trackY - 12, trackY + 23, trackY - 28, trackY + 39, trackY - 44, trackY + 55];
      const used = rowsY.map(() => []);
      const objs = M.OBJECTS.map(o => ({o, x: xs(Math.log10(o.r)), on: o.id === st.obj}));
      objs.forEach(({o, x, on}) => el('circle', {cx: x, cy: trackY, r: on ? 7 : 5, fill: on ? '#c2581c' : '#14283a', stroke: '#fff', 'stroke-width': 1.5}, svg));
      objs.filter(d => d.on).concat(objs.filter(d => !d.on).sort((a, b) => a.x - b.x)).forEach(({o, x, on}) => {
        if (tall && !on) return;
        const f = on ? (tall ? 20 : 12) : fs, w = textW(o.name, f) + 14;
        // 고른 천체의 이름은 거리 커서(세로선)를 피해 옆에 단다
        let lx = on ? (x - w / 2 - 6 > box.l - 20 ? x - w / 2 - 4 : x + w / 2 + 4) : x;
        lx = Math.max(box.l + w / 2 - 20, Math.min(box.r - w / 2, lx));
        let row = 0, best = Infinity;
        for (let k = 0; k < rowsY.length; k++) {
          const over = used[k].reduce((sum, [a, b]) => sum + Math.max(0, Math.min(b, lx + w / 2) - Math.max(a, lx - w / 2)), 0);
          if (over < best) { best = over; row = k; }
          if (over === 0) break;
        }
        if (best > 0 && !on) return;                 // 자리가 없으면 이름은 위의 단추 목록에서 본다
        used[row].push([lx - w / 2, lx + w / 2]);
        const y = rowsY[row], above = y < trackY;
        if (row >= 2 || Math.abs(lx - x) > 3) el('line', {x1: x, y1: trackY + (above ? -6 : 6), x2: lx, y2: above ? y + 3 : y - f + 2, stroke: '#c5d0d8', 'stroke-width': 1}, svg);
        el('text', {x: lx, y, 'text-anchor': 'middle', class: on ? 'annot halo' : 'small-annot halo', fill: on ? '#c2581c' : '#41566a'}, svg, o.name);
      });
      // 방법 막대
      const r = 10 ** st.lr, reach = M.reachable(r);
      rowY = [];
      M.METHODS.forEach((m, i) => {
        const y = top + i * rh + rh / 2, x0 = Math.max(box.l, xs(Math.log10(m.min))), x1 = Math.min(box.r, xs(Math.log10(m.max))), on = reach.includes(m.id), sel = m.id === st.method;
        rowY.push({y, h: rh - 8, m});
        el('text', {x: box.l - 10, y: y + 4, 'text-anchor': 'end', class: sel ? 'annot' : 'tick', fill: sel ? COLORS[m.id] : undefined}, svg, tall ? m.short : m.name);
        const bh = rh - (tall ? 16 : 12);
        if (m.groundMax) {
          const xg = xs(Math.log10(m.groundMax));
          el('rect', {x: x0, y: y - bh / 2, width: xg - x0, height: bh, rx: bh / 2, fill: COLORS[m.id], opacity: on ? 1 : 0.25}, svg);
          el('rect', {x: xg - bh / 2, y: y - bh / 2, width: x1 - xg + bh / 2, height: bh, rx: bh / 2, fill: COLORS[m.id], opacity: on ? 0.45 : 0.12}, svg);
          if (!tall) el('text', {x: (xg + x1) / 2, y: y + 4, 'text-anchor': 'middle', class: 'tick', fill: '#fff'}, svg, '가이아');
        } else el('rect', {x: x0, y: y - bh / 2, width: Math.max(bh, x1 - x0), height: bh, rx: bh / 2, fill: COLORS[m.id], opacity: on ? 1 : 0.25}, svg);
        if (sel) el('rect', {x: x0 - 3, y: y - bh / 2 - 3, width: Math.max(bh, x1 - x0) + 6, height: bh + 6, rx: bh / 2 + 3, fill: 'none', stroke: '#14283a', 'stroke-width': 2}, svg);
      });
      // 거리 커서
      const cx = xs(st.lr);
      el('line', {x1: cx, x2: cx, y1: box.t - 2, y2: box.b, stroke: '#c2581c', 'stroke-width': 2.4}, svg);
      const lab = dist(r), lw = Math.max(70, lab.length * (tall ? 13 : 8.4) + 16);
      const lx = Math.max(box.l, Math.min(box.r - lw, cx - lw / 2));
      el('rect', {x: lx, y: box.t - (tall ? 32 : 26), width: lw, height: tall ? 30 : 22, rx: 6, fill: '#c2581c'}, svg);
      el('text', {x: lx + lw / 2, y: box.t - (tall ? 11 : 10), 'text-anchor': 'middle', fill: '#fff', class: 'annot'}, svg, lab);
      return reach;
    }

    function methodCard(m) {
      const objs = M.OBJECTS.filter(o => o.used.includes(m.id)).map(o => o.name).join(', ');
      const formula = m.id === 'parallax' ? `<p class="formula">r (pc) = ${frac('1', 'p (″)')} &nbsp;·&nbsp; 지상 망원경의 한계 p ≈ 0.01″ → r ≈ 100 pc</p>`
        : m.id === 'radar' ? `<p class="formula">거리 = ${frac('빛의 속도 × 되돌아오는 데 걸린 시간', '2')}</p>`
        : m.id === 'cepheid' ? '<p class="formula">주기 P → 절대 등급 M (주기-광도 관계) → m − M = 5 log r − 5 → r</p>'
        : m.id === 'rr' || m.id === 'sn1a' ? `<p class="formula">M ≈ ${m.id === 'rr' ? '+0.5' : '−19'} 로 일정 → m − M = 5 log r − 5 → r</p>`
        : m.id === 'msfit' ? '<p class="formula">성단 C-M도를 표준 주계열과 겹침 → 옮긴 등급 = m − M → r</p>' : '';
      return `<dl class="facts">
        <dt>무엇을 재나</dt><dd>${m.measure}</dd>
        <dt>무엇에 기대나</dt><dd>${m.relies}</dd>
        <dt>닿는 거리</dt><dd>${span(m)} <small>${m.range}</small></dd>
        <dt>오차 (대략)</dt><dd>${m.error}</dd>
        <dt>장점</dt><dd>${m.pro}</dd>
        <dt>한계</dt><dd>${m.con}</dd></dl>${formula}
        ${objs ? `<p class="mini">이 방법으로 잰 천체: ${objs}</p>` : ''}`;
    }
    function render() {
      setPressed(objChips, 'data-obj', st.obj || '');
      setPressed(mChips, 'data-method', st.method);
      setPressed($('s4-unit'), 'data-unit', st.unit);
      const reach = draw(), r = 10 ** st.lr, m = M.METHODS.find(x => x.id === st.method), o = M.OBJECTS.find(x => x.id === st.obj);
      $('s4-method-title').textContent = m.name;
      $('s4-card').innerHTML = methodCard(m);
      // 아래 숫자: 연주 시차와 표준 광원의 겉보기 등급
      const p = M.parallaxArcsec(r), mc = M.apparentMag(-4, r), msn = M.apparentMag(-19, r);
      const pTxt = p >= 0.01 ? num(p, p >= 1 ? 2 : 3) : p.toPrecision(2).replace(/e([+-])(\d+)/, (s, a, b) => ` × 10${sup((a === '-' ? '-' : '') + b)}`);
      $('s4-readout').innerHTML = `<div><span>거리 r${o ? ` · ${o.name}` : ''}</span><strong>${M.pcText(r)}</strong> <span>${M.lyText(r)}${o ? ` · ${o.sub}` : ''}</span></div>
        <div><span>연주 시차 p = ${frac('1', 'r')}</span><strong>${r < 1e-2 ? '—' : pTxt + '″'}</strong></div>
        <div><span>세페이드 (10일, M = −4)의 m</span><strong>${num(mc, 1)}</strong></div>
        <div><span>Ia형 초신성 (M = −19)의 m</span><strong>${num(msn, 1)}</strong></div>`;
      // 비교·평가
      const rows = M.METHODS.map(x => `<tr class="${reach.includes(x.id) ? 'on' : ''}"><td><span class="pill" style="background:${COLORS[x.id]}">${x.short}</span></td><td>${x.measure}</td><td>${span(x)}</td></tr>`).join('');
      $('s4-compare').innerHTML = `
        <p><b>교과서 101쪽 확인 문제 4</b> — 세페이드 변광성으로 거리를 재는 방법을 연주 시차·주계열 맞추기와 비교하면?</p>
        <p class="mini"><b>장점</b> 변광성이 매우 밝아서 연주 시차나 주계열 맞추기로는 닿지 않는 먼 거리(외부 은하)까지 잴 수 있습니다.<br><b>단점</b> 변광성의 종류(종족)를 명확히 알지 못하면 절대 등급을 잘못 읽어 거리 오차가 크게 생깁니다.</p>
        <p class="mini"><b>사다리처럼 이어지는 까닭</b> 연주 시차로 가까운 성단의 거리를 확인 → 주계열 맞추기와 세페이드의 기준을 맞춤 → 세페이드가 있는 은하의 Ia형 초신성으로 Ia형의 밝기를 맞춤 → 허블-르메트르 법칙. 아래 칸이 틀리면 위 칸이 모두 틀립니다. 1952년 세페이드의 두 종족을 구분하자 외부 은하까지의 거리가 약 2배로 늘어난 것이 그 예입니다.</p>
        <table class="cmp-table"><tr><th>방법</th><th>재는 것</th><th>닿는 거리</th></tr>${rows}</table>`;
      // 핵심
      const names = reach.map(id => M.METHODS.find(x => x.id === id).name);
      let ins = `<b>${M.pcText(r)}</b>(${M.lyText(r)})${o ? `의 <b>${o.name}</b>` : ''}까지 닿는 방법은 ${names.length ? `<b>${names.join(', ')}</b>입니다.` : '이 사다리에 없습니다.'} `;
      if (r < 1e-3) ins += '태양계 안은 전파를 쏘아 되돌아오는 시간으로 잽니다.';
      else if (r <= 100) ins += `연주 시차가 ${pTxt}″로 커서 지상 망원경으로도 잴 수 있습니다.`;
      else if (r <= 6000) ins += `연주 시차가 ${pTxt}″로 지상 망원경의 한계(0.01″)보다 작아, 가이아 같은 우주 망원경이 필요합니다.`;
      else if (mc < 27) ins += `연주 시차(${pTxt}″)는 너무 작아 잴 수 없고, 대신 밝기를 아는 별을 씁니다. 같은 거리의 세페이드(M = −4)는 ${num(mc, 1)}등급으로 보입니다.`;
      else ins += `세페이드도 ${num(mc, 1)}등급으로 너무 어두워 보기 어렵습니다. 훨씬 밝은 Ia형 초신성(${num(msn, 1)}등급)과 허블-르메트르 법칙을 씁니다.`;
      $('s4-insight').innerHTML = ins;
    }
    return {render};
  })();

  // ── 시작 ─────────────────────────────────────────────────
  show((location.hash || '').slice(1) || 's1');
  let resizeTimer;
  window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => stations[current].render(), 150); });
  window.addEventListener('hashchange', () => { const h = location.hash.slice(1); if (h && (ALIAS[h] || h) !== current) show(h); });
})();
