/* 성단 C-M도 실험실 — 네 실험이 같은 모형(cluster-cmd-model.js)과 실제 자료(cluster-cmd-data.js)를 쓴다. */
(() => {
  'use strict';
  const M = window.ClusterCmdModel, $ = id => document.getElementById(id);
  const NS = 'http://www.w3.org/2000/svg';
  const reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

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
    f.d = [d0, d1];
    return f;
  }
  // 음수는 수학 기호 −로. -0.00 같은 표기는 피한다.
  function num(v, d = 2) {
    const s = Math.abs(v).toFixed(d);
    return (v < 0 && +s !== 0 ? '−' : '') + s;
  }
  // 색지수처럼 부호를 늘 붙여 쓰는 값 (+0.65, −0.12, 0.00)
  const sgn = (v, d = 2) => (v > 0 && +Math.abs(v).toFixed(d) !== 0 ? '+' : '') + num(v, d);
  const tickNum = v => num(v, Number.isInteger(+v.toFixed(6)) ? 0 : 1);
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
  // 분수는 분자 위, 분모 아래로 쌓아 쓴다(수업 자료 제작 기준).
  const frac = (a, b) => `<span class="frac"><span>${a}</span><span>${b}</span></span>`;
  // 그래프를 누르고 끄는 동작. accept(e)가 false면 시작하지 않는다(세로 스크롤은 브라우저에 맡김).
  function onDrag(target, handler, accept) {
    let active = null;
    target.addEventListener('pointerdown', e => {
      if (accept && !accept(e)) return;
      active = e.pointerId;
      try { target.setPointerCapture(e.pointerId); } catch (_) {}
      handler(e, 'start');
    });
    target.addEventListener('pointermove', e => { if (active === e.pointerId) handler(e, 'move'); });
    const end = e => { if (active === e.pointerId) { active = null; handler(e, 'end'); } };
    target.addEventListener('pointerup', end);
    target.addEventListener('pointercancel', end);
  }

  // 'm_V', 'M_V' → 기울인 m·M + 아래 첨자 V
  function richLabel(node, str) {
    str.split(/([mM])_V/).forEach((p, i) => {
      if (i % 2 === 0) { if (p) node.appendChild(document.createTextNode(p)); }
      else { el('tspan', {'font-style': 'italic'}, node, p); el('tspan', {'baseline-shift': 'sub', 'font-size': '72%'}, node, 'V'); }
    });
    return node;
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
      el('text', {x, y: box.b + (o.tall ? 26 : 18), 'text-anchor': 'middle', class: 'tick'}, g, t.label);
    });
    el('line', {x1: box.l, x2: box.l, y1: box.t, y2: box.b, 'stroke-width': 1.2}, g);
    el('line', {x1: box.l, x2: box.r, y1: box.b, y2: box.b, 'stroke-width': 1.2}, g);
    if (o.xLabel) el('text', {x: (box.l + box.r) / 2, y: box.b + (o.tall ? 54 : 38), 'text-anchor': 'middle', class: 'axis-label'}, g, o.xLabel);
    if (o.yLabel) {
      const yx = o.yLabelX || (o.tall ? 26 : 16);
      richLabel(el('text', {x: yx, y: (box.t + box.b) / 2, transform: `rotate(-90 ${yx} ${(box.t + box.b) / 2})`, 'text-anchor': 'middle', class: 'axis-label'}, g), o.yLabel);
    }
    return g;
  }
  const BV_LABEL = '색지수 (B − V)';
  const bvTicks = (lo, hi, step) => {
    const out = [];
    for (let v = lo; v <= hi + 1e-9; v += step) out.push({v: +v.toFixed(2), label: tickNum(+v.toFixed(2))});
    return out;
  };
  const magTicks = (lo, hi, step) => {
    const out = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push({v, label: tickNum(v)});
    return out;
  };
  // 점 여러 개를 색깔별 path 하나로 (2356개도 가볍게)
  function dots(parent, pts, xs, ys, box, r, colourOf, attrs) {
    const bins = new Map();
    for (const p of pts) {
      const x = xs(p.bv), y = ys(p.V);
      if (x < box.l - 0.5 || x > box.r + 0.5 || y < box.t - 0.5 || y > box.b + 0.5) continue;
      const c = colourOf(p);
      let s = bins.get(c);
      if (!s) bins.set(c, s = []);
      s.push(`M${(x - r).toFixed(1)} ${y.toFixed(1)}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`);
    }
    bins.forEach((d, c) => el('path', Object.assign({d: d.join(''), fill: c}, attrs || {}), parent));
  }
  const binColour = p => M.rgbCss(M.chartRGB(Math.round(p.bv * 10) / 10));

  // ── 별 그림 (캔버스) ──────────────────────────────────────────
  function sizeCanvas(cv) {
    const rect = cv.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(16, Math.round(rect.width * dpr)), h = Math.max(16, Math.round(rect.height * dpr));
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    return {w, h, dpr, cssW: rect.width, cssH: rect.height};
  }
  // stars: [{x, y (0~1), V, bv}], o: {limit, vref, size, glow, marks}
  function drawSky(cv, stars, o) {
    const {w, h, dpr} = sizeCanvas(cv), ctx = cv.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    const bg = ctx.createRadialGradient(w * 0.5, h * 0.45, 0, w * 0.5, h * 0.45, Math.hypot(w, h) * 0.6);
    bg.addColorStop(0, '#1a3653'); bg.addColorStop(0.75, '#0f2235'); bg.addColorStop(1, '#0a1828');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    const k = Math.min(w, h * 1.45) / 640 * (o.size || 1);
    ctx.globalCompositeOperation = 'lighter';
    if (o.glow) {   // 구상 성단 한가운데: 너무 빽빽해 하나하나 보이지 않는 별빛
      const R = (o.glowR || 0.14) * Math.min(w, h), g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, R);
      g.addColorStop(0, `rgba(255,226,182,${(0.5 * o.glow).toFixed(3)})`);
      g.addColorStop(0.4, `rgba(255,214,160,${(0.18 * o.glow).toFixed(3)})`);
      g.addColorStop(1, 'rgba(255,214,160,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    }
    const list = stars.filter(s => s.V <= o.limit).sort((a, b) => b.V - a.V), pos = [];
    for (const s of list) {
      const f = 10 ** (-0.4 * (s.V - o.vref));
      const rc = Math.max(0.65 * dpr, (0.55 + 5.4 * f ** 0.3) * k);
      const c = M.skyRGB(s.bv), x = s.x * w, y = s.y * h;
      if (f > 0.003) {
        const gr = rc * (3 + 2 * f ** 0.25), g = ctx.createRadialGradient(x, y, 0, x, y, gr);
        g.addColorStop(0, M.rgbCss(c, Math.min(0.55, 0.6 * f ** 0.2)));
        g.addColorStop(1, M.rgbCss(c, 0));
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(x, y, gr, 0, 2 * Math.PI); ctx.fill();
      }
      if (f > 0.2) {   // 밝은 별의 십자 빛살
        ctx.strokeStyle = M.rgbCss(c, 0.45); ctx.lineWidth = Math.max(1, 0.9 * k);
        const L = rc * 5;
        ctx.beginPath(); ctx.moveTo(x - L, y); ctx.lineTo(x + L, y); ctx.moveTo(x, y - L); ctx.lineTo(x, y + L); ctx.stroke();
      }
      ctx.fillStyle = M.rgbCss(c, Math.min(1, 0.3 + 0.62 * f ** 0.15));
      ctx.beginPath(); ctx.arc(x, y, rc, 0, 2 * Math.PI); ctx.fill();
      pos.push({s, x: x / dpr, y: y / dpr, r: rc / dpr});
    }
    ctx.globalCompositeOperation = 'source-over';
    // 고른 별 표시
    (o.marks || []).forEach(m => {
      const x = m.s.x * w, y = m.s.y * h, rr = 11 * dpr;
      ctx.strokeStyle = '#7fd6ea'; ctx.lineWidth = 2 * dpr;
      ctx.beginPath(); ctx.arc(x, y, rr, 0, 2 * Math.PI); ctx.stroke();
      ctx.font = `800 ${13 * dpr}px "Pretendard","Apple SD Gothic Neo","Malgun Gothic",sans-serif`;
      ctx.lineWidth = 3 * dpr; ctx.strokeStyle = '#0f2235'; ctx.fillStyle = '#ffffff';
      const tx = Math.min(w - 16 * dpr, x + rr + 2 * dpr), ty = Math.max(14 * dpr, y - rr + 2 * dpr);
      ctx.strokeText(m.label, tx, ty); ctx.fillText(m.label, tx, ty);
    });
    return pos;
  }
  function nearestStar(pos, x, y, tol) {
    let best = null, bd = Infinity;
    for (const p of pos) {
      const d = Math.hypot(p.x - x, p.y - y) - p.r * 0.6;
      if (d < bd) { bd = d; best = p; }
    }
    return bd <= tol ? best : null;
  }
  // 그림 속 별의 자리: 플레이아데스 밝은 별 9개는 실제 배치, 나머지는 그림을 위해 흩뿌린다.
  function fieldM45(seed, aspect) {
    const r = M.rng(seed), W = 150, H = W / aspect, cx = 7, cy = 7;
    return M.M45.map(s => {
      if (s.sx !== undefined) return Object.assign({}, s, {x: 0.5 + (s.sx - cx) / W, y: 0.5 - (s.sy - cy) / H});
      const spread = Math.min(0.25, 0.1 + 0.012 * (s.V - 4));
      let x, y;
      do { x = 0.5 + spread * M.gauss(r); y = 0.5 + spread * aspect * M.gauss(r); } while (x < 0.025 || x > 0.975 || y < 0.03 || y > 0.97);
      return Object.assign({}, s, {x, y});
    });
  }
  // 구상 성단: 가운데로 갈수록 빽빽한 공 모양 (Plummer 분포)
  function fieldM3(seed, aspect, a, stars, keep) {
    const r = M.rng(seed), out = [];
    for (const s of stars || M.M3) {
      if (keep !== undefined && r() > keep) continue;
      let x, y;
      do {
        const u = r(), R = a * Math.sqrt(u / (1 - u)), th = 2 * Math.PI * r();
        x = 0.5 + R * Math.cos(th); y = 0.5 + R * Math.sin(th) * aspect;
      } while (x < 0.02 || x > 0.98 || y < 0.02 || y > 0.98);
      out.push(Object.assign({}, s, {x, y}));
    }
    return out;
  }
  const brightest = stars => Math.min(...stars.map(s => s.V));

  // ── ○/× 문항 상자 ────────────────────────────────────────────
  const LET = ['ㄱ', 'ㄴ', 'ㄷ', 'ㄹ'];
  function quizBox(container, opts = {}) {
    const st = {items: [], ans: [], checked: false};
    function set(items) { st.items = items; st.ans = items.map(() => null); st.checked = false; draw(); }
    function draw() {
      const ready = st.ans.every(a => a !== null);
      const right = st.items.filter((it, i) => st.ans[i] === it[1]).length;
      const answer = st.items.map((it, i) => it[1] ? LET[i] : null).filter(Boolean).join(', ') || '없음';
      container.innerHTML = st.items.map((it, i) => {
        const a = st.ans[i], cls = st.checked ? (a === it[1] ? 'right' : 'wrong') : '';
        return `<div class="item ${cls}"><span><b>${LET[i]}.</b> ${it[0]}</span>` +
          `<span class="ox" role="group" aria-label="${LET[i]} 판단">` +
          `<button type="button" data-i="${i}" data-v="1" aria-pressed="${a === true}" aria-label="${LET[i]} 옳다" ${st.checked ? 'disabled' : ''}>○</button>` +
          `<button type="button" data-i="${i}" data-v="0" aria-pressed="${a === false}" aria-label="${LET[i]} 옳지 않다" ${st.checked ? 'disabled' : ''}>×</button></span>` +
          (st.checked ? `<span class="why"><b>${it[1] ? '○' : '×'}</b> ${it[2]}</span>` : '') + '</div>';
      }).join('') +
        (st.checked ? `<div class="feedback ${right === st.items.length ? 'ok' : 'no'}"><b>${right === st.items.length ? '모두 맞혔어요!' : `${st.items.length}개 중 ${right}개를 맞혔어요.`}</b> 옳은 것: ${answer}${opts.extra ? ' · ' + opts.extra() : ''}</div>` : '') +
        `<div class="bar"><button type="button" class="primary compact" data-act="check" ${!ready || st.checked ? 'disabled' : ''}>채점하기</button>` +
        `<button type="button" class="compact" data-act="retry">다시 풀기</button>` +
        (opts.next ? '<button type="button" class="compact" data-act="next">🎲 다른 문제</button>' : '') +
        `<span class="score">${st.checked ? '' : ready ? '' : '문장마다 ○ 또는 ×를 골라 보세요.'}${opts.score ? ' ' + opts.score() : ''}</span></div>`;
      // 다시 그린 뒤에도 키보드 초점이 같은 단추에 남도록
      const refocus = sel => { const n = container.querySelector(sel); if (n) n.focus(); };
      container.querySelectorAll('[data-i]').forEach(b => b.addEventListener('click', () => {
        const i = b.dataset.i, v = b.dataset.v;
        st.ans[+i] = v === '1'; draw();
        refocus(`[data-i="${i}"][data-v="${v}"]`);
      }));
      container.querySelector('[data-act=check]').addEventListener('click', () => {
        st.checked = true;
        if (opts.onCheck) opts.onCheck(st.items.filter((it, i) => st.ans[i] === it[1]).length, st.items.length);
        draw();
        refocus('[data-act=retry]');
      });
      container.querySelector('[data-act=retry]').addEventListener('click', () => { set(st.items); refocus('[data-i="0"][data-v="1"]'); });
      const nx = container.querySelector('[data-act=next]');
      if (nx) nx.addEventListener('click', opts.next);
    }
    return {set, draw};
  }

  // ── 실험 전환 ─────────────────────────────────────────────
  const stations = {};
  let current = 's1';
  function show(name) {
    if (!stations[name]) name = 's1';
    if (current !== name && stations[current] && stations[current].leave) stations[current].leave();
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

  // ═══════════════ 01 두 가지 성단 ═══════════════
  stations.s1 = (() => {
    const LIM = {open: [4.3, 18], glob: [13.6, 22.7]};
    const st = {kind: 'open', t: {open: 1, glob: 1}, quiz: null, score: [0, 0]};
    const ASPECT = 16 / 11, fields = {};
    const field = kind => fields[kind] || (fields[kind] = kind === 'open' ? fieldM45(11, ASPECT) : fieldM3(3, ASPECT, 0.07));
    const vref = {open: brightest(M.M45), glob: brightest(M.M3)};
    const limit = () => LIM[st.kind][0] + st.t[st.kind] * (LIM[st.kind][1] - LIM[st.kind][0]);

    document.querySelectorAll('#s1-kinds [data-kind]').forEach(b => b.addEventListener('click', () => {
      st.kind = b.dataset.kind; if (st.quiz) st.quiz = null; render();
    }));
    $('s1-limit').addEventListener('input', e => { st.t[st.kind] = +e.target.value; render(); });
    $('s1-quiz').addEventListener('click', () => { if (st.quiz) st.quiz = null; else newQuiz(); render(); });
    const quizEl = document.createElement('div');
    quizEl.className = 'quiz';
    const quiz = quizBox(quizEl, {
      next: () => { newQuiz(true); render(); },
      onCheck: (ok, n) => { st.score[0] += ok === n ? 1 : 0; st.score[1]++; },
      score: () => st.score[1] ? `· 모두 맞힌 문제 ${st.score[0]} / ${st.score[1]}` : ''
    });

    function quizOpen(seed) {
      const r = M.rng(seed), keep = 0.55 + 0.4 * r(), cx = 0.4 + 0.2 * r(), cy = 0.4 + 0.2 * r(), sg = 0.13 + 0.07 * r();
      const out = [];
      for (const s of M.M45) {
        if (r() > keep && s.V > 5) continue;
        const k = s.V < 7 ? 0.65 : 1;
        let x, y;
        do { x = cx + sg * k * M.gauss(r); y = cy + sg * k * M.gauss(r); } while (x < 0.03 || x > 0.97 || y < 0.03 || y > 0.97);
        out.push(Object.assign({}, s, {x, y}));
      }
      return out;
    }
    function newQuiz(random) {
      const lesson = !random && st.score[1] === 0;
      const seed = (Date.now() + 7919 * st.score[1]) >>> 0;
      const q = lesson ? M.q1Lesson() : M.q1Random(seed);
      const r = M.rng(seed);
      q.pics = {};
      q.pics[q.g.glob] = {type: 'glob', stars: fieldM3(seed + 2, 1, 0.05 + 0.035 * r(), M.M3, 0.65 + 0.35 * r())};
      q.pics[q.g.open] = {type: 'open', stars: quizOpen(seed + 3)};
      st.quiz = q;
      quiz.set(q.items);
    }

    function renderSky() {
      const kind = st.kind, lim = limit(), stars = field(kind);
      drawSky($('s1-sky'), stars, {limit: lim, vref: vref[kind], size: kind === 'open' ? 1.05 : 0.8,
        glow: kind === 'glob' ? 0.35 + 0.65 * st.t.glob : 0, glowR: 0.16});
      const vis = stars.filter(s => s.V <= lim);
      const blue = vis.filter(s => s.bv < 0).length, white = vis.filter(s => s.bv >= 0 && s.bv < 0.5).length, red = vis.length - blue - white;
      const ic = M.integratedColour(vis);
      $('s1-limit-out').textContent = `${num(lim, 1)}등급`;
      $('s1-count').textContent = `${vis.length}개`;
      const c = M.rgbCss(M.chartRGB(ic));
      $('s1-colour').innerHTML = `<span class="swatch" style="background:${c}"></span>${ic < 0.3 ? '푸른색' : '붉은색'}`;
      const n = Math.max(1, vis.length);
      $('s1-mix').innerHTML = `<i style="width:${100 * blue / n}%;background:#3d6fe0"></i><i style="width:${100 * white / n}%;background:#c8d4e6"></i><i style="width:${100 * red / n}%;background:#e07428"></i>`;
      $('s1-mix-legend').innerHTML = `<span><i class="dot" style="background:#3d6fe0"></i>푸른 별 ${blue}</span><span><i class="dot" style="background:#c8d4e6"></i>흰 별 ${white}</span><span><i class="dot" style="background:#e07428"></i>노랗고 붉은 별 ${red}</span>`;
      $('s1-sky').setAttribute('aria-label', `${kind === 'open' ? '산개 성단 M45' : '구상 성단 M3'} 그림: ${num(lim, 1)}등급보다 밝은 별 ${vis.length}개, 푸른 별 ${blue}개, 노랗고 붉은 별 ${red}개`);
      return {vis, blue, white, red, ic, lim};
    }

    function renderSide(info) {
      const on = k => k === st.kind ? (k === 'glob' ? 'on warm' : 'on') : '';
      const rows = [
        ['별의 수', '수백~수천 개', '수만~수십만 개'],
        ['모양', '엉성하게 흩어짐', '공 모양으로 빽빽'],
        ['사는 곳', '우리은하 원반', '헤일로'],
        ['나이', '젊다', '100억 년 이상'],
        ['무거운 원소', '많다 (종족 Ⅰ)', '적다 (종족 Ⅱ)'],
        ['전체 색', '푸른색', '붉은색']
      ];
      const ex = st.kind === 'open'
        ? `<dl class="facts"><dt>보기</dt><dd>M45 플레이아데스 (황소자리)</dd><dt>거리</dt><dd>약 440광년 (136 pc)</dd><dt>나이</dt><dd>약 1억 3천만 년</dd><dt>그림의 별</dt><dd>관측된 회원 별 406개</dd></dl>`
        : `<dl class="facts"><dt>보기</dt><dd>M3 (사냥개자리 성단)</dd><dt>거리</dt><dd>약 10400 pc</dd><dt>나이</dt><dd>약 110억 년</dd><dt>그림의 별</dt><dd>관측 자료 2356개 (실제로는 수십만 개)</dd></dl>`;
      $('s1-side').innerHTML = `<table class="ref-table compare"><thead><tr><th></th><th class="${on('open')}">산개 성단</th><th class="${on('glob')}">구상 성단</th></tr></thead><tbody>${
        rows.map(r => `<tr><th>${r[0]}</th><td class="${on('open')}">${r[1]}</td><td class="${on('glob')}">${r[2]}</td></tr>`).join('')}</tbody></table>
        <p class="why"><b>색은 왜 다를까?</b> ${st.kind === 'open'
          ? '산개 성단은 질량이 큰 청색 별들이 질량이 작은 적색 별들보다 매우 밝기 때문에 전체적으로 푸른색을 띱니다.'
          : '구상 성단은 질량이 태양보다 작은 주계열성과 거성들이 주로 있어 전체적으로 붉은색을 띱니다.'}</p>
        ${ex}
        <p class="micro">종족: 은하의 원반에서 태어난 젊은 별은 종족 Ⅰ, 은하가 생겨날 때 원시 구름에서 함께 태어나 팽대부와 헤일로에 분포하는 늙은 별은 종족 Ⅱ로 나눕니다 (교과서 94쪽).</p>`;
    }

    // 우리은하 옆모습 (모식도)
    const gal = $('s1-galaxy'), galDots = [];
    function renderGalaxy() {
      clear(gal); galDots.length = 0;
      const tall = small(), H = tall ? 430 : 330;
      gal.setAttribute('viewBox', `0 0 640 ${H}`);
      const cx = 320, cy = tall ? 205 : 158, rx = 300, ry = tall ? 178 : 140;
      el('ellipse', {cx, cy, rx, ry, fill: '#f6f0ff', stroke: '#b9a6e8', 'stroke-width': 2, 'stroke-dasharray': '8 6'}, gal);
      el('ellipse', {cx, cy, rx: 286, ry: 11, fill: '#dce6fb', stroke: '#8fa8e8', 'stroke-width': 1.5}, gal);
      el('ellipse', {cx, cy, rx: 56, ry: 34, fill: '#fbe3b8', stroke: '#e5b260', 'stroke-width': 1.5}, gal);
      const r = M.rng(5);
      for (let i = 0; i < 22; i++) {
        let x;
        do { x = cx + (r() * 2 - 1) * 278; } while (Math.abs(x - cx) < 66 || Math.abs(x - (cx + 150)) < 14);
        galDots.push({kind: 'open', x, y: cy + 3.5 * M.gauss(r)});
      }
      while (galDots.length < 22 + 30) {
        const a = 2 * Math.PI * r(), q = 0.3 + 0.62 * Math.sqrt(r());
        const x = cx + rx * q * Math.cos(a), y = cy + ry * q * Math.sin(a);
        if (Math.abs(y - cy) < 26 || (Math.abs(x - cx) < 70 && Math.abs(y - cy) < 46)) continue;
        if (Math.abs(x - (cx + 125)) < 40 && y < cy - ry * 0.55) continue;   // M3 자리 비워 두기
        galDots.push({kind: 'glob', x, y});
      }
      const on = st.kind;
      galDots.forEach(d => {
        const sel = d.kind === on;
        el('circle', {cx: d.x.toFixed(1), cy: d.y.toFixed(1), r: d.kind === 'open' ? (sel ? 5.5 : 4) : (sel ? 7 : 5.5),
          fill: d.kind === 'open' ? '#3d6fe0' : '#f2a33a', stroke: d.kind === 'open' ? '#fff' : '#c9781c', 'stroke-width': 1.5,
          opacity: sel ? 1 : 0.35}, gal);
      });
      // 태양과 두 성단
      const sx = cx + 150;
      el('path', {d: `M${sx} ${cy - 11}l3.2 6.5 7.2 1-5.2 5 1.3 7.1-6.5-3.4-6.5 3.4 1.3-7.1-5.2-5 7.2-1z`, fill: '#e8553c', stroke: '#fff', 'stroke-width': 1.2}, gal);
      el('text', {x: sx, y: cy + 30, 'text-anchor': 'middle', class: 'annot halo', fill: '#c2410c'}, gal, '태양');
      const m45 = {x: sx + 16, y: cy - 2}, m3 = {x: cx + 125, y: cy - ry * 0.74};
      el('circle', {cx: m45.x, cy: m45.y, r: 6.5, fill: '#3d6fe0', stroke: '#14283a', 'stroke-width': 2, opacity: on === 'open' ? 1 : 0.45}, gal);
      el('circle', {cx: m3.x, cy: m3.y, r: 8.5, fill: '#f2a33a', stroke: '#14283a', 'stroke-width': 2, opacity: on === 'glob' ? 1 : 0.45}, gal);
      el('text', {x: m45.x + 12, y: m45.y - 14, class: 'annot halo', fill: '#1e3a5f', opacity: on === 'open' ? 1 : 0.6}, gal, 'M45 · 136 pc');
      el('text', {x: m3.x + 14, y: m3.y + 5, class: 'annot halo', fill: '#7a4b0c', opacity: on === 'glob' ? 1 : 0.6}, gal, 'M3 · 10400 pc');
      galDots.push({kind: 'open', x: m45.x, y: m45.y}, {kind: 'glob', x: m3.x, y: m3.y});
      el('text', {x: cx, y: cy + 5, 'text-anchor': 'middle', class: 'annot', fill: '#a06a12'}, gal, '팽대부');
      el('text', {x: cx - 286, y: cy + 30, class: 'big-annot', fill: '#2f57c0'}, gal, '원반');
      el('text', {x: cx - 250, y: cy - ry + 34, class: 'big-annot', fill: '#7b5fc6'}, gal, '헤일로');
      const ly = H - 12;
      el('circle', {cx: 22, cy: ly - 5, r: 5.5, fill: '#3d6fe0'}, gal);
      el('text', {x: 34, y: ly, class: 'tick', fill: '#14283a'}, gal, '산개 성단');
      el('circle', {cx: tall ? 168 : 128, cy: ly - 5, r: 6.5, fill: '#f2a33a', stroke: '#c9781c', 'stroke-width': 1.5}, gal);
      el('text', {x: tall ? 182 : 141, y: ly, class: 'tick', fill: '#14283a'}, gal, '구상 성단');
      el('text', {x: 630, y: ly, 'text-anchor': 'end', class: 'tick'}, gal, tall ? '모식도 · 크기 비율 다름' : '모식도 · 원반 두께와 크기 비율은 실제와 다름');
    }
    gal.addEventListener('click', e => {
      const p = svgPoint(gal, e);
      let best = null, bd = 30;
      galDots.forEach(d => { const dd = Math.hypot(d.x - p.x, d.y - p.y); if (dd < bd) { bd = dd; best = d; } });
      if (best && best.kind !== st.kind) { st.kind = best.kind; st.quiz = null; render(); }
    });

    function renderInsight(info) {
      let t;
      if (st.quiz) {
        t = '모양을 먼저 보세요. <b>공 모양으로 빽빽하면 구상 성단</b>(헤일로, 100억 년 이상), <b>엉성하게 흩어져 있으면 산개 성단</b>(원반, 젊다)입니다.';
      } else if (st.kind === 'open') {
        t = '산개 성단은 우리은하 <b>원반</b>에서 무거운 원소가 많은 성간 물질로부터 생겨난 <b>젊은 별</b> 수백~수천 개의 무리입니다. ';
        const allBlue = info.vis.every(s => s.bv < 0.05);
        if (info.lim < 6.5) t += `가장 밝은 별 ${info.vis.length}개는 ${allBlue ? '모두' : '대부분'} <b>푸른 별</b>이라 성단이 푸르게 보입니다. 막대를 오른쪽으로 옮겨 어두운 별까지 보세요.`;
        else if (info.red > 1.5 * (info.blue + info.white)) t += `어두운 별까지 보면 노랗고 붉은 별이 ${info.vis.length}개 중 ${info.red}개로 훨씬 많습니다. 그래도 성단 전체의 빛은 <b>푸른색</b>입니다. 질량이 큰 청색 별이 질량이 작은 적색 별보다 매우 밝기 때문입니다.`;
        else t += `어두운 별까지 볼수록 노랗고 붉은 별이 늘어납니다(지금 ${info.red}개). 막대를 끝까지 옮겨 보세요. 성단 전체의 빛은 여전히 <b>푸른색</b>입니다.`;
      } else {
        t = '구상 성단은 우리은하 <b>헤일로</b>에서 100억 년 넘게 산 종족 Ⅱ 별 수만~수십만 개가 <b>공 모양</b>으로 빽빽하게 모인 무리입니다. ';
        if (info.lim < 15.2) t += '가장 밝은 별들은 대부분 노랗고 붉은 <b>거성</b>입니다. 그래서 성단이 붉게 보입니다. 막대를 오른쪽으로 옮겨 어두운 별까지 보세요.';
        else if (info.lim < 19.8) t += '조금 더 어두운 별까지 보면 별이 늘어나지만, 아직 보이는 별은 대부분 주계열을 떠난 거성입니다. 막대를 끝까지 옮겨 보세요.';
        else t += '어두운 별까지 보면 질량이 태양보다 작은 <b>주계열성</b>이 가장 많고, 가장 밝은 별은 <b>거성</b>입니다. 그래서 전체적으로 <b>붉은색</b>을 띱니다. 그림에는 관측 자료 2356개만 그렸지만 실제 M3에는 별이 수십만 개 있습니다.';
      }
      $('s1-insight').innerHTML = t;
    }

    function renderQuiz() {
      const q = st.quiz;
      ['가', '나'].forEach((name, i) => {
        const pic = q.pics[name], cv = $(i ? 's1-qb' : 's1-qa');
        drawSky(cv, pic.stars, {limit: 30, vref: brightest(pic.stars), size: pic.type === 'open' ? 1.1 : 0.85, glow: pic.type === 'glob' ? 0.9 : 0, glowR: 0.15});
      });
      $('s1-side-title').textContent = 'Q1 · 사진으로 성단 구별하기';
      $('s1-side').innerHTML = '';
      const stem = document.createElement('p');
      stem.className = 'qstem';
      stem.textContent = '(가)와 (나)는 구상 성단과 산개 성단을 순서 없이 나타낸 것이다. 옳은 것은 ○, 옳지 않은 것은 ×를 골라 보세요.';
      $('s1-side').append(stem, quizEl);
      quiz.draw();
    }

    function render() {
      setPressed($('s1-kinds'), 'data-kind', st.quiz ? '' : st.kind);
      $('s1-quiz').setAttribute('aria-pressed', String(!!st.quiz));
      $('s1-quiz').textContent = st.quiz ? '↩ 문제 닫기' : '🎲 사진으로 구별하기 (Q1)';
      $('s1-normal').hidden = !!st.quiz;
      $('s1-quizview').hidden = !st.quiz;
      $('s1-scene-title').textContent = st.quiz ? '(가)와 (나)는 어떤 성단일까?' : (st.kind === 'open' ? '산개 성단 M45 플레이아데스' : '구상 성단 M3');
      $('s1-limit').value = st.t[st.kind];
      renderGalaxy();
      if (st.quiz) { renderQuiz(); renderInsight(null); return; }
      $('s1-side-title').textContent = '산개 성단과 구상 성단';
      const info = renderSky();
      renderSide(info);
      renderInsight(info);
    }
    return {render};
  })();

  // ═══════════════ 02 색지수와 C-M도 ═══════════════
  stations.s2 = (() => {
    const N = M.NAMED;
    const STARS = [
      {id: 'rigel', name: '리겔', V: N.rigel.V, B: N.rigel.B, note: '오리온자리의 청백색 별'},
      {id: 'vega', name: '직녀성', V: N.vega.V, B: N.vega.B, note: '거문고자리 · 색지수 0의 기준'},
      {id: 'sun', name: M.SUN.name, V: M.SUN.V, B: M.bFromV(M.SUN.V, M.SUN.bv), note: '겉보기 등급 −26.7 (교과서)'},
      {id: 'betelgeuse', name: '베텔게우스', V: N.betelgeuse.V, B: N.betelgeuse.B, note: '오리온자리의 붉은 별'},
      {id: 'alcyone', name: '알키오네', V: N.alcyone.V, B: N.alcyone.B, note: 'M45에서 가장 밝은 별'},
      {id: 'q2c', name: 'Q2의 ㉢', V: 9.5, B: 10.0, note: 'V 9.5 · 색지수 0.5'}
    ];
    STARS.forEach(s => { s.bv = +(s.B - s.V).toFixed(2); });
    const SCALE_STARS = ['rigel', 'vega', 'sun', 'betelgeuse'];
    const st = {star: STARS[2], custom: null, cl: 'm45', picks: [], all: false, reveal: 1};

    const chips = $('s2-stars');
    STARS.forEach(s => {
      const b = document.createElement('button');
      b.type = 'button'; b.dataset.star = s.id;
      b.innerHTML = `${s.name}<span class="tag">${sgn(s.bv)}</span>`;
      b.addEventListener('click', () => { st.star = s; st.custom = null; renderColour(); });
      chips.appendChild(b);
    });
    const cur = () => st.custom || st.star;

    // ① 필터로 잰 별빛
    const spec = $('s2-spectrum'), bars = $('s2-bars');
    function renderSpectrum() {
      const s = cur(), tall = small();
      clear(spec);
      spec.setAttribute('viewBox', `0 0 640 ${tall ? 380 : 300}`);
      const box = {l: tall ? 40 : 34, r: 622, t: 30, b: tall ? 300 : 236};
      const xs = lin(300, 800, box.l, box.r), ys = lin(0, 1.08, box.b, box.t);
      frame(spec, box, xs, ys, {tall, xTicks: [300, 400, 500, 600, 700, 800].map(v => ({v, label: String(v)})), xLabel: '파장 (nm)'});
      el('text', {x: box.l + 4, y: box.t - 12, class: 'tick'}, spec, '빛의 상대적 세기');
      // 가시광선 띠
      const defs = el('defs', {}, spec), grad = el('linearGradient', {id: 's2-vis', x1: 0, x2: 1}, defs);
      [[380, '#7a3cff'], [440, '#3d6fe0'], [490, '#20b2c8'], [530, '#38c060'], [580, '#e6d23c'], [620, '#f08a30'], [700, '#d63a2a'], [750, '#8a1c1c']]
        .forEach(([l, c]) => el('stop', {offset: ((l - 380) / 370).toFixed(3), 'stop-color': c}, grad));
      el('rect', {x: xs(380), y: box.b - 7, width: xs(750) - xs(380), height: 7, fill: 'url(#s2-vis)', opacity: 0.9}, spec);
      // 필터 투과율
      const FC = {U: '#8a5cc2', B: '#3d6fe0', V: '#2e9e5b'};
      ['U', 'B', 'V'].forEach(f => {
        const pts = [];
        for (let l = 300; l <= 700; l += 4) pts.push([xs(l), ys(M.filterT(f, l))]);
        el('path', {d: pathOf(pts) + `L${xs(700)} ${box.b}L${xs(300)} ${box.b}Z`, fill: FC[f], opacity: 0.13}, spec);
        el('path', {d: pathOf(pts), fill: 'none', stroke: FC[f], 'stroke-width': 1.6, opacity: 0.7}, spec);
        const F = M.FILTERS[f];
        el('text', {x: xs(F.c), y: ys(F.peak) - 8, 'text-anchor': 'middle', class: 'big-annot', fill: FC[f], 'font-style': 'italic'}, spec, f);
      });
      // 별빛 곡선 (모양만, 가장 센 곳 = 0.95)
      const T = Math.max(3000, M.msTeff(s.bv)), raw = [];
      let mx = 0;
      for (let l = 300; l <= 800; l += 5) { const v = M.spectrum(l, T); raw.push([l, v]); mx = Math.max(mx, v); }
      const pts = raw.map(([l, v]) => [xs(l), ys(0.95 * v / mx)]);
      el('path', {d: pathOf(pts) + `L${xs(800)} ${box.b}L${xs(300)} ${box.b}Z`, fill: M.rgbCss(M.skyRGB(s.bv), 0.45)}, spec);
      el('path', {d: pathOf(pts), fill: 'none', stroke: '#14283a', 'stroke-width': 3}, spec);
      el('text', {x: box.r - 4, y: box.t - 12, 'text-anchor': 'end', class: 'annot'}, spec, `${s.name}의 별빛 (${M.colourName(s.bv)})`);
      el('text', {x: xs(565), y: box.b - 12, 'text-anchor': 'middle', class: 'tick halo'}, spec, '가시광선');
    }
    function renderBars() {
      const s = cur(), tall = small();
      clear(bars);
      bars.setAttribute('viewBox', `0 0 640 ${tall ? 200 : 150}`);
      const ratio = M.bOverV(s.bv), bH = ratio >= 1 ? 1 : ratio, vH = ratio >= 1 ? 1 / ratio : 1;
      const x0 = tall ? 200 : 170, W = tall ? 400 : 440, rowH = tall ? 58 : 44, y0 = tall ? 18 : 14;
      [['B 필터로 들어온 빛', bH, '#3d6fe0'], ['V 필터로 들어온 빛', vH, '#2e9e5b']].forEach(([name, v, c], i) => {
        const y = y0 + i * rowH;
        el('text', {x: x0 - 10, y: y + rowH * 0.42, 'text-anchor': 'end', class: 'annot', fill: c}, bars, name);
        el('rect', {x: x0, y: y + 4, width: W, height: rowH * 0.55, rx: 6, fill: '#edf1f3'}, bars);
        el('rect', {x: x0, y: y + 4, width: Math.max(2, W * v), height: rowH * 0.55, rx: 6, fill: c}, bars);
      });
      const sign = s.bv < -0.005 ? 'B로 더 밝다 → B 등급이 더 작다 → B − V < 0' : s.bv > 0.005 ? 'V로 더 밝다 → V 등급이 더 작다 → B − V > 0' : 'B와 V의 등급이 같다 → B − V = 0';
      el('text', {x: 320, y: y0 + 2 * rowH + (tall ? 30 : 22), 'text-anchor': 'middle', class: 'annot', fill: s.bv < -0.005 ? '#3d6fe0' : s.bv > 0.005 ? '#c2410c' : '#14283a'}, bars, sign);
    }

    // ② 색지수 눈금
    const scale = $('s2-scale');
    let sx;
    function renderScale() {
      const s = cur(), tall = small();
      clear(scale);
      scale.setAttribute('viewBox', `0 0 640 ${tall ? 300 : 230}`);
      const y = tall ? 150 : 118, x0 = 40, x1 = 600;
      sx = lin(-0.4, 2.0, x0, x1);
      const defs = el('defs', {}, scale), grad = el('linearGradient', {id: 's2-ci', x1: 0, x2: 1}, defs);
      for (let i = 0; i <= 12; i++) {
        const b = -0.4 + 2.4 * i / 12;
        el('stop', {offset: (i / 12).toFixed(3), 'stop-color': M.rgbCss(M.skyRGB(b))}, grad);
      }
      el('rect', {x: x0, y: y - 16, width: x1 - x0, height: 32, rx: 16, fill: 'url(#s2-ci)', stroke: '#2a3350', 'stroke-width': 1.5}, scale);
      [-0.4, 0, 0.4, 0.8, 1.2, 1.6, 2.0].forEach(b => {
        el('line', {x1: sx(b), x2: sx(b), y1: y + 17, y2: y + 25, stroke: '#14283a', 'stroke-width': 1.5}, scale);
        el('text', {x: sx(b), y: y + (tall ? 50 : 42), 'text-anchor': 'middle', class: 'tick', fill: '#14283a'}, scale, sgn(b, b === 0 ? 0 : 1));
      });
      el('line', {x1: sx(0), x2: sx(0), y1: y - 26, y2: y + 17, stroke: '#14283a', 'stroke-width': 2}, scale);
      // 실제 별 (리겔과 직녀성은 이름을 양옆으로 비켜 쓴다). 고른 별이면 주황색으로.
      SCALE_STARS.forEach(id => {
        const t = STARS.find(q => q.id === id), x = sx(t.bv), on = t === s;
        const ox = id === 'rigel' ? -46 : id === 'vega' ? 46 : 0, ly = y - (tall ? 76 : 62);
        el('line', {x1: x + ox * 0.7, y1: ly + 10, x2: x, y2: y - 10, stroke: on ? '#c2581c' : '#5f7282', 'stroke-width': on ? 2 : 1}, scale);
        el('circle', {cx: x, cy: y, r: 6.5, fill: '#fff', stroke: '#14283a', 'stroke-width': 2}, scale);
        el('text', {x: x + ox, y: ly - (tall ? 22 : 16), 'text-anchor': 'middle', class: on ? 'big-annot halo' : 'annot halo', fill: on ? '#c2581c' : undefined}, scale, t.name);
        el('text', {x: x + ox, y: ly + 2, 'text-anchor': 'middle', class: on ? 'annot halo' : 'tick halo', fill: on ? '#c2581c' : undefined}, scale, sgn(t.bv));
      });
      // 고른 별 ◆ (눈금에 이름이 없는 별만 이름을 따로 쓴다)
      const mx = sx(Math.max(-0.4, Math.min(2.0, s.bv)));
      el('path', {d: `M${mx} ${y - 30}l12 14-12 14-12-14z`, fill: '#c2581c', stroke: '#fff', 'stroke-width': 2}, scale);
      el('line', {x1: mx, x2: mx, y1: y - 2, y2: y + 16, stroke: '#c2581c', 'stroke-width': 3}, scale);
      if (!SCALE_STARS.includes(s.id)) el('text', {x: Math.max(70, Math.min(570, mx)), y: y - 36, 'text-anchor': 'middle', class: 'big-annot halo', fill: '#c2581c'}, scale, `${s.name} ${sgn(s.bv)}`);
      el('text', {x: x0, y: y + (tall ? 84 : 70), class: 'annot', fill: '#3d6fe0'}, scale, tall ? '← (−) 청색 · 고온' : '← (−) 청색 · 표면 온도 높다');
      el('text', {x: x1, y: y + (tall ? 84 : 70), 'text-anchor': 'end', class: 'annot', fill: '#c2410c'}, scale, tall ? '(+) 황색·적색 · 저온 →' : '(+) 황색·적색 · 표면 온도 낮다 →');
      el('text', {x: tall ? x0 - 30 : sx(0) - 60, y: y + (tall ? 116 : 96), class: 'tick'}, scale, '기준 0 = 표면 온도 10000 K인 백색 별(직녀성)');
    }
    onDrag(scale, (e, phase) => {
      if (phase === 'end') return;
      const p = svgPoint(scale, e);
      let bv = Math.round(sx.inv(p.x) * 100) / 100;
      bv = Math.max(-0.4, Math.min(2.0, bv));
      const near = STARS.find(q => SCALE_STARS.includes(q.id) && Math.abs(q.bv - bv) <= 0.015);
      if (near) { st.star = near; st.custom = null; }
      else st.custom = {id: 'mine', name: '내 별', V: 9.5, B: 9.5 + bv, bv, note: 'V 등급을 9.5로 놓은 별'};
      renderColour();
    });
    function renderColour() {
      const s = cur();
      setPressed(chips, 'data-star', st.custom ? '' : s.id);
      renderSpectrum(); renderBars(); renderScale();
      $('s2-V').textContent = num(s.V, 2);
      $('s2-B').textContent = num(s.B, 2);
      $('s2-BV').textContent = sgn(s.bv);
      $('s2-kind').textContent = `${M.colourName(s.bv)} 별 · ${M.tempWord(s.bv)}`;
      const paren = v => v < 0 ? `(${num(v, 2)})` : num(v, 2);
      $('s2-formula').innerHTML = `<span class="big">색지수 = <span class="b">B</span> − <span class="v">V</span> = ${num(s.B, 2)} − ${paren(s.V)} = ${sgn(s.bv)}</span><br>` +
        `거꾸로 쓰면 <span class="b">B</span> = <span class="v">V</span> + (B − V) = ${num(s.V, 2)} + ${s.bv < 0 ? `(${num(s.bv, 2)})` : num(s.bv, 2)} = <b>${num(s.B, 2)}</b> <span class="micro">· 기출에서는 B 등급을 m<sub>B</sub>, V 등급을 m<sub>V</sub>로 쓰기도 합니다.</span>`;
      let t;
      if (s.bv < -0.005) t = `<b>B 필터로 들어온 빛이 더 많습니다</b> → B로 더 밝다 → 등급은 작을수록 밝으므로 B 등급이 V 등급보다 작다 → 색지수 <b>(−)</b>. 표면 온도가 10000 K보다 높은 ${M.colourName(s.bv)} 별입니다.`;
      else if (s.bv <= 0.005) t = '두 필터로 잰 등급이 같습니다 → 색지수 <b>0</b>. 표면 온도가 10000 K인 백색 별(거문고자리 직녀성)이 색지수의 기준입니다.';
      else t = `<b>V 필터로 들어온 빛이 더 많습니다</b> → V로 더 밝다 → V 등급이 B 등급보다 작다 → 색지수 <b>(+)</b>. 표면 온도가 10000 K보다 낮은 ${M.colourName(s.bv)} 별입니다. 색지수가 클수록 표면 온도가 낮습니다.`;
      if (s.id === 'q2c') t += ' <b>Q2 ㄷ</b>: ㉢의 B 등급은 9.5 + 0.5 = 10.0입니다(9.0이 아님).';
      if (s.id === 'mine') t += ' (내 별의 V 등급은 9.5로 놓았습니다.)';
      $('s2-insight').innerHTML = t;
    }

    // ③ C-M도 찍기
    const sky2 = $('s2-sky'), cmd = $('s2-cmd'), fields2 = {};
    const RANGE = {m45: [2, 18], m3: [11, 23]};
    const field2 = cl => fields2[cl] || (fields2[cl] = cl === 'm45' ? fieldM45(21, 1) : fieldM3(8, 1, 0.075));
    let skyPos = [];
    document.querySelectorAll('#s2-cluster [data-cl]').forEach(b => b.addEventListener('click', () => {
      if (st.cl === b.dataset.cl) return;
      st.cl = b.dataset.cl; st.picks = []; st.all = false; renderCmdPart();
    }));
    sky2.addEventListener('click', e => {
      const r = sky2.getBoundingClientRect(), p = nearestStar(skyPos, e.clientX - r.left, e.clientY - r.top, 26);
      if (!p) return;
      const i = st.picks.findIndex(q => q.s === p.s);
      if (i >= 0) st.picks.splice(i, 1);
      st.picks.push({s: p.s});
      if (st.picks.length > 6) st.picks.shift();
      renderCmdPart();
    });
    $('s2-all').addEventListener('click', () => {
      st.all = true;
      if (reduceMotion) { st.reveal = 1; renderCmdPart(); return; }
      const t0 = performance.now();
      const step = now => {
        st.reveal = Math.min(1, (now - t0) / 1100);
        renderCmd();
        if (st.reveal < 1 && current === 's2') requestAnimationFrame(step); else { st.reveal = 1; renderCmdPart(); }
      };
      st.reveal = 0; requestAnimationFrame(step);
    });
    $('s2-clear').addEventListener('click', () => { st.picks = []; st.all = false; renderCmdPart(); });
    const letters = () => st.picks.map((p, i) => Object.assign(p, {label: 'ABCDEF'[i]}));

    function renderCmd() {
      const tall = small(), [m0, m1] = RANGE[st.cl];
      clear(cmd);
      cmd.setAttribute('viewBox', `0 0 640 ${tall ? 640 : 520}`);
      const box = {l: tall ? 96 : 64, r: 622, t: 16, b: tall ? 556 : 462};
      const xs = lin(-0.4, 2.0, box.l, box.r), ys = lin(m0, m1, box.t, box.b);
      frame(cmd, box, xs, ys, {tall, xTicks: bvTicks(-0.4, 2.0, 0.4), yTicks: magTicks(m0, m1, 2), xLabel: BV_LABEL,
        yLabel: tall ? '겉보기 등급 (m_V)' : '겉보기 등급 (m_V) · 위로 갈수록 밝음'});
      const stars = st.cl === 'm45' ? M.M45 : M.M3, rr = st.cl === 'm45' ? (tall ? 5 : 3.4) : (tall ? 3.4 : 2.3);
      if (st.all) {
        const sorted = stars.slice().sort((a, b) => a.V - b.V), n = Math.round(sorted.length * st.reveal);
        dots(el('g', {}, cmd), sorted.slice(0, n), xs, ys, box, rr, binColour, {opacity: 0.9});
        if (st.reveal >= 1) labelsFor(st.cl, xs, ys, tall);
      }
      letters().forEach(p => {
        const x = xs(p.s.bv), y = ys(p.s.V);
        el('circle', {cx: x, cy: y, r: tall ? 10 : 7, fill: M.rgbCss(M.chartRGB(p.s.bv)), stroke: '#14283a', 'stroke-width': 2.5}, cmd);
        el('text', {x: x + (tall ? 14 : 10), y: y - (tall ? 10 : 8), class: 'big-annot halo', fill: '#14283a'}, cmd, p.label);
      });
      cmd.setAttribute('aria-label', `${st.cl === 'm45' ? 'M45' : 'M3'}의 C-M도: 찍힌 별 ${st.all ? stars.length : st.picks.length}개`);
    }
    function labelsFor(cl, xs, ys, tall) {
      const L = (x, y, t, c, anchor) => el('text', {x: xs(x), y: ys(y), 'text-anchor': anchor || 'start', class: 'big-annot halo', fill: c}, cmd, t);
      if (cl === 'm45') {
        L(0.62, 8.6, '주계열성', '#a85a00');
        L(0.05, 3.6, '← 밝고 푸른 별', '#2a56c6');
        L(1.05, 16.9, tall ? '어둡고 붉은 별 →' : '어둡고 붉은 주계열성 →', '#c2410c', 'end');
      } else {
        L(1.12, 22.3, '← 주계열성', '#a85a00');
        L(-0.05, 19.2, '전향점 →', '#14283a', 'end');
        L(1.05, 14.6, '적색 거성 가지', '#c2410c');
        L(-0.12, 15.0, '수평 가지', '#5f7282');
      }
    }
    function renderPicture() {
      skyPos = drawSky(sky2, field2(st.cl), {limit: 30, vref: st.cl === 'm45' ? 2.87 : brightest(M.M3), size: st.cl === 'm45' ? 1.1 : 0.85,
        glow: st.cl === 'm3' ? 0.9 : 0, glowR: 0.15, marks: letters()});
    }
    function renderCmdPart() {
      setPressed($('s2-cluster'), 'data-cl', st.cl);
      renderPicture(); renderCmd();
      const ps = letters(), last = ps[ps.length - 1];
      const desc = p => `${p.label}${p.s.name ? ' · ' + p.s.name : ''} · V ${num(p.s.V, 2)} · B − V ${sgn(p.s.bv)}`;
      $('s2-pick').textContent = last ? desc(last) : '그림의 별을 눌러 보세요';
      let t = '';
      if (ps.length >= 2) {
        const a = ps[ps.length - 2], b = last, bright = a.s.V <= b.s.V ? a : b, faint = bright === a ? b : a, dm = faint.s.V - bright.s.V;
        t = `<b>${a.label}</b>와 <b>${b.label}</b>의 겉보기 등급 차는 ${num(dm, 2)}입니다. 같은 성단의 별은 거리가 같으므로(거리 지수 m − M이 모두 같음) <b>겉보기 등급의 차 = 절대 등급의 차</b>. 광도는 ${bright.label}가 ${faint.label}의 약 <b>${M.sig(M.lumRatio(dm), 2).toLocaleString('ko-KR')}배</b>입니다 (5등급 차 = 100배). `;
      } else if (ps.length === 1) t = '한 별을 더 눌러 두 별의 밝기를 비교해 보세요. ';
      if (st.all) t += st.cl === 'm45'
        ? '산개 성단 M45에는 색지수가 (−)인 <b>밝은 청색 주계열성</b>부터 어둡고 붉은 주계열성까지 한 줄(주계열)로 늘어섭니다. 별 수로는 (+) 색지수 별이 훨씬 많지만, 가장 밝은 푸른 별(약 3등급)과 붉은 별(13등급보다 어둡다)은 10등급 차 = 밝기 <b>1만 배</b>라서 성단은 푸르게 보입니다.'
        : '구상 성단 M3에는 <b>밝은 청색 주계열성이 없습니다</b>. 주계열이 색지수 0.4 부근(전향점)에서 꺾이고, (+) 색지수의 거성들이 오른쪽 위로 이어집니다. 세로축 범위도 다릅니다(M45 2~18등급, M3 11~23등급). 같은 색지수의 주계열성끼리 비교하면 M3 쪽이 10등급 넘게 어둡습니다 → 훨씬 멀리 있습니다(04에서 거리로 확인).';
      else if (!ps.length) t = '밝은 별과 어두운 별, 푸른 별과 붉은 별을 골고루 눌러 보세요. 점들이 아무렇게나 흩어질까요? 다 찍으려면 <b>모든 별 찍기</b>를 누르세요.';
      $('s2-cmd-insight').innerHTML = t;
    }

    // ④ Q2
    const q2 = quizBox($('s2-q2'));
    q2.set(M.Q2.items);
    function renderQ2() {
      const tall = small();
      [['s2-q2a', M.M45, [2, 18], '#3d6fe0', [['㉢', M.Q2.marks.c, 1]]], ['s2-q2b', M.M3, [11, 23], '#c2410c', [['㉠', M.Q2.marks.a, 1], ['㉡', M.Q2.marks.b, -1]]]]
        .forEach(([id, stars, [m0, m1], col, marks]) => {
          const svg = $(id);
          clear(svg);
          const box = {l: tall ? 56 : 40, r: 312, t: 10, b: tall ? 292 : 300};
          svg.setAttribute('viewBox', `0 0 320 ${tall ? 350 : 352}`);
          const xs = lin(-0.4, 2.0, box.l, box.r), ys = lin(m0, m1, box.t, box.b);
          frame(svg, box, xs, ys, {tall, xTicks: bvTicks(0, 2.0, tall ? 1 : 0.5), yTicks: magTicks(m0, m1, 4), xLabel: tall ? '' : 'B − V'});
          dots(el('g', {}, svg), stars, xs, ys, box, stars.length > 1000 ? 1.4 : 2.1, () => col, {opacity: 0.75});
          marks.forEach(([t, m, side]) => {
            const x = xs(m.bv), y = ys(m.V);
            el('path', {d: `M${box.l} ${y}H${x}V${box.b}`, stroke: '#5f7282', 'stroke-dasharray': '4 3', fill: 'none', 'stroke-width': 1.2}, svg);
            el('circle', {cx: x, cy: y, r: 6, fill: '#fff', stroke: '#14283a', 'stroke-width': 2.5}, svg);
            el('text', {x: x + side * 18, y: y - 8, 'text-anchor': 'middle', class: 'big-annot halo'}, svg, t);
          });
        });
    }

    function render() { renderColour(); renderCmdPart(); renderQ2(); q2.draw(); }
    return {render};
  })();

  // ═══════════════ 03 전향점과 나이 ═══════════════
  stations.s3 = (() => {
    const stars = M.makeCluster();
    const PRESETS = [
      {id: 'm45', name: 'M45', tag: '전향점 −0.12', bv: M.TEXTBOOK.m45.turnoff},
      {id: 'm67', name: 'M67', tag: '전향점 +0.43', bv: M.TEXTBOOK.m67.turnoff}
    ];
    PRESETS.forEach(p => { p.age = M.ageForTurnoffColour(p.bv); });
    const Q3C = M.Q3.clusters.map(c => Object.assign({}, c, {age: M.ageForTurnoffColour(c.bv)}));
    const st = {logAge: Math.log10(M.SNAPSHOTS[0].age), playing: false, ghost: true, preset: null};
    let raf = 0, last = null;
    const svg = $('s3-chart'), slider = $('s3-age');
    let box, xs, ys, layer, circles = [], rings = [], toLayer, layoutKey = '';

    // 도구 줄: 그림 4의 네 장면 + 탐구하기 1의 두 성단
    const snaps = $('s3-snaps'), presets = $('s3-presets');
    M.SNAPSHOTS.forEach(s => {
      const b = document.createElement('button');
      b.type = 'button'; b.dataset.snap = s.key; b.className = 'ink';
      b.textContent = s.name;
      b.addEventListener('click', () => setAge(s.age, null));
      snaps.appendChild(b);
    });
    PRESETS.forEach(p => {
      const b = document.createElement('button');
      b.type = 'button'; b.dataset.preset = p.id; b.className = p.id === 'm67' ? 'warm' : '';
      b.innerHTML = `${p.name}<span class="tag">${p.tag}</span>`;
      b.addEventListener('click', () => setAge(p.age, p.id));
      presets.appendChild(b);
    });
    slider.min = Math.log10(M.AGE_RANGE[0]); slider.max = Math.log10(M.AGE_RANGE[1]).toFixed(3);
    slider.addEventListener('input', () => { setPlaying(false); st.logAge = +slider.value; st.preset = null; update(); });
    $('s3-ghost').addEventListener('change', e => { st.ghost = e.target.checked; update(); });
    $('s3-play').addEventListener('click', () => {
      if (reduceMotion) {   // 움직임 줄이기: 다음 장면으로 바로 넘어간다
        const next = M.SNAPSHOTS.find(s => Math.log10(s.age) > st.logAge + 0.01) || M.SNAPSHOTS[0];
        setAge(next.age, null); return;
      }
      if (!st.playing && st.logAge >= +slider.max - 0.01) st.logAge = +slider.min;
      setPlaying(!st.playing);
    });
    function setPlaying(v) {
      st.playing = v;
      $('s3-play').textContent = v ? '❚❚ 멈춤' : '▶ 나이 먹이기';
      cancelAnimationFrame(raf); last = null;
      if (v) raf = requestAnimationFrame(tick);
    }
    function setAge(age, preset) { setPlaying(false); st.logAge = Math.log10(age); st.preset = preset; update(); }

    // 그래프 틀 (크기가 바뀔 때만 다시 그린다)
    function layout() {
      const tall = small(), key = String(tall);
      if (key === layoutKey && layer) return;
      layoutKey = key;
      clear(svg);
      svg.setAttribute('viewBox', `0 0 640 ${tall ? 640 : 460}`);
      box = tall ? {l: 92, r: 512, t: 56, b: 548} : {l: 64, r: 552, t: 30, b: 400};
      xs = lin(-0.4, 1.8, box.l, box.r); ys = lin(-6, 10, box.t, box.b);
      frame(svg, box, xs, ys, {tall, xTicks: bvTicks(-0.4, 1.6, 0.4), yTicks: magTicks(-6, 10, 2), xLabel: BV_LABEL,
        yLabel: tall ? '절대 등급 (M_V)' : '절대 등급 (M_V) · 위로 갈수록 밝음'});
      // 오른쪽: 교과서 96쪽 탐구 그림의 나이 눈금
      const ax = el('g', {class: 'axis'}, svg);
      el('line', {x1: box.r, x2: box.r, y1: box.t, y2: box.b, 'stroke-width': 1.2}, ax);
      const SUP = {6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', 10: '¹⁰'};
      M.AGE_SCALE.forEach(([mv, age]) => {
        const e = Math.floor(Math.log10(age) + 1e-9), m = age / 10 ** e;
        el('line', {x1: box.r, x2: box.r + 5, y1: ys(mv), y2: ys(mv), 'stroke-width': 1.2}, ax);
        el('text', {x: box.r + 8, y: ys(mv) + 4, class: 'tick'}, ax, `${m.toFixed(1)}×10${SUP[e]}`);
      });
      el('text', {x: box.r + 8, y: box.t - (tall ? 24 : 12), class: 'axis-label'}, ax, '나이 [년]');
      // 표준 주계열 (그래프 안에서만)
      const ms = M.MS.filter(r => r.mv <= 10).map(r => [xs(r.bv), ys(r.mv)]);
      el('path', {d: pathOf(ms), fill: 'none', stroke: '#c4ced6', 'stroke-width': tall ? 6 : 5, 'stroke-linecap': 'round', 'stroke-dasharray': '2 8'}, svg);
      el('text', {x: xs(1.25), y: ys(9.6), 'text-anchor': 'end', class: 'tick'}, svg, '표준 주계열');
      layer = el('g', {}, svg);
      const rg = el('g', {}, layer), cg = el('g', {}, layer);
      const r = tall ? 5.4 : 3.6;
      rings = stars.map(() => el('circle', {r: r - 0.6, fill: 'none', stroke: '#b9c4cc', 'stroke-width': 1.2}, rg));
      circles = stars.map(() => el('circle', {r, stroke: '#fff', 'stroke-width': 0.8}, cg));
      toLayer = el('g', {}, svg);
    }

    function update() {
      layout();
      const t = 10 ** st.logAge, tall = small();
      slider.value = st.logAge;
      $('s3-age-out').textContent = M.formatAge(t);
      const c = M.census(stars, t);
      stars.forEach((s, i) => {
        const p = M.starAt(s, t), cc = circles[i], rg = rings[i];
        const left = p.phase === 'giant' || p.phase === 'done';
        rg.setAttribute('cx', xs(s.bv0 + s.dc).toFixed(1)); rg.setAttribute('cy', ys(s.mv0 + s.dm).toFixed(1));
        rg.setAttribute('visibility', st.ghost && left ? 'visible' : 'hidden');
        if (p.phase === 'done') { cc.setAttribute('visibility', 'hidden'); return; }
        cc.setAttribute('visibility', 'visible');
        cc.setAttribute('cx', xs(p.bv).toFixed(1)); cc.setAttribute('cy', ys(p.mv).toFixed(1));
        cc.setAttribute('fill', M.rgbCss(M.chartRGB(p.bv)));
        cc.setAttribute('fill-opacity', p.phase === 'pre' ? 0.45 : 0.95);
      });
      clear(toLayer);
      const has = M.hasTurnoff(t), to = M.turnoff(t);
      const lab = (x, y, text, cls, fill, anchor) => el('text', {x, y, 'text-anchor': anchor || 'start', class: cls + ' halo', fill}, toLayer, text);
      if (has) {
        const x = xs(to.bv), y = ys(to.mv);
        el('path', {d: `M${x} ${y}H${box.r}`, stroke: '#14283a', 'stroke-width': 1.6, 'stroke-dasharray': '6 4', fill: 'none'}, toLayer);
        el('circle', {cx: x, cy: y, r: tall ? 14 : 10, fill: 'none', stroke: '#14283a', 'stroke-width': 3}, toLayer);
        el('circle', {cx: box.r, cy: y, r: 5, fill: '#c2581c', stroke: '#fff', 'stroke-width': 1.5}, toLayer);
        // 왼쪽 축에 가까우면 '전향점' 글자를 오른쪽에 쓴다
        if (x - box.l < (tall ? 150 : 100)) lab(x + (tall ? 22 : 16), y + (tall ? 8 : 6), '← 전향점', 'big-annot', '#14283a');
        else lab(x - (tall ? 20 : 14), y + (tall ? 36 : 26), '전향점', 'big-annot', '#14283a', 'end');
        lab(box.r - 8, y - 8, M.formatAge(t), 'annot', '#c2581c', 'end');
      } else {
        lab(xs(-0.3), ys(-4.6), '아직 주계열을 떠난 별이 없다', 'annot', '#5f7282');
        lab(xs(0.32), ys(5.6), '주계열', 'big-annot', '#0b7f9a');
      }
      if (c.giant) lab(xs(1.2), ys(-4.9), '주계열을 떠나 거성으로 →', 'annot', '#c2410c', 'middle');
      if (c.pre) lab(xs(1.2), ys(2.6), '아직 수축 중인 별 ↓', 'annot', '#5f7282', 'middle');

      // 읽은 값
      $('s3-to-bv').textContent = has ? sgn(to.bv) : '아직 없음';
      $('s3-to-mv').textContent = has ? num(to.mv, 1) : '—';
      $('s3-msf').textContent = `${Math.round(100 * c.msFraction)}%`;
      const parts = [['pre', '수축 중', '#b8c7d6'], ['ms', '주계열성', '#0b7f9a'], ['giant', '거성', '#e07428'], ['done', '거성 단계를 마친 별', '#9aa9b5']];
      $('s3-mix').innerHTML = parts.map(([k, , col]) => `<i style="width:${100 * c[k] / c.total}%;background:${col}"></i>`).join('');
      $('s3-mix-legend').innerHTML = parts.map(([k, n, col]) => `<span><i class="dot" style="background:${col}"></i>${n} ${c[k]}</span>`).join('') + '<span>(별 360개의 교육용 모형)</span>';
      svg.setAttribute('aria-label', `나이 ${M.formatAge(t)} 성단의 C-M도: ${has ? `전향점 색지수 ${sgn(to.bv)}, 절대 등급 ${num(to.mv, 1)}` : '전향점 없음'}, 주계열성 비율 ${Math.round(100 * c.msFraction)}%`);

      // 깨달음 한 줄
      let txt;
      if (!has) txt = `나이 ${M.formatAge(t)}: 무거운 별은 이미 주계열에 도착했지만, <b>질량이 작은 별</b>은 아직 수축 중이라 주계열보다 위에 있습니다(질량이 작은 원시별일수록 주계열에 늦게 도착). 주계열을 떠난 별이 없어 <b>전향점이 아직 없습니다</b>.`;
      else {
        txt = `나이 ${M.formatAge(t)}: 전향점의 색지수 <b>${sgn(to.bv)}</b>, 절대 등급 <b>${num(to.mv, 1)}</b>. 이보다 밝고 푸른 무거운 별은 이미 주계열을 떠났습니다. 성단이 늙을수록 전향점은 <b>오른쪽 아래</b>로 내려가고(색지수 ↑ → 표면 온도 ↓, 등급 ↑ → 광도 ↓) <b>주계열성 비율은 줄어듭니다</b>(지금 ${Math.round(100 * c.msFraction)}%).`;
        if (c.pre) txt += ` 아직 수축 중인 가벼운 별도 ${c.pre}개 있습니다.`;
      }
      if (st.preset === 'm45') txt += ' <b>탐구하기 1</b>: M45의 전향점 −0.12 → 교과서 답 1억 3천만 년과 같습니다.';
      if (st.preset === 'm67') txt += ' <b>탐구하기 1</b>: M67의 전향점 +0.43은 M45보다 오른쪽 아래 → 더 늙었습니다. 이 모형에서는 약 45억 년, 교과서 그림에서 읽은 값은 71억 년, 실제 나이는 30억~50억 년입니다. 전향점으로 읽는 나이는 어림값입니다.';
      $('s3-insight').innerHTML = txt;

      // 도구 줄과 그림 4 장면 표시
      const near = M.SNAPSHOTS.find(s => Math.abs(Math.log10(s.age) - st.logAge) < 0.02);
      setPressed(snaps, 'data-snap', near ? near.key : '');
      setPressed(presets, 'data-preset', st.preset || '');
      document.querySelectorAll('#s3-thumbs [data-snap]').forEach(b => b.setAttribute('aria-pressed', String(!!near && b.dataset.snap === near.key)));
    }

    // 탐구하기 1 표 + Q3
    function renderSide() {
      $('s3-table').innerHTML = `<thead><tr><th>성단</th><th class="num">전향점의 색지수</th><th class="num">교과서 탐구 답</th><th class="num">실제 나이</th></tr></thead><tbody>
        <tr><td><button type="button" class="compact" data-go="m45">M45 보기</button></td><td class="num">−0.12</td><td class="num">1억 3천만 년</td><td class="num">약 1억 3천만 년</td></tr>
        <tr><td><button type="button" class="compact" data-go="m67">M67 보기</button></td><td class="num">+0.43</td><td class="num">71억 년</td><td class="num">30억~50억 년</td></tr></tbody>`;
      $('s3-table').querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => { const p = PRESETS.find(q => q.id === b.dataset.go); setAge(p.age, p.id); }));
      $('s3-table-note').innerHTML = `전향점의 색지수가 큰 M67이 더 늙었습니다. 이 모형(교과서 그림의 나이 눈금 + 표준 주계열)에서 전향점이 +0.43이 되는 나이는 약 ${M.formatAge(PRESETS[1].age)}입니다. 교과서 그림에서 읽은 71억 년은 실제보다 큽니다(교과서 97쪽).`;
      $('s3-q3-table').innerHTML = `<thead><tr><th>성단</th>${Q3C.map(c => `<th>${c.id}</th>`).join('')}</tr></thead><tbody>
        <tr><td>전향점의 색지수 (B − V)</td>${Q3C.map(c => `<td><b>${sgn(c.bv, 1)}</b></td>`).join('')}</tr>
        <tr><td>모형에서 보기</td>${Q3C.map(c => `<td><button type="button" data-q3="${c.id}" aria-label="성단 ${c.id}의 모습 보기">${c.id}</button></td>`).join('')}</tr></tbody>`;
      $('s3-q3-table').querySelectorAll('[data-q3]').forEach(b => b.addEventListener('click', () => { const c = Q3C.find(q => q.id === b.dataset.q3); setAge(c.age, null); }));
    }
    const q3 = quizBox($('s3-q3'), {extra: () => {
      const S = Q3C.map(c => `${c.id} ${Math.round(100 * M.census(stars, c.age).msFraction)}%`).join(', ');
      return `모형의 주계열성 비율: ${S}`;
    }});
    q3.set(M.Q3.items);

    // 그림 4처럼 네 장면
    function renderThumbs() {
      const wrap = $('s3-thumbs');
      wrap.innerHTML = '';
      M.SNAPSHOTS.forEach(s => {
        const b = document.createElement('button');
        b.type = 'button'; b.dataset.snap = s.key; b.setAttribute('aria-pressed', 'false');
        b.setAttribute('aria-label', `${s.name} (${M.formatAge(s.age)}) 장면으로 옮기기`);
        const sv = document.createElementNS(NS, 'svg');
        sv.setAttribute('viewBox', '0 0 200 196'); sv.setAttribute('aria-hidden', 'true');
        const bx = {l: 22, r: 192, t: 22, b: 162}, X = lin(-0.4, 1.8, bx.l, bx.r), Y = lin(-6, 10, bx.t, bx.b);
        el('rect', {x: bx.l, y: bx.t, width: bx.r - bx.l, height: bx.b - bx.t, fill: '#fff', stroke: '#14283a', 'stroke-width': 1.2}, sv);
        el('path', {d: pathOf(M.MS.filter(r => r.mv <= 10).map(r => [X(r.bv), Y(r.mv)])), fill: 'none', stroke: '#d5dde3', 'stroke-width': 2, 'stroke-dasharray': '3 4'}, sv);
        stars.forEach(q => {
          const p = M.starAt(q, s.age);
          if (p.phase === 'done') return;
          el('circle', {cx: X(p.bv).toFixed(1), cy: Y(p.mv).toFixed(1), r: 2.3, fill: M.rgbCss(M.chartRGB(p.bv)), 'fill-opacity': p.phase === 'pre' ? 0.45 : 0.9}, sv);
        });
        if (M.hasTurnoff(s.age)) {
          const to = M.turnoff(s.age);
          el('circle', {cx: X(to.bv), cy: Y(to.mv), r: 7, fill: 'none', stroke: '#14283a', 'stroke-width': 2}, sv);
        }
        // 교과서 그림 4처럼: 광도 ↑, ← 표면 온도
        el('path', {d: `M${bx.l - 9} ${bx.b}V${bx.t - 12}m-4 7l4-7 4 7`, stroke: '#14283a', 'stroke-width': 1.4, fill: 'none'}, sv);
        el('text', {x: bx.l - 1, y: bx.t - 6, 'font-size': 12, 'font-weight': 700, fill: '#5f7282'}, sv, '광도');
        el('path', {d: `M${bx.r - 58} ${bx.b + 14}H${bx.r - 118}m7-4l-7 4 7 4`, stroke: '#14283a', 'stroke-width': 1.4, fill: 'none'}, sv);
        el('text', {x: bx.r - 52, y: bx.b + 18, 'font-size': 12, 'font-weight': 700, fill: '#5f7282'}, sv, '표면 온도');
        b.appendChild(sv);
        const nm = document.createElement('span'); nm.className = 't-name'; nm.textContent = s.name;
        const ag = document.createElement('span'); ag.className = 't-age'; ag.textContent = `${M.formatAge(s.age)} · ${M.hasTurnoff(s.age) ? `전향점 ${sgn(M.turnoff(s.age).bv)}` : '전향점 없음'}`;
        b.append(nm, ag);
        b.addEventListener('click', () => setAge(s.age, null));
        wrap.appendChild(b);
      });
    }

    // 재생: 약 10초에 걸쳐 100만 년 → 130억 년(로그 눈금). 다른 실험으로 가거나 화면이 숨으면 멈춘다.
    function tick(now) {
      if (!st.playing) return;
      if (current !== 's3' || document.hidden) { setPlaying(false); return; }
      if (last !== null) {
        st.logAge = Math.min(+slider.max, st.logAge + Math.min(0.1, (now - last) / 1000) * 0.42);
        update();
        if (st.logAge >= +slider.max) { setPlaying(false); return; }
      }
      last = now;
      raf = requestAnimationFrame(tick);
    }
    let thumbsKey = '';
    function render() {
      layoutKey = layoutKey && String(small()) === layoutKey ? layoutKey : '';
      update(); renderSide(); q3.draw();
      if (thumbsKey !== 'done') { renderThumbs(); thumbsKey = 'done'; update(); }
    }
    return {render, leave: () => setPlaying(false)};
  })();

  // ═══════════════ 04 주계열 맞추기 ═══════════════
  stations.s4 = (() => {
    const T = M.TEXTBOOK;
    const TARGETS = [
      {id: 'practice', name: '연습 · 가상의 성단', tag: '수업 슬라이드 21', stars: M.PRACTICE, colour: '#8a5cc2', data: [2, 21], accept: [4.7, 5.3]},
      {id: 'm45', name: 'M45 플레이아데스', tag: '산개 성단', stars: M.M45, colour: '#3d6fe0', data: [2, 18], accept: [5.2, 6.0], textbook: T.m45},
      {id: 'm3', name: 'M3', tag: '구상 성단', stars: M.M3, colour: '#c2410c', data: [12, 23], accept: [15.85, 16.55], textbook: T.m3}
    ];
    const st = {target: TARGETS[1], dm: {practice: 0, m45: 0, m3: 0}, zoom: 'full', checked: {}, result: {}};
    const svg = $('s4-chart'), grip = $('s4-grip');
    let box, xs, ys, sheetG, ghostG, pxPerMag = 1;

    const chips = $('s4-targets');
    TARGETS.forEach(t => {
      const b = document.createElement('button');
      b.type = 'button'; b.dataset.target = t.id;
      b.className = t.id === 'm3' ? 'warm' : t.id === 'practice' ? 'ink' : '';
      b.innerHTML = `${t.name}<span class="tag">${t.tag}</span>`;
      b.addEventListener('click', () => { st.target = t; drawChart(); updateAll(); });
      chips.appendChild(b);
    });
    document.querySelectorAll('#s4-zoom [data-zoom]').forEach(b => b.addEventListener('click', () => { st.zoom = b.dataset.zoom; drawChart(); updateAll(); }));
    const dmNow = () => st.dm[st.target.id];
    function setDm(v, snap) {
      v = Math.max(-3, Math.min(21, v));
      if (snap) v = Math.round(v / 0.05) * 0.05;
      st.dm[st.target.id] = +v.toFixed(2);
      st.checked[st.target.id] = false;
      updateAll();
    }
    $('s4-up').addEventListener('click', () => setDm(dmNow() - 0.1));
    $('s4-down').addEventListener('click', () => setDm(dmNow() + 0.1));
    grip.addEventListener('keydown', e => {
      const step = e.shiftKey ? 0.5 : 0.1, map = {ArrowUp: -step, ArrowDown: step, PageUp: -1, PageDown: 1};
      if (map[e.key] !== undefined) { e.preventDefault(); setDm(dmNow() + map[e.key]); }
    });
    // 끌기: 마우스·펜은 그래프 어디서나, 손가락은 ⇕ 손잡이나 표준 주계열 선 위에서
    let drag = null;
    const dragHandler = (e, phase) => {
      if (phase === 'end') { drag = null; return; }
      const p = svgPoint(svg, e);
      if (phase === 'start') { drag = {y: p.y, dm: dmNow()}; return; }
      if (drag) setDm(drag.dm + (p.y - drag.y) / pxPerMag, true);
    };
    onDrag(svg, dragHandler, e => e.pointerType !== 'touch' || (e.target && e.target.classList && e.target.classList.contains('grab')));
    onDrag(grip, dragHandler);
    $('s4-check').addEventListener('click', () => {
      const t = st.target;
      st.checked[t.id] = true;
      if (t.id !== 'practice') st.result[t.id] = dmNow();
      updateAll();
    });

    function drawChart() {
      const tall = small(), t = st.target;
      clear(svg);
      svg.setAttribute('viewBox', `0 0 640 ${tall ? 740 : 580}`);
      box = tall ? {l: 92, r: 572, t: 40, b: 660} : {l: 64, r: 588, t: 34, b: 524};
      const [m0, m1] = st.zoom === 'full' ? [-5, 23] : t.data;
      xs = lin(-0.4, 1.6, box.l, box.r); ys = lin(m0, m1, box.t, box.b);
      pxPerMag = ys(1) - ys(0);
      frame(svg, box, xs, ys, {tall, xTicks: bvTicks(-0.4, 1.6, 0.4), yTicks: magTicks(m0, m1, st.zoom === 'full' ? (tall ? 5 : 5) : 2), xLabel: BV_LABEL,
        yLabel: tall ? '겉보기 등급 (m_V)' : '겉보기 등급 (m_V) · 위로 갈수록 밝음'});
      const defs = el('defs', {}, svg), cp = el('clipPath', {id: 's4-clip'}, defs);
      el('rect', {x: box.l, y: box.t, width: box.r - box.l, height: box.b - box.t}, cp);
      const pts = el('g', {'clip-path': 'url(#s4-clip)'}, svg);
      dots(pts, t.stars, xs, ys, box, t.stars.length > 1000 ? (tall ? 2.6 : 1.8) : (tall ? 4.4 : 3), () => t.colour, {opacity: t.stars.length > 1000 ? 0.65 : 0.8});
      el('text', {x: box.l + 10, y: box.b - 12, class: 'big-annot halo', fill: t.colour}, svg, `${t.id === 'practice' ? '가상의 성단' : t.name} 성단을 이루는 별들`);
      ghostG = el('g', {'clip-path': 'url(#s4-clip)'}, svg);
      // 투명 용지: 표준 주계열성의 C-M도(절대 등급) — 위아래로만 움직인다
      sheetG = el('g', {}, svg);
      const inner = el('g', {'clip-path': 'url(#s4-clip)'}, sheetG);
      const move = el('g', {class: 'sheet-move'}, inner);
      const yA = ys(-4.5), yB = ys(14);
      el('rect', {x: box.l + 4, y: yA, width: box.r - box.l - 8, height: yB - yA, rx: 10, fill: '#8fd3e8', 'fill-opacity': 0.16, stroke: '#0b7f9a', 'stroke-dasharray': '7 5', 'stroke-width': 1.5}, move);
      const ms = M.MS.filter(r => r.bv <= 1.6).map(r => [xs(r.bv), ys(r.mv)]);
      el('path', {d: pathOf(ms), fill: 'none', stroke: '#fff', 'stroke-width': tall ? 10 : 8, opacity: 0.85, 'stroke-linecap': 'round'}, move);
      el('path', {d: pathOf(ms), fill: 'none', stroke: '#14283a', 'stroke-width': tall ? 5 : 3.6, 'stroke-linecap': 'round'}, move);
      el('path', {d: pathOf(ms), fill: 'none', stroke: 'transparent', 'stroke-width': 44, class: 'grab', style: 'touch-action:none;cursor:ns-resize', 'pointer-events': 'stroke'}, move);
      el('text', {x: xs(0.02), y: ys(-3.4), class: 'big-annot halo', fill: '#0b7f9a'}, move, '표준 주계열성 (투명 용지)');
      // 용지에 적힌 절대 등급 눈금 (오른쪽)
      const scaleG = el('g', {class: 'sheet-move'}, sheetG);
      for (let v = -4; v <= 14; v += 2) {
        el('line', {x1: box.r, x2: box.r + 6, y1: ys(v), y2: ys(v), stroke: '#0b7f9a', 'stroke-width': 1.5, class: 'mv-tick', 'data-v': v}, scaleG);
        el('text', {x: box.r + 9, y: ys(v) + 4, class: 'tick mv-tick', fill: '#0b7f9a', 'data-v': v}, scaleG, num(v, 0));
      }
      richLabel(el('text', {x: 636, y: box.t - 12, 'text-anchor': 'end', class: 'axis-label', fill: '#0b7f9a'}, svg), tall ? '용지의 절대 등급 (M_V) →' : '투명 용지의 절대 등급 (M_V) ↓');
    }

    function placeSheet() {
      const dm = dmNow(), off = ys(dm) - ys(0);
      sheetG.querySelectorAll('.sheet-move').forEach(g => g.setAttribute('transform', `translate(0 ${off.toFixed(2)})`));
      // 그래프 밖으로 나간 눈금은 숨긴다
      sheetG.querySelectorAll('.mv-tick').forEach(n => {
        const y = ys(+n.getAttribute('data-v') + dm);
        n.setAttribute('visibility', y >= box.t - 1 && y <= box.b + 1 ? 'visible' : 'hidden');
      });
      // ⇕ 손잡이: 용지의 빈 오른쪽 위(절대 등급 +1 높이)에 붙어 다닌다(그래프 안으로 제한)
      const r = svg.getBoundingClientRect(), vb = svg.viewBox.baseVal, k = r.width / vb.width;
      const yv = Math.max(box.t + 26 / k, Math.min(box.b - 26 / k, ys(1 + dm)));
      grip.style.top = `${yv * k}px`;
      grip.style.left = `${(box.r - 8) * k - 44}px`;
      grip.style.right = 'auto';
      // 비교한 뒤에는 실제 거리에 놓은 표준 주계열을 흐리게 보여 준다
      clear(ghostG);
      const t = st.target;
      if (st.checked[t.id] && t.textbook) {
        const mu = M.modulus(t.textbook.actual);
        const ms = M.MS.filter(q => q.bv <= 1.6).map(q => [xs(q.bv), ys(q.mv + mu)]);
        el('path', {d: pathOf(ms), fill: 'none', stroke: '#18794e', 'stroke-width': 2.5, 'stroke-dasharray': '8 6'}, ghostG);
      }
      $('s4-legend').innerHTML = '<span><i style="border-top-color:#14283a"></i>투명 용지의 표준 주계열</span>' + (st.checked[t.id] && t.textbook
        ? `<span><i style="border-top-color:#18794e;border-top-style:dashed"></i>실제 거리 ${t.textbook.actual} pc에 놓았다면 (m − M = ${num(M.modulus(t.textbook.actual), 2)})</span>` : '');
    }

    function updateAll() {
      const t = st.target, dm = dmNow(), lr = M.logDistance(dm), r = M.distanceFromModulus(dm);
      setPressed(chips, 'data-target', t.id);
      setPressed($('s4-zoom'), 'data-zoom', st.zoom);
      placeSheet();
      $('s4-dm').textContent = num(dm, 2);
      // 위아래 균형
      const fs = M.fitStats(t.stars, dm, M.FIT_SELECT[t.id]);
      const bal = $('s4-balance');
      bal.querySelector('.up').style.width = `${(100 * fs.above).toFixed(1)}%`;
      bal.querySelector('.down').style.width = `${(100 * fs.below).toFixed(1)}%`;
      let hint;
      if (Math.abs(fs.median) > 2.5) hint = fs.median > 0 ? '용지를 성단의 주계열까지 내려 보세요 ▼' : '용지를 성단의 주계열까지 올려 보세요 ▲';
      else if (Math.abs(fs.median) <= 0.06) hint = '선이 주계열성 분포의 한가운데를 지나요 ✓';
      else hint = fs.median > 0 ? `위 ${Math.round(100 * fs.above)}% · 아래 ${Math.round(100 * fs.below)}% → 조금 더 내려 보세요 ▼` : `위 ${Math.round(100 * fs.above)}% · 아래 ${Math.round(100 * fs.below)}% → 조금 올려 보세요 ▲`;
      $('s4-balance-text').textContent = hint;
      // 단계
      const fr = frac(`${num(dm, 2)} + 5`, '5');
      $('s4-steps').innerHTML = `
        <div class="s lock"><div class="k">① 색지수 눈금 맞추기</div><div class="v">가로축 일치 ✓</div><div class="w">투명 용지의 B − V 눈금을 성단 C-M도의 B − V 눈금에 맞춰 두고, 위아래로만 옮깁니다.</div></div>
        <div class="s"><div class="k">② 옮긴 만큼 = 거리 지수</div><div class="v">m − M = ${num(dm, 2)}</div><div class="w">색지수가 같은 주계열성끼리 비교한 겉보기 등급 − 절대 등급</div></div>
        <div class="s"><div class="k">③ m − M = 5 log r − 5에서</div><div class="v">log r = ${fr} = ${num(lr, 2)}</div><div class="w">log r = ${frac('m − M + 5', '5')}</div></div>
        <div class="s final"><div class="k">④ 성단까지의 거리 r</div><div class="v">${M.formatPc(r)}</div><div class="w">r = 10<sup>${frac('m − M + 5', '5')}</sup> = 10<sup>${num(lr, 2)}</sup> pc · 거리 지수가 5 커질 때마다 거리는 10배</div></div>`;
      // 판정
      const v = $('s4-verdict');
      v.hidden = !st.checked[t.id];
      if (st.checked[t.id]) {
        const ok = dm >= t.accept[0] && dm <= t.accept[1];
        let msg;
        if (t.id === 'practice') msg = ok
          ? `<b>잘 맞췄어요!</b> 이 가상의 성단은 표준 주계열을 정확히 5등급 내려 만든 것입니다. m − M = 5 → r = 10<sup>${frac('5 + 5', '5')}</sup> = 10² = <b>100 pc</b>. 이제 실제 성단 M45와 M3로 해 보세요.`
          : `<b>아직 어긋나 있어요.</b> 선이 점들의 한가운데를 지나도록 옮겨 보세요. (정답: m − M = 5 → 100 pc)`;
        else {
          const tb = t.textbook;
          msg = `<b>${ok ? '잘 맞췄어요!' : '아직 어긋나 있어요. 선이 주계열성 분포의 가운데를 지나도록 옮겨 보세요.'}</b> 내 값 m − M = ${num(dm, 2)} → <b>${M.formatPc(r)}</b>.<br>교과서 답: m − M = ${tb.mu} → 약 ${tb.r} pc · 실제 거리: <b>${tb.actual} pc</b>`;
          msg += t.id === 'm45'
            ? '<span class="story">산개 성단 M45는 주계열 맞추기로 구한 거리가 실제 거리와 잘 맞습니다. 초록 점선은 실제 거리(136 pc)에 놓았을 때의 표준 주계열입니다.</span>'
            : '<span class="story">구상 성단 M3는 구한 거리가 실제(10400 pc)보다 훨씬 멉니다. 초록 점선이 실제 거리에 놓은 표준 주계열인데, M3의 주계열은 그보다 아래(어둡게)에 있습니다. 까닭은 아래 ③ 결과에 정리했습니다.</span>';
        }
        v.className = 'verdict ' + (ok ? 'ok' : 'no');
        v.innerHTML = msg;
      }
      renderResult();
      // 깨달음 한 줄
      let txt = `지금 용지를 <b>${num(Math.abs(dm), 2)}등급</b> ${dm >= 0 ? '내렸습니다' : '올렸습니다'}. 색지수가 같은 주계열성은 거리에 관계없이 절대 등급이 같으므로, 두 주계열이 겹친 곳에서 겉보기 등급 − 절대 등급 = <b>${num(dm, 2)} = 거리 지수</b>입니다 → r ≈ ${M.formatPc(r)}.`;
      if (t.id === 'm3') txt += ' 구상 성단은 늙어서 전향점보다 밝은 주계열성이 이미 떠났으므로, 전향점 아래의 주계열에 맞춥니다.';
      if (t.id === 'm45') txt += ' 아래쪽(어둡고 붉은 쪽)은 점들이 조금 퍼져 있으니 가운데를 지나게 맞추세요.';
      if (t.id === 'practice') txt += ' 연습 성단은 거리 지수 5(100 pc)로 만든 가상의 성단입니다.';
      $('s4-insight').innerHTML = txt;
    }

    function renderResult() {
      const mine = id => st.result[id] !== undefined ? `${M.formatPc(M.distanceFromModulus(st.result[id]))} <span class="micro">(${num(st.result[id], 2)})</span>` : '—';
      $('s4-result').innerHTML = `<thead><tr><th>성단</th><th>종류</th><th>나이</th><th class="num">내가 구한 거리</th><th class="num">교과서 답</th><th class="num">실제 거리</th></tr></thead><tbody>
        <tr><td><b>M45</b></td><td>산개 성단</td><td>약 1억 3천만 년</td><td class="num mine">${mine('m45')}</td><td class="num">${T.m45.r} pc <span class="micro">(${T.m45.mu})</span></td><td class="num">${T.m45.actual} pc</td></tr>
        <tr><td><b>M3</b></td><td>구상 성단</td><td>약 110억 년</td><td class="num mine">${mine('m3')}</td><td class="num">${T.m3.r} pc <span class="micro">(${T.m3.mu})</span></td><td class="num">${T.m3.actual} pc</td></tr></tbody>`;
      $('s4-why').innerHTML = st.result.m3 === undefined
        ? '<p class="micro">M45와 M3를 맞춘 뒤 「교과서 값과 비교하기」를 누르면 내 값이 표에 들어갑니다. 괄호 안은 거리 지수 m − M입니다.</p>'
        : `<p class="why"><b>M45는 잘 맞았는데, M3는 왜 크게 틀렸을까?</b></p><div class="reasons">
            <div class="r"><b>종족이 다르다</b>표준 주계열성은 종족 Ⅰ 별의 자료입니다. 무거운 원소가 적은 종족 Ⅱ(구상 성단)에 그대로 쓰면 오차가 큽니다.</div>
            <div class="r"><b>등급이 퍼져 있다</b>같은 색지수의 주계열성도 등급이 조금씩 달라, 어디에 맞추느냐에 따라 거리 지수가 달라집니다.</div>
            <div class="r next"><b>별빛을 가리는 것이 있다면?</b>별빛이 오는 길에 어두워지면 거리가 실제와 다르게 나옵니다 → 다음 시간 「성간 소광과 성간 티끌」</div></div>`;
    }

    // Q4 그림: 색지수 0.5인 주계열성
    function renderQ4fig() {
      const fig = $('s4-q4-fig'), tall = small();
      clear(fig);
      fig.setAttribute('viewBox', `0 0 640 ${tall ? 330 : 230}`);
      const xs2 = lin(0, 16, tall ? 30 : 26, 614), y0 = tall ? 196 : 138;
      // 위: 거리 지수만큼의 화살표, 가운데: 등급 눈금 위의 세 별, 아래: 이름
      const span = (a, b, h, text) => {
        const x1 = xs2(a), x2 = xs2(b), y = y0 - h;
        el('path', {d: `M${x1} ${y0 - 12}V${y}H${x2}V${y0 - 12}`, fill: 'none', stroke: '#c2581c', 'stroke-width': 2, 'stroke-dasharray': '0', opacity: 0.9}, fig);
        el('path', {d: `M${x2 - 6} ${y0 - 22}l6 10 6-10`, fill: 'none', stroke: '#c2581c', 'stroke-width': 2, 'stroke-linejoin': 'round'}, fig);
        el('text', {x: (x1 + x2) / 2, y: y - 8, 'text-anchor': 'middle', class: 'annot halo', fill: '#c2581c'}, fig, text);
      };
      span(4, 9, tall ? 52 : 36, 'm − M = 5 → 100 pc');
      span(4, 14, tall ? 122 : 84, 'm − M = 10 → 1000 pc');
      const g = el('g', {class: 'axis'}, fig);
      el('line', {x1: xs2(0), x2: xs2(16), y1: y0, y2: y0, 'stroke-width': 1.2}, g);
      for (let v = 0; v <= 16; v += 2) {
        el('line', {x1: xs2(v), x2: xs2(v), y1: y0, y2: y0 + 6, 'stroke-width': 1.2}, g);
        el('text', {x: xs2(v), y: y0 + (tall ? 30 : 22), 'text-anchor': 'middle', class: 'tick'}, g, v ? `+${v}` : '0');
      }
      const P = [[4, '표준 주계열성 (M)', '#0b7f9a'], [9, '성단 A (m)', '#8a5cc2'], [14, '성단 B (m)', '#c2410c']];
      P.forEach(([v, n, c]) => {
        el('circle', {cx: xs2(v), cy: y0, r: tall ? 11 : 8, fill: c, stroke: '#fff', 'stroke-width': 2}, fig);
        el('text', {x: xs2(v), y: y0 + (tall ? 62 : 44), 'text-anchor': 'middle', class: 'annot', fill: c}, fig, n);
      });
      el('text', {x: xs2(0), y: y0 + (tall ? 94 : 66), class: 'tick'}, fig, '색지수 0.5인 주계열성의 등급 (오른쪽일수록 어둡다)');
    }
    const q4 = quizBox($('s4-q4'));
    q4.set(M.Q4.items);

    function render() { drawChart(); updateAll(); renderQ4fig(); q4.draw(); }
    return {render};
  })();

  // ── 시작 ───────────────────────────────────────────────
  const fromHash = () => {
    const h = (location.hash || '').slice(1);
    return /^s[1-4]$/.test(h) ? h : null;
  };
  show(fromHash() || 's1');
  let resizeTimer, lastW = window.innerWidth;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { lastW = window.innerWidth; stations[current].render(); }, 150);
  });
  window.addEventListener('hashchange', () => { const h = fromHash(); if (h && h !== current) show(h); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && stations.s3.leave && current === 's3') stations.s3.leave(); });
})();
