/* simkit.js — 인터랙티브 시뮬레이션 공통 도구 (의존성 없음)
 *
 * 사용법 (각 시뮬은 assets/js/sims/<name>.js 한 파일):
 *   SIM.register('motion-graph', {
 *     title: '등가속도 운동과 그래프',          // 상자 제목
 *     hint: '처음 속도와 가속도를 바꿔 보세요', // 한 줄 안내
 *     init(kit) { ... }                        // kit = 아래 도구 묶음
 *   });
 * 페이지의 <div class="sim" data-sim="motion-graph"></div> 가 화면에 들어올 때 자동으로 init 된다.
 *
 * kit 도구:
 *   kit.canvas({aspect:0.62, maxH:440})   → {ctx, el, W, H, onResize(fn)}  (W,H = CSS 픽셀, HiDPI 자동)
 *   kit.slider({label, min, max, step, value, unit, fmt, onInput}) → {get(), set(v)}
 *   kit.select({label, options:[[value,text],...], value, onChange}) → {get(), set(v)}
 *   kit.toggle({label, value, onChange}) → {get(), set(b)}
 *   kit.button(text, onClick, {primary}) → element
 *   kit.readout(label) → {set(text|html)}       (수치 표시 칸)
 *   kit.note(html)                              (짧은 설명 줄)
 *   kit.loop(fn(dt, t))                         (화면에 보일 때만 돈다. dt 초)  → {play(), pause(), playing}
 *   kit.playButton(loopHandle)                  (재생/정지 버튼)
 *   kit.C  : 테마 색 {fg, muted, grid, bg, card, blue, red, green, purple, orange, yellow}  (다크 모드 자동 반영, 매 프레임 kit.C 다시 읽어도 됨)
 *   kit.draw: 그리기 도우미
 *       arrow(ctx, x0,y0,x1,y1, color, width=2.5, head=10)
 *       text(ctx, str, x, y, {color, size=13, align='center', base='middle', bold})
 *       axes(ctx, {x,y,w,h}, {xlabel, ylabel, xmin=0,xmax, ymin, ymax, ticks=false}) → {X(v), Y(v)}  (값→픽셀 변환)
 *       circle(ctx, x,y,r, {fill, stroke, width})
 *       line(ctx, pts[[x,y],...], color, width=2, dash)
 *   kit.pointer(el, {down(x,y), move(x,y), up()})  (마우스·터치 공통, 캔버스 좌표)
 */
