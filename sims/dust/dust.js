/* 성간 티끌 실험실 — 네 실험이 같은 모형(dust-model.js)을 쓴다. */
(() => {
  'use strict';
  const M = window.DustModel, DATA = window.DustData || {m45: []};
  const $ = id => document.getElementById(id);
  const NS = 'http://www.w3.org/2000/svg';
  const TAU = Math.PI * 2;
  const FONT = '"Pretendard","Apple SD Gothic Neo","Malgun Gothic",system-ui,sans-serif';
  const reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  // ── 작은 도구들 (변광성 실험실과 같은 것) ─────────────────────────
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
  function niceStep(span, n) {
    const raw = span / n, p = 10 ** Math.floor(Math.log10(raw)), e = raw / p;
    return (e >= 7.5 ? 10 : e >= 3.5 ? 5 : e >= 1.5 ? 2 : 1) * p;
  }
  function ticks(lo, hi, n) {
    const a = Math.min(lo, hi), b = Math.max(lo, hi), s = niceStep(b - a, n), out = [];
    for (let v = Math.ceil(a / s - 1e-9) * s; v <= b + 1e-9; v += s) out.push(+v.toFixed(10));
    return out;
  }
  // 음수는 수학 기호 −로. -0.00 같은 표기는 피한다.
  function num(v, d = 2) {
    const s = Math.abs(v).toFixed(d);
    return (v < 0 && +s !== 0 ? '−' : '') + s;
  }
  const signed = (v, d = 2) => (v > 0 && +Math.abs(v).toFixed(d) !== 0 ? '+' : '') + num(v, d);
  const small = () => window.innerWidth < 640;
  const pathOf = pts => pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('');
  function svgPoint(svg, evt) {
    const pt = svg.createSVGPoint();
    pt.x = evt.clientX; pt.y = evt.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  }
  // 그래프 위를 누르고 끄는 동작. 세로 스크롤은 브라우저에 맡긴다(touch-action: pan-y).
  function onDrag(svg, handler) {
    let active = false;
    svg.addEventListener('pointerdown', e => {
      active = true;
      try { svg.setPointerCapture(e.pointerId); } catch (_) {}
      handler(svgPoint(svg, e), 'start');
    });
    svg.addEventListener('pointermove', e => { if (active) handler(svgPoint(svg, e), 'move'); });
    const end = () => { if (active) { active = false; handler(null, 'end'); } };
    svg.addEventListener('pointerup', end);
    svg.addEventListener('pointercancel', end);
  }
  function setPressed(container, attr, value) {
    container.querySelectorAll(`[${attr}]`).forEach(b => b.setAttribute('aria-pressed', String(b.getAttribute(attr) === value)));
  }
  // 좌표축과 격자. box = {l, r, t, b}
  function frame(svg, box, xs, ys, o) {
    const g = el('g', {class: 'axis'}, svg);
    (o.yTicks || []).forEach(t => {
      const y = ys(t.v);
      if (o.grid !== false) el('line', {x1: box.l, x2: box.r, y1: y, y2: y, class: 'grid-line'}, g);
      el('text', {x: box.l - 8, y: y + 4, 'text-anchor': 'end', class: 'tick'}, g, t.label);
    });
    (o.xTicks || []).forEach(t => {
      const x = xs(t.v);
      if (o.grid !== false) el('line', {x1: x, x2: x, y1: box.t, y2: box.b, class: 'grid-line'}, g);
      el('text', {x, y: box.b + (small() ? 26 : 18), 'text-anchor': 'middle', class: 'tick'}, g, t.label);
    });
    el('line', {x1: box.l, x2: box.l, y1: box.t, y2: box.b, 'stroke-width': 1.2}, g);
    el('line', {x1: box.l, x2: box.r, y1: box.b, y2: box.b, 'stroke-width': 1.2}, g);
    if (o.xLabel) el('text', {x: (box.l + box.r) / 2, y: box.b + (small() ? 54 : 38), 'text-anchor': 'middle', class: 'axis-label'}, g, o.xLabel);
    if (o.yLabel) el('text', {x: 16, y: (box.t + box.b) / 2, transform: `rotate(-90 16 ${(box.t + box.b) / 2})`, 'text-anchor': 'middle', class: 'axis-label'}, g, o.yLabel);
    return g;
  }
  // 캔버스를 화면 크기 × 화소 밀도에 맞춘다. 좌표는 CSS 픽셀로 쓴다.
  function fitCanvas(cv) {
    const w = cv.clientWidth, h = cv.clientHeight;
    if (!w || !h) return null;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.round(w * dpr), H = Math.round(h * dpr);
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    return {ctx, w, h, dpr};
  }
  // 둥글게 퍼지는 빛 한 덩어리. color는 'rgba(r,g,b,a)'
  function blob(ctx, x, y, r, color) {
    if (r <= 0) return;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, color.replace(/[\d.]+\)$/, '0)'));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  }
  function label(ctx, text, x, y, color, size = 12, align = 'center', bg = 'rgba(5,10,20,0.72)') {
    ctx.font = `800 ${size}px ${FONT}`;
    const w = ctx.measureText(text).width + 10, h = size + 7;
    const x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
    if (bg) {
      ctx.fillStyle = bg;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x0, y - h + 4, w, h, 5); else ctx.rect(x0, y - h + 4, w, h);
      ctx.fill();
    }
    ctx.fillStyle = color;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(text, x0 + 5, y);
    return {x0, x1: x0 + w, y0: y - h + 4, y1: y + 4};
  }
  // 거리 표기: 수업처럼 1000 pc, 17400 pc (자릿점 없이)
  function fmtR(r) {
    if (r >= 1e6) return `${+(r / 1e6).toPrecision(3)} Mpc`;
    if (r >= 1e5) return `${+(r / 1e3).toPrecision(3)} kpc`;
    if (r >= 100) return `${Math.round(r)} pc`;
    return `${+r.toPrecision(3)} pc`;
  }
  const frac = (a, b) => `<span class="frac"><span>${a}</span><span>${b}</span></span>`;
  const V = s => `<em class="v">${s}</em>`;
  const sub = (s, t) => `${V(s)}<sub>${t}</sub>`;

  // ── 실험 전환 ─────────────────────────────────────────────
  const ORDER = ['nebula', 'extinct', 'redden', 'distance'];
  const stations = {};
  let current = 'nebula';
  function parseHash(h) {
    const k = (h || '').replace(/^#/, '');
    const m = /^s([1-4])$/.exec(k);
    if (m) return ORDER[+m[1] - 1];
    return ORDER.includes(k) ? k : null;
  }
  function show(name) {
    if (!stations[name]) name = 'nebula';
    current = name;
    setPressed(document.querySelector('.stations'), 'data-station', name);
    document.querySelectorAll('.station').forEach(s => { s.hidden = s.id !== 'station-' + name; });
    stations[name].render();
    try { history.replaceState(null, '', '#s' + (ORDER.indexOf(name) + 1)); } catch (_) {}
  }
  document.querySelectorAll('.stations button').forEach(b => b.addEventListener('click', () => {
    show(b.dataset.station);
    document.querySelector('.stations').scrollIntoView({block: 'nearest'});
  }));

  // ═══════════════ 01 성간 물질과 성운 ═══════════════
  stations.nebula = (() => {
    const PRESETS = M.NEBULA_PRESETS;
    const P0 = PRESETS.dark;
    const st = {star: {...P0.star}, dust: {...P0.dust}, gas: {...P0.gas}, background: true, preset: 'dark', orion: 'horse', oview: 'draw'};
    const sky = $('neb-sky'), map = $('neb-map'), wrap = $('neb-map-wrap');
    const tokens = {star: wrap.querySelector('[data-token=star]'), dust: wrap.querySelector('[data-token=dust]'), gas: wrap.querySelector('[data-token=gas]')};
    let MH = 300;
    const MX = x => 30 + x * 5.8;
    const top = () => 46, bot = () => MH - 56;
    const MZ = z => top() + (1 - z / 100) * (bot() - top());

    // 하늘의 먼 별들 (늘 같은 자리)
    const rnd = M.rng(2024);
    const BG = Array.from({length: 320}, () => {
      const b = rnd();
      return {x: rnd(), y: rnd(), r: 0.35 + 1.3 * b * b * b, a: 0.35 + 0.6 * rnd(), c: M.rgb(M.bvColor(-0.1 + 1.4 * rnd()))};
    });
    const BGM = Array.from({length: 70}, () => ({x: rnd(), y: rnd(), r: 0.8 + rnd() * 1.4}));
    // 구름의 울퉁불퉁한 모양
    const LUMPS = Array.from({length: 9}, (_, i) => {
      const a = i / 9 * TAU + rnd() * 0.5, d = i === 0 ? 0 : 0.35 + 0.25 * rnd();
      return {dx: Math.cos(a) * d, dy: Math.sin(a) * d * 0.8, r: i === 0 ? 0.85 : 0.5 + 0.25 * rnd()};
    });

    const scene = () => ({star: st.star, dust: st.dust, gas: st.gas, background: st.background});

    // 프리셋, 별 종류, 배경 별
    document.querySelectorAll('#neb-presets [data-preset]').forEach(b => b.addEventListener('click', () => {
      const p = PRESETS[b.dataset.preset];
      st.star = {...p.star}; st.dust = {...p.dust}; st.gas = {...p.gas};
      st.preset = b.dataset.preset;
      render();
    }));
    document.querySelectorAll('#neb-startype [data-hot]').forEach(b => b.addEventListener('click', () => {
      st.star.hot = b.dataset.hot === '1'; st.preset = null; render();
    }));
    $('neb-bg').addEventListener('change', e => { st.background = e.target.checked; st.preset = null; render(); });

    // 끌어 옮기기 (손가락·마우스) — 토큰만 touch-action: none, 나머지는 페이지 스크롤
    function toModel(e) {
      const r = wrap.getBoundingClientRect();
      const vx = (e.clientX - r.left) / r.width * 640, vy = (e.clientY - r.top) / r.height * MH;
      return {x: M.clamp((vx - 30) / 5.8, 3, 97), z: M.clamp((1 - (vy - top()) / (bot() - top())) * 100, 4, 96)};
    }
    Object.entries(tokens).forEach(([k, b]) => {
      let drag = false;
      b.addEventListener('pointerdown', e => {
        drag = true; e.preventDefault();
        try { b.setPointerCapture(e.pointerId); } catch (_) {}
        b.classList.add('dragging');
      });
      b.addEventListener('pointermove', e => {
        if (!drag) return;
        const p = toModel(e);
        st[k].x = p.x; st[k].z = p.z; st.preset = null;
        render();
      });
      const end = () => { drag = false; b.classList.remove('dragging'); };
      b.addEventListener('pointerup', end);
      b.addEventListener('pointercancel', end);
      b.addEventListener('keydown', e => {
        const d = {ArrowLeft: [-3, 0], ArrowRight: [3, 0], ArrowUp: [0, 3], ArrowDown: [0, -3]}[e.key];
        if (!d) return;
        e.preventDefault();
        st[k].x = M.clamp(st[k].x + d[0], 3, 97); st[k].z = M.clamp(st[k].z + d[1], 4, 96); st.preset = null;
        render();
      });
    });

    function drawMap(sc) {
      MH = small() ? 360 : 300;
      map.setAttribute('viewBox', `0 0 640 ${MH}`);
      clear(map);
      const fs = small() ? 19 : 12;
      // 먼 별들의 띠
      el('rect', {x: 0, y: 0, width: 640, height: 34, fill: st.background ? '#e1e8ef' : '#f1f3f5'}, map);
      if (st.background) BGM.forEach(s => el('circle', {cx: (s.x * 640).toFixed(1), cy: (5 + s.y * 24).toFixed(1), r: s.r, fill: '#4f6475', opacity: 0.6}, map));
      el('text', {x: 632, y: 24, 'text-anchor': 'end', 'font-size': fs, 'font-weight': 800, fill: st.background ? '#38506a' : '#9aa9b5', class: 'halo'}, map, st.background ? '뒤쪽 먼 별들' : '뒤쪽 먼 별들 (끔)');
      // 시선
      for (let i = 1; i < 8; i++) {
        const x = 30 + i * 580 / 8;
        el('line', {x1: x, x2: x, y1: 34, y2: MH - 36, stroke: '#dfe6ea', 'stroke-dasharray': '3 6'}, map);
      }
      // 티끌 구름이 가리는 시선(구름 뒤쪽)
      const dx = MX(st.dust.x), dz = MZ(st.dust.z), hw = M.HALF.dust * 5.8;
      el('rect', {x: dx - hw, y: 34, width: 2 * hw, height: Math.max(0, dz - 34), fill: '#14283a', opacity: 0.07}, map);
      if (dz - 34 > 70) el('text', {x: dx, y: 34 + fs + 6, 'text-anchor': 'middle', 'font-size': fs * 0.9, fill: '#5f7282', 'font-weight': 700, class: 'halo'}, map, '가려지는 시선');
      // 관측자
      el('rect', {x: 0, y: MH - 36, width: 640, height: 36, fill: '#e9eef2'}, map);
      const ex = 320, ey = MH - 18;
      el('path', {d: `M${ex - 16} ${ey} Q${ex} ${ey - 12} ${ex + 16} ${ey} Q${ex} ${ey + 12} ${ex - 16} ${ey} Z`, fill: '#fff', stroke: '#14283a', 'stroke-width': 2}, map);
      el('circle', {cx: ex, cy: ey, r: 5, fill: '#14283a'}, map);
      el('text', {x: ex + 26, y: ey + fs * 0.38, 'font-size': fs, 'font-weight': 800, fill: '#14283a'}, map, '관측자 (지구)');
      el('text', {x: 10, y: ey + fs * 0.38, 'font-size': fs * 0.9, fill: '#5f7282', 'font-weight': 700}, map, '↑ 멀어진다');
      // 별빛·자외선이 닿는 범위
      const sx = MX(st.star.x), sz = MZ(st.star.z);
      const rx = M.REACH * 5.8, ry = M.REACH * (bot() - top()) / 100;
      const hot = st.star.hot;
      el('ellipse', {cx: sx, cy: sz, rx, ry, fill: hot ? '#7a5cff' : '#ffc94d', 'fill-opacity': 0.08, stroke: hot ? '#7a5cff' : '#d99a1a', 'stroke-width': 1.6, 'stroke-dasharray': '6 5'}, map);
      el('text', {x: sx, y: sz - ry - 6, 'text-anchor': 'middle', 'font-size': fs * 0.92, 'font-weight': 700, fill: hot ? '#5b3fd6' : '#a5720a', class: 'halo'}, map, hot ? '자외선·빛이 강하게 닿는 범위' : '빛이 닿는 범위 (자외선 약함)');
      // 무엇이 무엇을 비추는가
      const gx = MX(st.gas.x), gz = MZ(st.gas.z);
      if (sc.gasLit) {
        el('line', {x1: sx, y1: sz, x2: gx, y2: gz, stroke: '#7a5cff', 'stroke-width': 3, 'stroke-dasharray': '2 5', 'stroke-linecap': 'round'}, map);
      }
      if (sc.dustLit) {
        el('line', {x1: sx, y1: sz, x2: dx, y2: dz, stroke: '#e0a020', 'stroke-width': 3, 'stroke-dasharray': '2 5', 'stroke-linecap': 'round'}, map);
      }
      // 토큰 자리
      const place = (b, x, z) => { b.style.left = (MX(x) / 640 * 100) + '%'; b.style.top = (MZ(z) / MH * 100) + '%'; };
      place(tokens.star, st.star.x, st.star.z);
      place(tokens.dust, st.dust.x, st.dust.z);
      place(tokens.gas, st.gas.x, st.gas.z);
      tokens.star.classList.toggle('cool', !hot);
      tokens.star.querySelector('.tok-name').textContent = hot ? 'O·B형 별' : '덜 뜨거운 별';
      tokens.gas.classList.toggle('lit', sc.gasLit);
    }

    function dustBlob(ctx, cx, cy, rx, ry, a) {
      for (const b of LUMPS) {
        const x = cx + b.dx * rx, y = cy + b.dy * ry, r = b.r * rx;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, `rgba(7,6,9,${a})`); g.addColorStop(0.62, `rgba(7,6,9,${a})`); g.addColorStop(1, 'rgba(7,6,9,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
      }
    }
    function drawSky(sc) {
      const c = fitCanvas(sky);
      if (!c) return;
      const {ctx, w, h} = c, u = w / 100;
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#070d1b'); g.addColorStop(1, '#03060d');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      if (st.background) {
        for (const s of BG) {
          ctx.globalAlpha = s.a; ctx.fillStyle = s.c;
          ctx.beginPath(); ctx.arc(s.x * w, s.y * h, s.r * Math.max(0.8, w / 640), 0, TAU); ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      const cy = h * 0.47;
      const objs = [{k: 'star', o: st.star}, {k: 'gas', o: st.gas}, {k: 'dust', o: st.dust}].sort((a, b) => b.o.z - a.o.z);
      const pos = {};
      for (const {k, o} of objs) {
        const x = o.x * u;
        if (k === 'star') {
          pos.star = {x, y: cy - 0.06 * h};
          const col = st.star.hot ? 'rgba(165,195,255,0.85)' : 'rgba(255,214,150,0.85)';
          ctx.globalCompositeOperation = 'lighter';
          blob(ctx, x, pos.star.y, 5.5 * u, col.replace('0.85', '0.45'));
          blob(ctx, x, pos.star.y, 2.2 * u, col);
          ctx.globalCompositeOperation = 'source-over';
          ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, pos.star.y, Math.max(2.2, 0.55 * u), 0, TAU); ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1;
          const L = 3.2 * u;
          ctx.beginPath(); ctx.moveTo(x - L, pos.star.y); ctx.lineTo(x + L, pos.star.y); ctx.moveTo(x, pos.star.y - L); ctx.lineTo(x, pos.star.y + L); ctx.stroke();
        } else if (k === 'gas') {
          const rx = M.HALF.gas * u, ry = Math.min(h * 0.36, rx * 0.72);
          pos.gas = {x, y: cy, ry};
          if (sc.gasLit) {
            ctx.globalCompositeOperation = 'lighter';
            const k2 = M.clamp(1.3 - sc.dStarGas / M.REACH, 0.55, 1);
            for (const b of LUMPS) blob(ctx, x + b.dx * rx, cy + b.dy * ry, b.r * rx * 1.12, `rgba(225,52,84,${(0.5 * k2).toFixed(3)})`);
            blob(ctx, x, cy, rx * 0.6, `rgba(255,135,155,${(0.45 * k2).toFixed(3)})`);
            ctx.globalCompositeOperation = 'source-over';
          } else {
            ctx.setLineDash([4, 5]); ctx.strokeStyle = 'rgba(200,215,230,0.28)'; ctx.lineWidth = 1.2;
            ctx.beginPath(); ctx.ellipse(x, cy, rx * 0.95, ry * 0.95, 0, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
          }
        } else {
          const rx = M.HALF.dust * u, ry = Math.min(h * 0.4, rx * 0.85);
          pos.dust = {x, y: cy + 0.02 * h, ry};
          dustBlob(ctx, x, pos.dust.y, rx, ry, 0.97);
          if (sc.dustLit) {
            const k2 = M.clamp(1.2 - sc.dStarDust / M.REACH, 0.3, 1);
            const side = M.clamp((st.star.x - st.dust.x) / M.HALF.dust, -1, 1) * 0.45;
            ctx.globalCompositeOperation = 'lighter';
            for (const b of LUMPS) blob(ctx, x + b.dx * rx, pos.dust.y + b.dy * ry, b.r * rx, `rgba(55,105,230,${(0.24 * k2).toFixed(3)})`);
            blob(ctx, x + side * rx, pos.dust.y, rx * 0.8, `rgba(120,170,255,${(0.42 * k2).toFixed(3)})`);
            ctx.globalCompositeOperation = 'source-over';
          }
        }
      }
      // 이름표 (겹치면 위로 올린다)
      const fs = w < 520 ? 11 : 12.5;
      const tags = [];
      const dustTxt = {reflection: ['반사 성운', '#9cc2ff'], dark: ['암흑 성운', '#d9dde3'], invisible: ['티끌 구름 (안 보임)', '#8a96a3']}[sc.dust];
      const gasTxt = sc.gas === 'emission' ? ['방출 성운', '#ff9aa9'] : ['수소 기체 (안 보임)', '#8a96a3'];
      tags.push({x: pos.dust.x, t: dustTxt[0], c: dustTxt[1]});
      tags.push({x: pos.gas.x, t: gasTxt[0], c: gasTxt[1]});
      tags.push({x: pos.star.x, t: sc.starHidden ? '별 (가려짐)' : (st.star.hot ? 'O·B형 별' : '덜 뜨거운 별'), c: sc.starHidden ? '#e6a93c' : '#ffffff', star: true});
      const boxes = [];
      tags.forEach(t => {
        let y = t.star ? Math.max(fs + 6, pos.star.y - 4.5 * u) : h - 10;
        ctx.font = `800 ${fs}px ${FONT}`;
        const half = ctx.measureText(t.t).width / 2 + 6;
        const x = M.clamp(t.x, half + 2, w - half - 2);
        for (let tries = 0; tries < 4; tries++) {
          const hit = boxes.some(b => x - half < b.x1 && x + half > b.x0 && y - fs < b.y1 && y + 6 > b.y0);
          if (!hit) break;
          y -= fs + 8;
        }
        boxes.push(label(ctx, t.t, x, y, t.c, fs));
      });
    }

    function status(sc) {
      const hot = st.star.hot;
      let dust;
      if (sc.dust === 'reflection') dust = {b: '반사 성운', c: 'refl', why: '가까운 별의 빛 가운데 파란빛이 티끌에 더 많이 산란(반사)되어 푸르게 보입니다.' + (sc.dustAlsoDark ? ' 별빛이 덜 닿는 쪽은 뒤의 빛을 가려 어둡습니다.' : '')};
      else if (sc.dust === 'dark') {
        const what = sc.behind.includes('gas') ? '방출 성운의 붉은빛' : sc.behind.includes('star') ? '별빛' : '먼 별들의 빛';
        dust = {b: '암흑 성운', c: 'dark', why: `티끌이 뒤에서 오는 ${what}을 가려 검게 보입니다.`};
      } else dust = {b: '보이지 않음', c: 'none', why: '뒤에서 오는 빛도, 비추는 별도 없어 검은 하늘과 구별되지 않습니다. 뒤쪽 먼 별들을 켜 보세요.'};
      let gas;
      if (sc.gas === 'emission') gas = {b: '방출 성운', c: 'emis', s: M.ISM_STATES.HII, why: '젊고 뜨거운 O·B형 별의 강한 자외선이 수소를 이온화했습니다. 전리된 수소가 재결합하며 내는 빛으로 붉게 빛납니다.'};
      else if (sc.gasNear) gas = {b: '보이지 않음', c: 'none', s: M.ISM_STATES.HI, why: '별이 가까이 있지만 자외선이 약해 수소를 이온화하지 못합니다. 가시광선으로는 보이지 않고, 파장 21 cm 전파로 관측합니다.'};
      else gas = {b: '보이지 않음', c: 'none', s: M.ISM_STATES.HI, why: '자외선을 내는 별에서 멀어 수소가 원자 상태로 남았습니다. 가시광선으로는 보이지 않고, 파장 21 cm 전파로 관측합니다.'};
      const star = sc.starHidden
        ? {b: '가려짐', c: 'hid', why: '티끌 구름 뒤에 있어 별빛이 가려졌습니다. 이것이 02의 성간 소광입니다.'}
        : {b: hot ? 'O·B형 별' : '덜 뜨거운 별', c: hot ? 'refl' : 'none', why: hot ? '태어난 지 얼마 안 된 뜨거운 별이라 강한 자외선을 냅니다.' : '빛은 밝지만 자외선이 약합니다.'};
      $('neb-status').innerHTML = `
        <div class="status ${dust.c}"><div class="row"><span class="who">티끌 구름</span><span class="badge ${dust.c}">${dust.b}</span><span class="state">분자 구름 · 약 10 K</span></div>${dust.why}</div>
        <div class="status ${gas.c === 'emis' ? 'emis' : ''}"><div class="row"><span class="who">수소 기체 구름</span><span class="badge ${gas.c}">${gas.b}</span><span class="state">${gas.s.name} · ${gas.s.temp}</span></div>${gas.why}</div>
        <div class="status"><div class="row"><span class="who">별</span><span class="badge ${star.c}">${star.b}</span></div>${star.why}</div>`;
      document.querySelectorAll('#neb-states tr[data-state]').forEach(tr => {
        const s = tr.dataset.state;
        tr.classList.toggle('on', s === 'molecular' || s === sc.gasState);
      });
      const parts = [];
      if (sc.dust === 'dark') parts.push('<b>암흑 성운</b> — 티끌이 뒤에서 오는 빛을 가려 검게 보입니다');
      if (sc.dust === 'reflection') parts.push('<b>반사 성운</b> — 티끌이 가까운 별빛을 산란해 푸르게 보입니다');
      if (sc.gas === 'emission') parts.push('<b>방출 성운</b> — 전리수소 영역에서 수소가 재결합하며 붉게 빛납니다');
      let tip = '';
      if (sc.gas !== 'emission') tip = hot ? ' 수소 기체를 O·B형 별 가까이(점선 안) 옮겨 보세요.' : ' 별을 젊고 뜨거운 O·B형 별로 바꾸면 무엇이 달라질까요?';
      else if (sc.dust === 'dark' && !sc.behind.includes('gas')) tip = ' 티끌 구름을 붉게 빛나는 기체 앞(아래쪽)으로 옮기면 말머리 성운처럼 보입니다.';
      else if (sc.dust !== 'reflection') tip = ' 티끌 구름을 별 가까이 옮기면 어떻게 될까요?';
      $('neb-insight').innerHTML = (parts.length ? parts.join(' · ') + '.' : '지금은 아무 성운도 보이지 않습니다.') + tip;
      sky.setAttribute('aria-label', '관측자가 보는 하늘: ' + (parts.length ? parts.map(t => t.replace(/<[^>]+>/g, '')).join(', ') : '보이는 성운 없음'));
      setPressed($('neb-presets'), 'data-preset', st.preset || '');
      setPressed($('neb-startype'), 'data-hot', hot ? '1' : '0');
      $('neb-bg').checked = st.background;
    }

    // ── 오리온자리 제타 별 주변 (교과서 그림 10) ──
    // 위치는 실제 사진(Giuseppe Donatiello, CC0)에서 잰 비율. 그림 모드는 그 사진을 보고 단순화해 그린 것.
    const ORION = [
      {id: 'horse', name: '말머리 성운(B33)', kind: 'dark', badge: '암흑 성운', x: 0.75, y: 0.5, r: 0.075,
        text: '차갑고 밀도가 높은 분자 구름의 티끌이 뒤에서 빛나는 IC 434의 붉은빛을 가려, 말 머리 모양의 검은 그림자로 보입니다.', link: '→ 위 모형의 「암흑 성운 만들기」와 같은 배치입니다.'},
      {id: 'ngc2023', name: 'NGC 2023', kind: 'refl', badge: '반사 성운', x: 0.607, y: 0.648, r: 0.065,
        text: '분자 구름 속 밝은 B형 별의 빛이 티끌에 반사(산란)되어 푸르게 보입니다. 파란빛이 붉은빛보다 더 많이 산란되기 때문입니다 — 낮에 하늘이 파란 것과 같은 원리입니다.', link: '→ 「반사 성운 만들기」. IC 431, IC 432, IC 435도 반사 성운입니다.'},
      {id: 'ic434', name: 'IC 434', kind: 'emis', badge: '방출 성운', x: 0.68, y: 0.3, r: 0.2,
        text: '뜨거운 O형 별(그림 오른쪽 위의 오리온자리 시그마 별)의 자외선이 수소를 이온화한 전리수소(HⅡ) 영역입니다. 전리된 수소가 재결합하며 내는 빛으로 붉게 빛납니다.', link: '→ 「방출 성운 만들기」와 같은 원리입니다.'},
      {id: 'flame', name: '불꽃 성운(NGC 2024)', kind: 'emis', badge: '방출 성운', x: 0.3, y: 0.665, r: 0.1,
        text: '전리수소 영역에서 수소가 재결합하며 내는 빛으로 빛나는 방출 성운입니다. 가운데의 검은 줄무늬는 앞쪽의 티끌이 빛을 가린 것입니다.', link: '→ 방출 성운 앞에 티끌이 있으면 그 부분만 검게 보입니다.'},
      {id: 'ic435', name: 'IC 435', kind: 'refl', badge: '반사 성운', x: 0.646, y: 0.893, r: 0.045,
        text: '가까운 별의 빛이 티끌에 반사되어 푸르게 보이는 작은 반사 성운입니다.', link: ''},
      {id: 'zeta', name: '오리온자리 제타 별', kind: 'star', badge: '별', x: 0.374, y: 0.481, r: 0.06,
        text: '오리온자리 허리띠의 세 별 가운데 하나(알니타크)로, 이 사진에서 가장 밝은 별입니다. 이 둘레에 성간 물질이 많이 모여 있어 세 가지 성운이 함께 보입니다.', link: ''}
    ];
    const ocv = $('orion'), ophoto = $('orion-photo');
    const chips = $('orion-chips');
    ORION.forEach(o => {
      const b = document.createElement('button');
      b.type = 'button'; b.dataset.orion = o.id; b.dataset.kind = o.kind; b.textContent = o.name;
      b.addEventListener('click', () => { st.orion = o.id; renderOrion(); });
      chips.appendChild(b);
    });
    document.querySelectorAll('#orion-view [data-oview]').forEach(b => b.addEventListener('click', () => { st.oview = b.dataset.oview; renderOrion(); }));
    let paintCache = null;
    function frontV(u) {
      return 0.528 + 0.007 * Math.sin(u * 37) + 0.005 * Math.sin(u * 91 + 1.3) - 0.03 * Math.exp(-(((u - 0.5) / 0.05) ** 2)) - 0.012 * Math.exp(-(((u - 0.86) / 0.04) ** 2));
    }
    function paintOrion(S) {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const off = document.createElement('canvas');
      off.width = Math.round(S * dpr); off.height = Math.round(S * dpr);
      const ctx = off.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const r = M.rng(434), P = v => v * S;
      ctx.fillStyle = '#05060c'; ctx.fillRect(0, 0, S, S);
      // 빛나는 기체는 작은 캔버스에 그린 뒤 크게 늘려 부드럽게 만든다
      const LS = Math.max(60, Math.round(S / 4));
      const layer = () => { const cv = document.createElement('canvas'); cv.width = LS; cv.height = LS; const x = cv.getContext('2d'); x.globalCompositeOperation = 'lighter'; return [cv, x]; };
      const [glow, g] = layer(), [glow2, g2] = layer(), Q = v => v * LS;
      // IC 434 — 위쪽에 넓게 퍼진 붉은 방출 성운, 경계에 가까울수록 밝다
      blob(g, Q(0.72), Q(0.22), Q(0.7), 'rgba(105,18,52,0.6)');
      blob(g, Q(0.9), Q(0.45), Q(0.38), 'rgba(140,26,60,0.45)');
      for (let i = 0; i < 18; i++) {                       // 위로 옅어지는 실 모양
        let u = 0.36 + r() * 0.66, v = 0.5;
        const a = 0.025 + 0.04 * r();
        for (let j = 0; j < 10; j++) {
          v -= 0.035 + 0.025 * r(); u += (r() - 0.5) * 0.05;
          blob(g, Q(u), Q(v), Q(0.04 + 0.04 * r()), `rgba(${(205 + r() * 40) | 0},${(40 + r() * 25) | 0},${(72 + r() * 40) | 0},${(a * (1 - j / 12)).toFixed(3)})`);
        }
      }
      for (let i = 0; i < 40; i++) blob(g, Q(0.36 + r() * 0.66), Q(0.05 + r() * 0.45), Q(0.05 + r() * 0.07), 'rgba(170,36,78,0.07)');
      for (let u = 0.37; u <= 1.02; u += 0.01) blob(g, Q(u), Q(frontV(u) - 0.02), Q(0.045), 'rgba(255,88,116,0.2)');
      // 반사 성운 IC 431·IC 432, 시그마 별과 제타 별 둘레의 푸른빛
      blob(g, Q(0.02), Q(0.385), Q(0.07), 'rgba(80,130,255,0.55)');
      blob(g, Q(0.057), Q(0.514), Q(0.06), 'rgba(80,130,255,0.5)');
      blob(g, Q(0.857), Q(0.114), Q(0.12), 'rgba(70,120,255,0.45)');
      blob(g, Q(0.2), Q(0.42), Q(0.3), 'rgba(55,60,140,0.3)');
      blob(g, Q(0.374), Q(0.481), Q(0.13), 'rgba(120,150,255,0.35)');
      // 앞쪽 빛: 불꽃 성운, 반사 성운 NGC 2023·IC 435 (분자 구름 위에 그린다)
      [[0.3, 0.66, 0.11, 0.42], [0.26, 0.7, 0.085, 0.36], [0.34, 0.69, 0.075, 0.32], [0.25, 0.62, 0.07, 0.28], [0.3, 0.77, 0.07, 0.26], [0.33, 0.6, 0.06, 0.22]]
        .forEach(([u, v, rr, al]) => blob(g2, Q(u), Q(v), Q(rr), `rgba(255,128,74,${al})`));
      blob(g2, Q(0.3), Q(0.67), Q(0.045), 'rgba(255,220,160,0.6)');
      blob(g2, Q(0.607), Q(0.648), Q(0.09), 'rgba(70,120,255,0.55)');
      blob(g2, Q(0.607), Q(0.648), Q(0.04), 'rgba(160,195,255,0.6)');
      blob(g2, Q(0.646), Q(0.893), Q(0.055), 'rgba(70,120,255,0.55)');
      ctx.imageSmoothingEnabled = true;
      // 먼 별들 → 빛나는 기체
      for (let i = 0; i < 950; i++) {
        const u = r(), v = r(), bb = r() ** 3;
        ctx.globalAlpha = 0.35 + 0.65 * r();
        ctx.fillStyle = M.rgb(M.bvColor(-0.1 + 1.6 * r()));
        ctx.beginPath(); ctx.arc(P(u), P(v), 0.35 + 1.5 * bb, 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(glow, 0, 0, S, S);                     // 뒤쪽 빛: IC 434 등
      ctx.globalCompositeOperation = 'source-over';
      // 아래쪽의 차가운 분자 구름 — 뒤의 붉은빛과 별빛을 가린다
      ctx.fillStyle = 'rgba(11,6,9,0.94)';
      ctx.beginPath();
      ctx.moveTo(P(1.02), P(frontV(1.02)));
      for (let u = 1.02; u >= 0.38; u -= 0.01) ctx.lineTo(P(u), P(frontV(u)));
      ctx.bezierCurveTo(P(0.35), P(0.58), P(0.4), P(0.66), P(0.41), P(0.78));
      ctx.bezierCurveTo(P(0.42), P(0.9), P(0.33), P(0.94), P(0.27), P(1.02));
      ctx.lineTo(P(1.02), P(1.02));
      ctx.closePath(); ctx.fill();
      ctx.save();                                           // 왼쪽 가장자리를 흐리게
      ctx.beginPath(); ctx.moveTo(P(0.38), P(frontV(0.38)));
      ctx.bezierCurveTo(P(0.35), P(0.58), P(0.4), P(0.66), P(0.41), P(0.78));
      ctx.bezierCurveTo(P(0.42), P(0.9), P(0.33), P(0.94), P(0.27), P(1.02));
      ctx.lineCap = 'round';
      [[0.07, 0.12], [0.04, 0.2], [0.018, 0.3]].forEach(([wd, al]) => { ctx.strokeStyle = `rgba(11,6,9,${al})`; ctx.lineWidth = P(wd); ctx.stroke(); });
      ctx.restore();
      for (let i = 0; i < 40; i++) {
        const u = 0.42 + r() * 0.6, v = 0.58 + r() * 0.42;
        blob(ctx, P(u), P(v), P(0.04 + r() * 0.07), `rgba(${(40 + r() * 30) | 0},${(14 + r() * 10) | 0},${(22 + r() * 14) | 0},0.16)`);
      }
      // 말머리 성운: 붉은 빛을 등지고 솟은 티끌 기둥 (머리가 왼쪽을 본다, 크기는 과장)
      const k = S * 1.3, hx = P(0.768), hy = P(frontV(0.768) + 0.006);
      const H = (x, y) => [hx + x * k, hy + y * k];
      ctx.save();
      ctx.shadowColor = 'rgba(8,4,7,0.9)'; ctx.shadowBlur = 3;
      ctx.fillStyle = 'rgb(9,5,8)';
      ctx.beginPath();
      ctx.moveTo(...H(0.013, 0.006));
      ctx.bezierCurveTo(...H(0.016, -0.012), ...H(0.018, -0.03), ...H(0.012, -0.045));
      ctx.bezierCurveTo(...H(0.008, -0.056), ...H(0.002, -0.063), ...H(-0.006, -0.064));
      ctx.bezierCurveTo(...H(-0.008, -0.07), ...H(-0.013, -0.07), ...H(-0.013, -0.063));
      ctx.bezierCurveTo(...H(-0.022, -0.062), ...H(-0.031, -0.055), ...H(-0.038, -0.047));
      ctx.bezierCurveTo(...H(-0.044, -0.04), ...H(-0.048, -0.034), ...H(-0.044, -0.029));
      ctx.bezierCurveTo(...H(-0.04, -0.025), ...H(-0.03, -0.027), ...H(-0.022, -0.029));
      ctx.bezierCurveTo(...H(-0.015, -0.031), ...H(-0.01, -0.022), ...H(-0.011, -0.012));
      ctx.bezierCurveTo(...H(-0.012, -0.004), ...H(-0.015, 0), ...H(-0.017, 0.006));
      ctx.closePath(); ctx.fill();
      ctx.restore();
      // 앞쪽 빛: 불꽃 성운, 반사 성운
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(glow2, 0, 0, S, S);
      ctx.globalCompositeOperation = 'source-over';
      // 불꽃 성운 앞을 가로지르는 티끌 줄무늬
      ctx.lineCap = 'round';
      const lanes = [[[0.336, 0.6], [0.318, 0.645], [0.322, 0.7], [0.304, 0.76]], [[0.319, 0.652], [0.3, 0.64], [0.284, 0.648], [0.27, 0.636]],
                     [[0.316, 0.69], [0.33, 0.7], [0.338, 0.712], [0.352, 0.712]], [[0.31, 0.722], [0.296, 0.734], [0.29, 0.748], [0.28, 0.756]]];
      [[0.02, 0.14], [0.011, 0.38], [0.005, 0.65]].forEach(([wd, al]) => {
        ctx.strokeStyle = `rgba(18,8,6,${al})`; ctx.lineWidth = P(wd);
        lanes.forEach(L => { ctx.beginPath(); ctx.moveTo(P(L[0][0]), P(L[0][1])); ctx.bezierCurveTo(P(L[1][0]), P(L[1][1]), P(L[2][0]), P(L[2][1]), P(L[3][0]), P(L[3][1])); ctx.stroke(); });
      });
      // 밝은 별: 제타 별, 시그마 별 (흰빛)
      const bright = (u, v, R, L) => {
        blob(ctx, P(u), P(v), P(R), 'rgba(225,235,255,0.75)');
        ctx.strokeStyle = 'rgba(225,235,255,0.75)'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(P(u - L), P(v)); ctx.lineTo(P(u + L), P(v)); ctx.moveTo(P(u), P(v - L)); ctx.lineTo(P(u), P(v + L)); ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(P(u), P(v), P(R * 0.25), 0, TAU); ctx.fill();
      };
      bright(0.374, 0.481, 0.035, 0.075); bright(0.857, 0.114, 0.022, 0.045);
      [[0.607, 0.648], [0.646, 0.893], [0.02, 0.385], [0.057, 0.514]].forEach(([u, v]) => { ctx.fillStyle = '#eef4ff'; ctx.beginPath(); ctx.arc(P(u), P(v), P(0.0045), 0, TAU); ctx.fill(); });
      // 앞쪽의 별 몇 개 (구름보다 가까이 있는 별)
      for (let i = 0; i < 70; i++) {
        const u = r(), v = 0.5 + r() * 0.5;
        ctx.globalAlpha = 0.5 + 0.5 * r(); ctx.fillStyle = M.rgb(M.bvColor(0.2 + r()));
        ctx.beginPath(); ctx.arc(P(u), P(v), 0.4 + r() * 0.9, 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
      return off;
    }
    function renderOrion() {
      const c = fitCanvas(ocv);
      setPressed(chips, 'data-orion', st.orion);
      setPressed($('orion-view'), 'data-oview', st.oview);
      ophoto.hidden = st.oview !== 'photo';
      const o = ORION.find(x => x.id === st.orion);
      const info = $('orion-info');
      info.className = 'orion-info ' + o.kind;
      info.innerHTML = `<h4>${o.name} <span class="badge ${o.kind === 'star' ? 'hid' : o.kind}">${o.badge}</span></h4>${o.text}${o.link ? `<span class="link">${o.link}</span>` : ''}`;
      $('orion-credit').textContent = st.oview === 'photo'
        ? '사진: Giuseppe Donatiello, CC0 (위키미디어 공용). 교과서 그림 10과 같은 지역입니다.'
        : '그림: 실제 사진(Giuseppe Donatiello, CC0)을 보고 단순화해 그렸습니다. 밝기와 색은 과장했습니다.';
      if (!c) return;
      const {ctx, w} = c;
      ctx.clearRect(0, 0, w, w);
      if (st.oview === 'draw') {
        if (!paintCache || paintCache.S !== w) paintCache = {S: w, img: paintOrion(w)};
        ctx.drawImage(paintCache.img, 0, 0, w, w);
      }
      // 다른 성운은 작은 점, 고른 성운은 고리와 이름
      const fs = w < 420 ? 12 : 13.5;
      ORION.forEach(x => {
        if (x.id === o.id || x.id === 'ic434') return;
        ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(x.x * w, x.y * w, Math.max(5, x.r * w * 0.45), 0, TAU); ctx.stroke();
      });
      const col = {dark: '#e9edf2', refl: '#8fb6ff', emis: '#ff8c9c', star: '#ffd27e'}[o.kind];
      ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.ellipse(o.x * w, o.y * w, o.r * w, o.r * w * (o.id === 'ic434' ? 0.7 : 1), 0, 0, TAU); ctx.stroke();
      ctx.strokeStyle = col; ctx.lineWidth = 2.5;
      ctx.stroke();
      const ly = o.y * w + (o.y > 0.75 ? -o.r * w - 8 : o.r * w * (o.id === 'ic434' ? 0.7 : 1) + fs + 8);
      label(ctx, `${o.name} · ${o.badge}`, M.clamp(o.x * w, 90, w - 90), ly, col, fs);
    }

    function render() {
      const sc = M.nebulaScene(scene());
      drawMap(sc);
      drawSky(sc);
      status(sc);
      renderOrion();
    }
    return {render};
  })();

  // ═══════════════ 02 성간 소광 ═══════════════
  stations.extinct = (() => {
    const st = {band: 'vis', A0: 12, ghost: false, pick: -1};
    const field = M.makeField();
    const FREE = M.radialProfile(field, 0, 'vis', 6);     // 티끌이 없을 때 (한 번만)
    const K = M.bandRatio('K');
    const cv = $('ext-canvas'), chart = $('ext-chart');
    const IMG = {
      pillars: {vis: 'img/pillars-vis.jpg?v=20261101', ir: 'img/pillars-ir.jpg?v=20261101',
        alt: {vis: '허블 우주 망원경이 가시광선으로 본 창조의 기둥: 짙은 갈색 기둥 속이 보이지 않는다', ir: '제임스웹 우주 망원경이 적외선으로 본 창조의 기둥: 기둥이 반투명해지고 둘레와 속의 별이 많이 보인다'},
        cap: {vis: '— 가시광선 (허블 우주 망원경 · NASA, ESA/Hubble, Hubble Heritage Team)', ir: '— 적외선 (제임스웹 우주 망원경 · NASA, ESA, CSA, STScI)'}},
      mw: {vis: 'img/milkyway-vis.jpg?v=20261101', ir: 'img/milkyway-ir.jpg?v=20261101',
        alt: {vis: '가시광선으로 본 은하수: 밝은 띠를 따라 검은 줄무늬가 이어진다', ir: 'COBE 위성이 적외선으로 본 우리은하: 검은 줄무늬 없이 납작한 원반과 볼록한 중심부가 보인다'},
        cap: {vis: '— 가시광선 (ⓒ ESO/S. Brunier)', ir: '— 적외선 (COBE 위성 · NASA/GSFC)'}}
    };
    // 적외선 영상을 미리 받아 두어 바꿀 때 깜박이지 않게 한다
    const preload = [];
    window.addEventListener('load', () => { ['pillars', 'mw'].forEach(k => { const im = new Image(); im.src = IMG[k].ir; preload.push(im); }); });

    document.querySelectorAll('#ext-band [data-band]').forEach(b => b.addEventListener('click', () => { st.band = b.dataset.band; render(); }));
    $('ext-ghost').addEventListener('change', e => { st.ghost = e.target.checked; render(); });
    let queued = false;
    $('ext-A').addEventListener('input', e => {
      st.A0 = +e.target.value;
      if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; render(); }); }
    });
    cv.addEventListener('click', e => {
      const r = cv.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.width;
      let best = -1, bd = Infinity;
      field.forEach((s, i) => {
        if (s.m0 >= M.LIMIT) return;            // 티끌이 없어도 안 보이는 별은 고르지 않는다
        const d = Math.hypot(s.x - x, s.y - y);
        if (d < bd) { bd = d; best = i; }
      });
      st.pick = bd * r.width < 22 ? best : -1;
      render();
    });

    // 구름 모양은 한 번만 계산해 둔다 (바탕 빛용 격자)
    const GW = 128, GH = 96, shapeGrid = new Float32Array(GW * GH);
    for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) shapeGrid[j * GW + i] = M.cloudShape((i + 0.5) / GW, (j + 0.5) / GH * M.FIELD.h);
    const bgCanvas = document.createElement('canvas');
    bgCanvas.width = GW; bgCanvas.height = GH;
    function drawField() {
      const c = fitCanvas(cv);
      if (!c) return;
      const {ctx, w, h} = c, s = w;              // 시야 가로 1 = w 픽셀
      const ir = st.band === 'ir', f = M.bandFactor(st.band);
      // 희미한 별들이 모여 만드는 바탕 빛 — 티끌이 많은 곳은 더 어둡다
      const bctx = bgCanvas.getContext('2d'), img = bctx.createImageData(GW, GH);
      const base = ir ? [30, 27, 27] : [12, 18, 46];
      for (let k = 0; k < GW * GH; k++) {
        const T = 10 ** (-0.4 * Math.min(8, st.A0 * shapeGrid[k] * f));
        const tint = ir ? [1, 0.82 + 0.18 * T, 0.7 + 0.3 * T] : [1, 1, 1];
        img.data[k * 4] = base[0] * T * tint[0] + 3; img.data[k * 4 + 1] = base[1] * T * tint[1] + 3; img.data[k * 4 + 2] = base[2] * T * tint[2] + 5; img.data[k * 4 + 3] = 255;
      }
      bctx.putImageData(img, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(bgCanvas, 0, 0, w, h);
      const k = Math.max(0.75, w / 640);
      for (let i = 0; i < field.length; i++) {
        const star = field[i], v = M.seeStar(star, st.A0, st.band);
        const x = star.x * s, y = star.y * s;
        if (!v.visible) {
          if (st.ghost && v.wouldSee) {
            ctx.strokeStyle = 'rgba(110,220,255,0.55)'; ctx.lineWidth = 0.9;
            ctx.beginPath(); ctx.arc(x, y, 2.1 * k, 0, TAU); ctx.stroke();
          }
          continue;
        }
        const q = M.LIMIT - v.m;                       // 한계보다 몇 등급 밝은가
        const rad = Math.min(3.8, 0.75 + 0.3 * q) * k;
        const col = ir ? M.bvColor(0.1 + Math.min(2.2, v.Av * 0.09)) : M.bvColor(v.bv);
        ctx.globalAlpha = Math.min(1, 0.45 + 0.14 * q);
        ctx.fillStyle = M.rgb(col);
        if (q > 6) blob(ctx, x, y, rad * 3, `rgba(${col[0]},${col[1]},${col[2]},0.35)`);
        ctx.beginPath(); ctx.arc(x, y, rad, 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
      // 세는 원 두 개
      const fs = w < 480 ? 11 : 12.5;
      [['inner', '가운데'], ['outer', '바깥']].forEach(([key, name]) => {
        const p = M.PROBES[key];
        ctx.setLineDash([5, 5]); ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(p.x * s, p.y * s, p.r * s, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
        const n = M.countIn(field, st.A0, st.band, p).visible;
        label(ctx, `${name} ${n}개`, p.x * s, p.y * s + p.r * s + fs + 6, '#fff', fs);
      });
      label(ctx, ir ? '적외선 (색은 입힌 것)' : '가시광선', w - 8, fs + 8, ir ? '#ffb39c' : '#9fe3f0', fs, 'right');
      // 고른 별
      if (st.pick >= 0) {
        const p = field[st.pick];
        ctx.strokeStyle = '#ffb35c'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(p.x * s, p.y * s, 8, 0, TAU); ctx.stroke();
      }
    }

    function drawProfile() {
      clear(chart);
      const tall = small();
      const W = tall ? 640 : Math.round(M.clamp(chart.clientWidth || 640, 400, 640));
      chart.setAttribute('viewBox', `0 0 ${W} ${tall ? 380 : Math.round(W * 0.47)}`);
      const box = {l: tall ? 92 : 58, r: W - 14, t: 18, b: tall ? 290 : Math.round(W * 0.47) - 62};
      $('ext-legend').innerHTML = `<span><i style="background:var(--vis)"></i>가시광선</span><span><i style="background:var(--ir)"></i>적외선</span><span>진한 막대 = 지금 보는 빛</span>`;
      const rings = 6, area = Math.PI * 0.1 * 0.1;     // 가운데 원과 같은 넓이당
      const vis = M.radialProfile(field, st.A0, 'vis', rings), ir = M.radialProfile(field, st.A0, 'ir', rings);
      const free = FREE;
      const ref = free.slice(2).reduce((a, r) => a + r.density, 0) / (rings - 2) * area;   // 티끌이 없을 때의 평균
      const yMax = Math.max(ref * 1.35, ...vis.map(r => r.density * area), ...ir.map(r => r.density * area)) * 1.08;
      const xs = lin(0, rings, box.l, box.r), ys = lin(0, yMax, box.b, box.t);
      frame(chart, box, xs, ys, {yTicks: ticks(0, yMax, 4).map(v => ({v, label: num(v, 0)})), xLabel: tall ? '가운데 → 바깥 (고리)' : '성운 가운데로부터의 거리 (가운데 → 바깥)', yLabel: tall ? '같은 넓이당 별' : '같은 넓이당 별의 수'});
      ['가운데', '', '', '', '', '바깥'].forEach((t, i) => { if (t) el('text', {x: xs(i + 0.5), y: box.b + (tall ? 26 : 18), 'text-anchor': 'middle', class: 'tick'}, chart, t); });
      for (let i = 1; i < rings; i++) el('line', {x1: xs(i), x2: xs(i), y1: box.b, y2: box.b + 5, stroke: '#9aa9b5'}, chart);
      const bw = (xs(1) - xs(0)) * 0.34;
      for (let i = 0; i < rings; i++) {
        [[vis[i], -1, 'var(--vis)', 'vis'], [ir[i], 1, 'var(--ir)', 'ir']].forEach(([r, side, color, band]) => {
          const v = r.density * area, x = xs(i + 0.5) + side * bw * 0.55 - bw / 2;
          el('rect', {x, y: ys(v), width: bw, height: Math.max(0, box.b - ys(v)), fill: color, opacity: band === st.band ? 1 : 0.35, rx: 3}, chart);
        });
      }
      el('line', {x1: box.l, x2: box.r, y1: ys(ref), y2: ys(ref), stroke: '#14283a', 'stroke-dasharray': '6 5', 'stroke-width': 1.5}, chart);
      el('text', {x: box.l + 6, y: ys(ref) - 7, class: 'tick halo'}, chart, '티끌이 없을 때');
      const core = a => (a[0].density + a[1].density) / 2 / (ref / area);
      const pv = Math.round(100 * core(vis)), pi = Math.round(100 * core(ir));
      $('ext-insight').innerHTML = st.A0 === 0
        ? '티끌이 없으면 가운데와 바깥의 별의 수가 비슷합니다. 슬라이더로 티끌을 넣어 보세요.'
        : `가시광선에서는 가운데 두 고리의 별이 티끌이 없을 때의 <b>${pv} %</b>뿐이고, 바깥으로 갈수록 많아집니다 → 가운데일수록 티끌이 많아 <b>소광이 큽니다</b>. 같은 티끌인데 적외선에서는 <b>${pi} %</b>가 보입니다 → 파장이 긴 적외선은 <b>티끌의 영향을 덜 받아</b> 가려진 별이 보입니다.`;
    }

    function render() {
      setPressed($('ext-band'), 'data-band', st.band);
      $('ext-ghost').checked = st.ghost;
      $('ext-A').value = st.A0;
      $('ext-A-out').textContent = `소광 등급 가시광선 ${st.A0} · 적외선 ${num(st.A0 * K, 1)}`;
      $('ext-band-label').textContent = st.band === 'ir' ? '· 적외선' : '· 가시광선';
      drawField();
      drawProfile();
      const inn = M.countIn(field, st.A0, st.band, M.PROBES.inner), out = M.countIn(field, st.A0, st.band, M.PROBES.outer);
      $('ext-in').innerHTML = `${inn.visible}개${inn.hidden ? `<small>가려진 별 ${inn.hidden}개</small>` : ''}`;
      $('ext-out').textContent = `${out.visible}개`;
      $('ext-onlyir').textContent = `${M.onlyInIR(field, st.A0)}개`;
      cv.setAttribute('aria-label', `암흑 성운 모형 (${st.band === 'ir' ? '적외선' : '가시광선'}): 가운데 원 안의 별 ${inn.visible}개, 바깥 원 안의 별 ${out.visible}개`);
      const pick = $('ext-pick');
      if (st.pick >= 0) {
        const s = field[st.pick], v = M.seeStar(s, st.A0, st.band), bandName = st.band === 'ir' ? '적외선' : '가시광선';
        const left = M.brightnessRatio(v.A) * 100;
        pick.innerHTML = `고른 별 · 티끌이 없다면 <b>m₀ = ${num(s.m0, 1)}등급</b> → 이 자리의 소광 등급(${bandName}) <b>A = ${num(v.A, 1)}</b> → 관측되는 등급 <b>m = m₀ + A = ${num(v.m, 1)}등급</b>. ` +
          (v.visible ? `영상에 찍히는 한계(${M.LIMIT}등급)보다 밝아 보입니다. 밝기는 티끌이 없을 때의 ${left >= 1 ? Math.round(left) : num(left, 2)} %입니다.`
                     : (s.m0 < M.LIMIT ? `한계(${M.LIMIT}등급)보다 어두워져 <b>보이지 않습니다</b> — 별이 없는 것이 아니라 티끌이 가린 것입니다.` : `원래부터 한계(${M.LIMIT}등급)보다 어두운 별입니다.`));
      } else pick.textContent = '별을 하나 눌러 보세요. 티끌이 없을 때의 등급과 지금 관측되는 등급을 비교해 줍니다. 검은 곳을 눌러도 숨은 별을 찾아 줍니다.';
      // 적외선으로 보면 보이는 것들
      ['pillars', 'mw'].forEach(k => {
        const img = $(k === 'pillars' ? 'pillars-img' : 'mw-img');
        const src = IMG[k][st.band];
        if (img.getAttribute('src') !== src) img.setAttribute('src', src);
        img.alt = IMG[k].alt[st.band];
        $(k === 'pillars' ? 'pillars-cap' : 'mw-cap').textContent = IMG[k].cap[st.band];
      });
      $('ext-more-insight').innerHTML = st.band === 'ir'
        ? '<b>적외선</b>: 창조의 기둥이 반투명해지고 그 속에서 태어나는 별과 뒤의 별이 보입니다. 가시광선에서 은하수를 따라 이어지던 검은 띠도 사라지고 원반과 중심부가 드러납니다 → 그 검은 띠는 우리은하 <b>원반</b>에 많이 모여 있는 성간 티끌이 별빛을 가린 것입니다(교과서 106쪽).'
        : '<b>가시광선</b>: 창조의 기둥 속은 짙은 티끌에 가려 보이지 않고, 은하수에는 원반을 따라 검은 띠가 이어집니다. 위의 <b>적외선으로 보기</b>를 눌러 비교해 보세요.';
    }
    return {render};
  })();

  // ═══════════════ 03 성간 적색화 ═══════════════
  stations.redden = (() => {
    const STARS = [
      {id: 'b', name: '푸른 별', bv0: -0.2, V0: 10},
      {id: 'a0', name: '10000 K 별', bv0: 0, V0: 10.6},
      {id: 'sun', name: '태양 같은 별', bv0: 0.65, V0: 10},
      {id: 'red', name: '붉은 별', bv0: 1.4, V0: 10}
    ];
    const EX = {
      q3: {star: {id: 'q3', name: '수업 Q3의 별', bv0: 0, V0: 10.6}, Av: 1.5,
        note: '수업 Q3: 표면 온도 10000 K 주계열성(고유 색지수 0)을 관측했더니 B 12.6, V 12.1 → (1) 색초과 E = 0.5 (2) A<sub>V</sub> = 3E = 1.5'},
      q4: {star: {id: 'q4', name: '수업 Q4의 별 ⓑ', bv0: 0.2, V0: 11}, Av: 3,
        note: '수업 Q4 ⓑ: 은하 원반 방향의 별. 관측 색지수 1.2, 고유 색지수 0.2 → E = 1.0, A<sub>V</sub> = 3.0. ㄷ의 함정: B 등급 변화는 3.0이 아니라 A<sub>V</sub> + E = <b>4.0</b>'}
    };
    const st = {star: STARS[1], Av: 1.5, medium: 'space', lambda: 0.44, ex: null};
    const cv = $('red-canvas'), ladder = $('red-ladder'), chart = $('red-chart');
    const starChips = $('red-stars');
    STARS.forEach(s => {
      const b = document.createElement('button');
      b.type = 'button'; b.dataset.star = s.id;
      b.innerHTML = `${s.name}<span class="tag">(B−V)<sub>고유</sub> ${num(s.bv0, 2)}</span>`;
      b.addEventListener('click', () => { st.star = s; st.ex = null; render(); });
      starChips.appendChild(b);
    });
    document.querySelectorAll('#red-examples [data-ex]').forEach(b => b.addEventListener('click', () => {
      const e = EX[b.dataset.ex];
      st.ex = b.dataset.ex; st.star = e.star; st.Av = e.Av; st.medium = 'space';
      render();
    }));
    $('red-A').addEventListener('input', e => { st.Av = +e.target.value; if (st.ex) st.ex = null; render(); });
    document.querySelectorAll('#red-medium [data-medium]').forEach(b => b.addEventListener('click', () => { st.medium = b.dataset.medium; resetPhotons(); render(); }));

    // ── 1. 빛 알갱이 장면 (설계 좌표 640 × 300) ──
    const G = {star: [70, 120], slab: [250, 380, 42, 205], o1: [592, 120], o2: [315, 272]};
    const ph = {list: [], last: null, spawn: 0};
    function resetPhotons() { ph.list = []; }
    function spawnPhoton() {
      const blue = Math.random() < 0.5, ang = (Math.random() - 0.5) * 0.1;
      ph.list.push({x: G.star[0] + 14, y: G.star[1] + (Math.random() - 0.5) * 16, vx: Math.cos(ang), vy: Math.sin(ang), c: blue ? 'blue' : 'red', fate: null, ex: 0, state: 'fly', life: 1});
    }
    function step(dt) {
      ph.spawn += dt * 34;
      while (ph.spawn >= 1) { spawnPhoton(); ph.spawn -= 1; }
      const sp = 175;
      const air = st.medium === 'air';
      for (const p of ph.list) {
        if (p.state === 'absorb') { p.life -= dt * 2.4; continue; }
        p.x += p.vx * sp * dt; p.y += p.vy * sp * dt;
        if (p.fate === null && p.x >= G.slab[0]) {
          const pass = M.passProbability(p.c, st.Av, st.medium);
          const u = Math.random();
          p.fate = u < pass ? 'pass' : (air || Math.random() < 0.6) ? 'scatter' : 'absorb';
          p.ex = G.slab[0] + Math.random() * (G.slab[1] - G.slab[0]);
        }
        if (p.state === 'fly' && p.fate && p.fate !== 'pass' && p.x >= p.ex) {
          if (p.fate === 'absorb') { p.state = 'absorb'; continue; }
          p.state = 'scat';
          let a;
          if (Math.random() < 0.5) {   // 관측자 2 쪽으로
            a = Math.atan2(G.o2[1] - p.y, G.o2[0] - p.x) + (Math.random() - 0.5) * 0.35;
          } else a = -Math.PI * (0.15 + 0.7 * Math.random()) + (Math.random() < 0.3 ? Math.PI : 0);
          p.vx = Math.cos(a); p.vy = Math.sin(a);
        }
      }
      ph.list = ph.list.filter(p => p.life > 0 && p.x > -10 && p.x < 660 && p.y > -10 && p.y < 310 &&
        !(p.state === 'fly' && p.x > G.o1[0] - 16) && !(p.state === 'scat' && Math.hypot(p.x - G.o2[0], p.y - G.o2[1]) < 16));
      if (ph.list.length > 260) ph.list.splice(0, ph.list.length - 260);
    }
    function eye(ctx, x, y, s, up) {
      ctx.save(); ctx.translate(x, y); if (up) ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = '#f4f7fb'; ctx.strokeStyle = '#0b1626'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(-14 * s, 0); ctx.quadraticCurveTo(0, -11 * s, 14 * s, 0); ctx.quadraticCurveTo(0, 11 * s, -14 * s, 0); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#0b1626'; ctx.beginPath(); ctx.arc(-3 * s, 0, 4.2 * s, 0, TAU); ctx.fill();
      ctx.restore();
    }
    function drawScene() {
      const c = fitCanvas(cv);
      if (!c) return;
      const {ctx, w, h} = c, k = w / 640, X = v => v * k, Y = v => v * (h / 300);
      const air = st.medium === 'air';
      const r = M.redden(st.star, st.Av);
      const g = ctx.createLinearGradient(0, 0, 0, h);
      if (air) { g.addColorStop(0, '#0d1d3a'); g.addColorStop(1, '#2a1a24'); } else { g.addColorStop(0, '#070d1b'); g.addColorStop(1, '#04070f'); }
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      // 별(해)
      const sc = air ? [255, 238, 200] : M.bvColor(st.star.bv0);
      ctx.globalCompositeOperation = 'lighter';
      blob(ctx, X(G.star[0]), Y(G.star[1]), X(48), `rgba(${sc[0]},${sc[1]},${sc[2]},0.45)`);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = M.rgb(sc); ctx.beginPath(); ctx.arc(X(G.star[0]), Y(G.star[1]), X(17), 0, TAU); ctx.fill();
      // 티끌 층 (대기 층)
      const dens = M.clamp(st.Av / 4.5, 0, 1);
      const [x0, x1, y0, y1] = G.slab;
      if (air) {
        const ag = ctx.createLinearGradient(X(x0), 0, X(x1), 0);
        ag.addColorStop(0, 'rgba(150,180,230,0)'); ag.addColorStop(0.5, `rgba(150,185,235,${0.12 + 0.3 * dens})`); ag.addColorStop(1, 'rgba(150,180,230,0)');
        ctx.fillStyle = ag; ctx.fillRect(X(x0 - 20), Y(y0), X(x1 - x0 + 40), Y(y1 - y0));
      } else if (st.Av > 0) {
        const rr = M.rng(5);
        for (let i = 0; i < 14; i++) blob(ctx, X(x0 + 20 + rr() * (x1 - x0 - 40)), Y(y0 + 25 + rr() * (y1 - y0 - 50)), X(38 + rr() * 22), `rgba(120,98,78,${(0.1 + 0.28 * dens).toFixed(3)})`);
        ctx.fillStyle = `rgba(190,165,140,${(0.35 + 0.4 * dens).toFixed(2)})`;
        for (let i = 0; i < 70 + 120 * dens; i++) { ctx.beginPath(); ctx.arc(X(x0 + 10 + rr() * (x1 - x0 - 20)), Y(y0 + 10 + rr() * (y1 - y0 - 20)), Math.max(0.8, 1.3 * k), 0, TAU); ctx.fill(); }
      }
      // 빛 알갱이
      if (!reduceMotion) {
        ctx.lineCap = 'round'; ctx.lineWidth = Math.max(1.6, 2.4 * k);
        for (const p of ph.list) {
          ctx.globalAlpha = p.state === 'absorb' ? Math.max(0, p.life) : 1;
          ctx.strokeStyle = p.state === 'absorb' ? '#ffb46a' : p.c === 'blue' ? '#5fa2ff' : '#ff5d4f';
          ctx.beginPath(); ctx.moveTo(X(p.x), Y(p.y)); ctx.lineTo(X(p.x - p.vx * 9), Y(p.y - p.vy * 9)); ctx.stroke();
        }
        ctx.globalAlpha = 1;
      } else {
        // 움직임을 줄인 화면: 통과하는 비율만큼 굵은 화살표
        const tb = M.passProbability('blue', st.Av, st.medium), tr = M.passProbability('red', st.Av, st.medium);
        [['#5fa2ff', -10, tb], ['#ff5d4f', 10, tr]].forEach(([col, dy, t]) => {
          ctx.strokeStyle = col; ctx.lineWidth = 5 * k;
          ctx.beginPath(); ctx.moveTo(X(G.star[0] + 24), Y(G.star[1] + dy)); ctx.lineTo(X(x0), Y(G.star[1] + dy)); ctx.stroke();
          ctx.lineWidth = Math.max(0.5, 5 * k * t);
          ctx.beginPath(); ctx.moveTo(X(x0), Y(G.star[1] + dy)); ctx.lineTo(X(G.o1[0] - 20), Y(G.o1[1] + dy)); ctx.stroke();
        });
        ctx.strokeStyle = '#5fa2ff'; ctx.lineWidth = Math.max(1, 5 * k * (1 - tb));
        ctx.beginPath(); ctx.moveTo(X((x0 + x1) / 2), Y(G.star[1])); ctx.lineTo(X(G.o2[0]), Y(G.o2[1] - 24)); ctx.stroke();
      }
      // 관측자 1: 보이는 별
      eye(ctx, X(G.o1[0]), Y(G.o1[1]), Math.max(0.8, k), false);
      const seen = air ? (() => { const tb = M.passProbability('blue', st.Av, 'air'), tr = M.passProbability('red', st.Av, 'air'); return [255, Math.round(150 + 88 * Math.sqrt(tb / Math.max(tr, 1e-6)) * tr), Math.round(90 + 110 * tb)]; })() : M.bvColor(r.bv);
      const bright = air ? M.passProbability('red', st.Av, 'air') : M.brightnessRatio(st.Av);
      const ix = X(G.o1[0] - 4), iy = Y(G.o1[1] - 62);
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.beginPath(); ctx.arc(ix, iy, X(26), 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = 'lighter';
      blob(ctx, ix, iy, X(24), `rgba(${seen[0]},${seen[1]},${seen[2]},${(0.15 + 0.5 * Math.sqrt(bright)).toFixed(3)})`);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = M.rgb(seen); ctx.globalAlpha = 0.35 + 0.65 * Math.sqrt(bright);
      ctx.beginPath(); ctx.arc(ix, iy, X(8), 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
      label(ctx, air ? '보이는 해' : '보이는 별', ix - X(30), iy + 5, '#ffd0b0', w < 520 ? 10.5 : 12, 'right', null);
      // 관측자 2: 산란된 빛
      eye(ctx, X(G.o2[0]), Y(G.o2[1]), Math.max(0.8, k), true);
      const scatB = 1 - M.passProbability('blue', st.Av, st.medium);
      const jx = X(G.o2[0] + 70), jy = Y(G.o2[1] - 6);
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.beginPath(); ctx.arc(jx, jy, X(20), 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = 'lighter';
      blob(ctx, jx, jy, X(20), `rgba(90,150,255,${(0.08 + 0.8 * scatB).toFixed(3)})`);
      ctx.globalCompositeOperation = 'source-over';
      // 이름표
      const fs = w < 520 ? 10.5 : 12;
      const T = air
        ? {star: '해', slab: '두꺼운 대기', o1: '노을: 해가 붉다', o2: '하늘이 파랗다'}
        : {star: '별', slab: st.Av > 0 ? '성간 티끌' : '티끌 없음', o1: '관측자 1: 어둡고 붉게', o2: '관측자 2: 파란빛 (반사 성운)'};
      label(ctx, T.star, X(G.star[0]), Y(G.star[1] + 48), '#fff', fs);
      label(ctx, T.slab, X((x0 + x1) / 2), Y(y0) + fs, air ? '#cfe0ff' : '#e8d6c2', fs);
      label(ctx, T.o1, w - 4, Y(G.o1[1] + 40), '#ffd0b0', fs, 'right');
      label(ctx, T.o2, M.clamp(X(G.o2[0] + 96), 0, w - 4), Y(G.o2[1] + 12), '#a9c8ff', fs, 'left');
    }
    // 움직임: 실험 03이 열려 있고, 캔버스가 화면에 보이고, 탭이 보일 때만 (초당 약 30번)
    let tickOn = false, onScreen = true, lastDraw = 0;
    if ('IntersectionObserver' in window) new IntersectionObserver(es => { onScreen = es[0].isIntersecting; if (onScreen) startLoop(); }).observe(cv);
    function loop(now) {
      if (current !== 'redden' || document.hidden || reduceMotion || !onScreen) { tickOn = false; ph.last = null; return; }
      if (now - lastDraw >= 30) {
        const dt = ph.last === null ? 0 : Math.min(0.06, (now - ph.last) / 1000);
        ph.last = now; lastDraw = now;
        step(dt);
        drawScene();
      }
      requestAnimationFrame(loop);
    }
    function startLoop() { if (!tickOn && !reduceMotion && current === 'redden') { tickOn = true; ph.last = null; requestAnimationFrame(loop); } }
    document.addEventListener('visibilitychange', () => { if (!document.hidden) startLoop(); });

    // ── 2. B·V 사다리 ──
    function drawLadder(r) {
      clear(ladder);
      const tall = small();
      const W = Math.round(M.clamp(ladder.clientWidth || 400, 300, 560)), H = 300;
      ladder.setAttribute('viewBox', `0 0 ${W} ${H}`);
      const fs = tall ? 13 : 13.5, big = tall ? 15 : 16;
      const lo = Math.min(r.V0, r.B0) - 0.35, hi = Math.max(Math.max(r.V, r.B) + 0.35, lo + 2.2);
      const ys = lin(lo, hi, 40, H - 34);
      const x0 = 62, xB = x0 + (W - x0) * 0.2, xV = x0 + (W - x0) * 0.47, xK = x0 + (W - x0) * 0.66;
      ticks(lo, hi, 6).forEach(v => {
        el('line', {x1: x0 + 6, x2: W - 6, y1: ys(v), y2: ys(v), stroke: '#edf1f3'}, ladder);
        el('text', {x: x0, y: ys(v) + 4, 'text-anchor': 'end', 'font-size': fs, fill: '#5f7282'}, ladder, num(v, 1));
      });
      el('text', {x: 14, y: (40 + H - 34) / 2, transform: `rotate(-90 14 ${(40 + H - 34) / 2})`, 'text-anchor': 'middle', 'font-size': fs, 'font-weight': 700, fill: '#5f7282'}, ladder, '등급 (아래로 갈수록 어둡다)');
      el('text', {x: xB, y: 22, 'text-anchor': 'middle', 'font-size': big, 'font-weight': 800, fill: 'var(--bband)'}, ladder, 'B 등급');
      el('text', {x: xV, y: 22, 'text-anchor': 'middle', 'font-size': big, 'font-weight': 800, fill: 'var(--vband)'}, ladder, 'V 등급');
      const arrow = (x, y0, y1, color) => {
        if (y1 - y0 < 6) return;
        el('path', {d: `M${x} ${y0 + 8}V${y1 - 9}M${x - 6} ${y1 - 15}L${x} ${y1 - 8}L${x + 6} ${y1 - 15}`, stroke: color, 'stroke-width': 3, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round'}, ladder);
      };
      arrow(xB, ys(r.B0), ys(r.B), 'var(--bband)');
      arrow(xV, ys(r.V0), ys(r.V), 'var(--vband)');
      if (r.AB > 0.05) {
        el('text', {x: xB - 12, y: (ys(r.B0) + ys(r.B)) / 2 + 5, 'text-anchor': 'end', 'font-size': fs, 'font-weight': 800, fill: 'var(--bband)', class: 'halo'}, ladder, `+${num(r.AB, 2)}`);
        el('text', {x: xV - 12, y: (ys(r.V0) + ys(r.V)) / 2 + 5, 'text-anchor': 'end', 'font-size': fs, 'font-weight': 800, fill: 'var(--vband)', class: 'halo'}, ladder, `+${num(r.Av, 2)}`);
      }
      [[xB, r.B0, false, 'var(--bband)'], [xV, r.V0, false, 'var(--vband)'], [xB, r.B, true, 'var(--bband)'], [xV, r.V, true, 'var(--vband)']].forEach(([x, m, filled, color]) => {
        el('circle', {cx: x, cy: ys(m), r: 7, fill: filled ? color : '#fff', stroke: color, 'stroke-width': 2.5}, ladder);
      });
      // 색지수 = B 등급 − V 등급 (두 점 사이의 높이)
      const yI = [ys(r.B0), ys(r.V0)], yO = [ys(r.B), ys(r.V)];
      const midI = (yI[0] + yI[1]) / 2, midO = (yO[0] + yO[1]) / 2;
      const crowd = Math.abs(midI - midO) < 22;
      const bracket = (ya, yb, text, color, ty) => {
        const a = Math.min(ya, yb), b = Math.max(ya, yb);
        el('line', {x1: xB + 9, x2: xK - 6, y1: ya, y2: ya, stroke: color, 'stroke-dasharray': '2 3', opacity: 0.7}, ladder);
        el('line', {x1: xV + 9, x2: xK - 6, y1: yb, y2: yb, stroke: color, 'stroke-dasharray': '2 3', opacity: 0.7}, ladder);
        el('path', {d: `M${xK - 6} ${a}H${xK}V${b}H${xK - 6}`, stroke: color, 'stroke-width': 2, fill: 'none'}, ladder);
        el('text', {x: xK + 8, y: ty, 'font-size': fs, 'font-weight': 800, fill: color, class: 'halo'}, ladder, text);
      };
      el('text', {x: xK - 8, y: 22, 'font-size': fs, 'font-weight': 800, fill: '#5f7282'}, ladder, '색지수 B − V');
      bracket(yI[0], yI[1], `고유 ${num(r.bv0, 2)}`, '#5f7282', midI + 5 - (crowd ? 11 : 0));
      bracket(yO[0], yO[1], `관측 ${num(r.bv, 2)}`, 'var(--orange)', midO + 5 + (crowd ? 11 : 0));
      el('text', {x: W / 2, y: H - 8, 'text-anchor': 'middle', 'font-size': fs - 1, fill: '#5f7282'}, ladder, '○ 티끌이 없을 때 (고유)   ● 관측');
    }

    // ── 3. 소광 곡선 ──
    const cbox = {l: 64, r: 622, t: 20, b: 262};
    let xsC = null;
    function drawCurve() {
      clear(chart);
      const tall = small();
      chart.setAttribute('viewBox', `0 0 640 ${tall ? 420 : 330}`);
      cbox.b = tall ? 330 : 262; cbox.l = tall ? 92 : 64;
      const L0 = Math.log10(0.1), L1 = Math.log10(2.5);
      const xl = lin(L0, L1, cbox.l, cbox.r);
      xsC = l => xl(Math.log10(l)); xsC.inv = px => 10 ** xl.inv(px);
      const ys = lin(0, 5.8, cbox.b, cbox.t);
      // 영역 표시
      el('rect', {x: xsC(0.38), y: cbox.t, width: xsC(0.75) - xsC(0.38), height: cbox.b - cbox.t, fill: '#fdf6e7'}, chart);
      frame(chart, cbox, xsC, ys, {xTicks: [0.1, 0.2, 0.5, 1, 2].map(v => ({v, label: String(v)})), yTicks: [0, 1, 2, 3, 4, 5].map(v => ({v, label: String(v)})), xLabel: '파장 (μm)', yLabel: tall ? '소광량 (상댓값)' : '소광량 (V = 1인 상댓값)'});
      const fsA = tall ? 19 : 12.5;
      el('text', {x: (xsC(0.1) + xsC(0.38)) / 2 + 30, y: cbox.b - 12, 'text-anchor': 'middle', 'font-size': fsA, 'font-weight': 800, fill: '#6a4fc4'}, chart, '자외선');
      el('text', {x: (xsC(0.38) + xsC(0.75)) / 2, y: cbox.t + 18, 'text-anchor': 'middle', 'font-size': fsA, 'font-weight': 800, fill: '#a85a00'}, chart, '가시광선');
      el('text', {x: (xsC(0.75) + xsC(2.5)) / 2, y: cbox.t + 18, 'text-anchor': 'middle', 'font-size': fsA, 'font-weight': 800, fill: 'var(--ir)'}, chart, '적외선');
      // 무지개 띠
      const defs = el('defs', {}, chart), grad = el('linearGradient', {id: 'rainbow', x1: 0, x2: 1, y1: 0, y2: 0}, defs);
      [['0', '#7b3fd0'], ['0.18', '#3d5cff'], ['0.36', '#19a6c4'], ['0.5', '#2fb34a'], ['0.66', '#f2d22e'], ['0.82', '#f28c28'], ['1', '#d62c2c']].forEach(([o, c]) => el('stop', {offset: o, 'stop-color': c}, grad));
      el('rect', {x: xsC(0.38), y: cbox.b - 6, width: xsC(0.75) - xsC(0.38), height: 6, fill: 'url(#rainbow)'}, chart);
      const pts = [];
      for (let i = 0; i <= 260; i++) { const l = 10 ** (L0 + (L1 - L0) * i / 260); pts.push([xsC(l), ys(Math.min(5.75, M.ccm(l)))]); }
      el('path', {d: pathOf(pts), fill: 'none', stroke: '#14283a', 'stroke-width': 3.2, 'stroke-linejoin': 'round'}, chart);
      [['B', 'var(--bband)', 'end'], ['V', 'var(--vband)', 'start'], ['K', 'var(--ir)', 'middle']].forEach(([b, color, anchor]) => {
        const l = M.BANDS[b], y = ys(M.ccm(l));
        el('line', {x1: xsC(l), x2: xsC(l), y1: y, y2: cbox.b, stroke: color, 'stroke-dasharray': '5 4', 'stroke-width': 1.6}, chart);
        el('circle', {cx: xsC(l), cy: y, r: 6.5, fill: color, stroke: '#fff', 'stroke-width': 2}, chart);
        el('text', {x: xsC(l) + (anchor === 'end' ? -10 : anchor === 'start' ? 10 : 0), y: y - 11, 'text-anchor': anchor, 'font-size': tall ? 21 : 14, 'font-weight': 900, fill: color, class: 'halo'}, chart, b);
      });
      // 고른 파장
      const l = st.lambda, y = ys(Math.min(5.75, M.ccm(l)));
      el('line', {x1: xsC(l), x2: xsC(l), y1: cbox.t, y2: cbox.b, stroke: '#c2581c', 'stroke-width': 2}, chart);
      el('circle', {cx: xsC(l), cy: y, r: 7.5, fill: '#fff', stroke: '#c2581c', 'stroke-width': 3}, chart);
      const right = xsC(l) > (cbox.l + cbox.r) / 2;
      el('text', {x: xsC(l) + (right ? -10 : 10), y: Math.max(cbox.t + 40, y - 14), 'text-anchor': right ? 'end' : 'start', class: 'annot halo', fill: '#c2581c'}, chart, `λ = ${num(l, l < 1 ? 2 : 1)} μm`);
    }
    onDrag(chart, (p, phase) => {
      if (!p || !xsC) return;
      if (p.x < cbox.l - 10 || p.x > cbox.r + 10) return;
      st.lambda = M.clamp(xsC.inv(M.clamp(p.x, cbox.l, cbox.r)), 0.1, 2.5);
      drawCurve(); lambdaReadout();
    });
    chart.addEventListener('keydown', e => {
      const f = {ArrowLeft: 1 / 1.05, ArrowRight: 1.05, ArrowDown: 1 / 1.05, ArrowUp: 1.05}[e.key];
      if (!f) return;
      e.preventDefault();
      st.lambda = M.clamp(st.lambda * f, 0.1, 2.5);
      drawCurve(); lambdaReadout();
    });
    function lambdaReadout() {
      const l = st.lambda, rel = M.ccm(l), A = rel * st.Av, left = M.brightnessRatio(A) * 100;
      const name = l < 0.38 ? '자외선' : l <= 0.75 ? (l < 0.5 ? '가시광선 · 파란빛' : l < 0.6 ? '가시광선 · 노란빛' : '가시광선 · 붉은빛') : '적외선';
      $('red-lambda').innerHTML = `<div><span>고른 파장 (${name})</span><strong>${num(l, l < 1 ? 2 : 1)} μm</strong></div>
        <div><span>소광량 (V = 1)</span><strong>${num(rel, 2)}배</strong></div>
        <div><span>지금 티끌에서 소광 등급</span><strong>${num(A, 2)}<small>등급</small></strong></div>
        <div><span>도착하는 밝기</span><strong>${left >= 10 ? Math.round(left) : num(left, 1)} %</strong></div>`;
    }

    function render() {
      const r = M.redden(st.star, st.Av);
      setPressed(starChips, 'data-star', st.star.id);
      setPressed($('red-examples'), 'data-ex', st.ex || '');
      setPressed($('red-medium'), 'data-medium', st.medium);
      $('red-A').value = st.Av;
      $('red-A-label').firstChild.textContent = st.medium === 'air' ? '대기의 두께 (노을 비유) ' : '별과 관측자 사이의 티끌 양 ';
      $('red-A-out').innerHTML = st.medium === 'air' ? `V에서 ${num(st.Av, 2)}등급 어두워짐` : `소광 등급 A<sub>V</sub> = ${num(st.Av, 2)}`;
      const tb = M.passProbability('blue', st.Av, st.medium), tr = M.passProbability('red', st.Av, st.medium);
      $('red-counts').innerHTML = `<div><span>그대로 통과하는 파란빛</span><strong style="color:var(--bband)">${Math.round(tb * 100)} %</strong></div>
        <div><span>그대로 통과하는 붉은빛</span><strong style="color:var(--bad)">${Math.round(tr * 100)} %</strong></div>
        <div><span>${st.medium === 'air' ? '노을' : '관측자 1이 보는 별'}</span><strong>${st.medium === 'air' ? '붉은빛이 남는다' : `밝기 ${Math.round(M.brightnessRatio(st.Av) * 100)} % · 더 붉게`}</strong></div>`;
      drawLadder(r);
      $('red-swatches').innerHTML = `<div class="swatch swatch-sky"><i style="background:${M.rgb(M.bvColor(r.bv0))};box-shadow:0 0 14px 2px ${M.rgb(M.bvColor(r.bv0))}"></i><b>고유한 색</b>(B−V) ${num(r.bv0, 2)}</div>
        <div class="swatch swatch-sky"><i style="background:${M.rgb(M.bvColor(r.bv))};box-shadow:0 0 14px 2px ${M.rgb(M.bvColor(r.bv))}"></i><b>관측한 색</b>(B−V) ${num(r.bv, 2)} · 밝기 ${M.brightnessRatio(st.Av) >= 0.1 ? Math.round(M.brightnessRatio(st.Av) * 100) + ' %' : Math.round(1 / M.brightnessRatio(st.Av)) + '분의 1'}</div>`;
      $('red-derive').innerHTML = `
        <div class="ln"><span class="k">①</span><span>${sub('A', 'B')} = ${num(r.AB, 2)} &gt; ${sub('A', 'V')} = ${num(r.Av, 2)} <span class="note">파란빛(B)이 더 많이 깎인다 → B 등급이 V 등급보다 더 많이 커진다</span></span></div>
        <div class="ln"><span class="k">②</span><span>(B − V)<sub>관측</sub> = (B − V)<sub>고유</sub> + (${sub('A', 'B')} − ${sub('A', 'V')}) = ${num(r.bv0, 2)} + ${num(r.AB - r.Av, 2)} = <span class="big">${num(r.bv, 2)}</span></span></div>
        <div class="ln"><span class="k">③</span><span>색초과 ${V('E')} = (B − V)<sub>관측</sub> − (B − V)<sub>고유</sub> = ${num(r.bv, 2)} − ${num(r.bv0, 2)} = <span class="big">${num(r.E, 2)}</span></span></div>
        <div class="ln"><span class="k">④</span><span>우리은하에서 ${sub('A', 'V')} ≈ 3${V('E')} = 3 × ${num(r.E, 2)} = <span class="big">${num(r.Av, 2)}</span> <span class="note">B 등급의 변화량 = ${sub('A', 'V')} + ${V('E')} = ${num(r.AB, 2)}</span></span></div>`;
      let ins;
      if (st.Av === 0) ins = '티끌이 없으면 B 등급과 V 등급이 그대로이고, 관측 색지수가 고유 색지수와 같습니다. 슬라이더로 티끌을 넣어 보세요.';
      else ins = `티끌이 별빛을 B 등급으로 <b>${num(r.AB, 2)}</b>, V 등급으로 <b>${num(r.Av, 2)}</b>만큼 어둡게 해 색지수가 커졌습니다: (B − V) 고유 ${num(r.bv0, 2)} → 관측 ${num(r.bv, 2)} (<b>성간 적색화</b>). 색초과를 재면 V 등급의 증가량(소광 등급)도 구할 수 있습니다: E = ${num(r.E, 2)} → A<sub>V</sub> ≈ 3E = ${num(r.Av, 2)}.`;
      if (st.ex) ins = EX[st.ex].note + (st.ex === 'q3' ? ' <button type="button" class="compact" id="red-to-dist">(3) 거리는 04에서 구하기 →</button>' : '') + '<br>' + ins;
      if (st.medium === 'air') ins = '<b>노을 비유</b>: 해가 두꺼운 대기를 지나면 파란빛이 산란되어 빠지고 붉은빛이 남습니다(관측자 1). 옆으로 산란된 파란빛 때문에 하늘은 파랗게 보입니다(관측자 2). 우주의 티끌도 같은 원리로 별빛을 붉게 하고(성간 적색화), 반사 성운을 푸르게 합니다.<br>' + ins;
      $('red-insight').innerHTML = ins;
      const go = $('red-to-dist');
      if (go) go.addEventListener('click', () => { stations.distance.load('q3'); show('distance'); window.scrollTo({top: 0}); });
      drawCurve();
      lambdaReadout();
      drawScene();
      startLoop();
    }
    return {render};
  })();

  // ═══════════════ 04 거리 보정 ═══════════════
  stations.distance = (() => {
    const EX = {
      q2: {m: 12, M: 2, mode: 'direct', A: 5, note: '수업 Q2: 겉보기 등급 12, 절대 등급 2인 별. (1) 소광을 무시한 거리 (2) 소광 등급이 5일 때 실제 거리 (3) 몇 배로 착각하는가?'},
      q3: {m: 12.1, M: 0.6, mode: 'excess', bvo: 0.5, bvi: 0, note: '수업 Q3: 10000 K 주계열성(고유 색지수 0), B 12.6 · V 12.1 → 관측 색지수 0.5, 절대 등급 M<sub>V</sub> 0.6, A<sub>V</sub> = 3E.'},
      q4: {m: 14, M: 1, mode: 'excess', bvo: 1.2, bvi: 0.2, note: '수업 Q4 ⓑ: 은하 원반 방향의 별. 관측 색지수 1.2, 고유 색지수 0.2, M<sub>V</sub> +1.0, V 14.0. 같은 거리에 있는 원반 밖의 별 ⓐ는 색초과 0.2 → V = 1.0 + 10 + 0.6 = 11.6 (ㄴ).'}
    };
    const st = {m: 12, M: 2, mode: 'direct', A: 5, bvo: 0.5, bvi: 0, ex: 'q2', cmdE: 0.5, fix1: false, fix2: false};
    const pic = $('d-picture'), fac = $('d-factor'), cmd = $('cmd-chart');
    const S = {m: $('d-m'), M: $('d-M'), A: $('d-A'), bvo: $('d-bvo'), bvi: $('d-bvi')};
    function load(id) {
      st.ex = id;
      const e = EX[id];
      if (e) Object.assign(st, {m: e.m, M: e.M, mode: e.mode}, e.mode === 'direct' ? {A: e.A} : {bvo: e.bvo, bvi: e.bvi});
    }
    document.querySelectorAll('#dist-examples [data-ex]').forEach(b => b.addEventListener('click', () => { load(b.dataset.ex); render(); }));
    Object.entries(S).forEach(([k, inp]) => inp.addEventListener('input', () => { st[k] = +inp.value; st.ex = 'free'; render(); }));
    document.querySelectorAll('#d-mode [data-amode]').forEach(b => b.addEventListener('click', () => { st.mode = b.dataset.amode; st.ex = 'free'; render(); }));
    document.querySelectorAll('#cmd-E [data-e]').forEach(b => b.addEventListener('click', () => { st.cmdE = +b.dataset.e; renderCMD(); }));
    $('cmd-fix1').addEventListener('click', () => { st.fix1 = !st.fix1; renderCMD(); });
    $('cmd-fix2').addEventListener('click', () => { st.fix2 = !st.fix2; renderCMD(); });

    const E = () => M.colorExcess(st.bvo, st.bvi);
    const A = () => st.mode === 'direct' ? st.A : Math.max(0, M.avFromE(E()));

    function drawPicture(d, a) {
      clear(pic);
      const tall = small();
      pic.setAttribute('viewBox', `0 0 640 ${tall ? 330 : 250}`);
      const rMax = d.rNaive * 1.1, x0 = 64, x1 = 612, X = r => x0 + (x1 - x0) * r / rMax;
      const rows = [{y: tall ? 92 : 74, name: '실제 거리 (소광을 보정함)', r: d.rTrue, real: true}, {y: tall ? 236 : 178, name: '소광을 무시하고 구한 거리', r: d.rNaive, real: false}];
      rows.forEach(row => {
        el('line', {x1: x0, x2: x1, y1: row.y, y2: row.y, stroke: '#c9cdd6', 'stroke-dasharray': '6 6'}, pic);
        el('path', {d: `M${x0 - 34} ${row.y} Q${x0 - 22} ${row.y - 9} ${x0 - 10} ${row.y} Q${x0 - 22} ${row.y + 9} ${x0 - 34} ${row.y} Z`, fill: '#fff', stroke: '#14283a', 'stroke-width': 1.8}, pic);
        el('circle', {cx: x0 - 22, cy: row.y, r: 3.6, fill: '#14283a'}, pic);
        el('text', {x: x0, y: row.y - (tall ? 30 : 22), class: 'annot', fill: row.real ? 'var(--cyan)' : 'var(--orange)'}, pic, row.name);
        const x = X(row.r);
        if (row.real) {
          // 별과 관측자 사이의 티끌
          const rr = M.rng(3), n = Math.round(Math.min(40, 6 + a * 6));
          for (let i = 0; i < n; i++) el('circle', {cx: x0 + 8 + rr() * Math.max(8, x - x0 - 22), cy: row.y + (rr() - 0.5) * 22, r: 1.6 + rr() * 1.6, fill: '#8a7462', opacity: 0.7}, pic);
          el('circle', {cx: x, cy: row.y, r: 13, fill: '#ffd27e', opacity: 0.45}, pic);
          el('circle', {cx: x, cy: row.y, r: 7, fill: '#f2a33a'}, pic);
        } else {
          el('circle', {cx: x, cy: row.y, r: 9, fill: 'none', stroke: '#a85a00', 'stroke-width': 2.4, 'stroke-dasharray': '4 3'}, pic);
        }
        el('path', {d: `M${x0} ${row.y + 18}v6H${x}v-6`, fill: 'none', stroke: '#14283a', 'stroke-width': 1.5}, pic);
        const tx = Math.min(Math.max((x0 + x) / 2, x0 + 40), x1 - 40);
        el('text', {x: tx, y: row.y + (tall ? 50 : 42), 'text-anchor': 'middle', class: 'annot', fill: '#14283a'}, pic, fmtR(row.r));
      });
    }
    function drawFactor(a) {
      clear(fac);
      const tall = small();
      fac.setAttribute('viewBox', `0 0 640 ${tall ? 300 : 230}`);
      const box = {l: tall ? 92 : 64, r: 612, t: 16, b: tall ? 220 : 172};
      const xs = lin(0, 6, box.l, box.r), ys = lin(0, 16, box.b, box.t);
      frame(fac, box, xs, ys, {xTicks: [0, 1, 2, 3, 4, 5, 6].map(v => ({v, label: String(v)})), yTicks: [0, 5, 10, 15].map(v => ({v, label: v + '배'})), xLabel: '소광 등급 A', yLabel: tall ? '착각 배율' : '거리 착각 (배)'});
      const pts = [];
      for (let i = 0; i <= 120; i++) { const x = 6 * i / 120; pts.push([xs(x), ys(M.overestimate(x))]); }
      el('path', {d: pathOf(pts), fill: 'none', stroke: 'var(--orange)', 'stroke-width': 3}, fac);
      el('circle', {cx: xs(5), cy: ys(10), r: 5, fill: '#fff', stroke: '#14283a', 'stroke-width': 2}, fac);
      if (Math.abs(a - 5) > 0.8) el('text', {x: xs(5) - 10, y: ys(10) - 10, 'text-anchor': 'end', class: 'tick halo'}, fac, '5등급 → 10배');
      const f = M.overestimate(a);
      el('path', {d: `M${xs(a)} ${box.b}V${ys(f)}H${box.l}`, stroke: '#0b7f9a', 'stroke-dasharray': '5 4', 'stroke-width': 1.6, fill: 'none'}, fac);
      el('circle', {cx: xs(a), cy: ys(f), r: 7, fill: '#0b7f9a', stroke: '#fff', 'stroke-width': 2}, fac);
      el('text', {x: xs(a) + (a > 4.6 ? -12 : 12), y: ys(f) + (a > 4.6 ? 22 : -10), 'text-anchor': a > 4.6 ? 'end' : 'start', class: 'annot halo', fill: '#0b7f9a'}, fac, `A = ${num(a, 1)} → ${num(f, f < 10 ? 2 : 1)}배`);
    }
    function steps(d, a) {
      const e = E();
      const mode = st.mode;
      const lr = (d.mu0 + 5) / 5, lrN = (d.muObs + 5) / 5;
      const A2 = mode === 'direct'
        ? `<div class="v">${num(a, 2)}</div><div class="w">소광 등급 = 성간 소광에 의한 겉보기 등급의 증가량<br>${V('m')} = ${V('m')}<sub>0</sub> + ${V('A')} (${V('m')}<sub>0</sub>: 티끌이 없을 때의 겉보기 등급)</div>`
        : `<div class="v">${num(a, 2)}</div><div class="w">${V('E')} = ${num(st.bvo, 2)} − ${num(st.bvi, 2)} = ${num(e, 2)}<br>${sub('A', 'V')} = 3${V('E')} = ${num(a, 2)}${e < 0 ? '<br><b>관측 색지수가 고유 색지수보다 작을 수는 없습니다.</b>' : ''}</div>`;
      $('d-steps').innerHTML = `
        <div class="s"><div class="k">① 관측한 거리 지수 ${V('m')} − ${V('M')}</div><div class="v">${num(d.muObs, 2)}</div><div class="w">${num(st.m, 1)} − (${num(st.M, 1)}) = ${num(d.muObs, 2)}<br>별빛이 오는 길이 투명하다면 이것으로 끝</div></div>
        <div class="s"><div class="k">② 소광 등급 ${V('A')}</div>${A2}</div>
        <div class="s"><div class="k">③ 보정한 거리 지수 ${V('m')} − ${V('A')} − ${V('M')}</div><div class="v">${num(d.mu0, 2)}</div><div class="w">${num(st.m, 1)} − ${num(a, 2)} − (${num(st.M, 1)}) = ${num(d.mu0, 2)}<br>= ${V('m')}<sub>0</sub> − ${V('M')}</div></div>
        <div class="s final"><div class="k">④ 실제 거리 ${V('r')}</div><div class="v">${fmtR(d.rTrue)}</div><div class="w">${V('m')} − ${V('A')} − ${V('M')} = 5 log ${V('r')} − 5<br>log ${V('r')} = ${frac(`${num(d.mu0, 2)} + 5`, '5')} = ${num(lr, 2)}<br>${V('r')} = 10<sup>${num(lr, 2)}</sup> pc</div></div>
        <div class="s wrong"><div class="k">소광을 무시했다면 ${V('r')}′</div><div class="v">${fmtR(d.rNaive)}</div><div class="w">log ${V('r')}′ = ${frac(`${num(d.muObs, 2)} + 5`, '5')} = ${num(lrN, 2)}<br>5 log ${frac(`${V('r')}′`, V('r'))} = ${V('A')} → ${frac(`${V('r')}′`, V('r'))} = 10<sup>${num(a / 5, 2)}</sup> ≈ <b class="nowrap">${num(d.factor, d.factor < 10 ? 2 : 1)}배</b></div></div>`;
    }

    function renderCMD() {
      setPressed($('cmd-E'), 'data-e', String(st.cmdE));
      $('cmd-fix1').setAttribute('aria-pressed', String(st.fix1));
      $('cmd-fix2').setAttribute('aria-pressed', String(st.fix2));
      clear(cmd);
      const tall = small();
      cmd.setAttribute('viewBox', `0 0 640 ${tall ? 470 : 380}`);
      const box = {l: tall ? 86 : 60, r: 620, t: 14, b: tall ? 380 : 318};
      const xs = lin(-0.4, 3.4, box.l, box.r), ys = lin(1, 22, box.t, box.b);
      frame(cmd, box, xs, ys, {xTicks: [0, 1, 2, 3].map(v => ({v, label: String(v)})), yTicks: [2, 6, 10, 14, 18, 22].map(v => ({v, label: String(v)})), xLabel: '색지수 (B − V)', yLabel: '겉보기 등급 (V)'});
      const E0 = st.cmdE, base = DATA.m45;
      const dot = (pts, attrs) => { const g = el('g', attrs, cmd); pts.forEach(([b, m]) => { if (m <= 22) el('circle', {cx: xs(b).toFixed(1), cy: ys(m).toFixed(1), r: tall ? 3.6 : 2.5}, g); }); };
      dot(base, {fill: '#3d6fe0', opacity: 0.85});
      const legend = [['#3d6fe0', '플레이아데스(M45) 관측 자료']];
      if (E0 > 0) {
        const red = M.shiftCMD(base, E0), col = E0 >= 1 ? '#d4a015' : '#d7263d';
        dot(red, {fill: col, opacity: st.fix1 || st.fix2 ? 0.28 : 0.85});
        legend.push([col, `색초과 ${num(E0, 1)}일 때 (${E0 >= 1 ? '황색' : '적색'}, 교과서 124쪽)`]);
        if (st.fix1 || st.fix2) {
          const fixed = red.map(([b, m]) => [b - (st.fix1 ? E0 : 0), m - (st.fix2 ? M.avFromE(E0) : 0)]);
          const g = el('g', {fill: 'none', stroke: '#7a3fc2', 'stroke-width': 1.3}, cmd);
          fixed.forEach(([b, m]) => { if (m <= 22) el('circle', {cx: xs(b).toFixed(1), cy: ys(m).toFixed(1), r: tall ? 3.6 : 2.6}, g); });
          legend.push(['#7a3fc2', '보정한 C-M도']);
        }
        // 화살표 하나로 옮겨진 양 보이기
        const ex = [0.62, 9.9], ex2 = [ex[0] + E0, ex[1] + M.avFromE(E0)];
        el('path', {d: `M${xs(ex[0])} ${ys(ex[1])}H${xs(ex2[0]) - 6}`, stroke: '#14283a', 'stroke-width': 2.2, fill: 'none'}, cmd);
        el('path', {d: `M${xs(ex2[0])} ${ys(ex[1]) + 4}V${ys(ex2[1]) - 8}M${xs(ex2[0]) - 5} ${ys(ex2[1]) - 14}L${xs(ex2[0])} ${ys(ex2[1]) - 7}L${xs(ex2[0]) + 5} ${ys(ex2[1]) - 14}`, stroke: '#14283a', 'stroke-width': 2.2, fill: 'none'}, cmd);
        el('text', {x: (xs(ex[0]) + xs(ex2[0])) / 2, y: ys(ex[1]) - 8, 'text-anchor': 'middle', class: 'annot halo'}, cmd, `+E = ${num(E0, 1)}`);
        el('text', {x: xs(ex2[0]) + 8, y: (ys(ex[1]) + ys(ex2[1])) / 2 + 5, class: 'annot halo'}, cmd, `+3E = ${num(M.avFromE(E0), 1)}`);
      }
      const lg = el('g', {}, cmd), fs = tall ? 19 : 12;
      legend.forEach(([c, t], i) => {
        const y = box.t + 16 + i * (fs + 8);
        el('circle', {cx: box.r - 8, cy: y - fs * 0.35, r: 5, fill: c}, lg);
        el('text', {x: box.r - 20, y, 'text-anchor': 'end', 'font-size': fs, 'font-weight': 700, fill: c, class: 'halo'}, lg, t);
      });
      const gap = M.avFromE(E0), fx = M.overestimate(gap);
      let txt;
      if (E0 === 0) txt = '티끌이 없으면 C-M도는 그대로입니다. 색초과를 골라 보세요.';
      else if (!st.fix1 && !st.fix2) txt = `색초과가 ${num(E0, 1)}이면 성단의 모든 별이 <b>오른쪽으로 ${num(E0, 1)}</b>(색지수 증가), <b>아래로 ${num(gap, 1)}</b>(= 3E, 겉보기 등급 증가) 옮겨집니다. 한 성단의 별은 거리가 같으므로 B형 주계열성이든 M형 주계열성이든 <b>같은 양만큼</b> 옮겨집니다(교과서 124쪽 10번 ⑴⑵).`;
      else if (st.fix1 && !st.fix2) txt = `색지수는 제자리로 왔지만 아직 <b>${num(gap, 1)}등급 어둡습니다</b>. 이대로 주계열 맞추기를 하면 거리 지수가 ${num(gap, 1)} 커져 거리를 10<sup>${num(gap / 5, 2)}</sup> ≈ <b>${num(fx, 1)}배 멀게</b> 구합니다. ② 소광 보정도 눌러 보세요.`;
      else if (!st.fix1 && st.fix2) txt = `등급만 올리고 색지수를 보정하지 않으면 별들이 여전히 <b>붉은 쪽(오른쪽)</b>에 있습니다. 전향점도 붉게 보여 성단의 나이를 실제보다 많게 추정하게 됩니다(교과서 124쪽 10번 ⑶).`;
      else txt = '색초과와 소광 등급을 모두 보정하면 원래 C-M도와 겹칩니다. 보정하지 않으면 성단의 <b>거리와 나이를 실제보다 크게</b> 추정합니다(교과서 124쪽 10번 ⑶, 2026학년도 수능 지Ⅱ 9번 ㄷ: 보정 후 거리 &lt; 보정 전 거리).';
      $('cmd-insight').innerHTML = txt + ' <span class="micro">자료: 플레이아데스 성단 406개 별(Stauffer 외 2007). 이 성단은 가까워 티끌의 영향이 아주 작습니다.</span>';
    }

    function story() {
      const m3 = M.EXAMPLES.m3, need = M.extinctionForRatio(m3.fitted / m3.actual), eNeed = M.eFromAv(need);
      const realA = M.avFromE(m3.E), realF = M.overestimate(realA);
      $('m3-story').innerHTML = `
        <p>06 성단과 C-M도 해 보기에서 주계열 맞추기로 구한 M3의 거리는 <b>${m3.fitted} pc</b>, 실제 거리는 <b>${m3.actual} pc</b>였습니다. 오차의 까닭 가운데 하나로 '별빛을 가리는 것'을 짐작했지요.</p>
        <div class="num-row"><div><span>이 차이를 모두 티끌로 설명하려면 필요한 소광 등급</span><strong>약 ${num(need, 1)}등급</strong></div><div><span>필요한 색초과 (${sub('A', 'V')} = 3${V('E')})</span><strong>약 ${num(eNeed, 2)}</strong></div></div>
        <p class="micro">5 log ${frac(m3.fitted, m3.actual)} = ${num(need, 2)}</p>
        <div class="verdict">그런데 M3는 은하 원반에서 멀리 벗어난 방향(헤일로)에 있어 실제 색초과는 <b>약 ${num(m3.E, 2)}</b>뿐입니다. 소광 등급 약 ${num(realA, 2)} → 거리 차이 약 ${num((realF - 1) * 100, 1)} %. 티끌로는 오차를 거의 설명할 수 없습니다. 큰 오차는 주로 종족 Ⅰ 별로 만든 표준 주계열을 종족 Ⅱ인 구상 성단에 쓴 탓입니다.</div>
        <p>반대로 은하 <b>원반 방향</b>은 티끌이 많아 색초과가 큽니다. 이때 소광을 보정하지 않으면 거리가 크게 틀립니다. 수업 Q4의 별 ⓑ는 색초과 1.0 → 소광 등급 3.0 → 거리를 약 ${num(M.overestimate(3), 1)}배로 착각합니다.</p>
        <p class="history">1930년 트럼플러는 산개 성단 100개를 조사하다가, 밝기로 구한 거리를 쓰면 먼 성단일수록 지름이 크게 계산되는 것을 발견했습니다. 먼 성단이 정말 큰 것이 아니라, 별 사이 공간이 투명하지 않아(성간 소광) 거리가 너무 멀게 계산된 것이었습니다. 원반 방향은 티끌이 많아 가시광선으로는 멀리 보기 어렵습니다 — 은하 중심 쪽은 약 30등급(1조분의 1)이나 어두워져, 적외선과 전파로 관측합니다.</p>`;
    }

    function render() {
      setPressed($('dist-examples'), 'data-ex', st.ex);
      setPressed($('d-mode'), 'data-amode', st.mode);
      $('d-direct').hidden = st.mode !== 'direct';
      $('d-excess').hidden = st.mode === 'direct';
      S.m.value = st.m; S.M.value = st.M; S.A.value = st.A; S.bvo.value = st.bvo; S.bvi.value = st.bvi;
      $('d-m-out').textContent = num(st.m, 1);
      $('d-M-out').textContent = num(st.M, 1);
      $('d-A-out').textContent = `${num(st.A, 1)}등급`;
      $('d-bvo-out').textContent = num(st.bvo, 2);
      $('d-bvi-out').textContent = num(st.bvi, 2);
      $('d-example-note').innerHTML = EX[st.ex] ? EX[st.ex].note : '슬라이더를 움직여 보세요. 소광 등급이 0이면 두 거리가 같습니다.';
      const a = A(), d = M.distances(st.m, st.M, a);
      drawPicture(d, a);
      drawFactor(a);
      steps(d, a);
      $('d-insight').innerHTML = a < 0.05
        ? '소광 등급이 0이면 보정한 거리와 보정하지 않은 거리가 같습니다.'
        : `소광 등급 ${num(a, 1)} → 별빛이 ${M.brightnessRatio(a) >= 0.1 ? Math.round(M.brightnessRatio(a) * 100) + ' %' : Math.round(1 / M.brightnessRatio(a)) + '분의 1'}로 어두워져 → 거리를 <b>${num(d.factor, d.factor < 10 ? 2 : 1)}배</b>로 착각합니다. 소광을 보정한 거리(${fmtR(d.rTrue)})는 보정하지 않은 거리(${fmtR(d.rNaive)})보다 <b>가깝습니다</b>.`;
      renderCMD();
      story();
    }
    return {render, load};
  })();

  show(parseHash(location.hash) || 'nebula');
  let resizeTimer;
  window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => stations[current].render(), 150); });
  window.addEventListener('hashchange', () => { const h = parseHash(location.hash); if (h && h !== current) show(h); });
})();
