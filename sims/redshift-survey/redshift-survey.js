/* 은하 적색 편이 탐사 — 네 실험이 같은 모형(redshift-survey-model.js)과 실제 자료(redshift-survey-data.js)를 쓴다. */
(() => {
  'use strict';
  const M = window.RedshiftSurveyModel, RAW = window.RedshiftSurveyData;
  const $ = id => document.getElementById(id);
  const NS = 'http://www.w3.org/2000/svg';
  const reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const FONT = '"Pretendard","Apple SD Gothic Neo","Malgun Gothic",system-ui,sans-serif';
  const KM = M.C / M.H;            // 적색 편이 1 ↔ 4286 Mpc (d = cz ÷ H)
  const DEG = Math.PI / 180;

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
  const small = () => window.innerWidth < 640;
  const num = M.num;
  const clamp = M.clamp;
  function setPressed(container, attr, value) {
    container.querySelectorAll(`[${attr}]`).forEach(b => b.setAttribute('aria-pressed', String(b.getAttribute(attr) === value)));
  }
  const fmtCount = n => Math.round(n).toLocaleString('ko-KR');
  // 적색 편이: 수업처럼 0.028, 0.0181 (소수 셋째 자리 이상)
  function fmtZ(z) {
    let s = Math.abs(z).toFixed(4).replace(/0+$/, '');
    if ((s.split('.')[1] || '').length < 3) s = Math.abs(z).toFixed(3);
    return (z < 0 && +s !== 0 ? '−' : '') + s;
  }
  const fmtV = v => (v < 0 ? '−' : '') + Math.abs(Math.round(v));          // 8400 km/s (수업 표기)
  function fmtD(d) {
    const a = Math.abs(d), s = a < 100 ? a.toFixed(1) : String(Math.round(a));
    return (d < 0 ? '−' : '') + s;
  }
  // SVG 그래프: 넓은 화면에서는 실제 픽셀 폭을 viewBox 폭으로 써서 글씨가 커지거나 작아지지 않게 한다.
  // 휴대폰에서는 640 폭으로 줄이고 글씨를 CSS(21px)로 키운다(변광성 실험실과 같은 방식).
  const svgW = svg => (small() ? 640 : clamp(Math.round(svg.parentElement.clientWidth || 640), 480, 1240));
  const frac = (a, b) => `<span class="frac"><span>${a}</span><span>${b}</span></span>`;
  function svgPoint(svg, evt) {
    const pt = svg.createSVGPoint();
    pt.x = evt.clientX; pt.y = evt.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  }
  function localPoint(target, e) {
    const r = target.getBoundingClientRect();
    return {x: e.clientX - r.left, y: e.clientY - r.top};
  }
  // 누르기·끌기·떼기. 끌기가 짧으면 '누름(tap)'으로 본다.
  function pointer(target, h, toPoint) {
    let active = null;
    const at = e => (toPoint ? toPoint(e) : localPoint(target, e));
    target.addEventListener('pointerdown', e => {
      if (e.button > 0 || active) return;
      const p = at(e);
      if (h.down && h.down(p, e) === false) return;
      active = {id: e.pointerId, x0: p.x, y0: p.y, moved: false};
      try { target.setPointerCapture(e.pointerId); } catch (_) {}
    });
    target.addEventListener('pointermove', e => {
      if (!active || e.pointerId !== active.id) return;
      const p = at(e);
      if (Math.hypot(p.x - active.x0, p.y - active.y0) > 6) active.moved = true;
      if (h.move) h.move(p, active, e);
    });
    const end = e => {
      if (!active || e.pointerId !== active.id) return;
      const a = active; active = null;
      if (h.up) h.up(e.type === 'pointercancel' ? null : at(e), a, e);
    };
    target.addEventListener('pointerup', end);
    target.addEventListener('pointercancel', end);
  }
  // 캔버스 크기를 화면에 맞춘다(선명하게 그리려고 기기 픽셀 비율을 곱함).
  function fitCanvas(canvas, ratioOf) {
    const w = Math.max(240, Math.floor(canvas.parentElement.clientWidth));
    const h = Math.round(ratioOf(w));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.round(w * dpr), H = Math.round(h * dpr);
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
    canvas.style.height = h + 'px';
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return {ctx, w, h};
  }
  function text(ctx, s, x, y, o) {
    o = o || {};
    ctx.font = `${o.weight || 600} ${o.size || 12}px ${FONT}`;
    ctx.textAlign = o.align || 'left';
    ctx.textBaseline = o.base || 'middle';
    if (o.halo !== false) {
      ctx.lineJoin = 'round'; ctx.lineWidth = o.haloWidth || 4; ctx.strokeStyle = o.halo || 'rgba(12,27,43,0.9)';
      ctx.strokeText(s, x, y);
    }
    ctx.fillStyle = o.color || '#dfe9f1';
    ctx.fillText(s, x, y);
  }
  function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function mix(a, b, t) {
    const A = hexToRgb(a), B = hexToRgb(b);
    return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`;
  }
  function ramp(stops, t) {
    const x = clamp(t, 0, 1) * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(x));
    return mix(stops[i], stops[i + 1], x - i);
  }
  // 애니메이션: 화면이 숨으면 멈췄다가 돌아오면 이어서
  const anims = [];
  function animator(step) {
    let raf = 0, last = 0, running = false;
    const loop = now => {
      raf = 0;
      if (!running) return;
      if (document.hidden) { last = 0; return; }
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
      last = now;
      if (step(dt, now) === false) { running = false; last = 0; return; }
      raf = requestAnimationFrame(loop);
    };
    const a = {
      start() { if (!running) { running = true; last = 0; raf = requestAnimationFrame(loop); } },
      stop() { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; last = 0; },
      resume() { if (running && !raf) { last = 0; raf = requestAnimationFrame(loop); } },
      get running() { return running; }
    };
    anims.push(a);
    return a;
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) anims.forEach(a => a.resume()); });

  // ── 실제 자료 준비 ──────────────────────────────────────────
  const CMAP = ['#8fb8ff', '#ffe2a8', '#ff7a45', '#e0332b'];   // 수업 지도(어두운 바탕)와 같은 색: 푸른 은하 → 붉은 은하
  const NBIN = 12, BIN_COLORS = [...Array(NBIN)].map((_, k) => ramp(CMAP, k / (NBIN - 1)));
  const MONO = '#cfe6ff';
  const SURVEYS = {};
  for (const key of ['sdss', 'twodf']) {
    const s = M.decodeSurvey(RAW[key]);
    s.rank = M.ranksOf(M.measurementOrder(s.n, 20261101));
    s.u = new Float32Array(s.n); s.v = new Float32Array(s.n); s.bin = new Uint8Array(s.n); s.red = new Uint8Array(s.n);
    for (let i = 0; i < s.n; i++) {
      const p = M.wedgeXY(s.ra[i], s.z[i], 180);
      s.u[i] = p.x; s.v[i] = p.y;
      if (s.gr) {
        s.bin[i] = Math.round(clamp((s.gr[i] - 0.25) / 0.7, 0, 1) * (NBIN - 1));
        s.red[i] = M.isRed(s.gr[i], s.z[i]) ? 1 : 0;
      }
    }
    s.byBin = [...Array(NBIN)].map(() => []);
    for (let i = 0; i < s.n; i++) s.byBin[s.bin[i]].push(i);
    SURVEYS[key] = s;
  }
  const shared = {survey: 'sdss', unlocked: false, radial: 'z'};

  // ── 쐐기 지도 (03·04·02의 작은 지도) ─────────────────────────────
  const Z_MAX = 0.15, HALF = Math.sin(40 * DEG) * Z_MAX;
  function wedgeView(pad) {
    const v = {zoom: 1, cx: 0, cy: Z_MAX / 2, s0: 1, w: 0, h: 0, midX: 0, midY: 0};
    v.layout = (w, h) => {
      v.w = w; v.h = h;
      const p = pad(w);
      v.s0 = Math.min((w - 2 * p.side) / (2 * HALF), (h - p.top - p.bottom) / Z_MAX);
      v.midX = w / 2; v.midY = p.top + (h - p.top - p.bottom) / 2;
      v.clampCenter();
    };
    v.scale = () => v.s0 * v.zoom;
    v.X = u => v.midX + (u - v.cx) * v.scale();
    v.Y = y => v.midY - (y - v.cy) * v.scale();
    v.plane = (X, Y) => ({u: v.cx + (X - v.midX) / v.scale(), y: v.cy - (Y - v.midY) / v.scale()});
    v.clampCenter = () => {
      if (v.zoom <= 1.001) { v.zoom = 1; v.cx = 0; v.cy = Z_MAX / 2; return; }
      v.cx = clamp(v.cx, -HALF, HALF); v.cy = clamp(v.cy, 0, Z_MAX);
    };
    return v;
  }
  function ringList(radial) {
    if (radial === 'v') return [10000, 20000, 30000, 40000].map(x => ({z: x / M.C, label: String(x)}));
    if (radial === 'd') return [100, 200, 300, 400, 500, 600].map(x => ({z: x / KM, label: String(x)}));
    return [0.02, 0.04, 0.06, 0.08, 0.10, 0.12, 0.14].map(z => ({z, label: z.toFixed(2)}));
  }
  const RADIAL_NAME = {z: '적색 편이', v: '후퇴 속도 (km/s)', d: '거리 (Mpc)'};
  function arcPath(ctx, v, z, ra0, ra1) {
    ctx.beginPath();
    for (let ra = ra0; ra <= ra1 + 1e-9; ra += 1) {
      const p = M.wedgeXY(ra, z, 180);
      if (ra === ra0) ctx.moveTo(v.X(p.x), v.Y(p.y)); else ctx.lineTo(v.X(p.x), v.Y(p.y));
    }
  }
  function sectorPath(ctx, v, z0, z1, ra0, ra1) {
    ctx.beginPath();
    for (let ra = ra0; ra <= ra1 + 1e-9; ra += 0.5) { const p = M.wedgeXY(ra, z1, 180); ra === ra0 ? ctx.moveTo(v.X(p.x), v.Y(p.y)) : ctx.lineTo(v.X(p.x), v.Y(p.y)); }
    for (let ra = ra1; ra >= ra0 - 1e-9; ra -= 0.5) { const p = M.wedgeXY(ra, z0, 180); ctx.lineTo(v.X(p.x), v.Y(p.y)); }
    ctx.closePath();
  }
  function drawWedgeFrame(ctx, v, o) {
    const fs = o.fs || 12, ra0 = 140, ra1 = 220;
    ctx.save();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(150,178,200,0.30)';
    const rings = ringList(o.radial || 'z');
    rings.forEach(r => { arcPath(ctx, v, r.z, ra0, ra1); ctx.stroke(); });
    ctx.strokeStyle = 'rgba(150,178,200,0.55)';
    arcPath(ctx, v, Z_MAX, ra0, ra1); ctx.stroke();
    for (const ra of [ra0, ra1]) {
      const p = M.wedgeXY(ra, Z_MAX, 180);
      ctx.beginPath(); ctx.moveTo(v.X(0), v.Y(0)); ctx.lineTo(v.X(p.x), v.Y(p.y)); ctx.stroke();
    }
    if (o.labels !== false) {
      // 눈금 글씨: 오른쪽 가장자리(적경 140°) 바깥
      rings.forEach(r => {
        const p = M.wedgeXY(ra0 - 1.4, r.z, 180);
        text(ctx, r.label, v.X(p.x) + 2, v.Y(p.y), {size: fs - 1, color: '#a9bccb', weight: 600});
      });
      const mid = M.wedgeXY(ra0, Z_MAX * 0.6, 180), ang = -(90 - 40) * DEG, off = fs * 3.4;
      ctx.save();
      ctx.translate(v.X(mid.x) + off * Math.cos(40 * DEG), v.Y(mid.y) + off * Math.sin(40 * DEG));
      ctx.rotate(ang);
      text(ctx, RADIAL_NAME[o.radial || 'z'] + ' →', 0, 0, {size: fs, color: '#c7d6e2', weight: 700, align: 'center'});
      ctx.restore();
      if (o.raLabels !== false) {
        const out = (fs + 4) / v.scale();     // 호에서 바깥으로 글씨 한 줄만큼
        for (let ra = 150; ra <= 210; ra += 10) {
          const p = M.wedgeXY(ra, Z_MAX + out, 180);
          text(ctx, ra + '°', v.X(p.x), v.Y(p.y), {size: fs - 1, color: '#a9bccb', align: 'center'});
        }
        text(ctx, '← 적경 (하늘의 방향) →', v.X(0), v.Y(Z_MAX) - 2.6 * (fs + 4), {size: fs, color: '#c7d6e2', weight: 700, align: 'center'});
      }
    }
    // 꼭짓점 = 우리은하
    ctx.fillStyle = '#f2a33a';
    ctx.beginPath(); ctx.arc(v.X(0), v.Y(0), 4.5, 0, 2 * Math.PI); ctx.fill();
    if (o.apex !== false) text(ctx, '우리은하', v.X(0), v.Y(0) + fs + 2, {size: fs, color: '#f2c27a', weight: 800, align: 'center'});
    ctx.restore();
  }
  function drawPoints(ctx, v, s, o) {
    const r = o.size, sc = v.scale(), W = v.w, H = v.h, cx = v.cx, cy = v.cy, mx = v.midX, my = v.midY;
    const count = o.count === undefined ? s.n : o.count;
    ctx.globalAlpha = o.alpha === undefined ? 0.9 : o.alpha;
    const put = i => {
      const X = mx + (s.u[i] - cx) * sc, Y = my - (s.v[i] - cy) * sc;
      if (X > -2 && X < W + 2 && Y > -2 && Y < H + 2) ctx.fillRect(X - r / 2, Y - r / 2, r, r);
    };
    if (!s.gr || o.mono) {
      ctx.fillStyle = o.monoColor || MONO;
      for (let i = 0; i < s.n; i++) if (s.rank[i] < count) put(i);
    } else {
      for (let b = 0; b < NBIN; b++) {
        ctx.fillStyle = BIN_COLORS[b];
        const list = s.byBin[b];
        for (let k = 0; k < list.length; k++) { const i = list[k]; if (s.rank[i] < count && (!o.redOnly || s.red[i])) put(i); }
      }
    }
    ctx.globalAlpha = 1;
  }
  // 수업 결과 슬라이드(28번)와 같은 표시
  function drawLessonMarks(ctx, v, fs) {
    const L = M.LESSON_MARKS, sc = v.scale();
    const P = (ra, z) => { const p = M.wedgeXY(ra, z, 180); return [v.X(p.x), v.Y(p.y)]; };
    ctx.save();
    // 은하 장성 띠
    const outer = [], inner = [];
    for (let ra = L.wall[0][0]; ra >= L.wall[L.wall.length - 1][0] - 1e-9; ra -= 0.5) {
      const zc = M.wallCenterZ(ra);
      outer.push(P(ra, zc + L.wallHalfWidth)); inner.push(P(ra, zc - L.wallHalfWidth));
    }
    ctx.beginPath();
    outer.forEach(([x, y], k) => k ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    inner.reverse().forEach(([x, y]) => ctx.lineTo(x, y));
    ctx.closePath();
    ctx.fillStyle = 'rgba(242,163,58,0.20)'; ctx.fill();
    ctx.strokeStyle = '#f2a33a'; ctx.lineWidth = 2.5; ctx.stroke();
    // 은하단
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.2;
    L.clusters.forEach(([ra, z]) => { const [x, y] = P(ra, z); ctx.beginPath(); ctx.arc(x, y, L.clusterRadius * sc, 0, 2 * Math.PI); ctx.stroke(); });
    // 필라멘트
    ctx.strokeStyle = '#7fe3ff'; ctx.lineWidth = 3; ctx.setLineDash([8, 5]); ctx.lineCap = 'round';
    L.filaments.forEach(f => { ctx.beginPath(); f.forEach(([ra, z], k) => { const [x, y] = P(ra, z); k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke(); });
    // 보이드
    ctx.strokeStyle = '#9db8ff'; ctx.lineWidth = 2.5; ctx.setLineDash([7, 5]);
    L.voids.forEach(([ra, z, r]) => { const [x, y] = P(ra, z); ctx.beginPath(); ctx.arc(x, y, r * sc, 0, 2 * Math.PI); ctx.fillStyle = 'rgba(61,111,224,0.18)'; ctx.fill(); ctx.stroke(); });
    ctx.setLineDash([]);
    const lab = (s, ra, z, color, dx, dy, align) => { const [x, y] = P(ra, z); text(ctx, s, x + (dx || 0), y + (dy || 0), {size: fs + 2, weight: 800, color, align: align || 'center'}); };
    lab('은하 장성', 196, 0.097, '#f2a33a');
    const c = P(153.5, 0.046); text(ctx, '은하단', c[0] + L.clusterRadius * sc + 6, c[1], {size: fs + 2, weight: 800, color: '#ffffff'});
    lab('필라멘트', 193, 0.0478 - 0.0085, '#7fe3ff');
    lab('보이드', 176, 0.061, '#b9ccff', 0, 0, 'left');
    ctx.restore();
  }

  // ── 실험 전환 (#s1 ~ #s4) ──────────────────────────────────────
  const ORDER = ['groups', 'spectrum', 'map', 'density'];
  const stations = {};
  let current = 'groups';
  function nameFromHash(h) {
    const m = /^s([1-4])$/.exec(h);
    if (m) return ORDER[+m[1] - 1];
    return ORDER.includes(h) ? h : null;
  }
  function show(name) {
    if (!stations[name]) name = 'groups';
    if (current !== name && stations[current] && stations[current].pause) stations[current].pause();
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

  // ═══════════════ 01 은하들의 집단 ═══════════════
  stations.groups = (() => {
    const F = M.GROUP_FACTS;
    const LEVELS = [
      {id: 'mw', name: '우리은하', w: 0.13, c: [0.016, -0.012]},
      {id: 'lg', name: '국부 은하군', w: 5.8, c: [0.4, 0]},
      {id: 'cluster', name: '은하단', w: 38, c: [8.2, 3.4]},
      {id: 'super', name: '초은하단', w: 330, c: [26, -10]},
      {id: 'web', name: '우주거대구조', w: 1300, c: [0, 300]}
    ];
    const st = {level: 0, cam: {w: LEVELS[0].w, cx: LEVELS[0].c[0], cy: LEVELS[0].c[1]}, from: null, t: 1, revealed: false};
    const canvas = $('g-canvas');
    // 그릴 것들 (모식도). 위치·개수는 고정된 난수로 만든다.
    const R = M.rng(114);
    const mwStars = [];
    for (let k = 0; k < 900; k++) {
      const arm = k % 4, t = R() * 1.0, rr = 0.0018 + 0.0135 * t;
      const th = arm * Math.PI / 2 + Math.log(rr / 0.0018) / 0.32 + (R() - 0.5) * 0.5;
      const jit = (R() - 0.5) * 0.0018 * (0.4 + t);
      mwStars.push([(rr + jit) * Math.cos(th), (rr + jit) * Math.sin(th) * 0.92, 0.35 + 0.65 * R(), arm < 2]);
    }
    const LG_C = [0.38, 0], M31 = [0.77, 0], M33 = [0.86, -0.22], VIRGO = [15.4, 5.6];
    const dwarfs = [];
    const around = (c, n, rad) => { for (let k = 0; k < n; k++) { const a = R() * 2 * Math.PI, r = rad * Math.sqrt(0.05 + 0.95 * R()); dwarfs.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]); } };
    around([0, 0], 30, 0.3); around(M31, 34, 0.36); around(LG_C, 16, 1.35);
    const virgo = [];
    for (let k = 0; k < 430; k++) {
      const u = R(), r = 0.8 * Math.tan(u * Math.atan(5 / 0.8)), a = R() * 2 * Math.PI;
      const ell = R() < 0.85 - 0.13 * r;
      virgo.push([VIRGO[0] + r * Math.cos(a), VIRGO[1] + r * Math.sin(a) * 0.9, ell, 0.8 + R() * 1.1]);
    }
    const field = [];
    for (let k = 0; k < 60; k++) field.push([-14 + R() * 44, -12 + R() * 30]);
    const LANI = [30, -15];
    const laniR = th => 80 * (1 + 0.11 * Math.sin(3 * th + 1) + 0.07 * Math.cos(5 * th) + 0.04 * Math.sin(7 * th + 2));
    const SC = [ // 초은하단 모식도 (위치는 대략)
      {name: '처녀자리 초은하단', c: [9, 3], n: 0},
      {name: '센타우루스자리 초은하단', c: [70, 28], n: 70, s: 13},
      {name: '공작자리-인디언자리 초은하단', c: [-12, 38], n: 55, s: 12},
      {name: '남쪽 초은하단', c: [-18, -58], n: 50, s: 12},
      {name: '바다뱀자리 초은하단', c: [66, -62], n: 50, s: 11}
    ];
    const scDots = [];
    SC.forEach(s => { for (let k = 0; k < s.n; k++) { const a = R() * 2 * Math.PI, r = s.s * Math.sqrt(R()); scDots.push([s.c[0] + r * Math.cos(a) * 1.4, s.c[1] + r * Math.sin(a)]); } });
    // 처녀자리 초은하단: 은하군·은하단이 길게 늘어선 구름
    for (let k = 0; k < 90; k++) { const t = R(), a = R() * 2 * Math.PI, r = 4 * Math.sqrt(R()); scDots.push([-6 + 30 * t + r * Math.cos(a), -3 + 12 * t + r * Math.sin(a)]); }
    const links = [[0, 1], [0, 2], [0, 3], [1, 4], [3, 4], [1, 2]];
    const linkDots = [];
    links.forEach(([a, b]) => { const A = SC[a].c, B = SC[b].c; for (let k = 0; k < 28; k++) { const t = R(); linkDots.push([A[0] + (B[0] - A[0]) * t + (R() - 0.5) * 8, A[1] + (B[1] - A[1]) * t + (R() - 0.5) * 8]); } });

    // 단계 칩과 확대·축소
    const chips = $('g-levels');
    LEVELS.forEach((L, k) => {
      const b = document.createElement('button');
      b.type = 'button'; b.dataset.level = String(k);
      b.textContent = L.name;
      b.addEventListener('click', () => go(k));
      chips.appendChild(b);
    });
    $('g-in').addEventListener('click', () => go(st.level - 1));
    $('g-out').addEventListener('click', () => go(st.level + 1));
    const anim = animator(dt => {
      st.t = Math.min(1, st.t + dt / 1.1);
      draw();
      return st.t < 1;
    });
    function go(k) {
      k = clamp(k, 0, LEVELS.length - 1);
      if (k === st.level && st.t >= 1) return;
      st.from = {...st.cam};
      st.level = k; st.t = reduced ? 1 : 0;
      renderSide();
      if (reduced) draw(); else anim.start();
    }
    function camera() {
      const L = LEVELS[st.level];
      if (!st.from || st.t >= 1) return {w: L.w, cx: L.c[0], cy: L.c[1]};
      const e = st.t < 0.5 ? 2 * st.t * st.t : 1 - 2 * (1 - st.t) ** 2;
      const w0 = st.from.w, w1 = L.w, w = Math.exp(Math.log(w0) + (Math.log(w1) - Math.log(w0)) * e);
      const f = Math.abs(w1 - w0) < 1e-12 ? e : (w - w0) / (w1 - w0);   // 한 점을 중심으로 확대·축소
      return {w, cx: st.from.cx + (L.c[0] - st.from.cx) * f, cy: st.from.cy + (L.c[1] - st.from.cy) * f};
    }
    function weights(w) {
      const lw = Math.log(w), Ls = LEVELS.map(l => Math.log(l.w)), out = LEVELS.map(() => 0);
      if (lw <= Ls[0]) { out[0] = 1; return out; }
      if (lw >= Ls[Ls.length - 1]) { out[Ls.length - 1] = 1; return out; }
      for (let k = 0; k < Ls.length - 1; k++) if (lw >= Ls[k] && lw <= Ls[k + 1]) {
        const f = (lw - Ls[k]) / (Ls[k + 1] - Ls[k]), g = f * f * (3 - 2 * f);
        out[k] = 1 - g; out[k + 1] = g;
      }
      return out;
    }
    function draw() {
      const {ctx, w, h} = fitCanvas(canvas, W => small() ? W * 0.95 : W * 0.6);
      const cam = camera(), k = w / cam.w;
      st.cam = cam;
      const X = x => w / 2 + (x - cam.cx) * k, Y = y => h / 2 - (y - cam.cy) * k;
      const fs = small() ? 12 : 13;
      const wt = weights(cam.w);
      const spiral = (x, y, rMpc, minPx, color, alpha) => {
        const r = Math.max(minPx, rMpc * k);
        const g = ctx.createRadialGradient(X(x), Y(y), 0, X(x), Y(y), r);
        g.addColorStop(0, `rgba(255,236,190,${alpha})`); g.addColorStop(0.35, color.replace('A', String(alpha * 0.7))); g.addColorStop(1, color.replace('A', '0'));
        ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(X(x), Y(y), r, r * 0.55, -0.4, 0, 2 * Math.PI); ctx.fill();
      };
      const dot = (x, y, r, color) => { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(X(x), Y(y), r, 0, 2 * Math.PI); ctx.fill(); };
      const scaleBar = (lenMpc, label) => {
        const len = lenMpc * k, x0 = 18, y0 = h - 22;
        ctx.strokeStyle = '#dfe9f1'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x0, y0 - 5); ctx.lineTo(x0, y0); ctx.lineTo(x0 + len, y0); ctx.lineTo(x0 + len, y0 - 5); ctx.stroke();
        text(ctx, label, x0, y0 - 14, {size: fs - 1, color: '#dfe9f1'});
      };
      wt.forEach((a, lv) => {
        if (a < 0.02) return;
        ctx.save(); ctx.globalAlpha = a;
        if (lv === 0) {           // 우리은하
          const g = ctx.createRadialGradient(X(0), Y(0), 0, X(0), Y(0), 0.016 * k);
          g.addColorStop(0, 'rgba(255,240,205,0.9)'); g.addColorStop(0.18, 'rgba(255,214,150,0.55)'); g.addColorStop(1, 'rgba(120,160,230,0)');
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(X(0), Y(0), 0.016 * k, 0, 2 * Math.PI); ctx.fill();
          mwStars.forEach(([x, y, b, main]) => dot(x, y, main ? 1.4 : 1, `rgba(${main ? '200,220,255' : '170,195,240'},${0.35 + 0.5 * b})`));
          const sun = [0.008 * Math.cos(-1.95), 0.008 * Math.sin(-1.95)];
          dot(sun[0], sun[1], 4, '#ffd166');
          text(ctx, '태양', X(sun[0]) + 8, Y(sun[1]), {size: fs, color: '#ffd166', weight: 800});
          const lmc = [0.032, -0.036], smc = [0.046, -0.037];
          spiral(lmc[0], lmc[1], 0.004, 6, 'rgba(200,215,255,A)', 0.8);
          spiral(smc[0], smc[1], 0.0025, 4, 'rgba(200,215,255,A)', 0.8);
          text(ctx, '대마젤란은하', X(lmc[0]) - 10, Y(lmc[1]) + 16, {size: fs - 1, align: 'right', color: '#c7d6e2'});
          text(ctx, '소마젤란은하', X(smc[0]) + 8, Y(smc[1]) + 16, {size: fs - 1, color: '#c7d6e2'});
          text(ctx, '우리은하', X(0), Y(0.0175), {size: fs + 2, weight: 800, align: 'center'});
          scaleBar(1e5 / M.LY_PER_MPC, '10만 광년 (약 30 kpc)');
        }
        if (lv === 1) {           // 국부 은하군
          ctx.strokeStyle = 'rgba(200,220,240,0.55)'; ctx.setLineDash([6, 6]); ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(X(LG_C[0]), Y(LG_C[1]), 1.5 * k, 0, 2 * Math.PI); ctx.stroke(); ctx.setLineDash([]);
          dwarfs.forEach(([x, y]) => dot(x, y, 2, 'rgba(170,186,205,0.85)'));
          spiral(0, 0, 0.015, 9, 'rgba(140,180,255,A)', 0.95);
          spiral(M31[0], M31[1], 0.023, 12, 'rgba(180,160,255,A)', 0.95);
          spiral(M33[0], M33[1], 0.008, 6, 'rgba(120,210,230,A)', 0.95);
          text(ctx, '우리은하', X(0), Y(0) - 18, {size: fs, weight: 800, align: 'center'});
          text(ctx, '안드로메다은하', X(M31[0]), Y(M31[1]) - 20, {size: fs, weight: 800, align: 'center'});
          text(ctx, '삼각형자리은하 (M33)', X(M33[0]) + 10, Y(M33[1]) + 12, {size: fs - 1, color: '#c7d6e2'});
          const yA = Y(0) + 34;
          ctx.strokeStyle = '#f2c27a'; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(X(0), yA); ctx.lineTo(X(M31[0]), yA); ctx.stroke();
          [X(0), X(M31[0])].forEach(x => { ctx.beginPath(); ctx.moveTo(x, yA - 5); ctx.lineTo(x, yA + 5); ctx.stroke(); });
          text(ctx, `약 ${F.localGroup.m31Mpc} Mpc (250만 광년)`, (X(0) + X(M31[0])) / 2, yA + 14, {size: fs - 1, color: '#f2c27a', align: 'center'});
          text(ctx, '국부 은하군 · 지름 약 3 Mpc', X(LG_C[0]), Y(LG_C[1] + 1.5) + 16, {size: fs + 1, weight: 800, align: 'center'});
          text(ctx, '회색 점 = 작은 은하 (80여 개)', X(LG_C[0]), Y(LG_C[1] - 1.5) - 14, {size: fs - 1, color: '#a9bccb', align: 'center'});
          scaleBar(1, '1 Mpc ≈ 326만 광년');
        }
        if (lv === 2) {           // 은하단
          field.forEach(([x, y]) => dot(x, y, 1.6, 'rgba(170,186,205,0.6)'));
          ctx.strokeStyle = 'rgba(200,220,240,0.6)'; ctx.setLineDash([5, 5]); ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.arc(X(LG_C[0]), Y(LG_C[1]), 1.5 * k, 0, 2 * Math.PI); ctx.stroke();
          ctx.beginPath(); ctx.arc(X(VIRGO[0]), Y(VIRGO[1]), 5 * k, 0, 2 * Math.PI); ctx.stroke();
          ctx.setLineDash([]);
          dot(0, 0, 2.6, '#9cc0ff'); dot(M31[0], M31[1], 2.6, '#c2b0ff');
          virgo.forEach(([x, y, ell, s]) => dot(x, y, s, ell ? 'rgba(255,184,120,0.9)' : 'rgba(150,195,255,0.9)'));
          const g = ctx.createRadialGradient(X(VIRGO[0]), Y(VIRGO[1]), 0, X(VIRGO[0]), Y(VIRGO[1]), 9);
          g.addColorStop(0, '#fff5e0'); g.addColorStop(1, 'rgba(255,170,90,0)');
          ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(X(VIRGO[0]), Y(VIRGO[1]), 9, 7, 0.3, 0, 2 * Math.PI); ctx.fill();
          const cdx = X(VIRGO[0] + 5.6), cdy = Y(VIRGO[1] + 2.6);
          ctx.strokeStyle = 'rgba(255,217,176,0.8)'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(X(VIRGO[0]) + 7, Y(VIRGO[1]) - 4); ctx.lineTo(cdx - 4, cdy + 4); ctx.stroke();
          text(ctx, 'cD 은하', cdx, cdy - 6, {size: fs, color: '#ffd9b0', weight: 800});
          text(ctx, '중심의 거대 타원 은하', cdx, cdy + 10, {size: fs - 1, color: '#ffd9b0'});
          text(ctx, '처녀자리 은하단 · 지름 약 10 Mpc', X(VIRGO[0]), Y(VIRGO[1] + 5) - 12, {size: fs + 1, weight: 800, align: 'center'});
          text(ctx, '국부 은하군', X(LG_C[0]), Y(LG_C[1] - 1.5) + 14, {size: fs, weight: 800, align: 'center'});
          ctx.strokeStyle = '#f2c27a'; ctx.setLineDash([3, 4]); ctx.lineWidth = 1.5;
          const a0 = [LG_C[0] + 1.6, LG_C[1] + 0.6], a1 = [VIRGO[0] - 5.2, VIRGO[1] - 1.9];
          ctx.beginPath(); ctx.moveTo(X(a0[0]), Y(a0[1])); ctx.lineTo(X(a1[0]), Y(a1[1])); ctx.stroke(); ctx.setLineDash([]);
          text(ctx, '약 16 Mpc (약 5200만 광년)', (X(a0[0]) + X(a1[0])) / 2, (Y(a0[1]) + Y(a1[1])) / 2 + 14, {size: fs - 1, color: '#f2c27a', align: 'center'});
          text(ctx, '주황 = 타원 은하 · 파랑 = 나선 은하', X(VIRGO[0]), Y(VIRGO[1] - 5) + 14, {size: fs - 1, color: '#a9bccb', align: 'center'});
          scaleBar(10, '10 Mpc');
        }
        if (lv === 3) {           // 초은하단
          ctx.beginPath();
          for (let i = 0; i <= 120; i++) { const th = i / 120 * 2 * Math.PI, r = laniR(th); const x = LANI[0] + r * Math.cos(th), y = LANI[1] + r * Math.sin(th); i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y)); }
          ctx.closePath(); ctx.fillStyle = 'rgba(160,140,255,0.08)'; ctx.fill();
          ctx.strokeStyle = 'rgba(190,175,255,0.8)'; ctx.setLineDash([7, 6]); ctx.lineWidth = 1.6; ctx.stroke(); ctx.setLineDash([]);
          linkDots.forEach(([x, y]) => dot(x, y, 1.3, 'rgba(170,186,205,0.55)'));
          scDots.forEach(([x, y]) => dot(x, y, 1.6, 'rgba(205,220,240,0.85)'));
          ctx.save(); ctx.translate(X(9), Y(3)); ctx.rotate(-0.38);
          ctx.strokeStyle = '#f2c27a'; ctx.setLineDash([5, 4]); ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.ellipse(0, 0, 22 * k, 9 * k, 0, 0, 2 * Math.PI); ctx.stroke(); ctx.setLineDash([]); ctx.restore();
          dot(VIRGO[0], VIRGO[1], 4, '#ffb878');
          dot(LG_C[0], LG_C[1], 3, '#9cc0ff');
          text(ctx, '국부 은하군', X(LG_C[0]) - 8, Y(LG_C[1]) + 12, {size: fs - 1, color: '#bcd4ff', align: 'right', weight: 800});
          text(ctx, '처녀자리 은하단', X(VIRGO[0]) + 8, Y(VIRGO[1]) - 10, {size: fs - 1, color: '#ffd9b0', weight: 700});
          text(ctx, '처녀자리 초은하단', X(9), Y(3 + 10) - 12, {size: fs, color: '#f2c27a', weight: 800, align: 'center'});
          SC.slice(1).forEach(s => text(ctx, s.name, X(s.c[0]), Y(s.c[1] + s.s) - 10, {size: fs - 1, color: '#c7d6e2', align: 'center'}));
          text(ctx, '라니아케아 초은하단 · 지름 약 160 Mpc · 은하 약 10만 개', X(LANI[0]), Y(LANI[1] + 92) - 4, {size: fs, color: '#cfc4ff', weight: 800, align: 'center'});
          scaleBar(50, '50 Mpc');
        }
        if (lv === 4) {           // 우주거대구조: SDSS 실제 자료
          const s = SURVEYS.sdss;
          ctx.fillStyle = MONO; ctx.globalAlpha = a * 0.75;
          const r = small() ? 1 : 1.3;
          for (let i = 0; i < s.n; i++) { const x = w / 2 + (s.u[i] * KM - cam.cx) * k, y = h / 2 - (s.v[i] * KM - cam.cy) * k; ctx.fillRect(x - r / 2, y - r / 2, r, r); }
          ctx.globalAlpha = a;
          ctx.strokeStyle = 'rgba(150,178,200,0.4)'; ctx.lineWidth = 1;
          for (const ra of [140, 220]) { const p = M.wedgeXY(ra, Z_MAX, 180); ctx.beginPath(); ctx.moveTo(X(0), Y(0)); ctx.lineTo(X(p.x * KM), Y(p.y * KM)); ctx.stroke(); }
          ctx.strokeStyle = 'rgba(190,175,255,0.75)'; ctx.setLineDash([5, 5]);
          ctx.beginPath(); ctx.arc(X(LANI[0]), Y(LANI[1]), 80 * k, 0, 2 * Math.PI); ctx.stroke(); ctx.setLineDash([]);
          text(ctx, '라니아케아 (160 Mpc)', X(LANI[0]) + 80 * k + 6, Y(LANI[1]), {size: fs - 1, color: '#cfc4ff'});
          dot(0, 0, 3.5, '#f2a33a');
          text(ctx, '우리은하', X(0), Y(0) + 14, {size: fs, color: '#f2c27a', weight: 800, align: 'center'});
          // 03의 '확인'과 같은 수업 표시를 겹쳐 이름을 붙인다 (쐐기 평면 → Mpc 화면 좌표)
          drawLessonMarks(ctx, {X: u => X(u * KM), Y: y => Y(y * KM), scale: () => k * KM}, fs - 2);
          text(ctx, 'SDSS 실제 관측 · 점 하나 = 은하 하나', w - 14, 18, {size: fs - 1, color: '#a9bccb', align: 'right'});
          scaleBar(200, '200 Mpc ≈ 6.5억 광년');
        }
        ctx.restore();
      });
      const L = LEVELS[st.level];
      canvas.setAttribute('aria-label', `${L.name} 단계의 모식도. 보이는 폭 약 ${widthText(cam.w)}`);
      $('g-width').textContent = `보이는 폭 약 ${widthText(cam.w)}`;
    }
    function widthText(wMpc) {
      if (wMpc < 1) return `${M.sig(wMpc * 1000, 2)} kpc (${M.lyText(wMpc).replace('약 ', '')})`;
      return `${M.sig(wMpc, 2)} Mpc (${M.lyText(wMpc).replace('약 ', '')})`;
    }
    const FACTS = [
      {title: '우리은하', note: '모식도 · 크기는 실제 비율(별 하나하나는 그리지 않음)',
        insight: '우리은하 하나만 해도 지름이 약 10만 광년입니다. 그런데 우리은하는 혼자가 아닙니다. <b>축소</b>를 눌러 더 큰 규모로 나가 보세요.', facts: [
        ['무엇', '태양계가 속한 은하'], ['크기', '지름 약 10만 광년 (약 30 kpc)'], ['가까운 이웃', '대·소마젤란은하 (작은 은하)'], ['다음 단계', '우리은하는 혼자가 아니라 작은 무리에 속해 있습니다']]},
      {title: '국부 은하군', note: '모식도 · 지름과 우리은하–안드로메다은하 거리만 실제 비율, 작은 은하의 위치는 임의',
        insight: '우리은하는 안드로메다은하·M33, 작은 은하 80여 개와 함께 <b>국부 은하군</b>(지름 약 3 Mpc)을 이룹니다. 은하들이 무리를 짓는 까닭은 서로 <b>중력</b>으로 끌어당기기 때문입니다.', facts: [
        ['은하군이란', '비교적 작은 규모로 군집을 이룬 은하 집단 (수십 개)'], ['국부 은하군', '우리은하가 속한 은하군'], ['구성', '나선 은하 3개(우리은하·안드로메다은하·M33)와 작은 은하 80여 개'], ['크기', '지름 약 3 Mpc (약 1000만 광년)']]},
      {title: '은하단', note: '모식도 · 처녀자리 은하단의 은하 약 2000개 중 일부만 그림',
        insight: '은하가 수백~수천 개 모이면 <b>은하단</b>입니다. 가장 가까운 처녀자리 은하단은 약 16 Mpc 떨어져 있고, 은하 약 2000개가 <b>자체 중력</b>으로 묶여 있습니다. 중심에는 cD 은하가 있습니다.', facts: [
        ['은하단이란', '수백~수천 개의 은하가 무리 지어 모인 집단'], ['크기', '10 Mpc에 이르기도 합니다'], ['구성', '무거운 나선 은하·타원 은하와 작고 어두운 왜소 타원 은하들. 나선 은하는 주로 외곽에 있습니다'], ['중심', 'cD 은하: 주변 은하를 끌어당겨 병합하며 자란 거대 타원 은하'], ['운동', '은하들은 자체 중력에 의해 은하단 안에서 운동합니다'], ['예', '처녀자리 은하단 (약 16 Mpc 거리, 은하 약 2000개)']]},
      {title: '초은하단', note: '모식도 · 초은하단의 위치와 모양은 대략적으로 그림',
        insight: '은하군과 은하단이 모여 <b>초은하단</b>을 이룹니다. 국부 은하군은 처녀자리 초은하단의 일부이고, 더 크게는 지름 약 160 Mpc인 라니아케아 초은하단에 속합니다. 초은하단은 <b>강하게 묶여 있지 않아</b> 경계를 정하기 어렵습니다.', facts: [
        ['초은하단이란', '은하군·은하단과 그 주변 은하들이 모인 더 큰 구조'], ['우리의 자리', '국부 은하군 ⊂ 처녀자리 초은하단 ⊂ 라니아케아 초은하단'], ['라니아케아', '지름 약 160 Mpc, 은하 약 10만 개 (2014년에 밝혀짐)'], ['특징', '자체 중력에 강하게 묶여 있지 않아 크기가 크고 밀도가 낮으며, 경계를 정확히 정하기 어렵습니다']]},
      {title: '우주거대구조', note: 'SDSS 실제 관측 자료 (적위 −1.25°~+1.25°의 얇은 띠) · 표시는 수업 결과 슬라이드와 같은 한 가지 예',
        insight: '초은하단보다 큰 규모에서는 은하들이 <b>필라멘트</b>와 <b>은하 장성</b>으로 이어지고, 그 사이에 <b>보이드</b>가 있습니다. 이 모두를 통틀어 <b>우주거대구조</b>라고 합니다. 이 지도는 03에서 직접 만들어 봅니다.', facts: [
        ['필라멘트', '은하들이 그물망처럼 얽혀 이어진 실 모양 구조'], ['은하 장성', '필라멘트보다 훨씬 두껍고 거대한 벽 같은 구조 (Great Wall)'], ['보이드', '초은하단 사이, 은하가 거의 없는 커다란 빈 공간 (기출: 거대 공동)'], ['우주거대구조', '이 큰 구조들을 통틀어 부르는 말 (기출: 우주 거대 구조)']]}
    ];
    const ADDRESS = [
      {level: 4, name: '우주거대구조', size: '그물처럼 이어진 큰 구조'},
      {level: 3, name: '라니아케아 초은하단', size: '지름 약 160 Mpc (약 5억 광년)'},
      {level: 3, name: '처녀자리 초은하단', size: ''},
      {level: 1, name: '국부 은하군', size: '지름 약 3 Mpc (약 1000만 광년)'},
      {level: 0, name: '우리은하', size: '지름 약 10만 광년'}
    ];
    function renderSide() {
      setPressed(chips, 'data-level', String(st.level));
      $('g-in').disabled = st.level === 0;
      $('g-out').disabled = st.level === LEVELS.length - 1;
      const f = FACTS[st.level];
      $('g-title').textContent = f.title;
      $('g-facts-title').textContent = `${f.title}의 특징`;
      $('g-note').textContent = f.note;
      $('g-insight').innerHTML = f.insight;
      $('g-facts').innerHTML = f.facts.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
      const col = {1: 0, 2: 1, 3: 2}[st.level];
      const on = c => (c === col ? ' class="on"' : '');
      const exp = st.revealed ? ['크기 그대로', '크기 그대로', '더 커진다'] : ['?', '?', '?'];
      const expCls = c => (st.revealed ? (c === col ? ' class="on revealed"' : ' class="revealed"') : ' class="hidden-cell"');
      $('g-table').innerHTML = `<thead><tr><th></th><th>은하군</th><th>은하단</th><th>초은하단</th></tr></thead><tbody>
        <tr><th>은하의 수</th><td${on(0)}>수십 개</td><td${on(1)}>수백~수천 개</td><td${on(2)}>은하군·은하단 여럿</td></tr>
        <tr><th>크기</th><td${on(0)}>약 3 Mpc<br><span class="micro">국부 은하군</span></td><td${on(1)}>10 Mpc에 이르기도</td><td${on(2)}>160 Mpc<br><span class="micro">라니아케아</span></td></tr>
        <tr><th>자체 중력</th><td${on(0)}>묶여 있다</td><td${on(1)}>묶여 있다</td><td${on(2)}>강하게 묶여 있지 않다</td></tr>
        <tr><th>우주가 팽창하면</th><td${expCls(0)}>${exp[0]}</td><td${expCls(1)}>${exp[1]}</td><td${expCls(2)}>${exp[2]}</td></tr></tbody>`;
      const addr = $('g-address');
      addr.innerHTML = `<p class="atitle">✉ 우주에서 우리 집 주소</p><ol>${ADDRESS.map(a => `<li><button type="button" data-addr="${a.level}" aria-pressed="${a.level === st.level && !(a.name === '처녀자리 초은하단')}">${a.name}<span>${a.size}</span></button></li>`).join('')}
        <li class="plain">태양계 → 지구 → 세화여고</li></ol>
        <p class="anote">${st.level === 2 ? '처녀자리 은하단은 우리 주소에 없어요. 같은 처녀자리 초은하단 안의 이웃 동네입니다.' : '주소를 누르면 그 단계로 확대·축소합니다. 은하들이 무리를 짓는 까닭은 서로 중력으로 끌어당기기 때문입니다.'}</p>`;
      addr.querySelectorAll('[data-addr]').forEach(b => b.addEventListener('click', () => go(+b.dataset.addr)));
    }

    // ── 3 우주가 팽창하면? ──
    const xc = $('x-canvas'), scene = M.expansionScene(7);
    const xs = {a: 1, t: 0, played: false};
    const slider = $('x-a');
    slider.addEventListener('input', () => { xs.a = +slider.value; xAnim.stop(); setPlay(); if (xs.a >= 1.3) reveal(); drawX(); });
    const xAnim = animator(dt => {
      xs.t += dt;
      xs.a = Math.min(2, xs.a + dt / 3.2);
      slider.value = xs.a;
      if (xs.a >= 1.3) reveal();
      drawX();
      if (xs.a >= 2) { setPlay(); return false; }
      return true;
    });
    $('x-play').addEventListener('click', () => {
      if (xAnim.running) { xAnim.stop(); setPlay(); return; }
      if (xs.a >= 2) { xs.a = 1; slider.value = 1; drawX(); setPlay(); return; }
      if (reduced) { xs.a = 2; slider.value = 2; reveal(); drawX(); setPlay(); return; }
      xAnim.start(); setPlay();
    });
    function setPlay() { $('x-play').textContent = xAnim.running ? '❚❚ 멈춤' : xs.a >= 2 ? '↺ 처음으로' : '▶ 팽창시키기'; }
    function reveal() { if (!st.revealed) { st.revealed = true; renderSide(); } }
    const EX = 2;   // 은하군·은하단은 2배 크게 그림
    function drawX() {
      const {ctx, w, h} = fitCanvas(xc, W => small() ? W * 0.8 : W * 0.5);
      const fs = small() ? 12 : 13;
      const span = 290, k = Math.min(w / span, h / (span * 0.62)), X = x => w / 2 + x * k, Y = y => h / 2 + 8 - y * k;
      // 우주 공간의 눈금(함께 늘어나는 격자)
      ctx.strokeStyle = 'rgba(120,150,180,0.22)'; ctx.lineWidth = 1;
      const g = 40 * xs.a;
      for (let x = -Math.ceil(w / 2 / (g * k)); x <= Math.ceil(w / 2 / (g * k)); x++) { ctx.beginPath(); ctx.moveTo(X(x * g), 0); ctx.lineTo(X(x * g), h); ctx.stroke(); }
      for (let y = -Math.ceil(h / 2 / (g * k)) - 1; y <= Math.ceil(h / 2 / (g * k)) + 1; y++) { ctx.beginPath(); ctx.moveTo(0, Y(y * g)); ctx.lineTo(w, Y(y * g)); ctx.stroke(); }
      // 초은하단 윤곽: 중심을 감싸는 점선 (팽창을 따라 커짐)
      const pts = scene.systems.map(s => [s.cx * xs.a, s.cy * xs.a, s.radius * EX + 10]);
      ctx.beginPath();
      for (let i = 0; i <= 90; i++) {
        const th = i / 90 * 2 * Math.PI, dx = Math.cos(th), dy = Math.sin(th);
        let r = 0;
        pts.forEach(([x, y, pad]) => { r = Math.max(r, x * dx + y * dy + pad); });
        i ? ctx.lineTo(X(r * dx), Y(r * dy)) : ctx.moveTo(X(r * dx), Y(r * dy));
      }
      ctx.closePath(); ctx.fillStyle = 'rgba(160,140,255,0.07)'; ctx.fill();
      ctx.strokeStyle = 'rgba(190,175,255,0.85)'; ctx.setLineDash([7, 6]); ctx.lineWidth = 1.6; ctx.stroke(); ctx.setLineDash([]);
      // 은하
      scene.field.forEach(f => { ctx.fillStyle = 'rgba(170,186,205,0.7)'; ctx.beginPath(); ctx.arc(X(f.x * xs.a), Y(f.y * xs.a), 1.8, 0, 2 * Math.PI); ctx.fill(); });
      scene.systems.forEach(s => {
        const cx = s.cx * xs.a, cy = s.cy * xs.a;
        ctx.strokeStyle = s.kind === 'cluster' ? 'rgba(255,200,150,0.75)' : 'rgba(160,200,255,0.75)'; ctx.lineWidth = 1.3;
        ctx.beginPath(); ctx.arc(X(cx), Y(cy), s.radius * EX * k + 4, 0, 2 * Math.PI); ctx.stroke();
        s.members.forEach(m => {
          const ang = m.phase + m.speed * xs.t;
          ctx.fillStyle = m.big ? '#fff1d6' : s.kind === 'cluster' ? 'rgba(255,190,130,0.95)' : 'rgba(170,205,255,0.95)';
          ctx.beginPath(); ctx.arc(X(cx + m.r * EX * Math.cos(ang)), Y(cy + m.r * EX * Math.sin(ang)), m.big ? 3.4 : 2, 0, 2 * Math.PI); ctx.fill();
        });
        if (s.name !== '은하군') text(ctx, s.name, X(cx), Y(cy) - s.radius * EX * k - 14, {size: fs - 1, align: 'center', color: s.kind === 'cluster' ? '#ffd9b0' : '#bcd4ff', weight: 700});
      });
      text(ctx, '점선 = 초은하단', 12, 16, {size: fs - 1, color: '#cfc4ff'});
      text(ctx, `우주의 크기 ×${xs.a.toFixed(2)}`, w - 12, 16, {size: fs, color: '#f2c27a', weight: 800, align: 'right'});
      text(ctx, '모식도 · 은하군·은하단은 2배 크게 그림', w - 12, h - 12, {size: fs - 2, color: '#a9bccb', align: 'right'});
      $('x-a-out').textContent = `×${xs.a.toFixed(2)}`;
      $('x-free').textContent = `×${xs.a.toFixed(2)}`;
      $('x-bound').textContent = '처음과 같음 (×1.00)';
      $('x-insight').innerHTML = xs.a < 1.02
        ? '▶를 누르거나 막대를 밀어 우주를 팽창시켜 보세요. 뒤의 격자는 우주 공간의 눈금이라 팽창과 함께 늘어납니다.'
        : `우주가 ×${xs.a.toFixed(2)}로 팽창하는 동안 은하군·은하단의 크기는 그대로입니다. 은하들이 <b>자체 중력으로 묶여</b> 그 안에서 운동하기 때문입니다. 초은하단은 <b>강하게 묶여 있지 않아</b> 팽창을 따라 커졌고(×${xs.a.toFixed(2)}), 은하단 사이의 거리도 함께 멀어졌습니다.`;
    }

    function render() { renderSide(); draw(); drawX(); setPlay(); }
    return {render, pause() { anim.stop(); st.t = 1; xAnim.stop(); setPlay(); }};
  })();

  // ═══════════════ 02 분광으로 거리 재기 ═══════════════
  stations.spectrum = (() => {
    const S = SURVEYS.sdss, CIRCLED = ['①', '②', '③', '④', '⑤'];
    const TARGETS = S.featured.map((idx, k) => ({id: 'g' + k, kind: 'sdss', idx, label: `은하 ${CIRCLED[k]}`, mark: CIRCLED[k]}));
    TARGETS.push({id: 'rand', kind: 'sdss', idx: null, label: '🎲 다른 은하', mark: '?'});
    TARGETS.push({id: 'q2', kind: 'q2', label: '교과서·학습지 문제', task: true});
    TARGETS.push({id: 'm31', kind: 'm31', label: '안드로메다은하', task: true});
    const st = {t: TARGETS[0], idx: S.featured[0], line: null, lam: null, snapped: null, q2gal: 'A', solved: {q2: false, p121: false}, lineZ: {}, measured: new Map()};
    const svg = $('s-chart');
    const chips = $('s-targets');
    TARGETS.forEach((t, k) => {
      if (t.task && !TARGETS[k - 1].task) { const sep = document.createElement('span'); sep.className = 'sep'; chips.appendChild(sep); }
      const b = document.createElement('button');
      b.type = 'button'; b.dataset.target = t.id; b.className = t.task ? 'task' : '';
      if (t.kind === 'sdss' && t.idx !== null) b.innerHTML = `${t.label}<span class="tag">${S.red[t.idx] ? '붉은 은하' : '푸른 은하'}</span>`;
      else b.textContent = t.label;
      b.addEventListener('click', () => load(t));
      chips.appendChild(b);
    });
    function spec() {
      if (st.t.kind === 'q2') return M.singleLineSpectrum(500, '흡수선');
      if (st.t.kind === 'm31') return M.singleLineSpectrum(656.3, 'Hα 흡수선', 0.12);   // 확대해 보므로 선을 좁게
      return S.red[st.idx] ? M.SPECTRA.red : M.SPECTRA.blue;
    }
    function zTrue() {
      if (st.t.kind === 'q2') return st.q2gal === 'A' ? 0.028 : 0.084;
      if (st.t.kind === 'm31') return M.zFromVelocity(-300);
      return S.z[st.idx];
    }
    const range = () => (st.t.kind === 'q2' ? [480, 560] : st.t.kind === 'm31' ? [650, 662] : [370, 770]);
    const digits = () => (st.t.kind === 'm31' ? 2 : st.t.kind === 'q2' ? 0 : 1);
    const tol = () => (st.t.kind === 'm31' ? 0.18 : st.t.kind === 'q2' ? 2 : 3);
    function load(t) {
      st.t = t;
      if (t.kind === 'sdss') {
        if (t.idx === null) {
          const r = M.rng((Date.now() ^ (Math.random() * 1e9)) >>> 0);
          let i; do { i = Math.floor(r() * S.n); } while (S.z[i] < 0.01);
          st.idx = i;
        } else st.idx = t.idx;
      }
      const sp = spec();
      st.line = st.t.kind === 'sdss' ? (sp.kind === 'red' ? 'Na' : 'Ha') : 'X';
      resetMarker();
      render();
    }
    function resetMarker() { st.lam = M.specLine(spec(), st.line).rest; st.snapped = null; }
    $('s-snap').addEventListener('click', () => {
      const sp = spec(), at = M.observedWavelength(M.specLine(sp, st.line).rest, zTrue());
      st.lam = at; st.snapped = {id: st.line, lambda: at}; afterMeasure(); render();
    });
    $('s-go-map').addEventListener('click', () => { show('map'); document.querySelector('.stations').scrollIntoView({block: 'nearest'}); });

    // 그래프 배치
    let L = {};
    function layout() {
      const tall = small();
      const W = svgW(svg), l = tall ? 24 : 40, r = W - 20;
      const s = tall ? 1.45 : 1;
      const labY = tall ? 26 : 16, refT = tall ? 66 : 44, refB = refT + 34 * s, arrowY = refB + 16 * s, fluxT = refB + 30 * s, fluxB = fluxT + 108 * s, obsT = fluxB + 8 * s, obsB = obsT + 34 * s, axisY = obsB + 8 * s;
      L = {W, H: Math.round(axisY + 50 * s), l, r, labY, refT, refB, arrowY, fluxT, fluxB, obsT, obsB, axisY, s};
      svg.setAttribute('viewBox', `0 0 ${W} ${L.H}`);
    }
    function waveColor(l) {
      let r = 0, g = 0, b = 0;
      if (l < 440) { r = clamp(-(l - 440) / 60, 0, 1); b = 1; }
      else if (l < 490) { g = (l - 440) / 50; b = 1; }
      else if (l < 510) { g = 1; b = -(l - 510) / 20; }
      else if (l < 580) { r = (l - 510) / 70; g = 1; }
      else if (l < 645) { r = 1; g = -(l - 645) / 65; }
      else r = 1;
      let f = 1;
      if (l < 420) f = 0.35 + 0.65 * (l - 380) / 40; else if (l > 700) f = 0.3 + 0.7 * (780 - l) / 80;
      f = clamp(f, 0.18, 1);
      const c = v => Math.round(255 * Math.pow(clamp(v * f, 0, 1), 0.8));
      return `rgb(${c(r)},${c(g)},${c(b)})`;
    }
    function drawStrip(x, y, h, lam0, lam1, sp, z, id) {
      const grad = el('linearGradient', {id, x1: L.l, x2: L.r, y1: 0, y2: 0, gradientUnits: 'userSpaceOnUse'}, svg.defs);
      for (let k = 0; k <= 40; k++) { const l = lam0 + (lam1 - lam0) * k / 40; el('stop', {offset: k / 40, 'stop-color': waveColor(l)}, grad); }
      const emission = sp.kind === 'blue';
      el('rect', {x: L.l, y, width: L.r - L.l, height: h, fill: emission ? '#0d1622' : `url(#${id})`, rx: 4}, svg);
      if (emission) el('rect', {x: L.l, y, width: L.r - L.l, height: h, fill: `url(#${id})`, opacity: 0.18, rx: 4}, svg);
      for (const [lid, amp, sigma] of sp.lines) {
        const rest = M.specLine(sp, lid).rest, at = rest * (1 + z);
        if (at < lam0 || at > lam1) continue;
        const X = x(at), wpx = Math.max(2.2, 1.6 * sigma * (1 + z) * (L.r - L.l) / (lam1 - lam0));
        if (amp < 0) el('rect', {x: X - wpx / 2, y, width: wpx, height: h, fill: '#05080d', opacity: Math.min(1, -amp * 1.8)}, svg);
        else el('rect', {x: X - wpx / 2, y, width: wpx, height: h, fill: waveColor(at), opacity: Math.min(1, 0.35 + amp * 0.6)}, svg);
      }
    }
    function drawChart() {
      layout();
      clear(svg);
      svg.defs = el('defs', {}, svg);
      const [l0, l1] = range(), sp = spec(), z = zTrue(), xs = lin(l0, l1, L.l, L.r), s = L.s;
      const lab = (x, y, t, o) => el('text', Object.assign({x, y, class: 'tick'}, o || {}), svg, t);
      // 기준 스펙트럼 (실험실)
      drawStrip(xs, L.refT, L.refB - L.refT, l0, l1, sp, 0, 'g-ref');
      drawStrip(xs, L.obsT, L.obsB - L.obsT, l0, l1, sp, z, 'g-obs');
      lab(L.l, L.labY, '기준 스펙트럼 (정지한 광원 · 기준 파장 λ₀)', {class: 'annot', fill: '#14283a'});
      lab(L.l, L.fluxT + 14 * s, st.t.kind === 'm31' ? '안드로메다은하의 스펙트럼 (관측)' : st.t.kind === 'q2' ? `은하 ${st.q2gal}의 스펙트럼 (관측)` : '이 은하의 스펙트럼 (관측 · 관측 파장 λ)', {class: 'annot', fill: '#14283a'});
      // 선 이름 (기준 스펙트럼 위). 가까운 선은 한 이름으로 묶는다.
      const marked = sp.marked.map(id => ({id, x: xs(M.specLine(sp, id).rest), line: M.specLine(sp, id)})).filter(m => m.x >= L.l && m.x <= L.r);
      const groups = [];
      marked.forEach(m => { const g = groups.find(q => Math.abs(q.x - m.x) < 30 * s); if (g) { g.ids.push(m.id); g.x = (g.x + m.x) / 2; } else groups.push({x: m.x, ids: [m.id]}); });
      groups.forEach(g => {
        const name = g.ids.length === 2 && g.ids.includes('K') ? 'Ca Ⅱ K·H' : g.ids.map(id => M.specLine(sp, id).name).join('·');
        const on = g.ids.includes(st.line);
        el('text', {x: g.x, y: L.refT - (small() ? 8 : 6), 'text-anchor': 'middle', class: 'tick' + (small() ? ' lab-s' : ''), fill: on ? '#c2581c' : '#5f7282', 'font-weight': on ? 800 : 600}, svg, name);
      });
      // 세기 그래프
      const ys = lin(0, 1.9, L.fluxB, L.fluxT + 22 * s);
      const g = el('g', {class: 'axis'}, svg);
      el('line', {x1: L.l, x2: L.r, y1: L.fluxB, y2: L.fluxB, class: 'grid-line'}, g);
      let d = '';
      const r = M.rng(st.t.kind === 'sdss' ? st.idx + 1 : 77);
      for (let k = 0; k <= 520; k++) {
        const lam = l0 + (l1 - l0) * k / 520;
        const f = M.observedFlux(lam, z, sp) * (1 + (st.t.kind === 'sdss' ? 0.025 * (r() - 0.5) : 0));
        d += (k ? 'L' : 'M') + xs(lam).toFixed(1) + ' ' + ys(f).toFixed(1);
      }
      el('path', {d, fill: 'none', stroke: '#14283a', 'stroke-width': 1.5, 'stroke-linejoin': 'round'}, svg);
      lab(L.r, L.fluxT + 14 * s, sp.kind === 'blue' ? '봉우리 = 방출선' : '골짜기 = 흡수선', {'text-anchor': 'end'});
      // 파장 축
      const step = l1 - l0 > 200 ? 50 : l1 - l0 > 40 ? 10 : 2;
      const ax = el('g', {class: 'axis'}, svg);
      for (let v = Math.ceil(l0 / step) * step; v <= l1 + 1e-9; v += step) {
        el('line', {x1: xs(v), x2: xs(v), y1: L.obsB, y2: L.obsB + 5}, ax);
        el('text', {x: xs(v), y: L.axisY + 16 * s, 'text-anchor': 'middle', class: 'tick'}, ax, String(v));
      }
      el('text', {x: (L.l + L.r) / 2, y: L.axisY + 40 * s, 'text-anchor': 'middle', class: 'axis-label'}, svg, '파장 (nm) — 오른쪽이 붉은 쪽(긴 파장)');
      // 고른 기준 선의 자리와 밀린 양
      const rest = M.specLine(sp, st.line).rest, x0 = xs(rest), x1 = xs(clamp(st.lam, l0, l1));
      el('line', {x1: x0, x2: x0, y1: L.refT, y2: L.obsB, stroke: '#c2581c', 'stroke-width': 1.5, 'stroke-dasharray': '4 4', opacity: 0.7}, svg);
      el('path', {d: `M${x0} ${L.refB + 1}l-6 -7h12z`, fill: '#c2581c'}, svg);
      if (Math.abs(x1 - x0) > 3) {
        const dir = Math.sign(x1 - x0);
        el('path', {d: `M${x0} ${L.arrowY}H${x1 - dir * 2}M${x1 - dir * 9} ${L.arrowY - 5}L${x1 - dir * 2} ${L.arrowY}L${x1 - dir * 9} ${L.arrowY + 5}`, stroke: '#c2581c', 'stroke-width': 2, fill: 'none'}, svg);
        el('text', {x: (x0 + x1) / 2, y: L.arrowY - 6, 'text-anchor': 'middle', class: 'annot halo', fill: '#c2581c'}, svg, `${st.lam >= rest ? '+' : '−'}${Math.abs(M.roundTo(st.lam, digits()) - rest).toFixed(digits())} nm`);
      }
      // 노란 표시 (관측 파장)
      const match = st.snapped && st.snapped.id === st.line;
      const col = st.snapped ? '#0b7f9a' : '#e6a93c';
      el('line', {x1: x1, x2: x1, y1: L.fluxT + 4, y2: L.obsB + 4, stroke: col, 'stroke-width': 3}, svg);
      const hw = 13 * s;
      el('rect', {x: x1 - hw, y: L.obsB + 4, width: 2 * hw, height: 18 * s, rx: 5, fill: col}, svg);
      el('text', {x: x1, y: L.obsB + 4 + 13 * s, 'text-anchor': 'middle', fill: '#fff', 'font-size': 12 * s, 'font-weight': 800}, svg, 'λ');
      const tx = clamp(x1, L.l + 50 * s, L.r - 50 * s);
      el('text', {x: tx, y: L.fluxT + 32 * s, 'text-anchor': 'middle', class: 'annot halo', fill: col}, svg, `λ = ${M.roundTo(st.lam, digits()).toFixed(digits())} nm${match ? ' ✓' : ''}`);
      svg.setAttribute('aria-label', `기준 스펙트럼과 관측 스펙트럼. 고른 선의 기준 파장 ${rest} nm, 표시한 관측 파장 ${st.lam.toFixed(digits())} nm`);
    }
    function renderLinePick() {
      const sp = spec(), box = $('s-lines');
      box.innerHTML = `<span class="lbl">기준 선</span>` + sp.marked.map(id => {
        const ln = M.specLine(sp, id);
        return `<button type="button" data-line="${id}" aria-pressed="${id === st.line}">${ln.name} ${ln.rest}</button>`;
      }).join('');
      box.querySelectorAll('[data-line]').forEach(b => b.addEventListener('click', () => { st.line = b.dataset.line; resetMarker(); render(); }));
      $('s-kind').textContent = st.t.kind === 'sdss' ? `${sp.label}이 뚜렷한 ${S.red[st.idx] ? '붉은 은하 (늙은 별이 많음)' : '푸른 은하 (젊은 별과 가스가 많음)'}` : st.t.kind === 'm31' ? 'Hα 근처를 크게 확대 (650~662 nm)' : '기준 파장 500 nm인 흡수선';
    }
    pointer(svg, {
      down(p) {
        if (p.y < L.refB + 4 && p.y > L.refT - 26 * L.s) {       // 기준 스펙트럼을 누르면 선 고르기
          const sp = spec(), [l0, l1] = range(), xs = lin(l0, l1, L.l, L.r);
          let best = null;
          sp.marked.forEach(id => { const dx = Math.abs(xs(M.specLine(sp, id).rest) - p.x); if (dx < 16 && (!best || dx < best.dx)) best = {id, dx}; });
          if (best && best.id !== st.line) { st.line = best.id; resetMarker(); render(); }
          return false;
        }
        if (p.y < L.fluxT - 6) return false;
        move(p); return true;
      },
      move(p) { move(p); },
      up() {}
    }, e => svgPoint(svg, e));
    function move(p) {
      const [l0, l1] = range(), xs = lin(l0, l1, L.l, L.r);
      const lam = clamp(xs.inv(clamp(p.x, L.l, L.r)), l0, l1);
      const snap = M.snapToLine(lam, zTrue(), spec(), tol());
      st.lam = snap ? snap.lambda : lam; st.snapped = snap;
      afterMeasure();
      render();
    }
    function afterMeasure() {
      if (st.t.kind !== 'sdss' || !st.snapped || st.snapped.id !== st.line) return;
      const s = M.measureSteps(M.specLine(spec(), st.line).rest, st.lam, 1);
      (st.lineZ[st.idx] = st.lineZ[st.idx] || {})[st.line] = s.z;
      st.measured.set(st.idx, {z: s.z, mark: st.t.mark});
    }

    function renderSteps() {
      const sp = spec(), ln = M.specLine(sp, st.line), s = M.measureSteps(ln.rest, st.lam, digits());
      const q2 = st.t.kind === 'q2', hide = q2 && !st.solved.q2, m31 = st.t.kind === 'm31';
      const lamTxt = s.lambda.toFixed(digits()), l0Txt = String(ln.rest);
      const idle = Math.abs(st.lam - ln.rest) < 0.05 && !st.snapped;     // 아직 표시를 옮기지 않음
      const Q = v => (hide ? '?' : idle ? '—' : v);
      const dTxt = m31 ? '쓸 수 없음' : `${Q(fmtD(s.d))} Mpc`;
      $('s-steps').innerHTML = `
        <div class="s"><div class="k">① 파장 재기</div><div class="v">λ = ${lamTxt} nm</div><div class="w"><span class="m">기준 파장 λ₀ = ${l0Txt} nm (${ln.name}) · 밀린 양 ${s.dl >= 0 ? '+' : '−'}${Math.abs(s.dl).toFixed(digits())} nm</span></div></div>
        <div class="s ${hide ? 'q' : ''}"><div class="k">② 적색 편이 z</div><div class="v">${Q(fmtZ(s.z))}</div><div class="w"><span class="eq">z = ${frac('λ − λ₀', 'λ₀')} = ${frac(`${lamTxt} − ${l0Txt}`, l0Txt)} = ${Q(fmtZ(s.z))}</span></div></div>
        <div class="s ${hide ? 'q' : ''}"><div class="k">③ 후퇴 속도 v</div><div class="v">${Q(fmtV(s.v))} km/s</div><div class="w"><span class="eq">v = c × z = 3 × 10⁵ km/s × ${s.z < 0 && !hide && !idle ? `(${fmtZ(s.z)})` : Q(fmtZ(s.z))} = ${Q(fmtV(s.v))} km/s</span></div></div>
        <div class="s ${m31 ? 'warn' : 'final'} ${hide ? 'q' : ''}"><div class="k">④ 거리 d (허블-르메트르 법칙 v = H × d)</div><div class="v">${dTxt}</div><div class="w">${m31
          ? '<span>시선 속도가 (−) → 다가온다. 우주 팽창으로 멀어지는 것이 아니므로 d = v ÷ H를 쓸 수 없습니다.</span>'
          : `<span class="eq">d = ${frac('v', 'H')} = ${frac(`${Q(fmtV(s.v))} km/s`, '70 km/s/Mpc')} = ${Q(fmtD(s.d))} Mpc</span><span class="m">${hide || idle ? '' : M.lyText(s.d)}</span>`}</div></div>`;
      // 덧붙임: 문제 풀이, SDSS 측정값 비교
      const extra = $('s-extra');
      if (q2) {
        const solA = M.measureSteps(500, 514, 0), solB = M.measureSteps(500, 542, 0);
        extra.innerHTML = `<div class="qbox"><p class="qtitle">학습지 Q2</p>
          <p>은하 A의 스펙트럼에서 기준 파장이 500 nm인 흡수선이 514 nm로 관측되었다. (c = 3 × 10⁵ km/s, H = 70 km/s/Mpc)<br>(1) A의 적색 편이와 후퇴 속도는? (2) A까지의 거리는? (3) 같은 흡수선이 542 nm로 관측된 은하 B까지의 거리는 A의 몇 배인가?</p>
          <div class="row"><div class="segmented" role="group" aria-label="은하 고르기"><button type="button" data-gal="A" aria-pressed="${st.q2gal === 'A'}">은하 A (514 nm)</button><button type="button" data-gal="B" aria-pressed="${st.q2gal === 'B'}">은하 B (542 nm)</button></div>
          <button type="button" class="compact ${st.solved.q2 ? '' : 'primary'}" id="s-q2-solve">${st.solved.q2 ? '풀이 숨기기' : '풀이 확인'}</button></div>
          ${st.solved.q2 ? `<div class="sol">
            <span class="eq">(1) z = ${frac('514 − 500', '500')} = ${fmtZ(solA.z)}, &nbsp;v = 3 × 10⁵ × ${fmtZ(solA.z)} = ${solA.v} km/s</span>
            <span class="eq">(2) d = ${frac(solA.v, '70')} = ${fmtD(solA.d)} Mpc</span>
            <span class="eq">(3) B: z = ${frac('542 − 500', '500')} = ${fmtZ(solB.z)} = A의 3배 → 후퇴 속도도 3배 → <b>거리도 3배</b> (${fmtD(solB.d)} Mpc)</span></div>` : ''}
        </div>
        <div class="qbox"><p class="qtitle">교과서 121쪽 확인 문제 3 (2)</p>
          <p>쐐기 지도에서 후퇴 속도가 10000 km/s인 은하 P까지의 거리는? (허블 상수 70 km/s/Mpc)</p>
          <div class="row"><button type="button" class="compact ${st.solved.p121 ? '' : 'primary'}" id="s-p121-solve">${st.solved.p121 ? '풀이 숨기기' : '풀이 확인'}</button></div>
          ${st.solved.p121 ? `<div class="sol"><span class="eq">d = ${frac('V<sub>r</sub>', 'H')} = ${frac('10000 km/s', '70 km/s/Mpc')} ≒ ${Math.round(M.distanceFromVelocity(10000))} Mpc</span></div>` : ''}
        </div>`;
        extra.querySelectorAll('[data-gal]').forEach(b => b.addEventListener('click', () => { st.q2gal = b.dataset.gal; resetMarker(); render(); }));
        $('s-q2-solve').addEventListener('click', () => { st.solved.q2 = !st.solved.q2; render(); });
        $('s-p121-solve').addEventListener('click', () => { st.solved.p121 = !st.solved.p121; render(); });
      } else if (m31) {
        extra.innerHTML = `<div class="qbox"><p class="qtitle">모두 멀어지는 것은 아니다</p><p>안드로메다은하의 시선 속도는 약 −300 km/s입니다(청색 편이). 우리은하와 안드로메다은하는 같은 국부 은하군 안에서 서로 중력으로 끌어당겨, 우주 팽창을 따라 멀어지지 않습니다. 실제 거리는 약 0.77 Mpc(250만 광년)입니다. <span class="micro">기출에서는 「시선 속도 −301 km/s」처럼 나옵니다.</span></p></div>`;
      } else {
        const match = st.snapped && st.snapped.id === st.line;
        const zs = st.lineZ[st.idx] || {};
        const done = Object.keys(zs);
        extra.innerHTML = match ? `<div class="qbox"><p class="qtitle">SDSS가 잰 값과 비교</p><p>SDSS가 이 은하의 스펙트럼으로 잰 적색 편이는 <b>${S.z[st.idx].toFixed(5)}</b>입니다. 내가 잰 값 ${fmtZ(zs[st.line])}와 ${Math.abs(zs[st.line] / S.z[st.idx] - 1) < 0.005 ? '거의 같습니다' : `${(Math.abs(zs[st.line] / S.z[st.idx] - 1) * 100).toFixed(1)}% 차이 납니다 (눈금을 읽은 값이라 조금 다를 수 있어요)`}.${done.length > 1 ? `<br>선마다 잰 z: ${done.map(id => `${M.specLine(spec(), id).name} ${fmtZ(zs[id])}`).join(' · ')}` : ''}</p></div>` : '';
      }
      // 한 줄 정리
      let msg;
      if (q2) msg = !st.snapped ? '노란 표시를 관측한 흡수선으로 끌어 놓으세요. 기준 파장 500 nm에서 오른쪽(붉은 쪽)으로 밀려 있습니다.'
        : st.solved.q2 ? '파장이 밀린 양이 3배(14 nm → 42 nm)이면 적색 편이도 3배, 후퇴 속도도 3배, 거리도 3배입니다. 후퇴 속도가 거리에 비례하기 때문입니다(v = H × d).'
        : `은하 ${st.q2gal}의 흡수선이 <b>${st.lam.toFixed(0)} nm</b>로 관측되었습니다. ②~④를 직접 계산해 본 뒤 ‘풀이 확인’을 눌러 보세요. 은하 ${st.q2gal === 'A' ? 'B' : 'A'}도 재 보고 밀린 양을 비교해 보세요.`;
      else if (m31) msg = st.snapped ? '선이 <b>파란 쪽(짧은 파장)</b>으로 밀렸습니다 = <b>청색 편이</b>. 시선 속도가 (−)이므로 안드로메다은하는 우리은하에 <b>다가오고</b> 있어요. 우주가 팽창해도 같은 은하군 안에서는 중력이 팽창을 이깁니다.' : 'Hα 흡수선은 어느 쪽으로 밀렸을까요? 노란 표시를 관측 스펙트럼의 흡수선으로 끌어 보세요.';
      else if (!st.snapped) msg = `기준 스펙트럼에서 고른 선(<b>${ln.name}</b>)이 이 은하에서는 어디로 밀려 있을까요? 노란 표시를 오른쪽(붉은 쪽)으로 끌어 <b>같은 무늬의 선</b>에 맞춰 보세요. 선 가까이 가면 붙습니다.`;
      else if (st.snapped.id !== st.line) msg = `지금 표시는 <b>${M.specLine(sp, st.snapped.id).name}</b> 선에 붙어 있어요. 고른 선(${ln.name})과 다른 선입니다. 선들 사이의 간격(무늬)을 기준 스펙트럼과 비교해 같은 선을 찾아보세요.`;
      else {
        const zs = st.lineZ[st.idx] || {}, ids = Object.keys(zs);
        msg = ids.length > 1
          ? `어느 선으로 재도 z가 거의 같습니다(${ids.map(id => fmtZ(zs[id])).join(', ')} — 끝자리 차이는 눈금을 읽을 때 생긴 것). 파장이 긴 선일수록 많이 밀리지만(밀린 양이 크지만) <b>밀린 비율 z는 모든 선이 같습니다</b>. 그래서 적색 편이를 비율로 나타냅니다.`
          : `잘 맞혔어요! 이 은하는 우리에게서 <b>${fmtV(s.v)} km/s</b>로 멀어지고 있고, 거리는 약 <b>${fmtD(s.d)} Mpc</b>입니다. 다른 기준 선을 골라 한 번 더 재 보세요. z가 어떻게 나올까요?`;
      }
      $('s-insight').innerHTML = msg;
      $('s-l0').textContent = `${ln.rest} nm`;
      $('s-l').textContent = `${s.lambda.toFixed(digits())} nm`;
      $('s-dl').textContent = `${s.dl >= 0 ? '+' : '−'}${Math.abs(s.dl).toFixed(digits())} nm`;
      $('s-note').innerHTML = st.t.kind === 'sdss'
        ? `SDSS 은하 · 적경 ${S.ra[st.idx].toFixed(2)}°, 적위 ${num(S.dec[st.idx], 2)}° · g − r 색 ${S.gr[st.idx].toFixed(2)} · 선의 기준 파장(λ₀)은 실제 값, 스펙트럼 모양은 모형입니다.`
        : st.t.kind === 'q2' ? '학습지 Q2의 값으로 그린 스펙트럼입니다.' : '시선 속도 −300 km/s로 그린 Hα 흡수선입니다. 밀린 양이 아주 작아서 확대해 그렸습니다.';
    }
    // 내가 잰 은하를 찍는 작은 쐐기 지도
    const mapCanvas = $('s-map'), mv = wedgeView(w => ({top: 50, bottom: 26, side: 34}));
    function drawMini() {
      const {ctx, w, h} = fitCanvas(mapCanvas, W => W * 0.86);
      mv.layout(w, h);
      drawWedgeFrame(ctx, mv, {fs: 11, radial: 'z'});
      st.measured.forEach((m, idx) => {
        const X = mv.X(S.u[idx]), Y = mv.Y(S.v[idx]);
        ctx.fillStyle = BIN_COLORS[S.bin[idx]];
        ctx.beginPath(); ctx.arc(X, Y, 5, 0, 2 * Math.PI); ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.2; ctx.stroke();
        text(ctx, m.mark, X + 8, Y, {size: 12, weight: 800, color: '#fff'});
      });
      if (st.t.kind === 'sdss' && !st.measured.has(st.idx)) {
        const X = mv.X(S.u[st.idx]) , Y = mv.Y(S.v[st.idx]);
        void X; void Y;
      }
      $('s-count').textContent = `잰 은하 ${st.measured.size}개`;
      $('s-map-note').textContent = st.measured.size
        ? `은하 하나의 적색 편이를 재면 지도 위에 점 하나를 찍을 수 있습니다. 하늘의 방향(적경)이 각도, 적색 편이가 꼭짓점에서의 거리입니다.`
        : '아직 잰 은하가 없습니다. 위에서 선을 맞추면 이 지도에 점이 찍힙니다.';
    }
    function render() {
      setPressed(chips, 'data-target', st.t.id);
      renderLinePick();
      drawChart();
      renderSteps();
      drawMini();
    }
    load(TARGETS[0]);
    return {render};
  })();

  // ═══════════════ 03 3차원 지도 만들기 ═══════════════
  stations.map = (() => {
    const st = {count: 0, tool: 'look', marks: [], answer: false, red: false, pick: null, feedback: null};
    const wedge = $('m-wedge'), sky = $('m-sky');
    const v = wedgeView(w => ({top: small() ? 46 : 54, bottom: 30, side: small() ? 30 : 40}));
    const survey = () => SURVEYS[shared.survey];
    const TOOLS = [
      {id: 'look', name: '보기·고르기', help: '지도를 누르면 가까운 은하의 정보를 봅니다. 확대했을 때는 끌어서 옮길 수 있어요.'},
      {id: 'cluster', name: '은하단', help: '탐구 1: 붉은 점을 중심으로 작은 영역에 모여 있는 곳을 눌러 동그라미를 치세요.'},
      {id: 'filament', name: '필라멘트', help: '탐구 2: 은하들이 그물망처럼 이어진 곳을 따라 손가락으로 그으세요. (그리는 동안에는 지도 위에서 화면이 움직이지 않습니다.)'},
      {id: 'void', name: '보이드', help: '탐구 2: 은하가 거의 없는 넓은 곳의 가운데를 누른 채 바깥으로 끌어 크기를 정하세요.'},
      {id: 'wall', name: '은하 장성', help: '탐구 3: 필라멘트보다 훨씬 두껍고 거대하게 펼쳐진 벽을 따라 그으세요. (그리는 동안에는 지도 위에서 화면이 움직이지 않습니다.)'}
    ];
    const toolBox = $('m-tools');
    TOOLS.forEach(t => {
      const b = document.createElement('button');
      b.type = 'button'; b.dataset.tool = t.id; b.innerHTML = `<i></i>${t.name}`;
      b.addEventListener('click', () => { st.tool = t.id; render(); });
      toolBox.appendChild(b);
    });
    document.querySelectorAll('#m-survey [data-survey]').forEach(b => b.addEventListener('click', () => setSurvey(b.dataset.survey)));
    function setSurvey(key) {
      if (shared.survey === key) return;
      const frac0 = st.count / survey().n;
      shared.survey = key; st.pick = null;
      st.count = Math.round(frac0 * survey().n);
      render();
    }
    const countSlider = $('m-count');
    countSlider.addEventListener('input', () => { measure.stop(); st.count = +countSlider.value; setPlay(); draw(); });
    const measure = animator(dt => {
      const n = survey().n;
      // 처음에는 천천히, 갈수록 빠르게 (모두 재는 데 약 7초)
      const f = Math.sqrt(st.count / n) + dt / 7;
      st.count = Math.min(n, Math.round(f * f * n) + 1);
      draw();
      if (st.count >= n) { st.count = n; setPlay(); draw(); return false; }
      return true;
    });
    $('m-play').addEventListener('click', () => {
      const n = survey().n;
      if (measure.running) { measure.stop(); setPlay(); return; }
      if (st.count >= n) { st.count = 0; draw(); setPlay(); return; }
      if (reduced) { st.count = n; draw(); setPlay(); return; }
      measure.start(); setPlay();
    });
    function setPlay() {
      const n = survey().n;
      $('m-play').textContent = measure.running ? '❚❚ 멈춤' : st.count >= n ? '↺ 처음부터' : st.count > 0 ? '▶ 이어서 재기' : '▶ 적색 편이 재기';
    }
    $('m-zin').addEventListener('click', () => zoomBy(1.6));
    $('m-zout').addEventListener('click', () => zoomBy(1 / 1.6));
    $('m-zreset').addEventListener('click', () => { v.zoom = 1; v.clampCenter(); draw(); });
    function zoomBy(f) {
      if (st.pick !== null && v.zoom * f > 1 && v.zoom <= 1.001) { const s = survey(); v.cx = s.u[st.pick]; v.cy = s.v[st.pick]; }
      v.zoom = clamp(v.zoom * f, 1, 6.5); v.clampCenter(); draw();
    }
    $('m-undo').addEventListener('click', () => { st.marks.pop(); st.feedback = null; draw(); });
    $('m-clear').addEventListener('click', () => { st.marks = []; st.feedback = null; draw(); });
    $('m-red').addEventListener('change', e => { st.red = e.target.checked; draw(); });
    $('m-answer').addEventListener('click', () => { st.answer = !st.answer; render(); });
    $('m-wall-check').addEventListener('click', () => {
      shared.unlocked = !shared.unlocked;
      if (!shared.unlocked) shared.radial = 'z';
      render();
    });
    document.querySelectorAll('#m-radial [data-radial]').forEach(b => b.addEventListener('click', () => { shared.radial = b.dataset.radial; render(); }));

    // 표시 그리기 (평면 좌표 = 적색 편이 단위로 저장해서 확대해도 그대로)
    let drawing = null;
    pointer(wedge, {
      down(p) {
        const q = v.plane(p.x, p.y);
        if (st.tool === 'look') { drawing = {type: 'pan', p0: p, c0: [v.cx, v.cy]}; return true; }
        if (st.tool === 'cluster') { drawing = {type: 'cluster', u: q.u, y: q.y, r: M.LESSON_MARKS.clusterRadius}; return true; }
        if (st.tool === 'void') { drawing = {type: 'void', u: q.u, y: q.y, r: 0.006, fresh: true}; draw(); return true; }
        drawing = {type: st.tool, pts: [[q.u, q.y]]}; return true;
      },
      move(p, a) {
        if (!drawing) return;
        const q = v.plane(p.x, p.y);
        if (drawing.type === 'pan') {
          if (v.zoom > 1.001 && a.moved) { v.cx = drawing.c0[0] - (p.x - drawing.p0.x) / v.scale(); v.cy = drawing.c0[1] + (p.y - drawing.p0.y) / v.scale(); v.clampCenter(); draw(); }
          return;
        }
        if (drawing.type === 'void') { if (a.moved) drawing.r = clamp(Math.hypot(q.u - drawing.u, q.y - drawing.y), 0.003, 0.03); draw(); return; }
        if (drawing.type === 'cluster') { drawing.u = q.u; drawing.y = q.y; return; }
        const last = drawing.pts[drawing.pts.length - 1];
        if (Math.hypot(q.u - last[0], q.y - last[1]) * v.scale() > 5) { drawing.pts.push([q.u, q.y]); draw(); }
      },
      up(p, a) {
        const d = drawing; drawing = null;
        if (!d || !p) { draw(); return; }
        if (d.type === 'pan') { if (!a.moved) pickAt(p, 'wedge'); return; }
        if (d.type === 'filament' || d.type === 'wall') { if (d.pts.length < 2) { draw(); return; } }
        st.marks.push(d);
        st.feedback = feedbackFor(d);
        draw();
      }
    });
    pointer(sky, {down() { return true; }, up(p, a) { if (p && !a.moved) pickAt(p, 'sky'); }});
    function pickAt(p, where) {
      const s = survey();
      let best = -1, bd = small() ? 14 : 11;
      for (let i = 0; i < s.n; i++) {
        if (where === 'wedge' && (s.rank[i] >= st.count || (st.red && !s.red[i]))) continue;
        const X = where === 'wedge' ? v.X(s.u[i]) : skyX(s.ra[i]), Y = where === 'wedge' ? v.Y(s.v[i]) : skyY(s.dec[i]);
        const dd = Math.hypot(X - p.x, Y - p.y);
        if (dd < bd) { bd = dd; best = i; }
      }
      st.pick = best >= 0 ? best : null;
      draw();
    }
    // 같은 거리(적색 편이 ±0.025)의 평균 밀도: 은하 수 ÷ 쐐기 평면의 넓이(적색 편이 단위)
    function surfaceAt(z0) {
      const s = survey(), hw = 0.025, z0c = clamp(z0, 0.03, 0.125);
      let n = 0;
      for (let i = 0; i < s.n; i++) if (Math.abs(s.z[i] - z0c) < hw) n++;
      const area = 0.5 * (s.raMax - s.raMin) * DEG * ((z0c + hw) ** 2 - (z0c - hw) ** 2);
      return n / area;
    }
    function feedbackFor(m) {
      const s = survey();
      if (m.type === 'cluster' || m.type === 'void') {
        // 지금까지 적색 편이를 잰 은하만 센다(평균도 같은 비율로 줄여서 비교).
        const part = st.count / s.n, pol = M.wedgePolar(m.u, m.y, 180), stt = M.circleStats(s, pol.ra, pol.r, m.r, i => s.rank[i] < st.count);
        const exp = surfaceAt(pol.r) * Math.PI * m.r * m.r * part, ratio = exp > 0 ? stt.n / exp : 0;
        if (st.count < 50) return '아직 적색 편이를 잰 은하가 너무 적어요. ▶를 눌러 은하를 더 찍은 뒤 표시해 보세요.';
        if (m.type === 'cluster') return `표시한 은하단: 원 안에 은하 <b>${stt.n}개</b>${s.gr ? `(그중 붉은 은하 ${stt.red}개)` : ''}. 같은 거리의 평균이라면 약 ${Math.round(exp)}개이므로 <b>평균의 ${ratio.toFixed(1)}배</b>로 빽빽합니다.${ratio < 1.5 ? ' 생각보다 성겨요. 붉은 점이 더 몰린 곳을 찾아보세요.' : ' 확대해 보면 꼭짓점 쪽으로 길쭉한 ‘손가락’ 모양이 보일 수 있어요.'}`;
        return `표시한 보이드: 원 안에 은하 <b>${stt.n}개</b>, 같은 거리의 평균이라면 약 ${Math.round(exp)}개 → <b>평균의 ${ratio.toFixed(2)}배</b>. ${ratio < 0.5 ? '은하가 거의 없는 빈 공간이 맞아요.' : '은하가 꽤 있어요. 더 텅 빈 곳을 찾아보세요.'}`;
      }
      if (m.type === 'wall') {
        const zs = m.pts.map(([u, y]) => Math.hypot(u, y)), zm = zs.reduce((a, b) => a + b, 0) / zs.length;
        const ras = m.pts.map(([u, y]) => M.wedgePolar(u, y, 180).ra), span = Math.max(...ras) - Math.min(...ras);
        return `은하 장성 표시: 적경 ${span.toFixed(0)}°에 걸쳐 그었고, 띠의 적색 편이는 평균 <b>약 ${zm.toFixed(3)}</b>입니다. 필라멘트보다 훨씬 두껍고 길게 펼쳐진 벽이에요.`;
      }
      return '필라멘트 표시: 은하들이 그물망처럼 이어진 실 모양 구조입니다. 다른 필라멘트도 찾아 이어 보세요.';
    }

    // 하늘(2차원) 띠
    let skyBox = {l: 40, r: 600, t: 10, b: 100};
    const skyX = ra => skyBox.l + (220 - ra) / 80 * (skyBox.r - skyBox.l);
    const skyY = dec => skyBox.t + (1.25 - dec) / 2.5 * (skyBox.b - skyBox.t);
    function drawSky() {
      const s = survey();
      const {ctx, w, h} = fitCanvas(sky, W => clamp((W - 70) * 2.5 / 80 * 4, 96, 190) + 42);
      skyBox = {l: small() ? 34 : 44, r: w - 24, t: 10, b: h - 30};
      const ex = ((skyBox.b - skyBox.t) / 2.5) / ((skyBox.r - skyBox.l) / 80);
      $('m-sky-note').textContent = `위아래(적위)를 ${ex.toFixed(1)}배 늘여 그림`;
      ctx.fillStyle = 'rgba(8,18,30,0.55)'; ctx.fillRect(skyBox.l, skyBox.t, skyBox.r - skyBox.l, skyBox.b - skyBox.t);
      if (s.raMin > 140) { ctx.fillStyle = 'rgba(140,150,160,0.18)'; ctx.fillRect(skyX(s.raMin), skyBox.t, skyBox.r - skyX(s.raMin), skyBox.b - skyBox.t); text(ctx, '관측 안 함', (skyX(s.raMin) + skyBox.r) / 2, (skyBox.t + skyBox.b) / 2, {size: 11, align: 'center', color: '#a9bccb'}); }
      const r = w < 700 ? 1 : 1.3;
      ctx.globalAlpha = 0.55; ctx.fillStyle = '#8ea3b5';
      for (let i = 0; i < s.n; i++) if (s.rank[i] >= st.count) ctx.fillRect(skyX(s.ra[i]) - r / 2, skyY(s.dec[i]) - r / 2, r, r);
      ctx.globalAlpha = 0.95;
      if (s.gr) for (let b = 0; b < NBIN; b++) { ctx.fillStyle = BIN_COLORS[b]; for (const i of s.byBin[b]) if (s.rank[i] < st.count) ctx.fillRect(skyX(s.ra[i]) - r / 2, skyY(s.dec[i]) - r / 2, r, r); }
      else { ctx.fillStyle = MONO; for (let i = 0; i < s.n; i++) if (s.rank[i] < st.count) ctx.fillRect(skyX(s.ra[i]) - r / 2, skyY(s.dec[i]) - r / 2, r, r); }
      ctx.globalAlpha = 1;
      for (let ra = 140; ra <= 220; ra += 10) text(ctx, ra + '°', skyX(ra), skyBox.b + 12, {size: 11, align: 'center', color: '#a9bccb', halo: false});
      text(ctx, '← 적경', skyBox.l, skyBox.b + 25, {size: 11, color: '#c7d6e2', halo: false});
      text(ctx, '+1°', skyBox.l - 4, skyY(1), {size: 10, align: 'right', color: '#a9bccb', halo: false});
      text(ctx, '0°', skyBox.l - 4, skyY(0), {size: 10, align: 'right', color: '#a9bccb', halo: false});
      text(ctx, '−1°', skyBox.l - 4, skyY(-1), {size: 10, align: 'right', color: '#a9bccb', halo: false});
      if (st.pick !== null) ring(ctx, skyX(s.ra[st.pick]), skyY(s.dec[st.pick]), '#ffffff');
      sky.setAttribute('aria-label', `하늘에서 본 은하 ${fmtCount(s.n)}개의 위치. 그중 ${fmtCount(st.count)}개의 적색 편이를 쟀습니다.`);
    }
    function ring(ctx, x, y, color) {
      ctx.strokeStyle = color; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, 7, 0, 2 * Math.PI); ctx.stroke();
    }
    function drawMarks(ctx) {
      const sc = v.scale();
      const all = drawing && drawing.type !== 'pan' ? st.marks.concat([drawing]) : st.marks;
      all.forEach(m => {
        ctx.save();
        if (m.type === 'cluster' || m.type === 'void') {
          const X = v.X(m.u), Y = v.Y(m.y);
          if (m.type === 'void') { ctx.fillStyle = 'rgba(61,111,224,0.22)'; ctx.beginPath(); ctx.arc(X, Y, m.r * sc, 0, 2 * Math.PI); ctx.fill(); ctx.setLineDash([6, 4]); }
          ctx.strokeStyle = m.type === 'void' ? '#9db8ff' : '#ffffff'; ctx.lineWidth = 2.4;
          ctx.beginPath(); ctx.arc(X, Y, m.r * sc, 0, 2 * Math.PI); ctx.stroke();
          if (m.type === 'cluster') {   // 시선 방향
            ctx.setLineDash([3, 5]); ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 1;
            const len = Math.hypot(m.u, m.y), ux = m.u / len, uy = m.y / len, rr = m.r * 2.2;
            ctx.beginPath(); ctx.moveTo(v.X(m.u - ux * rr), v.Y(m.y - uy * rr)); ctx.lineTo(v.X(m.u + ux * rr), v.Y(m.y + uy * rr)); ctx.stroke();
          }
        } else {
          ctx.lineCap = 'round'; ctx.lineJoin = 'round';
          ctx.beginPath();
          m.pts.forEach(([u, y], k) => (k ? ctx.lineTo(v.X(u), v.Y(y)) : ctx.moveTo(v.X(u), v.Y(y))));
          if (m.type === 'wall') { ctx.strokeStyle = 'rgba(242,163,58,0.35)'; ctx.lineWidth = Math.max(10, 0.0105 * sc); ctx.stroke(); ctx.strokeStyle = '#f2a33a'; ctx.lineWidth = 2; ctx.stroke(); }
          else { ctx.strokeStyle = '#7fe3ff'; ctx.lineWidth = 3; ctx.setLineDash([8, 5]); ctx.stroke(); }
        }
        ctx.restore();
      });
    }
    function draw() {
      const s = survey(), n = s.n;
      countSlider.max = n; countSlider.value = st.count;
      $('m-count-out').textContent = `${fmtCount(st.count)}개 / ${fmtCount(n)}개`;
      drawSky();
      const {ctx, w, h} = fitCanvas(wedge, W => (small() ? W * 0.92 : W * 0.8));
      v.layout(w, h);
      const fs = small() ? 11 : 12;
      ctx.save();
      ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip();
      drawWedgeFrame(ctx, v, {fs, radial: shared.unlocked ? shared.radial : 'z'});
      if (s.raMin > 140) {
        sectorPath(ctx, v, 0, Z_MAX, 140, s.raMin); ctx.fillStyle = 'rgba(140,150,160,0.16)'; ctx.fill();
        const p = M.wedgeXY(144, 0.1, 180); text(ctx, '관측 안 한 하늘', v.X(p.x), v.Y(p.y), {size: fs, color: '#a9bccb', align: 'center'});
      }
      const dotSize = (w < 500 ? 1.1 : 1.5) * Math.min(2.2, Math.sqrt(v.zoom));
      drawPoints(ctx, v, s, {count: st.count, redOnly: st.red && !!s.gr, size: dotSize, alpha: 0.92});
      if (st.answer) drawLessonMarks(ctx, v, fs);
      drawMarks(ctx);
      if (st.pick !== null && s.rank[st.pick] < st.count) ring(ctx, v.X(s.u[st.pick]), v.Y(s.v[st.pick]), '#ffffff');
      if (st.count === 0) {
        text(ctx, '▶ 적색 편이 재기를 누르면', w / 2, v.Y(0.085) - 12, {size: fs + 3, weight: 800, align: 'center', color: '#ffe2a8'});
        text(ctx, '은하가 하나씩 지도에 찍힙니다', w / 2, v.Y(0.085) + 12, {size: fs + 3, weight: 800, align: 'center', color: '#ffe2a8'});
      }
      if (v.zoom > 1.001) text(ctx, `확대 ×${v.zoom.toFixed(1)} · 끌어서 옮기기`, 10, 14, {size: fs, color: '#c7d6e2'});
      ctx.restore();
      wedge.className = st.tool !== 'look' ? 'drawing' : v.zoom > 1.001 ? 'panning' : '';
      wedge.setAttribute('aria-label', `${s.fullName}의 쐐기 지도. 꼭짓점이 우리은하, 적경이 각도, 적색 편이가 반지름. ${fmtCount(st.count)}개 표시.`);
      renderPick(); renderInsight();
    }
    function renderPick() {
      const s = survey();
      if (st.pick === null) { $('m-pick').textContent = '지도나 하늘을 눌러 은하를 골라 보세요'; return; }
      const i = st.pick, measured = s.rank[i] < st.count;
      let t = `적경 ${s.ra[i].toFixed(2)}°, 적위 ${num(s.dec[i], 2)}°`;
      if (!measured) t += ' · 아직 적색 편이를 재지 않았습니다 → 거리를 모릅니다';
      else {
        t += ` · 적색 편이 ${s.z[i].toFixed(s.id === 'sdss' ? 4 : 4)}`;
        if (s.gr) t += ` · ${s.red[i] ? '붉은 은하' : '푸른 은하'}`;
        if (shared.unlocked) t += ` · 후퇴 속도 ${fmtV(M.velocityFromZ(s.z[i]))} km/s · 거리 ${fmtD(M.distanceFromZ(s.z[i]))} Mpc`;
      }
      $('m-pick').textContent = t;
    }
    function renderInsight() {
      const s = survey(), n = s.n, f = st.count / n;
      let msg;
      if (st.feedback) msg = st.feedback;
      else if (st.count === 0) msg = '하늘 사진(2차원)만 보면 은하들이 거의 고르게 흩어져 있는 것 같습니다. 하지만 어느 은하가 가깝고 먼지는 알 수 없어요. ▶를 눌러 은하마다 <b>적색 편이</b>를 재 보세요.';
      else if (f < 0.25) msg = `${fmtCount(st.count)}개를 쟀습니다. 점이 아직 듬성듬성해서 구조가 잘 보이지 않아요. 은하 적색 편이 탐사에 수많은 은하의 분광 관측이 필요한 까닭입니다.`;
      else if (f < 1) msg = `${fmtCount(st.count)}개. 점이 늘수록 <b>실처럼 이어진 곳</b>과 <b>텅 빈 곳</b>이 드러납니다. 하늘의 방향(적경)에 거리(적색 편이)를 더하니 3차원 분포가 보이기 시작했어요.`;
      else if (shared.survey === 'twodf') msg = `같은 하늘을 다른 탐사(2dFGRS, 영국·호주)가 따로 잰 은하 ${fmtCount(n)}개입니다. SDSS와 같은 자리에 같은 은하 장성과 보이드가 보이나요? <b>은하단, 필라멘트, 보이드, 은하 장성이 이어져 우주거대구조를 이룹니다</b> (탐구 4).`;
      else msg = `${fmtCount(n)}개를 모두 찍었습니다. 은하들은 고르게 흩어져 있지 않습니다. <b>무리(은하단)</b>를 짓고, <b>실(필라멘트)</b>과 <b>벽(은하 장성)</b>으로 이어지며, 그 사이에 <b>빈 곳(보이드)</b>이 있습니다. 오른쪽 도구로 직접 찾아 표시해 보세요.`;
      $('m-insight').innerHTML = msg;
    }
    function renderPanel() {
      setPressed($('m-survey'), 'data-survey', shared.survey);
      setPressed(toolBox, 'data-tool', st.tool);
      $('m-tool-help').textContent = TOOLS.find(t => t.id === st.tool).help;
      $('m-answer').setAttribute('aria-pressed', String(st.answer));
      $('m-answer-note').hidden = !st.answer;
      const redBox = $('m-red');
      redBox.disabled = !survey().gr;
      redBox.parentElement.style.opacity = survey().gr ? 1 : 0.5;
      $('m-sub').textContent = shared.survey === 'sdss'
        ? `SDSS(슬론 디지털 전천 탐사)가 실제로 잰 은하 ${fmtCount(survey().n)}개입니다. 적경 140°~220°, 적위 −1.25°~+1.25°의 얇은 띠에 든 은하들이에요.`
        : `2dFGRS(2dF 은하 적색 편이 탐사)가 같은 하늘의 띠에서 잰 은하 ${fmtCount(survey().n)}개입니다. 2dFGRS는 적경 148°부터 관측했어요.`;
      $('m-hint').textContent = shared.survey === 'sdss'
        ? '점 하나가 은하 하나입니다. 점의 색이 푸른색에서 붉은색으로 갈수록 늙은 별의 비율이 높은 은하이고, 붉은 점은 대체로 질량이 큰 타원 은하입니다. 크기 10 Mpc인 은하단의 폭은 적색 편이로 약 0.002입니다.'
        : '점 하나가 은하 하나입니다(2dFGRS 자료에는 색 정보가 없어 한 가지 색으로 그렸습니다). 크기 10 Mpc인 은하단의 폭은 적색 편이로 약 0.002입니다.';
      const ans = $('m-wall-answer');
      ans.hidden = !shared.unlocked;
      $('m-wall-check').textContent = shared.unlocked ? '풀이 숨기기' : '확인';
      if (shared.unlocked) {
        ans.className = 'sol';
        const v07 = Math.round(M.velocityFromZ(0.07));
        ans.innerHTML = `<span class="eq">v = c × z = 3 × 10⁵ km/s × 0.07 = <b>${v07} km/s</b></span>
          <span class="eq">d = ${frac('v', 'H')} = ${frac(`${v07} km/s`, '70 km/s/Mpc')} ≈ <b>${Math.round(M.distanceFromZ(0.07))} Mpc</b> (약 10억 광년)</span>
          <span class="micro">슬론 장성의 길이는 약 400 Mpc(14억 광년)로, 거리만큼이나 깁니다(교과서 117쪽). 이제 지도의 눈금을 후퇴 속도나 거리로 바꿔 볼 수 있어요.</span>`;
      }
      $('m-radial-box').hidden = !shared.unlocked;
      setPressed($('m-radial'), 'data-radial', shared.radial);
    }
    function render() { renderPanel(); setPlay(); draw(); }
    return {render, pause() { measure.stop(); setPlay(); }};
  })();

  // ═══════════════ 04 밀도와 부피 ═══════════════
  stations.density = (() => {
    const SIZES = [10, 20, 40, 70, 100];
    const st = {size: 10, dots: true, pick: null};
    const canvas = $('d-map'), v = wedgeView(w => ({top: small() ? 46 : 54, bottom: 30, side: small() ? 30 : 40}));
    const cache = {};
    const gridOf = (key, size) => (cache[key + size] = cache[key + size] || M.densityCells(SURVEYS[key], size));
    const CAT = [
      {name: '성긴 곳', sub: '평균의 ½ 미만', color: '#1f4f80', test: r => r < 0.5},
      {name: '평균과 비슷', sub: '½~2배', color: '#6fa3d6', test: r => r >= 0.5 && r < 2},
      {name: '빽빽한 곳', sub: '2배 이상', color: '#e6a93c', test: r => r >= 2}
    ];
    const sizeBox = $('d-size');
    SIZES.forEach(s => {
      const b = document.createElement('button');
      b.type = 'button'; b.dataset.size = String(s); b.textContent = `${s} Mpc`;
      b.addEventListener('click', () => { st.size = s; st.pick = null; render(); });
      sizeBox.appendChild(b);
    });
    document.querySelectorAll('#d-survey [data-survey]').forEach(b => b.addEventListener('click', () => { shared.survey = b.dataset.survey; st.pick = null; render(); }));
    $('d-dots').addEventListener('change', e => { st.dots = e.target.checked; drawMap(); });
    pointer(canvas, {down() { return true; }, up(p, a) {
      if (!p || a.moved) return;
      const q = v.plane(p.x, p.y), g = gridOf(shared.survey, st.size);
      const x = q.u * KM, y = q.y * KM;
      st.pick = g.cells.find(c => x >= c.x0 && x < c.x0 + c.size && y >= c.y0 && y < c.y0 + c.size) || null;
      drawMap();
    }});
    const STOPS = [[0, '#0f2235'], [0.25, '#16314f'], [0.5, '#1f4f80'], [1, '#4a86c5'], [2, '#e6a93c'], [4, '#ffd27a'], [8, '#fff3cf']];
    function rhoColor(r) {
      if (r <= 0) return STOPS[0][1];
      for (let k = 1; k < STOPS.length; k++) {
        if (r <= STOPS[k][0]) {
          const [a, ca] = STOPS[k - 1], [b, cb] = STOPS[k];
          const t = a === 0 ? r / b : Math.log(r / a) / Math.log(b / a);
          return mix(ca, cb, t);
        }
      }
      return STOPS[STOPS.length - 1][1];
    }
    $('d-legend').innerHTML = CAT.map(c => `<span><i style="background:${c.color}"></i>${c.name} (${c.sub})</span>`).join('') +
      `<span>0<span class="bar" style="background:linear-gradient(90deg,${STOPS.map(([r, c], k) => `${c} ${(k / (STOPS.length - 1) * 100).toFixed(0)}%`).join(',')})"></span>평균의 8배+</span>`;
    function drawMap() {
      const s = SURVEYS[shared.survey], g = gridOf(shared.survey, st.size);
      const {ctx, w, h} = fitCanvas(canvas, W => (small() ? W * 0.92 : W * 0.8));
      v.layout(w, h);
      const fs = small() ? 11 : 12, sc = v.scale();
      drawWedgeFrame(ctx, v, {fs, radial: shared.unlocked ? shared.radial : 'z'});
      ctx.save();
      sectorPath(ctx, v, g.zMin, g.zMax, s.raMin, s.raMax); ctx.clip();
      g.cells.forEach(c => {
        const X0 = v.X(c.x0 / KM), Y0 = v.Y((c.y0 + c.size) / KM), side = c.size / KM * sc;
        ctx.fillStyle = rhoColor(c.rho); ctx.fillRect(X0, Y0, side + 0.6, side + 0.6);
      });
      if (st.size >= 20) {
        ctx.strokeStyle = 'rgba(15,34,53,0.55)'; ctx.lineWidth = 1;
        g.cells.forEach(c => ctx.strokeRect(v.X(c.x0 / KM), v.Y((c.y0 + c.size) / KM), c.size / KM * sc, c.size / KM * sc));
      }
      ctx.restore();
      if (st.dots) drawPoints(ctx, v, s, {size: w < 500 ? 1 : 1.2, alpha: 0.45, mono: true, monoColor: '#e9f2f9'});
      ctx.save(); ctx.setLineDash([5, 4]); ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1.3;
      sectorPath(ctx, v, g.zMin, g.zMax, s.raMin, s.raMax); ctx.stroke(); ctx.restore();
      text(ctx, '점선 안 = 분석한 곳 (적색 편이 0.1까지)', v.X(0), v.Y(g.zMax) - 10, {size: fs, color: '#ffffff', align: 'center', weight: 700});
      if (st.pick) {
        const c = st.pick;
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.5;
        ctx.strokeRect(v.X(c.x0 / KM), v.Y((c.y0 + c.size) / KM), c.size / KM * sc, c.size / KM * sc);
        const cat = CAT.find(q => q.test(c.rho));
        $('d-pick').innerHTML = `${c.size} Mpc × ${c.size} Mpc 칸: 은하 <b>${c.n}개</b> · 평균이라면 약 ${c.expected < 10 ? c.expected.toFixed(1) : Math.round(c.expected)}개 → <b>평균의 ${c.rho < 10 ? c.rho.toFixed(2) : c.rho.toFixed(1)}배</b> (${cat.name}${c.n === 0 ? ' · 은하가 하나도 없는 보이드' : c.rho >= 2 ? ' · 은하단·은하 장성 같은 곳' : ''})`;
      } else $('d-pick').textContent = '지도의 칸을 눌러 은하 수를 확인해 보세요 (평균 = 점선 안 전체의 평균 밀도, 곧 우주 평균)';
      canvas.setAttribute('aria-label', `${s.fullName}을 ${st.size} Mpc 칸으로 나누어 밀도를 색으로 나타낸 지도`);
    }
    function sharesFor(key, size) {
      const g = gridOf(key, size);
      return CAT.map(c => M.shareWhere(g, c.test));
    }
    function drawShare() {
      const svg = $('d-share'); clear(svg);
      const tall = small(), sh = sharesFor(shared.survey, st.size);
      const W = svgW(svg), H = tall ? 330 : 250, l = tall ? 20 : 138, r = W - 20, bh = tall ? 46 : 40;
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      const rows = [['부피 (칸이 차지하는 넓이)', 'vol', tall ? 92 : 70], ['은하 수', 'gal', tall ? 222 : 160]];
      // 범례
      let lx = l;
      CAT.forEach(c => {
        el('rect', {x: lx, y: tall ? 14 : 16, width: 14, height: 14, rx: 3, fill: c.color}, svg);
        const t = el('text', {x: lx + 20, y: tall ? 27 : 28, class: 'tick'}, svg, `${c.name}`);
        lx += (tall ? 200 : 150);
        void t;
      });
      rows.forEach(([name, key, y]) => {
        el('text', {x: tall ? l : l - 10, y: tall ? y - 12 : y + bh / 2 + 5, 'text-anchor': tall ? 'start' : 'end', class: 'annot'}, svg, name);
        let x = l;
        sh.forEach((s, k) => {
          const wd = (r - l) * s[key];
          el('rect', {x, y, width: Math.max(0, wd), height: bh, fill: CAT[k].color}, svg);
          if (wd > (tall ? 70 : 40)) el('text', {x: x + wd / 2, y: y + bh / 2 + 5, 'text-anchor': 'middle', class: 'annot', fill: k === 0 ? '#ffffff' : '#14283a'}, svg, `${Math.round(s[key] * 100)}%`);
          else if (s[key] > 0.004) el('text', {x: x + wd / 2, y: y + bh + (tall ? 22 : 16), 'text-anchor': 'middle', class: 'tick'}, svg, `${Math.round(s[key] * 100)}%`);
          x += wd;
        });
        el('rect', {x: l, y, width: r - l, height: bh, fill: 'none', stroke: '#14283a', 'stroke-width': 1}, svg);
      });
      const sparse = sh[0], dense = sh[2];
      $('d-share-insight').innerHTML = `${st.size} Mpc 칸으로 세면, 평균의 ½도 안 되는 <b>성긴 곳이 부피의 ${Math.round(sparse.vol * 100)}%</b>를 차지하지만 그 안의 은하는 ${Math.round(sparse.gal * 100)}%뿐입니다. 평균의 2배 넘게 <b>빽빽한 곳은 부피의 ${Math.round(dense.vol * 100)}%</b>인데 은하의 ${Math.round(dense.gal * 100)}%가 모여 있어요. → 우주 공간의 부피는 대부분 보이드처럼 성긴 곳이고, 은하는 좁은 곳(은하단·필라멘트·은하 장성)에 몰려 있습니다. 보통 물질의 평균 밀도는 <b>은하 > 은하단 > 우주 평균 > 보이드</b> 순입니다(은하 하나의 안쪽은 이 지도의 어느 칸보다도 훨씬 빽빽합니다).`;
    }
    function drawScale() {
      const svg = $('d-scale'); clear(svg);
      const tall = small();
      const W = svgW(svg), l = tall ? 150 : 118, r = W - 20, rowH = tall ? 58 : 40, top = tall ? 20 : 16;
      const H = top + SIZES.length * rowH + (tall ? 104 : 46);
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      const xs = lin(0, 1, l, r);
      const ax = el('g', {class: 'axis'}, svg);
      [0, 0.25, 0.5, 0.75, 1].forEach(t => {
        el('line', {x1: xs(t), x2: xs(t), y1: top - 4, y2: top + SIZES.length * rowH, class: 'grid-line'}, ax);
        el('text', {x: xs(t), y: top + SIZES.length * rowH + (tall ? 26 : 18), 'text-anchor': 'middle', class: 'tick'}, ax, `${t * 100}%`);
      });
      el('text', {x: (l + r) / 2, y: top + SIZES.length * rowH + (tall ? 56 : 38), 'text-anchor': 'middle', class: 'axis-label'}, svg, '칸들이 차지하는 부피의 비율');
      if (tall) el('text', {x: 20, y: top + SIZES.length * rowH + 92, class: 'tick', fill: '#0b7f9a'}, svg, '★ 교과서: 약 70 Mpc보다 크면 통계적으로 비슷');
      SIZES.forEach((size, k) => {
        const y = top + k * rowH + 4, bh = rowH - (tall ? 16 : 12), sh = sharesFor(shared.survey, size), on = size === st.size;
        el('text', {x: l - 10, y: y + bh / 2 + 5, 'text-anchor': 'end', class: 'annot', fill: on ? '#c2581c' : '#14283a'}, svg, `${size} Mpc 칸`);
        let x = l;
        sh.forEach((s, j) => {
          const wd = (r - l) * s.vol;
          el('rect', {x, y, width: Math.max(0, wd), height: bh, fill: CAT[j].color, opacity: on ? 1 : 0.72}, svg);
          if (wd > (tall ? 64 : 34)) el('text', {x: x + wd / 2, y: y + bh / 2 + 5, 'text-anchor': 'middle', class: 'tick', fill: j === 0 ? '#ffffff' : '#14283a', 'font-weight': on ? 800 : 600}, svg, `${Math.round(s.vol * 100)}%`);
          x += wd;
        });
        if (on) el('rect', {x: l - 2, y: y - 2, width: r - l + 4, height: bh + 4, fill: 'none', stroke: '#c2581c', 'stroke-width': 2.5, rx: 3}, svg);
        if (size === 70) {
          if (tall) el('text', {x: r + 2, y: y + bh / 2 + 7, 'text-anchor': 'end', class: 'annot', fill: '#0b7f9a'}, svg, '★');
          else el('text', {x: l - 10, y: y + bh / 2 + 19, 'text-anchor': 'end', class: 'tick', fill: '#0b7f9a'}, svg, '교과서 약 70 Mpc');
        }
      });
      const sp = sharesFor(shared.survey, st.size), near = Math.round(sp[1].vol * 100);
      const s70 = sharesFor(shared.survey, 70)[1].vol, s10 = sharesFor(shared.survey, 10)[1].vol;
      $('d-scale-insight').innerHTML = st.size < 70
        ? `칸이 작으면 텅 빈 칸과 아주 빽빽한 칸이 섞여 들쭉날쭉합니다(평균과 비슷한 칸은 부피의 ${near}%). 칸을 키워 보세요. 10 Mpc 칸에서 ${Math.round(s10 * 100)}%이던 ‘평균과 비슷한 칸’이 70 Mpc 칸에서는 ${Math.round(s70 * 100)}%가 됩니다.`
        : `칸을 ${st.size} Mpc로 키우니 칸의 ${near}%가 평균과 비슷해졌습니다. 과학자들은 은하 분포를 통계적으로 조사해 <b>약 70 Mpc보다 큰 규모에서는 물질 분포가 통계적으로 비슷하다(균일하다)</b>는 결과를 얻었습니다(교과서 117쪽). 그래도 가장 빽빽한 칸(평균의 ${num(Math.max(...gridOf(shared.survey, st.size).cells.map(c => c.rho)), 1)}배)은 은하 장성이 지나는 곳이에요. 탐사 영역이 넓어질수록 슬론 장성(약 400 Mpc)처럼 큰 구조가 발견되고 있어, 차세대 적색 편이 탐사가 더 밝힐 문제입니다.`;
    }
    function render() {
      setPressed(sizeBox, 'data-size', String(st.size));
      setPressed($('d-survey'), 'data-survey', shared.survey);
      drawMap(); drawShare(); drawScale();
    }
    return {render};
  })();

  // 시작: #s1~#s4 또는 이름
  show(nameFromHash((location.hash || '').slice(1)) || 'groups');
  let resizeTimer, lastW = window.innerWidth;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    // 폭이 바뀔 때만 다시 그린다(휴대폰 주소창이 나타나고 사라지며 높이만 바뀌는 경우는 무시)
    resizeTimer = setTimeout(() => { if (window.innerWidth !== lastW) { lastW = window.innerWidth; stations[current].render(); } }, 150);
  });
  window.addEventListener('hashchange', () => { const n = nameFromHash(location.hash.slice(1)); if (n && n !== current) show(n); });
})();
