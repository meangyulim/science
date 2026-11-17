/* lab.js — 물리 실험실 개념 페이지 공통 도구 (lab.css 와 짝). 의존성 없음.
 *
 * 쓰는 법: 페이지 끝에서 <script src="../../kit/lab.js"></script> 다음에 개념 모형(<ID>-model.js)과 페이지 스크립트.
 *
 *  색      Lab.C            CSS 토큰을 읽은 색 묶음 (Lab.C.ink, .muted, .grid, .paper, .copper, .vel, .acc, .force, .neg, .energy, .violet, ...)
 *                           테마(밝게/어둡게)가 바뀌면 자동으로 다시 읽고, Lab.canvas 로 만든 그림을 모두 다시 그린다.
 *  캔버스  Lab.canvas(id, draw) → v {el, ctx, W, H}   크기가 바뀌면 HiDPI 로 맞춘 뒤 draw(v) 를 부른다. W·H 는 CSS 픽셀.
 *  글자    Lab.text(ctx, s, x, y, {size=13, w=600, color, align='center', base='middle', mono, halo})
 *             size 는 px, 13 미만은 13 으로 올린다(폰에서 읽히게). w ≥ 600 이면 굵게. halo: true 면 바탕색 테두리.
 *          Lab.font(size, w, mono) → ctx.font 문자열
 *  그리기  Lab.arrow(ctx, x0, y0, x1, y1, color, width=2.5, head=10)
 *          Lab.bracket(ctx, x0, x1, y, color, label, up=true)      가로 치수선 |←label→|
 *          Lab.vbracket(ctx, x, y0, y1, color, label, right=true)  세로 치수선
 *          Lab.line(ctx, pts, color, width=2, dash)   Lab.circle(ctx, x, y, r, {fill, stroke, width})
 *          Lab.rrect(ctx, x, y, w, h, r)  (경로만)     Lab.paper(ctx, W, H, step)  무대 모눈
 *          Lab.axes(ctx, r, {xmin, xmax, ymin, ymax, xlabel, ylabel, xticks, yticks, fmtX, fmtY, grid})
 *             → {X(v), Y(v), y0}  값 → 픽셀. r = {x, y, w, h} 는 그래프 영역.
 *  움직임  Lab.loop(fn)  화면에 보일 때 매 프레임 fn(dt 초, 최대 0.05)
 *  조작    Lab.play(id, on, onChange) → {set(on), get()}   재생/멈춤 버튼 (구리색 .play)
 *          Lab.slider(id, {out, fmt, onInput}) → {get(), set(v, quiet)}   range + <output id=out>
 *          Lab.group(sel, key, onPick, initial)   data-<key> 버튼 묶음 (aria-pressed 관리) → {set(v, quiet)}
 *          Lab.toggle(id, onChange) → {get(), set(b, quiet)}   체크 상자
 *          Lab.check(id, ok, okText, idleText)    예제 확인 줄 (.check / .check.ok)
 *          Lab.tries(map, after)   [data-try] 버튼 → map[key]() 실행, after() 뒤 무대로 스크롤
 *          Lab.pointer(el, {down(x,y), move(x,y), up()})   마우스·터치 끌기 (세로 스크롤은 페이지가 가짐)
 *  색 섞기 Lab.alpha(color, a) → 'rgba(…)'  토큰 색(#hex·rgb)에 투명도를 입힌다 (그라디언트 멈춤점 등)
 *  숫자    Lab.fmt(v, d=2)  끝 0 자름, 음수는 −   Lab.sg(v, d) 부호 붙임   Lab.sci(v, d) 1.7 × 10⁸   Lab.frac(v) 5/3
 *  기타    Lab.reduceMotion (움직임 줄이기 설정이면 처음에 멈춘 상태로)
 */