(function () {
  'use strict';
  const REG = {};
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  function themeColors() {
    return {
      fg: css('--fg') || '#1d2330', muted: css('--muted') || '#6b7280', grid: css('--grid') || '#e5e7eb',
      bg: css('--bg') || '#ffffff', card: css('--card') || '#ffffff',
      blue: css('--c-blue') || '#2563eb', red: css('--c-red') || '#dc2626', green: css('--c-green') || '#16a34a',
      purple: css('--c-purple') || '#7c3aed', orange: css('--c-orange') || '#ea580c', yellow: css('--c-yellow') || '#ca8a04',
    };
  }
  const draw = {
    arrow(ctx, x0, y0, x1, y1, color, width = 2.5, head = 10) {
      const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy);
      if (L < 0.5) return;
      const ux = dx / L, uy = dy / L, h = Math.min(head, L * 0.6);
      ctx.save(); ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1 - ux * h * 0.8, y1 - uy * h * 0.8); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x1, y1);
      ctx.lineTo(x1 - ux * h - uy * h * 0.5, y1 - uy * h + ux * h * 0.5);
      ctx.lineTo(x1 - ux * h + uy * h * 0.5, y1 - uy * h - ux * h * 0.5);
      ctx.closePath(); ctx.fill(); ctx.restore();
    },
    text(ctx, str, x, y, o = {}) {
      ctx.save();
      ctx.font = `${o.bold ? '700' : '500'} ${o.size || 13}px Pretendard, 'Noto Sans KR', system-ui, sans-serif`;
      ctx.fillStyle = o.color || themeColors().fg; ctx.textAlign = o.align || 'center'; ctx.textBaseline = o.base || 'middle';
      ctx.fillText(str, x, y); ctx.restore();
    },
    circle(ctx, x, y, r, o = {}) {
      ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
      if (o.fill) { ctx.fillStyle = o.fill; ctx.fill(); }
      if (o.stroke) { ctx.strokeStyle = o.stroke; ctx.lineWidth = o.width || 1.5; ctx.stroke(); }
      ctx.restore();
    },
    line(ctx, pts, color, width = 2, dash) {
      if (!pts.length) return;
      ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      if (dash) ctx.setLineDash(dash);
      ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.stroke(); ctx.restore();
    },
    axes(ctx, r, o = {}) {
      const C = themeColors();
      const xmin = o.xmin ?? 0, xmax = o.xmax ?? 1, ymin = o.ymin ?? 0, ymax = o.ymax ?? 1;
      const X = (v) => r.x + (v - xmin) / (xmax - xmin) * r.w;
      const Y = (v) => r.y + r.h - (v - ymin) / (ymax - ymin) * r.h;
      ctx.save();
      ctx.strokeStyle = C.grid; ctx.lineWidth = 1;
      if (o.grid) {
        for (let k = 1; k < 5; k++) { const yy = r.y + r.h * k / 5; ctx.beginPath(); ctx.moveTo(r.x, yy); ctx.lineTo(r.x + r.w, yy); ctx.stroke(); }
      }
      const y0 = (ymin < 0 && ymax > 0) ? Y(0) : r.y + r.h;
      ctx.strokeStyle = C.fg; ctx.lineWidth = 1.4;
      draw.arrow(ctx, r.x, y0, r.x + r.w + 8, y0, C.fg, 1.4, 7);
      draw.arrow(ctx, r.x, r.y + r.h, r.x, r.y - 8, C.fg, 1.4, 7);
      if (o.xlabel) draw.text(ctx, o.xlabel, r.x + r.w + 6, y0 + 14, { size: 12, color: C.muted, align: 'right' });
      if (o.ylabel) draw.text(ctx, o.ylabel, r.x + 6, r.y - 12, { size: 12, color: C.muted, align: 'left' });
      draw.text(ctx, 'O', r.x - 8, y0 + 9, { size: 11, color: C.muted });
      ctx.restore();
      return { X, Y };
    },
  };

  function makeKit(root, def) {
    const body = root.querySelector('.sim-body');
    const ctrls = root.querySelector('.sim-ctrls');
    const outs = root.querySelector('.sim-outs');
    const kit = { root, draw };
    Object.defineProperty(kit, 'C', { get: themeColors });
    const resizeFns = [];
    let visible = false;
    kit._setVisible = (v) => { visible = v; };
    kit.canvas = (o = {}) => {
      const aspect = o.aspect || 0.62, maxH = o.maxH || 460;
      const el = document.createElement('canvas'); el.className = 'sim-canvas';
      body.appendChild(el);
      const ctx = el.getContext('2d');
      const obj = { el, ctx, W: 300, H: 200, onResize(fn) { resizeFns.push(fn); } };
      const fit = () => {
        const W = Math.max(260, body.clientWidth);
        const H = Math.min(maxH, Math.round(W * aspect));
        const dpr = Math.min(2.5, window.devicePixelRatio || 1);
        el.width = Math.round(W * dpr); el.height = Math.round(H * dpr);
        el.style.width = W + 'px'; el.style.height = H + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        obj.W = W; obj.H = H;
        resizeFns.forEach((f) => f(W, H));
      };
      new ResizeObserver(() => fit()).observe(body);
      fit();
      return obj;
    };
    const field = (label, inner, cls = '') => {
      const w = document.createElement('label'); w.className = 'sim-field ' + cls;
      w.innerHTML = `<span class="sim-lab">${label}</span>`; w.appendChild(inner); ctrls.appendChild(w); return w;
    };
    kit.slider = (o) => {
      const wrap = document.createElement('span'); wrap.className = 'sim-slider';
      const inp = document.createElement('input'); inp.type = 'range';
      inp.min = o.min; inp.max = o.max; inp.step = o.step ?? 'any'; inp.value = o.value;
      const val = document.createElement('output'); val.className = 'sim-val';
      const fmt = o.fmt || ((v) => (+v).toFixed(Math.max(0, -Math.floor(Math.log10(+(o.step || 1)) || 0))) + (o.unit ? ' ' + o.unit : ''));
      const upd = () => { val.textContent = fmt(+inp.value); o.onInput && o.onInput(+inp.value); };
      inp.addEventListener('input', upd);
      wrap.appendChild(inp); wrap.appendChild(val);
      field(o.label, wrap);
      val.textContent = fmt(+inp.value);
      return { get: () => +inp.value, set: (v) => { inp.value = v; upd(); }, el: inp };
    };
    kit.select = (o) => {
      const s = document.createElement('select'); s.className = 'sim-select';
      o.options.forEach(([v, t]) => { const op = document.createElement('option'); op.value = v; op.textContent = t; s.appendChild(op); });
      s.value = o.value ?? o.options[0][0];
      s.addEventListener('change', () => o.onChange && o.onChange(s.value));
      field(o.label, s);
      return { get: () => s.value, set: (v) => { s.value = v; o.onChange && o.onChange(v); }, el: s };
    };
    kit.toggle = (o) => {
      const c = document.createElement('input'); c.type = 'checkbox'; c.checked = !!o.value; c.className = 'sim-check';
      c.addEventListener('change', () => o.onChange && o.onChange(c.checked));
      field(o.label, c, 'sim-field-check');
      return { get: () => c.checked, set: (b) => { c.checked = b; o.onChange && o.onChange(b); }, el: c };
    };
    kit.button = (text, onClick, o = {}) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'sim-btn' + (o.primary ? ' primary' : '');
      b.textContent = text; b.addEventListener('click', onClick);
      let bar = ctrls.querySelector('.sim-btns');
      if (!bar) { bar = document.createElement('div'); bar.className = 'sim-btns'; ctrls.prepend(bar); }
      bar.appendChild(b); return b;
    };
    kit.readout = (label) => {
      const d = document.createElement('div'); d.className = 'sim-out';
      d.innerHTML = `<span class="sim-out-lab">${label}</span><b class="sim-out-val">–</b>`;
      outs.appendChild(d);
      const v = d.querySelector('b');
      return { set: (t) => { v.innerHTML = t; } };
    };
    kit.note = (html) => { const p = document.createElement('p'); p.className = 'sim-note'; p.innerHTML = html; root.querySelector('.sim-foot').appendChild(p); return p; };
    kit.loop = (fn) => {
      const h = { playing: true };
      let last = 0, t = 0;
      const step = (ts) => {
        if (!last) last = ts;
        let dt = Math.min(0.05, (ts - last) / 1000); last = ts;
        if (h.playing && visible && !document.hidden) { t += dt; fn(dt, t); } else if (visible) { fn(0, t); }
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
      h.play = () => { h.playing = true; };
      h.pause = () => { h.playing = false; };
      h.reset = () => { t = 0; };
      return h;
    };
    kit.playButton = (h) => {
      const b = kit.button('⏸ 정지', () => { h.playing ? h.pause() : h.play(); b.textContent = h.playing ? '⏸ 정지' : '▶ 재생'; });
      return b;
    };
    kit.pointer = (el, o) => {
      // 폰: 세로로 밀면 페이지가 스크롤되고(touch-action: pan-y), 탭·가로 끌기만 시뮬 조작으로 받는다.
      // 터치는 손가락이 움직이거나 떨어질 때까지 down 을 미뤄서, 스크롤하려고 댄 손가락이 그림을 건드리지 않게 한다.
      const pos = (e) => { const r = el.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
      let down = false, pending = null;
      el.style.touchAction = 'pan-y';
      el.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'touch') { pending = pos(e); return; }
        down = true; try { el.setPointerCapture(e.pointerId); } catch (_) {}
        o.down && o.down.call(o, ...pos(e));
      });
      el.addEventListener('pointermove', (e) => {
        if (pending) {
          const [x0, y0] = pending, [x, y] = pos(e);
          if (Math.hypot(x - x0, y - y0) < 4) return;
          pending = null; down = true; try { el.setPointerCapture(e.pointerId); } catch (_) {}
          o.down && o.down.call(o, x0, y0);
        }
        if (down) o.move && o.move.call(o, ...pos(e));
      });
      el.addEventListener('pointerup', (e) => {
        if (pending) { const p = pending; pending = null; o.down && o.down.call(o, ...p); o.up && o.up.call(o); return; }
        if (down) { down = false; o.up && o.up.call(o); }
      });
      el.addEventListener('pointercancel', () => { pending = null; if (down) { down = false; o.up && o.up.call(o); } });
    };
    return kit;
  }

  function mount(root) {
    if (root.dataset.ready) return;
    const name = root.dataset.sim, def = REG[name];
    if (!def) { root.innerHTML = `<p class="sim-missing">시뮬레이션 준비 중: ${name}</p>`; return; }
    root.dataset.ready = '1';
    root.innerHTML = `<div class="sim-head"><span class="sim-badge">직접 해보기</span><b class="sim-title">${def.title}</b></div>
      ${def.hint ? `<p class="sim-hint">${def.hint}</p>` : ''}
      <div class="sim-body"></div><div class="sim-outs"></div><div class="sim-ctrls"></div><div class="sim-foot"></div>`;
    const kit = makeKit(root, def);
    const io = new IntersectionObserver((ents) => ents.forEach((e) => kit._setVisible(e.isIntersecting)), { rootMargin: '80px' });
    io.observe(root);
    try { def.init(kit); } catch (err) { console.error('sim error', name, err); root.querySelector('.sim-body').innerHTML = `<p class="sim-missing">시뮬레이션 오류: ${name}</p>`; }
  }

  window.SIM = {
    register(name, def) { REG[name] = def; document.querySelectorAll(`.sim[data-sim="${name}"]`).forEach((r) => lazy(r)); },
    mountAll() { document.querySelectorAll('.sim[data-sim]').forEach(lazy); },
    _reg: REG,
  };
  const lazyIO = 'IntersectionObserver' in window ? new IntersectionObserver((ents) => {
    ents.forEach((e) => { if (e.isIntersecting) { lazyIO.unobserve(e.target); mount(e.target); } });
  }, { rootMargin: '300px' }) : null;
  function lazy(r) { if (r.dataset.ready) return; if (lazyIO) lazyIO.observe(r); else mount(r); }
  document.addEventListener('DOMContentLoaded', () => window.SIM.mountAll());
})();
