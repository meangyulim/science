/* 캠퍼스 지진 — 원리 가이드.
   학생 폰에서 열어 보는 '진앙 찾기' 설명서. 네 장으로 되어 있다.
     ① PS시와 거리   P파·S파 달리기, 주시 곡선, k = Vp·Vs/(Vp−Vs)
     ② 원 세 개      관측소 1·2·3개일 때와 진원이 깊을 때(공통현)
     ③ 배치 연습     관측소 셋과 진앙을 끌어 보며 추정 오차가 어떻게 바뀌는지
     ④ 우리 모둠     지금 우리 모둠의 실제 배치 점검과 '언제 무엇을' 순서
   계산은 quake-model.js(window.QuakeModel)를 쓴다.
   QuakeGuide.open({scale, tab, team}) — team 은 지금 우리 모둠을 돌려주는 함수(없으면 ④의 실시간 점검은 빠진다). */
(() => {
  'use strict';
  const M = window.QuakeModel, NS = 'http://www.w3.org/2000/svg';
  const P = '#1f6feb', S = '#e03131', EPI = '#e8590c', INK = '#14283a';

  function el(tag, attrs, parent, text) {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs || {}) if (attrs[k] !== undefined && attrs[k] !== null) n.setAttribute(k, attrs[k]);
    if (text !== undefined) n.textContent = text;
    if (parent) parent.appendChild(n);
    return n;
  }
  const clear = n => { while (n.firstChild) n.removeChild(n.firstChild); };
  const num = (v, d = 1) => (v < 0 && +Math.abs(v).toFixed(d) !== 0 ? '−' : '') + Math.abs(v).toFixed(d);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const star = (x, y, r1, r2) => {
    const pts = [];
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? r2 : r1; pts.push((x + r * Math.cos(a)).toFixed(1) + ',' + (y + r * Math.sin(a)).toFixed(1)); }
    return pts.join(' ');
  };

  const TABS = [
    {id: 'ps', label: '① PS시와 거리'},
    {id: 'circles', label: '② 원 세 개'},
    {id: 'practice', label: '③ 배치 연습'},
    {id: 'team', label: '④ 우리 모둠'}
  ];

  let root = null, G = null;
  const stopAll = () => { if (!G) return; G.stops.forEach(f => f()); G.stops = []; };

  function open(ctx = {}) {
    close();
    const sc = M.scaleOf(ctx.scale);
    G = {ctx, sc, k: M.omori(sc), stops: []};
    root = document.createElement('div');
    root.className = 'guide';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', '진앙 찾기 원리 가이드');
    root.innerHTML = `<div class="guide-sheet">
      <header class="guide-head">
        <div><p class="eyebrow">원리 가이드</p><h2>진앙은 어떻게 찾을까?</h2></div>
        <button class="guide-x" aria-label="가이드 닫기">✕</button>
      </header>
      <nav class="guide-tabs" role="tablist">${TABS.map(t => `<button role="tab" data-gtab="${t.id}" aria-selected="false">${t.label}</button>`).join('')}</nav>
      <div class="guide-body"></div>
    </div>`;
    document.body.appendChild(root);
    root.querySelector('.guide-x').onclick = close;
    root.addEventListener('click', e => { if (e.target === root) close(); });
    for (const b of root.querySelectorAll('[data-gtab]')) b.onclick = () => show(b.dataset.gtab);
    document.addEventListener('keydown', onKey);
    show(ctx.tab || 'ps');
  }
  function onKey(e) { if (e.key === 'Escape') close(); }
  function close() {
    stopAll();
    if (root) root.remove();
    root = null;
    document.removeEventListener('keydown', onKey);
  }

  function show(id) {
    stopAll();
    for (const b of root.querySelectorAll('[data-gtab]')) b.setAttribute('aria-selected', String(b.dataset.gtab === id));
    const body = root.querySelector('.guide-body');
    body.scrollTop = 0;
    ({ps: tabPS, circles: tabCircles, practice: tabPractice, team: tabTeam})[id](body);
  }
  const loop = fn => {
    let raf = 0, on = true;
    const step = t => { if (!on) return; fn(t); raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    G.stops.push(() => { on = false; cancelAnimationFrame(raf); });
  };

  // ── ① PS시와 거리 ────────────────────────────────────────────
  function tabPS(body) {
    const {sc, k} = G, dMax = sc.id === 'two' ? 300 : 150;
    body.innerHTML = `
      <p class="g-lead">지진이 나면 진원에서 <b class="p">P파</b>와 <b class="s">S파</b>가 <u>동시에</u> 출발해요.
        P파가 더 빨라서 먼저 도착하고, <b>멀리 갈수록 S파가 점점 더 뒤처집니다.</b> 이 뒤처진 시간이 <b>PS시</b>예요.</p>
      <svg class="g-svg" id="g-race" viewBox="0 0 360 132" role="img" aria-label="P파와 S파의 달리기"></svg>
      <div class="g-row">
        <label class="g-range">진원 거리 <b id="g-dval"></b>
          <input type="range" id="g-dist" min="10" max="${dMax}" step="1" value="${Math.round(dMax * 0.4)}">
        </label>
        <button class="g-btn" id="g-play">▶ 출발 (4배속)</button>
      </div>
      <div class="g-cards">
        <div><small>P파 도착</small><b class="p" id="g-tp"></b></div>
        <div><small>S파 도착</small><b class="s" id="g-ts"></b></div>
        <div><small>PS시 (S − P)</small><b id="g-tps"></b></div>
      </div>
      <h3 class="g-h">거리가 2배면 PS시도 2배 — 주시 곡선</h3>
      <svg class="g-svg" id="g-tt" viewBox="0 0 360 210" role="img" aria-label="주시 곡선"></svg>
      <div class="g-formula">
        <p>P파 속력 V<sub>P</sub> = ${sc.vp} m/s, S파 속력 V<sub>S</sub> = ${sc.vs} m/s (이 운동장의 축소 지구)</p>
        <p class="eq">PS시 = d/V<sub>S</sub> − d/V<sub>P</sub> = d × (V<sub>P</sub> − V<sub>S</sub>) / (V<sub>P</sub>·V<sub>S</sub>)</p>
        <p class="eq big">⇒ d = k × PS시, &nbsp;k = V<sub>P</sub>·V<sub>S</sub> / (V<sub>P</sub> − V<sub>S</sub>) = ${num(k, 1)} m/s</p>
        <p>PS시가 1초 늘 때마다 진원이 ${num(k, 1)} m 더 멀어요. 실제 지구에서는 k가 약 7~8 km/s라서, PS시 10초면 진원은 약 75 km 떨어져 있어요.</p>
      </div>
      <ul class="g-tips">
        <li>판독을 0.1초 틀리면 거리는 ${num(k, 1)} × 0.1 = <b>${num(k * 0.1, 2)} m</b> 틀려요. P파가 <b>처음</b> 떨리기 시작한 순간을 정확히 찍는 게 핵심!</li>
        <li>PS시는 진원까지의 <b>거리</b>만 알려 줘요. <b>방향</b>은 모릅니다. 그래서 관측소가 여러 곳 필요해요 → ②</li>
      </ul>`;
    const race = body.querySelector('#g-race'), tt = body.querySelector('#g-tt'), slider = body.querySelector('#g-dist');
    let d = +slider.value, t0 = null;
    const SPEED = 4;
    const X0 = 34, X1 = 326;
    function drawRace(t) {
      clear(race);
      const tp = d / sc.vp, ts = d / sc.vs;
      el('line', {x1: X0, x2: X1, y1: 48, y2: 48, stroke: '#dbe3e6', 'stroke-width': 8, 'stroke-linecap': 'round'}, race);
      el('line', {x1: X0, x2: X1, y1: 92, y2: 92, stroke: '#dbe3e6', 'stroke-width': 8, 'stroke-linecap': 'round'}, race);
      el('polygon', {points: star(X0 - 14, 70, 11, 5), fill: EPI}, race);
      el('text', {x: X0 - 14, y: 124, 'text-anchor': 'middle', class: 'g-t'}, race, '진원');
      el('path', {d: `M${X1 + 12} 58 l11 20 h-22 z`, fill: INK}, race);
      el('text', {x: X1 + 12, y: 124, 'text-anchor': 'end', class: 'g-t'}, race, `관측소 (${d} m)`);
      const at = t == null ? null : t;
      const pos = (v, tArr) => X0 + (X1 - X0) * clamp(at == null ? 0 : (v * at) / d, 0, 1);
      const px = pos(sc.vp, tp), sx = pos(sc.vs, ts);
      el('circle', {cx: px, cy: 48, r: 9, fill: P}, race);
      el('text', {x: px, y: 52, 'text-anchor': 'middle', class: 'g-dot'}, race, 'P');
      el('circle', {cx: sx, cy: 92, r: 9, fill: S}, race);
      el('text', {x: sx, y: 96, 'text-anchor': 'middle', class: 'g-dot'}, race, 'S');
      const clock = at == null ? '출발 전' : `t = ${num(Math.min(at, ts + 1), 1)} s`;
      el('text', {x: 180, y: 20, 'text-anchor': 'middle', class: 'g-clock'}, race, clock);
      if (at != null && at >= tp) el('text', {x: X1 - 4, y: 34, 'text-anchor': 'end', class: 'g-arr', fill: P}, race, `P 도착 ${num(tp, 1)} s`);
      if (at != null && at >= ts) el('text', {x: X1 - 4, y: 118, 'text-anchor': 'end', class: 'g-arr', fill: S}, race, `S 도착 ${num(ts, 1)} s → PS시 ${num(ts - tp, 1)} s`);
    }
    function drawTT() {
      clear(tt);
      const W = 360, H = 210, L = 44, R = 14, T = 12, B = 34;
      const tMax = dMax / sc.vs * 1.02, X = v => L + v / dMax * (W - L - R), Y = t => H - B - t / tMax * (H - T - B);
      el('path', {d: `M${L} ${T}V${H - B}H${W - R}`, fill: 'none', stroke: '#9aa8b1'}, tt);
      const xs = dMax > 200 ? 100 : 50, ts = tMax > 60 ? 20 : 10;
      for (let v = xs; v <= dMax; v += xs) el('text', {x: X(v), y: H - B + 15, 'text-anchor': 'middle', class: 'g-ax'}, tt, v);
      for (let t = ts; t < tMax - ts * 0.4; t += ts) el('text', {x: L - 6, y: Y(t) + 3, 'text-anchor': 'end', class: 'g-ax'}, tt, t);
      el('text', {x: W - R, y: H - 4, 'text-anchor': 'end', class: 'g-ax'}, tt, '진원 거리 d (m)');
      el('text', {x: L + 6, y: T + 8, class: 'g-ax'}, tt, '도착 시각 (s)');
      el('line', {x1: X(0), y1: Y(0), x2: X(dMax), y2: Y(dMax / sc.vp), stroke: P, 'stroke-width': 2.5}, tt);
      el('line', {x1: X(0), y1: Y(0), x2: X(dMax), y2: Y(dMax / sc.vs), stroke: S, 'stroke-width': 2.5}, tt);
      el('text', {x: X(dMax) - 2, y: Y(dMax / sc.vp) - 6, 'text-anchor': 'end', fill: P, class: 'g-lbl'}, tt, 'P파');
      el('text', {x: X(dMax * 0.82), y: Y(dMax * 0.82 / sc.vs) - 8, 'text-anchor': 'end', fill: S, class: 'g-lbl'}, tt, 'S파');
      const x = X(d), yp = Y(d / sc.vp), ys = Y(d / sc.vs);
      el('line', {x1: x, x2: x, y1: H - B, y2: ys, stroke: INK, 'stroke-dasharray': '3 3', 'stroke-opacity': 0.4}, tt);
      el('line', {x1: x, x2: x, y1: yp, y2: ys, stroke: INK, 'stroke-width': 3}, tt);
      el('circle', {cx: x, cy: yp, r: 4.5, fill: P}, tt);
      el('circle', {cx: x, cy: ys, r: 4.5, fill: S}, tt);
      el('text', {x: x + (x > 260 ? -8 : 8), y: (yp + ys) / 2 + 4, 'text-anchor': x > 260 ? 'end' : 'start', class: 'g-lbl', fill: INK}, tt, `PS시 ${num(d / sc.vs - d / sc.vp, 1)} s`);
    }
    function readout() {
      body.querySelector('#g-dval').textContent = d + ' m';
      body.querySelector('#g-tp').textContent = num(d / sc.vp, 1) + ' s';
      body.querySelector('#g-ts').textContent = num(d / sc.vs, 1) + ' s';
      body.querySelector('#g-tps').textContent = num(d / sc.vs - d / sc.vp, 1) + ' s';
    }
    slider.oninput = () => { d = +slider.value; t0 = null; readout(); drawRace(null); drawTT(); };
    body.querySelector('#g-play').onclick = () => { t0 = performance.now(); };
    readout(); drawTT(); drawRace(null);
    loop(now => {
      if (t0 == null) return;
      const t = (now - t0) / 1000 * SPEED;
      drawRace(t);
      if (t > d / sc.vs + 1.5) t0 = null;
    });
  }

  // 운동장 그림: 1 m = s px, 가운데가 (0, 0), 북쪽이 위
  function fieldView(svg, s, cx = 180, cy = 130) {
    const X = p => cx + p.x * s, Y = p => cy - p.y * s;
    const world = (px, py) => ({x: (px - cx) / s, y: (cy - py) / s});
    // 화면 좌표 → 그림 좌표는 브라우저의 변환 행렬로 (그림이 어떤 크기로 그려져도 맞게)
    const pt = e => {
      const m = svg.getScreenCTM(), q = svg.createSVGPoint();
      q.x = e.clientX; q.y = e.clientY;
      const r = m ? q.matrixTransform(m.inverse()) : q;
      return world(r.x, r.y);
    };
    return {X, Y, s, pt};
  }
  function drawField(svg, v, w = 100, h = 60) {
    el('rect', {x: v.X({x: -w / 2}), y: v.Y({y: h / 2}), width: w * v.s, height: h * v.s, rx: 14, fill: '#eef3ea', stroke: '#cfdcc8'}, svg);
    el('text', {x: v.X({x: -w / 2}) + 8, y: v.Y({y: h / 2}) + 15, class: 'g-ax'}, svg, `운동장 ${w}×${h} m`);
  }
  function station(svg, v, p, label, color = INK) {
    const x = v.X(p), y = v.Y(p);
    el('path', {d: `M${x} ${y - 10} l9 16 h-18 z`, fill: color, stroke: '#fff', 'stroke-width': 2}, svg);
    if (label) el('text', {x, y: y + 20, 'text-anchor': 'middle', class: 'g-lbl', fill: INK}, svg, label);
  }

  // ── ② 원 세 개 ───────────────────────────────────────────────
  function tabCircles(body) {
    body.innerHTML = `
      <p class="g-lead">관측소 한 곳의 PS시로 알 수 있는 건 <b>진원까지의 거리</b>뿐이에요. 그래서 관측소마다 그 거리를 반지름으로 원을 그려요.</p>
      <div class="g-seg" role="group" aria-label="관측소 수">
        <button data-n="1" aria-pressed="false">관측소 1곳</button>
        <button data-n="2" aria-pressed="false">2곳</button>
        <button data-n="3" aria-pressed="true">3곳</button>
        <button data-n="deep" aria-pressed="false">진원이 깊으면</button>
      </div>
      <svg class="g-svg" id="g-circ" viewBox="0 0 360 260" role="img" aria-label="관측소와 진앙"></svg>
      <p class="g-cap" id="g-cap"></p>
      <ul class="g-tips">
        <li><b>진앙</b>: 진원 바로 위 땅의 점. <b>진원</b>: 땅속에서 지진이 처음 시작된 곳.</li>
        <li>원이 정확히 한 점에서 만나지 않는 건 판독·GPS 오차 때문이에요. 그럴 땐 <b>원이 가장 많이 겹치는 가운데</b>가 진앙일 가능성이 커요.</li>
      </ul>`;
    const svg = body.querySelector('#g-circ'), v = fieldView(svg, 2.3);
    const st = [{x: -36, y: -14, n: 'A'}, {x: 34, y: -22, n: 'B'}, {x: 6, y: 30, n: 'C'}], epi = {x: 6, y: -4};
    const CAP = {
      1: '관측소 A 한 곳만 있으면, 진앙은 <b>이 원 위 어딘가</b>예요. 방향을 몰라서 한 점으로 정할 수 없어요.',
      2: 'B의 원을 더하면 두 원은 <b>두 점(?)</b>에서 만나요. 진앙은 둘 중 하나인데, 아직 어느 쪽인지 몰라요.',
      3: 'C의 원이 둘 중 하나를 골라 줘요. <b>세 원이 함께 지나는 한 점 = 진앙(★)</b>. 그래서 관측소는 적어도 3곳이 필요해요.',
      deep: '진원이 땅속 깊이 있으면 진원 거리가 진앙 거리보다 길어서, 원들이 한 점에서 만나지 않고 <b>서로 겹쳐요</b>. 두 원이 겹친 곳을 잇는 선(<b>공통현</b>, 점선) 세 개가 만나는 점이 진앙이고, 진원 깊이 = √(진원 거리² − 진앙 거리²)로 구해요.'
    };
    function draw(n) {
      clear(svg);
      drawField(svg, v);
      const deep = n === 'deep', depth = deep ? 22 : 0, count = deep ? 3 : +n;
      const cs = st.map(s => ({x: s.x, y: s.y, r: Math.hypot(M.dist(s, epi), depth)}));
      cs.slice(0, count).forEach((c, i) => el('circle', {cx: v.X(c), cy: v.Y(c), r: c.r * v.s, fill: 'none', stroke: ['#0b7f9a', '#8e4ec6', '#d6409f'][i], 'stroke-width': 2.2}, svg));
      if (count === 2) {
        for (const q of M.chord(cs[0], cs[1]) || []) {
          el('circle', {cx: v.X(q), cy: v.Y(q), r: 9, fill: '#fff', stroke: INK, 'stroke-width': 2}, svg);
          el('text', {x: v.X(q), y: v.Y(q) + 4, 'text-anchor': 'middle', class: 'g-lbl', fill: INK}, svg, '?');
        }
      }
      if (deep) {
        for (const [a, b] of [[0, 1], [1, 2], [0, 2]]) {
          const ch = M.chord(cs[a], cs[b]);
          if (ch) el('line', {x1: v.X(ch[0]), y1: v.Y(ch[0]), x2: v.X(ch[1]), y2: v.Y(ch[1]), stroke: INK, 'stroke-width': 2, 'stroke-dasharray': '5 4'}, svg);
        }
        const rc = M.radicalCenter(cs[0], cs[1], cs[2]);
        el('text', {x: 350, y: 250, 'text-anchor': 'end', class: 'g-lbl', fill: EPI}, svg, `구한 진원 깊이 ${num(rc.depth, 0)} m`);
      }
      if (count >= 3) el('polygon', {points: star(v.X(epi), v.Y(epi), 11, 5), fill: EPI, stroke: '#fff', 'stroke-width': 1.5}, svg);
      st.forEach((s, i) => station(svg, v, s, s.n, i < count ? INK : '#b8c2c8'));
      body.querySelector('#g-cap').innerHTML = CAP[n];
      for (const b of body.querySelectorAll('[data-n]')) b.setAttribute('aria-pressed', String(b.dataset.n === String(n)));
    }
    for (const b of body.querySelectorAll('[data-n]')) b.onclick = () => draw(b.dataset.n === 'deep' ? 'deep' : +b.dataset.n);
    draw(3);
  }

  // ── ③ 배치 연습 ──────────────────────────────────────────────
  const PRESETS = {
    good: {name: '둘러싸기 👍', st: [{x: -32, y: -18}, {x: 30, y: -20}, {x: 2, y: 24}], epi: {x: 2, y: -2}},
    clump: {name: '한곳에 몰림 👎', st: [{x: 30, y: 18}, {x: 36, y: 14}, {x: 34, y: 22}], epi: {x: -18, y: -8}},
    line: {name: '한 줄 👎', st: [{x: -40, y: 4}, {x: 0, y: 6}, {x: 40, y: 4}], epi: {x: 4, y: -12}},
    side: {name: '한쪽에 치우침', st: [{x: 18, y: -24}, {x: 42, y: 2}, {x: 20, y: 24}], epi: {x: -32, y: 0}}
  };
  function advice(f, names) {
    const nm = p => (p && p.name) || '한 사람';
    if (f.level === 'few') return ['bad', `위치가 잡힌 모둠원이 ${f.n}명이에요. 원이 <b>3개</b>는 있어야 한 점이 정해져요. 모둠원이 모두 관측소를 열었는지 확인하세요.`];
    if (f.level === 'close') return ['bad', `<b>${esc(nm(f.minPair.a))}</b>와(과) <b>${esc(nm(f.minPair.b))}</b>가 ${num(f.minPair.d, 0)} m밖에 안 떨어져 있어요. 원이 거의 겹쳐서 하나 마나예요. <b>20 m 이상</b> 벌리세요.`];
    if (f.level === 'line') return ['bad', '거의 <b>한 줄</b>로 서 있어요. 한 줄이면 원들이 줄의 양쪽 두 곳에서 비슷하게 만나 어느 쪽인지 헷갈려요. <b>한 명이 줄 밖으로 나가 삼각형</b>을 만드세요.'];
    if (f.level === 'narrow') return ['ok', `너무 좁게 모여 있어요(가장 먼 두 사람이 ${num(f.span, 0)} m). <b>30 m 이상</b> 넓게 벌려 큰 삼각형을 만드세요.`];
    return ['good', '좋아요! <b>넓은 삼각형</b>이에요. 지진이 나면 이 자리에서 움직이지 마세요.'];
  }
  function tabPractice(body) {
    const {k} = G, sigma = Math.hypot(0.15 * k, 2.5);
    body.innerHTML = `
      <p class="g-lead">관측소(▲)와 진앙(★)을 <b>손가락으로 끌어</b> 보세요. 파란 점은 판독(±0.15 s)과 GPS(±2.5 m)가 조금씩 틀렸을 때 추정한 진앙 50개예요. <b>점이 작게 모일수록 정확</b>하고, 두 덩어리로 갈라지면 어느 쪽인지 헷갈린다는 뜻이에요.</p>
      <div class="g-seg wrap" role="group" aria-label="배치 예시">${Object.entries(PRESETS).map(([id, p]) => `<button data-pre="${id}">${p.name}</button>`).join('')}</div>
      <svg class="g-svg drag" id="g-prac" viewBox="0 0 360 260" role="img" aria-label="관측소 배치 연습"></svg>
      <div class="g-score" id="g-score"></div>
      <h3 class="g-h">좋은 배치의 세 가지 조건</h3>
      <ol class="g-rules">
        <li><b>서로 멀리</b> — 20 m 이상. 가까우면 원이 거의 같아져서 정보가 하나뿐인 셈이에요.</li>
        <li><b>한 줄은 안 돼요</b> — 삼각형으로. 한 줄이면 줄 양쪽의 두 점이 비슷하게 맞아요.</li>
        <li><b>진앙을 둘러싸기</b> — 진앙이 삼각형 안에 있을 때 가장 정확해요. 진앙이 어디일지 모르니, <b>모둠원이 운동장을 넓게 나눠 맡는 것</b>이 가장 좋은 전략이에요.</li>
      </ol>`;
    const svg = body.querySelector('#g-prac'), v = fieldView(svg, 2.6);
    let st = PRESETS.good.st.map(p => Object.assign({}, p)), epi = Object.assign({}, PRESETS.good.epi), drag = null, dirty = true;
    const names = ['A', 'B', 'C'];
    function draw() {
      clear(svg);
      drawField(svg, v);
      const pts = st.map((p, i) => ({x: p.x, y: p.y, name: names[i]}));
      el('polygon', {points: pts.map(p => v.X(p) + ',' + v.Y(p)).join(' '), fill: '#0b7f9a', 'fill-opacity': 0.08, stroke: '#0b7f9a', 'stroke-dasharray': '5 4'}, svg);
      for (const p of st) el('circle', {cx: v.X(p), cy: v.Y(p), r: M.dist(p, epi) * v.s, fill: 'none', stroke: '#8a96a3', 'stroke-opacity': 0.45}, svg);
      // 매번 운동장 전체를 다시 찾게 해서, 한 줄일 때 반대편 '거울상' 점으로 튀는 것까지 보이게 한다
      const cloud = M.errorCloud(st, epi, sigma, M.rng(7), 50, true);
      for (const q of cloud.pts) el('circle', {cx: v.X(q), cy: v.Y(q), r: 2.2, fill: P, 'fill-opacity': 0.45}, svg);
      el('polygon', {points: star(v.X(epi), v.Y(epi), 11, 5), fill: EPI, stroke: '#fff', 'stroke-width': 1.5}, svg);
      st.forEach((p, i) => station(svg, v, p, names[i], '#0b7f9a'));
      const f = M.formation(pts), [lvl, txt] = advice(f), rms = cloud.rms;
      // 판독·GPS 오차(sigma) 몇 배만큼 흩어지는지로 등급을 매긴다
      const grade = rms < 1.6 * sigma ? ['good', '아주 정확'] : rms < 3 * sigma ? ['ok', '그럭저럭'] : ['bad', '많이 흔들림'];
      body.querySelector('#g-score').innerHTML = `<div class="g-pill ${grade[0]}">추정 오차 약 ±${num(rms, 1)} m · ${grade[1]}</div><p class="g-adv ${lvl}">${txt}</p>`;
    }
    const handles = () => [...st.map((p, i) => ({p, i})), {p: epi, i: 'epi'}];
    svg.addEventListener('pointerdown', e => {
      const w = v.pt(e);
      const near = handles().map(h => ({h, d: M.dist(h.p, w)})).sort((a, b) => a.d - b.d)[0];
      if (near && near.d * v.s < 26) { drag = near.h; svg.setPointerCapture(e.pointerId); e.preventDefault(); }
    });
    svg.addEventListener('pointermove', e => {
      if (!drag) return;
      const w = v.pt(e);
      drag.p.x = clamp(w.x, -66, 66); drag.p.y = clamp(w.y, -48, 48);
      dirty = true;
    });
    const up = () => { drag = null; };
    svg.addEventListener('pointerup', up);
    svg.addEventListener('pointercancel', up);
    for (const b of body.querySelectorAll('[data-pre]')) b.onclick = () => {
      const p = PRESETS[b.dataset.pre];
      st = p.st.map(q => Object.assign({}, q)); epi = Object.assign({}, p.epi); dirty = true;
    };
    loop(() => { if (dirty) { dirty = false; draw(); } });
  }

  // ── ④ 우리 모둠 ──────────────────────────────────────────────
  function tabTeam(body) {
    const live = typeof G.ctx.team === 'function';
    body.innerHTML = `
      ${live ? `<h3 class="g-h" style="margin-top:0">지금 우리 모둠 배치</h3>
      <svg class="g-svg" id="g-team" viewBox="0 0 360 240" role="img" aria-label="우리 모둠 배치"></svg>
      <div id="g-team-adv"></div>` : `<p class="g-lead">방에 들어가 관측소를 열면, 여기서 <b>우리 모둠의 실제 위치</b>로 배치를 점검해 줘요.</p>`}
      <h3 class="g-h">언제 무엇을 할까?</h3>
      <ol class="g-steps">
        <li><b>지진 전 · 관측망 깔기</b><span>모둠원끼리 <b>20 m 이상</b> 떨어져 <b>삼각형</b>으로 서세요. 지도에는 <b>우리 모둠원만</b> 보이니, 💬 모둠 대화로 누가 어디로 갈지 정하세요. 운동장을 넓게 나눠 맡을수록 지진이 어디서 나도 진앙을 둘러쌀 수 있어요.</span></li>
        <li><b>지진 중 · 멈추기</b><span>흔들림이 끝날 때까지 <b>움직이지 마세요</b>. 원의 중심은 '지진이 났을 때 내가 서 있던 자리'예요.</span></li>
        <li><b>판독 · 내 원 그리기</b><span>P파가 <b>처음</b> 떨리는 순간과 S파가 크게 흔들리기 시작하는 순간을 찍어요. 진원 거리 = ${num(G.k, 1)} × PS시.</span></li>
        <li><b>모둠 회의 · 교점 찾기</b><span>지도에는 <b>우리 모둠 원만</b> 그려져요. 원 3개가 만나는 점을 💬 모둠 대화로 의논해 정하세요. 원이 2개뿐이면 교점이 두 개로 남으니, 모둠은 <b>3명 이상</b>이어야 해요.</span></li>
        <li><b>레이스 · 그 자리로!</b><span>원이 딱 한 점에서 안 만나면 <b>가장 많은 원이 겹치는 가운데</b>로 가서 "여기가 진앙!"을 누르세요.</span></li>
      </ol>`;
    if (!live) return;
    const svg = body.querySelector('#g-team'), advBox = body.querySelector('#g-team-adv');
    let last = 0;
    loop(now => {
      if (now - last < 1000) return;
      last = now;
      const t = G.ctx.team();
      clear(svg);
      if (!t || !t.members.length) { advBox.innerHTML = '<p class="g-adv bad">아직 내 위치가 없어요. GPS가 잡히면 보여 줄게요.</p>'; return; }
      const ms = t.members;
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const p of ms) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
      const s = Math.min(300 / Math.max(x1 - x0, 40), 170 / Math.max(y1 - y0, 40), 8);
      const v = fieldView(svg, s, 180 - (x0 + x1) / 2 * s, 120 + (y0 + y1) / 2 * s);
      // 10 m 격자
      for (let gx = Math.floor((x0 - 60) / 10) * 10; gx <= x1 + 60; gx += 10) el('line', {x1: v.X({x: gx}), x2: v.X({x: gx}), y1: 0, y2: 240, stroke: '#eef2f3'}, svg);
      for (let gy = Math.floor((y0 - 60) / 10) * 10; gy <= y1 + 60; gy += 10) el('line', {y1: v.Y({y: gy}), y2: v.Y({y: gy}), x1: 0, x2: 360, stroke: '#eef2f3'}, svg);
      if (ms.length >= 3) el('polygon', {points: M.hull(ms).map(p => v.X(p) + ',' + v.Y(p)).join(' '), fill: t.color, 'fill-opacity': 0.12, stroke: t.color, 'stroke-width': 2, 'stroke-dasharray': '6 4'}, svg);
      for (let i = 0; i < ms.length; i++) for (let j = i + 1; j < ms.length; j++) {
        const a = ms[i], b = ms[j], mx = (v.X(a) + v.X(b)) / 2, my = (v.Y(a) + v.Y(b)) / 2;
        el('line', {x1: v.X(a), y1: v.Y(a), x2: v.X(b), y2: v.Y(b), stroke: t.color, 'stroke-opacity': 0.35}, svg);
        el('text', {x: mx, y: my - 3, 'text-anchor': 'middle', class: 'g-ax'}, svg, `${num(M.dist(a, b), 0)} m`);
      }
      for (const p of ms) {
        el('circle', {cx: v.X(p), cy: v.Y(p), r: p.me ? 9 : 7, fill: p.me ? P : t.color, stroke: '#fff', 'stroke-width': 2.5}, svg);
        el('text', {x: v.X(p), y: v.Y(p) - 13, 'text-anchor': 'middle', class: 'g-lbl', fill: INK}, svg, p.me ? '나' : p.name);
      }
      el('text', {x: 8, y: 232, class: 'g-ax'}, svg, `${t.name} · 격자 10 m`);
      const [lvl, txt] = advice(M.formation(ms));
      advBox.innerHTML = `<p class="g-adv ${lvl}">${txt}</p>`;
    });
  }

  window.QuakeGuide = {open, close, advice: (f) => advice(f)};
})();
