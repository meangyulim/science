/* 우주거대구조 모의실험 — 세 실험이 같은 모형(cosmic-web-model.js)을 쓴다. */
(() => {
  'use strict';
  const M = window.CosmicWebModel, $ = id => document.getElementById(id);
  const NS = 'http://www.w3.org/2000/svg';
  const reduceMotion = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const SEED = 7;                       // 모든 실험이 같은 난수 씨앗(같은 초기 무늬)
  const SPACE = '#0b1626';

  // ── 작은 도구들 (변광성 실험실과 같은 모양) ─────────────────────
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
  function num(v, d = 1) {
    const s = Math.abs(v).toFixed(d);
    return (v < 0 && +s !== 0 ? '−' : '') + s;
  }
  const small = () => window.innerWidth < 640;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const pathOf = pts => pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('');
  function svgPoint(svg, evt) {
    const pt = svg.createSVGPoint();
    pt.x = evt.clientX; pt.y = evt.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  }
  // 그래프 위를 누르고 끄는 동작. 세로 스크롤은 브라우저에 맡긴다(touch-action: pan-y).
  function onDrag(node, handler) {
    let active = false;
    node.addEventListener('pointerdown', e => {
      active = true;
      try { node.setPointerCapture(e.pointerId); } catch (_) {}
      handler(e, 'start');
    });
    node.addEventListener('pointermove', e => { if (active) handler(e, 'move'); });
    const end = () => { active = false; };
    node.addEventListener('pointerup', end);
    node.addEventListener('pointercancel', end);
  }
  function setPressed(container, attr, value) {
    container.querySelectorAll(`[${attr}]`).forEach(b => b.setAttribute('aria-pressed', String(b.getAttribute(attr) === String(value))));
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
    if (o.xLabel) el('text', {x: (box.l + box.r) / 2, y: box.b + (small() ? 56 : 40), 'text-anchor': 'middle', class: 'axis-label'}, g, o.xLabel);
    const lx = small() ? 24 : 16;              // 휴대폰에서는 글자가 커서 왼쪽 끝이 잘리지 않게
    if (o.yLabel) el('text', {x: lx, y: (box.t + box.b) / 2, transform: `rotate(-90 ${lx} ${(box.t + box.b) / 2})`, 'text-anchor': 'middle', class: 'axis-label'}, g, o.yLabel);
    return g;
  }
  // 우주 나이(억 년) 표기
  function fmtAge(t) {
    if (t < 1) return `${Math.round(t * 200) * 50}만 년`;
    if (t < 10) return `${num(t, 1)}억 년`;
    return `${Math.round(t)}억 년`;
  }
  const fmtPct = v => v < 0.0005 ? '0 %' : v < 0.1 ? `${num(v * 100, 1)} %` : `${Math.round(v * 100)} %`;
  const fmtTimes = v => v >= 10 ? `${Math.round(v)}배` : v >= 0.1 ? `${num(v, 1)}배` : `${num(v, 2)}배`;

  // ── 색 지도: 빈 곳(남색) → 보라 → 자홍 → 주황 → 밝은 노랑 (교과서 그림 27·28의 느낌) ─────
  const STOPS = [[0, [11, 22, 38]], [0.22, [36, 30, 88]], [0.42, [96, 40, 136]], [0.6, [184, 58, 128]], [0.76, [238, 116, 64]], [0.9, [255, 210, 120]], [1, [255, 255, 245]]];
  const LUT = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    const v = i / 255;
    let k = 1;
    while (k < STOPS.length - 1 && v > STOPS[k][0]) k++;
    const [a, ca] = STOPS[k - 1], [b, cb] = STOPS[k], t = (v - a) / (b - a);
    const c = ca.map((x, j) => Math.round(x + (cb[j] - x) * t));
    LUT[i] = (255 << 24 | c[2] << 16 | c[1] << 8 | c[0]) >>> 0;   // RGBA 바이트 순서(리틀 엔디언)
  }
  const BG = LUT[0], LOG_LO = -1, LOG_HI = 2;                      // 평균의 0.1배 ~ 100배

  // ── 밀도 그림 그리기 (버퍼를 다시 쓰고, 매 프레임 새로 만들지 않는다) ─────────────
  const bufs = {};
  function buffers(G) {
    if (bufs[G]) return bufs[G];
    const b = {G, dens: new Float32Array(G * G), co: new Float32Array(G * G), tmp: new Float32Array(G * G), P: 2 * G};
    b.off = document.createElement('canvas'); b.off.width = b.off.height = G;
    b.octx = b.off.getContext('2d'); b.img = b.octx.createImageData(G, G); b.px = new Uint32Array(b.img.data.buffer);
    b.offP = document.createElement('canvas'); b.offP.width = b.offP.height = b.P;
    b.pctx = b.offP.getContext('2d'); b.imgP = b.pctx.createImageData(b.P, b.P); b.pxP = new Uint32Array(b.imgP.data.buffer);
    return (bufs[G] = b);
  }
  function cic(xs, ys, np, G, out) {
    out.fill(0);
    // 그림 격자(G)는 입자 격자의 2배라서, 반 칸 밀어 배정해야 처음의 고른 격자가 얼룩 없이 고르게 보인다
    const m = G - 1, w = G * G / np;
    for (let p = 0; p < np; p++) {
      const gx = xs[p] * G + 0.5, gy = ys[p] * G + 0.5;
      let i = gx | 0, j = gy | 0;
      const dx = gx - i, dy = gy - j;
      i &= m; j &= m;
      const i1 = (i + 1) & m, j1 = (j + 1) & m;
      out[j * G + i] += (1 - dx) * (1 - dy) * w; out[j * G + i1] += dx * (1 - dy) * w;
      out[j1 * G + i] += (1 - dx) * dy * w; out[j1 * G + i1] += dx * dy * w;
    }
  }
  // 주기 경계 상자 흐리기(누적 합) — 두 번 하면 가우스 흐리기와 비슷하다
  function boxBlur(src, dst, tmp, G, r) {
    const m = G - 1, w = 1 / (2 * r + 1);
    for (let j = 0; j < G; j++) {
      const row = j * G;
      let s = 0;
      for (let d = -r; d <= r; d++) s += src[row + (d & m)];
      for (let i = 0; i < G; i++) { tmp[row + i] = s * w; s += src[row + ((i + r + 1) & m)] - src[row + ((i - r) & m)]; }
    }
    for (let i = 0; i < G; i++) {
      let s = 0;
      for (let d = -r; d <= r; d++) s += tmp[(d & m) * G + i];
      for (let j = 0; j < G; j++) { dst[j * G + i] = s * w; s += tmp[((j + r + 1) & m) * G + i] - tmp[((j - r) & m) * G + i]; }
    }
  }
  // xs, ys: 입자 위치(0~1). mode 'density' | 'particles'. 그린 그림이 담긴 화면 밖 캔버스를 돌려준다.
  function renderField(xs, ys, np, G, mode) {
    const b = buffers(G);
    cic(xs, ys, np, G, b.dens);
    boxBlur(b.dens, b.co, b.tmp, G, 2);
    boxBlur(b.co, b.co, b.tmp, G, 2);
    const k = 255 / (LOG_HI - LOG_LO), L = Math.LOG10E;
    if (mode === 'particles') {
      const P = b.P, px = b.pxP, big = np * 8 < P * P;     // 입자가 적으면(4천 개) 2×2 점
      px.fill(BG);
      for (let p = 0; p < np; p++) {
        const x = xs[p], y = ys[p];
        const v = b.co[((y * G) | 0) * G + ((x * G) | 0)];
        const t = clamp((Math.log(v + 1e-3) * L - LOG_LO) * k + 40, 115, 255) | 0;   // 빈 곳의 입자도 보이게
        const i = (x * P) | 0, j = (y * P) | 0, c = LUT[t];
        px[j * P + i] = c;
        if (big) { const i1 = (i + 1) % P, j1 = (j + 1) % P; px[j * P + i1] = c; px[j1 * P + i] = c; px[j1 * P + i1] = c; }
      }
      b.pctx.putImageData(b.imgP, 0, 0);
      return b.offP;
    }
    const d = b.dens, co = b.co, px = b.px;
    for (let i = 0; i < G * G; i++) {
      // 빈 곳은 흐린 밀도로 매끄럽게, 빽빽한 곳은 선명한 밀도로 — 흐린 값보다 어둡게는 그리지 않는다(덩어리 둘레의 검은 테 방지)
      const c = co[i], w = c <= 0.7 ? 0 : c >= 3 ? 1 : (c - 0.7) / 2.3;
      const m = w * d[i] + (1 - w) * c, v = m > c ? m : c;
      const t = (Math.log(v + 1e-3) * L - LOG_LO) * k;
      px[i] = LUT[t <= 0 ? 0 : t >= 255 ? 255 : t | 0];
    }
    b.octx.putImageData(b.img, 0, 0);
    return b.off;
  }
  const gridFor = N => (N >= 128 ? 256 : 128);
  // 캔버스의 실제 화소 수를 화면 크기에 맞춘다
  function fitCanvas(canvas) {
    const r = canvas.getBoundingClientRect(), d = Math.min(2, window.devicePixelRatio || 1);
    const W = clamp(Math.round((r.width || 300) * d), 64, 1200);
    if (canvas.width !== W) { canvas.width = W; canvas.height = W; }
    return W;
  }
  function busy(node, run, extra) {
    node.hidden = run.done;
    if (!run.done) node.firstElementChild.textContent = `모의실험 계산 중… ${Math.round(run.progress() * 100)} %${extra || ''}`;
  }

  // ── 모의실험 돌리기: 캐시 + 시간을 잘게 나눠 계산(화면이 멈추지 않게) ─────────────
  const Q = {N: 128};
  const Runs = (() => {
    const map = new Map(), queue = [], listeners = [];
    const MAX = 7, SLICE = 12;
    let timer = null;
    let pinned = () => [];
    function get(model, amp, N) {
      const key = `${model}|${amp}|${N}`;
      let r = map.get(key);
      if (!r) {
        r = M.createRun({N, seed: SEED, model, amp});
        r.key = key;
        map.set(key, r);
        trim();
      }
      r.used = performance.now();
      return r;
    }
    function need(run, urgent) {
      if (run.done) return;
      const i = queue.indexOf(run);
      if (i >= 0) queue.splice(i, 1);
      if (urgent) queue.unshift(run); else queue.push(run);
      kick();
    }
    function kick() { if (!timer && queue.length && !document.hidden) timer = setTimeout(pump, 0); }
    function pump() {
      timer = null;
      if (document.hidden) return;
      const run = queue[0];
      if (!run) return;
      const t0 = performance.now();
      while (!run.done && performance.now() - t0 < SLICE) run.advance();
      if (run.done) queue.shift();
      listeners.forEach(f => f(run));
      kick();
    }
    function trim() {
      if (map.size <= MAX) return;
      const keep = new Set(pinned());
      const old = [...map.values()].filter(r => !keep.has(r)).sort((a, b) => a.used - b.used);
      while (map.size > MAX && old.length) {
        const r = old.shift();
        map.delete(r.key);
        const qi = queue.indexOf(r);
        if (qi >= 0) queue.splice(qi, 1);
      }
    }
    document.addEventListener('visibilitychange', () => { if (!document.hidden) kick(); });
    const peek = (model, amp, N) => map.get(`${model}|${amp}|${N}`);   // 없으면 만들지 않는다
    // 더는 보지 않는 계산은 줄에서 뺀다(지금까지 계산한 것은 남아 있어 다시 고르면 이어서 계산)
    function drop(fn) { for (let i = queue.length - 1; i >= 0; i--) if (fn(queue[i])) queue.splice(i, 1); }
    return {get, peek, need, drop, onProgress: f => listeners.push(f), list: () => [...map.values()], setPinned: f => { pinned = f; }};
  })();

  // ── 실험 전환 (#s1 · #s2 · #s3) ─────────────────────────────────
  const stations = {};
  const HASH = {s1: 'grow', s2: 'find', s3: 'models', grow: 'grow', find: 'find', models: 'models'};
  const HASH_OF = {grow: 's1', find: 's2', models: 's3'};
  let current = 'grow';
  const nav = document.querySelector('.stations');
  function show(name) {
    if (!stations[name]) name = 'grow';
    if (current !== name && stations[current]) stations[current].leave();
    current = name;
    setPressed(nav, 'data-station', name);
    document.querySelectorAll('.station').forEach(s => { s.hidden = s.id !== 'station-' + name; });
    stations[name].enter();
    try { history.replaceState(null, '', '#' + HASH_OF[name]); } catch (_) {}
  }
  nav.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
    show(b.dataset.station);
    nav.scrollIntoView({block: 'nearest'});
  }));

  // 그리기 요청을 한 화면 갱신에 한 번으로 모은다
  function drawer(fn) {
    let pending = false;
    const run = () => { pending = false; fn(); };
    return {
      soon() { if (!pending) { pending = true; requestAnimationFrame(run); } },
      now() { fn(); }
    };
  }

  // ═══════════════ 01 미세한 밀도 차이의 성장 ═══════════════
  stations.grow = (() => {
    const st = {amp: 1, view: 'density', age: null, playing: false, ys: 'lin', real: false};
    const SPEED = 11.6;                   // 억 년 / 초 → 140억 년이 약 12초
    const canvas = $('grow-canvas'), ctx = canvas.getContext('2d');
    const slider = $('grow-time'), chart = $('grow-chart');
    let xs = new Float64Array(0), ys = new Float64Array(0);
    const run = () => Runs.get('accel', st.amp, Q.N);
    const endAge = () => M.cosmology('accel').ageNow;
    const wantAge = () => (st.age === null ? endAge() : st.age);
    function buf(np) { if (xs.length !== np) { xs = new Float64Array(np); ys = new Float64Array(np); } }

    // 화면 요소
    document.querySelectorAll('#grow-view [data-view]').forEach(b => b.addEventListener('click', () => {
      st.view = b.dataset.view; setPressed($('grow-view'), 'data-view', st.view); snapKey = ''; draw.now();
    }));
    document.querySelectorAll('#grow-yscale [data-ys]').forEach(b => b.addEventListener('click', () => {
      st.ys = b.dataset.ys; setPressed($('grow-yscale'), 'data-ys', st.ys); buildChart(); update();
    }));
    $('grow-real').addEventListener('change', e => { st.real = e.target.checked; draw.now(); });
    slider.addEventListener('input', () => { setPlaying(false); st.age = +slider.value; update(); });
    $('grow-play').addEventListener('click', () => {
      if (st.playing) { setPlaying(false); return; }
      if (wantAge() >= endAge() - 0.05) st.age = 0;
      setPlaying(true);
    });
    const jump = d => { setPlaying(false); st.age = clamp(wantAge() + d, 0, endAge()); update(); };
    $('grow-back').addEventListener('click', () => jump(-10));
    $('grow-fwd').addEventListener('click', () => jump(10));
    const ampIn = $('amp');
    ampIn.addEventListener('input', () => setAmp(+ampIn.value));
    document.querySelectorAll('#amp-presets [data-amp]').forEach(b => b.addEventListener('click', () => setAmp(+b.dataset.amp)));
    function setAmp(v) {
      st.amp = v; ampIn.value = v;
      Runs.drop(r => r.model === 'accel' && r.amp !== v && r.amp !== 1);
      const r = run();
      Runs.need(r, true);
      snapKey = ''; buildChart(); update();
    }

    let raf = 0, last = 0;
    function setPlaying(v) {
      st.playing = v;
      $('grow-play').textContent = v ? '❚❚ 멈춤' : '▶ 재생';
      $('grow-play').setAttribute('aria-pressed', String(v));
      if (v && !raf) { last = 0; raf = requestAnimationFrame(tick); }
    }
    function tick(now) {
      raf = 0;
      if (!st.playing || current !== 'grow' || document.hidden) { if (st.playing) setPlaying(false); return; }
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
      last = now;
      const r = run();
      let age = wantAge() + dt * SPEED;
      if (age > r.lastAge()) age = r.lastAge();          // 아직 계산하지 않은 시점이면 기다린다
      if (age >= endAge() - 1e-9) { age = endAge(); st.age = age; setPlaying(false); update(); return; }
      st.age = age;
      update();
      raf = requestAnimationFrame(tick);
    }

    // 큰 그림
    function paint() {
      const r = run();
      buf(r.np);
      // 움직임 줄이기 설정이면 계산하는 동안 우주가 자라는 모습을 저절로 보여 주지 않는다
      const age = Math.min(wantAge(), reduceMotion && !r.done && st.age === null ? r.ages[0] : r.lastAge());
      r.positionsAt(age, xs, ys);
      const off = renderField(xs, ys, r.np, gridFor(r.N), st.view);
      const W = fitCanvas(canvas), s = r.statsAt(age);
      ctx.fillStyle = SPACE; ctx.fillRect(0, 0, W, W);
      ctx.imageSmoothingEnabled = true;
      const scale = $('grow-scale');
      if (st.real) {
        const side = Math.max(2, W * s.a), o = (W - side) / 2;
        ctx.drawImage(off, o, o, side, side);
        ctx.save();
        ctx.setLineDash([6, 5]); ctx.strokeStyle = '#8fb3cc'; ctx.lineWidth = Math.max(1, W / 400);
        ctx.strokeRect(0.5, 0.5, W - 1, W - 1);
        ctx.setLineDash([]); ctx.strokeStyle = '#ffd27a'; ctx.strokeRect(o, o, side, side);
        ctx.restore();
        scale.lastElementChild.textContent = `그때 상자의 실제 크기: 한 변 ${num(M.BOX_MPC * s.a, s.a < 0.1 ? 1 : 0)} Mpc (점선 = 현재 140 Mpc)`;
        scale.firstElementChild.style.width = '0';
      } else {
        ctx.drawImage(off, 0, 0, W, W);
        scale.lastElementChild.textContent = '35 Mpc (현재 기준)';
        scale.firstElementChild.style.width = '';
      }
      $('grow-age').innerHTML = `${fmtAge(age)}${age >= endAge() - 0.05 ? ' (현재)' : ''}<small>우주의 크기 ${fmtPct(s.a)}</small>`;
      canvas.setAttribute('aria-label', `우주 나이 ${fmtAge(age)}의 모의실험 상자. 밀도 차이 ${fmtPct(s.rms)}, 가장 빽빽한 곳은 평균의 ${fmtTimes(s.max)}.`);
      busy($('grow-busy'), r, r.done ? '' : ` · ${fmtAge(r.lastAge())}까지 계산함`);
    }
    const draw = drawer(paint);

    // 네 시점(교과서 그림 27)
    const SNAPS = [10, 30, 60, null];
    const snapBox = $('grow-snaps');
    const snapEls = SNAPS.map(t => {
      const b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = `<span class="thumb"><canvas role="img"></canvas></span><span class="cap"></span>`;
      b.addEventListener('click', () => { setPlaying(false); st.age = t === null ? endAge() : t; update(); });
      snapBox.appendChild(b);
      return {b, t, canvas: b.querySelector('canvas'), cap: b.querySelector('.cap')};
    });
    let snapKey = '';                       // '' 이면 네 그림을 모두 다시 그린다
    function paintSnaps() {
      const r = run();
      buf(r.np);
      snapEls.forEach(s => {
        const t = s.t === null ? endAge() : s.t, a = M.cosmology('accel').aAt(t);
        s.cap.innerHTML = `${s.t === null ? `${Math.round(t)}억 년(현재)` : `${t}억 년`}<small>우주의 크기 ${fmtPct(Math.min(1, a))}</small>`;
        s.b.setAttribute('aria-pressed', String(Math.abs(wantAge() - t) < 0.6));
        s.b.setAttribute('aria-label', `우주 나이 ${fmtAge(t)}의 모습 보기`);
        // 그 시점까지 계산했는지가 바뀔 때만 다시 그린다
        const ready = r.lastAge() >= t - 1e-6, key = `${r.key}|${st.view}|${ready}|${small()}`;
        if (snapKey && s.key === key) return;
        s.key = key;
        const c = s.canvas, W = fitCanvas(c), cx = c.getContext('2d');
        cx.fillStyle = SPACE; cx.fillRect(0, 0, W, W);
        if (!ready) return;
        r.positionsAt(t, xs, ys);
        cx.imageSmoothingEnabled = true;
        cx.drawImage(renderField(xs, ys, r.np, gridFor(r.N), st.view), 0, 0, W, W);
        c.setAttribute('aria-label', `우주 나이 ${fmtAge(t)}의 모의실험 상자`);
      });
      snapKey = 'ok';
    }

    // 밀도 차이 그래프
    const box = {l: 70, r: 622, t: 18, b: 270};
    let xsC, ysC, cursor = null;
    function yMap(v) { return st.ys === 'log' ? Math.log10(clamp(v, 0.1, 2000)) : v; }
    function buildChart() {
      clear(chart);
      const tall = small();
      chart.setAttribute('viewBox', `0 0 640 ${tall ? 430 : 340}`);
      box.b = tall ? 350 : 270; box.l = tall ? 104 : 70;
      // 끝까지 계산한 것과 지금 고른 것만 그린다
      const runs = Runs.list().filter(r => r.model === 'accel' && r.N === Q.N && (r.done || r.amp === st.amp)).sort((a, b) => a.amp - b.amp);
      const maxV = Math.max(100, ...runs.map(r => Math.max(...r.stats.map(s => s.rms * 100))));
      const top = st.ys === 'log' ? 3 : Math.ceil(maxV / 50) * 50;
      xsC = lin(0, 140, box.l, box.r);
      ysC = st.ys === 'log' ? lin(-1, 3, box.b, box.t) : lin(0, top, box.b, box.t);
      const yTicks = st.ys === 'log'
        ? [[-1, '0.1 %'], [0, '1 %'], [1, '10 %'], [2, '100 %'], [3, '1000 %']].map(([v, label]) => ({v, label}))
        : Array.from({length: top / (top > 200 ? 100 : 50) + 1}, (_, i) => i * (top > 200 ? 100 : 50)).map(v => ({v, label: `${v} %`}));
      frame(chart, box, xsC, ysC, {
        xTicks: [0, 20, 40, 60, 80, 100, 120, 140].map(v => ({v, label: tall && v % 40 ? '' : `${v}`})),
        yTicks, xLabel: '우주 나이 (억 년)', yLabel: tall ? '밀도 차이' : '밀도 차이 (표준편차)'
      });
      const labels = [];
      runs.forEach(r => {
        const on = r.amp === st.amp;
        const pts = r.stats.map(s => [xsC(s.age), ysC(yMap(s.rms * 100))]);
        if (pts.length < 2) return;
        el('path', {d: pathOf(pts), fill: 'none', stroke: on ? 'var(--orange)' : '#9aa9b5', 'stroke-width': on ? 3.5 : 2, 'stroke-dasharray': on ? '' : '6 4', 'stroke-linejoin': 'round'}, chart);
        // 곡선 이름: 끝에서 조금 왼쪽, 곡선 위에 (오른쪽 끝의 커서와 겹치지 않게)
        const at = Math.min(r.stats[r.stats.length - 1].age, 112);
        labels.push({y: ysC(yMap(r.statsAt(at).rms * 100)) - 10, x: xsC(at), on,
          text: r.amp === 0 ? '처음 차이 0 → 계속 0' : r.amp === 1 ? '기본 (×1)' : `처음 차이 ×${r.amp}`});
      });
      // 이름표끼리 겹치면 위아래로 벌린다(위에서부터 차례로)
      const gap = tall ? 24 : 15;
      labels.sort((p, q) => p.y - q.y);
      labels.forEach((l, i) => { if (i && l.y - labels[i - 1].y < gap) l.y = labels[i - 1].y + gap; });
      labels.forEach(l => el('text', {x: l.x, y: Math.min(l.y, box.b - 4), 'text-anchor': 'end', class: 'annot halo', fill: l.on ? 'var(--orange)' : 'var(--muted)'}, chart, l.text));
      cursor = {
        line: el('line', {y1: box.t, y2: box.b, stroke: '#14283a', 'stroke-width': 1.5, 'stroke-dasharray': '4 4'}, chart),
        dot: el('circle', {r: small() ? 8 : 6, fill: '#fff', stroke: 'var(--orange)', 'stroke-width': 3}, chart)
      };
    }
    onDrag(chart, (e) => {
      const p = svgPoint(chart, e);
      if (!xsC || p.x < box.l - 10 || p.x > box.r + 10) return;
      setPlaying(false);
      st.age = clamp(xsC.inv(p.x), 0, endAge());
      update();
    });

    function insight(r, age, s) {
      const s0 = r.stats[0];
      const amp = st.amp;
      if (amp === 0) return '시작할 때의 밀도 차이가 <b>0</b>이면 어디서나 밀도가 같아, 중력이 사방에서 똑같이 당겨 어느 쪽으로도 더 끌려가지 않습니다. 그래서 140억 년이 지나도 물질은 처음처럼 <b>고르게 퍼진 채</b>입니다(밀도 차이 0 %). → 거대구조가 생기려면 처음에 밀도가 조금이라도 높은 곳이 있어야 합니다. 거대구조는 <b>우주 초기에 미세한 밀도 차이(요동)가 있었다는 증거</b>입니다.';
      const growth = s.rms / Math.max(1e-9, s0.rms);
      const tail = amp !== 1 ? ` 기본값과 비교하면, 처음 차이가 ${amp > 1 ? '클수록 구조가 더 일찍' : '작을수록 구조가 더 늦게'} 자랍니다.` : '';
      if (age < 3) return `처음에는 밀도 차이가 <b>±${fmtPct(s0.rms).replace(' %', '')} %</b>뿐이라 거의 고르게 보입니다. 하지만 밀도가 평균보다 조금 높은 곳은 중력이 조금 더 강해서 주변 물질을 끌어당기기 시작합니다.${tail}`;
      if (age < 25) return `밀도가 높은 곳으로 물질이 모이며 가느다란 실(<b>필라멘트</b>)이 나타나기 시작했습니다. 밀도 차이는 처음의 <b>${fmtTimes(growth)}</b>인 ${fmtPct(s.rms)}로 커졌습니다.${tail}`;
      if (age < endAge() - 0.5) return `필라멘트가 그물처럼 이어지고, 필라멘트가 만나는 곳에 물질이 뭉쳐 <b>은하단</b>이 자랍니다. 밀도가 낮은 곳은 주변에 물질을 빼앗겨 점점 비어 갑니다(<b>보이드</b>). 가장 빽빽한 곳은 평균의 ${fmtTimes(s.max)}입니다.${tail}`;
      return `현재: 처음 ±${fmtPct(s0.rms).replace(' %', '')} %였던 밀도 차이가 <b>${fmtPct(s.rms)}</b>로 커졌습니다. 가장 빽빽한 곳은 평균의 <b>${fmtTimes(s.max)}</b>, 가장 빈 곳은 ${s.min < 0.01 ? '거의 텅 비었습니다' : `평균의 ${fmtTimes(s.min)}입니다`}. 밀도가 높은 곳은 더 높게, 낮은 곳은 더 낮게 — <b>미세한 밀도 차이가 중력으로 자라 우주거대구조</b>가 되었습니다.${tail}`;
    }

    function update() {
      const r = run();
      const age = Math.min(wantAge(), r.lastAge()), s = r.statsAt(age);
      slider.max = endAge().toFixed(1);
      slider.value = wantAge();
      $('grow-time-out').textContent = fmtAge(wantAge()) + (wantAge() >= endAge() - 0.05 ? ' (현재)' : '');
      $('grow-a').textContent = num(s.a, s.a < 0.1 ? 3 : 2);
      $('grow-rms').textContent = fmtPct(s.rms);
      $('grow-max').textContent = `평균의 ${fmtTimes(s.max)}`;
      $('amp-out').textContent = st.amp === 0 ? '0 (완전히 고르게)' : `×${st.amp} · ±${fmtPct(r.stats[0].rms)}`;
      setPressed($('amp-presets'), 'data-amp', st.amp);
      if (cursor) {
        const x = xsC(age);
        cursor.line.setAttribute('x1', x); cursor.line.setAttribute('x2', x);
        cursor.dot.setAttribute('cx', x); cursor.dot.setAttribute('cy', ysC(yMap(s.rms * 100)));
      }
      $('grow-insight').innerHTML = insight(r, age, s);
      paintSnaps();
      draw.soon();
    }

    Runs.onProgress(r => {
      if (current !== 'grow' || r.model !== 'accel' || r.N !== Q.N) return;
      buildChart();
      update();
    });
    return {
      enter() {
        const r = run();
        Runs.need(r, true);
        setPressed($('grow-view'), 'data-view', st.view);
        snapKey = '';
        buildChart(); update(); draw.now();
      },
      leave() { setPlaying(false); },
      resize() { snapKey = ''; buildChart(); update(); draw.now(); },
      pinned: () => [Runs.peek('accel', st.amp, Q.N)],
      quality() { snapKey = ''; }
    };
  })();

  // ═══════════════ 02 은하단·필라멘트·보이드 찾기 ═══════════════
  stations.find = (() => {
    const NAME = {cluster: '은하단', filament: '필라멘트', void: '보이드'};
    const COLOR = {cluster: '#e6a93c', filament: '#4fc3dc', void: '#5b8def'};
    const CLS = ['void', 'filament', 'cluster'];
    const st = {tool: 'cluster', marks: [], reveal: false, here: null};
    const canvas = $('find-canvas'), ctx = canvas.getContext('2d');
    const run = () => Runs.get('accel', 1, Q.N);
    let base = null;              // {key, img (캔버스), cl, raw}

    document.querySelectorAll('#find-tools [data-tool]').forEach(b => b.addEventListener('click', () => {
      st.tool = b.dataset.tool; setPressed($('find-tools'), 'data-tool', st.tool);
    }));
    $('find-clear').addEventListener('click', () => { st.marks = []; st.here = null; refresh(); });
    $('find-reveal').addEventListener('click', () => { st.reveal = !st.reveal; refresh(); });

    // 현재 모습 한 장과 자동 분류는 한 번만 계산해 둔다
    function prepare() {
      const r = run();
      if (!r.done) return false;
      if (base && base.key === r.key) return true;
      const k = r.frames.length - 1, xs = new Float64Array(r.np), ys = new Float64Array(r.np);
      r.positionsAt(r.ages[k], xs, ys);
      const src = renderField(xs, ys, r.np, gridFor(r.N), 'density');
      const img = document.createElement('canvas');
      img.width = img.height = src.width;
      img.getContext('2d').drawImage(src, 0, 0);
      const raw = M.densityGrid(xs, ys, r.np, 64);
      const cl = M.classify(raw, 64);
      // 필라멘트 칸을 하늘색으로 칠한 겹침 그림
      const fil = document.createElement('canvas');
      fil.width = fil.height = 64;
      const fctx = fil.getContext('2d'), fimg = fctx.createImageData(64, 64);
      for (let i = 0; i < 64 * 64; i++) {
        if (cl.cls[i] !== M.CLASS.filament) continue;
        // 평균 밀도 근처는 옅게, 진할수록 또렷하게 → 칸 경계가 덜 각져 보인다
        const al = clamp((cl.rho[i] - 0.9) / 1.2, 0.25, 1);
        fimg.data[4 * i] = 79; fimg.data[4 * i + 1] = 195; fimg.data[4 * i + 2] = 220; fimg.data[4 * i + 3] = Math.round(165 * al);
      }
      fctx.putImageData(fimg, 0, 0);
      base = {key: r.key, img, cl, raw, fil};
      drawCharts();
      return true;
    }

    // 이름표가 맞는지: 손가락 크기를 생각해 둘레 몇 칸 안에 그 구조가 있으면 맞은 것으로 본다
    function cellsPerPx() { const w = canvas.getBoundingClientRect().width || 300; return 64 / w; }
    function judge(m) {
      const cl = base.cl, G = 64, ci = Math.floor(m.x * G), cj = Math.floor(m.y * G);
      const tol = Math.max(1.5, 14 * cellsPerPx());
      const near = (want, r) => {
        const R = Math.ceil(r);
        for (let dj = -R; dj <= R; dj++) for (let di = -R; di <= R; di++) {
          if (di * di + dj * dj > r * r) continue;
          if (cl.cls[((cj + dj) & 63) * G + ((ci + di) & 63)] === want) return true;
        }
        return false;
      };
      if (m.type === 'cluster') return cl.clusters.some(c => M.torusDist(c.i, c.j, ci, cj, G) <= Math.max(tol, c.r * G + 1)) || near(M.CLASS.cluster, tol);
      if (m.type === 'filament') return near(M.CLASS.filament, tol);
      return near(M.CLASS.void, Math.min(tol, 1.5));
    }
    function hereText(x, y) {
      const cl = base.cl, i = Math.floor(x * 64), j = Math.floor(y * 64), idx = j * 64 + i;
      return `${NAME[CLS[cl.cls[idx]]]} · 평균의 ${fmtTimes(cl.rho[idx])}`;
    }

    // 누르고 뗄 때(click) 붙인다 — 지도 위에서 손가락으로 쓸어 화면을 내리면 붙지 않는다
    canvas.addEventListener('click', e => {
      if (!base) return;
      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width, y = (e.clientY - rect.top) / rect.height;
      if (x < 0 || x >= 1 || y < 0 || y >= 1) return;
      const hit = 20 / rect.width;
      const k = st.marks.findIndex(m => Math.hypot(m.x - x, m.y - y) < hit);
      if (k >= 0) st.marks.splice(k, 1);
      else {
        if (st.marks.length >= 20) st.marks.shift();
        st.marks.push({x, y, type: st.tool});
      }
      st.here = {x, y};
      refresh();
    });

    function paint() {
      const r = run(), W = fitCanvas(canvas);
      ctx.fillStyle = SPACE; ctx.fillRect(0, 0, W, W);
      busy($('find-busy'), r);
      if (!prepare()) return;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(base.img, 0, 0, W, W);
      const u = W / (canvas.getBoundingClientRect().width || W);   // CSS 1px 의 화소 수
      if (st.reveal) {
        ctx.globalAlpha = 0.85;
        ctx.drawImage(base.fil, 0, 0, W, W);
        ctx.globalAlpha = 1;
        ctx.lineWidth = 2.5 * u;
        ctx.setLineDash([7 * u, 5 * u]); ctx.strokeStyle = '#7fa6ff';
        base.cl.voids.slice(0, 8).forEach(v => { ctx.beginPath(); ctx.arc(v.x * W, v.y * W, v.r * W, 0, 2 * Math.PI); ctx.stroke(); });
        ctx.setLineDash([]); ctx.strokeStyle = '#fff';
        base.cl.clusters.forEach(c => { ctx.beginPath(); ctx.arc(c.x * W, c.y * W, Math.max(c.r, 2.5 / 64) * W, 0, 2 * Math.PI); ctx.stroke(); });
      }
      st.marks.forEach(m => {
        const x = m.x * W, y = m.y * W, R = 10 * u;
        ctx.beginPath(); ctx.arc(x, y, R, 0, 2 * Math.PI);
        ctx.fillStyle = COLOR[m.type]; ctx.fill();
        ctx.lineWidth = 2.5 * u; ctx.strokeStyle = '#fff'; ctx.stroke();
        ctx.fillStyle = '#0b1626'; ctx.font = `800 ${11 * u}px "Pretendard","Malgun Gothic",sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(m.type === 'cluster' ? '단' : m.type === 'filament' ? '필' : '보', x, y + 0.5 * u);
        if (st.reveal) {
          const ok = judge(m), bx = x + R * 0.95, by = y - R * 0.95;
          ctx.beginPath(); ctx.arc(bx, by, 7.5 * u, 0, 2 * Math.PI);
          ctx.fillStyle = ok ? '#18794e' : '#b42318'; ctx.fill();
          ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5 * u; ctx.stroke();
          ctx.fillStyle = '#fff'; ctx.font = `800 ${10 * u}px sans-serif`;
          ctx.fillText(ok ? '✓' : '✗', bx, by + 0.5 * u);
        }
      });
    }
    const draw = drawer(paint);

    function refresh() {
      setPressed($('find-tools'), 'data-tool', st.tool);
      $('find-reveal').setAttribute('aria-pressed', String(st.reveal));
      $('find-legend').hidden = !st.reveal;
      $('find-count').textContent = `${st.marks.length}개`;
      const ready = prepare();
      const fb = $('find-feedback');
      if (ready && st.reveal) {
        const res = {cluster: [0, 0], filament: [0, 0], void: [0, 0]};
        st.marks.forEach(m => { res[m.type][1]++; if (judge(m)) res[m.type][0]++; });
        const okN = Object.values(res).reduce((s, v) => s + v[0], 0);
        $('find-score').textContent = st.marks.length ? `${okN} / ${st.marks.length}` : '—';
        $('find-here').textContent = st.here ? hereText(st.here.x, st.here.y) : '—';
        fb.hidden = false;
        fb.className = 'feedback' + (st.marks.length && okN === st.marks.length ? ' ok' : '');
        fb.innerHTML = st.marks.length
          ? `${Object.keys(res).filter(k => res[k][1]).map(k => `${NAME[k]} ${res[k][1]}개 중 <b>${res[k][0]}개</b>`).join(', ')} 맞았습니다.${okN < st.marks.length ? ' ✗ 표시가 붙은 곳 근처를 눌러 ‘마지막으로 누른 곳’의 실제 분류와 밀도를 확인해 보세요.' : ' 모두 맞았어요!'}`
          : '아직 붙인 이름표가 없습니다. 이름표를 고르고 지도를 눌러 보세요. 겹쳐 보이는 분류를 보고 은하단·필라멘트·보이드의 모양을 익혀도 좋습니다.';
      } else {
        $('find-score').textContent = '—';
        $('find-here').textContent = st.reveal ? '—' : '정답 확인 후 표시';
        fb.hidden = true;
      }
      draw.soon();
    }

    // 밀도와 넓이 그래프
    function drawCharts() {
      const svg = $('find-density'), cl = base.cl;
      clear(svg);
      const tall = small();
      svg.setAttribute('viewBox', `0 0 640 ${tall ? 400 : 300}`);
      const b = {l: tall ? 104 : 74, r: 622, t: 26, b: tall ? 300 : 232};
      const items = [
        {name: '은하단', v: cl.meanDensity[2], c: '#d48a1e'},
        {name: '필라멘트', v: cl.meanDensity[1], c: '#2a9fbb'},
        {name: '우주 평균', v: 1, c: '#8a96a3'},
        {name: '보이드', v: cl.meanDensity[0], c: '#5b8def'}
      ];
      const ys = lin(-1, 1.5, b.b, b.t), xs = lin(0, items.length, b.l, b.r);
      frame(svg, b, xs, ys, {
        yTicks: [[-1, '0.1'], [-0.5, '0.3'], [0, '1'], [0.5, '3'], [1, '10'], [1.5, '30']].map(([v, label]) => ({v, label})),
        yLabel: tall ? '평균 밀도' : '평균 밀도 (우주 평균 = 1)'
      });
      el('line', {x1: b.l, x2: b.r, y1: ys(0), y2: ys(0), stroke: '#14283a', 'stroke-dasharray': '5 4', 'stroke-width': 1.2}, svg);
      items.forEach((it, i) => {
        const x0 = xs(i) + 14, x1 = xs(i + 1) - 14, y = ys(Math.log10(it.v));
        const top = Math.min(y, ys(0)), h = Math.abs(ys(0) - y);
        el('rect', {x: x0, y: top, width: x1 - x0, height: Math.max(2, h), rx: 4, fill: it.c}, svg);
        el('text', {x: (x0 + x1) / 2, y: (it.v >= 1 ? y - 8 : y + 18), 'text-anchor': 'middle', class: 'annot halo'}, svg, it.v === 1 ? '1' : `${fmtTimes(it.v)}`);
        el('text', {x: (x0 + x1) / 2, y: b.b + (tall ? 30 : 20), 'text-anchor': 'middle', class: 'tick', 'font-weight': 700}, svg, it.name);
      });
      const pct = v => Math.round(v * 100);
      const row = (label, f) => `<div class="row"><span>${label}</span><div class="bar">
        <div class="v" style="width:${f[0] * 100}%">${pct(f[0]) >= 8 ? `보이드 ${pct(f[0])} %` : ''}</div>
        <div class="f" style="width:${f[1] * 100}%">${pct(f[1]) >= 12 ? `필라멘트 ${pct(f[1])} %` : pct(f[1]) >= 6 ? `${pct(f[1])} %` : ''}</div>
        <div class="c" style="width:${f[2] * 100}%">${pct(f[2]) >= 12 ? `은하단 ${pct(f[2])} %` : pct(f[2]) >= 6 ? `${pct(f[2])} %` : ''}</div></div></div>`;
      $('find-stack').innerHTML = row('차지하는 넓이 (평면 모형에서는 넓이 = 부피)', cl.areaFrac) + row('그 안에 들어 있는 물질', cl.massFrac) +
        `<div class="keys"><span><i style="background:var(--void)"></i>보이드 ${pct(cl.areaFrac[0])} % / 물질 ${pct(cl.massFrac[0])} %</span><span><i style="background:#2a9fbb"></i>필라멘트 ${pct(cl.areaFrac[1])} % / ${pct(cl.massFrac[1])} %</span><span><i style="background:#d48a1e"></i>은하단 ${pct(cl.areaFrac[2])} % / ${pct(cl.massFrac[2])} %</span></div>`;
      const d = cl.meanDensity;
      $('find-insight').innerHTML = `이 모형에서 평균 밀도는 <b>은하단(평균의 ${fmtTimes(d[2])}) &gt; 필라멘트(${fmtTimes(d[1])}) &gt; 우주 평균(1) &gt; 보이드(${fmtTimes(d[0])})</b>입니다. 보이드는 상자 넓이의 <b>${pct(cl.areaFrac[0])} %</b>를 차지하지만 물질은 ${pct(cl.massFrac[0])} %뿐이고, 은하단은 넓이의 ${pct(cl.areaFrac[2])} %에 물질의 ${pct(cl.massFrac[2])} %가 모여 있습니다. 이 모형의 격자는 은하 하나보다 훨씬 커서 은하가 따로 보이지 않지만, 은하 안쪽은 은하단 평균보다도 훨씬 빽빽합니다 — <b>은하 &gt; 은하단 &gt; 우주 평균 &gt; 보이드</b>(기출에서는 보이드를 ‘거대 공동’이라고 씁니다).`;
    }

    Runs.onProgress(r => { if (current === 'find' && r === run()) refresh(); });
    return {
      enter() { Runs.need(run(), true); if (base) drawCharts(); refresh(); draw.now(); },
      leave() {},
      resize() { if (base) drawCharts(); refresh(); draw.now(); },
      pinned: () => [Runs.peek('accel', 1, Q.N)],
      quality() { base = null; st.marks = []; st.here = null; }
    };
  })();

  // ═══════════════ 03 우주 모형 비교 (그림 28) ═══════════════
  stations.models = (() => {
    const KEYS = ['accel', 'open', 'flat'];
    const INFO = {
      accel: {comp: '물질 30 % · 암흑 에너지 70 %', cap: '필라멘트 주변으로 물질이 결집하고, 큰 보이드가 형성됨.', color: 'var(--accel)'},
      open: {comp: '물질 30 % · 암흑 에너지 0 %', cap: '감속 팽창으로 가 우주에 비해 큰 보이드가 느리게 형성됨.', color: 'var(--open)'},
      flat: {comp: '물질 100 % · 암흑 에너지 0 %', cap: '물질이 풍부하여 가, 나 우주에 비해 상대적으로 작은 보이드가 형성됨.', color: 'var(--flat)'}
    };
    const st = {a: 1, playing: false, circles: true, captions: false};
    const N = 128;
    const grid = $('models-grid');
    const P = {};
    KEYS.forEach(k => {
      const m = M.MODELS[k], sec = document.createElement('section');
      sec.className = 'panel model';
      sec.innerHTML = `<div class="model-head"><span class="model-tag ${k}">${m.tag}</span><div><h3>${m.name}</h3><p class="micro">${INFO[k].comp}</p></div></div>
        <div class="sim-box"><canvas role="img"></canvas><div class="sim-age"></div><div class="sim-busy" hidden><span></span></div></div>
        <dl class="mstats"><dt>그때 나이</dt><dd data-f="t">—</dd><dt>보이드 크기</dt><dd data-f="v">—</dd><dt>텅 빈 넓이</dt><dd data-f="e">—</dd></dl>
        <p class="caption" hidden><b>교과서 그림 28</b>${INFO[k].cap}</p>`;
      grid.appendChild(sec);
      P[k] = {sec, canvas: sec.querySelector('canvas'), age: sec.querySelector('.sim-age'), busy: sec.querySelector('.sim-busy'),
        t: sec.querySelector('[data-f=t]'), v: sec.querySelector('[data-f=v]'), e: sec.querySelector('[data-f=e]'), cap: sec.querySelector('.caption'),
        xs: new Float64Array(N * N), ys: new Float64Array(N * N), voidCache: new Map()};
    });
    const ctrl = document.createElement('section');
    ctrl.className = 'panel controls';
    ctrl.innerHTML = `<div class="controls-row">
        <button type="button" id="models-play" class="primary">▶ 재생</button>
        <label class="grow"><span>우주의 크기 (현재 = 100 %) <output id="models-a-out"></output></span><input id="models-a" type="range" min="0.1" max="1" step="0.01" value="1"></label>
      </div>
      <div class="controls-row">
        <div class="quick" id="models-quick" role="group" aria-label="우주의 크기 바로 고르기"><button type="button" data-a="0.2">20 %</button><button type="button" data-a="0.6">60 %</button><button type="button" data-a="1">100 % (현재)</button></div>
        <label class="check"><input type="checkbox" id="models-circles" checked> 보이드의 큰 빈 곳을 파란 원으로</label>
        <button type="button" id="models-captions" class="compact" aria-pressed="false">교과서 그림 28 설명 보기</button>
      </div>`;
    grid.appendChild(ctrl);
    const note = document.createElement('p');
    note.className = 'panel-note models-note';
    note.innerHTML = '<b>보이드 크기</b> = 지도에서 밀도가 낮은 곳에 그린 큰 빈 원(파란 점선) 5개의 평균 지름 · <b>텅 빈 넓이</b> = 밀도가 우주 평균의 절반도 안 되는 곳이 차지하는 넓이';
    grid.insertBefore(note, ctrl);
    const hist = document.createElement('section');
    hist.className = 'panel history';
    hist.innerHTML = `<div class="panel-heading"><h3><span class="step">2</span> 세 우주의 크기 변화</h3><span class="micro">같은 크기(같은 높이)에 닿는 때가 우주마다 다릅니다</span></div>
      <svg id="models-chart" class="chart interactive" viewBox="0 0 640 300" role="img" aria-label="세 우주 모형의 시간에 따른 크기 변화"></svg>
      <p class="insight" id="models-insight"></p>`;
    grid.appendChild(hist);
    const slider = $('models-a'), chart = $('models-chart');

    slider.addEventListener('input', () => { setPlaying(false); st.a = +slider.value; update(); });
    document.querySelectorAll('#models-quick [data-a]').forEach(b => b.addEventListener('click', () => { setPlaying(false); st.a = +b.dataset.a; update(); }));
    $('models-circles').addEventListener('change', e => { st.circles = e.target.checked; draw.now(); });
    $('models-captions').addEventListener('click', () => {
      st.captions = !st.captions;
      $('models-captions').setAttribute('aria-pressed', String(st.captions));
      $('models-captions').textContent = st.captions ? '교과서 설명 숨기기' : '교과서 그림 28 설명 보기';
      KEYS.forEach(k => { P[k].cap.hidden = !st.captions; });
    });
    $('models-play').addEventListener('click', () => {
      if (st.playing) { setPlaying(false); return; }
      if (st.a >= 0.995) st.a = 0.1;
      setPlaying(true);
    });
    let raf = 0, last = 0;
    function setPlaying(v) {
      st.playing = v;
      $('models-play').textContent = v ? '❚❚ 멈춤' : '▶ 재생';
      $('models-play').setAttribute('aria-pressed', String(v));
      if (v && !raf) { last = 0; raf = requestAnimationFrame(tick); }
    }
    function tick(now) {
      raf = 0;
      if (!st.playing || current !== 'models' || document.hidden) { if (st.playing) setPlaying(false); return; }
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
      last = now;
      if (!KEYS.every(k => run(k).done)) { raf = requestAnimationFrame(tick); return; }
      st.a = Math.min(1, st.a + dt * 0.1);                 // 9초 동안 10 % → 100 %
      if (st.a >= 1) { st.a = 1; setPlaying(false); }
      update();
      if (st.playing) raf = requestAnimationFrame(tick);
    }

    const run = k => Runs.get(k, 1, N);
    // 기록 하나마다 보이드 크기를 한 번만 잰다(가장 가까운 기록)
    const g64 = new Float64Array(64 * 64), vx = new Float64Array(N * N), vy = new Float64Array(N * N);
    function nearestFrame(r, age) {
      const n = r.frames.length - 1;
      let i = 0;
      while (i < n && r.ages[i + 1] <= age) i++;
      return i < n && age - r.ages[i] > r.ages[i + 1] - age ? i + 1 : i;
    }
    function voidsAt(k, r, idx) {
      const c = P[k].voidCache;
      if (c.has(idx)) return c.get(idx);
      const f = r.frames[idx];
      for (let p = 0; p < r.np; p++) { vx[p] = f[2 * p] / 65536; vy[p] = f[2 * p + 1] / 65536; }
      const v = M.voidSize(M.densityGrid(vx, vy, r.np, 64, g64), 64);
      c.set(idx, v);
      return v;
    }
    function state(k) {
      const r = run(k), age = r.cos.age(st.a);
      return {r, age, ready: r.done || r.lastAge() >= age};
    }
    function paint() {
      KEYS.forEach(k => {
        const p = P[k], {r, age, ready} = state(k);
        const W = fitCanvas(p.canvas), ctx = p.canvas.getContext('2d');
        ctx.fillStyle = SPACE; ctx.fillRect(0, 0, W, W);
        busy(p.busy, r);
        if (!ready) { p.age.textContent = ''; return; }
        r.positionsAt(age, p.xs, p.ys);
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(renderField(p.xs, p.ys, r.np, gridFor(N), 'density'), 0, 0, W, W);
        const v = voidsAt(k, r, nearestFrame(r, age));
        if (st.circles) {
          const u = W / (p.canvas.getBoundingClientRect().width || W);
          ctx.lineWidth = 2 * u; ctx.setLineDash([6 * u, 4 * u]); ctx.strokeStyle = '#7fa6ff';
          v.circles.slice(0, 5).forEach(c => { ctx.beginPath(); ctx.arc(c.x * W, c.y * W, c.r * W, 0, 2 * Math.PI); ctx.stroke(); });
          ctx.setLineDash([]);
        }
        p.age.innerHTML = `${M.MODELS[k].tag}<small>${fmtAge(age)}${st.a >= 0.995 ? ' · 현재' : ''}</small>`;
        p.t.textContent = fmtAge(age) + (st.a >= 0.995 ? ' (현재)' : '');
        p.v.textContent = v.top5 > 0 ? `약 ${Math.round(v.top5)} Mpc` : '아직 없음';
        p.e.textContent = fmtPct(v.emptyFrac);
        p.canvas.setAttribute('aria-label', `${M.MODELS[k].name}, 우주의 크기 ${fmtPct(st.a)}, 나이 ${fmtAge(age)}. 보이드 크기 약 ${Math.round(v.top5)} Mpc, 텅 빈 넓이 ${fmtPct(v.emptyFrac)}.`);
      });
      insight();
    }
    const draw = drawer(paint);

    // 프리드만 방정식으로 구한 세 우주의 크기 변화
    const box = {l: 66, r: 610, t: 16, b: 236};
    let xsC, ysC, marks = null;
    function buildChart() {
      clear(chart);
      const tall = small();
      chart.setAttribute('viewBox', `0 0 640 ${tall ? 430 : 300}`);
      box.b = tall ? 350 : 236; box.l = tall ? 100 : 66;
      xsC = lin(0, 150, box.l, box.r); ysC = lin(0, 1.18, box.b, box.t);
      frame(chart, box, xsC, ysC, {
        xTicks: [0, 20, 40, 60, 80, 100, 120, 140].map(v => ({v, label: tall && v % 40 ? '' : `${v}`})),
        yTicks: [0, 0.2, 0.4, 0.6, 0.8, 1].map(v => ({v, label: `${Math.round(v * 100)} %`})),
        xLabel: '우주 나이 (억 년)', yLabel: tall ? '우주의 크기' : '우주의 크기 (현재 = 100 %)'
      });
      // 현재(크기 100 %)에 닿는 때 = 그 우주의 나이. 이름표는 두 줄로 엇갈려 겹치지 않게 쓴다.
      const up = tall ? -40 : -30;
      const END = {flat: {dx: 8, anchor: 'end', dy: -10}, open: {dx: 0, anchor: 'middle', dy: up}, accel: {dx: 8, anchor: 'end', dy: -10}};
      KEYS.forEach(k => {
        const c = M.expansionCurve(k), cos = M.cosmology(k);
        el('path', {d: pathOf(c.map(p => [xsC(p.t), ysC(p.a)])), fill: 'none', stroke: INFO[k].color, 'stroke-width': 3}, chart);
        const x = xsC(cos.ageNow), y = ysC(1);
        el('circle', {cx: x, cy: y, r: 5, fill: INFO[k].color}, chart);
        el('text', {x: x + END[k].dx, y: y + END[k].dy, 'text-anchor': END[k].anchor, class: 'annot halo', fill: INFO[k].color}, chart,
          `${M.MODELS[k].tag} ${Math.round(cos.ageNow)}억 년`);
      });
      el('text', {x: box.l + 8, y: ysC(1.1), class: 'tick halo'}, chart, '● = 현재 (크기 100 %)');
      marks = {line: el('line', {x1: box.l, x2: box.r, stroke: '#14283a', 'stroke-dasharray': '5 4', 'stroke-width': 1.3}, chart), dots: {}, labels: {},
        combo: el('text', {class: 'annot halo'}, chart)};
      KEYS.forEach(k => {
        marks.dots[k] = el('circle', {r: tall ? 9 : 7, fill: '#fff', stroke: INFO[k].color, 'stroke-width': 3.5}, chart);
        marks.labels[k] = el('text', {class: 'annot halo', fill: INFO[k].color}, chart);
      });
    }
    onDrag(chart, e => {
      const p = svgPoint(chart, e);
      if (!ysC || p.y < box.t - 10 || p.y > box.b + 10) return;
      setPlaying(false);
      st.a = clamp(Math.round(ysC.inv(p.y) * 100) / 100, 0.1, 1);
      update();
    });
    function moveMarks() {
      if (!marks) return;
      const y = ysC(st.a);
      marks.line.setAttribute('y1', y); marks.line.setAttribute('y2', y);
      const order = KEYS.map(k => ({k, x: xsC(M.cosmology(k).age(st.a))})).sort((p, q) => p.x - q.x);
      const atNow = st.a >= 0.97;                       // 현재 근처에서는 끝점 이름표가 대신한다
      const combined = st.a < 0.3;                      // 크기가 작을 때는 점이 몰려 있어 한 줄로 모아 쓴다
      const below = 22 + (small() ? 8 : 0);
      order.forEach((o, i) => {
        marks.dots[o.k].setAttribute('cx', o.x); marks.dots[o.k].setAttribute('cy', y);
        const lab = marks.labels[o.k];
        // 가운데 점의 이름표는 선 위, 양옆은 선 아래에
        lab.setAttribute('x', o.x);
        lab.setAttribute('y', y + (i === 1 ? -12 : below));
        lab.setAttribute('text-anchor', i === 0 ? 'end' : i === 2 ? 'start' : 'middle');
        lab.textContent = atNow || combined ? '' : `${M.MODELS[o.k].tag} ${fmtAge(M.cosmology(o.k).age(st.a))}`;
      });
      marks.combo.setAttribute('x', order[2].x + 14);
      marks.combo.setAttribute('y', y + below - 4);
      marks.combo.textContent = combined ? order.map(o => `${M.MODELS[o.k].tag} ${fmtAge(M.cosmology(o.k).age(st.a))}`).join(' · ') : '';
    }

    function insight() {
      const ready = KEYS.every(k => state(k).ready);
      const node = $('models-insight');
      if (!ready) { node.innerHTML = '세 우주를 계산하고 있습니다. 잠시만 기다려 주세요.'; return; }
      const v = {}, age = {};
      KEYS.forEach(k => { const s = state(k); age[k] = s.age; v[k] = voidsAt(k, s.r, nearestFrame(s.r, s.age)); });
      const size = `우주의 크기가 현재의 ${fmtPct(st.a)}일 때(가 ${fmtAge(age.accel)}, 나 ${fmtAge(age.open)}, 다 ${fmtAge(age.flat)})`;
      if (st.a < 0.3) {
        node.innerHTML = `${size}: 세 우주 모두 아직 밀도 차이가 작아 비슷해 보입니다. <b>가와 나는 물질의 양(30 %)이 같아</b> 이른 시기에는 똑같이 자랍니다. 다는 물질이 풍부해 처음부터 작은 덩어리가 더 많습니다.`;
        return;
      }
      const e = k => fmtPct(v[k].emptyFrac), d = k => Math.round(v[k].top5);
      if (st.a < 0.995) {
        node.innerHTML = `${size}: 가의 보이드는 빠르게 비어 갑니다(텅 빈 넓이 ${e('accel')}). 나는 무늬가 가와 같지만 <b>보이드가 더 느리게 비워집니다</b>(${e('open')}). 다는 작은 덩어리가 많이 생겨 보이드가 잘게 나뉩니다(보이드 크기 약 ${d('flat')} Mpc, 가는 ${d('accel')} Mpc). 슬라이더를 끝까지 밀어 현재를 비교해 보세요.`;
        return;
      }
      node.innerHTML = `<b>현재</b> — 가 우주: 필라멘트 주변으로 물질이 모이고 <b>큰 보이드</b>(약 ${d('accel')} Mpc)가 생겼습니다. 나 우주: 물질의 양이 같아 무늬는 비슷하지만, 감속 팽창으로 구조가 느리게 자라 <b>보이드가 덜 비었습니다</b>(텅 빈 넓이 ${e('open')}, 가는 ${e('accel')}). 다 우주: 물질이 풍부해 작은 덩어리가 많고 <b>보이드가 가장 작습니다</b>(약 ${d('flat')} Mpc). 적색 편이 탐사로 그린 실제 지도와 비교하면 가 모형이 관측과 가장 잘 맞습니다 — 이렇게 모의실험으로 우주 모형을 검증합니다.`;
    }

    function update() {
      slider.value = st.a;
      $('models-a-out').textContent = st.a >= 0.995 ? '100 % (현재)' : fmtPct(st.a);
      document.querySelectorAll('#models-quick [data-a]').forEach(b => b.setAttribute('aria-pressed', String(Math.abs(+b.dataset.a - st.a) < 0.005)));
      moveMarks();
      draw.soon();
    }
    Runs.onProgress(r => { if (current === 'models' && KEYS.some(k => run(k) === r)) draw.soon(); });
    return {
      enter() {
        KEYS.slice().reverse().forEach(k => Runs.need(run(k), true));   // 셋 모두 맨 앞으로(가 → 나 → 다 순서)
        buildChart(); update(); draw.now();
      },
      leave() { setPlaying(false); },
      resize() { buildChart(); update(); draw.now(); },
      pinned: () => KEYS.map(k => Runs.peek(k, 1, N)),
      prefetch() { KEYS.forEach(k => Runs.need(run(k), false)); }
    };
  })();

  // ── 입자 수(계산량) 바꾸기 ─────────────────────────────────────
  Runs.setPinned(() => [].concat(stations.grow.pinned(), stations.find.pinned(), stations.models.pinned()).filter(Boolean));
  document.querySelectorAll('[data-quality]').forEach(b => b.addEventListener('click', () => {
    const n = +b.dataset.quality;
    if (n === Q.N) return;
    Q.N = n;
    Runs.drop(r => r.N !== n && r.amp !== 1);          // 다른 입자 수로 하던 01 계산은 멈춘다(03 비교용은 그대로)
    document.querySelectorAll('[data-quality]').forEach(x => x.setAttribute('aria-pressed', String(+x.dataset.quality === n)));
    stations.grow.quality(); stations.find.quality();
    stations[current].enter();
  }));

  // 첫 화면
  const start = HASH[(location.hash || '').slice(1)] || 'grow';
  show(start);
  // 첫 실험 계산이 끝나면 03 비교에 쓸 나머지 우주도 미리 계산해 둔다
  Runs.onProgress(r => { if (r.done && r.model === 'accel' && r.amp === 1) stations.models.prefetch(); });
  let resizeTimer;
  window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => stations[current].resize(), 150); });
  window.addEventListener('hashchange', () => { const h = HASH[location.hash.slice(1)]; if (h && h !== current) show(h); });
  if (reduceMotion) document.documentElement.classList.add('reduce-motion');
})();
