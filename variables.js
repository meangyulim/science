/* 변광성 실험실 — 네 실험이 같은 모형(variables-model.js)을 쓴다. */
(() => {
  'use strict';
  const M = window.VariableModel, $ = id => document.getElementById(id);
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
  // 휴대폰에서는 그래프가 작게 줄어드므로 점과 손잡이를 키운다.
  const small = () => window.innerWidth < 640;
  const decimals = step => Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
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
  function sig(v, n = 3) {
    if (v >= 10 ** n) return Math.round(v).toLocaleString('ko-KR');
    return (+v.toPrecision(n)).toLocaleString('ko-KR', {maximumFractionDigits: 3});
  }
  function fmtPc(r) {
    if (r < 1000) return `${sig(r)} pc`;
    if (r < 1e6) return `${sig(r / 1e3)} kpc`;
    return `${sig(r / 1e6)} Mpc`;
  }
  function fmtLy(r) {
    const ly = r * M.PC_TO_LY;
    if (ly >= 1e8) return `약 ${sig(ly / 1e8, 2)}억 광년`;
    if (ly >= 1e4) return `약 ${sig(ly / 1e4, 2)}만 광년`;
    return `약 ${sig(ly, 2)}광년`;
  }
  const fmtDays = d => d < 2 ? `${num(d, 2)}일 (${num(d * 24, 1)}시간)` : `${num(d, d < 20 ? 1 : 0)}일`;
  function setPressed(container, attr, value) {
    container.querySelectorAll(`[${attr}]`).forEach(b => b.setAttribute('aria-pressed', String(b.getAttribute(attr) === value)));
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
  const numTicks = (lo, hi, n, d) => ticks(lo, hi, n).map(v => ({v, label: num(v, d === undefined ? decimals(niceStep(Math.abs(hi - lo), n)) : d)}));

  // 두 개의 시간 커서(A·B). 누른 곳에서 가까운 커서가 따라온다.
  // snapRange(시간 단위) 안으로 극대 근처에 놓으면 자석처럼 극대에 붙는다 — 손가락으로도 얼추 맞추면 된다.
  function cursorPair(xs, box, getSnaps, snapRange) {
    const st = {a: 0, b: 0, grab: null, snapped: {a: false, b: false}};
    st.handle = (p, phase) => {
      if (phase === 'end') { st.grab = null; return false; }
      if (p.x < box.l - 10 || p.x > box.r + 10) return false;
      let t = xs.inv(Math.max(box.l, Math.min(box.r, p.x)));
      if (phase === 'start') st.grab = Math.abs(t - st.a) <= Math.abs(t - st.b) ? 'a' : 'b';
      const snaps = getSnaps ? getSnaps() : [];
      const tol = snapRange ? snapRange() : Math.abs(xs.inv(box.l + 14) - xs.inv(box.l));
      let best = null;
      for (const s of snaps) if (Math.abs(s - t) < tol && (best === null || Math.abs(s - t) < Math.abs(best - t))) best = s;
      st.snapped[st.grab] = best !== null;
      st[st.grab] = best !== null ? best : t;
      return true;
    };
    st.draw = (svg, color) => {
      const g = el('g', {}, svg), xa = xs(st.a), xb = xs(st.b);
      el('rect', {x: Math.min(xa, xb), y: box.t, width: Math.abs(xb - xa), height: box.b - box.t, fill: color, opacity: 0.07}, g);
      const k = small() ? 1.5 : 1;
      [['A', xa, st.snapped.a], ['B', xb, st.snapped.b]].forEach(([n, x, on]) => {
        const c = on ? '#0b7f9a' : color;   // 극대에 붙으면 청록색
        el('line', {x1: x, x2: x, y1: box.t - 4, y2: box.b, stroke: c, 'stroke-width': 2 * k}, g);
        el('rect', {x: x - 11 * k, y: box.t - 4 - 20 * k, width: 22 * k, height: 19 * k, rx: 5, fill: c}, g);
        el('text', {x, y: box.t - 4 - 6 * k, 'text-anchor': 'middle', fill: '#fff', 'font-size': 12 * k, 'font-weight': 800}, g, n);
      });
      const y = box.t + 12, l = Math.min(xa, xb), r = Math.max(xa, xb);
      if (r - l > 30) {
        el('path', {d: `M${l + 3} ${y}H${r - 3}M${l + 9} ${y - 5}L${l + 3} ${y}L${l + 9} ${y + 5}M${r - 9} ${y - 5}L${r - 3} ${y}L${r - 9} ${y + 5}`, stroke: color, fill: 'none', 'stroke-width': 1.5}, g);
      }
    };
    return st;
  }

  // ── 실험 전환 ─────────────────────────────────────────────
  const stations = {};
  let current = 'read';
  function show(name) {
    if (!stations[name]) name = 'read';
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

  // ═══════════════ 01 광도 곡선 읽기 ═══════════════
  stations.read = (() => {
    const KINDS = ['rr', 'cepheid', 'mira', 'nova', 'sn'];
    const SHORT = {rr: 'RR형', cepheid: '세페이드', mira: '장주기', nova: '신성', sn: '초신성'};
    const REF = {
      rr: ['1일보다 짧다', '1등급 이내', '주기와 관계없이 광도가 거의 일정 → 구상 성단까지의 거리'],
      cepheid: ['수 일 ~ 100일', '0.1 ~ 2.5등급', '주기가 길수록 광도가 크다 → 거리 측정'],
      mira: ['100일 이상', '2등급 이상', '긴 주기로 큰 밝기 변화'],
      nova: ['반복되지 않음', '7 ~ 16등급', '1~2일 만에 밝아졌다가 수일 안에 감소'],
      sn: ['반복되지 않음', '20등급 이상', '최대 밝기를 10일 이상 유지 · Ia형은 표준 광원']
    };
    const st = {kind: 'cepheid', axis: 'mag', model: false, seed: 4, mystery: null, score: [0, 0], cursorsFor: null};
    const svg = $('read-chart'), box = {l: 70, r: 622, t: 34, b: 262};
    let xs, ys, cur;

    const chips = $('read-types');
    KINDS.forEach(k => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = M.TYPES[k].group === 'burst' ? 'burst' : '';
      b.dataset.kind = k;
      b.innerHTML = `${SHORT[k]}<span class="tag">${M.TYPES[k].group === 'burst' ? '폭발' : '맥동'}</span>`;
      b.addEventListener('click', () => { st.kind = k; st.mystery = null; st.cursorsFor = null; render(); });
      chips.appendChild(b);
    });
    $('read-mystery').addEventListener('click', newMystery);
    document.querySelectorAll('#station-read [data-axis]').forEach(b => b.addEventListener('click', () => { st.axis = b.dataset.axis; render(); }));
    $('read-model').addEventListener('change', e => { st.model = e.target.checked; render(); });

    function newMystery() {
      const r = M.rng(Date.now() & 0xffffffff);
      const kind = KINDS[Math.floor(r() * KINDS.length)];
      const seed = Math.floor(r() * 1e9);
      st.mystery = {kind, seed, star: M.withPhase(M.randomStar(kind, seed)), guess: null, n: st.score[1] + 1};
      st.model = false; $('read-model').checked = false;
      st.cursorsFor = null;
      render();
    }
    const stars = {};
    const star = () => st.mystery ? st.mystery.star : (stars[st.kind] = stars[st.kind] || M.withPhase({...M.TYPES[st.kind], kind: st.kind}));
    const seed = () => st.mystery ? st.mystery.seed : st.seed + st.kind.length;

    function render() {
      const s = star(), pts = M.observe(s, seed()), [t0, t1] = M.domain(s);
      setPressed(chips, 'data-kind', st.mystery ? '' : st.kind);
      $('read-mystery').setAttribute('aria-pressed', String(!!st.mystery));
      setPressed(document.querySelector('#station-read .segmented'), 'data-axis', st.axis);
      $('read-chart-title').textContent = st.mystery ? `정체를 숨긴 별 #${st.mystery.n}` : `${M.TYPES[st.kind].name}의 광도 곡선`;

      const tall = small();
      svg.setAttribute('viewBox', `0 0 640 ${tall ? 450 : 320}`);
      box.b = tall ? 375 : 262;
      box.l = tall ? 100 : 70;
      xs = lin(t0, t1, box.l, box.r);
      if (st.cursorsFor !== s) {
        // 맥동 변광성이면 극대에 붙는다(주기의 20% 안). 폭발 변광성은 극대가 하나뿐이라 붙이지 않는다.
        cur = s.group === 'pulse' ? cursorPair(xs, box, () => M.maxima(s, t0, t1), () => 0.2 * s.period) : cursorPair(xs, box);
        cur.a = t0 + (t1 - t0) * 0.18; cur.b = t0 + (t1 - t0) * 0.5;
        st.cursorsFor = s;
      }
      const visible = pts.filter(p => !p.hidden);
      const bright = Math.min(...visible.map(p => p.m)), faint = Math.max(...pts.map(p => p.m));
      const flux = m => 10 ** (-0.4 * (m - bright));
      clear(svg);
      let yTicks;
      if (st.axis === 'mag') {
        const pad = (faint - bright) * 0.08 + 0.05;
        ys = lin(bright - pad, faint + pad, box.t, box.b);           // 작은 등급(밝음)이 위
        yTicks = numTicks(bright - pad, faint + pad, 6);
      } else {
        ys = lin(0, 1.08, box.b, box.t);
        yTicks = [0, 0.25, 0.5, 0.75, 1].map(v => ({v, label: num(v, 2)}));
      }
      const tStep = niceStep(t1 - t0, 7);
      frame(svg, box, xs, ys, {
        xTicks: ticks(t0, t1, 7).map(v => ({v, label: num(v - t0, decimals(tStep))})),
        yTicks, xLabel: '관측 시작 후 시간 (일)',
        yLabel: st.axis === 'mag' ? (tall ? '겉보기 등급' : '겉보기 등급 (위로 갈수록 밝음)') : (tall ? '상대 밝기' : '상대 밝기 (가장 밝을 때 = 1)')
      });
      const Y = m => st.axis === 'mag' ? ys(m) : ys(flux(m));
      const color = s.group === 'burst' ? 'var(--orange)' : 'var(--cyan)';
      if (s.limit !== undefined && st.axis === 'mag') {
        const y = ys(s.limit);
        el('line', {x1: box.l, x2: box.r, y1: y, y2: y, stroke: '#9aa9b5', 'stroke-dasharray': '5 4'}, svg);
        el('text', {x: box.r - 4, y: y - 6, 'text-anchor': 'end', class: 'tick halo'}, svg, tall ? '검출 한계' : '검출 한계 — 이보다 어두우면 보이지 않음');
      }
      if (st.model) {
        const line = [];
        for (let i = 0; i <= 700; i++) {
          const t = t0 + (t1 - t0) * i / 700;
          let m = M.starMag(s, t);
          if (s.limit !== undefined) m = Math.min(m, s.limit);
          line.push([xs(t), Y(m)]);
        }
        el('path', {d: pathOf(line), fill: 'none', stroke: color, 'stroke-width': 5, opacity: 0.25, 'stroke-linejoin': 'round'}, svg);
      }
      const dots = el('g', {}, svg);
      pts.forEach(p => {
        if (p.hidden) {
          const x = xs(p.t), y = st.axis === 'mag' ? ys(p.m) : ys(0);
          el('path', {d: `M${x - 4} ${y - 3}L${x + 4} ${y - 3}L${x} ${y + 4}Z`, fill: '#b7c2cb'}, dots);
        } else el('circle', {cx: xs(p.t), cy: Y(p.m), r: small() ? 5 : 3.2, fill: s.group === 'burst' ? '#e07b39' : '#f0a23a', stroke: '#fff', 'stroke-width': 0.6}, dots);
      });
      cur.draw(svg, '#14283a');

      $('read-dt').textContent = fmtDays(Math.abs(cur.b - cur.a));
      const near = visible.reduce((best, p) => Math.abs(p.t - cur.a) < Math.abs(best.t - cur.a) ? p : best, visible[0]);
      $('read-ma').textContent = Math.abs(near.t - cur.a) < (t1 - t0) * 0.03 ? `${num(near.m, 2)}등급` : '근처 관측 없음';

      const amp = s.group === 'pulse' ? s.mMin - s.mMax : s.quiet - s.peak;
      $('read-axis-note').innerHTML = st.axis === 'mag'
        ? '등급은 <b>값이 작을수록 밝습니다.</b> 그래서 세로축의 작은 값이 위에 있습니다.'
        : `등급 ${num(amp, 1)} 차이는 밝기로 약 <b>${sig(10 ** (0.4 * Math.min(amp, 25)), 2)}배</b>입니다. 등급은 밝기를 로그로 나타낸 값이라, 밝기로 바꾸면 곡선이 훨씬 뾰족해집니다.`;
      renderSide(s, amp);
    }

    function refTable(on) {
      return `<table class="ref-table"><tr><th>종류</th><th>변광 주기</th><th>밝기 변화</th></tr>${KINDS.map(k =>
        `<tr class="${k === on ? 'on' : ''} ${M.TYPES[k].group === 'burst' ? 'burst' : ''}"><td><b>${SHORT[k]}</b></td><td>${REF[k][0]}</td><td>${REF[k][1]}</td></tr>`).join('')}</table>`;
    }
    function facts(s, amp) {
      const pulse = s.group === 'pulse';
      return `<span class="kind-badge ${pulse ? '' : 'burst'}">${pulse ? '맥동 변광성' : '폭발 변광성'}</span>
        <dl class="facts">
          <dt>반복</dt><dd>${pulse ? '같은 모양이 주기적으로 반복' : '반복되지 않음 (한 번 밝아짐)'}</dd>
          <dt>${pulse ? '변광 주기' : '밝아지는 데'}</dt><dd>${pulse ? fmtDays(s.period) : (s.kind === 'sn' ? '약 18일 (수일 이상)' : '약 1.5일 (하루~이틀)')}</dd>
          <dt>밝기 변화 폭</dt><dd>${s.kind === 'sn' ? '20등급 이상 (폭발 전에는 검출 한계 아래)' : `약 ${num(amp, 1)}등급`}</dd>
          <dt>변화 원인</dt><dd>${pulse ? '별의 팽창과 수축 반복' : '폭발로 막대한 에너지 방출'}</dd>
          <dt>쓰임</dt><dd>${REF[s.kind][2]}</dd>
        </dl>`;
    }
    function renderSide(s, amp) {
      const side = $('read-side');
      if (!st.mystery) {
        $('read-side-title').textContent = '특징 정리';
        side.innerHTML = facts(s, amp) + refTable(s.kind);
        return;
      }
      $('read-side-title').textContent = '이 별의 정체는?';
      const m = st.mystery;
      let html = `<p class="micro">반복되는지, 주기는 얼마인지, 몇 등급이나 변하는지 커서로 재 보고 고르세요.</p><div class="guess">${
        KINDS.map(k => `<button type="button" data-guess="${k}" ${m.guess ? 'disabled' : ''}>${SHORT[k]}</button>`).join('')}</div>`;
      if (m.guess) {
        const ok = m.guess === m.kind;
        const why = s.group === 'pulse'
          ? `주기 ${fmtDays(s.period)}, 변화 폭 약 ${num(amp, 1)}등급으로 주기적으로 반복됩니다.`
          : s.kind === 'sn' ? '반복되지 않고, 폭발 전에는 검출 한계보다 어두웠다가 갑자기 나타났습니다. 20등급 넘게 밝아졌고 최대 밝기를 오래 유지합니다.'
                            : `반복되지 않고, 하루~이틀 만에 약 ${num(amp, 1)}등급 밝아졌다가 빠르게 어두워집니다.`;
        html += `<div class="feedback ${ok ? 'ok' : 'no'}"><b>${ok ? '정답!' : `아쉬워요. 정답은 ${M.TYPES[m.kind].name}`}</b><br>${why}</div>
          <p class="micro">맞힌 수 ${st.score[0]} / ${st.score[1]}</p><button type="button" class="primary" id="read-next">🎲 다음 별</button>` + refTable(m.kind);
      }
      side.innerHTML = html;
      side.querySelectorAll('[data-guess]').forEach(b => b.addEventListener('click', () => {
        m.guess = b.dataset.guess;
        st.score[1]++; if (m.guess === m.kind) st.score[0]++;
        st.model = true; $('read-model').checked = true;
        render();
      }));
      const next = $('read-next');
      if (next) next.addEventListener('click', newMystery);
    }

    onDrag(svg, (p, phase) => { if (cur && cur.handle(p, phase)) render(); });
    return {render};
  })();

  // ═══════════════ 02 맥동의 원리 ═══════════════
  stations.pulse = (() => {
    const PRESETS = [
      ['실제 세페이드에 가깝게', {dR: 0.08, dT: 0.1, lag: 0.4}],
      ['반지름만 변하면', {dR: 0.1, dT: 0, lag: 0.4}],
      ['온도만 변하면', {dR: 0, dT: 0.1, lag: 0.4}],
      ['같은 박자로 변하면', {dR: 0.08, dT: 0.1, lag: 0}]
    ];
    const st = {phase: 0, playing: true, p: {...PRESETS[0][1]}, exaggerate: true};
    const R0 = M.SIGMA_SUN.R, T0 = M.SIGMA_SUN.T;
    const star = $('pulse-star'), chart = $('pulse-chart');
    const box = {l: 150, r: 624};
    const rows = [
      {key: 'r', name: '반지름 R', color: '#c2581c', t: 22, h: 100, lo: 0.84, hi: 1.16, fmt: v => `${v >= 1 ? '+' : '−'}${Math.round(Math.abs(v - 1) * 100)}%`, ticks: [0.85, 1, 1.15]},
      {key: 'temp', name: '표면 온도 T', color: '#b8860b', t: 150, h: 100, lo: 0.84, hi: 1.16, fmt: v => `${Math.round(T0 * v / 10) * 10}`, ticks: [0.85, 1, 1.15]},
      {key: 'dMag', name: '밝기 (등급)', color: '#0b7f9a', t: 278, h: 100, lo: 1.15, hi: -1.15, fmt: v => num(v, 1), ticks: [1, 0, -1]}
    ];

    const presets = $('pulse-presets');
    PRESETS.forEach(([name, p]) => {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = name;
      b.addEventListener('click', () => { st.p = {...p}; syncSliders(); render(); });
      presets.appendChild(b);
    });
    const sliders = {dR: $('pulse-dR'), dT: $('pulse-dT'), lag: $('pulse-lag')};
    function syncSliders() { for (const k in sliders) sliders[k].value = st.p[k]; }
    for (const k in sliders) sliders[k].addEventListener('input', () => { st.p[k] = +sliders[k].value; render(); });
    syncSliders();
    $('pulse-phase').addEventListener('input', e => { st.phase = +e.target.value; setPlaying(false); render(); });
    $('pulse-play').addEventListener('click', () => setPlaying(!st.playing));
    $('pulse-exaggerate').addEventListener('change', e => { st.exaggerate = e.target.checked; render(); });
    function setPlaying(v) { st.playing = v; $('pulse-play').textContent = v ? '❚❚ 멈춤' : '▶ 재생'; }

    // 별 장면의 고정 요소
    const defs = el('defs', {}, star);
    const grad = el('radialGradient', {id: 'pulse-glow'}, defs);
    const g0 = el('stop', {offset: '0%'}, grad), g1 = el('stop', {offset: '55%'}, grad), g2 = el('stop', {offset: '100%', 'stop-opacity': 0}, grad);
    const surf = el('radialGradient', {id: 'pulse-surface', cx: '42%', cy: '40%'}, defs);
    const s0 = el('stop', {offset: '0%', 'stop-color': '#fff'}, surf), s1 = el('stop', {offset: '100%'}, surf);
    const CX = 175, CY = 160, BASE = 78;
    const glow = el('circle', {cx: CX, cy: CY, fill: 'url(#pulse-glow)'}, star);
    el('circle', {cx: CX, cy: CY, r: BASE, fill: 'none', stroke: '#8fb3cc', 'stroke-dasharray': '4 5', opacity: 0.7}, star);
    const body = el('circle', {cx: CX, cy: CY, fill: 'url(#pulse-surface)'}, star);
    const arrows = el('g', {stroke: '#9fe3f0', 'stroke-width': 2.5, fill: 'none', 'stroke-linecap': 'round'}, star);
    el('text', {x: CX, y: CY + BASE + 32, 'text-anchor': 'middle', 'font-size': 11, opacity: 0.7}, star, '점선 = 평균 크기');
    const labR = el('text', {x: 14, y: 26, 'font-size': 15, 'font-weight': 700}, star);
    const labT = el('text', {x: 14, y: 48, 'font-size': 15, 'font-weight': 700}, star);
    // 광도 막대
    const BX = 362, BT = 40, BH = 230;
    el('rect', {x: BX, y: BT, width: 26, height: BH, rx: 6, fill: '#0b1a29', stroke: '#35526d'}, star);
    const bar = el('rect', {x: BX + 3, width: 20, rx: 4, fill: '#5fd0e6'}, star);
    const yL = v => BT + BH - (v / 2.4) * BH;
    el('line', {x1: BX - 6, x2: BX + 32, y1: yL(1), y2: yL(1), stroke: '#dfe9f1', 'stroke-dasharray': '3 3'}, star);
    el('text', {x: BX + 13, y: BT - 10, 'text-anchor': 'middle', 'font-size': 12, 'font-weight': 700}, star, '광도 L');
    el('text', {x: BX - 8, y: yL(1) + 4, 'text-anchor': 'end', 'font-size': 11}, star, '평균');
    const labL = el('text', {x: BX + 13, y: BT + BH + 20, 'text-anchor': 'middle', 'font-size': 13, 'font-weight': 800, fill: '#7fd6ea'}, star);

    onDrag(chart, (p, phase) => {
      if (!p || p.x < box.l || p.x > box.r) return;
      st.phase = Math.max(0, Math.min(2, (p.x - box.l) / (box.r - box.l) * 2));
      setPlaying(false); render();
    });

    let xs = lin(0, 2, box.l, box.r);
    let chartKey = '';
    function drawChart() {
      const key = JSON.stringify(st.p) + small();
      if (key === chartKey) return;
      chartKey = key;
      clear(chart);
      const tall = small();
      box.l = tall ? 110 : 150;
      xs = lin(0, 2, box.l, box.r);
      const ex = M.pulsationExtrema(st.p);
      rows.forEach(row => {
        const ys = lin(row.lo, row.hi, row.t + row.h, row.t);
        const rb = {l: box.l, r: box.r, t: row.t, b: row.t + row.h};
        const g = el('g', {class: 'axis'}, chart);
        row.ticks.forEach(v => {
          el('line', {x1: box.l, x2: box.r, y1: ys(v), y2: ys(v), class: 'grid-line'}, g);
          el('text', {x: box.l - 6, y: ys(v) + 4, 'text-anchor': 'end', class: 'tick'}, g, row.fmt(v));
        });
        [0, 0.5, 1, 1.5, 2].forEach(v => el('line', {x1: xs(v), x2: xs(v), y1: rb.t, y2: rb.b, class: 'grid-line'}, g));
        el('line', {x1: box.l, x2: box.l, y1: rb.t, y2: rb.b, 'stroke-width': 1.2}, g);
        if (tall) el('text', {x: box.l + 4, y: row.t - 5, class: 'annot halo', fill: row.color}, g, row.name + (row.key === 'temp' ? ' (K)' : row.key === 'dMag' ? ' · 위 = 밝음' : ''));
        else {
          el('text', {x: 6, y: row.t + 14, class: 'annot', fill: row.color}, g, row.name);
          if (row.key === 'temp') el('text', {x: 6, y: row.t + 30, class: 'tick'}, g, '(K)');
          if (row.key === 'dMag') el('text', {x: 6, y: row.t + 30, class: 'tick'}, g, '위 = 밝음');
        }
        const line = [];
        for (let i = 0; i <= 400; i++) {
          const ph = 2 * i / 400, s = M.pulsation(ph, st.p);
          line.push([xs(ph), ys(s[row.key])]);
        }
        el('path', {d: pathOf(line), fill: 'none', stroke: row.color, 'stroke-width': 2.6}, chart);
        // 극대 표시
        const peak = row.key === 'r' ? ex.rMax : row.key === 'temp' ? ex.tMax : ex.lMax;
        const tag = row.key === 'r' ? 'R 최대' : row.key === 'temp' ? 'T 최대' : '가장 밝음';
        const flat = row.key === 'r' ? st.p.dR === 0 : row.key === 'temp' ? st.p.dT === 0 : false;
        if (!flat) [peak, peak + 1].forEach(ph => {
          if (ph > 2) return;
          const s = M.pulsation(ph, st.p);
          el('circle', {cx: xs(ph), cy: ys(s[row.key]), r: 5, fill: '#fff', stroke: row.color, 'stroke-width': 2.5}, chart);
          el('text', {x: xs(ph), y: ys(s[row.key]) - 9, 'text-anchor': ph < 0.1 ? 'start' : ph > 1.9 ? 'end' : 'middle', class: 'tick halo', fill: row.color}, chart, tag);
        });
        row.ys = ys;
      });
      // 가장 밝은 때를 세 그래프 전체에 세로선으로
      [ex.lMax, ex.lMax + 1].forEach(ph => {
        if (ph <= 2) el('line', {x1: xs(ph), x2: xs(ph), y1: rows[0].t, y2: rows[2].t + rows[2].h, stroke: '#0b7f9a', 'stroke-dasharray': '4 4', opacity: 0.6}, chart);
      });
      const ax = el('g', {class: 'axis'}, chart), yb = rows[2].t + rows[2].h;
      chart.setAttribute('viewBox', `0 0 640 ${tall ? 440 : 420}`);
      el('line', {x1: box.l, x2: box.r, y1: yb, y2: yb, 'stroke-width': 1.2}, ax);
      [0, 0.5, 1, 1.5, 2].forEach(v => el('text', {x: xs(v), y: yb + (tall ? 26 : 18), 'text-anchor': 'middle', class: 'tick'}, ax, num(v, 1)));
      el('text', {x: (box.l + box.r) / 2, y: yb + (tall ? 54 : 36), 'text-anchor': 'middle', class: 'axis-label'}, ax, tall ? '시간 (주기 단위)' : '시간 (주기 단위 · 위상 0 = 온도 최대)');
      chart.cursorLine = el('line', {y1: rows[0].t - 6, y2: yb, stroke: '#14283a', 'stroke-width': 2}, chart);
      chart.cursorDots = rows.map(r => el('circle', {r: 4.5, fill: r.color, stroke: '#fff', 'stroke-width': 1.5}, chart));
      insight(ex);
    }
    function insight(ex) {
      const p = st.p, gapLR = Math.abs(M.phaseGap(ex.lMax, ex.rMax)), gapLT = Math.abs(M.phaseGap(ex.lMax, ex.tMax));
      const range = `밝기 변화 폭은 <b>${num(ex.magRange, 2)}등급</b>(가장 밝을 때가 가장 어두울 때의 ${num(ex.lumRange, 2)}배)입니다.`;
      let text;
      if (p.dR === 0 && p.dT === 0) text = '반지름도 온도도 변하지 않으면 광도도 일정합니다. 변광성이 아닙니다.';
      else if (p.dT === 0) text = `온도가 일정하면 광도는 R²만 따라가서 <b>반지름이 가장 클 때 가장 밝습니다.</b> 반지름 ${Math.round(p.dR * 100)}% 증가 → 광도 ${num((1 + p.dR) ** 2, 2)}배. ${range}`;
      else if (p.dR === 0) text = `반지름이 그대로여도 온도만으로 광도가 크게 변합니다. 온도 ${Math.round(p.dT * 100)}% 증가 → 광도 (1+${num(p.dT, 2)})⁴ = <b>${num((1 + p.dT) ** 4, 2)}배</b>. ${range}`;
      else if (p.lag === 0) text = `반지름과 온도가 같은 박자로 변하면 둘 다 최대일 때 가장 밝습니다. 하지만 실제 세페이드는 이렇게 움직이지 않습니다. ‘실제 세페이드에 가깝게’를 눌러 비교해 보세요. ${range}`;
      else text = `가장 밝은 순간은 <b>온도가 가장 높은 순간 근처</b>(${num(gapLT, 2)}주기 차이)이고, <b>반지름이 가장 큰 순간과는 ${num(gapLR, 2)}주기</b> 어긋나 있습니다. 광도는 T⁴에 비례해서 온도의 영향이 반지름(R²)보다 훨씬 큽니다. 그래서 '가장 클 때 가장 밝다'고 단정할 수 없습니다. ${range}`;
      $('pulse-insight').innerHTML = text;
    }

    function render() {
      [...presets.children].forEach((b, i) => {
        const q = PRESETS[i][1];
        b.setAttribute('aria-pressed', String(Math.abs(q.dR - st.p.dR) < 1e-6 && Math.abs(q.dT - st.p.dT) < 1e-6 && Math.abs(q.lag - st.p.lag) < 1e-6));
      });
      $('pulse-dR-out').textContent = `±${Math.round(st.p.dR * 1000) / 10}%`;
      $('pulse-dT-out').textContent = `±${Math.round(st.p.dT * 1000) / 10}%`;
      $('pulse-lag-out').textContent = `${num(st.p.lag, 2)}주기`;
      $('pulse-phase').value = st.phase;
      $('pulse-phase-out').textContent = num(st.phase % 1, 2);
      drawChart();
      const s = M.pulsation(st.phase, st.p), k = st.exaggerate ? 3 : 1;
      const rad = BASE * (1 + (s.r - 1) * k), T = T0 * (1 + (s.temp - 1) * k);
      const col = M.starColor(T);
      body.setAttribute('r', rad.toFixed(2));
      s1.setAttribute('stop-color', col);
      glow.setAttribute('r', (rad * (1.35 + 0.25 * s.lum)).toFixed(2));
      g0.setAttribute('stop-color', col); g0.setAttribute('stop-opacity', Math.min(0.9, 0.3 + 0.35 * s.lum).toFixed(2));
      g1.setAttribute('stop-color', col); g1.setAttribute('stop-opacity', Math.min(0.5, 0.12 + 0.18 * s.lum).toFixed(2));
      g2.setAttribute('stop-color', col);
      clear(arrows);
      const v = s.velocity / Math.max(st.p.dR, 1e-6);
      if (st.p.dR > 0 && Math.abs(v) > 0.12) {
        for (let i = 0; i < 8; i++) {
          const a = i * Math.PI / 4 + Math.PI / 8, len = 16 * Math.abs(v);
          const r1 = rad + 8 + (v > 0 ? 0 : len), r2 = rad + 8 + (v > 0 ? len : 0);
          const x1 = CX + r1 * Math.cos(a), y1 = CY + r1 * Math.sin(a), x2 = CX + r2 * Math.cos(a), y2 = CY + r2 * Math.sin(a);
          const hx = Math.cos(a) * 5 * Math.sign(v), hy = Math.sin(a) * 5 * Math.sign(v);
          el('path', {d: `M${x1} ${y1}L${x2} ${y2}M${x2 - hx - hy} ${y2 - hy + hx}L${x2} ${y2}L${x2 - hx + hy} ${y2 - hy - hx}`}, arrows);
        }
      }
      $('pulse-motion').textContent = st.p.dR === 0 ? '크기 변화 없음' : Math.abs(v) <= 0.12 ? (M.pulsation(st.phase, st.p).r > 1 ? '가장 크게 부풂' : '가장 작게 수축') : v > 0 ? '팽창하는 중 ↗' : '수축하는 중 ↘';
      labR.textContent = `R = ${num(R0 * s.r, 1)} R☉`;
      labT.textContent = `T = ${Math.round(T0 * s.temp)} K`;
      labR.setAttribute('fill', '#ffc79e'); labT.setAttribute('fill', '#ffe08a');
      const h = Math.max(0, Math.min(BH - 6, (s.lum / 2.4) * BH - 3));
      bar.setAttribute('y', (BT + BH - 3 - h).toFixed(1)); bar.setAttribute('height', h.toFixed(1));
      labL.textContent = `${num(s.lum, 2)}배`;
      $('pulse-formula').innerHTML = `<span class="big"><span class="l">L/L평균</span> = (<span class="r">R/R평균</span>)² × (<span class="t">T/T평균</span>)⁴</span><br>
        = <span class="r">${num(s.r, 3)}²</span> × <span class="t">${num(s.temp, 3)}⁴</span> = <span class="r">${num(s.rFactor, 2)}</span> × <span class="t">${num(s.tFactor, 2)}</span> = <b class="l">${num(s.lum, 2)}</b>
        <span class="micro">→ 평균보다 ${num(Math.abs(s.dMag), 2)}등급 ${s.dMag <= 0 ? '밝음' : '어두움'}</span>`;
      const x = xs(st.phase);
      chart.cursorLine.setAttribute('x1', x); chart.cursorLine.setAttribute('x2', x);
      rows.forEach((r, i) => { chart.cursorDots[i].setAttribute('cx', x); chart.cursorDots[i].setAttribute('cy', r.ys(s[r.key])); });
    }
    let last = null;
    function tick(now) {
      if (current === 'pulse' && st.playing && !document.hidden) {
        if (last !== null) { st.phase = (st.phase + (now - last) / 4000) % 2; render(); }
        last = now;
      } else last = null;
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
    return {render};
  })();

  // ═══════════════ 03 세페이드로 거리 재기 ═══════════════
  stations.ruler = (() => {
    const TARGETS = [
      {id: 'mw', name: '우리은하의 세페이드', tag: '연습', pop: 'pop1', P: 10, r: 1000, amp: 0.8, rise: 0.3,
        story: '주기 10일, 평균 6등급인 종족 Ⅰ 세페이드라면 m − M = 10, 거리는 1000 pc입니다. 활동지 13쪽의 네 단계와 같은 흐름이에요.'},
      {id: 'v1', name: '안드로메다은하의 V1', tag: '1923 허블', pop: 'pop1', P: 31.4, r: 770e3, amp: 1.1, rise: 0.25,
        story: '1923년 허블은 V1의 주기로 거리를 재어 안드로메다가 우리은하(지름 약 30 kpc) 밖의 외부 은하임을 밝혔습니다. 그런데 그때는 세페이드에 두 종족이 있다는 것을 몰라, 실제보다 2.5배쯤 가깝게(약 30만 pc) 계산했어요. 1952년 바데가 종족 Ⅰ과 Ⅱ를 구분하자 은하까지의 거리가 두 배 넘게 늘어났습니다.'},
      {id: 'w', name: '구상 성단의 종족 Ⅱ 세페이드', tag: '함정', pop: 'pop2', P: 15, r: 10e3, amp: 0.9, rise: 0.3,
        story: '구상 성단은 늙은 별이 모인 곳이라 이곳의 세페이드는 종족 Ⅱ입니다. 종족 Ⅰ 관계선을 쓰면 2등급 밝다고 착각해 거리가 2.5배 멀게 나옵니다.'},
      {id: 'rr', name: '구상 성단의 RR형 변광성', tag: '활동지 Q4', pop: 'rr', P: 0.6, r: 10e3, amp: 0.9, rise: 0.16,
        story: 'RR형은 주기와 관계없이 절대 등급이 약 +0.5등급입니다. 평균 겉보기 등급 15.5 → m − M = 15 → r = 10⁴ pc = 10 kpc.'}
    ];
    const st = {target: TARGETS[0], pop: 'pop1', checked: false};
    const lc = $('ruler-lc'), pl = $('ruler-pl');
    const lbox = {l: 64, r: 622, t: 34, b: 244}, pbox = {l: 64, r: 622, t: 16, b: 270};
    let spec, pts, xs, cur;

    const chips = $('ruler-targets');
    TARGETS.forEach(t => {
      const b = document.createElement('button');
      b.type = 'button'; b.dataset.target = t.id;
      b.innerHTML = `${t.name}<span class="tag">${t.tag}</span>`;
      b.addEventListener('click', () => { load(t); render(); });
      chips.appendChild(b);
    });
    document.querySelectorAll('#ruler-pop [data-pop]').forEach(b => b.addEventListener('click', () => { st.pop = b.dataset.pop; st.checked = false; render(); }));
    $('ruler-snap').addEventListener('click', () => {
      const mx = M.maxima(spec, xs.d[0], xs.d[1]);
      cur.a = mx[0]; cur.b = mx[1]; cur.snapped.a = cur.snapped.b = true; st.checked = false; render();
    });
    $('ruler-check').addEventListener('click', () => { st.checked = true; render(); });

    // 휴대폰에서는 세로축 글씨 자리를 넓힌다. 커서 위치는 그대로 둔다.
    function makeAxis(a, b) {
      lbox.l = small() ? 100 : 64;
      const [t0, t1] = M.domain(spec);
      xs = lin(t0, t1, lbox.l, lbox.r);
      cur = cursorPair(xs, lbox, () => M.maxima(spec, t0, t1), () => 0.2 * spec.period);
      cur.a = a; cur.b = b;
    }
    function load(t) {
      st.target = t; st.checked = false;
      const mMean = M.absMag(t.pop, t.P) + M.modulus(t.r);
      spec = {group: 'pulse', kind: 'cepheid', period: t.P, mMax: mMean - t.amp / 2, mMin: mMean + t.amp / 2, rise: t.rise, noise: 0.03, tMax: 0.35 * t.P};
      pts = M.observe(spec, 17 + t.id.length, 130);
      const [t0, t1] = M.domain(spec);
      makeAxis(t0 + (t1 - t0) * 0.08, t0 + (t1 - t0) * 0.42);
    }
    onDrag(lc, (p, phase) => { if (cur.handle(p, phase)) { st.checked = false; render(); } });

    function measured() {
      const dt = Math.abs(cur.b - cur.a), n = Math.round(dt / spec.period);
      const multi = n >= 2 && Math.abs(dt / spec.period - n) < 0.12;
      return {dt, n: multi ? n : 1, P: multi ? dt / n : dt};
    }

    function drawLC() {
      clear(lc);
      const tall = small();
      lc.setAttribute('viewBox', `0 0 640 ${tall ? 420 : 300}`);
      lbox.b = tall ? 345 : 244;
      if (lbox.l !== (tall ? 100 : 64)) makeAxis(cur.a, cur.b);
      const [t0, t1] = xs.d, mMean = (spec.mMax + spec.mMin) / 2, pad = 0.25;
      const ys = lin(spec.mMax - pad, spec.mMin + pad, lbox.t, lbox.b);
      const tStep = niceStep(t1 - t0, 7);
      frame(lc, lbox, xs, ys, {xTicks: ticks(t0, t1, 7).map(v => ({v, label: num(v, decimals(tStep))})), yTicks: numTicks(spec.mMax - pad, spec.mMin + pad, 5), xLabel: '시간 (일)', yLabel: '겉보기 등급'});
      [['최대', spec.mMax, '4 4'], ['최소', spec.mMin, '4 4'], ['평균', mMean, '']].forEach(([n, m, dash]) => {
        el('line', {x1: lbox.l, x2: lbox.r, y1: ys(m), y2: ys(m), stroke: n === '평균' ? '#c2581c' : '#9aa9b5', 'stroke-dasharray': dash, 'stroke-width': n === '평균' ? 1.8 : 1}, lc);
        el('text', {x: lbox.r - 4, y: ys(m) + (n === '최대' ? 14 : -5), 'text-anchor': 'end', class: 'tick halo', fill: n === '평균' ? '#c2581c' : undefined, 'font-weight': n === '평균' ? 800 : undefined}, lc, `${n} ${num(m, 2)}`);
      });
      pts.forEach(p => el('circle', {cx: xs(p.t), cy: ys(p.m), r: small() ? 4.8 : 3, fill: '#f0a23a', stroke: '#fff', 'stroke-width': 0.6}, lc));
      cur.draw(lc, '#14283a');
    }

    function drawPL(P) {
      clear(pl);
      pbox.l = small() ? 96 : 64;
      const xs2 = lin(-0.6, 2.15, pbox.l, pbox.r), ys2 = lin(1.5, -8, pbox.b, pbox.t);
      const xT = [0.3, 1, 3, 10, 30, 100].map(v => ({v: Math.log10(v), label: `${v}`}));
      frame(pl, pbox, xs2, ys2, {xTicks: xT, yTicks: [1, 0, -2, -4, -6, -8].map(v => ({v, label: num(v, 0)})), xLabel: '변광 주기 (일) — 로그 눈금', yLabel: small() ? '절대 등급 M' : '절대 등급 M (위 = 밝음)'});
      // 로그 눈금의 작은 눈금
      const minor = el('g', {stroke: '#c4ced6'}, pl);
      for (let d = -1; d <= 2; d++) for (let k = 2; k <= 9; k++) {
        const lx = d + Math.log10(k);
        if (lx > -0.6 && lx < 2.15) el('line', {x1: xs2(lx), x2: xs2(lx), y1: pbox.b, y2: pbox.b + 5}, minor);
      }
      const lines = [
        {k: 'pop1', color: 'var(--pop1)', from: 0, to: 2, dash: ''},
        {k: 'pop2', color: 'var(--pop2)', from: 0, to: 2, dash: '8 5'},
        {k: 'rr', color: 'var(--rr)', from: -0.5, to: 0, dash: ''}
      ];
      lines.forEach(L => {
        const on = L.k === st.pop;
        const a = [xs2(L.from), ys2(M.absMag(L.k, 10 ** L.from))], b = [xs2(L.to), ys2(M.absMag(L.k, 10 ** L.to))];
        el('path', {d: pathOf([a, b]), stroke: L.color, 'stroke-width': on ? 4.5 : 2.5, 'stroke-dasharray': L.dash, opacity: on ? 1 : 0.35, fill: 'none', 'stroke-linecap': 'round'}, pl);
        // 관계선 기울기를 따라 이름을 눕혀 쓴다(종족 Ⅰ은 선 위, 종족 Ⅱ는 선 아래)
        const at = L.k === 'rr' ? -0.55 : L.k === 'pop1' ? 0.15 : 1.0;
        const lx = xs2(at), ly = ys2(M.absMag(L.k, 10 ** at));
        const ang = L.k === 'rr' ? 0 : Math.atan2(ys2(M.absMag(L.k, 10)) - ys2(M.absMag(L.k, 1)), xs2(1) - xs2(0)) * 180 / Math.PI;
        const off = L.k === 'pop2' ? 20 : -9;
        el('text', {x: lx, y: ly + off, transform: `rotate(${ang.toFixed(1)} ${lx} ${ly})`, class: 'annot halo', fill: L.color, opacity: on ? 1 : 0.55}, pl, M.PL[L.k].name);
      });
      const lp = Math.log10(P);
      const Mabs = M.absMag(st.pop, P);
      if (lp > -0.6 && lp < 2.15) {
        const x = xs2(lp), y = ys2(Mabs);
        el('path', {d: `M${x} ${pbox.b}V${y}H${pbox.l}`, stroke: '#c2581c', 'stroke-width': 2, 'stroke-dasharray': '5 4', fill: 'none'}, pl);
        el('circle', {cx: x, cy: y, r: 7, fill: '#e6a93c', stroke: '#fff', 'stroke-width': 2}, pl);
        el('text', {x: x + 12, y: y + 22, class: 'annot halo', fill: '#c2581c'}, pl, `M ≈ ${num(Mabs, 1)}`);
        el('text', {x: x + 6, y: pbox.b - 8, class: 'tick halo', fill: '#c2581c'}, pl, `P = ${num(P, P < 2 ? 2 : 1)}일`);
      }
      return Mabs;
    }

    function render() {
      setPressed(chips, 'data-target', st.target.id);
      setPressed($('ruler-pop'), 'data-pop', st.pop);
      drawLC();
      const m = measured(), mMean = (spec.mMax + spec.mMin) / 2;
      $('ruler-P').textContent = m.n > 1 ? `${fmtDays(m.P)}  (${num(m.dt, 1)}일 ÷ ${m.n})` : fmtDays(m.P);
      $('ruler-m').textContent = `${num(mMean, 2)}등급`;
      const Mabs = drawPL(m.P), mu = mMean - Mabs, r = M.distanceFromModulus(mu), lr = (mu + 5) / 5;
      let warn = '';
      if (st.pop === 'rr' && m.P > 1.05) warn = 'RR형의 주기는 1일보다 짧습니다. 이 별에 RR형 관계를 써도 될까요?';
      if (st.pop !== 'rr' && m.P < 0.95) warn = '세페이드의 주기는 1일보다 깁니다. 관계선 밖을 늘려 읽은 값입니다.';
      $('ruler-steps').innerHTML = `
        <div class="s"><div class="k">① 주기 P (광도 곡선)</div><div class="v">${fmtDays(m.P)}</div><div class="w">커서 A·B를 이웃한 두 극대 근처에 (자석처럼 붙음)</div></div>
        <div class="s"><div class="k">② 절대 등급 M (${M.PL[st.pop].name})</div><div class="v">${num(Mabs, 2)}</div><div class="w">${warn || (st.pop === 'rr' ? '주기와 관계없이 약 +0.5' : `주기가 길수록 M이 작다(밝다)`)}</div></div>
        <div class="s"><div class="k">③ 거리 지수 m − M</div><div class="v">${num(mu, 2)}</div><div class="w">${num(mMean, 2)} − (${num(Mabs, 2)}) = ${num(mu, 2)}</div></div>
        <div class="s final"><div class="k">④ 거리 r</div><div class="v">${fmtPc(r)}</div><div class="w">m − M = 5 log r − 5<br>log r = (${num(mu, 2)} + 5) ÷ 5 = ${num(lr, 2)}<br>r = 10<sup>${num(lr, 2)}</sup> pc · ${fmtLy(r)}</div></div>`;
      const v = $('ruler-verdict');
      v.hidden = !st.checked;
      if (st.checked) {
        const t = st.target, ratio = r / t.r, popOk = st.pop === t.pop, pOk = Math.abs(m.P / t.P - 1) < 0.1;
        // 손으로 읽은 값이니 15% 안이면 맞은 것으로 본다.
        const ok = popOk && pOk && Math.abs(ratio - 1) < 0.15;
        let msg = `<b>${ok ? (Math.abs(ratio - 1) < 0.02 ? '정확합니다!' : '잘 맞혔어요! 손으로 읽은 값이라 이 정도 차이는 괜찮습니다.') : '다시 살펴보세요.'}</b> 정답 거리 ${fmtPc(t.r)} (${M.PL[t.pop].name}) · 내 답 ${fmtPc(r)} → ${Math.abs(ratio - 1) < 0.02 ? '거의 같게' : ratio >= 1 ? `${num(ratio, 2)}배 멀게` : `${num(1 / ratio, 2)}배 가깝게`} 계산했습니다.`;
        if (!pOk) msg += `<br>주기가 ${fmtDays(t.P)}에서 벗어나 있어요. 커서를 이웃한 두 극대에 맞춰 보세요.`;
        if (!popOk) {
          const dM = M.absMag(st.pop, t.P) - M.absMag(t.pop, t.P);
          msg += `<br>관계선을 잘못 골랐어요. 같은 주기에서 절대 등급이 ${num(Math.abs(dM), 1)}등급 차이 나면 거리는 10<sup>${num(Math.abs(dM) / 5, 2)}</sup> ≈ ${num(10 ** (Math.abs(dM) / 5), 1)}배 틀어집니다.`;
        }
        v.className = 'verdict ' + (ok ? 'ok' : 'no');
        v.innerHTML = msg + `<span class="story">${t.story}</span>`;
      }
    }
    load(TARGETS[0]);
    return {render};
  })();

  // ═══════════════ 04 Ia형 초신성과 우주 ═══════════════
  stations.cosmos = (() => {
    const st = {ol: 0, view: 'mu', z: 0.7, mass: 1.0, mode: 'idle', boomT: 0};
    const refs = [
      {k: 'decel', color: 'var(--decel)', dash: '9 6', width: 2.5},
      {k: 'coast', color: 'var(--coast)', dash: '2 5', width: 3},
      {k: 'accel', color: 'var(--accel)', dash: '', width: 2.5}
    ];
    const mine = () => ({name: '내 모형', om: 1 - st.ol, ol: st.ol});

    // 표준 광원 장면
    const sn = $('sn-scene');
    const sdefs = el('defs', {}, sn);
    const flashG = el('radialGradient', {id: 'sn-flash'}, sdefs);
    el('stop', {offset: '0%', 'stop-color': '#fff'}, flashG);
    el('stop', {offset: '35%', 'stop-color': '#ffe7a3'}, flashG);
    el('stop', {offset: '100%', 'stop-color': '#ff9a3c', 'stop-opacity': 0}, flashG);
    const comp = el('circle', {cx: 95, cy: 92, r: 56, fill: '#e98b4b'}, sn);
    el('text', {x: 95, y: 170, 'text-anchor': 'middle', 'font-size': 13}, sn, '동반성 (거성)');
    const disk = el('ellipse', {cx: 285, cy: 105, rx: 34, ry: 9, fill: 'none', stroke: '#ffb98a', 'stroke-width': 3, opacity: 0.8}, sn);
    const stream = el('path', {d: 'M152 92 C 200 70, 245 80, 270 100', fill: 'none', stroke: '#ffb98a', 'stroke-width': 2.5, 'stroke-dasharray': '3 6', opacity: 0.85}, sn);
    const wd = el('circle', {cx: 285, cy: 105, r: 9, fill: '#eef6ff', stroke: '#9cc7ff', 'stroke-width': 2}, sn);
    const wdLab = el('text', {x: 285, y: 140, 'text-anchor': 'middle', 'font-size': 13}, sn, '백색왜성');
    const flash = el('circle', {cx: 285, cy: 105, r: 0, fill: 'url(#sn-flash)'}, sn);
    const boomText = el('text', {x: 285, y: 36, 'text-anchor': 'middle', 'font-size': 15, 'font-weight': 800, fill: '#ffe08a'}, sn);
    // 질량 게이지
    const GX = 40, GW = 340, GY = 212, gm = m => GX + (m - 1.0) / 0.5 * GW;
    el('rect', {x: GX, y: GY, width: GW, height: 12, rx: 6, fill: '#0b1a29', stroke: '#35526d'}, sn);
    const gauge = el('rect', {x: GX, y: GY + 2, height: 8, rx: 4, fill: '#9cc7ff'}, sn);
    el('line', {x1: gm(1.4), x2: gm(1.4), y1: GY - 6, y2: GY + 18, stroke: '#ffb3b3', 'stroke-width': 2}, sn);
    el('text', {x: gm(1.4), y: GY - 10, 'text-anchor': 'middle', 'font-size': 11, fill: '#ffb3b3'}, sn, '질량 한계 ≈ 태양의 1.4배');
    const massLab = el('text', {x: GX, y: GY + 32, 'font-size': 12}, sn);

    $('sn-play').addEventListener('click', () => {
      if (st.mode === 'accrete') return;
      if (st.mode === 'boom' || st.mass >= 1.4) { st.mass = 1.0; }
      st.mode = 'accrete';
      $('sn-play').textContent = '물질을 끌어오는 중…';
    });
    function drawScene(now) {
      const boom = st.mode === 'boom';
      const tb = boom ? (now - st.boomT) / 1000 : 0;
      comp.setAttribute('opacity', boom && tb < 0.6 ? 0.5 : 1);
      stream.setAttribute('opacity', st.mode === 'accrete' ? 0.85 : boom ? 0 : 0.25);
      stream.setAttribute('stroke-dashoffset', String(-(now / 40) % 9));
      disk.setAttribute('opacity', boom ? 0 : st.mode === 'accrete' ? 0.8 : 0.35);
      wd.setAttribute('opacity', boom ? 0 : 1);
      wdLab.setAttribute('opacity', boom ? 0 : 1);
      wd.setAttribute('r', String(9 - (st.mass - 1) * 6));        // 무거워질수록 오히려 작아진다
      const fr = boom ? Math.min(1, tb / 0.5) * 120 * (tb < 2.2 ? 1 : Math.max(0, 1 - (tb - 2.2) / 1.5)) : 0;
      flash.setAttribute('r', fr.toFixed(1));
      boomText.textContent = boom ? '폭발! 최대 절대 등급 M ≈ −19' : st.mode === 'accrete' ? '물질이 쌓여 질량이 늘어난다' : '';
      gauge.setAttribute('width', Math.max(0, gm(Math.min(st.mass, 1.45)) - GX).toFixed(1));
      gauge.setAttribute('fill', st.mass >= 1.38 ? '#ffb3b3' : '#9cc7ff');
      massLab.textContent = `백색왜성 질량 ${num(st.mass, 2)} M☉`;
    }
    $('sn-m').addEventListener('input', () => renderDistance());
    function renderDistance() {
      const m = +$('sn-m').value, mu = m - (-19), r = M.distanceFromModulus(mu), lr = (mu + 5) / 5;
      $('sn-m-out').textContent = `${num(m, 1)}등급`;
      const cep = -6 + mu;
      $('sn-formula').innerHTML = `m − M = ${num(m, 1)} − (−19) = <b>${num(mu, 1)}</b> → log r = (${num(mu, 1)} + 5) ÷ 5 = ${num(lr, 2)}<br>
        <span class="big">r = 10<sup>${num(lr, 2)}</sup> pc = ${fmtPc(r)}</span> · ${fmtLy(r)}<br>
        <span class="micro">같은 거리에 있는 밝은 세페이드(M ≈ −6)라면 ${num(cep, 1)}등급 → ${cep > 26 ? '너무 어두워 보기 어렵습니다. 그래서 먼 은하는 초신성으로 잽니다.' : '아직 보일 수도 있습니다.'}</span>`;
    }

    // 허블 다이어그램
    const hub = $('hubble'), hbox = {l: 64, r: 622, t: 18, b: 318};
    document.querySelectorAll('#station-cosmos [data-hview]').forEach(b => b.addEventListener('click', () => { st.view = b.dataset.hview; renderHubble(); }));
    $('ol').addEventListener('input', e => { st.ol = +e.target.value; renderHubble(); renderFit(); renderHistory(); });
    let xsH = lin(0, 1.5, hbox.l, hbox.r);
    onDrag(hub, p => { if (p && p.x >= hbox.l - 10 && p.x <= hbox.r + 10) { st.z = Math.max(0.02, Math.min(1.5, xsH.inv(p.x))); renderHubble(); } });
    $('hubble-legend').innerHTML = refs.map(r => `<span><i style="border-top-color:${r.color};border-top-style:${r.dash ? (r.k === 'coast' ? 'dotted' : 'dashed') : 'solid'}"></i>${M.MODELS[r.k].name}</span>`).join('') +
      `<span><i style="border-top-color:var(--mine);border-top-width:4px"></i>내 모형</span><span><i class="dot"></i>Ia형 초신성 관측</span>`;

    function renderHubble() {
      clear(hub);
      const tall = small();
      hub.setAttribute('viewBox', `0 0 640 ${tall ? 520 : 380}`);
      hbox.b = tall ? 440 : 318;
      hbox.l = tall ? 100 : 64;
      xsH = lin(0, 1.5, hbox.l, hbox.r);
      const res = st.view === 'res';
      const base = z => res ? M.distModulus(z, 0, 0) : 0;
      const ys = res ? lin(-1.0, 0.5, hbox.b, hbox.t) : lin(32, 46, hbox.b, hbox.t);
      frame(hub, hbox, xsH, ys, {
        xTicks: ticks(0, 1.5, 8).map(v => ({v, label: num(v, 1)})),
        yTicks: res ? numTicks(-1, 0.5, 6, 2) : numTicks(32, 46, 7, 0),
        xLabel: '적색 편이 z (클수록 멀고 더 과거)',
        yLabel: res ? (tall ? '등속 팽창과의 차이' : '등속 팽창보다 어둡다 (+) / 밝다 (−)') : '거리 지수 m − M'
      });
      const curve = (om, ol, attrs) => {
        const pts = [];
        for (let i = 1; i <= 150; i++) { const z = 0.01 + 1.49 * i / 150; pts.push([xsH(z), ys(M.distModulus(z, om, ol) - base(z))]); }
        el('path', Object.assign({d: pathOf(pts), fill: 'none'}, attrs), hub);
      };
      refs.forEach(r => { const m = M.MODELS[r.k]; curve(m.om, m.ol, {stroke: r.color, 'stroke-width': r.width, 'stroke-dasharray': r.dash}); });
      const my = mine();
      curve(my.om, my.ol, {stroke: 'var(--mine)', 'stroke-width': 4.5, opacity: 0.8});
      M.SN_DATA.forEach(([z, mu]) => el('circle', {cx: xsH(z), cy: ys(mu - base(z)), r: small() ? 6 : 4.2, fill: '#14283a', stroke: '#fff', 'stroke-width': 1}, hub));
      // 같은 z 에서 비교하는 세로선
      const x = xsH(st.z);
      el('line', {x1: x, x2: x, y1: hbox.t, y2: hbox.b, stroke: '#c2581c', 'stroke-width': 2, 'stroke-dasharray': '6 4'}, hub);
      el('text', {x: Math.min(x + 6, hbox.r - 60), y: hbox.t + 14, class: 'annot', fill: '#c2581c'}, hub, `z = ${num(st.z, 2)}`);
      const muD = M.distModulus(st.z, 1, 0), muA = M.distModulus(st.z, 0.3, 0.7);
      [[muD, 'var(--decel)'], [muA, 'var(--accel)']].forEach(([mu, c]) => el('circle', {cx: x, cy: ys(mu - base(st.z)), r: 6, fill: '#fff', stroke: c, 'stroke-width': 3}, hub));
      const near = M.SN_DATA.filter(([z]) => Math.abs(z - st.z) < 0.07);
      let txt;
      if (near.length) {
        const obs = near.reduce((a, [z, mu]) => a + mu - M.distModulus(z, 1, 0), 0) / near.length;
        const ratioB = 10 ** (-0.4 * obs), ratioR = 10 ** (obs / 5);
        txt = `z = ${num(st.z, 2)} 근처 초신성 ${near.length}개는 감속 팽창 모형의 예상보다 평균 <b>${num(obs, 2)}등급 ${obs >= 0 ? '어둡습니다' : '밝습니다'}</b>.
          M이 같으니 m이 크다 = 겉보기 밝기가 ${Math.round(ratioB * 100)}%로 <b>어둡다</b> → 예상보다 <b>${Math.round((ratioR - 1) * 100)}% 더 멀다</b> → 우주가 예상보다 많이 팽창했다 → <b>가속 팽창</b>.`;
      } else txt = `z = ${num(st.z, 2)} 근처에는 관측점이 없습니다. 그래프를 눌러 점이 있는 곳으로 옮겨 보세요.`;
      if (!res) txt += ' 곡선 사이의 차이가 작아 보이면 <b>차이 확대</b>를 눌러 보세요.';
      else txt += ' 적색 편이가 작을 때(최근)는 모형끼리 차이가 거의 없고, 클수록 벌어집니다.';
      $('hubble-insight').innerHTML = txt;
    }
    function renderFit() {
      $('ol-out').textContent = `${num(st.ol, 2)} (물질 ${num(1 - st.ol, 2)})`;
      const list = [...refs.map(r => ({...M.MODELS[r.k], color: r.color})), {...mine(), name: `내 모형 (Ω<sub>Λ</sub> = ${num(st.ol, 2)})`, color: 'var(--mine)'}]
        .map(m => ({...m, rms: M.fitStats(m.om, m.ol).rms}));
      const best = Math.min(...list.map(m => m.rms)), worst = Math.max(...list.map(m => m.rms));
      $('fit').innerHTML = list.map(m => `<div class="f ${m.rms === best ? 'best' : ''}"><span style="color:${m.color}">●</span> ${m.name}
        <strong>${num(m.rms, 3)}등급</strong><span class="micro">관측점과 평균 어긋남</span><div class="bar"><span style="width:${(100 * (1 - (m.rms - best) / (worst - best + 1e-9) * 0.85)).toFixed(0)}%"></span></div></div>`).join('');
    }

    const his = $('history'), sbox = {l: 64, r: 622, t: 16, b: 240};
    let xsS, ysS;
    function renderHistory() {
      clear(his);
      const tall = small();
      his.setAttribute('viewBox', `0 0 640 ${tall ? 420 : 300}`);
      sbox.b = tall ? 345 : 240;
      sbox.l = tall ? 96 : 64;
      xsS = lin(-160, 60, sbox.l, sbox.r);
      ysS = lin(0, 1.45, sbox.b, sbox.t);
      frame(his, sbox, xsS, ysS, {
        xTicks: (tall ? [-120, -60, 0, 40] : [-140, -100, -60, -20, 0, 40]).map(v => ({v, label: v === 0 ? '현재' : `${v > 0 ? '+' : '−'}${Math.abs(v)}억`})),
        yTicks: [0, 0.5, 1].map(v => ({v, label: num(v, 1)})), xLabel: '현재로부터의 시간 (년)', yLabel: tall ? '우주의 상대적 크기' : '우주의 상대적 크기 (현재 = 1)'
      });
      const models = [...refs.filter(r => r.k !== 'coast').map(r => ({...M.MODELS[r.k], color: r.color, dash: r.dash, width: r.width})),
        {...mine(), color: 'var(--mine)', dash: '', width: 4.5}];
      let my;
      models.forEach((m, i) => {
        const h = M.expansionHistory(m.om, m.ol, 1.45);
        const pts = [[xsS(-h.age), ysS(0)], ...h.pts.map(p => [xsS(p.t - h.age), ysS(p.a)])].filter(p => p[0] <= sbox.r + 1);
        el('path', {d: pathOf(pts), fill: 'none', stroke: m.color, 'stroke-width': m.width, 'stroke-dasharray': m.dash, opacity: i === models.length - 1 ? 0.85 : 1}, his);
        if (i === models.length - 1) my = h;
      });
      el('line', {x1: xsS(0), x2: xsS(0), y1: sbox.t, y2: sbox.b, stroke: '#14283a', 'stroke-dasharray': '4 4'}, his);
      el('circle', {cx: xsS(-my.age), cy: ysS(0), r: 5, fill: 'var(--mine)'}, his);
      el('text', {x: xsS(-my.age) + 8, y: ysS(0) - 8, class: 'annot', fill: 'var(--mine)'}, his, `대폭발 (약 ${Math.round(my.age)}억 년 전)`);
      if (my.lookback !== null) {
        const x = xsS(-my.lookback), y = ysS(my.aAcc);
        el('line', {x1: x, x2: x, y1: sbox.t, y2: sbox.b, stroke: 'var(--mine)', 'stroke-dasharray': '6 4'}, his);
        el('circle', {cx: x, cy: y, r: 6, fill: '#fff', stroke: 'var(--mine)', 'stroke-width': 3}, his);
        el('text', {x: x - 8, y: y - 12, 'text-anchor': 'end', class: 'annot', fill: 'var(--mine)'}, his, `감속 → 가속 (약 ${Math.round(my.lookback)}억 년 전)`);
      }
      $('history-insight').innerHTML = my.lookback === null
        ? `내 모형처럼 암흑 에너지가 없으면 우주는 <b>계속 감속 팽창</b>합니다(곡선이 점점 완만해짐). 이 모형의 우주 나이는 약 ${Math.round(my.age)}억 년으로, 가장 오래된 별(약 130억 년)보다도 젊어지는 모순이 생깁니다. 감속 팽창도 우주가 작아지는 것이 아니라 커지는 빠르기가 줄어드는 것입니다.`
        : `내 모형(Ω<sub>Λ</sub> = ${num(st.ol, 2)})의 우주 나이는 약 <b>${Math.round(my.age)}억 년</b>입니다. 처음에는 물질의 중력 때문에 <b>감속 팽창</b>(곡선이 점점 완만)하다가 약 <b>${Math.round(my.lookback)}억 년 전</b>부터 암흑 에너지의 영향이 커져 <b>가속 팽창</b>(곡선이 점점 가팔라짐)합니다.`;
    }

    let last = null;
    function tick(now) {
      if (current === 'cosmos' && !document.hidden) {
        const dt = last === null ? 0 : (now - last) / 1000;
        if (st.mode === 'accrete') {
          st.mass = Math.min(1.4, st.mass + dt * 0.09);
          if (st.mass >= 1.4) { st.mode = 'boom'; st.boomT = now; $('sn-play').textContent = '↺ 다시 하기'; }
        }
        drawScene(now);
        last = now;
      } else last = null;
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
    function render() { renderDistance(); renderHubble(); renderFit(); renderHistory(); drawScene(performance.now()); }
    return {render};
  })();

  show((location.hash || '').slice(1) || 'read');
  let resizeTimer;
  window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => stations[current].render(), 150); });
  window.addEventListener('hashchange', () => { const h = location.hash.slice(1); if (h && h !== current) show(h); });
})();
