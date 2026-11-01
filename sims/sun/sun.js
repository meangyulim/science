/* 태양 관측소 — 네 관측이 같은 모형(sun-model.js)과 실제 자료(sun-data.js)를 쓴다. */
(() => {
  'use strict';
  const M = window.SunModel, DATA = window.SunData, $ = id => document.getElementById(id);
  const NS = 'http://www.w3.org/2000/svg', D2R = Math.PI / 180, R2D = 180 / Math.PI;
  const REDUCED = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const clamp = M.clamp;

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
  const small = () => window.innerWidth < 640;
  const pathOf = pts => pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('');
  function svgPoint(svg, evt) {
    const pt = svg.createSVGPoint();
    pt.x = evt.clientX; pt.y = evt.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  }
  // 누르고 끄는 동작. 세로 스크롤은 브라우저에 맡긴다(touch-action: pan-y).
  function onDrag(svg, handler) {
    let active = false;
    svg.addEventListener('pointerdown', e => {
      if (e.button !== undefined && e.button > 0) return;
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
  function toggleButton(btn, fn) {
    btn.addEventListener('click', () => {
      const v = btn.getAttribute('aria-pressed') !== 'true';
      btn.setAttribute('aria-pressed', String(v));
      fn(v);
    });
  }
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
    if (o.yLabel) el('text', {x: 16, y: (box.t + box.b) / 2, transform: `rotate(-90 16 ${(box.t + box.b) / 2})`, 'text-anchor': 'middle', class: 'axis-label'}, g, o.yLabel);
    return g;
  }
  const frac = (a, b) => `<span class="frac"><span>${a}</span><span>${b}</span></span>`;
  // 색 띠: stops = [[t, [r,g,b]], …]
  function ramp(stops) {
    return t => {
      t = clamp(t, 0, 1);
      for (let i = 1; i < stops.length; i++) {
        if (t <= stops[i][0]) {
          const [t0, c0] = stops[i - 1], [t1, c1] = stops[i], f = (t - t0) / (t1 - t0);
          return [c0[0] + (c1[0] - c0[0]) * f, c0[1] + (c1[1] - c0[1]) * f, c0[2] + (c1[2] - c0[2]) * f];
        }
      }
      return stops[stops.length - 1][1];
    };
  }
  const rgbStr = c => `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`;
  function lut32(f) {
    const out = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      const c = f(i / 255);
      out[i] = (255 << 24 | Math.round(c[2]) << 16 | Math.round(c[1]) << 8 | Math.round(c[0])) >>> 0;
    }
    return out;
  }
  // 광구 밝기(가운데 = 1)의 색, 그리고 온도의 색(차가움 파랑 → 뜨거움 빨강)
  const SUN_RAMP = ramp([[0, [8, 3, 0]], [0.1, [62, 22, 4]], [0.25, [128, 50, 10]], [0.45, [204, 98, 24]], [0.7, [240, 158, 58]], [0.88, [252, 200, 104]], [1, [255, 226, 150]]]);
  // 온도의 색: 낮을수록 어두운 보라, 높을수록 밝은 노랑·흰색 (별의 색처럼 뜨거울수록 희게)
  const TEMP_RAMP = ramp([[0, [20, 8, 52]], [0.18, [78, 18, 110]], [0.36, [150, 38, 104]], [0.54, [212, 72, 66]], [0.72, [245, 128, 24]], [0.88, [250, 196, 44]], [1, [252, 252, 190]]]);
  const T_LO = 3800, T_HI = 6000;
  const tempColor = T => rgbStr(TEMP_RAMP((T - T_LO) / (T_HI - T_LO)));
  const tempGradientCSS = (a, b) => `linear-gradient(90deg,${Array.from({length: 11}, (_, i) => rgbStr(TEMP_RAMP(a + (b - a) * i / 10)) + ` ${i * 10}%`).join(',')})`;
  const sunColor = b => rgbStr(SUN_RAMP(b));
  // 같은 밝기를 내는 온도(그림의 색을 정하려고 역으로 푼다)
  function tempForBrightness(I) {
    if (I <= 0) return T_LO;
    let lo = 2000, hi = 8000;
    for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (M.relBrightness(m) < I) lo = m; else hi = m; }
    return (lo + hi) / 2;
  }
  const UMBRA_I = M.relBrightness(M.BOOK.umbraT), PENUMBRA_I = M.relBrightness(M.BOOK.penumbraT);
  // 원반(중심 cx,cy, 반지름 R px) 위 흑점의 겉모습: 가장자리로 갈수록 지름 방향으로 납작해진다.
  function spotGeom(cx, cy, R, lat, lon, radDeg) {
    const p = M.project(lat, lon);
    const a = Math.sin(radDeg * D2R) * R;
    return {x: cx + p.x * R, y: cy - p.y * R, a, b: a * Math.max(p.z, 0.04), ang: Math.atan2(-p.y, p.x) * R2D, z: p.z, r: Math.hypot(p.x, p.y)};
  }
  function drawSpotEllipse(parent, g, scale, fill, extra) {
    return el('ellipse', Object.assign({cx: g.x.toFixed(2), cy: g.y.toFixed(2), rx: (g.b * scale).toFixed(2), ry: (g.a * scale).toFixed(2),
      transform: `rotate(${g.ang.toFixed(2)} ${g.x.toFixed(2)} ${g.y.toFixed(2)})`, fill}, extra || {}), parent);
  }
  // 주연 감광 그라디언트(반지름 방향 색 정지점)
  const LD_STOPS = [0, 0.2, 0.4, 0.55, 0.68, 0.78, 0.86, 0.91, 0.95, 0.975, 0.99, 1];
  function limbGradient(defs, id, colorAt) {
    let g = defs.querySelector('#' + id);
    if (g) clear(g); else g = el('radialGradient', {id, cx: '50%', cy: '50%', r: '50%'}, defs);
    LD_STOPS.forEach(r => el('stop', {offset: (r * 100).toFixed(1) + '%', 'stop-color': colorAt(r)}, g));
    return g;
  }
  // 그림 위 글씨 크기를 화면에서 일정하게(px) 보이도록 viewBox 단위로 바꾼다
  function unitsFor(svg, viewW, px) {
    const w = svg.getBoundingClientRect().width || viewW;
    return px * viewW / w;
  }
  // viewBox 너비 640인 그림의 글씨 크기: 화면에서 약 px 픽셀로 보이도록(너무 작거나 크지 않게)
  const fsFor = (svg, px = 12.5, lo = 12, hi = 24) => clamp(unitsFor(svg, 640, px), lo, hi);
  const monthName = y => { const yy = Math.floor(y), m = Math.min(12, Math.floor((y - yy) * 12) + 1); return `${yy}년 ${m}월`; };

  // ── 애니메이션: 보이는 관측의 tick 만, 화면이 숨으면 멈춘다 ───────────────
  let rafId = 0;
  function loop(now) {
    rafId = 0;
    const st = stations[current];
    if (document.hidden || !st || !st.animating || !st.animating()) return;
    st.tick(now);
    rafId = requestAnimationFrame(loop);
  }
  function kick() { if (!rafId && !document.hidden) rafId = requestAnimationFrame(loop); }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) kick(); });

  // ── 관측 전환 (#s1 ~ #s4) ────────────────────────────────────
  const stations = {};
  let current = 's1';
  const ALIAS = {photosphere: 's1', rotation: 's2', wavelength: 's3', wavelengths: 's3', cycle: 's4', 1: 's1', 2: 's2', 3: 's3', 4: 's4'};
  function show(name) {
    name = ALIAS[name] || name;
    if (!stations[name]) name = 's1';
    current = name;
    setPressed(document.querySelector('.stations'), 'data-station', name);
    document.querySelectorAll('.station').forEach(s => { s.hidden = s.id !== 'station-' + name; });
    stations[name].render();
    try { history.replaceState(null, '', '#' + name); } catch (_) {}
    kick();
  }
  document.querySelectorAll('.stations button').forEach(b => b.addEventListener('click', () => {
    show(b.dataset.station);
    document.querySelector('.stations').scrollIntoView({block: 'nearest'});
  }));

  // ═══════════════ 01 광구 들여다보기 ═══════════════
  stations.s1 = (() => {
    const st = {paint: 'light', limb: true, alone: false, scan: 0.26, playing: !REDUCED, arrows: true, gtemp: false, B: 0.95, lines: true};
    // 원반 위 흑점: 위도·경도(°)와 암부·반암부의 반지름(°)
    const SPOTS = [
      {lat: 15, lon: -22, u: 1.5, p: 3.3}, {lat: 13.2, lon: -13, u: 0.7, p: 1.7},
      {lat: -11, lon: 24, u: 1.1, p: 2.5}, {lat: -13.5, lon: 31, u: 0.6, p: 1.4}, {lat: 21, lon: 54, u: 0.8, p: 1.9}
    ];
    const disk = $('s1-disk'), prof = $('s1-profile');
    const CX = 195, CY = 200, R = 180, IC = {x: 522, y: 132, r: 92};
    const paintOf = (I, T) => st.paint === 'temp' ? tempColor(T) : sunColor(I);

    document.querySelectorAll('#s1-paint [data-paint]').forEach(b => b.addEventListener('click', () => { st.paint = b.dataset.paint; renderDisk(); }));
    toggleButton($('s1-limb'), v => { st.limb = v; renderDisk(); });
    toggleButton($('s1-alone'), v => { st.alone = v; renderDisk(); });
    $('s1-scan').addEventListener('input', e => { st.scan = +e.target.value; renderDisk(); });
    onDrag(disk, (p, phase) => {
      if (!p) return;
      const dy = (CY - p.y) / R;
      if (Math.abs(p.x - CX) <= R && Math.abs(dy) <= 0.97) { st.scan = Math.round(dy * 100) / 100; $('s1-scan').value = st.scan; renderDisk(); }
    });

    // 흑점 확대 그림의 바탕(쌀알 무늬 비슷한 작은 세포) — 한 번만 만든다
    const insetCells = (() => {
      const r = M.rng(21), out = [];
      for (let i = 0; i < 260; i++) {
        const a = r() * Math.PI * 2, d = Math.sqrt(r()) * IC.r * 1.05;
        out.push({x: IC.x + Math.cos(a) * d, y: IC.y + Math.sin(a) * d, r: 4 + r() * 4.5, k: r()});
      }
      return out;
    })();
    const blob = (cx, cy, rad, seed, n = 48) => {
      const r = M.rng(seed), ph = [r() * 6, r() * 6, r() * 6], amp = [0.08, 0.06, 0.04], pts = [];
      for (let i = 0; i < n; i++) {
        const a = i / n * Math.PI * 2;
        const k = 1 + amp[0] * Math.sin(2 * a + ph[0]) + amp[1] * Math.sin(3 * a + ph[1]) + amp[2] * Math.sin(5 * a + ph[2]);
        pts.push([cx + Math.cos(a) * rad * k, cy + Math.sin(a) * rad * k]);
      }
      return pathOf(pts) + 'Z';
    };

    // 줄(위도 y = scan)을 따라 잰 밝기
    function spotFactorAt(x, y) {
      const u = M.unproject(x, y);
      if (!u) return null;
      for (const s of SPOTS) {
        const d = M.angDist(u.lat, u.lon, s.lat, s.lon);
        if (d < s.u) return UMBRA_I;
        if (d < s.p) return PENUMBRA_I;
      }
      return 1;
    }
    function brightnessAt(x, y, limbOn) {
      const r = Math.hypot(x, y);
      if (r >= 1) return null;
      const f = spotFactorAt(x, y), base = limbOn ? M.limbDarkening(r) : 1;
      if (st.alone) return f < 1 ? base * f : 0;
      return base * f;
    }

    function renderDisk() {
      setPressed($('s1-paint'), 'data-paint', st.paint);
      clear(disk);
      const tall = small();
      disk.setAttribute('viewBox', `0 0 640 ${tall ? 470 : 400}`);
      const defs = el('defs', {}, disk);
      // 광구: 주연 감광이 켜져 있으면 가장자리로 갈수록 어둡고(덜 뜨거운 층이 보이고), 꺼져 있으면 고르게
      const I = r => st.limb ? M.limbDarkening(Math.min(r, 0.9999)) : 1;
      limbGradient(defs, 's1-ld', r => paintOf(I(r), tempForBrightness(I(r))));
      el('clipPath', {id: 's1-diskclip'}, defs).appendChild(el('circle', {cx: CX, cy: CY, r: R}));
      if (st.alone) {
        el('circle', {cx: CX, cy: CY, r: R, fill: '#000', stroke: '#8fa3b5', 'stroke-dasharray': '5 6', 'stroke-width': 1.5}, disk);
        el('text', {x: CX, y: CY + R - 26, 'text-anchor': 'middle', class: 'lab', fill: '#8fa3b5'}, disk, '광구를 가림');
      } else {
        el('circle', {cx: CX, cy: CY, r: R, fill: 'url(#s1-ld)'}, disk);
      }
      // 흑점
      const sg = el('g', {'clip-path': 'url(#s1-diskclip)'}, disk);
      SPOTS.forEach(s => {
        const gp = spotGeom(CX, CY, R, s.lat, s.lon, s.p), gu = spotGeom(CX, CY, R, s.lat, s.lon, s.u);
        const base = st.limb ? M.limbDarkening(gp.r) : 1;
        drawSpotEllipse(sg, gp, 1, paintOf(base * PENUMBRA_I, M.BOOK.penumbraT));
        drawSpotEllipse(sg, gu, 1, paintOf(base * UMBRA_I, M.BOOK.umbraT));
      });
      // 밝기를 잴 줄
      const sy = CY - st.scan * R, half = Math.sqrt(Math.max(0, 1 - st.scan * st.scan)) * R;
      el('line', {x1: CX - half - 10, x2: CX + half + 10, y1: sy, y2: sy, stroke: '#7fe0f2', 'stroke-width': 2, 'stroke-dasharray': '7 5'}, disk);
      [CX - half - 10, CX + half + 10].forEach(x => el('circle', {cx: x, cy: sy, r: 5, fill: '#7fe0f2'}, disk));
      el('text', {x: CX - R + 4, y: Math.max(22, sy - 10), class: 'annot dark-halo', fill: '#7fe0f2'}, disk, '밝기를 잴 줄');
      // 흑점 확대
      drawInset(defs, tall);
      $('s1-scan-out').textContent = st.scan === 0 ? '원반 가운데' : `${st.scan > 0 ? '북' : '남'}쪽 ${num(Math.abs(st.scan), 2)} R`;
      const tl = $('s1-tlegend');
      tl.hidden = st.paint !== 'temp';
      if (st.paint === 'temp') {
        const at = T => ((T - T_LO) / (T_HI - T_LO) * 100).toFixed(1);
        tl.innerHTML = `온도로 색칠: 어두울수록 온도가 낮고, 밝고 흴수록 높습니다.<div class="bar" style="background:${tempGradientCSS(0, 1)}"></div>
          <div class="ticks"><span class="first" style="left:${at(4000)}%">암부 약 4000 K</span><span style="left:${at(5000)}%">반암부 약 5000 K</span><span class="last" style="left:${at(5800)}%">광구 약 5800 K</span></div>`;
      }
      renderProfile();
      insight();
    }

    function drawInset(defs, tall) {
      el('clipPath', {id: 's1-insetclip'}, defs).appendChild(el('circle', {cx: IC.x, cy: IC.y, r: IC.r}));
      const big = SPOTS[0];
      // 원반의 흑점에서 확대 원으로 이어지는 선
      const g0 = spotGeom(CX, CY, R, big.lat, big.lon, big.p);
      el('path', {d: `M${g0.x + g0.b + 2} ${g0.y - 4}L${IC.x - IC.r * 0.82} ${IC.y - IC.r * 0.55}M${g0.x + 2} ${g0.y + g0.a * 0.9}L${IC.x - IC.r * 0.7} ${IC.y + IC.r * 0.7}`,
        stroke: '#ffe08a', 'stroke-width': 1.2, opacity: 0.6, fill: 'none'}, disk);
      el('circle', {cx: g0.x, cy: g0.y, r: g0.a + 5, fill: 'none', stroke: '#ffe08a', 'stroke-width': 1.5}, disk);
      const g = el('g', {'clip-path': 'url(#s1-insetclip)'}, disk);
      const photo = paintOf(1, M.BOOK.photosphereT);
      el('rect', {x: IC.x - IC.r, y: IC.y - IC.r, width: IC.r * 2, height: IC.r * 2, fill: st.alone ? '#000' : photo}, g);
      if (!st.alone) {
        const lane = st.paint === 'temp' ? tempColor(5450) : sunColor(0.8);
        const cell = st.paint === 'temp' ? tempColor(5950) : sunColor(1);
        el('rect', {x: IC.x - IC.r, y: IC.y - IC.r, width: IC.r * 2, height: IC.r * 2, fill: lane}, g);
        insetCells.forEach(c => el('circle', {cx: c.x.toFixed(1), cy: c.y.toFixed(1), r: c.r.toFixed(1), fill: cell, opacity: (0.75 + 0.25 * c.k).toFixed(2)}, g));
      }
      const ux = IC.x - 6, uy = IC.y + 4;
      el('path', {d: blob(ux, uy, 56, 3), fill: paintOf(PENUMBRA_I, M.BOOK.penumbraT)}, g);
      // 반암부의 가는 줄무늬
      const fil = el('g', {stroke: st.paint === 'temp' ? tempColor(5250) : sunColor(PENUMBRA_I * 1.35), 'stroke-width': 2.2, opacity: 0.75}, g);
      const rr = M.rng(9);
      for (let i = 0; i < 64; i++) {
        const a = i / 64 * Math.PI * 2 + rr() * 0.05, r1 = 26 + rr() * 4, r2 = 44 + rr() * 12;
        el('line', {x1: (ux + Math.cos(a) * r1).toFixed(1), y1: (uy + Math.sin(a) * r1).toFixed(1), x2: (ux + Math.cos(a) * r2).toFixed(1), y2: (uy + Math.sin(a) * r2).toFixed(1)}, fil);
      }
      el('path', {d: blob(ux + 2, uy - 1, 25, 5), fill: paintOf(UMBRA_I, M.BOOK.umbraT)}, g);
      el('circle', {cx: IC.x, cy: IC.y, r: IC.r, fill: 'none', stroke: '#ffe08a', 'stroke-width': 2}, disk);
      el('text', {x: IC.x, y: IC.y - IC.r - 10, 'text-anchor': 'middle', class: 'annot', fill: '#ffe08a'}, disk, '흑점 확대');
      // 이름표
      const labs = [
        {t: '암부', T: '약 4000 K', px: ux + 4, py: uy - 4},
        {t: '반암부', T: '약 5000 K', px: ux + 40, py: uy + 22},
        {t: '광구', T: '약 5800 K', px: IC.x + IC.r * 0.72, py: IC.y + IC.r * 0.45}
      ];
      const fs = fsFor(disk, 12.5);
      labs.forEach((l, i) => {
        const lx = tall ? IC.x - IC.r + 6 : IC.x - IC.r + 4 + i * 66, ly = tall ? IC.y + IC.r + 36 + i * 40 : IC.y + IC.r + 34;
        el('path', {d: `M${l.px} ${l.py}L${lx + 8} ${ly - fs}`, stroke: '#dfe9f1', 'stroke-width': 1, opacity: 0.7, fill: 'none'}, disk);
        el('circle', {cx: l.px, cy: l.py, r: 2.5, fill: '#fff'}, disk);
        el('text', {x: lx, y: ly, 'font-size': fs, 'font-weight': 800, fill: '#fff'}, disk, l.t);
        el('text', {x: tall ? lx + 70 : lx, y: tall ? ly : ly + fs + 4, 'font-size': fs * 0.92, fill: '#c9d6e2'}, disk, l.T);
      });
      // 크기 비교: 확대 원 지름 = 5만 km
      const kmPx = IC.r * 2 / 50000, sx = IC.x - IC.r + 4, sy = tall ? IC.y + IC.r + 226 : IC.y + IC.r + 116;
      el('line', {x1: sx, x2: sx + 10000 * kmPx, y1: sy, y2: sy, stroke: '#fff', 'stroke-width': 3}, disk);
      el('text', {x: sx, y: sy - 8, 'font-size': fs * 0.9, fill: '#dfe9f1'}, disk, '1만 km');
      const er = 12742 / 2 * kmPx, ex = sx + 10000 * kmPx + 34 + er;
      el('circle', {cx: ex, cy: sy - er + 4, r: er, fill: '#3d7fd6', stroke: '#bfe1ff', 'stroke-width': 1}, disk);
      el('text', {x: ex + er + 6, y: sy - 2, 'font-size': fs * 0.9, fill: '#dfe9f1'}, disk, '지구 크기');
    }

    function renderProfile() {
      clear(prof);
      const tall = small();
      prof.setAttribute('viewBox', `0 0 640 ${tall ? 330 : 240}`);
      const box = {l: tall ? 100 : 64, r: 622, t: 14, b: tall ? 250 : 178};
      const xs = lin(-1, 1, box.l, box.r), ys = lin(0, 1.1, box.b, box.t);
      frame(prof, box, xs, ys, {
        xTicks: [-1, -0.5, 0, 0.5, 1].map(v => ({v, label: num(v, 1)})),
        yTicks: [0, 0.25, 0.5, 0.75, 1].map(v => ({v, label: num(v, 2)})),
        xLabel: tall ? '가운데로부터의 거리 (R = 1)' : '원반 가운데로부터의 거리 (태양 반지름 = 1)',
        yLabel: tall ? '밝기' : '밝기 (가운데 = 1)'
      });
      const s = st.scan, half = Math.sqrt(Math.max(0, 1 - s * s));
      const line = on => {
        const pts = [];
        for (let i = 0; i <= 360; i++) {
          const x = -half + 2 * half * i / 360, b = brightnessAt(x, s, on);
          if (b !== null) pts.push([xs(x), ys(b)]);
        }
        return pts;
      };
      $('s1-plegend').innerHTML = st.alone ? '<span><i style="border-top-color:#e07b1f"></i>광구를 가렸을 때 줄을 따라 잰 밝기</span>'
        : `<span><i style="border-top-color:#e07b1f"></i>${st.limb ? '줄을 따라 잰 밝기' : '주연 감광을 끈 밝기'}</span><span><i style="border-top-color:#5f7282;border-top-style:dashed"></i>${st.limb ? '주연 감광이 없다면' : '실제 태양(주연 감광 있음)'}</span>`;
      // 비교선: 주연 감광을 바꾼 경우
      if (!st.alone) el('path', {d: pathOf(line(!st.limb)), fill: 'none', stroke: '#5f7282', 'stroke-width': 1.8, 'stroke-dasharray': '6 5'}, prof);
      el('path', {d: pathOf(line(st.limb)), fill: 'none', stroke: '#e07b1f', 'stroke-width': 2.8, 'stroke-linejoin': 'round'}, prof);
      // 이름표
      if (!st.alone) {
        if (st.limb) {
          const xe = half * 0.985, be = brightnessAt(xe, s, true);
          if (be !== null) el('text', {x: xs(xe) - 6, y: ys(be) - 10, 'text-anchor': 'end', class: 'annot halo', fill: '#c2581c'}, prof, `가장자리 ≈ ${num(be, 2)}`);
        }
      }
      // 흑점을 지나면 밝기가 뚝 떨어진다
      let dipX = null, dipB = 1;
      for (let i = 0; i <= 360; i++) {
        const x = -half + 2 * half * i / 360, f = spotFactorAt(x, s);
        if (f !== null && f < 1 && f < dipB) { dipB = f; dipX = x; }
      }
      st.crossesSpot = dipX !== null;
      if (dipX !== null) {
        const b = brightnessAt(dipX, s, st.limb);
        el('text', {x: xs(dipX), y: ys(b) + (tall ? 30 : 20), 'text-anchor': 'middle', class: 'annot halo', fill: '#7a2e0c'}, prof, dipB === UMBRA_I ? '흑점(암부)' : '흑점(반암부)');
      }
    }

    function insight() {
      let t;
      if (st.alone) t = `광구를 가리면 <b>흑점도 빛을 낸다</b>는 것이 보입니다. 같은 파장에서 암부는 광구 밝기의 약 ${Math.round(UMBRA_I * 100)}%, 반암부는 약 ${Math.round(PENUMBRA_I * 100)}%로 빛납니다. 흑점이 검게 보이는 것은 온도가 낮아(4000~5000 K) <b>더 밝은 주변 광구(약 5800 K)와 비교되기 때문</b>입니다.`;
      else if (st.paint === 'temp') t = st.limb
        ? '온도로 색칠하면 원반 가장자리가 덜 뜨거운 색입니다. 가운데를 볼 때는 <b>온도가 높은 깊은 층</b>까지 보이지만, 가장자리를 볼 때는 시선이 광구를 비스듬히 지나 <b>상대적으로 온도가 낮은 바깥층</b>까지만 보이기 때문입니다. 흑점(4000~5000 K)은 주변 광구(약 5800 K)보다 온도가 낮습니다.'
        : '주연 감광을 끄면 어디를 보든 같은 깊이의 층을 보는 것처럼 그려집니다. 그러면 원반 전체의 온도(색)가 같아집니다. 실제 태양은 가장자리에서 덜 뜨거운 바깥층이 보입니다.';
      else t = st.limb
        ? `광구는 가장자리로 갈수록 어둡게 보입니다. 이것을 <b>주연 감광</b>이라고 합니다. 가운데를 볼 때는 온도가 높은 깊은 층까지 볼 수 있지만, 가장자리를 볼 때는 상대적으로 온도가 낮은 층까지만 볼 수 있기 때문입니다. 아래 그래프처럼 가장자리 밝기는 가운데의 절반 정도까지 떨어집니다.`
        : '주연 감광을 끄면 원반이 가장자리까지 고르게 밝아 공이 아니라 납작한 원판처럼 보입니다. 실제 태양 사진은 가장자리가 어둡습니다. 다시 켜서 비교해 보세요.';
      if (!st.alone && st.crossesSpot) t += ' 줄이 흑점을 지나는 곳에서는 밝기가 뚝 떨어집니다. 가운데의 가장 어두운 부분이 <b>암부</b>, 둘레의 덜 어두운 부분이 <b>반암부</b>입니다.';
      $('s1-disk-insight').innerHTML = t;
    }

    // ── 쌀알 무늬 ───────────────────────────
    const gran = $('s1-gran'), gctx = gran.getContext('2d'), gover = $('s1-gran-over'), cut = $('s1-cut'), cctx = cut.getContext('2d');
    const W = 220, G = 8, CS = W / G, SPEED = 12;  // 화면 1초 = 실제 12초, 화면 가로 = 8000 km
    const img = gctx.createImageData(W, W), buf = new Uint32Array(img.data.buffer);
    const LUT_VIS = lut32(t => SUN_RAMP(0.5 + 0.5 * t)), LUT_TEMP = lut32(t => TEMP_RAMP(0.18 + 0.82 * t));
    const rnd = M.rng(11), seeds = [];
    const noise = new Float32Array(W * W).map(() => (rnd() - 0.5) * 0.05);
    const rowI = new Float32Array(W);
    let gt = 0, lastDraw = 0, drawCost = 10, track = null, rowY = 104;
    function spawn(s, t) {
      s.x = (s.gx + 0.18 + 0.64 * rnd()) * CS; s.y = (s.gy + 0.18 + 0.64 * rnd()) * CS;
      s.tb = t; s.life = 60 * (M.BOOK.granuleLifeMin[0] + (M.BOOK.granuleLifeMin[1] - M.BOOK.granuleLifeMin[0]) * rnd());
      s.vx = (rnd() - 0.5) * 0.012; s.vy = (rnd() - 0.5) * 0.012; s.gen = (s.gen || 0) + 1;
    }
    for (let gy = 0; gy < G; gy++) for (let gx = 0; gx < G; gx++) {
      const s = {gx, gy};
      spawn(s, 0); s.tb = -rnd() * s.life;
      seeds.push(s);
    }
    track = {i: 3 * G + 4, gen: seeds[3 * G + 4].gen, dead: null};
    const vig = new Float32Array(seeds.length), wgt = new Float32Array(seeds.length);

    function stepSeeds(dt) {
      gt += dt;
      seeds.forEach((s, i) => {
        if (gt - s.tb > s.life) {
          if (track && track.i === i && track.gen === s.gen) track.dead = s.life;
          spawn(s, gt);
        }
        s.x += s.vx * dt; s.y += s.vy * dt;
      });
    }
    function ownerAt(px, py) {
      const gx = Math.floor(px / CS), gy = Math.floor(py / CS);
      let best = Infinity, owner = -1;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        let cx = gx + dx, cy = gy + dy, ox = 0, oy = 0;
        if (cx < 0) { cx += G; ox = -W; } else if (cx >= G) { cx -= G; ox = W; }
        if (cy < 0) { cy += G; oy = -W; } else if (cy >= G) { cy -= G; oy = W; }
        const i = cy * G + cx, s = seeds[i], ddx = px - s.x - ox, ddy = py - s.y - oy;
        const d = Math.sqrt(ddx * ddx + ddy * ddy) / wgt[i];
        if (d < best) { best = d; owner = i; }
      }
      return owner;
    }
    function drawGran() {
      seeds.forEach((s, i) => { vig[i] = M.granuleVigor((gt - s.tb) / s.life); wgt[i] = 0.5 + 0.65 * vig[i]; });
      const LUT = st.gtemp ? LUT_TEMP : LUT_VIS;
      for (let py = 0; py < W; py++) {
        const gy = Math.floor(py / CS), fy = py + 0.5;
        for (let px = 0; px < W; px++) {
          const gx = Math.floor(px / CS), fx = px + 0.5;
          let f1 = Infinity, f2 = Infinity, own = 0;
          for (let dy = -1; dy <= 1; dy++) {
            let cy = gy + dy, oy = 0;
            if (cy < 0) { cy += G; oy = -W; } else if (cy >= G) { cy -= G; oy = W; }
            for (let dx = -1; dx <= 1; dx++) {
              let cx = gx + dx, ox = 0;
              if (cx < 0) { cx += G; ox = -W; } else if (cx >= G) { cx -= G; ox = W; }
              const i = cy * G + cx, s = seeds[i], ddx = fx - s.x - ox, ddy = fy - s.y - oy;
              const d = Math.sqrt(ddx * ddx + ddy * ddy) / wgt[i];
              if (d < f1) { f2 = f1; f1 = d; own = i; } else if (d < f2) f2 = d;
            }
          }
          // c: 경계에서 0, 쌀알 한가운데에서 1 → 경계는 가늘고 어둡게, 가운데는 조금 더 밝게
          const c = (f2 - f1) / (f2 + f1), e = c > 0.16 ? 1 : (c / 0.16) * (c / 0.16) * (3 - 2 * c / 0.16);
          let I = 0.2 + 0.8 * e * (0.78 + 0.22 * c) * (0.5 + 0.5 * vig[own]) + noise[py * W + px];
          I = I < 0 ? 0 : I > 1 ? 1 : I;
          buf[py * W + px] = LUT[(I * 255) | 0];
          if (py === rowY) rowI[px] = I;
        }
      }
      gctx.putImageData(img, 0, 0);
      drawCut();
      drawGranOverlay();
      const sec = Math.floor(gt), m = Math.floor(sec / 60);
      $('s1-clock').textContent = `${m}분 ${sec % 60}초`;
    }
    function drawGranOverlay() {
      clear(gover);
      const u = unitsFor(gover, W, 12.5);
      el('line', {x1: 0, x2: W, y1: rowY + 0.5, y2: rowY + 0.5, stroke: '#7fe0f2', 'stroke-width': u * 0.16, 'stroke-dasharray': `${u * 0.5} ${u * 0.4}`}, gover);
      el('text', {x: 3, y: rowY - u * 0.4, 'font-size': u * 0.95, fill: '#7fe0f2', class: 'dark-halo', 'font-weight': 700}, gover, '아래 단면의 자리');
      // 축척 막대 1000 km
      el('rect', {x: 6, y: W - 16 - u * 0.2, width: CS, height: u * 0.3, fill: '#fff'}, gover);
      el('text', {x: 6, y: W - 20 - u * 0.2, 'font-size': u * 0.95, fill: '#fff', class: 'dark-halo', 'font-weight': 700}, gover, '1000 km');
      if (track && track.dead === null) {
        const s = seeds[track.i];
        el('circle', {cx: s.x, cy: s.y, r: CS * 0.5, fill: 'none', stroke: '#7fe0f2', 'stroke-width': u * 0.18}, gover);
        $('s1-track').textContent = `생긴 지 ${fmtMinSec(gt - s.tb)}`;
      } else if (track && track.dead !== null) {
        $('s1-track').innerHTML = `사라짐 <small>(수명 ${fmtMinSec(track.dead)})</small>`;
      }
    }
    const fmtMinSec = s => `${Math.floor(s / 60)}분 ${Math.floor(s % 60)}초`;
    function drawCut() {
      const Wc = cut.width, Hc = cut.height, sx = Wc / W;
      const scale = (cut.clientWidth || Wc) / Wc, fpx = 12.5 / scale;
      cctx.clearRect(0, 0, Wc, Hc);
      const top = 30, bottom = Hc - 4;
      const grd = cctx.createLinearGradient(0, top, 0, bottom);
      // 온도로 색칠할 때는 깊을수록 뜨겁다(밝다)
      grd.addColorStop(0, st.gtemp ? rgbStr(TEMP_RAMP(0.6)) : '#b9561a'); grd.addColorStop(1, st.gtemp ? rgbStr(TEMP_RAMP(0.95)) : '#3a1505');
      cctx.fillStyle = grd; cctx.fillRect(0, top, Wc, bottom - top);
      // 표면(광구) 띠: 위에서 본 밝기를 그대로
      const LUT = st.gtemp ? LUT_TEMP : LUT_VIS;
      for (let x = 0; x < W; x++) {
        const c = LUT[(clamp(rowI[x], 0, 1) * 255) | 0];
        cctx.fillStyle = `rgb(${c & 255},${(c >> 8) & 255},${(c >> 16) & 255})`;
        cctx.fillRect(x * sx, top - 8, sx + 0.6, 16);
      }
      cctx.fillStyle = '#0f2235'; cctx.fillRect(0, 0, Wc, top - 8);
      cctx.font = `700 ${fpx}px Pretendard, 'Malgun Gothic', sans-serif`;
      cctx.fillStyle = '#dfe9f1'; cctx.textBaseline = 'alphabetic';
      cctx.fillText('단면: 광구 표면과 그 아래 (깊이는 과장해 그림)', 6, top - 8 - fpx * 0.4);
      if (!st.arrows) return;
      // 어두운 경계(하강) 사이마다 대류 세포 하나: 가운데로 올라와 양옆으로 퍼진 뒤 경계에서 내려간다
      const sm = new Float32Array(W);
      for (let x = 0; x < W; x++) { let s = 0, n = 0; for (let k = -2; k <= 2; k++) { const j = x + k; if (j >= 0 && j < W) { s += rowI[j]; n++; } } sm[x] = s / n; }
      const downs = [];
      for (let x = 1; x < W - 1; x++) {
        let isMin = true;
        for (let k = -9; k <= 9; k++) { const j = x + k; if (j < 0 || j >= W || k === 0) continue; if (sm[j] < sm[x]) { isMin = false; break; } }
        if (isMin && sm[x] < 0.62 && (!downs.length || x - downs[downs.length - 1] > 10)) downs.push(x);
      }
      const hot = st.gtemp ? '#fff7c0' : '#ffd36a', cool = st.gtemp ? '#3b1a6e' : '#9fd8ff';
      const head = (x, y, dx, dy, color) => {
        const l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l;
        cctx.fillStyle = color; cctx.beginPath();
        cctx.moveTo(x, y); cctx.lineTo(x - ux * 9 - uy * 5, y - uy * 9 + ux * 5); cctx.lineTo(x - ux * 9 + uy * 5, y - uy * 9 - ux * 5); cctx.closePath(); cctx.fill();
      };
      const ys = top + 16, yd = bottom - 12;
      const edges = [0, ...downs, W - 1];
      let firstUp = null, firstDown = null;
      for (let k = 0; k < edges.length - 1; k++) {
        const a = edges[k] * sx, b = edges[k + 1] * sx, w = b - a;
        if (w < 22) continue;
        const m = (a + b) / 2;
        cctx.lineWidth = 3; cctx.strokeStyle = hot;
        cctx.beginPath(); cctx.moveTo(m, yd); cctx.lineTo(m, ys + 4); cctx.stroke(); head(m, ys, 0, -1, hot);
        // 양옆으로 퍼지는 흐름
        [a + 6, b - 6].forEach(t => {
          cctx.lineWidth = 2.2; cctx.strokeStyle = hot;
          cctx.beginPath(); cctx.moveTo(m + (t > m ? 5 : -5), ys + 3);
          cctx.quadraticCurveTo(t, ys + 1, t, ys + 14); cctx.stroke();
        });
        if (firstUp === null && m > Wc * 0.06) firstUp = m;
      }
      downs.forEach(d => {
        const x = d * sx;
        cctx.lineWidth = 2.6; cctx.strokeStyle = cool;
        cctx.beginPath(); cctx.moveTo(x, ys + 12); cctx.lineTo(x, yd - 4); cctx.stroke(); head(x, yd, 0, 1, cool);
        if (firstDown === null && x > Wc * 0.45) firstDown = x;
      });
      cctx.font = `800 ${fpx}px Pretendard, 'Malgun Gothic', sans-serif`;
      cctx.lineWidth = 4; cctx.strokeStyle = 'rgba(20,10,5,0.85)'; cctx.lineJoin = 'round';
      const say = (t, x, y, color) => { const wdt = cctx.measureText(t).width; x = clamp(x, 4, Wc - wdt - 4); cctx.strokeText(t, x, y); cctx.fillStyle = color; cctx.fillText(t, x, y); };
      if (firstUp !== null) say('상승 기류(뜨거운 기체)', firstUp + 8, yd - 8, hot);
      if (firstDown !== null) say('하강 기류(식은 기체)', firstDown + 8, ys + fpx + 22, cool);
    }
    gover.addEventListener('pointerdown', e => {
      const p = svgPoint(gover, e);
      const px = clamp(p.x, 0, W - 1), py = clamp(p.y, 0, W - 1);
      const i = ownerAt(px, py);
      track = {i, gen: seeds[i].gen, dead: null};
      rowY = Math.round(py);
      drawGran();
    });
    $('s1-play').addEventListener('click', () => { st.playing = !st.playing; syncPlay(); kick(); });
    toggleButton($('s1-arrows'), v => { st.arrows = v; drawGran(); granInsight(); });
    toggleButton($('s1-gtemp'), v => { st.gtemp = v; syncGLegend(); drawGran(); granInsight(); });
    function syncGLegend() {
      const g = $('s1-glegend');
      g.hidden = !st.gtemp;
      if (st.gtemp) g.innerHTML = `<div class="bar" style="background:${tempGradientCSS(0.18, 1)}"></div><div class="ticks"><span class="first" style="left:0">덜 뜨거움 (경계, 하강)</span><span class="last" style="left:100%">더 뜨거움 (가운데, 상승)</span></div>`;
    }
    function syncPlay() { $('s1-play').textContent = st.playing ? '❚❚ 멈춤' : '▶ 재생'; }
    function granInsight() {
      $('s1-gran-insight').innerHTML = `쌀알 하나의 평균 지름은 약 <b>1000 km</b>, 수명은 <b>3~4분</b>입니다(화면의 1초 = 실제 약 ${SPEED}초). `
        + (st.gtemp ? '온도로 색칠하면 쌀알의 가운데가 더 뜨겁고(밝은 색) 경계가 덜 뜨겁습니다(어두운 색). ' : '')
        + '광구 밑에서 <b>대류</b>가 일어나, 뜨거운 기체가 상승하는 부분은 밝게, 기체가 식어서 하강하는 부분은 어둡게 보입니다. 쌀알을 누르면 그 쌀알이 생겼다 사라지는 시간을 잴 수 있습니다.';
    }

    // ── 흑점과 자기장 ───────────────────────────
    const mag = $('s1-mag');
    const SURF = 112, XL = 300, XR = 480;
    function magT(B) { return M.BOOK.photosphereT - (M.BOOK.photosphereT - M.BOOK.umbraT) * M.smoothstep(0.12, 0.95, B); }
    $('s1-B').addEventListener('input', e => { st.B = +e.target.value; renderMag(); });
    toggleButton($('s1-lines'), v => { st.lines = v; renderMag(); });
    function renderMag() {
      clear(mag);
      const tall = small(), B = st.B, T = magT(B), I = M.relBrightness(T);
      const defs = el('defs', {}, mag);
      const ig = el('linearGradient', {id: 's1-inner', x1: 0, y1: 0, x2: 0, y2: 1}, defs);
      el('stop', {offset: '0%', 'stop-color': '#e3741f'}, ig); el('stop', {offset: '100%', 'stop-color': '#7a1f0b'}, ig);
      el('rect', {x: 0, y: 0, width: 640, height: SURF - 14, fill: '#0f2235'}, mag);
      el('rect', {x: 0, y: SURF, width: 640, height: 300 - SURF, fill: 'url(#s1-inner)'}, mag);
      // 광구 윗면(조금 위에서 본 모습)
      el('path', {d: `M0 ${SURF}L40 ${SURF - 14}L640 ${SURF - 14}L640 ${SURF}Z`, fill: sunColor(0.92)}, mag);
      el('line', {x1: 0, x2: 640, y1: SURF, y2: SURF, stroke: '#ffd28a', 'stroke-width': 1.5}, mag);
      // 상승하는 뜨거운 기체 (대류). 왼쪽 띠는 이름표 자리.
      const blocked = x => (Math.abs(x - XL) <= 36 || Math.abs(x - XR) <= 36);
      const arrows = el('g', {fill: 'none', 'stroke-linecap': 'round'}, mag);
      for (let x = 180; x <= 610; x += 36) {
        const stop = blocked(x) ? SURF + 16 + 104 * M.smoothstep(0.1, 0.9, B) : SURF + 6;
        const y0 = 286, y1 = Math.min(stop, y0 - 20);
        el('path', {d: `M${x} ${y0}L${x} ${y1 + 9}`, stroke: '#ffd65a', 'stroke-width': 4, 'stroke-dasharray': '8 4', class: blocked(x) && B > 0.5 ? 'flow slow' : 'flow'}, arrows);
        el('path', {d: `M${x - 7} ${y1 + 12}L${x} ${y1}L${x + 7} ${y1 + 12}`, stroke: '#ffd65a', 'stroke-width': 4}, arrows);
        if (blocked(x) && B > 0.35) {
          const k = 7, cy = y1 - 9;
          el('path', {d: `M${x - k} ${cy - k}L${x + k} ${cy + k}M${x + k} ${cy - k}L${x - k} ${cy + k}`, stroke: '#14283a', 'stroke-width': 4.5, opacity: M.smoothstep(0.35, 0.6, B)}, arrows);
        }
      }
      el('rect', {x: 0, y: SURF, width: 158, height: 300 - SURF, fill: '#14283a', opacity: 0.18}, mag);
      // 자기력선
      if (st.lines && B > 0.02) {
        const n = 1 + Math.round(B * 5), lg = el('g', {fill: 'none', stroke: '#45e0d0', 'stroke-width': 2.2, 'stroke-dasharray': '7 5', opacity: (0.35 + 0.65 * B).toFixed(2)}, mag);
        for (let i = 0; i < n; i++) {
          const d = (i - (n - 1) / 2) * 7, a = XL + d, b = XR - d, h = 70 + d * 1.6;
          el('path', {d: `M${a} ${SURF - 8}C${a} ${SURF - 8 - h}, ${b} ${SURF - 8 - h}, ${b} ${SURF - 8}`}, lg);
          el('path', {d: `M${a} ${SURF - 8}C${a - d * 0.2} ${SURF + 60}, ${a - d * 1.4 - 8} ${SURF + 120}, ${a - d * 2.2 - 14} 296`}, lg);
          el('path', {d: `M${b} ${SURF - 8}C${b + d * 0.2} ${SURF + 60}, ${b + d * 1.4 + 8} ${SURF + 120}, ${b + d * 2.2 + 14} 296`}, lg);
        }
        el('text', {x: (XL + XR) / 2, y: SURF - 86 - B * 4, 'text-anchor': 'middle', class: 'lab', fill: '#45e0d0'}, mag, '자기력선');
      }
      // 흑점: 광구 윗면 위의 납작한 타원
      const dark = M.smoothstep(0.12, 0.6, B);
      [XL, XR].forEach(x => {
        el('ellipse', {cx: x, cy: SURF - 7, rx: 34 * (0.4 + 0.6 * dark), ry: 6.5 * (0.4 + 0.6 * dark), fill: sunColor(0.92 * (1 - (1 - PENUMBRA_I) * dark)), opacity: dark > 0.02 ? 1 : 0}, mag);
        el('ellipse', {cx: x, cy: SURF - 7, rx: 15 * (0.4 + 0.6 * dark), ry: 3.4 * (0.4 + 0.6 * dark), fill: sunColor(0.92 * I), opacity: dark > 0.02 ? 1 : 0}, mag);
      });
      if (dark > 0.3) el('text', {x: XR + 44, y: SURF - 24, class: 'lab', fill: '#fff'}, mag, '흑점');
      el('text', {x: 12, y: SURF - 24, class: 'lab', fill: '#ffe2a8'}, mag, '광구');
      // 왼쪽 띠의 이름표 (휴대폰에서는 글씨가 커지므로 줄을 더 나눈다)
      const lines = (arr, x, y0, color) => arr.forEach((t, i) => el('text', {x, y: y0 + i * (tall ? 24 : 19), class: 'lab', fill: color}, mag, t));
      lines(tall ? ['광구 밑의', '대류:', '뜨거운 기체', '상승'] : ['광구 밑의 대류:', '뜨거운 기체가', '올라온다'], 12, SURF + 26, '#fff3c4');
      if (B > 0.35) {
        const y0 = tall ? SURF + 128 : SURF + 106;
        el('path', {d: `M12 ${y0 - 11}l11 11m0 -11l-11 11`, stroke: '#14283a', 'stroke-width': 4}, mag);
        lines(tall ? ['자기장이', '강한 곳은', '못 올라옴'] : ['자기장이 강한', '곳에서는 기체가', '올라오지 못한다'], 30, y0, '#fff');
      }
      $('s1-B-out').textContent = B < 0.15 ? '약함' : B < 0.55 ? '보통' : '매우 강함';
      $('s1-spotT').textContent = `약 ${Math.round(T / 100) * 100} K`;
      $('s1-spotI').textContent = `약 ${Math.round(I * 100)}%`;
      const steps = ['강한 자기장', '대류 억제', '에너지 전달 감소', '온도 하강', '흑점'];
      const lit = B < 0.15 ? 0 : B < 0.35 ? 2 : B < 0.6 ? 4 : 5;
      $('s1-chain').innerHTML = steps.map((s, i) => `<span class="${i < lit ? 'on' : ''}">${s}</span>`).join('<i>→</i>');
      $('s1-mag-insight').innerHTML = B < 0.15
        ? '자기장이 약하면 광구 밑의 뜨거운 기체가 막힘없이 올라와 이곳도 주변 광구와 온도(약 5800 K)가 같습니다. 흑점이 생기지 않습니다. 자기장을 세게 해 보세요.'
        : `태양의 자기장이 매우 강한 곳에서는 광구 밑에서 <b>전하를 띤 입자(뜨거운 기체)가 상승하는 것이 억제</b>됩니다. 에너지가 덜 전달되어 표면 온도가 <b>약 ${Math.round(T / 100) * 100} K</b>로 낮아지고, 주변 광구보다 어두운 <b>흑점</b>이 됩니다. 흑점은 강한 자기력선이 광구를 뚫고 나오는 곳이라 자기력선의 양 끝에 짝을 지어 나타나기도 합니다.`;
    }

    let tPrev = null;
    function tick(now) {
      if (!st.playing) { tPrev = null; return; }
      if (tPrev === null) tPrev = now;
      const dt = Math.min(0.25, (now - tPrev) / 1000);
      tPrev = now;
      stepSeeds(dt * SPEED);
      // 느린 태블릿에서는 그리는 데 걸린 시간에 맞춰 덜 자주 그린다
      if (now - lastDraw > Math.max(70, drawCost * 3)) {
        lastDraw = now;
        const t0 = performance.now();
        drawGran();
        drawCost = 0.8 * drawCost + 0.2 * (performance.now() - t0);
      }
    }
    function render() { syncPlay(); syncGLegend(); renderDisk(); drawGran(); granInsight(); renderMag(); }
    return {render, tick, animating: () => st.playing};
  })();

  // ═══════════════ 02 흑점으로 자전 주기 재기 ═══════════════
  stations.s2 = (() => {
    const st = {mode: 'practice', seed: 1, set: null, photo: 0, marks: [null, null], reveal: 0, results: [], model: false, grid: false, animT0: null, days: 12};
    const disk = $('s2-disk'), geo = $('s2-geo'), chart = $('s2-chart');
    const PX = 320, PY = 290, PR = 232;   // 사진 속 태양의 중심과 반지름(px)
    const MAXSTEP = 5;
    const r2 = v => Math.round(v * 100) / 100;

    document.querySelectorAll('#s2-modes [data-mode]').forEach(b => b.addEventListener('click', () => load(b.dataset.mode)));
    $('s2-new').addEventListener('click', () => { st.seed++; load('practice'); });
    document.querySelectorAll('#s2-photo [data-photo]').forEach(b => b.addEventListener('click', () => { st.photo = +b.dataset.photo; renderPhoto(); renderNote(); }));
    $('s2-clear').addEventListener('click', () => { st.marks = [null, null]; st.reveal = 0; renderAll(); });
    toggleButton($('s2-grid'), v => { st.grid = v; renderPhoto(); });
    toggleButton($('s2-model'), v => { st.model = v; renderChart(); });
    $('s2-reset').addEventListener('click', () => { st.results = []; renderChart(); });
    $('s2-next').addEventListener('click', () => { st.reveal = Math.min(maxStep(), st.reveal + 1); renderTable(); afterReveal(); });
    $('s2-all').addEventListener('click', () => { st.reveal = maxStep(); renderTable(); afterReveal(); });
    $('s2-replay').addEventListener('click', () => { st.animT0 = REDUCED ? null : performance.now(); renderGeo(); kick(); });

    const maxStep = () => st.mode === 'q3' ? 1 : MAXSTEP;
    function load(mode) {
      st.mode = mode; st.photo = 0; st.reveal = 0; st.marks = [null, null];
      if (mode === 'practice') st.set = M.practiceSet(st.seed);
      else if (mode === 'q3') st.set = {dt: M.BOOK.checkQ3.dt, q3: true, R: 10, spots: []};
      else {
        const ex = M.textbookExample(mode);
        st.set = {dt: ex.dt, R: ex.R, spots: ex.spots, book: mode, lat: ex.lat};
        // 교과서 값으로 표시해 둔다
        st.marks = [0, 1].map(p => ({id: 0, ...posOf(ex.spots[0], p)}));
        st.photo = 1;
      }
      st.animT0 = REDUCED ? null : performance.now();
      renderAll();
      kick();
    }
    // 사진 p(0: 처음, 1: 나중)에서 흑점의 위치(cm, 원반 중심 기준, 서·북 +)
    function posOf(s, p) {
      const q = M.project(s.lat, p ? s.lon1 : s.lon0);
      return {x: q.x * st.set.R, y: q.y * st.set.R};
    }
    const toPx = (x, y) => [PX + x * PR / st.set.R, PY - y * PR / st.set.R];

    onDrag(disk, (p, phase) => {
      if (phase !== 'start' || !p || st.mode === 'q3') return;
      const k = PR / st.set.R, x = (p.x - PX) / k, y = (PY - p.y) / k;
      let best = null, bd = Infinity;
      st.set.spots.forEach(s => {
        const q = posOf(s, st.photo), d = Math.hypot(q.x - x, q.y - y);
        if (d < bd) { bd = d; best = s; }
      });
      // 손가락으로도 누르기 쉽게: 흑점 둘레 넉넉히(가장 가까운 흑점을 고른다)
      const tol = best ? Math.max(small() ? 1.3 : 0.9, Math.sin(best.penumbra * D2R) * st.set.R + 0.6) : 0;
      if (!best || bd > tol) { st.miss = true; renderNote(); return; }
      st.miss = false;
      st.marks[st.photo] = {id: best.id, ...posOf(best, st.photo)};
      st.reveal = 0;
      renderAll();
    });

    // 두 표시가 같은 흑점인지 보고 R′, x, y 를 잰다
    function measurement() {
      if (st.mode === 'q3') return {ok: true, q3: true, row: {dt: st.set.dt, theta: M.BOOK.checkQ3.theta, P: M.periodFromAngle(M.BOOK.checkQ3.theta, st.set.dt)}};
      const [a, b] = st.marks;
      if (!a || !b) return {ok: false, need: !a ? 'first' : 'second'};
      if (a.id !== b.id) {
        const sa = st.set.spots[a.id], sb = st.set.spots[b.id];
        return {ok: false, wrong: Math.abs(sa.lat - sb.lat) > 1.5 ? 'lat' : 'other'};
      }
      const m = M.measureMarks(a, b, st.set.R);
      if (st.set.book) {
        const t = M.BOOK.textbookRows[st.set.book];
        return {ok: true, m, row: M.rotationRow(t.dt, t.Rp, t.x, t.y), book: t};
      }
      const row = M.rotationRow(st.set.dt, r2(m.Rp), r2(m.x), r2(m.y), m.sameSide);
      return {ok: true, m, row, spot: st.set.spots[a.id]};
    }

    function renderPhoto() {
      setPressed($('s2-photo'), 'data-photo', String(st.photo));
      $('s2-dt-label').textContent = st.set.dt;
      clear(disk);
      const tall = small(), fs = fsFor(disk, 13, 13, 24);
      if (st.mode === 'q3') {
        el('text', {x: 320, y: 250, 'text-anchor': 'middle', 'font-size': fs * 1.3, 'font-weight': 800, fill: '#ffe08a'}, disk, '63쪽 확인 문제 3');
        el('text', {x: 320, y: 300, 'text-anchor': 'middle', 'font-size': fs * 1.15, fill: '#fff'}, disk, '• 관측 기간: 4일');
        el('text', {x: 320, y: 340, 'text-anchor': 'middle', 'font-size': fs * 1.15, fill: '#fff'}, disk, '• 흑점의 이동각: 50°');
        el('text', {x: 320, y: 400, 'text-anchor': 'middle', 'font-size': fs, fill: '#9fb3c4'}, disk, '이동각 θ가 주어졌으므로 R′, x, y를 재는 단계는 건너뜁니다.');
        el('text', {x: 320, y: 430, 'text-anchor': 'middle', 'font-size': fs, fill: '#9fb3c4'}, disk, '(단, 지구의 공전 효과는 보정된 자료)');
        return;
      }
      const defs = el('defs', {}, disk);
      limbGradient(defs, 's2-ld', r => sunColor(0.2 + 0.8 * M.limbDarkening(Math.min(r, 0.9999), 0.5) ** 0.9));
      el('circle', {cx: PX, cy: PY, r: PR, fill: 'url(#s2-ld)'}, disk);
      el('clipPath', {id: 's2-clip'}, defs).appendChild(el('circle', {cx: PX, cy: PY, r: PR}));
      const g = el('g', {'clip-path': 'url(#s2-clip)'}, disk);
      if (st.grid) drawGrid(g);
      // 흑점(작은 동반 흑점 포함)
      st.set.spots.forEach(s => {
        const lon = st.photo ? s.lon1 : s.lon0;
        const parts = [{dlat: 0, dlon: 0, k: 1}];
        if (!s.book) {
          parts.push({dlat: (s.shape[0] - 0.5) * 2.4, dlon: -(2.4 + s.shape[1] * 2.2) * (s.penumbra / 2.4), k: 0.42 + s.shape[2] * 0.25});
          if (s.shape[3] > 0.45) parts.push({dlat: (s.shape[3] - 0.5) * 2, dlon: -(4.6 + s.shape[0] * 2.5) * (s.penumbra / 2.4), k: 0.3});
        }
        parts.forEach(pt => {
          const lat = s.lat + pt.dlat, lo = lon + pt.dlon;
          const gp = spotGeom(PX, PY, PR, lat, lo, s.penumbra * pt.k), gu = spotGeom(PX, PY, PR, lat, lo, s.umbra * pt.k);
          if (gp.z <= 0) return;
          const base = 0.2 + 0.8 * M.limbDarkening(Math.min(gp.r, 0.9999), 0.5) ** 0.9;
          drawSpotEllipse(g, gp, 1, sunColor(base * 0.62));
          drawSpotEllipse(g, gu, 1, sunColor(base * 0.22));
        });
      });
      // 방위
      el('text', {x: PX, y: 36, 'text-anchor': 'middle', 'font-size': fs, 'font-weight': 700}, disk, '북');
      el('text', {x: PX, y: 552, 'text-anchor': 'middle', 'font-size': fs, 'font-weight': 700}, disk, '남');
      el('text', {x: 40, y: PY + 5, 'text-anchor': 'middle', 'font-size': fs, 'font-weight': 700}, disk, '동');
      el('text', {x: 600, y: PY + 5, 'text-anchor': 'middle', 'font-size': fs, 'font-weight': 700}, disk, '서');
      el('text', {x: 16, y: 34, 'font-size': fs * 1.1, 'font-weight': 800, fill: '#ffe08a'}, disk, st.photo ? `(나) ${st.set.dt}일 뒤` : '(가) 처음');
      if (st.set.book) el('text', {x: 626, y: 550, 'text-anchor': 'end', 'font-size': fs * 0.85, fill: '#9fb3c4'}, disk, '그림의 위도는 임의');
      drawSheet(fs);
    }
    function drawGrid(g) {
      const gg = el('g', {fill: 'none', stroke: '#fff', 'stroke-width': 1, opacity: 0.45}, g);
      for (let lat = -75; lat <= 75; lat += 15) {
        const y = PY - Math.sin(lat * D2R) * PR, hw = Math.cos(lat * D2R) * PR;
        el('line', {x1: PX - hw, x2: PX + hw, y1: y, y2: y, 'stroke-dasharray': lat === 0 ? '' : '3 4'}, gg);
      }
      for (let lon = -75; lon <= 75; lon += 15) {
        const pts = [];
        for (let lat = -90; lat <= 90; lat += 5) { const q = M.project(lat, lon); pts.push([PX + q.x * PR, PY - q.y * PR]); }
        el('path', {d: pathOf(pts), 'stroke-dasharray': lon === 0 ? '' : '3 4'}, gg);
      }
    }
    // 투명 용지: 태양과 같은 크기의 원 + 두 표시 + 작도
    function drawSheet(fs) {
      const sheet = el('g', {}, disk);
      el('circle', {cx: PX, cy: PY, r: PR, fill: 'none', stroke: '#bfe9ff', 'stroke-width': 1.5, 'stroke-dasharray': '8 6', opacity: 0.8}, sheet);
      const meas = measurement();
      if (meas.ok && !meas.q3) {
        const m = meas.m, yc = (st.marks[0].y + st.marks[1].y) / 2;
        const [ax, ay] = toPx(0, yc), [bx] = toPx(Math.sqrt(st.set.R ** 2 - yc ** 2), yc), [ex] = toPx(-Math.sqrt(st.set.R ** 2 - yc ** 2), yc);
        const [x1] = toPx(st.marks[0].x, yc), [x2] = toPx(st.marks[1].x, yc);
        const c = el('g', {}, sheet);
        el('line', {x1: PX, x2: PX, y1: PY - PR, y2: PY + PR, stroke: '#bfe9ff', 'stroke-width': 1.3, 'stroke-dasharray': '4 4'}, c);
        el('line', {x1: ex, x2: bx, y1: ay, y2: ay, stroke: '#bfe9ff', 'stroke-width': 1.6}, c);
        el('circle', {cx: PX, cy: PY, r: 3.5, fill: '#bfe9ff'}, c);
        el('text', {x: PX + 7, y: PY + (ay > PY ? -8 : 18), 'font-size': fs * 0.95, fill: '#bfe9ff', class: 'dark-halo'}, c, 'O');
        el('circle', {cx: ax, cy: ay, r: 4, fill: '#fff'}, c);
        el('circle', {cx: bx, cy: ay, r: 4, fill: '#fff'}, c);
        const above = ay > PY ? -1 : 1;   // 글씨를 원반 중심 쪽으로
        el('text', {x: ax - 4, y: ay - above * 10 + (above > 0 ? 0 : fs * 0.4), 'text-anchor': 'end', 'font-size': fs, 'font-weight': 800, fill: '#fff', class: 'dark-halo'}, c, 'A');
        el('text', {x: bx + 6, y: ay - 8, 'font-size': fs, 'font-weight': 800, fill: '#fff', class: 'dark-halo'}, c, 'B');
        // 길이 표시
        const dim = (xa, xb, yy, label, color) => {
          if (Math.abs(xb - xa) < 2) return;
          el('path', {d: `M${xa} ${yy}H${xb}M${xa} ${yy - 5}V${yy + 5}M${xb} ${yy - 5}V${yy + 5}`, stroke: color, 'stroke-width': 2, fill: 'none'}, c);
          el('text', {x: (xa + xb) / 2, y: yy + (yy < ay ? -6 : fs + 2), 'text-anchor': 'middle', 'font-size': fs * 0.95, 'font-weight': 800, fill: color, class: 'dark-halo'}, c, label);
        };
        // 길이 표시가 겹치지 않게: y 는 위, R′ 는 아래, x 는 (양쪽에 있을 때) 한 줄 더 아래
        const off = small() ? 30 : 22;
        if (m.sameSide) {
          dim(x1, ax, ay - off, `x = ${num(r2(m.x), 2)}`, '#ffb36b');
          dim(ax, x2, ay - off * 2.1, `y = ${num(r2(m.y), 2)}`, '#ff8ac8');
        } else {
          dim(ax, x2, ay - off, `y = ${num(r2(m.y), 2)}`, '#ff8ac8');
          dim(x1, ax, ay + off * 2.1, `x = ${num(r2(m.x), 2)}`, '#ffb36b');
        }
        dim(ax, bx, ay + off * 0.9, `R′ = ${num(r2(m.Rp), 2)} cm`, '#bfe9ff');
      }
      // 표시. 작도가 있으면 이름표는 x, y 길이 표시보다 위에 둔다.
      const off = small() ? 30 : 22;
      [[0, '#ffb36b', '처음'], [1, '#ff8ac8', '나중']].forEach(([i, color, name]) => {
        const mk = st.marks[i];
        if (!mk) return;
        const [x, y] = toPx(mk.x, mk.y);
        el('circle', {cx: x, cy: y, r: 11, fill: 'none', stroke: color, 'stroke-width': 3}, sheet);
        el('path', {d: `M${x - 17} ${y}H${x - 7}M${x + 7} ${y}H${x + 17}M${x} ${y - 17}V${y - 7}M${x} ${y + 7}V${y + 17}`, stroke: color, 'stroke-width': 2}, sheet);
        const ly = meas.ok && !meas.q3 ? y - off * (meas.m.sameSide ? 3.3 : 2.3) - 4 : y - 24;
        el('text', {x, y: ly, 'text-anchor': 'middle', 'font-size': fs * 0.95, 'font-weight': 800, fill: color, class: 'dark-halo'}, sheet, name);
      });
    }

    function renderReadout() {
      const meas = measurement(), ro = $('s2-readout');
      if (st.mode === 'q3') { ro.innerHTML = `<div><span>관측 기간 Δt</span><strong>4일</strong></div><div><span>흑점의 이동각 θ</span><strong>50°</strong></div>`; return; }
      if (!meas.ok) { ro.innerHTML = `<div><span>시간 간격 Δt</span><strong>${st.set.dt}일</strong></div><div><span>R′ · x · y</span><strong>—</strong></div>`; return; }
      const m = meas.m, lat = m.latDeg;
      ro.innerHTML = `<div><span>시간 간격 Δt</span><strong>${st.set.dt}일</strong></div>
        <div><span>R′ (A에서 B까지)</span><strong>${num(r2(m.Rp), 2)} cm</strong></div>
        <div><span>x (처음 위치 ↔ A)</span><strong>${num(r2(m.x), 2)} cm</strong></div>
        <div><span>y (A ↔ 나중 위치)</span><strong>${num(r2(m.y), 2)} cm</strong></div>` +
        (st.set.book ? '' : `<div><span>흑점의 위도</span><strong>${lat >= 0 ? '북위' : '남위'} ${num(Math.abs(lat), 0)}°</strong></div>`);
    }
    function renderNote() {
      const meas = measurement(), n = $('s2-note');
      document.querySelector('#s2-photo [data-photo="1"]').classList.toggle('nudge', !!(st.marks[0] && !st.marks[1] && st.photo === 0));
      let t;
      if (st.mode === 'q3') t = '이동각과 관측 기간이 주어진 문제입니다. 오른쪽 그림과 아래 표에서 비례식으로 자전 주기를 구해 보세요.';
      else if (st.miss) t = '흑점의 가운데(가장 어두운 곳)를 눌러 보세요.';
      else if (meas.ok) t = st.set.book
        ? `교과서 60쪽 표의 값(R′ = ${num(meas.book.Rp, 2)} cm, x = ${num(meas.book.x, 2)} cm, y = ${num(meas.book.y, 2)} cm)이 나오도록 표시해 두었습니다. 원의 중심 O를 지나는 세로선과 흑점이 지나는 가로선(위도선)이 만나는 점이 A, 가로선이 원과 만나는 점이 B입니다.`
        : '두 위치를 이었습니다. 원의 중심 O를 지나는 세로선(중앙 경선)과 흑점이 지나는 가로선(위도선)이 만나는 점이 A, 가로선이 원과 만나는 점이 B입니다. R′ = AB, x, y를 쟀습니다. 아래 표에서 계산을 이어 가세요.';
      else if (meas.wrong) t = '<span class="warn">두 표시가 같은 흑점이 아닌 것 같습니다.</span> 흑점은 같은 위도선을 따라 동쪽(왼쪽)에서 서쪽(오른쪽)으로 움직입니다. (나) 사진에서 같은 높이에 있는 흑점을 찾아보세요. 표시 지우기를 눌러 다시 할 수 있습니다.';
      else if (meas.need === 'second' && st.photo === 0) t = '② 처음 위치를 표시했습니다. 이제 <b>(나) 사진</b>으로 넘겨, 같은 흑점이 움직여 간 곳을 누르세요. 투명 용지의 표시는 그대로 남아 있습니다.';
      else if (meas.need === 'second') t = '② 같은 흑점의 <b>나중 위치</b>를 누르세요. 흑점은 같은 위도선을 따라 오른쪽(서쪽)으로 움직였습니다. 처음 표시와 같은 높이에서 찾아보세요.';
      else if (meas.need === 'first' && st.marks[1]) t = '(가) 사진으로 돌아가 같은 흑점의 처음 위치도 표시하세요.';
      else t = '① (가) 사진에서 흑점 하나를 골라 가운데를 누르세요. 사진 위에 투명 용지를 올려 흑점의 처음 위치를 표시하는 단계입니다(교과서 60쪽 1번).';
      n.innerHTML = t;
    }

    // 정면에서 본 모습(위) + 위에서 내려다본 위도 원(아래) — 교과서 60쪽 그림
    function renderGeo(progress) {
      clear(geo);
      const tall = small(), fs = fsFor(geo, 12.5, 13, 24);
      const meas = measurement();
      const FX = 320, FY = 190, FR = 160, TY = 392;
      let lat, lon0, lon1, dt;
      let example = false;
      if (st.mode === 'q3') { lat = 20; lon0 = -25; lon1 = 25; dt = 4; }
      else if (meas.ok) { const s = st.set.spots[st.marks[0].id]; lat = s.lat; lon0 = s.lon0; lon1 = s.lon1; dt = st.set.dt; }
      else { example = true; lat = 15; lon0 = -34; dt = 5; lon1 = M.lonAfter(lat, lon0, dt); }
      const cr = Math.cos(lat * D2R) * FR, yc = FY - Math.sin(lat * D2R) * FR;
      const defs = el('defs', {}, geo);
      limbGradient(defs, 's2-geo-ld', r => sunColor(0.55 + 0.45 * M.limbDarkening(Math.min(r, 0.9999), 0.5)));
      // 정면
      el('circle', {cx: FX, cy: FY, r: FR, fill: 'url(#s2-geo-ld)', stroke: '#c98a3a', 'stroke-width': 1}, geo);
      el('line', {x1: FX - cr, x2: FX + cr, y1: yc, y2: yc, stroke: '#7a3b12', 'stroke-width': 1.6}, geo);
      el('line', {x1: FX, x2: FX, y1: FY - FR, y2: FY + FR, stroke: '#7a3b12', 'stroke-width': 1, 'stroke-dasharray': '4 4'}, geo);
      el('circle', {cx: FX, cy: FY, r: 3, fill: '#7a3b12'}, geo);
      el('text', {x: FX - 8, y: FY + (yc < FY ? 18 : -8), 'text-anchor': 'end', 'font-size': fs * 0.9, fill: '#7a3b12'}, geo, '태양의 중심 O');
      el('line', {x1: FX, x2: FX + FR, y1: FY, y2: FY, stroke: '#7a3b12', 'stroke-width': 1, 'stroke-dasharray': '2 3', opacity: 0.6}, geo);
      el('text', {x: FX + FR * 0.62, y: FY + (yc < FY ? 18 : -6), 'text-anchor': 'middle', 'font-size': fs * 0.9, fill: '#7a3b12'}, geo, 'R');
      el('text', {x: FX - 6, y: yc - 8, 'text-anchor': 'end', 'font-size': fs, 'font-weight': 800, fill: '#14283a'}, geo, 'A');
      el('text', {x: FX + cr + 6, y: yc + 5, 'font-size': fs, 'font-weight': 800, fill: '#14283a'}, geo, 'B');
      // 위에서 본 위도 원(지구 쪽 반원)
      const top = el('g', {}, geo);
      el('path', {d: `M${FX - cr} ${TY}A${cr} ${cr} 0 0 0 ${FX + cr} ${TY}`, fill: '#fde7c4', stroke: '#c98a3a', 'stroke-width': 1.5}, top);
      el('line', {x1: FX - cr, x2: FX + cr, y1: TY, y2: TY, stroke: '#7a3b12', 'stroke-width': 1.4}, top);
      el('line', {x1: FX, x2: FX, y1: TY, y2: TY + cr + 26, stroke: '#7a3b12', 'stroke-width': 1, 'stroke-dasharray': '4 4'}, top);
      el('text', {x: FX - 6, y: TY - 8, 'text-anchor': 'end', 'font-size': fs, 'font-weight': 800, fill: '#14283a'}, top, 'A');
      el('text', {x: FX + cr + 6, y: TY + 5, 'font-size': fs, 'font-weight': 800, fill: '#14283a'}, top, 'B');
      el('text', {x: FX + cr * 0.55, y: TY - 8, 'text-anchor': 'middle', 'font-size': fs * 0.9, fill: '#7a3b12'}, top, 'R′');
      el('text', {x: FX, y: TY + cr + 26 + fs * 1.2, 'text-anchor': 'middle', 'font-size': fs * 0.9, 'font-weight': 700, fill: '#0b7f9a'}, top, '↓ 지구(관측자) 쪽');
      el('text', {x: 14, y: TY - cr * 0 - 8, 'font-size': fs * 0.85, fill: '#5f7282'}, top, tall ? '위에서 본 위도 원' : '북극 위에서 내려다본 위도 원');
      el('text', {x: 14, y: 26, 'font-size': fs * 0.85, fill: '#5f7282'}, geo, '지구에서 본 태양(정면)');
      const P = (lon, rr = cr) => [FX + rr * Math.sin(lon * D2R), TY + rr * Math.cos(lon * D2R)];
      // 하루 간격 눈금
      const w = M.omegaDeg(lat);
      const steps = st.mode === 'q3' ? 4 : dt;
      const dl = (lon1 - lon0) / steps;
      for (let d = 0; d <= steps; d++) {
        const lon = lon0 + dl * d, [tx, ty] = P(lon), [ox, oy] = P(lon, cr + 10);
        el('line', {x1: tx, y1: ty, x2: ox, y2: oy, stroke: '#0b7f9a', 'stroke-width': 2}, geo);
        el('line', {x1: tx, x2: tx, y1: yc - 7, y2: yc + 7, stroke: '#0b7f9a', 'stroke-width': 2}, geo);
        if (d > 0 && d < steps && !tall) el('text', {x: ox + Math.sin(lon * D2R) * 12, y: oy + 14, 'text-anchor': 'middle', 'font-size': fs * 0.8, fill: '#0b7f9a'}, geo, `${d}일`);
      }
      // 각도
      const [x0, y0] = P(lon0), [x1, y1] = P(lon1);
      el('path', {d: `M${FX} ${TY}L${x0} ${y0}M${FX} ${TY}L${x1} ${y1}`, stroke: '#14283a', 'stroke-width': 1.6}, geo);
      const arc = (a0, a1, rr, color, label, dy = 0) => {
        const pts = [];
        for (let i = 0; i <= 30; i++) pts.push(P(a0 + (a1 - a0) * i / 30, rr));
        el('path', {d: pathOf(pts), fill: 'none', stroke: color, 'stroke-width': 2.4}, geo);
        const [lx, ly] = P((a0 + a1) / 2, rr + 16);
        el('text', {x: lx, y: ly + 5 + dy, 'text-anchor': 'middle', 'font-size': fs, 'font-weight': 800, fill: color, class: 'halo'}, geo, label);
      };
      if (st.mode === 'q3') arc(lon0, lon1, cr * 0.42, '#c2581c', 'θ = 50°');
      else if (lon0 < 0 && lon1 > 0) { arc(lon0, 0, cr * 0.3, '#e8590c', 'α'); arc(0, lon1, cr * 0.3, '#c2185b', 'β'); arc(lon0, lon1, cr * 0.55, '#14283a', 'θ'); }
      else { arc(0, lon0, cr * 0.3, '#e8590c', 'α'); arc(0, lon1, cr * 0.44, '#c2185b', 'β'); arc(lon0, lon1, cr * 0.62, '#14283a', 'θ'); }
      // 정면과 위의 위치를 잇는 세로 점선
      [[lon0, '#e8590c', '처음'], [lon1, '#c2185b', '나중']].forEach(([lon, color, name]) => {
        const [tx, ty] = P(lon);
        el('line', {x1: tx, x2: tx, y1: yc, y2: ty, stroke: color, 'stroke-width': 1.2, 'stroke-dasharray': '3 4'}, geo);
        el('circle', {cx: tx, cy: yc, r: 6, fill: color}, geo);
        el('circle', {cx: tx, cy: ty, r: 6, fill: color}, geo);
        if (st.mode !== 'q3') el('text', {x: tx, y: yc + (lon === lon0 ? -14 : 24), 'text-anchor': 'middle', 'font-size': fs * 0.85, 'font-weight': 700, fill: color, class: 'halo'}, geo, name);
      });
      if (st.mode !== 'q3') {
        // x, y: 중앙 경선 방향(세로선)에서 두 위치까지의 가로 거리 — 정면 그림의 x, y 와 같다
        const dim = (xa, xb, yy, label, color) => {
          el('path', {d: `M${xa} ${yy}H${xb}`, stroke: color, 'stroke-width': 2.4, fill: 'none'}, geo);
          el('text', {x: (xa + xb) / 2, y: yy - 7, 'text-anchor': 'middle', 'font-size': fs, 'font-weight': 800, fill: color, class: 'halo'}, geo, label);
        };
        dim(x0, FX, y0, 'x', '#e8590c');
        dim(FX, x1, y1, 'y', '#c2185b');
      }
      // 움직이는 흑점
      if (progress !== undefined && progress < 1) {
        const lon = lon0 + (lon1 - lon0) * progress, [tx, ty] = P(lon);
        el('circle', {cx: tx, cy: ty, r: 9, fill: '#14283a', stroke: '#fff', 'stroke-width': 2}, geo);
        el('circle', {cx: tx, cy: yc, r: 9, fill: '#14283a', stroke: '#fff', 'stroke-width': 2}, geo);
      }
      let t;
      if (st.mode === 'q3') t = `위에서 보면 흑점은 4일 동안 위도 원을 따라 <b>50°</b> 돌았습니다. 하루에 12.5°씩 돌았으니, 360°를 도는 데는 360° ÷ 12.5° = 28.8일이 걸립니다.`;
      else {
        t = (example ? '<b>예시 그림</b>입니다. 사진에서 흑점의 두 위치를 표시하면 그 흑점의 그림으로 바뀝니다. ' : '')
          + `정면에서 보면 흑점이 위도선(가로선)을 따라 곧게 움직이는 것 같지만, 위에서 보면 반지름 R′인 <b>위도 원을 따라 돌고</b> 있습니다. 하루 간격 눈금(청록)을 보면 원 위에서는 같은 각도(하루에 약 ${num(w, 1)}°)씩 돌지만, 원반 위에서는 가운데에서 길게, 가장자리로 갈수록 짧게 움직여 보입니다. 그래서 원반 위의 거리 대신 <b>sin α = ${frac('x', 'R′')}, sin β = ${frac('y', 'R′')}</b>로 각을 구합니다.`;
        if (lon0 * lon1 > 0) t += ' 이번 흑점은 두 위치가 중앙 경선의 같은 쪽에 있어 <b>θ = β − α</b>입니다(교과서 예시는 양쪽에 있어 θ = α + β).';
      }
      if (example) el('text', {x: 626, y: 26, 'text-anchor': 'end', 'font-size': fs * 0.9, 'font-weight': 800, fill: '#c2581c'}, geo, '예시 그림');
      $('s2-geo-insight').innerHTML = t;
    }

    // 표 (교과서 60쪽 스프레드시트와 같은 칸)
    const COLS = [
      {k: 'dt', h: '시간 간격', u: '[일]', step: 0, d: 0},
      {k: 'Rp', h: 'R′', u: '[cm]', step: 0, d: 2},
      {k: 'x', h: 'x', u: '[cm]', step: 0, d: 2},
      {k: 'y', h: 'y', u: '[cm]', step: 0, d: 2},
      {k: 'sx', h: frac('x', 'R′'), step: 1, d: 3},
      {k: 'sy', h: frac('y', 'R′'), step: 1, d: 3},
      {k: 'aRad', h: `sin<sup>−1</sup>(${frac('x', 'R′')})`, u: '[rad]', step: 2, d: 3},
      {k: 'bRad', h: `sin<sup>−1</sup>(${frac('y', 'R′')})`, u: '[rad]', step: 2, d: 3},
      {k: 'alpha', h: 'α', u: '[°]', step: 3, d: 2},
      {k: 'beta', h: 'β', u: '[°]', step: 3, d: 2},
      {k: 'theta', h: 'θ', u: '[°]', step: 4, d: 2},
      {k: 'P', h: 'P', u: '[일]', step: 5, d: 2}
    ];
    function rowLabel(meas) {
      if (st.mode === 'q3') return '확인 문제 3';
      if (st.set.book) return `흑점 ${st.set.book}`;
      const lat = meas.m.latDeg;
      return `연습 흑점 (${lat >= 0 ? '북위' : '남위'} ${num(Math.abs(lat), 0)}°)`;
    }
    function renderTable() {
      const meas = measurement(), wrap = $('s2-table'), vertical = small();
      $('s2-next').disabled = !meas.ok || st.reveal >= maxStep();
      $('s2-all').disabled = !meas.ok || st.reveal >= maxStep();
      const rows = [];
      if (meas.ok) {
        const r = meas.row, cells = {};
        COLS.forEach(c => {
          let v;
          if (st.mode === 'q3') {
            if (c.k === 'dt') v = {t: '4', cls: ''};
            else if (c.k === 'theta') v = {t: '50', cls: ''};
            else if (c.k === 'P') v = st.reveal >= 1 ? {t: num(r.P, 1), cls: st.reveal === 1 ? 'ans new' : 'ans'} : {t: '?', cls: 'blank'};
            else v = {t: '—', cls: 'blank'};
          } else if (c.step > st.reveal) v = {t: '?', cls: 'blank'};
          else v = {t: c.k === 'dt' ? String(r.dt) : num(r[c.k], c.d), cls: (c.step === st.reveal && c.step > 0 ? 'new ' : '') + (c.k === 'P' ? 'ans' : '')};
          cells[c.k] = v;
        });
        rows.push({label: rowLabel(meas), cells, cls: 'cur'});
        if (st.set.book) {
          const t = meas.book, bc = {};
          COLS.forEach(c => { bc[c.k] = {t: c.k === 'dt' ? (t.printedDt ? `${t.printedDt}*` : String(t.dt)) : num(t[c.k], 2), cls: ''}; });
          rows.push({label: '교과서 표', cells: bc, cls: 'book'});
        }
      }
      if (st.mode === 'practice') {
        st.results.filter(r => r.seed === st.seed && !(meas.ok && meas.spot && r.id === meas.spot.id)).forEach(r => {
          const c = {};
          COLS.forEach(col => { c[col.k] = {t: col.k === 'dt' ? String(r.row.dt) : num(r.row[col.k], col.d), cls: col.k === 'P' ? 'ans' : ''}; });
          rows.push({label: `기록 (${r.lat >= 0 ? '북' : '남'} ${num(Math.abs(r.lat), 0)}°)`, cells: c, cls: 'rec'});
        });
      }
      if (!rows.length) { wrap.innerHTML = '<p class="micro" style="padding:6px 0 4px">흑점의 처음·나중 위치를 표시하면 R′, x, y가 표에 들어갑니다.</p>'; renderExplain(meas); return; }
      let html;
      if (vertical) {
        html = `<table class="calc vertical"><thead><tr><th>칸</th>${rows.map(r => `<th>${r.label}</th>`).join('')}</tr></thead><tbody>` +
          COLS.map(c => `<tr><th>${c.h} <span class="u" style="display:inline">${c.u || ''}</span></th>${rows.map(r => `<td class="${r.cells[c.k].cls}">${r.cells[c.k].t}</td>`).join('')}</tr>`).join('') + '</tbody></table>';
      } else {
        html = `<table class="calc"><thead><tr><th>흑점</th>${COLS.map(c => `<th>${c.h}${c.u ? `<span class="u">${c.u}</span>` : ''}</th>`).join('')}</tr></thead><tbody>` +
          rows.map(r => `<tr class="${r.cls}"><td>${r.label}</td>${COLS.map(c => `<td class="${r.cells[c.k].cls}">${r.cells[c.k].t}</td>`).join('')}</tr>`).join('') + '</tbody></table>';
      }
      if (st.set.book === 'B') html += '<p class="micro" style="padding:4px 0 0">* 교과서 표의 시간 간격 칸에는 ‘96’으로 인쇄되어 있습니다. 96시간 = 4일이고, Δt = 4일이어야 P = 26.08일이 나옵니다.</p>';
      wrap.innerHTML = html;
      renderExplain(meas);
    }
    function renderExplain(meas) {
      const ex = $('s2-explain');
      if (!meas.ok) { ex.innerHTML = '두 사진에서 같은 흑점의 위치를 표시한 뒤 ‘다음 칸 계산’을 눌러 한 칸씩 계산해 보세요.'; return; }
      const r = meas.row, s = st.reveal;
      if (st.mode === 'q3') {
        ex.innerHTML = s < 1 ? '흑점이 4일 동안 50° 돌았습니다. 360°를 도는 데 며칠이 걸릴까요? ‘다음 칸 계산’을 눌러 보세요.'
          : `<span class="eq">θ : Δt = 360° : P &nbsp;→&nbsp; 50° : 4일 = 360° : P</span><br><span class="eq big">P = ${frac('360°', 'θ')} × Δt = ${frac('360°', '50°')} × 4일 = <b>28.8일</b></span>`;
        return;
      }
      const same = r.sameSide;
      const lines = [];
      lines.push(`잰 값: Δt = ${r.dt}일, R′ = ${num(r.Rp, 2)} cm, x = ${num(r.x, 2)} cm, y = ${num(r.y, 2)} cm`);
      if (s >= 1) lines.push(`<span class="eq">① sin α = ${frac('x', 'R′')} = ${frac(num(r.x, 2), num(r.Rp, 2))} = ${num(r.sx, 3)}, &nbsp; sin β = ${frac('y', 'R′')} = ${frac(num(r.y, 2), num(r.Rp, 2))} = ${num(r.sy, 3)}</span>`);
      if (s >= 2) lines.push(`② α = sin<sup>−1</sup>(${num(r.sx, 3)}) = ${num(r.aRad, 3)} rad, &nbsp; β = sin<sup>−1</sup>(${num(r.sy, 3)}) = ${num(r.bRad, 3)} rad <span class="micro">(스프레드시트의 ASIN 함수는 라디안으로 답합니다)</span>`);
      if (s >= 3) lines.push(`<span class="eq">③ 도(°)로 바꾸기: α = ${num(r.aRad, 3)} × ${frac('180°', 'π')} = ${num(r.alpha, 2)}°, &nbsp; β = ${num(r.beta, 2)}°</span>`);
      if (s >= 4) lines.push(same ? `④ 두 위치가 중앙 경선의 같은 쪽에 있으므로 θ = β − α = ${num(r.beta, 2)}° − ${num(r.alpha, 2)}° = <b>${num(r.theta, 2)}°</b>`
        : `④ 흑점의 이동각 θ = α + β = ${num(r.alpha, 2)}° + ${num(r.beta, 2)}° = <b>${num(r.theta, 2)}°</b>`);
      if (s >= 5) {
        lines.push(`<span class="eq big">⑤ θ : Δt = 360° : P &nbsp;→&nbsp; P = ${frac('360°', 'θ')} × Δt = ${frac('360°', num(r.theta, 2) + '°')} × ${r.dt}일 = <b>${num(r.P, 2)}일</b></span>`);
        if (st.set.book) lines.push(`<span class="micro">교과서 표의 값은 ${num(meas.book.P, 2)}일입니다. 끝자리가 조금 다른 것은 교과서가 반올림하기 전의 측정값으로 계산했기 때문입니다.</span>`);
        else if (meas.spot) lines.push(`<span class="micro">이 연습 흑점의 실제(모형) 자전 주기는 ${num(meas.spot.P, 2)}일입니다. 길이를 0.01 cm까지 반올림해 재서 조금 차이가 날 수 있습니다.</span>`);
      } else lines.push('<span class="micro">‘다음 칸 계산’을 누르면 다음 칸을 채웁니다.</span>');
      ex.innerHTML = lines.join('<br>');
    }
    function afterReveal() {
      const meas = measurement();
      if (meas.ok && st.mode === 'practice' && st.reveal >= MAXSTEP && meas.spot) {
        if (!st.results.some(r => r.seed === st.seed && r.id === meas.spot.id))
          st.results.push({seed: st.seed, id: meas.spot.id, lat: meas.m.latDeg, P: meas.row.P, theta: meas.row.theta, dt: meas.row.dt, row: meas.row});
      }
      renderExplain(meas);
      renderChart();
    }

    function renderChart() {
      clear(chart);
      const tall = small();
      chart.setAttribute('viewBox', `0 0 640 ${tall ? 440 : 340}`);
      const box = {l: tall ? 100 : 70, r: 620, t: tall ? 52 : 38, b: tall ? 356 : 276};
      const xs = lin(0, 90, box.l, box.r), ys = lin(22, 36, box.b, box.t);
      el('rect', {x: xs(50), y: box.t, width: xs(90) - xs(50), height: box.b - box.t, fill: '#f1f4f5'}, chart);
      frame(chart, box, xs, ys, {
        xTicks: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90].filter(v => !tall || v % 20 === 0 || v === 90 && false).map(v => ({v, label: `${v}°`})),
        yTicks: [22, 24, 26, 28, 30, 32, 34, 36].filter(v => !tall || v % 4 === 0).map(v => ({v, label: `${v}`})),
        xLabel: '위도 (북위·남위)', yLabel: tall ? '자전 주기 (일)' : '자전 주기 P (일)'
      });
      el('text', {x: (xs(50) + xs(90)) / 2, y: box.t + 18, 'text-anchor': 'middle', class: 'tick'}, chart, '흑점이 거의 없는 위도');
      // 교과서의 말
      el('line', {x1: xs(0), x2: xs(18), y1: ys(25), y2: ys(25), stroke: '#c2581c', 'stroke-width': 2, 'stroke-dasharray': '6 4'}, chart);
      el('text', {x: xs(1), y: ys(25) - 8, class: 'annot halo', fill: '#c2581c'}, chart, '교과서: 적도 약 25일');
      el('line', {x1: xs(55), x2: xs(90), y1: ys(30), y2: ys(30), stroke: '#c2581c', 'stroke-width': 2, 'stroke-dasharray': '6 4'}, chart);
      el('text', {x: xs(89), y: ys(30) + (tall ? 30 : 20), 'text-anchor': 'end', class: 'annot halo', fill: '#c2581c'}, chart, '고위도 30일 이상');
      const res = st.results;
      if (st.model || res.length >= 3) {
        const pts = [];
        for (let l = 0; l <= 90; l += 1) pts.push([xs(l), ys(M.rotationPeriod(l))]);
        el('path', {d: pathOf(pts), fill: 'none', stroke: '#8a96a3', 'stroke-width': 2.4, opacity: 0.85}, chart);
        el('text', {x: xs(70), y: ys(M.rotationPeriod(70)) - 12, 'text-anchor': 'middle', class: 'annot halo', fill: '#5f7282'}, chart, '태양의 차등 자전(모형)');
      }
      if (res.length >= 2) {
        const p0 = res.reduce((a, r) => Math.abs(r.lat) < Math.abs(a.lat) ? r : a, res[0]);
        el('line', {x1: xs(0), x2: xs(90), y1: ys(p0.P), y2: ys(p0.P), stroke: '#14283a', 'stroke-width': 1.4, 'stroke-dasharray': '2 5'}, chart);
        el('text', {x: xs(52), y: ys(p0.P) - 8, class: 'annot halo', fill: '#14283a'}, chart, '고체처럼 함께 돈다면 (모든 위도가 같은 주기)');
      }
      res.forEach(r => {
        const x = xs(Math.abs(r.lat)), y = ys(clamp(r.P, 22, 36)), north = r.lat >= 0;
        if (north) el('path', {d: `M${x} ${y - 8}L${x + 7.5} ${y + 5}L${x - 7.5} ${y + 5}Z`, fill: '#e8590c', stroke: '#fff', 'stroke-width': 1.5}, chart);
        else el('path', {d: `M${x} ${y + 8}L${x + 7.5} ${y - 5}L${x - 7.5} ${y - 5}Z`, fill: '#c2185b', stroke: '#fff', 'stroke-width': 1.5}, chart);
      });
      // 범례(그래프 밖 위쪽)
      const ly = tall ? 30 : 22, lw = tall ? 160 : 96;
      el('path', {d: `M${box.r - 2 * lw} ${ly + 4}l7 -12l7 12z`, fill: '#e8590c'}, chart);
      el('text', {x: box.r - 2 * lw + 18, y: ly + 4, class: 'tick'}, chart, '북반구 흑점');
      el('path', {d: `M${box.r - lw + 8} ${ly - 8}l7 12l7 -12z`, fill: '#c2185b'}, chart);
      el('text', {x: box.r - lw + 26, y: ly + 4, class: 'tick'}, chart, '남반구 흑점');
      // 통찰
      let t;
      if (!res.length) t = st.mode === 'practice'
        ? '연습 사진에서 흑점의 자전 주기를 끝까지(P 칸까지) 구하면 여기에 점이 찍힙니다. 위도가 다른 흑점을 여러 개 재 보세요. 🎲 새 연습 사진으로 다른 흑점도 잴 수 있습니다.'
        : '교과서 예시는 흑점의 위도가 나와 있지 않아 그래프에 넣지 않습니다. 연습 사진에서 위도가 다른 흑점을 재 보세요.';
      else if (res.length === 1) t = `위도 ${num(Math.abs(res[0].lat), 0)}°의 흑점: 자전 주기 <b>${num(res[0].P, 1)}일</b>. 위도가 다른 흑점도 재어 비교해 보세요.`;
      else {
        const lo = res.reduce((a, r) => Math.abs(r.lat) < Math.abs(a.lat) ? r : a), hi = res.reduce((a, r) => Math.abs(r.lat) > Math.abs(a.lat) ? r : a);
        const sameDt = lo.dt === hi.dt;
        t = `위도 ${num(Math.abs(lo.lat), 0)}°: <b>${num(lo.P, 1)}일</b>, 위도 ${num(Math.abs(hi.lat), 0)}°: <b>${num(hi.P, 1)}일</b>. 위도가 높을수록 자전 주기가 깁니다. `
          + (sameDt ? `같은 ${lo.dt}일 동안 저위도 흑점은 ${num(lo.theta, 1)}°, 고위도 흑점은 ${num(hi.theta, 1)}° 돌았습니다. 이동각이 클수록 자전 주기가 짧습니다. ` : '')
          + '이처럼 위도에 따라 자전 주기가 다른 것을 <b>차등 자전</b>이라고 합니다. 단단한 고체라면 모든 위도가 같은 주기로 돌아야 하므로, 차등 자전은 <b>태양이 기체로 이루어져 있다</b>는 것을 보여 줍니다.';
        if (Math.abs(hi.lat) - Math.abs(lo.lat) < 8) t += ' (두 흑점의 위도 차이가 작으면 주기 차이도 작습니다. 위도가 더 많이 다른 흑점을 재 보세요.)';
      }
      if (st.mode !== 'practice' && res.length) t += ' <span class="micro">(교과서 예시는 흑점의 위도가 나와 있지 않아 그래프에 넣지 않았습니다.)</span>';
      $('s2-chart-insight').innerHTML = t;
    }

    // 한 경선에서 함께 출발한 점들: 적도의 점을 기준으로 다른 위도의 점이 얼마나 뒤처지는지(차등 자전 모형)
    const band = $('s2-band');
    $('s2-days').addEventListener('input', e => { st.days = +e.target.value; renderBand(); });
    function renderBand() {
      const d = st.days || 0;
      clear(band);
      const C0 = 200, R0 = 170, fs = clamp(unitsFor(band, 400, 12.5), 11, 22);
      const defs = el('defs', {}, band);
      limbGradient(defs, 's2-band-ld', r => sunColor(0.35 + 0.65 * M.limbDarkening(Math.min(r, 0.9999))));
      el('circle', {cx: C0, cy: C0, r: R0, fill: 'url(#s2-band-ld)'}, band);
      // 고체라면: 처음 경선 그대로(적도의 점과 함께 돈다)
      el('line', {x1: C0, x2: C0, y1: C0 - R0, y2: C0 + R0, stroke: '#14283a', 'stroke-width': 1.5, 'stroke-dasharray': '5 5', opacity: 0.7}, band);
      const lag = lat => (M.omegaDeg(lat) - M.omegaDeg(0)) * d;    // 적도보다 뒤처진 각(°, 음수)
      const P = (lat, lon) => { const q = M.project(lat, lon); return {x: C0 + q.x * R0, y: C0 - q.y * R0, z: q.z}; };
      const pts = [];
      for (let lat = -80; lat <= 80; lat += 2) { const q = P(lat, lag(lat)); if (q.z > 0) pts.push([q.x, q.y]); else if (pts.length) { el('path', {d: pathOf(pts), fill: 'none', stroke: '#c2185b', 'stroke-width': 3}, band); pts.length = 0; } }
      if (pts.length) el('path', {d: pathOf(pts), fill: 'none', stroke: '#c2185b', 'stroke-width': 3}, band);
      [-75, -60, -45, -30, -15, 0, 15, 30, 45, 60, 75].forEach(lat => {
        const q = P(lat, lag(lat));
        if (q.z <= 0) return;
        el('circle', {cx: q.x, cy: q.y, r: lat === 0 ? 7 : 5.5, fill: lat === 0 ? '#14283a' : '#c2185b', stroke: '#fff', 'stroke-width': 1.5}, band);
        if (lat >= 0 && lat % 30 === 0 && d > 0) el('text', {x: q.x + 9, y: q.y + 4, 'font-size': fs, 'font-weight': 800, fill: '#fff', class: 'dark-halo'}, band, lat === 0 ? '적도' : `${lat}°`);
      });
      $('s2-days-out').textContent = `${num(d, 1)}일`;
      const l60 = -lag(60), l30 = -lag(30), turn = M.omegaDeg(0) * d;
      $('s2-band-insight').innerHTML = d === 0
        ? '오른쪽 그림: 처음에는 모든 점이 한 경선(점선) 위에 있습니다. 날수를 늘려 보세요. 태양이 고체라면 점들은 한 줄 그대로 함께 돕니다.'
        : `${num(d, 1)}일 동안 적도의 점은 ${num(turn, 0)}°${turn >= 360 ? '(한 바퀴 넘게)' : ''} 돌았고, 위도 30°의 점은 그보다 ${num(l30, 0)}°, 위도 60°의 점은 ${num(l60, 0)}° 뒤처졌습니다. 고체라면 점들이 점선처럼 한 줄 그대로 돌았을 것입니다. <b>위도가 높을수록 천천히 돌아</b> 줄이 휘어집니다(차등 자전). 적도의 자전 주기는 약 ${num(M.rotationPeriod(0), 1)}일, 위도 60°는 약 ${num(M.rotationPeriod(60), 1)}일입니다.`;
    }

    function renderAll() {
      setPressed($('s2-modes'), 'data-mode', st.mode);
      $('s2-new').hidden = st.mode !== 'practice';
      $('s2-clear').disabled = st.mode === 'q3';
      $('s2-grid').disabled = st.mode === 'q3';
      document.querySelectorAll('#s2-photo button').forEach(b => { b.disabled = st.mode === 'q3'; });
      renderPhoto(); renderReadout(); renderNote(); renderGeo(st.animT0 === null ? undefined : 0); renderTable(); renderChart(); renderBand();
    }
    function tick(now) {
      if (st.animT0 === null) return;
      const p = (now - st.animT0) / 2600;
      if (p >= 1) { st.animT0 = null; renderGeo(); return; }
      renderGeo(p < 0.08 ? 0 : (p - 0.08) / 0.92);
    }
    function render() { if (!st.set) { load('practice'); return; } renderAll(); }
    return {render, tick, animating: () => st.animT0 !== null};
  })();

  // ═══════════════ 03 파장별로 본 태양 ═══════════════
  stations.s3 = (() => {
    const S = 420, C = 210, RS = 140;  // 그림 크기, 원반 중심, 원반 반지름(px)
    const WL = M.WAVELENGTHS;
    const st = {wl: 'vis', pick: null, flareT0: null, built: false, moon: 1, cyc: 'max', layer: 'corona', lastFlare: 0};
    // 가상의 활동 영역: 앞쪽(서쪽)·뒤쪽 극의 위치. 흑점은 활동 영역의 두 극에 짝지어 생긴다.
    const ARS = [
      {lat: 16, lon: -30, sep: 10, tilt: 4, s: 1.0, spots: true, hot: 1.0, flare: true},
      {lat: -12, lon: 16, sep: 8, tilt: -3, s: 0.75, spots: true, hot: 0.55},
      {lat: 24, lon: 47, sep: 6, tilt: 5, s: 0.5, spots: true, hot: 0.2},
      {lat: -7, lon: -60, sep: 9, tilt: 0, s: 0.55, spots: false, hot: 0.05}
    ];
    const vec = (lat, lon) => { const p = M.project(lat, lon); return [p.x, p.y, p.z]; };
    ARS.forEach(a => { a.F = vec(a.lat - a.tilt / 2, a.lon - a.sep / 2); a.L = vec(a.lat + a.tilt / 2, a.lon + a.sep / 2); a.c = vec(a.lat, a.lon); });
    const SPOTS3 = [];
    ARS.forEach(a => {
      if (!a.spots) return;
      SPOTS3.push({lat: a.lat + a.tilt / 2, lon: a.lon + a.sep / 2, u: 1.25 * a.s + 0.2, p: 2.8 * a.s + 0.5});
      SPOTS3.push({lat: a.lat - a.tilt / 2, lon: a.lon - a.sep / 2 + 1, u: 0.8 * a.s + 0.15, p: 1.9 * a.s + 0.4});
    });
    const CH = [{lat: 90, lon: 0, r: 26}, {lat: -90, lon: 0, r: 20}, {lat: 33, lon: 6, r: 9}];
    CH.forEach(h => { h.v = vec(h.lat, h.lon); });
    const FIL = [[-31, 24], [-29.5, 31], [-28.5, 38], [-28.8, 45], [-30, 52]].map(([la, lo]) => vec(la, lo));
    const PROM = {lat: 26, lon: -90};  // 동쪽 가장자리의 홍염
    const RAMPS = {
      vis: ramp([[0, [0, 0, 0]], [0.12, [60, 22, 4]], [0.35, [176, 72, 16]], [0.65, [238, 146, 52]], [0.85, [252, 196, 110]], [1, [255, 226, 160]]]),
      uv304: ramp([[0, [0, 0, 0]], [0.18, [74, 6, 4]], [0.42, [186, 40, 10]], [0.68, [244, 118, 36]], [0.88, [255, 200, 120]], [1, [255, 248, 228]]]),
      uv193: ramp([[0, [0, 0, 0]], [0.22, [60, 34, 12]], [0.48, [150, 94, 40]], [0.74, [222, 176, 108]], [1, [255, 248, 232]]]),
      x94: ramp([[0, [0, 0, 0]], [0.25, [6, 54, 18]], [0.5, [34, 140, 56]], [0.76, [130, 226, 136]], [1, [242, 255, 242]]])
    };
    const FLARE_GAIN = {vis: 0.04, uv304: 0.9, uv193: 0.85, x94: 1.25};
    const cache = {}, fields = {};
    let quiet = {};

    function makeNoise3(seed) {
      const r = M.rng(seed), P = new Uint8Array(512), V = new Float32Array(256), perm = [];
      for (let i = 0; i < 256; i++) perm.push(i);
      for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
      for (let i = 0; i < 512; i++) P[i] = perm[i & 255];
      for (let i = 0; i < 256; i++) V[i] = r();
      const f = t => t * t * (3 - 2 * t);
      return (x, y, z) => {
        const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
        const u = f(x - xi), v = f(y - yi), w = f(z - zi);
        const X = xi & 255, Y = yi & 255, Z = zi & 255, X1 = (X + 1) & 255, Y1 = (Y + 1) & 255, Z1 = (Z + 1) & 255;
        const h = (a, b, c) => V[P[P[P[a] + b] + c]];
        const l = (a, b, t) => a + (b - a) * t;
        return l(l(l(h(X, Y, Z), h(X1, Y, Z), u), l(h(X, Y1, Z), h(X1, Y1, Z), u), v),
                 l(l(h(X, Y, Z1), h(X1, Y, Z1), u), l(h(X, Y1, Z1), h(X1, Y1, Z1), u), v), w);
      };
    }

    function build() {
      if (st.built) return;
      st.built = true;
      const N = S * S, noise = makeNoise3(5);
      const fbm = (x, y, z, o) => { let s = 0, a = 1, n = 0; for (let k = 0; k < o; k++) { s += a * noise(x, y, z); n += a; a *= 0.5; x *= 2.03; y *= 2.03; z *= 2.03; } return s / n; };
      ['vis', 'uv304', 'uv193', 'x94'].forEach(k => { fields[k] = new Float32Array(N); });
      fields.kind = new Uint8Array(N);   // 0 바깥, 1 조용한 곳, 2 활동 영역, 3 흑점, 4 코로나가 어두운 곳
      const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
      const spotV = SPOTS3.map(s => ({v: vec(s.lat, s.lon), u: s.u, p: s.p, near: Math.cos((s.p + 0.6) * D2R)}));
      // 흑점의 경계를 한 픽셀쯤 부드럽게(계단 모양 방지)
      const EDGE = 0.22;
      const spotAt = d => (s => d < s.u - EDGE ? UMBRA_I : d < s.u + EDGE ? UMBRA_I + (PENUMBRA_I - UMBRA_I) * (d - s.u + EDGE) / (2 * EDGE)
        : d < s.p - EDGE ? PENUMBRA_I : d < s.p + EDGE ? PENUMBRA_I + (1 - PENUMBRA_I) * (d - s.p + EDGE) / (2 * EDGE) : 1);
      const coneD = (cosA) => 1 - cosA;
      const SP = coneD(Math.cos(5.5 * D2R)), SW = coneD(Math.cos(11 * D2R)), SC = coneD(Math.cos(3.2 * D2R));
      const v304 = [], v193 = [], v94 = [];
      const D = [0, 0, 0, 0, 0], O = [0, 0, 0, 0];
      // 필라멘트(어두운 줄) 위의 점들과 그 둘레만 검사하는 원뿔
      const filPts = [];
      for (let k = 0; k < FIL.length - 1; k++) for (let t = 0; t <= 1.0001; t += 0.1) { const a = FIL[k], b = FIL[k + 1]; filPts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]); }
      const filMid = (() => { const m = FIL[Math.floor(FIL.length / 2)]; return m; })(), filCos = Math.cos(22 * D2R);
      const chCos = CH.map(h => Math.cos(Math.min(179, h.r * 1.25 + 10) * D2R));
      // 코로나 줄기의 밝기는 방향(각)에만 달려 있으므로 미리 표로 만든다
      const STREAM = new Float32Array(1441), FRINGE = new Float32Array(1441);
      for (let k = 0; k <= 1440; k++) { const ang = -Math.PI + 2 * Math.PI * k / 1440; STREAM[k] = 0.55 + 0.45 * Math.cos(2 * ang) ** 2 + 0.25 * noise(Math.cos(ang) * 3 + 20, Math.sin(ang) * 3, 1.5); FRINGE[k] = 0.7 + 0.3 * noise(ang * 40, 3, 3); }
      function diskAt(x, y) {
        const rr = x * x + y * y;
        {
          const z = Math.sqrt(Math.max(0, 1 - rr)), p = [x, y, z], mu = z;
          const n1 = fbm(x * 3 + 11, y * 3, z * 3, 2), n2 = noise(x * 13, y * 13, z * 13 + 7), n3 = fbm(x * 6 - 4, y * 6, z * 6, 2);
          let plage = 0, wide = 0, core = 0;
          ARS.forEach(a => {
            plage += a.s * (Math.exp(-(1 - dot(p, a.F)) / SP) + Math.exp(-(1 - dot(p, a.L)) / SP));
            wide += a.s * Math.exp(-(1 - dot(p, a.c)) / SW);
            core += a.hot * Math.exp(-(1 - dot(p, a.c)) / SC);
          });
          let spot = 1;
          spotV.forEach(s => { const c = dot(p, s.v); if (c > s.near) spot = Math.min(spot, spotAt(Math.acos(clamp(c, -1, 1)) * R2D)(s)); });
          let ch = 0;
          // 코로나가 어두운 곳: 가장자리를 들쭉날쭉하게(극지방 쪽은 특히)
          CH.forEach((h, j) => {
            const c = dot(p, h.v);
            if (c < chCos[j]) return;
            const d = Math.acos(clamp(c, -1, 1)) * R2D + (Math.abs(h.lat) > 60 ? 16 : 5) * (n1 - 0.5);
            ch = Math.max(ch, 1 - M.smoothstep(h.r * 0.65, h.r * 1.25, d));
          });
          let fil = 0;
          if (dot(p, filMid) > filCos) {
            let best = Infinity;
            for (const q of filPts) { const dx = p[0] - q[0], dy = p[1] - q[1], dz = p[2] - q[2], d2 = dx * dx + dy * dy + dz * dz; if (d2 < best) best = d2; }
            if (best < 0.0025) fil = Math.exp(-best / (0.016 * 0.016));
          }
          const ld = M.limbDarkening(Math.min(0.99999, Math.sqrt(rr)));
          const net = Math.pow(1 - Math.abs(2 * n3 - 1), 3);
          D[0] = ld * spot * (1 + 0.035 * (n2 - 0.5)) + 0.18 * Math.min(1, plage) * (1 - mu) ** 2 * (spot === 1 ? 1 : 0);
          D[1] = (0.2 + 0.42 * net + 0.12 * n2 + 0.75 * Math.min(1.3, plage) + 0.28 * (1 - mu) ** 3) * (1 - 0.55 * fil) * (1 - 0.25 * ch);
          D[2] = (0.2 + 0.16 * n1 + 0.08 * n2 + 0.95 * Math.min(1.5, wide) + 0.12 * (1 - mu) ** 2) * (1 - 0.7 * ch) * (1 - 0.35 * fil);
          D[3] = (0.05 + 0.05 * n1 + 0.12 * Math.min(1.2, wide) + 0.85 * core) * (1 - 0.7 * ch);
          D[4] = spot < 0.9 ? 3 : ch > 0.5 ? 4 : wide > 0.35 ? 2 : 1;
          if (wide < 0.15 && ch < 0.2) { v304.push(D[1]); v193.push(D[2]); v94.push(D[3]); }
        }
      }
      function offAt(x, y) {
        const r = Math.hypot(x, y), ang = Math.atan2(y, x), h = Math.max(0, r - 1);
        const ai = Math.round((ang + Math.PI) / (2 * Math.PI) * 1440), stream = STREAM[ai];
        O[0] = 0;
        O[1] = h < 0.03 ? 0.75 * (1 - h / 0.03) * FRINGE[ai] + 0.06 : 0.08 * Math.exp(-(h - 0.03) / 0.04);
        O[2] = 0.55 * stream * Math.exp(-h / 0.11) * (1 - 0.4 * M.smoothstep(0.75, 1, Math.abs(Math.sin(ang))));
        O[3] = 0.05 * Math.exp(-h / 0.08);
      }
      const KEYS = ['vis', 'uv304', 'uv193', 'x94'];
      for (let py = 0; py < S; py++) for (let px = 0; px < S; px++) {
        const i = py * S + px, x = (px + 0.5 - C) / RS, y = -(py + 0.5 - C) / RS, r = Math.hypot(x, y);
        // 가장자리 한 픽셀은 원반과 바깥을 섞어 매끄럽게
        const cov = clamp((1 - r) * RS + 0.5, 0, 1);
        if (cov > 0) { const k = r > 0.9999 ? 0.9999 / r : 1; diskAt(x * k, y * k); }
        if (cov < 1) { const k = r < 1.0001 ? 1.0001 / Math.max(r, 1e-6) : 1; offAt(x * k, y * k); }
        for (let k = 0; k < 4; k++) fields[KEYS[k]][i] = cov >= 1 ? D[k] : cov <= 0 ? O[k] : D[k] * cov + O[k] * (1 - cov);
        fields.kind[i] = cov >= 0.5 ? D[4] : 0;
      }
      const med = a => { const s = a.slice().sort((p, q) => p - q); return s[Math.floor(s.length / 2)] || 1; };
      quiet = {vis: 1, uv304: med(v304), uv193: med(v193), x94: med(v94)};
      // 색으로 바꾸고 고리·홍염·스피큘을 그린다
      const NORM = {vis: 1, uv304: 1.6, uv193: 1.6, x94: 1.1}, GAMMA = {vis: 1, uv304: 0.8, uv193: 0.75, x94: 0.7};
      ['vis', 'uv304', 'uv193', 'x94'].forEach(k => {
        const cv = document.createElement('canvas'); cv.width = S; cv.height = S;
        const ctx = cv.getContext('2d'), im = ctx.createImageData(S, S), b32 = new Uint32Array(im.data.buffer), lut = lut32(RAMPS[k]);
        const f = fields[k], G = new Uint8Array(1025);
        for (let j = 0; j <= 1024; j++) G[j] = Math.round(255 * Math.pow(j / 1024, GAMMA[k]));
        const sc = 1024 / NORM[k];
        for (let i = 0; i < N; i++) { const v = f[i] * sc; b32[i] = lut[G[v <= 0 ? 0 : v >= 1024 ? 1024 : v | 0]]; }
        ctx.putImageData(im, 0, 0);
        decorate(ctx, k);
        cache[k] = cv;
      });
    }
    const toPx = p => [C + p[0] * RS, C - p[1] * RS];
    // 활동 영역의 두 극을 잇는 고리 (위로 솟은 반원). 뒤쪽(보이지 않는 반구)은 그리지 않는다.
    function loopPts(a, b, hgt, n = 26) {
      const pts = [];
      for (let i = 0; i <= n; i++) {
        const t = i / n, q = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
        const len = Math.hypot(...q), lift = 1 + hgt * Math.sin(Math.PI * t);
        const v = [q[0] / len * lift, q[1] / len * lift, q[2] / len * lift];
        pts.push(v);
      }
      return pts;
    }
    function strokeLoop(ctx, pts) {
      ctx.beginPath();
      let pen = false;
      pts.forEach(v => {
        const vis = v[2] > 0 || Math.hypot(v[0], v[1]) > 1;
        const [x, y] = toPx(v);
        if (vis) { if (pen) ctx.lineTo(x, y); else { ctx.moveTo(x, y); pen = true; } } else pen = false;
      });
      ctx.stroke();
    }
    function decorate(ctx, k) {
      const r = M.rng(77);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      if (k === 'uv193' || k === 'x94' || k === 'uv304') {
        ARS.forEach(a => {
          const n = k === 'uv193' ? 26 : k === 'x94' ? (a.hot > 0.5 ? 9 : a.hot > 0.15 ? 3 : 0) : 8;
          for (let j = 0; j < n; j++) {
            const jit = () => (r() - 0.5) * (k === 'x94' ? 0.04 : 0.08) * a.s;
            const A = [a.F[0] + jit(), a.F[1] + jit(), a.F[2] + jit()], B = [a.L[0] + jit(), a.L[1] + jit(), a.L[2] + jit()];
            const hgt = (k === 'x94' ? 0.03 : k === 'uv304' ? 0.015 : 0.06) * (0.4 + r() * 1.4) * (0.7 + a.s * 0.5);
            const col = k === 'uv193' ? `rgba(255,214,150,${0.06 + 0.08 * a.s})` : k === 'x94' ? `rgba(190,255,190,${0.12 + 0.2 * a.hot})` : `rgba(255,170,90,${0.1 + 0.08 * a.s})`;
            ctx.strokeStyle = col; ctx.lineWidth = k === 'uv193' ? 1 + r() * 1.4 : 1 + r() * 0.8;
            strokeLoop(ctx, loopPts(A, B, hgt));
          }
        });
      }
      if (k === 'uv304') {
        // 스피큘: 가장자리의 짧은 불꽃
        ctx.strokeStyle = 'rgba(255,140,70,0.35)'; ctx.lineWidth = 1;
        for (let a = 0; a < 360; a += 1.6) {
          const t = a * D2R, l = 1.012 + r() * 0.022;
          ctx.beginPath(); ctx.moveTo(C + Math.cos(t) * RS * 0.998, C - Math.sin(t) * RS * 0.998); ctx.lineTo(C + Math.cos(t) * RS * l, C - Math.sin(t) * RS * l); ctx.stroke();
        }
        drawProminence(ctx, 'rgba(255,150,80,', 1);
      }
      ctx.restore();
    }
    function drawProminence(ctx, rgbaHead, scale) {
      const r = M.rng(31);
      for (let j = 0; j < 9; j++) {
        const a0 = PROM.lat - 9 + r() * 4, a1 = PROM.lat + 5 + r() * 6, h = 0.1 + r() * 0.07;
        const pts = [];
        for (let i = 0; i <= 30; i++) {
          const t = i / 30, lat = a0 + (a1 - a0) * t, lift = 1 + h * Math.sin(Math.PI * t) * (1 + 0.15 * Math.sin(t * 9 + j));
          const p = M.project(lat, PROM.lon + 3 - r() * 0.5);
          pts.push([C + p.x * RS * lift * scale, C - p.y * RS * lift * scale]);
        }
        ctx.strokeStyle = rgbaHead + (0.16 + r() * 0.12) + ')'; ctx.lineWidth = 2 + r() * 2.5;
        ctx.beginPath(); pts.forEach((q, i) => i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); ctx.stroke();
      }
    }
    const flarePos = () => { const a = ARS[0]; const q = [(a.F[0] + a.L[0]) / 2, (a.F[1] + a.L[1]) / 2, (a.F[2] + a.L[2]) / 2]; const l = Math.hypot(...q); return [q[0] / l, q[1] / l, q[2] / l]; };
    const FLARE_DUR = 7000;
    function flareLevel(now) {
      if (st.flareT0 === null) return 0;
      const t = (now - st.flareT0) / FLARE_DUR;
      if (t >= 1) return 0;
      return t < 0.08 ? M.smoothstep(0, 0.08, t) : Math.exp(-(t - 0.08) / 0.25) * (1 - M.smoothstep(0.85, 1, t));
    }
    function paint(ctx, k, size, now) {
      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(cache[k], 0, 0, size, size);
      const f = flareLevel(now) * FLARE_GAIN[k];
      if (f > 0.005) {
        const [x, y] = toPx(flarePos()), sc = size / S;
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        const rad = (k === 'x94' ? 26 : 20) * sc * (0.6 + 0.6 * f);
        const g = ctx.createRadialGradient(x * sc, y * sc, 0, x * sc, y * sc, rad);
        const tint = {vis: '255,230,180', uv304: '255,220,160', uv193: '255,240,210', x94: '220,255,220'}[k];
        g.addColorStop(0, `rgba(255,255,255,${Math.min(1, f)})`); g.addColorStop(0.35, `rgba(${tint},${Math.min(1, f * 0.8)})`); g.addColorStop(1, `rgba(${tint},0)`);
        ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
        ctx.restore();
      }
    }

    // 개기 일식
    const coronaCache = {};
    function coronaImage(cyc) {
      if (coronaCache[cyc]) return coronaCache[cyc];
      const cv = document.createElement('canvas'); cv.width = S; cv.height = S;
      const ctx = cv.getContext('2d'), im = ctx.createImageData(S, S), d = im.data, noise = makeNoise3(cyc === 'max' ? 8 : 9);
      const a = cyc === 'max' ? 1 : 0.15;
      for (let py = 0; py < S; py++) for (let px = 0; px < S; px++) {
        const x = (px + 0.5 - C) / RS, y = -(py + 0.5 - C) / RS, r = Math.hypot(x, y);
        if (r < 1) continue;
        const ang = Math.atan2(y, x), h = r - 1;
        let streamers;
        if (cyc === 'max') streamers = 0.55 + 0.6 * Math.pow(noise(Math.cos(ang) * 2.2 + 5, Math.sin(ang) * 2.2, 0.5), 2.2) * 2;
        else streamers = 0.25 + 1.5 * Math.exp(-((Math.sin(ang) / 0.32) ** 2)) + 0.25 * Math.pow(Math.abs(Math.sin(ang)), 8) * (0.5 + 0.5 * Math.cos(ang * 60));
        const ray = 0.85 + 0.3 * noise(ang * 18, 1, 2);
        const fall = Math.exp(-h / (0.22 + 0.35 * a)) * 0.8 + 0.2 * Math.exp(-h / (0.7 + 0.8 * a));
        let I = (0.35 + 0.65 * a) * streamers * ray * fall / Math.pow(r, 1.5);
        I = clamp(I, 0, 1.4);
        const i = 4 * (py * S + px);
        d[i] = 255 * Math.min(1, I * 1.02); d[i + 1] = 255 * Math.min(1, I * 0.98); d[i + 2] = 255 * Math.min(1, I * 0.94); d[i + 3] = 255 * Math.min(1, I * 1.1);
      }
      ctx.putImageData(im, 0, 0);
      coronaCache[cyc] = cv;
      return cv;
    }
    // 달의 겉보기 크기를 태양보다 아주 조금 크게: 개기 일식 때 채층이 가장자리에 붉은 띠로 남는다
    const MOON_R = 1.004;
    function overlapFrac(dx) {
      // 반지름 1인 태양 원반이 반지름 rm 인 달에 가려지지 않은 비율
      const rm = MOON_R, d = Math.abs(dx);
      if (d >= 1 + rm) return 1;
      if (d <= rm - 1) return 0;
      const a = Math.acos((d * d + 1 - rm * rm) / (2 * d)), b = Math.acos((d * d + rm * rm - 1) / (2 * d * rm));
      const ov = a + rm * rm * b - 0.5 * Math.sqrt(Math.max(0, (-d + 1 + rm) * (d + 1 - rm) * (d - 1 + rm) * (d + 1 + rm)));
      return 1 - ov / Math.PI;
    }
    function paintEclipse(ctx) {
      const dx = (1 - st.moon) * 2.4, vis = overlapFrac(dx), total = vis < 1e-4;
      const glare = total ? 0 : Math.min(1, 0.25 + 0.75 * Math.pow(vis, 0.35));
      ctx.clearRect(0, 0, S, S);
      ctx.fillStyle = total ? '#03050a' : `rgb(${Math.round(20 + 150 * glare)},${Math.round(30 + 170 * glare)},${Math.round(60 + 175 * glare)})`;
      ctx.fillRect(0, 0, S, S);
      if (total) {
        ctx.drawImage(coronaImage(st.cyc), 0, 0);
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        drawProminence(ctx, 'rgba(255,70,110,', 1);
        ctx.strokeStyle = 'rgba(255,60,90,0.95)'; ctx.lineWidth = RS * 0.022;
        ctx.beginPath(); ctx.arc(C, C, RS * 1.013, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,80,110,0.5)'; ctx.lineWidth = 1;
        const r = M.rng(4);
        for (let a = 0; a < 360; a += 2) { const t = a * D2R, l = 1.01 + r() * 0.02; ctx.beginPath(); ctx.moveTo(C + Math.cos(t) * RS, C - Math.sin(t) * RS); ctx.lineTo(C + Math.cos(t) * RS * l, C - Math.sin(t) * RS * l); ctx.stroke(); }
        ctx.restore();
      } else {
        ctx.drawImage(cache.vis, 0, 0);
        // 광구가 남아 있으면 하늘이 밝아 대기의 희미한 빛은 묻힌다
        const g = ctx.createRadialGradient(C, C, RS, C, C, S * 0.75);
        g.addColorStop(0, `rgba(255,250,235,${0.65 * glare})`); g.addColorStop(1, `rgba(200,220,240,${0.25 * glare})`);
        ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
      }
      ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.arc(C + dx * RS, C, RS * MOON_R, 0, Math.PI * 2); ctx.fill();
      return {vis, total};
    }

    // 화면 구성
    const chips = $('s3-wl');
    [...WL.map(w => ({id: w.id, name: w.band, sub: `${w.nm} nm`})), {id: 'eclipse', name: '개기 일식', sub: '달이 광구를 가림'}].forEach(w => {
      const b = document.createElement('button');
      b.type = 'button'; b.dataset.wl = w.id;
      b.innerHTML = `${w.name}<small>${w.sub}</small>`;
      b.addEventListener('click', () => { st.wl = w.id; render(); });
      chips.appendChild(b);
    });
    const quad = $('s3-quad'), quadCv = {};
    WL.forEach(w => {
      const f = document.createElement('figure');
      f.tabIndex = 0; f.setAttribute('role', 'button'); f.dataset.wl = w.id;
      f.setAttribute('aria-label', `${w.band} ${w.nm} nm 사진을 큰 화면으로 보기`);
      f.innerHTML = `<canvas width="210" height="210"></canvas><svg class="overlay" viewBox="0 0 420 420" aria-hidden="true"></svg><figcaption><b>${w.band}(${w.nm} nm)</b>${w.shows}</figcaption>`;
      const go = () => { st.wl = w.id; render(); };
      f.addEventListener('click', go);
      f.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
      quad.appendChild(f);
      quadCv[w.id] = {cv: f.querySelector('canvas'), svg: f.querySelector('svg'), fig: f};
    });
    const main = $('s3-main'), mctx = main.getContext('2d'), over = $('s3-main-over');
    onDrag(over, (p, phase) => {
      if (!p || st.wl === 'eclipse') return;
      st.pick = [clamp(p.x, 0, S - 1), clamp(p.y, 0, S - 1)];
      drawOverlays(); renderBars(); insight();
    });
    $('s3-flare').addEventListener('click', () => {
      if (st.wl === 'eclipse') { st.wl = 'x94'; }
      st.flareT0 = performance.now(); st.lastFlare = st.flareT0;
      if (REDUCED) st.flareT0 = performance.now() - FLARE_DUR * 0.12;
      render(); kick();
    });
    $('s3-moon').addEventListener('input', e => { st.moon = +e.target.value; drawMain(performance.now()); drawOverlays(); insight(); });
    document.querySelectorAll('#s3-cycle [data-cyc]').forEach(b => b.addEventListener('click', () => { st.cyc = b.dataset.cyc; setPressed($('s3-cycle'), 'data-cyc', st.cyc); drawMain(performance.now()); insight(); }));

    function drawMain(now) {
      if (!st.built) return;
      if (st.wl === 'eclipse') {
        const e = paintEclipse(mctx);
        $('s3-moon-out').textContent = e.total ? '개기 일식' : `부분 일식 · 광구 ${Math.max(1, Math.round(e.vis * 100))}% 보임`;
        st.ecl = e;
      } else paint(mctx, st.wl, S, now);
      WL.forEach(w => { const q = quadCv[w.id]; paint(q.cv.getContext('2d'), w.id, 210, now); });
    }
    function pickInfo() {
      if (!st.pick) return null;
      const [x, y] = st.pick, i = Math.floor(y) * S + Math.floor(x);
      const kind = fields.kind[i];
      const vals = {};
      WL.forEach(w => { vals[w.id] = fields[w.id][i] / (quiet[w.id] || 1); });
      return {kind, vals};
    }
    function drawOverlays() {
      clear(over);
      const u = unitsFor(over, S, 12.5);
      const label = (svg, x, y, tx, ty, text, color = '#fff', anchor = 'start', fsz = u) => {
        el('path', {d: `M${x} ${y}L${tx} ${ty}`, stroke: color, 'stroke-width': u * 0.09, opacity: 0.85, fill: 'none'}, svg);
        el('circle', {cx: x, cy: y, r: u * 0.22, fill: color}, svg);
        el('text', {x: tx + (anchor === 'end' ? -3 : 3), y: ty + fsz * 0.35, 'text-anchor': anchor, 'font-size': fsz, 'font-weight': 800, fill: color, class: 'dark-halo'}, svg, text);
      };
      const sp = toPx(vec(SPOTS3[0].lat, SPOTS3[0].lon)), ar = toPx(ARS[0].c), prom = toPx(vec(PROM.lat + 2, PROM.lon));
      const top = C - RS - u * 1.2;   // 원반 위쪽 빈 곳
      if (st.wl === 'eclipse') {
        if (st.ecl && st.ecl.total) {
          label(over, C + RS * 0.62, C - RS * 1.2, C + RS * 0.9, C - RS * 1.38, '코로나', '#fff');
          label(over, C + RS * 0.35, C + RS * 0.945, C + RS * 0.55, C + RS * 1.32, '채층(붉은 띠)', '#ff8aa0');
          label(over, prom[0] - 14, prom[1] - 8, C - RS * 1.38, C - RS * 0.92, '홍염', '#ff8aa0');
          label(over, C - RS * 0.73, C + RS * 0.71, C - RS * 1.38, C + RS * 1.2, '스피큘(가장자리의 작은 불꽃)', '#ffb3c0', 'start', u * 0.9);
          el('text', {x: C, y: C + u * 0.4, 'text-anchor': 'middle', 'font-size': u, fill: '#8fa3b5'}, over, '달');
        } else el('text', {x: C, y: u * 2, 'text-anchor': 'middle', 'font-size': u * 1.05, 'font-weight': 800, fill: '#14283a', class: 'halo'}, over, '광구가 조금이라도 보이면 하늘이 밝습니다');
      } else if (st.wl === 'vis') {
        label(over, sp[0] + 3, sp[1] - 3, sp[0] + 30, top, '흑점', '#fff');
        label(over, C + RS * 0.2, C + RS * 0.6, C + RS * 0.55, C + RS * 1.25, '광구', '#ffe2a8');
      } else if (st.wl === 'uv304') {
        label(over, sp[0], sp[1], sp[0] + 30, top, '흑점 위의 밝은 채층', '#ffe2a8');
        label(over, prom[0] - 14, prom[1] - 8, C - RS * 1.38, C - RS * 0.92, '홍염', '#ffe2a8');
        label(over, C + RS * 0.2, C + RS * 0.6, C + RS * 0.55, C + RS * 1.25, '채층', '#ffe2a8');
      } else if (st.wl === 'uv193') {
        label(over, ar[0], ar[1] - 6, sp[0] + 30, top, '흑점 위의 뜨거운 고리', '#fff2d6');
        label(over, C + RS * 1.05, C - RS * 0.35, C + RS * 1.1, C - RS * 0.95, '코로나', '#fff2d6');
        const chp = toPx(CH[2].v);
        label(over, chp[0], chp[1], C - RS * 1.42, C - RS * 1.3, '코로나가 어두운 곳', '#fff2d6', 'start', u * 0.9);
      } else if (st.wl === 'x94') {
        label(over, ar[0], ar[1], sp[0] + 30, top, '고에너지 영역', '#d8ffd8');
      }
      if (flareLevel(performance.now()) > 0.05 && st.wl !== 'eclipse') {
        const fp = toPx(flarePos());
        el('text', {x: fp[0] - 24, y: fp[1] - 26, 'text-anchor': 'end', 'font-size': u * 1.05, 'font-weight': 900, fill: '#fff', class: 'dark-halo'}, over, st.wl === 'vis' ? '플레어(거의 안 보임)' : '플레어!');
      }
      // 누른 곳
      const cross = (svg, x, y, k) => {
        const s = k * 1.1;
        el('path', {d: `M${x - 12 * s} ${y}H${x - 4 * s}M${x + 4 * s} ${y}H${x + 12 * s}M${x} ${y - 12 * s}V${y - 4 * s}M${x} ${y + 4 * s}V${y + 12 * s}`, stroke: '#7fe0f2', 'stroke-width': 2.4 * k}, svg);
      };
      if (st.pick && st.wl !== 'eclipse') cross(over, st.pick[0], st.pick[1], u / 12.5 * 1.2);
      WL.forEach(w => {
        const q = quadCv[w.id];
        clear(q.svg);
        if (st.pick) cross(q.svg, st.pick[0], st.pick[1], 1.8);
        q.fig.setAttribute('aria-pressed', String(st.wl === w.id));
      });
    }
    const KIND = ['태양 바깥(코로나)', '조용한 곳', '활동 영역(흑점 둘레의 대기)', '흑점 위', '코로나가 어두운 곳'];
    function renderBars() {
      const bars = $('s3-bars');
      bars.hidden = st.wl === 'eclipse';
      const info = pickInfo();
      if (!info) { bars.innerHTML = ''; return; }
      const word = v => v < 0.6 ? '어두움' : v < 1.5 ? '보통' : v < 4 ? '밝음' : '매우 밝음';
      const color = {vis: '#e08a2a', uv304: '#d9411e', uv193: '#b0803d', x94: '#2f9e4f'};
      bars.innerHTML = `<div class="b" style="grid-column:1/-1"><strong>누른 곳: ${KIND[info.kind]}</strong>조용한 곳에 견준 밝기</div>` + WL.map(w => {
        const v = info.vals[w.id];
        return `<div class="b"><strong>${w.band}(${w.nm} nm) — ${word(v)}</strong><div class="track"><span style="width:${Math.round(clamp(Math.log2(v + 1) / 3.2, 0.03, 1) * 100)}%;background:${color[w.id]}"></span></div></div>`;
      }).join('');
    }
    function insight() {
      let t;
      if (st.wl === 'eclipse') {
        t = st.ecl && st.ecl.total
          ? `달이 광구를 완전히 가리자 <b>붉게 빛나는 채층</b>과 <b>홍염</b>, 넓게 퍼진 <b>코로나</b>가 드러났습니다. 채층은 평소에 광구의 강한 빛 때문에 보이지 않고, 코로나는 온도가 수백만 K이지만 기체의 밀도가 낮아 평상시에는 관측할 수 없습니다. `
            + (st.cyc === 'max' ? '흑점이 많은 시기에는 코로나가 <b>크고 밝게</b> 나타납니다.' : '흑점이 적은 시기에는 코로나가 상대적으로 <b>작게</b> 나타나고, 적도 쪽으로 길게 뻗습니다.')
          : '광구가 조금이라도 보이면 그 빛이 너무 강해 하늘이 밝고, 희미한 채층과 코로나는 보이지 않습니다. 달의 위치를 끝까지 옮겨 개기 일식을 만들어 보세요.';
      } else {
        const base = {
          vis: '가시광선으로는 밝은 <b>광구</b>와 광구에 생긴 <b>흑점</b>이 뚜렷하게 보입니다. 흑점 위의 대기에서 일어나는 일은 거의 보이지 않습니다.',
          uv304: '자외선(30.4 nm)으로는 광구 위의 <b>채층</b>이 보입니다. 흑점이 있던 자리 위가 밝게 빛나고, 가장자리 밖으로 <b>홍염</b>이 솟아 있습니다.',
          uv193: '자외선(19.3 nm)으로는 수백만 K의 <b>코로나</b>가 보입니다. 흑점 위로 밝은 고리 모양 구조가 있고, 광구 바깥까지 코로나가 퍼져 있습니다. 가시광선에서는 고르게 밝던 곳이 여기서는 어둡기도 합니다.',
          x94: 'X선(9.4 nm)으로는 온도가 가장 높은 <b>고에너지 영역</b>만 밝게 보입니다. 흑점 주변 활동 영역의 가장 뜨거운 곳입니다.'
        }[st.wl];
        t = base + ' 파장이 짧은 자외선이나 X선으로 보면 태양 활동으로 고에너지가 방출되는 영역이 선명합니다. <b>온도가 높을수록 짧은 파장에서 에너지를 많이 방출</b>하므로, 짧은 파장일수록 온도가 높은 영역이 잘 보입니다.';
        if (st.lastFlare && performance.now() - st.lastFlare < FLARE_DUR * 1.6) t += ' 방금 일어난 <b>플레어</b>는 가시광선에서는 거의 보이지 않지만 자외선·X선에서 매우 밝게 빛났습니다. 실제 플레어는 수분에서 수 시간 동안 이어집니다.';
      }
      $('s3-insight').innerHTML = t;
    }

    // 층과 온도
    const lsvg = $('s3-layers'), lchips = $('s3-layer-chips');
    M.LAYERS.forEach(l => {
      const b = document.createElement('button');
      b.type = 'button'; b.dataset.layer = l.id; b.textContent = l.name;
      b.addEventListener('click', () => { st.layer = l.id; renderLayers(); });
      lchips.appendChild(b);
    });
    const LCOL = {spot: '#7a3b12', photo: '#f0a030', chromo: '#e8384f', prom: '#ff6f91', corona: '#9a8cff', flare: '#2f9e4f'};
    function renderLayers() {
      setPressed(lchips, 'data-layer', st.layer);
      clear(lsvg);
      const tall = small(), wide = !tall && (lsvg.getBoundingClientRect().width || 0) > 820;
      // 휴대폰: 단면(위)과 온도 사다리(아래)를 세로로 쌓는다
      const stack = tall, VW = wide ? 960 : 640, fs = tall ? 20 : 12.5;
      const H1 = stack ? 420 : 400, H = stack ? H1 + 440 : 400;
      lsvg.setAttribute('viewBox', `0 0 ${VW} ${H}`);
      const LW = stack ? VW : wide ? 440 : 300, base = H1 - 40, kx = LW / 300;
      const defs = el('defs', {}, lsvg);
      const cg = el('linearGradient', {id: 's3-cor', x1: 0, y1: 1, x2: 0, y2: 0}, defs);
      el('stop', {offset: '0%', 'stop-color': '#c9b8ff', 'stop-opacity': 0.75}, cg); el('stop', {offset: '100%', 'stop-color': '#c9b8ff', 'stop-opacity': 0.05}, cg);
      el('rect', {x: 0, y: 0, width: LW, height: H1, fill: '#0f2235'}, lsvg);
      el('rect', {x: 0, y: 14, width: LW, height: base - 50, fill: 'url(#s3-cor)'}, lsvg);
      el('rect', {x: 0, y: base - 36, width: LW, height: 22, fill: '#e8384f'}, lsvg);
      el('rect', {x: 0, y: base - 14, width: LW, height: H1 - base + 14, fill: '#f0a030'}, lsvg);
      // 쌀알과 흑점
      for (let x = 6; x < LW; x += 18) el('ellipse', {cx: x, cy: base - 14, rx: 8, ry: 3, fill: '#ffd27a'}, lsvg);
      el('ellipse', {cx: 250 * kx, cy: base - 13, rx: 22, ry: 5, fill: '#7a3b12'}, lsvg);
      // 스피큘
      for (let x = 10; x < LW; x += 11) el('line', {x1: x, x2: x + 2, y1: base - 36, y2: base - 50 - (x * 7 % 9), stroke: '#ff8a9a', 'stroke-width': 1.6}, lsvg);
      // 홍염
      el('path', {d: `M${24 * kx} ${base - 36}C${14 * kx} ${base - 150}, ${104 * kx} ${base - 160}, ${94 * kx} ${base - 36}`, fill: 'none', stroke: '#ff6f91', 'stroke-width': 7, opacity: 0.85}, lsvg);
      // 플레어
      const fx = 266 * kx, fy = base - 48;
      el('path', {d: `M${fx} ${fy - 20}L${fx + 5} ${fy - 5}L${fx + 20} ${fy}L${fx + 5} ${fy + 5}L${fx} ${fy + 20}L${fx - 5} ${fy + 5}L${fx - 20} ${fy}L${fx - 5} ${fy - 5}Z`, fill: '#eaffea'}, lsvg);
      const sel = st.layer;
      // 이름표
      const tag = (id, x, y, text, subs, color = '#fff', subColor = '#c9d6e2', halo = 'dark-halo') => {
        const g = el('g', {style: 'cursor:pointer'}, lsvg);
        el('text', Object.assign({x, y, 'font-size': fs * 1.05, 'font-weight': 800, fill: color, class: halo}, sel === id ? {'text-decoration': 'underline'} : {}), g, text);
        (subs || []).forEach((s, i) => el('text', {x, y: y + fs * 1.2 * (i + 1), 'font-size': fs * 0.88, fill: subColor, class: halo}, g, s));
        g.addEventListener('click', () => { st.layer = id; renderLayers(); });
      };
      tag('corona', 10, 36, '코로나', ['수백만 K · 광구에서 수백만 km까지'], '#e6deff');
      tag('prom', 104 * kx, base - (stack ? 170 : 146), '홍염', ['5000~50000 K'], '#ffb3c6');
      tag('flare', 214 * kx, base - 98, '플레어', [], '#eaffea');
      tag('chromo', 110 * kx, base - (stack ? 104 : 78), '채층', ['높이 약 10000 km', '4500 K~수만 K'], '#ffc2cc');
      tag('photo', 10, base + 12, '광구', ['약 5800 K'], '#3a1505', '#3a1505', '');
      tag('spot', 196 * kx, base + 12, '흑점', ['4000~5000 K'], '#3a1505', '#3a1505', '');
      el('text', {x: LW - 6, y: stack ? 108 : 86, 'text-anchor': 'end', 'font-size': fs * 0.8, fill: '#8fa3b5'}, lsvg, '높이는 실제 비율과 다르게 그림');
      // 오른쪽: 온도 사다리(로그 눈금)
      const box = stack ? {l: 112, r: VW - 12, t: H1 + 64, b: H - 64} : {l: LW + 64, r: VW - 12, t: 22, b: H - 52};
      const ys = lin(3, Math.log10(4e7), box.b, box.t);
      const g = el('g', {class: 'axis'}, lsvg);
      [[1e3, '1000'], [1e4, '1만'], [1e5, '10만'], [1e6, '100만'], [1e7, '1000만']].forEach(([v, lab]) => {
        const y = ys(Math.log10(v));
        el('line', {x1: box.l, x2: box.r, y1: y, y2: y, class: 'grid-line'}, g);
        el('text', {x: box.l - 6, y: y + 4, 'text-anchor': 'end', class: 'tick'}, g, lab);
      });
      el('line', {x1: box.l, x2: box.l, y1: box.t, y2: box.b, 'stroke-width': 1.2}, g);
      if (stack) el('text', {x: 12, y: H1 + 36, class: 'axis-label'}, g, '온도 (K, 로그 눈금)');
      else el('text', {x: LW + 14, y: (box.t + box.b) / 2, transform: `rotate(-90 ${LW + 14} ${(box.t + box.b) / 2})`, 'text-anchor': 'middle', class: 'axis-label'}, g, '온도 (K, 로그 눈금)');
      const n = M.LAYERS.length, bw = (box.r - box.l - 10) / n;
      M.LAYERS.forEach((l, i) => {
        const x = box.l + 8 + i * bw, y0 = ys(Math.log10(l.T[0])), y1 = ys(Math.log10(l.T[1])), on = l.id === sel;
        const h = Math.max(6, y0 - y1);
        const g2 = el('g', {style: 'cursor:pointer'}, lsvg);
        el('rect', {x: x + bw * 0.18, y: y0 - h, width: bw * 0.64, height: h, rx: 5, fill: LCOL[l.id], opacity: on ? 1 : 0.45, stroke: on ? '#14283a' : 'none', 'stroke-width': 2}, g2);
        if (l.id === 'flare') el('path', {d: `M${x + bw / 2} ${y1 - 4}l-7 10h14z`, fill: LCOL.flare, opacity: on ? 1 : 0.45}, g2);
        el('text', {x: x + bw / 2, y: box.b + (tall ? 28 : 18), 'text-anchor': 'middle', class: 'tick', 'font-weight': on ? 800 : 400, fill: on ? '#14283a' : undefined}, g2, l.name);
        g2.addEventListener('click', () => { st.layer = l.id; renderLayers(); });
      });
      const L = M.LAYERS.find(l => l.id === sel), wl = WL.find(w => w.id === L.wl);
      const ly = ys(Math.log10(Math.sqrt(L.T[0] * L.T[1]))), li = M.LAYERS.indexOf(L);
      const lx = box.l + 8 + li * bw + bw / 2;
      const right = li < 3;
      el('text', {x: right ? lx + bw * 0.4 : lx - bw * 0.4, y: ly - 4, 'text-anchor': right ? 'start' : 'end', class: 'annot halo', fill: '#14283a'}, lsvg, L.label);
      el('text', {x: right ? lx + bw * 0.4 : lx - bw * 0.4, y: ly + (tall ? 22 : 14), 'text-anchor': right ? 'start' : 'end', class: 'tick halo'}, lsvg, `→ ${wl.band} ${wl.nm} nm`);
      const TEXT = {
        spot: '흑점(4000~5000 K)은 주변 광구(약 5800 K)보다 온도가 낮아 가시광선에서 어둡게 보입니다.',
        photo: '광구(약 5800 K)는 우리가 보는 햇빛이 나오는 층으로, 가시광선 사진에서 밝게 보입니다.',
        chromo: '채층은 광구 바로 위의 대기층으로 높이가 약 10000 km, 온도는 4500 K~수만 K입니다. 평소에는 광구의 강한 빛 때문에 보이지 않지만 개기 일식 때 붉게 빛납니다. 채층에서는 <b>스피큘</b>이라는 불꽃이 나타났다가 사라지기를 반복합니다.',
        prom: '홍염은 거대한 불꽃이나 고리 모양으로 태양 대기의 바깥층까지 뻗쳐오르며 수일에서 수주간 이어집니다. <b>오개념 주의:</b> 장관을 이루지만 홍염이 가장 뜨겁지는 않습니다. 5000~50000 K로 광구·채층보다는 높지만 <b>플레어나 코로나에 비하면 매우 낮습니다.</b>',
        corona: '코로나는 태양의 가장 바깥쪽 대기층입니다. 온도가 수백만 K에 이르지만 밀도가 낮아 평소에는 보이지 않고, 광구로부터 수백만 km까지 퍼져 있습니다. 코로나를 빠져나오는 양성자·전자 등의 흐름이 <b>태양풍</b>입니다.',
        flare: '플레어는 흑점 주변에서 일어나는 강렬한 폭발로, X선이나 자외선 같은 고에너지 전자기파를 짧은 시간(수분~수 시간) 동안 방출합니다. 이것이 지구의 자기장을 교란시켜 피해를 주기도 합니다.'
      }[sel];
      $('s3-layer-insight').innerHTML = `${TEXT} <span class="micro">이 층이 잘 보이는 파장: ${wl.band}(${wl.nm} nm)</span>`;
    }

    function render() {
      if (!st.built) {
        // 처음 한 번 가상의 태양을 그리는 데 시간이 걸리므로, 안내를 먼저 보여 주고 다음 틈에 만든다
        mctx.fillStyle = '#000'; mctx.fillRect(0, 0, S, S);
        mctx.fillStyle = '#dfe9f1'; mctx.font = '700 18px Pretendard, "Malgun Gothic", sans-serif'; mctx.textAlign = 'center';
        mctx.fillText('여러 파장의 태양을 그리는 중…', C, C);
        mctx.textAlign = 'start';
        if (!st.building) { st.building = true; setTimeout(() => { build(); if (current === 's3') render(); }, 30); }
        return;
      }
      setPressed(chips, 'data-wl', st.wl);
      const ecl = st.wl === 'eclipse';
      $('s3-eclipse-ctl').hidden = !ecl;
      setPressed($('s3-cycle'), 'data-cyc', st.cyc);
      $('s3-moon').value = st.moon;
      const w = WL.find(x => x.id === st.wl);
      $('s3-main-title').textContent = ecl ? '개기 일식 때의 태양' : `${w.band}(${w.nm} nm)으로 본 태양`;
      $('s3-main-shows').textContent = ecl ? '채층 · 스피큘 · 홍염 · 코로나' : `잘 보이는 것: ${w.shows}`;
      if (!st.pick) st.pick = toPx(vec(SPOTS3[0].lat, SPOTS3[0].lon));
      drawMain(performance.now());
      drawOverlays(); renderBars(); insight(); renderLayers();
    }
    let lastPaint = 0;
    function tick(now) {
      if (now - lastPaint < 45) return;
      lastPaint = now;
      drawMain(now);
      drawOverlays();
      if (flareLevel(now) === 0 && st.flareT0 !== null && now - st.flareT0 > FLARE_DUR) { st.flareT0 = null; drawMain(now); drawOverlays(); insight(); }
    }
    return {render, tick, animating: () => st.flareT0 !== null};
  })();

  // ═══════════════ 04 태양 활동 주기 ═══════════════
  stations.s4 = (() => {
    const vals = DATA.silso.values, sm = M.smooth13(vals), ex = M.localExtrema(sm);
    const cols = M.decodeButterfly(DATA.butterfly.cols, DATA.butterfly.bins);
    const BS = DATA.butterfly.step, colYear = j => M.crToYear(DATA.butterfly.crStart + BS * (j + 0.5));
    const yMax = ex.max.map(i => M.monthToYear(i)), yMin = ex.min.map(i => M.monthToYear(i));
    const X0 = 1950, X1 = 2027;
    const st = {a: yMax[yMax.length - 2], b: yMax[yMax.length - 1], grab: null, snapped: {a: true, b: true}, mean: false, maxPair: yMax.length - 2, minPair: yMin.length - 2};
    const snSvg = $('s4-sn'), bfSvg = $('s4-bfly'), scene = $('s4-scene');
    let box = {l: 64, r: 622, t: 30, b: 240}, xs = lin(X0, X1, box.l, box.r);
    const snaps = [...yMax, ...yMin];
    const provIdx = (() => { const [y, m] = DATA.silso.provisionalFrom.split('-').map(Number); return (y - 1950) * 12 + m - 1; })();

    $('s4-legend').innerHTML = '<span><i style="border-top-color:#7fb4e0"></i>월평균</span><span><i style="border-top-color:#d9382f;border-top-width:3px"></i>이동 평균 (13개월 동안 평균)</span><span><i class="sw" style="background:#eef1f3"></i>잠정값</span>';
    const BCOL = [null, [255, 214, 120], [250, 172, 72], [240, 124, 42], [214, 72, 30], [168, 30, 22], [96, 10, 10]];
    $('s4-blegend').innerHTML = '흑점 면적: ' + [1, 3, 5, 6].map(k => `<span><i class="sw" style="background:rgb(${BCOL[k].join(',')})"></i>${['', '조금', '', '보통', '', '많음', '매우 많음'][k]}</span>`).join('');

    const handle = (p, phase) => {
      if (phase === 'end') { st.grab = null; return; }
      if (!p || p.x < box.l - 12 || p.x > box.r + 12) return;
      const y = clamp(xs.inv(p.x), X0, X1);
      if (phase === 'start') st.grab = Math.abs(y - st.a) <= Math.abs(y - st.b) ? 'a' : 'b';
      let best = null;
      snaps.forEach(s => { if (Math.abs(s - y) < 0.9 && (best === null || Math.abs(s - y) < Math.abs(best - y))) best = s; });
      st.snapped[st.grab] = best !== null;
      st[st.grab] = best !== null ? best : y;
      renderCharts(); renderScene(); kick();
    };
    onDrag(snSvg, handle); onDrag(bfSvg, handle);
    $('s4-snap-max').addEventListener('click', () => {
      st.maxPair = (st.maxPair + 1) % (yMax.length - 1);
      st.a = yMax[st.maxPair]; st.b = yMax[st.maxPair + 1]; st.snapped = {a: true, b: true};
      renderCharts(); renderScene();
    });
    $('s4-snap-min').addEventListener('click', () => {
      st.minPair = (st.minPair + 1) % (yMin.length - 1);
      st.a = yMin[st.minPair]; st.b = yMin[st.minPair + 1]; st.snapped = {a: true, b: true};
      renderCharts(); renderScene();
    });
    toggleButton($('s4-mean'), v => { st.mean = v; renderCharts(); });

    function drawCursors(svg, top, bottom) {
      const k = small() ? 1.5 : 1, g = el('g', {}, svg), xa = xs(st.a), xb = xs(st.b);
      el('rect', {x: Math.min(xa, xb), y: top, width: Math.abs(xb - xa), height: bottom - top, fill: '#14283a', opacity: 0.06}, g);
      [['A', xa, st.snapped.a], ['B', xb, st.snapped.b]].forEach(([n, x, on]) => {
        const c = on ? '#0b7f9a' : '#14283a';
        el('line', {x1: x, x2: x, y1: top - 4, y2: bottom, stroke: c, 'stroke-width': 2 * k}, g);
        el('rect', {x: x - 11 * k, y: top - 4 - 20 * k, width: 22 * k, height: 19 * k, rx: 5, fill: c}, g);
        el('text', {x, y: top - 4 - 6 * k, 'text-anchor': 'middle', fill: '#fff', 'font-size': 12 * k, 'font-weight': 800}, g, n);
      });
    }
    const yearTicks = () => (small() ? [1960, 1980, 2000, 2020] : [1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020]).map(v => ({v, label: `${v}`}));
    function renderCharts() {
      const tall = small();
      box = {l: tall ? 100 : 64, r: 622, t: 36, b: tall ? 340 : 246};
      xs = lin(X0, X1, box.l, box.r);
      // 흑점 수
      clear(snSvg);
      snSvg.setAttribute('viewBox', `0 0 640 ${tall ? 420 : 300}`);
      const ys = lin(0, 380, box.b, box.t);
      el('rect', {x: xs(M.monthToYear(provIdx) - 0.04), y: box.t, width: xs(X1) - xs(M.monthToYear(provIdx) - 0.04), height: box.b - box.t, fill: '#eef1f3'}, snSvg);
      frame(snSvg, box, xs, ys, {xTicks: yearTicks(), yTicks: (tall ? [0, 100, 200, 300] : [0, 50, 100, 150, 200, 250, 300, 350]).map(v => ({v, label: `${v}`})),
        xLabel: '시간 (년)', yLabel: tall ? '흑점 수 (개)' : '흑점 수 (개)'});
      const mon = vals.map((v, i) => [xs(M.monthToYear(i)), ys(v)]);
      el('path', {d: pathOf(mon), fill: 'none', stroke: '#7fb4e0', 'stroke-width': tall ? 1.6 : 1.1, 'stroke-linejoin': 'round'}, snSvg);
      const smp = []; sm.forEach((v, i) => { if (v !== null) smp.push([xs(M.monthToYear(i)), ys(v)]); });
      el('path', {d: pathOf(smp), fill: 'none', stroke: '#d9382f', 'stroke-width': tall ? 3.4 : 2.6, 'stroke-linejoin': 'round'}, snSvg);
      ex.max.forEach(i => {
        const x = xs(M.monthToYear(i)), y = ys(sm[i]);
        el('circle', {cx: x, cy: y, r: tall ? 6 : 4, fill: '#fff', stroke: '#d9382f', 'stroke-width': 2}, snSvg);
        if (!tall) el('text', {x, y: Math.max(box.t + 12, y - 12), 'text-anchor': 'middle', class: 'tick halo', fill: '#b42318'}, snSvg, `${Math.floor(M.monthToYear(i))}`);
      });
      drawCursors(snSvg, box.t, box.b);
      // 나비 도표
      clear(bfSvg);
      bfSvg.setAttribute('viewBox', `0 0 640 ${tall ? 420 : 300}`);
      const yb = lin(-1, 1, box.b, box.t);
      el('rect', {x: box.l, y: box.t, width: box.r - box.l, height: box.b - box.t, fill: '#fbfcfc'}, bfSvg);
      frame(bfSvg, box, xs, yb, {xTicks: yearTicks(), yTicks: [[1, '90°N'], [0.5, '30°N'], [0, '적도'], [-0.5, '30°S'], [-1, '90°S']].map(([v, label]) => ({v, label})), xLabel: '시간 (년)', yLabel: '위도'});
      const half = BS * 27.2753 / 365.25 / 2;
      el('image', {href: butterflyURL(), x: xs(colYear(0) - half), y: box.t, width: xs(colYear(cols.length - 1) + half) - xs(colYear(0) - half), height: box.b - box.t, preserveAspectRatio: 'none'}, bfSvg);
      // 위도 10°(극소기에 흑점이 나타나는 범위)와 50°(이보다 높은 위도에는 흑점이 거의 없음)
      [10, 50].forEach(l => [1, -1].forEach(sg => {
        const y = yb(sg * Math.sin(l * D2R));
        el('line', {x1: box.l, x2: box.r, y1: y, y2: y, stroke: '#5f7282', 'stroke-dasharray': '3 5', 'stroke-width': 1, opacity: 0.8}, bfSvg);
        el('text', {x: box.r - 4, y: y + (sg > 0 ? -4 : 14), 'text-anchor': 'end', class: 'tick halo'}, bfSvg, `${l}°`);
      }));
      if (st.mean) {
        // 주기마다 따로 그린다. 극소기 무렵에는 두 주기의 흑점이 함께 나타나므로
        // 주기 초반에는 적도 가까이의 이전 주기 흑점을, 주기 후반에는 고위도의 다음 주기 흑점을 뺀다.
        const phase = y => {
          const prev = yMin.filter(m => m <= y).pop(), next = yMin.find(m => m > y);
          const a = prev !== undefined ? prev : next - 11, b = next !== undefined ? next : a + 11;
          return {f: (y - a) / (b - a), a, b};
        };
        ['north', 'south'].forEach(h => {
          let pts = [], cyc = null;
          const flush = () => { if (pts.length > 1) el('path', {d: pathOf(pts), fill: 'none', stroke: '#1e3a5f', 'stroke-width': 2.4}, bfSvg); pts = []; };
          for (let j = 2; j < cols.length - 2; j++) {
            const y = colYear(j), ph = phase(y);
            if (cyc !== ph.a) { flush(); cyc = ph.a; }
            if (ph.f < 0.04 || ph.f > 0.97) continue;
            let sum = 0, w = 0;
            for (let k = -2; k <= 2; k++) {
              const c = cols[j + k];
              for (let bn = 0; bn < 50; bn++) {
                const lat = M.binLatitude(bn), wt = M.LEVEL_WEIGHT[c[bn]];
                if (!wt || (h === 'north') !== (lat > 0)) continue;
                const al = Math.abs(lat);
                if ((ph.f > 0.65 && al > 22) || (ph.f < 0.3 && al < 7)) continue;
                sum += al * wt; w += wt;
              }
            }
            if (w > 30) pts.push([xs(y), yb((h === 'north' ? 1 : -1) * Math.sin(sum / w * D2R))]); else flush();
          }
          flush();
        });
      }
      el('text', {x: box.l + 6, y: box.t + 16, class: 'tick halo'}, bfSvg, '북반구');
      el('text', {x: box.l + 6, y: box.b - 8, class: 'tick halo'}, bfSvg, '남반구');
      drawCursors(bfSvg, box.t, box.b);
      readouts();
    }
    let bURL = null;
    function butterflyURL() {
      if (bURL) return bURL;
      const sx = 2, sy = 4, cv = document.createElement('canvas');
      cv.width = cols.length * sx; cv.height = 50 * sy;
      const ctx = cv.getContext('2d');
      cols.forEach((c, j) => {
        for (let k = 0; k < 50; k++) {
          const v = c[k];
          if (!v) continue;
          ctx.fillStyle = `rgb(${BCOL[v].join(',')})`;
          ctx.fillRect(j * sx, (49 - k) * sy, sx, sy);
        }
      });
      bURL = cv.toDataURL('image/png');
      return bURL;
    }
    const monthIdx = y => clamp(Math.round(M.yearToMonth(y)), 0, vals.length - 1);
    function readouts() {
      const dt = Math.abs(st.b - st.a);
      $('s4-dt').textContent = `${num(dt, 1)}년`;
      const i = monthIdx(st.a);
      $('s4-when').textContent = monthName(M.monthToYear(i));
      $('s4-val').innerHTML = `${num(vals[i], 0)} / ${sm[i] === null ? '—' : num(sm[i], 0)}`;
      const gaps = yMax.slice(1).map((y, k) => y - yMax[k]), mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
      const isMaxPair = yMax.some(y => Math.abs(y - st.a) < 1e-6) && yMax.some(y => Math.abs(y - st.b) < 1e-6);
      const isMinPair = yMin.some(y => Math.abs(y - st.a) < 1e-6) && yMin.some(y => Math.abs(y - st.b) < 1e-6);
      let t = '';
      if (isMaxPair || isMinPair) {
        const n = Math.max(1, Math.round(dt / 11));
        t = `두 ${isMaxPair ? '극대' : '극소'} 사이: <b>${num(dt, 1)}년</b>` + (n > 1 ? ` = ${n}주기 → 한 주기 약 <b>${num(dt / n, 1)}년</b>. ` : '. ');
      }
      t += `1950년 이후 이동 평균의 봉우리(극대)는 ${yMax.map(y => Math.floor(y)).join(', ')}년이고, 그 사이 간격은 ${gaps.map(g => num(g, 1)).join(', ')}년으로 평균 <b>약 ${num(mean, 1)}년</b>입니다. 흑점 수는 약 11년을 주기로 늘었다 줄어듭니다. 흑점 수가 가장 많은 때를 <b>극대기</b>, 가장 적은 때를 <b>극소기</b>라고 하며, 극소기에는 흑점이 거의 없는 날이 이어지기도 합니다.`;
      const last = vals.length - 1;
      t += ` 지금(${monthName(M.monthToYear(last))})은 ${Math.floor(yMax[yMax.length - 1])}년 극대기를 지나 흑점 수가 줄어드는 중입니다.`;
      $('s4-sn-insight').innerHTML = t;
      bflyInsight();
    }
    function windowCols(y, half = 0.5) {
      const out = [];
      cols.forEach((c, j) => { if (Math.abs(colYear(j) - y) <= half) out.push(c); });
      return out;
    }
    function bflyInsight() {
      const y = st.a, lastY = colYear(cols.length - 1);
      let t;
      if (y > lastY + 0.3) t = `나비 도표 자료는 ${monthName(lastY)}까지입니다. 커서 A를 왼쪽으로 옮겨 보세요.`;
      else {
        const win = windowCols(y), band = M.latitudeBand(win);
        const stats = win.map(M.columnStats).filter(s => s.total), tot = stats.reduce((a, s) => a + s.total, 0);
        const prev = yMin.filter(m => m <= y).pop(), next = yMin.find(m => m > y);
        const start = prev === undefined ? (next !== undefined ? next - 11 : y) : prev, end = next === undefined ? start + 11 : next;
        const f = (y - start) / (end - start);
        const snA = sm[monthIdx(y)] !== null ? sm[monthIdx(y)] : vals[monthIdx(y)];
        if (!band || tot < 60) t = `커서 A(${monthName(y)}) 무렵에는 흑점이 거의 없습니다. 태양 활동의 <b>극소기</b>입니다.`;
        else if (snA < 25) t = `커서 A(${monthName(y)})는 흑점이 아주 적은 <b>극소기</b> 무렵입니다(이동 평균 흑점 수 ${num(snA, 0)}). 끝나 가는 주기의 흑점은 <b>적도 가까이(10° 안팎)</b>에, 새로 시작하는 주기의 흑점은 <b>높은 위도(20°~30° 부근)</b>에 드물게 나타납니다.`;
        else {
          const meanLat = stats.reduce((a, s) => a + s.meanAbsLat * s.total, 0) / tot;
          t = `커서 A(${monthName(y)}) 무렵 흑점은 주로 위도 <b>약 ${num(band[0], 0)}°~${num(band[1], 0)}°</b>(평균 ${num(meanLat, 0)}°)에 나타났습니다. `;
          t += f < 0.3 ? '새 주기가 시작된 지 얼마 안 된 때라 흑점이 비교적 <b>높은 위도</b>에서 나타납니다.'
            : f < 0.6 ? '극대기 무렵으로 흑점이 가장 많고, 흑점이 나타나는 위도가 점점 적도 쪽으로 내려오는 중입니다.'
            : '주기 후반이라 흑점이 <b>적도 가까이</b>(10° 안팎)에서 나타납니다. 곧 높은 위도에서 다음 주기의 흑점이 나타나기 시작합니다.';
        }
        t += ' 50° 이상의 고위도에서는 흑점이 거의 나타나지 않습니다. 나비 날개 모양은 흑점 하나가 적도로 옮겨 간 흔적이 아닙니다. 흑점의 수명은 길어야 수개월이므로, <b>새로 생기는 흑점의 위도가 점점 낮아진 것</b>입니다.';
      }
      $('s4-bfly-insight').innerHTML = t;
    }

    // 태양과 지구
    let sceneParts = null;
    function activityAt(y) { const i = monthIdx(y); const v = sm[i] !== null ? sm[i] : vals[i]; return {sn: v, a: M.activity(v)}; }
    function renderScene() {
      const {sn, a} = activityAt(st.a);
      clear(scene);
      const tall = small(), fs = fsFor(scene, 12, 12.5, 22);
      const SX = 120, SY = 170, SR = 74, EX = 548, EY = 170, ER = 20;
      const defs = el('defs', {}, scene);
      const cg = el('radialGradient', {id: 's4-cor'}, defs);
      el('stop', {offset: '35%', 'stop-color': '#fff6e0', 'stop-opacity': (0.35 + 0.5 * a).toFixed(2)}, cg);
      el('stop', {offset: '100%', 'stop-color': '#fff6e0', 'stop-opacity': 0}, cg);
      limbGradient(defs, 's4-ld', r => sunColor(M.limbDarkening(Math.min(r, 0.9999))));
      const ag = el('radialGradient', {id: 's4-aur'}, defs);
      el('stop', {offset: '0%', 'stop-color': '#7dffa8', 'stop-opacity': 0.95}, ag); el('stop', {offset: '100%', 'stop-color': '#7dffa8', 'stop-opacity': 0}, ag);
      // 코로나와 줄기
      const corR = SR * (1.45 + 0.95 * a);
      el('circle', {cx: SX, cy: SY, r: corR, fill: 'url(#s4-cor)'}, scene);
      const rr = M.rng(5 + Math.round(a * 10));
      const rays = el('g', {stroke: '#fff6e0', 'stroke-linecap': 'round'}, scene);
      const nRay = 4 + Math.round(10 * a);
      for (let i = 0; i < nRay; i++) {
        const ang = a < 0.3 ? (rr() < 0.5 ? 0 : Math.PI) + (rr() - 0.5) * 0.5 : rr() * Math.PI * 2, len = SR * (0.5 + (0.6 + rr() * 0.8) * (0.4 + a));
        el('line', {x1: SX + Math.cos(ang) * SR, y1: SY - Math.sin(ang) * SR, x2: SX + Math.cos(ang) * (SR + len), y2: SY - Math.sin(ang) * (SR + len), 'stroke-width': 6 + 6 * rr(), opacity: (0.08 + 0.14 * a).toFixed(2)}, rays);
      }
      el('circle', {cx: SX, cy: SY, r: SR, fill: 'url(#s4-ld)'}, scene);
      // 흑점: 그 무렵 나비 도표의 위도 분포에서 뽑는다
      const win = windowCols(Math.min(st.a, colYear(cols.length - 1)));
      const weights = new Float64Array(50);
      win.forEach(c => { for (let k = 0; k < 50; k++) weights[k] += M.LEVEL_WEIGHT[c[k]]; });
      const wsum = weights.reduce((p, q) => p + q, 0);
      const nSpot = Math.round(clamp(sn / 9, 0, 24));
      const rs = M.rng(1000 + monthIdx(st.a));
      const sg = el('g', {}, scene);
      for (let i = 0; i < nSpot && wsum > 0; i++) {
        let u = rs() * wsum, k = 0;
        while (k < 49 && u > weights[k]) { u -= weights[k]; k++; }
        const lat = M.binLatitude(k) + (rs() - 0.5) * 2, lon = (rs() - 0.5) * 130, size = 1 + rs() * 2.2;
        const g = spotGeom(SX, SY, SR, lat, lon, size);
        drawSpotEllipse(sg, g, 1, sunColor(0.6 * M.limbDarkening(Math.min(g.r, 0.999))));
        drawSpotEllipse(sg, spotGeom(SX, SY, SR, lat, lon, size * 0.45), 1, sunColor(0.2));
      }
      // 지구와 자기장
      const mg = el('g', {fill: 'none', stroke: '#8fb3cc', 'stroke-width': 1.3, opacity: 0.8}, scene);
      [1.9, 2.8, 3.8].forEach(k => {
        const day = ER * k, night = ER * k * 2.4;
        el('path', {d: `M${EX} ${EY - ER * 0.85}C${EX - day} ${EY - day * 1.25}, ${EX - day} ${EY + day * 1.25}, ${EX} ${EY + ER * 0.85}`}, mg);
        el('path', {d: `M${EX} ${EY - ER * 0.85}C${EX + night * 0.6} ${EY - day * 1.1}, ${EX + night} ${EY - day * 0.4}, 640 ${EY - day * 0.35}`}, mg);
        el('path', {d: `M${EX} ${EY + ER * 0.85}C${EX + night * 0.6} ${EY + day * 1.1}, ${EX + night} ${EY + day * 0.4}, 640 ${EY + day * 0.35}`}, mg);
      });
      el('circle', {cx: EX, cy: EY, r: ER, fill: '#2e6fc2', stroke: '#bfe1ff', 'stroke-width': 1}, scene);
      el('path', {d: `M${EX} ${EY - ER}A${ER} ${ER} 0 0 1 ${EX} ${EY + ER}Z`, fill: '#0b1a29', opacity: 0.55}, scene);
      const auro = el('g', {opacity: (0.12 + 0.88 * a).toFixed(2)}, scene);
      [[EY - ER * 0.92, -1], [EY + ER * 0.92, 1]].forEach(([y]) => el('ellipse', {cx: EX, cy: y, rx: ER * 0.75, ry: ER * 0.32, fill: 'url(#s4-aur)'}, auro));
      // 태양풍 입자(움직임은 tick 에서)
      const pg = el('g', {}, scene);
      const rnd = M.rng(3), parts = [];
      for (let i = 0; i < 34; i++) parts.push({y0: (rnd() - 0.5) * 2 * SR * 1.1, ph: rnd(), sp: 0.85 + rnd() * 0.3, toPole: rnd() < 0.18, n: el('circle', {r: 2.2, fill: '#ffe6a8'}, pg)});
      const burst = el('ellipse', {rx: 0, ry: 0, fill: '#ffd9a0', opacity: 0}, scene);
      sceneParts = {parts, burst, SX, SY, SR, EX, EY, ER, a, auro};
      placeParticles(performance.now());
      // 이름표
      const lab = (x, y, t, anchor = 'middle', color = '#dfe9f1') => el('text', {x, y, 'text-anchor': anchor, 'font-size': fs, 'font-weight': 700, fill: color, class: 'dark-halo'}, scene, t);
      lab(SX, Math.max(fs + 4, SY - corR * 0.92 - 6), '코로나', 'middle', '#fff6e0');
      lab(EX, EY + ER * 3.9 + fs, '지구 자기장', 'middle', '#8fb3cc');
      lab(EX, EY - ER - 12, '오로라', 'middle', '#7dffa8');
      lab(335, 62, '태양풍 →', 'middle', '#ffe6a8');
      lab(335, 62 + fs * 1.3, fs > 15 ? '양성자·전자의 흐름' : '(코로나에서 나오는 양성자·전자의 흐름)', 'middle', '#c9d6e2');
      el('text', {x: 632, y: 332, 'text-anchor': 'end', 'font-size': fs * 0.85, fill: '#8fa3b5'}, scene, '크기와 거리는 과장해 그림');
      $('s4-scene-when').textContent = `${monthName(M.monthToYear(monthIdx(st.a)))} · 이동 평균 흑점 수 ${num(sn, 0)}`;
      const lvl = a > 0.45 ? 2 : a > 0.15 ? 1 : 0, pickW = arr => arr[lvl];
      const mins = ex.min.map(i => sm[i]), maxs = ex.max.map(i => sm[i]);
      $('s4-compare').innerHTML = `<thead><tr><th></th><th>극소기</th><th>커서 A 무렵</th><th>극대기</th></tr></thead><tbody>
        <tr><th scope="row">흑점 수(이동 평균)</th><td>약 ${num(Math.min(...mins), 0)}~${num(Math.max(...mins), 0)}</td><td class="now">${num(sn, 0)}</td><td>약 ${num(Math.min(...maxs), 0)}~${num(Math.max(...maxs), 0)}</td></tr>
        <tr><th scope="row">코로나</th><td>상대적으로 작다</td><td class="now">${pickW(['작다', '중간', '크고 밝다'])}</td><td>크고 밝다</td></tr>
        <tr><th scope="row">플레어 같은 폭발</th><td>드물다</td><td class="now">${pickW(['드물다', '가끔', '잦다'])}</td><td>잦다</td></tr>
        <tr><th scope="row">오로라·자기장 교란</th><td>약하다</td><td class="now">${pickW(['약하다', '가끔', '잦다'])}</td><td>잦다</td></tr></tbody>`;
      $('s4-insight').innerHTML = a > 0.45
        ? `흑점이 많은 <b>태양 활동 극대기</b> 무렵입니다(이동 평균 흑점 수 ${num(sn, 0)}). 흑점이 많을 때는 코로나가 <b>크고 밝게</b> 나타나고, 흑점 주변에서 플레어 같은 폭발이 잦습니다. 코로나에서 나온 태양풍이 지구에 도달하면 극지방 부근에서 <b>오로라</b>가 생기고, 강한 폭발 뒤에는 지구 자기장이 교란되기도 합니다. 그래서 태양 활동을 관측해 우주 날씨를 예측합니다.`
        : a > 0.15
          ? `흑점 수가 중간쯤인 때입니다(이동 평균 ${num(sn, 0)}). 커서 A를 극대나 극소로 옮겨 코로나와 오로라가 어떻게 달라지는지 비교해 보세요.`
          : `흑점이 거의 없는 <b>극소기</b> 무렵입니다(이동 평균 ${num(sn, 0)}). 코로나는 상대적으로 작게 나타납니다. 코로나의 온도가 매우 높아 태양풍은 평소에도 계속 불어오지만, 큰 폭발이 드물어 오로라가 약합니다.`;
    }
    function placeParticles(now) {
      if (!sceneParts) return;
      const {parts, burst, SX, SY, SR, EX, EY, ER, a} = sceneParts;
      const T = REDUCED ? 0.37 : now / 1000;
      const x0 = SX + SR * 1.05, x1 = EX - ER * 3.2;
      parts.forEach(p => {
        const f = ((T * 0.16 * p.sp + p.ph) % 1);
        let x = x0 + (x1 - x0) * f, y = SY + p.y0 * (1 + f * 0.35);
        if (f > 0.82) {
          const g = (f - 0.82) / 0.18;
          if (p.toPole) { x += g * ER * 2.6; y = y + (EY + (p.y0 < 0 ? -ER : ER) - y) * g; }
          else { y += (y < EY ? -1 : 1) * g * ER * 2.2; x += g * ER * 1.2; }
        }
        p.n.setAttribute('cx', x.toFixed(1)); p.n.setAttribute('cy', y.toFixed(1));
        p.n.setAttribute('opacity', (f < 0.05 ? f / 0.05 : f > 0.95 ? (1 - f) / 0.05 : 1).toFixed(2));
      });
      // 폭발(태양 활동이 활발할수록 자주)
      const period = 9 - 6 * a, ph = (T % period) / period, on = a > 0.25 && ph < 0.55;
      if (on) {
        const f = ph / 0.55, x = x0 + (x1 - x0 + ER * 2) * f;
        burst.setAttribute('cx', x.toFixed(1)); burst.setAttribute('cy', (SY - 10).toFixed(1));
        burst.setAttribute('rx', (10 + 26 * f).toFixed(1)); burst.setAttribute('ry', (16 + 40 * f).toFixed(1));
        burst.setAttribute('opacity', (0.3 * (1 - f * 0.6)).toFixed(2));
        if (f > 0.85) sceneParts.auro.setAttribute('opacity', Math.min(1, 0.12 + 0.88 * a + 0.4).toFixed(2));
      } else {
        burst.setAttribute('opacity', 0);
        sceneParts.auro.setAttribute('opacity', (0.12 + 0.88 * a).toFixed(2));
      }
    }
    let lastFrame = 0;
    function tick(now) { if (now - lastFrame < 40) return; lastFrame = now; placeParticles(now); }
    function render() { renderCharts(); renderScene(); }
    return {render, tick, animating: () => !REDUCED};
  })();

  // 처음 열 때: 주소의 #s1~#s4 (또는 이름)
  show((location.hash || '').slice(1) || 's1');
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => stations[current].render(), 150);
  });
  window.addEventListener('hashchange', () => { const h = location.hash.slice(1); if (h && (ALIAS[h] || h) !== current) show(h); });
})();