(function () {
  'use strict';
  const doc = document.documentElement;
  const $ = (id) => document.getElementById(id);
  const reduceMotion = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const MI = '−';

  // 과학 실험실 첫 화면 안(iframe)에서 열렸으면 '← 물리 실험실' 링크를 감춘다
  try { if (window.self !== window.top) document.querySelectorAll('.back').forEach((b) => { b.hidden = true; }); } catch (e) { /* 다른 출처 */ }

  // ── 색 ─────────────────────────────────────────────────
  const TOKENS = ['bg', 'paper', 'ink', 'muted', 'line', 'line-soft', 'grid', 'glass', 'copper', 'copper-soft', 'on-copper',
    'vel', 'vel-soft', 'acc', 'acc-soft', 'force', 'neg', 'neg-soft', 'energy', 'violet', 'stage-top', 'stage-bot'];
  const C = {};
  function readColors() {
    const cs = getComputedStyle(doc);
    for (const k of TOKENS) C[k] = cs.getPropertyValue('--' + k).trim();
  }
  readColors();
  const views = [];
  const redrawAll = () => { readColors(); views.forEach((v) => v.redraw()); };
  if (window.matchMedia) {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    (mq.addEventListener ? mq.addEventListener.bind(mq, 'change') : mq.addListener.bind(mq))(redrawAll);
  }
  new MutationObserver(redrawAll).observe(doc, {attributes: true, attributeFilter: ['data-theme']});

  // ── 캔버스 ──────────────────────────────────────────────
  function canvas(id, draw) {
    const el = typeof id === 'string' ? $(id) : id;
    const ctx = el.getContext('2d');
    const v = {el, ctx, W: 0, H: 0, redraw: () => { if (v.W) draw(v); }};
    const fit = () => {
      const r = el.getBoundingClientRect(), dpr = Math.min(2.5, window.devicePixelRatio || 1);
      if (!r.width) return;
      v.W = r.width; v.H = r.height;
      el.width = Math.round(r.width * dpr); el.height = Math.round(r.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw(v);
    };
    // ResizeObserver 는 처음에도 한 번 알려 준다(비동기) → 페이지 스크립트의 변수가 다 만들어진 뒤 그려진다
    if ('ResizeObserver' in window) new ResizeObserver(fit).observe(el);
    else { window.addEventListener('resize', fit); setTimeout(fit, 0); }
    views.push(v);
    return v;
  }

  // ── 글자·그리기 ─────────────────────────────────────────
  const FAM_UI = '"Noto Sans KR","Apple SD Gothic Neo","Malgun Gothic",system-ui,sans-serif';
  const FAM_NUM = '"IBM Plex Mono",ui-monospace,Menlo,Consolas,monospace';
  const font = (size = 13, w = 600, mono = false) => `${w >= 600 ? 700 : 500} ${Math.max(13, size)}px ${mono ? FAM_NUM : FAM_UI}`;
  function text(ctx, s, x, y, o = {}) {
    ctx.save();
    ctx.font = font(o.size || 13, o.w == null ? 600 : o.w, o.mono);
    ctx.fillStyle = o.color || C.ink; ctx.textAlign = o.align || 'center'; ctx.textBaseline = o.base || 'middle';
    if (o.halo) { ctx.lineWidth = 4; ctx.lineJoin = 'round'; ctx.strokeStyle = o.halo === true ? C.paper : o.halo; ctx.strokeText(s, x, y); }
    ctx.fillText(s, x, y);
    ctx.restore();
  }
  const measure = (ctx, s, o = {}) => { ctx.save(); ctx.font = font(o.size || 13, o.w == null ? 600 : o.w, o.mono); const w = ctx.measureText(s).width; ctx.restore(); return w; };
  function arrow(ctx, x0, y0, x1, y1, col, w = 2.5, h = 10) {
    const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy);
    if (L < 1) return;
    const ux = dx / L, uy = dy / L, hh = Math.min(h, L * 0.6);
    ctx.save(); ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = w; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1 - ux * hh * 0.8, y1 - uy * hh * 0.8); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x1, y1);
    ctx.lineTo(x1 - ux * hh - uy * hh * 0.5, y1 - uy * hh + ux * hh * 0.5);
    ctx.lineTo(x1 - ux * hh + uy * hh * 0.5, y1 - uy * hh - ux * hh * 0.5);
    ctx.closePath(); ctx.fill(); ctx.restore();
  }
  function bracket(ctx, x0, x1, y, col, label, up = true) {
    const t = 5;
    ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(x0, y - t); ctx.lineTo(x0, y + t); ctx.moveTo(x1, y - t); ctx.lineTo(x1, y + t); ctx.stroke();
    ctx.restore();
    const m = (x0 + x1) / 2;
    arrow(ctx, m, y, x0 + 1, y, col, 1.6, 7); arrow(ctx, m, y, x1 - 1, y, col, 1.6, 7);
    if (label) text(ctx, label, m, y + (up ? -13 : 14), {size: 13, color: col, w: 700, mono: true, halo: true});
  }
  function vbracket(ctx, x, y0, y1, col, label, right = true) {
    const t = 5;
    ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(x - t, y0); ctx.lineTo(x + t, y0); ctx.moveTo(x - t, y1); ctx.lineTo(x + t, y1); ctx.stroke();
    ctx.restore();
    const m = (y0 + y1) / 2;
    arrow(ctx, x, m, x, y0 + 1, col, 1.6, 7); arrow(ctx, x, m, x, y1 - 1, col, 1.6, 7);
    if (label) text(ctx, label, x + (right ? 9 : -9), m, {size: 13, color: col, w: 700, mono: true, align: right ? 'left' : 'right', halo: true});
  }
  function line(ctx, pts, col, w = 2, dash) {
    if (!pts.length) return;
    ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (dash) ctx.setLineDash(dash);
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke(); ctx.restore();
  }
  function circle(ctx, x, y, r, o = {}) {
    ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    if (o.fill) { ctx.fillStyle = o.fill; ctx.fill(); }
    if (o.stroke) { ctx.strokeStyle = o.stroke; ctx.lineWidth = o.width || 1.6; ctx.stroke(); }
    ctx.restore();
  }
  function rrect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function paper(ctx, W, H, step = 24) {
    ctx.save(); ctx.strokeStyle = C.grid; ctx.lineWidth = 1;
    for (let x = step / 2; x < W; x += step) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = step / 2; y < H; y += step) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    ctx.restore();
  }
  function axes(ctx, r, o = {}) {
    const xmin = o.xmin ?? 0, xmax = o.xmax ?? 1, ymin = o.ymin ?? 0, ymax = o.ymax ?? 1;
    const X = (v) => r.x + (v - xmin) / (xmax - xmin) * r.w;
    const Y = (v) => r.y + r.h - (v - ymin) / (ymax - ymin) * r.h;
    const y0 = (ymin < 0 && ymax > 0) ? Y(0) : (ymin >= 0 ? r.y + r.h : r.y);
    const x0 = (xmin < 0 && xmax > 0) ? X(0) : r.x;
    ctx.save();
    if (o.grid) {
      ctx.strokeStyle = C.grid; ctx.lineWidth = 1;
      (o.xticks || []).forEach((v) => { ctx.beginPath(); ctx.moveTo(X(v), r.y); ctx.lineTo(X(v), r.y + r.h); ctx.stroke(); });
      (o.yticks || []).forEach((v) => { ctx.beginPath(); ctx.moveTo(r.x, Y(v)); ctx.lineTo(r.x + r.w, Y(v)); ctx.stroke(); });
    }
    ctx.restore();
    arrow(ctx, r.x, y0, r.x + r.w + 9, y0, C.muted, 1.3, 7);
    arrow(ctx, x0, r.y + r.h, x0, r.y - 9, C.muted, 1.3, 7);
    const fx = o.fmtX || ((v) => fmt(v)), fy = o.fmtY || ((v) => fmt(v));
    ctx.save(); ctx.strokeStyle = C.muted; ctx.lineWidth = 1;
    (o.xticks || []).forEach((v) => {
      ctx.beginPath(); ctx.moveTo(X(v), y0 - 3); ctx.lineTo(X(v), y0 + 3); ctx.stroke();
      text(ctx, fx(v), X(v), y0 + 13, {size: 13, w: 500, color: C.muted, mono: true});
    });
    (o.yticks || []).forEach((v) => {
      ctx.beginPath(); ctx.moveTo(x0 - 3, Y(v)); ctx.lineTo(x0 + 3, Y(v)); ctx.stroke();
      text(ctx, fy(v), x0 - 7, Y(v), {size: 13, w: 500, color: C.muted, mono: true, align: 'right'});
    });
    ctx.restore();
    if (o.xlabel) text(ctx, o.xlabel, r.x + r.w + 4, y0 - 12, {size: 13, w: 600, color: C.muted, align: 'right'});
    if (o.ylabel) text(ctx, o.ylabel, x0 + 8, r.y - 4, {size: 13, w: 600, color: C.muted, align: 'left'});
    return {X, Y, y0, x0};
  }

  // ── 움직임 ──────────────────────────────────────────────
  function loop(fn) {
    let last = 0, alive = true;
    const step = (ts) => {
      if (!alive) return;
      const dt = last ? Math.min(0.05, (ts - last) / 1000) : 0; last = ts;
      if (!document.hidden) fn(dt);
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    return {stop: () => { alive = false; }};
  }

  // ── 조작 ────────────────────────────────────────────────
  const ICON_PAUSE = '<rect x="2" y="1.5" width="3.6" height="11" rx="1"/><rect x="8.4" y="1.5" width="3.6" height="11" rx="1"/>';
  const ICON_PLAY = '<path d="M3 1.5v11l9-5.5z"/>';
  function play(id, on, onChange) {
    const b = $(id);
    if (!b.querySelector('svg')) b.insertAdjacentHTML('afterbegin', '<svg viewBox="0 0 14 14" aria-hidden="true"></svg>');
    if (!b.querySelector('span')) b.insertAdjacentHTML('beforeend', '<span></span>');
    const svg = b.querySelector('svg'), sp = b.querySelector('span');
    let state = !!on;
    const set = (v, quiet) => {
      state = !!v; b.setAttribute('aria-pressed', String(state));
      svg.innerHTML = state ? ICON_PAUSE : ICON_PLAY; sp.textContent = state ? '멈추기' : '움직이기';
      if (!quiet && onChange) onChange(state);
    };
    b.addEventListener('click', () => set(!state));
    set(state, true);
    return {set, get: () => state};
  }
  function slider(id, o = {}) {
    const el = $(id), out = o.out ? $(o.out) : null;
    const show = () => { if (out) out.textContent = o.fmt ? o.fmt(+el.value) : el.value; };
    el.addEventListener('input', () => { show(); o.onInput && o.onInput(+el.value); });
    show();
    return {el, get: () => +el.value, set: (v, quiet) => { el.value = v; show(); if (!quiet && o.onInput) o.onInput(+el.value); }};
  }
  function group(sel, key, onPick, initial) {
    const btns = [...document.querySelectorAll(sel)];
    const mark = (v) => btns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset[key] === String(v))));
    btns.forEach((b) => b.addEventListener('click', () => { mark(b.dataset[key]); onPick && onPick(b.dataset[key]); }));
    if (initial !== undefined) mark(initial);
    return {set: (v, quiet) => { mark(v); if (!quiet && onPick) onPick(String(v)); }};
  }
  function toggle(id, onChange) {
    const el = $(id);
    el.addEventListener('change', () => onChange && onChange(el.checked));
    return {el, get: () => el.checked, set: (b, quiet) => { el.checked = !!b; if (!quiet && onChange) onChange(el.checked); }};
  }
  function check(id, ok, okText, idleText) {
    const el = $(id);
    el.className = 'check' + (ok ? ' ok' : '');
    el.textContent = ok ? '✓ ' + okText : idleText;
  }
  function tries(map, after) {
    document.querySelectorAll('[data-try]').forEach((b) => b.addEventListener('click', () => {
      const f = map[b.dataset.try]; if (!f) return;
      f(); after && after(b.dataset.try);
      const st = document.querySelector('.stage');
      if (st) st.scrollIntoView({behavior: reduceMotion ? 'auto' : 'smooth', block: 'center'});
    }));
  }
  function pointer(el, o) {
    const pos = (e) => { const r = el.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    let down = false, pending = null;
    el.style.touchAction = 'pan-y';
    el.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') { pending = pos(e); return; }
      down = true; try { el.setPointerCapture(e.pointerId); } catch (_) { /* */ }
      o.down && o.down(...pos(e));
    });
    el.addEventListener('pointermove', (e) => {
      if (pending) {
        const [x0, y0] = pending, [x, y] = pos(e);
        if (Math.hypot(x - x0, y - y0) < 4) return;
        pending = null; down = true; try { el.setPointerCapture(e.pointerId); } catch (_) { /* */ }
        o.down && o.down(x0, y0);
      }
      if (down) o.move && o.move(...pos(e));
    });
    el.addEventListener('pointerup', () => {
      if (pending) { const p = pending; pending = null; o.down && o.down(...p); o.up && o.up(); return; }
      if (down) { down = false; o.up && o.up(); }
    });
    el.addEventListener('pointercancel', () => { pending = null; if (down) { down = false; o.up && o.up(); } });
  }

  // ── 색 섞기 ─────────────────────────────────────────────
  function alpha(col, a) {
    col = (col || '').trim();
    let r = 0, g = 0, bl = 0;
    if (col[0] === '#') {
      const h = col.length === 4 ? col.slice(1).split('').map((c) => c + c).join('') : col.slice(1, 7);
      r = parseInt(h.slice(0, 2), 16); g = parseInt(h.slice(2, 4), 16); bl = parseInt(h.slice(4, 6), 16);
    } else {
      const m = col.match(/[\d.]+/g) || [0, 0, 0];
      [r, g, bl] = m.map(Number);
    }
    return `rgba(${r},${g},${bl},${a})`;
  }

  // ── 숫자 ────────────────────────────────────────────────
  function fmt(v, d = 2) {
    if (!isFinite(v)) return '–';
    const s = String(+Math.abs(v).toFixed(d));
    return (v < 0 && +s !== 0 ? MI : '') + s;
  }
  const sg = (v, d = 2) => (+Math.abs(v).toFixed(d) === 0 ? '0' : (v > 0 ? '+' : MI) + fmt(Math.abs(v), d));
  const SUP = {'-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹'};
  function sci(v, d = 2) {
    if (!isFinite(v)) return '–';
    if (v === 0) return '0';
    let e = Math.floor(Math.log10(Math.abs(v)));
    if (e >= -2 && e <= 3) return fmt(v, d);
    let m = v / Math.pow(10, e);
    if (+Math.abs(m).toFixed(d) >= 10) { m /= 10; e += 1; }
    return `${fmt(m, d)} × 10${String(e).split('').map((c) => SUP[c]).join('')}`;
  }
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  function frac(v, d = 2) {        // 1/3, 5/3, 2/7 처럼 끝나지 않는 소수만 분수로
    for (const q of [3, 6, 7, 9]) {
      const n = Math.round(v * q);
      if (Math.abs(v * q - n) > 1e-6) continue;
      const g = gcd(Math.abs(n), q), den = q / g;
      if (den === 1 || den === 2) break;
      return (n < 0 ? MI : '') + Math.abs(n) / g + '/' + den;
    }
    return fmt(v, d);
  }

  window.Lab = {C, $, reduceMotion, canvas, font, text, measure, arrow, bracket, vbracket, line, circle, rrect, paper, axes,
    loop, play, slider, group, toggle, check, tries, pointer, alpha, fmt, sg, sci, frac, MI, redrawAll};
})();
